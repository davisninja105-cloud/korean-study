// lib/dto.ts — shared server→client DTO types
// No 'use client' — this module runs server-side and client-side (pure type definitions).
// All Prisma DateTime fields are serialized to ISO strings before crossing the
// RSC → client component boundary (Next.js serialization constraint).

import type { DayRecord } from '@/lib/habit'

export interface ReviewDTO {
  id: string
  cardId: string
  state: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  // ts-fsrs's internal (re)learning-step index — see CardReview.learningSteps
  // doc comment in prisma/schema.prisma for why this must round-trip.
  learningSteps: number
  reps: number
  lapses: number
  nextReview: string        // ISO string, was Date
  lastReview: string | null // ISO string or null, was Date | null
}

export interface SentenceDTO {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string         // ISO string
  updatedAt: string         // ISO string
  unknownCount?: number     // annotated by study-cards.ts pipeline; absent on cards page path
}

export interface ReviewLogDTO {
  id: string
  createdAt: string         // ISO string, was Date
  cardId: string
  cardFront: string
  cardType: string
  rating: number
  gradeName: string          // 'Again' | 'Hard' | 'Good' | 'Easy'
  mastery: string            // e.g. "Memory strengthening → 3d"
}

export interface LessonRefDTO {
  title: string
  orderIndex: number
  createdAt: string         // ISO string
}

export interface CardDTO {
  id: string
  createdAt: string         // ISO string
  updatedAt: string         // ISO string
  type: string
  front: string
  back: string
  notes: string | null
  normalizedFront: string
  components: string | null
  distractors: string | null
  lessonId: string | null
  lesson: LessonRefDTO | null
  review: ReviewDTO | null
  sentences: SentenceDTO[]
}

// Returned by lib/cards-list.ts:getCardsPage() — a single type-group's
// cursor-paginated page. `cards` carry no `sentences` (CARDS-01 — dropped
// from the list query's `select`; fetched on demand elsewhere).
export interface CardsPageDTO {
  cards: CardDTO[]
  nextCursor: string | null
  hasMore: boolean
}

// Returned by lib/cards-list.ts:getCardsGroupCounts() — full-deck per-type
// counts, independent of which groups are expanded/loaded client-side.
// Same shape as StatsDTO['cardsByType'] (prisma.card.groupBy _count: true).
export interface GroupCountsDTO {
  byType: { type: string; _count: number }[]
  total: number
}

// Returned by lib/cards-list.ts:getSentencesPage() — D-07's independent
// Reading Practice cursor-paginated sentence stream (Sentence, not Card, is
// the row unit). Each row carries its full parent CardDTO (sentences always
// `[]` on the nested card — the list-select intentionally excludes them,
// same as CardsPageDTO) for rendering/audio/tap-to-gloss context.
export interface SentencePageDTO {
  sentences: (SentenceDTO & { card: CardDTO })[]
  nextCursor: string | null
  hasMore: boolean
}

// For /api/lessons and LessonRangeFilter
export interface LessonDTO {
  id: string
  orderIndex: number
  title: string
}

// Backward-compat alias so CardsClient.tsx import still works after migration
export type LessonRefItem = LessonDTO

// Dashboard DTOs — returned by lib/dashboard.ts server-only functions
// and passed as props to RSC pages (app/page.tsx, app/habits/page.tsx) or
// serialized to JSON by GET /api/stats + GET /api/activity.

export interface StatsDTO {
  totalCards: number
  dueCards: number
  totalLessons: number
  // prisma.card.groupBy({ by: ['type'], _count: true }) → _count is scalar number
  // when the _count arg is a boolean (Prisma 7 GetCardGroupByPayload generic).
  cardsByType: { type: string; _count: number }[]
  masteredCount: number
  // prisma.cardReview.groupBy({ by: ['state'], _count: true }) → _count is scalar number
  // when the _count arg is a boolean (Prisma 7 GetCardReviewGroupByPayload generic).
  cardsByState: { state: number; stateLabel: string; _count: number }[]
}

export interface ActivityDTO {
  days: DayRecord[]
  dailyGoalSeconds: number
  dayStartHour: number
}
