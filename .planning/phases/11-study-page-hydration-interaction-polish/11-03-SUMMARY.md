---
phase: 11-study-page-hydration-interaction-polish
plan: "03"
subsystem: study-session
tags: [optimistic-ui, fsrs, performance, ux]
status: complete

dependency_graph:
  requires: []
  provides: [optimistic-grade-advance]
  affects: [components/StudySession.tsx]

tech_stack:
  added: []
  patterns: [optimistic-ui, fire-and-forget, client-side-fsrs]

key_files:
  created: []
  modified:
    - components/StudySession.tsx

decisions:
  - "submitReview is now synchronous — removed async/await entirely; queue advances immediately after tap (D-08)"
  - "Client-side FSRS via reviewCard() with ISO string → Date conversion satisfies CardReviewFields (Pitfall 1)"
  - "Undo snapshot captured before queue advance to preserve correct pre-grade visual state (D-10, Pitfall 4)"
  - "Background POST /api/review uses .catch(() => {}) per D-09 — silent failure accepted for single-user app"

metrics:
  duration: "1 minute"
  completed: "2026-06-30"
  tasks_completed: 1
  files_modified: 1
---

# Phase 11 Plan 03: Optimistic Grade Advance Summary

Eliminated the 100–200ms grade-button jitter (UX-01) by converting `submitReview` in `components/StudySession.tsx` to a synchronous, optimistic function that computes FSRS results client-side and advances the card queue immediately before a background network save.

## What Was Built

**`components/StudySession.tsx` — synchronous optimistic `submitReview`**

The `submitReview` function was previously `async` and blocked on `await fetch('/api/review')` before calling `setQueue()`. The card visibly stalled for 100–200ms between the user's grade-button tap and the next card appearing.

The refactored function:
1. Imports `reviewCard` and `type Grade` from `@/lib/fsrs` (added to existing import)
2. Runs FSRS computation locally via `reviewCard(cardReviewFields, rating as Grade)` — instant, no network
3. Converts ISO string dates from `Card.review` to `Date` objects before calling `reviewCard` (satisfies `CardReviewFields` type constraint)
4. Decides `requeue` from `localResult.nextReview` immediately
5. Captures undo snapshot **before** the queue advance (critical ordering per Pitfall 4)
6. Fires `POST /api/review` as fire-and-forget `.catch(() => {})` — not awaited
7. Calls `setQueue(nextQueue)` immediately — card advances with no perceptible delay

Keyboard handler call sites (`e.key === '1'` etc.) had `void` removed since the function no longer returns a Promise.

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Make submitReview synchronous and optimistic with client-side FSRS + fire-and-forget save | d189d57 | components/StudySession.tsx |

## Verification

- `grep "import { previewIntervalLabels, reviewCard, type Grade }" components/StudySession.tsx` → line 10 ✓
- `grep "const submitReview = (rating: number)" components/StudySession.tsx` → line 397 ✓
- `grep -c "const submitReview = async" components/StudySession.tsx` → 0 ✓
- `grep "reviewCard(cardReviewFields" components/StudySession.tsx` → line 445 ✓
- `grep "new Date(reviewData.nextReview)" components/StudySession.tsx` → line 442 ✓
- `grep -c "await fetch('/api/review'" components/StudySession.tsx` → 0 ✓
- `grep "undoRef.current = {" components/StudySession.tsx` → line 470 (before setQueue at line 488) ✓
- `grep -c "void submitReview" components/StudySession.tsx` → 0 ✓
- `npx tsc --noEmit` → exits 0 ✓
- `npm run lint` → exits 0 ✓
- `npm run build` → succeeds (24 static pages generated) ✓

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no placeholder data or unconnected UI introduced.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The POST /api/review endpoint is unchanged; the refactor only changes client-side timing (T-11-06: low, mitigated by existing server-side validation; T-11-07: accepted per D-09).

## Self-Check: PASSED

- `/Users/main/Documents/claude-test/components/StudySession.tsx` — FOUND (modified)
- Commit `d189d57` — FOUND in git log
