import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { transactionKeys, type TransactionRow } from './useTransactions'
import { accountKeys } from './useAccounts'
import { ingestKeys } from './useIngest'
import type { ParsedFields, SmsMessage } from '../types/db'

/**
 * The inbox holds only genuine unknowns. Everything the app could work out on
 * its own has already been filed silently, so anything here is a real question.
 */

export type OpenMessage = Omit<SmsMessage, 'parsed'> & {
  parsed: ParsedFields | null
}

/** Transactions the pipeline created but could not categorise. */
export function useReviewQueue() {
  return useQuery({
    queryKey: [...transactionKeys.all, 'review'],
    queryFn: async (): Promise<TransactionRow[]> => {
      const { data, error } = await getSupabase()
        .from('transactions')
        .select(
          `*,
           account:accounts!transactions_account_id_fkey (id, name, type),
           counterparty_account:accounts!transactions_counterparty_account_id_fkey (id, name),
           category:categories (id, name, icon),
           merchant:merchants (id, display_name)`,
        )
        .eq('status', 'needs_review')
        .order('occurred_at', { ascending: false })
        .returns<TransactionRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/** Messages still waiting on a rule or on being told which account they are. */
export function useOpenMessages() {
  return useQuery({
    queryKey: ingestKeys.messages,
    queryFn: async (): Promise<OpenMessage[]> => {
      const { data, error } = await getSupabase()
        .from('sms_messages')
        .select('*')
        .in('parse_status', ['unmatched', 'needs_account'])
        .order('received_at', { ascending: false })
        .limit(50)
        .returns<OpenMessage[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

function invalidateEverything(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: transactionKeys.all })
  void qc.invalidateQueries({ queryKey: accountKeys.balances })
  void qc.invalidateQueries({ queryKey: ingestKeys.messages })
}

/**
 * The teach-once loop, and the single most important interaction in the app:
 * categorising a transaction also teaches the merchant, so the next message
 * from that shop files itself and never appears here again.
 */
export function useCategorise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      transactionId,
      categoryId,
      merchantId,
      remember = true,
    }: {
      transactionId: string
      categoryId: string
      merchantId: string | null
      remember?: boolean
    }) => {
      const { error } = await getSupabase()
        .from('transactions')
        .update({ category_id: categoryId, status: 'cleared' })
        .eq('id', transactionId)
      if (error) throw error

      if (remember && merchantId) {
        const { error: merchantError } = await getSupabase()
          .from('merchants')
          .update({ default_category_id: categoryId })
          .eq('id', merchantId)
        if (merchantError) throw merchantError
      }
    },
    onSuccess: () => invalidateEverything(qc),
  })
}

/**
 * Names the card a parked message referred to. Assigning `last4` to an account
 * is what lets the reprocess pass resolve this message and every future one
 * from the same card.
 */
export function useAssignCardToAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      accountId,
      last4,
    }: {
      accountId: string
      last4: string
    }) => {
      const { error } = await getSupabase()
        .from('accounts')
        .update({ last4 })
        .eq('id', accountId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      invalidateEverything(qc)
    },
  })
}

/** Drops a message we will never care about (spam, a stray personal text). */
export function useDismissMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await getSupabase()
        .from('sms_messages')
        .update({ parse_status: 'ignored' })
        .eq('id', messageId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ingestKeys.messages }),
  })
}

/** Badge count for the nav — one number for "things that want you". */
export function useInboxCount() {
  return useQuery({
    queryKey: ['inbox', 'count'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const [review, messages] = await Promise.all([
        getSupabase()
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'needs_review'),
        getSupabase()
          .from('sms_messages')
          .select('id', { count: 'exact', head: true })
          .in('parse_status', ['unmatched', 'needs_account']),
      ])
      return (review.count ?? 0) + (messages.count ?? 0)
    },
  })
}
