import { prisma } from '@/lib/prisma'
import { getCardsPage, getCardsGroupCounts } from '@/lib/cards-list'
import CardsClient from '@/components/CardsClient'

// Re-export DTO types from the shared lib for any consumers that import from this page.
export type {
  CardDTO,
  SentenceDTO,
  ReviewDTO,
  LessonRefDTO,
  LessonRefItem,
  LessonDTO,
  CardsPageDTO,
  GroupCountsDTO,
} from '@/lib/dto'

// Renders the live card list via Prisma. Without force-dynamic Next.js
// statically prerenders this page at build time, so cards added by a later
// sync never appear until redeploy. Force dynamic so the query runs per request.
export const dynamic = 'force-dynamic'

const INITIAL_TAKE = 30

export default async function CardsPage() {
  const [firstPage, groupCounts, lessons] = await Promise.all([
    getCardsPage({
      type: 'vocabulary',
      cursor: null,
      search: null,
      lessonFrom: null,
      lessonTo: null,
      take: INITIAL_TAKE,
    }),
    getCardsGroupCounts({ search: null, lessonFrom: null, lessonTo: null }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  return (
    <CardsClient
      initialCardsPage={firstPage}
      initialGroupCounts={groupCounts}
      initialLessons={lessons}
    />
  )
}
