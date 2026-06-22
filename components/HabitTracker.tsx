'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  computeStreaks,
  checkMilestone,
  habitDateStr,
  shiftDate,
  formatDuration,
  type DayRecord,
  DEFAULT_GOAL_SECONDS,
  DEFAULT_DAY_START_HOUR,
} from '@/lib/habit'
import { haptic } from '@/lib/haptics'
import ProgressRing from './ProgressRing'
import MilestoneCelebration from './MilestoneCelebration'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function HabitTracker() {
  const [days, setDays] = useState<DayRecord[] | null>(null)
  const [today, setToday] = useState('')
  const [goal, setGoal] = useState(DEFAULT_GOAL_SECONDS)
  const [milestone, setMilestone] = useState<number | null>(null)
  const prevStreakRef = useRef<number | null>(null)
  const hasFiredHapticRef = useRef(false)

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
  }, [])

  const secByDate = useMemo(
    () => new Map((days ?? []).map((d) => [d.date, d.seconds])),
    [days]
  )
  const { current, longest, todaySeconds } = useMemo(
    () => computeStreaks(days ?? [], today, goal),
    [days, today, goal]
  )

  // Check for newly crossed milestones.
  useEffect(() => {
    if (prevStreakRef.current !== null) {
      const hit = checkMilestone(current, prevStreakRef.current)
      if (hit) setMilestone(hit)
    }
    prevStreakRef.current = current
  }, [current])

  // Rolling 7-day window ending today (oldest→newest, today rightmost).
  const weekDays = useMemo(() => {
    if (!today) return []
    return Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(today, i - 6)
      const [y, m, d] = date.split('-').map(Number)
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
      return { date, letter: DAY_LETTERS[dow] }
    })
  }, [today])

  const pct = Math.min(100, goal > 0 ? Math.round((todaySeconds / goal) * 100) : 0)

  // Haptic + celebration when ring closes.
  useEffect(() => {
    if (pct >= 100 && !hasFiredHapticRef.current) {
      hasFiredHapticRef.current = true
      haptic('impact-heavy')
    }
    if (pct < 100) hasFiredHapticRef.current = false
  }, [pct])

  const dotClass = (date: string) => {
    const secs = secByDate.get(date) ?? 0
    let base = 'w-5 h-5 rounded-full '
    if (secs >= goal) base += 'bg-reward'
    else if (secs > 0) base += 'bg-orange-300 dark:bg-orange-500/40'
    else base += 'bg-gray-100 dark:bg-gray-800'
    if (date === today) base += ' ring-2 ring-reward ring-offset-1 ring-offset-white dark:ring-offset-gray-800'
    return base
  }

  const isAtRisk = current > 0 && todaySeconds < goal && pct < 50

  return (
    <>
      {milestone && (
        <MilestoneCelebration
          milestone={milestone}
          streakDays={current}
          onDismiss={() => setMilestone(null)}
        />
      )}

      <Link
        href="/habits"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-4 cursor-pointer hover:shadow-lg transition-shadow block"
      >
        {/* Header: streak + ring */}
        <div className="flex items-center justify-between gap-3">
          <div>
            {current > 0 ? (
              <>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  🔥 {current} day{current !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Longest: {longest} day{longest !== 1 ? 's' : ''}
                </p>
              </>
            ) : longest > 0 ? (
              <>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  🔥 {longest} day{longest !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Personal best · study today to restart
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                  🔥 0 days
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Start your streak today
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-1">
            <ProgressRing
              pct={pct}
              size={88}
              strokeWidth={7}
              color="var(--reward)"
              aria-label={`Today's goal: ${pct}% complete`}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(goal / 60)} min goal
            </p>
          </div>
        </div>

        {/* At-risk nudge */}
        {isAtRisk && (
          <p className="text-xs font-medium px-3 py-2 rounded-lg" style={{ color: 'var(--reward)', background: 'color-mix(in srgb, var(--reward) 10%, transparent)' }}>
            Keep your {current}-day streak — study today
          </p>
        )}

        {/* Today's time */}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Today: {formatDuration(todaySeconds)} / {formatDuration(goal)}
        </p>

        {/* 7-day week strip */}
        {days === null ? (
          <div className="h-10" />
        ) : (
          <div className="flex justify-between">
            {weekDays.map(({ date, letter }) => (
              <div key={date} className="flex flex-col items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{letter}</span>
                <div
                  role="img"
                  aria-label={`${date}: ${formatDuration(secByDate.get(date) ?? 0)}`}
                  className={dotClass(date)}
                  title={`${date}: ${formatDuration(secByDate.get(date) ?? 0)}`}
                />
              </div>
            ))}
          </div>
        )}
      </Link>
    </>
  )
}
