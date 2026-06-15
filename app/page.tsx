'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import StatsBar from '@/components/StatsBar'
import HabitTracker from '@/components/HabitTracker'
import SyncPanel from '@/components/SyncPanel'

interface Stats {
  totalCards: number
  dueCards: number
  totalLessons: number
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null)

  const loadStats = useCallback(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  return (
    <div className="flex flex-col gap-6">
      {stats && (
        <StatsBar
          totalCards={stats.totalCards}
          dueCards={stats.dueCards}
          totalLessons={stats.totalLessons}
        />
      )}

      <HabitTracker />

      {stats && stats.dueCards > 0 ? (
        <div className="flex flex-col gap-2">
          <Link
            href="/study"
            className="block w-full text-center bg-button text-button-foreground py-4 rounded-2xl text-lg font-semibold hover:bg-button-hover transition-colors"
          >
            Study now →
          </Link>
          <p className="text-center text-sm text-gray-400 dark:text-gray-500">
            {stats.dueCards} card{stats.dueCards !== 1 ? 's' : ''} due
          </p>
        </div>
      ) : stats ? (
        <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-2xl p-6 text-center">
          <p className="text-green-700 dark:text-green-300 font-semibold">All caught up!</p>
          <p className="text-green-600 dark:text-green-400 text-sm mt-1">No cards due for review right now.</p>
        </div>
      ) : null}

      <SyncPanel onSynced={loadStats} />
    </div>
  )
}
