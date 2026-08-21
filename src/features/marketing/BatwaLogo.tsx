/**
 * The Batwa mark: a solid disc, a dashed ring, and a B.
 *
 * The dashed ring reads as stitching — a batwa (بٹوہ) is a stitched purse.
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
      className={className}
      role="img"
      aria-label="Batwa"
    >
      <circle cx="44" cy="44" r="40" fill="var(--b-brand)" />
      <circle
        cx="44"
        cy="44"
        r="33"
        fill="none"
        stroke="var(--b-gold)"
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
        fill="var(--b-brand-on)"
      >
        B
      </text>
    </svg>
  )
}

/**
 * Outline-only version used as an oversized watermark inside the balance card,
 * where it inherits the surrounding text colour instead of the brand palette.
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
