// lib/cards-list.ts — server-only cards-page data layer
// No 'use client' — this module runs server-side only.
// Extracts the full-card-list query shared by the /cards RSC page and
// GET /api/cards so both call one shared, DRY function (mirrors the
// lib/study-cards.ts / lib/dashboard.ts extraction pattern).

import { prisma } from '@/lib/prisma'
import type { CardDTO } from '@/lib/dto'

// select-trimmed: every column CardDTO requires, minus the three deprecated
// cloze columns (clozeSentence/clozeAnswer/clozeTranslation) — kept in the DB
// but no longer written or read by any consumer of CardDTO. `distractors` is
// kept: it IS part of CardDTO (required, non-optional) and is consumed by
// StudySession.tsx's multiple-choice mode via the /study pipeline, which
// shares the same CardDTO type contract.
const cardSelect = {
  id:              true,
  createdAt:       true,
  updatedAt:       true,
  type:            true,
  front:           true,
  back:            true,
  notes:           true,
  normalizedFront: true,
  components:      true,
  distractors:     true,
  lessonId:        true,
  lesson:    { select: { title: true, createdAt: true, orderIndex: true } },
  review:    true,
  sentences: { orderBy: { orderIndex: 'asc' as const } },
} as const

/**
 * Fetches the full card list (all cards, newest first) for the /cards page
 * and GET /api/cards. No pagination/take cap — deliberately out of scope for
 * this pass (single-tenant app, ~1000 rows); this function only trims payload
 * width via `select` relative to the previous unbounded `include`.
 */
export async function getCardsList(): Promise<CardDTO[]> {
  const cards = await prisma.card.findMany({
    select: cardSelect,
    orderBy: { createdAt: 'desc' },
  })

  // Serialize: convert all Date objects to ISO strings before the client boundary.
  return cards.map((c) => ({
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
