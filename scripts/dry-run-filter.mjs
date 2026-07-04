/**
 * Read-only diagnostic: report how many stored Card.components[] entries the
 * new deck-lookup filter (lib/filter-components.ts) would drop, broken out
 * per Card.type (grammar / vocabulary / phrase). Does NOT modify data.
 *
 * This is the Success Criterion 4 gate: the drop rate MUST be reviewed
 * BEFORE the filter is wired into the sync write path (plan 16-03), since a
 * disproportionately high grammar-type drop rate would indicate the filter
 * is gutting legitimate abstract grammar-pattern edges (RESEARCH.md
 * Pitfall 4) rather than only dropping fabrications.
 *
 * Usage:
 *   node scripts/dry-run-filter.mjs
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

// Re-derived from lib/card-key.ts — must mirror it exactly (plain .mjs script
// cannot import the TypeScript module).
// WR-04: the Hangul-detection regex MUST stay byte-for-byte identical to
// lib/card-key.ts's — it previously omitted Hangul Compatibility Jamo,
// Hangul Jamo Extended-A, and Hangul Jamo Extended-B, which would cause this
// script's normalizeFront() to diverge from production for any component
// whose trailing-paren content falls only in one of those ranges.
function normalizeFront(front) {
  let s = front.normalize('NFC').trim().replace(/\s+/g, ' ')
  const match = s.match(/\s*\(([^)]*)\)\s*$/)
  if (match) {
    const inner = match[1]
    const hasHangul = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(inner)
    const hasAscii  = /[A-Za-z0-9]/.test(inner)
    if (!hasHangul && hasAscii) {
      s = s.slice(0, s.length - match[0].length).trim()
    }
  }
  return s
}

// Re-derived from lib/sentence-match.ts — must mirror it exactly.
const PARTICLES_MULTI = [
  '에게서', '한테서', '으로서', '으로써',
  '에서', '에게', '한테', '에다', '부터', '까지', '처럼', '보다',
  '마다', '밖에', '이나', '라도', '으로', '라고', '께서',
]
const PARTICLES_SINGLE = ['은', '는', '이', '가', '을', '를', '에', '와', '과', '의', '로', '께']

function splitParticle(targetForm) {
  for (const p of PARTICLES_MULTI) {
    if (targetForm.length > p.length && targetForm.endsWith(p)) {
      return { stem: targetForm.slice(0, -p.length), particle: p }
    }
  }
  if (targetForm.length >= 3) {
    for (const p of PARTICLES_SINGLE) {
      if (targetForm.endsWith(p)) {
        return { stem: targetForm.slice(0, -1), particle: p }
      }
    }
  }
  return { stem: targetForm, particle: '' }
}

// Re-derived from lib/filter-components.ts — must reproduce its keep/drop
// decisions identically.
function isKept(comp, deckSet) {
  if (deckSet.has(normalizeFront(comp))) return true
  const { stem } = splitParticle(comp)
  if (stem && stem !== comp && deckSet.has(normalizeFront(stem))) return true
  return false
}

// Load ALL cards (no WHERE clause) — the deck-lookup Set must be built from
// every card, not just cards that themselves have components (RESEARCH.md
// Pitfall 1: scoping this query would silently under-populate the deck Set).
const { rows: cardRows } = await db.execute(
  `SELECT "id","type","components","normalizedFront" FROM "Card"`
)
console.log(`Loaded ${cardRows.length} total cards.`)

const deckSet = new Set()
for (const row of cardRows) {
  const nf = row.normalizedFront ?? row[3]
  if (nf) deckSet.add(nf)
}

// Tally per Card.type: total components seen, kept, dropped.
const tally = {
  grammar:    { total: 0, kept: 0, dropped: 0 },
  vocabulary: { total: 0, kept: 0, dropped: 0 },
  phrase:     { total: 0, kept: 0, dropped: 0 },
}
let malformed = 0

for (const row of cardRows) {
  const type      = row.type ?? row[1]
  const compStr   = row.components ?? row[2]
  if (!compStr) continue

  let comps
  try {
    comps = JSON.parse(compStr)
  } catch (e) {
    malformed++
    console.warn(`  Skipping malformed components JSON on card ${row.id ?? row[0]}:`, e.message)
    continue
  }
  if (!Array.isArray(comps)) continue

  const bucket = tally[type] ?? (tally[type] = { total: 0, kept: 0, dropped: 0 })
  for (const comp of comps) {
    if (!comp || typeof comp !== 'string') continue
    bucket.total++
    if (isKept(comp, deckSet)) {
      bucket.kept++
    } else {
      bucket.dropped++
    }
  }
}

console.log()
console.log('=== filterComponents Dry-Run Report ===')
console.log('(read-only — no data was modified)')
console.log()

let grandTotal = 0
let grandDropped = 0

for (const type of ['grammar', 'vocabulary', 'phrase', ...Object.keys(tally).filter(t => !['grammar', 'vocabulary', 'phrase'].includes(t))]) {
  const t = tally[type]
  if (!t) continue
  grandTotal += t.total
  grandDropped += t.dropped
  const pct = t.total > 0 ? ((t.dropped / t.total) * 100).toFixed(1) : '0.0'
  console.log(`${type.padEnd(12)} dropped/total: ${t.dropped}/${t.total} (${pct}%)`)
}

console.log()
const grandPct = grandTotal > 0 ? ((grandDropped / grandTotal) * 100).toFixed(1) : '0.0'
console.log(`WHOLE CORPUS  dropped/total: ${grandDropped}/${grandTotal} (${grandPct}%)`)
if (malformed > 0) {
  console.log(`\n(${malformed} card(s) had malformed components JSON and were skipped)`)
}
console.log('\nDone. No writes were performed.')
