'use client'

import { useEffect, useState } from 'react'
import { registerServiceWorker } from '@/lib/service-worker'

/**
 * Mount-once service worker registration. Mirrors ThemeWatcher.tsx's shape
 * (renders nothing, one mount effect). Mounted in app/layout.tsx immediately
 * after <ThemeWatcher />.
 *
 * Task 1 (this commit) wires registration only — `updateReady` is tracked
 * but nothing renders it yet. The update-available Toast + foreground-resume
 * update-check trigger (D-07/D-08/D-09) arrive in Task 3.
 */
export default function ServiceWorkerProvider() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true))
  }, [])

  void updateReady // consumed by Task 3's Toast wiring; referenced here so
  // this field is never flagged unused between Task 1 and Task 3's commits.

  return null
}
