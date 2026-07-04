'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReviewLogDTO } from '@/lib/dto'

interface Props {
  initialLogs: ReviewLogDTO[]
  cardId: string | null
  cardFront: string | null
  pageSize: number
}

// Grade-row color mapping (D-02/D-03). Again reuses FlashcardMode.tsx's exact
// red literal; Hard reuses CardEditor.tsx's warnUnsafe amber literal (the
// vetted exception — see 18-RESEARCH.md Pitfall 1, NOT orange). Good/Easy
// stay neutral per D-03 — no separate FSRS-state badge in the history feed.
const gradeRowClass: Record<string, string> = {
  Again: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Hard: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Good: 'bg-surface-2 text-foreground',
  Easy: 'bg-surface-2 text-foreground',
}

// Format an ISO timestamp string as "Jul 4, 2026, 3:42 PM" — pure given the
// ISO string prop, no bare `new Date()` during render (react-hooks/purity is
// about impure *reads* of ambient time, not formatting an already-fixed value).
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC', // pin to avoid server/client hydration mismatch (HabitsClient.tsx precedent)
  })
}

// Rendered via an expression (not a literal JSX text node) so the apostrophe
// doesn't trip react/no-unescaped-entities.
const ERROR_MESSAGE = "Couldn't load review history. Check your connection and try again."

export default function HistoryClient({ initialLogs, cardId, cardFront, pageSize }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ReviewLogDTO[]>(initialLogs)
  const [hasMore, setHasMore] = useState(initialLogs.length === pageSize)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const loadingRef = useRef(false) // synchronous in-flight guard — see RESEARCH Pitfall 3
  const sentinelRef = useRef<HTMLDivElement>(null)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoadingMore(true)
    try {
      const last = rows[rows.length - 1]
      const qs = new URLSearchParams({ cursor: last.id, ...(cardId ? { cardId } : {}) })
      const res = await fetch(`/api/reviews?${qs}`)
      if (!res.ok) throw new Error(`reviews ${res.status}`)
      const next: ReviewLogDTO[] = await res.json()
      setRows((prev) => [...prev, ...next])
      setHasMore(next.length === pageSize)
      setError(false)
    } catch {
      // Leave hasMore as-is so the sentinel stays mounted and a future
      // intersection (or the Retry button) can try again.
      setError(true)
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [rows, hasMore, cardId, pageSize])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, hasMore])

  const clearFilter = () => router.push('/history')

  const retry = () => {
    setError(false)
    loadMore()
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">History</h1>
        <Link href="/habits" className="text-sm text-muted hover:text-muted-foreground underline underline-offset-2">
          ← Habits
        </Link>
      </div>

      {/* Single-card filter chip (D-10/D-11) */}
      {cardId && (
        <div>
          <button
            onClick={clearFilter}
            className="text-xs text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft"
          >
            <span className="hangul">{cardFront ?? cardId}</span>
            <span className="ml-1">×</span>
          </button>
        </div>
      )}

      {/* Feed */}
      {rows.length === 0 ? (
        <div className="bg-surface-1 rounded-2xl shadow-md p-6 text-center flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">
            {cardId ? 'No reviews for this card yet.' : 'No reviews yet'}
          </p>
          {!cardId && (
            <p className="text-xs text-muted">Start a study session to build your review history.</p>
          )}
        </div>
      ) : (
        <div className="bg-surface-1 rounded-2xl shadow-md divide-y divide-border overflow-hidden">
          {rows.map((row) => (
            <div key={row.id} className="p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold rounded px-2 py-0.5 shrink-0 ${
                    gradeRowClass[row.gradeName] ?? gradeRowClass.Good
                  }`}
                >
                  {row.gradeName}
                </span>
                <span className="hangul text-sm font-medium text-foreground truncate">{row.cardFront}</span>
              </div>
              <p className="text-xs text-muted">
                {row.mastery} · {formatTimestamp(row.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center gap-2 py-4">
          <p className="text-sm text-muted text-center">{ERROR_MESSAGE}</p>
          <button
            onClick={retry}
            className="bg-button text-button-foreground px-4 py-2 min-h-11 text-sm rounded-lg hover:bg-button-hover"
          >
            Retry
          </button>
        </div>
      )}

      {/* IntersectionObserver sentinel — no "Load more" text (D-04) */}
      {!error && hasMore && (
        <div ref={sentinelRef} className="h-4 flex items-center justify-center">
          {loadingMore && (
            <span className="inline-block border-2 border-button border-t-transparent rounded-full animate-spin h-4 w-4" />
          )}
        </div>
      )}
    </main>
  )
}
