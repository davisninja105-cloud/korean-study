'use client'

import { useEffect } from 'react'
import { haptic } from '@/lib/haptics'

interface Props {
  milestone: number    // 7 | 30 | 100 | 365
  streakDays: number
  onDismiss: () => void
}

const MILESTONE_COPY: Record<number, { badge: string; headline: string; body: string }> = {
  7:   { badge: '🌱', headline: 'One week streak!',    body: "You've built a real habit. Keep showing up." },
  30:  { badge: '🔥', headline: 'One month streak!',   body: 'A month of daily Korean. That\'s serious commitment.' },
  100: { badge: '💎', headline: '100 days!',           body: 'One hundred days of study. You\'re in it for the long haul.' },
  365: { badge: '🏆', headline: 'One full year!',      body: 'A year of daily Korean. You\'ve earned this.' },
}

export default function MilestoneCelebration({ milestone, streakDays, onDismiss }: Props) {
  const copy = MILESTONE_COPY[milestone] ?? {
    badge: '🔥',
    headline: `${milestone}-day streak!`,
    body: 'Keep going.',
  }

  useEffect(() => {
    haptic('impact-heavy')

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    let cancelled = false
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, colors: ['#f97316', '#fde68a', '#6366f1'] })
    }).catch(() => {})

    return () => { cancelled = true }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="relative bg-surface-1 rounded-3xl shadow-2xl p-10 mx-6 max-w-sm w-full text-center flex flex-col items-center gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-7xl select-none">{copy.badge}</span>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{copy.headline}</h2>
          <p className="text-muted mt-2 text-sm leading-relaxed">{copy.body}</p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-4xl font-bold" style={{ color: 'var(--reward)' }}>
            {streakDays}
          </p>
          <p className="text-sm text-muted">day streak</p>
        </div>
        <button
          onClick={onDismiss}
          className="w-full min-h-11 rounded-xl font-semibold text-white text-sm"
          style={{ background: 'var(--reward)' }}
        >
          Keep going →
        </button>
      </div>
    </div>
  )
}
