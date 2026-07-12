# Deferred Items — Phase 26 (freshness-fix)

## Out-of-scope discovery: intermittent `router.refresh()` delivery failure on routes with `loading.tsx`

**Found during:** Plan 26-03, Task 1/3 verification (StudyClient/CardsClient gated adoption + full-suite sweep)

**Not fixed here because:** the root cause lives in `components/FreshnessWatcher.tsx` (shipped in Plan 26-02) and Next.js 16.2.1's App Router client runtime — neither is in Plan 26-03's file list (`components/StudyClient.tsx`, `components/CardsClient.tsx`). Per the executor's scope-boundary rule, pre-existing issues outside the current task's files are logged here, not patched inline.

### Summary

`FreshnessWatcher`'s `router.refresh()` call intermittently (empirically ~15-30% of individual cell runs, concentrated on `/study` and occasionally `/habits`) fails to apply a successfully-fetched RSC payload to the already-mounted client tree, for any route that has a `loading.tsx` file (`/study`, `/cards`, `/habits`). `/` (no `loading.tsx`) was never observed to fail across 10+ isolated runs. `/cards` (has `loading.tsx`, lighter RSC query) was reliable across 7 isolated runs but showed the same failure mode once during a combined-suite run. `/study` (has `loading.tsx`, heaviest RSC query — two concurrent Prisma queries + `selectSessionCards` + `sequenceCards` + per-sentence `unknownCount` annotation) failed most often.

### Evidence chain (from Plan 26-03 investigation)

1. Instrumented `StudyClient`, `FreshnessWatcher`, and `app/study/page.tsx` with temporary console logging (removed before commit — confirmed via `git diff` showing zero debug residue in the committed code).
2. Confirmed the **server** always recomputes fresh data correctly on every `router.refresh()`-triggered request (two RSC renders logged: stale count, then fresh count, ~15-25ms apart).
3. Confirmed `FreshnessWatcher.refresh()` is called **exactly once** per trigger (no double-fire, no coalesce-window bug).
4. Confirmed the **client** sometimes never re-invokes `StudyClient`'s render function with the new `initialCards` reference at all — not a late/slow update, a permanently dropped one (5000ms `expect.poll` window, plus manual longer waits, showed no eventual recovery).
5. **Controlled experiment — root-cause isolation:** temporarily removing `app/study/loading.tsx` made the identical trigger (visibilitychange resume) **100% reliable across 10 consecutive runs** (vs. ~40-60% with `loading.tsx` present). This isolates the interaction to Next.js's Suspense-boundary / Segment Cache handling of `router.refresh()`, not anything in `StudyClient`'s own React state logic.
6. The same flake reproduces on **`/habits`** (already-shipped Plan 26-02 `HabitsClient`, using the simpler "direct prop read" adoption pattern, not the gated pattern added in this plan) — confirming this is not caused by the gated-adoption pattern introduced in Plan 26-03.
7. **Rejected fix attempts** (each tested for ≥5 runs against `/study resume`):
   - Wrapping `router.refresh()` in `startTransition` — no improvement.
   - Deferring the visibilitychange-triggered refresh to a macrotask (`setTimeout(refresh, 0)`) — made it worse (0/5 passed).
   - Firing a second coalesced `router.refresh()` ~120ms after the first — still flaky (2/5 passed), and adds a real second network request in production (violates 26-01's "no double fetch" design decision in spirit).
   - Disabling `prefetch` on the Nav's active/self-link — no improvement (3/5 still failed).
   - `router.push(currentPath, { scroll: false })` instead of `router.refresh()` — improved resume reliability (~80% in one batch) but **rejected**: `push()` adds a spurious history entry on every boundary event, corrupting real browser back/forward semantics for actual users (a genuine regression, not just a test artifact).
   - `router.replace(currentPath, { scroll: false })` — made back-forward reliability *worse* (0/5 passed).
   - Bumping Next.js from the pinned `16.2.1` to the latest `16.2.10` patch (9 patches ahead), tested via an isolated local `node_modules` copy that never touched the shared main-repo install — **no improvement** (1/5 passed for `/study resume`). Reverted; `package.json`/`package-lock.json` untouched, main repo's shared `node_modules` symlink untouched.

### Recommendation for follow-up

This is a genuine Next.js 16.2.1 App Router reliability issue (or a very deep, hard-to-configure default-caching behavior interacting badly with `router.refresh()` + `loading.tsx`), not an application bug in `FreshnessWatcher`, `StudyClient`, or `CardsClient`. Suggested next steps for a future phase:
- Track whether a later Next.js **minor/major** release (not just patch) resolves this — the "Segment Cache" / task-based navigation reducer (`refresh-reducer.js` → `navigateToKnownRoute` → `startPPRNavigation`/`spawnDynamicRequests`) looks like actively-evolving Next.js internals.
- Consider filing an upstream Next.js issue with the minimal repro (a `force-dynamic` route with `loading.tsx`, `router.refresh()` called from a `visibilitychange`/`popstate` listener, fast RSC round-trip).
- Consider an alternative boundary-refresh delivery mechanism that doesn't depend on `router.refresh()`'s Suspense/segment-cache path — e.g., an explicit client-side re-fetch of a JSON endpoint instead of relying on the RSC Flight protocol, paired with the same gated-adoption pattern already implemented in `StudyClient`/`CardsClient`/`HomeClient`/`HabitsClient`.

### Status

Open — informational, not blocking. `StudyClient`/`CardsClient`'s own adoption logic is proven correct (fires and adopts correctly on every occasion the fresh prop is actually delivered). The underlying delivery mechanism's reliability is the open item.
