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

import { prisma } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma/client'
import { getStudyCache, refreshStudyCache } from '@/lib/study-cache'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'

export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number // defaults to the cached sessionSize (see lib/study-cache.ts)
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

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> {
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
  } catch {
    throw new Error('Database error')
  }

  // An empty pool yields no rows, so there is no version column to read —
  // fall back to null and let the cache-miss path below handle it (never a
  // second query to recover the version separately).
  const version = rows.length > 0 ? rows[0].version : null

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

  if (rows.length === 0) return []

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

  // Phase B — fetch full details (review, lesson, sentences) for ONLY the
  // chosen/ordered cards (~sessionSize, not the full 1000-row pool).
  // findMany with `id: { in: ... }` does NOT preserve the input order, so the
  // result is re-mapped over orderedIds via a Map to restore session order.
  const fullCards = await prisma.card.findMany({
    where: { id: { in: orderedIds } },
    include: {
      review:    true,
      lesson:    { select: { id: true, orderIndex: true, title: true, createdAt: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
  })
  const fullById = new Map(fullCards.map((c) => [c.id, c]))
  const cardsInOrder = orderedIds
    .map((id) => fullById.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined)

  // Annotate each sentence with unknownCount (pure ranking signal for the client).
  // Cost: ≤ sessionSize × 3 sentence scans — well under the Vercel 60s limit.
  for (const card of cardsInOrder) {
    for (const s of card.sentences) {
      (s as typeof s & { unknownCount: number }).unknownCount =
        countUnknownWords(s.korean, s.targetForm, invariants.lemmas)
    }
  }

  // Serialize: convert all Prisma Date objects to ISO strings before returning.
  // No raw Date may appear in the returned CardDTO[] (RSC-05 contract).
  return cardsInOrder.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lesson: c.lesson
      ? { ...c.lesson, createdAt: c.lesson.createdAt.toISOString() }
      : null,
    review: c.review
      ? {
          ...c.review,
          nextReview: c.review.nextReview.toISOString(),
          lastReview: c.review.lastReview?.toISOString() ?? null,
        }
      : null,
    sentences: c.sentences.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  }))
}
