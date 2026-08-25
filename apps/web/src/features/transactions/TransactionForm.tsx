import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { parseAmount, toNumber } from '@batwa/core'
import { useAccounts } from '@batwa/core'
import { useCategories } from '@batwa/core'
import {
  useCreateTransaction,
  useDeleteTransaction,
  useSetOwed,
  useUpdateTransaction,
} from '@batwa/core'
import type { TransactionRow, TransactionType } from '@batwa/core'
import { AddCategory } from '@/components/AddCategory'
import { SplitPayment } from './SplitPayment'

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

/**
 * The add sheet, and — given a `transaction` — the edit sheet.
 *
 * They are one component because the fields, the validation and the shape sent
 * to the server are identical; only the mutation at the end differs. Splitting
 * them would mean maintaining the same form twice.
 */
export function TransactionForm({
  transaction,
  onClose,
}: {
  transaction?: TransactionRow
  onClose: () => void
}) {
  const editing = transaction != null

  const { data: accounts = [] } = useAccounts()
  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? 'expense',
  )
  const { data: categories = [] } = useCategories(
    type === 'income' ? 'income' : 'expense',
  )
  const create = useCreateTransaction()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  const [amount, setAmount] = useState(
    transaction ? String(toNumber(transaction.amount)) : '',
  )
  const [accountId, setAccountId] = useState(transaction?.account_id ?? '')
  const [toAccountId, setToAccountId] = useState(
    transaction?.counterparty_account_id ?? '',
  )
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
  const [occurredAt, setOccurredAt] = useState(() =>
    localDateTimeValue(
      transaction ? new Date(transaction.occurred_at) : new Date(),
    ),
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const [claiming, setClaiming] = useState(transaction?.owed_amount != null)
  const [owedBy, setOwedBy] = useState(transaction?.owed_by ?? '')
  const [owedAmount, setOwedAmount] = useState(
    transaction?.owed_amount != null ? String(toNumber(transaction.owed_amount)) : '',
  )
  const setOwed = useSetOwed()

  // Default to the primary account once accounts load.
  useEffect(() => {
    if (!accountId && accounts.length) {
      setAccountId(accounts.find((a) => a.is_primary)?.id ?? accounts[0]!.id)
    }
  }, [accounts, accountId])

  /**
   * Switching type swaps the category list, so a selection from the old list
   * has to go. This lives in the handler rather than an effect keyed on `type`
   * because such an effect also fires on mount — which would wipe the category
   * of the transaction being edited before the user touched anything.
   */
  function changeType(next: TransactionType) {
    setType(next)
    setCategoryId('')
  }

  const parsedAmount = useMemo(() => parseAmount(amount), [amount])

  const pending = create.isPending || update.isPending || remove.isPending

  async function onDelete() {
    if (!transaction) return
    setError(null)
    try {
      await remove.mutateAsync(transaction.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    }
  }

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

    const fields = {
      account_id: accountId,
      type,
      amount: parsedAmount,
      occurred_at: new Date(occurredAt).toISOString(),
      category_id: type === 'transfer' ? null : categoryId || null,
      counterparty_account_id: type === 'transfer' ? toAccountId : null,
      note: note.trim() || null,
    }

    try {
      if (transaction) {
        // An edited row is no longer a guess, so clear the review flag that
        // sent it to the Inbox — the user has just told us what it is.
        await update.mutateAsync({
          id: transaction.id,
          ...fields,
          ...(transaction.status === 'needs_review'
            ? { status: 'cleared' as const }
            : {}),
        })
      } else {
        await create.mutateAsync(fields)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:items-center md:justify-center md:bg-black/40 md:p-6">
      <div className="flex min-h-0 flex-1 flex-col md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-border md:bg-background">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">
            {editing ? 'Edit transaction' : 'New transaction'}
          </h2>
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
                onClick={() => changeType(t.value)}
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

                <AddCategory
                  kind={type === 'income' ? 'income' : 'expense'}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
                  onCreated={(category) => setCategoryId(category.id)}
                />
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

          {editing && type !== 'transfer' && !splitting && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSplitting(true)}
              >
                Split this payment
              </Button>
              {!claiming && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setClaiming(true)}
                >
                  Someone owes part of this
                </Button>
              )}
            </div>
          )}

          {editing && splitting && transaction && (
            <SplitPayment transaction={transaction} onDone={onClose} />
          )}

          {editing && claiming && !splitting && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Label className="m-0">Owed back to you</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Who — e.g. Mohsin"
                  aria-label="Who owes you"
                  value={owedBy}
                  onChange={(e) => setOwedBy(e.target.value)}
                  className="h-10 flex-1"
                />
                <Input
                  inputMode="decimal"
                  placeholder="How much"
                  aria-label="Amount owed"
                  value={owedAmount}
                  onChange={(e) => setOwedAmount(e.target.value)}
                  className="tabular h-10 w-28"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={setOwed.isPending || !owedBy.trim() || !parseAmount(owedAmount)}
                  onClick={async () => {
                    try {
                      await setOwed.mutateAsync({
                        transactionId: transaction!.id,
                        owedBy,
                        owedAmount: parseAmount(owedAmount),
                      })
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not save that')
                    }
                  }}
                >
                  {setOwed.isPending
                    ? 'Saving…'
                    : transaction?.owed_amount != null
                      ? 'Update claim'
                      : 'Remember it'}
                </Button>
                {transaction?.owed_amount != null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await setOwed.mutateAsync({
                        transactionId: transaction!.id,
                        owedBy: null,
                        owedAmount: null,
                      })
                      setClaiming(false)
                      setOwedBy('')
                      setOwedAmount('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="m-0 text-xs text-muted-foreground">
                The spend stays on your books in full — this just remembers who
                owes you what, until their payment arrives.
              </p>
            </div>
          )}

          <Button type="submit" size="lg" className="mt-2" disabled={pending}>
            {create.isPending || update.isPending ? 'Saving…' : 'Save'}
          </Button>

          {editing &&
            (confirmingDelete ? (
              <div className="flex flex-col gap-2 rounded-lg bg-destructive/10 p-3">
                <p className="m-0 text-sm font-medium text-destructive">
                  Delete this transaction? Balances will be recalculated.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1"
                    disabled={pending}
                    onClick={() => void onDelete()}
                  >
                    {remove.isPending ? 'Deleting…' : 'Delete'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Keep
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            ))}
        </form>
      </div>
    </div>
  )
}
