/**
 * STUDY-03 success criterion #3 — the no-redeploy freshness artifact.
 *
 * Proves that a `CardDependency` edge created by a SEPARATE process shows up
 * in the very next `/study` load of a server that is never restarted or
 * rebuilt. The out-of-band mutation runs through `e2e/run-mutate.ts` (via
 * `e2e/helpers/mutate.ts`'s `createForwardReferenceAndRelink()` wrapper — a
 * `tsx` subprocess, never an in-process Prisma call made from inside this
 * Playwright worker), because an in-process mutation would not exercise the
 * claim that actually matters here: `scripts/local-resync.mts` and
 * `scripts/relink-dependencies.mts` both run as standalone processes OUTSIDE
 * the running Next.js server, and CLAUDE.md documents `local-resync.mts` as
 * the normal path for bulk syncs. If this spec mutated the DB in-process
 * instead, it would prove nothing about that real deployment shape.
 *
 * `beforeAll(resetToBaseline)` follows the ordering-safeguard convention
 * `e2e/perf.spec.ts` documents at its own top — this file's measurements
 * must be deterministic against the seeded content regardless of which spec
 * ran before it in Playwright's file-discovery order.
 *
 * The second case locks D-02 (32-CONTEXT.md § "Known-lemmas staleness
 * scope"): a graded `POST /api/review` write must NOT bump
 * `studyCacheVersion`. A failure in that case means D-02 was reopened, not
 * that a bug appeared — see that decision's own "Warning sign" note.
 */

import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { createForwardReferenceAndRelink, readStudyCacheVersion } from './helpers/mutate'

test.beforeAll(async () => {
  await resetToBaseline()
})

test('a CardDependency edge created by a separate process shows up in the next /study load — no restart, no redeploy (STUDY-03 success criterion #3)', async ({
  page,
}) => {
  // Load /study once to warm the running server's lib/study-cache.ts
  // snapshot (populated with the fixture's original single edge).
  await page.goto('/study')

  // Out-of-band mutation via e2e/run-mutate.ts (see e2e/helpers/mutate.ts's
  // createForwardReferenceAndRelink()): a SEPARATE tsx subprocess creates a
  // new card ("숙제하다") whose components name the existing seeded due card
  // "학교" as a prerequisite, gives the new card a due CardReview row, then
  // calls relinkAllDependencies() — which both creates the CardDependency
  // edge and bumps studyCacheVersion. Nothing here touches @/lib/prisma or
  // ../lib/prisma directly from this Playwright worker.
  await createForwardReferenceAndRelink()

  // Reload /study in the SAME, still-running server — no restart, no
  // rebuild, no webServer bounce between the mutation above and this reload.
  await page.goto('/study')

  // Assert on the /api/cards/due response body (getStudyCards()'s own
  // sequenced output) rather than driving the full session UI — this suite
  // already authenticates page.evaluate(fetch(...)) via the storageState
  // cookie context (see e2e/perf.spec.ts's D-10 convention).
  const fronts: string[] = await page.evaluate(async () => {
    const res = await fetch('/api/cards/due')
    const cards = (await res.json()) as { front: string }[]
    return cards.map((c) => c.front)
  })

  const prereqIdx = fronts.indexOf('학교')
  const dependentIdx = fronts.indexOf('숙제하다')

  // Both cards must actually be present — a missing card fails loudly rather
  // than the ordering assertion below vacuously passing on -1 < -1.
  expect(prereqIdx).toBeGreaterThanOrEqual(0)
  expect(dependentIdx).toBeGreaterThanOrEqual(0)

  // Foundation-first sequencing: the prerequisite must appear before the
  // card that was just relinked to depend on it.
  expect(prereqIdx).toBeLessThan(dependentIdx)
})

test('grading a card through POST /api/review does NOT bump studyCacheVersion — D-02 locked (32-CONTEXT.md § "Known-lemmas staleness scope")', async ({
  page,
}) => {
  await page.goto('/study')

  // Read the current token via e2e/run-mutate.ts (readStudyCacheVersion()) —
  // a separate-process read, matching this spec's out-of-band-only-touches-
  // the-DB-via-subprocess convention throughout.
  const tokenBefore = await readStudyCacheVersion()

  const cardId: string = await page.evaluate(async () => {
    const res = await fetch('/api/cards/due')
    const cards = (await res.json()) as { id: string }[]
    return cards[0].id
  })

  // The existing review path — a real POST /api/review call, the same
  // endpoint components/StudySession.tsx's submitReview() fires in the
  // background on every grade.
  await page.evaluate(async (id) => {
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: id, rating: 3, idempotencyKey: `d02-lock-${id}` }),
    })
  }, cardId)

  // Reload /study — same still-running server, no restart.
  await page.goto('/study')

  const tokenAfter = await readStudyCacheVersion()

  // D-02, locked: a review write must not invalidate lib/study-cache.ts's
  // snapshot. If this assertion ever fails, that means D-02 was
  // deliberately reopened elsewhere in the codebase, not that a regression
  // was introduced here — re-read 32-CONTEXT.md's D-02 entry before "fixing"
  // this test.
  expect(tokenAfter).toBe(tokenBefore)
})
