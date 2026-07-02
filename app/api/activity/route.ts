import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getActivityData } from '@/lib/dashboard'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Validate that a YYYY-MM-DD string is a real calendar day, not just well-shaped.
// DATE_RE alone accepts `2026-13-45` / `2026-02-31` / `0000-00-00`, which then
// corrupts streak/heatmap math downstream (shiftDate, computeStreaks, etc.).
// The round-trip check rejects rollover dates and NaN dates.
function isRealDate(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

// Log a chunk of active study time for a local calendar day (increment).
export async function POST(req: NextRequest) {
  try {
    const { date, seconds, reviews } = await req.json().catch(() => ({}))
    if (typeof date !== 'string' || !isRealDate(date)) {
      return NextResponse.json({ error: 'valid date (YYYY-MM-DD) required' }, { status: 400 })
    }
    const sec = Math.max(0, Math.min(600, Math.round(Number(seconds) || 0))) // clamp per-flush
    const rev = Math.max(0, Math.min(1000, Math.round(Number(reviews) || 0)))
    if (sec === 0 && rev === 0) return NextResponse.json({ ok: true })

    await prisma.studyDay.upsert({
      where: { date },
      create: { date, seconds: sec, reviews: rev },
      update: { seconds: { increment: sec }, reviews: { increment: rev } },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}

// Recent day records + current settings; the client computes streaks/heatmap.
export async function GET() {
  try {
    return NextResponse.json(await getActivityData())
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
