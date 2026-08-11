'use client'

import { useEffect, useState, useCallback } from 'react'
import { registerServiceWorker, checkForUpdate, activateWaitingWorker } from '@/lib/service-worker'
import { useForegroundResume } from '@/lib/useForegroundResume'
import Toast from './Toast'

/**
 * Mount-once service worker registration + update-available prompt. Mirrors
 * ThemeWatcher.tsx's shape (a mount effect, near-zero rendered UI). Mounted
 * in app/layout.tsx immediately after <ThemeWatcher />.
 *
 * D-07/D-08/D-09: a waiting worker surfaces as a tappable Toast, never a
 * forced reload. The update check fires on the same foreground-boundary
 * events FreshnessWatcher already listens to (useForegroundResume), so a
 * long-backgrounded standalone PWA session detects a new deploy the moment
 * it resumes. Dismissing the toast only clears local state — the waiting
 * worker still takes over on its own the next time the app is fully closed
 * and relaunched (no extra code needed for that half; see lib/service-worker.ts).
 */
export default function ServiceWorkerProvider() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true))
  }, [])

  useForegroundResume(useCallback(() => checkForUpdate(), []))

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Clicking the Toast's own dismiss ("×") button must only dismiss, not
    // also activate the waiting worker — Toast.tsx's dismiss button doesn't
    // stop propagation (it is left unmodified per this plan), so this
    // wrapper distinguishes a tap on the message from a tap on that button.
    if ((e.target as HTMLElement).closest('button')) return
    activateWaitingWorker()
  }, [])

  return (
    <>
      {updateReady && (
        // Wraps the (unmodified) Toast in a tap-to-activate affordance —
        // `display: contents` keeps this wrapper out of the layout box
        // entirely so it never interferes with Toast's own `position: fixed`
        // placement. No ARIA button role here: Toast's own accessible
        // dismiss button already covers keyboard/screen-reader access to
        // "get rid of this"; the tap-anywhere-to-refresh affordance is a
        // supplementary mouse/touch convenience, matching how this app's
        // other single-purpose notifications (e.g. Toast's own dismiss)
        // stay one clear control rather than nested interactive semantics.
        <div onClick={handleTap} className="contents">
          <Toast message="Update available — tap to refresh" onDismiss={() => setUpdateReady(false)} />
        </div>
      )}
    </>
  )
}
