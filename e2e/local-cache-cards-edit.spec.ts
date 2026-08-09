/**
 * Phase 34 Plan 03 (LOCAL-03, T-34-10) — write-through proof for `/cards`: an
 * edit, a delete, and (transitively, via the shared helper) an add must each
 * patch the cached `cards` IndexedDB entry in the SAME interaction as the
 * optimistic state update, not merely the component's in-memory state.
 * `PUT /api/cards/[id]` does NOT call `bumpDataVersion()` (34-RESEARCH.md
 * Pitfall 3), so write-through is not an optimisation here — it is the only
 * mechanism that keeps a reopened `/cards` honest after an edit.
 *
 * `resetToBaseline()` and the IndexedDB `page.evaluate` inspection helper are
 * copied verbatim from `e2e/local-cache-first-paint.spec.ts`'s
 * header-documented pattern. Editor interaction (dialog selectors, the
 * SwipeRow pointer-capture click workaround) is reused from
 * `e2e/cards-edit-regression.spec.ts`.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { waitVisible, dumpUnrecognizedState } from './helpers/readers'
import { FIXTURE } from './fixture'

test.use({ viewport: { width: 390, height: 2400 } })

test.beforeEach(async () => {
  await resetToBaseline()
})

interface CachedCard {
  id: string
  front: string
  back: string
}

interface CardsCacheEntry {
  data: {
    groups: Record<string, { loaded: CachedCard[] }>
  }
}

// Verbatim pattern from e2e/local-cache-first-paint.spec.ts's first test —
// opens the ks-cache-<buildId> database found via indexedDB.databases() and
// reads the 'cards' route entry.
async function readCardsCacheEntry(page: Page): Promise<CardsCacheEntry | null> {
  return page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    const cacheDb = dbs.find((d) => d.name?.startsWith('ks-cache-'))
    if (!cacheDb || !cacheDb.name) return null
    return await new Promise<unknown>((resolve, reject) => {
      const openReq = indexedDB.open(cacheDb.name!)
      openReq.onerror = () => reject(openReq.error)
      openReq.onsuccess = () => {
        const db = openReq.result
        const tx = db.transaction('routes', 'readonly')
        const getReq = tx.objectStore('routes').get('cards')
        getReq.onsuccess = () => resolve(getReq.result ?? null)
        getReq.onerror = () => reject(getReq.error)
      }
    })
  }) as Promise<CardsCacheEntry | null>
}

function findCachedCardByFront(entry: CardsCacheEntry | null, front: string): CachedCard | undefined {
  if (!entry) return undefined
  for (const key of Object.keys(entry.data.groups)) {
    const found = entry.data.groups[key].loaded.find((c) => c.front === front)
    if (found) return found
  }
  return undefined
}

function cachedCardIdPresent(entry: CardsCacheEntry | null, id: string): boolean {
  if (!entry) return false
  return Object.keys(entry.data.groups).some((key) => entry.data.groups[key].loaded.some((c) => c.id === id))
}

// Row container scoped to the '학교' fixture card specifically — see
// e2e/cards-edit-regression.spec.ts's header comment for why an exact-text
// match on '학교' cannot collide with '가다''s longer sentence text.
const schoolRow = (page: Page) =>
  page.locator('div.bg-surface-1.rounded-xl.shadow-sm.p-4', {
    has: page.getByText('학교', { exact: true }),
  })

test('editing a card through the real editor sheet patches the cached cards entry in the same interaction, and reopening /cards with GET /api/cards blocked never shows the pre-edit value (LOCAL-03)', async ({
  page,
  context,
}) => {
  // ── Warm the cache with a first /cards visit ──────────────────────────────
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  const cardsToggle = page.getByRole('button', { name: `Cards (${FIXTURE.totalCards})` })
  if (!(await waitVisible(cardsToggle))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:cards-toggle')
  }
  await expect(cardsToggle).toBeVisible()
  if (!(await waitVisible(schoolRow(page)))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:pre-edit-school-row')
  }
  await expect(schoolRow(page)).toBeVisible()

  const preEntry = await readCardsCacheEntry(page)
  const preCached = findCachedCardByFront(preEntry, '학교')
  expect(preCached).toBeDefined()
  expect(preCached?.back).toBe('school')

  // ── Edit the card's back through the REAL editor sheet ────────────────────
  const editButton = schoolRow(page).getByRole('button', { name: 'Edit' })
  if (!(await waitVisible(editButton))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:edit-button')
  }
  // SwipeRow captures the pointer on pointerdown (its own swipe-to-delete
  // gesture), which retargets synthetic mouse-compatibility events away from
  // a nested button's onClick — el.click() sidesteps pointer-capture
  // retargeting, the standard workaround already used by
  // cards-edit-regression.spec.ts for this exact component.
  await editButton.evaluate((el: HTMLElement) => el.click())

  const dialog = page.getByRole('dialog')
  if (!(await waitVisible(dialog))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:dialog')
  }
  await expect(dialog).toBeVisible()

  const backInput = dialog.getByPlaceholder('Back (English)')
  await expect(backInput).toHaveValue('school')
  await backInput.fill('school (updated)')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // ── Test 1: the cached entry holds the NEW value WITHOUT reloading ────────
  const postSaveEntry = await readCardsCacheEntry(page)
  const postSaveCached = findCachedCardByFront(postSaveEntry, '학교')
  expect(postSaveCached).toBeDefined()
  expect(postSaveCached?.back).toBe('school (updated)')
  expect(postSaveCached?.id).toBe(preCached?.id)

  // Applying the SAME edit payload a second time (idempotency edge, LOCAL-03)
  // must still leave exactly one row for this id in the cached entry — no
  // duplicate accumulation across repeated saves.
  await editButton.evaluate((el: HTMLElement) => el.click())
  await expect(dialog).toBeVisible()
  await expect(dialog.getByPlaceholder('Back (English)')).toHaveValue('school (updated)')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const postResaveEntry = await readCardsCacheEntry(page)
  const matchesForId = Object.values(postResaveEntry?.data.groups ?? {}).flatMap((g) =>
    g.loaded.filter((c) => c.id === preCached?.id)
  )
  expect(matchesForId).toHaveLength(1)
  expect(matchesForId[0]?.back).toBe('school (updated)')

  // ── Test 2: reopen /cards with GET /api/cards blocked — the edited row
  //    must render the new value, never the pre-edit one ────────────────────
  await context.route('**/api/cards?*', (route) => route.abort())
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  if (!(await waitVisible(schoolRow(page)))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:post-reload-school-row')
  }
  // The back field renders as its own <p class="text-muted"> (no notes on
  // this fixture card, so this is the only match) — an exact-text check is
  // what actually distinguishes "school (updated)" from the pre-edit
  // "school", which a substring/contains check on the whole row would not
  // (the row also renders "1 sentence"/"Vocabulary" text unrelated to back).
  const backText = schoolRow(page).locator('p.text-muted')
  await expect(backText).toHaveCount(1)
  await expect(backText).toHaveText('school (updated)')
})

test('deleting a card removes its id from every cached group (LOCAL-03)', async ({ page }) => {
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  const cardsToggle = page.getByRole('button', { name: `Cards (${FIXTURE.totalCards})` })
  if (!(await waitVisible(cardsToggle))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:delete-cards-toggle')
  }
  await expect(cardsToggle).toBeVisible()
  if (!(await waitVisible(schoolRow(page)))) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:delete-pre-row')
  }

  const preEntry = await readCardsCacheEntry(page)
  const preCached = findCachedCardByFront(preEntry, '학교')
  expect(preCached).toBeDefined()
  const id = preCached!.id

  page.once('dialog', (dialog) => dialog.accept())
  // The Delete button lives INSIDE SwipeRow's root wrapper as a SIBLING of
  // the sliding content layer (components/SwipeRow.tsx) — not a descendant
  // of schoolRow's own content div — and is `aria-hidden` until the row is
  // swiped open, so getByRole would both miss the wrong subtree AND be
  // excluded from the accessibility tree. Scope to the SwipeRow root
  // instead, locate the button via a plain (non-role) selector, and invoke
  // its onClick directly — same el.click() workaround already used for the
  // Edit button above, here also bypassing the visual swipe gesture the
  // component would otherwise require.
  const swipeRowRoot = page.locator('div.relative.overflow-hidden.rounded-xl', {
    has: page.getByText('학교', { exact: true }),
  })
  const deleteButton = swipeRowRoot.locator('button', { hasText: 'Delete' })
  if ((await deleteButton.count()) === 0) {
    await dumpUnrecognizedState(page, 'local-cache-cards-edit:delete-button')
  }
  await deleteButton.evaluate((el: HTMLElement) => el.click())

  await expect(schoolRow(page)).toHaveCount(0)

  const postEntry = await readCardsCacheEntry(page)
  expect(cachedCardIdPresent(postEntry, id)).toBe(false)
})
