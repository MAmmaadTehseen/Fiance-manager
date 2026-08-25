import { useState } from 'react'
import { Users } from 'lucide-react'
import {
  useMergeMerchants,
  useMerchants,
  type MerchantSummary,
} from '@batwa/core'
import { cn } from '@/lib/utils'

/**
 * Folding several names into one payee.
 *
 * A shopkeeper collecting through family members' accounts appears as five
 * different people, so each name learns its category separately and history
 * splinters. Tick the names that are one shop, choose which name survives,
 * merge — teaching and totals unify from then on.
 */
export function ManagePayees() {
  const { data: merchants = [], isLoading } = useMerchants()
  const merge = useMergeMerchants()
  const [selected, setSelected] = useState<string[]>([])
  const [keep, setKeep] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (isLoading || merchants.length < 2) return null

  const chosen = merchants.filter((m) => selected.includes(m.id))
  const survivor = chosen.find((m) => m.id === keep) ?? chosen[0]

  function toggle(m: MerchantSummary) {
    setFlash(null)
    setSelected((prev) =>
      prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
    )
  }

  async function doMerge() {
    if (!survivor || chosen.length < 2) return
    await merge.mutateAsync({
      intoId: survivor.id,
      aliasIds: chosen.map((m) => m.id),
    })
    setFlash(
      `Merged ${chosen.length} names into ${survivor.display_name}. Teaching any of them now teaches the shop.`,
    )
    setSelected([])
    setKeep(null)
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Users className="size-4" aria-hidden />
          Payees
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One shop collecting through several accounts shows up as several
          people. Tick the names that are really the same, and merge them.
        </p>
      </div>

      {flash && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {flash}
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {merchants.map((m) => (
          <li key={m.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition',
                selected.includes(m.id) ? 'bg-accent' : 'hover:bg-accent/50',
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m)}
                className="size-4 accent-[var(--brand)]"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {m.display_name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.category?.name ?? 'untaught'} · seen {m.times_seen}×
              </span>
            </label>
          </li>
        ))}
      </ul>

      {chosen.length >= 2 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="m-0 text-sm font-medium">Keep which name?</p>
          <div className="flex flex-wrap gap-2">
            {chosen.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={survivor?.id === m.id}
                onClick={() => setKeep(m.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  survivor?.id === m.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {m.display_name}
              </button>
            ))}
          </div>
          {merge.isError && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {merge.error instanceof Error
                ? merge.error.message
                : 'Could not merge'}
            </p>
          )}
          <button
            type="button"
            disabled={merge.isPending}
            onClick={() => void doMerge()}
            className="self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {merge.isPending
              ? 'Merging…'
              : `Merge ${chosen.length} names into ${survivor?.display_name}`}
          </button>
        </div>
      )}
    </section>
  )
}
