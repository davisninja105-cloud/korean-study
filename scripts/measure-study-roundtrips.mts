/**
 * Measures the actual physical libSQL round-trip cost of a `/study`-equivalent
 * load, broken down by phase, against the isolated, seeded E2E test DB.
 *
 * Usage:
 *   npx tsx scripts/measure-study-roundtrips.mts              (segment totals only)
 *   npx tsx scripts/measure-study-roundtrips.mts --probe-json  (+ JSON-aggregation probe)
 *
 * Prerequisite: the isolated e2e test DB must exist and be seeded — run
 * `npx tsx e2e/run-global-setup.ts` first if `e2e/.tmp/e2e-test.db` is
 * absent.
 *
 * Pins DATABASE_URL to the isolated E2E test DB (e2e/helpers/test-db.ts's
 * TEST_DB_URL) and STUDY_QUERY_COUNTER=1 BEFORE dynamically importing any
 * lib/*.js module — a static import would be ESM-hoisted above these
 * process.env assignments and would construct the Prisma client (and read
 * the instrumentation flag) with the wrong env, exactly the documented
 * `local-resync.mts` gotcha (CLAUDE.md § "local-resync.mts env loading").
 * `e2e/helpers/test-db.ts` itself reads no env vars at import time (pure
 * path constant), so it is safe to import statically below.
 *
 * PER-SEGMENT MEASUREMENT DESIGN: this plan's files_modified list does NOT
 * include lib/study-cards.ts, so the pipeline itself is never instrumented
 * with internal reset()/read() checkpoints. Instead, Phase A's and Phase
 * B's exact query shapes are reproduced here verbatim (mirroring
 * lib/study-cards.ts:53-82 and :135-142 respectively, as of this writing)
 * so each segment's resetQueryCount()/getQueryCounts() window is genuinely
 * isolated — per 32-01-PLAN.md Task 2: "do not attempt to attribute
 * retroactively from a single total." Task 1 already proved the real,
 * unmodified getStudyCards() call costs 10 physical round trips in one
 * shot; this script's phase-A + phase-B totals are cross-checked against
 * that number in 32-BASELINE.md.
 */

import { TEST_DB_URL } from '../e2e/helpers/test-db.js'

process.env.DATABASE_URL = TEST_DB_URL
process.env.STUDY_QUERY_COUNTER = '1'

// Dynamic imports AFTER the env-first pin above — see header comment.
const { resetQueryCount, getQueryCounts } = await import('../lib/query-counter.js')
const { prisma } = await import('../lib/prisma.js')
const { selectSessionCards, sequenceCards } = await import('../lib/sequence.js')
const { getSessionSize } = await import('../lib/settings.js')
const { DEFAULT_SESSION_SIZE } = await import('../lib/habit.js')

const probeJson = process.argv.includes('--probe-json')

// ── Phase A — mirrors lib/study-cards.ts:53-82's Promise.allSettled batch
// (sessionSize + light pool + edges + known-lemmas), verbatim query shapes.
const now = new Date()
const poolWhere = { review: { nextReview: { lte: now } } }

resetQueryCount()
// Known-lemmas result is intentionally not bound to a name — this script
// never computes unknownCount, only round-trip counts — but the query
// still runs as part of the concurrent batch, matching Phase A's real cost.
const [sessionSizeResult, poolResult, edgesResult] = await Promise.allSettled([
  getSessionSize(),
  prisma.card.findMany({
    where: poolWhere,
    select: {
      id:     true,
      review: { select: { nextReview: true } },
      lesson: { select: { orderIndex: true } },
    },
    orderBy: { review: { nextReview: 'asc' } },
    take: 1000,
  }),
  prisma.cardDependency.findMany({
    select: { cardId: true, prerequisiteId: true },
  }),
  prisma.card.findMany({
    where: { review: { state: { gte: 1 } } },
    select: { normalizedFront: true },
  }),
])
const phaseA = getQueryCounts()

if (poolResult.status === 'rejected') {
  console.error('FATAL: Phase A pool query rejected —', poolResult.reason)
  process.exit(1)
}

const sessionSize =
  sessionSizeResult.status === 'fulfilled' ? sessionSizeResult.value : DEFAULT_SESSION_SIZE
const lightPool = poolResult.value
const idSet = new Set(lightPool.map((c) => c.id))
const allEdges = edgesResult.status === 'fulfilled' ? edgesResult.value : []
const edges = allEdges.filter((e) => idSet.has(e.cardId) && idSet.has(e.prerequisiteId))
const chosen = selectSessionCards(lightPool, edges, sessionSize, now)
const ordered = sequenceCards(chosen, edges, now)
const orderedIds = ordered.map((c) => c.id)

// ── Phase B — mirrors lib/study-cards.ts:135-142's full-row findMany,
// verbatim query shape, fed with the real ids Phase A/selection produced.
resetQueryCount()
await prisma.card.findMany({
  where: { id: { in: orderedIds } },
  include: {
    review:    true,
    lesson:    { select: { id: true, orderIndex: true, title: true, createdAt: true } },
    sentences: { orderBy: { orderIndex: 'asc' } },
  },
})
const phaseB = getQueryCounts()

// ── page lessons — mirrors app/study/page.tsx's standalone lesson query,
// which sits outside getStudyCards() entirely but is inside the whole
// /study page's round-trip budget (per STUDY-01's "a /study load" wording).
resetQueryCount()
await prisma.lesson.findMany({
  select: { id: true, orderIndex: true, title: true },
  orderBy: { orderIndex: 'asc' },
})
const pageLessons = getQueryCounts()

const totalPhysical = phaseA.physical + phaseB.physical + pageLessons.physical
const totalPrismaEvents = phaseA.prismaEvents + phaseB.prismaEvents + pageLessons.prismaEvents

console.log(`phase A physical: ${phaseA.physical}`)
console.log(`phase B physical: ${phaseB.physical}`)
console.log(`page lessons physical: ${pageLessons.physical}`)
console.log(`total physical: ${totalPhysical}`)
console.log(`prisma query events: ${totalPrismaEvents}`)

if (totalPhysical === 0) {
  console.error(
    'FATAL: total physical round trip count is 0 — the counting Proxy is not attached (STUDY_QUERY_COUNTER instrumentation branch in lib/prisma.ts did not activate). A zero count must fail loudly, not read as a perfect score.'
  )
  process.exit(1)
}

// ── JSON aggregation probe (--probe-json only, gated so the default
// measurement run stays fast). Read-only: a two-row inline VALUES source,
// no table/column data, no bound parameter values, no credential material.
if (probeJson) {
  interface JsonProbeRow {
    result: string
  }
  let available = false
  try {
    const rows = await prisma.$queryRaw<JsonProbeRow[]>`
      SELECT json_group_array(json_object('a', x)) AS result
      FROM (SELECT 1 AS x UNION ALL SELECT 2 AS x)
    `
    const raw = rows[0]?.result ?? null
    console.log(`json probe result (local test DB): ${raw}`)
    available = raw !== null && JSON.parse(raw).length === 2
  } catch (e) {
    console.log(`json probe result (local test DB): ERROR — ${(e as Error).message}`)
  }
  console.log(`json aggregation: ${available ? 'available' : 'unavailable'}`)
}

process.exit(0)
