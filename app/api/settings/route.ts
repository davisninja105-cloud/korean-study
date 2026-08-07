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
import { readableForeground } from '@/lib/color'

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
  const res = NextResponse.json({
    dailyGoalSeconds: newGoal,
    dayStartHour: newHour,
    buttonColor: newColor,
    rewardColor: newReward,
    sessionSize: newSize,
    readingTextScale: newScale,
    readingAid: newAid,
  })
  // ks_settings mirrors the just-validated button/reward/reading values into a
  // non-httpOnly cookie so app/layout.tsx's pre-paint <script> can read it via
  // document.cookie before first paint (LAYOUT-01) — RootLayout no longer
  // awaits a DB read, so this cookie is the only way the very next navigation
  // avoids a flash of the previous/default value. Deliberate deviation from
  // the ks_auth (AUTH_COOKIE) httpOnly convention: this cookie carries only
  // cosmetic UI preference data, never anything auth/session-related, and
  // MUST NOT be trusted as an authorization or identity signal anywhere.
  res.cookies.set(
    'ks_settings',
    encodeURIComponent(JSON.stringify({
      buttonColor: newColor,
      buttonFg: readableForeground(newColor),
      rewardColor: newReward,
      rewardFg: readableForeground(newReward),
      readingTextScale: newScale,
      readingAid: newAid,
    })),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    },
  )
  return res
}
