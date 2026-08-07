import { NextRequest, NextResponse } from 'next/server'
import { readableForeground } from '@/lib/color'

// G-30-2 fix: re-seeds the ks_settings cookie from caller-supplied values
// only — this is a genuine Route Handler (valid 'action'-phase cookie
// mutation), so it makes ZERO Prisma/DB calls. It exists purely so
// components/SettingsClient.tsx can re-seed the cookie on every /settings
// mount using the initial* props app/settings/page.tsx already fetched
// server-side via getAllSettings(), preserving CR-01's original "re-seed on
// every visit" intent without ever calling cookies().set() from inside a
// Server Component's render body (that call is what Next.js 16.2.1 forbids
// outside the action phase — see .planning/debug/settings-page-server-error.md).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { buttonColor, rewardColor, readingTextScale, readingAid } = body

  const hasColor = typeof buttonColor === 'string'
  const hasReward = typeof rewardColor === 'string'
  const hasScale = typeof readingTextScale === 'number' && Number.isFinite(readingTextScale)
  const hasAid = typeof readingAid === 'boolean'
  if (!hasColor || !hasReward || !hasScale || !hasAid) {
    return NextResponse.json(
      { error: 'provide buttonColor, rewardColor, readingTextScale, and readingAid' },
      { status: 400 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(
    'ks_settings',
    JSON.stringify({
      buttonColor,
      buttonFg: readableForeground(buttonColor),
      rewardColor,
      rewardFg: readableForeground(rewardColor),
      readingTextScale,
      readingAid,
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year — mirrors PUT /api/settings
    },
  )
  return res
}
