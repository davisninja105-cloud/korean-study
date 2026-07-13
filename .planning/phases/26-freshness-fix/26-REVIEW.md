---
phase: 26-freshness-fix
reviewed: 2026-07-12T23:30:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - app/layout.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/HabitsClient.tsx
  - components/HomeClient.tsx
  - components/StudyClient.tsx
  - e2e/freshness-client-shell.spec.ts
  - e2e/freshness-gate.spec.ts
  - e2e/freshness-router-cache.spec.ts
  - e2e/helpers/rsc.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-07-12T23:30:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This is a re-review of the full current state of the freshness-fix files after Plans 26-04/26-05
landed on top of the previously-reviewed 26-01/02/03 state. Disposition of the prior review's
findings first, then what's new.

**Prior CR-01 (HabitsClient's `today` not recomputing on fresh props) — FIXED.** The `useEffect`
deps at `components/HabitsClient.tsx:117-119` now include `days` and `masteredCount`, not just
`dayStartHour`, so a resume/back-forward boundary event correctly recomputes `today` alongside the
adopted `days`/`goal`/`masteredCount` values. Confirmed no regression.

**Prior WR-01 (`lessons` state never adopts fresh data) — STILL APPLIES AS-IS, unaddressed.**
`components/CardsClient.tsx:53` and `components/StudyClient.tsx:45` still capture
`const [lessons] = useState<LessonRefItem[]>(initialLessons)` / `useState<LessonDTO[]>(initialLessons)`
with no setter and no adoption block. Neither Plan 26-04 nor 26-05 touched this. `StudyClient`'s
`maxOrder` (derived from this frozen list) still feeds directly into the new freshness gates
(`isFullSpan(lessonFrom, lessonTo, maxOrder)` at lines 138 and 163), so a lesson synced after mount
still risks an incorrect full-span/narrowed-range classification for the very mechanism this phase
built. Re-flagged below as WR-02.

**Prior WR-02 (shared non-route-aware coalesce window) — STILL APPLIES AS-IS, and now also gates
the new backstop delivery.** `components/FreshnessWatcher.tsx`'s `refresh()` (lines 138-146) still
uses one `lastRefreshRef` with no route awareness, and it now calls both `router.refresh()` and
`fetchBackstop()` from inside the same coalesce guard. This doesn't change the shape of the
original bug (a route-B boundary event landing within 300ms of a route-A refresh is still
silently dropped), but it does mean that when the bug fires, *both* delivery mechanisms are
suppressed together for the newly-navigated-to route, not just the RSC refresh. Re-flagged below
as WR-03.

**Prior WR-03 (e2e prefetch false-positive) — STILL APPLIES AS-IS to the two original spec files
(unaddressed).** Also loosely relevant to the new `e2e/freshness-gate.spec.ts` (see IN-02 below),
though at lower severity because that file's assertions are negative/content-based rather than
relying on fetch-count as proof of a fix.

**New in this pass:** the JSON backstop mechanism added in Plan 26-05 introduces a genuine (if
narrow) race: `fetchBackstop()`'s "re-check `window.location.pathname` before `setPayloads`" guard
protects against writing into the *wrong route's* slice, but it does **not** protect against an
**older** response for the *same* route overwriting a **newer** one — neither across concurrent
in-flight backstop fetches, nor across a component remount. See WR-01 below, which directly
answers the review brief's specific question about this.

The render-phase gated-adoption pattern itself (`prevInitialCards`/`prevFreshCards` in
`CardsClient`, `prevInitialCards`/`prevFreshStudy` in `StudyClient`, `prevFreshHabits`/
`prevInitialDays`/`freshOverride` in `HabitsClient`) is correct where it matters most: every gate
correctly ANDs together the relevant in-flight-interaction flags (`editingId === null`, `!showAdd`,
`!adding`, `deletingIds.size === 0` for Cards; `phase === 'select-mode' && !isFilterLoading &&
isFullSpan(...)` for Study) before calling the corresponding setter, and the incoming reference is
always marked "consumed" independent of whether it was applied, so a later gate-open event isn't
blocked by a stale comparison. No clobbering of an open sheet or in-session queue was found in this
pass — `e2e/freshness-gate.spec.ts`'s two new FRESH-02 cells exercise exactly this and their
assertions match the actual gating code.

Security: no new concerns. The three fetch targets (`/api/cards/due`, `/api/cards`,
`/api/activity` + `/api/stats`) are pre-existing endpoints already called by other client shells
using the same same-origin cookie session; `middleware.ts`'s matcher continues to cover all of
them, so an unauthenticated `fetchBackstop()` call gets a 401 (treated as `!res.ok` → `null`,
degrading silently) rather than leaking data. No new endpoints, no new secrets, no cross-origin
calls were introduced.

## Warnings

### WR-01: `fetchBackstop`'s pathname re-check guards cross-route contamination but not same-route staleness ordering

**File:** `components/FreshnessWatcher.tsx:87-136`
**Issue:** Every backstop `.then()` re-checks `window.location.pathname === '<route>'` before calling
`setPayloads`, which correctly prevents a late-arriving `/study` response from being written into
`payloads.cards` after the user has navigated to `/cards`. But `FreshnessWatcher` is mounted once
at the root and never unmounts across client-side navigation, so its backstop fetches also outlive
the *page shell instance* that triggered them. Two concrete race windows follow from this:

1. **Concurrent in-flight requests to the same route.** If a boundary event fires `fetchBackstop()`
   for `/study` (slow response pending), and — after the 300ms coalesce window elapses — a second
   boundary event fires another `fetchBackstop()` for `/study`, both promises resolve independently.
   Whichever *arrives* last wins via `setPayloads((prev) => ({ ...prev, study: result }))`,
   regardless of which was *issued* last. Out-of-order network responses (plausible on a flaky
   mobile connection with repeated background/foreground flapping) can silently regress the
   displayed data to an older snapshot.
2. **Post-remount adoption of a stale pre-navigation response.** A user on `/study` triggers a slow
   backstop fetch, quickly navigates away and back to `/study` (a fresh `StudyClient` instance
   mounts with fresh `initialCards`/RSC props), and *then* the original stale backstop response
   resolves. The pathname check still passes (`/study` again), so `setPayloads` fires. The new
   `StudyClient` instance's `prevFreshStudy` was mount-seeded to whatever `payloads.study` held at
   mount time (see `components/StudyClient.tsx:156`), so this late arrival looks like a brand-new
   delivery to the fresh instance and — if its gate happens to be open (`phase === 'select-mode'`,
   not filtering, full span selected, all very plausible immediately after a fresh navigation) — it
   is adopted, overwriting the just-mounted shell's genuinely fresher server-rendered props with
   older data. The same mechanism applies identically to `CardsClient`'s `freshCards` and
   `HabitsClient`'s `freshHabits`/`freshOverride`.

   Impact is bounded (no data loss, self-heals on the next real boundary event, client-state only),
   but it directly undermines the phase's stated goal of never showing stale data after a resume/
   navigation boundary — it can now do so via the very mechanism built to prevent it.
**Fix:** Tag each backstop request with a monotonically increasing sequence number (or route+time
generation) captured before the `fetch()` call, and only apply the response if it is still the
*latest* issued request for that slice:
```tsx
const studySeqRef = useRef(0)
// ...
if (path === '/study') {
  const seq = ++studySeqRef.current
  fetch('/api/cards/due')
    .then((res) => (res.ok ? res.json() : null))
    .then((result: unknown) => {
      if (seq === studySeqRef.current && Array.isArray(result) && window.location.pathname === '/study') {
        setPayloads((prev) => ({ ...prev, study: result as CardDTO[] }))
      }
    })
    .catch(() => {})
}
```
This also incidentally fixes the remount case, since a fresh mount doesn't reset the module-owned
sequence counter but a *new* boundary event on the new instance will always issue a higher `seq`
than any stale in-flight request.

### WR-02: `lessons` state in CardsClient/StudyClient still never adopts fresh data (carried forward, unaddressed)

**File:** `components/CardsClient.tsx:53`, `components/StudyClient.tsx:45`
**Issue:** Unchanged from the prior review. Both shells still do:
```tsx
const [lessons] = useState<LessonRefItem[]>(initialLessons)   // CardsClient
const [lessons] = useState<LessonDTO[]>(initialLessons)       // StudyClient
```
with no setter and no adoption block, so a newly-synced lesson never appears in either page's
lesson-range filter without a hard reload, and `StudyClient`'s `maxOrder` (derived from this frozen
list) can under-report the true upper bound fed into the new `isFullSpan(...)` freshness gates.
**Fix:** Same as previously suggested — either read `initialLessons` directly (no local
`useState` wrapper; there's no in-flight interaction protecting this particular piece of state), or
add an ungated adoption block mirroring `HomeClient`'s pattern:
```tsx
const [lessons, setLessons] = useState<LessonRefItem[]>(initialLessons)
const [prevInitialLessons, setPrevInitialLessons] = useState(initialLessons)
if (initialLessons !== prevInitialLessons) {
  setPrevInitialLessons(initialLessons)
  setLessons(initialLessons)
}
```

### WR-03: `FreshnessWatcher`'s shared, non-route-aware coalesce window now also suppresses the JSON backstop (carried forward, unaddressed)

**File:** `components/FreshnessWatcher.tsx:138-146`
**Issue:** Unchanged root cause from the prior review: one `lastRefreshRef` timestamp gates all
three listeners (`visibilitychange`, `popstate`, `pageshow`) regardless of which route the event
pertains to, so a route-B boundary event landing within 300ms of an unrelated route-A refresh is
silently dropped. Previously this only meant route B missed its `router.refresh()`; now that
`refresh()` also calls `fetchBackstop()`, a dropped event means route B gets **neither** delivery
path — the RSC refresh and its Suspense-independent backstop are suppressed together, for the exact
routes (`/study`, `/cards`, `/habits`) that most need the backstop's protection against the
Next.js 16.2.1 Suspense-application flake documented in `deferred-items.md`.
**Fix:** Same as previously suggested — key the coalesce window on `(path, time)` rather than time
alone:
```tsx
const lastRefreshRef = useRef<{ time: number; path: string }>({ time: 0, path: '' })
const refresh = () => {
  const now = Date.now()
  const path = window.location.pathname
  const last = lastRefreshRef.current
  if (path === last.path && now - last.time < COALESCE_MS) return
  lastRefreshRef.current = { time: now, path }
  router.refresh()
  fetchBackstop()
}
```

### WR-04: e2e "network evidence" assertions in the two original freshness specs still don't rule out Link-prefetch as a false-positive source (carried forward, unaddressed)

**File:** `e2e/freshness-client-shell.spec.ts:144-149`, `e2e/freshness-router-cache.spec.ts:131-133,162-164`
**Issue:** Unchanged from the prior review — `newFetches.length > 0` / `newDataFetchesForRoute(...)`
is still satisfiable by an ambient Next.js `<Link>` prefetch to the target pathname (`Nav` renders
links to all four main routes on every page), independent of whether `FreshnessWatcher`'s
boundary-refresh logic fired at all.
**Fix:** Unchanged — disable prefetch on the `Nav` links for these test flows (`prefetch={false}`),
or assert on a request-shape signal that's provably specific to `router.refresh()` rather than any
same-pathname fetch.

## Info

### IN-01: Redundant back-to-back `waitForTimeout` calls (carried forward, unaddressed)

**File:** `e2e/freshness-router-cache.spec.ts:159-160`
**Issue:** `await page.waitForTimeout(250)` immediately followed by `await page.waitForTimeout(300)`
— 550ms total, inconsistent with the file's own "300ms settle margin" convention used everywhere
else. Unchanged since the prior review.
**Fix:** Collapse to a single `await page.waitForTimeout(300)`, or document why the resume path
needs the extra 250ms.

### IN-02: `freshness-gate.spec.ts`'s `waitForRscFetch` evidence has the same (lower-stakes) prefetch ambiguity as WR-04

**File:** `e2e/freshness-gate.spec.ts:68,121`
**Issue:** Both FRESH-02 cells create `const rscFetch = waitForRscFetch(page, '/study' | '/cards')`
before firing `simulateResume`, then `await rscFetch` before asserting non-clobber. Like the two
older spec files, `waitForRscFetch`'s predicate can't distinguish a genuine boundary-triggered
`router.refresh()` request from an ambient Nav-link prefetch to the same pathname that happens to
resolve during the window. Unlike the older specs, though, this doesn't threaten the tests'
correctness: the actual pass/fail bar here is content-based (`revealed` state, card face,
progress label, sheet input value, card count all unchanged), not fetch-count-based, so a
false-positive `rscFetch` resolution would at most make the header comment's claim ("delivery
provably occurred") slightly overstated — it would not cause a broken gate implementation to pass.
**Fix:** Optional / low priority. If WR-04 is ever fixed (e.g. `prefetch={false}` on Nav links or a
stronger request-shape predicate), this file gets the same rigor for free with no changes needed
here.

### IN-03: `FreshnessWatcher`'s deferred `popstate` timer still isn't cancelled on unmount (carried forward, unaddressed)

**File:** `components/FreshnessWatcher.tsx:161`
**Issue:** `onPopState` still schedules a bare `setTimeout(refresh, 0)` with no reference stored for
cleanup; the effect's cleanup function only removes event listeners. Low risk in practice (this
component is mounted once at the root and effectively never unmounts), but latent if that ever
changes. Unchanged since the prior review.
**Fix:** Store the timer id in a ref and `clearTimeout` it in the cleanup function.

### IN-04: Monolithic `FreshPayloadContext` causes cross-route consumer re-renders

**File:** `components/FreshnessWatcher.tsx:79,180-183`
**Issue:** All three backstop slices (`study`, `cards`, `habits`) live in a single `payloads` state
object, and `setPayloads` always spreads to a new top-level object even when only one slice
changes. Because `useFreshPayload()` subscribes to the whole context, `StudyClient`, `CardsClient`,
and `HabitsClient` — whichever happens to be mounted — all re-render whenever *any* one of the
three backstop deliveries lands, not just the one relevant to the currently-mounted route. This
doesn't cause incorrect behavior (each shell's own gate correctly no-ops when its destructured
slice reference is unchanged), but it's an avoidable inefficiency and slightly muddies the
single-responsibility boundary between the three delivery paths. Flagged as a quality nit only
(not a performance-issue finding, which is out of this review's v1 scope).
**Fix:** Either split into three independent contexts (`StudyFreshContext`, `CardsFreshContext`,
`HabitsFreshContext`) or keep a single context but memoize/only update the slice that actually
changed, so unrelated shells don't re-render on unrelated deliveries.

### IN-05: Backstop JSON responses are trusted via type assertion with no runtime shape validation

**File:** `components/FreshnessWatcher.tsx:98,107,116`
**Issue:** `setPayloads((prev) => ({ ...prev, study: result as CardDTO[] }))` and the `/habits`
branch's `[activity, stats]: [ActivityDTO | null, StatsDTO | null]` type annotation are both
unchecked assertions over `res.json()`'s `any`-typed result. The only runtime check performed is
`Array.isArray(result)` for the array-shaped responses, and simple truthiness for the object-shaped
ones — neither verifies the actual field shape (e.g. that each array element has a `sentences`
array, or that `activity.days` is actually an array of `DayRecord`). Low risk today since these are
same-origin, same-codebase API routes that already produce `CardDTO[]`/`ActivityDTO`/`StatsDTO`
shapes, but if any of those routes' response shape ever drifts, this consumer would silently accept
malformed data and pass it straight into `setCards`/`setStudyCards`/`freshOverride`, likely causing
a downstream render crash (e.g. `.map` on an unexpected field) rather than a clean degrade. This is
the same class of trust boundary (a fetch response consumed without shape validation) that
`CLAUDE.md`'s conventions call for validating immediately after receipt for LLM/external responses
— here it's an internal endpoint, so the risk is lower, but the same discipline would apply.
**Fix:** At minimum, guard the array case with a couple of duck-type field checks (e.g.
`result.every(c => typeof c.id === 'string' && typeof c.front === 'string')`) before casting.

### IN-06: Asymmetric same-render tie-break order between `prevInitialCards`/`prevFreshCards` (and `StudyClient`'s equivalent) vs `HabitsClient`'s explicit "props win" invariant

**File:** `components/CardsClient.tsx:77-100`, `components/StudyClient.tsx:135-168`
**Issue:** `HabitsClient` explicitly documents and implements "props win" — its `prevInitialDays`
block runs after `prevFreshHabits`'s block and unconditionally clears `freshOverride` whenever a
new RSC prop reference arrives, guaranteeing a genuinely-fresher RSC delivery always wins over a
backstop value if both land in the same render. `CardsClient` and `StudyClient` have no equivalent
tie-break: `setCards(initialCards)` (from the `prevInitialCards` block) is unconditionally followed
in source order by `setCards(freshCards)`/`setStudyCards(freshStudy)` (from the `prevFreshCards`/
`prevFreshStudy` block) if both fire in the same render, so the *backstop* value silently wins
instead. In practice this rarely matters (the two deliveries are independent async completions
that essentially never land in the exact same render), and neither value is unambiguously "more
correct" than the other in the general case, but the inconsistency across the three shells is worth
noting since it means the same conceptual scenario (RSC prop + backstop payload both fresh) is
resolved by different, undocumented rules depending on which page you're on.
**Fix:** Either document the current backstop-wins ordering as intentional in `CardsClient`/
`StudyClient` (a one-line comment noting which source wins on same-render collision, mirroring
`HabitsClient`'s explicit callout), or restructure to match `HabitsClient`'s explicit props-win
model for consistency across all three shells.

---

_Reviewed: 2026-07-12T23:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
