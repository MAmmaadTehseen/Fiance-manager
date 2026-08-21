import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, Inbox as InboxIcon } from 'lucide-react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Card, Avatar } from '@/components/ui/card'
import { BatwaWatermark } from '@/components/BatwaLogo'
import { useAuth } from '@/lib/auth'
import { useAccountBalances } from '@/hooks/useAccounts'
import { useTransactions, type TransactionRow } from '@/hooks/useTransactions'
import { useInboxCount } from '@/hooks/useInbox'
import { formatMoney, toNumber } from '@/lib/money'
import { cn } from '@/lib/utils'

const MONTHS_SHOWN = 6

/** "Salaam, Hamza" — first name only, and only when we actually know it. */
function greeting(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? `Salaam, ${first}` : 'Salaam'
}

function initial(t: TransactionRow): string {
  const source = t.merchant?.display_name ?? t.category?.name ?? t.note ?? '?'
  return source.trim()[0]?.toUpperCase() ?? '?'
}

function SectionLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="border-none bg-none p-0 text-[13.5px] font-semibold text-gold-ink no-underline hover:underline"
    >
      {children}
    </Link>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data: accounts = [] } = useAccountBalances()
  const { data: inboxCount = 0 } = useInboxCount()

  // One query covers the headline figures, the six-month bars and the
  // category breakdown — they are all the same rows, sliced differently.
  const since = useMemo(
    () => startOfMonth(subMonths(new Date(), MONTHS_SHOWN - 1)).toISOString(),
    [],
  )
  const { data: window = [] } = useTransactions({ from: since, limit: 2000 })
  const { data: recent = [] } = useTransactions({ limit: 5 })

  const netWorth = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0)

  const { months, thisMonth, lastMonth, byCategory, spent } = useMemo(() => {
    const buckets = new Map<string, { label: string; in: number; out: number }>()
    for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      buckets.set(format(d, 'yyyy-MM'), {
        label: format(d, 'MMM'),
        in: 0,
        out: 0,
      })
    }

    const currentKey = format(new Date(), 'yyyy-MM')
    const categories = new Map<string, number>()

    for (const t of window) {
      // Transfers move money between the user's own accounts — neither income
      // nor spending, and including them would double the totals.
      if (t.type === 'transfer') continue
      const key = t.occurred_at.slice(0, 7)
      const bucket = buckets.get(key)
      const amount = toNumber(t.amount)
      if (bucket) {
        if (t.type === 'income') bucket.in += amount
        else bucket.out += amount
      }
      if (key === currentKey && t.type === 'expense') {
        const name = t.category?.name ?? 'Uncategorised'
        categories.set(name, (categories.get(name) ?? 0) + amount)
      }
    }

    const months = [...buckets.values()]
    const spent = [...categories.values()].reduce((a, b) => a + b, 0)

    // Top five by value, with the tail collapsed so the list stays readable.
    const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 5)
    const tail = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0)
    const byCategory = tail > 0 ? [...top, ['Everything else', tail] as const] : top

    return {
      months,
      thisMonth: months[months.length - 1] ?? { in: 0, out: 0, label: '' },
      lastMonth: months[months.length - 2] ?? null,
      byCategory,
      spent,
    }
  }, [window])

  const peak = Math.max(1, ...months.flatMap((m) => [m.in, m.out]))

  const spentDelta =
    lastMonth && lastMonth.out > 0
      ? ((thisMonth.out - lastMonth.out) / lastMonth.out) * 100
      : null

  return (
    <div className="flex flex-col gap-[clamp(20px,3vw,28px)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] font-bold tracking-[-0.02em]">
            {greeting(user?.user_metadata?.display_name as string | undefined)}
          </h1>
          <p className="mb-0 mt-1 text-[15px] text-sub">
            Here&rsquo;s your money in {format(new Date(), 'MMMM')}.
          </p>
        </div>
        <span className="rounded-full bg-gold-soft px-3 py-1.5 text-[13px] font-semibold text-gold-ink">
          {format(new Date(), 'MMM yyyy')}
        </span>
      </header>

      {/* ----------------------------------------- balance + six-month bars */}
      <div className="grid gap-[clamp(14px,2vw,20px)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <div className="relative flex flex-col gap-[18px] overflow-hidden rounded-3xl bg-brand p-[clamp(20px,3vw,28px)] text-brand-on shadow-card">
          <BatwaWatermark
            size={180}
            className="pointer-events-none absolute -bottom-12 -right-10 opacity-[0.12]"
          />
          <div>
            <p className="m-0 text-[13.5px] font-semibold opacity-75">
              Total balance
            </p>
            <p className="tabular mb-0 mt-1.5 font-display text-[clamp(32px,5vw,44px)] font-bold tracking-[-0.02em]">
              {formatMoney(netWorth)}
            </p>
          </div>
          <div className="flex flex-wrap gap-[clamp(16px,3vw,32px)]">
            <div>
              <p className="m-0 text-[12.5px] font-semibold opacity-75">
                In this month
              </p>
              <p className="tabular mb-0 mt-[3px] text-[17px] font-bold text-[oklch(0.85_0.1_155)]">
                +{formatMoney(thisMonth.in)}
              </p>
            </div>
            <div>
              <p className="m-0 text-[12.5px] font-semibold opacity-75">
                Out this month
              </p>
              <p className="tabular mb-0 mt-[3px] text-[17px] font-bold text-gold">
                −{formatMoney(thisMonth.out)}
              </p>
            </div>
            {spentDelta !== null && (
              <div>
                <p className="m-0 text-[12.5px] font-semibold opacity-75">
                  vs {lastMonth?.label}
                </p>
                <p
                  className={cn(
                    'tabular mb-0 mt-[3px] text-[17px] font-bold',
                    spentDelta <= 0
                      ? 'text-[oklch(0.85_0.1_155)]'
                      : 'text-gold',
                  )}
                >
                  {spentDelta <= 0 ? '▾' : '▴'}{' '}
                  {Math.abs(spentDelta).toFixed(1)}%{' '}
                  {spentDelta <= 0 ? 'less' : 'more'} spent
                </p>
              </div>
            )}
          </div>
        </div>

        <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,28px)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[15px] font-bold">Six months</h2>
            <span className="text-[12.5px] text-sub">
              <span className="mr-1.5 inline-block size-2 rounded-[3px] bg-brand align-middle" />
              In&nbsp;&nbsp;
              <span className="mr-1.5 inline-block size-2 rounded-[3px] bg-gold align-middle" />
              Out
            </span>
          </div>
          <div className="flex min-h-[150px] flex-1 items-end gap-[clamp(8px,2%,18px)]">
            {months.map((m, i) => {
              const isCurrent = i === months.length - 1
              return (
                <div
                  key={m.label + i}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div className="flex w-full items-end justify-center gap-1">
                    <div
                      className="w-[34%] max-w-[20px] rounded-t-md bg-brand"
                      style={{ height: `${Math.round((m.in / peak) * 134)}px` }}
                      title={`In ${formatMoney(m.in)}`}
                    />
                    <div
                      className="w-[34%] max-w-[20px] rounded-t-md bg-gold"
                      style={{ height: `${Math.round((m.out / peak) * 134)}px` }}
                      title={`Out ${formatMoney(m.out)}`}
                    />
                  </div>
                  <span
                    className={cn(
                      'text-[11.5px]',
                      isCurrent
                        ? 'font-bold text-gold-ink'
                        : 'font-semibold text-sub',
                    )}
                  >
                    {m.label}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ------------------------------- where it went + accounts + nudge */}
      <div className="grid items-start gap-[clamp(14px,2vw,20px)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]">
        <Card className="flex flex-col gap-4 p-[clamp(20px,3vw,26px)]">
          <h2 className="m-0 text-[15px] font-bold">
            Where it went{' '}
            <span className="font-medium text-sub">· {formatMoney(spent)}</span>
          </h2>

          {byCategory.length === 0 ? (
            <p className="m-0 text-sm text-sub">
              Nothing spent yet this month.
            </p>
          ) : (
            <div className="flex flex-col gap-[13px]">
              {byCategory.map(([name, value], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-[108px] shrink-0 text-[13.5px] font-semibold',
                      i === byCategory.length - 1 &&
                        name === 'Everything else' &&
                        'text-sub',
                    )}
                  >
                    {name}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-soft">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        i % 2 === 0 ? 'bg-brand' : 'bg-gold',
                      )}
                      style={{
                        width: `${spent > 0 ? (value / spent) * 100 : 0}%`,
                        opacity: 1 - i * 0.12,
                      }}
                    />
                  </div>
                  <span className="tabular w-[72px] text-right text-[13px] text-sub">
                    {Math.round(value).toLocaleString('en-PK')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-[clamp(14px,2vw,20px)]">
          <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 text-[15px] font-bold">Accounts</h2>
              <SectionLink to="/accounts">Manage</SectionLink>
            </div>
            <div className="flex flex-col gap-1">
              {accounts.slice(0, 4).map((a, i) => (
                <div key={a.account_id} className="flex items-center gap-3 py-[9px]">
                  <Avatar
                    size={38}
                    tone={
                      a.type === 'cash' ? 'neutral' : i % 2 === 0 ? 'brand' : 'gold'
                    }
                  >
                    {a.type === 'cash' ? '₨' : a.name.trim()[0]?.toUpperCase()}
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold">
                      {a.name}
                    </span>
                    <span className="block text-[12.5px] capitalize text-sub">
                      {a.type.replace('_', ' ')}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[14.5px] font-bold">
                    {formatMoney(a.balance, { currency: a.currency })}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {inboxCount > 0 && (
            <div className="flex items-center gap-3.5 rounded-[20px] border border-gold bg-gold-soft px-5 py-[18px]">
              <InboxIcon className="size-5 shrink-0 text-gold-ink" aria-hidden />
              <p className="m-0 flex-1 text-[13.5px] text-ink">
                <strong>
                  {inboxCount} {inboxCount === 1 ? 'item' : 'items'}
                </strong>{' '}
                waiting for review.
              </p>
              <Link
                to="/inbox"
                className="shrink-0 rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-on no-underline"
              >
                Review
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------- recent activity */}
      <Card className="flex flex-col gap-2 p-[clamp(18px,3vw,26px)]">
        <div className="flex items-baseline justify-between pb-1.5">
          <h2 className="m-0 text-[15px] font-bold">Recent activity</h2>
          <SectionLink to="/transactions">See all</SectionLink>
        </div>

        {recent.length === 0 ? (
          <p className="m-0 border-t border-line pt-3 text-sm text-sub">
            Nothing recorded yet. Connect your phone in Settings and it starts
            filling itself.
          </p>
        ) : (
          recent.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 border-t border-line py-2.5"
            >
              <Avatar
                tone={t.type === 'transfer' ? 'neutral' : 'gold'}
                className="rounded-[13px] text-sm font-bold"
              >
                {t.type === 'transfer' ? (
                  <ArrowLeftRight className="size-4" aria-hidden />
                ) : (
                  initial(t)
                )}
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-semibold">
                  {t.type === 'transfer'
                    ? `${t.account?.name ?? ''} → ${t.counterparty_account?.name ?? ''}`
                    : (t.merchant?.display_name ??
                      t.category?.name ??
                      t.note ??
                      'Transaction')}
                </span>
                <span className="block truncate text-[12.5px] text-sub">
                  {format(new Date(t.occurred_at), 'd MMM')}
                  {t.account?.name ? ` · ${t.account.name}` : ''}
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
            </div>
          ))
        )}
      </Card>
    </div>
  )
}
