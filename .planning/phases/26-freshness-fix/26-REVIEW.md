---
phase: 26-freshness-fix
reviewed: 2026-07-12T19:18:07Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - app/layout.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/HabitsClient.tsx
  - components/HomeClient.tsx
  - components/StudyClient.tsx
  - e2e/freshness-client-shell.spec.ts
  - e2e/freshness-router-cache.spec.ts
  - e2e/helpers/rsc.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-07-12T19:18:07Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the boundary-refresh mechanism (`FreshnessWatcher`, mounted globally in `app/layout.tsx`) and the four client-shell adoption sites it feeds (`HomeClient`/`HabitsClient` ungated, `StudyClient`/`CardsClient` gated), plus the two rewritten e2e freshness specs and their shared `rsc.ts` helper.

The gating logic in `CardsClient`/`StudyClient` is careful and internally consistent with its own design comments (in-flight sheet/session state correctly blocks a clobbering adoption, and the incoming prop reference is always consumed so a later boundary event isn't blocked by a stale comparison). However, the fix is **incomplete on `HabitsClient`**: the `today` date string — the one piece of state every downstream streak/trend/heatmap computation depends on — was left wired to a `useEffect` that only reacts to `initialDayStartHour`, not to the freshly-delivered `initialDays`/`initialMasteredCount` props. This means the canonical "tab/PWA resume the next day" scenario that `FreshnessWatcher` exists to fix will still show yesterday's streak/trend math on `/habits` even though the underlying `days` array is now live. This is a correctness bug squarely inside this phase's stated goal, not a pre-existing/deferred issue, so it is reported as a Critical finding.

Two further Warning-level design gaps were found: (1) the lesson list (`lessons` state) in both `CardsClient` and `StudyClient` is captured once via a setter-less `useState(initialLessons)` and never adopts fresh lesson data, which both leaves the lesson-range filter picker stale and can feed a stale `maxOrder` into `StudyClient`'s own freshness gate; and (2) `FreshnessWatcher`'s single shared `lastRefreshRef` coalesce window is not route-aware, so a route-changing `popstate` that lands within 300ms of an unrelated `visibilitychange` refresh for the previous route can be silently dropped, leaving the newly-navigated-to route served from stale Router Cache — the exact failure mode this component exists to prevent. A third Warning flags a test-reliability concern: the e2e specs' "network evidence" assertion (`newFetches.length > 0`) doesn't rule out Next.js's own Link-hover/viewport prefetching as the source of the observed fetch, which could let a test pass without the `FreshnessWatcher` fix actually having fired.

## Critical Issues

### CR-01: HabitsClient's `today` never adopts freshness — date-based stats stay stale across the exact resume scenario this phase targets

**File:** `components/HabitsClient.tsx:60-78`
**Issue:** The diff correctly converts `days`, `goal`, and `masteredCount` from frozen `useState` copies to direct prop reads so every `router.refresh()` delivers live data (this is explicitly called out in the new comment as fixing "the root cause of the non-resync bug"). But `today` — the value every one of `computeStreaks`, `computeHabitInsight`, `trendDays`, and `heatmapWeeks` is keyed on — is still driven by:

```tsx
useEffect(() => {
  Promise.resolve().then(() => setToday(habitDateStr(initialDayStartHour)))
}, [initialDayStartHour])
```

`initialDayStartHour` is a settings value that essentially never changes between refreshes, so this effect fires once on mount and then never again. Contrast with `HomeClient`'s equivalent effect, which was written to react to fresh data:

```tsx
useEffect(() => {
  const todayStr = habitDateStr(activityData.dayStartHour)
  ...
}, [stats, activityData])
```

Concretely: a user has `/habits` open, backgrounds the tab/PWA overnight (crossing the habit-day boundary), and reopens it the next morning. `FreshnessWatcher`'s `visibilitychange` listener fires `router.refresh()`, delivering fresh `initialDays`/`initialMasteredCount` props — but `today` remains yesterday's date string. `computeStreaks(days, today, goal)` then computes "today's" seconds/streak against the wrong bucket, `trendDays`/`heatmapWeeks` render a 30-day window anchored on yesterday, and the whole page silently under- or over-reports progress until a hard reload. This is precisely the resume scenario `FreshnessWatcher`'s docstring calls out ("visibilitychange (hidden → visible): tab/PWA resume"), so the fix is incomplete for this page.

**Fix:** Recompute `today` whenever the fresh props actually change, mirroring `HomeClient`'s pattern:
```tsx
useEffect(() => {
  Promise.resolve().then(() => setToday(habitDateStr(initialDayStartHour)))
}, [initialDayStartHour, initialDays, initialMasteredCount])
```
(or, more robustly, derive `today` the same way `HomeClient` does — recompute on every render where the incoming props object identity changes, not just on mount.)

## Warnings

### WR-01: `lessons` state in CardsClient/StudyClient never adopts fresh data, and feeds StudyClient's own freshness gate with a stale bound

**File:** `components/CardsClient.tsx:52`, `components/StudyClient.tsx:44`
**Issue:** Both shells capture the lesson list with a setter-less initializer:
```tsx
const [lessons] = useState<LessonRefItem[]>(initialLessons)   // CardsClient
const [lessons] = useState<LessonDTO[]>(initialLessons)       // StudyClient
```
`initialLessons` is a normal RSC prop that gets a fresh reference (and, after a sync, fresh content — e.g. a newly-added lesson) on every `router.refresh()` boundary event, exactly like `initialCards`. But because `lessons` is only ever read from the `useState` initializer, it is frozen at first mount and never updates. Two consequences:

1. The lesson-range filter Sheet in both pages will never show a newly-synced lesson without a hard page reload, even though this phase's entire purpose is to eliminate exactly that class of staleness.
2. In `StudyClient`, `maxOrder` (`lessons[lessons.length - 1].orderIndex`) is derived from this frozen list and is fed directly into the new freshness gate's `isFullSpan(lessonFrom, lessonTo, maxOrder)` check (line ~137). If a new lesson is synced while `/study` is mounted, `maxOrder` under-reports the true upper bound, so a genuinely full-span selection can evaluate as non-full-span (or vice versa), producing an incorrect gating decision for the very mechanism this phase added.

**Fix:** Adopt `initialLessons` the same way `initialCards` is adopted — either drop the `useState` wrapper and read the prop directly (matching `HabitsClient`'s "direct prop read" pattern, since the lesson list has no local-only interaction state protecting it the way cards/sheets do), or add a small ungated `prevInitialLessons` adoption block (à la `HomeClient`) so `lessons` tracks the prop on every refresh:
```tsx
const [lessons, setLessons] = useState<LessonRefItem[]>(initialLessons)
const [prevInitialLessons, setPrevInitialLessons] = useState(initialLessons)
if (initialLessons !== prevInitialLessons) {
  setPrevInitialLessons(initialLessons)
  setLessons(initialLessons)
}
```

### WR-02: `FreshnessWatcher`'s shared coalesce window can suppress a route-critical refresh

**File:** `components/FreshnessWatcher.tsx:30-37`
**Issue:** All three listeners (`visibilitychange`, `popstate`, `pageshow`) funnel through one `refresh()` closure gated by a single `lastRefreshRef`, with no awareness of *which route* triggered each event:
```tsx
const refresh = () => {
  const now = Date.now()
  if (now - lastRefreshRef.current < COALESCE_MS) return
  lastRefreshRef.current = now
  router.refresh()
}
```
The header comment justifies this for the case "popstate immediately followed by a visibilitychange" — i.e. popstate fires first (settling the route), then a visibilitychange for the *same* now-current route is correctly suppressed as redundant. But the reverse ordering is also plausible and is not addressed: a `visibilitychange` fires while page A is still on screen (foregrounding a backgrounded tab/PWA) and refreshes page A; within the 300 ms window the user then triggers browser back/forward (`popstate`) to a different, previously Router-Cache-cached page B. `onPopState`'s deferred `setTimeout(refresh, 0)` callback runs a few ms later, well inside the 300 ms window, so `refresh()` returns early and page B — the route the user is now actually looking at — never gets its own server round-trip. Page B can then render stale Router-Cache content, which is exactly the D-04 failure mode this component exists to eliminate.
**Fix:** Track the route (or a monotonically-incrementing "reason" tag) alongside the timestamp, and only coalesce refreshes that target the same `location.pathname`, e.g.:
```tsx
const lastRefreshRef = useRef<{ time: number; path: string }>({ time: 0, path: '' })
const refresh = () => {
  const now = Date.now()
  const path = window.location.pathname
  const last = lastRefreshRef.current
  if (path === last.path && now - last.time < COALESCE_MS) return
  lastRefreshRef.current = { time: now, path }
  router.refresh()
}
```

### WR-03: e2e "network evidence" assertions don't rule out Next.js Link prefetch as a false-positive source

**File:** `e2e/freshness-client-shell.spec.ts:144-149`, `e2e/freshness-router-cache.spec.ts:131-133,162-164`
**Issue:** Every test's core assertion is `expect(newFetches.length).toBeGreaterThan(0)`, where `newFetches` is any request to the target route pathname captured between `preLen` and the end of the test that looks like an RSC/document fetch. Every test reaches its target route via clicking a `<Link>` in `Nav` (`page.getByRole('link', { name: cfg.navName }).click()`), and `Nav` (mounted globally, same as `FreshnessWatcher`) renders links to `/`, `/study`, `/cards`, `/habits` on every page. Next.js's default `<Link>` behavior prefetches routes that scroll into the viewport (or on hover, depending on version/config), independent of any `router.refresh()` call. Because the request log is a page-wide listener that isn't scoped to "requests caused by the trigger under test," a background prefetch of the same route pathname that happens to land after `preLen` (e.g. triggered by the Nav bar being on-screen for the whole test) would satisfy `newFetches.length > 0` even if `FreshnessWatcher`'s boundary-refresh logic were completely broken or removed — weakening the tests' ability to prove the fix actually fires.
**Fix:** Either disable prefetching on the `Nav` links used in these flows (`prefetch={false}`) for the duration of the test harness, or strengthen the predicate to distinguish a prefetch request from a `router.refresh()`-triggered fetch (e.g. by asserting on the specific `Next-Router-State-Tree`/`Next-Url` header shape `router.refresh()` sends, if it differs from prefetch requests), so a passing test can't be explained by incidental prefetch traffic.

## Info

### IN-01: Redundant back-to-back `waitForTimeout` calls

**File:** `e2e/freshness-router-cache.spec.ts:159-160`
**Issue:**
```tsx
await page.waitForTimeout(250)
await page.waitForTimeout(300) // settle margin, same as every other trigger
```
Two sequential timeouts (550 ms total) where every other test in the file uses a single `300` ms settle margin. Likely a copy-paste artifact from combining the resume-simulation wait with the standard settle margin.
**Fix:** Collapse into a single `await page.waitForTimeout(300)` (drop the extra `250`) to match the file's stated "same as every other trigger" convention, or document why the resume path specifically needs the extra 250 ms.

### IN-02: Inconsistent route-fetch predicate between the two "twin" freshness specs

**File:** `e2e/freshness-client-shell.spec.ts:84-86`, `e2e/freshness-router-cache.spec.ts:72-74`
**Issue:** The two spec files implement conceptually the same "did a new data fetch land for this route" check but with different predicates:
```ts
// freshness-client-shell.spec.ts
function newRscFetchesForRoute(log, preLen, routePath) {
  return log.slice(preLen).filter((r) => r.pathname === routePath && r.isRsc)
}
// freshness-router-cache.spec.ts
function newDataFetchesForRoute(log, preLen, routePath) {
  return log.slice(preLen).filter((r) => r.pathname === routePath && (r.isRsc || r.resourceType === 'document'))
}
```
Both files' header comments describe themselves as sharing the same D-03 "dual-evidence rule," but one accepts a plain `document` navigation as evidence and the other doesn't. This makes the two specs' pass/fail sensitivity to a given fix subtly different for no documented reason.
**Fix:** Extract one shared helper (e.g. into `e2e/helpers/rsc.ts`, alongside `isRscRequest`/`waitForRscFetch`) and use it from both spec files so the evidentiary bar is provably identical across all freshness tests.

### IN-03: `FreshnessWatcher`'s deferred `popstate` timer isn't cancelled on unmount

**File:** `components/FreshnessWatcher.tsx:46-51`
**Issue:** `onPopState` schedules `setTimeout(refresh, 0)` but the cleanup function only removes event listeners — it doesn't clear this pending timer:
```tsx
const onPopState = () => {
  setTimeout(refresh, 0)
}
...
return () => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('pageshow', onPageShow)
}
```
If the component were to unmount in the brief window between a `popstate` event and its deferred callback firing, `router.refresh()` would still execute post-unmount. In practice `FreshnessWatcher` is mounted once in the root layout and effectively never unmounts during the app's lifetime, so this is low-risk today, but it's a latent bug if the component is ever moved lower in the tree or conditionally rendered.
**Fix:**
```tsx
const onPopState = () => {
  const id = setTimeout(refresh, 0)
  pendingTimeoutRef.current = id
}
...
return () => {
  ...
  if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current)
}
```

---

_Reviewed: 2026-07-12T19:18:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
