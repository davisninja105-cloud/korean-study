import { prisma } from '@/lib/prisma'
import { getCardsList } from '@/lib/cards-list'
import CardsClient from '@/components/CardsClient'

// Re-export DTO types from the shared lib for any consumers that import from this page.
export type { CardDTO, SentenceDTO, ReviewDTO, LessonRefDTO, LessonRefItem, LessonDTO } from '@/lib/dto'

// Renders the live card list via Prisma. Without force-dynamic Next.js
// statically prerenders this page at build time, so cards added by a later
// sync never appear until redeploy. Force dynamic so the query runs per request.
export const dynamic = 'force-dynamic'

export default async function CardsPage() {
  const [cardDTOs, lessons] = await Promise.all([
    getCardsList(),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  return <CardsClient initialCards={cardDTOs} initialLessons={lessons} />
}
