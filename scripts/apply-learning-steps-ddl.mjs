/**
 * One-time DDL: adds CardReview.learningSteps / ReviewLog.learningSteps to Turso.
 * Run ONCE after editing prisma/schema.prisma and running `npx prisma generate`.
 * Phase 27-01 fix: persists ts-fsrs's internal learning_steps index so cards
 * graded "Good" repeatedly in the Learning state actually graduate instead of
 * looping forever at a fixed 10-minute interval.
 *
 * Usage:
 *   node scripts/apply-learning-steps-ddl.mjs
 *
 * DO NOT re-run — ALTER TABLE ADD COLUMN is not idempotent (errors on second run
 * with "duplicate column name", which is the expected/safe failure mode).
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
console.log('Connected to Turso (URL scheme:', url.split(':')[0] + ':)')

try {
  await db.executeMultiple(`
    ALTER TABLE "CardReview" ADD COLUMN "learningSteps" INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE "ReviewLog" ADD COLUMN "learningSteps" INTEGER NOT NULL DEFAULT 0;
  `)
  console.log('learningSteps columns added to CardReview and ReviewLog.')
} catch (e) {
  console.error('DDL failed:', e.message)
  process.exit(1)
}

// Verify
const cr = await db.execute(`SELECT learningSteps FROM "CardReview" LIMIT 1`)
const rl = await db.execute(`SELECT learningSteps FROM "ReviewLog" LIMIT 1`)
console.log('CardReview.learningSteps column readable:', cr.columns.includes('learningSteps'))
console.log('ReviewLog.learningSteps column readable:', rl.columns.includes('learningSteps'))
console.log('Done.')
