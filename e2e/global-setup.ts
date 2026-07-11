/**
 * Playwright globalSetup (runs once, before any project runs): resets the
 * isolated E2E test DB, pushes the current schema, seeds the D-13 fixture,
 * and sanity-checks the seeded counts against e2e/fixture.ts before letting
 * any spec run. Reset/push shape ported from scripts/diagnose-freshness.mts
 * (D-08); the throwaway script itself is retired at the end of this phase.
 */

import { execSync } from 'child_process'
import { mkdirSync, rmSync } from 'fs'
import path from 'path'
import { assertLocalDb } from './helpers/build-guard'
import { TEST_DB_PATH, TEST_DB_URL } from './helpers/test-db'
import { FIXTURE } from './fixture'

// Node's stdout writes are ASYNCHRONOUS on POSIX when the destination is a
// pipe (which it always is when Playwright captures webServer.command's
// output) — a plain console.log() immediately followed by a blocking
// synchronous call (execSync below) can race the OS-level pipe write and
// silently drop the log line from the captured output, even though the
// underlying work still completes correctly. Awaiting the write's callback
// makes the ordering-check log lines this task's acceptance criteria rely
// on deterministically visible.
function logFlushed(msg: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(msg + '\n', () => resolve())
  })
}

export default async function globalSetup(): Promise<void> {
  // E2E-03 runtime re-check — same two-guard shape as playwright.config.ts:
  // fail on any ambient non-file: DATABASE_URL, then a structural self-check
  // on the constant this whole harness pins every connection to.
  if (process.env.DATABASE_URL) {
    assertLocalDb(process.env.DATABASE_URL)
  }
  assertLocalDb(TEST_DB_URL)

  await logFlushed('→ [global-setup] Resetting isolated E2E test DB…')
  mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true })
  // WR-03: remove all three files, not just the main one — a stale -wal/-shm
  // sidecar left over from a prior WAL-mode run can cause checksum-mismatch/
  // recovery errors on the "reset" DB.
  rmSync(TEST_DB_PATH, { force: true })
  rmSync(`${TEST_DB_PATH}-wal`, { force: true })
  rmSync(`${TEST_DB_PATH}-shm`, { force: true })
  await logFlushed(`  ✓ ${TEST_DB_PATH} (+ -wal/-shm) cleared or did not exist`)

  await logFlushed('→ [global-setup] Pushing schema to isolated test DB…')
  execSync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit',
  })
  await logFlushed('  ✓ Schema pushed')

  // Dynamic import AFTER the env-first pin inside getTestPrisma() — env-first
  // dynamic-import rule (24-PATTERNS.md convention): a static top-of-file
  // import would be hoisted by ESM and could read process.env too early.
  const { seedFixture, getTestPrisma } = await import('./seed')
  const prisma = await getTestPrisma()

  // DEVIATION from 25-RESEARCH.md assumption A2 (documented, deliberate):
  // A2's "skip WAL" reasoning covers only this short seed step in isolation,
  // but Plan 03's freshness specs re-create Phase 24's exact dual-process
  // contention profile (per-test resetToBaseline plus mid-test Prisma writes
  // from the worker while the server serves RSC loads, across ~21 tests) —
  // the P1008/SQLITE_BUSY cascade Phase 24 hit is a live risk, its proven
  // fix costs one line, and the WR-03 sidecar cleanup it requires is already
  // handled above.
  await logFlushed('→ [global-setup] Enabling WAL journal mode (reduces reader/writer contention)…')
  await prisma.$executeRawUnsafe('PRAGMA journal_mode=WAL;')
  await logFlushed('  ✓ WAL mode enabled')

  await logFlushed('→ [global-setup] Seeding fixture data…')
  await seedFixture()

  // Post-seed sanity assertions: query live counts and diff against
  // FIXTURE so fixture drift is impossible to miss — this is what makes
  // Plan 02's smoke assertions trustworthy.
  const now = new Date()
  const [liveDue, liveTotal, liveMastered] = await Promise.all([
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.card.count(),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])
  const mismatches: string[] = []
  if (liveDue !== FIXTURE.dueCards) mismatches.push(`dueCards: expected ${FIXTURE.dueCards}, got ${liveDue}`)
  if (liveTotal !== FIXTURE.totalCards) mismatches.push(`totalCards: expected ${FIXTURE.totalCards}, got ${liveTotal}`)
  if (liveMastered !== FIXTURE.masteredCards)
    mismatches.push(`masteredCards: expected ${FIXTURE.masteredCards}, got ${liveMastered}`)
  if (mismatches.length > 0) {
    throw new Error(`[global-setup] Post-seed sanity check FAILED:\n  ${mismatches.join('\n  ')}`)
  }

  await logFlushed(`  ✓ [global-setup] seeded ${liveTotal} cards (${liveDue} due, ${liveMastered} mastered)`)
}
