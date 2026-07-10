---
phase: 23-reliability-bug-fixes
plan: 01
subsystem: api
tags: [logging, observability, promise-allsettled, vitest, prisma]

# Dependency graph
requires:
  - phase: 10
    provides: getStudyCards server-only pipeline with Promise.allSettled concurrent pool + known-lemmas fetch
provides:
  - "[study-cards]-prefixed console.error making known-lemmas query rejection observable in server logs (RELIABILITY-01)"
  - "tests/study-cards.test.ts regression suite locking the degradation contract (3 tests)"
affects: [reliability, study-session, observability]

# Tech tracking
tech-stack:
  added: []
  patterns: ["[prefix]-prefixed console.error for silent-degradation observability — additive logging only, no new throw/retry/fallback"]

key-files:
  created:
    - tests/study-cards.test.ts
  modified:
    - lib/study-cards.ts

key-decisions:
  - "Log placement: immediately after the pool-rejection throw and before the empty-pool early return, so the log fires even when the pool is empty (visibility-before-degradation requirement)"
  - "Additive logging only — no new throw, retry, or fallback; the knownLemmas empty-Set ternary stays byte-for-byte untouched (RELIABILITY-01 scope is observability, not behavior change)"
  - "Mock prisma singleton via vi.mock('@/lib/prisma') — neutralizes the real module body so no DATABASE_URL is needed; explicit sessionSize avoids getSessionSize()"
  - "Logs ONLY the fixed [study-cards] prefix message and knownRowsResult.reason — never card fronts, lesson-range params, or env values (threat T-23-01 mitigation)"

patterns-established:
  - "Degradation-observability pattern: when a non-critical concurrent query rejects, emit a prefixed console.error before the existing fallback so silent degradation becomes findable in logs"

requirements-completed: [RELIABILITY-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Known-lemmas query failure logs a [study-cards]-prefixed console.error with the rejection reason before degrading to the empty Set"
    requirement: RELIABILITY-01
    verification:
      - kind: unit
        ref: "tests/study-cards.test.ts#logs a [study-cards]-prefixed reason and still returns cards when the known-lemmas query rejects but the pool fulfills"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pool-query failure still throws Error('Database error') so the route 500s — existing contract unchanged"
    verification:
      - kind: unit
        ref: "tests/study-cards.test.ts#still throws Error(\"Database error\") when the pool query rejects (existing contract unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Happy path emits no [study-cards]-prefixed console.error when both queries fulfill — zero behavior change on the clean path"
    verification:
      - kind: unit
        ref: "tests/study-cards.test.ts#does not emit a [study-cards]-prefixed console.error on the happy path (both queries fulfill)"
        status: pass
    human_judgment: false

# Metrics
duration: 3 min
completed: 2026-07-10
status: complete
---

# Phase 23 Plan 01: Known-Lemmas Degradation Logging Summary

**Additive `[study-cards]`-prefixed console.error makes the silent known-lemmas query failure observable in Vercel logs before the existing empty-Set fallback, with a 3-test vitest regression suite locking both the new log and the unchanged degradation contract**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-10T18:01:47Z
- **Completed:** 2026-07-10T18:05:25Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `[study-cards]`-prefixed `console.error` in the `knownRowsResult.status === 'rejected'` branch of `lib/study-cards.ts`, logging the rejection reason so the silent unknownCount ranking-signal degradation becomes findable in server logs (RELIABILITY-01)
- Created `tests/study-cards.test.ts` — a 3-test regression suite that mocks the prisma singleton via `vi.mock('@/lib/prisma')` (no DATABASE_URL needed) and locks: (1) the new log fires on known-lemmas rejection while sessions still load with numeric unknownCount, (2) pool rejection still throws `Error('Database error')` (existing contract unchanged), (3) the happy path emits no `[study-cards]` log
- Verified zero behavior change on the happy path and that the existing graceful-degradation + pool-failure-throws contracts are provably unchanged

## Task Commits

Each task was committed atomically (TDD: RED → GREEN):

1. **Task 1: Log known-lemmas query failure before empty-Set degradation, with regression tests**
   - `59a584a` (test) — RED: failing test for the new `[study-cards]` log + contract-lock tests
   - `59265f3` (feat) — GREEN: implement the additive logging

## Files Created/Modified
- `lib/study-cards.ts` — added the `knownRowsResult.status === 'rejected'` → `console.error('[study-cards] ...', knownRowsResult.reason)` block, placed after the pool-rejection throw and before the empty-pool early return (additive logging only; no throw/retry/fallback added; the knownLemmas empty-Set ternary is byte-for-byte untouched)
- `tests/study-cards.test.ts` — new regression suite: 3 tests mocking the prisma singleton, locking the new log behavior and the unchanged degradation contract

## Decisions Made
- **Log placement:** Immediately after the pool-rejection throw and before the empty-pool early return (`cards.length === 0`) so the log fires even when the pool is empty — satisfies the requirement that visibility come BEFORE degradation.
- **Additive only:** No new throw, retry, or fallback behavior; RELIABILITY-01 is observability, not a behavior change. The existing `knownLemmas` empty-Set fallback ternary stays byte-for-byte untouched.
- **Log content:** Only the fixed `[study-cards]` prefix message and `knownRowsResult.reason` (the driver error). Never logs card fronts, `lessonFrom`/`lessonTo` params, DATABASE_URL, or auth tokens (threat T-23-01 mitigation by construction).
- **Test mocking strategy:** `vi.mock('@/lib/prisma', ...)` neutralizes the real module body (no DATABASE_URL needed, no DB connection). An explicit `sessionSize` in `StudyCardsParams` avoids invoking `getSessionSize()`. The pool call vs known-lemmas call are distinguished by the presence of `select` vs `include` in the findMany argument.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (`test(23-01):`) | `59a584a` | ✓ Present — new-behavior test failed for the right reason (logging not yet implemented) |
| GREEN (`feat(23-01):`) | `59265f3` | ✓ Present after RED — all 3 tests pass |
| REFACTOR (`refactor(23-01):`) | — | Skipped (optional) — implementation already minimal; no cleanup opportunities |

## Verification Results

- `npm test -- tests/study-cards.test.ts` → exits 0, 3 passing tests ✓
- `npm test` (whole suite) → exits 0, 221 passing tests (218 baseline + 3 new), 16 test files ✓
- `npm run lint` → exits 0, 0 errors (1 pre-existing warning in `components/StudySession.tsx`, unrelated to this plan) ✓
- Source assertions:
  - `grep -c "\[study-cards\]" lib/study-cards.ts` → 1 (>= 1) ✓
  - `knownRowsResult.status === 'rejected'` conditional with `console.error` positioned before `cards.length === 0` early return ✓
  - `knownRowsResult.status === 'fulfilled'` empty-Set fallback ternary unchanged ✓
  - `throw new Error('Database error')` pool-rejection throw unmodified ✓

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RELIABILITY-01 closed: known-lemmas query failure now emits an observable `[study-cards]`-prefixed log before degrading to the empty Set, locked by regression tests.
- Ready for Plan 23-02 (the second reliability bug — auto-relink forward-reference CardDependency edges once the sync backlog drains).
- No blockers.

## Self-Check: PASSED

- FOUND: lib/study-cards.ts (modified)
- FOUND: tests/study-cards.test.ts (created)
- FOUND: 59a584a (test commit — RED)
- FOUND: 59265f3 (feat commit — GREEN)

---
*Phase: 23-reliability-bug-fixes*
*Completed: 2026-07-10*
