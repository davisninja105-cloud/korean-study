import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const now = new Date()

  const [totalCards, dueCards, totalLessons, cardsByType] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
  ])

  return NextResponse.json({ totalCards, dueCards, totalLessons, cardsByType })
}
