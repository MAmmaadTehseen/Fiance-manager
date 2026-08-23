import { useState, type FormEvent } from 'react'
import { Target, Trash2 } from 'lucide-react'
import { differenceInCalendarMonths, format, parseISO } from 'date-fns'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import {
  useCreateSavingsGoal,
  useDeleteSavingsGoal,
  useSavingsGoals,
  useUpdateSavingsGoal,
  formatMoney,
  parseAmount,
  toNumber,
  type SavingsGoal,
} from '@batwa/core'

function GoalCard({ goal }: { goal: SavingsGoal }) {
  const update = useUpdateSavingsGoal()
  const remove = useDeleteSavingsGoal()
  const [contribution, setContribution] = useState('')

  const saved = toNumber(goal.saved_amount)
  const target = toNumber(goal.target_amount)
  const ratio = target > 0 ? saved / target : 0
  const done = ratio >= 1
  const remaining = Math.max(0, target - saved)

  const monthsLeft = goal.target_date
    ? Math.max(1, differenceInCalendarMonths(parseISO(goal.target_date), new Date()))
    : null
  const perMonth = monthsLeft ? remaining / monthsLeft : null

  async function addMoney(e: FormEvent) {
    e.preventDefault()
    const delta = parseAmount(contribution)
    if (!delta) return
    await update.mutateAsync({ id: goal.id, saved_amount: saved + delta })
    setContribution('')
  }

  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[16px] font-bold">{goal.name}</h2>
          {goal.target_date && (
            <p className="mb-0 mt-0.5 text-[12.5px] text-sub">
              by {format(parseISO(goal.target_date), 'MMM yyyy')}
              {perMonth != null && !done
                ? ` · ${formatMoney(perMonth)}/mo to get there`
                : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label="Delete goal"
          onClick={() => remove.mutate(goal.id)}
          className="shrink-0 text-sub hover:text-neg"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="tabular font-display text-[22px] font-bold">
            {formatMoney(saved)}
          </span>
          <span className="text-[13px] text-sub">of {formatMoney(target)}</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-soft">
          <div
            className={done ? 'h-full rounded-full bg-brand' : 'h-full rounded-full bg-gold'}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <p className="mb-0 mt-1.5 text-xs text-sub">
          {done
            ? '🎉 Goal reached'
            : `${formatMoney(remaining)} to go · ${Math.round(ratio * 100)}%`}
        </p>
      </div>

      {!done && (
        <form className="flex gap-2" onSubmit={addMoney}>
          <input
            inputMode="decimal"
            placeholder="Add money…"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
            className="tabular h-10 flex-1 rounded-lg border border-line bg-card px-3 text-[14px]"
          />
          <button
            type="submit"
            disabled={update.isPending}
            className="h-10 rounded-lg bg-brand px-4 text-[13.5px] font-bold text-brand-on transition hover:brightness-110 disabled:opacity-60"
          >
            Add
          </button>
        </form>
      )}
    </Card>
  )
}

export function GoalsPage() {
  const { data: goals = [], isLoading } = useSavingsGoals()
  const create = useCreateSavingsGoal()

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function addGoal(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = parseAmount(target)
    if (!name.trim()) return setError('Give the goal a name.')
    if (!amount) return setError('Enter a target amount.')
    try {
      await create.mutateAsync({
        name,
        target_amount: amount,
        target_date: date || null,
      })
      setName('')
      setTarget('')
      setDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Goals"
        subtitle="Save toward the things that matter, and see how the pace adds up."
      />

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-[15px] font-bold">New goal</h2>
        {error && <p className="m-0 text-sm text-neg">{error}</p>}
        <form className="flex flex-wrap items-end gap-3" onSubmit={addGoal}>
          <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <label className="text-xs font-semibold text-sub">Name</label>
            <input
              placeholder="e.g. Umrah fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-lg border border-line bg-card px-3 text-[15px]"
            />
          </div>
          <div className="flex w-[140px] flex-col gap-1.5">
            <label className="text-xs font-semibold text-sub">Target</label>
            <input
              inputMode="decimal"
              placeholder="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="tabular h-11 rounded-lg border border-line bg-card px-3 text-[15px]"
            />
          </div>
          <div className="flex w-[160px] flex-col gap-1.5">
            <label className="text-xs font-semibold text-sub">By (optional)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 rounded-lg border border-line bg-card px-3 text-[15px]"
            />
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="h-11 rounded-xl bg-brand px-5 text-sm font-bold text-brand-on transition hover:brightness-110 disabled:opacity-60"
          >
            {create.isPending ? 'Saving…' : 'Create'}
          </button>
        </form>
      </Card>

      {!isLoading && goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Create one above — a target amount, and a date if you have one — then top it up as you save."
          />
        </Card>
      ) : (
        <div className="grid gap-[clamp(14px,2vw,20px)] grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  )
}
