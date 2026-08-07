/**
 * IN-03/CR-01 regression test (31-REVIEW.md): clearing the Cards search box
 * must restore `groupCounts` to their pre-search (deck-wide) values.
 *
 * Pre-fix bug: `runQuery()`'s grouped-mode branch skips its refetch whenever
 * `{filter, lessonFrom, lessonTo}` are unchanged since the last grouped
 * fetch — which is exactly true across a search-then-clear sequence, since
 * search never touches those three params. The search branch DOES overwrite
 * `groupCounts` with search-scoped values, but nothing ever forced a
 * refetch on the search->non-search transition, so the tab label
 * ("Cards (N)") and every group header's count stayed stuck at the
 * search-narrowed numbers after clearing the box — until the filter or
 * lesson range changed, or the page was fully reloaded.
 *
 * Fixture basis (e2e/seed.ts D-13 baseline): 8 vocabulary cards total (3
 * due, 3 mastered, 2 new), all type `vocabulary`, so the sole visible group
 * header is "Vocabulary" with count 8. The search term '학교' matches
 * exactly 2 of those 8 cards (card '학교' via front match, plus card '가다'
 * via its example sentence '저는 학교에 가요' containing '학교') — a genuine
 * proper subset, so the mid-search assertion below isn't vacuous.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { readCardsCount, waitVisible, dumpUnrecognizedState } from './helpers/readers'

test.beforeEach(async () => {
  await resetToBaseline()
})

test('clearing the Cards search box restores groupCounts to pre-search values (CR-01)', async ({ page }) => {
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  const searchInput = page.getByPlaceholder('Search cards or sentences…')
  const vocabHeaderBtn = page.getByRole('button', { name: /Vocabulary/ })

  await expect(vocabHeaderBtn).toBeVisible()

  // ── Pre-search baseline ────────────────────────────────────────────────
  const preSearchTabLabel = await readCardsCount(page)
  expect(preSearchTabLabel).toBe('Cards (8)')
  const preSearchHeaderText = ((await vocabHeaderBtn.textContent()) ?? '').trim()
  expect(preSearchHeaderText).toContain('8 card')

  // ── Type a search term that narrows the result set to a proper subset ──
  await searchInput.fill('학교')
  // Debounce is 300ms (lib/useDebouncedValue.ts) + fetch settle margin.
  await page.waitForTimeout(600)
  await page.waitForLoadState('networkidle')

  const midSearchTabLabel = await readCardsCount(page)
  // Genuinely narrowed (not a vacuous pass) — proves the search branch's
  // search-scoped groupCounts overwrite actually took effect.
  expect(midSearchTabLabel).not.toBe(preSearchTabLabel)
  expect(midSearchTabLabel).toBe('Cards (2)')

  // ── Clear the search box ────────────────────────────────────────────────
  await searchInput.fill('')
  await page.waitForTimeout(600)
  await page.waitForLoadState('networkidle')

  const postClearTabLabel = await readCardsCount(page)
  expect(postClearTabLabel).toBe(preSearchTabLabel)

  if (!(await waitVisible(vocabHeaderBtn))) {
    await dumpUnrecognizedState(page, 'cards-search-clear:post-clear-header')
  }
  const postClearHeaderText = ((await vocabHeaderBtn.textContent()) ?? '').trim()
  expect(postClearHeaderText).toBe(preSearchHeaderText)
})
