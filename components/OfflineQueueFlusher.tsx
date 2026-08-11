'use client'

import { useEffect, useState, useCallback } from 'react'
import { flushQueue } from '@/lib/offline-queue'
import { useForegroundResume } from '@/lib/useForegroundResume'
import Toast from './Toast'

/**
 * Mount-once offline review queue flush trigger (OFFLINE-03). Mirrors
 * ServiceWorkerProvider.tsx's shape (near-zero rendered UI, a Toast only
 * when something needs surfacing) — mounted in app/layout.tsx alongside the
 * other watchers.
 *
 * Flush triggers: once on mount (covers the app being reopened after a
 * force-quit — the case the roadmap names alongside the online event) and on
 * every foreground-resume boundary (visibilitychange/pageshow/online) via
 * the shared useForegroundResume hook, whose coalescing keeps a burst of
 * boundary events from firing several flushes. No background-sync or
 * periodic-sync listener anywhere — it silently never fires on iOS, this
 * app's only target.
 *
 * D-10: a successful flush (dropped === 0) renders nothing — the existing
 * Offline pill (Nav.tsx) is the only signal a queued-but-unflushed review
 * ever gets. D-11: a permanently-failed entry (a 4xx after reconnecting,
 * e.g. the card was deleted while offline) surfaces through the existing
 * Toast, naming how many could not be saved, matching REVIEW-04's "toast
 * only after retries/attempts are exhausted" precedent. Dismissing clears
 * the count; it is never re-armed by a later successful flush.
 */
export default function OfflineQueueFlusher() {
  const [droppedCount, setDroppedCount] = useState(0)

  // Stable across renders — useForegroundResume registers its listener set
  // exactly once on mount and holds this in a ref, so identity churn here
  // would not itself cause re-registration, but a stable reference keeps the
  // mount effect below equally simple.
  const runFlush = useCallback(() => {
    flushQueue()
      .then((outcome) => {
        if (outcome.dropped > 0) {
          setDroppedCount((c) => c + outcome.dropped)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    runFlush()
  }, [runFlush])

  useForegroundResume(runFlush)

  if (droppedCount === 0) return null

  const message =
    droppedCount === 1
      ? "1 review taken offline couldn't be saved — your progress wasn't recorded."
      : `${droppedCount} reviews taken offline couldn't be saved — your progress wasn't recorded.`

  return <Toast message={message} onDismiss={() => setDroppedCount(0)} />
}
