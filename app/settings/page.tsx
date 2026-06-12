'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const GOAL_OPTIONS_MIN = [1, 3, 5, 10, 15, 20, 30]

// Format hour as a readable label, e.g. 0 → "12:00 AM", 2 → "2:00 AM".
function hourLabel(h: number): string {
  if (h === 0) return '12:00 AM (midnight)'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM (noon)'
  return `${h - 12}:00 PM`
}

export default function SettingsPage() {
  const [goal, setGoal] = useState(300)
  const [dayStartHour, setDayStartHour] = useState(2)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setGoal(d.dailyGoalSeconds ?? 300)
        setDayStartHour(d.dayStartHour ?? 2)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const save = async (patch: { dailyGoalSeconds?: number; dayStartHour?: number }) => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const d = await res.json()
      if (typeof d.dailyGoalSeconds === 'number') setGoal(d.dailyGoalSeconds)
      if (typeof d.dayStartHour === 'number') setDayStartHour(d.dayStartHour)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Settings</h1>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400 font-medium">Saved ✓</span>
        )}
      </div>

      {/* Daily study goal */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Daily study goal</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Minimum study time per habit-day to count toward your streak.
          </p>
        </div>
        <label className="flex items-center gap-3">
          <select
            value={goal}
            disabled={saving}
            onChange={(e) => save({ dailyGoalSeconds: Number(e.target.value) })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            {(GOAL_OPTIONS_MIN.map((m) => m * 60).includes(goal)
              ? GOAL_OPTIONS_MIN.map((m) => m * 60)
              : [goal, ...GOAL_OPTIONS_MIN.map((m) => m * 60)]
            ).map((s) => (
              <option key={s} value={s}>{Math.round(s / 60)} min</option>
            ))}
          </select>
        </label>
      </section>

      {/* Day start hour */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Habit day starts at</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            A new streak day begins at this time. Pick a time after you usually finish studying —
            sessions before this hour count toward the previous day.
          </p>
        </div>
        <label className="flex items-center gap-3">
          <select
            value={dayStartHour}
            disabled={saving}
            onChange={(e) => save({ dayStartHour: Number(e.target.value) })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
      </section>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Changes are saved immediately.{' '}
        <Link href="/" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300">
          Back to dashboard
        </Link>
      </p>
    </main>
  )
}
