---
phase: 34-local-first-shell
plan: 05
subsystem: frontend-caching
tags: [freshness-watcher, router-refresh, pull-to-refresh, offline, indexeddb, e2e]

requires:
  - phase: 34-local-first-shell
    plan: "02"
    provides: "components/StudyClient.tsx fully migrated off useFreshPayload — no remaining consumer to break when the backstop export is deleted"
  - phase: 34-local-first-shell
    plan: "03"
    provides: "components/CardsClient.tsx fully migrated off useFreshPayload — no remaining consumer"
  - phase: 34-local-first-shell
    plan: "04"
    provides: "components/HomeClient.tsx cache-first migration and components/Nav.tsx's Offline pill — the pill this plan's offline spec asserts on"
provides:
  - "components/FreshnessWatcher.tsx narrowed to its unconditional router.refresh() half — the JSON payload backstop, its context, its hook, and its version-gate machinery are fully retired (D-00 rule 3)"
  - "components/CardsClient.tsx boundary-event revalidation (visibilitychange/popstate/pageshow) — the missing piece that makes the narrowing safe for /cards specifically"
  - "e2e/pull-to-refresh.spec.ts + e2e/local-cache-offline.spec.ts — the phase's two closing e2e proofs (LOCAL-04 escape hatch, LOCAL-05 offline rendering)"
affects: []

actuals:
  tokens: 14588
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Retiring a dual-delivery mechanism (RSC + JSON backstop) safely requires auditing EVERY consumer's own boundary-event coverage first, not just its payload-consumption removal — CardsClient.tsx had removed its useFreshPayload() consumption in plan 34-03 but never gained the boundary-event revalidation effect plans 34-01/34-02 already proved necessary for the same Next.js 16.2.1 flake, leaving a silent zero-fallback gap the backstop had been quietly covering"
    - "Browser TouchEvent/Touch constructors are present in headless Chromium even without touch emulation (hasTouch: false, maxTouchPoints: 0) — page.evaluate can dispatch real touch gestures on window when a hook only listens for touchstart/touchmove/touchend, no CDP touch injection needed"
    - "context.setOffline(true/false) fires real browser online/offline events in this Playwright harness — a live navigator.onLine-driven UI element (the Offline pill) updates with no reload required"
    - "Every route in this app is force-dynamic with no service worker in this phase — a full document navigation (hard reload OR client-side <Link>) while context.setOffline is true fails hard (net::ERR_INTERNET_DISCONNECTED / chrome-error://), confirmed for all three non-Home routes this session; LOCAL-05's achievable proof is an already-mounted page continuing to render, never a fresh offline load"

key-files:
  created:
    - e2e/pull-to-refresh.spec.ts
    - e2e/local-cache-offline.spec.ts
  modified:
    - components/FreshnessWatcher.tsx
    - components/CardsClient.tsx
    - components/HabitsClient.tsx
    - lib/local-cache.ts
    - e2e/freshness-fresh-paths.spec.ts
    - playwright.config.ts

key-decisions:
  - "Task 1's blocking checkpoint:decision was pre-resolved by the developer via the orchestrator's pre-dispatch AskUserQuestion, BEFORE this executor was dispatched: option-a — 'Full narrowing — retire the JSON half entirely' (34-RESEARCH.md's recommendation). The developer's exact words: 'I want full narrowing, but I also want to get rid of the bug if possible. Please spend time attempting to get rid of this bug while narrowing.' The Next.js version-bump/bug-fix investigation itself is explicitly OUT of this plan's scope — the orchestrator handles that separately, afterward, on the main tree, outside this worktree. This executor's job was exactly Tasks 2 and 3 under option-a's scope."
  - "VERS-02 supersession (recorded per the plan's own must_haves backstop item): Phase 33's requirement text reads 'the backstop itself is not removed (works around a real Next 16.2.1 flake)'. That requirement is superseded, not violated — components/FreshnessWatcher.tsx, its unconditional router.refresh() half, its 300ms coalesce, its three boundary-event listeners, and its Next.js-bug documentation all survive byte-for-byte in spirit. Only the redundant JSON payload delivery half (and the version-gate machinery that existed solely to decide whether to fire it) is gone, because each *Client.tsx shell now performs its own Suspense-independent cache read plus version-checked revalidation — structurally the same second delivery path the backstop provided. This is precisely what D-00 rule 3 required and what 34-RESEARCH.md concluded was the discretion D-00 granted."
  - "Rule 2 auto-add: components/CardsClient.tsx had NO boundary-event revalidation effect before this plan — only a mount-time cache-read+revalidation check. /cards has its own app/cards/loading.tsx and is one of the exact routes subject to the real, unfixed Next.js 16.2.1 Suspense/Segment-Cache application flake (the same one plans 34-01/34-02 already found and fixed for /habits and /study respectively, per 34-02-SUMMARY.md's explicit Next-Phase-Readiness call-out that 34-03 should replicate it). Retiring FreshnessWatcher's JSON backstop without this fix would have left /cards with ZERO delivery fallback on a boundary event where the RSC application silently fails — the exact failure mode the backstop existed to catch. Added a shared revalidate() body plus a second boundary-event useEffect (visibilitychange/popstate/pageshow, 300ms coalesce) mirroring HabitsClient.tsx's/StudyClient.tsx's already-shipped precedent exactly. A `groupsRef` live mirror of `groups` state lets the shared revalidate() body read 'what's currently loaded' without depending on `groups` itself (which would force new listener registrations on every content change)."
  - "Rule 3 fix: two doc-comment references to the now-deleted `useFreshPayload`/`HabitsFreshPayload` identifiers (components/HabitsClient.tsx line ~103, lib/local-cache.ts line ~55) would have made this plan's own acceptance-criteria grep (`grep -rn \"useFreshPayload|...\" components/ app/ lib/` returns zero lines) fail. Reworded both to describe the retired mechanism without using its literal deleted identifier names."
  - "Rule 3 fix: playwright.config.ts's webServer.env now sets a fake NEXT_PUBLIC_GOOGLE_DOC_ID (matching the existing AUTH_SECRET/APP_PASSWORD e2e-test-override pattern). Without it, components/HomeClient.tsx's build-time-inlined DOC_ID const is empty, so handleSync's `if (!DOC_ID) return` guard fires before ever calling POST /api/sync — making Task 3's own required Home pull-to-sync assertion ('the gesture fires exactly one POST /api/sync') structurally unobservable. Confirmed empirically both ways. The real Google Docs API is never called — e2e/pull-to-refresh.spec.ts's Home test intercepts and mocks POST /api/sync's response."
  - "Deviation from Task 3's literal action-text wording for the offline spec ('then context.setOffline(true) and reload each'): empirically confirmed (both via a direct probe and via this session's actual e2e run) that EVERY route in this app is force-dynamic with no static shell and no service worker in this phase, so a full page reload OR a client-side <Link> navigation while offline fails hard with net::ERR_INTERNET_DISCONNECTED / lands on chrome-error://chromewebdata — reproducible 100% of the time, not intermittent. This is the SAME finding e2e/local-cache-first-paint.spec.ts (plan 34-01) already documented for /habits specifically; this session confirmed it also holds for /, /cards, and for soft <Link> navigation, not just a hard reload on /habits. Followed 34-01's own established, already-shipped precedent instead: prove the ALREADY-MOUNTED page (from an earlier online visit this session) keeps rendering its last-known content when connectivity drops mid-session, which is the real, architecturally-achievable LOCAL-05 guarantee this phase delivers. A genuine cold offline load is explicitly Phase 35 scope (OFFLINE-01 precaching), not this phase's."
  - "Deleted freshness-fresh-paths.spec.ts's 'Upsert-not-replace extension' sub-test (within the existing '/cards post-mutation-return' test) per Task 2's own explicit instruction to rewrite-or-delete every backstop-dependent assertion. It asserted the retired backstop's raw, unbounded, no-cursor `/api/cards` call merged by id rather than wholesale-replacing already-loaded rows (31-RESEARCH.md Pitfall 1, T-31-08). That exact call no longer exists anywhere — CardsClient.tsx's own surviving revalidation (mount-time and, per this plan's Rule 2 fix, boundary-event-triggered) always issues bounded, query-param-carrying requests (`type=`/`take=`), never a no-query-string call — so the test's own `url.search === ''` route interception can never fire again. Left in place, the test would pass GREEN-BUT-VACUOUS: the mock never activates, the real endpoint serves genuine data, and the final equality assertion passes trivially. No rewrite against the surviving mechanism is possible for the identical invariant, because CardsClient's bounded, size-matched fetch structurally cannot reproduce the old backstop's specific failure mode (an unbounded page-1-only fetch silently truncating more-than-page-1 rows) — the invariant itself is moot, not merely retired. Reason recorded inline in the spec file; the already-shipped Phase 31/34 coverage for CardsClient's own revalidation/write-through correctness (e2e/cards-tab-switch-scroll.spec.ts, e2e/local-cache-cards-edit.spec.ts) is unaffected."
  - "e2e/pull-to-refresh.spec.ts's Cards-boundedness test scopes a tall mobile viewport (390x2400, mirroring e2e/cards-edit-regression.spec.ts's own established precedent) to just that one test via a nested test.describe — react-virtuoso only renders rows within/near the viewport window, so on the DEFAULT desktop viewport a just-added Grammar group header lands outside Virtuoso's measured render range and never appears in the DOM at all. Empirically confirmed this is a pre-existing virtualization characteristic, NOT something this plan's CardsClient.tsx changes caused or could fix — reproduced identically against both the pre- and post-Rule-2-fix versions of the file."

requirements-completed: [LOCAL-01, LOCAL-04, LOCAL-05]

coverage:
  - id: D1
    description: "components/FreshnessWatcher.tsx still exists, is still mounted in app/layout.tsx, still fires router.refresh() unconditionally on visibilitychange/popstate/pageshow behind the 300ms coalesce, and still documents the Next.js 16.2.1 flake — the JSON payload backstop (context, hook, per-route fetch, version-gate) is fully retired"
    requirement: LOCAL-01
    verification:
      - kind: unit
        ref: "grep -rn \"useFreshPayload|FreshPayloadContext|FreshPayloads|HabitsFreshPayload|fetchRoutePayload\" components/ app/ lib/ — zero lines; grep -c \"router.refresh\"/\"16.2.1\"/\"visibilitychange|popstate|pageshow\" components/FreshnessWatcher.tsx — all satisfy the plan's acceptance criteria; grep -n \"FreshnessWatcher\" app/layout.tsx — still mounted"
        status: pass
      - kind: e2e
        ref: "e2e/freshness-version-gate.spec.ts, e2e/freshness-fresh-paths.spec.ts, e2e/freshness-gate.spec.ts, e2e/freshness-router-cache.spec.ts, e2e/freshness-client-shell.spec.ts (22/22)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CardsClient.tsx gained the boundary-event revalidation effect it was structurally missing before the JSON backstop's removal — a Rule 2 auto-add proven necessary and sufficient by the full freshness e2e suite staying green"
    verification:
      - kind: e2e
        ref: "e2e/freshness-router-cache.spec.ts's '/cards resume serves fresh data after boundary refresh (FRESH-05)' and e2e/freshness-client-shell.spec.ts's '/cards back-forward' cells, both passing"
        status: pass
      - kind: unit
        ref: "npm test (354/354), npm run lint (0 errors), npx tsc --noEmit (0 errors) — all touching CardsClient.tsx clean"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pull-to-refresh works unconditionally on all four routes, bypassing both the cache read and the version check, with D-04's locked per-route copy distinction, and stays bounded on /cards (RESEARCH Pitfall 5)"
    requirement: LOCAL-04
    verification:
      - kind: e2e
        ref: "e2e/pull-to-refresh.spec.ts (10/10): Home fires exactly 1 POST /api/sync with Pull to sync/Release to sync/Syncing… copy; Study/Cards/Habits fire their own data endpoint with 0 POST /api/sync and Pull to refresh/Release to refresh/Refreshing… copy; the cache-and-version-bypass test fires even with nothing changed server-side; /cards boundedness proves every request's take exactly matches that group's currently-loaded count; the offline gesture shows the route-local failure copy + Try again with cached content untouched"
        status: pass
    human_judgment: false
  - id: D4
    description: "With the browser context offline, Home, Cards, and Habits render last-known data (real, seed-traceable content), the Offline pill is visible and disappears live on reconnect, and no unhandled page error occurs"
    requirement: LOCAL-05
    verification:
      - kind: e2e
        ref: "e2e/local-cache-offline.spec.ts (3/3) — each route: warm-visit real content, context.setOffline(true), same content still visible + Offline pill visible + zero pageerror events, context.setOffline(false), pill disappears"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full regression suite holds: unit tests, lint, typecheck, and the FULL Playwright e2e suite"
    verification:
      - kind: unit
        ref: "npm test (32 files, 354 tests)"
        status: pass
      - kind: e2e
        ref: "npx playwright test — full suite, 68/68 (22 files)"
        status: pass
    human_judgment: false

duration: ~2h
completed: 2026-08-10
status: complete
---

# Phase 34 Plan 05: FreshnessWatcher Narrowing + Phase-Gate E2E Summary

**`components/FreshnessWatcher.tsx` narrowed to its unconditional `router.refresh()` half (JSON backstop fully retired, D-00 rule 3), plus a Rule 2 fix giving `/cards` the boundary-event revalidation it was missing, plus the phase's two closing e2e proofs — a proven unconditional pull-to-refresh escape hatch on all four routes and last-known-data rendering with the browser fully offline.**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-08-10
- **Tasks:** 3/3 completed (Task 1's decision pre-resolved by the developer before dispatch)
- **Files modified:** 6 modified, 2 created

## Task 1: Decision (pre-resolved)

Task 1 was a blocking `checkpoint:decision` covering the one-way narrowing choice. **The developer had already been asked and had already selected option-a — "Full narrowing — retire the JSON half entirely" — via the orchestrator's pre-dispatch AskUserQuestion, before this executor was spawned.** No halt occurred; execution proceeded directly to Tasks 2 and 3 under option-a's scope, as instructed. The developer additionally asked that the Next.js 16.2.1 bug itself be investigated for a real fix if possible, but explicitly scoped that investigation to the orchestrator working separately on the main tree, outside this worktree — this plan's own scope stayed exactly Tasks 2 and 3.

## Accomplishments

- `components/FreshnessWatcher.tsx` reduced from 278 lines to ~95: the `fetchRoutePayload` module function, `HabitsFreshPayload`/`FreshPayloads` interfaces, `EMPTY_PAYLOADS`, the `FreshPayloadContext` + `useFreshPayload()` hook, the `payloads` state, `lastVersionRef`, the mount-time `/api/version` baseline seed, and `fetchBackstop()`'s version gate are all gone. The component now returns `<>{children}</>` (no provider wrapper) and retains, byte-for-byte in spirit: `COALESCE_MS`, `lastRefreshRef`, the unconditional `router.refresh()`, and all three boundary-event listeners (`visibilitychange`/`popstate`/`pageshow`) with their original rationale comments intact. The doc comment is rewritten to describe the single surviving delivery mechanism, the Plan 26-03 root-cause finding, the Next.js 16.2.1 TODO, and a new paragraph recording the Phase 34 narrowing and the VERS-02 supersession.
- **Rule 2 auto-add:** `components/CardsClient.tsx` gained a shared `revalidate()` body plus a second boundary-event `useEffect` (visibilitychange/popstate/pageshow, 300ms coalesce), mirroring `HabitsClient.tsx`'s/`StudyClient.tsx`'s already-shipped precedent from plans 34-01/34-02. Before this fix, `/cards` had a mount-time-only revalidation check — no boundary-event fallback at all — which the retired JSON backstop had been silently covering for. A `groupsRef` live mirror of `groups` state lets the shared revalidation body read "what's currently loaded" without adding `groups` to any effect's dependency array.
- Reconciled all 5 existing freshness e2e specs against the narrowed architecture: `freshness-version-gate.spec.ts`, `freshness-gate.spec.ts`, `freshness-router-cache.spec.ts`, and `freshness-client-shell.spec.ts` all continue to pass **unmodified** — every one of their assertions was already about `router.refresh()`'s surviving RSC delivery or plain network-request evidence, never the JSON backstop specifically. `freshness-fresh-paths.spec.ts` had exactly one backstop-dependent sub-test (the "Upsert-not-replace extension"), which is **deleted** with the reason recorded inline (see Deviations) — the base test it lived inside is otherwise untouched.
- New `e2e/pull-to-refresh.spec.ts` (10 tests) and `e2e/local-cache-offline.spec.ts` (3 tests) — the phase's two closing proofs. Synthesizes real browser `TouchEvent`/`Touch` gestures on `window` (confirmed present in headless Chromium without touch emulation) since `page.mouse` cannot trigger `lib/usePullToRefresh.ts`'s touch-only listeners.
- **Rule 3 fix:** `playwright.config.ts`'s `webServer.env` now sets a fake `NEXT_PUBLIC_GOOGLE_DOC_ID`, without which `HomeClient`'s `handleSync` never calls `POST /api/sync` at all in this e2e build (confirmed empirically both ways) — the real Google Docs API is never actually reached; the sync response is intercepted and mocked.
- Full regression suite verified green: 354/354 unit tests, 0 lint errors, 0 typecheck errors, and the **full** Playwright e2e suite — 68/68 across all 22 spec files.

## Task Commits

1. **Task 2: Narrow FreshnessWatcher to its router.refresh() half** — `afe9e1c` (feat)
2. **Task 3: Phase-gate e2e — escape hatch on all four routes, and rendering with no network** — `6b71694` (test)

## Files Created/Modified

- `components/FreshnessWatcher.tsx` — narrowed to the unconditional `router.refresh()` half; JSON backstop retired.
- `components/CardsClient.tsx` — Rule 2 auto-add: `groupsRef` mirror, shared `revalidate()` body, boundary-event revalidation effect.
- `components/HabitsClient.tsx` — Rule 3: doc-comment reference to the deleted `useFreshPayload` identifier reworded.
- `lib/local-cache.ts` — Rule 3: doc-comment reference to the deleted `HabitsFreshPayload` identifier reworded.
- `e2e/freshness-fresh-paths.spec.ts` — the vacuous "Upsert-not-replace extension" sub-test deleted with reason recorded; unused imports (`simulateResume`, `bumpDataVersionOnly`) removed.
- `playwright.config.ts` — Rule 3: `NEXT_PUBLIC_GOOGLE_DOC_ID` added to `webServer.env`.
- `e2e/pull-to-refresh.spec.ts` — new. 10 tests (LOCAL-04).
- `e2e/local-cache-offline.spec.ts` — new. 3 tests (LOCAL-05).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `/cards` had no boundary-event revalidation before this plan**
- **Found during:** Task 2, while auditing whether "the version-check logic ... relocated into each `*Client.tsx`'s own revalidation check in plans 34-01/02/03/04" (a claim in this plan's own read_first material) actually held for every route.
- **Issue:** `components/HabitsClient.tsx` and `components/StudyClient.tsx` both have a boundary-event revalidation effect (added in plans 34-01/34-02 specifically because their routes have `loading.tsx` and are subject to the Next.js 16.2.1 RSC-application flake). `components/CardsClient.tsx` — also `loading.tsx`-bearing, also subject to the same flake — never gained one; only a mount-time check existed. 34-02-SUMMARY.md explicitly flagged this as required for 34-03 to replicate, but 34-03 shipped without it. Retiring the JSON backstop's boundary-event fetch without fixing this would have left `/cards` with zero delivery fallback on a boundary event where the RSC application silently fails.
- **Fix:** Extracted the mount effect's revalidation logic into a shared `revalidate(buildId, version, cancelledRef)` `useCallback`, added a `groupsRef` live mirror of `groups` state so the shared body can read current loaded-counts without a `groups` dependency, and added a second `useEffect` registering `visibilitychange`/`popstate`/`pageshow` listeners with a 300ms coalesce guard — mirroring `HabitsClient.tsx`'s/`StudyClient.tsx`'s pattern exactly.
- **Files modified:** `components/CardsClient.tsx`
- **Verification:** `e2e/freshness-router-cache.spec.ts`'s `/cards resume` (FRESH-05) and `e2e/freshness-client-shell.spec.ts`'s `/cards back-forward` cells both pass; full unit suite (354/354), lint, and typecheck clean.
- **Committed in:** `afe9e1c`

**2. [Rule 3 - Blocking] Doc-comment references to deleted identifiers failed this plan's own acceptance-criteria grep**
- **Found during:** Task 2, running the required `grep -rn "useFreshPayload|FreshPayloadContext|FreshPayloads|HabitsFreshPayload|fetchRoutePayload" components/ app/ lib/` acceptance check.
- **Issue:** `components/HabitsClient.tsx` and `lib/local-cache.ts` each carried a doc comment mentioning `useFreshPayload`/`HabitsFreshPayload` by name (both pre-existing, from plans 34-01/34-04), which the grep matched even after those identifiers were fully deleted from `FreshnessWatcher.tsx`.
- **Fix:** Reworded both comments to describe the retired mechanism without the literal deleted identifier text.
- **Files modified:** `components/HabitsClient.tsx`, `lib/local-cache.ts`
- **Verification:** The grep returns zero lines.
- **Committed in:** `afe9e1c`

**3. [Rule 3 - Blocking] `NEXT_PUBLIC_GOOGLE_DOC_ID` unset at e2e build time made Home's pull-to-sync cell structurally unobservable**
- **Found during:** Task 3, first attempt at the Home pull-to-refresh test.
- **Issue:** `NEXT_PUBLIC_*` vars are inlined at Next.js build time. `playwright.config.ts`'s `webServer.env` never set `NEXT_PUBLIC_GOOGLE_DOC_ID`, so `HomeClient`'s `DOC_ID` const was empty in the e2e build — `handleSync`'s `if (!DOC_ID) return` guard fired before `POST /api/sync` was ever called. Empirically confirmed via a direct probe (0 sync requests, "Sync not configured" shown) before the fix, and 1 request after.
- **Fix:** Added `NEXT_PUBLIC_GOOGLE_DOC_ID: process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? 'e2e-test-doc-id'` to `webServer.env`, matching the existing `AUTH_SECRET`/`APP_PASSWORD` test-override pattern. The real Google Docs API is never called — the test intercepts and mocks `POST /api/sync`'s response.
- **Files modified:** `playwright.config.ts`
- **Verification:** `e2e/pull-to-refresh.spec.ts`'s Home test passes, observing exactly one `POST /api/sync` request.
- **Committed in:** `6b71694`

### Plan-Text Deviations (not bugs — empirically necessary)

**4. Offline spec follows 34-01's established precedent instead of the plan's literal "reload each" wording**
- **Found during:** Task 3, before writing `e2e/local-cache-offline.spec.ts` — direct empirical probing.
- **Issue:** The plan's action text reads "Warm the cache by visiting `/`, `/cards`, and `/habits` online in one context, then `context.setOffline(true)` and reload each." Confirmed via direct probing this session: EVERY route in this app is `force-dynamic` with no static shell and no service worker in this phase, so a `page.reload()` OR a client-side `<Link>` soft-navigation while `context.setOffline(true)` fails hard — `net::ERR_INTERNET_DISCONNECTED` on reload, `chrome-error://chromewebdata` on soft-nav — 100% reproducible, not intermittent. This is the SAME finding `e2e/local-cache-first-paint.spec.ts` (plan 34-01) already documented for `/habits` specifically; confirmed this session to also hold for `/` and `/cards`, and for soft navigation, not just hard reload.
- **Resolution:** Followed 34-01's own already-shipped, developer-approved precedent: each test warms its route online (real navigation, real content, real cache write), then sets the context offline and asserts the SAME already-mounted page keeps rendering its last-known content with no crash, plus the Offline pill and zero unhandled page errors. This is the achievable, non-vacuous proof of LOCAL-05 within this phase's actual architecture — a genuine cold offline load is explicitly Phase 35 (OFFLINE-01 precaching), not this phase's scope.
- **Files affected:** `e2e/local-cache-offline.spec.ts` (written this way from the start, not a later correction).
- **Verification:** All 3 tests pass; `page.on('pageerror')` collectors stay empty across every offline load.

**5. `freshness-fresh-paths.spec.ts`'s "Upsert-not-replace extension" sub-test deleted, not rewritten**
- **Found during:** Task 2, reconciling the existing freshness e2e suite per the plan's own explicit instruction.
- **Issue:** This sub-test (inside the existing "`/cards` post-mutation-return" test) intercepted the retired backstop's exact raw, no-cursor `/api/cards` call to prove it merged by id rather than wholesale-replacing already-loaded rows (31-RESEARCH.md Pitfall 1, T-31-08). That call no longer exists anywhere — `CardsClient.tsx`'s own surviving revalidation (mount-time and, per Deviation 1 above, boundary-event-triggered) always issues bounded, query-param-carrying requests. Left in place, the test's own `url.search === ''` interception would never fire, the real endpoint would serve genuine data, and the final equality assertion would pass GREEN-BUT-VACUOUS.
- **Resolution:** Deleted per the plan's explicit prohibition against leaving a vacuous assertion. No rewrite is possible for the identical invariant — `CardsClient`'s bounded, size-matched fetch structurally cannot reproduce the old backstop's specific failure mode (an unbounded page-1-only fetch silently truncating more-than-page-1 rows), so the invariant itself is moot, not merely retired to a different mechanism. Reason recorded inline in the spec file. `CardsClient`'s own revalidation/write-through correctness remains covered by `e2e/cards-tab-switch-scroll.spec.ts` and `e2e/local-cache-cards-edit.spec.ts` (both plan 34-03, unaffected by this deletion).
- **Files modified:** `e2e/freshness-fresh-paths.spec.ts` (also removed two now-unused imports).
- **Verification:** The base test (unaffected assertions) still passes; the full freshness suite remains 22/22.

---

**Total deviations:** 5 (3 Rule 2/3 auto-fixes, 2 empirically-necessary plan-text deviations, all documented above with verification)
**Impact on plan:** All five were required either for correctness (Deviation 1 — a real delivery-fallback gap the backstop's removal would have exposed), for this plan's own literal acceptance criteria (Deviations 2–3), or because the plan's literal wording described a scenario this app's actual architecture cannot produce (Deviations 4–5, both resolved by following an already-shipped, developer-approved precedent from an earlier plan in this same phase). No scope creep — every fix stayed inside files this plan already owned or files whose grep-backed acceptance criteria this plan's own Task 2 explicitly required to pass.

## Issues Encountered

- Worktree had no local `node_modules` (only the prisma-generate step had been run) — symlinked from the main repo (`ln -s /Users/main/Documents/claude-test/node_modules node_modules`), matching every prior plan in this phase's identical finding. Untracked, not a code change.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Threat Flags

None — this plan's threat register (T-34-18 through T-34-21) is fully addressed: `router.refresh()` and all three listeners survive verbatim (T-34-18, mitigated by Task 1's now-resolved checkpoint plus the grep-backed acceptance criteria); the offline pill + graceful pull-to-refresh failure covers T-34-19; the reconciled freshness suite with the one explicit rewrite-or-delete decision (Deviation 5) plus `e2e/pull-to-refresh.spec.ts`'s own non-vacuity check covers T-34-20; T-34-21's disposition (accept) is unchanged by this plan.

## Next Phase Readiness

- **Phase 34 (Local-First Shell) is complete.** All five requirements (LOCAL-01 through LOCAL-05) are now covered across plans 34-01 through 34-05. `components/FreshnessWatcher.tsx`'s JSON backstop is fully retired; each of the four `*Client.tsx` shells now owns its own cache-first paint, version-checked revalidation, and (where the route has a `loading.tsx`) boundary-event revalidation fallback.
- **Two open UAT items carried forward from plans 34-01/34-02/34-04** (physical pull-to-refresh touch feel, live IndexedDB devtools inspection, live offline-toggle visual check) remain open per those plans' own `coverage` sections — this plan's e2e suite proves the underlying network/code behavior but not the tactile/visual UX on a real device.
- Phase 35 (Service Worker & Offline Review Queue) can now build on a codebase with exactly ONE freshness delivery mechanism per route (never two racing) and a proven, real offline-rendering baseline (`e2e/local-cache-offline.spec.ts`) to extend rather than replace.
- If a future Next.js upgrade is investigated (the orchestrator's separate, parallel effort outside this worktree), re-test `components/FreshnessWatcher.tsx`'s TODO-flagged Next.js 16.2.1 flake — the doc comment and version marker are exactly where a future agent should look first.

## Self-Check: PASSED

- FOUND: components/FreshnessWatcher.tsx
- FOUND: components/CardsClient.tsx
- FOUND: components/HabitsClient.tsx
- FOUND: lib/local-cache.ts
- FOUND: e2e/freshness-fresh-paths.spec.ts
- FOUND: playwright.config.ts
- FOUND: e2e/pull-to-refresh.spec.ts
- FOUND: e2e/local-cache-offline.spec.ts
- FOUND commit: afe9e1c
- FOUND commit: 6b71694

---
*Phase: 34-local-first-shell*
*Completed: 2026-08-10*
