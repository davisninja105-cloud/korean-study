import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'
import { Prisma } from '@/app/generated/prisma/client'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const data = await req.json()
    if (data === null || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

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
  } catch (e) {
    // REVIEW-03: a normalizedFront collision (editing card A's front to a
    // value that normalizes to card B's existing normalizedFront) raises
    // Prisma P2002. Surface a friendly 400 instead of the generic 500 so
    // the user knows the front already exists rather than seeing a crash.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'This front already exists (as a different variant of another card)' },
        { status: 400 },
      )
    }
    // WR-02: don't leak the raw error message to the client (may include
    // internal schema/Turso endpoint details). Log server-side only, mirroring
    // the disclosure posture of /api/review (T-13-02).
    console.error('PUT /api/cards/[id] failed:', e)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.card.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
