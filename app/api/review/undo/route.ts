import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // WR-02: parse the body inside a try so malformed JSON returns a structured
  // 400 instead of an unhandled throw, matching the sibling /api/review route
  // and the project's documented Error Handling convention.
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { cardId, prevState } = body ?? {}

  if (!cardId || typeof cardId !== 'string') {
    return NextResponse.json({ error: 'cardId required' }, { status: 400 })
  }

  // WR-02: validate prevState is a non-null object before it is destructured
  // below. Without this, an omitted/`null` prevState throws a TypeError from
  // inside the try block instead of returning a clean 400.
  if (prevState === null || prevState === undefined || typeof prevState !== 'object') {
    return NextResponse.json({ error: 'prevState required' }, { status: 400 })
  }

  try {
    const exists = await prisma.cardReview.findUnique({ where: { cardId } })
    if (!exists) {
      return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
    }

    await prisma.cardReview.update({
      where: { cardId },
      data: {
        state: prevState.state ?? exists.state,
        stability: prevState.stability ?? exists.stability,
        difficulty: prevState.difficulty ?? exists.difficulty,
        elapsedDays: prevState.elapsedDays ?? exists.elapsedDays,
        scheduledDays: prevState.scheduledDays ?? exists.scheduledDays,
        learningSteps: prevState.learningSteps ?? exists.learningSteps,
        reps: prevState.reps ?? exists.reps,
        lapses: prevState.lapses ?? exists.lapses,
        nextReview: prevState.nextReview ? new Date(prevState.nextReview) : exists.nextReview,
        // WR-01: use presence, not truthiness, to decide whether to fall back.
        // `prevState.lastReview` is legitimately `null` for a card's first-ever
        // review; a truthiness check couldn't distinguish that from "absent"
        // and would wrongly fall through to `exists.lastReview` (the current,
        // post-grade value), leaving the row stamped with a review timestamp
        // that was supposedly undone.
        lastReview:
          'lastReview' in prevState
            ? prevState.lastReview
              ? new Date(prevState.lastReview)
              : null
            : exists.lastReview,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('POST /api/review/undo failed:', e)
    return NextResponse.json({ error: 'Failed to undo review' }, { status: 500 })
  }
}
