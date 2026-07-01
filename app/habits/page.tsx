// Server component — no client directive
import { getStats, getActivityData } from '@/lib/dashboard'
import HabitsClient from '@/components/HabitsClient'

export default async function HabitsPage() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return (
    <HabitsClient
      initialDays={activity.days}
      initialGoal={activity.dailyGoalSeconds}
      initialDayStartHour={activity.dayStartHour}
      initialMasteredCount={stats.masteredCount}
    />
  )
}
