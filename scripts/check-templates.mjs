// Pulls field_patterns straight out of the migration and runs them against
// redacted copies of real messages, so template and test cannot drift.
//
// match_pattern is deliberately simplified here: this checks field extraction,
// which is where the bugs live. Template selection is covered by parser.test.ts.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Resolved against this file, not the shell's cwd, so it runs from anywhere.
const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
import { parseSms } from '../supabase/functions/_shared/parser.ts'

const sql = readFileSync(
  join(repo, 'supabase/migrations/20260821090000_pk_transfer_templates.sql'),
  'utf8',
)
const blocks = sql
  .split('$json$')
  .filter((_, i) => i % 2 === 1)
  .map((b) => JSON.parse(b))

const meta = [
  { kind: 'purchase', match: 'sent', label: 'sent' },
  { kind: 'credit', match: 'received', label: 'received' },
  { kind: 'purchase', match: 'spent|debited|withdraw', label: 'card' },
]

const templates = blocks.map((fp, i) => ({
  id: String(i),
  user_id: null,
  bank_key: 'generic',
  label: meta[i].label,
  sender_pattern: '.*',
  match_pattern: meta[i].match,
  field_patterns: fp,
  kind: meta[i].kind,
  priority: 200 + i,
}))
console.log(`loaded ${templates.length} templates from the migration\n`)

const cases = [
  {
    label: 'Meezan IBFT out',
    body: 'Rs 1.00 sent to AHMED KHAN, A/C:  12520110590123 on 21/08/2026 at 00:39:08. Fee: Rs 1.55,  TID:721344000001 via IBFT',
    kind: 'purchase', amount: 1, last4: null, cp: '0123', fee: 1.55,
  },
  {
    label: 'UBL IBFT in',
    body: 'PKR 1 received from AHMED K* in your UBL A/C *4444 on 21-AUG-2026 00:39 via IBFT. Tx ID 7014000001. For info: 111825888.',
    kind: 'credit', amount: 1, last4: '4444', cp: null, fee: null,
  },
  {
    label: 'Faysal RAAST in (2 a/c)',
    body: 'PKR 1.00 received from AHMED K* UBL A/C *4444 via RAAST in FBL A/C *5555 on 21-Aug-26 at 12:40 AM Ref # 270040000001',
    kind: 'credit', amount: 1, last4: '5555', cp: '4444', fee: null,
  },
  {
    label: 'JazzCash RAAST in',
    body: 'Rs 1.00 received   in your JazzCash Mobile Account:03001234567 via Raast. TID: 721344000002',
    kind: 'credit', amount: 1, last4: '4567', cp: null, fee: null,
  },
  {
    label: 'UBL big amount in',
    body: 'PKR 50,000 received from AHMED K* in your UBL A/C *4444 on 21-MAY-2026 18:33 via IBFT. Tx ID 6622000001. For info: 111825888.',
    kind: 'credit', amount: 50000, last4: '4444', cp: null, fee: null,
  },
  {
    label: 'RAAST in, Dear Customer',
    body: 'Dear Customer, PKR 48 received from ANK:CDC A/C 4444 FOR CD-NATF-D-41 on 21-MAY-2026 11:26 via RAAST for TX ID 6619000001.',
    kind: 'credit', amount: 48, last4: '4444', cp: null, fee: null,
  },
  {
    label: 'card spend w/ balance',
    body: 'PKR 2,500.00 spent at CAFE ZOUK using card ending 4821 on 21-Aug-26. Available balance PKR 45,678.00',
    kind: 'purchase', amount: 2500, last4: '4821', cp: null, fee: null,
  },
]

let pass = 0
let fail = 0
for (const c of cases) {
  const r = parseSms('BANKALERT', c.body, templates)
  if (!r.matched) {
    console.log(`FAIL  ${c.label}: no template matched`)
    fail++
    continue
  }
  const f = r.fields
  const problems = []
  if (r.kind !== c.kind) problems.push(`kind ${r.kind} != ${c.kind}`)
  if (f.amount !== c.amount) problems.push(`amount ${f.amount} != ${c.amount}`)
  if (f.last4 !== c.last4) problems.push(`last4 ${f.last4} != ${c.last4}`)
  if (f.counterpartyLast4 !== c.cp)
    problems.push(`counterparty ${f.counterpartyLast4} != ${c.cp}`)
  if (f.fee !== c.fee) problems.push(`fee ${f.fee} != ${c.fee}`)

  if (problems.length) {
    console.log(`FAIL  ${c.label}\n      ${problems.join('\n      ')}`)
    fail++
  } else {
    console.log(
      `PASS  ${c.label.padEnd(26)} ${r.kind.padEnd(8)} amt=${String(f.amount).padEnd(7)} ours=${f.last4 ?? '-'} theirs=${f.counterpartyLast4 ?? '-'} fee=${f.fee ?? '-'}`,
    )
    pass++
  }
}
console.log(`\npassed ${pass}  failed ${fail}`)
process.exit(fail ? 1 : 0)
