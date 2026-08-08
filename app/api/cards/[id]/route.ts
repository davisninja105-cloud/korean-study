import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'
import { Prisma } from '@/app/generated/prisma/client'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const

// Full-card fetch, sentences included — needed once GET /api/cards' list
// query drops sentences entirely (CARDS-01). The Edit sheet calls this
// on-demand before rendering CardEditor: CardEditor's handleSave
// unconditionally PUTs whatever `sentences` array it was seeded with, and
// the PUT handler below treats any array (including []) as "replace all
// sentences" — so opening the editor with a sentence-free CardDTO and
// saving ANY field would silently delete every real Sentence row for that
// card. This route is the fix: CardsClient fetches the full card (with
// real sentences) before the editor ever mounts.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const card = await prisma.card.findUnique({
      where: { id },
      include: {
        review: true,
        lesson: { select: { title: true, createdAt: true, orderIndex: true } },
        sentences: sentencesInclude,
      },
    })
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
    }
    // Serialize dates to ISO strings — same shape as POST's dto in
    // app/api/cards/route.ts and lib/cards-list.ts's getCardsPage.
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
  } catch (e) {
    console.error('GET /api/cards/[id] failed:', e)
    return NextResponse.json({ error: 'Failed to load card' }, { status: 500 })
  }
}

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

    // CR-01 fix: upsert sentences by id instead of blanket delete+recreate,
    // so a Sentence's id stays stable across a save when the client echoes
    // that id back unchanged — CardsClient's Reading Practice patch matches
    // on sentence id, and previously always missed because every id was
    // regenerated on every save. If no sentences key in payload, leave
    // existing sentences untouched (no new query in that branch).
    let sentenceOps: Prisma.PrismaPromise<unknown>[] = []
    if (Array.isArray(data.sentences)) {
      const incoming = data.sentences as {
        id?: string
        korean: string
        targetForm: string
        translation: string
      }[]
      // Scoped to THIS card's own sentences only — never a global id lookup
      // (T-31-12 IDOR-shaped mitigation). A client-supplied id belonging to
      // a different card is never in this set, so it falls through to the
      // `create` branch below instead of mutating a foreign row.
      const existing = await prisma.sentence.findMany({
        where: { cardId: id },
        select: { id: true },
      })
      const existingIds = new Set(existing.map((s) => s.id))
      const keepIds = new Set(
        incoming.filter((s) => s.id && existingIds.has(s.id)).map((s) => s.id as string)
      )
      sentenceOps = [
        // T-31-13 data-loss mitigation: `notIn` is scoped from the same
        // cardId-scoped existingIds set above, never a global id comparison
        // — a sentence genuinely absent from `keepIds` is one the user
        // removed in the editor, not a matching bug.
        prisma.sentence.deleteMany({ where: { cardId: id, id: { notIn: [...keepIds] } } }),
        ...incoming.map((s, i) =>
          s.id && existingIds.has(s.id)
            ? prisma.sentence.update({
                // Compound where (id AND cardId) — defense in depth per the
                // threat_model, even though existingIds is already
                // cardId-scoped above.
                where: { id: s.id, cardId: id },
                data: {
                  korean: s.korean ?? '',
                  targetForm: s.targetForm ?? '',
                  translation: s.translation ?? '',
                  orderIndex: i,
                },
              })
            : prisma.sentence.create({
                data: {
                  korean: s.korean ?? '',
                  targetForm: s.targetForm ?? '',
                  translation: s.translation ?? '',
                  cardId: id,
                  orderIndex: i,
                },
              })
        ),
      ]
    }

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
    // WR-01: mirror GET/DELETE's "not found" handling — a concurrent
    // deletion between the Edit sheet opening and Save (or any other race
    // that removes the row) previously fell through to the generic 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 })
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
