import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { toNumber } from '../money'
import { accountKeys } from './useAccounts'
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionUpdate,
} from '../types/db'

/** A transaction joined with the names needed to render a ledger row. */
export type TransactionRow = Transaction & {
  account: { id: string; name: string; type: string } | null
  counterparty_account: { id: string; name: string } | null
  category: { id: string; name: string; icon: string | null } | null
  merchant: { id: string; display_name: string } | null
}

/** How many rows to scan when a text search is active. See `useTransactions`. */
const SEARCH_WINDOW = 1000

const ROW_SELECT = `
  *,
  account:accounts!transactions_account_id_fkey (id, name, type),
  counterparty_account:accounts!transactions_counterparty_account_id_fkey (id, name),
  category:categories (id, name, icon),
  merchant:merchants (id, display_name)
`

export type TransactionFilters = {
  accountId?: string
  categoryId?: string
  type?: TransactionType
  status?: TransactionStatus
  from?: string
  to?: string
  search?: string
  limit?: number
}

/**
 * Does a row match a free-text query?
 *
 * Searching only the `note` column would miss most of the ledger, because an
 * ingested transaction carries its payee in `merchant`, not in a note the user
 * never wrote. So the haystack is everything a person can actually see on the
 * row — merchant, note, category, account names — plus the bare amount, which
 * is how you find "that 4500 thing" when you remember the figure and nothing
 * else. Matching is case-insensitive and substring, so "kfc" finds "KFC I-8".
 */
function matchesSearch(t: TransactionRow, query: string): boolean {
  const haystack = [
    t.merchant?.display_name,
    t.note,
    t.category?.name,
    t.account?.name,
    t.counterparty_account?.name,
    String(t.amount),
  ]
  return haystack.some((v) => v != null && v.toLowerCase().includes(query))
}

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (f: TransactionFilters) => ['transactions', 'list', f] as const,
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: async (): Promise<TransactionRow[]> => {
      const query = filters.search?.trim().toLowerCase() ?? ''
      const limit = filters.limit ?? 100

      let q = getSupabase()
        .from('transactions')
        .select(ROW_SELECT)
        .neq('status', 'void')
        .order('occurred_at', { ascending: false })
        // Search runs in memory (it spans joined names, which PostgREST cannot
        // filter on without turning the joins inner and dropping rows that have
        // no merchant). So when searching, pull a wider window first and let the
        // filter below narrow it — otherwise a match just past `limit` would be
        // invisible.
        .limit(query ? Math.max(limit, SEARCH_WINDOW) : limit)

      if (filters.accountId) {
        // A transfer belongs to both of its accounts.
        q = q.or(
          `account_id.eq.${filters.accountId},counterparty_account_id.eq.${filters.accountId}`,
        )
      }
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
      if (filters.type) q = q.eq('type', filters.type)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.from) q = q.gte('occurred_at', filters.from)
      if (filters.to) q = q.lte('occurred_at', filters.to)

      const { data, error } = await q.returns<TransactionRow[]>()
      if (error) throw error

      const rows = data ?? []
      if (!query) return rows
      return rows.filter((t) => matchesSearch(t, query)).slice(0, limit)
    },
  })
}

export type NewTransaction = {
  account_id: string
  type: TransactionType
  amount: number
  occurred_at: string
  category_id?: string | null
  counterparty_account_id?: string | null
  merchant_id?: string | null
  note?: string | null
  status?: TransactionStatus
  tags?: string[]
}

function invalidateLedger(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: transactionKeys.all })
  void qc.invalidateQueries({ queryKey: accountKeys.balances })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTransaction) => {
      // The DB rejects a category on a transfer; strip it rather than 400.
      const payload =
        input.type === 'transfer' ? { ...input, category_id: null } : input

      const { data, error } = await getSupabase()
        .from('transactions')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: TransactionUpdate & { id: string }) => {
      const { data, error } = await getSupabase()
        .from('transactions')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase().from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateLedger(qc),
  })
}


/** One piece of a payment being broken up. */
export type SplitPart = {
  amount: number
  categoryId?: string | null
  note?: string | null
}

/**
 * Breaks one payment into the several things it actually paid for.
 *
 * The original row becomes the first part rather than becoming a parent that
 * holds the total. A parent alongside its parts would repeat the money, and
 * every balance view, total and export would need teaching to skip one of
 * them — the first that forgot would silently double the payment. As siblings,
 * everything that already sums transactions stays right without knowing splits
 * exist, and `split_group_id` records only that they arrived together.
 *
 * The new rows deliberately do NOT carry the original's `sms_message_id` or
 * `dedupe_hash`. The bank sent one message about one payment; the parts are
 * the user's own reading of it. Copying the message id would also collide with
 * the one-transaction-per-message index the moment two parts were equal —
 * splitting 20,000 into two 10,000s would fail on the second.
 *
 * A claim already recorded on the payment stays with the first part, which is
 * where a claim on a mixed payment nearly always belongs — 23,000 of rent,
 * deposit and stamp paper with 6,000 owed by a flatmate is 6,000 of the rent.
 * If it no longer fits inside that part the split is refused rather than
 * dropping it: someone owing you money is not something to lose quietly, and
 * the database would reject the write anyway with a constraint name for a
 * message.
 */
export function useSplitTransaction() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      transactionId,
      parts,
    }: {
      transactionId: string
      parts: SplitPart[]
    }) => {
      if (parts.length < 2) throw new Error('A split needs at least two parts.')
      if (parts.some((p) => !(p.amount > 0)))
        throw new Error('Every part needs an amount above zero.')

      const db = getSupabase()
      const { data: original, error: readError } = await db
        .from('transactions')
        .select('*')
        .eq('id', transactionId)
        .single()
      if (readError) throw readError

      const total = toNumber(original.amount)
      const sum = parts.reduce((acc, p) => acc + p.amount, 0)
      // Compared in paisa: 0.1 + 0.2 is famously not 0.3 in binary floating
      // point, and refusing a split that visibly adds up would be baffling.
      if (Math.round(sum * 100) !== Math.round(total * 100)) {
        throw new Error(
          `The parts add up to ${sum.toFixed(2)}, but the payment was ${total.toFixed(2)}.`,
        )
      }

      const groupId = crypto.randomUUID()
      const [first, ...rest] = parts

      const claimed = toNumber(original.owed_amount)
      if (claimed > first!.amount) {
        throw new Error(
          `${original.owed_by ?? 'Someone'} owes ${claimed.toFixed(0)} of this payment, which is more than the first part (${first!.amount.toFixed(0)}). Clear or reduce the claim, split, then add it back to the right part.`,
        )
      }

      const { error: updateError } = await db
        .from('transactions')
        .update({
          amount: first!.amount,
          category_id: first!.categoryId ?? null,
          note: first!.note ?? original.note,
          split_group_id: groupId,
          status: 'cleared',
        })
        .eq('id', transactionId)
      if (updateError) throw updateError

      const { error: insertError } = await db.from('transactions').insert(
        rest.map((part) => ({
          user_id: original.user_id,
          account_id: original.account_id,
          counterparty_account_id: original.counterparty_account_id,
          type: original.type,
          amount: part.amount,
          currency: original.currency,
          occurred_at: original.occurred_at,
          category_id: part.categoryId ?? null,
          merchant_id: original.merchant_id,
          note: part.note ?? null,
          source: 'split' as const,
          status: 'cleared' as const,
          split_group_id: groupId,
        })),
      )
      if (insertError) throw insertError

      return { groupId, parts: parts.length }
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

/**
 * Records that someone is expected to pay part of this back.
 *
 * The row stays a full expense, because the money genuinely left the account.
 * Treating the reimbursable half as income when it returns would inflate both
 * sides of the ledger; the claim is tracked beside the payment instead, and
 * settling it links the two rather than inventing a third.
 *
 * Nobody can owe more than was paid, and the database says so. The amount is
 * checked here first so that typing 6,000 against a 5,000 dinner — an easy
 * slip when several people are paying you back different shares — comes back
 * as a sentence rather than as the name of a check constraint. It is read
 * from the row rather than taken from the form, because the form's amount
 * field may have been edited and not yet saved.
 */
export function useSetOwed() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      transactionId,
      owedBy,
      owedAmount,
    }: {
      transactionId: string
      owedBy: string | null
      owedAmount: number | null
    }) => {
      const clearing = owedAmount == null || !owedBy?.trim()
      const db = getSupabase()

      if (!clearing) {
        if (!(owedAmount > 0))
          throw new Error('How much do they owe you?')

        const { data: row, error: readError } = await db
          .from('transactions')
          .select('amount')
          .eq('id', transactionId)
          .single()
        if (readError) throw readError

        const paid = toNumber(row.amount)
        if (owedAmount > paid) {
          throw new Error(
            `This payment was ${paid.toFixed(0)}, so ${owedBy!.trim()} cannot owe ${owedAmount.toFixed(0)} of it.`,
          )
        }
      }

      const { error } = await db
        .from('transactions')
        .update(
          clearing
            ? { owed_by: null, owed_amount: null, settled_by_id: null }
            : { owed_by: owedBy!.trim(), owed_amount: owedAmount },
        )
        .eq('id', transactionId)
      if (error) throw error
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

/**
 * Marks a claim repaid by pointing at the payment that repaid it.
 *
 * A claim on a real spend stays on its row — the expense happened, only the
 * debt beside it closes. A claim that IS the row — a receivable, a pending
 * income standing in for money not yet arrived — is voided as well once the
 * real payment lands, because from that moment the arrived payment is the
 * truth and leaving an "expected" twin in the ledger reads as being paid
 * twice.
 */
export function useSettleOwed() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      transactionId,
      settledById,
    }: {
      transactionId: string
      settledById: string | null
    }) => {
      const db = getSupabase()
      const { data: claim, error: readError } = await db
        .from('transactions')
        .select('status, type')
        .eq('id', transactionId)
        .single()
      if (readError) throw readError

      const isExpectation = claim.type === 'income' && claim.status === 'pending'
      const { error } = await db
        .from('transactions')
        .update(
          isExpectation && settledById
            ? { settled_by_id: settledById, status: 'void' }
            : { settled_by_id: settledById },
        )
        .eq('id', transactionId)
      if (error) throw error
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

/**
 * Records money you are expecting — side work delivered, an invoice in all
 * but name: "20k from Uzair by 31 September".
 *
 * Stored as a pending income row rather than a new table, because the ledger
 * already knows how to treat it: balances exclude pending rows by design, the
 * due date is simply `occurred_at`, and carrying the claim fields puts it on
 * the same "owed to you" surface as everything else people owe. The payee is
 * found or created by name, so repeat clients accumulate a history like any
 * other person in the ledger.
 */
export function useCreateReceivable() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      from,
      amount,
      dueDate,
      accountId,
      note,
    }: {
      from: string
      amount: number
      /** YYYY-MM-DD; the day it is due, not the day it was promised. */
      dueDate: string
      accountId: string
      note?: string | null
    }) => {
      const name = from.trim()
      if (!name) throw new Error('Who is it from?')
      if (!(amount > 0)) throw new Error('The amount has to be above zero.')
      if (!dueDate) throw new Error('When is it due?')
      const db = getSupabase()

      const rawName = name.toUpperCase()
      const { data: existing, error: findError } = await db
        .from('merchants')
        .select('id, merged_into')
        .eq('raw_name', rawName)
        .maybeSingle()
      if (findError) throw findError

      let merchantId = existing?.merged_into ?? existing?.id ?? null
      if (!merchantId) {
        const { data: created, error: createError } = await db
          .from('merchants')
          .insert({ raw_name: rawName, display_name: name })
          .select('id')
          .single()
        if (createError) throw createError
        merchantId = created.id
      }

      // End of the due day, so it stays "due today" for the whole of today.
      const due = new Date(`${dueDate}T23:59:00`)

      const { data, error } = await db
        .from('transactions')
        .insert({
          account_id: accountId,
          type: 'income',
          amount,
          occurred_at: due.toISOString(),
          merchant_id: merchantId,
          note: note?.trim() || null,
          source: 'manual',
          status: 'pending',
          owed_by: name,
          owed_amount: amount,
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => invalidateLedger(qc),
  })
}

/** Outstanding claims — what people still owe you, newest first. */
export function useOwedToYou() {
  return useQuery({
    queryKey: [...transactionKeys.all, 'owed'],
    queryFn: async (): Promise<TransactionRow[]> => {
      const { data, error } = await getSupabase()
        .from('transactions')
        .select(ROW_SELECT)
        .not('owed_amount', 'is', null)
        .is('settled_by_id', null)
        .neq('status', 'void')
        .order('occurred_at', { ascending: false })
        .returns<TransactionRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}
