import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const now = new Date()

  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    // Cards in Review state (state=2) scheduled >= 21 days ≈ well-retained.
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])

  return NextResponse.json({ totalCards, dueCards, totalLessons, cardsByType, masteredCount })
}
