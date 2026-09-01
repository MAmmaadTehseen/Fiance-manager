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
  /** Which bank holds the user's own side, e.g. "Sender Bank:: FBL". */
  | 'bank'
  /** Which bank holds the other side, e.g. "Receiver Bank:: SadaPay". */
  | 'counterparty_bank'
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
  /** Which bank holds the user's own side, when the message names it. */
  bank: string | null
  /**
   * Which bank holds the other side. The tie-breaker when four digits are not
   * unique — two wallets on one phone number share a last4.
   */
  counterpartyBank: string | null
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
/**
 * Currency markers that mean "this is not rupees". Deliberately narrow: it
 * only has to catch a symbol or code sitting against the captured amount, and
 * a false positive costs one Inbox entry rather than a wrong number.
 */
const FOREIGN_CURRENCY = /[$€£¥]|\b(?:USD|EUR|GBP|AED|SAR|CAD|AUD)\b/i

export function parseDateTime(raw: string | undefined): Date | null {
  if (!raw) return null
  const s = raw.trim()

  const time = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i)

  // No time component means the best this string can tell us is a DATE — and
  // the caller already has received_at, accurate to seconds. Returning a
  // midnight guess instead was corrupting the transfer-sibling and dedupe
  // windows: two halves of one transfer landed up to 24h apart and were
  // booked twice. Date-only input is therefore worth nothing here.
  if (!time) return null

  let hh = Number(time[1])
  const mm = Number(time[2])
  const ss = time[3] ? Number(time[3]) : 0
  const mer = time[4]?.toUpperCase()
  if (mer === 'PM' && hh < 12) hh += 12
  if (mer === 'AM' && hh === 12) hh = 0

  // Pakistani bank SMS quote wall-clock PKT (UTC+5), but this code runs in
  // whatever timezone the host happens to use — UTC on Supabase Edge, PKT on
  // a dev laptop. `new Date(y, m, d, ...)` would give different instants on
  // each. Build the instant explicitly: PKT wall time minus the fixed offset.
  // (PKT has no daylight saving, so a constant is correct.)
  const PKT_OFFSET_MS = 5 * 60 * 60 * 1000
  const fromParts = (year: number, month: number, day: number): Date =>
    new Date(Date.UTC(year, month, day, hh, mm, ss) - PKT_OFFSET_MS)

  // 12-Aug-25 / 12 Aug 2025
  const named = s.match(/(\d{1,2})[-\s/]([A-Za-z]{3})[a-z]*[-\s/](\d{2,4})/)
  if (named) {
    const month = MONTHS[named[2]!.toUpperCase()]
    if (month !== undefined) {
      let year = Number(named[3])
      if (year < 100) year += 2000
      return fromParts(year, month, Number(named[1]))
    }
  }

  // 2025-08-12
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return fromParts(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }

  // 12/08/2025 — day first, which is the convention in PK.
  const numeric = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (numeric) {
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    const day = Number(numeric[1])
    const month = Number(numeric[2]) - 1
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return fromParts(year, month, day)
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
/**
 * The bank named beside an account number, tidied for comparison.
 *
 * Four digits stop identifying an account the moment two of them share a
 * number — and in Pakistan that is normal, not exotic: a wallet's "account
 * number" is a phone number, so JazzCash and SadaPay opened on the same SIM
 * both end 9904. The message says which one ("Receiver Bank:: SadaPay"), so
 * the name is worth keeping as the tie-breaker.
 *
 * Kept verbatim apart from trimming; matching against the user's own accounts
 * is the pipeline's job, and it needs the real words to work with.
 */
/**
 * Pakistani IBAN institution codes seen in real alerts.
 *
 * An IBAN survives masking better than anything else in a bank message:
 * `PK35MEZN******0508` hides the account but keeps `MEZN`. That makes it a
 * bank hint even when the message never writes a bank name — which Meezan's
 * alerts, among others, do not.
 *
 * Deliberately only the codes actually observed in captured messages. A wrong
 * guess here would quietly mislabel an account, and the cost of an absent code
 * is merely that this hint stays silent, so the list grows from evidence
 * rather than from a directory someone might have mistyped.
 */
const IBAN_BANKS: Record<string, string> = {
  FAYS: 'Faysal Bank',
  MEZN: 'Meezan Bank',
  HABB: 'HBL Habib Bank',
  MUCB: 'MCB Bank',
  UNIL: 'UBL United Bank',
  SONE: 'Soneri Bank',
  JCMA: 'JazzCash Mobilink',
}

/** The bank an account string names through its IBAN, if it carries one. */
export function bankFromIban(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.toUpperCase().match(/\bPK\d{2}([A-Z]{4})/)
  return m ? (IBAN_BANKS[m[1]!] ?? null) : null
}

export function cleanBankName(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  return cleaned.length > 1 ? cleaned : null
}

export function normalizeLast4(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 3) return null
  // Always the final four. Banks quote the same account as *7432, *017432 or
  // a full 14-digit tail depending on message type; keeping 5-6 digit quotes
  // verbatim made one account ping-pong between formats -- the inbox answer
  // overwrote last4 with the long form, and the short-form messages stopped
  // resolving. Four digits is the one representation every format reaches.
  return digits.length > 4 ? digits.slice(-4) : digits
}

const EMPTY_FIELDS: ParsedFields = {
  amount: null,
  merchant: null,
  merchantKey: null,
  last4: null,
  counterpartyLast4: null,
  bank: null,
  counterpartyBank: null,
  balance: null,
  fee: null,
  occurredAt: null,
  reference: null,
}

/**
 * Undo an over-eager "\bon\b" merchant terminator. If the message reads
 * "<name> on 21-Aug-25", the name is everything up to the dated "on", even
 * when "on" also appears inside the name. Returns the widest merchant that
 * still ends before a date.
 */
function reextendMerchant(
  captured: string | null,
  pattern: string | string[] | undefined,
  text: string,
): string | null {
  if (!captured || !pattern) return captured
  // Find "<stuff> on <date>" starting where the captured value begins.
  const idx = text.indexOf(captured)
  if (idx < 0) return captured
  const rest = text.slice(idx)
  const m = rest.match(
    /^(.+?)\s+on\s+\d{1,2}[-/\s](?:[A-Za-z]{3}|\d{1,2})[-/\s]\d{2,4}/i,
  )
  if (m && m[1] && m[1].length > captured.length) return m[1].trim()
  return captured
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
    const rawAmount = extractField(f.amount, text)
    const amount = parseAmount(rawAmount ?? undefined)
    // Without an amount there is no transaction to make. Keep looking — a
    // later template may match the same message properly.
    if (amount === null) continue

    // Refuse an amount that is plainly not rupees.
    //
    // Nothing downstream carries a currency: the pipeline books every parsed
    // amount as PKR. That is fine while every template is a local bank alert,
    // and quietly catastrophic the first time one matches a dollar receipt —
    // a $100 charge would enter the ledger as Rs 100. A template that wants
    // foreign currency has to earn it by adding real support, not by slipping
    // through. Leaving the message unmatched puts it in the Inbox where it is
    // visible, which is the right failure.
    if (rawAmount && FOREIGN_CURRENCY.test(rawAmount)) continue

    const merchantRawUncut = extractField(f.merchant, text)
    // A template may have stopped the merchant capture early at the word "on"
    // (\bon\b terminator) mid-name — "Books on Wheels" -> "Books". If the
    // full text continues "<merchant> on <date>", the merchant is everything
    // before that dated "on", so re-extend it. Only a dated "on" is a real
    // boundary; "on" inside a name never is.
    const merchantRaw = reextendMerchant(merchantRawUncut, f.merchant, text)
    // Kept unnormalised: the last four digits are what identifies the account,
    // but the IBAN around them is what identifies the bank.
    const rawOwnAccount = extractField(f.last4, text)
    const rawOtherAccount = extractField(f.counterparty_last4, text)
    const when = parseDateTime(extractField(f.datetime, text) ?? undefined)

    return {
      matched: true,
      template,
      kind: template.kind,
      fields: {
        amount,
        merchant: displayMerchant(merchantRaw),
        merchantKey: normalizeMerchant(merchantRaw),
        last4: normalizeLast4(rawOwnAccount),
        counterpartyLast4: normalizeLast4(rawOtherAccount),
        // A written bank name wins; the IBAN code answers for the messages
        // that name no bank at all.
        bank: cleanBankName(extractField(f.bank, text)) ?? bankFromIban(rawOwnAccount),
        counterpartyBank:
          cleanBankName(extractField(f.counterparty_bank, text)) ??
          bankFromIban(rawOtherAccount),
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
