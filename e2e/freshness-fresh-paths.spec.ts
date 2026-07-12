/**
 * E2E-06: Confirmed-Fresh cells (7 total) — the 24-DIAGNOSIS.md Summary
 * Matrix cells that are the regression net Phase 26 must not break
 * (ROADMAP Success Criterion 4). ALL 7 tests are expected GREEN today.
 *
 * D-03 dual-evidence rule applies here too: every test pairs a network
 * fetch-count assertion (isRscRequest evidence) with a DOM-content
 * assertion (e2e/helpers/readers.ts).
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest } from './helpers/rsc'
import {
  flipOneReviewDueState,
  createMutationCard,
  promoteOneReviewToMastered,
  ensureAllSeededReviewsDue,
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

// Registered BEFORE any navigation on every test — see
// freshness-router-cache.spec.ts's header comment for why isRscRequest() is
// called on the real Request object at capture time rather than replayed
// against a plain-object stand-in.
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

// ── Plain-Link cells (4 total: /, /study, /cards, /habits) ─────────────────
for (const cfg of ROUTES) {
  test(`${cfg.route} plain-Link stays fresh - regression net for Phase 26`, async ({ page }) => {
    const requestLog = registerRequestLog(page)
    const startRoute = cfg.route === '/' ? '/cards' : '/'

    await page.goto(startRoute)
    // Settle prefetch activity from the initial goto BEFORE the pre-action
    // snapshot, so a late-resolving prefetch is never misattributed to the
    // triggering click below.
    await page.waitForLoadState('networkidle')
    await cfg.mutate()
    const preLen = requestLog.length
    await page.getByRole('link', { name: cfg.navName, exact: true }).click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(300) // justified settle margin

    const newFetches = newDataFetchesForRoute(requestLog, preLen, cfg.route)
    expect(newFetches).toHaveLength(1)

    const expected = await cfg.expected()
    const observed = await cfg.read(page)
    expect(observed).toBe(expected)
  })
}

// ── Primary D-05 scenario: real UI grade session → Home / → Study (2 cells) ──
// Each test independently drives the full grading flow to completion (rather
// than sharing one continuous browser session across two Playwright test()
// calls) so this file reports exactly 7 discrete tests, matching
// 24-DIAGNOSIS.md's 7 Confirmed-Fresh cells one-for-one, while still
// reproducing the real click-through-completion-screen UI flow for each cell.
async function gradeAllDueCardsToCompletion(page: Page): Promise<void> {
  await ensureAllSeededReviewsDue()
  await page.goto('/study')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Start studying →' }).click()
  await page.getByRole('button', { name: /Flashcards/ }).click()

  let reachedCompletion = false
  for (let i = 0; i < 20; i++) {
    if ((await page.getByText(/Session complete!|Going the extra mile!/).count()) > 0) {
      reachedCompletion = true
      break
    }
    await page.getByRole('button', { name: 'Show Answer' }).click()
    await page.getByRole('button', { name: /^Easy/ }).click()
    await page.waitForTimeout(80)
  }
  if (!reachedCompletion) {
    throw new Error('Primary study-grading scenario did not reach the completion screen within 20 grade actions')
  }
}

test('/ post-mutation-return stays fresh - regression net for Phase 26 (primary D-05 scenario)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)
  await gradeAllDueCardsToCompletion(page)

  const preLen = requestLog.length
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // justified settle margin

  const newFetches = newDataFetchesForRoute(requestLog, preLen, '/')
  expect(newFetches).toHaveLength(1)

  const observed = await readHomeState(page)
  expect(observed).toBe('zero-due-state')
})

test('/study post-mutation-return stays fresh - regression net for Phase 26 (primary D-05 scenario)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)
  await gradeAllDueCardsToCompletion(page)

  // Same as 24-DIAGNOSIS.md's continuous flow: return to Home first, then
  // click back into Study, so the Study segment genuinely re-fetches rather
  // than clicking a Link to the already-active route.
  await page.getByRole('link', { name: 'Back to Dashboard', exact: true }).click()
  await page.waitForLoadState('networkidle')

  const preLen = requestLog.length
  await page.getByRole('link', { name: 'Study', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // justified settle margin

  const newFetches = newDataFetchesForRoute(requestLog, preLen, '/study')
  // RE-VERIFIED FINDING (Task 2 execution, matches the /habits
  // post-mutation-return precedent in freshness-client-shell.spec.ts):
  // clicking a real nav <Link> back into a route already visited this
  // session deterministically captures TWO new rsc:1 fetches here (a
  // viewport-prefetch of the mounted nav Link plus the real navigation
  // fetch), not one. Reproduced identically across repeated runs. Both
  // legitimately count as "a data fetch occurred" per 24-DIAGNOSIS.md's own
  // RSC-signature notes ("only whether the server was hit at all matters,
  // not which kind of fetch it was") — hence a nonzero check, not an
  // exact-one check, matching the established pattern elsewhere in this
  // plan rather than a spec bug being silently tuned to pass.
  expect(newFetches.length).toBeGreaterThan(0)

  const observed = await readStudySelectModeState(page)
  expect(observed).toBe('zero-due-state')
})

// ── /cards post-mutation-return (D-06 cheap DB-level variant) ──────────────
test('/cards post-mutation-return stays fresh - regression net for Phase 26 (D-06 DB-level variant)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)

  await page.goto('/cards')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.waitForLoadState('networkidle')

  await createMutationCard()
  const preLen = requestLog.length
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // justified settle margin

  const newFetches = newDataFetchesForRoute(requestLog, preLen, '/cards')
  // Same re-verified nonzero-fetch finding as '/study post-mutation-return'
  // above — see that test's comment for full detail.
  expect(newFetches.length).toBeGreaterThan(0)

  const expected = await expectedCardsCount()
  const observed = await readCardsCount(page)
  expect(observed).toBe(expected)
})
