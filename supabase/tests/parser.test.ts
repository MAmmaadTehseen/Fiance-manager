/**
 * Parser tests. Run with:
 *   bash supabase/tests/parser.sh
 *
 * Templates are read from the live database rather than duplicated here, so a
 * seeded template that stops parsing its own documented sample fails the
 * build. That self-check is the cheapest guard we have against a regex typo
 * shipping unnoticed.
 */

import {
  parseSms,
  parseAmount,
  parseDateTime,
  normalizeMerchant,
  displayMerchant,
  kindToTransactionType,
  type ParserTemplate,
} from '../functions/_shared/parser.ts'

let pass = 0
let fail = 0

function ok(msg: string) {
  console.log(`  PASS  ${msg}`)
  pass++
}
function no(msg: string, detail: unknown) {
  console.log(`  FAIL  ${msg}`)
  console.log(`        ${JSON.stringify(detail)}`)
  fail++
}
function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual === expected) ok(msg)
  else no(msg, { expected, actual })
}

/** A sender string that satisfies each bank's sender_pattern. */
const SENDERS: Record<string, string> = {
  hbl: 'HBL',
  meezan: 'Meezan',
  ubl: 'UBL',
  alfalah: 'Alfalah',
  mcb: 'MCB',
  jazzcash: 'JazzCash',
  easypaisa: 'Easypaisa',
  sadapay: 'SadaPay',
  nayapay: 'NayaPay',
  generic: 'SomeBank',
}

const raw = await new Response(process.stdin as never).text()
const templates: ParserTemplate[] = JSON.parse(raw)

console.log('== unit: amount parsing ==')
eq(parseAmount('PKR 2,500.00'), 2500, 'PKR 2,500.00 -> 2500')
eq(parseAmount('Rs.1,200'), 1200, 'Rs.1,200 -> 1200')
eq(parseAmount('45,678.50'), 45678.5, 'keeps paisa')
eq(parseAmount('1.234,56'), 1234.56, 'european format')
eq(parseAmount('1,234,567'), 1234567, 'multiple grouping commas')
eq(parseAmount('Rs 1,20'), 1.2, 'two digits after comma is a decimal comma')
eq(parseAmount('0'), null, 'zero is not an amount')
eq(parseAmount('abc'), null, 'garbage is null')
eq(parseAmount(undefined), null, 'undefined is null')

console.log('== unit: merchant normalisation ==')
eq(normalizeMerchant('CAFE ZOUK  KARACHI PK'), 'CAFE ZOUK', 'strips city and country')
eq(normalizeMerchant('Cafe Zouk, Karachi'), 'CAFE ZOUK', 'same key from different punctuation')
eq(normalizeMerchant('FOODPANDA PVT LTD'), 'FOODPANDA', 'strips company suffixes')
eq(normalizeMerchant('SHELL 1234567'), 'SHELL', 'strips long digit runs')
eq(normalizeMerchant('  '), null, 'blank is null')
eq(displayMerchant('CAFE ZOUK'), 'Cafe Zouk', 'title-cases for display')
eq(displayMerchant('KFC'), 'KFC', 'leaves short acronyms alone')

console.log('== unit: date parsing ==')
eq(parseDateTime('12-Aug-25')?.getFullYear(), 2025, '2-digit year -> 2025')
eq(parseDateTime('12-Aug-25')?.getMonth(), 7, 'named month')
eq(parseDateTime('12/08/2025')?.getDate(), 12, 'day-first numeric')
eq(parseDateTime('2025-08-12')?.getDate(), 12, 'iso')
eq(parseDateTime('12-Aug-25 14:30')?.getHours(), 14, 'time of day')
eq(parseDateTime('12-Aug-25 02:30 PM')?.getHours(), 14, 'meridiem')
eq(parseDateTime('not a date'), null, 'unparseable is null')

console.log('== every seeded template parses its own sample ==')
for (const t of templates) {
  if (!t.sample) {
    no(`${t.label} has no sample`, t.bank_key)
    continue
  }
  const sender = SENDERS[t.bank_key] ?? 'SomeBank'
  const r = parseSms(sender, t.sample, [t])

  if (!r.matched) {
    no(`${t.label}: template did not match its own sample`, t.sample)
    continue
  }
  if (t.kind === 'ignore') {
    ok(`${t.label}: matches and yields nothing (ignore)`)
    continue
  }
  if (r.fields.amount === null) {
    no(`${t.label}: matched but extracted no amount`, t.sample)
    continue
  }
  ok(`${t.label}: amount ${r.fields.amount}`)
}

console.log('== field extraction, HBL purchase ==')
const hbl = parseSms(
  'HBL',
  'Your HBL Debit Card ending 4821 was used for PKR 2,500.00 at CAFE ZOUK on 12-Aug-25. Available balance: PKR 45,678.00',
  templates,
)
if (!hbl.matched) {
  no('HBL purchase did not match', null)
} else {
  eq(hbl.fields.amount, 2500, 'amount is the spend, not the balance')
  eq(hbl.fields.last4, '4821', 'last4')
  eq(hbl.fields.merchantKey, 'CAFE ZOUK', 'merchant key')
  eq(hbl.fields.balance, 45678, 'balance assertion')
  eq(hbl.kind, 'purchase', 'kind')
  eq(kindToTransactionType(hbl.kind), 'expense', 'maps to expense')
  eq(hbl.template.bank_key, 'hbl', 'bank-specific template beat the generic one')
}

console.log('== ATM becomes a transfer ==')
const atm = parseSms(
  'HBL',
  'Cash withdrawal of PKR 10,000.00 from ATM using card ending 4821 on 12-Aug-25. Available balance PKR 35,000.00',
  templates,
)
if (!atm.matched) {
  no('ATM message did not match', null)
} else {
  eq(atm.kind, 'atm', 'kind is atm')
  eq(kindToTransactionType(atm.kind), 'transfer', 'maps to a transfer')
  eq(atm.fields.amount, 10000, 'withdrawal amount')
  eq(atm.fields.balance, 35000, 'balance after withdrawal')
}

console.log('== credit is income, not spending ==')
const credit = parseSms(
  'Meezan',
  'Dear Customer, your a/c ****1234 has been credited with PKR 50,000.00 on 01/08/2025. Avl Bal: PKR 95,678.00',
  templates,
)
if (!credit.matched) {
  no('credit did not match', null)
} else {
  eq(credit.kind, 'credit', 'kind is credit')
  eq(kindToTransactionType(credit.kind), 'income', 'maps to income')
  eq(credit.fields.amount, 50000, 'credited amount')
}

console.log('== wallets ==')
const jc = parseSms(
  'JazzCash',
  'You have sent Rs 1,000.00 to 03001234567. Balance Rs 5,000.00. TID 123456789',
  templates,
)
if (!jc.matched) no('JazzCash did not match', null)
else {
  eq(jc.fields.amount, 1000, 'sent amount, not the balance')
  eq(jc.fields.balance, 5000, 'wallet balance')
  eq(jc.fields.reference, '123456789', 'transaction id')
}

console.log('== OTPs and noise never become transactions ==')
for (const [label, sender, body] of [
  ['OTP', 'HBL', 'Your OTP for login is 123456. Do not share it with anyone.'],
  ['OTP with amount', 'Meezan', 'OTP 987654 to authorise PKR 5,000.00 transfer. Valid 5 min.'],
  ['promo', 'UBL', 'Congratulations! Get 20% discount on your next purchase.'],
] as const) {
  const r = parseSms(sender, body, templates)
  if (r.matched && r.kind === 'ignore') ok(`${label} is ignored`)
  else if (!r.matched) ok(`${label} does not match anything`)
  else no(`${label} produced a transaction`, r.fields)
}

console.log('== unknown senders fall through cleanly ==')
const junk = parseSms('MOM', 'are you coming home for dinner?', templates)
eq(junk.matched, false, 'a personal message matches nothing')

console.log('== a broken user template cannot take the pipeline down ==')
const broken: ParserTemplate = {
  id: 'x', user_id: 'u', bank_key: 'generic', label: 'broken',
  sender_pattern: '(((', match_pattern: '(((',
  field_patterns: { amount: '(((' }, kind: 'purchase', priority: 1,
}
const survived = parseSms(
  'HBL',
  'Your HBL Debit Card ending 4821 was used for PKR 2,500.00 at CAFE ZOUK on 12-Aug-25. Available balance: PKR 45,678.00',
  [broken, ...templates],
)
if (survived.matched && survived.fields.amount === 2500) {
  ok('malformed regex is skipped and the good template still wins')
} else {
  no('malformed template broke parsing', survived)
}

console.log('\n-------------------------------')
console.log(` passed: ${pass}   failed: ${fail}`)
console.log('-------------------------------')
process.exit(fail === 0 ? 0 : 1)
