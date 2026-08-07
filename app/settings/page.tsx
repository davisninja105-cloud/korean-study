// Server component — no client directive
import { cookies } from 'next/headers'
import { getAllSettings } from '@/lib/settings'
import { readableForeground } from '@/lib/color'
import SettingsClient from '@/components/SettingsClient'

// Renders live settings via Prisma. Without force-dynamic this page is
// statically prerendered at build and shows a frozen snapshot in production.
// Force dynamic so the batched Setting query runs per request.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getAllSettings()

  // CR-01 backfill: PUT /api/settings is the only other writer of the
  // ks_settings cookie that app/layout.tsx's pre-paint script reads (LAYOUT-01
  // deliberately never awaits a DB read in RootLayout itself). Any browser
  // session that already had a DB-persisted buttonColor/rewardColor/
  // readingTextScale/readingAid *before* that cookie mechanism shipped has no
  // cookie yet, so every page but this one silently shows the CSS :root
  // defaults instead of the user's real saved values. Re-seeding the cookie
  // here — using the settings this page already fetched, no extra DB round
  // trip — fixes it for any session that revisits /settings.
  // KNOWN GAP (documented, not silently dropped — see 30-REVIEW-FIX.md CR-01):
  // a session that never navigates to /settings after this deploy still sees
  // reverted-to-default colors/scale/reading-aid on every other page. Closing
  // that gap fully would mean reading the cookie in middleware.ts and,
  // when absent, doing a DB lookup there — but middleware runs on the Edge
  // runtime by default while lib/prisma.ts's local dev fallback
  // (`file:./prisma/dev.db`) requires Node.js filesystem access, so that
  // change needs a deliberate follow-up design decision (e.g. an
  // edge-readable settings snapshot), not a quick patch inside this fix pass.
  const jar = await cookies()
  jar.set(
    'ks_settings',
    JSON.stringify({
      buttonColor: settings.buttonColor,
      buttonFg: readableForeground(settings.buttonColor),
      rewardColor: settings.rewardColor,
      rewardFg: readableForeground(settings.rewardColor),
      readingTextScale: settings.readingTextScale,
      readingAid: settings.readingAid,
    }),
    {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year — mirrors PUT /api/settings
    },
  )

  return (
    <SettingsClient
      initialGoal={settings.dailyGoalSeconds}
      initialDayStartHour={settings.dayStartHour}
      initialSessionSize={settings.sessionSize}
      initialButtonColor={settings.buttonColor}
      initialRewardColor={settings.rewardColor}
      initialReadingTextScale={settings.readingTextScale}
      initialReadingAid={settings.readingAid}
      initialLastAutoSyncedAt={settings.lastAutoSyncedAt}
    />
  )
}
