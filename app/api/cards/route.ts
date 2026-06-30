import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const

export async function GET() {
  const cards = await prisma.card.findMany({
    include: {
      review: true,
      lesson: { select: { title: true, createdAt: true, orderIndex: true } },
      sentences: sentencesInclude,
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cards)
}

export async function POST(req: NextRequest) {
  const { type, front, back, notes, sentences } = await req.json()
  if (!type || !front || !back) {
    return NextResponse.json({ error: 'type, front, and back are required' }, { status: 400 })
  }

  const card = await prisma.card.create({
    data: {
      type,
      front,
      back,
      notes: notes ?? null,
      normalizedFront: normalizeFront(front),
      sentences: Array.isArray(sentences) && sentences.length > 0
        ? {
            create: sentences.map(
              (s: { korean: string; targetForm: string; translation: string }, i: number) => ({
                korean: s.korean,
                targetForm: s.targetForm,
                translation: s.translation,
                orderIndex: i,
              })
            ),
          }
        : undefined,
      review: { create: {} },
    },
    include: {
      review: true,
      lesson: { select: { title: true, createdAt: true, orderIndex: true } },
      sentences: sentencesInclude,
    },
  })

  // Serialize dates to ISO strings so the RSC boundary contract (CardDTO) is satisfied.
  // Raw Prisma Date objects serialize as empty objects {} in JSON.
  const dto = {
    ...card,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    lesson: card.lesson
      ? { ...card.lesson, createdAt: card.lesson.createdAt.toISOString() }
      : null,
    review: card.review
      ? {
          ...card.review,
          nextReview: card.review.nextReview.toISOString(),
          lastReview: card.review.lastReview?.toISOString() ?? null,
        }
      : null,
    sentences: card.sentences.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  }
  return NextResponse.json(dto)
}
