/**
 * E2E-04 smoke suite: each of the 4 main routes must render a SPECIFIC
 * seeded value on first paint, never a generic HTTP-200/skeleton-absence
 * check (25-RESEARCH.md False-Positive Risks — a vacuous smoke spec would
 * stay green through an entire RSC-hydration regression and defeat this
 * suite's whole purpose as the milestone's first-load performance guard
 * rail, ROADMAP Success Criterion 3).
 *
 * ORDERING SAFEGUARD: Playwright's default file-discovery glob order is
 * alphabetical, which places freshness-*.spec.ts (Plan 03, which mutate the
 * DB per test) BEFORE this file in a full `npx playwright test` run. The
 * beforeAll reset below guarantees this spec's assertions are correct
 * regardless of execution order or which other spec files ran first.
 *
 * Also captures Navigation Timing informationally (D-06) — zero pass/fail
 * budget assertions here; Phase 27 adds budgets on top of this capture.
 */

import { test, expect } from '@playwright/test'
import { readHomeState, readStudySelectModeState, readCardsCount, readHabitsMasteredCount } from './helpers/readers'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeAll(async () => {
  await resetToBaseline()
})

async function captureNavTiming(page: import('@playwright/test').Page): Promise<void> {
  const timing = await page.evaluate(() => JSON.stringify(performance.getEntriesByType('navigation')))
  console.log(`[nav-timing] ${page.url()}: ${timing}`)
}

test('Home renders the real seeded due-count on first load', async ({ page }) => {
  await page.goto('/')
  const state = await readHomeState(page)
  expect(state).toBe(String(FIXTURE.dueCards))
  await captureNavTiming(page)
})

test('Study select-mode renders the real seeded due-count on first load', async ({ page }) => {
  await page.goto('/study')
  const state = await readStudySelectModeState(page)
  expect(state).toBe(String(FIXTURE.dueCards))
  await captureNavTiming(page)
})

test('Cards renders the real seeded total-card count on first load', async ({ page }) => {
  await page.goto('/cards')
  const state = await readCardsCount(page)
  expect(state).toBe(`Cards (${FIXTURE.totalCards})`)
  await captureNavTiming(page)
})

test('Habits renders the real seeded mastered-count on first load', async ({ page }) => {
  await page.goto('/habits')
  const state = await readHabitsMasteredCount(page)
  expect(state).toBe(String(FIXTURE.masteredCards))
  await captureNavTiming(page)
})
