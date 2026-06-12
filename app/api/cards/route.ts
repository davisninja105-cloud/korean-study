import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
    include: { review: true, sentences: sentencesInclude },
  })

  return NextResponse.json(card)
}
