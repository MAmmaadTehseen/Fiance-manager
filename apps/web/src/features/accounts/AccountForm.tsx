import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  parseAmount,
  toNumber,
  useCreateAccount,
  useRemoveAccount,
  useUpdateAccount,
  type Account,
  type AccountType,
} from '@batwa/core'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'wallet', label: 'Mobile wallet' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'savings', label: 'Savings' },
]

/**
 * Add an account, or correct one.
 *
 * The same form does both, because the fields are the same facts either way
 * and a separate read-only "details" screen would just be somewhere to click
 * through on the way to fixing a typo. Accounts used to be create-only, which
 * made a mistyped `last4` permanent — and a wrong one quietly sends every
 * future bank message to the review Inbox instead of this account.
 */
export function AccountForm({
  account,
  onClose,
}: {
  account?: Account
  onClose: () => void
}) {
  const editing = account != null
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const remove = useRemoveAccount()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [last4, setLast4] = useState(account?.last4 ?? '')
  const [institution, setInstitution] = useState(account?.institution ?? '')
  const [balance, setBalance] = useState(
    account ? String(toNumber(account.opening_balance)) : '',
  )
  const [isPrimary, setIsPrimary] = useState(account?.is_primary ?? false)
  const [senders, setSenders] = useState<string[]>(account?.sms_senders ?? [])
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const pending = create.isPending || update.isPending || remove.isPending

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the account a name.')

    try {
      if (editing) {
        await update.mutateAsync({
          id: account.id,
          name,
          type,
          last4,
          institution,
          opening_balance: parseAmount(balance) ?? 0,
          is_primary: isPrimary,
          sms_senders: senders,
        })
      } else {
        await create.mutateAsync({
          name: name.trim(),
          type,
          last4,
          institution,
          opening_balance: parseAmount(balance) ?? 0,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    }
  }

  async function onRemove() {
    setError(null)
    try {
      const result = await remove.mutateAsync(account!.id)
      // Archived, not deleted, is worth saying out loud — the account
      // disappears from every list either way, and the difference is whether
      // months of history went with it.
      if (result.deleted) onClose()
      else {
        setNote(
          `Hidden, not deleted — ${result.transactions} transaction${result.transactions === 1 ? '' : 's'} still reference it, and those stay in your ledger.`,
        )
        setConfirming(false)
        setTimeout(onClose, 2200)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove')
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background md:items-center md:justify-center md:bg-black/40 md:p-6">
      <div className="flex min-h-0 flex-1 flex-col md:max-h-[90vh] md:w-full md:max-w-md md:flex-none md:rounded-2xl md:border md:border-border md:bg-background">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">
            {editing ? 'Edit account' : 'Add account'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {note && (
            <p
              role="status"
              className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              {note}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoFocus
              placeholder="e.g. Meezan current"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="h-11 rounded-lg border border-input bg-card px-3 text-base"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank">Bank</Label>
            <Input
              id="bank"
              placeholder="e.g. Meezan Bank"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="last4">Last digits</Label>
            <Input
              id="last4"
              inputMode="numeric"
              placeholder="e.g. 4821"
              maxLength={6}
              value={last4}
              onChange={(e) => setLast4(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How bank messages find this account. Get it wrong and they land in
              the Inbox instead.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opening">
              {editing ? 'Starting balance' : 'Current balance'}
            </Label>
            <Input
              id="opening"
              inputMode="decimal"
              placeholder="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="tabular"
            />
            <p className="text-xs text-muted-foreground">
              {editing
                ? 'What it held before anything here was recorded. Every transaction counts from this.'
                : 'What’s in it right now. Everything is counted from here.'}
            </p>
          </div>

          {editing && (
            <>
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="size-4"
                />
                Main account
                <span className="text-xs text-muted-foreground">
                  (only one can be)
                </span>
              </label>

              {senders.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Senders mapped here</Label>
                  <div className="flex flex-wrap gap-2">
                    {senders.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setSenders((prev) => prev.filter((x) => x !== s))
                        }
                        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
                      >
                        {s}
                        <X className="size-3" aria-hidden />
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Messages from these are booked here whatever digits they
                    quote. Tap one to unlink it.
                  </p>
                </div>
              )}
            </>
          )}

          <Button type="submit" size="lg" className="mt-2" disabled={pending}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
          </Button>

          {editing &&
            (confirming ? (
              <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
                <p className="m-0 text-sm">
                  Remove {account.name}? If it has transactions it is hidden
                  rather than deleted, and they stay in your ledger.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => void onRemove()}
                  >
                    Remove
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                  >
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirming(true)}
              >
                Remove account
              </Button>
            ))}
        </form>
      </div>
    </div>
  )
}
