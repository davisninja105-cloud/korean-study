/**
 * Measures the actual physical libSQL round-trip cost of a `/study`-equivalent
 * load, broken down by phase, against the isolated, seeded E2E test DB.
 *
 * Usage:
 *   npx tsx scripts/measure-study-roundtrips.mts              (segment totals only)
 *   npx tsx scripts/measure-study-roundtrips.mts --probe-json  (+ JSON-aggregation probe)
 *   npx tsx scripts/measure-study-roundtrips.mts --dump-order  (composition-equivalence differ:
 *     calls getStudyCards() for the same params app/study/page.tsx uses and prints one card id
 *     per line in session order, nothing else — no round-trip counting. Used by 32-03-PLAN.md
 *     Task 3 to diff the ordering before/after the Phase A/B rewrite.)
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
 * PER-SEGMENT MEASUREMENT DESIGN: Phase A's and Phase B's exact query shapes
 * are reproduced here verbatim (mirroring lib/study-cards.ts's Phase A raw
 * SQL query and Phase B findMany respectively, as of this writing) so each
 * segment's resetQueryCount()/getQueryCounts() window is genuinely isolated
 * — per 32-01-PLAN.md Task 2: "do not attempt to attribute retroactively
 * from a single total." This was originally true because Plan 01 excluded
 * lib/study-cards.ts from its own files_modified list; Plan 03 now owns
 * that file directly, but the same replicate-verbatim approach is kept
 * because it lets Phase A be measured in a genuinely "warm cache" state
 * (pre-warmed, untimed, THEN reset+measured) without adding dev-only
 * reset()/read() checkpoints to production code.
 */

import { TEST_DB_URL } from '../e2e/helpers/test-db.js'

process.env.DATABASE_URL = TEST_DB_URL
process.env.STUDY_QUERY_COUNTER = '1'

// Dynamic imports AFTER the env-first pin above — see header comment.
const { resetQueryCount, getQueryCounts } = await import('../lib/query-counter.js')
const { prisma } = await import('../lib/prisma.js')
const { Prisma } = await import('../app/generated/prisma/client.js')
const { selectSessionCards, sequenceCards } = await import('../lib/sequence.js')
const { getStudyCache, refreshStudyCache } = await import('../lib/study-cache.js')

const probeJson = process.argv.includes('--probe-json')
const dumpOrder = process.argv.includes('--dump-order')

// ── --dump-order: composition-equivalence differ. Calls the real
// getStudyCards() with the same params app/study/page.tsx uses and prints
// one card id per line, in session order, nothing else. Exits early —
// does not run the phase A/B round-trip measurement below, since ordering
// and round-trip counting are independent concerns and dump-order must work
// unmodified across the rewrite this script also measures.
if (dumpOrder) {
  const { getStudyCards } = await import('../lib/study-cards.js')
  const result: unknown = await getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null })
  // getStudyCards() returns a bare CardDTO[] before Task 3's rewrite and a
  // { cards, lessons } StudyCardsResult after — support both shapes so this
  // flag works unmodified on both sides of the rewrite it's used to diff.
  const list = (Array.isArray(result) ? result : (result as { cards: { id: string }[] }).cards) as {
    id: string
  }[]
  const ids = list.map((c) => c.id)
  for (const id of ids) console.log(id)
  process.exit(0)
}

// ── Phase A — mirrors lib/study-cards.ts's raw-SQL pool-plus-version query
// verbatim, run in a pre-warmed cache state so the measured window reflects
// the steady-state ("warm cache") cost the acceptance criterion asks for:
// exactly one physical request for the live pool plus the version check.
const now = new Date()
const nowIso = now.toISOString()
const scopeClause = Prisma.sql`julianday(r.nextReview) <= julianday(${nowIso})`
const lessonRangeClause = Prisma.sql``

interface PoolRow {
  id: string
  nextReview: Date | string
  orderIndex: number | null
  version: string | null
}

async function queryPool(): Promise<PoolRow[]> {
  return prisma.$queryRaw<PoolRow[]>`
    SELECT
      c.id AS id,
      r.nextReview AS nextReview,
      l.orderIndex AS orderIndex,
      (SELECT value FROM Setting WHERE key = 'studyCacheVersion') AS version
    FROM Card c
    INNER JOIN CardReview r ON r.cardId = c.id
    LEFT JOIN Lesson l ON l.id = c.lessonId
    WHERE ${scopeClause} ${lessonRangeClause}
    ORDER BY r.nextReview ASC
    LIMIT 1000
  `
}

// Pre-warm pass (untimed) — simulates a server that already served one
// /study request, so the timed pass below measures a genuine cache hit.
const warmRows = await queryPool()
const warmVersion = warmRows.length > 0 ? warmRows[0].version : null
await refreshStudyCache(warmVersion)

resetQueryCount()
const rows = await queryPool()
const phaseA = getQueryCounts()

const version = rows.length > 0 ? rows[0].version : null
const cached = getStudyCache()
const invariants = cached && cached.version === version ? cached : await refreshStudyCache(version)

const lightPool = rows.map((r) => ({
  id: r.id,
  review: { nextReview: r.nextReview },
  lesson: r.orderIndex !== null ? { orderIndex: r.orderIndex } : null,
}))
const idSet = new Set(lightPool.map((c) => c.id))
const edges = invariants.edges.filter((e) => idSet.has(e.cardId) && idSet.has(e.prerequisiteId))
const chosen = selectSessionCards(lightPool, edges, invariants.sessionSize, now)
const ordered = sequenceCards(chosen, edges, now)
const orderedIds = ordered.map((c) => c.id)

// ── Phase B — mirrors lib/study-cards.ts's raw-SQL full-row query verbatim
// (32-BASELINE.md verdict: RAW SQL REQUIRED), fed with the real ids Phase
// A/selection produced. CardReview/Lesson are LEFT JOINed (to-one, no
// fan-out); Sentence is folded into one JSON column via a correlated
// json_group_array/json_object subquery.
resetQueryCount()
if (orderedIds.length > 0) {
  await prisma.$queryRaw`
    SELECT
      c.id AS id,
      c.createdAt AS createdAt,
      c.updatedAt AS updatedAt,
      c.type AS type,
      c.front AS front,
      c.back AS back,
      c.notes AS notes,
      c.normalizedFront AS normalizedFront,
      c.components AS components,
      c.distractors AS distractors,
      c.lessonId AS lessonId,
      r.id AS review_id,
      r.state AS review_state,
      r.stability AS review_stability,
      r.difficulty AS review_difficulty,
      r.elapsedDays AS review_elapsedDays,
      r.scheduledDays AS review_scheduledDays,
      r.learningSteps AS review_learningSteps,
      r.reps AS review_reps,
      r.lapses AS review_lapses,
      r.nextReview AS review_nextReview,
      r.lastReview AS review_lastReview,
      l.id AS lesson_id,
      l.orderIndex AS lesson_orderIndex,
      l.title AS lesson_title,
      l.createdAt AS lesson_createdAt,
      (
        SELECT json_group_array(json_object(
          'id', s.id,
          'cardId', s.cardId,
          'korean', s.korean,
          'targetForm', s.targetForm,
          'translation', s.translation,
          'orderIndex', s.orderIndex,
          'createdAt', s.createdAt,
          'updatedAt', s.updatedAt
        ))
        FROM (SELECT * FROM Sentence WHERE Sentence.cardId = c.id ORDER BY orderIndex ASC) s
      ) AS sentencesJson
    FROM Card c
    LEFT JOIN CardReview r ON r.cardId = c.id
    LEFT JOIN Lesson l ON l.id = c.lessonId
    WHERE c.id IN (${Prisma.join(orderedIds)})
  `
}
const phaseB = getQueryCounts()

// ── page lessons — mirrors the POST-Task-3 app/study/page.tsx, which reads
// `lessons` from getStudyCards()'s own return value (sourced from the same
// warm invariants snapshot Phase A already populated) rather than issuing
// its own separate prisma.lesson.findMany() call. On a warm cache this is
// genuinely zero physical I/O — reading an already-fetched in-memory array
// — not a stale pre-Task-3 measurement.
resetQueryCount()
void invariants.lessons
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
