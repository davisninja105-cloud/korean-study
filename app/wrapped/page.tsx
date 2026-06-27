'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import ProficiencyArc from '@/components/ProficiencyArc'
import {
  computeStreaks,
  computeHabitStats,
  habitDateStr,
  type DayRecord,
  DEFAULT_GOAL_SECONDS,
  DEFAULT_DAY_START_HOUR,
} from '@/lib/habit'
import { computeProficiency } from '@/lib/proficiency'

// Format large totals as "Xh Ym" — no seconds for the summary view.
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m > 0 ? ` ${m}m` : ''}`
}

export default function WrappedPage() {
  const [days, setDays] = useState<DayRecord[] | null>(null)
  const [today, setToday] = useState('')
  const [goal, setGoal] = useState(DEFAULT_GOAL_SECONDS)
  const [masteredCount, setMasteredCount] = useState<number | null>(null)
  const [totalCards, setTotalCards] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

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
      .then((d) => {
        if (typeof d.masteredCount === 'number') setMasteredCount(d.masteredCount)
        if (typeof d.totalCards === 'number') setTotalCards(d.totalCards)
      })
      .catch(() => {})
  }, [])

  const { current, longest } = useMemo(
    () => computeStreaks(days ?? [], today, goal),
    [days, today, goal]
  )

  const stats = useMemo(
    () => computeHabitStats(days ?? [], goal),
    [days, goal]
  )

  const proficiency = masteredCount !== null ? computeProficiency(masteredCount) : null

  const loading = days === null || masteredCount === null

  // ── Share ────────────────────────────────────────────────────────────────
  const shareText = proficiency
    ? `🇰🇷 My Korean: ${proficiency.band} (${proficiency.label}) — ${stats.totalReviews.toLocaleString()} reviews, ${current}-day streak, ${masteredCount?.toLocaleString()} mastered cards.`
    : ''

  const handleShare = () => {
    if (typeof navigator === 'undefined') return
    if (navigator.share) {
      navigator.share({ text: shareText }).catch(() => {})
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-64 bg-surface-1 rounded-2xl shadow-md animate-pulse" />
        <div className="h-40 bg-surface-1 rounded-2xl shadow-md animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-sm text-muted hover:text-muted-foreground"
        >
          ← Home
        </Link>
        <h1 className="text-xl font-bold text-foreground flex-1">
          My Korean
        </h1>
        {shareText && (
          <button
            onClick={handleShare}
            className="text-sm text-button hover:text-button-hover font-medium min-h-11 px-3 rounded-lg hover:bg-button-soft"
            aria-label="Share your Korean progress"
          >
            {copied ? 'Copied ✓' : 'Share'}
          </button>
        )}
      </div>

      {/* ── CEFR Proficiency ────────────────────────────────────────────── */}
      {masteredCount !== null && (
        <ProficiencyArc masteredCount={masteredCount} />
      )}

      {/* ── Wrapped summary card ────────────────────────────────────────── */}
      <section className="bg-surface-1 rounded-2xl shadow-md overflow-hidden">
        {/* Hero strip */}
        <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}>
          <p className="text-white/80 text-sm font-medium mb-1">Your journey so far</p>
          <p className="text-white text-3xl font-bold leading-tight">
            {stats.totalReviews.toLocaleString()}{' '}
            <span className="text-white/70 text-lg font-normal">reviews</span>
          </p>
          {stats.daysStudied > 0 && (
            <p className="text-white/80 text-sm mt-1">
              across {stats.daysStudied} study day{stats.daysStudied !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border/60">
          <StatCell
            label="Current streak"
            value={`${current} day${current !== 1 ? 's' : ''}`}
            emoji="🔥"
          />
          <StatCell
            label="Longest streak"
            value={`${longest} day${longest !== 1 ? 's' : ''}`}
            emoji="🏆"
          />
          <StatCell
            label="Mastered cards"
            value={(masteredCount ?? 0).toLocaleString()}
            emoji="🧠"
          />
          <StatCell
            label="Total study time"
            value={fmtTime(stats.totalSeconds)}
            emoji="⏱️"
          />
          {totalCards !== null && (
            <StatCell
              label="Cards in deck"
              value={totalCards.toLocaleString()}
              emoji="🃏"
            />
          )}
          <StatCell
            label="Goal met"
            value={`${stats.goalMetDays} day${stats.goalMetDays !== 1 ? 's' : ''}`}
            emoji="✅"
          />
        </div>
      </section>

      {/* ── Long-game note ──────────────────────────────────────────────── */}
      {proficiency && (
        <div className="bg-surface-1 rounded-2xl shadow-md px-6 py-5">
          <p className="text-sm text-muted mb-1">Next milestone</p>
          {proficiency.nextBand ? (
            <p className="text-foreground font-medium">
              {proficiency.nextBandMin - (masteredCount ?? 0)} more mastered cards to reach{' '}
              <span className="text-button font-bold">{proficiency.nextBand}</span>
            </p>
          ) : (
            <p className="text-foreground font-medium">
              You&apos;ve reached the top — {proficiency.label}. Remarkable.
            </p>
          )}
          <p className="text-xs text-muted mt-2">
            Mastered cards are cards you can recall after 21+ days without review.
          </p>
        </div>
      )}

      {/* ── Share CTA ───────────────────────────────────────────────────── */}
      {shareText && (
        <button
          onClick={handleShare}
          className="w-full bg-button text-button-foreground py-4 min-h-14 text-base font-semibold rounded-2xl hover:bg-button-hover transition-colors"
        >
          {copied ? 'Copied to clipboard ✓' : 'Share my progress'}
        </button>
      )}
    </div>
  )
}

// ── Helper component ───────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  emoji,
}: {
  label: string
  value: string
  emoji: string
}) {
  return (
    <div className="px-5 py-4 flex flex-col gap-0.5">
      <span className="text-lg" aria-hidden="true">{emoji}</span>
      <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
