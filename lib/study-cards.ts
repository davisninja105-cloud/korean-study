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
  const cards = poolResult.value

  if (cards.length === 0) return []

  // Query 2 (sequential — depends on pool IDs resolved above):
  // Fetch prerequisite edges across the whole pool.
  // sequenceCards ignores out-of-session edges, so passing the full pool edge
  // list to both selectSessionCards and sequenceCards is safe.
  const ids = cards.map((c) => c.id)
  const edges = await prisma.cardDependency.findMany({
    where: {
      cardId:         { in: ids },
      prerequisiteId: { in: ids },
    },
    select: { cardId: true, prerequisiteId: true },
  })

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
