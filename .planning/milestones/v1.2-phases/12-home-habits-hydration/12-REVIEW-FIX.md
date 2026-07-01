---
phase: 12-home-habits-hydration
fixed_at: 2026-06-30T12:00:00Z
review_path: .planning/phases/12-home-habits-hydration/12-REVIEW.md
iteration: 2
fix_scope: all
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-06-30T12:00:00Z
**Source review:** .planning/phases/12-home-habits-hydration/12-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: HabitTracker standalone fetch swallows API errors silently

**Files modified:** `components/HabitTracker.tsx`
**Commit:** decfa51
**Applied fix:** Added `if (!r.ok) throw new Error(\`activity ${r.status}\`)` guard in the standalone `/api/activity` fetch chain, between the `fetch()` call and `.json()`. Error responses (4xx/5xx with JSON bodies) now throw and fall through to the existing `.catch()` handler, which sets safe defaults. Matches the `r.ok` guard pattern already present in `HomeClient.tsx`'s `loadStats` and `loadActivity` callbacks.

### IN-01: Comment typo — missing closing quote in `lib/dashboard.ts`

**Files modified:** `lib/dashboard.ts`
**Commit:** 3e35f67
**Applied fix:** Changed `// No 'use client —` to `// No 'use client' —` on line 2, restoring the conventional comment format used throughout the codebase.

### IN-02: Redundant SSR guard in `checkBandUp` callback

**Files modified:** `components/HomeClient.tsx`
**Commit:** 7dc67b0
**Applied fix:** Removed both `typeof window !== 'undefined'` guards inside `checkBandUp`. Since the function is a `useCallback` only ever invoked from `useEffect` hooks inside a `'use client'` component, `localStorage` is always available. `localStorage.getItem` and `localStorage.setItem` are now called directly without the dead-code SSR branches.

### IN-03: Unnecessary runtime type guard on a TypeScript-typed field

**Files modified:** `components/HomeClient.tsx`
**Commit:** 786396a
**Applied fix:** Removed the `{typeof stats.masteredCount === 'number' && (...)}` wrapper. `ProficiencyArc` is now rendered unconditionally as `<ProficiencyArc masteredCount={stats.masteredCount} />`. `masteredCount` is declared as a non-nullable `number` in `StatsDTO` so the guard was always `true` and misleadingly suggested the value might be absent.

---

_Fixed: 2026-06-30T12:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
