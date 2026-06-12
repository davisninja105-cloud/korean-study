/**
 * One-time migration: adds orderIndex to Lesson and backfills 1..N by createdAt.
 * Run against both local dev DB and Turso by setting DATABASE_URL / DATABASE_AUTH_TOKEN.
 *
 * Usage:
 *   node scripts/add-lesson-order.mjs
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dep needed — just parse KEY="VALUE" lines)
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

// 1. Add the column (silently ignore if it already exists)
try {
  await db.execute(`ALTER TABLE "Lesson" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0`)
  console.log('Column orderIndex added.')
} catch (e) {
  if (e.message?.includes('duplicate column')) {
    console.log('Column orderIndex already exists — skipping ALTER.')
  } else {
    throw e
  }
}

// 2. Read all lessons ordered by createdAt ASC
const { rows } = await db.execute(`SELECT id FROM "Lesson" ORDER BY createdAt ASC`)
console.log(`Backfilling ${rows.length} lessons...`)

// 3. Assign sequential 1..N
for (let i = 0; i < rows.length; i++) {
  const id = rows[i][0] ?? rows[i].id
  await db.execute({ sql: `UPDATE "Lesson" SET "orderIndex" = ? WHERE id = ?`, args: [i + 1, id] })
}

console.log('Done. Lesson orderIndex values:')
const { rows: check } = await db.execute(`SELECT id, orderIndex, createdAt FROM "Lesson" ORDER BY orderIndex ASC LIMIT 20`)
for (const row of check) {
  console.log(' ', row[1] ?? row.orderIndex, '|', (row[2] ?? row.createdAt)?.toString().slice(0, 19))
}
