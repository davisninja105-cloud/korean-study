// Server component — no client directive
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

export default async function StudyPage() {
  const [cardDTOs, lessons] = await Promise.all([
    getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])
  return <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
}
