// Server component — no client directive
import { getAllSettings } from '@/lib/settings'
import SettingsClient from '@/components/SettingsClient'

// Renders live settings via Prisma. Without force-dynamic this page is
// statically prerendered at build and shows a frozen snapshot in production.
// Force dynamic so the batched Setting query runs per request.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getAllSettings()

  // G-30-2 fix: the CR-01 ks_settings cookie backfill used to live here as a
  // direct render-body cookie-jar mutation, but Next.js 16.2.1 only permits
  // cookie mutation during the request's 'action' phase (Server Actions /
  // Route Handlers) — mutating a cookie from a Server Component's render
  // body throws ReadonlyRequestCookiesError on every request (see
  // .planning/debug/settings-page-server-error.md). The backfill now lives in
  // app/api/settings/backfill-cookie/route.ts, a genuine Route Handler that
  // components/SettingsClient.tsx invokes once on mount with the initial*
  // values this page already fetched below — preserving the original
  // "re-seed ks_settings on every /settings visit" intent with zero new DB
  // calls and zero new gate on this page's own real-data render.

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
