import { cn } from '@/lib/utils'

/**
 * The Batwa mark — M3, "The Coin": a B struck on a coin with a milled
 * marigold edge.
 *
 * The B is drawn from paths rather than <text>. A brand mark rendered as text
 * flickers in a fallback face until the webfont loads, which is exactly the
 * moment it is most visible. Paths also mean the SVG, the favicon and the PWA
 * icons (scripts/make-icons.mjs, which has no font engine) are all the
 * identical shape.
 */
function BatwaB({ fill }: { fill: string }) {
  return (
    <>
      <rect x="28" y="26" width="10" height="36" fill={fill} />
      {/* Each bowl is a right half-ellipse with its counter knocked out. */}
      <path
        fillRule="evenodd"
        fill={fill}
        d="M37 26 A15 8.8 0 0 1 37 43.6 Z M37 31.2 A7.5 3.6 0 0 1 37 38.4 Z"
      />
      <path
        fillRule="evenodd"
        fill={fill}
        d="M37 43.4 A17 9.6 0 0 1 37 62.6 Z M37 48.4 A9 4.6 0 0 1 37 57.6 Z"
      />
    </>
  )
}

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
      <BatwaB fill="var(--brand-on)" />
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
      <BatwaB fill="currentColor" />
    </svg>
  )
}
