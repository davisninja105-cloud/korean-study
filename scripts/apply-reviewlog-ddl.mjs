/**
 * One-time DDL: creates the ReviewLog table in Turso.
 * Run ONCE after editing prisma/schema.prisma and running `npx prisma generate`.
 *
 * Usage:
 *   node scripts/apply-reviewlog-ddl.mjs
 *
 * DO NOT re-run — it is idempotent (skips on "already exists") but unnecessary.
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dep needed)
const envPath = resolve(__dir, '..', '.env')
const envVars = {}
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
    if (m) envVars[m[1]] = m[2]
  }
} catch { /* .env may not exist in some envs */ }

const url   = process.env.DATABASE_URL        ?? envVars.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? envVars.DATABASE_AUTH_TOKEN

if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
console.log('Connected to:', url)

// Create the ReviewLog table (ignore if it already exists)
try {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "ReviewLog" (
      "id"             TEXT NOT NULL PRIMARY KEY,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cardId"         TEXT NOT NULL,
      "rating"         INTEGER NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "state"          INTEGER NOT NULL,
      "stability"      REAL NOT NULL,
      "difficulty"     REAL NOT NULL,
      "elapsedDays"    INTEGER NOT NULL,
      "scheduledDays"  INTEGER NOT NULL,
      "reps"           INTEGER NOT NULL,
      "lapses"         INTEGER NOT NULL,
      "nextReview"     DATETIME NOT NULL,
      "lastReview"     DATETIME,
      FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ReviewLog_idempotencyKey_key" ON "ReviewLog"("idempotencyKey");
    CREATE INDEX IF NOT EXISTS "ReviewLog_cardId_idx" ON "ReviewLog"("cardId");
    CREATE INDEX IF NOT EXISTS "ReviewLog_createdAt_idx" ON "ReviewLog"("createdAt");
  `)
  console.log('ReviewLog table + indexes created (or already existed).')
} catch (e) {
  console.error('DDL failed:', e.message)
  process.exit(1)
}

// Verify
const { rows } = await db.execute(`SELECT count(*) as n FROM "ReviewLog"`)
console.log('ReviewLog row count:', rows[0][0] ?? rows[0].n)
console.log('Done.')
