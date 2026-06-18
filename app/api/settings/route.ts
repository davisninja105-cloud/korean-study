import { NextRequest, NextResponse } from 'next/server'
import {
  getDailyGoalSeconds, setDailyGoalSeconds,
  getDayStartHour, setDayStartHour,
  getButtonColor, setButtonColor,
  getSessionSize, setSessionSize,
} from '@/lib/settings'

export async function GET() {
  const [dailyGoalSeconds, dayStartHour, buttonColor, sessionSize] = await Promise.all([
    getDailyGoalSeconds(),
    getDayStartHour(),
    getButtonColor(),
    getSessionSize(),
  ])
  return NextResponse.json({ dailyGoalSeconds, dayStartHour, buttonColor, sessionSize })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dailyGoalSeconds, dayStartHour, buttonColor, sessionSize } = body

  const hasGoal  = typeof dailyGoalSeconds === 'number' && Number.isFinite(dailyGoalSeconds)
  const hasHour  = typeof dayStartHour === 'number' && Number.isFinite(dayStartHour)
  const hasColor = typeof buttonColor === 'string'
  const hasSize  = typeof sessionSize === 'number' && Number.isFinite(sessionSize)
  if (!hasGoal && !hasHour && !hasColor && !hasSize) {
    return NextResponse.json(
      { error: 'provide dailyGoalSeconds, dayStartHour, buttonColor, and/or sessionSize' },
      { status: 400 },
    )
  }

  const [newGoal, newHour, newColor, newSize] = await Promise.all([
    hasGoal  ? setDailyGoalSeconds(dailyGoalSeconds) : getDailyGoalSeconds(),
    hasHour  ? setDayStartHour(dayStartHour)         : getDayStartHour(),
    hasColor ? setButtonColor(buttonColor)            : getButtonColor(),
    hasSize  ? setSessionSize(sessionSize)            : getSessionSize(),
  ])
  return NextResponse.json({ dailyGoalSeconds: newGoal, dayStartHour: newHour, buttonColor: newColor, sessionSize: newSize })
}
