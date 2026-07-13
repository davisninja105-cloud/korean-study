/**
 * One-time DDL: adds an index on Sentence.cardId to Turso.
 *
 * Sentence rows are looked up by cardId constantly (every card-list/study
 * query includes its sentences), but the FK column had no index — every
 * other FK column in the schema (CardDependency.cardId/prerequisiteId,
 * Card.lessonId) already does. This closes that gap.
 *
 * Generated via: npx prisma migrate diff --from-empty --to-schema
 *   prisma/schema.prisma --script, hand-picking ONLY the new
 *   CREATE INDEX "Sentence_cardId_idx" statement — every table already
 *   exists in production, so nothing else from that diff is run here.
 *
 * Usage (run ONCE):
 *   node scripts/apply-sentence-index-ddl.mjs
 *
 * Idempotent: CREATE INDEX IF NOT EXISTS.
 * No DROP/ALTER/DELETE — this runs against the live production Turso DB.
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

const env   = { ...parseEnv('.env'), ...parseEnv('.env.local') }
const url   = process.env.DATABASE_URL        ?? env.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? env.DATABASE_AUTH_TOKEN

if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
console.log('Connected to:', url)

try {
  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS "Sentence_cardId_idx" ON "Sentence"("cardId");
  `)
  console.log('Created index on Sentence.cardId (or already existed).')
} catch (e) {
  console.error('Sentence.cardId index DDL failed:', e.message)
  throw e
}

// --- Verify ---
const { rows } = await db.execute(`PRAGMA index_list('Sentence')`)
console.log('\nSentence indexes:', JSON.stringify(rows))
const hasIndex = rows.some((r) => String(r.name ?? r[1]).includes('cardId'))
console.log(hasIndex ? 'PASS: Sentence_cardId_idx present.' : 'FAIL: index not found.')
if (!hasIndex) process.exit(1)
