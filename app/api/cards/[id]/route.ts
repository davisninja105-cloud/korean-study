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

    // WR-02: validate individual field types/shapes before they reach Prisma —
    // a non-string front would throw inside normalizeFront() (caught only by
    // the generic 500 catch below), an empty front would collide with other
    // cards on the normalizedFront unique index, and type/sentences are
    // otherwise written verbatim with no shape check.
    if (data.front !== undefined && (typeof data.front !== 'string' || data.front.trim() === '')) {
      return NextResponse.json({ error: 'front must be a non-empty string' }, { status: 400 })
    }
    if (data.back !== undefined && typeof data.back !== 'string') {
      return NextResponse.json({ error: 'back must be a string' }, { status: 400 })
    }
    if (data.notes !== undefined && data.notes !== null && typeof data.notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
    }
    if (data.type !== undefined && !['vocabulary', 'grammar', 'phrase'].includes(data.type)) {
      return NextResponse.json({ error: 'type must be vocabulary, grammar, or phrase' }, { status: 400 })
    }
    if (
      data.sentences !== undefined &&
      (!Array.isArray(data.sentences) ||
        data.sentences.some((s: unknown) => typeof s !== 'object' || s === null))
    ) {
      return NextResponse.json({ error: 'sentences must be an array of objects' }, { status: 400 })
    }

    // WR-03: update scalar card fields (when front changes, keep normalizedFront
    // in sync) and replace-all sentences in a SINGLE transaction, so a mid-flow
    // failure never leaves the card with a new front but stale sentences.
    const cardUpdate = prisma.card.update({
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

    // If no sentences key in payload, leave existing sentences untouched.
    const sentenceOps = Array.isArray(data.sentences)
      ? (() => {
          const sentenceData = (data.sentences as { korean: string; targetForm: string; translation: string }[])
            .map((s, i) => ({
              korean: s.korean ?? '',
              targetForm: s.targetForm ?? '',
              translation: s.translation ?? '',
              cardId: id,
              orderIndex: i,
            }))
          return [
            prisma.sentence.deleteMany({ where: { cardId: id } }),
            ...sentenceData.map((s) => prisma.sentence.create({ data: s })),
          ]
        })()
      : []

    // Array-form transaction — safe with the libSQL adapter.
    await prisma.$transaction([cardUpdate, ...sentenceOps])

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
    // WR-01: don't leak the raw error message to the client (may include
    // internal schema/Turso endpoint details) — same disclosure posture as
    // the PUT handler above (WR-02). Map "not found" (P2025) to 404.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }
    console.error('DELETE /api/cards/[id] failed:', e)
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 })
  }
}
