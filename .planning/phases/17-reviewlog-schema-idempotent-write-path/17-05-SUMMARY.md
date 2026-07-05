---
phase: 17-reviewlog-schema-idempotent-write-path
plan: 05
subsystem: api
tags: [prisma, libsql, driver-adapter, idempotency, vitest]

requires:
  - phase: 17-reviewlog-schema-idempotent-write-path (plan 04)
    provides: "lib/db-errors.ts isUniqueConstraintError() helper + widened idempotent-200 catch in POST /api/review, covering the raw DriverAdapterError shape"
provides:
  - "lib/db-errors.ts: isUniqueConstraintError() extended to a bounded BFS that also descends into meta.driverAdapterError and reads originalMessage, recognizing the classified-P2002-without-target shape"
  - "tests/db-errors.test.ts: 3 new unit cases (classified-P2002 nested cause, different-column negative under the same meta path, meta.driverAdapterError.message variant) — 13/13 passing"
  - "tests/review-route.test.ts: persisted regression test invoking the real POST /api/review handler twice against a local SQLite file DB, asserting idempotent 200/200 with one ReviewLog row and unchanged FSRS state"
affects: [18-history-page]

tech-stack:
  added: []
  patterns:
    - "Bounded BFS error-shape traversal (node-visit cap, not depth cap) collecting both .message and .originalMessage, advancing via both .cause and .meta.driverAdapterError edges"
    - "Local SQLite file-DB integration test: apply real schema DDL via `prisma migrate diff --from-empty --to-schema`, seed via the dynamic-imported Prisma singleton, invoke the real route handler directly (env set before dynamic import, matching the local-resync.mts ordering convention)"

key-files:
  created:
    - tests/review-route.test.ts
  modified:
    - lib/db-errors.ts
    - tests/db-errors.test.ts

key-decisions:
  - "Generalized the linear .cause walk into a queue-based BFS bounded by total nodes visited (10) rather than depth, since the new shape requires branching to TWO next-node sources (.cause AND .meta.driverAdapterError) per node, not one"
  - "vitest.config.ts already existed with the exact @/ alias config the plan called for (added in an earlier commit) — no new file needed; Task 2 only added tests/review-route.test.ts"
  - "Verified the RED state by transpiling the pre-fix (HEAD~1) lib/db-errors.ts in isolation and confirming it returns false for the classified-P2002 fixture, rather than modifying tracked files to reproduce the regression"

patterns-established:
  - "isUniqueConstraintError's traversal is now shape-agnostic across the two known Prisma 7 + adapter-libsql error classifications for the same underlying SQLite UNIQUE violation — future third shapes can extend nextNodes()/collectStrings() without touching the caller"

requirements-completed: [HIST-02]

coverage:
  - id: D1
    description: "isUniqueConstraintError recognizes the classified-P2002 shape (meta.target undefined, detail under meta.driverAdapterError.cause.originalMessage or meta.driverAdapterError.message) in addition to the raw DriverAdapterError shape, and still returns false for a different-column violation under the same meta path plus all prior negative cases"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "tests/db-errors.test.ts (13 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A duplicate-idempotencyKey POST /api/review returns an idempotent 200 (not 500) for the classified-P2002 shape, with exactly one ReviewLog row and unchanged CardReview/FSRS state across both responses — proven by invoking the real, unmodified route handler twice against a local SQLite file DB with the actual idempotencyKey UNIQUE index applied"
    requirement: "HIST-02"
    verification:
      - kind: integration
        ref: "tests/review-route.test.ts#POST /api/review — idempotent duplicate replay (HIST-02) > returns 200 for both the first and a byte-identical duplicate request, applying FSRS state exactly once"
        status: pass
      - kind: automated_ui
        ref: "npm test (130/130 passing) && npm run lint (0 errors, 1 pre-existing unrelated warning)"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-07-05
status: complete
---

# Phase 17 Plan 05: Idempotent-200 Second Error Shape + Persisted Regression Test Summary

**Extended `isUniqueConstraintError` to a bounded BFS that also descends into `meta.driverAdapterError`, closing the classified-P2002-without-`meta.target` gap for duplicate `idempotencyKey` POSTs, and added a persisted `tests/review-route.test.ts` that invokes the real route handler twice against a local SQLite file DB to protect the fix going forward.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-05T11:19:43-07:00
- **Completed:** 2026-07-05T11:30:33-07:00
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- Generalized `lib/db-errors.ts`'s `isUniqueConstraintError` from a linear `.cause`-only walk (bounded to 5 depth levels) into a queue-based BFS (bounded to 10 total visited nodes) that collects candidate strings from both `message` and `originalMessage` fields and advances via both `.cause` and `.meta.driverAdapterError` edges — recognizing the classified `PrismaClientKnownRequestError`/P2002 shape (where `meta.target` is `undefined`) in addition to the raw `DriverAdapterError` shape 17-04 already covered.
- Added 3 new unit cases to `tests/db-errors.test.ts` (classified-P2002 nested `cause.originalMessage`, a different-column negative under the same `meta.driverAdapterError` path, and the `meta.driverAdapterError.message` variant) — all 10 prior cases plus the 3 new ones pass (13/13).
- Created `tests/review-route.test.ts` — a persisted regression test that imports and invokes the real, unmodified `POST` export from `app/api/review/route.ts` twice with a byte-identical body against a freshly-seeded local SQLite file DB (schema DDL generated via `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` and applied with `@libsql/client`'s `executeMultiple`). Asserts both responses are 200, exactly one `ReviewLog` row exists for the `idempotencyKey`, and FSRS fields (`reps`, `state`, `stability`, `nextReview`) are unchanged across the two responses.
- Confirmed the RED state without touching tracked files: transpiled the pre-fix (`HEAD~1`) `lib/db-errors.ts` in a scratch script and confirmed it returns `false` for the classified-P2002 fixture — the exact gap this plan closes.
- Full suite green: `npm test` reports 130/130 passing (126 prior + 1 new integration test + 3 new unit cases); `npm run lint` reports 0 errors (1 pre-existing, unrelated `react-hooks/exhaustive-deps` warning in `components/StudySession.tsx`, out of scope per the plan's scope boundary).

## Task Commits

1. **Task 1: Extend isUniqueConstraintError to recognize the classified-P2002 driverAdapterError shape** - `2b87bc8` (fix)
2. **Task 2: Add a persisted regression test invoking the real POST handler against a local SQLite file DB** - `6e666b9` (test)

## Files Created/Modified

- `lib/db-errors.ts` - `isUniqueConstraintError` now does a bounded BFS over both `.cause` and `.meta.driverAdapterError` edges, collecting both `message` and `originalMessage` strings; JSDoc updated to document both real error shapes and cite `17-VERIFICATION.md`.
- `tests/db-errors.test.ts` - Added 3 new cases for the classified-P2002 shape (positive, different-column negative, `meta.driverAdapterError.message` variant); all 10 prior cases unchanged and passing.
- `tests/review-route.test.ts` - New persisted regression test: real `POST` handler invoked twice against a local SQLite file DB with the actual schema DDL applied, asserting idempotent 200/200, one `ReviewLog` row, unchanged FSRS state.

## Decisions Made

- Generalized the linear `.cause` walk into a queue-based BFS bounded by total nodes visited (10) rather than a fixed depth (the prior `MAX_CAUSE_DEPTH = 5`), because the new shape requires branching to TWO next-node sources (`.cause` AND `.meta.driverAdapterError`) per node rather than one — a depth-only bound wouldn't naturally express that fan-out while staying cyclic-safe.
- `vitest.config.ts` already existed (created in an earlier commit, `74d50ad`) with the exact `resolve.alias` mapping `@/` to the project root that the plan specified — verified it matches the plan's spec exactly (node environment, no globals) and made no changes to it. Task 2's only new artifact was `tests/review-route.test.ts`.
- Verified the RED state (pre-fix helper misses the classified-P2002 shape) by transpiling `HEAD~1`'s `lib/db-errors.ts` in an isolated scratch script rather than temporarily reverting the tracked file — avoids any risk of an accidental broken intermediate commit.

## Deviations from Plan

**1. [Rule 3 - Blocking, resolved as a non-issue] `vitest.config.ts` already existed**
- **Found during:** Task 2
- **Issue:** The plan's action step instructed creating `vitest.config.ts` "at the project root (it does not exist today)". It already existed, created by an earlier commit (`74d50ad`, `feat(18-01): implement getReviewHistory pipeline + pure helpers`) with content that exactly matches the plan's spec (`resolve.alias` mapping `@/` → project root via `path.resolve(__dirname, './')`, default node test environment, no globals).
- **Fix:** No fix needed — verified the existing file already satisfies every requirement in the plan (alias present, environment: 'node', no narrowed include glob, no globals enabled). Left it untouched and proceeded directly to writing `tests/review-route.test.ts`.
- **Files modified:** None (verification only).
- **Verification:** `npx vitest run tests/review-route.test.ts` resolves `@/lib/prisma` and `@/app/api/review/route` cleanly on the first run.

---

**Total deviations:** 1 (a plan assumption that didn't hold — file already present and already correct; no code change required).
**Impact on plan:** None. No scope creep; the plan's required end-state (a working `@/` alias for tests) was already true.

## Issues Encountered

None - both tasks implemented and verified on the first pass; no debugging required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- HIST-02's idempotent-replay guarantee now holds for BOTH real Prisma 7 + `@prisma/adapter-libsql` error-classification shapes for a duplicate `idempotencyKey` (raw `DriverAdapterError` from 17-04, classified-P2002-without-`meta.target` from this plan), closing the single remaining blocker from `17-VERIFICATION.md`.
- A persisted automated regression test (`tests/review-route.test.ts`) now protects this exact path going forward — the requirement no longer depends on manual re-verification after future refactors.
- `app/api/review/route.ts` and `app/api/review/undo/route.ts` are unchanged, as required; Phase 17 (ReviewLog Schema & Idempotent Write Path) has no further known gaps.
- No blockers for Phase 18 (history page), which already depends on `ReviewLog` being a genuinely dedup-safe, append-only audit trail.

---
*Phase: 17-reviewlog-schema-idempotent-write-path*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: lib/db-errors.ts
- FOUND: tests/db-errors.test.ts
- FOUND: tests/review-route.test.ts
- FOUND: vitest.config.ts
- FOUND: .planning/phases/17-reviewlog-schema-idempotent-write-path/17-05-SUMMARY.md
- FOUND: 2b87bc8 (fix commit — Task 1)
- FOUND: 6e666b9 (test commit — Task 2)
