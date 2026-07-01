---
phase: 06-home-dashboard-polish
reviewed: 2026-06-28T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - app/page.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Code Review: Phase 06 — Home Dashboard Polish

## Summary

`app/page.tsx` adds the three-state hero (A = cards due, B = goal met, C = all caught up), pull-to-refresh sync, band-up confetti, and the secondary stats/habit/proficiency stack. Purity rules are respected and the overall structure is solid. Three warning-level defects were found: stale activity data after a sync, an unconditional `res.json()` call that masks non-JSON error bodies, and a duplicate `transition-*` CSS collision. Three informational items are noted.

## Findings

### CR-01: `loadActivity()` not called after sync — `heroState` can be stale

**Severity:** Warning
**File:** `app/page.tsx`
**Line:** 118

**Problem:** `handleSync` calls `loadStats()` after a successful sync but never calls `loadActivity()`. `heroState` is derived in the second `useEffect` (lines 85–98) from **both** `stats` and `activityData`. Because `activityData` is only loaded once on mount, the `todayStr` and `todaySeconds` used for the goal-met check remain from the initial load. If the habit day rolled over while the user left the page open (e.g., midnight passed the configured `dayStartHour`), `todayStr` will be yesterday's date, `todaySeconds` will be the previous day's total, and `goalMet` will be incorrectly `true`, causing the hero to show state B ("Goal met") rather than the correct state A (cards are due in a new day).

**Fix:**
```typescript
// app/page.tsx — handleSync, line 118
loadStats()
loadActivity()   // keep activity in sync so heroState uses the correct habit day
```

---

### CR-02: `res.json()` called unconditionally before checking `res.ok` — non-JSON error bodies silently absorbed

**Severity:** Warning
**File:** `app/page.tsx`
**Line:** 111–112

**Problem:**
```typescript
const data = await res.json()
if (!res.ok) throw new Error(data?.error ?? 'sync failed')
```
If the server returns a non-2xx response with a non-JSON body (Vercel 504 gateway timeout, raw HTML error page, edge middleware rejection), `res.json()` throws a `SyntaxError`. That error is caught by the outer `catch` block and surfaced as the generic "Sync failed — try again from Settings" message. The actual HTTP status is never visible. The standard pattern is to check `res.ok` first.

**Fix:**
```typescript
if (!res.ok) {
  const text = await res.text().catch(() => '')
  throw new Error(text || `sync failed (${res.status})`)
}
const data = await res.json()
setSyncMsg(
  data.newCards > 0
    ? `Synced — ${data.newCards} new card${data.newCards !== 1 ? 's' : ''}`
    : 'Up to date'
)
```

---

### CR-03: Duplicate `transition-*` utilities — only one transition takes effect

**Severity:** Warning
**File:** `app/page.tsx`
**Line:** 234

**Problem:** The "My Korean" `<Link>` carries both `transition-shadow` and `transition-colors` on the same element:
```tsx
className="... hover:shadow-lg transition-shadow active:shadow-sm active:bg-surface-2 transition-colors"
```
In Tailwind v4 each `transition-{property}` utility emits a `transition-property` declaration. When two such declarations appear for the same element, the last one in the generated CSS wins. The earlier `transition-shadow` is silently dropped, so `hover:shadow-lg` does not animate. The intended combined animation requires `transition-all` (or composing via a custom CSS variable approach).

**Fix:**
```tsx
className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4
           hover:shadow-lg active:shadow-sm active:bg-surface-2 transition-all"
```

---

### IN-01: Band-up state update on unmounted component

**Severity:** Info
**File:** `app/page.tsx`
**Line:** 49–58

**Problem:** `loadStats()` is called from `useCallback` and then consumed in a `.then()` micro-task. If the user navigates away between the fetch starting and the `.then()` resolving, `setStats(data)` and `setBandUpMsg(...)` are called on an unmounted component. React 19 silently drops these calls (the old "can't perform state update on unmounted component" warning was removed), so there is no crash. However, the `canvas-confetti` call operates directly on `document.body` and **will** still fire after navigation, producing confetti on whatever page the user landed on. This is a minor visual glitch.

**Fix:** Guard the async continuation with an `isMounted` ref:
```typescript
const isMounted = useRef(true)
useEffect(() => () => { isMounted.current = false }, [])

// inside loadStats .then() callback:
.then((data: Stats) => {
  if (!isMounted.current) return
  setStats(data)
  // ... band-up logic ...
})
```

---

### IN-02: `Promise.resolve().then(() => setState(...))` is unnecessary in `useEffect`

**Severity:** Info
**File:** `app/page.tsx`
**Line:** 79, 92, 94, 96

**Problem:** The comment at line 75 explains the deferral as satisfying `react-hooks/set-state-in-effect`. However, `react-hooks/set-state-in-effect` only forbids calling `setState` as the **first synchronous statement** directly in the effect body (the pattern that previously caused double-renders before concurrent mode). Calling `setState` after any synchronous work — including after a `const` assignment — is not flagged. Additionally, the microtask deferral schedules an extra render pass: the effect runs synchronously, scheduling a microtask, then the state update fires in a separate batch. Direct `setState` calls inside `useEffect` are batched by React 19 automatically. This is non-breaking but adds an unnecessary render cycle and may confuse future contributors.

**Fix:**
```typescript
useEffect(() => {
  loadStats()
  loadActivity()
  const h = new Date().getHours()
  const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  setGreeting(g)  // direct call is safe and idiomatic in useEffect
}, [loadStats, loadActivity])

// And in the heroState effect, replace the three Promise.resolve().then() wrappers:
useEffect(() => {
  if (!stats || !activityData) return
  const todayStr = habitDateStr(activityData.dayStartHour)
  const todaySeconds = activityData.days.find((d) => d.date === todayStr)?.seconds ?? 0
  const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
  if (stats.dueCards > 0) {
    setHeroState('A')
  } else if (goalMet) {
    setHeroState('B')
  } else {
    setHeroState('C')
  }
}, [stats, activityData])
```

---

### IN-03: `console.error` left in production path

**Severity:** Info
**File:** `app/page.tsx`
**Line:** 120

**Problem:** `console.error('Home sync failed:', err)` fires on every failed sync in production. The error is already surfaced to the user via `setSyncMsg`, so the `console.error` adds no user value and will appear in production DevTools. The project convention keeps `npm run lint` clean; while Next.js lint does not block on `console.error`, it is inconsistent with the codebase pattern of not leaving debug output in production paths.

**Fix:**
```typescript
} catch (_err) {
  setSyncMsg('Sync failed — try again from Settings')
}
```

---

_Reviewed: 2026-06-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
