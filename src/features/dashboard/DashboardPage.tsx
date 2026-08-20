import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react'
import { startOfMonth } from 'date-fns'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { useAccountBalances } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { formatMoney, toNumber } from '@/lib/money'
import { TransactionList } from '@/features/transactions/TransactionList'

export function DashboardPage() {
  const { data: accounts = [], isLoading: loadingAccounts } =
    useAccountBalances()

  const monthStart = useMemo(() => startOfMonth(new Date()).toISOString(), [])
  const { data: monthTx = [] } = useTransactions({ from: monthStart, limit: 500 })
  const { data: recent = [], isLoading: loadingRecent } = useTransactions({
    limit: 8,
  })

  const netWorth = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0)

  // Transfers move money between the user's own accounts, so they are neither
  // income nor spending and must not inflate either total.
  const { income, spending } = useMemo(() => {
    let income = 0
    let spending = 0
    for (const t of monthTx) {
      if (t.type === 'income') income += toNumber(t.amount)
      else if (t.type === 'expense') spending += toNumber(t.amount)
    }
    return { income, spending }
  }, [monthTx])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" subtitle="Where your money stands today." />

      <section className="px-4 md:px-0">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Total balance</p>
          <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
            {loadingAccounts ? '—' : formatMoney(netWorth)}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDownLeft className="size-3.5 text-money-in" aria-hidden />
                In this month
              </p>
              <p className="tabular mt-1 font-medium text-money-in">
                {formatMoney(income)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="size-3.5 text-money-out" aria-hidden />
                Out this month
              </p>
              <p className="tabular mt-1 font-medium text-money-out">
                {formatMoney(spending)}
              </p>
            </div>
          </div>
        </Card>
      </section>

      {accounts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-4 md:px-0">
            <h2 className="text-sm font-medium text-muted-foreground">
              Accounts
            </h2>
            <Link
              to="/accounts"
              className="text-sm font-medium text-primary hover:underline"
            >
              Manage
            </Link>
          </div>

          {/* Horizontal scroll keeps many accounts reachable with a thumb. */}
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 md:px-0">
            {accounts.map((a) => (
              <Card key={a.account_id} className="min-w-[10.5rem] shrink-0 p-4">
                <p className="truncate text-sm text-muted-foreground">
                  {a.name}
                </p>
                <p className="tabular mt-1 text-lg font-semibold">
                  {formatMoney(a.balance, { currency: a.currency })}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-4 md:px-0">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent activity
          </h2>
          <Link
            to="/transactions"
            className="text-sm font-medium text-primary hover:underline"
          >
            See all
          </Link>
        </div>

        {!loadingRecent && recent.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Nothing recorded yet"
            description="Add your first transaction, or connect bank SMS capture so it happens on its own."
            action={
              <Link to="/transactions" className={buttonVariants()}>
                Add a transaction
              </Link>
            }
          />
        ) : (
          <TransactionList transactions={recent} loading={loadingRecent} />
        )}
      </section>
    </div>
  )
}
