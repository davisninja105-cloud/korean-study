'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import HabitHeatmap from '@/components/HabitHeatmap'
import ProgressRing from '@/components/ProgressRing'
import ProficiencyArc from '@/components/ProficiencyArc'
import {
  computeStreaks,
  computeHabitStats,
  computeHabitInsight,
  habitDateStr,
  shiftDate,
  formatDuration,
  type DayRecord,
  DEFAULT_GOAL_SECONDS,
  DEFAULT_DAY_START_HOUR,
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

export default function HabitsPage() {
  const [days, setDays] = useState<DayRecord[] | null>(null)
  const [today, setToday] = useState('')
  const [goal, setGoal] = useState(DEFAULT_GOAL_SECONDS)
  const [masteredCount, setMasteredCount] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/activity')
      .then((r) => r.json())
      .then((d) => {
        const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
        setToday(habitDateStr(hour))
        setDays(d.days ?? [])
        setGoal(d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
      })
      .catch(() => { setToday(habitDateStr(DEFAULT_DAY_START_HOUR)); setDays([]) })

    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => { if (typeof d.masteredCount === 'number') setMasteredCount(d.masteredCount) })
      .catch(() => {})
  }, [])

  const { current, longest, todaySeconds } = useMemo(
    () => computeStreaks(days ?? [], today, goal),
    [days, today, goal]
  )

  const stats = useMemo(
    () => computeHabitStats(days ?? [], goal),
    [days, goal]
  )

  const secByDate = useMemo(
    () => new Map((days ?? []).map((d) => [d.date, d.seconds])),
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
    () => computeHabitInsight(days ?? [], today, goal),
    [days, today, goal]
  )

  if (days === null) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Habits</h1>
        <Link href="/" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2">
          ← Dashboard
        </Link>
      </div>

      {/* Streak hero + today progress ring */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-3xl font-bold text-gray-800 dark:text-gray-100">
              🔥 {current} day{current !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Current streak · longest {longest}d
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
            <p className="text-xs text-gray-500 dark:text-gray-400">{Math.round(goal / 60)} min goal</p>
          </div>
        </div>
      </section>

      {/* All-time totals */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">All-time totals</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{formatTotalTime(stats.totalSeconds)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Total study time</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.totalReviews.toLocaleString()}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cards reviewed</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.daysStudied}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Days studied</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-4">
            <p className="text-2xl font-bold text-cat-vocab">{stats.goalMetDays}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Goal-met days</p>
          </div>
        </div>
      </section>

      {/* Averages & consistency */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Averages &amp; consistency</h2>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-300">Avg per active day</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {formatTotalTime(stats.avgSecondsPerActiveDay)}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-300">Goal completion rate</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {stats.daysStudied > 0 ? `${Math.round(stats.goalCompletionRate * 100)}%` : '—'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">Best day</span>
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-right">
              {stats.bestDayDate
                ? `${formatDate(stats.bestDayDate)} · ${formatTotalTime(stats.bestDaySeconds)}`
                : '—'}
            </span>
          </div>
        </div>
      </section>

      {/* 30-day trend chart */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">Last 30 days</h2>
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
              let barColor = 'bg-gray-100 dark:bg-gray-700'
              if (secs >= goal) barColor = 'bg-reward'
              else if (secs > 0) barColor = 'bg-orange-300 dark:bg-orange-500/40'
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
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>30 days ago</span>
          <span className="text-reward">— goal ({Math.round(goal / 60)}m)</span>
          <span>today</span>
        </div>
      </section>

      {/* Full history heatmap */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-gray-800 dark:text-gray-100">History</h2>
        {days.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Complete your first session to start tracking history.
          </p>
        ) : (
          <HabitHeatmap days={days} today={today} goal={goal} weeks={heatmapWeeks} />
        )}
        <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--reward)' }} /> Goal met
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-orange-300 dark:bg-orange-500/40" /> Partial
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" /> No study
          </span>
        </div>
        {insight && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">{insight}</p>
        )}
      </section>

      {/* Proficiency arc */}
      {masteredCount !== null && <ProficiencyArc masteredCount={masteredCount} />}

      {/* My Korean summary link */}
      <Link
        href="/wrapped"
        className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4 hover:shadow-lg transition-shadow"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">My Korean summary</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">All-time stats &amp; shareable progress card</p>
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-lg" aria-hidden="true">→</span>
      </Link>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        <Link href="/settings" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300">
          Change goal or day-start time
        </Link>
      </p>
    </main>
  )
}
