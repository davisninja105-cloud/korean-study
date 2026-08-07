import { NextRequest, NextResponse } from 'next/server'
import { getSentencesPage } from '@/lib/cards-list'

// D-07's independent Reading Practice endpoint — Sentence is the row unit,
// not derived from whatever page of Cards happens to be loaded client-side.
// DoS clamp (T-31-06) mirrors GET /api/cards' T-31-01 clamp on `take`.
const DEFAULT_TAKE = 30
const MAX_TAKE = 100

// Validate raw string before parsing — parseInt silently truncates floats and mixed
// values (e.g. '1.5' → 1, '1abc' → 1), making an isInteger check a no-op without this.
// Mirrors GET /api/cards/due's INTEGER_RE validation pattern.
const INTEGER_RE = /^[1-9]\d*$/

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
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

    const page = await getSentencesPage({ cursor, search, lessonFrom, lessonTo, take })
    return NextResponse.json(page)
  } catch (e) {
    console.error('GET /api/cards/sentences failed:', e)
    return NextResponse.json({ error: 'Failed to load sentences' }, { status: 500 })
  }
}
