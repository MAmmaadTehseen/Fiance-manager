import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { parseAmount } from '@batwa/core'
import { useAccounts } from '@batwa/core'
import { useCategories } from '@batwa/core'
import { useCreateTransaction } from '@batwa/core'
import type { TransactionType } from '@batwa/core'

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Spent' },
  { value: 'income', label: 'Received' },
  { value: 'transfer', label: 'Moved' },
]

/** `datetime-local` needs a local-time string, not an ISO/UTC one. */
function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TransactionForm({ onClose }: { onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const [type, setType] = useState<TransactionType>('expense')
  const { data: categories = [] } = useCategories(
    type === 'income' ? 'income' : 'expense',
  )
  const create = useCreateTransaction()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [occurredAt, setOccurredAt] = useState(() =>
    localDateTimeValue(new Date()),
  )
  const [error, setError] = useState<string | null>(null)

  // Default to the primary account once accounts load.
  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(accounts.find((a) => a.is_primary)?.id ?? accounts[0]!.id)
    }
  }, [accounts, accountId])

  // Category lists differ per type, so a stale selection must not survive.
  useEffect(() => setCategoryId(''), [type])

  const parsedAmount = useMemo(() => parseAmount(amount), [amount])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!parsedAmount) return setError('Enter an amount.')
    if (!accountId) return setError('Pick an account.')
    if (type === 'transfer') {
      if (!toAccountId) return setError('Pick where the money went.')
      if (toAccountId === accountId)
        return setError('Choose two different accounts.')
    }

    try {
      await create.mutateAsync({
        account_id: accountId,
        type,
        amount: parsedAmount,
        occurred_at: new Date(occurredAt).toISOString(),
        category_id: type === 'transfer' ? null : categoryId || null,
        counterparty_account_id: type === 'transfer' ? toAccountId : null,
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:items-center md:justify-center md:bg-black/40 md:p-6">
      <div className="flex min-h-0 flex-1 flex-col md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-border md:bg-background">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">New transaction</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          <div
            role="radiogroup"
            aria-label="Transaction type"
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
          >
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'rounded-md py-2 text-sm font-medium transition-colors',
                  type === t.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              inputMode="decimal"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular h-14 text-2xl font-semibold"
            />
            <p className="text-xs text-muted-foreground">
              Shorthand works — &ldquo;20k&rdquo; means 20,000.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account">
              {type === 'transfer' ? 'From' : 'Account'}
            </Label>
            <select
              id="account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-base"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {type === 'transfer' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to-account">To</Label>
              <select
                id="to-account"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                className="h-11 rounded-lg border border-input bg-card px-3 text-base"
              >
                <option value="">Choose an account…</option>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={categoryId === c.id}
                    onClick={() =>
                      setCategoryId((prev) => (prev === c.id ? '' : c.id))
                    }
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      categoryId === c.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="when">When</Label>
            <Input
              id="when"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              placeholder="Optional"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={create.isPending}
          >
            {create.isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </div>
    </div>
  )
}
