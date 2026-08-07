/**
 * E2E coverage for PERCEPT-03 / D-04: the lesson-filter re-fetch on /study
 * must show a content-shaped skeleton (two count-slot bars + a
 * button-shaped placeholder) rather than a bare spinner, and the transition
 * from skeleton to real content must not shift layout — the wrapping
 * `flex flex-col items-center gap-6 py-6` container is byte-identical
 * between the two states (components/StudyClient.tsx).
 *
 * The seeded fixture (e2e/fixture.ts) has exactly 2 lessons, so the filter
 * trigger button (`lessons.length >= 2`) is always present against the
 * baseline seed — no extra seeding needed.
 *
 * The real /api/cards/due re-fetch is artificially delayed via page.route
 * (matching e2e/active-flow.spec.ts's page.route convention) so the loading
 * state is reliably observable rather than racing a fast local response.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'

test.beforeAll(async () => {
  await resetToBaseline()
})

test('lesson-filter apply shows a content-shaped skeleton with no layout shift into the real content', async ({ page }) => {
  await page.goto('/study')

  // Filter trigger renders the current range label (2 seeded lessons -> visible).
  const filterTrigger = page.getByRole('button', { name: /Lessons \d|All lessons/ })
  await expect(filterTrigger).toBeVisible()

  // Delay the filter re-fetch so the skeleton is reliably observable.
  await page.route('**/api/cards/due*', async (route) => {
    await new Promise((r) => setTimeout(r, 600))
    await route.continue()
  })

  await filterTrigger.click()
  // Narrow the range: change "To lesson" to lesson 1 (from defaults to 1 already).
  await page.getByLabel('To lesson').selectOption('1')
  await page.getByRole('button', { name: 'Apply' }).click()

  const skeleton = page.getByTestId('filter-loading-skeleton')
  await expect(skeleton).toBeVisible()
  const skeletonBox = await skeleton.boundingBox()
  expect(skeletonBox).not.toBeNull()

  // Wait for the skeleton to disappear (real content or empty-state took over).
  await expect(skeleton).toHaveCount(0, { timeout: 5000 })

  // If due cards remain in the narrowed range, the real content container
  // must occupy the exact same wrapper box (x/width) as the skeleton did —
  // the "nothing shifts" contract (PERCEPT-03 adjacency).
  const dueCount = page.getByTestId('due-count')
  if (await dueCount.count() > 0) {
    // due-count's wrapper: <div class="flex flex-col items-center gap-6 py-6">
    //   <div class="h-16 ..."><p data-testid="due-count">...
    const realWrapper = dueCount.locator('../..')
    const realBox = await realWrapper.boundingBox()
    expect(realBox).not.toBeNull()
    expect(realBox!.x).toBeCloseTo(skeletonBox!.x, 0)
    expect(realBox!.width).toBeCloseTo(skeletonBox!.width, 0)
  }
})
