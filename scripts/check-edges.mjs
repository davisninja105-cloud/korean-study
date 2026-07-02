/**
 * Read-only diagnostic: show CardDependency counts and recent edges.
 * Safe to run anytime — does NOT modify data.
 *
 * Usage:
 *   node scripts/check-edges.mjs            # summary + 10 most-recent edges
 *   node scripts/check-edges.mjs --recent 5  # show 5 most-recent edges
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

// --- Counts ---
const { rows: depRows }     = await db.execute(`SELECT count(*) as n FROM "CardDependency"`)
const { rows: compRows }    = await db.execute(`SELECT count(*) as n FROM "Card" WHERE "components" IS NOT NULL`)
const { rows: totalRows }   = await db.execute(`SELECT count(*) as n FROM "Card"`)
const { rows: lessonRows }  = await db.execute(`SELECT count(*) as n FROM "Lesson"`)
const { rows: selfRows }    = await db.execute(`SELECT count(*) as n FROM "CardDependency" WHERE "cardId" = "prerequisiteId"`)

const n = (r) => r[0].n ?? r[0][0]

console.log('=== CardDependency Diagnostic ===')
console.log(`Lessons:                ${n(lessonRows)}`)
console.log(`Total Cards:            ${n(totalRows)}`)
console.log(`Cards w/ components:    ${n(compRows)}`)
console.log(`CardDependency edges:   ${n(depRows)}`)
console.log(`Self-edges (should be 0): ${n(selfRows)}`)
console.log()

// --- Recent edges (join to show card fronts) ---
const limit = parseInt(process.argv.find(a => a === '--recent') ? process.argv[process.argv.indexOf('--recent') + 1] : '10', 10)

const { rows: recent } = await db.execute({
  sql: `SELECT
          d."createdAt",
          cf."front"      AS card_front,
          cf."components" AS card_components,
          pf."front"      AS prereq_front,
          pf."components" AS prereq_components
        FROM "CardDependency" d
        JOIN "Card" cf ON cf."id" = d."cardId"
        JOIN "Card" pf ON pf."id" = d."prerequisiteId"
        ORDER BY d."createdAt" DESC
        LIMIT ?`,
  args: [limit]
})

if (recent.length === 0) {
  console.log(`No CardDependency edges found.`)
} else {
  console.log(`=== ${recent.length} Most-Recent Edges ===`)
  console.log('(card → prerequisite ; both should have components)')
  console.log()
  for (const r of recent) {
    const ts = new Date(r.createdAt).toISOString().slice(0, 19)
    const comps = r.card_components ? JSON.parse(r.card_components) : []
    const pComps = r.prereq_components ? JSON.parse(r.prereq_components) : []
    console.log(`[${ts}] ${r.card_front}  →  ${r.prereq_front}`)
    console.log(`         card components:  [${comps.join(', ')}]`)
    console.log(`         prereq components: [${pComps.join(', ')}]`)
  }
}
