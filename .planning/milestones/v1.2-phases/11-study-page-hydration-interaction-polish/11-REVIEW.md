---
phase: 11-study-page-hydration-interaction-polish
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - app/api/cards/due/route.ts
  - app/cards/page.tsx
  - app/study/page.tsx
  - components/CardsClient.tsx
  - components/StudyClient.tsx
  - components/StudySession.tsx
  - lib/dto.ts
  - lib/study-cards.ts
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase refactors the study and cards pages to a server-component-with-client-island architecture, extracts the shared `getStudyCards` pipeline into `lib/study-cards.ts`, and introduces `lib/dto.ts` as a typed serialization contract across the RSC boundary. The structural work is solid — the pipeline deduplication and parallel query strategy are well-designed. However, two correctness bugs were found: a non-fatal network error in `handleUndo` silently corrupts client state, and the newly created card returned from `POST /api/cards` is missing fields that `CardDTO` and the client state require. Four additional warnings address an unsafe non-null assertion, the race condition when a filter re-fetch arrives while a session is in progress, redundant `Math.min` calls inside render causing re-renders on large lists, and the `isFilterLoading` spinner being shown even when there are zero due cards.

---

## Critical Issues

### CR-01: `handleUndo` network failure silently corrupts client state

**File:** `components/StudySession.tsx:511-529`

**Issue:** `handleUndo` is `async` and `await`s the `/api/review/undo` fetch. If the network call throws or returns a non-OK status, the `await` rejects and the function exits before the five state-restore calls (`setStats`, `setQueue`, `seenCardIdsRef.current = ...`, `setSeenCount`, `setCursor`). The result is a client whose queue, stats, and seen-card counter have been partially or fully wiped while the server still holds the post-review state — the learner sees an incorrect card, the progress bar resets to zero, and the "Card N of N" counter is wrong. The user cannot recover without a full page reload.

There is no `try/catch` around the fetch, and the error is not surfaced to the user.

**Fix:**
```typescript
const handleUndo = async () => {
  if (!undoRef.current) return
  const { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds } = undoRef.current
  undoRef.current = null
  setCanUndo(false)

  try {
    const res = await fetch('/api/review/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, prevState }),
    })
    if (!res.ok) throw new Error(`Undo failed: ${res.status}`)
  } catch {
    // Network failure: undo could not be persisted. Re-arm canUndo so the user
    // can retry, and do NOT restore client state (server is still at post-review).
    undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }
    setCanUndo(true)
    return
  }

  setStats(prevStats)
  setQueue(prevQueue)
  seenCardIdsRef.current = prevSeenCardIds
  setSeenCount(prevSeenCount)
  setCursor((c) => c + 1)
  setRevealed(true)
  setIntervalHints(null)
}
```

---

### CR-02: Newly created card from `POST /api/cards` is missing fields required by `CardDTO`, causing a runtime crash when the card is rendered

**File:** `components/CardsClient.tsx:132-133` (calls `app/api/cards/route.ts`)

**Issue:** `handleAdd` inserts the raw JSON from `POST /api/cards` directly into the `cards` state array typed as `CardDTO[]`:

```typescript
const created = await res.json()
setCards((prev) => [created, ...prev])
```

But `POST /api/cards` (`app/api/cards/route.ts`) responds with a Prisma object that includes `review: true` and `sentences` but **does not include `lesson`** (the include clause has no `lesson` field). Additionally, the `CardDTO` interface requires `lesson: LessonRefDTO | null` — without it the card row tries to access `card.lesson.orderIndex` in the JSX at line 282, throwing `Cannot read properties of undefined (reading 'orderIndex')`.

Furthermore `CardDTO` requires `normalizedFront`, `components`, `distractors`, `lessonId` — all present in the Prisma result but the Prisma response returns raw `Date` objects for `createdAt`/`updatedAt`/`review.nextReview`/`review.lastReview`, which violates the RSC serialization contract (all dates must be ISO strings). When these Date objects reach the client they serialize as empty objects `{}` in JSON, so `card.createdAt` becomes `{}` and any date-dependent display logic breaks silently.

**Fix:** Serialize the newly created card server-side (the same date→ISO-string transform applied in `CardsPage`) and include the `lesson` relation. Update `POST /api/cards`:

```typescript
// app/api/cards/route.ts — POST handler
const card = await prisma.card.create({
  data: { ... },
  include: {
    review: true,
    lesson: { select: { title: true, createdAt: true, orderIndex: true } },
    sentences: sentencesInclude,
  },
})

// Serialize dates before returning
const dto = {
  ...card,
  createdAt: card.createdAt.toISOString(),
  updatedAt: card.updatedAt.toISOString(),
  lesson: card.lesson
    ? { ...card.lesson, createdAt: card.lesson.createdAt.toISOString() }
    : null,
  review: card.review
    ? {
        ...card.review,
        nextReview: card.review.nextReview.toISOString(),
        lastReview: card.review.lastReview?.toISOString() ?? null,
      }
    : null,
  sentences: card.sentences.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  })),
}
return NextResponse.json(dto)
```

---

## Warnings

### WR-01: Unsafe non-null assertion `streakInfo!` can panic when `habitData` is set but `computeStreaks` unexpectedly returns a falsy value

**File:** `components/StudyClient.tsx:310`

**Issue:**
```typescript
const todayPct = habitData && habitData.goal > 0
  ? Math.min(100, Math.round((streakInfo!.todaySeconds / habitData.goal) * 100))
  : 0
```

`streakInfo` is computed on line 307 via `habitData ? computeStreaks(...) : null`. The outer condition `habitData && habitData.goal > 0` does not guarantee `streakInfo !== null`; if `computeStreaks` returned `null` (it can't today, but the non-null assertion makes this fragile), `streakInfo!` crashes. More practically, if the condition order ever changes — e.g., someone removes the `habitData &&` guard during a refactor — this line panics at runtime.

The `streakInfo` type returned by the `SessionComplete` component prop is typed as `{ current: number; longest: number } | null`, yet the computation accesses `todaySeconds` on it — `todaySeconds` is part of `StreakInfo` from `lib/habit.ts` but absent from the narrower prop type. This means the `SessionComplete` component cannot actually render the streak seconds for its progress ring (it receives `todayPct` already computed), but it is a type inconsistency that could cause confusion.

**Fix:** Remove the non-null assertion and use optional chaining:
```typescript
const todayPct = habitData && habitData.goal > 0 && streakInfo
  ? Math.min(100, Math.round((streakInfo.todaySeconds / habitData.goal) * 100))
  : 0
```

---

### WR-02: Filter re-fetch races with an in-progress study session — stale `studyCards` can silently replace live session data

**File:** `components/StudyClient.tsx:68-81`

**Issue:** `loadDue` fires a fetch and unconditionally overwrites `studyCards` via `setStudyCards` when it resolves, regardless of the current `phase`. If the user opens the filter sheet and changes the lesson range while a session is in progress (`phase === 'studying'`), the resolved fetch sets `studyCards` to the new range's cards and resets `scope` to `'due'`. Although `StudySession` is rendered with the prop value captured at `phase === 'studying'` and a key, the session's "Study N more →" button (`startAhead`) closes over the stale `lessonFrom`/`lessonTo` — but the more immediate problem is that `handleRangeChange` closes the filter sheet (line 105) before the fetch completes, so there is no guard preventing `loadDue` from completing while `phase === 'studying'`.

When the user finishes the in-progress session and hits "Study N more →", `startAhead` calls `buildParams` with the new range (correct), but `studyCards` was already overwritten, so the completion screen shows a count from the new range's due cards rather than the intended ahead count.

**Fix:** Guard the state update in `loadDue` against the current phase:
```typescript
const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
  setIsFilterLoading(true)
  fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
    .then((r) => r.json())
    .then((cards: CardDTO[]) => {
      // Only apply if we're not mid-session
      setPhase((currentPhase) => {
        if (currentPhase !== 'select-mode') return currentPhase
        setStudyCards(cards)
        setScope('due')
        setIsFilterLoading(false)
        return currentPhase
      })
    })
    ...
}, [buildParams])
```
Or more simply, disable/close the filter sheet when `phase !== 'select-mode'` so the user cannot trigger a re-fetch mid-session.

---

### WR-03: `isFilterLoading` spinner is shown in the wrong branch — the loading indicator can appear on the "no cards" path

**File:** `components/StudyClient.tsx:234-247`

**Issue:** The `isFilterLoading` spinner is rendered inside the `noDue ? ... : ...` branch's false arm (the "cards ready" arm):

```tsx
{noDue ? (
  <div ...>...</div>
) : (
  <div className="flex flex-col items-center gap-6 py-6">
    {isFilterLoading ? (
      <Loader2 ... />
    ) : (
      <p>{studyCards.length} cards ready</p>
    )}
  </div>
)}
```

`noDue` is `studyCards.length === 0`. After a filter re-fetch completes with zero results, `studyCards` becomes `[]`, `noDue` becomes `true`, and the loading spinner is bypassed entirely — the user jumps directly to the "No cards due" message with no spinner ever showing (the spinner only ever appears when there are cards, which is when the user least needs reassurance). During the fetch, if cards were present before, the spinner shows correctly. But if the user had zero cards and changes the filter, they never see the loading state at all.

This is a minor UX correctness issue: the spinner should cover both the "zero cards" path and the "non-zero cards" path during a filter re-fetch so the user knows their selection is being applied.

**Fix:** Hoist the `isFilterLoading` check above the `noDue` branch:

```tsx
{isFilterLoading ? (
  <div className="h-16 flex items-center justify-center" role="status" aria-label="Loading cards">
    <Loader2 className="w-5 h-5 animate-spin text-muted" />
  </div>
) : noDue ? (
  <div>...</div>
) : (
  <div>...</div>
)}
```

---

### WR-04: `Math.min(i * 25, 250)` called with `Math.random()`-free logic during render but creates a new `style` object on every render, defeating React reconciliation for large lists

**File:** `components/CardsClient.tsx:272` and `components/CardsClient.tsx:356`

**Issue:** Each card row and each sentence row is rendered with:
```tsx
style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}
```

The inner expression is pure and deterministic, but the object literal `{ animationDelay: '...' }` is allocated fresh on every render, causing React to treat the `style` prop as changed even when the value is the same. For large card lists (hundreds of cards), this triggers a reconciliation pass that re-applies `style` to every DOM node on each filter change or state update. This is a correctness issue (unnecessary DOM mutations) more than a performance issue per se, and the animation fires again unintentionally when any parent state changes (e.g., editing a card).

The deeper problem is that running `animate-slide-in` on every render re-triggers the CSS animation each time any `cards` state change occurs — for example, after a delete, the entire remaining list re-animates.

**Fix:** Move animation to a CSS approach that only fires on mount, or memoize the style object:
```tsx
// Option A: use a CSS class that only animates once (via animation-fill-mode: both)
// Option B: memoize the style values via useMemo (though this is complex for list items)
// Option C: Remove the per-index delay and animate the container once:
<div className="flex flex-col gap-2 animate-slide-in">
  {groupCards.map((card) => <SwipeRow key={card.id} ...>...))}
</div>
```

---

## Info

### IN-01: `INTEGER_RE` is defined inside the request handler, re-creating it on every request

**File:** `app/api/cards/due/route.ts:16`

**Issue:**
```typescript
const INTEGER_RE = /^[1-9]\d*$/
```
This regex literal is inside `GET(req)`, so a new `RegExp` object is allocated and compiled on every request. At the scale of this app this is negligible, but it is an unnecessary allocation that would be better placed as a module-level constant.

**Fix:** Move to module scope:
```typescript
// Module-level — compiled once
const INTEGER_RE = /^[1-9]\d*$/

export async function GET(req: NextRequest) { ... }
```

---

### IN-02: `handleAdd` does not show an error to the user on failure — the "Add Card" button silently does nothing

**File:** `components/CardsClient.tsx:122-141`

**Issue:** When `POST /api/cards` fails, the error is logged to `console.error` and `adding` is reset to `false`, leaving the Sheet open with the same inputs and no feedback. The user sees the "Add Card" button re-enable with no explanation of what went wrong. This is especially confusing on mobile where the console is invisible.

**Fix:** Add a local `addError` state and render it in the sheet:
```tsx
const [addError, setAddError] = useState<string | null>(null)

// In handleAdd catch block:
} catch (err) {
  console.error('Add card failed:', err)
  setAddError('Could not save card. Please try again.')
} finally {
  setAdding(false)
}

// In JSX:
{addError && <p className="text-sm text-red-500">{addError}</p>}
```

---

_Reviewed: 2026-06-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
