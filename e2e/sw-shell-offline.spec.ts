/**
 * Phase 35, Plan 01, Task 1 (OFFLINE-01 tracer) — the phase-gate proof that a
 * genuine cold-navigation offline launch now works, closing the gap
 * e2e/local-cache-offline.spec.ts's own header comment names as "explicitly
 * Phase 35's scope, OFFLINE-01 precaching": prior to this worker, ANY full
 * document navigation while `context.setOffline(true)` failed hard with
 * `net::ERR_INTERNET_DISCONNECTED`, warm cache or not, because there was no
 * static HTML shell and no service worker. This spec proves a real
 * `page.goto('/')` — not an already-mounted-page check — now renders the
 * real Home hero while fully offline.
 *
 * `resetToBaseline()` is copied verbatim from e2e/seed.ts's usage throughout
 * this suite (e2e/local-cache-offline.spec.ts's own precedent).
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

test('offline cold navigation to / renders the real Home hero (OFFLINE-01)', async ({ page, context }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  // Warm visit — installs the service worker and lets it precache the shell.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    return !!registration.active
  })
  expect(swActive).toBe(true)

  // Reload once so this page is actually worker-controlled (a page that was
  // open during the worker's own install is not controlled by it yet).
  await page.reload()
  await page.waitForLoadState('networkidle')

  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  expect(controlled).toBe(true)

  await context.setOffline(true)
  try {
    // Genuine cold navigation — not an already-mounted-page re-render.
    await page.goto('/')

    const dueHero = page.locator('span.text-reward')
    await expect(dueHero).toBeVisible()
    expect((await dueHero.textContent())?.trim()).toBe(String(FIXTURE.dueCards))

    await expect(page.getByText(/application error/i)).toHaveCount(0)
  } finally {
    await context.setOffline(false)
  }

  expect(pageErrors).toEqual([])
})

test('an unauthenticated request for /sw.js returns JavaScript, not a login redirect (OFFLINE-01)', async ({ browser }) => {
  // Fresh, unauthenticated context — no storageState carried over from the
  // default 'chromium' project's auth setup.
  const anonContext = await browser.newContext()
  try {
    const response = await anonContext.request.get('/sw.js')
    expect(response.status()).toBe(200)
    const contentType = response.headers()['content-type'] ?? ''
    expect(contentType).toMatch(/javascript/)
    const body = await response.text()
    expect(body).not.toMatch(/<html/i)
  } finally {
    await anonContext.close()
  }
})
