import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'

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

  // Fetch the whole eligible pool (generous safety cap of 1000).
  // Selection and sessionSize capping now happen in selectSessionCards below;
  // orderBy: nextReview asc pre-sorts so the most-due cards are available first.
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
    take: 1000,
  })

  if (cards.length === 0) {
    return NextResponse.json([])
  }

  // Fetch prerequisite edges across the whole pool.
  // sequenceCards ignores out-of-session edges, so passing the full pool edge
  // list to both selectSessionCards and sequenceCards is safe.
  const ids = cards.map((c) => c.id)
  const edges = await prisma.cardDependency.findMany({
    where: {
      cardId:         { in: ids },
      prerequisiteId: { in: ids },
    },
    select: { cardId: true, prerequisiteId: true },
  })

  const chosen  = selectSessionCards(cards, edges, sessionSize, now)
  const ordered = sequenceCards(chosen, edges, now)

  // Query cards the learner has seen at least once (FSRS state ≥ 1) ONCE per request.
  // "Seen once" is the threshold for counting a word as known context.
  // Selecting only normalizedFront keeps this fast and allocation-light.
  const knownRows = await prisma.card.findMany({
    where: { review: { state: { gte: 1 } } },
    select: { normalizedFront: true },
  })
  const knownLemmas = new Set(knownRows.map((r) => r.normalizedFront))

  // Annotate each sentence with a unknownCount (pure ranking signal for the client).
  // Cost: ≤ sessionSize × 3 sentence scans — well under the Vercel 60s limit.
  for (const card of ordered) {
    for (const s of card.sentences) {
      (s as typeof s & { unknownCount: number }).unknownCount =
        countUnknownWords(s.korean, s.targetForm, knownLemmas)
    }
  }

  return NextResponse.json(ordered)
}
