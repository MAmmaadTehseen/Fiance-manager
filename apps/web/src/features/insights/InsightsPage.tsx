import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartNoAxesColumn, Repeat, Store, Tags } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Chip } from '@/components/Chip'
import { Card, Avatar } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  formatMoney,
  formatMoneyCompact,
  useInsights,
  useRecurring,
  type MonthPoint,
  type RangePreset,
  type Slice,
} from '@batwa/core'

const RANGES: { id: RangePreset; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3m', label: '3 months' },
  { id: 'last_12m', label: '12 months' },
  { id: 'all', label: 'All time' },
]

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down'
}) {
  return (
    <Card className="flex flex-col gap-1 p-[clamp(16px,2.5vw,22px)]">
      <span className="text-[13px] font-semibold text-sub">{label}</span>
      <span
        className={cn(
          'font-display text-[clamp(20px,3vw,26px)] font-bold tracking-[-0.02em]',
          tone === 'up' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'down' && 'text-rose-600 dark:text-rose-400',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-[12.5px] text-sub">{hint}</span>}
    </Card>
  )
}

/**
 * The month trend. Income and spending share one baseline so the two are
 * directly comparable, and each bar is scaled against the busiest month in the
 * window rather than against its own total.
 */
function MonthBars({ months }: { months: MonthPoint[] }) {
  const peak = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1)

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,28px)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-bold">Month by month</h2>
        <div className="flex items-center gap-3 text-[12px] text-sub">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand" aria-hidden />
            In
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-gold-ink" aria-hidden />
            Out
          </span>
        </div>
      </div>

      <ul className="m-0 flex list-none items-end gap-2 p-0" style={{ height: 160 }}>
        {months.map((m) => (
          <li key={m.month} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <div className="flex h-full items-end justify-center gap-1">
              <span
                title={`In ${formatMoney(m.income)}`}
                className="w-1/2 max-w-4 rounded-t-md bg-brand transition-all"
                style={{ height: `${(m.income / peak) * 100}%` }}
              />
              <span
                title={`Out ${formatMoney(m.expense)}`}
                className="w-1/2 max-w-4 rounded-t-md bg-gold-ink transition-all"
                style={{ height: `${(m.expense / peak) * 100}%` }}
              />
            </div>
            <span className="text-center text-[11.5px] font-semibold text-sub">
              {m.label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** A ranked list with a share bar behind each row. */
function Breakdown({
  title,
  icon: Icon,
  slices,
  emptyLabel,
  limit = 8,
}: {
  title: string
  icon: typeof Tags
  slices: Slice[]
  emptyLabel: string
  limit?: number
}) {
  const shown = slices.slice(0, limit)

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
      <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
        <Icon className="size-4 text-sub" aria-hidden />
        {title}
      </h2>

      {shown.length === 0 ? (
        <p className="m-0 text-[13.5px] text-sub">{emptyLabel}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {shown.map((s) => (
            <li key={s.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] font-semibold">
                  {s.icon ? `${s.icon} ` : ''}
                  {s.label}
                </span>
                <span className="shrink-0 text-[13.5px] font-bold tabular-nums">
                  {formatMoney(s.total)}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.max(s.share * 100, 1.5)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[12px] text-sub tabular-nums">
                  {(s.share * 100).toFixed(0)}% · {s.count}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Subscriptions() {
  const { items, monthlyTotal, isLoading } = useRecurring()
  if (isLoading || items.length === 0) return null

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          <Repeat className="size-4 text-sub" aria-hidden />
          Repeats every month
        </h2>
        <span className="text-[13px] font-bold text-gold-ink">
          ≈ {formatMoney(monthlyTotal)}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.slice(0, 8).map((item) => (
          <li key={item.key} className="flex items-center gap-3">
            <Avatar tone="gold" size={34}>
              {item.name.trim()[0]?.toUpperCase() ?? '?'}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13.5px] font-semibold">
                {item.name}
              </p>
              <p className="m-0 text-[12px] text-sub">
                {item.categoryName ?? 'Uncategorised'} · seen in {item.months}{' '}
                months
              </p>
            </div>
            <span className="shrink-0 text-[13.5px] font-bold tabular-nums">
              {formatMoney(item.amount)}
            </span>
          </li>
        ))}
      </ul>

      <p className="m-0 text-[12px] text-sub">
        Spotted from your history — a payee charging a steady amount across at
        least two months.
      </p>
    </Card>
  )
}

export function InsightsPage() {
  const [range, setRange] = useState<RangePreset>('this_month')
  const { insights, isLoading } = useInsights(range)

  const {
    income,
    expense,
    net,
    dailyAverage,
    transactionCount,
    largest,
    byCategory,
    byMerchant,
    months,
  } = insights

  const empty = !isLoading && transactionCount === 0

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Insights"
        subtitle="Where the money actually goes."
      />

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Chip key={r.id} selected={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </Chip>
        ))}
      </div>

      {empty ? (
        <Card>
          <EmptyState
            icon={ChartNoAxesColumn}
            title="Nothing to chart yet"
            description="Once there's spending in this period, the breakdown shows up here."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat
              label="Spent"
              value={formatMoney(expense)}
              hint={`${transactionCount} entries`}
              tone="down"
            />
            <Stat label="Received" value={formatMoney(income)} tone="up" />
            <Stat
              label="Net"
              value={formatMoney(net, { signed: true })}
              hint={net < 0 ? 'Spending outpaced income' : 'In the black'}
              tone={net < 0 ? 'down' : 'up'}
            />
            <Stat
              label="Daily average"
              value={formatMoneyCompact(dailyAverage)}
              hint={
                largest
                  ? `Largest ${formatMoney(largest.amount)}`
                  : undefined
              }
            />
          </div>

          {months.length > 1 && <MonthBars months={months} />}

          <div className="grid gap-3 lg:grid-cols-2">
            <Breakdown
              title="By category"
              icon={Tags}
              slices={byCategory}
              emptyLabel="No spending in this period."
            />
            <Breakdown
              title="Top payees"
              icon={Store}
              slices={byMerchant}
              emptyLabel="No named payees in this period."
            />
          </div>

          <Subscriptions />

          <p className="m-0 text-center text-[12.5px] text-sub">
            Transfers between your own accounts are excluded — moving money
            isn't spending.{' '}
            <Link
              to="/transactions"
              className="font-semibold text-gold-ink no-underline hover:underline"
            >
              See every entry
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
