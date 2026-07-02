---
phase: 13-review-api-hardening-save-reliability
reviewed: 2026-07-02T18:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/review/route.ts
  - components/StudySession.tsx
  - components/Toast.tsx
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-02T18:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is a re-review of the same four files after the prior review's 8 findings (`WR-01`–`WR-05`, `IN-01`–`IN-03`, tracked in `13-REVIEW-FIX.md`) were fixed. All 8 fixes were spot-checked against the current source and are correctly applied: `req.json()` in `/api/review` is now inside a `try`/`catch` (400 on malformed JSON); `PUT /api/cards/[id]`'s generic catch no longer leaks `e.message` and now guards against a `null`/non-object body; the card update and sentence replacement are now a single `$transaction`; `postReviewWithRetry` has an 8s `AbortController` timeout and short-circuits retries on 4xx; `/api/review` validates `cardId` is a non-empty string and uses an `isGrade` type guard instead of an `as Grade` cast; `handleUndo`'s failure path is now mount-guarded to match the success path; `Toast`'s auto-dismiss effect now depends on `message` as well as `duration`. No regressions were found in any of these eight areas.

However, this pass surfaces new issues the prior review's narrower scope did not catch — most notably a genuine correctness bug in the undo/save-reliability path this phase is centered on: **grading an AI-practice card after a real card leaves the client's "Undo" pointing at the wrong (already-passed) real card, and pressing it silently reverts that real card's FSRS state on the server.** There is also a sibling gap to the already-fixed `PUT` info-disclosure issue: the `DELETE` handler in the same file still leaks raw `e.message` to the client, unaddressed by the prior fix pass because it was out of that review's original scope.

## Critical Issues

### CR-01: Undo can silently revert the wrong card's FSRS state once a practice card has been graded after a real card

**File:** `components/StudySession.tsx:491-549`
**Issue:** `undoRef.current` and `setCanUndo(true)` are set only inside the `if (current.kind === 'real')` branch of `submitReview`:
```ts
if (current.kind === 'real') {
  ...
  undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
  setCanUndo(true)
  void postReviewWithRetry(cardId, rating, () => { ... })
}
```
Nothing resets `canUndo` / `undoRef` when the graded item is `kind: 'practice'`. Because the session queue is always built as `[...real, ...extraPractice]` (line 186-188), AI practice cards are appended after every real card, so "grade the last real card, then grade one or more practice cards, then tap Undo" is the ordinary end-of-session flow, not a contrived edge case.

When this happens: `canUndo` is still `true` (never reset) and the visible "↩ Undo last rating" button still references `undoRef.current` from the **last real card**, with a `prevQueue` snapshot captured *before* that real card — i.e. before any of the intervening practice cards were graded. Tapping Undo then:
1. `POST /api/review/undo` with the real card's `cardId` and its pre-grade `prevState` — reverting that card's FSRS scheduling state on the server, even though the user's actual last action was grading an (ephemeral, never-persisted) practice card.
2. Restores the client queue/stats/seen-set to the snapshot from before the real card was graded, silently discarding every practice card graded in between and re-inserting the real card into the queue for re-grading.

The button is labeled "Undo last rating" but reverts a rating that isn't the last one taken, and does so by actually mutating persisted spaced-repetition data the user did not ask to change. This is exactly the class of correctness bug the "save reliability" theme of this phase is meant to close.
**Fix:** Clear the undo pointer whenever a non-real item is graded, so Undo cannot fire against a stale real card:
```ts
if (current.kind === 'real') {
  ...
  undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
  setCanUndo(true)
  void postReviewWithRetry(cardId, rating, () => { ... })
} else {
  // Practice cards have no server-side FSRS state to revert; grading one
  // invalidates any pending undo so it can never act on a stale real card.
  undoRef.current = null
  setCanUndo(false)
}
```

## Warnings

### WR-01: `DELETE /api/cards/[id]` still leaks raw internal error messages to the client

**File:** `app/api/cards/[id]/route.ts:90-93`
**Issue:** The previous review's `WR-02` fixed exactly this class of info disclosure in the `PUT` handler of this same file (raw `e.message` → generic message, per the `WR-02` comment at line 74-76), but `DELETE` was never in that finding's scope and still does it:
```ts
} catch (e) {
  const message = e instanceof Error ? e.message : 'Delete failed'
  return NextResponse.json({ error: message }, { status: 500 })
}
```
Deleting a non-existent id (e.g. a stale client reference, or a double-tap of the swipe-to-delete gesture in `SwipeRow`) throws Prisma's `P2025`, whose message includes internal model/operation detail; any other DB-layer failure (e.g. a transient Turso connectivity error) would similarly surface internal detail straight to the response body — the same disclosure posture the sibling handler in this file was deliberately hardened against.
**Fix:**
```ts
} catch (e) {
  console.error('DELETE /api/cards/[id] failed:', e)
  return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 })
}
```
Consider mapping Prisma `P2025` to a `404` rather than a generic `500`, matching the not-found semantics already used by `/api/review` (`Card review not found`).

### WR-02: `PUT /api/cards/[id]` still performs no runtime validation of individual field types/shapes

**File:** `app/api/cards/[id]/route.ts:15-33, 36-51`
**Issue:** The prior fix pass added a top-level `data === null || typeof data !== 'object'` guard, but nothing validates the *individual* fields once that guard passes:
- `data.front`/`data.back`/`data.notes` are spread into the Prisma update with no `typeof === 'string'` check. A non-string `data.front` reaches `normalizeFront(data.front)`, which calls `.normalize()`/`.trim()` on it and throws — caught only by the outer generic catch, surfacing as a 500 instead of a clear 400.
- `data.front === ''` passes the `!== undefined` guard and is persisted; `normalizeFront('')` is `''`, so two cards independently edited to an empty front will collide on `Card.normalizedFront @unique`, producing the confusing "This front already exists" message rather than a clear "front cannot be empty".
- `data.type` is written verbatim with no check that it is one of `vocabulary` / `grammar` / `phrase`, even though the rest of the app treats `type` as a closed enum (`lib/card-style.ts:typeBadgeClass`, the extraction prompt).
- `data.sentences` is cast (`as { korean: string; targetForm: string; translation: string }[]`) with no runtime check of element shape; a malformed element (e.g. `null` in the array) throws inside the `.map`, again only caught by the outer generic catch.
**Fix:**
```ts
if (data.front !== undefined && (typeof data.front !== 'string' || data.front.trim() === '')) {
  return NextResponse.json({ error: 'front must be a non-empty string' }, { status: 400 })
}
if (data.type !== undefined && !['vocabulary', 'grammar', 'phrase'].includes(data.type)) {
  return NextResponse.json({ error: 'type must be vocabulary, grammar, or phrase' }, { status: 400 })
}
if (data.sentences !== undefined && (!Array.isArray(data.sentences) || data.sentences.some((s: unknown) => typeof s !== 'object' || s === null))) {
  return NextResponse.json({ error: 'sentences must be an array of objects' }, { status: 400 })
}
```

## Info

### IN-01: `postReviewWithRetry`'s per-attempt timeout timer is not cleared when `fetch` rejects outright

**File:** `components/StudySession.tsx:124-146`
**Issue:** The `WR-04` fix added the `AbortController` timeout, but `clearTimeout(timeoutId)` only runs on the line immediately after a successful `await fetch(...)`:
```ts
const timeoutId = setTimeout(() => ctrl.abort(), 8000)
const res = await fetch(REVIEW_ENDPOINT, { ... signal: ctrl.signal })
clearTimeout(timeoutId)   // skipped if fetch() rejects for a non-abort reason
```
If `fetch` rejects for a reason other than the 8s abort firing (e.g. an immediate `TypeError: Failed to fetch` while offline), control jumps straight to `catch` and `timeoutId` is never cleared. The stale timer fires ~8s later and calls `ctrl.abort()` on a controller whose fetch has already settled — a no-op, so there is no functional impact — but it's an avoidable dangling-timer code smell.
**Fix:**
```ts
const ctrl = new AbortController()
const timeoutId = setTimeout(() => ctrl.abort(), 8000)
try {
  const res = await fetch(REVIEW_ENDPOINT, { ... signal: ctrl.signal })
  if (res.ok) return
  if (res.status >= 400 && res.status < 500) break
} catch {
  // ...
} finally {
  clearTimeout(timeoutId)
}
```

---

_Reviewed: 2026-07-02T18:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
