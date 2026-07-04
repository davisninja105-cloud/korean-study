// lib/review-history.ts — server-only review-history pipeline
// No 'use client' — this module runs server-side only.
// Shared by both app/history/page.tsx (RSC first page) and GET /api/reviews
// (subsequent cursor-paginated pages) — mirrors lib/study-cards.ts:getStudyCards().

import { prisma } from '@/lib/prisma'
import { Rating, masteryPhrase } from '@/lib/fsrs'
import type { ReviewLogDTO } from '@/lib/dto'

export const PAGE_SIZE = 25

export interface ReviewHistoryParams {
  cardId?: string | null
  cursor?: string | null   // last-seen ReviewLog.id from the previous page
  take?: number            // defaults to PAGE_SIZE
}

// Raw ReviewLog row shape as returned by prisma.reviewLog.findMany with the
// { card: { select: { front: true, type: true } } } include used below.
interface RawReviewLog {
  id: string
  createdAt: Date
  cardId: string
  rating: number
  nextReview: Date
  card: { front: string; type: string }
}

// Pure — no side effects. Unit-tested (Wave 0) without a live DB.
export function buildReviewWhere(cardId?: string | null) {
  return cardId ? { cardId } : {}
}

// Pure — no side effects. Unit-tested (Wave 0) without a live DB.
export function mapReviewLogToDTO(raw: RawReviewLog): ReviewLogDTO {
  return {
    id: raw.id,
    createdAt: raw.createdAt.toISOString(),
    cardId: raw.cardId,
    cardFront: raw.card.front,
    cardType: raw.card.type,
    rating: raw.rating,
    gradeName: Rating[raw.rating],
    mastery: masteryPhrase(raw.nextReview, raw.createdAt),
  }
}

export async function getReviewHistory(params: ReviewHistoryParams): Promise<ReviewLogDTO[]> {
  const { cardId, cursor, take = PAGE_SIZE } = params

  const logs = await prisma.reviewLog.findMany({
    where: buildReviewWhere(cardId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // skip:1 excludes cursor row itself (Pitfall 2)
    include: { card: { select: { front: true, type: true } } },
  })

  return logs.map(mapReviewLogToDTO)
}
