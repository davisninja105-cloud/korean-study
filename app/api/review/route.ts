import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reviewCard, type Grade } from '@/lib/fsrs'

// IN-01: named type guard instead of an unchecked `as Grade` cast, so the
// compiler — not just the runtime check below — enforces the relationship.
// If a future edit relaxes the range check, `reviewCard(cardReview, rating)`
// stops compiling instead of silently keeping the invalid cast.
function isGrade(n: unknown): n is Grade {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4
}

export async function POST(req: NextRequest) {
  // WR-01: parse the body inside a try so malformed JSON returns a structured
  // 400 instead of an unhandled throw (Next.js would otherwise return a raw
  // framework-level 500 that the client's retry wrapper isn't expecting).
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { cardId, rating } = body ?? {}

  if (cardId === undefined || rating === undefined) {
    return NextResponse.json({ error: 'cardId and rating required' }, { status: 400 })
  }

  // WR-05: validate cardId is a non-empty string, matching the sibling
  // /api/review/undo route's input contract (`!cardId || typeof cardId !== 'string'`).
  // Without this a non-string cardId either yields a misleading 404 (empty
  // string) or throws inside findUnique (caught by the generic 500 below,
  // but unnecessarily).
  if (typeof cardId !== 'string' || cardId === '') {
    return NextResponse.json({ error: 'cardId must be a non-empty string' }, { status: 400 })
  }

  // REVIEW-02: reject any rating outside the valid FSRS grades {1,2,3,4}
  // before any DB read or FSRS computation, so reviewCard() is never reached
  // with an invalid rating (prevents undefined FSRS behavior / throws).
  if (!isGrade(rating)) {
    return NextResponse.json(
      { error: 'rating must be one of 1, 2, 3, 4' },
      { status: 400 },
    )
  }

  // REVIEW-01: wrap the DB + FSRS calls so a Prisma failure returns a
  // structured response instead of an unhandled throw. The raw error is
  // logged server-side only; the client gets a generic message to avoid
  // leaking internal schema details (threat T-13-02).
  try {
    const cardReview = await prisma.cardReview.findUnique({ where: { cardId } })
    if (!cardReview) {
      return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
    }

    const updated = reviewCard(cardReview, rating)

    const review = await prisma.cardReview.update({
      where: { cardId },
      data: updated,
    })

    return NextResponse.json(review)
  } catch (e) {
    console.error('POST /api/review failed:', e)
    return NextResponse.json(
      { error: 'Failed to record review' },
      { status: 500 },
    )
  }
}
