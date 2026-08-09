/**
 * Phase 33 (VERS-01/VERS-02): two-sided proof of the version-gated
 * freshness backstop. Companion to e2e/freshness-router-cache.spec.ts and
 * e2e/freshness-fresh-paths.spec.ts, which prove the backstop still fires
 * when something DID change — this spec is the first to also prove the
 * gate stays CLOSED when nothing changed (the common-case cost win VERS-02
 * exists to deliver), while confirming router.refresh() still fires
 * unconditionally either way.
 *
 * registerRequestLog/newDataFetchesForRoute are copied verbatim from
 * e2e/freshness-router-cache.spec.ts's header-documented pattern — see that
 * file for why isRscRequest() must be called on the real Playwright Request
 * object at capture time.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest } from './helpers/rsc'
import { simulateResume } from './helpers/resume'
import { flipOneReviewDueState, createMutationCard, promoteOneReviewToMastered, readDataVersion } from './helpers/mutate'

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

test('/cards resume with no server-side change issues a version request and no payload re-fetch (VERS-02)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)

  await page.goto('/cards')
  await page.waitForLoadState('networkidle')
  const preLen = requestLog.length

  // Simulate PWA/tab backgrounding then resume — nothing mutated the DB
  // between page load and this trigger, so the version gate should stay
  // closed for the JSON backstop while router.refresh() still fires.
  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await page.waitForTimeout(1200)

  const sinceResume = requestLog.slice(preLen)

  // 1. GET /api/version was checked at least once.
  const versionRequests = sinceResume.filter((r) => r.pathname === '/api/version')
  expect(versionRequests.length).toBeGreaterThan(0)

  // 2. The JSON backstop's payload fetch was NOT re-issued — zero requests
  // to /api/cards (the backstop's no-cursor payload call for this route).
  const cardsPayloadRequests = sinceResume.filter((r) => r.pathname === '/api/cards')
  expect(cardsPayloadRequests.length).toBe(0)

  // 3. router.refresh() was NOT gated — the RSC/document fetch for /cards
  // still occurred, proving the version gate applies only to the JSON half.
  const newFetches = newDataFetchesForRoute(requestLog, preLen, '/cards')
  expect(newFetches.length).toBeGreaterThan(0)
})

test('/study resume after a real graded review re-fetches the payload (VERS-01 + VERS-02)', async ({ page }) => {
  const requestLog = registerRequestLog(page)

  await page.goto('/study')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Start studying →' }).click()
  await page.getByTestId('mode-passive').click()
  await page.getByTestId('begin-session-btn').click()

  // Promise created BEFORE the trigger per this repo's established
  // waitForResponse-over-waitForTimeout contract — the review write's
  // response can never be missed in the attach race.
  const reviewResponse = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/review' && res.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Show Answer' }).click()
  await page.getByRole('button', { name: /^Easy/ }).click()
  await reviewResponse

  const preLen = requestLog.length

  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await page.waitForTimeout(1200)

  const dueRequests = requestLog.slice(preLen).filter((r) => r.pathname === '/api/cards/due')
  expect(dueRequests.length).toBeGreaterThan(0)
})

// Non-vacuity lock (plan 33-02 Task 2): every freshness-spec mutator in
// e2e/helpers/mutate.ts must move the dataVersion counter, or the entire
// gate this file proves has nothing left to gate. Kept in this file rather
// than a separate one so the two-sided gate proof above (closed / open) and
// this lock read as one contract. Needs no browser page — a direct DB
// read/mutate/read round-trip is sufficient and cheaper.
test('every freshness-spec mutator moves the dataVersion counter (non-vacuity lock)', async () => {
  // FAILURE MEANING: if any assertion below fails, the four
  // e2e/freshness-*.spec.ts files have gone green-but-vacuous — the
  // mutator that failed no longer opens the version gate as their "the
  // server changed" step, so their backstop-delivery assertions prove
  // nothing even while passing. The fix is to restore the bump inside that
  // mutator's *Direct implementation in e2e/helpers/mutate.ts — never to
  // relax or delete an assertion in the freshness specs themselves.
  const before1 = await readDataVersion()
  await flipOneReviewDueState()
  const after1 = await readDataVersion()
  expect(after1, 'flipOneReviewDueState() must bump dataVersion (see FAILURE MEANING above)').not.toBe(before1)

  const before2 = await readDataVersion()
  await createMutationCard()
  const after2 = await readDataVersion()
  expect(after2, 'createMutationCard() must bump dataVersion (see FAILURE MEANING above)').not.toBe(before2)

  const before3 = await readDataVersion()
  await promoteOneReviewToMastered()
  const after3 = await readDataVersion()
  expect(after3, 'promoteOneReviewToMastered() must bump dataVersion (see FAILURE MEANING above)').not.toBe(before3)
})
