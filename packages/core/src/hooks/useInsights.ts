/**
 * Spending analytics.
 *
 * Everything here is derived from the ledger the app already has rather than
 * asked of the database, so the numbers can never disagree with the rows the
 * user is looking at. The maths is pure and platform-free; web and mobile both
 * import it and draw it their own way.
 *
 * Transfers are excluded from every total. Moving money from a bank account to
 * Cash is not spending, and counting it would double the month's outgoings —
 * once when it leaves the bank and again when the cash is spent.
 */
import { useMemo } from 'react'
import { toNumber } from '../money'
import { useTransactions, type TransactionRow } from './useTransactions'

/** The ranges the UI offers. `all` means "don't bound the query at all". */
export type RangePreset = 'this_month' | 'last_month' | 'last_3m' | 'last_12m' | 'all'

export type DateRange = { from?: string; to?: string; label: string }

const MONTH_LABEL = new Intl.DateTimeFormat('en-PK', { month: 'short' })
const MONTH_YEAR_LABEL = new Intl.DateTimeFormat('en-PK', {
  month: 'long',
  year: 'numeric',
})

/**
 * A range bound as a full instant.
 *
 * `occurred_at` is `timestamptz`, so a bare `YYYY-MM-DD` would be read as UTC
 * midnight — which in PKT (UTC+5) is 5am local, quietly dropping the first five
 * hours of a "from" day and, worse, all 24 hours of a "to" day. Sending a real
 * instant built from local time removes the ambiguity in both directions.
 */
function instant(d: Date): string {
  return d.toISOString()
}

/** The last representable moment of the given local day. */
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Turns a preset into concrete bounds.
 *
 * `now` is injectable so this stays testable and so a caller can pin a report
 * to a date rather than to whenever the function happened to run.
 */
export function resolveRange(preset: RangePreset, now = new Date()): DateRange {
  const startOfMonth = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth() + offset, 1)

  switch (preset) {
    case 'this_month':
      return {
        from: instant(startOfMonth(0)),
        label: MONTH_YEAR_LABEL.format(now),
      }
    case 'last_month': {
      const start = startOfMonth(-1)
      return {
        from: instant(start),
        // Day zero of this month is the last day of the previous one; take it
        // to its final millisecond so the whole day is inside the range.
        to: instant(endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))),
        label: MONTH_YEAR_LABEL.format(start),
      }
    }
    case 'last_3m':
      return { from: instant(startOfMonth(-2)), label: 'Last 3 months' }
    case 'last_12m':
      return { from: instant(startOfMonth(-11)), label: 'Last 12 months' }
    case 'all':
      return { label: 'All time' }
  }
}

/** A slice of spending — one category, or one merchant. */
export type Slice = {
  key: string
  label: string
  icon?: string | null
  total: number
  count: number
  /** Fraction of the total this slice represents, 0–1. */
  share: number
}

export type MonthPoint = {
  /** `YYYY-MM`, for stable sorting and keys. */
  month: string
  label: string
  income: number
  expense: number
  net: number
}

export type Insights = {
  income: number
  expense: number
  net: number
  /** Mean spend per day across the days the range actually covers. */
  dailyAverage: number
  transactionCount: number
  largest: TransactionRow | null
  byCategory: Slice[]
  byMerchant: Slice[]
  months: MonthPoint[]
  currency: string
}

function toSlices(
  totals: Map<string, { label: string; icon?: string | null; total: number; count: number }>,
  grandTotal: number,
): Slice[] {
  return [...totals.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      icon: v.icon,
      total: v.total,
      count: v.count,
      share: grandTotal > 0 ? v.total / grandTotal : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Reduces a set of rows to everything the Insights screen shows, in one pass
 * per concern. Exported separately from the hook so it can be unit-tested and
 * reused on any list of rows, not only a live query.
 */
export function computeInsights(
  rows: TransactionRow[],
  now = new Date(),
): Insights {
  let income = 0
  let expense = 0
  let largest: TransactionRow | null = null

  const categories = new Map<
    string,
    { label: string; icon?: string | null; total: number; count: number }
  >()
  const merchants = new Map<
    string,
    { label: string; total: number; count: number }
  >()
  const months = new Map<string, MonthPoint>()

  for (const t of rows) {
    if (t.type === 'transfer') continue
    const amount = toNumber(t.amount)
    const date = new Date(t.occurred_at)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    const point =
      months.get(monthKey) ??
      ({
        month: monthKey,
        label: MONTH_LABEL.format(date),
        income: 0,
        expense: 0,
        net: 0,
      } satisfies MonthPoint)

    if (t.type === 'income') {
      income += amount
      point.income += amount
    } else {
      expense += amount
      point.expense += amount

      if (!largest || amount > toNumber(largest.amount)) largest = t

      const categoryKey = t.category?.id ?? 'uncategorised'
      const category = categories.get(categoryKey) ?? {
        label: t.category?.name ?? 'Uncategorised',
        icon: t.category?.icon,
        total: 0,
        count: 0,
      }
      category.total += amount
      category.count += 1
      categories.set(categoryKey, category)

      const merchantLabel = t.merchant?.display_name ?? t.note
      if (merchantLabel) {
        const merchantKey = (t.merchant?.id ?? merchantLabel).toLowerCase()
        const merchant = merchants.get(merchantKey) ?? {
          label: merchantLabel,
          total: 0,
          count: 0,
        }
        merchant.total += amount
        merchant.count += 1
        merchants.set(merchantKey, merchant)
      }
    }

    point.net = point.income - point.expense
    months.set(monthKey, point)
  }

  return {
    income,
    expense,
    net: income - expense,
    dailyAverage: expense / daysCovered(rows, now),
    transactionCount: rows.filter((t) => t.type !== 'transfer').length,
    largest,
    byCategory: toSlices(categories, expense),
    byMerchant: toSlices(merchants, expense),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    currency: rows[0]?.currency ?? 'PKR',
  }
}

/**
 * How many days the rows span, floored at 1.
 *
 * Dividing by the *elapsed* span rather than by a fixed 30 keeps the daily
 * average honest mid-month: on the 5th, spending is spread over five days, not
 * thirty, and pretending otherwise makes every month look cheap until it ends.
 */
function daysCovered(rows: TransactionRow[], now: Date): number {
  if (rows.length === 0) return 1
  const times = rows.map((t) => new Date(t.occurred_at).getTime())
  const earliest = Math.min(...times)
  const latest = Math.min(Math.max(...times), now.getTime())
  const days = Math.ceil((latest - earliest) / 86_400_000) + 1
  return Math.max(days, 1)
}

/** Live insights for a range. */
export function useInsights(preset: RangePreset = 'this_month') {
  const range = useMemo(() => resolveRange(preset), [preset])

  const query = useTransactions({
    from: range.from,
    to: range.to,
    limit: 2000,
  })

  const insights = useMemo(
    () => computeInsights(query.data ?? []),
    [query.data],
  )

  return { ...query, range, insights }
}
