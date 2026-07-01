---
phase: 12-home-habits-hydration
plan: "03"
subsystem: habits-rsc-shell
status: complete
tags: [rsc, client-shell, hydration, habits, dto, useMemo]
completed: 2026-07-01
duration: 7m

dependency_graph:
  requires:
    - lib/dashboard.ts (getStats, getActivityData) — Plan 01
    - lib/dto.ts (ActivityDTO, DayRecord) — Plan 01
  provides:
    - components/HabitsClient.tsx (new client shell)
    - app/habits/page.tsx (async RSC entry point — RSC-04)
  affects: []

tech_stack:
  added: []
  patterns:
    - RSC + client shell split (same pattern as Phase 11 StudyPage/StudyClient and Plan 02 HomeClient)
    - useState seeded from RSC props (no null state, no mount-effect fetch — D-04)
    - today state computed via Promise.resolve().then(habitDateStr) in useEffect (D-01/D-02 / react-hooks/purity)
    - Skeleton gate on today==='' not days (one-tick HabitsLoading swap — D-02)
    - All useMemo derivations ported verbatim with days replacing days??[]

key_files:
  created:
    - components/HabitsClient.tsx
  modified:
    - app/habits/page.tsx

decisions:
  - "Skeleton gate changed from `if (days === null)` to `if (today === '')` — days is always present from RSC props; only client-local today is pending for one tick (D-02)"
  - "ProficiencyArc rendered unconditionally (masteredCount is number not number|null from props) — old `masteredCount !== null` guard removed since RSC props guarantee a number"
  - "DEFAULT_GOAL_SECONDS and DEFAULT_DAY_START_HOUR not imported in HabitsClient — constants were only used as self-fetch fallbacks (removed); initialGoal/initialDayStartHour from props serve that role"
  - "No try/catch at RSC page level — Next.js error boundary handles lib/dashboard.ts throws (same pattern as app/page.tsx in Plan 02)"

metrics:
  duration: 7m
  tasks_completed: 2
  files_changed: 2
---

# Phase 12 Plan 03: HabitsClient Shell + RSC Conversion Summary

Habits page converted from a client component that mounted in a `days===null` empty state and ran two useEffect fetches, to an async RSC that server-fetches activity + masteredCount and hands them to a new HabitsClient shell that starts populated (RSC-04 — no empty heatmap flash).

## What Was Built

### Task 1: Create components/HabitsClient.tsx client shell

Created `components/HabitsClient.tsx` (new file, 278 lines):
- `'use client'` as literal first line (Pitfall 8 compliance)
- `interface Props { initialDays: DayRecord[]; initialGoal: number; initialDayStartHour: number; initialMasteredCount: number }`
- State seeded from props: `useState<DayRecord[]>(initialDays)`, `useState(initialGoal)`, `useState(initialMasteredCount)`, `useState('')` for today (no null state — D-04)
- Self-fetch useEffect removed entirely (was fetching /api/activity + /api/stats on mount)
- today-only effect: `Promise.resolve().then(() => setToday(habitDateStr(initialDayStartHour)))` with deps `[initialDayStartHour]` (satisfies react-hooks/purity and react-hooks/set-state-in-effect — D-01/D-02)
- Skeleton gate: `if (today === '') return <HabitsLoading />` — gates on today not days (days always present from props; only today is pending for one effect tick — D-02)
- All useMemo derivations ported verbatim (computeStreaks, computeHabitStats, secByDate, trendDays, maxTrendSecs, heatmapWeeks, computeHabitInsight); `days ?? []` replaced with `days` throughout
- HabitsLoading imported from `@/app/habits/loading` (Phase 9 skeleton reused, not reinvented — D-02 discretion)
- All UI-SPEC copy strings preserved verbatim
- `ProficiencyArc` rendered unconditionally (masteredCount is always a number from props)

### Task 2: Convert app/habits/page.tsx to async RSC

Replaced `app/habits/page.tsx` entirely (281 lines → 15 lines):
- Removed client directive (moved with all client logic to HabitsClient.tsx)
- `export default async function HabitsPage()` — async server component
- `const [stats, activity] = await Promise.all([getStats(), getActivityData()])` — concurrent DB fetch
- `return <HabitsClient initialDays={activity.days} initialGoal={activity.dailyGoalSeconds} initialDayStartHour={activity.dayStartHour} initialMasteredCount={stats.masteredCount} />`
- No try/catch (Next.js error boundary handles lib/dashboard.ts throws)
- Build: `/habits` shows as `○ (Static)` — prerendered, confirming RSC-04

## Verification

- `npx tsc --noEmit` exits 0 (both tasks)
- `npm run lint` exits 0 (both tasks — react-hooks/purity + react-hooks/set-state-in-effect clean)
- `npm run build` succeeds — `/habits` route prerendered as `○ (Static)` (RSC-04 confirmed)
- No `/api/stats` or `/api/activity` fetch in HabitsClient (D-04 — habits RSC is sole data source)
- Skeleton gate on `today === ''` not `days === null` (correct one-tick loading state)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused DEFAULT_GOAL_SECONDS import**
- **Found during:** Task 1 (lint check after creating file)
- **Issue:** Plan said to "Port ALL imports from app/habits/page.tsx lines 3-19" including `DEFAULT_GOAL_SECONDS`. In HabitsClient, that constant is unused — `initialGoal` from props replaces it. ESLint `@typescript-eslint/no-unused-vars` flagged it as a warning.
- **Fix:** Removed `DEFAULT_GOAL_SECONDS` from the import. `DEFAULT_DAY_START_HOUR` was similarly omitted (it was only used as the self-fetch fallback, which is removed). `initialGoal` and `initialDayStartHour` from props serve that role.
- **Files modified:** `components/HabitsClient.tsx`
- **Commit:** 6407a34

## Known Stubs

None — all data fields are wired to real DTO props from server-fetched Prisma results via lib/dashboard.ts.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The RSC runs behind the existing `ks_auth` middleware gate. DTO props expose only the same fields already served by the prior /api/activity + /api/stats GET routes. DayRecord.date is a YYYY-MM-DD string (T-12-07 mitigation confirmed — no Date objects cross the boundary).

## Self-Check

- [x] components/HabitsClient.tsx exists at /Users/main/Documents/claude-test/components/HabitsClient.tsx
- [x] app/habits/page.tsx rewritten as async RSC (15 lines)
- [x] Task 1 commit: 6407a34
- [x] Task 2 commit: d555bf7
- [x] Build succeeds (/habits route prerendered as Static)
- [x] No /api/activity or /api/stats fetch in HabitsClient

## Self-Check: PASSED
