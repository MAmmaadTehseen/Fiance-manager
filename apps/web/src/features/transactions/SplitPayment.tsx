import { useMemo, useState } from 'react'
import { Plus, Scissors, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  formatMoney,
  parseAmount,
  toNumber,
  useCategories,
  useSplitTransaction,
  type TransactionRow,
} from '@batwa/core'

type Row = { amount: string; categoryId: string }

/**
 * Breaks one payment into the several things it actually paid for — 23,000 for
 * a flat being rent, deposit and stamp duty.
 *
 * The remainder is shown continuously rather than validated at the end,
 * because the arithmetic is the whole task: someone typing parts of a number
 * they already know wants to see what is left, not to be told afterwards that
 * it did not add up.
 */
export function SplitPayment({
  transaction,
  onDone,
}: {
  transaction: TransactionRow
  onDone: () => void
}) {
  const total = toNumber(transaction.amount)
  const split = useSplitTransaction()
  const { data: categories = [] } = useCategories(
    transaction.type === 'income' ? 'income' : 'expense',
  )

  const [rows, setRows] = useState<Row[]>([
    { amount: '', categoryId: transaction.category_id ?? '' },
    { amount: '', categoryId: '' },
  ])

  const amounts = useMemo(
    () => rows.map((r) => parseAmount(r.amount) ?? 0),
    [rows],
  )
  const assigned = amounts.reduce((a, b) => a + b, 0)
  const remaining = Math.round((total - assigned) * 100) / 100
  const balanced = remaining === 0 && amounts.every((a) => a > 0)

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  /** Fills the row with whatever is still unassigned — the usual last step. */
  function takeRemainder(index: number) {
    const others = amounts.reduce((sum, a, i) => (i === index ? sum : sum + a), 0)
    update(index, { amount: String(Math.round((total - others) * 100) / 100) })
  }

  async function save() {
    if (!balanced) return
    await split.mutateAsync({
      transactionId: transaction.id,
      parts: rows.map((row, i) => ({
        amount: amounts[i]!,
        categoryId: row.categoryId || null,
      })),
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Scissors className="size-4 text-muted-foreground" aria-hidden />
        <Label className="m-0">Split {formatMoney(total)}</Label>
      </div>

      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              placeholder="0"
              aria-label={`Part ${i + 1} amount`}
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              className="tabular h-10 flex-1"
            />
            <button
              type="button"
              onClick={() => takeRemainder(i)}
              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              rest
            </button>
            {rows.length > 2 && (
              <button
                type="button"
                aria-label={`Remove part ${i + 1}`}
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 rounded-lg p-1 text-muted-foreground transition hover:text-destructive"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={row.categoryId === c.id}
                onClick={() =>
                  update(i, { categoryId: row.categoryId === c.id ? '' : c.id })
                }
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  row.categoryId === c.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((p) => [...p, { amount: '', categoryId: '' }])}
        className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
      >
        <Plus className="size-3.5" aria-hidden />
        Another part
      </button>

      <p
        className={cn(
          'm-0 text-sm',
          remaining === 0 ? 'text-muted-foreground' : 'text-destructive',
        )}
      >
        {remaining === 0
          ? 'Adds up.'
          : remaining > 0
            ? `${formatMoney(remaining)} still to assign`
            : `${formatMoney(Math.abs(remaining))} over`}
      </p>

      {split.isError && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {split.error instanceof Error ? split.error.message : 'Could not split'}
        </p>
      )}

      <Button
        type="button"
        disabled={!balanced || split.isPending}
        onClick={() => void save()}
      >
        {split.isPending ? 'Splitting…' : `Split into ${rows.length}`}
      </Button>
    </div>
  )
}
