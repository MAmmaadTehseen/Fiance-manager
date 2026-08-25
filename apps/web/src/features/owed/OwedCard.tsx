import { useState } from 'react'
import { CalendarClock, HandCoins, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  formatMoney,
  parseAmount,
  toNumber,
  useAccounts,
  useCreateReceivable,
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

/**
 * Noting money you are expecting — the receivable's front door.
 *
 * Lives on the same card as the claims because to the person owed, there is
 * one question: who owes me. Where the ledger got the debt from — a spend
 * split with friends or work delivered on a promise — is bookkeeping.
 */
function ExpectingForm({ onDone }: { onDone: () => void }) {
  const create = useCreateReceivable()
  const { data: accounts = [] } = useAccounts()
  const [from, setFrom] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')

  // Where it is expected to land; the primary account is right nearly always,
  // and getting this wrong costs nothing until the money actually arrives.
  const accountId =
    accounts.find((a) => a.is_primary)?.id ?? accounts[0]?.id ?? null

  async function save() {
    const parsed = parseAmount(amount)
    if (!parsed || !accountId) return
    await create.mutateAsync({
      from,
      amount: parsed,
      dueDate,
      accountId,
      note: note || null,
    })
    onDone()
  }

  const ready = from.trim() && parseAmount(amount) && dueDate

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-soft p-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From — e.g. Uzair"
          aria-label="Who owes you"
          className="h-10 rounded-lg border border-line bg-card px-3 text-[13.5px] text-ink outline-none placeholder:text-sub focus:border-brand"
        />
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="How much — 20k works"
          aria-label="Amount expected"
          className="tabular h-10 rounded-lg border border-line bg-card px-3 text-[13.5px] text-ink outline-none placeholder:text-sub focus:border-brand"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due by"
          className="h-10 rounded-lg border border-line bg-card px-3 text-[13.5px] text-ink outline-none focus:border-brand"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For — e.g. 35h website work"
          aria-label="What it is for"
          className="h-10 rounded-lg border border-line bg-card px-3 text-[13.5px] text-ink outline-none placeholder:text-sub focus:border-brand"
        />
      </div>
      {create.isError && (
        <p role="alert" className="m-0 text-[12.5px] text-neg">
          {create.error instanceof Error
            ? create.error.message
            : 'Could not save that'}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready || create.isPending}
          onClick={() => void save()}
          className="rounded-lg bg-brand px-4 py-2 text-[13px] font-bold text-brand-on transition hover:brightness-110 disabled:opacity-50"
        >
          {create.isPending ? 'Saving…' : 'Expect it'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg px-3 py-2 text-[13px] font-semibold text-sub transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Open claims — who still owes you, and how much all of it comes to. */
export function OwedCard() {
  const { data: claims = [], isLoading } = useOwedToYou()
  const [settling, setSettling] = useState<string | null>(null)
  const [expecting, setExpecting] = useState(false)

  if (isLoading) return null
  if (claims.length === 0 && !expecting) {
    return (
      <button
        type="button"
        onClick={() => setExpecting(true)}
        className="flex items-center gap-2 self-start rounded-full border border-line bg-card px-4 py-2 text-[13px] font-semibold text-sub transition-colors hover:border-brand hover:text-ink"
      >
        <CalendarClock className="size-4" aria-hidden />
        Expecting money from someone? Note it here
      </button>
    )
  }

  const total = claims.reduce((sum, c) => sum + toNumber(c.owed_amount), 0)

  return (
    <Card className="flex flex-col gap-3.5 p-[clamp(20px,3vw,26px)]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
          <HandCoins className="size-4 text-gold-ink" aria-hidden />
          Owed to you
        </h2>
        <div className="flex items-center gap-3">
          {!expecting && (
            <button
              type="button"
              onClick={() => setExpecting(true)}
              aria-label="Add an expected payment"
              className="flex items-center gap-1 text-[12.5px] font-semibold text-sub transition hover:text-ink"
            >
              <Plus className="size-3.5" aria-hidden />
              Expecting
            </button>
          )}
          <span className="tabular text-[15px] font-bold text-gold-ink">
            {formatMoney(total)}
          </span>
        </div>
      </div>

      {expecting && <ExpectingForm onDone={() => setExpecting(false)} />}

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {claims.map((claim) => (
          <li key={claim.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13.5px] font-semibold">
                  {claim.owed_by}
                </p>
                {claim.status === 'pending' ? (
                  <p
                    className={
                      'm-0 truncate text-[12px] ' +
                      (new Date(claim.occurred_at) < new Date()
                        ? 'font-semibold text-neg'
                        : 'text-sub')
                    }
                  >
                    {claim.note ? `${claim.note} · ` : ''}
                    {new Date(claim.occurred_at) < new Date() ? 'overdue — was due ' : 'due '}
                    {new Date(claim.occurred_at).toLocaleDateString('en-PK', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                ) : (
                  <p className="m-0 truncate text-[12px] text-sub">
                    for {claimLabel(claim)} ·{' '}
                    {new Date(claim.occurred_at).toLocaleDateString('en-PK', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                )}
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
