---
phase: 34-local-first-shell
reviewed: 2026-08-10T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/api/version/route.ts
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/HabitsClient.tsx
  - components/HomeClient.tsx
  - components/Nav.tsx
  - components/SettingsClient.tsx
  - components/StudyClient.tsx
  - components/StudySession.tsx
  - e2e/freshness-fresh-paths.spec.ts
  - e2e/local-cache-cards-edit.spec.ts
  - e2e/local-cache-first-paint.spec.ts
  - e2e/local-cache-offline.spec.ts
  - e2e/local-cache-write-through.spec.ts
  - e2e/pull-to-refresh.spec.ts
  - lib/local-cache.ts
  - package-lock.json
  - package.json
  - playwright.config.ts
  - tests/local-cache.test.ts
  - tests/version-route.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-08-10
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the local-first IndexedDB cache shell added across Home/Study/Cards/Habits (`lib/local-cache.ts`), the four `*Client.tsx` migrations, `FreshnessWatcher.tsx`'s narrowing, the `GET /api/version` `buildId` addition, the Next.js 16.2.1→16.3.0 dependency bump, and the accompanying unit/e2e coverage.

**Security check (explicitly requested in scope):** no evidence anywhere in `lib/local-cache.ts` or any `*Client.tsx` write-through call site that auth tokens, the `ks_auth` cookie, or DB-backed settings secrets are ever written to IndexedDB — every cached payload traces back to `CardDTO`/`StatsDTO`/`ActivityDTO`/`HabitsCachePayload` shapes sourced from already-authenticated, already-public-to-the-session API responses. `patchActivitySlice` only ever patches `dailyGoalSeconds`/`dayStartHour`; color/reading-aid settings have no cached-DTO home and are never written. This matches the phase's own threat model and 34-RESEARCH.md's V8 analysis. Clean.

**Lockfile check (explicitly requested in scope):** `package.json`/`package-lock.json` diff is a routine `next`/`eslint-config-next` 16.2.1→16.3.0 bump plus the two new deps (`idb@8.0.3`, `fake-indexeddb@6.2.5`) and their transitive closures (including a `sharp`/`@img/*` bump, presumably pulled in by Next's own toolchain deps). Every `resolved` URL in the diff points at `registry.npmjs.org`; no new `postinstall`/`preinstall` scripts appear anywhere in the diff. Clean.

**Correctness:** the write-through/mount-read/boundary-revalidation pattern is implemented consistently on 3 of the 4 routes (Home, Cards, Habits), each following the same `cancelled`-guard-after-every-`await` idiom correctly. **`components/StudyClient.tsx` breaks this consistency in a way that produces a real, reproducible bug** (CR-01 below): its cache-first mount effect re-fires on every lesson-range filter change (because its `revalidate` dependency captures `lessonFrom`/`lessonTo`/`maxOrder` directly instead of via a ref, unlike the file's own `phaseRef` precedent), and the mount effect's cache-adoption step has no equivalent of `revalidate`'s own full-span/phase gate — so applying a lesson filter after any prior `/study` visit can silently revert the due list back to the unfiltered pool. Two further findings (WR-01, WR-02) cover a cache write-through gap on the undo-a-graduating-grade path and a content-flash risk on Home's boundary-triggered resume path. None of these three are covered by the new e2e suite — I traced each against `e2e/local-cache-write-through.spec.ts`/`e2e/local-cache-first-paint.spec.ts`/`e2e/pull-to-refresh.spec.ts` to confirm they're genuinely un-exercised, not just under-asserted.

## Critical Issues

### CR-01: `/study`'s cache-first mount effect re-fires on every lesson-range filter change and unconditionally reverts the due list to the stale, unfiltered cached entry

**File:** `components/StudyClient.tsx:183-198` (`revalidate`), `components/StudyClient.tsx:205-227` (mount effect), specifically lines 216-219 and 227
**Issue:** The mount effect is declared `useEffect(() => { ... }, [revalidate])` (line 227). `revalidate` is a `useCallback` with dependency array `[lessonFrom, lessonTo, maxOrder]` (line 198) — its identity changes every time the user applies a lesson-range filter via `handleRangeChange` (line 272-277). Because the mount effect's own dependency is `revalidate` itself, **every filter application re-runs the "mount" effect**, which is not gated to run only once.

Inside that re-run, lines 216-219 do:
```ts
const cached = await readCache<StudyCachePayload>(buildId, 'study')
if (cancelledRef.current) return
if (cached) {
  setStudyCards(cached.data)   // <-- unconditional, no phase/full-span guard
  setScope('due')
}
```
This unconditionally overwrites `studyCards` with whatever is in the `study` cache entry — which, per the file's own comment at line 176, **always stores the unfiltered full-span due list** — regardless of the filter the user just applied. `revalidate` itself (called a few lines later, only when `cached.dataVersion !== version`) *does* correctly gate re-adoption behind `isFullSpan(lessonFrom, lessonTo, maxOrder)` (line 190), but that gate does not protect the earlier, unconditional `setStudyCards(cached.data)` at line 217.

Concretely, for any user who has visited `/study` before (so a `study` cache entry already exists) and then narrows the lesson range:
1. `handleRangeChange` sets `lessonFrom`/`lessonTo` and calls `loadDue(from, to, maxOrder)`, which correctly fetches and shows the filtered due list.
2. The `lessonFrom`/`lessonTo` state change gives `revalidate` a new identity, which re-triggers the mount effect.
3. The re-triggered effect's `readCache('study')` call resolves and unconditionally sets `studyCards` back to the cached **unfiltered** list.
4. If the cache entry's `dataVersion` still matches the current `/api/version` value (the common case — no new sync/review happened in between), `revalidate()` is never called at all, so nothing ever corrects the now-wrong `studyCards`/due count. The user is left looking at the wrong (unfiltered) due count/list after applying a filter, with no further trigger to fix it short of re-touching the filter.

This is not covered by `e2e/local-cache-write-through.spec.ts` (which never changes the lesson filter) or any other spec in this phase's diff. `HabitsClient.tsx` and `CardsClient.tsx` avoid this class of bug because their `revalidate` callbacks have a stable `[]` dependency array and read filter-adjacent state via refs (`groupsRef` in `CardsClient.tsx`) rather than closing over it directly — `StudyClient.tsx` should follow the same pattern.

**Fix:** Give `revalidate` a stable identity and read `lessonFrom`/`lessonTo`/`maxOrder` through a ref (mirroring the file's own `phaseRef` precedent at lines 55-56), so the mount effect only ever runs once:
```ts
const filterRef = useRef({ lessonFrom, lessonTo, maxOrder })
useEffect(() => { filterRef.current = { lessonFrom, lessonTo, maxOrder } }, [lessonFrom, lessonTo, maxOrder])

const revalidate = useCallback(async (buildId: string, version: string, cancelledRef: { current: boolean }) => {
  setIsRevalidating(true)
  try {
    const res = await fetch('/api/cards/due')
    if (cancelledRef.current || !res.ok) return
    const fresh = (await res.json()) as CardDTO[]
    if (cancelledRef.current) return
    const { lessonFrom, lessonTo, maxOrder } = filterRef.current
    if (phaseRef.current === 'select-mode' && isFullSpan(lessonFrom, lessonTo, maxOrder)) {
      setStudyCards(fresh)
      setScope('due')
    }
    await writeCache(buildId, 'study', fresh, version)
  } finally {
    if (!cancelledRef.current) setIsRevalidating(false)
  }
}, []) // stable — mount effect now only runs once
```
Additionally, gate the mount effect's own cache-adoption block (line 216-219) with the same `isFullSpan(...)` check `revalidate` already uses, so even a legitimate one-time mount adoption can never clobber an already-applied filter:
```ts
if (cached && isFullSpan(lessonFrom, lessonTo, maxOrder)) {
  setStudyCards(cached.data)
  setScope('due')
}
```

## Warnings

### WR-01: `patchStudyCard`'s replace-only semantics silently drop a card that undo should have restored to the cache

**File:** `lib/local-cache.ts:200-215` (`patchStudyCard`), `components/StudySession.tsx:477` (submitReview call site) and `:572` (handleUndo call site)
**Issue:** `patchStudyCard`'s non-null branch is `entry.data.map((c) => (c.id === cardId ? updatedCard : c))` (line 209) — a pure `.map()`, which can only **replace** an element that's already present in the array. It cannot **re-insert** an element that was previously removed.

Trace the graduate-then-undo sequence:
1. User grades a card with a rating that graduates it out of the session (e.g. "Easy" on a brand-new due card, per `e2e/local-cache-write-through.spec.ts`'s own comment at line 172-176 confirming this empirically). `submitReview` computes `requeue = false`, and `onReviewCommitted?.(cardId, null)` (line 477) is called → `patchStudyCard(buildId, cardId, null)` → the cache entry's `data.filter(c => c.id !== cardId)` **removes** the card from the cached `study` array.
2. User immediately taps Undo. `handleUndo` calls `onReviewCommitted?.(cardId, prevHead.card)` (line 572) with the pre-grade card → `patchStudyCard(buildId, cardId, prevHead.card)`. But since the card is no longer present in `entry.data`, the `.map()` at line 209 does nothing — the card is **not** re-added to the cache.
3. `POST /api/review/undo` also never calls `bumpDataVersion()` (confirmed for this exact route in 33-REVIEW.md WR-02, unchanged by this phase), so the next mount-time or boundary-event revalidation on `/study` will see a matching `dataVersion` and skip re-fetching — meaning the cache stays **permanently missing that card** (understating the due count by one) until some unrelated write elsewhere in the app happens to bump the counter.

React state (`queue`) is restored correctly by `setQueue(prevQueue)` in the same `handleUndo`, so the *active session* is unaffected — only a future cache-first paint of `/study` (before revalidation completes) will silently omit the undone card.

**Fix:** Make `patchStudyCard`'s replace path insertion-aware — if `updatedCard` is non-null and its id isn't found in `entry.data`, append/prepend it instead of no-op'ing:
```ts
const nextData = updatedCard
  ? (entry.data.some((c) => c.id === cardId)
      ? entry.data.map((c) => (c.id === cardId ? updatedCard : c))
      : [updatedCard, ...entry.data])
  : entry.data.filter((c) => c.id !== cardId)
```

### WR-02: Home's cache-first mount-read effect re-fires on every boundary-triggered RSC refresh and can flash the just-delivered fresh state back to a stale cached value

**File:** `components/HomeClient.tsx:173-224`, dependency array at line 224
**Issue:** The effect is declared `useEffect(() => { ... }, [checkBandUp, initialStats, initialActivity])`. Unlike `HabitsClient.tsx`'s equivalent effect (`}, [revalidate])` with a stable-identity `revalidate`, `initialStats`/`initialActivity` are **props** that FreshnessWatcher's unconditional `router.refresh()` re-delivers with a new object reference on every boundary event (visibilitychange/popstate/pageshow) — Home has no `loading.tsx`, so per `FreshnessWatcher.tsx`'s own doc comment this RSC re-delivery is reliable and frequent (every resume/back-forward).

Sequence on a boundary-triggered refresh:
1. `router.refresh()` re-renders `HomeClient` with new `initialStats`/`initialActivity` props.
2. The render-phase "props-win" blocks (lines 60-77) synchronously adopt them into `stats`/`activityData` before commit — correct, no flash yet.
3. Because `initialStats`/`initialActivity` changed, the cache-first mount-read effect (lines 173-224) **re-runs** post-commit. It `await`s `fetchCacheContext()` then `readCache('home')`, and unconditionally does `setStats(cached.data.stats); setActivityData(cached.data.activity)` (lines 184-187) with **no check that the cache is at least as fresh as what was just rendered in step 2**.
4. If the cached `home` entry predates the write that triggered this refresh (e.g., another tab/device just synced or graded a card while this tab was backgrounded), the just-displayed fresh values are replaced by the stale cached ones for the ~1 fetch-round-trip duration until the subsequent `dataVersion` check (lines 189+) fires a real revalidation and corrects it again.

This is a real violation of D-01's explicit requirement ("Content itself doesn't flash or shift") in the specific cross-tab/cross-device resume scenario the whole phase's freshness machinery targets — narrower and self-correcting (unlike CR-01), but not covered by any spec in this diff (`e2e/local-cache-first-paint.spec.ts` only exercises `/habits`; `e2e/pull-to-refresh.spec.ts`'s Home cell never tests a boundary-refresh-then-stale-cache race).

**Fix:** Either (a) drop `initialStats`/`initialActivity` from the dependency array (mirroring `HabitsClient.tsx`, since the render-phase props-win blocks already handle prop adoption independently of this effect) so this effect truly only runs once at mount, or (b) if re-running on every RSC delivery is intentional, gate the cache-adoption at lines 184-187 on the cache entry's `dataVersion` being at least as new as what's already displayed (requires stamping `stats`/`activityData` with their own version, which isn't currently tracked) before overwriting.

### WR-03: `handleSync`'s `setSyncMsg` calls aren't guarded by `isMountedRef`, unlike every other async continuation in the same file

**File:** `components/HomeClient.tsx:265-269`, `:295`
**Issue:** `loadStats`/`loadActivity` (lines 117-147) and `checkBandUp`'s confetti import (line 101) all check `isMountedRef.current` before calling `setState` after an `await`. `handleSync` (lines 246-297) — the pull-to-sync handler — does not: both the success-path `setSyncMsg(...)` (lines 265-269) and the catch-path `setSyncMsg('Sync failed...')` (line 295) fire unconditionally after `await fetch('/api/sync', ...)` and `await Promise.all([loadStats(), loadActivity()])`, with no `isMountedRef.current` check. If the user navigates away from `/` while a pull-to-sync request is still in flight, this calls `setState` on an unmounted component. React 19 no longer surfaces a console warning for this specific case, so it's low-severity, but it's an inconsistency against the file's own established pattern and worth normalizing for the sake of the next person extending this handler.
**Fix:** Add the same guard used elsewhere in the file:
```ts
if (isMountedRef.current) {
  setSyncMsg(data.newCards > 0 ? `Synced — ${data.newCards} new card${data.newCards !== 1 ? 's' : ''}` : 'Up to date')
}
...
} catch {
  if (isMountedRef.current) setSyncMsg('Sync failed — try again from Settings')
}
```

## Info

### IN-01: `updatedItem.kind === 'real'` check in `submitReview`'s write-through call is always true and can be dropped

**File:** `components/StudySession.tsx:477`
**Issue:** `onReviewCommitted?.(cardId, requeue && updatedItem.kind === 'real' ? updatedItem.card : null)` is only reached inside the `if (current.kind === 'real') { ... }` block (line 400), and `updatedItem` is initialized to `current` and only ever reassigned to another `{ kind: 'real', ... }` object within that same branch (lines 429-447) — so `updatedItem.kind === 'real'` is always `true` at this call site. Not a bug, just a redundant condition that could mislead a future reader into thinking practice-card review commits reach this line (they can't; the `else` branch at line 495 never calls `onReviewCommitted`).
**Fix:** Simplify to `onReviewCommitted?.(cardId, requeue ? updatedItem.card : null)`, or leave as defensive belt-and-suspenders with a one-line comment noting it's always true today.

### IN-02: `nextDataVersionToken()`'s known millisecond-collision risk (33-REVIEW.md WR-01) directly undermines this phase's `dataVersion !== version` gate too, and remains unfixed

**File:** `lib/settings.ts:335-337` (unchanged by this phase, referenced from every `*Client.tsx`'s revalidation gate), e.g. `components/CardsClient.tsx:611`, `components/StudyClient.tsx:221`, `components/HabitsClient.tsx:156`
**Issue:** 33-REVIEW.md's WR-01 flagged that `nextDataVersionToken()` (`String(Date.now())`, millisecond resolution, no monotonicity guard) can produce identical tokens for two writes in the same millisecond, silently defeating `FreshnessWatcher`'s version gate. This phase's entire cache-invalidation model (`cached.dataVersion !== version`, checked identically in all four `*Client.tsx` mount effects and boundary-event handlers) depends on the exact same `dataVersion` string — so the same collision risk now also means a cache entry can fail to be recognized as stale after a same-millisecond write, on every one of the four routes this phase migrated, not just the retired JSON backstop. Flagging for visibility since this phase inherits and amplifies (more call sites depend on it now) a known, still-unfixed issue rather than introducing a new one — no new fix required in this phase's own files, but WR-01's fix (a strictly-increasing token) would now benefit 4 routes instead of 1.

---

_Reviewed: 2026-08-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
