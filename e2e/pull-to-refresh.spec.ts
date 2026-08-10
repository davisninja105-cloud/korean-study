/**
 * Phase 34, Plan 05, Task 3 (LOCAL-04, D-03, D-04, ROADMAP SC5) — the
 * phase-gate proof that all four routes have a working escape hatch that
 * bypasses the cache read and the `/api/version` comparison entirely, with
 * Home's sync semantics distinct from the three route-local refreshes
 * (D-04's locked copy distinction).
 *
 * `lib/usePullToRefresh.ts` listens for `touchstart`/`touchmove`/`touchend`
 * window events only — `page.mouse` cannot trigger it. Every gesture in this
 * file goes through the browser's real `TouchEvent`/`Touch` constructors
 * (confirmed present in this harness's Chromium build even without touch
 * emulation), dispatched on `window` via `page.evaluate`, matching
 * `PULL_THRESHOLD = 70` and the `* 0.5` resistance factor in
 * `lib/usePullToRefresh.ts` — a raw touch travel of more than 140px is
 * required, and the gesture must start at `window.scrollY === 0`.
 *
 * `registerRequestLog`/`newDataFetchesForRoute` are copied verbatim from
 * e2e/freshness-version-gate.spec.ts's header-documented pattern.
 *
 * `playwright.config.ts`'s `webServer.env` sets a fake
 * `NEXT_PUBLIC_GOOGLE_DOC_ID` (34-05-PLAN.md Task 3 Rule 3 fix) so Home's
 * `handleSync` doesn't short-circuit on `if (!DOC_ID) return` before ever
 * calling `POST /api/sync` — this file's Home test then intercepts and
 * mocks that route's response so the real Google Docs API is never called.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { isRscRequest } from './helpers/rsc'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

interface LoggedRequest {
  pathname: string
  method: string
  url: string
  resourceType: string
  isRsc: boolean
}

// Registered BEFORE any navigation on every test — see
// freshness-router-cache.spec.ts's header comment for why isRscRequest() is
// called on the real Request object at capture time.
function registerRequestLog(page: Page): LoggedRequest[] {
  const requestLog: LoggedRequest[] = []
  page.on('request', (req: PwRequest) => {
    const url = new URL(req.url())
    requestLog.push({
      pathname: url.pathname,
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      isRsc: isRscRequest(req),
    })
  })
  return requestLog
}

// ── Touch gesture synthesis ─────────────────────────────────────────────────

async function dispatchTouch(
  page: Page,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number
): Promise<void> {
  await page.evaluate(
    ({ type, x, y }) => {
      const TouchCtor = (window as unknown as { Touch: new (init: unknown) => Touch }).Touch
      const target = document.body
      const touch = new TouchCtor({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y })
      const touches = type === 'touchend' ? [] : [touch]
      const evt = new TouchEvent(type, {
        touches: touches as unknown as Touch[],
        targetTouches: touches as unknown as Touch[],
        changedTouches: [touch] as unknown as Touch[],
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(evt)
    },
    { type, x, y }
  )
}

/**
 * Synthesizes a full pull-to-refresh gesture: scrolls to the top (the hook
 * gates on `window.scrollY > 0` at touchstart), dispatches touchstart + two
 * touchmove steps totalling 160px of raw downward travel (comfortably past
 * the 140px required after the 0.5 resistance factor), then touchend.
 *
 * Checks BOTH intermediate indicator states along the way ("Pull to
 * sync"/"Pull to refresh" while under threshold, then "Release to
 * sync"/"Release to refresh" once past it) — this IS the non-vacuity check:
 * a helper that silently no-ops (a browser TouchEvent regression, or a
 * regression in the hook's own scroll-top/threshold gates) fails loudly here
 * rather than letting every test in this file pass vacuously. Returns
 * immediately after touchend — it does NOT wait for the resulting network
 * request to resolve; callers create their own `page.waitForResponse(...)`
 * promise BEFORE calling this helper (this repo's established
 * promise-created-before-trigger contract) and await it afterward, so the
 * still-in-flight "Syncing…"/"Refreshing…" state remains observable in the
 * gap between this helper returning and that awaited response landing.
 */
async function pullToRefresh(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await dispatchTouch(page, 'touchstart', 200, 100)
  await dispatchTouch(page, 'touchmove', 200, 140) // dy=40 -> pull=20 (< PULL_THRESHOLD=70)
  await expect(page.getByText(/^Pull to (sync|refresh)$/)).toBeVisible({ timeout: 2000 })
  await dispatchTouch(page, 'touchmove', 200, 260) // dy=160 -> pull=80 (>= PULL_THRESHOLD=70)
  await expect(page.getByText(/^Release to (sync|refresh)$/)).toBeVisible({ timeout: 2000 })
  await dispatchTouch(page, 'touchend', 200, 260)
}

// ── Test 1: Home — Pull to sync / Release to sync / Syncing…, POST /api/sync exactly once ──

test('/ pull-to-refresh fires exactly one POST /api/sync, with Pull to sync / Release to sync / Syncing… copy (LOCAL-04, D-04)', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Mocks POST /api/sync's response — this test proves the CLIENT gesture
  // (request count + indicator copy), never real Google Docs connectivity.
  // The artificial delay holds "Syncing…" open long enough to observe it
  // before the response resolves.
  let syncRequestCount = 0
  await context.route('**/api/sync', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    syncRequestCount += 1
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ synced: true, newLessons: 0, newCards: 0, remaining: 0, failed: 0 }),
    })
  })

  const syncResponse = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/sync' && res.request().method() === 'POST'
  )
  await pullToRefresh(page)
  // The response is still in flight (the mocked 400ms delay above) — the
  // refreshing indicator must still read "Syncing…" right now.
  await expect(page.getByText('Syncing…')).toBeVisible()
  await syncResponse

  expect(syncRequestCount).toBe(1)
})

// ── Test 2: Study/Cards/Habits — route-local refresh, zero POST /api/sync ──

interface RouteRefreshConfig {
  route: string
  navName: string
  dataPathname: string
}

const ROUTE_REFRESH_CONFIGS: RouteRefreshConfig[] = [
  { route: '/study', navName: 'Study', dataPathname: '/api/cards/due' },
  { route: '/cards', navName: 'Cards', dataPathname: '/api/cards' },
  { route: '/habits', navName: 'Habits', dataPathname: '/api/activity' },
]

for (const cfg of ROUTE_REFRESH_CONFIGS) {
  test(`${cfg.route} pull-to-refresh fires its own data request, zero POST /api/sync, with Pull to refresh / Release to refresh / Refreshing… copy (LOCAL-04, D-04)`, async ({
    page,
    context,
  }) => {
    await page.goto(cfg.route)
    await page.waitForLoadState('networkidle')

    // Delays every real (unmocked) response for this route's own data
    // endpoint so the transient "Refreshing…" state is reliably observable
    // — these are real, DB-backed responses (no mocking of data), just
    // artificially slowed.
    await context.route(`**${cfg.dataPathname}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })

    const requestLog = registerRequestLog(page)
    const dataResponse = page.waitForResponse((res) => new URL(res.url()).pathname === cfg.dataPathname)

    await pullToRefresh(page)
    await expect(page.getByText('Refreshing…')).toBeVisible()
    await dataResponse

    const syncRequests = requestLog.filter((r) => r.pathname === '/api/sync')
    expect(syncRequests.length).toBe(0)

    const dataRequests = requestLog.filter((r) => r.pathname === cfg.dataPathname)
    expect(dataRequests.length).toBeGreaterThan(0)
  })
}

// ── Test 3: cache-and-version bypass — fires even when nothing changed ─────
// Proves the escape hatch is UNCONDITIONAL rather than incidentally firing
// because something changed: warms each route (populating its cache entry
// and its version baseline), then performs the gesture with NO intervening
// server-side mutation — the cached entry's dataVersion still matches
// GET /api/version, which would correctly close the mount/boundary-event
// revalidation gate (LOCAL-02) but must NOT close pull-to-refresh's gate.

for (const cfg of ROUTE_REFRESH_CONFIGS) {
  test(`${cfg.route} pull-to-refresh bypasses the cache read and version check even when nothing changed server-side (LOCAL-04)`, async ({
    page,
  }) => {
    // Warm visit — populates the cache entry and the version baseline.
    await page.goto(cfg.route)
    await page.waitForLoadState('networkidle')

    const requestLog = registerRequestLog(page)
    const preLen = requestLog.length

    const dataResponse = page.waitForResponse((res) => new URL(res.url()).pathname === cfg.dataPathname)
    await pullToRefresh(page)
    await dataResponse

    // No server-side mutation happened between the warm visit and the
    // gesture, so a version-gated mechanism would have skipped the fetch
    // entirely — the escape hatch fired anyway.
    const dataRequests = requestLog.slice(preLen).filter((r) => r.pathname === cfg.dataPathname)
    expect(dataRequests.length).toBeGreaterThan(0)
  })
}

// ── Test 4: /cards boundedness — never exceeds the currently-loaded count ──
// RESEARCH Pitfall 5 / T-34-13: the route-local refresh must stay bounded to
// exactly what the session already loaded, one fetchCardsPage call per
// group at that group's OWN current row count — never a single unbounded
// query. Expands two groups (Vocabulary, which the fixture seeds with all
// FIXTURE.totalCards cards, and a freshly-added Grammar card) so there are
// two distinct loaded counts to prove `take` tracks independently.

// Tall mobile viewport (mirrors e2e/cards-edit-regression.spec.ts's
// established precedent): react-virtuoso only renders rows within/near the
// viewport window, so on the default desktop viewport a just-added Grammar
// group header can land outside Virtuoso's measured render range and never
// appear in the DOM at all — a virtualization artifact, not a code bug
// (empirically confirmed: reproduces identically pre- and post- this plan's
// CardsClient.tsx changes). 390x2400 fits every fixture card plus the new
// Grammar group's single row without any scrolling.
test.describe('cards boundedness (tall viewport for Virtuoso)', () => {
  test.use({ viewport: { width: 390, height: 2400 } })

  test('/cards pull-to-refresh keeps every request bounded to that group\'s currently-loaded row count (LOCAL-04, RESEARCH Pitfall 5)', async ({
    page,
  }) => {
    await page.goto('/cards')
    await page.waitForLoadState('networkidle')

    // Vocabulary is expanded by default (FIXTURE seeds only vocabulary
    // cards, auto-expanded on first load) — confirm all FIXTURE.totalCards
    // rows are loaded before proceeding.
    const vocabHeader = page.getByRole('button', { name: /Vocabulary/ })
    await expect(vocabHeader).toContainText(`${FIXTURE.totalCards} cards`)

    // Add one Grammar card so the Grammar group has a real, non-empty,
    // independently-sized loaded count (the fixture seeds zero Grammar
    // cards).
    await page.getByRole('button', { name: 'Add Card' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').selectOption('grammar')
    await dialog.getByPlaceholder('Front (Korean)').fill('첫문법카드')
    await dialog.getByPlaceholder('Back (English)').fill('first grammar test card')
    await dialog.getByRole('button', { name: 'Add Card' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const grammarHeader = page.getByRole('button', { name: /Grammar/ })
    await expect(grammarHeader).toContainText('1 card')

    const requestLog = registerRequestLog(page)
    const cardsResponse = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/cards' && res.request().method() === 'GET'
    )
    await pullToRefresh(page)
    await cardsResponse
    // Let every group's own fetchCardsPage call settle.
    await page.waitForLoadState('networkidle')

    const cardsRequests = requestLog.filter((r) => r.pathname === '/api/cards' && r.method === 'GET')
    expect(cardsRequests.length).toBeGreaterThan(0)

    const loadedCountByType: Record<string, number> = {
      vocabulary: FIXTURE.totalCards,
      grammar: 1,
    }

    for (const req of cardsRequests) {
      const url = new URL(req.url)
      const type = url.searchParams.get('type')
      const take = url.searchParams.get('take')
      if (!type || !(type in loadedCountByType)) continue // e.g. Phrase/Other, never expanded — no request expected, but skip defensively
      expect(take).not.toBeNull()
      // Never larger than that group's currently-loaded row count.
      expect(Number(take)).toBeLessThanOrEqual(loadedCountByType[type])
      // And, for the two groups actually expanded, exactly equal to it —
      // proving the request is bounded to the real count, not a fixed page
      // size or an unbounded fetch.
      expect(Number(take)).toBe(loadedCountByType[type])
    }
  })
})

// ── Test 5: offline gesture (LOCAL-04 unclassified edge, this plan's own
// resolution) — the gesture fires, the fetch fails, the route-local failure
// copy with its Try again link appears, and the cached content stays put. ──

test('/study pull-to-refresh while offline shows the route-local failure copy and keeps the cached content on screen (LOCAL-04)', async ({
  page,
  context,
}) => {
  await page.goto('/study')
  await page.waitForLoadState('networkidle')

  const dueCountBefore = await page.getByTestId('due-count').textContent()
  expect(dueCountBefore).toBe(String(FIXTURE.dueCards))

  await context.setOffline(true)
  try {
    await pullToRefresh(page)
    // handleRefresh's fetch rejects (offline) — refreshError flips true,
    // the pull/refreshing indicator clears, and the route-local failure copy
    // appears with its retry control.
    await expect(page.getByText("Couldn't refresh. Check your connection and try again.")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()

    // The previously-rendered cached/RSC content is untouched — no crash, no
    // blank shell, no stale-to-blank clobber.
    await expect(page.getByTestId('due-count')).toHaveText(String(FIXTURE.dueCards))
  } finally {
    await context.setOffline(false)
  }
})
