// Server component — no client directive
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

// This page renders the live due-card pool via Prisma. Without force-dynamic,
// Next.js statically prerenders it at build time, so every fresh navigation
// serves the same build-time card set (the "same cards just reviewed" bug).
// Force dynamic so getStudyCards() re-queries the DB on every request.
export const dynamic = 'force-dynamic'

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
