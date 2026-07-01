---
phase: 09-skeleton-loading-screens
reviewed: 2026-06-29T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - app/cards/loading.tsx
  - app/study/loading.tsx
  - app/habits/loading.tsx
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-29
**Depth:** standard
**Files Reviewed:** 3 (supporting context: `app/globals.css`, `app/habits/page.tsx`, `app/cards/page.tsx`)
**Status:** issues_found

## Summary

Three route-segment `loading.tsx` skeleton screens were added for `/cards`, `/study`, and `/habits`. The files are correctly structured as pure server components — no `'use client'` directive, no hooks. Two critical defects were found on closer inspection of the token values in `globals.css`. First, in light mode `--surface-2` resolves to `#f9fafb`, which is identical to `--background` (`#f9fafb`), making every top-level skeleton placeholder element invisible in light mode. Second, Tailwind's `animate-pulse` animation is not suppressed in the existing `@media (prefers-reduced-motion: reduce)` block, so users with reduced-motion preferences still receive a continuously pulsing UI. Three additional warnings cover the `/habits` inline loading guard that competes with the new skeleton, a fixed card height in the study skeleton that causes layout shift, and a width mismatch on the cards add-button placeholder. Two info items note key usage and accessibility annotation.

---

## Critical Issues

### CR-01: Skeleton elements invisible in light mode — `bg-surface-2` resolves to same value as page background

**File:** `app/cards/loading.tsx:6-8,12`, `app/study/loading.tsx:5-9`, `app/habits/loading.tsx:7-32`

**Issue:** In `app/globals.css`, the light-mode CSS custom properties are:

```css
--background: #f9fafb;   /* line 18 */
--surface-2:  #f9fafb;   /* line 31 */
```

These are identical. Every standalone skeleton element that uses `bg-surface-2` is placed against the `body { background: var(--background) }` — zero contrast. The skeleton is fully invisible to light-mode users and to System-mode users on a machine set to light OS theme.

Dark mode is unaffected: `--surface-2: #141824` and `--background: #0b0f1a` are distinct.

Affected elements (representative): the search input placeholder (`cards/loading.tsx:6`), filter-icon placeholder (`loading.tsx:7`), add-button placeholder (`loading.tsx:8`), view-toggle pill (`loading.tsx:12`), progress bar (`study/loading.tsx:5`), flashcard area (`study/loading.tsx:7`), start-button (`study/loading.tsx:9`), header title/link (`habits/loading.tsx:6-7`), streak hero (`habits/loading.tsx:11`), stat grid cells (`habits/loading.tsx:18`), trend block (`habits/loading.tsx:26`), heatmap block (`habits/loading.tsx:32`). The only elements that remain visible in light mode are card-row wrappers (`bg-surface-1` = `#ffffff`) — but the inner text-line placeholders inside them (`bg-surface-2` on white) are still only barely perceptible (#f9fafb on #ffffff = ~2 % luminance delta).

**Fix:** Use `bg-surface-3` for skeleton fills. `--surface-3` is `#f3f4f6` in light mode — clearly distinct from the `#f9fafb` background — and `#0b0f1a` in dark mode (still distinct from `--surface-2: #141824`). No new token needed:

```diff
- <div className="h-11 rounded-lg bg-surface-2 animate-pulse flex-1 min-w-0" />
+ <div className="h-11 rounded-lg bg-surface-3 animate-pulse flex-1 min-w-0" />
```

Apply the same substitution to all `bg-surface-2 animate-pulse` occurrences across all three loading files. Inner fills that sit inside a `bg-surface-1` card container may keep `bg-surface-2` if the contrast is acceptable (white → #f9fafb), but `bg-surface-3` is safer and consistent.

---

### CR-02: `animate-pulse` not suppressed under `prefers-reduced-motion`

**File:** `app/cards/loading.tsx:6-20`, `app/study/loading.tsx:5-9`, `app/habits/loading.tsx:7-32`
**Supporting file:** `app/globals.css:254-264`

**Issue:** The `@media (prefers-reduced-motion: reduce)` block in `globals.css` suppresses only the project's own named CSS classes:

```css
@media (prefers-reduced-motion: reduce) {
  .animate-reveal   { animation: none; opacity: 1; transform: none; }
  .animate-card-in  { animation: none; opacity: 1; transform: none; }
  .animate-burst    { animation: none; opacity: 0; }
  .card-flip-inner  { transition: none; }
  .animate-sheet    { animation: fadeBackdrop 0.2s ease forwards; }
  .animate-backdrop { animation: none; opacity: 1; }
  .animate-slide-in { animation: none; opacity: 1; transform: none; }
  .ring-fill        { animation: none; transition: none; }
}
```

Tailwind's `animate-pulse` is not a project class — it is a Tailwind-generated utility that injects `animation: pulse 2s cubic-bezier(…) infinite` directly on the element. It is not present in this block, so OS-level "Reduce Motion" has no effect on the skeleton pulse. Every element in all three skeleton files continuously pulses for users who have explicitly requested no animation.

**Fix:** Add a single override inside the existing reduced-motion block in `app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  /* existing entries … */
  .animate-pulse { animation: none; }
}
```

---

## Warnings

### WR-01: `/habits` skeleton competes with page's own inline loading guard

**File:** `app/habits/loading.tsx:1-36` and `app/habits/page.tsx:107-113`

**Issue:** After the `loading.tsx` skeleton disappears and the `HabitsPage` component mounts, it fetches `/api/activity` and `/api/stats` client-side. Until those fetches resolve, `days` is `null` and the page renders its own fallback (lines 107-113):

```tsx
if (days === null) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="h-40 flex items-center justify-center text-muted text-sm">Loading…</div>
    </main>
  )
}
```

This produces a three-phase sequence for the user: (1) skeleton → (2) plain "Loading…" text spinner → (3) real content. Phase 2 is visually worse than phase 1, and introduces an additional `<main>` wrapper that does not exist in the `loading.tsx` version, causing a structural layout shift between phases 1 and 2.

**Fix:** Remove the `if (days === null)` early-return guard (lines 107-113 of `app/habits/page.tsx`) and either return `null` or re-render the skeleton component:

```tsx
import HabitsLoading from './loading'

// …

if (days === null) return <HabitsLoading />
```

This makes the inline client-fetch loading state visually identical to the server-navigation loading state.

---

### WR-02: Study skeleton renders the wrong phase of the study UI

**File:** `app/study/loading.tsx:3-11`

**Issue:** The skeleton shows a progress bar (`h-3`) + flashcard area (`h-[220px]`) + start button, which corresponds to the mid-session state of `StudySession`. However, when `/study` first loads, the page renders a mode selector and lesson-range filter (the pre-session `'select-mode'` phase) — not a progress bar and flashcard. On hydration, the skeleton is replaced by a completely different element structure, producing a large layout shift and a non-representative skeleton.

Additionally, `h-[220px]` is a magic number. The real flashcard height is dynamic (measured via `useLayoutEffect` in `StudySession`), varying by card content. Even if the skeleton were shown in the correct context, this fixed value would cause a CLS event.

**Fix:** Match the skeleton to the actual first-render output of the `/study` page (mode selector pill + lesson range filter area + start button). If the intent is to show the mid-session state, document the height assumption with a comment:

```tsx
{/* Mode selector placeholder */}
<div className="h-12 w-full rounded-xl bg-surface-3 animate-pulse" />
{/* Lesson range placeholder */}
<div className="h-10 w-64 rounded-lg bg-surface-3 animate-pulse" />
{/* Start button placeholder */}
<div className="h-12 w-full rounded-xl bg-surface-3 animate-pulse" />
```

---

### WR-03: Cards skeleton "Add" button placeholder is wider than the real button

**File:** `app/cards/loading.tsx:8`

**Issue:** The third element in the top-bar skeleton uses `w-24` (96 px). The real Add button in `app/cards/page.tsx` (line 211) is `px-3 py-2 min-h-11 text-sm rounded-lg shrink-0` — content-sized with no fixed width, rendering narrower than 96 px (approximately 72–80 px for the "Add card" label). This extra width causes a minor but visible layout jump in the search row when the skeleton hands off to the real page.

**Fix:** Remove the fixed `w-24` or replace it with a narrower estimate. The filter-icon button is `w-11`; the add button is slightly wider due to text. A `w-20` approximation would be closer:

```diff
- <div className="h-11 w-24 rounded-lg bg-surface-2 animate-pulse shrink-0" />
+ <div className="h-11 w-20 rounded-lg bg-surface-3 animate-pulse shrink-0" />
```

---

## Info

### IN-01: Array index used as `key` prop in static skeleton lists

**File:** `app/cards/loading.tsx:15`, `app/habits/loading.tsx:17`

**Issue:** Both files use `key={i}` (loop index) in `Array.from({ length: N }).map`. For a fixed-length, never-reordered static list this causes no runtime bug — React will never reconcile these items in a way that the key order matters. The project's ESLint config (`eslint-config-next`) does not enable `react/no-array-index-key`, so there is no lint failure. This is a style note.

**Fix (optional):** Use a prefixed string key to be explicit and future-proof:

```tsx
Array.from({ length: 5 }, (_, i) => (
  <div key={`card-skel-${i}`} …>
```

---

### IN-02: No accessibility annotation on skeleton containers

**File:** `app/cards/loading.tsx:3`, `app/study/loading.tsx:3`, `app/habits/loading.tsx:3`

**Issue:** Screen readers encounter the skeleton DOM (unlabeled colored divs) with no indication that content is loading. Adding `role="status"` and a visually-hidden label would allow assistive technology to announce the loading state.

**Fix:**

```tsx
<div role="status" aria-label="Loading" className="flex flex-col gap-4">
  <span className="sr-only">Loading…</span>
  {/* skeleton elements */}
</div>
```

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
