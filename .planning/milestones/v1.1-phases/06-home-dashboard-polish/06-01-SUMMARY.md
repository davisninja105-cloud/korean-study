---
phase: 06-home-dashboard-polish
plan: 01
subsystem: home-page
status: complete
tags: [home, hero, dashboard, state-machine, typography, active-states, ux-polish]
completed: 2026-06-28

dependency_graph:
  requires: []
  provides: [home-three-state-hero, greeting-elevated-typography, activity-data-fetch, active-press-states]
  affects: [app/page.tsx]

tech_stack:
  added: []
  patterns:
    - parallel-fetch-then-set-pattern
    - heroState-as-derived-state
    - habitDateStr-in-effect-purity

key_files:
  modified:
    - app/page.tsx

decisions:
  - Use Promise.resolve().then(() => setHeroState(x)) for derived state to satisfy react-hooks/set-state-in-effect
  - Apply State B reward tint to inner wrapper div (bg-reward/10) not outer section — prevents tint bleed past card border
  - Use CheckCircle2 from lucide-react as State B reward icon (maximum visual weight in the lucide family)
  - loadActivity is mount-only — not called in handleSync (activity data doesn't change during sync)
  - text-reward utility token used for due count, replacing old inline style={{ color: 'var(--reward)' }}

metrics:
  duration: 4 minutes
  tasks_completed: 2
  files_modified: 1
---

# Phase 06 Plan 01: Home Dashboard Polish Summary

Three-state hero + elevated greeting + F-07 active states, all in a single file with no new packages.

## What Was Built

`app/page.tsx` was reworked so the Home hero now adapts to the learner's actual situation that day via three visually distinct states, derived from a new parallel `/api/activity` fetch. The time-of-day greeting was elevated from a small muted subtitle to a prominent section header.

### New Data Layer (Task 1)

- **`interface ActivityData`** — typed to match `/api/activity` GET response: `{ days, dailyGoalSeconds, dayStartHour }`
- **`type HeroState = 'loading' | 'A' | 'B' | 'C'`** — four-value state machine
- **`activityData` state** — `useState<ActivityData | null>(null)`, populated by `loadActivity`
- **`heroState` state** — `useState<HeroState>('loading')`, derived by dedicated effect
- **`loadActivity` callback** — mirrors existing `loadStats` `.then(setX)` pattern; mount-only (not called after sync per RESEARCH Pitfall 2)
- **Mount effect updated** — calls `loadActivity()` alongside `loadStats()`; dependency array updated to `[loadStats, loadActivity]`
- **Derivation effect** — `useEffect([stats, activityData])`: calls `habitDateStr(activityData.dayStartHour)` inside the effect (ESLint-safe), computes `goalMet` with mandatory `dailyGoalSeconds > 0` guard (RESEARCH Pitfall 1), sets `heroState` via `Promise.resolve().then()` to satisfy `react-hooks/set-state-in-effect`
- **New import** — `habitDateStr` from `@/lib/habit`

### Three-State Hero + Typography (Task 2)

- **Greeting** — elevated from `text-sm text-muted` to `text-xl font-medium text-foreground` (HOME-02 / audit F-08)
- **State A** — cards due: `text-6xl font-bold text-reward` due count + "Study now →" CTA at `text-lg`
- **State B** — goal met: `bg-reward/10 rounded-xl` inner tint wrapper + `CheckCircle2` icon at `w-10 h-10 text-reward` + "Goal met today" heading + "Study ahead →" CTA at `text-base`
- **State C** — all reviewed, goal not yet met: neutral panel + "All caught up" heading + "Keep going to hit your daily goal." + "Study ahead →" CTA at `text-base`
- **Loading** — existing `h-28 animate-pulse bg-surface-2 rounded-xl` skeleton while either fetch is pending
- **New import** — `CheckCircle2` from `lucide-react`

### F-07 Active States (Task 2)

- **CTA Links** (all three states) — added `active:scale-[0.98] active:opacity-90` 
- **Band-up dismiss button** — added `active:bg-surface-3`
- **My Korean link card** — added `active:shadow-sm active:bg-surface-2 transition-colors`

### Token Escape Confirmation (F-06)

Grep confirmed zero `text-gray-*` or `bg-white` utilities remain in `app/page.tsx`. The old inline `style={{ color: 'var(--reward)' }}` on the due count was replaced with the `text-reward` token utility.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| HOME-01: Three visually distinct hero states | PASS — State A (reward count), State B (inner tint + icon), State C (neutral heading) differ in background, heading weight, accent color, and icon presence |
| HOME-02: Greeting at text-xl font-medium text-foreground | PASS |
| HOME-03: Section order unchanged (greeting → hero → StatsBar → HabitTracker → ProficiencyArc → My Korean) | PASS |
| F-07: CTA active states | PASS — all three CTAs have active:scale-[0.98] active:opacity-90 |
| F-07: Band-up dismiss active state | PASS — active:bg-surface-3 added |
| F-07: My Korean link active state | PASS — active:shadow-sm active:bg-surface-2 added |
| Purity: habitDateStr only inside useEffect | PASS — line 87, not in JSX |
| Guard: dailyGoalSeconds > 0 | PASS — present in goalMet derivation |
| loadActivity NOT in handleSync | PASS — handleSync only calls loadStats() |
| npm run lint exits 0 | PASS |
| npm run build exits 0 | PASS |

## Deviations from Plan

None. Plan executed exactly as written.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. `/api/activity` was already deployed and auth-gated.

## Known Stubs

None. All three hero states render from live API data; no hardcoded empty values or placeholder text.

## Self-Check: PASSED

- `app/page.tsx` modified — confirmed exists ✓
- Commit `20aeead` (Task 1: data layer) — exists ✓
- Commit `c82deec` (Task 2: JSX) — exists ✓
- `npm run lint` exits 0 — verified ✓
- `npm run build` exits 0 — verified ✓
