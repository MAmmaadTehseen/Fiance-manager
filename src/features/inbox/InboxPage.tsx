import { useState } from 'react'
import { Inbox, RefreshCw, CreditCard, MessageSquareWarning, X } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { useCategories } from '@/hooks/useCategories'
import { useAccounts } from '@/hooks/useAccounts'
import { useReprocess } from '@/hooks/useIngest'
import {
  useReviewQueue,
  useOpenMessages,
  useCategorise,
  useAssignCardToAccount,
  useDismissMessage,
  type OpenMessage,
} from '@/hooks/useInbox'
import type { TransactionRow } from '@/hooks/useTransactions'

function ago(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

/**
 * One transaction the pipeline captured but could not categorise. Tapping a
 * category also teaches the merchant, so this shop never asks again.
 */
function ReviewCard({ tx }: { tx: TransactionRow }) {
  const categorise = useCategorise()
  const { data: categories = [] } = useCategories(
    tx.type === 'income' ? 'income' : 'expense',
  )

  const title =
    tx.merchant?.display_name ?? tx.note ?? tx.account?.name ?? 'Transaction'

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tx.account?.name} · {ago(tx.occurred_at)}
          </p>
        </div>
        <p
          className={cn(
            'tabular shrink-0 font-semibold',
            tx.type === 'income' ? 'text-money-in' : 'text-foreground',
          )}
        >
          {tx.type === 'income' ? '+' : '−'}
          {formatMoney(tx.amount, { currency: tx.currency }).replace(/^−/, '')}
        </p>
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        What was this?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
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
              })
            }
            className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}
      </div>

      {tx.merchant_id && (
        <p className="mt-3 text-xs text-muted-foreground">
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
  const reprocess = useReprocess()
  const dismiss = useDismissMessage()

  const last4 = message.pending_last4 ?? message.parsed?.last4 ?? ''
  const amount = message.parsed?.amount

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <CreditCard className="size-4 shrink-0 text-warning" aria-hidden />
            Which account is •••• {last4}?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {message.sender} · {ago(message.received_at)}
            {amount ? ` · ${formatMoney(amount)}` : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={() => dismiss.mutate(message.id)}
        >
          <X />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {accounts
          .filter((a) => a.type !== 'cash')
          .map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={assign.isPending || reprocess.isPending || !last4}
              onClick={async () => {
                await assign.mutateAsync({ accountId: a.id, last4 })
                await reprocess.mutateAsync(undefined)
              }}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
            >
              {a.name}
              {a.last4 ? ` ••${a.last4}` : ''}
            </button>
          ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Answering once resolves this and every future message from that card.
      </p>
    </Card>
  )
}

/** A message no template could read. Kept verbatim so a rule can rescue it. */
function UnreadableCard({ message }: { message: OpenMessage }) {
  const dismiss = useDismissMessage()
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <MessageSquareWarning
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            Couldn&rsquo;t read this one
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {message.sender} · {ago(message.received_at)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={() => dismiss.mutate(message.id)}
        >
          <X />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 w-full rounded-lg bg-muted p-3 text-left text-xs text-muted-foreground"
      >
        <span className={expanded ? '' : 'line-clamp-2'}>{message.body}</span>
      </button>

      <p className="mt-3 text-xs text-muted-foreground">
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
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Inbox"
        subtitle={
          total > 0
            ? 'Only things the app genuinely could not work out.'
            : undefined
        }
        action={
          messages.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={reprocess.isPending}
              onClick={() => reprocess.mutate(undefined)}
            >
              <RefreshCw className={cn(reprocess.isPending && 'animate-spin')} />
              Retry
            </Button>
          ) : undefined
        }
      />

      {!loading && total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing needs you"
          description="Every message so far has been filed on its own. This is what it should look like most days."
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 md:px-0">
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
