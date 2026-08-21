import { cn } from '@/lib/utils'

/**
 * The Batwa mark: a solid disc, a dashed ring, and a B.
 *
 * The dashed ring reads as stitching — a batwa (بٹوہ) is a stitched purse.
 * Colours come from tokens, so the mark follows light and dark automatically.
 */
export function BatwaLogo({
  size = 32,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Batwa"
    >
      <circle cx="44" cy="44" r="40" fill="var(--brand)" />
      <circle
        cx="44"
        cy="44"
        r="33"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="3"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <text
        x="44"
        y="58"
        textAnchor="middle"
        fontFamily="'Bricolage Grotesque', sans-serif"
        fontSize="40"
        fontWeight="800"
        fill="var(--brand-on)"
      >
        B
      </text>
    </svg>
  )
}

/** "batwa." — the dot is always gold. */
export function BatwaWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display font-bold tracking-[-0.02em] text-ink',
        className,
      )}
    >
      batwa<span className="text-gold">.</span>
    </span>
  )
}

/**
 * Outline-only variant used as an oversized watermark on brand-filled cards,
 * where it inherits the surrounding text colour rather than the palette.
 */
export function BatwaWatermark({
  size = 180,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      className={className}
      aria-hidden
    >
      <circle
        cx="44"
        cy="44"
        r="40"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <circle
        cx="44"
        cy="44"
        r="33"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="2 6"
        strokeLinecap="round"
      />
      <text
        x="44"
        y="58"
        textAnchor="middle"
        fontFamily="'Bricolage Grotesque', sans-serif"
        fontSize="40"
        fontWeight="800"
        fill="currentColor"
      >
        B
      </text>
    </svg>
  )
}
