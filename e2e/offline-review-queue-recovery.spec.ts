/**
 * Phase 35, Plan 04, Task 3 (CR-02 + CR-03, OFFLINE-03) — 35-VERIFICATION.md's
 * second gap: e2e/offline-review-queue.spec.ts proves only the untroubled
 * path (two offline grades survive a force-quit and land exactly twice) — it
 * never exercises a 409 mid-flush or an undo. This spec proves both:
 *  1. a 409 returned for a queued entry mid-flush leaves it durably queued
 *     (not dropped), and it lands on a later flush once the conflict clears;
 *  2. a review graded offline and then undone is removed from the durable
 *     queue and is never replayed by a later flush.
 *
 * Both assertions are made against the DB-level ReviewLog counter
 * (reviewLogCount(), from e2e/helpers/mutate.ts) rather than the UI — the UI
 * advances optimistically regardless of whether a background save or the
 * offline queue has actually landed anything server-side.
 *
 * INTERCEPTION CONSTRAINT: this app's service worker owns /api/* under a
 * network-only strategy, and Playwright's page.route()/context.route() does
 * not intercept requests that pass through a Service Worker (confirmed
 * against this repo's installed @playwright/test 1.61 type docs, referencing
 * microsoft/playwright#1090) — a route handler registered here would
 * silently never fire, making a 409-mocking test pass vacuously. Instead,
 * the 409 is produced by reassigning the PAGE's global `fetch` (the actual
 * function lib/offline-queue.ts's defaultPost calls) via page.evaluate. No
 * Playwright request-routing handler is registered anywhere in this file.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { reviewLogCount } from './helpers/mutate'
import { simulateResume } from './helpers/resume'
import { QUEUE_DB_NAME, QUEUE_STORE } from '../lib/offline-queue'

test.beforeEach(async () => {
  await resetToBaseline()
})

// Copied verbatim from e2e/offline-review-queue.spec.ts (this repo's
// established helper-duplication precedent across SW/offline specs).
async function warmStudyAndStartSession(page: Page): Promise<void> {
  await page.goto('/study')
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

  await page.getByTestId('start-studying-btn').click() // opens the mode Sheet
  await page.getByTestId('mode-passive').click()
  await page.getByTestId('begin-session-btn').click()
}

async function revealAndGrade(page: Page): Promise<void> {
  await page.getByTestId('reveal-btn').click()
  await expect(page.getByTestId('grade-good')).toBeVisible()
  await page.getByTestId('grade-good').click()
}

// Reads the offline queue's own IndexedDB directly — db/store names come
// from lib/offline-queue.ts's own exported constants so this never drifts
// from the production module's actual naming.
async function readQueueCount(page: Page): Promise<number> {
  return page.evaluate(
    ({ dbName, storeName }) =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open(dbName)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains(storeName)) {
            db.close()
            resolve(0)
            return
          }
          const tx = db.transaction(storeName, 'readonly')
          const countReq = tx.objectStore(storeName).count()
          countReq.onsuccess = () => {
            resolve(countReq.result)
            db.close()
          }
          countReq.onerror = () => reject(countReq.error)
        }
        req.onerror = () => reject(req.error)
      }),
    { dbName: QUEUE_DB_NAME, storeName: QUEUE_STORE },
  )
}

// Installs a fetch stub on the page's global scope that returns a 409 for
// any POST to a URL ending in '/api/review', delegating to the saved
// original for everything else. Returns nothing — call readStubHitCount to
// read back the non-vacuity counter. Must be installed AFTER the offline
// grade has already been enqueued (the mount flush has already run by
// then), and must never be crossed by a navigation/reload (which would wipe
// the stub) — flushes are driven by simulateResume only.
async function install409FetchStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __origFetch?: typeof fetch; __stubHits?: number }
    w.__origFetch = window.fetch
    w.__stubHits = 0
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (init?.method === 'POST' && url.endsWith('/api/review')) {
        w.__stubHits = (w.__stubHits ?? 0) + 1
        return new Response(JSON.stringify({ error: 'conflict' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return w.__origFetch!(input, init)
    }
  })
}

async function readStubHitCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __stubHits?: number }).__stubHits ?? 0)
}

async function restoreFetch(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __origFetch?: typeof fetch }
    if (w.__origFetch) window.fetch = w.__origFetch
  })
}

test('a 409 mid-flush leaves the review queued rather than dropped, and it lands on the next flush (OFFLINE-03, CR-02)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await warmStudyAndStartSession(page)
  const baseline = Number(await reviewLogCount())

  await context.setOffline(true)
  await revealAndGrade(page)
  await expect.poll(() => readQueueCount(page), { timeout: 15_000 }).toBe(1)

  // Nothing reached the server while offline.
  expect(Number(await reviewLogCount())).toBe(baseline)

  await install409FetchStub(page)
  await context.setOffline(false)
  await page.waitForTimeout(400) // clear useForegroundResume's coalesce window
  await simulateResume(page, false)
  await page.waitForTimeout(800) // let the flush attempt settle

  // Non-vacuity guard: the 409 stub actually fired.
  expect(await readStubHitCount(page)).toBeGreaterThan(0)

  // Kept, not dropped — and never reached the server.
  expect(await readQueueCount(page)).toBe(1)
  expect(Number(await reviewLogCount())).toBe(baseline)

  // The permanent-failure Toast must NOT appear — a 409 is not a data-loss
  // event and telling the user otherwise would be a false report.
  await expect(page.getByText(/couldn't be saved/i)).toHaveCount(0)

  // Restore the real transport and trigger another flush — the review lands
  // exactly once.
  await restoreFetch(page)
  await page.waitForTimeout(400)
  await simulateResume(page, false)
  await expect.poll(() => readQueueCount(page), { timeout: 15_000 }).toBe(0)
  expect(Number(await reviewLogCount())).toBe(baseline + 1)

  expect(pageErrors).toEqual([])
})

test('a review graded offline and then undone is never replayed by a later flush (OFFLINE-03, CR-03)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await warmStudyAndStartSession(page)
  const baseline = Number(await reviewLogCount())

  await context.setOffline(true)
  await revealAndGrade(page)
  // Prove the entry is genuinely durable BEFORE the undo — undoing before
  // enqueue would prove nothing about cancellation.
  await expect.poll(() => readQueueCount(page), { timeout: 15_000 }).toBe(1)

  // Undo while still offline — the /api/review/undo POST cannot succeed;
  // the queue cancellation is what must still happen.
  await page.getByRole('button', { name: 'Undo last rating' }).click()

  await expect.poll(() => readQueueCount(page), { timeout: 15_000 }).toBe(0)

  await context.setOffline(false)
  await page.waitForTimeout(400)
  await simulateResume(page, false)
  await page.waitForTimeout(800)

  expect(Number(await reviewLogCount())).toBe(baseline)

  // A second trigger after another wait proves no later flush resurrects it.
  await page.waitForTimeout(400)
  await simulateResume(page, false)
  await page.waitForTimeout(500)
  expect(Number(await reviewLogCount())).toBe(baseline)

  expect(await readQueueCount(page)).toBe(0)
  expect(pageErrors).toEqual([])
})
