---
phase: 12-home-habits-hydration
fixed_at: 2026-07-02T07:46:34Z
review_path: .planning/milestones/v1.2-phases/12-home-habits-hydration/12-REVIEW.md
iteration: 1
fix_scope: all
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-07-02T07:46:34Z
**Source review:** .planning/milestones/v1.2-phases/12-home-habits-hydration/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6
- Fixed: 6
- Skipped: 0

All six in-scope findings (1 critical, 3 warnings, 2 info) were fixed and committed
atomically in an isolated `gsd-reviewfix/12-*` worktree. Each fix was verified by
re-reading the modified region (Tier 1) and a scoped `tsc --noEmit` syntax check
(Tier 2); no errors referenced the modified files. Findings that touch data-flow,
validation, or async state coordination are flagged below as `requires human
verification` (per the logic-bug limitation: Tier 1/2 verify syntax/structure, not
semantic correctness).

## Fixed Issues

### CR-01: `HabitTracker` receives stale activity data — pull-to-refresh does not refresh the habit ring/streak

**Files modified:** `components/HomeClient.tsx`
**Commit:** 23388c8
**Status:** fixed: requires human verification
**Applied fix:** In `HomeClient`'s render, changed the `HabitTracker` props from the
referentially-stable RSC prop (`initialActivity.days` / `initialActivity.dailyGoalSeconds`)
to the post-sync `activityData` *state* (`activityData.days` /
`activityData.dailyGoalSeconds`). After `loadActivity()` runs on a pull-to-refresh,
`setActivityData(data)` produces a new array reference, so `HabitTracker`'s sync effect
(lines 37–61) re-runs and propagates the fresh `days`/`goal` into its own state — matching
how `stats` already flows to `StatsBar`, `ProficiencyArc`, and the `heroState` effect. This
upholds the T-12-08 security contract ("pull-to-refresh on Home is the manual-refresh
path"). Added an inline comment documenting the rationale. Behavioural/data-flow change —
verify the habit ring + streak + week-strip now refresh after a cross-tab study + pull.

### WR-01: `DATE_RE` accepts non-existent calendar dates, corrupting streak/heatmap math

**Files modified:** `app/api/activity/route.ts`
**Commit:** 3736d27
**Status:** fixed: requires human verification
**Applied fix:** Added an `isRealDate(dateStr)` helper after `DATE_RE`. It first shape-checks
with `DATE_RE`, then round-trips through `new Date(Date.UTC(y, m-1, d))` and asserts
`getUTCFullYear/Month/Date` equal the inputs — rejecting rollover dates (`2026-02-31`,
`2026-13-45`) and `NaN` dates (`0000-00-00`). The POST validation now uses
`!isRealDate(date)` instead of `!DATE_RE.test(date)`, so garbage dates no longer upsert into
`StudyDay` and corrupt `shiftDate`/`computeStreaks`/`computeHabitInsight`/heatmap math.
Validation-logic change — verify legitimate `YYYY-MM-DD` inputs still pass and rollover/zero
dates now 400.

### WR-02: "All-time totals" are computed from a 400-day-capped array

**Files modified:** `lib/dashboard.ts`
**Commit:** 677748e
**Status:** fixed: requires human verification
**Applied fix:** Chose the review's Option 1 (root-cause fix that preserves the "All-time
totals" UX contract). Removed the `take: 400` cap from `getActivityData()`'s
`prisma.studyDay.findMany`, so the Habits "All-time totals" sums (`computeHabitStats`:
total study time / cards reviewed / days studied / goal-met days) reflect full history
rather than the most recent 400 records. The heatmap is unaffected because
`HabitsClient.heatmapWeeks` already self-caps rendering at 26 weeks regardless of input
size, and `StudyDay` rows are small (date + seconds + reviews) so payload stays modest.
Updated the JSDoc to document the no-cap rationale. Data-flow change (unbounded query) —
verify totals are correct and payload remains acceptable; the perf concern is latent (no
user near 400 study days per the review).

### WR-03: `checkBandUp` accesses `localStorage` without a try/catch — can crash the mount effect

**Files modified:** `components/HomeClient.tsx`
**Commit:** 8830b0b
**Status:** fixed
**Applied fix:** Wrapped both `localStorage` accesses in `checkBandUp` in try/catch.
`getItem('lastBand')` failures (private browsing / disabled storage) now `return` early
with no comparison; `setItem('lastBand', band)` failures (quota exceeded / Safari
private-browsing) are swallowed best-effort. The happy path is unchanged. Matches the
defensive `try{...}catch(e){}` pattern already used for `localStorage.getItem('theme')` in
`app/layout.tsx`, so a hard error screen no longer surfaces on Home load in private
browsing / full-storage states.

### IN-01: `handleSync` silently no-ops when `DOC_ID` is unset

**Files modified:** `components/HomeClient.tsx`
**Commit:** e3619ba
**Status:** fixed
**Applied fix:** Replaced the bare `if (!DOC_ID) return` in `handleSync` with a branch that
sets `setSyncMsg('Sync not configured')` before returning. When
`NEXT_PUBLIC_GOOGLE_DOC_ID` is not configured, a pull past `PULL_THRESHOLD` now surfaces
"Sync not configured" instead of flashing "Syncing…" for a single tick and disappearing —
so the gesture no longer appears broken. The configured path is untouched.

### IN-02: `loadStats` / `loadActivity` swallow refetch errors with no feedback

**Files modified:** `components/HomeClient.tsx`
**Commit:** f20bb82
**Status:** fixed: requires human verification
**Applied fix:** Replaced the `.catch(() => {})` in both `loadStats` and `loadActivity` with
`.catch` blocks that set `setSyncMsg('Synced — refresh failed, reload to update')` (guarded
by `isMountedRef.current`). After a successful sync, if either post-sync refetch fails
(transient network / 5xx), the user is now told the displayed stats/activity may be stale
and to reload, rather than seeing "Synced — N new cards" over stale data. Both callbacks
fire only from `handleSync` (post-sync context where `syncMsg` is already set), so the
secondary message cannot appear on the mount path. Async state coordination between two
fire-and-forget refetches — verify message ordering is sane when one/both fail (same message
on both, so no flapping).

---

_Fixed: 2026-07-02T07:46:34Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
