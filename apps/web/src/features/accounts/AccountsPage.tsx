import { useState, type FormEvent } from 'react'
import { Plus, Wallet, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, parseAmount, toNumber } from '@batwa/core'
import { cn } from '@/lib/utils'
import {
  useAccountBalances,
  useCreateAccount,
  type NewAccount,
} from '@batwa/core'
import type { AccountType } from '@batwa/core'

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

  const total = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Accounts"
        subtitle={
          accounts.length > 0
            ? `${formatMoney(total)} across ${accounts.length} ${accounts.length === 1 ? 'place' : 'places'}.`
            : 'Every place your money sits.'
        }
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[42px] items-center gap-2 rounded-xl bg-brand px-4.5 text-sm font-bold text-brand-on transition hover:brightness-110"
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        }
      />

      {!isLoading && accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add the bank accounts and wallets you actually use, so transactions have somewhere to land."
            action={
              <Button onClick={() => setAdding(true)}>Add an account</Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-[clamp(14px,2vw,20px)] grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]">
          {accounts.map((a, i) => {
            /* The first (largest) account gets the brand fill, so the eye
               lands on where most of the money is. */
            const featured = i === 0
            return (
              <div
                key={a.account_id}
                className={cn(
                  'flex flex-col gap-6 rounded-[22px] p-6 shadow-card',
                  featured
                    ? 'bg-brand text-brand-on'
                    : 'border border-line bg-card',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-[13px] font-display font-extrabold',
                      featured ? 'bg-[oklch(1_0_0/0.14)]' : 'bg-soft text-sub',
                    )}
                  >
                    {a.type === 'cash' ? '₨' : a.name.trim()[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[15px] font-bold">{a.name}</p>
                    <p
                      className={cn(
                        'mb-0 mt-px text-[12.5px] capitalize',
                        featured ? 'opacity-70' : 'text-sub',
                      )}
                    >
                      {a.type.replace('_', ' ')}
                      {a.last4 ? ` · **${a.last4}` : ''}
                    </p>
                  </div>
                  {a.last4 && (
                    <span className="ml-auto shrink-0 rounded-full bg-gold px-2.5 py-[3px] text-[11px] font-bold text-gold-on">
                      SMS
                    </span>
                  )}
                </div>

                <div>
                  <p
                    className={cn(
                      'm-0 text-[12.5px]',
                      featured ? 'opacity-70' : 'text-sub',
                    )}
                  >
                    Balance
                  </p>
                  <p className="tabular mb-0 mt-[3px] font-display text-[28px] font-bold">
                    {formatMoney(a.balance, { currency: a.currency })}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {adding && <AddAccountForm onClose={() => setAdding(false)} />}
    </div>
  )
}
