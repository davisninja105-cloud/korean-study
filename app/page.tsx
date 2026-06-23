'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import StatsBar from '@/components/StatsBar'
import HabitTracker from '@/components/HabitTracker'
import ProficiencyArc from '@/components/ProficiencyArc'
import { computeProficiency } from '@/lib/proficiency'
import { haptic } from '@/lib/haptics'
import { bandUpMessage } from '@/lib/copy'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'

interface Stats {
  totalCards: number
  dueCards: number
  totalLessons: number
  masteredCount: number
}

// The app always syncs the same fixed Google Doc.
const DOC_ID = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? ''

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [greeting, setGreeting] = useState('')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [bandUpMsg, setBandUpMsg] = useState<string | null>(null)

  const loadStats = useCallback(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data: Stats) => {
        setStats(data)
        // Band-up detection: compare current CEFR band to stored band (client-only).
        const { band, masteredCount } = computeProficiency(data.masteredCount)
        const stored = typeof window !== 'undefined' ? localStorage.getItem('lastBand') : null
        if (stored && stored !== band) {
          setBandUpMsg(bandUpMessage(band, masteredCount))
          // Confetti on band-up (lazy import, same pattern as MilestoneCelebration)
          import('canvas-confetti').then((m) => {
            const confetti = m.default
            confetti({ particleCount: 80, spread: 60, origin: { y: 0.4 } })
          }).catch(() => {})
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('lastBand', band)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadStats()
    // Time-aware greeting — read the hour in the effect (never during render,
    // per react-hooks/purity); set state on a microtask to satisfy
    // react-hooks/set-state-in-effect.
    const h = new Date().getHours()
    const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    Promise.resolve().then(() => setGreeting(g))
  }, [loadStats])

  // Pull-to-refresh → sync the Google Doc (same call as the Settings Sync panel).
  const handleSync = useCallback(async () => {
    if (!DOC_ID) return
    haptic('impact-light')
    setSyncMsg(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: DOC_ID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'sync failed')
      setSyncMsg(
        data.newCards > 0
          ? `Synced — ${data.newCards} new card${data.newCards !== 1 ? 's' : ''}`
          : 'Up to date'
      )
      loadStats()
    } catch {
      setSyncMsg('Sync failed — try again from Settings')
    }
  }, [loadStats])

  const { pullDistance, refreshing } = usePullToRefresh(handleSync)

  const level = stats ? computeProficiency(stats.masteredCount).band : ''

  return (
    <div className="flex flex-col gap-6">
      {/* ── Pull-to-refresh indicator ── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-xs text-gray-500 dark:text-gray-400"
          style={{ height: refreshing ? 28 : pullDistance }}
        >
          {refreshing ? 'Syncing…' : pullDistance >= PULL_THRESHOLD ? 'Release to sync' : 'Pull to sync'}
        </div>
      )}
      {syncMsg && !refreshing && pullDistance === 0 && (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">{syncMsg}</p>
      )}

      {/* ── Band-up celebration banner ── */}
      {bandUpMsg && (
        <div className="bg-surface-1 rounded-2xl shadow-md px-5 py-4 flex items-start gap-3">
          <span className="text-2xl" aria-hidden="true">🎉</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{bandUpMsg}</p>
          </div>
          <button
            onClick={() => setBandUpMsg(null)}
            aria-label="Dismiss"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Hero: the one number that drives action ── */}
      <section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
        {greeting && <p className="text-sm text-gray-500 dark:text-gray-400">{greeting}</p>}

        {stats && stats.dueCards > 0 ? (
          <>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-bold leading-none" style={{ color: 'var(--reward)' }}>
                {stats.dueCards}
              </span>
              <span className="text-gray-500 dark:text-gray-400 mb-1">
                card{stats.dueCards !== 1 ? 's' : ''} ready to review
              </span>
            </div>
            <Link
              href="/study"
              className="flex items-center justify-center w-full min-h-14 bg-button text-button-foreground rounded-2xl text-lg font-semibold hover:bg-button-hover transition-colors"
            >
              Study now →
            </Link>
          </>
        ) : stats ? (
          <>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">All caught up ✓</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No cards due right now. Study ahead to get a head start.
            </p>
            <Link
              href="/study"
              className="flex items-center justify-center w-full min-h-14 bg-button text-button-foreground rounded-2xl text-lg font-semibold hover:bg-button-hover transition-colors"
            >
              Study ahead →
            </Link>
          </>
        ) : (
          <div className="h-28 animate-pulse bg-surface-2 rounded-xl" />
        )}
      </section>

      {/* ── Quiet secondary stats ── */}
      {stats && (
        <StatsBar totalCards={stats.totalCards} totalLessons={stats.totalLessons} level={level} />
      )}

      {/* ── Habit ring ── */}
      <HabitTracker />

      {/* ── Proficiency ── */}
      {stats && typeof stats.masteredCount === 'number' && (
        <ProficiencyArc masteredCount={stats.masteredCount} />
      )}

      {/* ── My Korean link ── */}
      <Link
        href="/wrapped"
        className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4 hover:shadow-lg transition-shadow"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">My Korean</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">All-time stats &amp; progress summary</p>
        </div>
        <span className="text-gray-400 dark:text-gray-500 text-lg" aria-hidden="true">→</span>
      </Link>
    </div>
  )
}
