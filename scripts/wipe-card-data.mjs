/**
 * Wipes all Lesson, Card, CardReview, and Sentence rows from Turso.
 * StudyDay (habit history) and Setting (user prefs) are NOT touched.
 *
 * Usage: node scripts/wipe-card-data.mjs
 * Run ONCE before a fresh full resync. Safe to re-run (idempotent DELETEs).
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv(filename) {
  const vars = {}
  try {
    for (const line of readFileSync(resolve(__dir, '..', filename), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
      if (m) vars[m[1]] = m[2]
    }
  } catch { /* file may not exist */ }
  return vars
}

const env = { ...parseEnv('.env'), ...parseEnv('.env.local') }
const url   = process.env.DATABASE_URL        ?? env.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? env.DATABASE_AUTH_TOKEN

if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
console.log('Connected to:', url)

// Count before
const before = {}
for (const t of ['Lesson', 'Card', 'CardReview', 'Sentence']) {
  const { rows } = await db.execute(`SELECT count(*) as n FROM "${t}"`)
  before[t] = Number(rows[0][0] ?? rows[0].n)
}
console.log('Rows before wipe:', before)
console.log()

// Delete in safe order (children before parents).
// Sentence and CardReview reference Card; Card references Lesson.
await db.executeMultiple(`
  DELETE FROM "Sentence";
  DELETE FROM "CardReview";
  DELETE FROM "Card";
  DELETE FROM "Lesson";
`)

// Verify
const after = {}
for (const t of ['Lesson', 'Card', 'CardReview', 'Sentence']) {
  const { rows } = await db.execute(`SELECT count(*) as n FROM "${t}"`)
  after[t] = Number(rows[0][0] ?? rows[0].n)
}
console.log('Rows after wipe:', after)
console.log()
console.log('Done. StudyDay and Setting rows were NOT touched.')
