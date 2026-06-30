import { prisma } from '@/lib/prisma'
import CardsClient from '@/components/CardsClient'
import type { CardDTO } from '@/lib/dto'

// Re-export DTO types from the shared lib for any consumers that import from this page.
export type { CardDTO, SentenceDTO, ReviewDTO, LessonRefDTO, LessonRefItem, LessonDTO } from '@/lib/dto'

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
