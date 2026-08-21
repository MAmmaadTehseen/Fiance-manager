/**
 * Money helpers.
 *
 * Amounts are stored in Postgres as numeric(14,2) and arrive over the wire as
 * strings (supabase-js does not coerce numerics, precisely so precision is not
 * silently lost). Everything here takes `string | number` for that reason.
 */

export type Money = string | number

export function toNumber(value: Money | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED',
  INR: '₹',
}

export function currencySymbol(currency = 'PKR'): string {
  return CURRENCY_SYMBOLS[currency] ?? currency
}

/**
 * Full precision, grouped: `Rs 12,345.67`. Decimals are dropped when the
 * amount is whole, which is the common case for PKR and keeps ledger rows calm.
 */
export function formatMoney(
  value: Money | null | undefined,
  options: { currency?: string; signed?: boolean; decimals?: boolean } = {},
): string {
  const { currency = 'PKR', signed = false, decimals } = options
  const n = toNumber(value)
  const showDecimals = decimals ?? !Number.isInteger(n)

  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(Math.abs(n))

  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : ''
  return `${sign}${currencySymbol(currency)} ${formatted}`
}

/**
 * Space-constrained display (tiles, chart axes): `Rs 12.3k`, `Rs 1.25M`.
 */
export function formatMoneyCompact(
  value: Money | null | undefined,
  currency = 'PKR',
): string {
  const n = toNumber(value)
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  const sym = currencySymbol(currency)

  if (abs >= 1_000_000_000) return `${sign}${sym} ${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${sign}${sym} ${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}${sym} ${(abs / 1_000).toFixed(1)}k`
  return `${sign}${sym} ${abs.toFixed(0)}`
}

/**
 * Parses loose human input — "1,200", "1.2k", "20k", "Rs 350" — into a number.
 * Powers the quick-add bar, where typing "20k" should just work.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/[^\d.,kKmM]/g, '')
    .replace(/,/g, '')
  if (!cleaned) return null

  const suffix = cleaned.slice(-1).toLowerCase()
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : 1
  const numeric = multiplier === 1 ? cleaned : cleaned.slice(0, -1)

  const n = Number.parseFloat(numeric)
  if (!Number.isFinite(n) || n <= 0) return null

  return Math.round(n * multiplier * 100) / 100
}

/** Rounds to the 2dp that `numeric(14,2)` will store anyway. */
export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100
}

/** Semantic colour class for an amount, by transaction direction. */
export function amountToneClass(
  type: 'income' | 'expense' | 'transfer',
): string {
  if (type === 'income') return 'text-money-in'
  if (type === 'expense') return 'text-money-out'
  return 'text-money-neutral'
}
