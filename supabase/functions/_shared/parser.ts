/**
 * Bank SMS parser.
 *
 * Deliberately dependency-free and side-effect-free so the exact same code
 * runs in the ingest Edge Function (Deno) and in the browser's rule builder.
 * If the two ever diverged, a template that tested green in the UI could fail
 * in production, which is the one bug this whole feature cannot afford.
 *
 * Templates live in the database, so supporting a new bank is an INSERT.
 */

export type TemplateKind = 'purchase' | 'credit' | 'atm' | 'fee' | 'ignore'

export type ParserField =
  | 'amount'
  | 'merchant'
  /** The user's own account: the source when sending, destination when receiving. */
  | 'last4'
  /** The other side's account, when the message names it. */
  | 'counterparty_last4'
  | 'balance'
  | 'datetime'
  | 'reference'
  /** Transfer charge quoted in the same message, e.g. "Fee: Rs 1.55". */
  | 'fee'

export type ParserTemplate = {
  id: string
  user_id: string | null
  bank_key: string
  label: string
  sender_pattern: string
  match_pattern: string
  /**
   * Per field, either one regex or an ordered list tried until one hits.
   * The list matters for account numbers: a transfer names both the sending
   * and receiving account, and only a specific pattern ("in your X A/C ...")
   * can tell them apart. A single regex would just take whichever appears
   * first in the text, which is the wrong one half the time.
   */
  field_patterns: Partial<Record<ParserField, string | string[]>>
  kind: TemplateKind
  priority: number
}

export type ParsedFields = {
  amount: number | null
  merchant: string | null
  /** Normalised merchant key used to look up learned categories. */
  merchantKey: string | null
  last4: string | null
  /**
   * The account on the other side of the movement. When this resolves to
   * another of the user's own accounts, the message is an internal transfer
   * rather than spending, and must be booked as one movement instead of two.
   */
  counterpartyLast4: string | null
  balance: number | null
  /** A charge levied alongside the transfer, booked separately. */
  fee: number | null
  /** ISO string, or null when the message carried no usable timestamp. */
  occurredAt: string | null
  reference: string | null
}

export type ParseResult =
  | {
      matched: true
      template: ParserTemplate
      kind: TemplateKind
      fields: ParsedFields
    }
  | { matched: false; template: null }

/**
 * A pathological template could backtrack forever. Templates are per-user, so
 * the blast radius is self-inflicted, but a length cap keeps a stray message
 * from making it worse. Real bank SMS are well under this.
 */
const MAX_BODY_LENGTH = 2000

/** "PKR 2,500.00" / "Rs.1,200" / "1200.50" -> 1200.5 */
export function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null

  const cleaned = raw
    .replace(/(?:PKR|RS|RUPEES)\.?/gi, '')
    .replace(/[^\d.,]/g, '')
    .trim()
  if (!cleaned) return null

  // Thousands separators only ever appear left of the decimal point.
  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  let normalised: string

  if (lastDot === -1 && lastComma === -1) {
    normalised = cleaned
  } else if (lastDot > lastComma) {
    // Dot is the decimal point, so any commas are grouping: 1,234.56
    normalised = cleaned.replace(/,/g, '')
  } else {
    // A trailing comma group is ambiguous: "1,200" is 1200 here but 1.2 in
    // European notation. Exactly three digits after the last comma, with no
    // decimal point anywhere, means grouping — which is the PK convention.
    const digitsAfterComma = cleaned.length - lastComma - 1
    if (digitsAfterComma === 3 && lastDot === -1) {
      normalised = cleaned.replace(/,/g, '')
    } else {
      // European style: 1.234,56
      normalised = cleaned.replace(/\./g, '').replace(',', '.')
    }
  }

  const n = Number.parseFloat(normalised)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/** Tokens that carry no identity and only fragment the merchant key. */
const NOISE = new Set([
  'PVT', 'LTD', 'PRIVATE', 'LIMITED', 'INC', 'LLC', 'CO',
  'PK', 'PAK', 'PAKISTAN',
  'KARACHI', 'LAHORE', 'ISLAMABAD', 'RAWALPINDI', 'PESHAWAR',
  'FAISALABAD', 'MULTAN', 'QUETTA', 'SIALKOT', 'GUJRANWALA', 'HYDERABAD',
  'POS', 'ECOM', 'ECOMM', 'ONLINE', 'PURCHASE', 'PAYMENT', 'TXN',
])

/**
 * Collapses the many ways a bank writes the same shop into one stable key.
 * "CAFE ZOUK  KARACHI PK" and "Cafe Zouk, Karachi" both become "CAFE ZOUK",
 * which is what makes "categorise it once" actually stick.
 */
export function normalizeMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null

  const tokens = raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    // Card fragments and long reference numbers are not part of a name.
    .replace(/\b\d{4,}\b/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !NOISE.has(t))

  const key = tokens.join(' ').trim()
  return key.length >= 2 ? key : null
}

/** Title-cases the raw merchant for display, leaving acronyms alone. */
export function displayMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^A-Za-z0-9\s&'-]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  return cleaned
    .split(' ')
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w // KFC, UBL, ATM
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ')
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
}

/**
 * Handles the formats Pakistani banks actually use: 12-Aug-25, 12/08/2025,
 * 2025-08-12, each optionally followed by a time.
 *
 * Returns null rather than guessing — the caller falls back to the time the
 * phone received the message, which is accurate to within seconds anyway.
 */
export function parseDateTime(raw: string | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim()

  const time = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)
  let hh = 0
  let mm = 0
  let ss = 0
  if (time) {
    hh = Number(time[1])
    mm = Number(time[2])
    ss = time[3] ? Number(time[3]) : 0
    const mer = time[4]?.toUpperCase()
    if (mer === 'PM' && hh < 12) hh += 12
    if (mer === 'AM' && hh === 12) hh = 0
  }

  // 12-Aug-25 / 12 Aug 2025
  const named = s.match(/(\d{1,2})[-\s/]([A-Za-z]{3})[a-z]*[-\s/](\d{2,4})/)
  if (named) {
    const month = MONTHS[named[2]!.toUpperCase()]
    if (month !== undefined) {
      let year = Number(named[3])
      if (year < 100) year += 2000
      return new Date(year, month, Number(named[1]), hh, mm, ss)
    }
  }

  // 2025-08-12
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hh, mm, ss)
  }

  // 12/08/2025 — day first, which is the convention in PK.
  const numeric = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (numeric) {
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    const day = Number(numeric[1])
    const month = Number(numeric[2]) - 1
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day, hh, mm, ss)
    }
  }

  return null
}

function safeRegex(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags)
  } catch {
    return null // A malformed user template must not take the pipeline down.
  }
}

/**
 * User templates before built-ins, then by ascending priority. This is what
 * lets someone override a shipped template that gets their bank slightly
 * wrong without waiting for a release.
 */
export function orderTemplates(templates: ParserTemplate[]): ParserTemplate[] {
  return [...templates].sort((a, b) => {
    const own = Number(b.user_id !== null) - Number(a.user_id !== null)
    if (own !== 0) return own
    return a.priority - b.priority
  })
}

/**
 * Runs one field's regex and returns its capture group. Falls back to the
 * whole match when the pattern has no group, so a bare pattern still works.
 */
export function extractField(
  pattern: string | string[] | undefined,
  text: string,
): string | null {
  if (!pattern) return null

  if (Array.isArray(pattern)) {
    for (const p of pattern) {
      const hit = extractField(p, text)
      if (hit !== null) return hit
    }
    return null
  }

  const re = safeRegex(pattern, 'i')
  if (!re) return null
  const m = re.exec(text)
  if (!m) return null

  // Return the first group that actually participated. Real bank formats put
  // the amount on either side of the verb ("Rs 500 sent to" vs "sent Rs 500"),
  // which is only expressible as an alternation — and in an alternation every
  // branch but one leaves its group undefined.
  for (let i = 1; i < m.length; i++) {
    const g = m[i]
    if (g !== undefined && g !== '') return g.trim() || null
  }
  return m[0]?.trim() || null
}

/**
 * Bank messages quote an account every which way: four masked digits, a full
 * 14-digit IBAN tail, or a mobile number for a wallet. Accounts store a short
 * identifier, so collapse anything long to its final four digits and let both
 * sides meet in the middle.
 */
export function normalizeLast4(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 3) return null
  return digits.length > 6 ? digits.slice(-4) : digits
}

const EMPTY_FIELDS: ParsedFields = {
  amount: null,
  merchant: null,
  merchantKey: null,
  last4: null,
  counterpartyLast4: null,
  balance: null,
  fee: null,
  occurredAt: null,
  reference: null,
}

export function parseSms(
  sender: string,
  body: string,
  templates: ParserTemplate[],
): ParseResult {
  const text = body.slice(0, MAX_BODY_LENGTH)

  for (const template of orderTemplates(templates)) {
    const senderRe = safeRegex(template.sender_pattern, 'i')
    if (!senderRe || !senderRe.test(sender)) continue

    const matchRe = safeRegex(template.match_pattern, 'i')
    if (!matchRe || !matchRe.test(text)) continue

    // An ignore template is a match that deliberately yields nothing: OTPs,
    // marketing and balance enquiries must never become transactions.
    if (template.kind === 'ignore') {
      return { matched: true, template, kind: 'ignore', fields: EMPTY_FIELDS }
    }

    const f = template.field_patterns ?? {}
    const amount = parseAmount(extractField(f.amount, text) ?? undefined)
    // Without an amount there is no transaction to make. Keep looking — a
    // later template may match the same message properly.
    if (amount === null) continue

    const merchantRaw = extractField(f.merchant, text)
    const when = parseDateTime(extractField(f.datetime, text) ?? undefined)

    return {
      matched: true,
      template,
      kind: template.kind,
      fields: {
        amount,
        merchant: displayMerchant(merchantRaw),
        merchantKey: normalizeMerchant(merchantRaw),
        last4: normalizeLast4(extractField(f.last4, text)),
        counterpartyLast4: normalizeLast4(
          extractField(f.counterparty_last4, text),
        ),
        balance: parseAmount(extractField(f.balance, text) ?? undefined),
        fee: parseAmount(extractField(f.fee, text) ?? undefined),
        occurredAt: when ? when.toISOString() : null,
        reference: extractField(f.reference, text),
      },
    }
  }

  return { matched: false, template: null }
}

/** Maps a template kind onto the ledger's transaction type. */
export function kindToTransactionType(
  kind: TemplateKind,
): 'expense' | 'income' | 'transfer' {
  switch (kind) {
    case 'credit':
      return 'income'
    case 'atm':
      return 'transfer'
    default:
      return 'expense'
  }
}
