import { useState } from 'react'
import { Plus, ReceiptText } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useTransactions } from '@/hooks/useTransactions'
import { TransactionList } from './TransactionList'
import { TransactionForm } from './TransactionForm'

export function TransactionsPage() {
  const [adding, setAdding] = useState(false)
  const { data: transactions = [], isLoading } = useTransactions({ limit: 200 })

  return (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Activity"
        subtitle="Everything that moved."
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add
          </Button>
        }
      />

      {!isLoading && transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No transactions yet"
          description="Record one by hand to get started. Once SMS capture is connected, most of these will appear on their own."
          action={<Button onClick={() => setAdding(true)}>Add a transaction</Button>}
        />
      ) : (
        <div className="md:px-0">
          <TransactionList transactions={transactions} loading={isLoading} />
        </div>
      )}

      {adding && <TransactionForm onClose={() => setAdding(false)} />}
    </div>
  )
}
