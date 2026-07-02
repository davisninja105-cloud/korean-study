import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reviewCard, type Grade } from '@/lib/fsrs'

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

  // REVIEW-02: reject any rating outside the valid FSRS grades {1,2,3,4}
  // before any DB read or FSRS computation, so reviewCard() is never reached
  // with an invalid rating (prevents undefined FSRS behavior / throws).
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 4
  ) {
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

    const updated = reviewCard(cardReview, rating as Grade)

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
