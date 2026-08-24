import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A pill-shaped toggle, the app's standard way of picking one option out of a
 * short row. `tone` exists because the review filters read as a warning rather
 * than as a neutral choice.
 */
export function Chip({
  selected,
  onClick,
  children,
  tone = 'neutral',
  className,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'neutral' | 'gold'
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'rounded-full px-3.5 py-2 text-[13px] transition-colors',
        selected
          ? 'bg-brand font-bold text-brand-on'
          : cn(
              'border border-line bg-card font-semibold hover:text-ink',
              tone === 'gold' ? 'text-gold-ink' : 'text-sub',
            ),
        className,
      )}
    >
      {children}
    </button>
  )
}
