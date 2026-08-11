/**
 * Phase 35, Plan 03 (OFFLINE-03) — proves two reviews graded in airplane
 * mode survive a force-quit and land exactly twice, verified against the
 * `ReviewLog` table rather than the UI (grading is optimistic — the
 * completion/queue-advance UI advances regardless of whether the background
 * save, or the offline queue, has actually landed anything server-side).
 *
 * `warmStudyAndStartSession` mirrors `e2e/sw-shell-offline.spec.ts`'s
 * `warmAndControl` helper (install → wait for active → reload so the page is
 * worker-controlled) but starts on `/study` and drives the mode-select →
 * begin-session flow so a real flashcard queue is live before going offline.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { reviewLogCount } from './helpers/mutate'
import { simulateResume } from './helpers/resume'
import { QUEUE_DB_NAME, QUEUE_STORE } from '../lib/offline-queue'

test.beforeEach(async () => {
  await resetToBaseline()
})

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

// Reads the offline queue's own IndexedDB directly (not via the app's React
// state, which advances optimistically regardless of the queue) — the
// db/store names come from lib/offline-queue.ts's own exported constants so
// this never drifts from the production module's actual naming.
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

test('two reviews graded offline survive a page close, flush after reconnect, and land exactly twice (OFFLINE-03)', async ({
  page,
  context,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  await warmStudyAndStartSession(page)

  const baseline = Number(await reviewLogCount())

  await context.setOffline(true)
  await revealAndGrade(page)
  await revealAndGrade(page)

  // The background save's bounded retry chain (3 attempts, ~2s of backoff)
  // must exhaust before the offline branch enqueues — poll rather than
  // assert synchronously.
  await expect.poll(() => readQueueCount(page), { timeout: 15_000 }).toBe(2)

  // Nothing reached the server while offline.
  expect(Number(await reviewLogCount())).toBe(baseline)

  // Simulate a force-quit: close the page but keep the same browser context
  // (and therefore its IndexedDB) alive, exactly as an app relaunch would —
  // the origin's storage survives even though nothing is currently open.
  await page.close()

  await context.setOffline(false)

  const page2 = await context.newPage()
  const page2Errors: Error[] = []
  page2.on('pageerror', (err) => page2Errors.push(err))
  await page2.goto('/')

  await expect.poll(() => readQueueCount(page2), { timeout: 15_000 }).toBe(0)
  expect(Number(await reviewLogCount())).toBe(baseline + 2)

  // Exactly-once proof: trigger a second flush on the same (now-empty)
  // queue and confirm the count does not move again.
  await page2.waitForTimeout(400) // clear useForegroundResume's coalesce window
  await simulateResume(page2, false)
  await page2.waitForTimeout(500)
  expect(Number(await reviewLogCount())).toBe(baseline + 2)

  expect(pageErrors).toEqual([])
  expect(page2Errors).toEqual([])
})
