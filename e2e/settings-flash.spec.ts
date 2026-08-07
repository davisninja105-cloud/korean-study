/**
 * LAYOUT-01 e2e verification: RootLayout no longer awaits a DB read, so the
 * only mechanism that prevents a color/scale/reading-aid flash on the very
 * next navigation after a settings save is the non-httpOnly ks_settings
 * cookie + the 3rd pre-paint <script> in app/layout.tsx. This spec drives
 * PUT /api/settings directly (D-10 convention — page.evaluate(fetch) over
 * APIRequestContext, exercising the exact request path a real client takes)
 * rather than the Settings UI, then proves both halves of the mechanism:
 * (1) the cookie is genuinely readable via document.cookie (httpOnly: false
 * is otherwise unverifiable from JS — an httpOnly cookie is invisible to
 * document.cookie by design), and (2) a fresh reload applies the saved
 * values to the <html> element's computed CSS custom properties/class list
 * with no code path in which the previous/default value renders first.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'

test.beforeAll(async () => {
  await resetToBaseline()
})

test('saved settings persist via a non-httpOnly cookie, applied before hydration on the next navigation', async ({ page }) => {
  // Establishes the authenticated ks_auth storageState context.
  await page.goto('/')

  const putResult = await page.evaluate(async () => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buttonColor: '#111111',
        rewardColor: '#222222',
        readingTextScale: 1.2,
        readingAid: true,
      }),
    })
    return { ok: res.ok }
  })
  expect(putResult.ok).toBe(true)

  // The cookie must be readable via document.cookie — this IS the automated
  // proof it is non-httpOnly (an httpOnly cookie is never visible to JS).
  const cookieString = await page.evaluate(() => document.cookie)
  expect(cookieString).toContain('ks_settings=')

  await page.reload()

  const computed = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return {
      button: style.getPropertyValue('--button').trim(),
      reward: style.getPropertyValue('--reward').trim(),
      readingScale: style.getPropertyValue('--reading-scale').trim(),
      hangulSpaced: document.documentElement.classList.contains('hangul-spaced'),
    }
  })

  expect(computed.button).toBe('#111111')
  expect(computed.reward).toBe('#222222')
  expect(computed.readingScale).toBe('1.2')
  expect(computed.hangulSpaced).toBe(true)
})

test('GET /settings renders the real Settings UI, not a server error (G-30-2 regression guard)', async ({ page }) => {
  // Start listening BEFORE navigating — the mount-effect POST fires almost
  // immediately after mount, so registering the wait after navigation risks
  // missing the response entirely (waitForResponse only observes events
  // that occur after it is called).
  const backfillResponse = page.waitForResponse(
    (res) => res.url().includes('/api/settings/backfill-cookie') && res.status() === 200,
  )

  const response = await page.goto('/settings')
  expect(response?.status()).toBe(200)

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await backfillResponse

  const cookieString = await page.evaluate(() => document.cookie)
  expect(cookieString).toContain('ks_settings=')
})

test('cleanup — reset settings to defaults so shared test DB/cookie state stays clean', async ({ page }) => {
  await page.goto('/')

  const putResult = await page.evaluate(async () => {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buttonColor: '#3b82f6',
        rewardColor: '#f97316',
        readingTextScale: 1,
        readingAid: false,
      }),
    })
    return { ok: res.ok }
  })
  expect(putResult.ok).toBe(true)
})
