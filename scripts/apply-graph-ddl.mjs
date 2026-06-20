/**
 * One-time DDL: adds the knowledge-graph columns and CardDependency table to Turso.
 *
 * Adds to Card table:
 *   - normalizedFront TEXT (dedup key, must be unique — run AFTER wipe-card-data.mjs
 *     since adding a UNIQUE column to a non-empty table would fail if values aren't unique)
 *   - components TEXT (JSON string[] of component lemmas, nullable)
 *
 * Creates:
 *   - CardDependency table with (cardId, prerequisiteId) @@unique
 *   - Indexes on CardDependency.cardId and CardDependency.prerequisiteId
 *
 * Usage (run ONCE, after wipe-card-data.mjs):
 *   node scripts/apply-graph-ddl.mjs
 *
 * Idempotent: uses IF NOT EXISTS / IF (column doesn't exist) patterns.
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

// --- 1. Add normalizedFront column to Card ---
// SQLite does not support ALTER TABLE … ADD COLUMN … UNIQUE directly for a new column
// on a non-empty table. We assume the table is empty (wipe ran first) so the UNIQUE
// index can be added as a separate step without violating constraints.
try {
  await db.execute(`ALTER TABLE "Card" ADD COLUMN "normalizedFront" TEXT NOT NULL DEFAULT ''`)
  console.log('Added Card.normalizedFront column.')
} catch (e) {
  if (e.message?.includes('duplicate column name')) {
    console.log('Card.normalizedFront already exists — skipping.')
  } else {
    throw e
  }
}

// Add UNIQUE index on normalizedFront (safe now that the table should be empty).
try {
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Card_normalizedFront_key" ON "Card"("normalizedFront")`
  )
  console.log('Created UNIQUE index on Card.normalizedFront.')
} catch (e) {
  console.error('Failed to create UNIQUE index on normalizedFront:', e.message)
  throw e
}

// --- 2. Add components column to Card ---
try {
  await db.execute(`ALTER TABLE "Card" ADD COLUMN "components" TEXT`)
  console.log('Added Card.components column.')
} catch (e) {
  if (e.message?.includes('duplicate column name')) {
    console.log('Card.components already exists — skipping.')
  } else {
    throw e
  }
}

// --- 3. Add lessonId index ---
try {
  await db.execute(`CREATE INDEX IF NOT EXISTS "Card_lessonId_idx" ON "Card"("lessonId")`)
  console.log('Created index on Card.lessonId.')
} catch (e) {
  console.warn('lessonId index skipped:', e.message)
}

// --- 4. Create CardDependency table ---
try {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "CardDependency" (
      "id"             TEXT NOT NULL PRIMARY KEY,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cardId"         TEXT NOT NULL,
      "prerequisiteId" TEXT NOT NULL,
      FOREIGN KEY ("cardId")         REFERENCES "Card"("id") ON DELETE CASCADE,
      FOREIGN KEY ("prerequisiteId") REFERENCES "Card"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "CardDependency_cardId_prerequisiteId_key"
      ON "CardDependency"("cardId", "prerequisiteId");
    CREATE INDEX IF NOT EXISTS "CardDependency_cardId_idx"
      ON "CardDependency"("cardId");
    CREATE INDEX IF NOT EXISTS "CardDependency_prerequisiteId_idx"
      ON "CardDependency"("prerequisiteId");
  `)
  console.log('CardDependency table and indexes created (or already existed).')
} catch (e) {
  console.error('CardDependency DDL failed:', e.message)
  throw e
}

// --- Verify ---
const { rows: cardCols } = await db.execute(`PRAGMA table_info("Card")`)
const colNames = cardCols.map((r) => r.name ?? r[1])
console.log('\nCard columns:', colNames.join(', '))

const { rows: depRows } = await db.execute(`SELECT count(*) as n FROM "CardDependency"`)
console.log('CardDependency row count:', depRows[0][0] ?? depRows[0].n)

console.log('\nDone. Run wipe-card-data.mjs → full resync to populate the DB.')
