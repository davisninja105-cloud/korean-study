---
phase: 13-review-api-hardening-save-reliability
fixed_at: 2026-07-02T18:20:00Z
review_path: .planning/phases/13-review-api-hardening-save-reliability/13-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-07-02T18:20:00Z
**Source review:** .planning/phases/13-review-api-hardening-save-reliability/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Undo can silently revert the wrong card's FSRS state once a practice card has been graded after a real card

**Files modified:** `components/StudySession.tsx`
**Commit:** 0b22b2c
**Applied fix:** Added an `else` branch to the `if (current.kind === 'real')` block in `submitReview` that clears `undoRef.current` and calls `setCanUndo(false)` whenever the graded item is a practice card. This invalidates any pending undo pointer as soon as a practice card is graded, so the "Undo last rating" button can no longer fire against a stale real card's pre-grade snapshot after intervening practice cards were graded. Verified via project-scoped `tsc --noEmit` (no new errors in the file).

**Note:** This is a logic/state-handling fix, not just a syntax change. Both tiers of automated verification only confirm the code is syntactically sound and the fix text is present — they cannot confirm the undo flow behaves correctly end-to-end. Recommend a manual check (grade a real card, then grade one or more practice cards, then confirm the Undo button is disabled/no-op) before treating this as fully verified. **Status: fixed — requires human verification.**

### WR-01: `DELETE /api/cards/[id]` still leaks raw internal error messages to the client

**Files modified:** `app/api/cards/[id]/route.ts`
**Commit:** e70ff4e
**Applied fix:** Replaced the raw `e instanceof Error ? e.message : 'Delete failed'` passthrough with a `console.error` (server-side only) and a generic `'Failed to delete card'` message, matching the disclosure posture already applied to the `PUT` handler in this file. Also added a Prisma `P2025` ("record not found") check that returns `404` instead of a generic `500`, per the review's suggestion, matching the not-found semantics used by `/api/review`. Verified via project-scoped `tsc --noEmit` (no new errors in the file; required symlinking the gitignored `app/generated/prisma` client into the worktree to resolve `Prisma.PrismaClientKnownRequestError`).

### WR-02: `PUT /api/cards/[id]` still performs no runtime validation of individual field types/shapes

**Files modified:** `app/api/cards/[id]/route.ts`
**Commit:** 9d27c16
**Applied fix:** Added explicit 400-returning validation for `front` (non-empty string), `back` (string), `notes` (string or null — confirmed nullable in `prisma/schema.prisma`), `type` (must be one of `vocabulary`/`grammar`/`phrase`), and `sentences` (array of objects), applied only when the corresponding key is present in the payload (preserving the existing partial-update semantics). This runs before the Prisma update/transaction, so malformed input now returns a clear `400` instead of falling through to `normalizeFront()`/`.map()` and surfacing as an opaque `500`. Verified via project-scoped `tsc --noEmit` (no new errors in the file).

### IN-01: `postReviewWithRetry`'s per-attempt timeout timer is not cleared when `fetch` rejects outright

**Files modified:** `components/StudySession.tsx`
**Commit:** 4d6d7ba
**Applied fix:** Moved `AbortController`/`setTimeout` construction outside the `try` block and moved `clearTimeout(timeoutId)` into a `finally` clause, so every attempt path (success, 4xx `break`, or any thrown error) clears its own timer, not just the immediate-success path. Verified via project-scoped `tsc --noEmit` (no new errors in the file).

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-07-02T18:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
