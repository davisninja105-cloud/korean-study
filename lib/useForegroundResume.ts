'use client'

import { useEffect, useRef } from 'react'

// Coalesce window — mirrors FreshnessWatcher.tsx's COALESCE_MS exactly, so a
// burst of events (e.g. a pageshow immediately followed by a visibilitychange)
// collapses into a single onResume() call.
const COALESCE_MS = 300

/**
 * Shared coalesced visibilitychange / pageshow / online foreground-boundary
 * hook. Extracts the exact event set components/FreshnessWatcher.tsx already
 * listens to for its own router.refresh() delivery (visibilitychange gated
 * on a visible visibilityState, pageshow gated on the event's persisted
 * flag) plus a new `online` listener — WITHOUT touching FreshnessWatcher
 * itself (do-not-delete per STATE.md Blockers/Concerns; its own header
 * comment scopes it narrowly to the RSC-refresh concern only).
 *
 * Created here because two wave-2 plans consume it (plan 35-02's
 * deploy-update check, plan 35-03's queue flush) — this codebase's
 * precedent (lib/local-cache.ts declaring all four route payload types up
 * front in plan 34-01) is to let exactly one plan own a shared file.
 *
 * `onResume` is held in a ref (the pattern components/Toast.tsx's dismiss
 * handler already uses) so the listener set is registered exactly once on
 * mount and is never re-bound just because the caller passed a fresh inline
 * function on every render.
 */
export function useForegroundResume(onResume: () => void): void {
  const onResumeRef = useRef(onResume)
  useEffect(() => {
    onResumeRef.current = onResume
  }, [onResume])

  const lastFiredRef = useRef<number>(0)

  useEffect(() => {
    const fire = () => {
      // Date.now() read only inside this event-handler-triggered closure —
      // never during render (react-hooks/purity).
      const now = Date.now()
      if (now - lastFiredRef.current < COALESCE_MS) return
      lastFiredRef.current = now
      onResumeRef.current()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fire()
    }

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) fire()
    }

    const onOnline = () => fire()

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
    }
  }, [])
}
