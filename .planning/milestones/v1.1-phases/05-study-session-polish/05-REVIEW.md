---
phase: 05-study-session-polish
reviewed: 2026-06-27T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - app/globals.css
  - components/StudySession.tsx
findings:
  critical: 2
  warning: 4
  info: 2
  total: 8
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-06-27
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Two source files were reviewed: `app/globals.css` (the Tailwind v4 theme layer and animation utilities) and `components/StudySession.tsx` (the full study session component covering flashcard, multiple-choice, and fill-in-the-blank modes). The CSS file is well-structured with only one gap in the manual light-mode override block. The React component is large (~887 lines) but coherent; the sentence-selection and FSRS logic are correct. The primary correctness risks are: (1) an API error in `submitReview` that goes unchecked and silently corrupts FSRS state, and (2) a double-submit race condition in all three study modes. Secondary issues involve incomplete dark-mode token mirroring in the light theme override and missing `res.ok` checks in undo.

---

## Critical Issues

### CR-01: `submitReview` does not check `res.ok` before consuming the response body — network/server errors silently corrupt queue state

**File:** `components/StudySession.tsx:403-416`

**Issue:** After `POST /api/review`, the code unconditionally calls `res.json()`. When the server returns a 4xx/5xx (e.g., 404 "Card review not found", 500 DB error), `res.json()` will either resolve to an error object `{ error: "…" }` or reject. The `.catch(() => null)` absorbs the rejection, so `updatedReview` becomes `null`. When `null`, the `if (updatedReview?.nextReview)` branch is skipped — meaning `requeue` stays `false` and `updatedItem` keeps the *stale* (pre-review) state. Then the code still removes the card from the queue and calls `setCanUndo(true)` with a `prevState` snapshot. The result: the card leaves the queue as though it was reviewed, the DB row was never updated, and undo now writes back the old stale state — corrupting the FSRS schedule. The user sees no error.

```tsx
// Current (line 403):
const res = await fetch('/api/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cardId, rating }),
})
const updatedReview = await res.json().catch(() => null) as Card['review']

// Fix: check res.ok before consuming body; abort review on error
if (!res.ok) {
  // Surface the error to the user without advancing the queue
  console.error('Review API error', res.status)
  // Reset stats increment
  setStats((s) => ({
    reviewed: s.reviewed - 1,
    correct: s.correct - (isCorrect ? 1 : 0),
    incorrect: s.incorrect - (isCorrect ? 0 : 1),
  }))
  reviewBuffer.current -= 1
  return
}
const updatedReview = await res.json().catch(() => null) as Card['review']
```

---

### CR-02: Double-submit race condition — Grade buttons are not disabled during in-flight `submitReview` fetch

**File:** `components/StudySession.tsx:813-851` (flashcard) and `872-882` (fill-blank)

**Issue:** `submitReview` is `async` and `await`s a `POST /api/review` that typically takes 100–500 ms. During that window the grade buttons (Again / Hard / Good / Easy, Wrong / Correct) remain fully interactive. A double-tap or fast second click dispatches a second `POST /api/review` for the same `cardId` with potentially a different rating. Both responses race; whichever finishes second determines the final DB state, but the queue has already advanced twice: stats are double-counted, `cursor` is incremented twice, and two undo snapshots overwrite each other. On slow connections (e.g., mobile 3G) this window is several seconds wide.

The fill-blank `Check Answer` button (`handleReveal`) is correctly protected by `disabled={revealed}`, but once revealed, the Wrong/Correct buttons have no equivalent guard.

```tsx
// Fix: add an in-flight guard ref and disable buttons during submission
const isSubmitting = useRef(false)

const submitReview = async (rating: number) => {
  if (isSubmitting.current) return
  isSubmitting.current = true
  try {
    // ... existing body ...
  } finally {
    isSubmitting.current = false
  }
}

// On buttons (flashcard & fill-blank revealed):
// Use a parallel state flag to drive disabled= so React re-renders them:
const [submitting, setSubmitting] = useState(false)
// Set true at start of submitReview, false in finally.
// Pass disabled={submitting} to all grade buttons.
```

---

## Warnings

### WR-01: `data-theme="light"` override is incomplete — dark-OS users in manual Light mode see wrong muted/border/highlight colors

**File:** `app/globals.css:98-105`

**Issue:** The `@media (prefers-color-scheme: dark)` block overrides `--muted`, `--muted-foreground`, `--border`, `--highlight-bg`, and `--highlight-fg` at specificity 0,1,0. The `:root[data-theme="light"]` block (specificity 0,2,0) overrides surface and background tokens but does **not** reset those five tokens. When a user's OS is in dark mode and they set the in-app toggle to "Light", the media query's dark values for muted/border/highlight persist because the light override never cancels them. Concretely: card borders appear gray-700 (`#374151`) instead of gray-200 (`#e5e7eb`), secondary text appears gray-400 instead of gray-500, and the sentence highlight marker is amber-on-amber-900 instead of amber-on-yellow.

The convention in `CLAUDE.md` explicitly states: "When adding a dark value, mirror it in BOTH the media-query block AND the `:root[data-theme="dark"]` block." The inverse — resetting dark values in the `light` override — is equally required for correctness.

```css
/* Fix: add missing tokens to data-theme="light" */
:root[data-theme="light"] {
  --background: #f9fafb;
  --foreground: #171717;
  --surface-1: #ffffff;
  --surface-2: #f9fafb;
  --surface-3: #f3f4f6;
  /* Add these: */
  --muted: #6b7280;
  --muted-foreground: #4b5563;
  --border: #e5e7eb;
  --highlight-bg: #fde68a;
  --highlight-fg: #78350f;
  color-scheme: light;
}
```

---

### WR-02: `handleUndo` advances the queue even when the undo API call fails

**File:** `components/StudySession.tsx:451-467`

**Issue:** `handleUndo` calls `await fetch('/api/review/undo', …)` but never inspects the response status. If the undo API returns a 4xx/5xx (e.g., race condition where the card no longer exists), the fetch resolves without error but the DB row was never reverted. The code then unconditionally restores `prevQueue` and `prevStats` in the UI, so the display shows the card as un-reviewed while the DB still has the post-review FSRS values. The learner may re-answer the card in the session, writing a second review on top of the already-committed first one.

```tsx
// Fix: check res.ok before restoring state
const res = await fetch('/api/review/undo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cardId, prevState }),
})
if (!res.ok) {
  // Undo failed — do not restore queue; re-enable undo if appropriate or show toast
  return
}
// Only restore state on success:
setStats(prevStats)
setQueue(prevQueue)
```

---

### WR-03: Flashcard grade buttons lack `aria-disabled` and screen-reader feedback during the async fetch

**File:** `components/StudySession.tsx:816-850`

**Issue:** Related to CR-02 but distinct. Even if a submission guard is added via a ref (not state), the buttons will not convey their disabled state to assistive technology because `disabled=` is not applied. A screen reader user who double-activates a button via keyboard gets no feedback that the first tap is still in-flight. The keyboard handler at line 502–505 also lacks this guard — pressing 1/2/3/4 rapidly fires multiple `void submitReview(n)` calls.

This is especially important here because the keyboard shortcuts (lines 502–505, 508–509) fire `void submitReview()` without any guard whatsoever.

```tsx
// Fix: keyboard handler guard
if (!revealed) { ... }
else {
  if (mode === 'flashcard' && !isSubmitting.current) {
    if (e.key === '1') { e.preventDefault(); void submitReview(1) }
    // ...
  }
}
```

---

### WR-04: `exampleOffset` is not reset when `chosenIdx` changes between re-queued appearances of the same card

**File:** `components/StudySession.tsx:145, 351, 439`

**Issue:** When a card is re-queued (after "Again"), `exampleOffset` is reset to `0` in `submitReview` (line 439). However, `chosenIdx` itself may differ on the re-queue if `reps` incremented (the `(hashStr(id) + reps) % candidates.length` tie-break). The modular arithmetic at line 351 wraps `chosenIdx + exampleOffset` correctly over `cardSentences.length`. No out-of-bounds panic occurs. But `exampleOffset` accumulating across re-queues would show a rotating sentence other than the newly selected `chosenIdx`. Because `exampleOffset` *is* reset at line 439, the bug only occurs if the user taps "See another example →" on the *back face* of a card and then undo (`handleUndo`) is invoked — undo restores the entire queue snapshot but does **not** reset `exampleOffset`. After undo the back face renders `cardSentences[(restoredChosenIdx + staleOffset) % len]` instead of `cardSentences[restoredChosenIdx]`.

```tsx
// Fix: reset exampleOffset inside handleUndo
setExampleOffset(0)
// (alongside setRevealed(true) at line 465)
```

---

## Info

### IN-01: `submitReview` click handlers omit `void` — floating promises on button `onClick`

**File:** `components/StudySession.tsx:817, 826, 835, 844, 874, 878`

**Issue:** Six button `onClick` handlers call `submitReview(n)` without `void`:

```tsx
onClick={() => submitReview(1)}
```

`submitReview` is `async`, so each call returns a `Promise<void>`. React ignores the return value of event handlers, so there is no runtime failure, and ESLint's `no-floating-promises` rule does not fire on inline arrow functions. However, the keyboard-shortcut handlers at lines 502–509 correctly use `void submitReview(n)`. For consistency (and to make any future migration to `eslint-plugin-react` rules easier) these should also use `void`:

```tsx
onClick={() => void submitReview(1)}
```

---

### IN-02: `console.error` left in production path for distractor parse failure

**File:** `components/StudySession.tsx:238`

**Issue:** A `try/catch` around `JSON.parse(item.card.distractors)` (in `mcOptions` memo) calls `console.error('Failed to parse distractors for card', item.card.id, err)`. Logging to the console in production is a minor quality defect in this codebase (CLAUDE.md does not explicitly forbid it, but no other production path uses `console.error`). This also leaks internal card IDs to the browser console. Consider replacing with a silent fallback or a structured error metric if one is ever added.

```tsx
// Fix: remove console.error, keep the graceful fallback
} catch {
  distractors = []
}
```

---

_Reviewed: 2026-06-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
