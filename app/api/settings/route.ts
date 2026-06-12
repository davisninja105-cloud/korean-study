import { NextRequest, NextResponse } from 'next/server'
import {
  getDailyGoalSeconds, setDailyGoalSeconds,
  getDayStartHour, setDayStartHour,
  getButtonColor, setButtonColor,
} from '@/lib/settings'

export async function GET() {
  const [dailyGoalSeconds, dayStartHour, buttonColor] = await Promise.all([
    getDailyGoalSeconds(),
    getDayStartHour(),
    getButtonColor(),
  ])
  return NextResponse.json({ dailyGoalSeconds, dayStartHour, buttonColor })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dailyGoalSeconds, dayStartHour, buttonColor } = body

  const hasGoal  = typeof dailyGoalSeconds === 'number' && Number.isFinite(dailyGoalSeconds)
  const hasHour  = typeof dayStartHour === 'number' && Number.isFinite(dayStartHour)
  const hasColor = typeof buttonColor === 'string'
  if (!hasGoal && !hasHour && !hasColor) {
    return NextResponse.json(
      { error: 'provide dailyGoalSeconds, dayStartHour, and/or buttonColor' },
      { status: 400 },
    )
  }

  const [newGoal, newHour, newColor] = await Promise.all([
    hasGoal  ? setDailyGoalSeconds(dailyGoalSeconds) : getDailyGoalSeconds(),
    hasHour  ? setDayStartHour(dayStartHour)         : getDayStartHour(),
    hasColor ? setButtonColor(buttonColor)            : getButtonColor(),
  ])
  return NextResponse.json({ dailyGoalSeconds: newGoal, dayStartHour: newHour, buttonColor: newColor })
}
