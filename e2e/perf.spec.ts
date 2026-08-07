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
// `/`, `/study` stay at the original generous budget (D-06) since their real
// bottlenecks aren't touched until Phase 32. `/cards` is now tightened
// (Phase 31, plan 04, Task 3) from a real POST-MIGRATION measurement against
// this repo's 8-card e2e fixture:
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
const PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number> = {
  '/': 3000,
  '/study': 3000,
  '/cards': 100,
  '/habits': 1500,
}
const API_BUDGET_MS = 1000 // D-09 — generous guard rail, not a target
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
for (const path of ['/api/cards/due', '/api/stats', '/api/activity']) {
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

    expect(median(samples)).toBeLessThan(API_BUDGET_MS)
  })
}
