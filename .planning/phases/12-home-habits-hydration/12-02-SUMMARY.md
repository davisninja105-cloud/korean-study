---
phase: 12-home-habits-hydration
plan: "02"
subsystem: home-rsc-shell
status: complete
tags: [rsc, client-shell, hydration, pull-to-refresh, band-up, dto, d-09]
completed: 2026-07-01
duration: 15m

dependency_graph:
  requires:
    - lib/dashboard.ts (getStats, getActivityData) — Plan 01
    - lib/dto.ts (StatsDTO, ActivityDTO) — Plan 01
  provides:
    - components/HomeClient.tsx (new client shell)
    - app/page.tsx (async RSC entry point — RSC-03)
  affects:
    - components/HabitTracker.tsx (D-09 optional initialActivity props)

tech_stack:
  added: []
  patterns:
    - RSC + client shell split (same pattern as Phase 11 StudyPage/StudyClient)
    - useState seeded from RSC props (no mount-effect fetch — D-08 / Pitfall 1)
    - checkBandUp useCallback fired on mount AND after pull-to-refresh (Pitfall 5)
    - heroState derived in useEffect via Promise.resolve().then (D-01/D-02)
    - today state computed in useEffect (habitDateStr is impure — react-hooks/purity)
    - HabitTracker D-09: optional initialDays/initialToday/initialGoal props; skips self-fetch when all present

key_files:
  created:
    - components/HomeClient.tsx
  modified:
    - app/page.tsx
    - components/HabitTracker.tsx

decisions:
  - "StatsDTO/ActivityDTO from Plan 01 are the prop types — no new interfaces; the local Stats/ActivityData interfaces in old app/page.tsx are removed"
  - "today state in HomeClient starts as '' (habitDateStr impure, cannot call in render); set to real date string in heroState useEffect via Promise.resolve().then — HabitTracker receives '' on first render then updates"
  - "initialActivity.days (RSC prop) passed to HabitTracker rather than activityData.days (mutable state) — stable reference; updates only after sync when activityData changes"
  - "HabitTracker early-return enhanced to sync state from props via Promise.resolve().then — fixes week strip staying empty when initialToday transitions from '' to real date string"
  - "No try/catch at RSC level in app/page.tsx — matches app/study/page.tsx precedent; Next.js error boundary handles getStats/getActivityData throws"

metrics:
  duration: 15m
  tasks_completed: 3
  files_changed: 3
---

# Phase 12 Plan 02: HomeClient Shell + RSC Conversion Summary

Home page converted from a client component with mount-effect fetches to an async RSC that server-fetches StatsDTO + ActivityDTO and renders a new HomeClient shell populated from props (RSC-03 — no empty hero flash).

## What Was Built

### Task 1: HabitTracker D-09 optional initialActivity props

Modified `components/HabitTracker.tsx`:
- Added `interface Props { initialDays?: DayRecord[]; initialToday?: string; initialGoal?: number }`
- Changed default export to destructure props
- State seeded from props: `useState<DayRecord[] | null>(initialDays ?? null)`, `useState(initialToday ?? '')`, `useState(initialGoal ?? DEFAULT_GOAL_SECONDS)`
- Self-fetch useEffect: early return when all three props present, skipping the duplicate `/api/activity` request (D-09)
- useEffect deps updated to `[initialDays, initialToday, initialGoal]`
- Defensive self-fetch fallback preserved when props absent (HabitTracker stays usable in isolation)

### Task 2: HomeClient client shell

Created `components/HomeClient.tsx` (new file, 215 lines):
- `'use client'` as literal first line
- `interface Props { initialStats: StatsDTO; initialActivity: ActivityDTO }`
- `useState<StatsDTO>(initialStats)` + `useState<ActivityDTO>(initialActivity)` — no null state (Pitfall 1 / A3)
- `checkBandUp(masteredCount)` useCallback: compares CEFR band to `localStorage['lastBand']`; fires `setBandUpMsg` + lazy confetti import on mismatch; writes `lastBand` after check
- Mount effect: time-aware greeting via `Promise.resolve().then(() => setGreeting(g))` (D-01); `checkBandUp(initialStats.masteredCount)` on first load (Pitfall 5)
- heroState + today effect: `habitDateStr(activityData.dayStartHour)` → `setToday` + `setHeroState` via `Promise.resolve().then` (D-02; `heroState='loading'` renders the `h-28 animate-pulse bg-surface-2 rounded-xl` pulse for one tick)
- `loadStats` / `loadActivity`: post-sync refetch callbacks; called ONLY from `handleSync` (D-08)
- `handleSync`: POST `/api/sync` → `setSyncMsg` → `loadStats()` + `loadActivity()`
- `usePullToRefresh(handleSync)`: pull indicator with `Pull to sync` / `Release to sync` / `Syncing…` copy
- `<HabitTracker initialDays={initialActivity.days} initialToday={today} initialGoal={initialActivity.dailyGoalSeconds} />` (D-09; HomeClient's computed today avoids desync — Pitfall 6)
- All UI-SPEC copy strings preserved verbatim

### Task 3: Convert app/page.tsx to async RSC

Replaced `app/page.tsx` entirely (252 lines → 8 lines):
- Removed client directive (moved to HomeClient.tsx)
- `export default async function Home()` — async server component
- `const [stats, activity] = await Promise.all([getStats(), getActivityData()])` — concurrent DB fetch
- `return <HomeClient initialStats={stats} initialActivity={activity} />`
- No try/catch (Next.js error boundary handles lib/dashboard.ts throws)
- Build: `/` shows as `○ (Static)` — prerendered, matching Phase 11 pattern

## Verification

- `npx tsc --noEmit` exits 0 (all three tasks)
- `npm run lint` exits 0 (all three tasks)
- `npm run build` succeeds — home route prerendered as `○ (Static)` (RSC-03 confirmed)
- No `/api/stats` or `/api/activity` mount-effect fetch in HomeClient (exactly 2 fetch calls in file, both inside post-sync loadStats/loadActivity callbacks)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] HabitTracker week strip stays empty when initialToday transitions from '' to real date string**
- **Found during:** Task 2 (while writing HomeClient and reasoning about today state flow)
- **Issue:** HomeClient's `today` state starts as `''` (habitDateStr is impure, cannot call in render). HabitTracker receives `initialToday=""` on first render, seeding local `today=""` via `useState`. After HomeClient's heroState effect fires and sets `today` to the real date string, HabitTracker re-renders with the new `initialToday` prop. The `useEffect([initialDays, initialToday, initialGoal])` fires, but the strict early-return `if (...) return` from Task 1 did not sync HabitTracker's local `today` state from the updated prop — causing the week strip to remain empty.
- **Fix:** Enhanced the HabitTracker early-return to also sync all three state values from props via `Promise.resolve().then(() => { setDays(initialDays); setToday(initialToday); setGoal(initialGoal) })` before returning. This satisfies `react-hooks/set-state-in-effect` (async callback, not synchronous). Self-fetch fallback path unchanged.
- **Files modified:** `components/HabitTracker.tsx` (already staged with Task 2 commit)
- **Commit:** a6544b1

## Known Stubs

None — all data fields are wired to real DTO props from server-fetched Prisma results.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The RSC runs behind the existing `ks_auth` middleware gate. DTO props expose only the same fields already served by the prior GET routes.

## Self-Check

- [x] components/HomeClient.tsx exists
- [x] components/HabitTracker.tsx modified (D-09 props + sync fix)
- [x] app/page.tsx rewritten as async RSC (8 lines)
- [x] Task 1 commit: 9e63a5d
- [x] Task 2 commit: a6544b1
- [x] Task 3 commit: 8b465fc
- [x] Build succeeds (home route prerendered)

## Self-Check: PASSED
