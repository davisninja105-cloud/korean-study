import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { cardId, prevState } = body

  if (!cardId || typeof cardId !== 'string') {
    return NextResponse.json({ error: 'cardId required' }, { status: 400 })
  }

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
      lastReview: prevState.lastReview ? new Date(prevState.lastReview) : exists.lastReview,
    },
  })

  return NextResponse.json({ ok: true })
}
