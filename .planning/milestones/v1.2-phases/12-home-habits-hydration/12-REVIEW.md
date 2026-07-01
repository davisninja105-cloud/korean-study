---
phase: 12-home-habits-hydration
reviewed: 2026-06-30T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - lib/dashboard.ts
  - lib/dto.ts
  - app/api/stats/route.ts
  - app/api/activity/route.ts
  - components/HomeClient.tsx
  - app/page.tsx
  - components/HabitTracker.tsx
  - components/HabitsClient.tsx
  - app/habits/page.tsx
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-30T12:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Nine source files covering the home/habits hydration refactor were reviewed: the shared `lib/dashboard.ts` data layer, `lib/dto.ts` DTO types, two API routes (`/api/stats`, `/api/activity`), the Home and Habits RSC pages, and three client components (`HomeClient`, `HabitTracker`, `HabitsClient`).

The architecture is sound. The RSC→client split is correct, the `react-hooks/purity` and `react-hooks/set-state-in-effect` patterns are applied consistently, `isMountedRef` guards prevent state-after-unmount, and both API routes wrap their bodies in `try/catch`. The milestone-guard logic in `HabitTracker` correctly seeds a baseline streak on first real `today` to prevent spurious celebrations.

One warning-level defect was found: the standalone (no-props) fetch path in `HabitTracker` does not check `r.ok` before calling `.json()`, silently consuming error responses as if they were valid activity data. Three info-level issues round out the findings.

## Warnings

### WR-01: `HabitTracker` standalone fetch swallows API errors silently

**File:** `components/HabitTracker.tsx:49–57`

**Issue:** The standalone (no-props) code path that calls `/api/activity` passes the raw `Response` straight to `.json()` without first asserting `r.ok`. When the API returns a 4xx or 5xx error with a JSON body — which is exactly what every project API route does (`{ error: 'Database error' }`) — `r.json()` succeeds and `d` becomes `{ error: '...' }`. The `??` defaults then silently collapse `d.days` to `[]`, `d.dayStartHour` to `DEFAULT_DAY_START_HOUR`, and `d.dailyGoalSeconds` to `DEFAULT_GOAL_SECONDS`. The user sees an empty habit tracker with no indication that something went wrong. The `.catch()` handler only fires if `.json()` itself rejects (non-JSON body), so it does not cover this case.

This is inconsistent with the `loadStats` and `loadActivity` callbacks in `HomeClient.tsx` (lines 60 and 70–71), which both check `r.ok` and throw before calling `.json()`.

**Fix:**

```ts
fetch('/api/activity')
  .then((r) => {
    if (!r.ok) throw new Error(`activity ${r.status}`)
    return r.json()
  })
  .then((d) => {
    const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
    setToday(habitDateStr(hour))
    setDays(d.days ?? [])
    setGoal(d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
  })
  .catch(() => {
    setToday(habitDateStr(DEFAULT_DAY_START_HOUR))
    setDays([])
  })
```

## Info

### IN-01: Comment typo — missing closing quote in `lib/dashboard.ts`

**File:** `lib/dashboard.ts:2`

**Issue:** `// No 'use client — this module runs server-side only.` is missing the closing `'` on the `'use client'` token. The conventional wording used elsewhere in the codebase is `// No 'use client' — …`.

**Fix:** Change line 2 to `// No 'use client' — this module runs server-side only.`

---

### IN-02: Redundant SSR guard in `checkBandUp` callback

**File:** `components/HomeClient.tsx:43, 52–54`

**Issue:** `checkBandUp` is a `useCallback` that wraps two `localStorage` accesses behind `typeof window !== 'undefined'` guards. Because `HomeClient` is a `'use client'` component and `checkBandUp` is only ever invoked from `useEffect` hooks (lines 65 and 91), it executes exclusively in the browser. The `typeof window` branches are unreachable dead code and add noise without providing any protection.

**Fix:** Remove the guards and access `localStorage` directly:

```ts
const checkBandUp = useCallback((masteredCount: number) => {
  const { band } = computeProficiency(masteredCount)
  const stored = localStorage.getItem('lastBand')
  if (stored && stored !== band) {
    setBandUpMsg(bandUpMessage(band, masteredCount))
    import('canvas-confetti').then((m) => {
      if (!isMountedRef.current) return
      m.default({ particleCount: 80, spread: 60, origin: { y: 0.4 } })
    }).catch(() => {})
  }
  localStorage.setItem('lastBand', band)
}, [])
```

---

### IN-03: Unnecessary runtime type guard on a TypeScript-typed field

**File:** `components/HomeClient.tsx:245`

**Issue:** `{typeof stats.masteredCount === 'number' && (<ProficiencyArc … />)}` guards on a field declared as `number` (non-nullable) in `StatsDTO`. TypeScript strict mode guarantees this is always a number; the `typeof` check is always `true` and communicates to readers that the value might be absent, which is misleading.

**Fix:** Remove the guard:

```tsx
<ProficiencyArc masteredCount={stats.masteredCount} />
```

---

_Reviewed: 2026-06-30T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
