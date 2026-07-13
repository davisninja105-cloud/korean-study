/**
 * FRESH-02 gate cells — 26-VERIFICATION.md's `behavior_unverified_items`/
 * `human_verification` blocks routed FRESH-02's clobber-prevention guarantee
 * to a human because no automated e2e cell drove a mid-session or open-sheet
 * boundary event. These two cells close that gap: they encode the
 * discard-when-gated contract shipped in Plan 26-03 (StudyClient's
 * `phase === 'select-mode' && !isFilterLoading && isFullSpan(...)` gate;
 * CardsClient's `editingId === null && !showAdd && !adding &&
 * deletingIds.size === 0` gate) and MUST pass against that code as-is — they
 * do not depend on Plan 26-05's delivery backstop and must stay green after
 * it lands too.
 *
 * Same discipline as the sibling freshness specs: plain expect()/
 * expect.poll() calls only, never expected-failure/skip annotations,
 * `test.beforeEach(resetToBaseline)`.
 *
 * Both cells create the `waitForRscFetch` promise BEFORE firing the
 * boundary trigger (simulateResume true → 150ms → simulateResume false),
 * then await it before asserting non-clobber. The 800ms settle after that
 * (wider than the sibling specs' 300ms) deliberately gives Plan 26-05's JSON
 * backstop response time to land post-merge, so the negative assertions hold
 * in both pre- and post-26-05 worlds — delivery provably occurred (rscFetch
 * resolved) and was provably discarded (gate closed).
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { waitForRscFetch } from './helpers/rsc'
import { simulateResume } from './helpers/resume'
import { flipOneReviewDueState, createMutationCard } from './helpers/mutate'
import { readCardsCount } from './helpers/readers'
import { FIXTURE } from './fixture'

test.beforeEach(async () => {
  await resetToBaseline()
})

test('/study mid-session boundary refresh never clobbers the active session (FRESH-02)', async ({ page }) => {
  await page.goto('/study')
  await page.waitForLoadState('networkidle')

  // Select-mode shows the due count (FIXTURE.dueCards = 3).
  await expect(page.locator('p.text-5xl.font-bold.animate-reveal')).toHaveText(String(FIXTURE.dueCards))

  // Start a real session: open the mode Sheet, pick Flashcards.
  await page.getByRole('button', { name: 'Start studying →' }).click()
  await page.getByRole('button', { name: /Flashcards/ }).click()

  // Wait for the flashcard face to render.
  await expect(page.getByRole('button', { name: 'Show Answer' })).toBeVisible()

  // Capture session-progress label and card-face text before any boundary event.
  const progressLocator = page.getByText(/^Card \d+ of \d+$/)
  const progressBefore = (await progressLocator.textContent()) ?? ''
  const cardFaceLocator = page.locator('.card-flip-front')
  const cardFaceBefore = (await cardFaceLocator.textContent()) ?? ''

  // Reveal — flips `revealed` client state. Any remount/reset/clobber flips
  // the card back to its front face, making this the sharpest observable.
  await page.getByRole('button', { name: 'Show Answer' }).click()
  await expect(page.getByRole('button', { name: /^Again/ })).toBeVisible()

  // Mutate the DB mid-session: the due pool a wrongly-adopted payload would
  // carry now differs from the in-session queue.
  await flipOneReviewDueState()

  // Promise created BEFORE the trigger per waitForRscFetch's contract.
  const rscFetch = waitForRscFetch(page, '/study')
  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await rscFetch
  // Wider settle than the sibling specs (300ms) — gives Plan 26-05's JSON
  // backstop time to land post-merge so this cell stays green both before
  // and after that plan ships.
  await page.waitForTimeout(800)

  // Non-clobber assertions, all AFTER the settle.
  // (a) revealed state survived — no remount/reset.
  await expect(page.getByRole('button', { name: /^Again/ })).toBeVisible()
  // (b) same card, no reorder/jump.
  await expect(cardFaceLocator).toHaveText(cardFaceBefore)
  // (c) progress label unchanged.
  await expect(progressLocator).toHaveText(progressBefore)
  // (d) select-mode screen did not return.
  await expect(page.getByRole('button', { name: 'Start studying →' })).toHaveCount(0)
  await expect(page.locator('p.text-5xl.font-bold.animate-reveal')).toHaveCount(0)
})

test('/cards open-sheet boundary refresh never clobbers in-flight edits (FRESH-02)', async ({ page }) => {
  await page.goto('/cards')
  await page.waitForLoadState('networkidle')

  await expect.poll(() => readCardsCount(page)).toBe(`Cards (${FIXTURE.totalCards})`)

  // Open the edit sheet on the first card. dispatchEvent (not .click()) is
  // deliberate: the Edit button is nested inside SwipeRow's pointer-capture
  // wrapper, which retargets the click event delivered by a real down/up
  // gesture sequence to the wrapper div, not the button (a pre-existing
  // SwipeRow issue, logged in deferred-items.md — out of this plan's scope).
  // dispatchEvent fires the click directly, matching the actual user-visible
  // effect (the sheet opens) without depending on that unrelated bug.
  await page.getByRole('button', { name: 'Edit' }).first().dispatchEvent('click')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Type an in-progress edit: append a distinctive Hangul marker to the
  // card-front input inside the dialog.
  const frontInput = dialog.getByPlaceholder('Front (Korean)')
  const currentFront = await frontInput.inputValue()
  const editedFront = `${currentFront}수정됨`
  await frontInput.fill(editedFront)
  await expect(frontInput).toHaveValue(editedFront)

  // Mutate server-side while the sheet is open: live DB truth is now
  // Cards (FIXTURE.totalCards + 1).
  await createMutationCard()

  // Boundary trigger with delivery evidence — promise created BEFORE the
  // trigger per waitForRscFetch's contract.
  const rscFetch = waitForRscFetch(page, '/cards')
  await simulateResume(page, true)
  await page.waitForTimeout(150)
  await simulateResume(page, false)
  await rscFetch
  // Same both-worlds settle rationale as the /study cell above.
  await page.waitForTimeout(800)

  // Assert while the sheet is still open: the gated client did not adopt
  // the (provably delivered) post-mutation payload.
  await expect(dialog).toBeVisible()
  await expect(frontInput).toHaveValue(editedFront)
  await expect.poll(() => readCardsCount(page)).toBe(`Cards (${FIXTURE.totalCards})`)

  // Save and close: the PUT round-trip completes before onSave closes it.
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  // Post-close, after a further short settle: the edited front (with the
  // marker) is visible in the card list — the optimistic local merge
  // survived — and the count remains at the fixture value. This is the
  // sharpest assertion in this cell: CardsClient's documented contract is
  // that a payload arriving while a sheet is open is consumed but never
  // deferred-adopted, so the count must remain at the fixture value until
  // the NEXT boundary event, which this test deliberately never fires.
  await page.waitForTimeout(300)
  await expect(page.getByText(editedFront).first()).toBeVisible()
  await expect.poll(() => readCardsCount(page)).toBe(`Cards (${FIXTURE.totalCards})`)
})
