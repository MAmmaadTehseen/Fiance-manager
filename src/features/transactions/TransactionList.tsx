import { Fragment, useMemo } from 'react'
import { ArrowLeftRight, CircleHelp } from 'lucide-react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { Avatar } from '@/components/ui/card'
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
        {Array.from({ length: 6 }, (_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:px-5"
          >
            <div className="size-10 animate-pulse rounded-[13px] bg-soft" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-soft" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-soft" />
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
          <p className="sticky top-0 z-[1] m-0 border-t border-line bg-card px-4 py-2 text-xs font-semibold text-sub first:border-t-0 sm:px-5">
            {dayLabel(rows[0]!.occurred_at)}
          </p>

          <ul className="flex flex-col">
            {rows.map((t) => {
              const needsReview = t.status === 'needs_review'
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(t)}
                    disabled={!onSelect}
                    className={cn(
                      'flex w-full items-center gap-3 border-t border-line px-4 py-2.5 text-left transition-colors sm:px-5',
                      onSelect && 'hover:bg-soft',
                    )}
                  >
                    <Avatar
                      tone={
                        needsReview
                          ? 'gold'
                          : t.type === 'transfer'
                            ? 'neutral'
                            : 'neutral'
                      }
                      className="rounded-[13px] text-sm font-bold"
                    >
                      {needsReview ? (
                        <CircleHelp className="size-4" aria-hidden />
                      ) : t.type === 'transfer' ? (
                        <ArrowLeftRight className="size-4" aria-hidden />
                      ) : (
                        (
                          t.merchant?.display_name ??
                          t.category?.name ??
                          '?'
                        )[0]?.toUpperCase()
                      )}
                    </Avatar>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">
                        {primaryLabel(t)}
                      </span>
                      <span
                        className={cn(
                          'block truncate text-[12.5px]',
                          needsReview ? 'text-gold-ink' : 'text-sub',
                        )}
                      >
                        {needsReview ? 'Needs a category' : secondaryLabel(t)}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'tabular shrink-0 text-[14.5px] font-bold',
                        t.type === 'income' && 'text-pos',
                        t.type === 'transfer' && 'text-sub',
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
