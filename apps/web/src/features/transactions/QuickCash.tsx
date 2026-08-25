import { useMemo, useState } from 'react'
import { Banknote } from 'lucide-react'
import {
  formatMoney,
  parseAmount,
  useAccountBalances,
  useCategories,
  useCreateTransaction,
  useTransactions,
} from '@batwa/core'
import { cn } from '@/lib/utils'

/** Recent cash spends are the best guide to what the next one will be. */
const RECENT_WINDOW = 60

/**
 * Logging a cash spend in two taps.
 *
 * Cash tracking does not fail because people are unwilling — it fails because
 * a 210 to the cigarette shop is not worth opening a form, choosing an
 * account, picking a date and saving. Ten of those a week and the cash account
 * drifts until it means nothing.
 *
 * So: type the amount, tap a category, done. Everything else is inferred —
 * the Cash account, right now, cleared. The categories offered are the ones
 * this person actually spends cash on, most recent first, because the tail of
 * the seeded list is noise at this size.
 *
 * Hidden entirely when there is no cash on hand: a bar that cannot describe
 * anything real is just clutter on the page.
 */
export function QuickCash() {
  const { data: accounts = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories('expense')
  const { data: recent = [] } = useTransactions({
    type: 'expense',
    limit: RECENT_WINDOW,
  })
  const create = useCreateTransaction()

  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const cash = accounts.find((a) => a.type === 'cash')

  // The categories this person genuinely puts cash to, in the order they last
  // used them — with seeded ones filling any gap so a new user still has
  // something to tap.
  const suggested = useMemo(() => {
    const seen: string[] = []
    for (const t of recent) {
      if (t.account?.type !== 'cash') continue
      if (t.category_id && !seen.includes(t.category_id)) seen.push(t.category_id)
      if (seen.length >= 5) break
    }
    const byId = new Map(categories.map((c) => [c.id, c]))
    const ordered = seen.map((id) => byId.get(id)).filter((c) => c != null)
    for (const c of categories) {
      if (ordered.length >= 5) break
      if (!ordered.some((o) => o.id === c.id)) ordered.push(c)
    }
    return ordered
  }, [recent, categories])

  const parsed = parseAmount(amount)

  if (!cash) return null

  async function log(categoryId: string, categoryName: string) {
    if (!parsed || !cash) return
    setBusy(categoryId)
    setFlash(null)
    try {
      await create.mutateAsync({
        account_id: cash.account_id,
        type: 'expense',
        amount: parsed,
        occurred_at: new Date().toISOString(),
        category_id: categoryId,
      })
      setFlash(`${formatMoney(parsed)} on ${categoryName.toLowerCase()}`)
      setAmount('')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3.5">
      <div className="flex items-center gap-2.5">
        <Banknote className="size-4 shrink-0 text-gold-ink" aria-hidden />
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value)
            setFlash(null)
          }}
          placeholder="Spent cash? Amount…"
          aria-label="Cash amount"
          className="tabular h-9 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-sub"
        />
        <span className="shrink-0 text-[12px] text-sub">
          {formatMoney(cash.balance)} on hand
        </span>
      </div>

      {parsed != null && (
        <div className="flex flex-wrap gap-2">
          {suggested.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy != null}
              onClick={() => void log(c.id, c.name)}
              className={cn(
                'rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors',
                'hover:border-brand hover:bg-brand hover:text-brand-on disabled:opacity-50',
                busy === c.id && 'bg-brand text-brand-on',
              )}
            >
              {busy === c.id ? 'Saving…' : c.name}
            </button>
          ))}
        </div>
      )}

      {flash && (
        <p className="m-0 text-[12.5px] text-pos" role="status">
          Logged {flash}.
        </p>
      )}
    </div>
  )
}
