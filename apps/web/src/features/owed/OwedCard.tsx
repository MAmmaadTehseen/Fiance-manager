import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  formatMoney,
  toNumber,
  useOwedToYou,
  useSettleOwed,
  useTransactions,
  type TransactionRow,
} from '@batwa/core'

function claimLabel(t: TransactionRow): string {
  return t.merchant?.display_name ?? t.note ?? t.category?.name ?? 'a payment'
}

/**
 * Picks the incoming payment that settles a claim.
 *
 * Candidates are recent income rows, with the ones matching the owed amount
 * listed first — that is almost always the repayment. Linking rather than
 * marking done keeps the books explaining themselves: the claim can always
 * show which rupees closed it.
 */
function SettlePicker({
  claim,
  onClose,
}: {
  claim: TransactionRow
  onClose: () => void
}) {
  const settle = useSettleOwed()
  const { data: incomes = [], isLoading } = useTransactions({
    type: 'income',
    limit: 12,
  })

  const owed = toNumber(claim.owed_amount)
  const candidates = [...incomes].sort(
    (a, b) =>
      Math.abs(toNumber(a.amount) - owed) - Math.abs(toNumber(b.amount) - owed),
  )

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
      <p className="m-0 text-[13px] font-semibold">
        Which payment was {claim.owed_by} paying you back?
      </p>
      {isLoading ? (
        <p className="m-0 text-[13px] text-sub">Looking…</p>
      ) : candidates.length === 0 ? (
        <p className="m-0 text-[13px] text-sub">
          No incoming payments yet — when it arrives, settle it from here.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {candidates.slice(0, 6).map((income) => (
            <li key={income.id}>
              <button
                type="button"
                disabled={settle.isPending}
                onClick={async () => {
                  await settle.mutateAsync({
                    transactionId: claim.id,
                    settledById: income.id,
                  })
                  onClose()
                }}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-card disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-[13px] font-semibold">
                  {claimLabel(income)}
                </span>
                <span className="tabular shrink-0 text-[13px] font-bold text-pos">
                  +{formatMoney(income.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="self-start text-[12.5px] font-semibold text-sub transition hover:text-ink"
      >
        Not yet
      </button>
    </div>
  )
}

/** Open claims — who still owes you, and how much all of it comes to. */
export function OwedCard() {
  const { data: claims = [], isLoading } = useOwedToYou()
  const [settling, setSettling] = useState<string | null>(null)

  if (isLoading || claims.length === 0) return null

  const total = claims.reduce((sum, c) => sum + toNumber(c.owed_amount), 0)

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          <HandCoins className="size-4 text-gold-ink" aria-hidden />
          Owed to you
        </h2>
        <span className="tabular text-[15px] font-bold text-gold-ink">
          {formatMoney(total)}
        </span>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {claims.map((claim) => (
          <li key={claim.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13.5px] font-semibold">
                  {claim.owed_by}
                </p>
                <p className="m-0 truncate text-[12px] text-sub">
                  for {claimLabel(claim)} ·{' '}
                  {new Date(claim.occurred_at).toLocaleDateString('en-PK', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
              <span className="tabular shrink-0 text-[13.5px] font-bold">
                {formatMoney(claim.owed_amount)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSettling(settling === claim.id ? null : claim.id)
                }
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-semibold text-sub transition-colors hover:border-brand hover:text-ink"
              >
                Paid back
              </button>
            </div>
            {settling === claim.id && (
              <SettlePicker claim={claim} onClose={() => setSettling(null)} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
