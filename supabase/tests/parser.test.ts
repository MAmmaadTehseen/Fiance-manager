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
  bankFromIban,
  parseSms,
  parseAmount,
  parseDateTime,
  normalizeMerchant,
  normalizeLast4,
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
// A date with no time is worthless here: the caller already has received_at
// to the second, and a midnight guess corrupted the transfer/dedupe windows.
// So date-only -> null, and a timed string is an exact PKT->UTC instant.
eq(parseDateTime('12-Aug-25'), null, 'date without a time -> null')
eq(parseDateTime('12/08/2025'), null, 'numeric date without a time -> null')
eq(parseDateTime('2025-08-12'), null, 'iso date without a time -> null')
// 14:30 PKT on 12-Aug-2025 == 09:30 UTC. Verify the whole instant, since the
// point of the fix is that it no longer depends on the host timezone.
eq(
  parseDateTime('12-Aug-25 14:30')?.toISOString(),
  '2025-08-12T09:30:00.000Z',
  'named month, PKT 14:30 -> UTC 09:30',
)
eq(
  parseDateTime('12/08/2025 14:30')?.toISOString(),
  '2025-08-12T09:30:00.000Z',
  'day-first numeric with a time',
)
eq(
  parseDateTime('2025-08-12 14:30')?.toISOString(),
  '2025-08-12T09:30:00.000Z',
  'iso with a time',
)
eq(parseDateTime('12-Aug-25 02:30 PM')?.getUTCHours(), 9, 'meridiem: 2:30pm PKT -> 09 UTC')
eq(parseDateTime('not a date'), null, 'unparseable is null')

/**
 * A sender the template will accept, so its sample is actually exercised.
 *
 * Email templates key on an `@` sender, so feeding them a shortcode like 'HBL'
 * means the sender test fails before the body is ever looked at — and the
 * sample check then reports the template as broken when it is fine. Email is
 * the primary capture channel, so all of its templates were being reported
 * that way. Derive the address from the pattern instead: `@ubl\.com\.pk`
 * becomes alerts@ubl.com.pk, and a bare `@` becomes any address at all.
 */
function senderFor(t: ParserTemplate): string {
  if (!t.sender_pattern.includes('@')) return SENDERS[t.bank_key] ?? 'SomeBank'
  const domain = t.sender_pattern.replace(/\\/g, '').replace(/^.*@/, '')
  return `alerts@${domain || 'bank.example'}`
}

console.log('== every seeded template parses its own sample ==')
for (const t of templates) {
  if (!t.sample) {
    no(`${t.label} has no sample`, t.bank_key)
    continue
  }
  const sender = senderFor(t)
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
  // A decline is the dangerous one: it names a merchant and, at some banks,
  // an amount. Booking it would invent money the user never spent.
  [
    'declined transaction',
    'HBL',
    'Dear Customer, Your transaction was not completed due to insufficient limit. You may apply for limit enhancement. Call 021 111 06 06 06',
  ],
  [
    'declined with an amount',
    'UBL',
    'Your transaction of PKR 5,000.00 at METRO was declined due to insufficient balance.',
  ],
  [
    'telco promo',
    'Ufone',
    'FREE BONUS Sirf Ap K lye, Rs 100 ya us se ziada k recharge per. Abhi recharge karen aur payen 2GB WhatsApp aur Facebook 3 din k liye',
  ],
] as const) {
  const r = parseSms(sender, body, templates)
  if (r.matched && r.kind === 'ignore') ok(`${label} is ignored`)
  else if (!r.matched) ok(`${label} does not match anything`)
  else no(`${label} produced a transaction`, r.fields)
}

console.log('== real Pakistani IBFT/RAAST formats ==')
// Captured from a live phone, then redacted: names and account numbers are
// replaced but every character of structure is preserved. Real identifiers
// must not live in the repo; the shapes are what the parser cares about.
//
// The shipped templates matched NONE of these, because every one puts the
// amount before the verb. These cases exist so that cannot regress.
const REAL: Array<{
  label: string
  body: string
  kind: string
  amount: number
  /** The user's own account. Null when the message never names it. */
  last4: string | null
  /** The other side. Set only where the message identifies it. */
  counterparty?: string | null
  fee?: number | null
}> = [
  {
    // The only account here is the RECIPIENT's, so `last4` must stay null and
    // the source gets resolved from the sending bank instead. Booking this
    // against 0123 would debit the account the money arrived in.
    label: 'Meezan IBFT out (amount first, fee in the same message)',
    body: 'Rs 1.00 sent to AHMED KHAN, A/C:  12520110590123 on 21/08/2026 at 00:39:08. Fee: Rs 1.55,  TID:721344000001 via IBFT',
    kind: 'purchase',
    amount: 1,
    last4: null,
    counterparty: '0123',
    fee: 1.55,
  },
  {
    // Faysal card spend. The verb phrase ("Debit Card purchase") FOLLOWS the
    // amount, which the original card template could not read at all — so a
    // genuine transaction was being dropped.
    label: 'Faysal card purchase (amount before the verb phrase)',
    body: 'PKR 330.87 Debit Card purchase at Name-Cheap.Com  * from FBL A/C *5555 on 21/AUG/2026 at 01:38:55 PM',
    kind: 'purchase',
    amount: 330.87,
    last4: '5555',
  },
  {
    label: 'UBL IBFT in ("in your UBL A/C")',
    body: 'PKR 1 received from AHMED K* in your UBL A/C *4444 on 21-AUG-2026 00:39 via IBFT. Tx ID 7014000001. For info: 111825888.',
    kind: 'credit',
    amount: 1,
    last4: '4444',
  },
  {
    label: 'Faysal RAAST in (two accounts named; ours is the one after "in")',
    body: 'PKR 1.00 received from AHMED K* UBL A/C *4444 via RAAST in FBL A/C *5555 on 21-Aug-26 at 12:40 AM Ref # 270040000001',
    kind: 'credit',
    amount: 1,
    last4: '5555',
  },
  {
    label: 'JazzCash RAAST in (wallet number, double space)',
    body: 'Rs 1.00 received   in your JazzCash Mobile Account:03001234567 via Raast. TID: 721344000002',
    kind: 'credit',
    amount: 1,
    last4: '4567',
  },
  {
    label: 'UBL IBFT in, large amount with grouping',
    body: 'PKR 50,000 received from AHMED K* in your UBL A/C *4444 on 21-MAY-2026 18:33 via IBFT. Tx ID 6622000001. For info: 111825888.',
    kind: 'credit',
    amount: 50000,
    last4: '4444',
  },
  {
    label: 'RAAST in, "Dear Customer" prefix, account after "from"',
    body: 'Dear Customer, PKR 48 received from ANK:CDC A/C 4444 FOR CD-NATF-D-41 on 21-MAY-2026 11:26 via RAAST for TX ID 6619000001.',
    kind: 'credit',
    amount: 48,
    last4: '4444',
  },
]

for (const c of REAL) {
  const r = parseSms('BANKALERT', c.body, templates)
  if (!r.matched) {
    no(`${c.label}: no template matched`, c.body.slice(0, 70))
    continue
  }
  if (r.kind !== c.kind) {
    no(`${c.label}: kind`, { expected: c.kind, actual: r.kind })
    continue
  }
  if (r.fields.amount !== c.amount) {
    no(`${c.label}: amount`, { expected: c.amount, actual: r.fields.amount })
    continue
  }
  // `last4` is asserted even when it is expected to be null. Skipping the
  // null case would silently excuse the exact bug this suite exists to catch:
  // an outgoing transfer booked against the RECIPIENT's account number.
  if (r.fields.last4 !== c.last4) {
    no(`${c.label}: account`, { expected: c.last4, actual: r.fields.last4 })
    continue
  }
  if (
    c.counterparty !== undefined &&
    r.fields.counterpartyLast4 !== c.counterparty
  ) {
    no(`${c.label}: counterparty`, {
      expected: c.counterparty,
      actual: r.fields.counterpartyLast4,
    })
    continue
  }
  if (c.fee !== undefined && r.fields.fee !== c.fee) {
    no(`${c.label}: fee`, { expected: c.fee, actual: r.fields.fee })
    continue
  }
  ok(
    `${c.label} -> ${r.kind} ${r.fields.amount} ours=${r.fields.last4} theirs=${r.fields.counterpartyLast4}`,
  )
}

console.log('== the fee in a transfer message is not the amount ==')
{
  const r = parseSms(
    'BANKALERT',
    'Rs 5,000.00 sent to AHMED KHAN, A/C:  12520110590123 on 21/08/2026 at 00:39:08. Fee: Rs 1.55,  TID:721344000001 via IBFT',
    templates,
  )
  if (r.matched && r.fields.amount === 5000) {
    ok('reads 5000, not the 1.55 fee')
  } else {
    no('fee was mistaken for the amount', r.matched ? r.fields : 'no match')
  }
}

console.log('== last4 always converges on the final four (routing) ==')
eq(normalizeLast4('*017432'), '7432', 'six-digit quote -> last four')
eq(normalizeLast4('12520110590508'), '0508', '14-digit tail -> last four')
eq(normalizeLast4('03001234567'), '4567', 'wallet number -> last four')

console.log('== reversals book as a credit, not ignored ==')
{
  const r = parseSms(
    'HBL',
    'Your transaction has been reversed. PKR 5,000.00 credited to your account ending 4821. Ref # 990011223',
    templates,
  )
  if (r.matched && r.kind === 'credit' && r.fields.amount === 5000)
    ok('reversal -> credit 5000')
  else no('reversal not booked as a credit', r.matched ? r.fields : 'no match')
}

console.log('== a real bundle purchase is NOT swallowed by the promo rule ==')
{
  const r = parseSms(
    'Jazz',
    'You have subscribed to Weekly Internet. Rs 120 deducted. Enjoy 5GB internet.',
    templates,
  )
  // It must NOT be ignored; either it books, or it lands unmatched for review.
  if (r.matched && r.kind === 'ignore')
    no('real bundle purchase was ignored', r.template.label)
  else ok('bundle purchase is not silently ignored')
}

console.log('== a bank cashback advert does NOT become a phantom expense ==')
{
  const r = parseSms(
    'HBL',
    'Ramzan Bachat! Har card purchase per Rs 50 cashback. Min purchase Rs 500 tak.',
    templates,
  )
  if (r.matched && r.kind !== 'ignore')
    no('cashback advert parsed as a real transaction', {
      kind: r.kind,
      amount: r.fields.amount,
    })
  else ok('cashback advert is ignored, not booked')
}

console.log('== a merchant containing "on" survives a dated terminator ==')
{
  const r = parseSms(
    'FBL',
    'PKR 330.87 Debit Card purchase at Books on Wheels on 21/AUG/2026 at 01:38:55 PM',
    templates,
  )
  if (r.matched && r.fields.merchantKey === 'BOOKS ON WHEELS')
    ok('Books on Wheels not truncated to Books')
  else
    no('merchant truncated at the word "on"', r.matched ? r.fields.merchant : 'no match')
}

console.log('== bank email: the shapes a real inbox actually sends ==')

// Email is the primary capture channel, yet every case above is an SMS. These
// come from a month of real bank mail, with names, accounts and references
// replaced — the wording, punctuation and field layout are what matter and are
// reproduced exactly, including the doubled colons Faysal emits.
const emails: {
  label: string
  sender: string
  body: string
  amount: number
  /** UTC instant, as ISO, that the body's wall-clock PKT time means. */
  when: string | null
  payee: string | null
  last4: string | null
}[] = [
  {
    // Faysal's IBFT *credit* splits the moment across two labels, unlike its
    // debit, which uses one `Date and Time`. With only the debit's pattern the
    // date parsed to nothing and the transaction fell back to when the 15-min
    // cron happened to sync it.
    label: 'Faysal IBFT credit (Transaction Date and Transaction Time apart)',
    sender: 'Faysal Bank <efbl@faysalbank.com>',
    body:
      'Dear ACCOUNT HOLDER,: Your account has been credited via Inter Bank Funds Transfer. ' +
      'Below are the transaction details: : Receiver Name:: ACCOUNT HOLDER: Receiver Bank:: FBL: ' +
      'Receiver Account No:: 3430****************5555: Sender Name:: AHMED KHAN: Sender Bank:: MBL: ' +
      'Sender Account No:: PK35****************4444: Transaction Date:: 23-Aug-2026: ' +
      'Transaction Time:: 04:10 PM: Amount Transferred:: PKR 20,000.00/-: ' +
      'Transaction Reference:: 1946977346:',
    amount: 20000,
    when: '2026-08-23T11:10:00.000Z',
    payee: 'Ahmed Khan',
    last4: '5555',
  },
  {
    label: 'Faysal IBFT debit (single Date and Time label)',
    sender: 'Faysal Bank Limited <efbl@faysalbank.com>',
    body:
      'Dear Customer, Your account has been debited via Inter Bank Funds Transfer. ' +
      'Below are the transaction details: Receiver Name:: SADIA NOOR : ' +
      'Receiver Account Number:: 0355***2455 : Receiver Bank:: Easypaisa Bank Ltd : ' +
      'Sender Account Number:: 3430********5555 : Sender Bank:: FBL: ' +
      'Transaction Amount:: PKR 130.00 : Date and Time:: 18-AUG-2026 06:45 AM : ' +
      'Transaction Reference:: 215536',
    amount: 130,
    when: '2026-08-18T01:45:00.000Z',
    payee: 'Sadia Noor',
    last4: '5555',
  },
  {
    // UBL had no email template at all and was being claimed by the generic
    // SMS "transfer sent" rule, which found the amount and nothing else — the
    // reason a UBL payment showed as **** in the ledger.
    //
    // last4 is deliberately null: UBL masks the account to two digits
    // (32*****33), and inventing a four-digit key from that could match the
    // wrong account. Sender-to-account mapping resolves it instead.
    label: 'UBL Raast payment email',
    sender: '<admin.ebanking@ubl.com.pk>',
    body:
      ' Dear ACCOUNT HOLDER , You paid PKR. 1.00 to AHMED KHAN via Raast. Here are the details: ' +
      'Account Title: ACCOUNT HOLDER Account Details: Town, City - 32*****33 ' +
      'Date: 21-Aug-2026 Time: 12:41:27 AM Transaction ID: 1328017674 ' +
      'Transaction Type: Inter Bank Funds Transfer Raast',
    amount: 1,
    when: '2026-08-20T19:41:27.000Z',
    payee: 'Ahmed Khan',
    last4: null,
  },
  {
    // Meezan quotes a 24-hour time under its own label; "17:30" must not be
    // read as 5:30am, which once put the two halves of one transfer 12 hours
    // apart and booked the payment twice.
    label: 'Meezan credit (24-hour time under a separate label)',
    sender: 'Meezan Bank Alert <no-reply@meezanbank.com>',
    body:
      ': Dear Customer, PKR 7,400.00 received to your account xxx4444 with the following details: ' +
      'Beneficiary Account : A.KHAN AC# RAAST PYMT PK94FAYS34307 Branch : SOME BRANCH ' +
      'Transaction Date : 24-Aug-2026 Transaction Time : 17:30 :',
    amount: 7400,
    when: '2026-08-24T12:30:00.000Z',
    payee: 'A Khan',
    last4: '4444',
  },
]

for (const c of emails) {
  const r = parseSms(c.sender, c.body, templates)
  if (!r.matched) {
    no(`${c.label}: matched no template`, c.body.slice(0, 60))
    continue
  }
  if (r.kind === 'ignore') {
    no(`${c.label}: was ignored`, r.template.label)
    continue
  }
  eq(r.fields.amount, c.amount, `${c.label}: amount`)
  eq(r.fields.occurredAt, c.when, `${c.label}: date and time`)
  eq(r.fields.merchant, c.payee, `${c.label}: payee`)
  eq(r.fields.last4, c.last4, `${c.label}: account`)
}

console.log('== the bank is read from the IBAN when no bank is named ==')
// An IBAN survives masking better than anything else in a bank alert:
// PK35MEZN******0508 hides the account and keeps MEZN. That is the only bank
// hint some messages carry, and without it two accounts sharing a last4 —
// two wallets on one phone number — cannot be told apart.
{
  const meezan = parseSms(
    'Meezan Bank Alert <no-reply@meezanbank.com>',
    ': Dear Customer, PKR 7,400.00 received to your account xxx4444 with the ' +
      'following details: Beneficiary Account : A.KHAN AC# RAAST PYMT ' +
      'PK94FAYS34307 Transaction Date : 24-Aug-2026 Transaction Time : 17:30 :',
    templates,
  )
  if (meezan.matched && meezan.kind !== 'ignore') {
    eq(meezan.fields.counterpartyBank, 'Faysal Bank', 'PK94FAYS -> Faysal Bank')
  } else {
    no('Meezan credit did not parse', meezan)
  }

  // A bank written in words outranks the code: it is the more specific claim,
  // and for a wallet it is the ONLY thing that separates two accounts sharing
  // a phone number.
  const named = parseSms(
    'Faysal Bank Limited <efbl@faysalbank.com>',
    'Dear Customer, Your account has been debited via Inter Bank Funds ' +
      'Transfer. Below are the transaction details: Receiver Name:: A HOLDER : ' +
      'Receiver Account Number:: 0304***9904 : Receiver Bank:: SadaPay : ' +
      'Sender Account Number:: 3430********5555 : Sender Bank:: FBL: ' +
      'Transaction Amount:: PKR 1,000.00 : Date and Time:: 01-SEP-2026 12:58 PM',
    templates,
  )
  if (named.matched && named.kind !== 'ignore') {
    eq(named.fields.counterpartyBank, 'SadaPay', 'a written bank name wins')
    eq(named.fields.counterpartyLast4, '9904', 'wallet number still read')
  } else {
    no('Faysal debit did not parse', named)
  }

  eq(bankFromIban('PK35MEZN******0508'), 'Meezan Bank', 'masked IBAN -> bank')
  eq(bankFromIban('3430********5555'), null, 'a bare account number names no bank')
  eq(bankFromIban('PK99ZZZZ0000'), null, 'an unknown code stays silent')
}

console.log('== email priced only in a foreign currency is never booked in PKR ==')
// A Namecheap receipt quotes $3.08 and no PKR anywhere. Only the bank knows
// what it converted to, so booking 3.08 as rupees would be an invented number.
const usdOnly = parseSms(
  'Namecheap Support <support@namecheap.com>',
  'Namecheap Order Summary Order Number : 211965006 Payment source : Credit Card ' +
    '***(* * * * 5016) Initial Charge : $3.08 Final Cost : $3.08',
  templates,
)
if (usdOnly.matched && usdOnly.kind !== 'ignore' && usdOnly.fields.amount != null)
  no('a USD-only receipt was booked as rupees', usdOnly.fields.amount)
else ok('USD-only receipt books nothing')

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
