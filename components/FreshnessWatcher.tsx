'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Coalesce window: rapid event bursts (e.g. a popstate immediately followed
// by a visibilitychange) collapse into a single router.refresh() (T-26-02).
const COALESCE_MS = 300

/**
 * Mounted once in the root layout (app/layout.tsx), wrapping the app subtree.
 * Mirrors ThemeWatcher's/GlossProvider's shape.
 *
 * The sole delivery mechanism at every real staleness boundary —
 * visibilitychange (hidden→visible), popstate (back/forward), pageshow
 * (persisted, bfcache) — is an UNCONDITIONAL `router.refresh()`. It
 * re-fetches the RSC payload, keeping the Next.js Router Cache honest, and is
 * the sole delivery path for '/', which has no `loading.tsx` and never
 * exhibited the flake below across 10+ isolated runs (deferred-items.md).
 *
 * This component exists because deferred-items.md (Plan 26-03's root-cause
 * investigation) proved that on routes with a `loading.tsx` file (/study,
 * /cards, /habits), Next.js 16.2.1 intermittently fetches a fresh RSC payload
 * on the server but then never applies it to the already-mounted client tree
 * — a Suspense/Segment-Cache client-application failure, not a
 * FreshnessWatcher or StudyClient/CardsClient/HabitsClient bug (confirmed:
 * the server always recomputes correctly; removing loading.tsx made the
 * identical trigger 100% reliable).
 * TODO: 16.2.1 is the Next.js version this delivery flake was last verified
 * against — re-test after any Next.js upgrade before considering this
 * component for removal.
 *
 * Post-Phase-34 upgrade note (2026-08): the app was bumped from Next.js
 * 16.2.1 to 16.3.0. Upstream GitHub issue vercel/next.js#86151 ("loading.js
 * sometimes causes soft-navigation to get stuck and not render the new page,
 * despite receiving it from the server") matches the flake diagnosed above
 * closely enough to be the same bug: a route with loading.tsx,
 * router.refresh() completing server-side but never applying to the mounted
 * client tree. That issue is closed via vercel/next.js#95391, which shipped
 * in 16.3.0. After the upgrade, the 22-test boundary-refresh e2e suite
 * (freshness-version-gate/fresh-paths/gate/router-cache/client-shell,
 * covering /study, /cards, /habits back-forward, resume, and mid-session
 * refresh) was run 238 times total (--repeat-each across two batches) with
 * zero reproductions of stale content — exceeding the original diagnosis's
 * own "10+ isolated runs" confidence bar. This is empirical confidence, not
 * a guarantee the intermittent flake is gone: router.refresh() and its three
 * listeners stay exactly as they are regardless, since they cost nothing if
 * the bug really is fixed and are the only defense if it is not. Re-run this
 * same stress pass after any future Next.js upgrade.
 *
 * Phase 34 (D-00 rule 3, LOCAL-01..05): this component used to also own a
 * second, Suspense-independent JSON payload backstop — a route-scoped
 * `/api/...` fetch, gated behind a `GET /api/version` comparison (Phase 33,
 * VERS-02), exposed to consumers via a React context and an exported consumer
 * hook. That JSON half is retired in this phase: every `*Client.tsx` shell
 * (`StudyClient`, `CardsClient`, `HabitsClient`, `HomeClient`) now owns its
 * OWN cache-read-first paint plus its own version-checked revalidation
 * fetch, structurally the same second, Suspense-independent delivery path
 * the backstop provided — so keeping the JSON half here would mean two
 * independent fetch-and-adopt mechanisms racing on every boundary event
 * (34-RESEARCH.md Pitfall 1), which is exactly what D-00 rule 3 forbids
 * ("replace layers, don't add one"). Phase 33's VERS-02 requirement text
 * ("the backstop itself is not removed") is superseded, not violated: this
 * component, its unconditional `router.refresh()` half, its coalesce logic,
 * and its Next.js-bug documentation all survive untouched — only the
 * redundant JSON delivery half (and the version-gate machinery that existed
 * solely to decide whether to fire it) is gone. See 34-05-SUMMARY.md for the
 * full narrowing record.
 *
 * A 300ms coalesce ref collapses bursts of these events into one refresh.
 */
export default function FreshnessWatcher({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>
}
