/**
 * E2E-06 → Phase 26 acceptance bar: the 5 Stale-RouterCache cells from
 * 24-DIAGNOSIS.md's Summary Matrix (cells where the client served a
 * previously-cached route segment from Next.js's Router Cache with ZERO new
 * server round-trip). These tests were deliberately RED through Phase 25,
 * asserting today's stale reality (zero fetches, stale DOM value). Phase 26
 * flips them to assert the FIXED contract: a boundary-triggered RSC refresh
 * fetch lands (network evidence) AND the DOM value matches live DB truth
 * (content evidence). They remain red until Plans 26-02/26-03 ship the fix —
 * a true red→green bar, never re-tuned after the fact (25-VALIDATION.md,
 * 25-RESEARCH.md False-Positive Risks).
 *
 * This spec also carries forward the D-04 CR-01 re-verification discipline:
 * 24-REVIEW.md flagged that the diagnosis script's `back-forward` cells used
 * a `page.goto()` recovery fallback whose actual firing was never confirmed
 * from raw logs. This spec deliberately does NOT reproduce that recovery —
 * `page.goBack({ waitUntil: 'networkidle' })` is used with no fallback, so a
 * stuck/unexpected navigation fails the assertion honestly instead of being
 * silently papered over (25-RESEARCH.md Ambiguity 2, Anti-Patterns).
 *
 * D-03 dual-evidence rule: every test pairs a network-evidence assertion
 * (nonzero new-fetch count via e2e/helpers/rsc.ts's waitForRscFetch +
 * newDataFetchesForRoute) with a DOM-content assertion (e2e/helpers/
 * readers.ts, polled via expect.poll — React's post-refresh commit lands a
 * beat after the response, so a one-shot read is a flake source). Every
 * assertion is a plain expect()/expect.poll() call — never an
 * expected-failure or skip annotation, which would invert/suppress the
 * genuinely-red reporting these tests exist to produce until the fix lands.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest, waitForRscFetch } from './helpers/rsc'
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
test('/ back-forward serves fresh data after boundary refresh (FRESH-04)', async ({ page }) => {
  const cfg = ROUTES[0]
  const requestLog = registerRequestLog(page)

  await page.goto(cfg.route)
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await cfg.mutate()
  const preLen = requestLog.length
  // Promise created BEFORE the trigger per waitForRscFetch's contract — the
  // boundary refresh's response can never be missed in the attach race.
  const rscFetch = waitForRscFetch(page, cfg.route)
  // Native API only — NO window.history.back()/goto() recovery dance
  // (Ambiguity 2; this IS the D-04 re-verification mechanism).
  await page.goBack({ waitUntil: 'networkidle' })
  await rscFetch
  // Justified settle margin: React's startTransition commit can lag one
  // tick behind networkidle (empirically necessary in Phase 24).
  await page.waitForTimeout(300)

  const newFetches = newDataFetchesForRoute(requestLog, preLen, cfg.route)
  // FIXED-BEHAVIOR CONTRACT: the boundary refresh must have hit the server.
  expect(newFetches.length).toBeGreaterThan(0)

  const expected = await cfg.expected()
  // Polling assertion — the readers only poll for element visibility, not
  // value, and React's post-refresh commit lands a beat after the response.
  await expect.poll(() => cfg.read(page), { timeout: 5000 }).toBe(expected)
})

// ── resume cells (4 total: /, /study, /cards, /habits) ─────────────────────
for (const cfg of ROUTES) {
  test(`${cfg.route} resume serves fresh data after boundary refresh (FRESH-05)`, async ({ page }) => {
    const requestLog = registerRequestLog(page)

    await page.goto(cfg.route)
    await page.waitForLoadState('networkidle')
    await cfg.mutate()
    const preLen = requestLog.length
    // Promise created BEFORE the trigger per waitForRscFetch's contract.
    const rscFetch = waitForRscFetch(page, cfg.route)

    // Simulate PWA/tab backgrounding then resume (dual document.hidden /
    // visibilityState override — StudySession.tsx reads visibilityState).
    await simulateResume(page, true)
    await page.waitForTimeout(150)
    await simulateResume(page, false)
    await rscFetch
    await page.waitForTimeout(250)
    await page.waitForTimeout(300) // settle margin, same as every other trigger

    const newFetches = newDataFetchesForRoute(requestLog, preLen, cfg.route)
    // FIXED-BEHAVIOR CONTRACT: the boundary refresh must have hit the server.
    expect(newFetches.length).toBeGreaterThan(0)

    const expected = await cfg.expected()
    await expect.poll(() => cfg.read(page), { timeout: 5000 }).toBe(expected)
  })
}
