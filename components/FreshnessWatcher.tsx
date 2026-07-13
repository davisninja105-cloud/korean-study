'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import type { CardDTO, ActivityDTO, StatsDTO } from '@/lib/dto'

// Coalesce window: rapid event bursts (e.g. a popstate immediately followed
// by a visibilitychange) collapse into a single router.refresh() (T-26-02).
const COALESCE_MS = 300

// ── Backstop payload types ──────────────────────────────────────────────────
// See deferred-items.md ("Recommendation for follow-up") — the origin of this
// dual-delivery design.

export interface HabitsFreshPayload {
  days: ActivityDTO['days']
  dailyGoalSeconds: number
  dayStartHour: number
  masteredCount: number
  cardsByState: StatsDTO['cardsByState']
}

export interface FreshPayloads {
  study: CardDTO[] | null
  cards: CardDTO[] | null
  habits: HabitsFreshPayload | null
}

const EMPTY_PAYLOADS: FreshPayloads = { study: null, cards: null, habits: null }

const FreshPayloadContext = createContext<FreshPayloads>(EMPTY_PAYLOADS)

/**
 * Returns the current boundary-fresh JSON backstop payloads. Safe outside the
 * provider (returns EMPTY_PAYLOADS), mirroring useWordTap's tolerance.
 */
export function useFreshPayload(): FreshPayloads {
  return useContext(FreshPayloadContext)
}

/**
 * Mounted once in the root layout (app/layout.tsx), wrapping the app subtree.
 * Mirrors ThemeWatcher's/GlossProvider's shape but is not invisible: it now
 * also owns a React context of boundary-fresh JSON payloads.
 *
 * Dual delivery at every real staleness boundary — visibilitychange
 * (hidden→visible), popstate (back/forward), pageshow (persisted, bfcache):
 *   1. router.refresh() — re-fetches the RSC payload, keeping the Next.js
 *      Router Cache honest (defense in depth; also the sole delivery path
 *      for '/', which has no loading.tsx and never exhibited the issue
 *      below across 10+ isolated runs).
 *   2. A route-scoped JSON backstop fetch (existing /api endpoints — no new
 *      routes) whose response is exposed via `useFreshPayload()`.
 *
 * The backstop exists because deferred-items.md (Plan 26-03's root-cause
 * investigation) proved that on routes with a `loading.tsx` file (/study,
 * /cards, /habits), Next.js 16.2.1 intermittently fetches a fresh RSC payload
 * on the server but then never applies it to the already-mounted client
 * tree — a Suspense/Segment-Cache client-application failure, not a
 * FreshnessWatcher or StudyClient/CardsClient/HabitsClient bug (confirmed:
 * the server always recomputes correctly; removing loading.tsx made the
 * identical trigger 100% reliable). The JSON fetch below is a second,
 * Suspense-independent delivery mechanism for the SAME data — it is not a
 * second freshness trigger; both deliveries originate from the same
 * coalesced boundary event.
 *
 * A 300ms coalesce ref collapses bursts of these events into one refresh +
 * one backstop fetch.
 */
export default function FreshnessWatcher({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const lastRefreshRef = useRef<number>(0)
  const [payloads, setPayloads] = useState<FreshPayloads>(EMPTY_PAYLOADS)

  useEffect(() => {
    // Route-aware JSON backstop — reads window.location.pathname at CALL time
    // (never a closure-captured pathname), because popstate fires after the
    // URL has already updated, so this is the RESTORED route. Every promise
    // chain ends in .catch(() => {}) — a failed backstop just degrades to
    // today's router.refresh()-only behavior, never surfaces an error.
    const fetchBackstop = () => {
      const path = window.location.pathname

      if (path === '/study') {
        fetch('/api/cards/due')
          .then((res) => (res.ok ? res.json() : null))
          .then((result: unknown) => {
            // Re-check pathname at response time: a backstop response
            // arriving after the user navigated away must never be written
            // into another route's slice.
            if (Array.isArray(result) && window.location.pathname === '/study') {
              setPayloads((prev) => ({ ...prev, study: result as CardDTO[] }))
            }
          })
          .catch(() => {})
      } else if (path === '/cards') {
        fetch('/api/cards')
          .then((res) => (res.ok ? res.json() : null))
          .then((result: unknown) => {
            if (Array.isArray(result) && window.location.pathname === '/cards') {
              setPayloads((prev) => ({ ...prev, cards: result as CardDTO[] }))
            }
          })
          .catch(() => {})
      } else if (path === '/habits') {
        Promise.all([
          fetch('/api/activity').then((res) => (res.ok ? res.json() : null)),
          fetch('/api/stats').then((res) => (res.ok ? res.json() : null)),
        ])
          .then(([activity, stats]: [ActivityDTO | null, StatsDTO | null]) => {
            if (activity && stats && window.location.pathname === '/habits') {
              setPayloads((prev) => ({
                ...prev,
                habits: {
                  days: activity.days,
                  dailyGoalSeconds: activity.dailyGoalSeconds,
                  dayStartHour: activity.dayStartHour,
                  masteredCount: stats.masteredCount,
                  cardsByState: stats.cardsByState,
                },
              }))
            }
          })
          .catch(() => {})
      }
      // Any other path (including '/'): no backstop fetch. '/' has no
      // loading.tsx and never exhibited the delivery flake across 10+
      // isolated runs (deferred-items.md); router.refresh() remains its
      // sole, reliable delivery path.
    }

    const refresh = () => {
      // Date.now() read only inside this event-handler-triggered closure —
      // never during render (react-hooks/purity).
      const now = Date.now()
      if (now - lastRefreshRef.current < COALESCE_MS) return
      lastRefreshRef.current = now
      router.refresh()
      fetchBackstop()
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
      // re-fetches the route we landed ON, not the one we left. window.location
      // .pathname inside fetchBackstop is read after this deferral too, so it
      // also observes the restored route.
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

  return (
    <FreshPayloadContext.Provider value={payloads}>
      {children}
    </FreshPayloadContext.Provider>
  )
}
