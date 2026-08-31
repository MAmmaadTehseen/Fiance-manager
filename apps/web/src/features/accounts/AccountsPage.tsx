import { useState } from 'react'
import { Plus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatMoney, toNumber, useAccountBalances, useAccounts } from '@batwa/core'
import { cn } from '@/lib/utils'
import { AccountForm } from './AccountForm'

export function AccountsPage() {
  // `editing` holds an account id rather than the row, so the open form always
  // reflects the latest fetch instead of a snapshot taken when it was opened.
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const { data: accounts = [], isLoading } = useAccountBalances()
  const { data: full = [] } = useAccounts()
  const editingAccount = full.find((a) => a.id === editing)

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
              <button
                key={a.account_id}
                type="button"
                onClick={() => setEditing(a.account_id)}
                aria-label={`Edit ${a.name}`}
                className={cn(
                  'flex flex-col gap-6 rounded-[22px] p-6 text-left shadow-card transition hover:brightness-[0.98]',
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
              </button>
            )
          })}
        </div>
      )}

      {adding && <AccountForm onClose={() => setAdding(false)} />}
      {editingAccount && (
        <AccountForm
          account={editingAccount}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
