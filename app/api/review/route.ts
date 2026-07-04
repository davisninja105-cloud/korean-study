import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reviewCard, type Grade } from '@/lib/fsrs'
import { Prisma } from '@/app/generated/prisma/client'

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
  const { cardId, rating, idempotencyKey } = body ?? {}

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

  // V5 / T-17-03: reject a missing/empty/over-100-char idempotencyKey before
  // any DB call. Bounds ReviewLog storage growth and guarantees every write
  // below has a valid dedup key to rely on.
  if (typeof idempotencyKey !== 'string' || idempotencyKey === '' || idempotencyKey.length > 100) {
    return NextResponse.json(
      { error: 'idempotencyKey must be a non-empty string (max 100 chars)' },
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

    // HIST-01/HIST-02: write the CardReview update and the ReviewLog audit
    // row inside one atomic array-form transaction — either both land or
    // neither does. If reviewLog.create hits the idempotencyKey UNIQUE
    // constraint (a retried request), the whole transaction rolls back so
    // cardReview.update never re-applies FSRS state (see catch below).
    const [review] = await prisma.$transaction([
      prisma.cardReview.update({ where: { cardId }, data: updated }),
      prisma.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } }),
    ])

    return NextResponse.json(review)
  } catch (e) {
    // HIST-02: a duplicate idempotencyKey collides on ReviewLog's UNIQUE
    // index, rolling back the whole transaction — CardReview was NOT
    // re-applied. Treat this as an idempotent success: read back the
    // current (already-correct) state and return it with 200, so the
    // client's retry wrapper (which treats any non-ok status as a failed
    // attempt) doesn't spuriously retry an already-successful review.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const current = await prisma.cardReview.findUnique({ where: { cardId } })
      return NextResponse.json(current)
    }
    console.error('POST /api/review failed:', e)
    return NextResponse.json(
      { error: 'Failed to record review' },
      { status: 500 },
    )
  }
}
