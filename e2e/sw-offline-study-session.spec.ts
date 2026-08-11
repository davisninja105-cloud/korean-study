/**
 * Phase 35, Plan 02, Task 3 (OFFLINE-02) — the phase-gate proof that a
 * genuine cold offline launch reaches /study and grades a full session, not
 * merely that the mode-select screen paints. Distinct from
 * e2e/local-cache-offline.spec.ts, which deliberately proves only the
 * already-mounted-page case — that file's own header comment records that a
 * cold navigation offline was impossible before Phase 35's service worker
 * landed (35-01). This spec proves the case that file could not: a cold
 * `page.goto('/study')` with the browser context fully offline, after only
 * ever visiting Home online (proving the Home-mount warm from this plan's
 * Task 2, not an incidental /study visit).
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

// Warm-visit-then-reload sequence (mirrors e2e/sw-shell-offline.spec.ts's
// warmAndControl): installs the service worker, waits for it to become
// active, then reloads once so the page is genuinely worker-controlled — a
// page open during the worker's own install is not controlled by it yet.
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

// Polls from within the page until BOTH (a) the /study document has been
// warmed into the build-id-namespaced shell cache (`ks-shell-<buildId>`,
// warmed automatically at service-worker install time — 35-01-PLAN.md Task
// 2 — regardless of whether /study was ever actually visited) and (b) the
// 'study' route key exists in the build-id-namespaced IndexedDB route cache
// (`ks-cache-<buildId>`, written by HomeClient's mount-time warm — this
// plan's Task 2). The IndexedDB read deliberately checks
// `indexedDB.databases()` before opening the database, and opens with NO
// explicit version when it does exist: opening with an explicit version
// (e.g. 1) before the app's own lib/local-cache.ts `getDb()` has ever run
// would create an empty database at that version, permanently starving the
// app's own upgrade callback (which only fires on a version bump) of the
// chance to ever create the 'routes' object store.
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

test('cold offline launch reaches /study and grades a full session (OFFLINE-02)', async ({ page, context }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (err) => pageErrors.push(err))

  // Online only at Home — never at /study, so this proves the warm rather
  // than an incidental visit.
  await warmAndControl(page)
  await waitForStudyWarm(page)

  await context.setOffline(true)
  try {
    // Genuine cold navigation — not an already-mounted-page re-render.
    const response = await page.goto('/study')
    expect(response?.ok()).toBe(true)
    await expect(page.getByText(/application error/i)).toHaveCount(0)

    const dueCount = page.getByTestId('due-count')
    await expect(dueCount).toBeVisible()
    expect((await dueCount.textContent())?.trim()).toBe(String(FIXTURE.dueCards))

    // Start a flashcard session — Passive mode, deliberate pick (matches
    // e2e/grade-flow.spec.ts's precedent; never rely on the default).
    await page.getByTestId('start-studying-btn').click()
    await page.getByTestId('mode-passive').click()
    await page.getByTestId('begin-session-btn').click()

    const frontsSeen: string[] = []
    // FIXTURE.dueCards (3) is small enough to grade all the way through to
    // completion within this spec's timeout (grade-flow.spec.ts precedent:
    // a "Good" grade can requeue a card within the same session near the
    // habit-day boundary, so this is a generous bounded loop, not a fixed
    // count).
    const MAX_GRADES = 25
    let grades = 0

    while (grades < MAX_GRADES) {
      // Wait for whichever of reveal-btn OR session-complete-heading becomes
      // visible first, so this never races the post-grade card remount or
      // the completion-screen mount.
      const revealOrComplete = page.getByTestId('reveal-btn').or(page.getByTestId('session-complete-heading'))
      await revealOrComplete.first().waitFor({ state: 'visible' })

      if (await page.getByTestId('session-complete-heading').isVisible()) break

      await page.getByTestId('reveal-btn').click()
      // Reveal → grade-bar transition asserted as a real positive state
      // transition, not the absence of something.
      await expect(page.getByTestId('grade-good')).toBeVisible()

      const front = (await page.getByTestId('card-front-word').first().textContent())?.trim() ?? ''
      if (front) frontsSeen.push(front)

      await page.getByTestId('grade-good').click()
      grades++
    }

    // Loop exit without ever seeing the completion heading (i.e. hitting
    // MAX_GRADES) fails right here.
    await expect(page.getByTestId('session-complete-heading')).toHaveText('Session complete!')
    expect(grades).toBeGreaterThanOrEqual(FIXTURE.dueCards)

    // A real proof the queue genuinely advances — not just that a screen
    // painted: grading the first card produces a genuinely different second
    // card front.
    expect(frontsSeen.length).toBeGreaterThanOrEqual(2)
    expect(frontsSeen[1]).not.toBe(frontsSeen[0])

    // Every seeded due-card front was actually shown during the session.
    for (const c of FIXTURE.cards.due) expect(frontsSeen).toContain(c.front)

    await expect(page.getByText(/application error/i)).toHaveCount(0)
  } finally {
    await context.setOffline(false)
  }

  expect(pageErrors).toEqual([])
})
