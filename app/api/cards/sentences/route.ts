import { NextRequest, NextResponse } from 'next/server'
import { getSentencesPage } from '@/lib/cards-list'

// D-07's independent Reading Practice endpoint — Sentence is the row unit,
// not derived from whatever page of Cards happens to be loaded client-side.
// DoS clamp (T-31-06) mirrors GET /api/cards' T-31-01 clamp on `take`.
const DEFAULT_TAKE = 30
const MAX_TAKE = 100

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cursor = searchParams.get('cursor')
    const search = searchParams.get('search')?.toLowerCase() || null
    const lessonFromRaw = searchParams.get('lessonFrom')
    const lessonToRaw = searchParams.get('lessonTo')
    const lessonFrom = lessonFromRaw !== null ? Number(lessonFromRaw) : null
    const lessonTo = lessonToRaw !== null ? Number(lessonToRaw) : null
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
