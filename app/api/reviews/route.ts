import { NextRequest, NextResponse } from 'next/server'
import { getReviewHistory, PAGE_SIZE } from '@/lib/review-history'

// cursor/cardId are opaque cuid() strings (not integers) — bound their length
// before they reach Prisma. A garbage id that passes this guard simply matches
// zero rows (safe no-op); this guard exists to reject grossly malformed input
// (empty or excessively long strings), not to validate cuid format.
const MAX_ID_LEN = 64

function isValidOpaqueId(v: string): boolean {
  return v.length > 0 && v.length <= MAX_ID_LEN
}

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
