/**
 * E2E coverage for Active mode (MODE-01/MODE-02 redundant re-checks +
 * ACTIVE-01..05): toggle entry, the production front (English prompt + hint
 * flow + pinned reveal + anchor caption), the silent new-card degrade
 * (ACTIVE-05/D-03/D-10), and self-grading — all against a genuinely
 * production-eligible card obtained via a state-promotion mutate helper.
 *
 * PITFALL N-1 / OPEN Q1: the seeded due `CardReview` rows are all `state: 1`
 * (e2e/seed.ts), which the ACTIVE-05 gate silently degrades to the Passive
 * face — mastered cards are pinned 30 days out by design and are never due.
 * Without promoting one due card to `state: 2` (keeping `nextReview` in the
 * past), an Active-mode spec would never exercise production and would pass
 * vacuously. `promoteOneDueCardToProduction()` (e2e/helpers/mutate.ts) does
 * this without touching `FIXTURE.dueCards`/`FIXTURE.masteredCards`, which
 * smoke.spec.ts and the freshness specs derive their expectations from.
 *
 * ORDERING SAFEGUARD (matches smoke.spec.ts:9-13 / grade-flow.spec.ts): this
 * file sorts alphabetically FIRST in the e2e suite. It self-resets to the
 * seeded baseline in `beforeEach`, THEN promotes one due card to production —
 * reset before mutation, in that order — so it is safe regardless of which
 * other spec files ran first or Playwright's file-discovery order.
 *
 * BOUNDED-LOOP RATIONALE (same as grade-flow.spec.ts): a fixed grade count is
 * nondeterministic (FSRS learning-step timing crosses the habit-day boundary
 * at wall-clock-dependent points), so this spec uses a bounded
 * loop-until-complete (hard cap `MAX_GRADES`, break on the completion
 * heading) and asserts lower bounds, never exact totals.
 *
 * `beforeEach` (not `beforeAll`, CR-01/WR-03 regression test addition): the
 * first test below grades every seeded due card to completion, which would
 * leave zero due cards for a second test in this file (StudyClient only
 * fetches AI practice when `studyCards.length > 0`). Matches the
 * `beforeEach(resetToBaseline)` pattern already used by
 * e2e/freshness-gate.spec.ts, which has the same multi-test-per-file /
 * fresh-due-state need.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { seededDueReviewsPersisted, promoteOneDueCardToProduction } from './helpers/mutate'

test.beforeEach(async () => {
  await resetToBaseline()
  // Mutation AFTER reset, in that order (Pitfall N-1) — promotes exactly one
  // seeded due card (state 1 -> 2) so this session has a production-eligible
  // card; nextReview stays in the past so it remains due.
  await promoteOneDueCardToProduction()
})

test('Active mode: toggle entry, production front, hint flow, pinned reveal, silent degrade, grading', async ({ page }) => {
  await page.goto('/study')
  await page.getByTestId('start-studying-btn').click() // opens the mode Sheet

  // MODE-02 (redundant re-check, per grade-flow.spec.ts convention): Passive
  // is selected by default, before any interaction.
  await expect(page.getByTestId('mode-passive')).toHaveAttribute('aria-pressed', 'true')
  // MODE-01: the retired modes (Multiple Choice, standalone Fill-in-the-Blank)
  // are fully gone from the DOM.
  await expect(page.getByTestId('mode-multiple-choice')).toHaveCount(0)
  await expect(page.getByTestId('mode-fill-blank')).toHaveCount(0)

  await page.getByTestId('mode-active').click()
  await expect(page.getByTestId('mode-active')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('begin-session-btn').click()

  const MAX_GRADES = 25 // 3 cards x worst-case requeues, with generous headroom
  let grades = 0
  let productionSeen = 0
  let degradeSeen = 0

  while (grades < MAX_GRADES) {
    const revealOrComplete = page.getByTestId('reveal-btn').or(page.getByTestId('session-complete-heading'))
    await revealOrComplete.first().waitFor({ state: 'visible' })

    if (await page.getByTestId('session-complete-heading').isVisible()) break

    const isProduction = await page.getByTestId('active-prompt').isVisible()

    if (isProduction) {
      productionSeen++
      // ACTIVE-02: hint hidden by default, revealed only on tap.
      await expect(page.getByTestId('hint-text')).toHaveCount(0)
      await page.getByTestId('hint-toggle').click()
      await expect(page.getByTestId('hint-text')).toBeVisible()
      const hintText = (await page.getByTestId('hint-text').textContent()) ?? ''
      expect(hintText.startsWith('Hint:')).toBe(true)

      await page.getByTestId('reveal-btn').click()
      await expect(page.getByTestId('grade-good')).toBeVisible()
      // ACTIVE-04: grade-anchoring caption present on the reveal.
      await expect(page.getByTestId('active-anchor-caption')).toBeVisible()
      // Open Q2: the word/gloss block (card-front-word) survives on the
      // Active back.
      await expect(page.getByTestId('card-front-word')).toBeVisible()
      // D-02: no example cycling in Active — the reveal must stay pinned to
      // the sentence the English prompt was translated from.
      await expect(page.getByTestId('cycle-example-btn')).toHaveCount(0)
    } else {
      degradeSeen++
      // ACTIVE-05/D-03: a state <= 1 card renders the silent Passive/exposure
      // face — no production prompt, no hint control, no badge.
      await expect(page.getByTestId('active-prompt')).toHaveCount(0)
      await expect(page.getByTestId('hint-toggle')).toHaveCount(0)

      await page.getByTestId('reveal-btn').click()
      await expect(page.getByTestId('grade-good')).toBeVisible()
    }

    await page.getByTestId('grade-good').click()
    // ACTIVE-02: hint resets on advance regardless of which face was shown.
    await expect(page.getByTestId('hint-text')).toHaveCount(0)
    grades++
  }

  // Loop exit without ever seeing the completion heading (i.e. hitting
  // MAX_GRADES) fails right here — the intended queue-advance-regression
  // fail-fast.
  await expect(page.getByTestId('session-complete-heading')).toHaveText('Session complete!')

  // A vacuous pass where every card degraded (or every card was production)
  // must fail — both faces must have been genuinely exercised this session.
  expect(productionSeen).toBeGreaterThanOrEqual(1)
  expect(degradeSeen).toBeGreaterThanOrEqual(1)

  // DB backstop (27-RESEARCH.md Pitfall 4): optimistic grading renders the
  // completion screen regardless of whether the background, fire-and-forget
  // POST /api/review save landed — so UI state alone cannot prove
  // persistence.
  await expect.poll(() => seededDueReviewsPersisted(), { timeout: 15_000 }).toBe('all-persisted')
})

/**
 * CR-01/WR-03 regression test: Active mode + "Include AI-generated practice
 * questions" is a reachable combination in the shipped UI (the checkbox is
 * deliberately independent of the Passive/Active toggle, D-04) that used to
 * break the production mechanic — `deriveActiveFace` special-cased practice
 * cards to the word-production face on the assumption that `PracticeCard.back`
 * is a clean English gloss and `PracticeCard.front` is a bare Korean word,
 * neither of which holds for `lib/generate-practice.ts`'s actual output
 * (`front` is a Korean instruction, `back` is mixed Korean+English). The CR-01
 * fix routes ALL practice cards to `passive-degrade` unconditionally, so this
 * test asserts the practice card never shows the Active production front/hint
 * controls and never leaks the mixed-language answer text before reveal.
 *
 * Mocks POST /api/generate (page.route) rather than hitting the real Claude
 * API, both for determinism and to pin the exact PracticeCard shape under
 * test — `back` deliberately mirrors generate-practice.ts's documented
 * "Korean + English" shape.
 */
test('Active mode + AI practice: practice card degrades to Passive face, never leaks the answer pre-reveal (CR-01)', async ({ page }) => {
  const mockBack = '저는 학교에 걸어서 갔어요 (I walked to school)'
  await page.route('**/api/generate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        practice: [
          {
            type: 'fill-blank',
            front: '다음 문장을 완성하세요: 저는 학교에 ___ 갔어요.',
            back: mockBack,
          },
        ],
      }),
    })
  })

  await page.goto('/study')
  await page.getByTestId('start-studying-btn').click()
  await page.getByTestId('mode-active').click()
  await page.getByLabel('Include AI-generated practice questions').check()
  await page.getByTestId('begin-session-btn').click()

  const MAX_GRADES = 26 // same real-card headroom as the test above, +1 for the single mocked practice card
  let grades = 0
  let practiceCardSeen = false

  while (grades < MAX_GRADES) {
    const revealOrComplete = page.getByTestId('reveal-btn').or(page.getByTestId('session-complete-heading'))
    await revealOrComplete.first().waitFor({ state: 'visible' })

    if (await page.getByTestId('session-complete-heading').isVisible()) break

    if (await page.getByText('AI Practice').isVisible()) {
      practiceCardSeen = true
      // CR-01: no Active production front, no hint control — the practice
      // card must render via the exact same silent Passive/exposure face a
      // new real card uses.
      await expect(page.getByTestId('active-prompt')).toHaveCount(0)
      await expect(page.getByTestId('hint-toggle')).toHaveCount(0)
      // The un-revealed front must never contain the mixed Korean+English
      // answer text — this is exactly what the pre-fix word-production
      // branch would have shown as the "translate this" prompt.
      await expect(page.locator('body')).not.toContainText(mockBack)
    }

    await page.getByTestId('reveal-btn').click()
    await expect(page.getByTestId('grade-good')).toBeVisible()
    await page.getByTestId('grade-good').click()
    grades++
  }

  await expect(page.getByTestId('session-complete-heading')).toHaveText('Session complete!')

  // A vacuous pass where the mocked practice card was never reached must fail.
  expect(practiceCardSeen).toBe(true)
})
