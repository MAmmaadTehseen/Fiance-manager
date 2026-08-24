import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
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
