// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
// Extracts the pool-fetch + edge-fetch + knownLemmas + selectSessionCards +
// sequenceCards + annotation pipeline from app/api/cards/due/route.ts so
// both the RSC study page and the API route call one shared, DRY function.

import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { DEFAULT_SESSION_SIZE } from '@/lib/habit'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'

export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number // defaults to getSessionSize() from lib/settings.ts
}

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> {
  const { scope, lessonFrom, lessonTo } = params

  const now = new Date()

  // Build the lesson range clause (only when a non-full-span range is requested).
  // Null params mean "all" → no clause → includes cards with lessonId = null too.
  const lessonClause =
    lessonFrom !== null && lessonTo !== null
      ? { lesson: { orderIndex: { gte: lessonFrom, lte: lessonTo } } }
      : {}

  const poolWhere = {
    ...lessonClause,
    review: scope === 'due'
      ? { nextReview: { lte: now } }
      : { nextReview: { gt: now } },
  }

  // Phase A — one parallel batch of everything that does NOT depend on which
  // cards end up chosen for the session: sessionSize, a LIGHTWEIGHT pool query
  // (only the fields selectSessionCards/sequenceCards actually read: id,
  // review.nextReview, lesson.orderIndex), the prerequisite edges, and the
  // known-lemmas set. The edge query does not depend on the pool result — it
  // was previously sequenced after the pool for no reason; batching it here
  // removes one serial round-trip.
  //
  // Promise.allSettled gives graceful degradation per query:
  //   - pool failure → throw (critical; can't build a session without it)
  //   - sessionSize failure → DEFAULT_SESSION_SIZE fallback
  //   - edges failure → [] fallback (session still builds, just unsequenced by prereqs)
  //   - knownLemmas failure → empty Set (non-critical ranking signal)
  const [sessionSizeResult, poolResult, edgesResult, knownRowsResult] = await Promise.allSettled([
    params.sessionSize !== undefined ? Promise.resolve(params.sessionSize) : getSessionSize(),
    // Query 1 (CRITICAL): Whole eligible pool, generous safety cap of 1000, but
    // only the columns the selection/sequencing algorithms read. The full
    // review/lesson/sentences payload is fetched in Phase B for the ~sessionSize
    // cards actually chosen, not for all 1000 pool candidates.
    prisma.card.findMany({
      where: poolWhere,
      select: {
        id:      true,
        review:  { select: { nextReview: true } },
        lesson:  { select: { orderIndex: true } },
      },
      orderBy: { review: { nextReview: 'asc' } },
      take: 1000,
    }),
    // Query 2 (formerly sequential): prerequisite edges, unfiltered. Kept as a
    // single unfiltered select of the two id columns — see the historical note
    // below on why this must not be pushed into SQL as two large IN clauses.
    prisma.cardDependency.findMany({
      select: { cardId: true, prerequisiteId: true },
    }),
    // Query 3 (NON-CRITICAL): Cards the learner has seen at least once (FSRS state ≥ 1).
    // "Seen once" is the threshold for counting a word as known context.
    // Selecting only normalizedFront keeps this fast and allocation-light.
    prisma.card.findMany({
      where: { review: { state: { gte: 1 } } },
      select: { normalizedFront: true },
    }),
  ])

  if (poolResult.status === 'rejected') {
    throw new Error('Database error')
  }

  const sessionSize =
    sessionSizeResult.status === 'fulfilled' ? sessionSizeResult.value : DEFAULT_SESSION_SIZE

  // RELIABILITY-01: if the non-critical known-lemmas query rejected, log the
  // reason BEFORE degrading — so the silent ranking-signal degradation
  // (unknownCount will treat every context word as unknown, since
  // knownLemmas falls back to an empty Set below) becomes observable in
  // Vercel logs. Placed before the empty-pool early return so the log fires
  // even when the pool is empty. No throw/retry/fallback is added; the
  // empty-Set fallback at the knownLemmas construction further down stays
  // byte-for-byte untouched. Logs only the fixed prefix message and the
  // driver rejection reason — never card fronts, lesson-range params, or env.
  if (knownRowsResult.status === 'rejected') {
    console.error(
      '[study-cards] known-lemmas query failed; unknownCount ranking degrading to an empty known-lemma set',
      knownRowsResult.reason
    )
  }

  const lightPool = poolResult.value

  if (lightPool.length === 0) return []

  // Filter edges to those whose BOTH endpoints are in the pool. We deliberately
  // do NOT push the pool filter into SQL as `cardId IN ids AND prerequisiteId IN
  // ids`: two large IN clauses over the ~1000-card due pool make Prisma chunk
  // each list to respect the SQLite bound-parameter limit and emit a CARTESIAN
  // PRODUCT of chunk pairs (~55 serial round-trips → ~6s against remote Turso —
  // the historical cause of the >10s /study load). A single unfiltered select
  // of the two id columns is one round-trip returning a small (2-column,
  // deck-bounded) payload; the both-endpoints-in-pool filter runs in memory.
  // sequenceCards/selectSessionCards already ignore out-of-session edges, so
  // this filter is an optimization, not a correctness requirement.
  const idSet = new Set(lightPool.map((c) => c.id))
  const allEdges = edgesResult.status === 'fulfilled' ? edgesResult.value : []
  const edges = allEdges.filter(
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

  // Build knownLemmas Set from the concurrent result — degrade to empty Set on failure.
  const knownLemmas = new Set(
    knownRowsResult.status === 'fulfilled'
      ? knownRowsResult.value.map((r) => r.normalizedFront)
      : []
  )

  // Annotate each sentence with unknownCount (pure ranking signal for the client).
  // Cost: ≤ sessionSize × 3 sentence scans — well under the Vercel 60s limit.
  for (const card of cardsInOrder) {
    for (const s of card.sentences) {
      (s as typeof s & { unknownCount: number }).unknownCount =
        countUnknownWords(s.korean, s.targetForm, knownLemmas)
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
