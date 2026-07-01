---
phase: 09-skeleton-loading-screens
fixed_at: 2026-06-29T00:00:00Z
review_path: .planning/phases/09-skeleton-loading-screens/09-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-06-29
**Source review:** .planning/phases/09-skeleton-loading-screens/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-01, WR-02, WR-03)
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: Skeleton elements invisible in light mode

**Files modified:** `app/cards/loading.tsx`, `app/study/loading.tsx`, `app/habits/loading.tsx`
**Commit:** bd4d250
**Applied fix:** Replaced all `bg-surface-2` with `bg-surface-3` across all three loading skeleton files. `--surface-3` is `#f3f4f6` in light mode (clearly distinct from the `#f9fafb` background), making skeleton elements visible in both light and dark modes. Also included the WR-03 width fix in this commit (see WR-03 below).

---

### CR-02: `animate-pulse` not suppressed under `prefers-reduced-motion`

**Files modified:** `app/globals.css`
**Commit:** dc284b0
**Applied fix:** Added `.animate-pulse { animation: none; }` to the existing `@media (prefers-reduced-motion: reduce)` block (after the `.ring-fill` entry). Tailwind's `animate-pulse` utility was not covered by the project's existing reduced-motion overrides.

---

### WR-01: `/habits` inline loading guard causes three-phase loading sequence

**Files modified:** `app/habits/page.tsx`
**Commit:** e2b915f
**Applied fix:** Added `import HabitsLoading from './loading'` and replaced the five-line inline `if (days === null)` early-return block (which rendered a plain "Loading…" text inside a mismatched `<main>` wrapper) with `if (days === null) return <HabitsLoading />`. This eliminates the skeleton → text-spinner → content three-phase sequence and removes the layout shift from the extra `<main>` wrapper.

---

### WR-02: Study skeleton renders wrong phase of the study UI

**Files modified:** `app/study/loading.tsx`
**Commit:** bd4d250
**Applied fix:** Replaced the mid-session skeleton (progress bar + 220px flashcard + start button) with a skeleton matching the actual first-render state of `/study` (mode selector pill placeholder + lesson range area placeholder + start button placeholder). All three elements use `bg-surface-3`. Included in the same commit as CR-01 since both touch `app/study/loading.tsx`.

---

### WR-03: Cards "Add" button placeholder too wide (`w-24` vs real ~`w-20`)

**Files modified:** `app/cards/loading.tsx`
**Commit:** bd4d250
**Applied fix:** Changed the add-button placeholder from `w-24` (96px) to `w-20` (80px), matching the real button's approximate content width. Also updated to `bg-surface-3` as part of the CR-01 fix. Included in the same commit as CR-01 since both touch `app/cards/loading.tsx`.

---

_Fixed: 2026-06-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
