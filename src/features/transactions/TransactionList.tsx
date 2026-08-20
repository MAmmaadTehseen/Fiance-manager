import { Fragment, useMemo } from 'react'
import { ArrowLeftRight, CircleHelp } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import type { TransactionRow } from '@/hooks/useTransactions'

function dayLabel(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'EEE, d MMM yyyy')
}

function groupByDay(transactions: TransactionRow[]) {
  const groups = new Map<string, TransactionRow[]>()
  for (const t of transactions) {
    const key = t.occurred_at.slice(0, 10)
    const bucket = groups.get(key)
    if (bucket) bucket.push(t)
    else groups.set(key, [t])
  }
  return [...groups.entries()]
}

function primaryLabel(t: TransactionRow): string {
  if (t.type === 'transfer') {
    return `${t.account?.name ?? 'Account'} → ${t.counterparty_account?.name ?? 'Account'}`
  }
  return t.merchant?.display_name ?? t.category?.name ?? t.note ?? 'Transaction'
}

function secondaryLabel(t: TransactionRow): string | null {
  if (t.type === 'transfer') return 'Transfer'
  const parts = [t.category?.name, t.account?.name].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function TransactionList({
  transactions,
  loading = false,
  onSelect,
}: {
  transactions: TransactionRow[]
  loading?: boolean
  onSelect?: (t: TransactionRow) => void
}) {
  const grouped = useMemo(() => groupByDay(transactions), [transactions])

  if (loading) {
    return (
      <ul className="flex flex-col">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3 md:px-0">
            <div className="size-9 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flex flex-col">
      {grouped.map(([day, rows]) => (
        <Fragment key={day}>
          <p className="sticky top-0 z-10 bg-background/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur md:px-0">
            {dayLabel(rows[0]!.occurred_at)}
          </p>

          <ul className="flex flex-col">
            {rows.map((t) => {
              const needsReview = t.status === 'needs_review'
              const Icon = t.type === 'transfer' ? ArrowLeftRight : null

              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(t)}
                    disabled={!onSelect}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors md:rounded-lg md:px-3',
                      onSelect && 'hover:bg-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        needsReview
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted text-muted-foreground',
                      )}
                      aria-hidden
                    >
                      {needsReview ? (
                        <CircleHelp className="size-4" />
                      ) : Icon ? (
                        <Icon className="size-4" />
                      ) : (
                        (t.merchant?.display_name ??
                          t.category?.name ??
                          '?')[0]?.toUpperCase()
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {primaryLabel(t)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {needsReview ? 'Needs a category' : secondaryLabel(t)}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'tabular shrink-0 text-sm font-semibold',
                        t.type === 'income' && 'text-money-in',
                        t.type === 'expense' && 'text-foreground',
                        t.type === 'transfer' && 'text-money-neutral',
                      )}
                    >
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}
                      {formatMoney(t.amount, { currency: t.currency }).replace(
                        /^−/,
                        '',
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Fragment>
      ))}
    </div>
  )
}
