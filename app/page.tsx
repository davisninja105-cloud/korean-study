// Server component — no client directive
import { getStats, getActivityData } from '@/lib/dashboard'
import HomeClient from '@/components/HomeClient'

export default async function Home() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return <HomeClient initialStats={stats} initialActivity={activity} />
}
