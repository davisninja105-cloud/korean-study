/**
 * Phase 22 corpus fix: applies the high-confidence findings from
 * `.planning/audits/card-audit-2026-07-07.md` in place, by id (FIX-01):
 *
 *   1. Rewrites the 9 romanization-flagged fronts to their locked Hangul-only
 *      values (D-06/D-07/D-08) — front + normalizedFront updated together in
 *      the SAME update call, per CLAUDE.md's hard rule and the
 *      app/api/cards/[id]/route.ts precedent.
 *   2. Creates 3 natural Korean example sentences for the zero-sentence card
 *      철 (D-04) — additive Sentence rows only, no Card row touched.
 *
 * Card 다 (cmqlm1w0u014k0gsa6eydclfd) and CRT 렌즈 (cmqlmj2il01up0gsarwkragfi)
 * are DELIBERATELY absent from REWRITES — see D-03/D-09 in 22-CONTEXT.md.
 *
 * DRY-RUN BY DEFAULT — always prints the full report, writes NOTHING.
 * Mutates the live Turso corpus ONLY when passed --apply.
 *
 * The script NEVER deletes or re-creates a Card row (update-by-id only);
 * Sentence creation is the sole insert path, and only for card 철's
 * currently-empty sentence list (idempotent — skips if it already has any).
 *
 * Usage:
 *   npx tsx scripts/fix-corpus-2026-07.mts            # dry run — reports only, NO writes
 *   npx tsx scripts/fix-corpus-2026-07.mts --apply     # mutates production
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env / .env.local. Prints the
 * resolved DB host (never the auth token) and mode before any query
 * (T-22-04 mitigation).
 */

// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma sees the right env vars) —
// mirrors scripts/retro-filter-cleanup.mts:27-41 / scripts/audit-cards.mts:30-49.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at
// module init. Never static-import { prisma } — hoisting breaks env loading
// (RESEARCH Pitfall 4).
const { normalizeFront } = await import('../lib/card-key.js')
const { prisma } = await import('../lib/prisma.js')

const APPLY = process.argv.includes('--apply')

// ─── REWRITES table (locked values — D-06/D-07/D-08; verbatim from 22-03-PLAN.md) ───
const REWRITES: Record<string, string> = {
  cmqln565802oc0gsat0vy110z: '소 (작을 소)',
  cmqln56i902of0gsajqgbyk9a: '고 (높을 고)',
  cmqln56tv02oi0gsa7lmwtm4p: '식 (알 식)',
  cmqlngfdh036t0gsaguju6n2h: '용 (~용)',
  cmr42yyvi000gwhsa3uw44l4v: '료 (~료)',
  cmqllei7z009i0gsanauns8au: '동사 ~는',
  cmqlleits009n0gsaym0ytmh0: '동사 ~(으)ㄴ',
  cmqllejjt009s0gsavynqplsf: '동사 ~(으)ㄹ',
  cmqllejxv009x0gsa14saekdl: '형용사 ~(으)ㄴ',
}
// CRT 렌즈 (cmqlmj2il01up0gsarwkragfi) is intentionally ABSENT — accepted
// loanword (D-09). Card 다 (cmqlm1w0u014k0gsa6eydclfd) is intentionally
// absent — resolved by the plan 22-01 sentenceMatch() rule change alone,
// no DB write (D-03).

// ─── 철 sentence defaults (D-04 — Claude's discretion on wording) ───
const CHEOL_CARD_ID = 'cmqlmqdoa02430gsax79l6oza'
const CHEOL_SENTENCES: { korean: string; targetForm: string; translation: string; orderIndex: number }[] = [
  { korean: '철은 아주 단단한 금속이에요.', targetForm: '철', translation: 'Iron is a very hard metal.', orderIndex: 0 },
  { korean: '이 다리는 철로 만들어졌어요.', targetForm: '철', translation: 'This bridge is made of iron.', orderIndex: 1 },
  { korean: '지하철을 타고 회사에 가요.', targetForm: '철', translation: 'I take the subway to work.', orderIndex: 2 },
]

// ─── Print-before-write (T-22-04 mitigation): DB host + mode, no credentials ───
function dbHostOnly(): string {
  const raw = process.env.DATABASE_URL
  if (!raw) return '(DATABASE_URL not set)'
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}`
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

console.log(`Mode: ${APPLY ? 'APPLY (will write to production)' : 'DRY RUN (no writes)'}`)
console.log(`Target DB host: ${dbHostOnly()}`)
console.log()

// ─── Phase A: fetch current state of the 9 rewrite cards + card 철 ───
interface CardRow {
  id: string
  front: string
  normalizedFront: string
}

const rewriteIds = Object.keys(REWRITES)
const currentCards = (await prisma.card.findMany({
  where: { id: { in: rewriteIds } },
  select: { id: true, front: true, normalizedFront: true },
})) as CardRow[]
const currentById = new Map(currentCards.map((c) => [c.id, c]))

// Abort with a clear error if any REWRITES id is missing — the deck may have
// drifted via cron sync since RESEARCH.md's live check (Pitfall guard).
const missingIds = rewriteIds.filter((id) => !currentById.has(id))
if (missingIds.length > 0) {
  console.error(`FATAL: ${missingIds.length} REWRITES card id(s) not found in the live deck — aborting with zero writes:`)
  for (const id of missingIds) console.error(`  - ${id}`)
  process.exit(1)
}

const cheolCard = await prisma.card.findUnique({
  where: { id: CHEOL_CARD_ID },
  select: { id: true, front: true },
})
if (!cheolCard) {
  console.error(`FATAL: 철 card id ${CHEOL_CARD_ID} not found in the live deck — aborting with zero writes.`)
  process.exit(1)
}
const cheolExistingSentenceCount = await prisma.sentence.count({ where: { cardId: CHEOL_CARD_ID } })

// ─── Phase B: collision re-check at execution time (deck may have grown since research) ───
interface RewritePlan {
  id: string
  oldFront: string
  newFront: string
  oldNormalizedFront: string
  newNormalizedFront: string
  collision: { id: string; front: string } | null
}

const plans: RewritePlan[] = []
for (const [id, newFront] of Object.entries(REWRITES)) {
  const current = currentById.get(id)!
  const newNormalizedFront = normalizeFront(newFront)
  const collisionRow = await prisma.card.findFirst({
    where: { normalizedFront: newNormalizedFront, id: { not: id } },
    select: { id: true, front: true },
  })
  plans.push({
    id,
    oldFront: current.front,
    newFront,
    oldNormalizedFront: current.normalizedFront,
    newNormalizedFront,
    collision: collisionRow ?? null,
  })
}

const anyCollision = plans.some((p) => p.collision !== null)

// ─── Reporting (ALWAYS, both modes — retro-filter-cleanup.mts convention) ───
console.log('=== Front rewrites (9) ===')
for (const p of plans) {
  const status = p.collision
    ? `COLLISION with card ${p.collision.id} ("${p.collision.front}") — ABORT`
    : 'collision-free'
  console.log(`  ${p.id}`)
  console.log(`    front:           "${p.oldFront}" → "${p.newFront}"`)
  console.log(`    normalizedFront: "${p.oldNormalizedFront}" → "${p.newNormalizedFront}"`)
  console.log(`    collision check: ${status}`)
}
console.log()

console.log('=== 철 sentences (card ' + CHEOL_CARD_ID + ') ===')
console.log(`  Current front: "${cheolCard.front}"`)
console.log(`  Existing sentence count: ${cheolExistingSentenceCount}`)
if (cheolExistingSentenceCount > 0) {
  console.log('  SKIP — card already has sentences (idempotent re-run guard); no sentences will be created.')
} else {
  for (const s of CHEOL_SENTENCES) {
    console.log(`  [${s.orderIndex}] korean: "${s.korean}" — targetForm: "${s.targetForm}" — translation: "${s.translation}"`)
  }
}
console.log()

console.log('=== Summary ===')
console.log(`  Rewrites planned:        ${plans.length}`)
console.log(`  Collisions found:        ${plans.filter((p) => p.collision).length}`)
console.log(`  철 sentences to create:  ${cheolExistingSentenceCount > 0 ? 0 : CHEOL_SENTENCES.length}`)
console.log()

if (anyCollision) {
  console.error('FATAL: at least one normalizedFront collision detected at write time — aborting the whole run with zero writes.')
  process.exit(1)
}

if (!APPLY) {
  console.log('DRY RUN — no changes written. Re-run with --apply to persist.')
  process.exit(0)
}

// ─── Writes (ONLY when APPLY) — single chunked $transaction, well under the 50-op convention ───
console.log('Applying changes…')

const ops = [
  ...plans.map((p) =>
    prisma.card.update({
      where: { id: p.id },
      data: { front: p.newFront, normalizedFront: p.newNormalizedFront },
    })
  ),
  ...(cheolExistingSentenceCount === 0
    ? CHEOL_SENTENCES.map((s) =>
        prisma.sentence.create({
          data: {
            cardId: CHEOL_CARD_ID,
            korean: s.korean,
            targetForm: s.targetForm,
            translation: s.translation,
            orderIndex: s.orderIndex,
          },
        })
      )
    : []),
]

await prisma.$transaction(ops)

console.log(`  ✓ ${plans.length} card fronts rewritten (front + normalizedFront together).`)
console.log(`  ✓ ${cheolExistingSentenceCount === 0 ? CHEOL_SENTENCES.length : 0} Sentence rows created for card 철.`)
console.log()
console.log('='.repeat(50))
console.log('Corpus fix complete.')
console.log('='.repeat(50))

process.exit(0)
