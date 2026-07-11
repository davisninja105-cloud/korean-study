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
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const RESULT_PREFIX = 'MUTATE_RESULT:'

// ── *Direct implementations (only safe under tsx — see e2e/run-mutate.ts) ──

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
  } else {
    const any = await prisma.cardReview.findFirst({ orderBy: { nextReview: 'asc' } })
    if (any) {
      await prisma.cardReview.update({ where: { id: any.id }, data: { nextReview: new Date(Date.now() - 60_000) } })
    }
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
}

export async function promoteOneReviewToMasteredDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const candidate = await prisma.cardReview.findFirst({
    where: { NOT: { state: 2, scheduledDays: { gte: 21 } } },
  })
  if (candidate) {
    await prisma.cardReview.update({ where: { id: candidate.id }, data: { state: 2, scheduledDays: 30 } })
  } else {
    const any = await prisma.cardReview.findFirst()
    if (any) {
      await prisma.cardReview.update({ where: { id: any.id }, data: { scheduledDays: 5 } })
    }
  }
}

// Since this module has no seededCardIds array in scope (unlike the
// throwaway script), this updates ALL CardReview rows unconditionally —
// safe here because resetToBaseline() (called in every spec's beforeEach)
// guarantees only the fixture's own rows exist in the isolated DB at this
// point, so "all rows" and "all seeded rows" are equivalent in this harness.
export async function ensureAllSeededReviewsDueDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  await prisma.cardReview.updateMany({
    data: { nextReview: new Date(Date.now() - 60_000) },
  })
}

// ── Subprocess-delegating public API (the 7 plan-mandated exports) ─────────

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
