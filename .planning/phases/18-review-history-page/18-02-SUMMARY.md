---
phase: 18-review-history-page
plan: 02
subsystem: ui
tags: [prisma, groupby, fsrs, rsc, dto, dashboard]

# Dependency graph
requires:
  - phase: 18-review-history-page (plan 01)
    provides: "StatsDTO.cardsByState type field (defined but unpopulated by getStats())"
provides:
  - "getStats() now returns cardsByState — a FSRS-state (New/Learning/Review/Relearning) breakdown via prisma.cardReview.groupBy"
  - "Habits page 'Card progress' section — the value-adding, whole-section-Link entry point into /history (D-06/D-07/D-08)"
affects: [18-03-history-page-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-order tile list + countFor(state) ?? 0 lookup so all four FSRS-state tiles render even when groupBy omits an empty state"
    - "Whole-section-as-Link pattern (components/HabitsClient.tsx 'My Korean summary') reused for a stats-tile grid, not just a simple row"

key-files:
  created: []
  modified:
    - lib/dashboard.ts
    - app/habits/page.tsx
    - components/HabitsClient.tsx

key-decisions:
  - "cardsByState groupBy runs on prisma.cardReview (not prisma.card) — FSRS state lives on CardReview, matching the same table already queried for dueCards/masteredCount"
  - "stateLabel derived via State[r.state] (ts-fsrs enum reverse-lookup), not a hand-rolled label table — single source of truth for state names"
  - "Card progress section placed immediately after 'All-time totals' (not between Averages and Last-30-days) so it reads as a first-class feature high on the page, per the plan's own latitude on exact position"

patterns-established: []

requirements-completed: [HIST-04, HIST-07]

coverage:
  - id: D1
    description: "getStats() returns cardsByState labelled by FSRS state name, alongside all existing stats fields"
    requirement: HIST-07
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (lib/dashboard.ts typechecks clean); grep -n \"cardReview.groupBy\"/\"stateLabel: State\\[\"/\"cardsByState\" all present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Habits page shows a 'Card progress' section with four tiles (New/Learning/Review/Relearning) counting cards by FSRS state, real data on first server-rendered paint"
    requirement: HIST-07
    verification:
      - kind: unit
        ref: "npx tsc --noEmit clean; npm run build succeeds (SSR/RSC data flow compiles end-to-end)"
        status: pass
    human_judgment: true
    rationale: "Confirming 'no loading flash on first paint' requires visually inspecting the served HTML (npm run build && npm start, view-source on /habits) — deferred to the phase's end-of-phase UAT pass alongside 18-03, since /history (the Link target) doesn't exist until that plan ships."
  - id: D3
    description: "Tapping anywhere on the Card progress section navigates to /history — the whole section is one Link, no per-state filter links (D-08)"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "grep -c 'href=\"/history\"' components/HabitsClient.tsx == 1"
        status: pass
    human_judgment: false

duration: ~8min
completed: 2026-07-04
status: complete
---

# Phase 18 Plan 02: Card Progress Habits Section Summary

**Added a real-data FSRS-state breakdown ("Card progress": New/Learning/Review/Relearning) to the Habits page as a single whole-section `<Link href="/history">`, backed by a new `cardReview.groupBy` in `getStats()`.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `lib/dashboard.ts:getStats()` gained a sixth parallel query — `prisma.cardReview.groupBy({ by: ['state'], _count: true })` — mapped to `StatsDTO.cardsByState` via `State[r.state]` label lookup, with all five pre-existing returned fields (`totalCards`, `dueCards`, `totalLessons`, `cardsByType`, `masteredCount`) untouched
- `app/habits/page.tsx` threads `initialCardsByState={stats.cardsByState}` through to `HabitsClient`, completing the RSC+DTO hydration chain from 18-01's type addition
- `components/HabitsClient.tsx` renders a new "Card progress" section: a fixed-order 4-tile grid (New/Learning/Review/Relearning, zero-filled via `countFor` when a state has no cards) wrapped entirely in one `<Link href="/history">`, satisfying D-08's "whole section is the tap target, no per-tile links" requirement
- This closes the "reachable from an existing surface" half of HIST-04 (no new bottom-nav tab needed — Habits already has one) and applies the HIST-07 RSC+DTO hydration guarantee to the new stats section

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cardsByState groupBy to getStats()** - `e532249` (feat)
2. **Task 2: Thread the prop and render the tappable Card progress section** - `2788091` (feat)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## Files Created/Modified
- `lib/dashboard.ts` - `getStats()` now runs a sixth `Promise.all` query (`cardReview.groupBy` by state) and returns `cardsByState` mapped to `{ state, stateLabel, _count }[]` via the `State` enum re-exported from `lib/fsrs.ts`
- `app/habits/page.tsx` - Passes `initialCardsByState={stats.cardsByState}` to `<HabitsClient>` (one-line addition, no other change)
- `components/HabitsClient.tsx` - New `Props.initialCardsByState: StatsDTO['cardsByState']`; module-level `stateOrder` fixed tile list; `countFor(state)` lookup with `?? 0` default; new "Card progress" section inserted directly after "All-time totals", styled identically to sibling sections (`bg-surface-1 rounded-2xl shadow-md p-6`) and entirely wrapped in `<Link href="/history">`

## Decisions Made
- `cardsByState` groupBy targets `prisma.cardReview` (not `prisma.card`) — FSRS `state` lives on `CardReview`, the same table `getStats()` already queries for `dueCards`/`masteredCount`
- `stateLabel` comes from `State[r.state]` (ts-fsrs enum reverse-lookup, already imported project-wide in `lib/fsrs.ts`), not a hand-rolled numeric→string table — single source of truth
- Section placed immediately after "All-time totals" (plan left exact position to executor's judgment) so "Card progress" reads as a first-class feature near the top of the page, not buried below the trend chart/heatmap

## Deviations from Plan

None - plan executed exactly as written. All acceptance criteria (grep checks for `cardReview.groupBy`, `stateLabel: State[`, `cardsByState` in both files, exactly one `href="/history"` occurrence, all four state labels present) passed on first implementation; `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test` (116/116 passing), and `npm run build` all succeeded without any auto-fix needed.

## Issues Encountered

- `npm run build` succeeds and produces a valid `/habits` route, but the `<Link href="/history">` target does not yet exist as a route — `/history` is 18-03's deliverable (`app/history/page.tsx` + `components/HistoryClient.tsx`), not yet executed. This is expected per the plan's stated `depends_on: ["18-01"]` (not 18-03) and the phase's wave structure; tapping the Card progress section will 404 until 18-03 ships. Not a defect in this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `StatsDTO.cardsByState` is now fully wired end-to-end (type → query → RSC prop → rendered UI); no remaining work in this data path.
- 18-03 (`app/history/page.tsx` + `components/HistoryClient.tsx`) is the only remaining plan in this phase — once it ships, the "Card progress" section's `<Link href="/history">` will resolve to a real page, and full end-to-end UAT (HIST-04 through HIST-07) can run.
- No blockers for 18-03.

---
*Phase: 18-review-history-page*
*Completed: 2026-07-04*

## Self-Check: PASSED

All modified files found on disk (`lib/dashboard.ts`, `app/habits/page.tsx`, `components/HabitsClient.tsx`, this SUMMARY.md); all task commit hashes (`e532249`, `2788091`, `e4f9f2b`) verified present in git log.
