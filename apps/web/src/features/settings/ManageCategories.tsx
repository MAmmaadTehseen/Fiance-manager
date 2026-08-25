import { useState } from 'react'
import { Tags } from 'lucide-react'
import {
  useAllCategories,
  useSetCategoryArchived,
  type Category,
} from '@batwa/core'
import { AddCategory } from '@/components/AddCategory'
import { cn } from '@/lib/utils'

/**
 * The seeded categories are a starting point, not the vocabulary you have to
 * live inside — this is where the other half of that promise lives. Adding
 * happens in the pickers, where you notice one is missing; retiring happens
 * here, once. Archived, never deleted: old months keep their totals, and a
 * change of heart is one tap.
 */
function KindGroup({ label, categories }: { label: string; categories: Category[] }) {
  const setArchived = useSetCategoryArchived()
  const [error, setError] = useState<string | null>(null)

  if (categories.length === 0) return null
  const active = categories.filter((c) => !c.archived_at)
  const retired = categories.filter((c) => c.archived_at)

  async function flip(category: Category) {
    setError(null)
    try {
      await setArchived.mutateAsync({
        categoryId: category.id,
        archived: !category.archived_at,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change that')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {active.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.is_system ? 'Used by the app itself' : 'Tap to retire'}
            disabled={setArchived.isPending || c.is_system}
            onClick={() => void flip(c)}
            className={cn(
              'rounded-full border border-border px-3 py-1.5 text-sm transition-colors',
              c.is_system
                ? 'cursor-default opacity-60'
                : 'text-foreground hover:border-destructive hover:text-destructive',
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      {retired.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Retired:</span>
          {retired.map((c) => (
            <button
              key={c.id}
              type="button"
              title="Tap to bring back"
              disabled={setArchived.isPending}
              onClick={() => void flip(c)}
              className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground line-through transition-colors hover:border-primary hover:text-foreground hover:no-underline"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function ManageCategories() {
  const { data: categories = [], isLoading } = useAllCategories()
  if (isLoading) return null

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Tags className="size-4" aria-hidden />
          Categories
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap one to retire it from every picker — nothing already filed under
          it changes, and a retired one comes back with a tap. Add your own
          right here, or in any picker.
        </p>
      </div>

      <KindGroup
        label="Spending"
        categories={categories.filter((c) => c.kind === 'expense')}
      />
      <KindGroup
        label="Income"
        categories={categories.filter((c) => c.kind === 'income')}
      />

      <div className="flex flex-wrap gap-2">
        <AddCategory
          kind="expense"
          className="rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
          onCreated={() => {}}
        />
      </div>
    </section>
  )
}
