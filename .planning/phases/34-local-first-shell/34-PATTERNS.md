# Phase 34: Local-First Shell - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 9 (1 new module, 1 modified route, 5 modified components, 1 modified prop chain, 1 new Nav feature)
**Analogs found:** 9 / 9 (all files have a direct in-repo precedent; this phase is almost entirely "extend existing pattern," not "invent new pattern")

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `lib/local-cache.ts` (new) | utility (client-side cache) | CRUD (get/put over IndexedDB) | `lib/settings.ts` (`getDataVersion`/`bumpDataVersion`, lines 320-364) | role-match (server KV vs client KV, same "single source of truth" contract) |
| `app/api/version/route.ts` (modify — add `buildId`) | route (API) | request-response | itself (existing file, 7 lines) | exact |
| `components/FreshnessWatcher.tsx` (modify — narrow backstop) | provider | event-driven | itself (existing file, 278 lines) | exact |
| `components/HomeClient.tsx` (modify — cache read/write-through, mostly unchanged pull-to-refresh) | provider/component (client shell) | request-response + CRUD | itself (existing `handleSync`/`usePullToRefresh` block, lines 11, 149-195) | exact |
| `components/StudyClient.tsx` (modify — cache read + new `handleRefresh` + `onReviewCommitted`) | provider/component (client shell) | request-response + CRUD | `components/HomeClient.tsx` (pull-to-refresh + cache wiring) | role-match |
| `components/CardsClient.tsx` (modify — cache read + new `handleRefresh` + write-through in handleSave/Delete/Add) | provider/component (client shell) | request-response + CRUD | `components/HomeClient.tsx` (pull-to-refresh); itself for write-through (`handleSave`, lines 914+) | role-match / exact (write-through) |
| `components/HabitsClient.tsx` (modify — cache read + new `handleRefresh`) | provider/component (client shell) | request-response + CRUD | `components/HomeClient.tsx` (pull-to-refresh + cache wiring) | role-match |
| `components/StudySession.tsx` (modify — add `onReviewCommitted` prop call in `submitReview`) | component | event-driven | itself (existing `submitReview`, `onComplete` prop pattern, lines 143-150, 365+) | exact |
| `components/Nav.tsx` (modify — add offline pill) | component (layout chrome) | event-driven (`navigator.onLine` listeners) | itself (existing `useLayoutEffect`/ResizeObserver pattern for `--nav-height`, lines 29-43) | role-match |

## Pattern Assignments

### `lib/local-cache.ts` (new utility, CRUD over IndexedDB)

**Analog:** `lib/settings.ts` (server-side KV getters/setters) for the *contract* shape; `lib/usePullToRefresh.ts` for the "no `'use client'` needed, pure hook-adjacent utility, lazy/effect-driven" style; RESEARCH.md Pattern 3 for the concrete `idb` shape.

**Imports pattern** (new — `idb` becomes a first `package.json` dependency; verified NOT yet installed):
```typescript
import { openDB, type IDBPDatabase } from 'idb'
```

**Core pattern — lazy, buildId-namespaced DB, never opened at module scope** (per RESEARCH.md Pattern 3 / Pitfall 4):
```typescript
interface CacheEntry<T> {
  data: T
  dataVersion: string   // the /api/version value this entry was built from
  cachedAt: string       // ISO — display/debug only, NEVER used for staleness decisions
}

const STORE = 'routes'
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(buildId: string): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(`ks-cache-${buildId}`, 1, {
      upgrade(db) { db.createObjectStore(STORE) },
    })
  }
  return dbPromise
}

export async function read<T>(buildId: string, route: string): Promise<CacheEntry<T> | undefined> {
  const db = await getDb(buildId)
  return db.get(STORE, route)
}

export async function write<T>(buildId: string, route: string, data: T, dataVersion: string): Promise<void> {
  const db = await getDb(buildId)
  await db.put(STORE, { data, dataVersion, cachedAt: new Date().toISOString() }, route)
}
```

**Error handling pattern:** Match `lib/settings.ts`'s convention of catching Prisma errors and returning a safe default — here, catch IndexedDB open/read/write failures and resolve to `undefined`/no-op rather than throwing, since a cache miss must always degrade gracefully to the RSC-provided `initial*` props (never crash the client shell). Example precedent, `lib/settings.ts` doc comment style (JSDoc block explaining contract):
```typescript
// lib/settings.ts:320-342 [precedent for the "getter with safe fallback" contract]
export function nextDataVersionToken(): string {
  return String(Date.now())
}

export async function getDataVersion(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: DATA_VERSION_KEY } })
  return row?.value ?? '0'
}
```

**Testing pattern:** New `tests/local-cache.test.ts` using `fake-indexeddb` polyfill (per VALIDATION.md Wave 0) — mirrors the existing pure-function unit-test style already used for `lib/sequence.ts`/`lib/habit.ts` (Vitest, `environment: 'node'`, no DOM).

---

### `app/api/version/route.ts` (modify — add `buildId` field)

**Analog:** itself — this is a 2-line additive change to an existing, already-conventional route handler.

**Current file (verbatim, 7 lines):**
```typescript
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  return NextResponse.json({ version })
}
```

**Target shape (additive only):**
```typescript
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev'
  return NextResponse.json({ version, buildId })
}
```

**Error handling pattern:** No try/catch needed — `getDataVersion()` already has its own internal fallback (`row?.value ?? '0'`); `process.env.*` reads cannot throw. Matches this route's existing zero-error-handling convention (it's the simplest route in the app).

**Consumers to verify unaffected (additive-only contract):** `components/FreshnessWatcher.tsx` (2 call sites, both destructure only `.version`) and `e2e/freshness-version-gate.spec.ts` — confirmed by RESEARCH.md's repo-wide grep as the only existing consumers.

---

### `components/FreshnessWatcher.tsx` (modify — narrow the JSON backstop)

**Analog:** itself. This is a *deletion*-shaped change, not a new-pattern change — remove `fetchRoutePayload`, `FreshPayloadContext`, `useFreshPayload`, `FreshPayloads`/`HabitsFreshPayload` types, and the `fetchBackstop`'s call to `fetchRoutePayload`; keep `router.refresh()`, the coalesce logic, and the three event listeners (`visibilitychange`/`popstate`/`pageshow`) untouched.

**What stays (core pattern — do not touch):**
```typescript
// lines 232-240 — the RSC-refresh half, unconditional, never gated
const refresh = () => {
  const now = Date.now()
  if (now - lastRefreshRef.current < COALESCE_MS) return
  lastRefreshRef.current = now
  router.refresh()
  fetchBackstop()   // → becomes a no-op call site, or is removed entirely
                     // once fetchRoutePayload is deleted — planner's call
                     // whether to keep the version read as future defense-
                     // in-depth or delete fetchBackstop() wholesale
}
```

**What is removed (the JSON half, lines 19-121 + `FreshPayloadContext`/`useFreshPayload`, lines 31-53):** the entire `fetchRoutePayload` function and its `FreshPayloads`/`HabitsFreshPayload` interfaces, plus the `<FreshPayloadContext.Provider value={payloads}>` wrapper (revert to `return <>{children}</>` or equivalent) and the `useState<FreshPayloads>` — since nothing populates or reads it anymore.

**Downstream call sites requiring removal of the corresponding gated-adoption block** (per RESEARCH.md Pitfall 1 — must happen in the SAME wave):
- `components/StudyClient.tsx` — remove its `useFreshPayload()` call + `prevFreshStudy` gated-adoption effect.
- `components/CardsClient.tsx` — line 12 `import { useFreshPayload } from '@/components/FreshnessWatcher'`, line 471 `const { cards: freshCards } = useFreshPayload()`, plus the surrounding gated-adoption block.
- `components/HabitsClient.tsx` — remove its `useFreshPayload()` call + `prevFreshHabits` gated-adoption effect.

**Warning sign to verify at execution (per RESEARCH.md):** `grep -rn "useFreshPayload\|FreshPayloadContext" components/` must return zero matches once this phase is done.

---

### `components/HomeClient.tsx` (modify — cache read on mount + write-through in `handleSync`; pull-to-refresh UI is UNCHANGED)

**Analog:** itself. Home already has the exact pull-to-refresh shape D-03/D-04 want reused verbatim for the other 3 routes — read this file's `handleSync` and `usePullToRefresh` wiring as the canonical example before touching Study/Cards/Habits.

**Imports pattern** (line 11, existing — unchanged, reused verbatim in the other 3 clients):
```typescript
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
```
Add: `import * as localCache from '@/lib/local-cache'` (or a named-export style matching the module's final shape).

**Core pattern — existing pull-to-refresh mount** (lines 149, 180, 187-195 — copy this exact shape into Study/Cards/Habits with route-local copy per D-04):
```typescript
const handleSync = useCallback(async () => {
  // … existing POST /api/sync + loadStats()/loadActivity() refetch …
  // ADD: after refetch resolves, write fresh data through to cache and
  // bypass the version check entirely (D-04's "Home's handleSync ...
  // must additionally write ... to the cache and bypass the version check")
}, [/* existing deps */])

const { pullDistance, refreshing } = usePullToRefresh(handleSync)
```
```tsx
{(pullDistance > 0 || refreshing) && (
  <div
    className="flex items-center justify-center overflow-hidden text-xs text-muted"
    style={{ height: refreshing ? 28 : pullDistance }}
  >
    {refreshing ? 'Syncing…' : pullDistance >= PULL_THRESHOLD ? 'Release to sync' : 'Pull to sync'}
  </div>
)}
```
This exact JSX block (copy name change only) is the canonical template for Study/Cards/Habits' new `handleRefresh`/"Pull to refresh" indicator, per `34-UI-SPEC.md` Component Note 3.

**Cache-read-on-mount pattern to ADD** (per RESEARCH.md Pattern 1 — new `useEffect`, matches this file's own async-mount-effect convention already used for `loadStats`/`loadActivity`):
```typescript
useEffect(() => {
  let cancelled = false
  ;(async () => {
    const { version, buildId } = await fetch('/api/version').then((r) => r.json())
    if (cancelled) return
    const cached = await localCache.read(buildId, 'home')
    if (cached) { setStats(cached.data.stats); setActivityData(cached.data.activity) }
    if (!cached || cached.dataVersion !== version) {
      // background revalidation — sets isRevalidating true/false around this
    }
  })()
  return () => { cancelled = true }
}, [])
```

---

### `components/StudyClient.tsx` (modify — cache read, new route-local `handleRefresh`, `onReviewCommitted` callback passed to `StudySession`)

**Analog:** `components/HomeClient.tsx` for the pull-to-refresh shape (D-04 explicitly forbids reusing `handleSync` — this must be a new, separate function); itself for the existing `useFreshPayload`/gated-adoption block being removed.

**Core pattern — new route-local refresh (per RESEARCH.md Pattern 5, D-04):**
```typescript
const handleRefresh = useCallback(async () => {
  haptic('impact-light')
  const { version } = await fetch('/api/version').then(r => r.json())
  const fresh = await fetch(`/api/cards/due${buildParams(lessonFrom, lessonTo, 'due', maxOrder)}`).then(r => r.json())
  setStudyCards(fresh)
  localCache.write(buildId, 'study', fresh, version)
}, [/* deps mirroring loadDue's */])

const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)
```
UI indicator: same JSX shape as HomeClient's block above, but with D-04's distinct copy ("Refreshing…"/"Release to refresh"/"Pull to refresh" — never "sync").

**Write-through wiring — new `onReviewCommitted` prop, mirrors the existing `onComplete` prop already passed into `StudySession`:**
```typescript
<StudySession
  cards={studyCards}
  extraPractice={extraPractice}
  mode={mode}
  onComplete={handleComplete}
  onReviewCommitted={(cardId, updatedCardOrNull) => localCache.patchStudyCard(buildId, cardId, updatedCardOrNull)}
/>
```

**Removal:** delete the `useFreshPayload()` call and its `prevFreshStudy`-style gated-adoption effect (superseded by the new cache-read-on-mount effect).

---

### `components/CardsClient.tsx` (modify — cache read, new `handleRefresh` scoped to loaded groups per D-05, write-through in `handleSave`/`handleDelete`/`handleAdd`)

**Analog:** itself — `handleSave` (lines 914-1012) already computes a fully merged `CardDTO` and patches `groups`/`searchResults`/`readingPractice` state in place; this is the exact code path write-through must hook into (per RESEARCH.md Pattern 4 #2).

**Imports pattern** (lines 3-14, existing — remove line 12's `useFreshPayload` import, add `localCache`):
```typescript
import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle, type StateSnapshot } from 'react-virtuoso'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
// REMOVE: import { useFreshPayload } from '@/components/FreshnessWatcher'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { typeBadgeClass } from '@/lib/card-style'
// ADD: import * as localCache from '@/lib/local-cache'
```

**Core write-through pattern (existing `handleSave`, add one line immediately after the existing `setGroups`/`setSearchResults` calls):**
```typescript
const handleSave = (updated: CardEditorShape) => {
  // … existing merge() + setGroups/setSearchResults/setReadingPractice calls …
  localCache.patchCardsEntry(buildId, updated.id, merge)   // NEW
}
```
Apply the same "existing state update site + one new cache call" shape to `handleDelete` (line 864, remove-by-id) and `handleAdd` (line 1014, insert).

**Pull-to-refresh nuance (D-05 — scoped to already-loaded groups only, per RESEARCH.md Pattern 5 + Pitfall 5):**
```typescript
const handleRefresh = useCallback(async () => {
  // Re-run the existing per-group fetch (fetchGroupPageForFilterCommit or
  // equivalent) for every group with loaded.length > 0, at its CURRENT
  // page boundary — never a single unbounded `take` fetch.
  // Then: localCache.write(buildId, 'cards', mergedResult, version)
}, [/* … */])
```

**Removal:** delete line 12's import, line 471's `const { cards: freshCards } = useFreshPayload()`, and its surrounding gated-adoption block.

---

### `components/HabitsClient.tsx` (modify — cache read on mount, new `handleRefresh`)

**Analog:** `components/HomeClient.tsx` for the pull-to-refresh shape; itself for the `useFreshPayload`-based gated-adoption block being removed (same shape as StudyClient/CardsClient's, per RESEARCH.md's grep confirming all three components consume `useFreshPayload`).

**Core pattern:** identical shape to StudyClient's `handleRefresh` above, but targeting `/api/activity` + `/api/stats` (mirrors `fetchRoutePayload`'s now-deleted `'/habits'` branch, lines 96-116 of the old `FreshnessWatcher.tsx`, as the source of truth for which two endpoints to re-fetch):
```typescript
const handleRefresh = useCallback(async () => {
  haptic('impact-light')
  const { version } = await fetch('/api/version').then(r => r.json())
  const [activity, stats] = await Promise.all([
    fetch('/api/activity').then(r => r.json()),
    fetch('/api/stats').then(r => r.json()),
  ])
  setActivityData(activity)
  setMasteredCount(stats.masteredCount)
  localCache.write(buildId, 'habits', { activity, stats }, version)
}, [])
```

**Cross-cutting note (UI-SPEC E4 backstop item):** Habits shares `ActivityDTO` with Home but is its own cache entry — verify at execution that a Home-triggered settings write-through (`dailyGoalSeconds`/`dayStartHour`) also reaches Habits' cache slice, or that Habits' own background revalidation independently catches up.

---

### `components/StudySession.tsx` (modify — add `onReviewCommitted` prop, call it inside `submitReview`)

**Analog:** itself — the existing `onComplete` prop (line 147) is the exact precedent for "a callback prop the parent Client shell uses to react to an in-session event."

**Props interface pattern (line 143-148, existing convention — extend, don't replace):**
```typescript
interface Props {
  cards: CardDTO[]
  extraPractice?: ExtraPractice[]
  mode: StudyMode
  onComplete: (stats: { reviewed: number; correct: number; incorrect: number }) => void
  onReviewCommitted?: (cardId: string, updatedCardOrNull: CardDTO | null) => void   // NEW
}

export default function StudySession({ cards, extraPractice, mode, onComplete, onReviewCommitted }: Props) {
```

**Core pattern — call site inside `submitReview` (line 365+, existing function; add the call right where the optimistic queue update is decided, before the background persist):**
```typescript
const submitReview = (rating: number) => {
  // … existing reviewCard() computation, queue update via setQueue …
  onReviewCommitted?.(cardId, requeue ? updatedItem.card : null)   // NEW — same
    // code path as the existing optimistic UI update, per LOCAL-03
  // … existing fire-and-forget POST /api/review (unchanged, still not awaited) …
}
```

**Error handling pattern:** No try/catch needed at this call site — `onReviewCommitted` is optional (`?.`) and its own implementation (`localCache.patchStudyCard`) is the place responsible for swallowing IndexedDB failures gracefully, matching this project's convention of pushing error-swallowing into the library layer rather than call sites.

---

### `components/Nav.tsx` (modify — add offline pill)

**Analog:** itself — the existing `useLayoutEffect` + `ResizeObserver` pattern (lines 29-43) that already publishes cross-component state (`--nav-height`) from this exact file is the precedent for "Nav owns its own client-only effect state, no prop drilling needed."

**Imports pattern (line 6, existing — add `WifiOff`):**
```typescript
import { Home, BookOpen, Layers, Flame, Settings, WifiOff } from 'lucide-react'
```

**Core pattern — new `navigator.onLine` state + listeners (per RESEARCH.md's D-02 code example, mounted inside this existing `'use client'` component, no new file needed):**
```typescript
const [isOffline, setIsOffline] = useState(false)
useEffect(() => {
  const update = () => setIsOffline(!navigator.onLine)
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}, [])
```

**JSX placement — inside the existing top header row (line 52's `<div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">`), between the brand link and the settings-gear cluster, per `34-UI-SPEC.md` Component Note 2:**
```tsx
{isOffline && (
  <div
    role="status"
    aria-live="polite"
    className="flex items-center gap-1 bg-surface-3 text-muted-foreground text-xs px-2 py-1 rounded-full shrink-0"
  >
    <WifiOff className="w-3 h-3" aria-hidden="true" />
    Offline
  </div>
)}
```

---

## Shared Patterns

### Pull-to-refresh gesture wiring
**Source:** `lib/usePullToRefresh.ts` (71 lines, exports `usePullToRefresh(onRefresh)` + `PULL_THRESHOLD = 70`) + `components/HomeClient.tsx` lines 149-195 (the only existing consumer)
**Apply to:** `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx` — mount `usePullToRefresh(handleRefresh)` at the top level of the component render (same placement HomeClient uses), each with its OWN `handleRefresh` function (never share `handleSync`, per D-04).
```typescript
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
// …
const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)
```

### Background-revalidation / offline status chrome (`role="status" aria-live="polite"`)
**Source:** `components/Toast.tsx` (existing convention for non-urgent transient status, confirmed by `34-UI-SPEC.md`)
**Apply to:** the new D-01 pill (mounted in each `*Client.tsx`) and D-02 pill (`Nav.tsx`) — both use `role="status" aria-live="polite"`, never `role="alert"`, so screen readers announce without interrupting.

### `react-hooks/purity` — no `Date.now()`/`new Date()`/`Math.random()` during render
**Source:** `components/FreshnessWatcher.tsx` lines 183-185, 233-235 (explicit inline comments enforcing this) + `CLAUDE.md` Gotchas
**Apply to:** ALL new code in `lib/local-cache.ts` (the `cachedAt: new Date().toISOString()` write must happen inside the async `write()` function body, never during a component's render), and any `isOffline`/version-check state read — always inside `useEffect` or an event-handler callback, never inline in JSX/render body.

### Cancellation-guarded async mount effects
**Source:** `components/FreshnessWatcher.tsx`'s own mount-time baseline-seed effect (lines 178-194) and the established `let cancelled = false` / `if (cancelled) return` idiom used throughout `HomeClient.tsx`/`StudyClient.tsx`
**Apply to:** every new cache-read-on-mount effect in the four `*Client.tsx` files — never call `setState` synchronously in the effect body; always inside the `.then()`/`await` continuation, with a `cancelled` guard against a stale response landing after unmount/route-change.

### Optional callback props for cross-component side effects
**Source:** `components/StudySession.tsx`'s existing `onComplete` prop (line 147)
**Apply to:** the new `onReviewCommitted` prop — same shape (optional function prop, called from inside an existing event-driven flow, never a new `useEffect`).

## No Analog Found

None — every file in this phase's scope has a direct, already-read in-repo precedent (either the file itself being modified, or `HomeClient.tsx`'s existing pull-to-refresh/cache-adjacent wiring as the template for the other three routes).

## Metadata

**Analog search scope:** `lib/`, `components/`, `app/api/version/`
**Files scanned:** `lib/local-cache.ts` (target, does not exist yet), `lib/usePullToRefresh.ts`, `lib/settings.ts` (partial, dataVersion section), `components/FreshnessWatcher.tsx` (full, 278 lines), `components/HomeClient.tsx` (grep + targeted read), `components/StudySession.tsx` (grep + targeted read), `components/CardsClient.tsx` (grep + targeted read), `components/Nav.tsx` (full, 118 lines), `app/api/version/route.ts` (full, 7 lines), `package.json` (grep, confirmed `idb`/`fake-indexeddb` not yet installed)
**Pattern extraction date:** 2026-08-09
