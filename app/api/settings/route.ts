import { NextRequest, NextResponse } from 'next/server'
import {
  getDailyGoalSeconds, setDailyGoalSeconds,
  getDayStartHour, setDayStartHour,
  getButtonColor, setButtonColor,
  getSessionSize, setSessionSize,
  getReadingTextScale, setReadingTextScale,
} from '@/lib/settings'

export async function GET() {
  const [dailyGoalSeconds, dayStartHour, buttonColor, sessionSize, readingTextScale] = await Promise.all([
    getDailyGoalSeconds(),
    getDayStartHour(),
    getButtonColor(),
    getSessionSize(),
    getReadingTextScale(),
  ])
  return NextResponse.json({ dailyGoalSeconds, dayStartHour, buttonColor, sessionSize, readingTextScale })
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dailyGoalSeconds, dayStartHour, buttonColor, sessionSize, readingTextScale } = body

  const hasGoal  = typeof dailyGoalSeconds === 'number' && Number.isFinite(dailyGoalSeconds)
  const hasHour  = typeof dayStartHour === 'number' && Number.isFinite(dayStartHour)
  const hasColor = typeof buttonColor === 'string'
  const hasSize  = typeof sessionSize === 'number' && Number.isFinite(sessionSize)
  const hasScale = typeof readingTextScale === 'number' && Number.isFinite(readingTextScale)
  if (!hasGoal && !hasHour && !hasColor && !hasSize && !hasScale) {
    return NextResponse.json(
      { error: 'provide dailyGoalSeconds, dayStartHour, buttonColor, sessionSize, and/or readingTextScale' },
      { status: 400 },
    )
  }

  const [newGoal, newHour, newColor, newSize, newScale] = await Promise.all([
    hasGoal  ? setDailyGoalSeconds(dailyGoalSeconds) : getDailyGoalSeconds(),
    hasHour  ? setDayStartHour(dayStartHour)         : getDayStartHour(),
    hasColor ? setButtonColor(buttonColor)            : getButtonColor(),
    hasSize  ? setSessionSize(sessionSize)            : getSessionSize(),
    hasScale ? setReadingTextScale(readingTextScale)  : getReadingTextScale(),
  ])
  return NextResponse.json({
    dailyGoalSeconds: newGoal,
    dayStartHour: newHour,
    buttonColor: newColor,
    sessionSize: newSize,
    readingTextScale: newScale,
  })
}
