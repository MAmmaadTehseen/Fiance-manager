import { useMemo, useState, type FormEvent } from 'react'
import { PieChart, Repeat } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  useBudgets,
  useCategories,
  useDeleteBudget,
  useRecurring,
  useTransactions,
  useUpsertBudget,
  formatMoney,
  parseAmount,
  toNumber,
} from '@batwa/core'

/** Colour the bar by how close spending is to the limit. */
function tone(ratio: number): { bar: string; text: string } {
  if (ratio > 1) return { bar: 'bg-neg', text: 'text-neg' }
  if (ratio >= 0.8) return { bar: 'bg-gold', text: 'text-gold-ink' }
  return { bar: 'bg-brand', text: 'text-sub' }
}

function BudgetRow({
  name,
  spent,
  amount,
  currency,
  onRemove,
}: {
  name: string
  spent: number
  amount: number
  currency: string
  onRemove: () => void
}) {
  const ratio = amount > 0 ? spent / amount : 0
  const { bar, text } = tone(ratio)
  const remaining = amount - spent

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] font-semibold">{name}</span>
        <span className={cn('tabular text-[13px] font-semibold', text)}>
          {formatMoney(spent, { currency })} / {formatMoney(amount, { currency })}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-soft">
        <div
          className={cn('h-full rounded-full transition-[width]', bar)}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-sub">
          {remaining >= 0
            ? `${formatMoney(remaining, { currency })} left`
            : `${formatMoney(-remaining, { currency })} over`}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-sub hover:text-neg"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

export function BudgetsPage() {
  const { data: budgets = [], isLoading } = useBudgets()
  const { data: categories = [] } = useCategories('expense')
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()
  const recurring = useRecurring()

  const monthStart = useMemo(() => startOfMonth(new Date()).toISOString(), [])
  const { data: monthTx = [] } = useTransactions({
    from: monthStart,
    type: 'expense',
    limit: 2000,
  })

  const spentByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of monthTx) {
      if (!t.category?.id) continue
      m.set(t.category.id, (m.get(t.category.id) ?? 0) + toNumber(t.amount))
    }
    return m
  }, [monthTx])

  const [newCategory, setNewCategory] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const available = categories.filter((c) => !budgetedIds.has(c.id))

  const totalBudget = budgets.reduce((s, b) => s + toNumber(b.amount), 0)
  const totalSpent = budgets.reduce(
    (s, b) => s + (spentByCategory.get(b.category_id) ?? 0),
    0,
  )

  async function addBudget(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = parseAmount(newAmount)
    if (!newCategory) return setError('Pick a category.')
    if (!amount) return setError('Enter a monthly limit.')
    try {
      await upsert.mutateAsync({ categoryId: newCategory, amount })
      setNewCategory('')
      setNewAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Budgets"
        subtitle={
          budgets.length > 0
            ? `${formatMoney(totalSpent)} of ${formatMoney(totalBudget)} spent this month.`
            : 'Set a monthly limit per category and watch it as you spend.'
        }
      />

      {/* set a budget */}
      {available.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="m-0 text-[15px] font-bold">Set a budget</h2>
          {error && <p className="m-0 text-sm text-neg">{error}</p>}
          <form className="flex flex-wrap items-end gap-3" onSubmit={addBudget}>
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <label className="text-xs font-semibold text-sub">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="h-11 rounded-lg border border-line bg-card px-3 text-[15px]"
              >
                <option value="">Choose…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-[140px] flex-col gap-1.5">
              <label className="text-xs font-semibold text-sub">
                Monthly limit
              </label>
              <input
                inputMode="decimal"
                placeholder="0"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="tabular h-11 rounded-lg border border-line bg-card px-3 text-[15px]"
              />
            </div>
            <button
              type="submit"
              disabled={upsert.isPending}
              className="h-11 rounded-xl bg-brand px-5 text-sm font-bold text-brand-on transition hover:brightness-110 disabled:opacity-60"
            >
              {upsert.isPending ? 'Saving…' : 'Add'}
            </button>
          </form>
        </Card>
      )}

      {/* budgets list */}
      {!isLoading && budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={PieChart}
            title="No budgets yet"
            description="Add a monthly limit for a category above — groceries, eating out, transport — and this fills with progress bars."
          />
        </Card>
      ) : (
        budgets.length > 0 && (
          <Card className="flex flex-col gap-5 p-5">
            {budgets.map((b) => (
              <BudgetRow
                key={b.id}
                name={b.category?.name ?? 'Category'}
                spent={spentByCategory.get(b.category_id) ?? 0}
                amount={toNumber(b.amount)}
                currency="PKR"
                onRemove={() => remove.mutate(b.id)}
              />
            ))}
          </Card>
        )
      )}

      {/* recurring charges */}
      <Card className="flex flex-col gap-3.5 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="m-0 flex items-center gap-2 text-[15px] font-bold">
            <Repeat className="size-4 text-gold-ink" aria-hidden />
            Recurring charges
          </h2>
          {recurring.items.length > 0 && (
            <span className="text-[13px] text-sub">
              ~{formatMoney(recurring.monthlyTotal)}/mo
            </span>
          )}
        </div>

        {recurring.items.length === 0 ? (
          <p className="m-0 text-sm text-sub">
            Nothing detected yet. Once a charge from the same place shows up across
            a couple of months, it appears here as a likely subscription or bill.
          </p>
        ) : (
          <div className="flex flex-col">
            {recurring.items.map((r) => (
              <div
                key={r.key}
                className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {r.name}
                  </span>
                  <span className="block text-xs text-sub">
                    {r.categoryName ? `${r.categoryName} · ` : ''}
                    {r.occurrences} charges over {r.months} months
                  </span>
                </span>
                <span className="tabular shrink-0 text-[14px] font-bold">
                  {formatMoney(r.amount, { currency: r.currency })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
