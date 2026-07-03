// Server component — no client directive
import { getStats, getActivityData } from '@/lib/dashboard'
import HomeClient from '@/components/HomeClient'

// This page renders live per-request DB state (due counts, stats) via Prisma.
// Prisma is not a `fetch` call, so without this Next.js statically prerenders
// the page at build time and serves a frozen build-time snapshot in production
// (stale due counts until redeploy). Force dynamic so getStats() runs on every request.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return <HomeClient initialStats={stats} initialActivity={activity} />
}
