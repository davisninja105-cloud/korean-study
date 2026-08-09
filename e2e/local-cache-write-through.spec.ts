/**
 * LOCAL-03 write-through — Phase 34 Plan 02, Task 2.
 *
 * Proves grading a card patches the cached `study` IndexedDB entry in the
 * SAME interaction as the optimistic queue advance (no page reload needed),
 * that the write-through is idempotent under a repeat grade of the same
 * requeued card, and that reopening `/study` with `/api/cards/due` blocked
 * shows the post-grade state — never the pre-grade state (the exact
 * LOCAL-03 regression 34-RESEARCH.md Pitfall 3 names by name).
 *
 * IndexedDB inspection helper mirrors e2e/local-cache-first-paint.spec.ts's
 * pattern, keyed on 'study' instead of 'habits'. Grading interactions
 * (selectors, bounded-loop rationale) mirror e2e/grade-flow.spec.ts.
 *
 * Each test gets its own isolated browser context (Playwright's default),
 * so IndexedDB starts empty every time — no cross-test cache pollution.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

interface CardReviewShape {
  nextReview?: string | null
  [key: string]: unknown
}
interface CardShape {
  id: string
  front: string
  review?: CardReviewShape | null
}
interface StudyCacheEntry {
  data: CardShape[]
  dataVersion: string
}

test.beforeEach(async () => {
  await resetToBaseline()
})

// Reads the cached `study` entry's raw CardDTO[] payload from IndexedDB —
// mirrors e2e/local-cache-first-paint.spec.ts's inspection pattern.
async function readStudyCacheEntry(page: Page): Promise<StudyCacheEntry | null> {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    const cacheDb = dbs.find((d) => d.name?.startsWith('ks-cache-'))
    if (!cacheDb || !cacheDb.name) return null
    return await new Promise<StudyCacheEntry | null>((resolve, reject) => {
      const openReq = indexedDB.open(cacheDb.name!)
      openReq.onerror = () => reject(openReq.error)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction('routes', 'readonly')
        const getReq = tx.objectStore('routes').get('study')
        getReq.onsuccess = () => resolve(getReq.result ?? null)
        getReq.onerror = () => reject(getReq.error)
      }
    })
  }) as Promise<StudyCacheEntry | null>
}

// waitForLoadState('networkidle') only guarantees network requests have
// settled — the mount effect's writeCache() call is an IndexedDB write, not
// a network request, so it can still be in flight a beat after networkidle
// resolves. Poll rather than reading once immediately after navigation.
async function waitForStudyCacheEntry(page: Page): Promise<StudyCacheEntry> {
  await expect
    .poll(async () => (await readStudyCacheEntry(page)) !== null, { timeout: 5000 })
    .toBe(true)
  return (await readStudyCacheEntry(page))!
}

async function startPassiveSession(page: Page) {
  await page.getByTestId('start-studying-btn').click()
  await page.getByTestId('mode-passive').click()
  await page.getByTestId('begin-session-btn').click()
}

test('grading a card patches the cached study entry in the SAME interaction — no reload needed (LOCAL-03)', async ({
  page,
}) => {
  await page.goto('/study')
  await page.waitForLoadState('networkidle')

  const before = await waitForStudyCacheEntry(page)
  expect(before.data.length).toBe(FIXTURE.dueCards)

  await startPassiveSession(page)
  await page.getByTestId('reveal-btn').waitFor({ state: 'visible' })
  const front = ((await page.getByTestId('card-front-word').first().textContent()) ?? '').trim()
  const targetBefore = before.data.find((c) => c.front === front)
  expect(targetBefore).toBeTruthy()

  await page.getByTestId('reveal-btn').click()
  await expect(page.getByTestId('grade-good')).toBeVisible()
  await page.getByTestId('grade-good').click()

  // No page.reload() / page.goto() anywhere above — this proves the write
  // happened inside the grade's own code path, not on a later fetch.
  await expect
    .poll(
      async () => {
        const after = await readStudyCacheEntry(page)
        const targetAfter = after?.data.find((c) => c.id === targetBefore!.id)
        // Either the card's review moved (requeued in-session) or it left
        // the cache entirely (graduated) — both are valid write-through evidence.
        return !targetAfter || targetAfter.review?.nextReview !== targetBefore!.review?.nextReview
      },
      { timeout: 5000 },
    )
    .toBe(true)
})

test('grading a requeued card a second time in the same session leaves exactly one cached row for it (LOCAL-03 idempotency)', async ({
  page,
}) => {
  await page.goto('/study')
  await page.waitForLoadState('networkidle')
  const beforeCache = await waitForStudyCacheEntry(page)
  await startPassiveSession(page)

  await page.getByTestId('reveal-btn').waitFor({ state: 'visible' })
  const firstFront = ((await page.getByTestId('card-front-word').first().textContent()) ?? '').trim()
  const targetCard = beforeCache.data.find((c) => c.front === firstFront)
  expect(targetCard).toBeTruthy()
  const targetId = targetCard!.id

  // Grade "Hard" (empirically confirmed against lib/fsrs.ts's reviewCard()
  // this session: two consecutive "Hard" grades on a brand-new due card both
  // stay under the habit-day boundary — requeue=true both times, unlike
  // "Good", whose second grade graduates the card in FSRS's fixture-seeded
  // scenario and removes it from the queue entirely) until the SAME card id
  // has been graded twice, with a hard cap so a queue-advance regression
  // fails fast instead of looping forever.
  let gradesOfTarget = 0
  const MAX_GRADES = 15
  for (let i = 0; i < MAX_GRADES && gradesOfTarget < 2; i++) {
    await page.getByTestId('reveal-btn').waitFor({ state: 'visible' })
    const front = ((await page.getByTestId('card-front-word').first().textContent()) ?? '').trim()
    await page.getByTestId('reveal-btn').click()
    await expect(page.getByTestId('grade-hard')).toBeVisible()
    await page.getByTestId('grade-hard').click()
    if (front === firstFront) gradesOfTarget++
  }
  expect(gradesOfTarget).toBe(2)

  const afterCache = await readStudyCacheEntry(page)
  const matches = afterCache!.data.filter((c) => c.id === targetId)
  expect(matches.length).toBe(1)
  // Ties "exactly one row" to an ACTUAL mutation — without this, the
  // assertion above passes vacuously pre-implementation (nothing ever
  // touches the cache, so the original single row trivially survives
  // unchanged). The row's review must reflect the SECOND grade, not the
  // original seeded value.
  expect(matches[0].review?.nextReview).not.toBe(targetCard!.review?.nextReview)
})

test('reopening /study with /api/cards/due blocked shows the post-grade state, never the pre-grade state (LOCAL-03, RESEARCH Pitfall 3)', async ({
  page,
  context,
}) => {
  await page.goto('/study')
  await page.waitForLoadState('networkidle')

  const before = await waitForStudyCacheEntry(page)
  expect(before.data.length).toBe(FIXTURE.dueCards)

  await startPassiveSession(page)
  await page.getByTestId('reveal-btn').waitFor({ state: 'visible' })
  await page.getByTestId('reveal-btn').click()
  await expect(page.getByTestId('grade-easy')).toBeVisible()
  // Easy on a brand-new due card (state 1, lastReview null) graduates in one
  // grade — nextReview lands ~1 week out, well beyond the habit-day
  // boundary — empirically confirmed against lib/fsrs.ts's reviewCard()
  // this session, so it leaves the study cache entry entirely
  // (write-through null), a deterministic due-count drop.
  await page.getByTestId('grade-easy').click()

  await expect
    .poll(
      async () => {
        const after = await readStudyCacheEntry(page)
        return after?.data.length ?? -1
      },
      { timeout: 5000 },
    )
    .toBe(FIXTURE.dueCards - 1)

  // Fresh navigation, network for /api/cards/due fully blocked — the ONLY
  // way the due count can be correct is if it painted from the cache.
  await context.route('**/api/cards/due', (route) => route.abort())
  await page.goto('/study')

  await expect(page.getByTestId('due-count')).toHaveText(String(FIXTURE.dueCards - 1))
})
