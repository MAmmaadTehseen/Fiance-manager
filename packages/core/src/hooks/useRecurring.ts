import { useMemo } from 'react'
import { toNumber } from '../money'
import { useTransactions, type TransactionRow } from './useTransactions'

/** A charge that repeats — a subscription, bill, or rent. */
export type RecurringItem = {
  key: string
  name: string
  categoryName: string | null
  /** Representative monthly amount (the average of what was seen). */
  amount: number
  currency: string
  /** How many charges matched, across how many distinct months. */
  occurrences: number
  months: number
  lastDate: string
}

/**
 * Finds repeating charges from history.
 *
 * The signal for "recurring" is: the same payee seen in at least two distinct
 * months, with amounts close enough to look like a fixed commitment rather than
 * variable spending. That last part is what separates a Netflix from a grocery
 * run at the same shop — a subscription is the same figure each time, groceries
 * are not. The tolerance is deliberately loose so a price change doesn't hide a
 * subscription, but tight enough to keep variable spending out.
 */
export function detectRecurring(rows: TransactionRow[]): RecurringItem[] {
  type Group = {
    label: string
    category: string | null
    amounts: number[]
    months: Set<string>
    lastDate: string
    currency: string
  }
  const groups = new Map<string, Group>()

  for (const t of rows) {
    if (t.type !== 'expense') continue
    const label = t.merchant?.display_name ?? t.note ?? t.category?.name ?? null
    if (!label) continue
    const key = (t.merchant_id ?? label).toLowerCase()

    const g =
      groups.get(key) ??
      ({
        label,
        category: t.category?.name ?? null,
        amounts: [],
        months: new Set<string>(),
        lastDate: '',
        currency: t.currency ?? 'PKR',
      } satisfies Group)

    g.amounts.push(toNumber(t.amount))
    g.months.add(t.occurred_at.slice(0, 7))
    if (t.occurred_at > g.lastDate) g.lastDate = t.occurred_at
    groups.set(key, g)
  }

  const out: RecurringItem[] = []
  for (const [key, g] of groups) {
    if (g.months.size < 2) continue // needs to repeat across months

    const min = Math.min(...g.amounts)
    const max = Math.max(...g.amounts)
    if (min <= 0 || max / min > 1.6) continue // too variable to be fixed

    const amount = g.amounts.reduce((a, b) => a + b, 0) / g.amounts.length
    out.push({
      key,
      name: g.label,
      categoryName: g.category,
      amount,
      currency: g.currency,
      occurrences: g.amounts.length,
      months: g.months.size,
      lastDate: g.lastDate,
    })
  }

  return out.sort((a, b) => b.amount - a.amount)
}

/** Roughly six months of history is enough to see a monthly pattern twice. */
const WINDOW_DAYS = 190

export function useRecurring() {
  const since = useMemo(
    () => new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString(),
    [],
  )
  const query = useTransactions({ from: since, limit: 3000 })
  const items = useMemo(() => detectRecurring(query.data ?? []), [query.data])
  const monthlyTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.amount, 0),
    [items],
  )
  return { ...query, items, monthlyTotal }
}
