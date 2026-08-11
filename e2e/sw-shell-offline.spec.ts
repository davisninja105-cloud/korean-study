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

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

// Shared warm-visit-then-reload sequence: installs the service worker,
// waits for it to become active, then reloads once so the page is actually
// worker-controlled (a page open during the worker's own install is not
// controlled by it yet). Used by every test below that needs a
// worker-controlled page before going offline or reading caches.
async function warmAndControl(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    return !!registration.active
  })
  expect(swActive).toBe(true)

  await page.reload()
  await page.waitForLoadState('networkidle')

  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  expect(controlled).toBe(true)
}

test('offline cold navigation to / renders the real Home hero (OFFLINE-01)', async ({ page, context }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await warmAndControl(page)

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

test('exactly one shell cache exists and equals the shell prefix + the live buildId (OFFLINE-01)', async ({ page }) => {
  await warmAndControl(page)

  const buildId: string = await page.evaluate(async () => {
    const res = await fetch('/api/version')
    const json = await res.json()
    return json.buildId
  })

  const shellKeys: string[] = await page.evaluate(async () => {
    const keys = await caches.keys()
    return keys.filter((k) => k.startsWith('ks-shell-'))
  })

  expect(shellKeys).toEqual([`ks-shell-${buildId}`])
})

test('a static asset (self-hosted font) resolves offline, served cache-first from the precache (OFFLINE-01)', async ({
  page,
  context,
}) => {
  await warmAndControl(page)

  await context.setOffline(true)
  try {
    const result = await page.evaluate(async () => {
      const res = await fetch('/fonts/PretendardVariable.woff2')
      return { ok: res.ok, status: res.status }
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
  } finally {
    await context.setOffline(false)
  }
})

test('an offline /api/* call is not manufactured into a cached success (OFFLINE-01)', async ({ page, context }) => {
  await warmAndControl(page)

  await context.setOffline(true)
  try {
    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/version')
        return { rejected: false, ok: res.ok }
      } catch {
        return { rejected: true, ok: false }
      }
    })
    // Either the fetch rejects outright (real network error) or resolves
    // non-ok — either way it must never look like a successful response,
    // because plan 35-03's offline review queue depends on this failure
    // being visible to the page.
    expect(result.rejected || !result.ok).toBe(true)
  } finally {
    await context.setOffline(false)
  }
})
