/**
 * Measures the actual physical libSQL round-trip cost of a `/study`-equivalent
 * load (`getStudyCards()`) against the isolated, seeded E2E test DB.
 *
 * Usage:
 *   npx tsx scripts/measure-study-roundtrips.mts
 *
 * Prerequisite: the isolated e2e test DB must exist and be seeded — run
 * `npx tsx e2e/run-global-setup.ts` first if `e2e/.tmp/e2e-test.db` is
 * absent.
 *
 * Pins DATABASE_URL to the isolated E2E test DB (e2e/helpers/test-db.ts's
 * TEST_DB_URL) and STUDY_QUERY_COUNTER=1 BEFORE dynamically importing
 * lib/prisma.js / lib/study-cards.js / lib/query-counter.js — a static
 * import of any of those three would be ESM-hoisted above these
 * process.env assignments and would construct the Prisma client (and read
 * the instrumentation flag) with the wrong env, exactly the documented
 * `local-resync.mts` gotcha (CLAUDE.md § "local-resync.mts env loading").
 * `e2e/helpers/test-db.ts` itself reads no env vars at import time (pure
 * path constant), so it is safe to import statically below.
 */

import { TEST_DB_URL } from '../e2e/helpers/test-db.js'

process.env.DATABASE_URL = TEST_DB_URL
process.env.STUDY_QUERY_COUNTER = '1'

// Dynamic imports AFTER the env-first pin above — see header comment.
const { resetQueryCount, getQueryCounts } = await import('../lib/query-counter.js')
const { getStudyCards } = await import('../lib/study-cards.js')
await import('../lib/prisma.js')

resetQueryCount()
await getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null })
const { physical, prismaEvents } = getQueryCounts()

console.log(`physical round trips: ${physical}`)
console.log(`prisma query events: ${prismaEvents}`)

if (physical === 0) {
  console.error(
    'FATAL: physical round trip count is 0 — the counting Proxy is not attached (STUDY_QUERY_COUNTER instrumentation branch in lib/prisma.ts did not activate). A zero count must fail loudly, not read as a perfect score.'
  )
  process.exit(1)
}

process.exit(0)
