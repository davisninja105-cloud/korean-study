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

const PAGE_BUDGET_MS = 3000 // D-08 — generous guard rail, not a target
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

for (const route of ['/', '/study', '/cards', '/habits']) {
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
    expect(median(samples.map((s) => s.dcl))).toBeLessThan(PAGE_BUDGET_MS)
  })
}
