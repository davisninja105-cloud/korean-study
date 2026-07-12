/**
 * E2E-06: Stale-RouterCache cells (5 total) — the 24-DIAGNOSIS.md Summary
 * Matrix cells where the client served a previously-cached route segment
 * from Next.js's Router Cache with ZERO new server round-trip. These tests
 * are DELIBERATELY RED today: their final assertion (live DB value vs.
 * on-screen value) is expected to FAIL until Phase 26 ships a fix. A fully
 * green run of this file is a scope violation, not a pass (25-VALIDATION.md,
 * 25-RESEARCH.md False-Positive Risks).
 *
 * This spec also performs the D-04 CR-01 re-verification: 24-REVIEW.md
 * flagged that the diagnosis script's `back-forward` cells used a
 * `page.goto()` recovery fallback whose actual firing was never confirmed
 * from raw logs. This spec deliberately does NOT reproduce that recovery —
 * `page.goBack({ waitUntil: 'networkidle' })` is used with no fallback, so
 * a stuck/unexpected navigation fails the assertion honestly instead of
 * being silently papered over (25-RESEARCH.md Ambiguity 2, Anti-Patterns).
 *
 * D-03 dual-evidence rule: every test pairs a network-evidence assertion
 * (isRscRequest-derived fetch count via e2e/helpers/rsc.ts) with a
 * DOM-content assertion (e2e/helpers/readers.ts) — never one without the
 * other. Every stale-cell assertion is a plain expect() call — never an
 * expected-failure or skip annotation, which would invert/suppress the
 * genuinely-red reporting these tests exist to produce.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest } from './helpers/rsc'
import { simulateResume } from './helpers/resume'
import {
  flipOneReviewDueState,
  createMutationCard,
  promoteOneReviewToMastered,
  expectedDueState,
  expectedCardsCount,
  expectedMasteredCount,
} from './helpers/mutate'
import { readHomeState, readStudySelectModeState, readCardsCount, readHabitsMasteredCount } from './helpers/readers'

test.beforeEach(async () => {
  await resetToBaseline()
})

interface LoggedRequest {
  pathname: string
  resourceType: string
  isRsc: boolean
}

// Registered BEFORE any navigation on every test — isRscRequest() is called
// on the REAL Playwright Request object at capture time (its `.headers()`
// method requires a genuine request, not a plain-object stand-in), matching
// scripts/diagnose-freshness.mts:749-758's proven capture-time classification.
function registerRequestLog(page: Page): LoggedRequest[] {
  const requestLog: LoggedRequest[] = []
  page.on('request', (req: PwRequest) => {
    const url = new URL(req.url())
    requestLog.push({
      pathname: url.pathname,
      resourceType: req.resourceType(),
      isRsc: isRscRequest(req),
    })
  })
  return requestLog
}

function newDataFetchesForRoute(log: LoggedRequest[], preLen: number, routePath: string): LoggedRequest[] {
  return log.slice(preLen).filter((r) => r.pathname === routePath && (r.isRsc || r.resourceType === 'document'))
}

interface RouteConfig {
  route: string
  navName: string
  read: (page: Page) => Promise<string>
  mutate: () => Promise<void>
  expected: () => Promise<string>
}

const ROUTES: RouteConfig[] = [
  { route: '/', navName: 'Home', read: readHomeState, mutate: flipOneReviewDueState, expected: expectedDueState },
  {
    route: '/study',
    navName: 'Study',
    read: readStudySelectModeState,
    mutate: flipOneReviewDueState,
    expected: expectedDueState,
  },
  {
    route: '/cards',
    navName: 'Cards',
    read: readCardsCount,
    mutate: createMutationCard,
    expected: expectedCardsCount,
  },
  {
    route: '/habits',
    navName: 'Habits',
    read: readHabitsMasteredCount,
    mutate: promoteOneReviewToMastered,
    expected: expectedMasteredCount,
  },
]

// ── / back-forward (D-04 CR-01 re-verification cell 1 of 4) ────────────────
test('/ back-forward stays stale (Stale-RouterCache) - expected RED until Phase 26', async ({ page }) => {
  const cfg = ROUTES[0]
  const requestLog = registerRequestLog(page)

  await page.goto(cfg.route)
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await cfg.mutate()
  const preLen = requestLog.length
  // Native API only — NO window.history.back()/goto() recovery dance
  // (Ambiguity 2; this IS the D-04 re-verification mechanism).
  await page.goBack({ waitUntil: 'networkidle' })
  // Justified settle margin: React's startTransition commit can lag one
  // tick behind networkidle (empirically necessary in Phase 24).
  await page.waitForTimeout(300)

  const newFetches = newDataFetchesForRoute(requestLog, preLen, cfg.route)
  // Passes today: Router Cache reuse means zero server round-trip at all.
  expect(newFetches).toHaveLength(0)

  const expected = await cfg.expected()
  const observed = await cfg.read(page)
  // EXPECTED RED today (D-01/D-04): the stale count is what's on screen.
  expect(observed).toBe(expected)
})

// ── resume cells (4 total: /, /study, /cards, /habits) ─────────────────────
for (const cfg of ROUTES) {
  test(`${cfg.route} resume stays stale (Stale-RouterCache) - expected RED until Phase 26`, async ({ page }) => {
    const requestLog = registerRequestLog(page)

    await page.goto(cfg.route)
    await page.waitForLoadState('networkidle')
    await cfg.mutate()
    const preLen = requestLog.length

    // Simulate PWA/tab backgrounding then resume (dual document.hidden /
    // visibilityState override — StudySession.tsx reads visibilityState).
    await simulateResume(page, true)
    await page.waitForTimeout(150)
    await simulateResume(page, false)
    await page.waitForTimeout(250)
    await page.waitForTimeout(300) // settle margin, same as every other trigger

    const newFetches = newDataFetchesForRoute(requestLog, preLen, cfg.route)
    // Passes today: no route has any resume-detection code path at all.
    expect(newFetches).toHaveLength(0)

    const expected = await cfg.expected()
    const observed = await cfg.read(page)
    // EXPECTED RED today: the pre-mutation value is still on screen.
    expect(observed).toBe(expected)
  })
}
