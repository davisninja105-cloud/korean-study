'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo } from 'react'
import {
  computeStreaks,
  habitDateStr,
  shiftDate,
  formatDuration,
  type DayRecord,
  DEFAULT_GOAL_SECONDS,
  DEFAULT_DAY_START_HOUR,
} from '@/lib/habit'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function HabitTracker() {
  const [days, setDays] = useState<DayRecord[] | null>(null)
  const [today, setToday] = useState('')
  const [goal, setGoal] = useState(DEFAULT_GOAL_SECONDS)

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

  // Rolling 7-day window ending today (oldest→newest, today rightmost).
  // Weekday letters derived from UTC math — no bare new Date() in render.
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

  const dotClass = (date: string) => {
    const secs = secByDate.get(date) ?? 0
    let base = 'w-5 h-5 rounded-full '
    if (secs >= goal) base += 'bg-blue-500'
    else if (secs > 0) base += 'bg-blue-300 dark:bg-blue-500/40'
    else base += 'bg-gray-100 dark:bg-gray-800'
    if (date === today) base += ' ring-2 ring-blue-400 ring-offset-1 ring-offset-white dark:ring-offset-gray-800'
    return base
  }

  return (
    <Link
      href="/habits"
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-4 cursor-pointer hover:shadow-lg transition-shadow block"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {current > 0 ? (
            <>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                🔥 {current} day{current !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Longest streak: {longest} day{longest !== 1 ? 's' : ''}
              </p>
            </>
          ) : longest > 0 ? (
            <>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                🔥 {longest} day{longest !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Personal best · study today to restart
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                🔥 0 days
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Start your streak today
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Goal: {Math.round(goal / 60)} min
          </p>
          <span className="text-gray-300 dark:text-gray-600 text-xl leading-none select-none">›</span>
        </div>
      </div>

      {/* Today's progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Today</span>
          <span>{formatDuration(todaySeconds)} / {formatDuration(goal)}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* 7-day week strip */}
      {days === null ? (
        <div className="h-10" />
      ) : (
        <div className="flex justify-between">
          {weekDays.map(({ date, letter }) => (
            <div key={date} className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{letter}</span>
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

      {current === 0 && longest === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Study for {Math.round(goal / 60)} min today to start your streak.
        </p>
      )}
    </Link>
  )
}
