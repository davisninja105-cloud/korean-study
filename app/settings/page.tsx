// Server component — no client directive
import { getAllSettings } from '@/lib/settings'
import SettingsClient from '@/components/SettingsClient'

// Renders live settings via Prisma. Without force-dynamic this page is
// statically prerendered at build and shows a frozen snapshot in production.
// Force dynamic so the batched Setting query runs per request.
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const settings = await getAllSettings()
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
