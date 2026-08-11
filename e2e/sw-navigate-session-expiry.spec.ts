/**
 * Phase 35, Plan 04, Task 1 (CR-01) — 35-VERIFICATION.md's first gap: no
 * existing spec simulates a live, online navigation whose session has
 * expired mid-flight while the service worker's runtime `navigate` branch is
 * active. `warmNavigationRoute` (install-time warm) already compared the
 * final response URL's pathname to the requested route; the runtime navigate
 * branch did not — it cached any `response.ok` document under the requested
 * pathname regardless of where the response actually landed. An expired
 * `ks_auth` cookie makes middleware.ts redirect a `/study` navigation to
 * `/login` (itself 200 OK), so the runtime branch would silently poison the
 * `/study` cache entry with the login page. This spec proves that can no
 * longer happen, and that a subsequent genuinely-offline navigation to
 * `/study` still serves the real app document.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

// Copied verbatim from e2e/sw-shell-offline.spec.ts's warmAndControl — this
// repo already duplicates this helper across SW specs (precedent followed
// rather than introducing a shared module).
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

// Copied verbatim (adapted only in name-scope) from
// e2e/sw-offline-study-session.spec.ts's waitForStudyWarm — polls until
// /study is warm in BOTH the shell cache and the IndexedDB routes store.
async function waitForStudyWarm(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const versionRes = await fetch('/api/version')
          const { buildId } = (await versionRes.json()) as { buildId: string }

          const shellCache = await caches.open(`ks-shell-${buildId}`)
          const shellMatch = await shellCache.match('/study')

          const dbName = `ks-cache-${buildId}`
          const databases = await indexedDB.databases()
          const dbExists = databases.some((d) => d.name === dbName)
          if (!dbExists) return { shell: !!shellMatch, idb: false }

          const idbMatch = await new Promise<boolean>((resolve) => {
            const req = indexedDB.open(dbName)
            req.onsuccess = () => {
              const db = req.result
              if (!db.objectStoreNames.contains('routes')) {
                db.close()
                resolve(false)
                return
              }
              const tx = db.transaction('routes', 'readonly')
              const getReq = tx.objectStore('routes').get('study')
              getReq.onsuccess = () => {
                db.close()
                resolve(getReq.result !== undefined)
              }
              getReq.onerror = () => {
                db.close()
                resolve(false)
              }
            }
            req.onerror = () => resolve(false)
          })

          return { shell: !!shellMatch, idb: idbMatch }
        }),
      {
        timeout: 20_000,
        message: 'waiting for /study to be warmed into both the shell cache and the IndexedDB route cache',
      },
    )
    .toEqual({ shell: true, idb: true })
}

test('a live expired-session navigation cannot poison the /study cache entry (OFFLINE-01, CR-01)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await warmAndControl(page)
  await waitForStudyWarm(page)

  const buildId: string = await page.evaluate(async () => {
    const res = await fetch('/api/version')
    const json = await res.json()
    return json.buildId
  })

  const saved = await context.cookies()
  await context.clearCookies()

  try {
    // A real document navigation while ONLINE — middleware redirects to
    // /login because the session cookie is gone.
    await page.goto('/study')
    expect(page.url()).toContain('/login')
    await expect(page.locator('input[type="password"]')).toBeVisible()
  } finally {
    await context.addCookies(saved)
  }

  // Read the cached document back directly — must still be the real app,
  // not the login page the redirect just rendered.
  const cachedBody: string = await page.evaluate(async (id) => {
    const cache = await caches.open(`ks-shell-${id}`)
    const match = await cache.match('/study')
    return match ? await match.text() : ''
  }, buildId)

  expect(cachedBody).toContain('start-studying-btn')
  expect(cachedBody).not.toMatch(/type="password"/)

  // Confirm the cache truly served the real app, not just that the login
  // page never overwrote it — go genuinely offline and cold-navigate.
  await context.setOffline(true)
  try {
    const response = await page.goto('/study')
    expect(response?.ok()).toBe(true)

    const dueCount = page.getByTestId('due-count')
    await expect(dueCount).toBeVisible()
    expect((await dueCount.textContent())?.trim()).toBe(String(FIXTURE.dueCards))
    await expect(page.getByTestId('start-studying-btn')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
  } finally {
    await context.setOffline(false)
  }

  expect(pageErrors).toEqual([])
})
