/**
 * E2E-06: Stale-ClientShell cells (24-DIAGNOSIS.md Summary Matrix cells
 * where the server WAS hit and returned fresh data — an RSC fetch is
 * captured — but the mounted client shell's `useState(initialXxx)` never
 * adopted the new payload). Same discipline as freshness-router-cache.spec.ts:
 * plain expect() calls only, never expected-failure or skip annotations; no
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
 * IMPORTANT — D-04 CR-01 RE-VERIFICATION FINDING (see 25-03-SUMMARY.md for
 * full detail): under this harness's real navigation path (native
 * `page.goBack()`, `@playwright/test`'s storageState auth, and — per this
 * plan's own Task 2 action text — reaching each route via a `<Link>` click
 * from Home rather than a hard `page.goto()`), the 3 back-forward cells
 * below captured ZERO new fetches, not the one RSC fetch 24-DIAGNOSIS.md
 * recorded — i.e. they now present with the Router-Cache-reuse evidence
 * signature, not the client-shell-non-resync signature the diagnosis
 * classified them under. They are STILL genuinely stale (the DOM assertion
 * below still fails), so this file's "RED today" contract holds for these
 * 3 — only the EVIDENCE PATTERN backing that redness differs from
 * 24-DIAGNOSIS.md. `/habits post-mutation-return` diverges further: it is
 * confirmed GENUINELY FRESH under this re-verification (both the fetch
 * count and the DOM value match live truth), contradicting 24-DIAGNOSIS.md's
 * claim that it is the only currently-reproducing post-mutation-return bug.
 * Per this plan's own Task 2 acceptance-criteria instruction ("do not
 * silently adjust the spec to match — record the mismatch"), these findings
 * are recorded here and in 25-03-SUMMARY.md / STATE.md Blockers rather than
 * papered over with an assertion tuned to force the diagnosis's original
 * numbers.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest } from './helpers/rsc'
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
  test(`${cfg.route} back-forward stays stale (re-verified: Router-Cache-reuse evidence, not Stale-ClientShell) - expected RED until Phase 26`, async ({
    page,
  }) => {
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
    // Native API only — NO goto() recovery (Ambiguity 2 / D-04 CR-01).
    await page.goBack({ waitUntil: 'networkidle' })
    await page.waitForTimeout(300) // justified settle margin, same as every trigger

    const newFetches = newRscFetchesForRoute(requestLog, preLen, cfg.route)
    // RE-VERIFIED FINDING (see file header): this now captures ZERO new
    // fetches for all 3 routes, not 1 as 24-DIAGNOSIS.md recorded — a
    // Router-Cache-reuse evidence signature, differing from the diagnosis's
    // client-shell classification for this cell. Kept in this file per the
    // plan's structural artifact contract; the divergence is documented
    // above and in 25-03-SUMMARY.md rather than silently re-tuned to match
    // the diagnosis's original prediction.
    expect(newFetches).toHaveLength(0)

    const expected = await cfg.expected()
    const observed = await cfg.read(page)
    // EXPECTED RED today regardless of evidence pattern: the pre-mutation
    // value is still on screen.
    expect(observed).toBe(expected)
  })
}

// ── /habits post-mutation-return ────────────────────────────────────────────
// 24-DIAGNOSIS.md flagged this as the only post-mutation-return cell that
// stayed stale. RE-VERIFIED FINDING (see file header): under this harness,
// it is genuinely FRESH — both the RSC-fetch evidence and the DOM value
// match live truth. This test therefore asserts the TRUE current behavior
// (fresh) rather than a forced-stale assertion that would misrepresent
// reality; the divergence from 24-DIAGNOSIS.md is documented in the file
// header above and in 25-03-SUMMARY.md's D-04 CR-01 section.
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
