import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { accountKeys } from './useAccounts'
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionUpdate,
} from '@/types/db'

/** A transaction joined with the names needed to render a ledger row. */
export type TransactionRow = Transaction & {
  account: { id: string; name: string; type: string } | null
  counterparty_account: { id: string; name: string } | null
  category: { id: string; name: string; icon: string | null } | null
  merchant: { id: string; display_name: string } | null
}

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

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (f: TransactionFilters) => ['transactions', 'list', f] as const,
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: transactionKeys.list(filters),
    queryFn: async (): Promise<TransactionRow[]> => {
      let q = supabase
        .from('transactions')
        .select(ROW_SELECT)
        .neq('status', 'void')
        .order('occurred_at', { ascending: false })
        .limit(filters.limit ?? 100)

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
      if (filters.search) q = q.ilike('note', `%${filters.search}%`)

      const { data, error } = await q.returns<TransactionRow[]>()
      if (error) throw error
      return data ?? []
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

      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateLedger(qc),
  })
}
