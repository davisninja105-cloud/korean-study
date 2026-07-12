'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Coalesce window: rapid event bursts (e.g. a popstate immediately followed
// by a visibilitychange) collapse into a single router.refresh() (T-26-02).
const COALESCE_MS = 300

/**
 * Renders nothing. Mounted once in the root layout (app/layout.tsx), mirrors
 * ThemeWatcher's shape. Calls router.refresh() at every real staleness
 * boundary so every route gets a genuine server round-trip instead of a
 * Router Cache reuse:
 *   - visibilitychange (hidden → visible): tab/PWA resume
 *   - popstate: browser back/forward (deferred a macrotask so Next's own
 *     popstate handling — restoring the target URL's Router Cache entry —
 *     runs first; the refresh then re-fetches the RESTORED route, not the
 *     departed one)
 *   - pageshow (persisted): full bfcache restore, chiefly iOS Safari PWA;
 *     the Playwright harness never takes this path, but it hardens real
 *     devices
 * A 300ms coalesce ref collapses bursts of these events into one refresh.
 */
export default function FreshnessWatcher() {
  const router = useRouter()
  const lastRefreshRef = useRef<number>(0)

  useEffect(() => {
    const refresh = () => {
      // Date.now() read only inside this event-handler-triggered closure —
      // never during render (react-hooks/purity).
      const now = Date.now()
      if (now - lastRefreshRef.current < COALESCE_MS) return
      lastRefreshRef.current = now
      router.refresh()
    }

    const onVisibilityChange = () => {
      // Only the hidden→visible edge should refresh; the hidden edge fires
      // nothing. Reads document.visibilityState to match both real browsers
      // and e2e/helpers/resume.ts's simulateResume override.
      if (document.visibilityState === 'visible') refresh()
    }

    const onPopState = () => {
      // Deferred a macrotask so Next.js's own popstate handling (restoring
      // the target URL's Router Cache entry) processes first; refresh() then
      // re-fetches the route we landed ON, not the one we left.
      setTimeout(refresh, 0)
    }

    const onPageShow = (e: PageTransitionEvent) => {
      // Only a genuine bfcache restore (persisted === true) should refresh.
      if (e.persisted) refresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [router])

  return null
}
