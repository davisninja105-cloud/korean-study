/**
 * E2E-06 → Phase 26 acceptance bar: this file now carries the fixed-behavior
 * contract for its 3 back-forward cells (/study, /cards, /habits — the D-04
 * CR-01-flagged cells from 24-DIAGNOSIS.md's Summary Matrix, originally
 * classified Stale-ClientShell). These tests were deliberately RED through
 * Phase 25, asserting today's stale reality. Phase 26 flips them to assert
 * the FIXED contract: a boundary-triggered RSC refresh fetch lands (network
 * evidence) AND the DOM value matches live DB truth (content evidence). They
 * remain red until Plans 26-02/26-03 ship the fix — a true red→green bar,
 * never re-tuned after the fact.
 *
 * The 4th test (`/habits post-mutation-return is genuinely fresh today...`)
 * is the untouched already-fresh cell: 25-03-SUMMARY.md re-verified it
 * genuinely FRESH (both the RSC-fetch evidence and the DOM value match live
 * truth), contradicting 24-DIAGNOSIS.md's original stale finding for that
 * cell. No fix effort targets it and its body is left byte-identical here.
 *
 * Same discipline as freshness-router-cache.spec.ts: plain expect()/
 * expect.poll() calls only, never expected-failure or skip annotations; no
 * page.goto() recovery on page.goBack() (D-04 CR-01 re-verification — this
 * file's back-forward tests cover 3 of the 4 flagged cells, /study /cards
 * /habits; freshness-router-cache covers the 4th, /).
 *
 * D-03 dual-evidence rule applies here too: every test asserts at least one
 * new RSC fetch was captured for the route (isRscRequest evidence — a
 * nonzero count, matching 24-DIAGNOSIS.md's own `classifyCell()` predicate,
 * which branches on `fetches.length === 0` vs `> 0`, never on an exact
 * count) AND a DOM-content assertion via e2e/helpers/readers.ts.
 *
 * IMPORTANT — D-04 CR-01 RE-VERIFICATION FINDING (see 25-03-SUMMARY.md and
 * 26-01-SUMMARY.md for full detail): under this harness's real navigation
 * path (native `page.goBack()`, `@playwright/test`'s storageState auth, and
 * reaching each route via a `<Link>` click from Home rather than a hard
 * `page.goto()`), the 3 back-forward cells below capture ZERO new fetches
 * pre-fix, not the one RSC fetch 24-DIAGNOSIS.md recorded — i.e. they
 * present with the Router-Cache-reuse evidence signature, not the
 * client-shell-non-resync signature the diagnosis classified them under.
 * They are STILL genuinely stale pre-fix (the DOM assertion below still
 * fails), so the fixed-behavior contract below is agnostic to which
 * mechanism produced the staleness — the fix architecture covers both
 * (26-01-PLAN.md's design_decisions #1).
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest, waitForRscFetch } from './helpers/rsc'
import {
  createMutationCard,
  promoteOneReviewToMastered,
  expectedCardsCount,
  expectedMasteredCount,
  flipOneReviewDueState,
  expectedDueState,
} from './helpers/mutate'
import { readStudySelectModeState, readCardsCount, readHabitsMasteredCount } from './helpers/readers'

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

function newRscFetchesForRoute(log: LoggedRequest[], preLen: number, routePath: string): LoggedRequest[] {
  return log.slice(preLen).filter((r) => r.pathname === routePath && r.isRsc)
}

interface RouteConfig {
  route: string
  navName: string
  read: (page: Page) => Promise<string>
  mutate: () => Promise<void>
  expected: () => Promise<string>
}

const BACK_FORWARD_ROUTES: RouteConfig[] = [
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

// ── back-forward cells (3 of 4 flagged CR-01 cells: /study, /cards, /habits) ──
for (const cfg of BACK_FORWARD_ROUTES) {
  test(`${cfg.route} back-forward serves fresh data after boundary refresh (FRESH-04)`, async ({ page }) => {
    const requestLog = registerRequestLog(page)

    // Reach the target route for the first time this session via a real
    // nav-link click (matches 24-DIAGNOSIS.md's exact reproduction steps).
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('link', { name: cfg.navName, exact: true }).click()
    await page.waitForLoadState('networkidle')
    // Soft-navigate away.
    await page.getByRole('link', { name: 'Home', exact: true }).click()
    await page.waitForLoadState('networkidle')

    await cfg.mutate()
    const preLen = requestLog.length
    // Promise created BEFORE the trigger per waitForRscFetch's contract.
    const rscFetch = waitForRscFetch(page, cfg.route)
    // Native API only — NO goto() recovery (Ambiguity 2 / D-04 CR-01).
    await page.goBack({ waitUntil: 'networkidle' })
    await rscFetch
    await page.waitForTimeout(300) // justified settle margin, same as every trigger

    const newFetches = newRscFetchesForRoute(requestLog, preLen, cfg.route)
    // FIXED-BEHAVIOR CONTRACT: the boundary refresh must have hit the
    // server, regardless of which pre-fix mechanism (router-cache reuse or
    // client-shell non-resync) currently produces the staleness — see file
    // header D-04 CR-01 finding.
    expect(newFetches.length).toBeGreaterThan(0)

    const expected = await cfg.expected()
    // Polling assertion — the readers only poll for element visibility, not
    // value, and React's post-refresh commit lands a beat after the
    // response, so a one-shot read is a flake source.
    await expect.poll(() => cfg.read(page), { timeout: 5000 }).toBe(expected)
  })
}

// ── /habits post-mutation-return ────────────────────────────────────────────
// 24-DIAGNOSIS.md flagged this as the only post-mutation-return cell that
// stayed stale. RE-VERIFIED FINDING (see file header): under this harness,
// it is genuinely FRESH — both the RSC-fetch evidence and the DOM value
// match live truth. This test therefore asserts the TRUE current behavior
// (fresh) rather than a forced-stale assertion that would misrepresent
// reality; the divergence from 24-DIAGNOSIS.md is documented in the file
// header above and in 25-03-SUMMARY.md's D-04 CR-01 section. Byte-identical
// to its Phase 25 form — no fix effort targets this cell.
test('/habits post-mutation-return is genuinely fresh today (re-verified: diverges from 24-DIAGNOSIS.md, see SUMMARY)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)

  await page.goto('/habits')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.waitForLoadState('networkidle')

  await promoteOneReviewToMastered()
  const preLen = requestLog.length
  await page.getByRole('link', { name: 'Habits', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // justified settle margin

  const newFetches = newRscFetchesForRoute(requestLog, preLen, '/habits')
  // Next.js reuses the same RSC payload URL for this segment, so the server
  // IS hit and returns the correct fresh count (observed count: 2 fetches
  // in this harness — prefetch + real navigation fetch, both legitimately
  // count as "a data fetch occurred" per 24-DIAGNOSIS.md's own RSC-signature
  // notes — hence a nonzero check, not an exact-one check).
  expect(newFetches.length).toBeGreaterThan(0)

  const expected = await expectedMasteredCount()
  const observed = await readHabitsMasteredCount(page)
  // RE-VERIFIED FRESH today (contradicts 24-DIAGNOSIS.md's stale finding
  // for this cell) — HabitsClient correctly adopted the fresh payload on
  // this navigation path.
  expect(observed).toBe(expected)
})
