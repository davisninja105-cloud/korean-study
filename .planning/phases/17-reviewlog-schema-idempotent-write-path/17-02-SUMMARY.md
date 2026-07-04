---
phase: 17-reviewlog-schema-idempotent-write-path
plan: 02
subsystem: api
tags: [prisma, transaction, idempotency, nextjs, fsrs]

# Dependency graph
requires:
  - phase: 17-reviewlog-schema-idempotent-write-path
    provides: "Plan 17-01's ReviewLog Prisma model + live Turso table with UNIQUE idempotencyKey index"
provides:
  - "POST /api/review idempotencyKey validation (non-empty string, max 100 chars, 400 before any DB call)"
  - "Atomic array-form prisma.$transaction([cardReview.update, reviewLog.create]) write path"
  - "P2002-as-200-idempotent-replay catch branch (reads back current CardReview, no re-apply of FSRS state)"
affects: [17-03-history-page, 18-history-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Array-form prisma.$transaction([...]) + P2002-catch-as-friendly-response, reused verbatim from app/api/cards/[id]/route.ts for a second route"

key-files:
  created: []
  modified:
    - app/api/review/route.ts

key-decisions:
  - "idempotencyKey validation placed after isGrade(rating) check and before the try block, mirroring the existing WR-05 cardId validation idiom exactly"
  - "P2002 catch does not inspect e.meta.target (Pitfall 3) — idempotencyKey is the only reachable unique constraint in this transaction, so any P2002 here is unambiguously the duplicate-key case"
  - "reviewCard()'s return value (`updated`) is spread directly into reviewLog.create's data alongside cardId/rating/idempotencyKey — its field set is an exact match for ReviewLog's FSRS snapshot columns (D-02), no mapping needed"

patterns-established:
  - "P2002-as-idempotent-200 is now a two-instance pattern in this codebase (cards/[id] PUT for front-collision, review POST for duplicate grade) — future routes with a client-supplied idempotency key should follow this same array-transaction + catch shape"

requirements-completed: [HIST-01, HIST-02]

coverage:
  - id: D1
    description: "POST /api/review validates idempotencyKey (missing/empty/type-mismatch/over-100-chars) with a 400 before any DB call"
    requirement: "HIST-01"
    verification:
      - kind: unit
        ref: "grep 'idempotencyKey must be a non-empty string' app/api/review/route.ts confirms the 400 branch exists before the try block; npm run build type-checks the validation"
        status: pass
    human_judgment: false
  - id: D2
    description: "CardReview.update + ReviewLog.create write inside one atomic array-form $transaction — either both land or neither does"
    requirement: "HIST-01"
    verification:
      - kind: unit
        ref: "grep 'prisma.$transaction' and 'reviewLog.create' in app/api/review/route.ts; npm run build passes, proving prisma.reviewLog types from 17-01 exist and the transaction call type-checks"
        status: pass
    human_judgment: false
  - id: D3
    description: "A duplicate idempotencyKey collision (P2002) is caught and returned as 200 with current CardReview state, with no re-applied FSRS state and no second ReviewLog row"
    requirement: "HIST-02"
    verification: []
    human_judgment: true
    rationale: "Requires a live curl round-trip against a running dev server with a real cardId and DB inspection to confirm the ReviewLog row count and CardReview.reps/nextReview did not change on retry — deferred to end-of-phase human verification per the plan's human_verify_mode=end-of-phase, and end-to-end coverage needs 17-03's client-side idempotency key generation too."
  - id: D4
    description: "app/api/review/undo/route.ts is untouched; existing 400/404/500 error shapes and validations on the review route are all preserved"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "git diff --stat app/api/review/undo/route.ts (empty output — no modification)"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-07-04
status: complete
---

# Phase 17 Plan 2: ReviewLog Schema & Idempotent Write Path Summary

**Hardened `POST /api/review` into an idempotent, transactional write path: validates a client-supplied `idempotencyKey`, writes `CardReview.update` + `ReviewLog.create` inside one atomic array-form `$transaction`, and catches a duplicate-key `P2002` collision as an idempotent 200 replay instead of double-applying FSRS state.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-04T06:18:15Z
- **Completed:** 2026-07-04T06:24:00Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `app/api/review/route.ts` now destructures and validates a new `idempotencyKey` request-body field (non-empty string, max 100 chars) with a 400 before any DB access, mirroring the existing `WR-05` `cardId` validation idiom
- The single `prisma.cardReview.update(...)` call was replaced with an array-form `prisma.$transaction([cardReview.update, reviewLog.create])` — the exact same proven-safe idiom already used in `app/api/cards/[id]/route.ts`'s `PUT` handler
- `reviewLog.create` writes `cardId`, `rating`, `idempotencyKey`, and the full FSRS snapshot spread from `reviewCard()`'s return value (`state`/`stability`/`difficulty`/`elapsedDays`/`scheduledDays`/`reps`/`lapses`/`nextReview`/`lastReview`) — a field-for-field match with `ReviewLog`'s schema, confirmed by `npm run build` type-checking cleanly
- A new `Prisma.PrismaClientKnownRequestError` + `P2002` catch branch, placed before the generic 500 fallthrough, re-fetches the current `CardReview` and returns it with an implicit 200 on a duplicate `idempotencyKey` — the whole transaction rolled back, so this reads back the already-correct state without re-running `reviewCard()`
- All existing validations (`cardId`/`rating`/invalid JSON), the 404 not-found branch, and the generic 500 fallthrough (with server-only `console.error`, no raw error leaked — T-13-02) are preserved unchanged
- `app/api/review/undo/route.ts` was not touched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add idempotency-key validation + transactional ReviewLog write + P2002-as-success to POST /api/review** - `2f1b2a5` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/api/review/route.ts` - Added `idempotencyKey` import/validation, replaced the single `cardReview.update` with an array-form `$transaction([cardReview.update, reviewLog.create])`, added a `P2002`-as-200-idempotent-replay catch branch

## Decisions Made
- Followed the plan's exact prescribed shape — no discretion calls beyond what the plan already specified (validation placement, transaction form, catch branch structure)
- Did not inspect `e.meta.target` in the `P2002` catch (Pitfall 3 from research) — `idempotencyKey` is the only reachable unique constraint in this transaction, so no ambiguity exists

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npm run lint` (0 new errors — the single pre-existing `StudySession.tsx` `exhaustive-deps` warning is unrelated) and `npm run build` (which regenerates the Prisma client and type-checks the new `prisma.reviewLog` calls from 17-01) both passed on the first attempt. All grep-based acceptance checks (`prisma.$transaction`, `reviewLog.create`, `PrismaClientKnownRequestError`, `idempotencyKey`) confirmed present, and `git diff --stat app/api/review/undo/route.ts` confirmed the sibling undo route was untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The server half of HIST-01/HIST-02 is complete and type-checked. The route is ready for 17-03 to wire up client-side `idempotencyKey` generation (`crypto.randomUUID()` in an event handler, per Pitfall 5) and `handleUndo`'s retry-cancellation logic (HIST-03).
- Deferred to end-of-phase human verification (per `human_verify_mode=end-of-phase`): a live curl-based duplicate-request test confirming exactly one `ReviewLog` row is written on first grade and no second row / no FSRS re-application on a same-key retry. This needs a running dev server with a valid `ks_auth` cookie and a real `cardId` — practical to test end-to-end once 17-03's client generates real idempotency keys.
- No blockers for 17-03.

---
*Phase: 17-reviewlog-schema-idempotent-write-path*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: app/api/review/route.ts
- FOUND: .planning/phases/17-reviewlog-schema-idempotent-write-path/17-02-SUMMARY.md
- FOUND: commit 2f1b2a5
