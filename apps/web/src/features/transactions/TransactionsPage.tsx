import { useState } from 'react'
import { Plus, ReceiptText } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useTransactions } from '@batwa/core'
import { useInboxCount } from '@batwa/core'
import type { TransactionType } from '@batwa/core'
import { TransactionList } from './TransactionList'
import { TransactionForm } from './TransactionForm'

type Filter = 'all' | TransactionType | 'uncategorised'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
]

export function TransactionsPage() {
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const { data: needsReview = 0 } = useInboxCount()

  const { data: transactions = [], isLoading } = useTransactions({
    limit: 200,
    ...(filter === 'uncategorised'
      ? { status: 'needs_review' as const }
      : filter === 'all'
        ? {}
        : { type: filter }),
  })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Activity"
        subtitle="Every rupee, in and out."
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[42px] items-center gap-2 rounded-xl bg-brand px-[18px] text-sm font-bold text-brand-on transition hover:brightness-110"
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full px-3.5 py-2 text-[13px] transition-colors',
              filter === f.id
                ? 'bg-brand font-bold text-brand-on'
                : 'border border-line bg-card font-semibold text-sub hover:text-ink',
            )}
          >
            {f.label}
          </button>
        ))}

        {needsReview > 0 && (
          <button
            type="button"
            aria-pressed={filter === 'uncategorised'}
            onClick={() => setFilter('uncategorised')}
            className={cn(
              'rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors',
              filter === 'uncategorised'
                ? 'bg-brand font-bold text-brand-on'
                : 'border border-line bg-card text-gold-ink',
            )}
          >
            Uncategorised · {needsReview}
          </button>
        )}
      </div>

      {!isLoading && transactions.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={
              filter === 'all' ? 'No transactions yet' : 'Nothing in this filter'
            }
            description={
              filter === 'all'
                ? 'Record one by hand to get started. Once your phone is connected, most of these appear on their own.'
                : 'Try another filter, or clear it to see everything.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <TransactionList transactions={transactions} loading={isLoading} />
        </Card>
      )}

      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  )
}
