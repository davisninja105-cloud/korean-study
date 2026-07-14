/**
 * E2E-05: full flashcard study session — reveal → grade → queue advance →
 * session completion — driven exclusively through data-testid locators
 * (Task 1 of this plan) against the seeded D-13 baseline.
 *
 * BOUNDED-LOOP RATIONALE (27-RESEARCH.md Pitfall 1): a fixed-count script
 * ("grade exactly 3 times then assert complete") is nondeterministic and
 * WILL fail. The 3 seeded due `CardReview` rows have `lastReview: null`
 * (e2e/seed.ts:108), so `reviewCard()` (lib/fsrs.ts) treats the first grade
 * of each card as brand-new via `createEmptyCard()`. With installed ts-fsrs
 * 5.3.1 defaults (`enable_short_term: true`, `learning_steps: ['1m','10m']`),
 * a "Good" grade yields a 10-minute interval — under the habit-day boundary
 * (`nextHabitDayStart`, 2am) at almost every wall-clock hour, so the card is
 * requeued to the end of the in-session queue (`StudySession.tsx` REQUEUE_GAP)
 * rather than completing. Typical run: A B C A B C = ~6 grades for 3 cards.
 * Within ~10 minutes of 2am local time the Good interval can cross the
 * habit-day boundary and skip the requeue, so the exact grade count is
 * wall-clock-dependent — this spec therefore uses a bounded
 * loop-until-complete (hard cap `MAX_GRADES`, break on the completion
 * heading) and asserts `grades >= FIXTURE.dueCards`, never an exact total.
 *
 * ORDERING SAFEGUARD (matches smoke.spec.ts:9-13): this spec mutates FSRS
 * state in the shared, isolated test DB, so it self-resets to the D-13
 * baseline in `beforeAll` regardless of which other spec files ran first or
 * Playwright's alphabetical file-discovery order.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { seededDueReviewsPersisted } from './helpers/mutate'
import { FIXTURE } from './fixture'

test.beforeAll(async () => {
  await resetToBaseline()
})

test('full flashcard session: reveal → grade → queue advance → completion', async ({ page }) => {
  await page.goto('/study')
  await page.getByTestId('start-studying-btn').click() // opens the mode Sheet

  // MODE-02: Passive is selected by default, before any interaction.
  await expect(page.getByTestId('mode-passive')).toHaveAttribute('aria-pressed', 'true')

  // MODE-01: the retired modes (Multiple Choice, standalone Fill-in-the-Blank)
  // are fully gone from the DOM — a stronger assertion than a source grep.
  await expect(page.getByTestId('mode-multiple-choice')).toHaveCount(0)
  await expect(page.getByTestId('mode-fill-blank')).toHaveCount(0)

  // Deliberate mode pick per CONTEXT integration note — do not rely on the
  // default for session entry.
  await page.getByTestId('mode-passive').click()
  await page.getByTestId('begin-session-btn').click()

  const frontsSeen = new Set<string>()
  const MAX_GRADES = 25 // 3 cards × worst-case requeues, with generous headroom
  let grades = 0

  while (grades < MAX_GRADES) {
    // Wait for whichever of reveal-btn OR session-complete-heading becomes
    // visible first — locator.or() composition so this never races the
    // post-grade card remount or the completion-screen mount.
    const revealOrComplete = page.getByTestId('reveal-btn').or(page.getByTestId('session-complete-heading'))
    await revealOrComplete.first().waitFor({ state: 'visible' })

    if (await page.getByTestId('session-complete-heading').isVisible()) break

    await page.getByTestId('reveal-btn').click()
    // Reveal → grade-bar transition asserted as a REAL positive state
    // transition, not the absence of something.
    await expect(page.getByTestId('grade-good')).toBeVisible()

    // Content-anchored queue-advance evidence: the back-face card-front word
    // always renders card.front, regardless of whether the front face shows
    // a bare word or a sentence.
    const front = (await page.getByTestId('card-front-word').first().textContent()) ?? ''
    if (front.trim()) frontsSeen.add(front.trim())

    await page.getByTestId('grade-good').click()
    grades++
  }

  // Loop exit without ever seeing the completion heading (i.e. hitting
  // MAX_GRADES) fails right here — the intended queue-advance-regression
  // fail-fast.
  await expect(page.getByTestId('session-complete-heading')).toHaveText('Session complete!')
  await expect(page.getByTestId('study-more-btn')).toBeVisible()

  // Grade count is a lower bound, never an exact total (requeue count is
  // time-dependent near the 2am habit-day boundary).
  expect(grades).toBeGreaterThanOrEqual(FIXTURE.dueCards)

  // Every seeded due-card front was actually shown during the session.
  for (const c of FIXTURE.cards.due) expect(frontsSeen).toContain(c.front)

  // DB backstop (27-RESEARCH.md Pitfall 4): optimistic grading renders the
  // completion screen regardless of whether the background, fire-and-forget
  // POST /api/review save landed — so UI state alone cannot prove
  // persistence. Poll (never a synchronous post-completion query) since the
  // background saves use bounded retry with backoff and may still be
  // in-flight when the completion screen first appears.
  await expect.poll(() => seededDueReviewsPersisted(), { timeout: 15_000 }).toBe('all-persisted')
})
