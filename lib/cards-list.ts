// lib/cards-list.ts — server-only cards-page data layer
// No 'use client' — this module runs server-side only.
// Cursor-paginated, per-type-group card list + a full-deck group-count
// aggregate. Replaces the old unbounded getCardsList() (single
// `findMany()` with a full `sentences` include) with the CARDS-01 shape:
// a capped page, sentences excluded entirely from the list read. Shared by
// the /cards RSC page and GET /api/cards (mirrors the lib/study-cards.ts /
// lib/dashboard.ts extraction pattern already established in this codebase).

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/app/generated/prisma/client'
import type { CardDTO, CardsPageDTO, GroupCountsDTO, SentenceDTO, SentencePageDTO } from '@/lib/dto'

// select-trimmed: every column CardDTO requires MINUS `sentences` — CARDS-01
// requires the list query to carry zero sentence rows. Sentences move to an
// on-demand fetch (a future GET /api/cards/[id] / getSentencesPage, not part
// of this plan) for the Edit sheet and Reading practice view respectively.
const cardSelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  type: true,
  front: true,
  back: true,
  notes: true,
  normalizedFront: true,
  components: true,
  distractors: true,
  lessonId: true,
  lesson: { select: { title: true, createdAt: true, orderIndex: true } },
  review: true,
  // sentences: DROPPED from the list select per CARDS-01.
} as const

export interface CardsPageParams {
  type: string // 'vocabulary' | 'grammar' | 'phrase' | 'other' | 'all'
  cursor: string | null // last-seen Card.id, or null for page 1
  search: string | null // already-lowercased by the caller (Pitfall 4)
  lessonFrom: number | null
  lessonTo: number | null
  take: number
}

export interface CardsGroupCountsParams {
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
}

/**
 * Composes the shared `where` clause for both getCardsPage and
 * getCardsGroupCounts, so search/lesson-range/type filtering can never drift
 * out of sync between the two queries (CARDS-03's correctness requirement —
 * counts must reflect the exact same filtered deck the page itself reads).
 * D-05: search matches inside Sentence.korean/translation too, not just the
 * card's own front/back/notes.
 */
function buildCardsWhere(params: {
  type: string
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
}): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {}

  if (params.type !== 'all') {
    where.type = params.type
  }

  if (params.search) {
    const q = params.search
    where.OR = [
      { front: { contains: q } },
      { back: { contains: q } },
      { notes: { contains: q } },
      {
        sentences: {
          some: {
            OR: [{ korean: { contains: q } }, { translation: { contains: q } }],
          },
        },
      },
    ]
  }

  if (params.lessonFrom !== null || params.lessonTo !== null) {
    where.lesson = {
      orderIndex: {
        ...(params.lessonFrom !== null ? { gte: params.lessonFrom } : {}),
        ...(params.lessonTo !== null ? { lte: params.lessonTo } : {}),
      },
    }
  }

  return where
}

/**
 * Cursor-paginated read of a single type-group's cards (or 'all' for a
 * flattened search view — see D-06, wired in a later plan). Sentence-free
 * per CARDS-01. Overfetches by one row (`take + 1`) to detect `hasMore`
 * cheaply without a second count query; `orderBy` carries an `id` tiebreak
 * so cursor pagination stays deterministic when `createdAt` timestamps
 * collide (a page boundary landing exactly on the last row never skips or
 * duplicates a row on the next fetch).
 */
export async function getCardsPage(params: CardsPageParams): Promise<CardsPageDTO> {
  const where = buildCardsWhere(params)

  const rows = await prisma.card.findMany({
    where,
    select: cardSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > params.take
  const page = hasMore ? rows.slice(0, params.take) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null

  const cards: CardDTO[] = page.map((c) => ({
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
    sentences: [],
  }))

  return { cards, nextCursor, hasMore }
}

/**
 * Full-deck per-type counts, independent of which groups are
 * expanded/loaded client-side — a collapsed group still shows its true
 * count without fetching its rows. Same `groupBy(['type'], _count: true)`
 * shape already used in lib/dashboard.ts:24, composed with the same
 * search/lesson-range `where` clause getCardsPage uses (never `type`,
 * since a per-type breakdown is the whole point of this query).
 */
export async function getCardsGroupCounts(
  params: CardsGroupCountsParams
): Promise<GroupCountsDTO> {
  const where = buildCardsWhere({ ...params, type: 'all' })
  const byType = await prisma.card.groupBy({ by: ['type'], where, _count: true })
  const total = byType.reduce((sum, g) => sum + g._count, 0)
  return { byType, total }
}

export interface SentencesPageParams {
  cursor: string | null // last-seen Sentence.id, or null for page 1
  search: string | null // already-lowercased by the caller (Pitfall 4)
  lessonFrom: number | null
  lessonTo: number | null
  take: number // clamping lives in the caller (app/api/cards/sentences/route.ts), not here
}

/**
 * Cursor-paginated read of Sentence rows across the whole deck — D-07's
 * independently-paginated Reading Practice query, where Sentence (not Card)
 * is the row unit, so the tab never depends on whatever page of Cards
 * happens to be loaded client-side. Mirrors getCardsPage's overfetch-by-one
 * (`take + 1`) hasMore detection and `[{createdAt:'desc'},{id:'desc'}]`
 * deterministic id-tiebreak ordering. `search` matches inside the
 * sentence's OWN `korean`/`translation` text (not the parent card's
 * front/back) — consistent with D-05's search semantics on the Cards
 * endpoint, just scoped to the sentence itself since Sentence is the row
 * unit here.
 */
export async function getSentencesPage(
  params: SentencesPageParams
): Promise<SentencePageDTO> {
  const where: Prisma.SentenceWhereInput = {}

  if (params.search) {
    const q = params.search
    where.OR = [{ korean: { contains: q } }, { translation: { contains: q } }]
  }

  if (params.lessonFrom !== null || params.lessonTo !== null) {
    where.card = {
      lesson: {
        orderIndex: {
          ...(params.lessonFrom !== null ? { gte: params.lessonFrom } : {}),
          ...(params.lessonTo !== null ? { lte: params.lessonTo } : {}),
        },
      },
    }
  }

  const rows = await prisma.sentence.findMany({
    where,
    include: { card: { select: cardSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: params.take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasMore = rows.length > params.take
  const page = hasMore ? rows.slice(0, params.take) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null

  const sentences: (SentenceDTO & { card: CardDTO })[] = page.map((s) => ({
    id: s.id,
    cardId: s.cardId,
    korean: s.korean,
    targetForm: s.targetForm,
    translation: s.translation,
    orderIndex: s.orderIndex,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    card: {
      ...s.card,
      createdAt: s.card.createdAt.toISOString(),
      updatedAt: s.card.updatedAt.toISOString(),
      lesson: s.card.lesson
        ? { ...s.card.lesson, createdAt: s.card.lesson.createdAt.toISOString() }
        : null,
      review: s.card.review
        ? {
            ...s.card.review,
            nextReview: s.card.review.nextReview.toISOString(),
            lastReview: s.card.review.lastReview?.toISOString() ?? null,
          }
        : null,
      sentences: [],
    },
  }))

  return { sentences, nextCursor, hasMore }
}
