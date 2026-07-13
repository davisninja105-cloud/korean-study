import { NextRequest, NextResponse } from 'next/server'
import {
  setDailyGoalSeconds, getDailyGoalSeconds,
  setDayStartHour, getDayStartHour,
  setButtonColor, getButtonColor,
  setRewardColor, getRewardColor,
  setSessionSize, getSessionSize,
  setReadingTextScale, getReadingTextScale,
  setReadingAid, getReadingAid,
  getAllSettings,
} from '@/lib/settings'

export async function GET() {
  const settings = await getAllSettings()
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dailyGoalSeconds, dayStartHour, buttonColor, rewardColor, sessionSize, readingTextScale, readingAid } = body

  const hasGoal   = typeof dailyGoalSeconds === 'number' && Number.isFinite(dailyGoalSeconds)
  const hasHour   = typeof dayStartHour === 'number' && Number.isFinite(dayStartHour)
  const hasColor  = typeof buttonColor === 'string'
  const hasReward = typeof rewardColor === 'string'
  const hasSize   = typeof sessionSize === 'number' && Number.isFinite(sessionSize)
  const hasScale  = typeof readingTextScale === 'number' && Number.isFinite(readingTextScale)
  const hasAid    = typeof readingAid === 'boolean'
  if (!hasGoal && !hasHour && !hasColor && !hasReward && !hasSize && !hasScale && !hasAid) {
    return NextResponse.json(
      { error: 'provide dailyGoalSeconds, dayStartHour, buttonColor, rewardColor, sessionSize, readingTextScale, and/or readingAid' },
      { status: 400 },
    )
  }

  const [newGoal, newHour, newColor, newReward, newSize, newScale, newAid] = await Promise.all([
    hasGoal   ? setDailyGoalSeconds(dailyGoalSeconds) : getDailyGoalSeconds(),
    hasHour   ? setDayStartHour(dayStartHour)         : getDayStartHour(),
    hasColor  ? setButtonColor(buttonColor)            : getButtonColor(),
    hasReward ? setRewardColor(rewardColor)            : getRewardColor(),
    hasSize   ? setSessionSize(sessionSize)            : getSessionSize(),
    hasScale  ? setReadingTextScale(readingTextScale)  : getReadingTextScale(),
    hasAid    ? setReadingAid(readingAid)              : getReadingAid(),
  ])
  return NextResponse.json({
    dailyGoalSeconds: newGoal,
    dayStartHour: newHour,
    buttonColor: newColor,
    rewardColor: newReward,
    sessionSize: newSize,
    readingTextScale: newScale,
    readingAid: newAid,
  })
}
