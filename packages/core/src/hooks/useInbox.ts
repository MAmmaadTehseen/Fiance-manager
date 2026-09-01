import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '../client'
import { catchUpWaiting } from './catchUp'
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
/**
 * A transaction awaiting a category, carrying the message it came from.
 *
 * The parsed fields are a summary, and a summary is exactly what you cannot
 * rely on when deciding what something was: a 2,000 transfer with no payee
 * read is unanswerable without the text the bank actually sent. So the
 * original travels with it.
 */
export type ReviewRow = TransactionRow & {
  sms_message: {
    id: string
    sender: string
    body: string
    received_at: string
  } | null
}

export function useReviewQueue() {
  return useQuery({
    queryKey: [...transactionKeys.all, 'review'],
    queryFn: async (): Promise<ReviewRow[]> => {
      const { data, error } = await getSupabase()
        .from('transactions')
        .select(
          `*,
           account:accounts!transactions_account_id_fkey (id, name, type),
           counterparty_account:accounts!transactions_counterparty_account_id_fkey (id, name),
           category:categories (id, name, icon),
           merchant:merchants (id, display_name),
           sms_message:sms_messages!transactions_sms_message_id_fkey (id, sender, body, received_at)`,
        )
        .eq('status', 'needs_review')
        .order('occurred_at', { ascending: false })
        .returns<ReviewRow[]>()
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * What the Inbox shows: messages still waiting on a rule or on being told
 * which account they are, plus the ones just answered.
 *
 * An answered message stays until it is dismissed. Answering "which account is
 * 0508?" is the moment you most want to read the thing — you have just been
 * told a payment exists and shown nothing of what it was — and it used to
 * disappear on the tap. `resolved_at` is what distinguishes those few from the
 * thousands of ordinary parsed messages the Inbox must never list.
 */
export function useOpenMessages() {
  return useQuery({
    queryKey: ingestKeys.messages,
    queryFn: async (): Promise<OpenMessage[]> => {
      const { data, error } = await getSupabase()
        .from('sms_messages')
        .select('*')
        .is('dismissed_at', null)
        .or(
          'parse_status.in.(unmatched,needs_account),resolved_at.not.is.null',
        )
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
 *
 * The bank the message named is stored alongside it, when the account does not
 * already say which bank it is at. Four digits are no longer enough on their
 * own — two wallets opened on one phone number end the same, and the pipeline
 * refuses to guess between them. Without recording the bank here, answering
 * the question would achieve nothing: the message would resolve to the same
 * ambiguity on the next pass and come straight back to the Inbox, and the
 * user would be answering the same question forever.
 */
export function useAssignCardToAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      accountId,
      last4,
      bank,
    }: {
      accountId: string
      last4: string
      /** The bank this message named for its own side, if it named one. */
      bank?: string | null
    }) => {
      const db = getSupabase()

      const patch: { last4: string; institution?: string } = { last4 }
      if (bank?.trim()) {
        const { data: account } = await db
          .from('accounts')
          .select('institution')
          .eq('id', accountId)
          .single()
        // Never overwrite a bank the user set themselves.
        if (!account?.institution?.trim()) patch.institution = bank.trim()
      }

      const { error } = await db
        .from('accounts')
        .update(patch)
        .eq('id', accountId)
      if (error) throw error

      // Bank alerts arrive in runs, so the same card is usually sitting in the
      // Inbox several times over. Answering the question once answers it for
      // all of them; being asked three times about 0508 is the app failing to
      // learn from the first answer.
      return { caught: await catchUpWaiting({ last4 }) }
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
      if (senders.includes(key)) return { caught: 0 }

      const { error } = await getSupabase()
        .from('accounts')
        .update({ sms_senders: [...senders, key] })
        .eq('id', accountId)
      if (error) throw error

      return { caught: await catchUpWaiting({ sender }) }
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

/**
 * Clears a message from the Inbox — spam, a stray personal text, or one that
 * has been answered and read.
 *
 * This used to overwrite `parse_status` with 'ignored', which threw away what
 * the parser had actually decided. A booked message dismissed after reading
 * became indistinguishable from spam the parser rejected, and the capture
 * feed — whose entire job is showing what the templates did — was being
 * falsified by a UI action. The verdict is the parser's; dismissal is the
 * user's, and they are recorded separately.
 */
export function useDismissMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await getSupabase()
        .from('sms_messages')
        .update({ dismissed_at: new Date().toISOString() })
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
          .in('parse_status', ['unmatched', 'needs_account'])
          // A message left on screen to be read is not something owing the
          // user an action, so it must not keep the badge lit.
          .is('dismissed_at', null),
      ])
      return (review.count ?? 0) + (messages.count ?? 0)
    },
  })
}
