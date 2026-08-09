'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import HabitsLoading from '@/app/habits/loading'
import HabitHeatmap from '@/components/HabitHeatmap'
import ProgressRing from '@/components/ProgressRing'
import ProficiencyArc from '@/components/ProficiencyArc'
import { fetchCacheContext, readCache, writeCache, type HabitsCachePayload } from '@/lib/local-cache'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { haptic } from '@/lib/haptics'
import type { StatsDTO, ActivityDTO } from '@/lib/dto'
import {
  computeStreaks,
  computeHabitStats,
  computeHabitInsight,
  habitDateStr,
  shiftDate,
  formatDuration,
  type DayRecord,
} from '@/lib/habit'

// Format large totals as "Xh Ym" or "Ym" for readability.
function formatTotalTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// Format a "YYYY-MM-DD" date string as "Mon D, YYYY" — pure, derived from state.
function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

// Fixed tile order so all four FSRS states always render, even when the
// groupBy omits an empty state.
const stateOrder = [
  { state: 0, label: 'New' },
  { state: 1, label: 'Learning' },
  { state: 2, label: 'Review' },
  { state: 3, label: 'Relearning' },
]

interface Props {
  initialDays: DayRecord[]
  initialGoal: number
  initialDayStartHour: number
  initialMasteredCount: number
  initialCardsByState: StatsDTO['cardsByState']
}

export default function HabitsClient({
  initialDays,
  initialGoal,
  initialDayStartHour,
  initialMasteredCount,
  initialCardsByState,
}: Props) {
  // Direct prop reads (not useState copies) — read-only useState copies were
  // the root cause of the non-resync bug (24-DIAGNOSIS.md): a mounted shell
  // never adopted fresh props delivered by a later router.refresh() because
  // useState only seeds its initial value from the first render's prop.
  // Plain consts make every router.refresh() adopt automatically; downstream
  // JSX and useMemo bodies are unchanged (same identifiers, now tracking the
  // props instead of a frozen initial snapshot).
  //
  // Two-source derivation, now cache-backed (Phase 34, LOCAL-01/02): props
  // are the default source, but a cache-read override (IndexedDB, via
  // lib/local-cache.ts — Suspense-independent, same shape as the retired
  // FreshnessWatcher JSON backstop) can win until fresher RSC props arrive.
  // This shell has no setters for its "direct read" values, so adoption is a
  // derived-read override layer rather than a reverted design: cacheOverride,
  // once set, is read instead of the initial* props; a subsequent real RSC
  // delivery (a new initialDays reference) clears the override so fresh
  // props always take precedence.
  const [cacheOverride, setCacheOverride] = useState<HabitsCachePayload | null>(null)
  // The /api/version value + buildId this mount observed — read once on
  // mount, held in refs so the render-phase props-win block below (which
  // cannot await) can fire a write-through without needing a second fetch.
  const versionRef = useRef<string | null>(null)
  const buildIdRef = useRef<string | null>(null)
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  // Mount-guard for handleRefresh (Task 3, 34-01-PLAN.md): handleRefresh is a
  // user-triggered callback, not an effect, so it has no natural per-call
  // `cancelled` closure the way the mount effect below does. A pull-to-
  // refresh can still be in flight when the user navigates away mid-gesture;
  // this ref (same idiom as HomeClient.tsx's isMountedRef) prevents its
  // continuation from calling setState after unmount.
  const isMountedRef = useRef(true)
  useEffect(() => { return () => { isMountedRef.current = false } }, [])

  // Shared revalidation body (Task 3, 34-01-PLAN.md finding): `/habits` has
  // its own app/habits/loading.tsx, making it one of the exact routes
  // FreshnessWatcher.tsx's own header comment names as affected by a real,
  // unfixed Next.js 16.2.1 bug — a boundary-triggered router.refresh() can
  // fetch a fresh RSC payload on the server but silently fail to apply it to
  // the already-mounted client tree. The retired JSON backstop
  // (useFreshPayload) used to paper over exactly this by re-fetching
  // /api/activity+/api/stats on every visibilitychange/popstate/pageshow,
  // independent of whether the RSC application succeeded. D-00 rule 3 says
  // this cache is supposed to REPLACE that layer, not just delete it — which
  // means the replacement must independently re-trigger on the SAME
  // boundary events, not only once at mount. Verified empirically: without
  // this, e2e/freshness-router-cache.spec.ts's "/habits resume" case
  // regressed (confirmed by bisecting against the pre-Phase-34 HabitsClient,
  // which passed only because the now-removed backstop was covering for
  // this exact flake).
  const revalidate = useCallback(async (buildId: string, version: string, cancelledRef: { current: boolean }) => {
    setIsRevalidating(true)
    try {
      const [activityRes, statsRes] = await Promise.all([fetch('/api/activity'), fetch('/api/stats')])
      if (cancelledRef.current) return
      if (!activityRes.ok || !statsRes.ok) return
      const activity = (await activityRes.json()) as ActivityDTO
      const stats = (await statsRes.json()) as StatsDTO
      if (cancelledRef.current) return
      const fresh: HabitsCachePayload = {
        days: activity.days,
        dailyGoalSeconds: activity.dailyGoalSeconds,
        dayStartHour: activity.dayStartHour,
        masteredCount: stats.masteredCount,
        cardsByState: stats.cardsByState,
      }
      setCacheOverride(fresh)
      await writeCache(buildId, 'habits', fresh, version)
    } finally {
      if (!cancelledRef.current) setIsRevalidating(false)
    }
  }, [])

  // Cache-first mount read (LOCAL-01, LOCAL-05): paints the cached entry
  // instantly if one exists, then revalidates in the background against
  // /api/version — never gated on elapsed time (cachedAt is display/debug
  // metadata only, D-00 rule 2). A revalidation failure clears
  // isRevalidating and shows no error copy — the already-painted content
  // (cache or RSC props) stands (UI-SPEC E4 error).
  useEffect(() => {
    const cancelledRef = { current: false }
    ;(async () => {
      const ctx = await fetchCacheContext()
      if (cancelledRef.current || !ctx) return // offline cold path — RSC props already rendered
      const { version, buildId } = ctx
      versionRef.current = version
      buildIdRef.current = buildId

      const cached = await readCache<HabitsCachePayload>(buildId, 'habits')
      if (cancelledRef.current) return
      if (cached) setCacheOverride(cached.data)

      if (!cached || cached.dataVersion !== version) {
        await revalidate(buildId, version, cancelledRef)
        if (!cancelledRef.current) versionRef.current = version
      }
    })()
    return () => { cancelledRef.current = true }
  }, [revalidate])

  // Boundary-event revalidation: re-checks /api/version on the same events
  // FreshnessWatcher.tsx's now-removed JSON backstop used to (visibility
  // hidden→visible, popstate, a genuine bfcache pageshow) — this is what
  // lets /habits catch up after a resume/back-forward even when
  // router.refresh()'s RSC application silently fails (see revalidate's doc
  // comment above). A 300ms coalesce guard mirrors FreshnessWatcher's own
  // COALESCE_MS constant, collapsing an event burst into one check.
  useEffect(() => {
    const cancelledRef = { current: false }
    const lastCheckRef = { current: 0 }
    const check = () => {
      const now = Date.now()
      if (now - lastCheckRef.current < 300) return
      lastCheckRef.current = now
      ;(async () => {
        const ctx = await fetchCacheContext()
        if (cancelledRef.current || !ctx) return
        if (ctx.version !== versionRef.current) {
          buildIdRef.current = ctx.buildId
          await revalidate(ctx.buildId, ctx.version, cancelledRef)
          if (!cancelledRef.current) versionRef.current = ctx.version
        }
      })()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check()
    }
    const onPopState = () => { setTimeout(check, 0) }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      cancelledRef.current = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [revalidate])

  // Props-win: a genuinely fresher RSC delivery (a new initialDays
  // reference) is strictly newer than any cache override, so it clears the
  // override and lets the fresh props shine through. Also writes the fresh
  // props through to the cache (fire-and-forget) so the cache does not fall
  // behind an RSC-delivered update, keyed on the version this mount already
  // observed — only fires once a version is known.
  const [prevInitialDays, setPrevInitialDays] = useState(initialDays)
  if (initialDays !== prevInitialDays) {
    setPrevInitialDays(initialDays)
    setCacheOverride(null)
    if (versionRef.current && buildIdRef.current) {
      const fresh: HabitsCachePayload = {
        days: initialDays,
        dailyGoalSeconds: initialGoal,
        dayStartHour: initialDayStartHour,
        masteredCount: initialMasteredCount,
        cardsByState: initialCardsByState,
      }
      writeCache(buildIdRef.current, 'habits', fresh, versionRef.current).catch(() => {})
    }
  }

  const days = cacheOverride ? cacheOverride.days : initialDays
  const goal = cacheOverride ? cacheOverride.dailyGoalSeconds : initialGoal
  const masteredCount = cacheOverride ? cacheOverride.masteredCount : initialMasteredCount
  const dayStartHour = cacheOverride ? cacheOverride.dayStartHour : initialDayStartHour
  const cardsByState = cacheOverride ? cacheOverride.cardsByState : initialCardsByState
  const [today, setToday] = useState('')
  const countFor = (s: number) => cardsByState.find((r) => r.state === s)?._count ?? 0

  // Route-local pull-to-refresh (D-04, LOCAL-04) — NOT parameterised, NOT
  // shared with Home's handleSync. Bypasses BOTH the cache read and the
  // version check: fetches /api/activity + /api/stats unconditionally and
  // triggers NO Google Doc sync.
  const handleRefresh = useCallback(async () => {
    haptic('impact-light')
    if (isMountedRef.current) setRefreshError(false)
    try {
      const ctx = await fetchCacheContext()
      if (!isMountedRef.current) return
      const [activityRes, statsRes] = await Promise.all([fetch('/api/activity'), fetch('/api/stats')])
      if (!isMountedRef.current) return
      if (!activityRes.ok || !statsRes.ok) throw new Error('refresh failed')
      const activity = (await activityRes.json()) as ActivityDTO
      const stats = (await statsRes.json()) as StatsDTO
      if (!isMountedRef.current) return
      const fresh: HabitsCachePayload = {
        days: activity.days,
        dailyGoalSeconds: activity.dailyGoalSeconds,
        dayStartHour: activity.dayStartHour,
        masteredCount: stats.masteredCount,
        cardsByState: stats.cardsByState,
      }
      setCacheOverride(fresh)
      if (ctx) {
        versionRef.current = ctx.version
        buildIdRef.current = ctx.buildId
        await writeCache(ctx.buildId, 'habits', fresh, ctx.version)
      }
    } catch {
      if (isMountedRef.current) setRefreshError(true)
    }
  }, [])

  const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)

  // Compute client-local today in an effect (habitDateStr calls new Date() internally —
  // impure, must not run during render). Promise.resolve().then satisfies
  // react-hooks/set-state-in-effect (microtask deferral, not synchronous setState).
  // Depends on days/masteredCount (not just dayStartHour) so a
  // FreshnessWatcher-triggered router.refresh() OR JSON backstop delivery across a
  // habit-day boundary (the tab/PWA resume scenario this phase targets) recomputes
  // today instead of staying pinned to the mount-time value — mirrors HomeClient's
  // equivalent effect (CR-01), now also firing on backstop adoption.
  useEffect(() => {
    Promise.resolve().then(() => setToday(habitDateStr(dayStartHour)))
  }, [dayStartHour, days, masteredCount])

  const { current, longest, todaySeconds } = useMemo(
    () => computeStreaks(days, today, goal),
    [days, today, goal]
  )

  const stats = useMemo(
    () => computeHabitStats(days, goal),
    [days, goal]
  )

  const secByDate = useMemo(
    () => new Map(days.map((d) => [d.date, d.seconds])),
    [days]
  )

  // Last 30 days for the trend chart (oldest→newest, today rightmost).
  const trendDays = useMemo(() => {
    if (!today) return []
    return Array.from({ length: 30 }, (_, i) => {
      const date = shiftDate(today, i - 29)
      return { date, secs: secByDate.get(date) ?? 0 }
    })
  }, [today, secByDate])

  // The tallest bar anchors the scale; always at least the goal so the goal
  // line is never at 100% when there's headroom.
  const maxTrendSecs = useMemo(
    () => Math.max(...trendDays.map((d) => d.secs), goal),
    [trendDays, goal]
  )

  // Show enough weeks to cover all activity + 2 weeks of padding, min 8, max 26.
  const heatmapWeeks = useMemo(() => {
    if (!days || days.length === 0 || !today) return 8
    const earliest = days.reduce((min, d) => d.date < min ? d.date : min, today)
    const [ey, em, ed] = earliest.split('-').map(Number)
    const [ty, tm, td] = today.split('-').map(Number)
    const daysDiff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ey, em - 1, ed)) / 86400000)
    return Math.max(8, Math.min(26, Math.ceil(daysDiff / 7) + 2))
  }, [days, today])

  const todayPct = Math.min(100, goal > 0 ? Math.round((todaySeconds / goal) * 100) : 0)
  const goalLinePct = maxTrendSecs > 0 ? Math.round((goal / maxTrendSecs) * 100) : 0
  const insight = useMemo(
    () => computeHabitInsight(days, today, goal),
    [days, today, goal]
  )

  // One-tick skeleton while client-local today resolves (D-02).
  // Gates on today (not days) — days is always present from RSC props.
  if (today === '') return <HabitsLoading />

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* ── Route-local pull-to-refresh indicator (D-03/D-04) ── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-xs text-muted"
          style={{ height: refreshing ? 28 : pullDistance }}
        >
          {refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {refreshError && !refreshing && pullDistance === 0 && (
        <p className="text-center text-sm text-muted">
          Couldn&apos;t refresh. Check your connection and try again.{' '}
          <button type="button" onClick={handleRefresh} className="text-button font-semibold">
            Try again
          </button>
        </p>
      )}

      {/* ── Background-revalidation pill (D-01) ── */}
      {isRevalidating && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 z-[5] flex items-center gap-1.5 bg-surface-1 border border-border text-muted text-xs px-2 py-1 rounded-full shadow-sm"
          style={{ top: 'calc(var(--nav-height, 68px) + 8px)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" aria-hidden="true" />
          Updating…
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Habits</h1>
        <Link href="/" className="text-sm text-muted hover:text-muted-foreground underline underline-offset-2">
          ← Dashboard
        </Link>
      </div>

      {/* Streak hero + today progress ring */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-foreground">
              🔥 {current} day{current !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-muted mt-0.5">
              Current streak · longest {longest}d
            </p>
            <p className="text-xs text-muted mt-1">
              Today: {formatDuration(todaySeconds)} / {formatDuration(goal)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0">
            <ProgressRing
              pct={todayPct}
              size={80}
              strokeWidth={7}
              color="var(--reward)"
              aria-label={`Today's goal: ${todayPct}% complete`}
            />
            <p className="text-xs text-muted">{Math.round(goal / 60)} min goal</p>
          </div>
        </div>
      </section>

      {/* All-time totals */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">All-time totals</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{formatTotalTime(stats.totalSeconds)}</p>
            <p className="text-xs text-muted mt-0.5">Total study time</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.totalReviews.toLocaleString()}</p>
            <p className="text-xs text-muted mt-0.5">Cards reviewed</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.daysStudied}</p>
            <p className="text-xs text-muted mt-0.5">Days studied</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.goalMetDays}</p>
            <p className="text-xs text-muted mt-0.5">Goal-met days</p>
          </div>
        </div>
      </section>

      {/* Card progress — FSRS-state breakdown, whole section is the /history entry point (D-08) */}
      <Link
        href="/history"
        className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3 hover:shadow-lg transition-shadow"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Card progress</h2>
          <span className="text-xs text-button">View history →</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {stateOrder.map(({ state, label }) => (
            <div key={state} className="bg-surface-2 rounded-xl p-4">
              <p className="text-2xl font-bold text-foreground">{countFor(state)}</p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </Link>

      {/* Averages & consistency */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Averages &amp; consistency</h2>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Avg per active day</span>
            <span className="text-sm font-semibold text-foreground">
              {formatTotalTime(stats.avgSecondsPerActiveDay)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">Goal completion rate</span>
            <span className="text-sm font-semibold text-foreground">
              {stats.daysStudied > 0 ? `${Math.round(stats.goalCompletionRate * 100)}%` : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-muted-foreground">Best day</span>
            <span className="text-sm font-semibold text-foreground text-right">
              {stats.bestDayDate
                ? `${formatDate(stats.bestDayDate)} · ${formatTotalTime(stats.bestDaySeconds)}`
                : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* 30-day trend chart */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Last 30 days</h2>
        <div className="relative h-16">
          {/* Goal reference line */}
          <div
            className="absolute inset-x-0 border-t border-dashed border-reward/60 pointer-events-none"
            style={{ bottom: `${goalLinePct}%` }}
          />
          {/* Bars */}
          <div className="flex items-end gap-0.5 h-full">
            {trendDays.map(({ date, secs }) => {
              const heightPct = maxTrendSecs > 0 ? Math.round((secs / maxTrendSecs) * 100) : 0
              // Ensure a tiny visible sliver for any non-zero day
              const displayPct = secs > 0 ? Math.max(heightPct, 3) : 0
              let barColor = 'bg-surface-3'
              if (secs >= goal) barColor = 'bg-reward'
              else if (secs > 0) barColor = 'bg-reward-soft'
              return (
                <div
                  key={date}
                  className={`flex-1 min-w-0 rounded-sm transition-all ${barColor}`}
                  style={{ height: `${displayPct}%` }}
                  title={`${date}: ${formatDuration(secs)}`}
                />
              )
            })}
          </div>
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>30 days ago</span>
          <span className="text-reward">— goal ({Math.round(goal / 60)}m)</span>
          <span>today</span>
        </div>
      </section>

      {/* Full history heatmap */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">History</h2>
        {days.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">
            Complete your first session to start tracking history.
          </p>
        ) : (
          <HabitHeatmap days={days} today={today} goal={goal} weeks={heatmapWeeks} />
        )}
        <div className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--reward)' }} /> Goal met
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-reward-soft" /> Partial
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-surface-3 border border-border" /> No study
          </span>
        </div>
        {insight && (
          <p className="text-sm text-muted italic mt-1">{insight}</p>
        )}
      </section>

      {/* Proficiency arc */}
      <ProficiencyArc masteredCount={masteredCount} />

      {/* My Korean summary link */}
      <Link
        href="/wrapped"
        className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4 hover:shadow-lg active:shadow-sm active:bg-surface-2 transition-colors"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">My Korean summary</p>
          <p className="text-xs text-muted">All-time stats &amp; shareable progress card</p>
        </div>
        <span className="text-muted text-lg" aria-hidden="true">→</span>
      </Link>

      <p className="text-xs text-muted text-center">
        <Link href="/settings" className="underline underline-offset-2 hover:text-muted-foreground">
          Change goal or day-start time
        </Link>
      </p>
    </main>
  )
}
