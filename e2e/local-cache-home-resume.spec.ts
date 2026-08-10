/**
 * WR-02 regression (34-REVIEW.md): Home's cache-first mount-read effect used
 * to depend on `[checkBandUp, initialStats, initialActivity]`. FreshnessWatcher's
 * `router.refresh()` re-delivers `initialStats`/`initialActivity` with a new
 * object reference on every boundary event (visibilitychange/popstate/pageshow)
 * — Home has no `loading.tsx`, so this re-delivery is reliable and frequent.
 * With those props in the dependency array, the cache-read effect re-ran on
 * every one of those refreshes and could flash a just-delivered fresh RSC
 * value back to a stale cached value for ~1 fetch-round-trip (a real, if
 * transient, D-01 violation per the review). Fixed by dropping the effect to
 * `[]` (mount-only), matching `HabitsClient.tsx`'s stable-callback pattern.
 *
 * Directly asserting the transient visual flash is inherently racy (the
 * reviewer's own account: "replaced... for the ~1 fetch-round-trip duration
 * until the subsequent dataVersion check... corrects it again" — a
 * self-correcting flash, not a durable wrong end-state, so a settled-DOM
 * assertion cannot distinguish pre-fix from post-fix). Instead this test
 * targets the actual MECHANISM the fix changes: `fetchCacheContext()`
 * (`GET /api/version`) is the ONLY thing Home's own code calls on a boundary
 * event — FreshnessWatcher's `fetchRoutePayload` backstop was retired in
 * Plan 34-05 and never covered '/' even when it existed (no `loading.tsx`).
 * Pre-fix, the cache-read effect re-firing on every resume meant an EXTRA
 * `GET /api/version` on every boundary event, in addition to the one at
 * mount. Post-fix, the effect runs once at mount only — zero additional
 * `GET /api/version` requests fire from Home on any number of resumes. This
 * is deterministic network evidence for the exact re-run/no-re-run
 * distinction the fix makes, with none of a content-race's flakiness.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { simulateResume } from './helpers/resume'

test.beforeEach(async () => {
  await resetToBaseline()
})

function registerVersionRequestLog(page: Page): string[] {
  const log: string[] = []
  page.on('request', (req: PwRequest) => {
    if (new URL(req.url()).pathname === '/api/version') log.push(req.url())
  })
  return log
}

test('Home\'s cache-read effect does not re-fire (no extra GET /api/version) on repeated boundary-event resumes (WR-02 regression, 34-REVIEW.md)', async ({
  page,
}) => {
  const versionRequests = registerVersionRequestLog(page)

  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Exactly one GET /api/version at mount (the cache-read effect's own
  // fetchCacheContext() call — no other code on '/' calls this endpoint).
  await expect.poll(() => versionRequests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1)
  const afterMount = versionRequests.length

  // Three separate boundary events — visibility resume, popstate, pageshow —
  // each independently triggers FreshnessWatcher's router.refresh(), which
  // re-delivers initialStats/initialActivity with new object references.
  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await page.waitForTimeout(400)

  await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await page.waitForTimeout(400)

  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await page.waitForTimeout(400)

  // FIXED-BEHAVIOR CONTRACT: none of the three boundary events added a NEW
  // GET /api/version beyond the one at mount. Pre-fix, each resume re-fired
  // the cache-read effect (initialStats/initialActivity got a new object
  // reference from router.refresh()'s RSC delivery on every one of these
  // events), so this count would have grown with every resume.
  expect(versionRequests.length).toBe(afterMount)
})
