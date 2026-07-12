'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import StatsBar from '@/components/StatsBar'
import HabitTracker from '@/components/HabitTracker'
import ProficiencyArc from '@/components/ProficiencyArc'
import { computeProficiency } from '@/lib/proficiency'
import { haptic } from '@/lib/haptics'
import { bandUpMessage } from '@/lib/copy'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { habitDateStr } from '@/lib/habit'
import { CheckCircle2 } from 'lucide-react'
import type { StatsDTO, ActivityDTO } from '@/lib/dto'

type HeroState = 'loading' | 'A' | 'B' | 'C'

// The app always syncs the same fixed Google Doc.
const DOC_ID = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? ''

interface Props {
  initialStats: StatsDTO
  initialActivity: ActivityDTO
}

export default function HomeClient({ initialStats, initialActivity }: Props) {
  const isMountedRef = useRef(true)
  useEffect(() => { return () => { isMountedRef.current = false } }, [])

  const [stats, setStats] = useState<StatsDTO>(initialStats)
  const [activityData, setActivityData] = useState<ActivityDTO>(initialActivity)

  // Ungated render-phase adoption of fresh props (React's official "adjusting
  // state when props change" pattern — https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  // FreshnessWatcher's router.refresh() re-delivers initialStats/initialActivity
  // with a new object reference on every boundary refresh; this adopts them
  // immediately during render (no gate) because there is no in-flight
  // interaction on this shell to protect — pull-to-refresh's own refetches
  // (loadStats/loadActivity) already deliver equivalent truth, so clobbering
  // mid-pull is a non-issue.
  const [prevInitialStats, setPrevInitialStats] = useState(initialStats)
  if (initialStats !== prevInitialStats) {
    setPrevInitialStats(initialStats)
    setStats(initialStats)
  }
  const [prevInitialActivity, setPrevInitialActivity] = useState(initialActivity)
  if (initialActivity !== prevInitialActivity) {
    setPrevInitialActivity(initialActivity)
    setActivityData(initialActivity)
  }

  const [heroState, setHeroState] = useState<HeroState>('loading')
  const [greeting, setGreeting] = useState('')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [bandUpMsg, setBandUpMsg] = useState<string | null>(null)
  const [today, setToday] = useState('')

  // Band-up check: compare current CEFR band to stored band (client-only).
  // Extracted as a useCallback so it can be called on mount (Pitfall 5 — first-load
  // band-up) AND inside loadStats after a pull-to-refresh refetch.
  const checkBandUp = useCallback((masteredCount: number) => {
    const { band } = computeProficiency(masteredCount)
    let stored: string | null = null
    try {
      stored = localStorage.getItem('lastBand')
    } catch {
      // localStorage unavailable (private browsing / disabled) — nothing to compare
      return
    }
    if (stored && stored !== band) {
      setBandUpMsg(bandUpMessage(band, masteredCount))
      // Confetti on band-up (lazy import, same pattern as MilestoneCelebration)
      import('canvas-confetti').then((m) => {
        if (!isMountedRef.current) return
        m.default({ particleCount: 80, spread: 60, origin: { y: 0.4 } })
      }).catch(() => {})
    }
    try {
      localStorage.setItem('lastBand', band)
    } catch {
      // quota exceeded / private browsing — best-effort write, ignore
    }
  }, [])

  // Post-sync refetch: called only from handleSync — NOT on mount (D-08, Pitfall 1).
  const loadStats = useCallback(() => {
    fetch('/api/stats')
      .then((r) => { if (!r.ok) throw new Error('stats failed'); return r.json() })
      .then((data: StatsDTO) => {
        if (!isMountedRef.current) return
        setStats(data)
        checkBandUp(data.masteredCount)
      })
      .catch(() => {
        // Post-sync refetch failed (transient network/5xx) — surface it so the
        // user knows the displayed stats may be stale despite sync succeeding.
        if (isMountedRef.current) setSyncMsg('Synced — refresh failed, reload to update')
      })
  }, [checkBandUp])

  const loadActivity = useCallback(() => {
    fetch('/api/activity')
      .then((r) => { if (!r.ok) throw new Error('activity failed'); return r.json() })
      .then((data: ActivityDTO) => {
        if (!isMountedRef.current) return
        setActivityData(data)
      })
      .catch(() => {
        // Same partial-failure feedback as loadStats above.
        if (isMountedRef.current) setSyncMsg('Synced — refresh failed, reload to update')
      })
  }, [])

  // Mount effect: greeting + first-load band-up check.
  // loadStats / loadActivity are deliberately NOT called here (Pitfall 1 — props
  // provide initial data; the only permitted fetch is the post-sync refetch path).
  useEffect(() => {
    // Time-aware greeting — read the hour in the effect (never during render,
    // per react-hooks/purity); set state on a microtask to satisfy
    // react-hooks/set-state-in-effect.
    const h = new Date().getHours()
    const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    Promise.resolve().then(() => setGreeting(g))
    // First-load band-up: run immediately on mount against the server-provided
    // masteredCount (Pitfall 5 — must fire even on first load, not just after sync).
    checkBandUp(initialStats.masteredCount)
  }, [initialStats.masteredCount, checkBandUp])

  // Derive heroState + today from stats + activityData.
  // habitDateStr must be called here (inside useEffect) — it calls new Date()
  // internally and is therefore impure (react-hooks/purity forbids it in render).
  // today is stored in state so HabitTracker can receive it as initialToday (Pitfall 6).
  useEffect(() => {
    const todayStr = habitDateStr(activityData.dayStartHour)
    Promise.resolve().then(() => setToday(todayStr))
    const todaySeconds = activityData.days.find((d) => d.date === todayStr)?.seconds ?? 0
    // The dailyGoalSeconds > 0 guard prevents State B on a zero-goal first launch.
    const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
    if (stats.dueCards > 0) {
      Promise.resolve().then(() => setHeroState('A'))
    } else if (goalMet) {
      Promise.resolve().then(() => setHeroState('B'))
    } else {
      Promise.resolve().then(() => setHeroState('C'))
    }
  }, [stats, activityData])

  // Pull-to-refresh → sync the Google Doc (same call as the Settings Sync panel).
  const handleSync = useCallback(async () => {
    if (!DOC_ID) {
      // Sync not configured — surface feedback so the pull gesture isn't silent.
      setSyncMsg('Sync not configured')
      return
    }
    haptic('impact-light')
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: DOC_ID }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `sync failed (${res.status})`)
      }
      const data = await res.json()
      setSyncMsg(
        data.newCards > 0
          ? `Synced — ${data.newCards} new card${data.newCards !== 1 ? 's' : ''}`
          : 'Up to date'
      )
      loadStats()
      loadActivity()   // keep activity in sync so heroState uses the correct habit day
    } catch {
      setSyncMsg('Sync failed — try again from Settings')
    }
  }, [loadStats, loadActivity])

  const { pullDistance, refreshing } = usePullToRefresh(handleSync)

  const level = computeProficiency(stats.masteredCount).band

  return (
    <div className="flex flex-col gap-6">
      {/* ── Pull-to-refresh indicator ── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-xs text-muted"
          style={{ height: refreshing ? 28 : pullDistance }}
        >
          {refreshing ? 'Syncing…' : pullDistance >= PULL_THRESHOLD ? 'Release to sync' : 'Pull to sync'}
        </div>
      )}
      {syncMsg && !refreshing && pullDistance === 0 && (
        <p className="text-center text-xs text-muted">{syncMsg}</p>
      )}

      {/* ── Band-up celebration banner ── */}
      {bandUpMsg && (
        <div className="bg-surface-1 rounded-2xl shadow-md px-5 py-4 flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{bandUpMsg}</p>
          </div>
          <button
            onClick={() => setBandUpMsg(null)}
            aria-label="Dismiss"
            className="text-muted hover:text-muted-foreground text-lg leading-none shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-surface-3 active:bg-surface-3 active:opacity-80"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Hero: state-driven one-glance situation ── */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
        {greeting && <p className="text-xl font-medium text-foreground">{greeting}</p>}

        {heroState === 'loading' && (
          <div className="h-28 animate-pulse bg-surface-2 rounded-xl" />
        )}

        {heroState === 'A' && (
          <>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-bold leading-none text-reward">
                {stats.dueCards}
              </span>
              <span className="text-muted text-base mb-1">
                card{stats.dueCards !== 1 ? 's' : ''} ready to review
              </span>
            </div>
            <Link
              href="/study"
              className="flex items-center justify-center w-full min-h-14 bg-button text-button-foreground rounded-2xl text-lg font-semibold hover:bg-button-hover transition-colors active:scale-[0.98] active:opacity-90"
            >
              Study now →
            </Link>
          </>
        )}

        {heroState === 'B' && (
          <>
            <div className="bg-reward/10 rounded-xl p-4 flex flex-col gap-3">
              <CheckCircle2 className="w-10 h-10 text-reward" aria-hidden="true" />
              <p className="text-2xl font-semibold text-foreground">Goal met today</p>
              <p className="text-sm text-muted">You&apos;ve hit your daily goal. Nice work.</p>
            </div>
            <Link
              href="/study"
              className="flex items-center justify-center w-full min-h-14 bg-button text-button-foreground rounded-2xl text-base font-semibold hover:bg-button-hover transition-colors active:scale-[0.98] active:opacity-90"
            >
              Study ahead →
            </Link>
          </>
        )}

        {heroState === 'C' && (
          <>
            <p className="text-xl font-semibold text-foreground">All caught up</p>
            <p className="text-sm text-muted">Keep going to hit your daily goal.</p>
            <Link
              href="/study"
              className="flex items-center justify-center w-full min-h-14 bg-button text-button-foreground rounded-2xl text-base font-semibold hover:bg-button-hover transition-colors active:scale-[0.98] active:opacity-90"
            >
              Study ahead →
            </Link>
          </>
        )}
      </section>

      {/* ── Quiet secondary stats ── */}
      <StatsBar totalCards={stats.totalCards} totalLessons={stats.totalLessons} level={level} />

      {/* ── Habit ring ── */}
      {/* Pass the activityData *state* (not the initialActivity prop) so that
          after a pull-to-refresh, loadActivity()'s fresh snapshot propagates
          into HabitTracker — matching how stats already flows to StatsBar,
          ProficiencyArc, and the hero section. T-12-08 contract. */}
      <HabitTracker
        initialDays={activityData.days}
        initialToday={today}
        initialGoal={activityData.dailyGoalSeconds}
      />

      {/* ── Proficiency ── */}
      <ProficiencyArc masteredCount={stats.masteredCount} />

      {/* ── My Korean link ── */}
      <Link
        href="/wrapped"
        className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4 hover:shadow-lg active:shadow-sm active:bg-surface-2 transition-all"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">My Korean</p>
          <p className="text-xs text-muted">All-time stats &amp; progress summary</p>
        </div>
        <span className="text-muted text-lg" aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
