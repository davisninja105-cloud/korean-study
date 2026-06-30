import { NextRequest, NextResponse } from 'next/server'
import { getStudyCards } from '@/lib/study-cards'

export async function GET(req: NextRequest) {
  try {
  const { searchParams } = req.nextUrl

  // Optional lesson-range filter. Omit params (or pass full span) to get all lessons.
  const fromParam = searchParams.get('lessonFrom')
  const toParam   = searchParams.get('lessonTo')
  const scope     = searchParams.get('scope') ?? 'due'   // 'due' | 'ahead'

  // Validate raw string before parsing — parseInt silently truncates floats and mixed
  // values (e.g. '1.5' → 1, '1abc' → 1), making the isInteger check below a no-op.
  // The regex accepts only positive integers with no leading zeros or decimals.
  const INTEGER_RE = /^[1-9]\d*$/
  const lessonFrom = fromParam !== null
    ? (INTEGER_RE.test(fromParam) ? parseInt(fromParam, 10) : NaN)
    : null
  const lessonTo = toParam !== null
    ? (INTEGER_RE.test(toParam) ? parseInt(toParam, 10) : NaN)
    : null

  if (
    (lessonFrom !== null && (isNaN(lessonFrom) || lessonFrom < 1)) ||
    (lessonTo   !== null && (isNaN(lessonTo)   || lessonTo   < 1)) ||
    (lessonFrom !== null && lessonTo !== null && lessonFrom > lessonTo)
  ) {
    return NextResponse.json({ error: 'invalid lesson range' }, { status: 400 })
  }

  if (scope !== 'due' && scope !== 'ahead') {
    return NextResponse.json({ error: 'scope must be "due" or "ahead"' }, { status: 400 })
  }

  const cards = await getStudyCards({ scope: scope as 'due' | 'ahead', lessonFrom, lessonTo })
  return NextResponse.json(cards)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
