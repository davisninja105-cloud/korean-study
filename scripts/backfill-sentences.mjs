/**
 * One-time backfill: converts each Card's legacy cloze columns into a Sentence row.
 * Idempotent — skips any card that already has Sentence rows.
 *
 * Usage (run AFTER apply-sentence-ddl.mjs):
 *   node scripts/backfill-sentences.mjs
 *
 * DO NOT re-run after it completes successfully.
 *
 * Pre-flight check emitted before writing: how many cloze rows lack '___' or where
 * clozeAnswer isn't a substring of the reconstructed korean — those produce a
 * no-op highlight/blank (kept in DB, just won't highlight until edited).
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dir, '..', '.env')
const envVars = {}
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
    if (m) envVars[m[1]] = m[2]
  }
} catch { /* .env may not exist */ }

const url   = process.env.DATABASE_URL        ?? envVars.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? envVars.DATABASE_AUTH_TOKEN

if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
console.log('Connected to:', url)

// 1. Load all cards that have cloze data
const { rows: clozeCards } = await db.execute(
  `SELECT id, clozeSentence, clozeAnswer, clozeTranslation
   FROM "Card"
   WHERE clozeSentence IS NOT NULL AND clozeAnswer IS NOT NULL`
)
console.log(`Cards with cloze data: ${clozeCards.length}`)

// 2. Pre-flight: count imperfect matches
let noBlank = 0
let answerNotSubstring = 0
for (const row of clozeCards) {
  const cs   = row[1] ?? row.clozeSentence
  const ca   = row[2] ?? row.clozeAnswer
  const korean = cs.includes('___') ? cs.replace('___', ca) : cs
  if (!cs.includes('___')) noBlank++
  if (!korean.includes(ca)) answerNotSubstring++
}
console.log(`  Pre-flight: ${noBlank} rows lack '___' (will use clozeSentence as-is)`)
console.log(`  Pre-flight: ${answerNotSubstring} rows where clozeAnswer not a substring of reconstructed sentence (no-op highlight)`)

// 3. Load cards that ALREADY have Sentence rows (to skip)
const { rows: existing } = await db.execute(
  `SELECT DISTINCT cardId FROM "Sentence"`
)
const alreadyDone = new Set(existing.map((r) => r[0] ?? r.cardId))
console.log(`Cards already backfilled: ${alreadyDone.size}`)

// 4. Insert Sentence rows
let inserted = 0
let skipped = 0
for (const row of clozeCards) {
  const cardId    = row[0] ?? row.id
  const cs        = row[1] ?? row.clozeSentence
  const ca        = row[2] ?? row.clozeAnswer
  const ct        = row[3] ?? row.clozeTranslation ?? ''

  if (alreadyDone.has(cardId)) { skipped++; continue }

  // Reconstruct the full sentence (no blank)
  const korean = cs.includes('___') ? cs.replace('___', ca) : cs

  const id = `backfill_${cardId}` // deterministic; unique per card

  try {
    await db.execute({
      sql: `INSERT INTO "Sentence" (id, cardId, korean, targetForm, translation, orderIndex, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [id, cardId, korean, ca, ct],
    })
    inserted++
  } catch (e) {
    // Duplicate key = already inserted (e.g. partial previous run)
    if (e.message?.includes('UNIQUE constraint failed')) {
      skipped++
    } else {
      console.error(`Failed for card ${cardId}:`, e.message)
    }
  }
}

console.log(`\nDone. Inserted: ${inserted}, Skipped (already had rows): ${skipped}`)

// 5. Verify total
const { rows: total } = await db.execute(`SELECT count(*) FROM "Sentence"`)
console.log(`Total Sentence rows now: ${total[0][0] ?? total[0]['count(*)']}`)
