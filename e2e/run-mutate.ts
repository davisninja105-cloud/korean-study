/**
 * CLI wrapper for e2e/helpers/mutate.ts's *Direct DB operations. Same
 * tsx-subprocess-delegation pattern as e2e/run-reset-baseline.ts /
 * e2e/run-global-setup.ts — a freshness spec calling a mutate.ts function
 * directly in-process (from inside a Playwright worker) would hit the same
 * `SyntaxError: Cannot use 'import.meta' outside a module` documented in
 * e2e/seed.ts's resetToBaseline() and 25-02-SUMMARY.md's "Deviations"
 * section. This wrapper runs the actual Prisma work under `tsx`, which
 * resolves it correctly.
 *
 * Invoked as: tsx --tsconfig ./tsconfig.json e2e/run-mutate.ts <opName>
 *
 * Void mutators run and exit 0 with no stdout. Query ops print their result
 * to stdout as the LAST line, prefixed `MUTATE_RESULT:<json-string>`, so the
 * parent process (e2e/helpers/mutate.ts) can extract it even if other
 * informational output (e.g. Prisma driver logging) precedes it.
 */

import {
  flipOneReviewDueStateDirect,
  createMutationCardDirect,
  promoteOneReviewToMasteredDirect,
  ensureAllSeededReviewsDueDirect,
  expectedDueStateDirect,
  expectedCardsCountDirect,
  expectedMasteredCountDirect,
  seededDueReviewsPersistedDirect,
} from './helpers/mutate'

const RESULT_PREFIX = 'MUTATE_RESULT:'

const OPS: Record<string, () => Promise<string | void>> = {
  flipOneReviewDueState: flipOneReviewDueStateDirect,
  createMutationCard: createMutationCardDirect,
  promoteOneReviewToMastered: promoteOneReviewToMasteredDirect,
  ensureAllSeededReviewsDue: ensureAllSeededReviewsDueDirect,
  expectedDueState: expectedDueStateDirect,
  expectedCardsCount: expectedCardsCountDirect,
  expectedMasteredCount: expectedMasteredCountDirect,
  seededDueReviewsPersisted: seededDueReviewsPersistedDirect,
}

async function main(): Promise<void> {
  const op = process.argv[2]
  const fn = op ? OPS[op] : undefined
  if (!fn) {
    throw new Error(`Unknown mutate op: "${op}". Valid ops: ${Object.keys(OPS).join(', ')}`)
  }
  const result = await fn()
  if (result !== undefined) {
    console.log(`${RESULT_PREFIX}${JSON.stringify(result)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
