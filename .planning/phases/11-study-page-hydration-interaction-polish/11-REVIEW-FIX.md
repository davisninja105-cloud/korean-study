---
phase: 11-study-page-hydration-interaction-polish
fixed_at: 2026-06-29T00:00:00Z
review_path: .planning/phases/11-study-page-hydration-interaction-polish/11-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-06-29T00:00:00Z
**Source review:** .planning/phases/11-study-page-hydration-interaction-polish/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: `handleUndo` network failure silently corrupts client state

**Files modified:** `components/StudySession.tsx`
**Commit:** e980115
**Applied fix:** Wrapped the `/api/review/undo` fetch in a `try/catch` block. On network failure or non-OK response, the undo snapshot is restored to `undoRef.current` and `canUndo` is re-armed so the user can retry. State restoration (queue, stats, seenCardIds, seenCount, cursor) only happens after a confirmed successful fetch response.

---

### CR-02: Newly created card from `POST /api/cards` missing fields required by `CardDTO`

**Files modified:** `app/api/cards/route.ts`
**Commit:** 774542c
**Applied fix:** Added `lesson: { select: { title: true, createdAt: true, orderIndex: true } }` to the `include` clause of `prisma.card.create`. Added date serialization for the response: `card.createdAt`, `card.updatedAt`, `card.lesson.createdAt`, `card.review.nextReview`, `card.review.lastReview`, and `card.sentences[].createdAt/updatedAt` are all converted to ISO strings via `.toISOString()` before `NextResponse.json()`. This satisfies the `CardDTO` contract and prevents the client crash when accessing `card.lesson.orderIndex`.

---

### WR-01: Unsafe non-null assertion `streakInfo!`

**Files modified:** `components/StudyClient.tsx`
**Commit:** 04d92d2
**Applied fix:** Changed `streakInfo!.todaySeconds` to include `streakInfo` in the ternary condition guard: `habitData && habitData.goal > 0 && streakInfo ? streakInfo.todaySeconds : 0`. Removes the non-null assertion so TypeScript enforces the null check.

---

### WR-02: Filter re-fetch races with in-progress study session

**Files modified:** `components/StudyClient.tsx`
**Commit:** 1ff390e
**Applied fix:** In the `loadDue` callback's `.then()` handler, wrapped the state updates (`setStudyCards`, `setScope`, `setIsFilterLoading`) inside a `setPhase` functional updater that checks `currentPhase !== 'select-mode'` before applying. If the phase has moved to `'studying'` or `'complete'` by the time the fetch resolves, the stale cards are discarded and study state is not overwritten. The `.catch()` block no longer clears `studyCards` (only clears `isFilterLoading`) to avoid accidentally wiping study session data on network error.

---

### WR-03: `isFilterLoading` spinner shown in wrong branch

**Files modified:** `components/StudyClient.tsx`
**Commit:** 3786458
**Applied fix:** Hoisted the `isFilterLoading` check to the outermost conditional, before the `noDue` check. The render order is now: `isFilterLoading` spinner first, then `noDue` branch, then the cards-ready branch. This ensures users who had zero cards and change the lesson filter see the loading spinner during the fetch rather than jumping directly to "No cards due."

---

### WR-04: `Math.min(i * 25, 250)` creates new style objects on every render

**Files modified:** `components/CardsClient.tsx`
**Commit:** 7ebfe15
**Applied fix:** Moved `animate-slide-in` from each individual card/sentence `<div>` to the group container (`<div key={key} className="flex flex-col gap-2 animate-slide-in">` for the cards view) and the sentence list container (`<div className="flex flex-col gap-3 animate-slide-in">` for the reading practice view). Removed `style={{ animationDelay: ... }}` from each list item. This eliminates per-render style object allocation and prevents the animation from re-firing on unrelated state updates (e.g., card edits or deletes).

---

### IN-01: `INTEGER_RE` defined inside request handler, re-created per request

**Files modified:** `app/api/cards/due/route.ts`
**Commit:** ec558a1
**Applied fix:** Moved `const INTEGER_RE = /^[1-9]\d*$/` from inside `GET(req)` to module scope (above the function). Added a comment explaining the intent. The regex is now compiled once when the module is loaded rather than on every incoming request.

---

### IN-02: `handleAdd` does not show error to user on failure

**Files modified:** `components/CardsClient.tsx`
**Commit:** cc82827
**Applied fix:** Added `const [addError, setAddError] = useState<string | null>(null)` state. In `handleAdd`, `setAddError(null)` is called at the start (clearing any prior error) and `setAddError('Could not save card. Please try again.')` is called in the catch block. The Sheet's `onClose` handler also clears `addError` so stale errors don't persist when the user re-opens the sheet. Added `{addError && <p className="text-sm text-red-500 dark:text-red-400">{addError}</p>}` in the Add Card Sheet JSX above the submit button.

---

_Fixed: 2026-06-29T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
