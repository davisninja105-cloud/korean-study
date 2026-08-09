/**
 * DB mutators + live expected-value queries used by all three freshness
 * spec files (D-08). Ported from scripts/diagnose-freshness.mts:588-696,
 * adapted from the diagnosis script's module-scope prisma/lesson/
 * seededCardIds variables to explicit await getTestPrisma() calls and live
 * row queries, per this plan's Task 1 action.
 *
 * SUBPROCESS-DELEGATION PATTERN (same class of fix as e2e/seed.ts's
 * resetToBaseline(), documented there and in 25-02-SUMMARY.md "Deviations"):
 * calling `getTestPrisma()` (which dynamically imports `../lib/prisma`, which
 * transitively imports the ESM-only, `import.meta`-using Prisma-generated
 * `app/generated/prisma/client.ts`) directly from inside a Playwright
 * test/worker process throws `SyntaxError: Cannot use 'import.meta' outside
 * a module` — Node's native ESM-to-CJS translator bridge that a Playwright
 * worker's dynamic import() is routed through cannot load an
 * import.meta-using module as CJS. This has now been independently confirmed
 * twice in this codebase (Plan 01's `globalSetup` finding, Plan 02's
 * `resetToBaseline()` finding) — both times the fix was spawning a `tsx`-run
 * subprocess to perform the actual Prisma work, since `tsx` resolves this
 * correctly. Every freshness spec test in Task 2 calls these mutator/query
 * functions directly from its test body (not from a `tsx`-invoked context),
 * so the same fix is applied here proactively rather than re-discovering the
 * identical failure a third time.
 *
 * The functions below are split into two layers:
 *  - `*Direct` — the actual Prisma logic, calling `getTestPrisma()` from
 *    '../seed' (Plan 01's lazy singleton; never a second, ad-hoc, directly
 *    instantiated Prisma client). Only safe to call from a `tsx`-run
 *    process — the sole caller is e2e/run-mutate.ts.
 *  - the 7 plan-mandated public functions (`flipOneReviewDueState`,
 *    `createMutationCard`, `promoteOneReviewToMastered`,
 *    `ensureAllSeededReviewsDue`, `expectedDueState`, `expectedCardsCount`,
 *    `expectedMasteredCount`) — the contract every freshness spec imports.
 *    Each spawns the `tsx` subprocess (e2e/run-mutate.ts) synchronously
 *    (matching resetToBaseline()'s execFileSync shape) and, for the 3 query
 *    functions, parses the live value back out of the subprocess's stdout.
 *
 * No withDbRetry wrapper (per Task 1 action): Phase 24's `withDbRetry`
 * contention pattern was specific to one long-lived script client racing the
 * server across a ~20 minute sustained run (24-DIAGNOSIS.md). This harness's
 * per-cell mutations are single short writes against workers:1 — each running
 * in its own short-lived subprocess — so a bare await is sufficient.
 */

import { getTestPrisma } from '../seed'
import { TEST_DB_URL } from './test-db'
import { normalizeFront } from '../../lib/card-key'
import { FIXTURE } from '../fixture'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const RESULT_PREFIX = 'MUTATE_RESULT:'

// ── *Direct implementations (only safe under tsx — see e2e/run-mutate.ts) ──

/**
 * Phase 33 (VERS-01/02, plan 33-02 Task 1): bumps the `dataVersion` Setting
 * row the same way a real `POST /api/review` or `POST /api/sync` write
 * would, so the three freshness mutators below correctly open the freshness
 * backstop's version gate even though they bypass those routes entirely.
 * The import is dynamic and INSIDE the function body, never a static
 * top-of-file import — a static import would pull the ESM-only generated
 * Prisma client into module evaluation for every Playwright worker that
 * imports this file's public wrappers (the exact hazard this file's header
 * comment documents), mirroring `createForwardReferenceAndRelinkDirect`'s
 * precedent for `relinkAllDependencies()` above.
 */
async function bumpDataVersionDirect(): Promise<void> {
  const { bumpDataVersion } = await import('../../lib/settings')
  await bumpDataVersion()
}

export async function expectedDueStateDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const n = await prisma.cardReview.count({ where: { nextReview: { lte: new Date() } } })
  return n > 0 ? String(n) : 'zero-due-state'
}

export async function expectedCardsCountDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const n = await prisma.card.count()
  return `Cards (${n})`
}

export async function expectedMasteredCountDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const n = await prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } })
  return String(n)
}

// These three mutators bypass `POST /api/sync` and `POST /api/review` on
// purpose (they write directly through Prisma to simulate "the server
// changed" without exercising the real write routes), so each must
// reproduce the production dataVersion bump side-effect those routes have —
// the same reasoning createForwardReferenceAndRelinkDirect above already
// records for relinkAllDependencies(). Every branch (including each
// function's `else` fallback) bumps, so a fixture state that takes the
// fallback still opens the gate.
export async function flipOneReviewDueStateDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const now = new Date()
  const anyDue = await prisma.cardReview.findFirst({
    where: { nextReview: { lte: now } },
    orderBy: { nextReview: 'asc' },
  })
  if (anyDue) {
    await prisma.cardReview.update({
      where: { id: anyDue.id },
      data: { nextReview: new Date(Date.now() + 365 * 86_400_000) },
    })
    await bumpDataVersionDirect()
  } else {
    const any = await prisma.cardReview.findFirst({ orderBy: { nextReview: 'asc' } })
    if (any) {
      await prisma.cardReview.update({ where: { id: any.id }, data: { nextReview: new Date(Date.now() - 60_000) } })
    }
    await bumpDataVersionDirect()
  }
}

let cardMutationCounter = 0

export async function createMutationCardDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  cardMutationCounter += 1
  const front = `추가단어${cardMutationCounter}`
  const firstLesson = await prisma.lesson.findFirst()
  await prisma.card.create({
    data: {
      type: 'vocabulary',
      front,
      back: `added word ${cardMutationCounter}`,
      normalizedFront: normalizeFront(front),
      lessonId: firstLesson?.id,
      sentences: {
        create: [
          {
            korean: `이것은 ${front}입니다.`,
            targetForm: front,
            translation: `This is added word ${cardMutationCounter}.`,
            orderIndex: 0,
          },
        ],
      },
    },
  })
  await bumpDataVersionDirect()
}

export async function promoteOneReviewToMasteredDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const candidate = await prisma.cardReview.findFirst({
    where: { NOT: { state: 2, scheduledDays: { gte: 21 } } },
  })
  if (candidate) {
    await prisma.cardReview.update({ where: { id: candidate.id }, data: { state: 2, scheduledDays: 30 } })
    await bumpDataVersionDirect()
  } else {
    const any = await prisma.cardReview.findFirst()
    if (any) {
      await prisma.cardReview.update({ where: { id: any.id }, data: { scheduledDays: 5 } })
    }
    await bumpDataVersionDirect()
  }
}

/**
 * Phase 28-02 (Pitfall N-1 / Open Q1): the seeded due `CardReview` rows are
 * all `state: 1`, so a naive Active-mode e2e spec would only ever see the
 * ACTIVE-05 passive-degrade face — the production face would be
 * unreachable, and the spec would pass vacuously. This promotes ONE
 * currently-due review (state <= 1) to `state: 2`, leaving `nextReview`
 * UNTOUCHED so the card stays due — unlike `promoteOneReviewToMasteredDirect`
 * above, which deliberately pins `scheduledDays` so the card is never due
 * again. Does not touch `FIXTURE.dueCards`/`FIXTURE.masteredCards` — smoke
 * and freshness specs derive their expectations from those counts, and this
 * mutation changes neither the due-count nor the mastered-count query
 * results (mastered requires `scheduledDays >= 21`, which this never sets).
 *
 * Phase 33-02 scoping decision: deliberately NOT bumped by
 * bumpDataVersionDirect(). This is an active-flow fixture shaper, never used
 * as a freshness spec's "the server changed since the client rendered"
 * step, so it has no reason to open the version gate.
 */
export async function promoteOneDueCardToProductionDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const candidate = await prisma.cardReview.findFirst({
    where: { nextReview: { lte: new Date() }, state: { lte: 1 } },
  })
  if (candidate) {
    await prisma.cardReview.update({ where: { id: candidate.id }, data: { state: 2 } })
  }
}

// Since this module has no seededCardIds array in scope (unlike the
// throwaway script), this updates ALL CardReview rows unconditionally —
// safe here because resetToBaseline() (called in every spec's beforeEach)
// guarantees only the fixture's own rows exist in the isolated DB at this
// point, so "all rows" and "all seeded rows" are equivalent in this harness.
//
// Phase 33-02 scoping decision: deliberately NOT bumped by
// bumpDataVersionDirect(). ensureAllSeededReviewsDue() runs BEFORE the page
// is even loaded in gradeAllDueCardsToCompletion() (freshness-fresh-paths.spec.ts),
// so it is never a freshness spec's "the server changed since the client
// rendered" step.
export async function ensureAllSeededReviewsDueDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  await prisma.cardReview.updateMany({
    data: { nextReview: new Date(Date.now() - 60_000) },
  })
}

/**
 * E2E-05 DB backstop (27-01-PLAN.md Task 2, Part A). Proves the background,
 * fire-and-forget `POST /api/review` saves actually persisted — optimistic
 * grading renders the completion screen regardless of whether the save
 * landed, so UI state alone cannot prove this (27-RESEARCH.md Pitfall 4).
 * Queries the 3 seeded due-card fronts (FIXTURE.cards.due) via the `card`
 * relation filter. Seeded CardReview rows start at reps=0/lastReview=null
 * (e2e/seed.ts:108) — a real state transition to reps>=1/lastReview!==null
 * on all 3 rows is non-inferable evidence of a successful persisted review.
 */
export async function seededDueReviewsPersistedDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const dueFronts = FIXTURE.cards.due.map((c) => c.front)
  const rows = await prisma.cardReview.findMany({
    where: { card: { front: { in: dueFronts } } },
    include: { card: { select: { front: true } } },
  })
  const unpersisted = rows.filter((r) => !(r.reps >= 1 && r.lastReview !== null))
  if (rows.length === dueFronts.length && unpersisted.length === 0) {
    return 'all-persisted'
  }
  const details = unpersisted
    .map((r) => `${r.card.front}(reps=${r.reps},lastReview=${r.lastReview === null ? 'null' : r.lastReview.toISOString()})`)
    .join(', ')
  return `pending: ${details || `expected ${dueFronts.length} rows, found ${rows.length}`}`
}

/**
 * 32-04-PLAN.md Task 3 (STUDY-03 success criterion #3 — the no-redeploy
 * freshness proof). Creates a NEW card whose `components` JSON names an
 * EXISTING seeded due card's front (`학교`, FIXTURE.cards.due[1]) as a
 * forward-reference — exactly the gap `relinkAllDependencies()` exists to
 * catch — gives the new card a due `CardReview` row so it enters the pool
 * alongside its prerequisite, then calls `relinkAllDependencies()`, which
 * both creates the `CardDependency` edge AND bumps `studyCacheVersion`
 * (the cross-process invalidation signal `e2e/study-cache-invalidation.spec.ts`
 * proves reaches the already-running server's next `/study` load).
 *
 * `relinkAllDependencies` is imported DYNAMICALLY, inside this function body,
 * NEVER as a static top-of-file import — a static import would pull in
 * `lib/prisma` (transitively, the ESM-only generated Prisma client) at
 * MODULE-EVALUATION time for every importer of this file, including the
 * Playwright worker that imports this module's public wrapper functions
 * below — hitting the exact `SyntaxError: Cannot use 'import.meta' outside a
 * module` this file's header comment documents. Deferring the import to
 * inside the function body (only ever invoked from the `tsx`-run
 * e2e/run-mutate.ts subprocess) avoids that entirely.
 */
export async function createForwardReferenceAndRelinkDirect(): Promise<void> {
  const prisma = await getTestPrisma()

  const prereqFront = '학교' // FIXTURE.cards.due[1] — already due, already in the pool
  const dependentFront = '숙제하다' // "to do homework" — plausibly built from "school"

  await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: dependentFront,
      back: 'to do homework',
      normalizedFront: normalizeFront(dependentFront),
      components: JSON.stringify([prereqFront]),
      sentences: {
        create: [
          {
            korean: '저는 매일 숙제해요',
            targetForm: '숙제해요',
            translation: 'I do homework every day',
            orderIndex: 0,
          },
        ],
      },
      review: {
        create: { state: 1, stability: 1, difficulty: 5, nextReview: new Date(Date.now() - 60_000) },
      },
    },
  })

  const { relinkAllDependencies } = await import('../../lib/relink-dependencies')
  await relinkAllDependencies()
}

/**
 * Read-only: the current `studyCacheVersion` Setting row's value, or the
 * literal string `'(unset)'` if the key has never been written. Used by the
 * D-02 regression lock in e2e/study-cache-invalidation.spec.ts to prove a
 * `POST /api/review` grade does NOT change this token.
 */
export async function readStudyCacheVersionDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const row = await prisma.setting.findUnique({ where: { key: 'studyCacheVersion' } })
  return row?.value ?? '(unset)'
}

/**
 * Phase 33 (VERS-01/02, plan 33-02 Task 1): the "a write landed somewhere
 * the client cannot see" primitive — bumps `dataVersion` without changing
 * any observable DOM value. Used by freshness-fresh-paths.spec.ts's
 * Upsert-not-replace extension, which needs the gate open at a point where
 * no other mutator call is appropriate.
 */
export async function bumpDataVersionOnlyDirect(): Promise<void> {
  await bumpDataVersionDirect()
}

/**
 * Read-only: the current `dataVersion` Setting row's value, or the literal
 * string `'(unset)'` if the key has never been written. Mirrors
 * `readStudyCacheVersionDirect` above exactly. Used by the Task 2
 * non-vacuity lock in e2e/freshness-version-gate.spec.ts to prove each
 * freshness mutator actually moves this counter.
 */
export async function readDataVersionDirect(): Promise<string> {
  const prisma = await getTestPrisma()
  const row = await prisma.setting.findUnique({ where: { key: 'dataVersion' } })
  return row?.value ?? '(unset)'
}

// ── Subprocess-delegating public API (the 7 plan-mandated exports, plus
// createForwardReferenceAndRelink/readStudyCacheVersion added Phase 32-04
// Task 3, bumpDataVersionOnly/readDataVersion added Phase 33-02 Task 1)
// ────────────────────────────────────────────────────────────────────────

function runMutateOp(op: string): string {
  const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')
  return execFileSync(tsxBin, ['--tsconfig', './tsconfig.json', 'e2e/run-mutate.ts', op], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  })
}

function parseMutateResult(output: string): string {
  const resultLine = output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(RESULT_PREFIX))
    .pop()
  if (!resultLine) {
    throw new Error(`mutate.ts: no ${RESULT_PREFIX} line found in subprocess output. Full output:\n${output}`)
  }
  return JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as string
}

export async function flipOneReviewDueState(): Promise<void> {
  runMutateOp('flipOneReviewDueState')
}

export async function createMutationCard(): Promise<void> {
  runMutateOp('createMutationCard')
}

export async function promoteOneReviewToMastered(): Promise<void> {
  runMutateOp('promoteOneReviewToMastered')
}

export async function promoteOneDueCardToProduction(): Promise<void> {
  runMutateOp('promoteOneDueCardToProduction')
}

export async function ensureAllSeededReviewsDue(): Promise<void> {
  runMutateOp('ensureAllSeededReviewsDue')
}

export async function expectedDueState(): Promise<string> {
  return parseMutateResult(runMutateOp('expectedDueState'))
}

export async function expectedCardsCount(): Promise<string> {
  return parseMutateResult(runMutateOp('expectedCardsCount'))
}

export async function expectedMasteredCount(): Promise<string> {
  return parseMutateResult(runMutateOp('expectedMasteredCount'))
}

export async function seededDueReviewsPersisted(): Promise<string> {
  return parseMutateResult(runMutateOp('seededDueReviewsPersisted'))
}

export async function createForwardReferenceAndRelink(): Promise<void> {
  runMutateOp('createForwardReferenceAndRelink')
}

export async function readStudyCacheVersion(): Promise<string> {
  return parseMutateResult(runMutateOp('readStudyCacheVersion'))
}

export async function bumpDataVersionOnly(): Promise<void> {
  runMutateOp('bumpDataVersionOnly')
}

export async function readDataVersion(): Promise<string> {
  return parseMutateResult(runMutateOp('readDataVersion'))
}
