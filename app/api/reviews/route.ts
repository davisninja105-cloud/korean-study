import { NextRequest, NextResponse } from 'next/server'
import { getReviewHistory, isValidOpaqueId, PAGE_SIZE } from '@/lib/review-history'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const cursor = searchParams.get('cursor')
    const cardId = searchParams.get('cardId')

    if (
      (cursor !== null && !isValidOpaqueId(cursor)) ||
      (cardId !== null && !isValidOpaqueId(cardId))
    ) {
      return NextResponse.json({ error: 'invalid parameter' }, { status: 400 })
    }

    // take is always the server-side PAGE_SIZE constant — never client-controlled
    // (prevents an unbounded-take DoS via a spoofed ?take= param).
    const logs = await getReviewHistory({ cardId, cursor, take: PAGE_SIZE })
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
