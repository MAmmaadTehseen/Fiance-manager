import { useState } from 'react'
import { Inbox, RefreshCw, CreditCard, MessageSquareWarning } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney } from '@batwa/core'
import { useAssignSenderToAccount } from '@batwa/core'
import { useCategories } from '@batwa/core'
import { AddCategory } from '@/components/AddCategory'
import { useAccounts } from '@batwa/core'
import { useReprocess } from '@batwa/core'
import {
  useReviewQueue,
  useOpenMessages,
  useCategorise,
  useAssignCardToAccount,
  useDismissMessage,
  type OpenMessage,
} from '@batwa/core'
import type { TransactionRow } from '@batwa/core'

const CARD = 'flex flex-col gap-3.5 rounded-[22px] p-5'

function ago(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

function Tag({
  children,
  tone = 'brand',
}: {
  children: React.ReactNode
  tone?: 'brand' | 'gold'
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.05em]',
        tone === 'brand' ? 'bg-brand-soft text-brand' : 'bg-gold-soft text-gold-ink',
      )}
    >
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sub">{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{children}</span>
    </div>
  )
}

/** A captured transaction the pipeline could not categorise. */
function ReviewCard({ tx }: { tx: TransactionRow }) {
  const categorise = useCategorise()
  const { data: categories = [] } = useCategories(
    tx.type === 'income' ? 'income' : 'expense',
  )

  return (
    <Card className={CARD}>
      <div className="flex items-center gap-2.5">
        <Tag tone="gold">
          {tx.account?.name ?? 'Account'} · {ago(tx.occurred_at)}
        </Tag>
        <span className="tabular ml-auto font-display text-xl font-bold">
          {tx.type === 'income' ? '+' : '−'}
          {formatMoney(tx.amount, { currency: tx.currency }).replace(/^−/, '')}
        </span>
      </div>

      <div className="flex flex-col gap-2 text-[13.5px]">
        <Field label="Merchant">
          {tx.merchant?.display_name ?? tx.note ?? 'Unknown'}
        </Field>
        <Field label="Account">{tx.account?.name ?? '—'}</Field>
      </div>

      <p className="m-0 text-[13px] font-semibold text-sub">What was this?</p>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={categorise.isPending}
            onClick={() =>
              categorise.mutate({
                transactionId: tx.id,
                categoryId: c.id,
                merchantId: tx.merchant_id,
                type: tx.type,
              })
            }
            className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-brand hover:bg-brand hover:text-brand-on disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}

        <AddCategory
          kind={tx.type === 'income' ? 'income' : 'expense'}
          disabled={categorise.isPending}
          className="rounded-full border border-dashed border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-brand hover:text-ink disabled:opacity-50"
          onCreated={(category) =>
            categorise.mutate({
              transactionId: tx.id,
              categoryId: category.id,
              merchantId: tx.merchant_id,
              type: tx.type,
            })
          }
        />
      </div>

      {tx.merchant_id && (
        <p className="m-0 text-xs text-sub">
          Picking one teaches {tx.merchant?.display_name ?? 'this merchant'} —
          future payments file themselves.
        </p>
      )}
    </Card>
  )
}

/** A message quoting a card the app does not recognise yet. */
function UnknownCardCard({ message }: { message: OpenMessage }) {
  const { data: accounts = [] } = useAccounts()
  const assign = useAssignCardToAccount()
  const assignSender = useAssignSenderToAccount()
  const reprocess = useReprocess()
  const dismiss = useDismissMessage()

  const last4 = message.pending_last4 ?? message.parsed?.last4 ?? ''
  const amount = message.parsed?.amount

  return (
    <Card className={CARD}>
      <div className="flex items-center gap-2.5">
        <Tag>
          {message.sender} · {ago(message.received_at)}
        </Tag>
        {amount != null && (
          <span className="tabular ml-auto font-display text-xl font-bold">
            {formatMoney(amount)}
          </span>
        )}
      </div>

      <p className="m-0 flex items-center gap-2 text-[14.5px] font-bold">
        <CreditCard className="size-4 shrink-0 text-gold-ink" aria-hidden />
        {last4
          ? `Which account is •••• ${last4}?`
          : 'Which account did this come from?'}
      </p>

      {/* The original SMS, so it's obvious which payment this is about. */}
      <p className="m-0 rounded-xl bg-soft px-3.5 py-3 font-mono text-[13px] leading-[1.55] text-sub">
        {message.body}
      </p>

      <div className="flex flex-wrap gap-2">
        {accounts
          .filter((a) => a.type !== 'cash')
          .map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={
                assign.isPending || assignSender.isPending || reprocess.isPending
              }
              onClick={async () => {
                // Two ways to be taught, and which one applies is decided by
                // what the message actually said. A quoted card teaches the
                // card; an alert that names none — an outgoing RAAST, or a
                // bank that masks the number past recognition — teaches the
                // sending bank instead, which is the only durable thing left
                // in it.
                if (last4) {
                  await assign.mutateAsync({ accountId: a.id, last4 })
                } else {
                  await assignSender.mutateAsync({
                    accountId: a.id,
                    sender: message.sender,
                  })
                }
                await reprocess.mutateAsync(undefined)
              }}
              className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-brand hover:bg-brand hover:text-brand-on disabled:opacity-50"
            >
              {a.name}
              {a.last4 ? ` ••${a.last4}` : ''}
            </button>
          ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => dismiss.mutate(message.id)}
          className="h-10 rounded-[11px] border border-line px-4 text-[13.5px] font-semibold text-sub transition hover:bg-soft"
        >
          Dismiss
        </button>
      </div>

      <p className="m-0 text-xs text-sub">
        {last4
          ? 'Answering once resolves this and every future message from that card.'
          : `Answering once resolves this and every future alert from ${message.sender}.`}
      </p>
    </Card>
  )
}

/** A message no template could read. Kept verbatim so a rule can rescue it. */
function UnreadableCard({ message }: { message: OpenMessage }) {
  const dismiss = useDismissMessage()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className={CARD}>
      <div className="flex items-center gap-2.5">
        <Tag>
          {message.sender} · {ago(message.received_at)}
        </Tag>
      </div>

      <p className="m-0 flex items-center gap-2 text-[14.5px] font-bold">
        <MessageSquareWarning className="size-4 shrink-0 text-sub" aria-hidden />
        Couldn&rsquo;t read this one
      </p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="rounded-xl bg-soft px-3.5 py-3 text-left font-mono text-[13px] leading-[1.55] text-sub"
      >
        <span className={expanded ? '' : 'line-clamp-3'}>{message.body}</span>
      </button>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => dismiss.mutate(message.id)}
          className="h-10 rounded-[11px] border border-line px-4 text-[13.5px] font-semibold text-sub transition hover:bg-soft"
        >
          Dismiss
        </button>
      </div>

      <p className="m-0 text-xs text-sub">
        It&rsquo;s saved. Add a rule in Settings and it will be picked up.
      </p>
    </Card>
  )
}

export function InboxPage() {
  const { data: review = [], isLoading: loadingReview } = useReviewQueue()
  const { data: messages = [], isLoading: loadingMessages } = useOpenMessages()
  const reprocess = useReprocess()

  const needsAccount = messages.filter((m) => m.parse_status === 'needs_account')
  const unreadable = messages.filter((m) => m.parse_status === 'unmatched')
  const total = review.length + messages.length
  const loading = loadingReview || loadingMessages

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Inbox"
        subtitle="Bank SMS your phone forwarded — confirm and they join the ledger."
        action={
          messages.length > 0 ? (
            <button
              type="button"
              disabled={reprocess.isPending}
              onClick={() => reprocess.mutate(undefined)}
              className="flex h-[42px] items-center gap-2 rounded-xl border border-line bg-card px-[18px] text-sm font-bold text-ink transition hover:bg-soft"
            >
              <RefreshCw
                className={cn('size-4', reprocess.isPending && 'animate-spin')}
                aria-hidden
              />
              Retry
            </button>
          ) : undefined
        }
      />

      {!loading && total === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Nothing needs you"
            description="Every message so far has been filed on its own. This is what it should look like most days."
          />
        </Card>
      ) : (
        <div className="grid items-start gap-[clamp(14px,2vw,20px)] [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">
          {needsAccount.map((m) => (
            <UnknownCardCard key={m.id} message={m} />
          ))}
          {review.map((tx) => (
            <ReviewCard key={tx.id} tx={tx} />
          ))}
          {unreadable.map((m) => (
            <UnreadableCard key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  )
}
