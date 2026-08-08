// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
//
// Phase A is a single raw-SQL query (prisma/schema.prisma anchors: Lesson
// 10-18, Card 20-54, CardReview 74-93, Setting 156-159 — this raw block has
// no compile-time link to those model definitions, so a column rename there
// will not fail until this query throws or misbehaves at runtime;
// 32-RESEARCH.md Open Question 3) that returns the live due-card pool AND
// the studyCacheVersion change token in ONE physical libSQL round trip, via
// a correlated scalar subquery. This replaces the old four-way
// Promise.allSettled batch (sessionSize + pool + edges + knownLemmas). The
// three invariant reads that batch used to include (CardDependency edges,
// normalizedFront known-lemmas, sessionSize) now live in lib/study-cache.ts's
// globalThis-held snapshot, refilled only on a cache miss (version mismatch
// or absent snapshot) — see 32-RESEARCH.md Pattern 1 / Research Question 1.
//
// Phase B is a second raw-SQL query (32-BASELINE.md verdict: RAW SQL
// REQUIRED) fetching only the chosen/ordered cards' full rows, with the
// one-to-many Sentence relation folded into one JSON column.
//
// getStudyCards() returns { cards, lessons } (StudyCardsResult) — `lessons`
// rides along on the same cache-gated invariants snapshot, so
// app/study/page.tsx needs no separate prisma.lesson.findMany() call.

import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'
import { getStudyCache, refreshStudyCache } from '@/lib/study-cache'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO, LessonDTO } from '@/lib/dto'

export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number // defaults to the cached sessionSize (see lib/study-cache.ts)
}

// getStudyCards()'s return shape (Phase 32-03, Task 3): `lessons` rides
// along on the same cache-gated invariants snapshot Phase A already
// populates, so app/study/page.tsx no longer needs its own separate
// prisma.lesson.findMany() call — see the sequencing note at that call site
// for why it must be awaited AFTER getStudyCards(), never Promise.all'd.
export interface StudyCardsResult {
  cards: CardDTO[]
  lessons: LessonDTO[]
}

// Raw-SQL Phase A row shape — one row per pool card, carrying the
// studyCacheVersion token as a correlated scalar subquery column so the
// cache-version check costs zero extra physical round trips. nextReview is
// typed Date | string because Prisma's raw-query deserializer converts
// recognized DateTime-shaped columns to JS Date objects on this stack
// (verified against the local test DB), but nextReviewMs() in lib/sequence.ts
// already accepts either — this type does not assume which one arrives.
interface PoolRow {
  id: string
  nextReview: Date | string
  orderIndex: number | null
  version: string | null
}

// Raw-SQL Phase B row shape — one row per chosen card, with CardReview and
// Lesson columns aliased (both to-one relations, LEFT JOIN, no fan-out) and
// the one-to-many Sentence relation folded into a single JSON text column.
// Every *_id-suffixed column (review_id / lesson_id) doubles as the LEFT
// JOIN presence marker: null means no matching row, non-null means every
// sibling *_ column in that group is guaranteed non-null (the underlying
// schema.prisma columns are NOT NULL).
interface FullCardRow {
  id: string
  createdAt: Date | string
  updatedAt: Date | string
  type: string
  front: string
  back: string
  notes: string | null
  normalizedFront: string
  components: string | null
  distractors: string | null
  lessonId: string | null
  review_id: string | null
  review_state: number | null
  review_stability: number | null
  review_difficulty: number | null
  review_elapsedDays: number | null
  review_scheduledDays: number | null
  review_learningSteps: number | null
  review_reps: number | null
  review_lapses: number | null
  review_nextReview: Date | string | null
  review_lastReview: Date | string | null
  lesson_id: string | null
  lesson_orderIndex: number | null
  lesson_title: string | null
  lesson_createdAt: Date | string | null
  sentencesJson: string
}

// Raw sentence shape as it survives SQLite's json_object() aggregation —
// every DateTime comes back as TEXT (the "+00:00" offset form), never a JS
// Date, because json_object() stringifies before Prisma's raw-query
// deserializer ever sees the column.
interface RawSentenceRow {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export async function getStudyCards(params: StudyCardsParams): Promise<StudyCardsResult> {
  const { scope, lessonFrom, lessonTo } = params

  const now = new Date()
  const nowIso = now.toISOString()

  // Compare timestamps through SQLite's julianday() on BOTH sides — never by
  // raw string comparison. Prisma stores SQLite DateTime as TEXT in
  // "YYYY-MM-DDTHH:MM:SS.sss+00:00" form while Date.prototype.toISOString()
  // emits the "Z" form; lexicographic comparison of the two is only
  // accidentally correct at equal timestamps and silently wrong the moment
  // either format shifts. julianday() parses both forms to the same numeric
  // value (verified against this repo's own SQLite 3.45.1 test DB during
  // planning, and re-verified against this raw query directly this session).
  const scopeClause =
    scope === 'due'
      ? Prisma.sql`julianday(r.nextReview) <= julianday(${nowIso})`
      : Prisma.sql`julianday(r.nextReview) > julianday(${nowIso})`

  // Optional lesson-range predicate — only applied when a non-full-span range
  // is requested. With a range applied, NULL-lesson cards drop out (a NULL
  // comparison is never true in SQL, reproducing Prisma's optional-relation
  // filter semantics); with no range (Prisma.sql`` — an empty fragment),
  // NULL-lesson cards are retained via the LEFT JOIN below.
  const lessonRangeClause =
    lessonFrom !== null && lessonTo !== null
      ? Prisma.sql`AND l.orderIndex >= ${lessonFrom} AND l.orderIndex <= ${lessonTo}`
      : Prisma.sql``

  let rows: PoolRow[]
  try {
    // The INNER JOIN on CardReview reproduces Prisma's current
    // `where: { review: {...} } }` semantics — a card with no review row is
    // excluded today and must stay excluded. The LEFT JOIN on Lesson plus
    // the optional lessonRangeClause reproduces the optional-relation filter.
    // Every interpolated value crosses through a tagged-template parameter
    // (nowIso, lessonFrom, lessonTo via the Prisma.sql fragments above) —
    // never string concatenation, never $queryRawUnsafe.
    rows = await prisma.$queryRaw<PoolRow[]>`
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
  } catch (err) {
    // WR-01 fix (32-REVIEW.md): previously `catch { throw new Error(...) }`
    // discarded the actual driver/SQL error entirely — nothing was logged
    // anywhere, unlike the invariants-refill catch in lib/study-cache.ts
    // (and this file's own empty-pool version fallback catch below), both of
    // which console.error the rejection reason before degrading/rethrowing.
    // A production 500 from this primary due-card pool query now leaves a
    // trace in server logs of *why*, matching its siblings.
    console.error('[study-cards] pool query failed', err)
    throw new Error('Database error')
  }

  // An empty pool yields no rows, so there is no version column to read.
  // CR-02 fix (32-REVIEW.md): falling back to a hard-coded `null` here (as
  // opposed to reading the real DB-persisted studyCacheVersion) permanently
  // pins the invariants cache behind a synthetic `null` version the first
  // time the pool is empty — every subsequent empty-pool request then
  // matches that `null`-stamped snapshot and never again compares against
  // the real token, so a sync/relink that lands while the pool stays empty
  // is silently never picked up. Pay one extra physical round trip ONLY on
  // this already-rare empty-pool path (never on the warm, non-empty steady
  // state this phase optimizes for) to read the real token instead.
  let version: string | null
  if (rows.length > 0) {
    version = rows[0].version
  } else {
    try {
      const versionRows = await prisma.$queryRaw<{ v: string | null }[]>`
        SELECT value AS v FROM Setting WHERE key = 'studyCacheVersion'
      `
      version = versionRows[0]?.v ?? null
    } catch (err) {
      console.error('[study-cards] empty-pool version fallback query failed', err)
      version = null
    }
  }

  // Cache-gated invariants: on a version match, use the snapshot's fields
  // directly (zero extra physical round trips — the whole point of this
  // rewrite). On a mismatch or absent snapshot, refill exactly once. This
  // refill also carries the RELIABILITY-01 known-lemmas failure log (now
  // inside lib/study-cache.ts), so it must run — and the log must fire —
  // even when the pool is empty, matching the pre-rewrite ordering where
  // the log was emitted before the empty-pool early return below.
  const cached = getStudyCache()
  const invariants =
    cached && cached.version === version ? cached : await refreshStudyCache(version)

  if (rows.length === 0) return { cards: [], lessons: invariants.lessons }

  const sessionSize =
    params.sessionSize !== undefined ? params.sessionSize : invariants.sessionSize

  const lightPool = rows.map((r) => ({
    id: r.id,
    review: { nextReview: r.nextReview },
    lesson: r.orderIndex !== null ? { orderIndex: r.orderIndex } : null,
  }))

  // Filter edges to those whose BOTH endpoints are in the pool. We deliberately
  // do NOT push the pool filter into SQL as `cardId IN ids AND prerequisiteId IN
  // ids`: two large IN clauses over the ~1000-card due pool make Prisma chunk
  // each list to respect the SQLite bound-parameter limit and emit a CARTESIAN
  // PRODUCT of chunk pairs (~55 serial round-trips against remote Turso — the
  // historical cause of the >10s /study load). invariants.edges is a single
  // unfiltered, whole-pool read shared across every request via the cache; the
  // both-endpoints-in-pool filter runs here in memory, once per request.
  // sequenceCards/selectSessionCards already ignore out-of-session edges, so
  // this filter is an optimization, not a correctness requirement.
  const idSet = new Set(lightPool.map((c) => c.id))
  const edges = invariants.edges.filter(
    (e) => idSet.has(e.cardId) && idSet.has(e.prerequisiteId)
  )

  const chosen  = selectSessionCards(lightPool, edges, sessionSize, now)
  const ordered = sequenceCards(chosen, edges, now)
  const orderedIds = ordered.map((c) => c.id)

  // Prisma.join on an empty array produces invalid SQL — guard before Phase B.
  if (orderedIds.length === 0) return { cards: [], lessons: invariants.lessons }

  // Phase B — fetch full details (review, lesson, sentences) for ONLY the
  // chosen/ordered cards (~sessionSize, not the full 1000-row pool), as ONE
  // physical raw-SQL request. 32-BASELINE.md's measured Phase B verdict is
  // RAW SQL REQUIRED: the previous include-based findMany cost 4 physical
  // round trips on this stack (SQLite has no relationLoadStrategy: 'join'),
  // not the 1 this raw query achieves. schema.prisma anchors: Card 20-54,
  // CardReview 74-93, Lesson 10-18, Sentence 56-72. CardReview and Lesson
  // are both to-one relations (LEFT JOIN, no row fan-out); Sentence is the
  // one-to-many relation, folded into a single JSON column via a correlated
  // json_group_array/json_object subquery ordered by orderIndex ASC —
  // confirmed available and correctly ordered on both the local test DB and
  // production Turso (32-BASELINE.md; re-verified empirically this session,
  // including the zero-sentences case, which returns "[]" not null).
  const fullRows = await prisma.$queryRaw<FullCardRow[]>`
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
  const fullById = new Map(fullRows.map((r) => [r.id, r]))

  // Serialize: raw SQL returns SQLite TEXT for every DateTime crossing the
  // json_object() aggregation (the correlated sentences subquery), in
  // "+00:00" offset form — .toISOString() on those would throw. Every
  // timestamp is normalised through new Date(value).toISOString() so the
  // emitted DTO keeps today's Z-suffixed format byte-for-byte, defensively
  // (the top-level SELECT'd DateTime columns come back as JS Date objects
  // on this stack per this session's own verification, but new Date(x) on
  // an already-Date value is a safe no-op clone, so one code path handles
  // both cases without assuming which one a given libSQL transport returns).
  // No raw Date/TEXT may appear in the returned CardDTO[] (RSC-05 contract).
  const cardsInOrder: CardDTO[] = orderedIds
    .map((id) => fullById.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => {
      let rawSentences: RawSentenceRow[]
      try {
        rawSentences = JSON.parse(r.sentencesJson) as RawSentenceRow[]
      } catch (e) {
        console.error(`[study-cards] failed to parse sentences JSON for card ${r.id}`, e)
        rawSentences = []
      }
      const sentences = rawSentences.map((s) => ({
        id: s.id,
        cardId: s.cardId,
        korean: s.korean,
        targetForm: s.targetForm,
        translation: s.translation,
        orderIndex: s.orderIndex,
        createdAt: new Date(s.createdAt).toISOString(),
        updatedAt: new Date(s.updatedAt).toISOString(),
        unknownCount: countUnknownWords(s.korean, s.targetForm, invariants.lemmas),
      }))

      return {
        id: r.id,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),
        type: r.type,
        front: r.front,
        back: r.back,
        notes: r.notes,
        normalizedFront: r.normalizedFront,
        components: r.components,
        distractors: r.distractors,
        lessonId: r.lessonId,
        lesson:
          r.lesson_id !== null
            ? {
                // schema.prisma NOT NULL columns — non-null once lesson_id
                // (the LEFT JOIN presence marker) is confirmed non-null.
                title: r.lesson_title!,
                orderIndex: r.lesson_orderIndex!,
                createdAt: new Date(r.lesson_createdAt!).toISOString(),
              }
            : null,
        review:
          r.review_id !== null
            ? {
                id: r.review_id,
                cardId: r.id,
                // schema.prisma NOT NULL columns — non-null once review_id
                // (the LEFT JOIN presence marker) is confirmed non-null.
                state: r.review_state!,
                stability: r.review_stability!,
                difficulty: r.review_difficulty!,
                elapsedDays: r.review_elapsedDays!,
                scheduledDays: r.review_scheduledDays!,
                learningSteps: r.review_learningSteps!,
                reps: r.review_reps!,
                lapses: r.review_lapses!,
                nextReview: new Date(r.review_nextReview!).toISOString(),
                lastReview: r.review_lastReview !== null
                  ? new Date(r.review_lastReview).toISOString()
                  : null,
              }
            : null,
        sentences,
      }
    })

  return { cards: cardsInOrder, lessons: invariants.lessons }
}
