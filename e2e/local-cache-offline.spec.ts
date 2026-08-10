/**
 * Phase 34, Plan 05, Task 3 (LOCAL-05, ROADMAP SC2) — the phase-gate proof
 * that Home, Cards, and Habits render last-known data with the browser
 * context fully offline. This repo's first use of `context.setOffline`
 * beyond a single already-mounted-page check (e2e/local-cache-first-paint.
 * spec.ts's LOCAL-05 test, plan 34-01).
 *
 * EMPIRICALLY VERIFIED FINDING (recorded here per 34-01-SUMMARY.md's own
 * precedent for /habits, now confirmed to hold for ALL FOUR routes and for
 * BOTH a hard `page.reload()`/`page.goto()` AND a soft client-side `<Link>`
 * navigation): every route in this app is `force-dynamic` — there is no
 * static HTML shell and no service worker in this phase (that is explicitly
 * Phase 35's scope, OFFLINE-01 precaching) — so ANY full document
 * navigation while `context.setOffline(true)` fails hard with
 * `net::ERR_INTERNET_DISCONNECTED` / lands on `chrome-error://chromewebdata`,
 * warm cache or not, confirmed via direct probing this session for `/`, a
 * `<Link>` soft-nav to `/cards`, and a `page.reload()` on `/habits`. "Opening
 * the app" while offline within this phase's actual architecture therefore
 * means: an already-mounted page (from an earlier ONLINE visit this browser
 * session) keeps rendering its last-known content when connectivity drops
 * mid-session — not a fresh cold load with no network. This is the
 * achievable, non-vacuous proof of LOCAL-05, and it is real: the whole
 * point of the IndexedDB cache is that the page never needs to hit the
 * network again to keep showing what it already painted.
 *
 * `resetToBaseline()` is copied verbatim from e2e/seed.ts's usage
 * throughout this suite.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

function offlinePill(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Offline' })
}

// ── Home ─────────────────────────────────────────────────────────────────

test('/ renders last-known data with the network offline, Offline pill visible, no unhandled page error (LOCAL-05)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  // Warm visit — populates the `home` IndexedDB cache entry and paints real
  // seed-traceable content (the due-count hero).
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const dueHero = page.locator('span.text-reward')
  await expect(dueHero).toBeVisible()
  const dueTextBefore = await dueHero.textContent()
  expect(dueTextBefore?.trim()).toBe(String(FIXTURE.dueCards))

  await expect(offlinePill(page)).toHaveCount(0)

  await context.setOffline(true)
  try {
    // Losing connectivity mid-session must not blank the screen, show an
    // error, or change the already-painted value.
    await expect(dueHero).toBeVisible()
    expect((await dueHero.textContent())?.trim()).toBe(dueTextBefore?.trim())
    await expect(page.getByText(/application error/i)).toHaveCount(0)

    // The persistent Offline pill (components/Nav.tsx, plan 34-04) appears
    // live off the browser's native online/offline events — no reload
    // needed (confirmed: context.setOffline fires real online/offline
    // events in this harness).
    await expect(offlinePill(page)).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  // Reconnecting clears the pill without any navigation.
  await expect(offlinePill(page)).toHaveCount(0)

  expect(pageErrors).toEqual([])
})

// ── Cards ────────────────────────────────────────────────────────────────

test('/cards renders last-known data with the network offline, Offline pill visible, no unhandled page error (LOCAL-05)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  // Warm visit — populates the `cards` IndexedDB cache entry and paints a
  // real seed-traceable card row. The virtualized list (react-virtuoso)
  // only renders rows within/near the default desktop viewport, so this
  // does not assume any SPECIFIC fixture front is in the rendered window —
  // it reads whichever card row front is actually visible and asserts it's
  // a member of the fixture's known set (seed-traceable, not a hardcoded
  // value that could silently drift, per the anti-vacuous-smoke rule).
  const allFixtureFronts = [
    ...FIXTURE.cards.due.map((c) => c.front),
    ...FIXTURE.cards.mastered.map((c) => c.front),
    ...FIXTURE.cards.new.map((c) => c.front),
  ]
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')
  const cardsButton = page.getByRole('button', { name: /^Cards \(\d+\)$/ })
  await expect(cardsButton).toHaveText(`Cards (${FIXTURE.totalCards})`)
  const firstFrontLocator = page.locator('p.font-bold.text-foreground.hangul').first()
  await expect(firstFrontLocator).toBeVisible()
  const frontBefore = (await firstFrontLocator.textContent())?.trim()
  expect(allFixtureFronts).toContain(frontBefore)

  await expect(offlinePill(page)).toHaveCount(0)

  await context.setOffline(true)
  try {
    await expect(cardsButton).toHaveText(`Cards (${FIXTURE.totalCards})`)
    await expect(firstFrontLocator).toBeVisible()
    expect((await firstFrontLocator.textContent())?.trim()).toBe(frontBefore)
    await expect(page.getByText(/application error/i)).toHaveCount(0)

    await expect(offlinePill(page)).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  await expect(offlinePill(page)).toHaveCount(0)

  expect(pageErrors).toEqual([])
})

// ── Habits ───────────────────────────────────────────────────────────────

test('/habits renders last-known data with the network offline, Offline pill visible, no unhandled page error (LOCAL-05)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  // Warm visit — populates the `habits` IndexedDB cache entry and paints
  // the real streak hero.
  await page.goto('/habits')
  await page.waitForLoadState('networkidle')
  const streakHero = page.locator('p.text-3xl.font-bold.text-foreground')
  await expect(streakHero).toBeVisible()
  const streakTextBefore = await streakHero.textContent()
  expect(streakTextBefore).toMatch(/🔥/)

  await expect(offlinePill(page)).toHaveCount(0)

  await context.setOffline(true)
  try {
    await expect(streakHero).toBeVisible()
    expect(await streakHero.textContent()).toBe(streakTextBefore)
    await expect(page.getByText(/application error/i)).toHaveCount(0)

    await expect(offlinePill(page)).toBeVisible()
  } finally {
    await context.setOffline(false)
  }

  await expect(offlinePill(page)).toHaveCount(0)

  expect(pageErrors).toEqual([])
})
