'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { readableForeground } from '@/lib/color'

const GOAL_OPTIONS_MIN = [1, 3, 5, 10, 15, 20, 30]
const SESSION_SIZE_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50]
const DEFAULT_BUTTON_COLOR = '#3b82f6'

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
  const [sessionSize, setSessionSize] = useState(20)
  const [buttonColor, setButtonColor] = useState(DEFAULT_BUTTON_COLOR)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setGoal(d.dailyGoalSeconds ?? 300)
        setDayStartHour(d.dayStartHour ?? 2)
        setSessionSize(d.sessionSize ?? 20)
        setButtonColor(d.buttonColor ?? DEFAULT_BUTTON_COLOR)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const save = async (patch: { dailyGoalSeconds?: number; dayStartHour?: number; sessionSize?: number; buttonColor?: string }) => {
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
      if (typeof d.sessionSize === 'number') setSessionSize(d.sessionSize)
      if (typeof d.buttonColor === 'string') setButtonColor(d.buttonColor)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleColorChange = (hex: string) => {
    setButtonColor(hex)
    // Instant live preview — update CSS variables on the root element immediately
    document.documentElement.style.setProperty('--button', hex)
    document.documentElement.style.setProperty('--button-foreground', readableForeground(hex))
    // Debounce the actual API save (color input fires continuously while dragging)
    if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)
    colorSaveTimer.current = setTimeout(() => save({ buttonColor: hex }), 400)
  }

  const resetColor = () => handleColorChange(DEFAULT_BUTTON_COLOR)

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

      {/* Session size */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Study session size</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            How many cards to draw per study session. Cards that need review again the same day
            are re-queued automatically, so a session may take longer than this number.
          </p>
        </div>
        <label className="flex items-center gap-3">
          <select
            value={sessionSize}
            disabled={saving}
            onChange={(e) => save({ sessionSize: Number(e.target.value) })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            {(SESSION_SIZE_OPTIONS.includes(sessionSize)
              ? SESSION_SIZE_OPTIONS
              : [sessionSize, ...SESSION_SIZE_OPTIONS].sort((a, b) => a - b)
            ).map((n) => (
              <option key={n} value={n}>{n} cards</option>
            ))}
          </select>
        </label>
      </section>

      {/* Button color */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Button color</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Changes the color of primary buttons and links throughout the app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={buttonColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-900"
            aria-label="Pick button color"
          />
          <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{buttonColor}</span>
          {buttonColor !== DEFAULT_BUTTON_COLOR && (
            <button
              onClick={resetColor}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
            >
              Reset to default
            </button>
          )}
        </div>
        {/* Live preview swatch */}
        <div className="flex items-center gap-2 mt-1">
          <span
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: buttonColor, color: readableForeground(buttonColor) }}
          >
            Preview button
          </span>
        </div>
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
