import { useState, type FormEvent } from 'react'
import { Plus, Wallet, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, parseAmount } from '@/lib/money'
import {
  useAccountBalances,
  useCreateAccount,
  type NewAccount,
} from '@/hooks/useAccounts'
import type { AccountType } from '@/types/db'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank account' },
  { value: 'wallet', label: 'Mobile wallet' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'savings', label: 'Savings' },
]

function AddAccountForm({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount()
  const [form, setForm] = useState<NewAccount>({ name: '', type: 'bank' })
  const [openingBalance, setOpeningBalance] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) return setError('Give the account a name.')

    try {
      await create.mutateAsync({
        ...form,
        name: form.name.trim(),
        opening_balance: parseAmount(openingBalance) ?? 0,
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
          <h2 className="text-base font-semibold">Add account</h2>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoFocus
              placeholder="e.g. Meezan current"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as AccountType })
              }
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
            <Label htmlFor="last4">Last digits</Label>
            <Input
              id="last4"
              inputMode="numeric"
              placeholder="e.g. 4821"
              maxLength={6}
              value={form.last4 ?? ''}
              onChange={(e) => setForm({ ...form, last4: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              How bank SMS will find this account automatically. Optional now,
              needed for SMS capture later.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="opening">Current balance</Label>
            <Input
              id="opening"
              inputMode="decimal"
              placeholder="0"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="tabular"
            />
            <p className="text-xs text-muted-foreground">
              What&rsquo;s in it right now. Everything is counted from here.
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={create.isPending}
          >
            {create.isPending ? 'Saving…' : 'Add account'}
          </Button>
        </form>
      </div>
    </div>
  )
}

export function AccountsPage() {
  const [adding, setAdding] = useState(false)
  const { data: accounts = [], isLoading } = useAccountBalances()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Accounts"
        subtitle="Every place your money sits."
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add
          </Button>
        }
      />

      {!isLoading && accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add the bank accounts and wallets you actually use, so transactions have somewhere to land."
          action={<Button onClick={() => setAdding(true)}>Add an account</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-2 px-4 md:px-0">
          {accounts.map((a) => (
            <li key={a.account_id}>
              <Card className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {a.type.replace('_', ' ')}
                  </p>
                </div>
                <p className="tabular shrink-0 font-semibold">
                  {formatMoney(a.balance, { currency: a.currency })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddAccountForm onClose={() => setAdding(false)} />}
    </div>
  )
}
