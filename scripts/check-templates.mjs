// Validates every parser template shipped in a migration:
//  1. its field_patterns block is valid JSON (dollar-quoting hides SQL errors
//     that only surface at apply time), and
//  2. every field regex compiles — an unescaped brace or stray quantifier in
//     a pattern would otherwise fail silently inside the Edge Function.
//
// Globs all migrations, so a new template file is covered for free.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(repo, 'supabase/migrations')

let blocks = 0
let patterns = 0
let bad = 0

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
  const raw = sql.split('$json$').filter((_, i) => i % 2 === 1)

  for (const chunk of raw) {
    let fields
    try {
      fields = JSON.parse(chunk)
    } catch (e) {
      console.log(`FAIL  ${file}: field_patterns is not valid JSON — ${e.message}`)
      bad++
      continue
    }
    blocks++

    for (const [field, value] of Object.entries(fields)) {
      const list = Array.isArray(value) ? value : [value]
      for (const pattern of list) {
        patterns++
        try {
          new RegExp(pattern, 'i')
        } catch (e) {
          console.log(`FAIL  ${file}: ${field} regex does not compile — ${e.message}`)
          console.log(`        ${pattern}`)
          bad++
        }
      }
    }
  }
}

console.log(
  `\nchecked ${blocks} template blocks, ${patterns} field patterns — ${bad} bad`,
)
process.exit(bad ? 1 : 0)
