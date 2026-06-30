import { prisma } from '@/lib/prisma'
import CardsClient from '@/components/CardsClient'

// ── DTO types (server→client boundary) ─────────────────────────────────────
// All Prisma DateTime fields are serialized to ISO strings before crossing
// the RSC → client component boundary (Next.js serialization constraint).

export interface ReviewDTO {
  id: string
  cardId: string
  state: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  nextReview: string      // ISO string, was Date
  lastReview: string | null // ISO string or null, was Date | null
}

export interface SentenceDTO {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string       // ISO string
  updatedAt: string       // ISO string
}

export interface LessonRefDTO {
  title: string
  orderIndex: number
  createdAt: string       // ISO string
}

export interface CardDTO {
  id: string
  createdAt: string       // ISO string
  updatedAt: string       // ISO string
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

export interface LessonRefItem {
  id: string
  orderIndex: number
  title: string
}

export default async function CardsPage() {
  const [cards, lessons] = await Promise.all([
    prisma.card.findMany({
      include: {
        review: true,
        lesson: { select: { title: true, createdAt: true, orderIndex: true } },
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  // Serialize: convert all Date objects to ISO strings before the client boundary
  const cardDTOs: CardDTO[] = cards.map((c) => ({
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

  return <CardsClient initialCards={cardDTOs} initialLessons={lessons} />
}
