/**
 * G-31-2 regression spec (31-05-PLAN.md, D-08 / debug/sticky-headers-scroll-away-mobile.md):
 *
 * On a short mobile-width viewport, the Cards/Reading Practice segmented
 * toggle in components/CardsClient.tsx has no sticky positioning at all — it
 * scrolls out of the viewport along with the (now virtualized, auto-loading)
 * card list, leaving no way to switch views without first scrolling back to
 * the top. A secondary, related defect: CardsClient's own sticky search bar
 * and Nav.tsx's persistent top `<header>` are both independently `sticky
 * top-0`, so once both are pinned they visually collide instead of stacking.
 *
 * This suite has no dedicated mobile-device Playwright project (see
 * playwright.config.ts) — a narrow, short Chromium viewport is the
 * established stand-in per this suite's conventions.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { waitVisible, dumpUnrecognizedState } from './helpers/readers'

test.use({ viewport: { width: 390, height: 500 } })

test.beforeEach(async () => {
  await resetToBaseline()
})

test('Reading practice toggle stays reachable and functional after scrolling on a short mobile viewport (G-31-2)', async ({
  page,
}) => {
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  const toggle = page.getByRole('button', { name: 'Reading practice' })

  if (!(await waitVisible(toggle))) {
    await dumpUnrecognizedState(page, 'cards-sticky-header:pre-scroll-toggle')
  }
  await expect(toggle).toBeVisible()

  // Scroll far enough down within the (window-scrolled, virtualized)
  // Vocabulary group to move a non-sticky element well outside the 500px
  // viewport.
  await page.mouse.wheel(0, 400)
  await page.waitForTimeout(300)

  // Primary regression check: the toggle must still be visible/in-viewport
  // after scrolling — this is what D-08 reports as broken.
  if (!(await waitVisible(toggle))) {
    await dumpUnrecognizedState(page, 'cards-sticky-header:post-scroll-toggle')
  }
  await expect(toggle).toBeInViewport()

  // The toggle must also be reachable AND functional at the scrolled
  // position, not merely present in the DOM.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  // Secondary check: no vertical overlap between Nav's persistent header
  // and CardsClient's sticky bar once both are pinned after scrolling.
  const navHeader = page.locator('header').first()
  // Anchor on the element containing the search input — a stable,
  // semantic anchor per this suite's selector-stability convention,
  // preferred over a fragile class-chain selector on the sticky wrapper.
  const stickyBar = page
    .locator('div')
    .filter({ has: page.getByPlaceholder('Search cards or sentences…') })
    .first()

  if (!(await waitVisible(navHeader)) || !(await waitVisible(stickyBar))) {
    await dumpUnrecognizedState(page, 'cards-sticky-header:overlap-check')
  }

  const navBox = await navHeader.boundingBox()
  const stickyBox = await stickyBar.boundingBox()
  expect(navBox).not.toBeNull()
  expect(stickyBox).not.toBeNull()
  if (navBox && stickyBox) {
    expect(stickyBox.y).toBeGreaterThanOrEqual(navBox.y + navBox.height)
  }
})
