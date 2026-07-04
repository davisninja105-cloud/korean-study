/**
 * Retroactive corpus cleanup: re-applies the plan 16-01 deck-lookup
 * `filterComponents()` filter to EVERY already-persisted `Card.components`
 * row, rewrites the ones that changed, and reconciles `CardDependency`
 * edges to match (prunes stale/spurious edges, adds newly-valid leaf-node
 * edges). This closes GRAPH-03 Success Criterion 1 for cards synced BEFORE
 * the plan 16-03 write-path fix — those rows were built from unfiltered
 * Claude output and a narrowly-scoped keyToId map.
 *
 * DRY-RUN BY DEFAULT — reports before/after counts, writes NOTHING.
 * Mutates the live Turso corpus ONLY when passed --apply.
 *
 * ⚠️  --apply performs a real, hard-to-reverse production write. Run this
 * locally as a developer. NEVER call this from the `/api/sync` request path
 * or any other automated/unattended context.
 *
 * Usage:
 *   npx tsx scripts/retro-filter-cleanup.mts            # dry run — reports only, NO writes
 *   npx tsx scripts/retro-filter-cleanup.mts --apply     # mutates production
 *
 * Idempotent: re-running after --apply should report 0 cards to change and
 * 0 edges to prune/add.
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env / .env.local.
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma sees the right env vars) —
// mirrors scripts/local-resync.mts:12-27.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at module init.
const { filterComponents } = await import('../lib/filter-components.js')
const { normalizeFront }   = await import('../lib/card-key.js')
const { prisma }           = await import('../lib/prisma.js')

const APPLY = process.argv.includes('--apply')

// Human-approved plan 16-01 dry-run baseline (16-01-SUMMARY.md), for
// comparison against this retroactive pass. This corpus can have grown
// since that baseline was recorded, so the comparison is a sanity check
// (same ballpark), not an exact-match assertion.
const BASELINE = {
  grammar:    { dropped: 27,  total: 337,  pct: 8.0 },
  vocabulary: { dropped: 539, total: 2169, pct: 24.9 },
  phrase:     { dropped: 53,  total: 246,  pct: 21.5 },
  whole:      { dropped: 619, total: 2752, pct: 22.5 },
}

type CardType = 'vocabulary' | 'grammar' | 'phrase'

interface CardRow {
  id: string
  type: string
  normalizedFront: string
  components: string | null
}

console.log(`Mode: ${APPLY ? 'APPLY (will write to production)' : 'DRY RUN (no writes)'}`)
console.log()

// --- Phase A: load ALL cards (no where clause — RESEARCH.md Pitfall 1) ---
const allCards = (await prisma.card.findMany({
  select: { id: true, type: true, normalizedFront: true, components: true },
})) as CardRow[]

const deckSet = new Set(allCards.map((c) => c.normalizedFront))
console.log(`Loaded ${allCards.length} cards. Deck set size: ${deckSet.size}.`)
console.log()

// --- Phase B: re-filter components per card ---
type TypeTally = { before: number; after: number; dropped: number }
const tallies: Record<CardType, TypeTally> = {
  vocabulary: { before: 0, after: 0, dropped: 0 },
  grammar:    { before: 0, after: 0, dropped: 0 },
  phrase:     { before: 0, after: 0, dropped: 0 },
}

// cardId -> cleaned components[] (only for cards that HAD components).
// Cards with null components are not entered here; they contribute no
// components to the desired-edge computation in Phase C.
const cleanedByCardId = new Map<string, string[]>()
// cardId -> new DB value to write (only entries whose value actually changed).
const pendingUpdates = new Map<string, string | null>()
let malformedCount = 0
// WR-03: cards whose components JSON failed to parse — a malformed row is a
// data-integrity artifact unrelated to whether this card's real prerequisite
// relationships are valid. Their outgoing edges must be excluded from the
// prune candidate set below (Phase C), not treated as "zero components" and
// scheduled for deletion.
const skipCardIds = new Set<string>()

for (const card of allCards) {
  if (!card.components) continue

  let parsed: string[]
  try {
    parsed = JSON.parse(card.components)
    if (!Array.isArray(parsed)) throw new Error('not an array')
  } catch {
    console.warn(`  ⚠ Skipping malformed components JSON on card ${card.id} (${card.normalizedFront})`)
    malformedCount++
    skipCardIds.add(card.id)
    continue
  }

  const filtered = filterComponents(parsed, deckSet)
  cleanedByCardId.set(card.id, filtered)

  const type = (tallies[card.type as CardType] ? card.type : 'vocabulary') as CardType
  tallies[type].before += parsed.length
  tallies[type].after += filtered.length
  tallies[type].dropped += parsed.length - filtered.length

  const changed = filtered.length !== parsed.length || filtered.some((v, i) => v !== parsed[i])
  if (changed) {
    pendingUpdates.set(card.id, filtered.length ? JSON.stringify(filtered) : null)
  }
}

const wholeBefore = tallies.grammar.before + tallies.vocabulary.before + tallies.phrase.before
const wholeAfter = tallies.grammar.after + tallies.vocabulary.after + tallies.phrase.after
const wholeDropped = tallies.grammar.dropped + tallies.vocabulary.dropped + tallies.phrase.dropped

// --- Phase C: reconcile CardDependency edges ---
// keyToId built from ALL cards (mirrors the plan 16-03 fix — no
// components-not-null scoping), so a leaf-node card with no components of
// its own is still resolvable as another card's prerequisite.
const keyToId = new Map(allCards.map((c) => [c.normalizedFront, c.id]))

// Desired edge set computed from the CLEANED components (post-filter),
// not the raw persisted ones.
const desired = new Set<string>() // `${cardId}::${prerequisiteId}`
const desiredPairs: { cardId: string; prerequisiteId: string }[] = []
for (const [cardId, comps] of cleanedByCardId) {
  for (const comp of comps) {
    if (!comp) continue
    const prereqId = keyToId.get(normalizeFront(comp))
    if (!prereqId || prereqId === cardId) continue
    const key = `${cardId}::${prereqId}`
    if (!desired.has(key)) {
      desired.add(key)
      desiredPairs.push({ cardId, prerequisiteId: prereqId })
    }
  }
}

const existingEdges = (await prisma.cardDependency.findMany({
  select: { id: true, cardId: true, prerequisiteId: true },
})) as { id: string; cardId: string; prerequisiteId: string }[]

const existingKeys = new Set(existingEdges.map((e) => `${e.cardId}::${e.prerequisiteId}`))
const pruneIds = existingEdges
  // WR-03: never prune an edge sourced from a card whose components JSON was
  // malformed — that card's edges were never re-derived (no entry in
  // cleanedByCardId/desired), so they must be left untouched, not treated as
  // stale.
  .filter((e) => !skipCardIds.has(e.cardId))
  .filter((e) => !desired.has(`${e.cardId}::${e.prerequisiteId}`))
  .map((e) => e.id)
const toAdd = desiredPairs.filter((p) => !existingKeys.has(`${p.cardId}::${p.prerequisiteId}`))

// --- Reporting (ALWAYS, both modes) ---
function pct(n: number, total: number): string {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0.0%'
}

console.log('=== Per-type components before → after ===')
console.log(`  grammar:    ${tallies.grammar.before} → ${tallies.grammar.after}  (dropped ${tallies.grammar.dropped}, ${pct(tallies.grammar.dropped, tallies.grammar.before)})`)
console.log(`  vocabulary: ${tallies.vocabulary.before} → ${tallies.vocabulary.after}  (dropped ${tallies.vocabulary.dropped}, ${pct(tallies.vocabulary.dropped, tallies.vocabulary.before)})`)
console.log(`  phrase:     ${tallies.phrase.before} → ${tallies.phrase.after}  (dropped ${tallies.phrase.dropped}, ${pct(tallies.phrase.dropped, tallies.phrase.before)})`)
console.log(`  TOTAL:      ${wholeBefore} → ${wholeAfter}  (dropped ${wholeDropped}, ${pct(wholeDropped, wholeBefore)})`)
console.log()

console.log('=== Comparison to plan 16-01 dry-run baseline ===')
console.log(`  grammar:    baseline ${BASELINE.grammar.pct}%  vs  this run ${pct(tallies.grammar.dropped, tallies.grammar.before)}`)
console.log(`  vocabulary: baseline ${BASELINE.vocabulary.pct}%  vs  this run ${pct(tallies.vocabulary.dropped, tallies.vocabulary.before)}`)
console.log(`  phrase:     baseline ${BASELINE.phrase.pct}%  vs  this run ${pct(tallies.phrase.dropped, tallies.phrase.before)}`)
console.log(`  whole:      baseline ${BASELINE.whole.pct}%  vs  this run ${pct(wholeDropped, wholeBefore)}`)
console.log()

console.log('=== Summary ===')
console.log(`  Cards to change:     ${pendingUpdates.size}`)
console.log(`  Edges to prune:      ${pruneIds.length}`)
console.log(`  Edges to add:        ${toAdd.length}`)
console.log(`  Malformed skipped:   ${malformedCount}`)
console.log(`  Existing edge total: ${existingEdges.length}`)
console.log()

if (!APPLY) {
  console.log('DRY RUN — no changes written. Re-run with --apply to persist.')
  process.exit(0)
}

// --- Writes (ONLY when APPLY) ---
console.log('Applying changes…')

// 1. Batch-update changed Card.components rows (chunks of 50 via $transaction array).
const updateEntries = [...pendingUpdates.entries()]
const CHUNK = 50
for (let i = 0; i < updateEntries.length; i += CHUNK) {
  const chunk = updateEntries.slice(i, i + CHUNK)
  await prisma.$transaction(
    chunk.map(([id, value]) =>
      prisma.card.update({ where: { id }, data: { components: value } })
    )
  )
}
console.log(`  ✓ ${updateEntries.length} Card.components rows updated.`)

// 2. Prune stale edges (chunked deleteMany).
for (let i = 0; i < pruneIds.length; i += CHUNK) {
  const chunk = pruneIds.slice(i, i + CHUNK)
  await prisma.cardDependency.deleteMany({ where: { id: { in: chunk } } })
}
console.log(`  ✓ ${pruneIds.length} stale CardDependency rows pruned.`)

// 3. Add missing edges (idempotent upsert, mirrors relink-dependencies.mjs).
let addedCount = 0
for (const pair of toAdd) {
  try {
    await prisma.cardDependency.upsert({
      where: { cardId_prerequisiteId: { cardId: pair.cardId, prerequisiteId: pair.prerequisiteId } },
      create: { cardId: pair.cardId, prerequisiteId: pair.prerequisiteId },
      update: {},
    })
    addedCount++
  } catch (e) {
    console.warn(`  Link failed (${pair.cardId} → ${pair.prerequisiteId}):`, (e as Error).message)
  }
}
console.log(`  ✓ ${addedCount} new CardDependency rows created.`)
console.log()

const finalCardCount = await prisma.card.count()
const finalEdgeCount = await prisma.cardDependency.count()

console.log('='.repeat(50))
console.log('Cleanup complete.')
console.log(`  Cards changed         : ${updateEntries.length}`)
console.log(`  Edges pruned          : ${pruneIds.length}`)
console.log(`  Edges added           : ${addedCount}`)
console.log(`  Total cards in DB     : ${finalCardCount}`)
console.log(`  Total edges in DB     : ${finalEdgeCount}`)
console.log('='.repeat(50))

process.exit(0)
