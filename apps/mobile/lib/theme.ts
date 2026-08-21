/**
 * The Batwa palette, as plain values.
 *
 * The web app gets these as CSS custom properties; React Native has no CSS,
 * so the same design tokens are expressed as an object. Values are kept
 * identical to apps/web/src/index.css — if one moves, move both.
 */
export type Scheme = 'light' | 'dark'

export const palette = {
  light: {
    bg: '#f5f2e9',
    card: '#fdfbf4',
    ink: '#20302a',
    sub: '#68766a',
    line: '#e2ded0',
    soft: '#eae5d6',
    brand: '#2a473c',
    brandOn: '#f4f1e4',
    brandSoft: 'rgba(42,71,60,0.09)',
    gold: '#e6a83e',
    goldInk: '#9a6f1e',
    goldSoft: 'rgba(230,168,62,0.16)',
    goldOn: '#4a3410',
    pos: '#2f7d55',
    neg: '#b4462f',
  },
  dark: {
    bg: '#111c18',
    card: '#1a2723',
    ink: '#f0ece0',
    sub: '#94a89b',
    line: '#2f3d37',
    soft: '#26332e',
    brand: '#335446',
    brandOn: '#f4f1e4',
    brandSoft: 'rgba(140,190,168,0.14)',
    gold: '#efb04a',
    goldInk: '#efb04a',
    goldSoft: 'rgba(239,176,74,0.16)',
    goldOn: '#4a3410',
    pos: '#6dc08d',
    neg: '#e08066',
  },
} as const

/**
 * Widened to string: `as const` above makes each value a literal type, so
 * without this the dark palette is not assignable where the light one is
 * expected, and every component would be typed to one theme.
 */
export type Colors = { [K in keyof (typeof palette)['light']]: string }

/**
 * React Native's useColorScheme can report null or "unspecified"; both mean
 * "the OS has no preference", which is light. Narrowing it here keeps every
 * screen from repeating the same guard.
 */
export function resolveScheme(value: string | null | undefined): Scheme {
  return value === 'dark' ? 'dark' : 'light'
}
