import { useEffect, useRef, useState } from 'react'

/** Pull distance (px) required to trigger a refresh on release. */
export const PULL_THRESHOLD = 70
const MAX_PULL = 110

/**
 * Touch pull-to-refresh for the PWA home screen (no library needed).
 * Engages only when the page is scrolled to the very top; applies resistance so
 * the pull feels weighted; calls `onRefresh` once on release past the threshold.
 * Returns the live pull distance (for a visual indicator) and a refreshing flag.
 *
 * Pass a stable `onRefresh` (useCallback) so listeners aren't re-attached.
 */
export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)

  useEffect(() => {
    const setPull = (d: number) => {
      pullRef.current = d
      setPullDistance(d)
    }
    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0 || window.scrollY > 0) {
        setPull(0)
        return
      }
      setPull(Math.min(MAX_PULL, dy * 0.5))
    }
    const onTouchEnd = () => {
      if (startY.current === null) return
      const trigger = pullRef.current >= PULL_THRESHOLD
      startY.current = null
      if (!trigger) {
        setPull(0)
        return
      }
      refreshingRef.current = true
      setRefreshing(true)
      setPull(PULL_THRESHOLD)
      Promise.resolve(onRefresh()).finally(() => {
        refreshingRef.current = false
        setRefreshing(false)
        setPull(0)
      })
    }
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [onRefresh])

  return { pullDistance, refreshing }
}
