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

## Out-of-scope discovery: `SwipeRow` pointer capture swallows `click` on nested buttons (mouse input)

**Found during:** Plan 26-04, Task 2 (writing the `/cards open-sheet` FRESH-02 gate cell)

**Not fixed here because:** the root cause lives in `components/SwipeRow.tsx`, which is not in Plan 26-04's file list (`e2e/freshness-gate.spec.ts` only). Per the executor's scope-boundary rule, pre-existing issues outside the current task's files are logged here, not patched inline.

### Summary

`SwipeRow.onPointerDown` unconditionally calls `e.currentTarget.setPointerCapture(e.pointerId)` on every pointerdown targeting the sliding-content wrapper div — including a plain tap/click on a nested interactive child (e.g. the "Edit" button rendered inside each card row on `/cards`). Event-trace instrumentation (`document.addEventListener(..., true)` for pointerdown/pointerup/mousedown/mouseup/click) during this plan's test-writing confirmed: `pointerdown` targets the `<button>Edit</button>` correctly, but the resulting `pointerup`, `mouseup`, and — critically — `click` events are all retargeted to the SwipeRow content `<div>` wrapper instead of the button, because Chromium redirects subsequent mouse-derived events (including `click`) to the pointer-capture target once `setPointerCapture` is called. Net effect: a zero-movement tap/click on the Edit button never fires the button's `onClick` handler at all — `setEditingId(card.id)` is never called, and the CardEditor Sheet never opens.

### Evidence

Reproduced deterministically with a throwaway instrumented spec (not committed): `page.getByRole('button', { name: 'Edit' }).first().click()` on a freshly-loaded `/cards` page produced `dialog count: 0` on every run, with the event trace showing `pointerdown target=BUTTON` immediately followed by `pointerup/mouseup/click target=DIV`. Using `locator.dispatchEvent('click')` instead of `.click()` (which fires a synthetic `click` directly rather than a real down/up gesture sequence, so it bypasses the pointer-capture redirection entirely) reliably opens the dialog. This plan's `e2e/freshness-gate.spec.ts` uses `dispatchEvent('click')` for the Edit button specifically to work around this — a test-file-only workaround, no production code touched.

### Scope note

Whether this reproduces with real touch input (mobile Safari/Chrome, the app's primary usage per the developer-profile note "Korean learner, weekly tutor") is unconfirmed — touch-derived compatibility mouse events may follow different retargeting rules than a synthesized desktop mouse click, and this app has shipped and been used with this exact SwipeRow component since the 2026-06 P2 milestone with no prior bug report. This is a real, reproducible desktop-mouse-input bug regardless, and worth a dedicated fix (e.g. only calling `setPointerCapture` after the 5px direction-lock threshold is crossed in `onPointerMove`, not unconditionally on every `onPointerDown`) in a future phase.

### Status

Open — informational, not blocking this plan. `e2e/freshness-gate.spec.ts`'s open-sheet cell works around it via `dispatchEvent('click')`, scoped entirely to the test file.
