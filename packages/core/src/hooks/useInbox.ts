import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { transactionKeys, type TransactionRow } from './useTransactions'
import { accountKeys } from './useAccounts'
import { ingestKeys } from './useIngest'
import type { ParsedFields, SmsMessage, TransactionType } from '../types/db'

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
 *
 * Teaching also reaches backwards. Naming one payment from a payee used to
 * leave every other payment from the same payee sitting in the Inbox, because
 * the merchant's default is only read when a message is first parsed. Someone
 * who had already been paying one person for months would file one, watch the
 * rest stay put, and reasonably conclude nothing had been learnt — so the
 * catch-up is the difference between the feature working and merely existing.
 *
 * Only rows still waiting are touched, so a category chosen deliberately for
 * an earlier payment is never overwritten, and only rows of the same direction
 * — a payee can both take and send money, and an expense category on income
 * would be nonsense.
 */
export function useCategorise() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      transactionId,
      categoryId,
      merchantId,
      type,
      remember = true,
    }: {
      transactionId: string
      categoryId: string
      merchantId: string | null
      /** Direction of the transaction being filed; bounds the catch-up. */
      type: TransactionType
      remember?: boolean
    }): Promise<{ alsoFiled: number }> => {
      const { error } = await getSupabase()
        .from('transactions')
        .update({ category_id: categoryId, status: 'cleared' })
        .eq('id', transactionId)
      if (error) throw error

      if (!remember || !merchantId) return { alsoFiled: 0 }

      const { error: merchantError } = await getSupabase()
        .from('merchants')
        .update({ default_category_id: categoryId })
        .eq('id', merchantId)
      if (merchantError) throw merchantError

      const { data: caughtUp, error: catchUpError } = await getSupabase()
        .from('transactions')
        .update({ category_id: categoryId, status: 'cleared' })
        .eq('merchant_id', merchantId)
        .eq('status', 'needs_review')
        .eq('type', type)
        .select('id')
      if (catchUpError) throw catchUpError

      return { alsoFiled: caughtUp?.length ?? 0 }
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

/**
 * Teaches an account by the bank that sent the message, for alerts that name
 * no card at all.
 *
 * Plenty of alerts never quote four digits — an outgoing RAAST names only the
 * recipient, and some banks mask the account down to something like
 * "32*****33". `resolveAccount` already falls back to matching the sender
 * against `accounts.sms_senders`, and has always described that as learned
 * once via the inbox — but nothing ever wrote to it, so the inbox asked which
 * account a message belonged to and offered no way to answer. Every button was
 * disabled and the only exit was to dismiss the payment.
 *
 * Stored uppercased, because that is the form the resolver compares against.
 */
export function useAssignSenderToAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      accountId,
      sender,
    }: {
      accountId: string
      sender: string
    }) => {
      const key = sender.trim().toUpperCase()
      if (!key) throw new Error('That message has no sender to learn from.')

      // Read first so an existing list is extended rather than replaced: an
      // account can legitimately hear from more than one address.
      const { data: account, error: readError } = await getSupabase()
        .from('accounts')
        .select('sms_senders')
        .eq('id', accountId)
        .single()
      if (readError) throw readError

      const senders = account?.sms_senders ?? []
      if (senders.includes(key)) return

      const { error } = await getSupabase()
        .from('accounts')
        .update({ sms_senders: [...senders, key] })
        .eq('id', accountId)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKeys.all })
      invalidateEverything(qc)
    },
  })
}

/**
 * The whole capture feed, verdicts included — parsed, linked, ignored,
 * unreadable — so the templates can be judged against what actually arrived
 * rather than only against what failed.
 */
export function useCaptureFeed(limit = 100) {
  return useQuery({
    queryKey: [...ingestKeys.messages, 'feed', limit],
    queryFn: async (): Promise<OpenMessage[]> => {
      const { data, error } = await getSupabase()
        .from('sms_messages')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(limit)
        .returns<OpenMessage[]>()
      if (error) throw error
      return data ?? []
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
