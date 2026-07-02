---
phase: 13-review-api-hardening-save-reliability
fixed_at: 2026-07-02T17:11:53Z
review_path: .planning/phases/13-review-api-hardening-save-reliability/13-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-07-02T17:11:53Z
**Source review:** .planning/phases/13-review-api-hardening-save-reliability/13-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### WR-01: `await req.json()` is outside the try/catch — malformed JSON throws unhandled, bypassing REVIEW-01's structured 500

**Files modified:** `app/api/review/route.ts`
**Commit:** dece898
**Applied fix:** Moved body parsing inside its own `try`/`catch` at the top of the handler. Malformed JSON now returns a structured `400 { error: 'Invalid JSON body' }` instead of an unhandled throw / framework-level 500. `cardId`/`rating` are destructured from the parsed body (`body ?? {}`) after the parse succeeds, preserving the original loose typing so later checks (WR-05, IN-01) still narrow correctly.

### WR-02: PUT `/api/cards/[id]` 500 leaks raw `e.message` to the client (info disclosure)

**Files modified:** `app/api/cards/[id]/route.ts`
**Commit:** 6ca85e5
**Applied fix:** The generic-error catch branch now logs the raw error server-side via `console.error` and returns a fixed generic message (`'Failed to update card'`), matching the disclosure posture already established for `/api/review` (T-13-02). Also added a `data === null || typeof data !== 'object'` guard immediately after `req.json()` returning a `400` before the field-spread, closing the reachable `TypeError` path the reviewer flagged (a `null` body previously threw inside the spread and would have hit the now-fixed catch anyway, but the explicit guard makes the 400 intentional and immediate).

### WR-03: `prisma.card.update` and the sentence-replacement `$transaction` are not atomic — partial state on mid-flow failure

**Files modified:** `app/api/cards/[id]/route.ts`
**Commit:** af98b5a
**Applied fix:** Both operations are now built as `PrismaPromise` values (`cardUpdate`, `sentenceOps`) without awaiting them individually, then passed together into a single `prisma.$transaction([cardUpdate, ...sentenceOps])` call. A mid-flow DB failure can no longer leave the card with a new `front` but stale `sentences` — either both commit or neither does.

### WR-04: `postReviewWithRetry` retries non-transient failures (4xx) and has no per-attempt timeout

**Files modified:** `components/StudySession.tsx`
**Commit:** 6e5b659
**Applied fix:** Each fetch attempt now runs under an `AbortController` with an 8s timeout (`clearTimeout` on success), so a hung connection can no longer stall the loop and starve `onExhausted` from ever firing. After a response is received, `res.status >= 400 && res.status < 500` breaks out of the retry loop immediately (goes straight to `onExhausted()`) instead of burning ~2s of pointless backoff on a permanent (non-transient) failure. Applied exactly as the reviewer's suggested fix, with an updated doc comment explaining both changes.

### WR-05: `/api/review` does not validate `cardId` is a string

**Files modified:** `app/api/review/route.ts`
**Commit:** a3e4cab
**Applied fix:** Added `if (typeof cardId !== 'string' || cardId === '') return 400` immediately after the existing `undefined` check, matching the sibling `/api/review/undo` route's input contract (`!cardId || typeof cardId !== 'string'`). A non-string or empty `cardId` is now rejected with a clear `400` instead of reaching `findUnique` and producing a misleading `404` or an unnecessary `500`.

### IN-01: `rating as Grade` is an unchecked type assertion

**Files modified:** `app/api/review/route.ts`
**Commit:** f6c8f4c
**Applied fix:** Added a module-level `isGrade(n: unknown): n is Grade` type guard (`typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4`) and replaced the REVIEW-02 range-check `if` block with `if (!isGrade(rating))`. The subsequent `reviewCard(cardReview, rating)` call no longer needs the `as Grade` cast — TypeScript's control-flow narrowing carries the `Grade` type through from the guard, so if a future edit relaxes the check, the call site stops compiling instead of silently keeping an invalid cast. Verified via `tsc --noEmit` that narrowing works correctly on the (loosely-typed) `rating` variable.

### IN-02: `handleUndo` failure path is not mount-guarded, inconsistent with the success path

**Files modified:** `components/StudySession.tsx`
**Commit:** 50c2b82
**Applied fix:** Added `if (!isMountedRef.current) return` as the first line of the `catch` block in `handleUndo`, before the `undoRef.current` write and `setCanUndo(true)` call — mirroring the guard already present on the success path two lines below (REVIEW-05's atomic-undo pattern). Purely a symmetry/readability fix (React 18/19 already makes the unguarded version harmless), with a comment explaining the intent so a future reader doesn't mistake the omission for a deliberate choice.

### IN-03: Toast auto-dismiss timer does not reset when `message` changes

**Files modified:** `components/Toast.tsx`
**Commit:** f565f5d
**Applied fix:** Added `message` to the auto-dismiss `useEffect` dependency array (`[duration, message]`). The `dismissRef` indirection is unchanged, so unrelated parent re-renders still do not reset the timer — only a genuine `duration` or `message` change does. Added a comment noting the current sole caller (`StudySession.tsx`) always unmounts/remounts the Toast rather than reusing it with a new message, so this is footgun-prevention for future reuse, not an observed bug fix.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-07-02T17:11:53Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
