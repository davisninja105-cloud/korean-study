import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reviewCard, type Grade } from '@/lib/fsrs'

export async function POST(req: NextRequest) {
  const { cardId, rating } = await req.json()
  if (cardId === undefined || rating === undefined) {
    return NextResponse.json({ error: 'cardId and rating required' }, { status: 400 })
  }

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
}
