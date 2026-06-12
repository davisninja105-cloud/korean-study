import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDailyGoalSeconds, getDayStartHour } from '@/lib/settings'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Log a chunk of active study time for a local calendar day (increment).
export async function POST(req: NextRequest) {
  const { date, seconds, reviews } = await req.json().catch(() => ({}))
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
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
}

// Recent day records + current settings; the client computes streaks/heatmap.
export async function GET() {
  const [days, dailyGoalSeconds, dayStartHour] = await Promise.all([
    prisma.studyDay.findMany({
      orderBy: { date: 'desc' },
      take: 400,
      select: { date: true, seconds: true, reviews: true },
    }),
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return NextResponse.json({ days, dailyGoalSeconds, dayStartHour })
}
