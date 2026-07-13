// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
// Extracts the pool-fetch + edge-fetch + knownLemmas + selectSessionCards +
// sequenceCards + annotation pipeline from app/api/cards/due/route.ts so
// both the RSC study page and the API route call one shared, DRY function.

import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
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

  const sessionSize = params.sessionSize ?? (await getSessionSize())

  // Run the pool fetch and known-lemmas fetch concurrently — they are independent
  // of each other. The edge fetch depends on pool IDs and stays sequential.
  // Promise.allSettled gives graceful degradation:
  //   - pool failure → throw (critical; can't build a session without it)
  //   - knownLemmas failure → empty Set (non-critical; unknownCount degrades to max but no crash)
  const [poolResult, knownRowsResult] = await Promise.allSettled([
    // Query 1 (CRITICAL): Whole eligible pool, generous safety cap of 1000.
    // Selection and sessionSize capping happen in selectSessionCards below;
    // orderBy: nextReview asc pre-sorts so the most-due cards are available first.
    prisma.card.findMany({
      where: {
        ...lessonClause,
        review: scope === 'due'
          ? { nextReview: { lte: now } }
          : { nextReview: { gt: now } },
      },
      include: {
        review:    true,
        lesson:    { select: { id: true, orderIndex: true, title: true, createdAt: true } },
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: { review: { nextReview: 'asc' } },
      take: 1000,
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

  const cards = poolResult.value

  if (cards.length === 0) return []

  // Query 2 (sequential — depends on pool IDs resolved above):
  // Fetch prerequisite edges, then keep only those whose BOTH endpoints are in
  // the pool. We deliberately do NOT push the pool filter into SQL as
  // `cardId IN ids AND prerequisiteId IN ids`: two large IN clauses over the
  // ~1000-card due pool make Prisma chunk each list to respect the SQLite
  // bound-parameter limit and emit a CARTESIAN PRODUCT of chunk pairs (~55
  // serial round-trips → ~6s against remote Turso — the historical cause of the
  // >10s /study load). A single unfiltered select of the two id columns is one
  // round-trip returning a small (2-column, deck-bounded) payload; the
  // both-endpoints-in-pool filter runs in memory. sequenceCards/selectSessionCards
  // already ignore out-of-session edges, so this filter is an optimization, not
  // a correctness requirement (verified: identical edge set to the old query).
  const idSet = new Set(cards.map((c) => c.id))
  const allEdges = await prisma.cardDependency.findMany({
    select: { cardId: true, prerequisiteId: true },
  })
  const edges = allEdges.filter(
    (e) => idSet.has(e.cardId) && idSet.has(e.prerequisiteId)
  )

  const chosen  = selectSessionCards(cards, edges, sessionSize, now)
  const ordered = sequenceCards(chosen, edges, now)

  // Build knownLemmas Set from the concurrent result — degrade to empty Set on failure.
  const knownLemmas = new Set(
    knownRowsResult.status === 'fulfilled'
      ? knownRowsResult.value.map((r) => r.normalizedFront)
      : []
  )

  // Annotate each sentence with unknownCount (pure ranking signal for the client).
  // Cost: ≤ sessionSize × 3 sentence scans — well under the Vercel 60s limit.
  for (const card of ordered) {
    for (const s of card.sentences) {
      (s as typeof s & { unknownCount: number }).unknownCount =
        countUnknownWords(s.korean, s.targetForm, knownLemmas)
    }
  }

  // Serialize: convert all Prisma Date objects to ISO strings before returning.
  // No raw Date may appear in the returned CardDTO[] (RSC-05 contract).
  return ordered.map((c) => ({
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
