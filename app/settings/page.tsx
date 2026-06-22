'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { readableForeground } from '@/lib/color'
import { getStoredTheme, applyTheme, type Theme } from '@/lib/theme'
import SyncPanel from '@/components/SyncPanel'

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
  const [readingTextScale, setReadingTextScale] = useState(1)
  const [readingAid, setReadingAid] = useState(false)
  const [theme, setTheme] = useState<Theme>('system')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        setGoal(d.dailyGoalSeconds ?? 300)
        setDayStartHour(d.dayStartHour ?? 2)
        setSessionSize(d.sessionSize ?? 20)
        setButtonColor(d.buttonColor ?? DEFAULT_BUTTON_COLOR)
        setReadingTextScale(d.readingTextScale ?? 1)
        setReadingAid(d.readingAid ?? false)
        setTheme(getStoredTheme())
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const save = async (patch: { dailyGoalSeconds?: number; dayStartHour?: number; sessionSize?: number; buttonColor?: string; readingTextScale?: number; readingAid?: boolean }) => {
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
      if (typeof d.readingTextScale === 'number') setReadingTextScale(d.readingTextScale)
      if (typeof d.readingAid === 'boolean') setReadingAid(d.readingAid)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleScaleChange = (val: number) => {
    setReadingTextScale(val)
    document.documentElement.style.setProperty('--reading-scale', String(val))
    if (scaleSaveTimer.current) clearTimeout(scaleSaveTimer.current)
    scaleSaveTimer.current = setTimeout(() => save({ readingTextScale: val }), 400)
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

  const handleThemeChange = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
  }

  const handleReadingAidChange = (on: boolean) => {
    setReadingAid(on)
    document.documentElement.classList.toggle('hangul-spaced', on)
    save({ readingAid: on })
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

      {/* Appearance / theme */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Appearance</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Choose a theme, or follow your device setting.
          </p>
        </div>
        <div className="flex bg-surface-3 rounded-lg p-1 self-start" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => handleThemeChange(t)}
              aria-pressed={theme === t}
              className={`px-4 py-1.5 min-h-11 text-sm font-medium rounded-md transition-colors capitalize ${
                theme === t
                  ? 'bg-surface-1 text-gray-800 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* Daily study goal */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
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
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
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
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
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

      {/* Reading text size */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Korean text size</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Scale Korean sentence text in study mode. Default is 1×.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0.9"
              max="1.4"
              step="0.1"
              value={readingTextScale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="flex-1"
              aria-label="Korean text size scale"
            />
            <span className="text-sm font-mono text-gray-600 dark:text-gray-300 w-8 text-right">
              {readingTextScale.toFixed(1)}×
            </span>
          </div>
          {/* Live preview */}
          <p
            className="hangul-sentence text-gray-700 dark:text-gray-200 bg-surface-2 rounded-lg px-4 py-3"
            style={{ fontSize: `calc(1rem * ${readingTextScale})` }}
          >
            저는 매일 한국어를 공부해요.
          </p>
        </div>
      </section>

      {/* Reading aid (extra spacing) */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Reading aid</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Adds a little extra spacing between Korean words to make long sentences
              easier to parse. No romanization.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={readingAid}
            aria-label="Reading aid"
            onClick={() => handleReadingAidChange(!readingAid)}
            className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
              readingAid ? 'bg-button' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                readingAid ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
      </section>

      {/* Button color */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3">
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
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
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

      {/* Advanced — back-office plumbing kept off the home screen */}
      <details className="group">
        <summary className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none px-1 py-2">
          <span>Advanced</span>
          <span className="text-xs opacity-60 transition-transform group-open:rotate-90">▶</span>
        </summary>
        <div className="mt-2">
          <SyncPanel onSynced={() => {}} />
        </div>
      </details>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Changes are saved immediately.{' '}
        <Link href="/" className="underline underline-offset-2 hover:text-gray-600 dark:hover:text-gray-300">
          Back to dashboard
        </Link>
      </p>
    </main>
  )
}
