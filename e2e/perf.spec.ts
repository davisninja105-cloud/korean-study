/**
 * PERF-04 + PERF-05 performance-budget spec (D-07).
 *
 * These are generous guard rails, not performance targets (D-08,
 * REQUIREMENTS.md Out of Scope strict-ms row) — the goal is a genuinely
 * failing-capable regression detector that resists flaking on ordinary
 * hardware variance, not a tight SLA. That's why every assertion is a
 * median-of-5 against a wide budget (3000ms pages / 1000ms API), with every
 * individual sample logged to the line-reporter output so a real regression
 * is distinguishable by eye from a single noisy run.
 *
 * ORDERING SAFEGUARD: grade-flow.spec.ts sorts alphabetically BEFORE this
 * file in Playwright's default file-discovery glob order and mutates FSRS
 * state in the shared test DB. The beforeAll reset below (same convention as
 * smoke.spec.ts) guarantees this file's measurements are against deterministic
 * seeded content regardless of what ran before it (Pitfall 5).
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'

test.beforeAll(async () => {
  await resetToBaseline()
})

// D-08 — generous guard rails, not targets. `/habits` is tightened (D-05):
// this is the phase 30 re-measurement baseline for the rest of the v1.8
// milestone — cleanest pure-round-trip signal for REGION-01's improvement.
// `/` stays at the original generous budget (D-06) — untouched by Phase 31
// or Phase 32. `/cards` is tightened (Phase 31, plan 04, Task 3) from a real
// POST-MIGRATION measurement against this repo's 8-card e2e fixture:
//   PRE-MIGRATION (31-01-SUMMARY.md, before any Phase 31 code changed the
//     query shape): samples 264, 45, 51, 40, 41ms — median 45ms.
//   POST-MIGRATION (this task, full phase's pagination/virtualization/
//     Reading-Practice/Edit-sheet/FreshnessWatcher changes applied): samples
//     264(198)*, 55, 34, 46, 41ms — median 46ms.
//     * cold-start sample 1 varies run to run (198-201ms across 3 repeated
//       measurements); the median (from samples 2-5, consistently 34-55ms)
//       is unaffected by it and is what the budget below is computed from.
// UNEXPECTED RESULT (documented per Task 3's instruction, not smoothed
// over): the post-migration median (46ms) is NOT meaningfully better than
// the pre-migration median (45ms) at this fixture's tiny scale (8-9 cards,
// far below PAGE_SIZE=30 — every group fits in a single page either way, so
// pagination has near-zero effect here). The real win this phase targets is
// the ~1056-card production deck (previously an unbounded `findMany()` with
// a full `sentences` include on every card; now a capped, sentence-free
// page), which this e2e fixture is deliberately too small to exercise
// (31-RESEARCH.md Pitfall 2). Budget is still computed from the honest
// measured number, not a flattering guess:
//   Math.ceil(46 * 1.5 / 100) * 100 = 100ms (50% headroom over the real
//   measured median, rounded up to the nearest 100ms).
//
// `/study` is now tightened (Phase 32, plan 04, Task 2) — Phase 32's Plans
// 01-04 already collapsed a warm-cache getStudyCards() call from 10 physical
// libSQL round trips down to 2 (32-BASELINE.md's `## After` section), so
// unlike `/cards` above this is a genuine round-trip-count win, not just a
// query-shape change. Measured against this repo's 8-card e2e fixture, on
// code with that collapse already landed:
//   PRE-CHANGE (this task, budget still at the original generous 3000ms):
//     samples 23, 38, 35, 32, 34ms — median 34ms.
//   POST-CHANGE (after tightening the budget below to 100ms, re-run to
//     confirm it still passes — the budget number itself does not change
//     what is measured, this is the same code, a fresh run): samples 22,
//     34, 30, 43, 33ms — median 33ms.
// Both readings land in the same ~30-38ms band — consistent, not cherry-
// picked. Budget:
//   Math.ceil(34 * 1.5 / 100) * 100 = 100ms (50% headroom over the real
//   measured median, rounded up to the nearest 100ms). Same caveat as
//   `/cards`: this fixture (8 cards, far below the ~1056-card production
//   deck) has near-zero per-request latency locally — the number here
//   proves the budget change is traceable to a real measurement, not that
//   100ms is achievable at production scale.
const PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number> = {
  '/': 3000,
  '/study': 100,
  '/cards': 100,
  '/habits': 1500,
}

// D-09 — generous guard rails, not targets. Per-path record (Phase 32, plan
// 04, Task 2) so `/api/cards/due` can be tightened without touching
// `/api/stats`/`/api/activity` — this phase's round-trip collapse
// (lib/study-cards.ts, lib/study-cache.ts) touched neither of those two
// endpoints' query shape, so both stay at the original generous 1000ms.
//
// `/api/cards/due` tightened from a real measurement against this repo's
// 8-card e2e fixture, taken on code with Phase 32's round-trip collapse
// already landed (warm-cache getStudyCards() at 2 physical round trips,
// 32-BASELINE.md's `## After` section):
//   PRE-CHANGE (this task, budget still at the original generous 1000ms):
//     samples 13, 8, 6, 3, 3ms — median 6ms.
//   POST-CHANGE (after tightening the budget below to 100ms, re-run to
//     confirm it still passes — same code, a fresh run): samples 8, 6, 8,
//     3, 3ms — median 6ms.
// Budget: Math.ceil(6 * 1.5 / 100) * 100 = 100ms (50% headroom over the real
// measured median, rounded up to the nearest 100ms). Same fixture-scale
// caveat as `/study`/`/cards` above — this is a local-loopback, 8-card
// measurement, not a production-latency claim.
const API_BUDGET_MS: Record<'/api/cards/due' | '/api/stats' | '/api/activity', number> = {
  '/api/cards/due': 100,
  '/api/stats': 1000,
  '/api/activity': 1000,
}
const SAMPLES = 5

interface NavSample {
  ttfb: number
  dcl: number
  load: number
}

/**
 * One fresh navigation + a serialization-safe Navigation Timing read.
 * MUST return only plain numeric fields — a raw PerformanceEntry serializes
 * to `{}` across the evaluate boundary (Pitfall 2).
 */
async function sampleNav(page: Page, route: string): Promise<NavSample> {
  await page.goto(route) // default waitUntil: 'load' — loadEventEnd is populated
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    return { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd }
  })
}

/** Sorted-middle picker. N=5 → index 2, a true median. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

for (const route of Object.keys(PAGE_BUDGETS_MS) as Array<keyof typeof PAGE_BUDGETS_MS>) {
  test(`page-load budget: ${route}`, async ({ page }) => {
    const samples: NavSample[] = []
    for (let i = 0; i < SAMPLES; i++) samples.push(await sampleNav(page, route))

    for (const [i, s] of samples.entries()) {
      console.log(
        `[perf] ${route} sample ${i + 1}: ttfb=${s.ttfb.toFixed(0)}ms dcl=${s.dcl.toFixed(0)}ms load=${s.load.toFixed(0)}ms`
      )
      // Per-sample vacuity guard: a zero/NaN sample means the timing entry
      // wasn't ready or serialization broke (Pitfall 2) — must fail loudly,
      // never pass silently alongside a satisfied median.
      expect(s.dcl).toBeGreaterThan(0)
    }

    // Assert the median of DCL (the user-facing milestone); TTFB is logged
    // alongside above (Open Question 2's recommended resolution of D-08's
    // "TTFB / domContentLoaded" wording).
    expect(median(samples.map((s) => s.dcl))).toBeLessThan(PAGE_BUDGETS_MS[route])
  })
}

// D-09's endpoint set is locked: /api/cards/due (named by the ROADMAP
// requirement) plus the two data-heavy GETs backing Home/Habits via
// lib/dashboard.ts.
for (const path of ['/api/cards/due', '/api/stats', '/api/activity'] as const) {
  test(`API round-trip budget: ${path}`, async ({ page }) => {
    // One page.goto so the chromium project's storageState ks_auth cookie
    // context is live — subsequent same-origin fetches inside page.evaluate
    // are authenticated automatically (D-10 locks page.evaluate(fetch) over
    // APIRequestContext: it exercises the exact request path a real client takes).
    await page.goto('/')

    const samples: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const { ms, ok, bytes } = await page.evaluate(async (p) => {
        const t0 = performance.now()
        const res = await fetch(p)
        const text = await res.text() // body consumption INSIDE the timed window — full round-trip
        return { ms: performance.now() - t0, ok: res.ok, bytes: text.length }
      }, path)

      // Per-sample vacuity guards: a fast 401/500 must FAIL the budget test,
      // never vacuously pass it (Pitfall 3).
      expect(ok).toBe(true)
      expect(bytes).toBeGreaterThan(0)
      samples.push(ms)
      console.log(`[perf] ${path} sample ${i + 1}: ${ms.toFixed(0)}ms`)
    }

    expect(median(samples)).toBeLessThan(API_BUDGET_MS[path])
  })
}
