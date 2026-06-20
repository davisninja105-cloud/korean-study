import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const data = await req.json()

  // Update scalar card fields. When front changes, keep normalizedFront in sync.
  await prisma.card.update({
    where: { id },
    data: {
      ...(data.type  !== undefined && { type:  data.type }),
      ...(data.front !== undefined && {
        front:           data.front,
        normalizedFront: normalizeFront(data.front),
      }),
      ...(data.back  !== undefined && { back:  data.back }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  })

  // Replace-all sentences atomically (array-form transaction — safe with libSQL adapter).
  // If no sentences key in payload, leave existing sentences untouched.
  if (Array.isArray(data.sentences)) {
    const sentenceData = (data.sentences as { korean: string; targetForm: string; translation: string }[])
      .map((s, i) => ({
        korean: s.korean ?? '',
        targetForm: s.targetForm ?? '',
        translation: s.translation ?? '',
        cardId: id,
        orderIndex: i,
      }))

    await prisma.$transaction([
      prisma.sentence.deleteMany({ where: { cardId: id } }),
      ...sentenceData.map((s) => prisma.sentence.create({ data: s })),
    ])
  }

  // Return the full updated card (sentences included) so the client can merge state.
  const card = await prisma.card.findUniqueOrThrow({
    where: { id },
    include: { review: true, sentences: sentencesInclude },
  })

  return NextResponse.json(card)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.card.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
