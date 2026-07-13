// Server component — no client directive
import { getStats, getActivityData } from '@/lib/dashboard'
import WrappedClient from '@/components/WrappedClient'

// Renders live streak/activity/mastery data via Prisma. Without force-dynamic
// this page is statically prerendered at build and shows a frozen snapshot in
// production. Force dynamic so the queries run per request.
export const dynamic = 'force-dynamic'

export default async function WrappedPage() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return (
    <WrappedClient
      initialDays={activity.days}
      initialGoal={activity.dailyGoalSeconds}
      initialDayStartHour={activity.dayStartHour}
      initialMasteredCount={stats.masteredCount}
      initialTotalCards={stats.totalCards}
    />
  )
}
