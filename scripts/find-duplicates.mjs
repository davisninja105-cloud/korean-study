/**
 * Scans the full card database for near-duplicate fronts.
 *
 * Uses a two-level fuzzy key:
 *   Level 1 (normalizedFront): already stored — strips English glosses in parens.
 *   Level 2 (superNormalized): strips everything further:
 *     - removes all ~ characters (grammar pattern markers)
 *     - removes all parenthetical groups entirely (including Hangul morpheme
 *       variants like (으), (아/어), (이), (ㄹ), etc.)
 *     - collapses whitespace
 *
 * Cards that share the same level-2 key but differ at level-1 are likely
 * near-duplicates of the same concept.
 *
 * Usage: node scripts/find-duplicates.mjs
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

const { rows } = await db.execute(
  `SELECT id, front, normalizedFront, back, type FROM "Card" ORDER BY normalizedFront`
)

/** Strip everything to a bare Hangul core for fuzzy comparison. */
function superNormalize(front) {
  return front
    .normalize('NFC')
    // Remove all ~ (grammar markers)
    .replace(/~/g, '')
    // Remove all parenthetical groups (any content in parens, including Hangul)
    .replace(/\([^)]*\)/g, '')
    // Remove slash-alternates like 아/어, ㄹ/을, etc. — keep both sides
    // by just removing the slash so "아/어" becomes "아어"
    // (don't do this — it changes meaning; leave slashes as-is)
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Group by superNormalized key
const groups = new Map()
for (const row of rows) {
  const front = row.front ?? row[1]
  const normFront = row.normalizedFront ?? row[2]
  const back  = row.back  ?? row[3]
  const type  = row.type  ?? row[4]
  const id    = row.id    ?? row[0]

  const key = superNormalize(normFront || front)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push({ id, front, normalizedFront: normFront, back, type })
}

// Find groups with more than one card — those are potential duplicates
const duplicateGroups = [...groups.entries()]
  .filter(([, cards]) => cards.length > 1)
  .sort((a, b) => b[1].length - a[1].length)  // most members first

console.log(`Total cards scanned : ${rows.length}`)
console.log(`Unique fuzzy keys   : ${groups.size}`)
console.log(`Potential duplicate groups: ${duplicateGroups.length}`)
console.log()

if (duplicateGroups.length === 0) {
  console.log('✓ No near-duplicates found.')
  process.exit(0)
}

for (const [key, cards] of duplicateGroups) {
  console.log(`── Fuzzy key: "${key}" (${cards.length} cards) ──`)
  for (const c of cards) {
    console.log(`   [${c.type}] front: "${c.front}"`)
    console.log(`            back:  "${c.back}"`)
    console.log(`            id:    ${c.id}`)
  }
  console.log()
}

console.log(`Found ${duplicateGroups.length} group(s) with potential near-duplicates.`)
console.log('Review the list above and delete the weaker card(s) via the Cards tab in the app,')
console.log('or run: DELETE FROM "Card" WHERE id = \'<id>\' in turso db shell korean-study')
