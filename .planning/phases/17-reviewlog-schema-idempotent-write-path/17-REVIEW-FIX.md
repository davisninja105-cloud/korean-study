---
phase: 17-reviewlog-schema-idempotent-write-path
fixed_at: 2026-07-04T15:27:21Z
review_path: .planning/phases/17-reviewlog-schema-idempotent-write-path/17-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-07-04T15:27:21Z
**Source review:** .planning/phases/17-reviewlog-schema-idempotent-write-path/17-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Non-atomic read-modify-write in `POST /api/review` allows a lost FSRS update between two distinct reviews of the same card

**Files modified:** `app/api/review/route.ts`
**Commit:** a2fce2d
**Applied fix:** Wrapped the CardReview read, FSRS compute, and both writes (CardReview update + ReviewLog create) inside a single Prisma interactive transaction (`prisma.$transaction(async (tx) => ...)`). Added an optimistic-concurrency guard: the update is done via `updateMany` scoped to `{ cardId, reps: cardReview.reps, lastReview: cardReview.lastReview }` (a version fingerprint); if the row moved since the read, `count === 0` and a `StaleReviewError` is thrown, surfaced to the client as a `409`. This closes the lost-update race for two distinct in-flight reviews of the same card.

**Verification note:** This is a concurrency-correctness fix. Tier 1 (re-read) and Tier 2 (`tsc --noEmit`, scoped to the modified file — zero new errors) both passed, but neither tier can prove the race condition is actually closed under concurrent load. **Recommend manual/integration verification** (e.g. two overlapping `POST /api/review` requests for the same card with different `idempotencyKey`s) before relying on this in production.

### WR-01: P2002 catch treats *any* unique-constraint violation as an idempotency-key retry

**Files modified:** `app/api/review/route.ts`
**Commit:** acae5e4
**Applied fix:** Added `(e.meta?.target as string[] | undefined)?.includes('idempotencyKey')` to the P2002 catch condition, so only a violation of the `idempotencyKey` unique constraint is treated as an idempotent-retry success. Any other future unique-constraint violation now falls through to the generic 500 handler instead of being silently reported as success.

### WR-02: Idempotent-success branch can return `null` with a 200 status

**Files modified:** `app/api/review/route.ts`
**Commit:** c99b3bb
**Applied fix:** The idempotent-retry re-read (`prisma.cardReview.findUnique`) is now guarded the same way as the initial lookup — if `current` is `null` (e.g. the card was deleted concurrently), the handler returns `{ error: 'Card review not found' }` with a `404` instead of a `200` with a `null` body.

### WR-03: Save-failure toast blames "your connection" even for permanent (4xx) failures

**Files modified:** `components/StudySession.tsx`
**Commit:** b84ba0e
**Applied fix:** Introduced a `SaveFailureReason = 'network' | 'permanent'` type. `postReviewWithRetry` now tracks which kind of failure exhausted the retry loop (permanent on any 4xx response, network otherwise) and passes it to `onExhausted(reason)`. The call site in `submitReview` now shows connection-neutral copy ("Couldn't save your last review. Your progress may not be recorded.") for permanent failures, keeping the original connectivity-focused copy only for genuine network/timeout/5xx failures.

### WR-04: `ReviewLog` cascade-deletes with its parent `Card`, contradicting its documented "append-only audit log" intent

**Files modified:** `prisma/schema.prisma`
**Commit:** 694bff5
**Applied fix:** Corrected the model's doc comment rather than changing the cascade behavior. The finding offered two options (drop the cascade, or fix the doc); dropping the cascade would require making `cardId` nullable and running a live schema migration against Turso (which — per this project's documented gotcha — cannot be applied via `prisma db push`/`migrate` and needs a hand-written DDL script executed directly against production). That is a materially larger and riskier change than a doc-accuracy fix, and out of scope for an automated code-review fix pass. The updated comment now explicitly states that `ReviewLog`'s `onDelete: Cascade` scopes review history to the card's lifetime, and explains why (no product surface shows history for a deleted card) plus what would need to change if that assumption changes.

**Note for follow-up:** If a future requirement needs review history to outlive card deletion, this will need a real schema change (nullable `cardId` + Turso DDL migration) — flagged here for a human decision, not attempted automatically.

### WR-05: Defensive guard in `submitReview` silently no-ops instead of surfacing an error when review data is missing

**Files modified:** `components/StudySession.tsx`
**Commit:** 80f79d0
**Applied fix:** Added an `else` branch to the `if (reviewData && reviewData.nextReview)` guard that logs `console.error('submitReview: card missing review.nextReview, cannot compute local FSRS state', cardId)`. The silent-graduation behavior (card leaves the queue regardless of rating) is unchanged, but the failure is now visible in the console instead of undiagnosable.

### IN-01: `apply-reviewlog-ddl.mjs` logs the raw `DATABASE_URL` to stdout

**Files modified:** `scripts/apply-reviewlog-ddl.mjs`
**Commit:** 6d45b69
**Applied fix:** Changed `console.log('Connected to:', url)` to `console.log('Connected to:', url.replace(/\/\/.*@/, '//***@'))`, redacting the connection string's credentials/host segment before logging.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-07-04T15:27:21Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
