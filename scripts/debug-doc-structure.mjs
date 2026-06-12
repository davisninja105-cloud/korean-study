/**
 * Diagnostic: reports lessons that have no cards (ghost lessons from timed-out syncs).
 */
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
function parseEnv(f) {
  const v = {}
  try { for (const l of readFileSync(resolve(__dir, '..', f), 'utf8').split('\n')) { const m = l.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/); if (m) v[m[1]] = m[2] } } catch {}
  return v
}
const env = { ...parseEnv('.env'), ...parseEnv('.env.local') }
const db = createClient({ url: env.DATABASE_URL, authToken: env.DATABASE_AUTH_TOKEN })

const { rows } = await db.execute(`
  SELECT l.id, l.orderIndex, l.title,
         COUNT(c.id) as cardCount
  FROM "Lesson" l
  LEFT JOIN "Card" c ON c.lessonId = l.id
  GROUP BY l.id
  ORDER BY l.orderIndex
`)

console.log('All lessons and their card counts:')
let ghosts = 0
for (const r of rows) {
  const count = Number(r[3] ?? r.cardCount)
  const ghost = count === 0 ? ' ← NO CARDS (ghost)' : ''
  console.log(`  Lesson ${r[1] ?? r.orderIndex}: ${count} cards${ghost}`)
  if (count === 0) ghosts++
}
console.log(`\nTotal: ${rows.length} lessons, ${ghosts} ghosts`)
