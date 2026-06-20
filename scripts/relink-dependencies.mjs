/**
 * Optional one-time script: rebuild ALL CardDependency edges from each card's
 * stored `components` JSON column.
 *
 * Useful after a full resync completes so that cross-lesson forward references
 * (component A in lesson 3 that wasn't yet a card when lesson 1 was synced)
 * get linked retroactively. Idempotent via the @@unique([cardId, prerequisiteId])
 * constraint — safe to re-run.
 *
 * Usage:
 *   node scripts/relink-dependencies.mjs
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

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

// Load all cards that have components.
const { rows: cardRows } = await db.execute(
  `SELECT "id", "normalizedFront", "components" FROM "Card" WHERE "components" IS NOT NULL`
)
console.log(`Found ${cardRows.length} cards with components.`)

// Build normalizedFront → id map.
const keyToId = new Map()
for (const row of cardRows) {
  const id  = row.id  ?? row[0]
  const nf  = row.normalizedFront ?? row[1]
  keyToId.set(nf, id)
}

function normalizeFront(front) {
  // Must mirror lib/card-key.ts logic.
  let s = front.normalize('NFC').trim().replace(/\s+/g, ' ')
  const match = s.match(/\s*\(([^)]*)\)\s*$/)
  if (match) {
    const inner = match[1]
    const hasHangul = /[가-힣ᄀ-ᇿ]/.test(inner)
    const hasAscii  = /[A-Za-z0-9]/.test(inner)
    if (!hasHangul && hasAscii) {
      s = s.slice(0, s.length - match[0].length).trim()
    }
  }
  return s
}

let created = 0
let skipped = 0
let failed  = 0

for (const row of cardRows) {
  const cardId  = row.id  ?? row[0]
  const myKey   = row.normalizedFront ?? row[1]
  const compStr = row.components ?? row[2]

  let comps
  try { comps = JSON.parse(compStr) } catch { continue }
  if (!Array.isArray(comps)) continue

  for (const comp of comps) {
    if (!comp || typeof comp !== 'string') continue
    const prereqId = keyToId.get(normalizeFront(comp))
    if (!prereqId || prereqId === cardId) continue

    // Upsert: INSERT OR IGNORE to skip existing edges.
    const id = randomBytes(16).toString('hex')
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO "CardDependency" ("id","createdAt","cardId","prerequisiteId")
              VALUES (?,CURRENT_TIMESTAMP,?,?)`,
        args: [id, cardId, prereqId],
      })
      created++
    } catch (e) {
      console.warn(`  Link failed (${myKey} → ${comp}):`, e.message)
      failed++
    }
  }
}

const { rows: total } = await db.execute(`SELECT count(*) as n FROM "CardDependency"`)
console.log(`\nEdges created/confirmed: ${created}`)
console.log(`Skipped (no matching card): ${skipped}`)
console.log(`Failed: ${failed}`)
console.log(`Total CardDependency rows: ${total[0][0] ?? total[0].n}`)
console.log('\nDone.')
