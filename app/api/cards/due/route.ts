import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards } from '@/lib/sequence'

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

  // Fetch the most urgent set of cards (capped at sessionSize).
  // orderBy: nextReview asc ensures the most-due cards are selected before we apply
  // the foundation-first sequencer below.
  const cards = await prisma.card.findMany({
    where: {
      ...lessonClause,
      review: scope === 'due'
        ? { nextReview: { lte: now } }
        : { nextReview: { gt: now } },
    },
    include: {
      review:   true,
      lesson:   { select: { id: true, orderIndex: true, title: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { review: { nextReview: 'asc' } },
    take: sessionSize,
  })

  if (cards.length === 0) {
    return NextResponse.json([])
  }

  // Fetch prerequisite edges restricted to the in-session card set, then apply
  // the blended foundation-first sequencer (lib/sequence.ts).
  // Only edges whose BOTH endpoints are in-session are relevant — the sequencer
  // ignores out-of-session edges anyway, but restricting the query is cheaper.
  const ids = cards.map((c) => c.id)
  const edges = await prisma.cardDependency.findMany({
    where: {
      cardId:         { in: ids },
      prerequisiteId: { in: ids },
    },
    select: { cardId: true, prerequisiteId: true },
  })

  const ordered = sequenceCards(cards, edges, now)

  return NextResponse.json(ordered)
}
