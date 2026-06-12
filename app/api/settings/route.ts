import { NextRequest, NextResponse } from 'next/server'
import {
  getDailyGoalSeconds, setDailyGoalSeconds,
  getDayStartHour, setDayStartHour,
} from '@/lib/settings'

export async function GET() {
  const [dailyGoalSeconds, dayStartHour] = await Promise.all([
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return NextResponse.json({ dailyGoalSeconds, dayStartHour })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dailyGoalSeconds, dayStartHour } = body

  const hasGoal = typeof dailyGoalSeconds === 'number' && Number.isFinite(dailyGoalSeconds)
  const hasHour = typeof dayStartHour === 'number' && Number.isFinite(dayStartHour)
  if (!hasGoal && !hasHour) {
    return NextResponse.json(
      { error: 'provide dailyGoalSeconds and/or dayStartHour' },
      { status: 400 },
    )
  }

  const [newGoal, newHour] = await Promise.all([
    hasGoal ? setDailyGoalSeconds(dailyGoalSeconds) : getDailyGoalSeconds(),
    hasHour ? setDayStartHour(dayStartHour) : getDayStartHour(),
  ])
  return NextResponse.json({ dailyGoalSeconds: newGoal, dayStartHour: newHour })
}
