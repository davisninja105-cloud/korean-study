import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const now = new Date()

  // Optional lesson-range filter. Omit params (or pass full span) to get all lessons.
  const fromParam = searchParams.get('lessonFrom')
  const toParam   = searchParams.get('lessonTo')
  const scope     = searchParams.get('scope') ?? 'due'   // 'due' | 'ahead'

  const lessonFrom = fromParam !== null ? parseInt(fromParam, 10) : null
  const lessonTo   = toParam   !== null ? parseInt(toParam,   10) : null

  if (
    (lessonFrom !== null && (!Number.isInteger(lessonFrom) || lessonFrom < 1)) ||
    (lessonTo   !== null && (!Number.isInteger(lessonTo)   || lessonTo   < 1)) ||
    (lessonFrom !== null && lessonTo !== null && lessonFrom > lessonTo)
  ) {
    return NextResponse.json({ error: 'invalid lesson range' }, { status: 400 })
  }

  if (scope !== 'due' && scope !== 'ahead') {
    return NextResponse.json({ error: 'scope must be "due" or "ahead"' }, { status: 400 })
  }

  // Build the lesson range clause (only when a non-full-span range is requested).
  // Null params mean "all" → no clause → includes cards with lessonId = null too.
  const lessonClause =
    lessonFrom !== null && lessonTo !== null
      ? { lesson: { orderIndex: { gte: lessonFrom, lte: lessonTo } } }
      : {}

  const sessionSize = await getSessionSize()

  const cards = await prisma.card.findMany({
    where: {
      ...lessonClause,
      review: scope === 'due'
        ? { nextReview: { lte: now } }
        : { nextReview: { gt: now } },
    },
    include: {
      review: true,
      lesson: { select: { id: true, orderIndex: true, title: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { review: { nextReview: 'asc' } },
    take: sessionSize,
  })

  return NextResponse.json(cards)
}
