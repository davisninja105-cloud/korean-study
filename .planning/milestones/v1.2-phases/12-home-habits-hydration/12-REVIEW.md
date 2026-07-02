---
phase: 12-home-habits-hydration
reviewed: 2026-07-02T06:58:58Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - app/api/activity/route.ts
  - app/api/stats/route.ts
  - app/habits/page.tsx
  - app/page.tsx
  - components/HabitsClient.tsx
  - components/HabitTracker.tsx
  - components/HomeClient.tsx
  - lib/dashboard.ts
  - lib/dto.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-07-02T06:58:58Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Nine source files covering the home/habits hydration refactor were reviewed adversarially: the shared `lib/dashboard.ts` data layer, `lib/dto.ts` DTO types, two API routes (`/api/stats`, `/api/activity`), the Home and Habits RSC pages, and three client components (`HomeClient`, `HabitTracker`, `HabitsClient`).

The RSC→client split is structurally sound, `react-hooks/purity` and `react-hooks/set-state-in-effect` patterns are applied consistently, `isMountedRef` guards prevent state-after-unmount, and the milestone-baseline guard in `HabitTracker` correctly suppresses spurious 0→realStreak celebrations. Prior review's WR-01/IN-01/IN-02/IN-03 were verified as fixed in the current tree.

However, a fresh trace of the post-sync data flow surfaced one **blocker**: `HomeClient` passes the stale RSC prop (`initialActivity`) to `HabitTracker` instead of the `activityData` state that `loadActivity()` populates after a pull-to-refresh — so the habit ring/streak/week-strip never refresh even though the fresh data was already fetched and is already consumed by `heroState` one section above. This directly contradicts the inline contract comment ("keep activity in sync so heroState uses the correct habit day") and the T-12-08 security disposition ("pull-to-refresh on Home is the manual-refresh path"). Three warnings (invalid-date regex, 400-day cap vs. "All-time totals" label, unguarded `localStorage`) and two info items round out the findings.

## Critical Issues

### CR-01: `HabitTracker` receives stale activity data — pull-to-refresh does not refresh the habit ring/streak

**File:** `components/HomeClient.tsx:236-240` (specifically lines 237 and 239)

**Issue:** `HomeClient` holds the post-sync activity snapshot in `activityData` state (line 31: `useState<ActivityDTO>(initialActivity)`; updated by `loadActivity()` at line 67-75, invoked from `handleSync` at line 133). The `heroState` effect (lines 96-109) correctly reads `activityData.days`, `activityData.dayStartHour`, and `activityData.dailyGoalSeconds` — so the hero section *does* reflect refreshed activity data (e.g. it flips to "Goal met today" / State B).

But `HabitTracker` is rendered with the **original RSC prop**, not the state:

```tsx
<HabitTracker
  initialDays={initialActivity.days}              // ← prop, never updates after mount
  initialToday={today}                              // ← state (correct)
  initialGoal={initialActivity.dailyGoalSeconds}   // ← prop, never updates after mount
/>
```

`initialActivity` is the RSC prop and is referentially stable for the component's lifetime — it never reflects the `setActivityData(data)` call. Since `HabitTracker`'s sync effect (lines 37-61) only re-runs when `initialDays`/`initialToday`/`initialGoal` change, and `initialDays`/`initialGoal` never change, `days` and `goal` inside `HabitTracker` are frozen at the initial server snapshot.

Concrete failure: a user studies in `/study` (which POSTs to `/api/activity`), returns to Home (RSC cache is stale), and pulls to refresh. `loadActivity()` fetches the fresh StudyDay rows into `activityData`. The hero section correctly shows "Goal met today". But the habit ring directly beneath it still shows the old `todaySeconds` (e.g. 0%) and the old streak — two regions of the same screen now disagree about today's progress. This is inconsistent with every other `stats` consumer in `HomeClient` (lines 141, 187, 233, 243), which all read the `stats` *state* rather than the `initialStats` prop — `initialActivity` on lines 237/239 is the lone anomaly, strongly suggesting an oversight rather than a design choice.

This also violates the phase's own security contract: T-12-08 (R-12-04) accepts "stale habits after cross-tab study" on the explicit grounds that "pull-to-refresh on Home is the manual-refresh path." That contract is not upheld — the manual-refresh path fetches the data but never routes it to the habit UI.

**Fix:**

```tsx
<HabitTracker
  initialDays={activityData.days}
  initialToday={today}
  initialGoal={activityData.dailyGoalSeconds}
/>
```

`activityData.days` becomes a new array reference after each `setActivityData`, so `HabitTracker`'s sync effect re-runs and propagates the fresh `days`/`goal` into its own state — matching how `stats` already flows to `StatsBar`, `ProficiencyArc`, and the hero section.

## Warnings

### WR-01: `DATE_RE` accepts non-existent calendar dates, corrupting streak/heatmap math

**File:** `app/api/activity/route.ts:5,11`

**Issue:** `const DATE_RE = /^\d{4}-\d{2}-\d{2}$/` only checks the *shape* of a `YYYY-MM-DD` string. It accepts values like `2026-13-45`, `2026-02-31`, `0000-00-00`, and `9999-99-99`. A POST with such a `date` passes validation and is upserted as a `StudyDay` row (the `date` column is a plain `String`, per `prisma/schema.prisma:103`). Once stored, the garbage row flows back through `getActivityData()` to the client, where `shiftDate()` in `lib/habit.ts:47-54` does `[y, m, d] = dateStr.split('-').map(Number)` then `new Date(Date.UTC(y, m - 1, d) + ...)`. For invalid month/day components `Date.UTC` rolls over (or yields `NaN` for `0000-00-00`), producing `'NaN-NaN-NaN'` strings that propagate through `computeStreaks`, `computeFreezeBudget`, `computeHabitInsight`, and the `heatmapWeeks` reduce in `HabitsClient` (line 89-93, where an invalid earliest date yields a garbage `daysDiff`). The result is silently corrupted streak counts, heatmap scaling, and "best weekday" insights — with no error surfaced to the user.

The endpoint is behind the `ks_auth` middleware gate (per `12-SECURITY.md`), so the realistic vector is a curious/tampering authenticated user polluting their own data rather than an external attacker. But the validation gap is real and the downstream math is not defensive against it.

**Fix:** Validate that the date is a real calendar day, not just well-shaped:

```ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

// in POST:
if (typeof date !== 'string' || !isRealDate(date)) {
  return NextResponse.json({ error: 'valid date (YYYY-MM-DD) required' }, { status: 400 })
}
```

The round-trip check (`getUTCFullYear/Month/Date` === inputs) rejects rollover dates like `2026-02-31` and `NaN` dates like `0000-00-00`.

### WR-02: "All-time totals" are computed from a 400-day-capped array

**File:** `lib/dashboard.ts:40` (cap) and `components/HabitsClient.tsx:60-63,145-165` (label + computation)

**Issue:** `getActivityData()` returns `prisma.studyDay.findMany({ orderBy: { date: 'desc' }, take: 400, ... })` — the most recent 400 day records. `HabitsClient` freezes that array into `days` state (line 43) and passes it to `computeHabitStats(days, goal)` (line 61), whose output populates the "All-time totals" section (line 146 header): "Total study time", "Cards reviewed", "Days studied", "Goal-met days". For any user with more than 400 days (~13 months) of history, those four figures are silently undercounted — the oldest days beyond the 400-row window are excluded from the sums, yet the UI presents them as *all-time* totals. The `bestDayDate`/`bestDaySeconds` and the "best weekday" branch of `computeHabitInsight` are similarly capped.

This is a latent issue today (the app is in phase 12, no user has crossed 400 days), but it is a correctness/labeling mismatch baked into the reviewed code: either the cap or the label is wrong.

**Fix:** Two options, pick one:

1. If the cap is for heatmap windowing only (the heatmap renders at most 26 weeks ≈ 182 days, so 400 is generous headroom), fetch unbounded for the totals path and keep a separate capped query for the heatmap, e.g.:

```ts
// lib/dashboard.ts — drop the take for the totals source
prisma.studyDay.findMany({ orderBy: { date: 'desc' }, select: { date: true, seconds: true, reviews: true } })
```

2. If the cap is intentional (bounding payload size), relabel the section to match what is actually shown:

```tsx
<h2 className="text-lg font-semibold text-foreground">Last 400 days</h2>
```

Option 1 preserves the existing UX contract; option 2 makes the UI honest about the data it shows.

### WR-03: `checkBandUp` accesses `localStorage` without a try/catch — can crash the mount effect

**File:** `components/HomeClient.tsx:43,52`

**Issue:** `checkBandUp` is a `useCallback` invoked from the mount `useEffect` (line 89) and from `loadStats` (line 62). It calls `localStorage.getItem('lastBand')` (line 43) and `localStorage.setItem('lastBand', band)` (line 52) directly. `setItem` can throw `QuotaExceededError` (localStorage full, or Safari private-browsing where the quota is zero), and `getItem` throws in some legacy private-browsing modes. There is no `try/catch`. A throw inside `checkBandUp` propagates out of the mount effect, where React routes it to the nearest error boundary — so a user in private browsing (or with a full localStorage) can hit a hard error screen on Home load with no recovery path.

This is inconsistent with the only other `localStorage` access in the codebase: `app/layout.tsx:68` wraps its `localStorage.getItem('theme')` in `try{...}catch(e){}`. The same defensive pattern should apply here.

**Fix:**

```ts
const checkBandUp = useCallback((masteredCount: number) => {
  const { band } = computeProficiency(masteredCount)
  let stored: string | null = null
  try {
    stored = localStorage.getItem('lastBand')
  } catch {
    // localStorage unavailable (private browsing / disabled) — nothing to compare
    return
  }
  if (stored && stored !== band) {
    setBandUpMsg(bandUpMessage(band, masteredCount))
    import('canvas-confetti').then((m) => {
      if (!isMountedRef.current) return
      m.default({ particleCount: 80, spread: 60, origin: { y: 0.4 } })
    }).catch(() => {})
  }
  try {
    localStorage.setItem('lastBand', band)
  } catch {
    // quota exceeded / private browsing — best-effort write, ignore
  }
}, [])
```

## Info

### IN-01: `handleSync` silently no-ops when `DOC_ID` is unset

**File:** `components/HomeClient.tsx:19,113`

**Issue:** `const DOC_ID = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? ''` (line 19). `handleSync` opens with `if (!DOC_ID) return` (line 113). When `NEXT_PUBLIC_GOOGLE_DOC_ID` is not configured, pull-to-release past `PULL_THRESHOLD` calls `handleSync`, which returns `undefined` immediately; `usePullToRefresh`'s `Promise.resolve(onRefresh()).finally(...)` (lib/usePullToRefresh.ts:54-58) resolves on the next microtask, so the "Syncing…" indicator flashes for a single tick and then disappears with no sync message. The user gets no indication that sync is unavailable — neither an error nor a "sync not configured" hint — and may repeatedly pull believing the gesture is broken. `setSyncMsg(null)` runs before the early return but no message is ever set on this path.

**Fix:** Surface the misconfiguration once, so the pull gives feedback:

```ts
const handleSync = useCallback(async () => {
  if (!DOC_ID) {
    setSyncMsg('Sync not configured')
    return
  }
  haptic('impact-light')
  setSyncMsg(null)
  // ...existing body
}, [loadStats, loadActivity])
```

### IN-02: `loadStats` / `loadActivity` swallow refetch errors with no feedback

**File:** `components/HomeClient.tsx:64,74`

**Issue:** Both callbacks end with `.catch(() => {})`. After a successful sync, `handleSync` sets `syncMsg` to "Synced — N new cards" or "Up to date" (lines 127-131), then calls `loadStats()` and `loadActivity()` (lines 132-133) to refresh the UI from the new server state. If either refetch fails (transient network error, 5xx), the rejection is silently dropped and the "Synced" message remains on screen while `stats`/`activityData` stay at their pre-sync values. The user is told sync succeeded but sees stale stats/activity until the next navigation or refresh. Not a correctness bug (the sync itself did succeed), but a robustness/feedback gap that hides a partial failure.

**Fix:** At minimum, log the failure so it is observable; or surface a secondary message:

```ts
.then((data: StatsDTO) => {
  if (!isMountedRef.current) return
  setStats(data)
  checkBandUp(data.masteredCount)
})
.catch(() => {
  if (isMountedRef.current) setSyncMsg('Synced — refresh failed, reload to update')
})
```

---

_Reviewed: 2026-07-02T06:58:58Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
