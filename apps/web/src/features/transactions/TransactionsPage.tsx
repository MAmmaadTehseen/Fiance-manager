import { useMemo, useState } from 'react'
import { Plus, ReceiptText, Search, SlidersHorizontal, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Chip } from '@/components/Chip'
import { Card } from '@/components/ui/card'
import { useDebounced } from '@/lib/useDebounced'
import {
  formatMoney,
  resolveRange,
  useCategories,
  useInboxCount,
  useTransactions,
  type RangePreset,
  type TransactionRow,
  type TransactionType,
} from '@batwa/core'
import { TransactionList } from './TransactionList'
import { TransactionForm } from './TransactionForm'

type Filter = 'all' | TransactionType | 'uncategorised'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
]

const RANGES: { id: RangePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_3m', label: '3 months' },
  { id: 'last_12m', label: '12 months' },
]

export function TransactionsPage() {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [range, setRange] = useState<RangePreset>('all')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')

  const debouncedSearch = useDebounced(search)
  const { data: needsReview = 0 } = useInboxCount()
  const { data: categories = [] } = useCategories()

  const bounds = useMemo(() => resolveRange(range), [range])

  const { data: transactions = [], isLoading } = useTransactions({
    limit: 200,
    from: bounds.from,
    to: bounds.to,
    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(filter === 'uncategorised'
      ? { status: 'needs_review' as const }
      : filter === 'all'
        ? {}
        : { type: filter }),
  })

  // Only expenses and income net out to something meaningful; a transfer moves
  // money without changing the total, so it is left out of the tally.
  const tally = useMemo(() => {
    let income = 0
    let expense = 0
    for (const t of transactions) {
      const amount = Number(t.amount)
      if (t.type === 'income') income += amount
      else if (t.type === 'expense') expense += amount
    }
    return { income, expense, net: income - expense }
  }, [transactions])

  const narrowed =
    range !== 'all' || categoryId !== null || debouncedSearch.trim() !== ''

  function clearFilters() {
    setRange('all')
    setCategoryId(null)
    setSearch('')
  }

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

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-sub"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant, note, amount…"
              aria-label="Search transactions"
              className="h-[42px] w-full rounded-xl border border-line bg-card pl-10 pr-9 text-sm text-ink outline-none transition placeholder:text-sub focus:border-brand"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-sub transition hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label="Filters"
            className="flex h-[42px] shrink-0 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-sm font-semibold text-sub transition hover:text-ink"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              selected={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Chip>
          ))}

          {needsReview > 0 && (
            <Chip
              tone="gold"
              selected={filter === 'uncategorised'}
              onClick={() => setFilter('uncategorised')}
            >
              Uncategorised · {needsReview}
            </Chip>
          )}
        </div>

        {showFilters && (
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-sub">Period</span>
              <div className="flex flex-wrap gap-2">
                {RANGES.map((r) => (
                  <Chip
                    key={r.id}
                    selected={range === r.id}
                    onClick={() => setRange(r.id)}
                  >
                    {r.label}
                  </Chip>
                ))}
              </div>
            </div>

            {categories.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-bold text-sub">Category</span>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    selected={categoryId === null}
                    onClick={() => setCategoryId(null)}
                  >
                    Any
                  </Chip>
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      selected={categoryId === c.id}
                      onClick={() => setCategoryId(c.id)}
                    >
                      {c.icon ? `${c.icon} ${c.name}` : c.name}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {narrowed && (
              <button
                type="button"
                onClick={clearFilters}
                className="self-start text-[13px] font-bold text-brand transition hover:brightness-110"
              >
                Clear filters
              </button>
            )}
          </Card>
        )}
      </div>

      {!isLoading && transactions.length > 0 && (
        <p className="m-0 text-[13px] text-sub">
          {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
          {' · '}
          <span className="font-semibold text-ink">
            {formatMoney(tally.net, { signed: true })}
          </span>{' '}
          net
          {tally.expense > 0 && <> · {formatMoney(tally.expense)} out</>}
          {tally.income > 0 && <> · {formatMoney(tally.income)} in</>}
        </p>
      )}

      {!isLoading && transactions.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={
              debouncedSearch.trim()
                ? `Nothing matches “${debouncedSearch.trim()}”`
                : filter === 'all' && !narrowed
                  ? 'No transactions yet'
                  : 'Nothing in this filter'
            }
            description={
              filter === 'all' && !narrowed
                ? 'Record one by hand to get started. Once your phone is connected, most of these appear on their own.'
                : 'Try another filter, or clear it to see everything.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <TransactionList
            transactions={transactions}
            loading={isLoading}
            onSelect={setEditing}
          />
        </Card>
      )}

      {adding && <TransactionForm onClose={() => setAdding(false)} />}
      {editing && (
        <TransactionForm
          // Keyed so switching rows remounts the form; without it the fields
          // keep the previous transaction's state.
          key={editing.id}
          transaction={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
