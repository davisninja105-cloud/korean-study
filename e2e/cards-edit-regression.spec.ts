/**
 * CR-01/CR-02/CR-03 combined regression spec (31-VERIFICATION.md gap.missing,
 * mandatory per 31-07-PLAN.md Task 1). A single CardEditor save — changing an
 * existing card's type AND its sentences (one edited, one added) — must
 * correctly update three independent, previously-broken surfaces in the same
 * pass:
 *
 *  - CR-01: an already-loaded Reading Practice row's sentence text updates
 *    with no page reload (PUT /api/cards/[id] regenerated every Sentence.id
 *    on every save, so the id-based patch in CardsClient's handleSave always
 *    missed).
 *  - CR-02: the card relocates out of its old type-group bucket into the new
 *    one, and both group headers' counts update (handleSave never called
 *    bumpGroupCount or moved the card between GROUP_KEYS buckets).
 *  - CR-03: the "N sentences" badge recomputes from the freshly-saved
 *    sentences array (handleSave's merge() carried forward the stale
 *    pre-edit sentenceCount).
 *
 * This spec was run against the pre-fix code and confirmed to fail (RED
 * baseline captured in 31-07-SUMMARY.md) before any fix landed — mandatory
 * per the gap's explicit text, since the prior fix for this exact code path
 * (WR-03, commit 2ffeedb) was marked done on unit+lint+build alone with no
 * behavioral test and shipped broken anyway.
 *
 * Mirrors e2e/cards-tab-switch-scroll.spec.ts's house conventions: narrow
 * (390px) mobile-width viewport via test.use, resetToBaseline() in
 * beforeEach, waitVisible/dumpUnrecognizedState before any locator assertion
 * that could be missing. DEVIATION from that spec's exact 390x500: this spec
 * uses a much taller viewport (390x2400) so every one of the fixture's 8
 * cards / 6 sentences renders inside the single flat <Virtuoso> instance's
 * initial visible range with no scrolling required. A 500px-tall viewport
 * cannot reach the '학교' fixture row at all here — Nav's `sticky top-0`
 * header (68px) plus CardsClient's own `sticky` search/toggle bar (~133px)
 * together occupy ~201px of any 500px viewport, and since both lists sort
 * newest-first, '학교' (created 2nd of 8) sits near the BOTTOM of the list;
 * at maximum scroll on a 500px viewport its row is pinned directly beneath
 * those sticky elements with no further scroll headroom to clear them —
 * genuinely occluded, not just slow to reach. This is a pre-existing,
 * out-of-scope layout interaction (unrelated to CR-01/02/03), so the fix
 * here is a taller test viewport, not a product change.
 *
 * Fixture basis (e2e/seed.ts D-13 baseline): the due card '학교' (front
 * '학교', back 'school', type vocabulary, one sentence: korean
 * '저는 매일 학교에 가요', targetForm '학교', translation
 * 'I go to school every day') is the only fixture card whose front/example-
 * sentence pair contains '학교' uniquely identifiable via an exact-text
 * locator on the card's `front` — the mastered card '가다' also has '학교'
 * inside its OWN example sentence text ('저는 학교에 가요'), but that sentence
 * text is never an exact match for the bare string '학교', so
 * `page.getByText('학교', { exact: true })` unambiguously resolves to the
 * '학교' card's front only.
 */

import { test, expect, type Page } from '@playwright/test'
import { resetToBaseline } from './seed'
import { waitVisible, dumpUnrecognizedState } from './helpers/readers'
import { FIXTURE } from './fixture'

test.use({ viewport: { width: 390, height: 2400 } })

test.beforeEach(async () => {
  await resetToBaseline()
})

// Defensive fallback only — with the 390x2400 viewport above, every fixture
// row should already be in the initial Virtuoso-rendered range with no
// scroll required. Kept as a no-op-when-already-visible safety net: checks
// visibility WITHOUT scrolling first (so an already-restored scroll position
// from D-08's Virtuoso snapshot restore across a tab switch is never
// disturbed), and requires the target's top to clear every currently
// `.sticky`-classed element's bottom edge (Nav's `sticky top-0` header plus
// CardsClient's own sticky search/toggle bar both paint above scrolled-under
// content) — a merely "visible" bounding box is not sufficient proof of
// clickability on a shorter viewport.
async function stickyBottom(page: Page): Promise<number> {
  return page.evaluate(() => {
    let maxBottom = 0
    document.querySelectorAll('.sticky').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.bottom > maxBottom) maxBottom = r.bottom
    })
    return maxBottom
  })
}

async function ensureVisible(
  page: Page,
  locatorFn: () => ReturnType<Page['locator']>,
  maxAttempts = 60
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const loc = locatorFn()
    if (await waitVisible(loc, 200)) {
      const box = await loc.first().boundingBox()
      if (box && box.y > (await stickyBottom(page)) + 8) return
    }
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(120)
  }
}

test('editing a card\'s type and sentences updates the Reading Practice row, the group bucket/counts, and the sentence-count badge in one save (CR-01/02/03)', async ({
  page,
}) => {
  // Row container scoped to the '학교' card specifically — the card's
  // `front` text is rendered as its own element (`<p className="font-bold
  // text-foreground hangul">{card.front}</p>`), so an exact-text match on
  // '학교' cannot collide with '가다''s longer sentence text containing the
  // same substring.
  const schoolRow = () =>
    page.locator('div.bg-surface-1.rounded-xl.shadow-sm.p-4', {
      has: page.getByText('학교', { exact: true }),
    })

  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  // ── Step 1: initial state — 8 cards, all Vocabulary, no Grammar group yet ──
  const cardsToggle = page.getByRole('button', { name: `Cards (${FIXTURE.totalCards})` })
  const vocabHeader = page.getByRole('button', { name: /Vocabulary/ })
  const grammarHeader = page.getByRole('button', { name: /Grammar/ })

  if (!(await waitVisible(cardsToggle))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:cards-toggle')
  }
  await expect(cardsToggle).toBeVisible()

  if (!(await waitVisible(vocabHeader))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:vocab-header')
  }
  await expect(vocabHeader).toContainText('8 card')
  await expect(grammarHeader).toHaveCount(0)

  // ── Step 2: pre-edit sentence-count badge reads "1 sentence" ──────────────
  await ensureVisible(page, schoolRow)
  if (!(await waitVisible(schoolRow()))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:pre-edit-school-row')
  }
  await expect(schoolRow()).toContainText('1 sentence')

  // ── Step 3: capture the PRE-edit Reading Practice row (already-loaded,
  //    exactly the CR-01 scenario) ───────────────────────────────────────────
  const readingToggle = page.getByRole('button', { name: 'Reading practice' })
  if (!(await waitVisible(readingToggle))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:reading-toggle')
  }
  await readingToggle.click()
  await page.waitForLoadState('networkidle')

  const readingRow = () => page.locator('div.cursor-pointer', { hasText: '학교 — school' })
  await ensureVisible(page, readingRow)
  if (!(await waitVisible(readingRow()))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:pre-edit-reading-row')
  }
  await expect(readingRow()).toContainText('저는 매일 학교에 가요')

  // ── Step 4: switch back to Cards ──────────────────────────────────────────
  await cardsToggle.click()
  await expect(cardsToggle).toHaveAttribute('aria-pressed', 'true')

  // ── Step 5: open the Edit sheet for the '학교' card, wait for the real
  //    (GET-resolved) sentence data to load ─────────────────────────────────
  const editButton = () => schoolRow().getByRole('button', { name: 'Edit' })
  await ensureVisible(page, editButton)
  if (!(await waitVisible(editButton()))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:edit-button')
  }
  // SwipeRow (components/SwipeRow.tsx) captures the pointer on every
  // pointerdown inside the row (`e.currentTarget.setPointerCapture(...)`,
  // needed for its own swipe-to-delete gesture) — per the Pointer Events
  // spec, an active pointer capture also retargets the MOUSE COMPATIBILITY
  // events (mousedown/mouseup/click) associated with that pointer to the
  // capturing element, so a real synthetic mouse click dispatched by
  // Playwright's `.click()` on a button nested inside a SwipeRow never
  // reaches that button's own onClick. `el.click()` (the DOM's native
  // method, called via `.evaluate`) sidesteps pointer-capture retargeting
  // entirely — it's the standard workaround for this exact class of
  // pointer-capture UI component, not a product code change.
  await editButton().evaluate((el: HTMLElement) => el.click())

  const dialog = page.getByRole('dialog')
  if (!(await waitVisible(dialog))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:dialog')
  }
  await expect(dialog).toBeVisible()

  const koreanInputs = dialog.getByPlaceholder('Korean sentence (e.g. 저는 학교에 가요)')
  await expect(koreanInputs.first()).toHaveValue('저는 매일 학교에 가요')

  // ── Step 6: change type to grammar, edit the first sentence, add a second ──
  await dialog.locator('select').selectOption('grammar')
  await koreanInputs.first().fill('저는 오늘도 학교에 가요')

  await dialog.getByRole('button', { name: '+ Add sentence' }).click()
  const koreanInputsAfterAdd = dialog.getByPlaceholder('Korean sentence (e.g. 저는 학교에 가요)')
  await koreanInputsAfterAdd.nth(1).fill('학교가 정말 크네요')
  const translationInputs = dialog.getByPlaceholder('English translation')
  await translationInputs.nth(1).fill('The school is really big')

  await dialog.getByRole('button', { name: 'Save' }).click()
  // Sheet.tsx returns null when closed — this is a real "save completed"
  // signal, not a cosmetic hide.
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // ── Step 7: CR-01 assertions — Reading Practice row's sentence text
  //    updates on a second visit (no refetch per D-08, this is the in-memory
  //    patch) ──────────────────────────────────────────────────────────────
  await readingToggle.click()
  await ensureVisible(page, readingRow)
  if (!(await waitVisible(readingRow()))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:post-edit-reading-row')
  }
  await expect(readingRow()).toContainText('저는 오늘도 학교에 가요')
  await expect(readingRow()).not.toContainText('저는 매일 학교에 가요')

  // ── Step 8: CR-02 assertions — group relocation + count bookkeeping ───────
  await cardsToggle.click()
  await expect(cardsToggle).toHaveAttribute('aria-pressed', 'true')

  if (!(await waitVisible(vocabHeader))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:post-edit-vocab-header')
  }
  await expect(vocabHeader).toContainText('7 card')

  if (!(await waitVisible(grammarHeader))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:post-edit-grammar-header')
  }
  await expect(grammarHeader).toContainText('1 card')

  // ── Step 9: CR-03 assertion — sentence-count badge recomputed ─────────────
  // Grammar starts collapsed (D-02); its `loaded` array is already populated
  // by the CR-02 fix's optimistic insert, so expanding it fires no new fetch.
  await grammarHeader.click()

  await ensureVisible(page, schoolRow)
  if (!(await waitVisible(schoolRow()))) {
    await dumpUnrecognizedState(page, 'cards-edit-regression:post-edit-school-row')
  }
  await expect(schoolRow().getByText('grammar', { exact: true })).toBeVisible()
  await expect(schoolRow()).toContainText('2 sentences')
})
