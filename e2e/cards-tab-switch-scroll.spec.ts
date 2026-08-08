/**
 * D-08 regression spec (31-VERIFICATION.md behavior_unverified_items):
 * proves the Cards <-> Reading Practice tab switch actually PRESERVES each
 * view's window scroll position across a round trip, and does so without
 * re-fetching data that is already loaded.
 *
 * e2e/cards-sticky-header.spec.ts (G-31-2) already proves the toggle is
 * reachable/tappable after scrolling on a short viewport — it does NOT prove
 * the round-trip scroll/state actually restores. This spec closes that gap.
 *
 * Mirrors cards-sticky-header.spec.ts's house conventions: narrow mobile
 * viewport (no dedicated mobile Playwright project in this suite),
 * resetToBaseline() per test, waitVisible/dumpUnrecognizedState before any
 * locator assertion that could be missing/hidden.
 */

import { test, expect, type Page, type Request as PwRequest } from '@playwright/test'
import { resetToBaseline } from './seed'
import { waitVisible, dumpUnrecognizedState } from './helpers/readers'
import { FIXTURE } from './fixture'

test.use({ viewport: { width: 390, height: 500 } })

test.beforeEach(async () => {
  await resetToBaseline()
})

interface LoggedRequest {
  pathname: string
}

// Local, self-contained request log — mirrors e2e/freshness-fresh-paths.spec.ts's
// registerRequestLog convention (not imported; that helper isn't exported).
function registerRequestLog(page: Page): LoggedRequest[] {
  const requestLog: LoggedRequest[] = []
  page.on('request', (req: PwRequest) => {
    requestLog.push({ pathname: new URL(req.url()).pathname })
  })
  return requestLog
}

test('Cards <-> Reading practice tab switch preserves window scroll position round-trip (D-08)', async ({
  page,
}) => {
  const requestLog = registerRequestLog(page)

  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  const cardsToggle = page.getByRole('button', { name: `Cards (${FIXTURE.totalCards})` })
  const readingToggle = page.getByRole('button', { name: 'Reading practice' })

  if (!(await waitVisible(cardsToggle))) {
    await dumpUnrecognizedState(page, 'cards-tab-switch-scroll:pre-scroll-cards-toggle')
  }
  await expect(cardsToggle).toBeVisible()

  // Scroll the Cards tab to a non-zero depth.
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(300)
  const cardsScroll = await page.evaluate(() => window.scrollY)
  expect(cardsScroll).toBeGreaterThan(0)

  // Switch to Reading practice.
  if (!(await waitVisible(readingToggle))) {
    await dumpUnrecognizedState(page, 'cards-tab-switch-scroll:reading-toggle')
  }
  await readingToggle.click()
  await expect(readingToggle).toHaveAttribute('aria-pressed', 'true')
  await page.waitForLoadState('networkidle')

  // Scroll Reading practice to a DIFFERENT depth than the Cards scroll.
  await page.mouse.wheel(0, 150)
  await page.waitForTimeout(300)
  const readingScroll = await page.evaluate(() => window.scrollY)
  expect(readingScroll).toBeGreaterThan(0)

  // Switch back to Cards — the core D-08 regression check: scroll restores
  // EXACTLY to where it was before leaving the Cards tab. Virtuoso's
  // restoreStateFrom applies over a couple of rAF frames after remount (it
  // measures rows before scrolling), so poll rather than reading once
  // immediately after the click.
  await cardsToggle.click()
  await expect(cardsToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBe(cardsScroll)

  // Switch to Reading practice again — must also restore exactly, and must
  // NOT re-fetch (this is the second visit; the lazy first-visit fetch
  // already happened above).
  await readingToggle.click()
  await expect(readingToggle).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBe(readingScroll)

  // Request-log evidence: exactly one lazy first-visit /api/cards/sentences
  // fetch across the whole test (no re-fetch on the second Reading practice
  // visit), and zero /api/cards page requests at any point (the RSC page's
  // own initial data arrives server-side, never via a client GET /api/cards
  // call in this tab-switch flow).
  const sentencesRequests = requestLog.filter((r) => r.pathname === '/api/cards/sentences')
  const cardsPageRequests = requestLog.filter((r) => r.pathname === '/api/cards')
  expect(sentencesRequests).toHaveLength(1)
  expect(cardsPageRequests).toHaveLength(0)
})
