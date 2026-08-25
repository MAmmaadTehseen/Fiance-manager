import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useCreateCategory, type Category, type CategoryKind } from '@batwa/core'
import { cn } from '@/lib/utils'

/**
 * "+ New" beside a category picker.
 *
 * The seeded categories are a starting point, not the vocabulary someone has
 * to live inside. Without this, a spend nobody anticipated — a habit, a
 * hobby, anything personal — gets filed under whichever existing name is
 * least wrong, or abandoned in the Inbox.
 *
 * Adding one is deliberately done in place rather than behind a trip to
 * Settings: the moment you discover a category is missing is the moment you
 * are filing something, and being sent elsewhere loses the transaction you
 * were in the middle of.
 *
 * `className` is the caller's chip styling, because the two pickers this
 * appears in look different and neither should be made to match the other.
 *
 * Deliberately not a <form>. One of the pickers lives inside the add/edit
 * sheet, which is itself a form, and HTML forbids nesting them — the browser
 * simply discards the inner one, so the button would have submitted the sheet
 * instead of creating anything. Enter is wired up by hand to keep the typing
 * experience a form would have given.
 */
export function AddCategory({
  kind,
  onCreated,
  className,
  disabled,
}: {
  kind: CategoryKind
  onCreated: (category: Category) => void
  className?: string
  disabled?: boolean
}) {
  const create = useCreateCategory()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function close() {
    setOpen(false)
    setName('')
    create.reset()
  }

  async function submit() {
    if (!name.trim()) return
    try {
      const category = await create.mutateAsync({ name, kind })
      // Hand it straight back selected. Making someone create a category and
      // then hunt for it in the list is a pointless second step.
      onCreated(category)
      close()
    } catch {
      // The message is rendered below; the sheet stays open so the name can
      // be corrected rather than retyped.
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-1.5', className)}
      >
        <Plus className="size-3.5" aria-hidden />
        New
      </button>
    )
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'Enter') {
              // The sheet's own form would otherwise take the Enter and save
              // the transaction half-filled.
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="Name it — anything you like"
          aria-label="New category name"
          maxLength={40}
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-card px-3.5 text-[13px] text-ink outline-none transition placeholder:text-sub focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!name.trim() || create.isPending}
          className="h-9 shrink-0 rounded-full bg-brand px-3.5 text-[13px] font-bold text-brand-on transition hover:brightness-110 disabled:opacity-50"
        >
          {create.isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={close}
          className="h-9 shrink-0 rounded-full px-2 text-[13px] font-semibold text-sub transition hover:text-ink"
        >
          Cancel
        </button>
      </div>

      {create.isError && (
        <p role="alert" className="m-0 text-[12.5px] text-neg">
          {create.error instanceof Error
            ? create.error.message
            : 'Could not add that.'}
        </p>
      )}
    </div>
  )
}
