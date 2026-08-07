import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'
import { getCardsPage, getCardsGroupCounts } from '@/lib/cards-list'
import { Prisma } from '@/app/generated/prisma/client'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const

// DOS clamp (T-31-01) — never trust the raw client-supplied `take` value,
// mirrors lib/settings.ts's server-defined session-size pattern.
const DEFAULT_TAKE = 30
const MAX_TAKE = 100

// Validate raw string before parsing — parseInt silently truncates floats and mixed
// values (e.g. '1.5' → 1, '1abc' → 1), making an isInteger check a no-op without this.
// Mirrors GET /api/cards/due's INTEGER_RE validation pattern.
const INTEGER_RE = /^[1-9]\d*$/

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') ?? 'all'
    const cursor = searchParams.get('cursor')
    const search = searchParams.get('search')?.toLowerCase() || null
    const lessonFromRaw = searchParams.get('lessonFrom')
    const lessonToRaw = searchParams.get('lessonTo')
    const lessonFrom = lessonFromRaw !== null
      ? (INTEGER_RE.test(lessonFromRaw) ? parseInt(lessonFromRaw, 10) : NaN)
      : null
    const lessonTo = lessonToRaw !== null
      ? (INTEGER_RE.test(lessonToRaw) ? parseInt(lessonToRaw, 10) : NaN)
      : null

    if (
      (lessonFrom !== null && isNaN(lessonFrom)) ||
      (lessonTo !== null && isNaN(lessonTo)) ||
      (lessonFrom !== null && lessonTo !== null && lessonFrom > lessonTo)
    ) {
      return NextResponse.json({ error: 'invalid lesson range' }, { status: 400 })
    }

    const requestedTake = Number(searchParams.get('take') ?? DEFAULT_TAKE)
    const take = Math.min(
      Number.isFinite(requestedTake) && requestedTake > 0 ? requestedTake : DEFAULT_TAKE,
      MAX_TAKE
    )

    const page = await getCardsPage({ type, cursor, search, lessonFrom, lessonTo, take })

    // Bundle full-deck group counts into the page-1 (cursor-less) response
    // only — subsequent "load more" calls always carry a cursor and skip
    // this second query, keeping the round-trip count minimal.
    if (!cursor) {
      const groupCounts = await getCardsGroupCounts({ search, lessonFrom, lessonTo })
      return NextResponse.json({ ...page, groupCounts })
    }

    return NextResponse.json(page)
  } catch (e) {
    console.error('GET /api/cards failed:', e)
    return NextResponse.json({ error: 'Failed to load cards' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    if (data === null || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { type, front, back, notes, sentences } = data

    // WR-02: validate field shapes before they reach Prisma — a non-string
    // front would throw inside normalizeFront() (previously uncaught), and
    // an invalid type would be persisted verbatim with no enum check.
    // Mirrors the PUT handler's validation in app/api/cards/[id]/route.ts.
    if (typeof front !== 'string' || front.trim() === '') {
      return NextResponse.json({ error: 'front must be a non-empty string' }, { status: 400 })
    }
    if (!['vocabulary', 'grammar', 'phrase'].includes(type)) {
      return NextResponse.json({ error: 'type must be vocabulary, grammar, or phrase' }, { status: 400 })
    }
    if (typeof back !== 'string' || back.trim() === '') {
      return NextResponse.json({ error: 'back must be a non-empty string' }, { status: 400 })
    }
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
    }
    if (
      sentences !== undefined &&
      (!Array.isArray(sentences) ||
        sentences.some((s: unknown) => typeof s !== 'object' || s === null))
    ) {
      return NextResponse.json({ error: 'sentences must be an array of objects' }, { status: 400 })
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
                  korean: s.korean ?? '',
                  targetForm: s.targetForm ?? '',
                  translation: s.translation ?? '',
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
  } catch (e) {
    // WR-02: a normalizedFront collision raises Prisma P2002 — surface a
    // friendly 400 instead of an unhandled 500, mirroring the PUT handler's
    // disclosure posture in app/api/cards/[id]/route.ts.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'This front already exists' }, { status: 400 })
    }
    console.error('POST /api/cards failed:', e)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}
