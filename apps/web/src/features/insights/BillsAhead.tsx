import { CalendarDays, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { formatMoney, useUpcomingBills, type UpcomingBill } from '@batwa/core'
import { cn } from '@/lib/utils'

function whenLabel(bill: UpcomingBill): string {
  if (bill.paid) return 'paid this month'
  const days = bill.daysAway ?? 0
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `in ${days} days`
}

/**
 * The month ahead, and anything that came in high.
 *
 * Recurring detection already knows what repeats; this answers the two
 * questions people actually have about it — what is still to come out, and did
 * something just cost noticeably more than it usually does. A spike is
 * measured against that charge's own history, because "high for this bill" is
 * the only comparison that means anything.
 */
export function BillsAhead() {
  const { bills, stillToCome, isLoading } = useUpcomingBills()

  if (isLoading || bills.length === 0) return null

  const spiking = bills.filter((b) => b.spike != null)
  const upcoming = bills.filter((b) => !b.paid).slice(0, 6)

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          <CalendarDays className="size-4 text-sub" aria-hidden />
          Still to come this month
        </h2>
        <span className="tabular text-[15px] font-bold">
          {formatMoney(stillToCome)}
        </span>
      </div>

      {spiking.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {spiking.map((bill) => (
            <li
              key={bill.item.key}
              className="flex items-center gap-2 rounded-xl bg-gold-soft px-3 py-2"
            >
              <TrendingUp className="size-4 shrink-0 text-gold-ink" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-gold-ink">
                {bill.item.name} came in {Math.round((bill.spike ?? 0) * 100)}%
                above its usual
              </span>
              <span className="tabular shrink-0 text-[13px] font-bold text-gold-ink">
                {formatMoney(bill.item.amounts[bill.item.amounts.length - 1] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {upcoming.length === 0 ? (
        <p className="m-0 text-[13.5px] text-sub">
          Everything that repeats has already gone out this month.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {upcoming.map((bill) => (
            <li key={bill.item.key} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13.5px] font-semibold">
                  {bill.item.name}
                </p>
                <p
                  className={cn(
                    'm-0 text-[12px]',
                    (bill.daysAway ?? 0) < 0
                      ? 'font-semibold text-neg'
                      : 'text-sub',
                  )}
                >
                  {bill.item.categoryName ?? 'Uncategorised'} · {whenLabel(bill)}
                </p>
              </div>
              <span className="tabular shrink-0 text-[13.5px] font-bold">
                ≈ {formatMoney(bill.item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 text-[12px] text-sub">
        Spotted from your own history — amounts are what these usually cost.
      </p>
    </Card>
  )
}
