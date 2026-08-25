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
  /** Every amount seen, oldest first — what a spike is measured against. */
  amounts: number[]
  /** Day of the month it usually lands, 1-31. */
  usualDay: number
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
    days: number[]
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
        days: [],
        lastDate: '',
        currency: t.currency ?? 'PKR',
      } satisfies Group)

    g.amounts.push(toNumber(t.amount))
    g.months.add(t.occurred_at.slice(0, 7))
    g.days.push(new Date(t.occurred_at).getDate())
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
      amounts: g.amounts,
      usualDay: g.days.sort((a, b) => a - b)[Math.floor(g.days.length / 2)] ?? 1,
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


/** A commitment placed on the calendar, with how this month's charge landed. */
export type UpcomingBill = {
  item: RecurringItem
  /** When this month's charge is expected, or landed. */
  due: Date
  /** Already seen this month? */
  paid: boolean
  /** Days until due; negative once overdue. Null once paid. */
  daysAway: number | null
  /**
   * How far the latest charge sits above its own history, as a fraction —
   * 0.4 means 40% more than usual. Null when nothing looks unusual.
   */
  spike: number | null
}

/** Above this much more than its own history, a bill is worth pointing at. */
const SPIKE_THRESHOLD = 0.25

/**
 * The month ahead: what repeats, when it lands, and what came in high.
 *
 * Recurring detection already knows what repeats and roughly what it costs —
 * this turns that into the two questions people actually have. What is still
 * to come out this month, and did anything just cost noticeably more than it
 * usually does. Electricity in a Pakistani summer is exactly the case: the
 * bill is not wrong, but nobody wants to find out by reading the balance.
 *
 * A spike is measured against the charge's OWN history rather than a category
 * average, because "high for this bill" is the only comparison that means
 * anything — a 4,000 electricity bill is unremarkable next to rent and
 * alarming next to its own 2,400.
 */
export function useUpcomingBills(now = new Date()) {
  const recurring = useRecurring()

  const bills = useMemo((): UpcomingBill[] => {
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    return recurring.items
      .map((item) => {
        const paid = item.lastDate.slice(0, 7) === monthKey
        const due = new Date(now.getFullYear(), now.getMonth(), item.usualDay)
        // A commitment whose usual day has passed unpaid is next month's.
        if (!paid && due < now) due.setMonth(due.getMonth() + 1)

        const latest = item.amounts[item.amounts.length - 1] ?? 0
        const earlier = item.amounts.slice(0, -1)
        const baseline =
          earlier.length > 0
            ? earlier.reduce((a, b) => a + b, 0) / earlier.length
            : 0
        const spike =
          paid && baseline > 0 && latest / baseline - 1 >= SPIKE_THRESHOLD
            ? latest / baseline - 1
            : null

        return {
          item,
          due,
          paid,
          daysAway: paid
            ? null
            : Math.round((due.getTime() - now.getTime()) / 86_400_000),
          spike,
        }
      })
      .sort((a, b) => a.due.getTime() - b.due.getTime())
  }, [recurring.items, now])

  const stillToCome = bills
    .filter((b) => !b.paid && b.due.getMonth() === now.getMonth())
    .reduce((sum, b) => sum + b.item.amount, 0)

  return { ...recurring, bills, stillToCome }
}
