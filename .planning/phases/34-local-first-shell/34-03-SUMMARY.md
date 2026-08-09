---
phase: 34-local-first-shell
plan: 03
subsystem: frontend-caching
tags: [indexeddb, cards, write-through, pull-to-refresh, cache-first]

requires:
  - phase: 34-local-first-shell
    plan: 01
    provides: "lib/local-cache.ts: readCache/writeCache/fetchCacheContext + patchCachedCard/removeCachedCard/insertCachedCard; GET /api/version additive buildId field"
provides:
  - "/cards fully migrated to the cache-first architecture: cache-first mount paint, version-checked background revalidation (skipped on a true cold start), write-through at handleSave/handleDelete/handleAdd, a group-snapshot persistence effect, and a D-05-scoped route-local pull-to-refresh"
affects: [34-05-freshnesswatcher-narrowing]

actuals:
  tokens: 7440
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Cache-first mount read + version-checked revalidation, gated on an EXISTING stale entry only — a true cold start (no cache yet) skips the revalidation fetch entirely, since the just-rendered RSC props are already the freshest data (deviation from the plan's literal 'no entry OR stale' wording, required to keep Phase 31's zero-refetch regression test green)"
    - "cacheReady state flag (in addition to the versionRef/buildIdRef pair) so the persistence effect's first write can fire off of the mount effect resolving alone, not only off of a later groups/groupCounts state change"
    - "Write-through at the three mutation handlers passes the SAME merge/removal function the optimistic state update already uses — never a re-derived transformation"
    - "Route-local handleRefresh (pull-to-refresh) bounded to exactly the groups already loaded (take = current loaded.length per group), never a single unbounded query"

key-files:
  created:
    - e2e/local-cache-cards-edit.spec.ts
  modified:
    - components/CardsClient.tsx

key-decisions:
  - "Revalidation on mount only fires when a cache entry EXISTS and its dataVersion differs from the current /api/version value — the plan's literal action text also called for revalidating on 'no entry', but that unconditionally issues an extra client-side GET /api/cards immediately after the RSC props already delivered the identical first-ever-visit data, which regresses Phase 31's e2e/cards-tab-switch-scroll.spec.ts (an explicit required-verify spec for this plan) asserting ZERO /api/cards requests across a tab-switch flow with no prior cache. See Deviations."
  - "Added a cacheReady state flag beyond what the plan's action text specified, because a true cold start's mount effect never calls setGroups/setGroupCounts (no cache entry to adopt, and revalidation is now skipped per the decision above) — meaning the persistence effect's dependency array ([groups, groupCounts, hasActiveClientQuery]) would never re-fire, and the cache would never be written until some unrelated later interaction happened to change groups/groupCounts. See Deviations."
  - "Task 3's pull-to-refresh implementation and Task 1's cache-read/revalidation/persistence implementation landed in the SAME commit (788ba5a) rather than two separate commits — both were written in one pass before the first verification/commit checkpoint. All of Task 3's own acceptance criteria and required verification were re-run and confirmed passing independently after the fact; no functional issue, just a one-time break from strict per-task atomic commits for this plan."

requirements-completed: [LOCAL-01, LOCAL-02, LOCAL-03, LOCAL-04]

coverage:
  - id: D1
    description: "A second visit to /cards paints the session-accumulated groups from IndexedDB before GET /api/cards resolves"
    requirement: LOCAL-01
    verification:
      - kind: e2e
        ref: "e2e/local-cache-cards-edit.spec.ts (cache entry inspected via page.evaluate, IndexedDB) + inspection of the mount effect in components/CardsClient.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Revalidation is version-checked (never TTL) and never expands beyond what the session already loaded (D-05) — bounded per-group fetches at each group's current loaded.length"
    requirement: LOCAL-02
    verification:
      - kind: unit
        ref: "npm run lint / npx tsc --noEmit — zero errors; inspection of the mount effect's take: loadedLenFor(key) and handleRefresh's take: groups[key].loaded.length"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/cards-tab-switch-scroll.spec.ts (asserts zero /api/cards requests on a cold-start tab-switch flow, proving no over-fetch)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Editing, deleting, and adding a card each patch the cached cards entry in the same handler as the optimistic state update; reopening /cards with GET /api/cards blocked never shows the pre-edit value; a repeated save is idempotent"
    requirement: LOCAL-03
    verification:
      - kind: e2e
        ref: "e2e/local-cache-cards-edit.spec.ts (both tests: edit+idempotent-resave+blocked-reopen, and delete)"
        status: pass
      - kind: e2e
        ref: "e2e/cards-edit-regression.spec.ts (both tests, run unmodified)"
        status: pass
      - kind: unit
        ref: "npm test — 354/354, including tests/local-cache.test.ts's patch-helper coverage from plan 34-01"
        status: pass
    human_judgment: false
  - id: D4
    description: "/cards pull-to-refresh re-fetches each already-loaded group at its current row count, bypasses the cache read and version check, and never calls POST /api/sync"
    requirement: LOCAL-04
    verification:
      - kind: unit
        ref: "grep -n \"api/sync\"/\"handleSync\" components/CardsClient.tsx (zero functional matches — only doc-comment mentions); grep -n \"Pull to refresh\"/\"Pull to sync\" (present/absent respectively); grep -n \"readCache\" (only the import and the mount effect's single call — handleRefresh contains none)"
        status: pass
    human_judgment: true
    rationale: "The physical pull-to-refresh gesture's visual feel and the network tab's per-request take values were NOT verified live on a touch device or browser DevTools in this session — this is the plan's own <human-check> item, recorded as a still-open UAT item (same precedent as plan 34-01's D5)."
  - id: D5
    description: "Every Phase 31 /cards e2e spec passes unmodified"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/cards-search-clear.spec.ts e2e/cards-sticky-header.spec.ts e2e/cards-tab-switch-scroll.spec.ts e2e/cards-edit-regression.spec.ts (8/8)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full regression suite holds: unit tests, lint, typecheck, and the broader freshness e2e suite touching /cards"
    verification:
      - kind: unit
        ref: "npm test (32 files, 354 tests)"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-router-cache.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-client-shell.spec.ts e2e/freshness-version-gate.spec.ts (22/22 on a clean run — a first run showed transient ERR_CONNECTION_REFUSED failures across routes NOT touched by this plan, e.g. '/', '/study', consistent with a webserver-startup race rather than a real regression; re-run was fully green)"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-08-09
status: complete
---

# Phase 34 Plan 03: Local-First Shell — Cards Cache Summary

**`/cards` fully migrated to the local-first cache architecture: cache-first mount paint from IndexedDB, version-checked background revalidation scoped to already-loaded groups, mandatory write-through at every card mutation (edit/delete/add), and a D-05-scoped route-local pull-to-refresh — completing the pattern plan 34-01 proved on `/habits`.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-08-09
- **Tasks:** 3/3 completed
- **Files modified:** 2 (1 modified source, 1 new e2e spec)

## Accomplishments

- `components/CardsClient.tsx`'s mount effect now reads the `cards` IndexedDB entry before `GET /api/cards` resolves, adopts it (merged over `EMPTY_GROUP_STATE` defaults, guarded by the same four-part interaction guard the file already used for RSC-prop adoption, now also checking `!hasActiveClientQuery`), and re-expands any group whose cached rows were non-empty last session.
- Version-checked revalidation re-fetches only already-loaded groups, one bounded `fetchCardsPage` call per group at that group's exact `loaded.length` — never a single unbounded query — and ONLY when an existing cache entry's `dataVersion` differs from the current `/api/version` value (a true cold start with no cache skips this fetch entirely; see Deviations).
- A group-snapshot persistence effect writes `{ loaded, nextCursor, hasMore }` per group plus `groupCounts` through to the cache whenever no client-side query is active and no group is mid-fetch — gated additionally on a new `cacheReady` flag so the very first write can fire off of the mount effect resolving, not only off of a later `groups`/`groupCounts` state change.
- `handleSave` calls `patchCachedCard(buildId, updated.id, merge)` using the exact same `merge` function the optimistic state update already uses — mandatory, not optional, since `PUT /api/cards/[id]` never bumps the version counter (34-RESEARCH.md Pitfall 3). `handleDelete` calls `removeCachedCard` on the success branch only. `handleAdd` calls `insertCachedCard` uniformly across both its real-fetch and optimistic-prepend branches.
- A route-local `handleRefresh` (pull-to-refresh) bypasses both the cache read and the version check, re-fetches every already-loaded group at its current row count, writes the merged result through to the cache, and never calls `POST /api/sync` or shares code with Home's `handleSync`. Renders the `Pull to refresh` / `Release to refresh` / `Refreshing…` indicator and the route-local `Couldn't refresh. Check your connection and try again.` failure copy with a `Try again` retry link.
- Renders the `Updating…` background-revalidation pill (UI-SPEC Component Note 1) below the sticky header.
- Removed this file's consumption of the retired `useFreshPayload` JSON backstop (D-00 rule 3) — `FreshnessWatcher.tsx` itself is untouched (that file's own narrowing is plan 34-05's scope).
- New `e2e/local-cache-cards-edit.spec.ts` (2 tests): an edit through the real editor sheet patches the cached entry without reloading, survives a same-payload resave (idempotency), and reopening `/cards` with `GET /api/cards` blocked never shows the pre-edit value; a delete removes the card's id from every cached group.

## Task Commits

1. **Task 1: Cache-first mount read, version-checked revalidation, and session-accumulated persistence on /cards** (+ **Task 3: D-05-scoped route-local pull-to-refresh** — see Decisions/Deviations for why these two landed together) — `788ba5a` (feat)
2. **Task 2: Write-through at handleSave, handleDelete, and handleAdd** — `6607091` (test)

## Files Created/Modified

- `components/CardsClient.tsx` — cache-first mount read, version-checked revalidation, group-snapshot persistence effect, write-through at all three mutation handlers, route-local pull-to-refresh, `Updating…` pill; `useFreshPayload` consumption removed.
- `e2e/local-cache-cards-edit.spec.ts` — new. 2 Playwright tests covering LOCAL-03's write-through and idempotency guarantees.

## Decisions Made

- **Revalidation gated on an EXISTING stale entry, not "no entry OR stale."** See Deviations — required to keep `cards-tab-switch-scroll.spec.ts` (an explicit required-verify spec) green; a cold start's RSC props are already the freshest data, so an immediate duplicate client-side fetch is pure waste with no correctness benefit.
- **Added `cacheReady` state.** See Deviations — refs alone (`versionRef`/`buildIdRef`) don't retrigger the persistence effect, so a true cold start (no cache to adopt, revalidation skipped) would never write to the cache at all without this.
- **Task 1 and Task 3 landed in one commit.** Both were implemented in a single pass before the first lint/tsc/test verification loop ran; re-verified Task 3's own acceptance criteria and required `<verify>` commands independently afterward — all passed. No functional gap, just a one-time deviation from strict per-task atomicity.
- **Tracer-adjacent autonomous continuation, mirroring plan 34-01's precedent.** This plan is `autonomous: true` with zero `type="checkpoint:*"` tasks (Pattern A) and runs as a worktree-isolated parallel executor with no viable mid-plan pause/resume path. Task 3's `<human-check>` (physical pull-to-refresh visual/network-tab verification) was not performed live and is recorded as an open UAT item (coverage `D4`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mount-time revalidation on "no cache entry" regressed Phase 31's zero-refetch e2e assertion**
- **Found during:** Task 1, running the required `e2e/cards-tab-switch-scroll.spec.ts` verify command.
- **Issue:** The plan's action text specifies: "If there is no entry, or `entry.dataVersion !== version`, set `isRevalidating` true and re-fetch each group that has loaded rows." Implemented literally, a true cold start (fresh browser context, no prior `ks-cache-<buildId>` entry — exactly `cards-tab-switch-scroll.spec.ts`'s scenario) unconditionally issued an extra client-side `GET /api/cards?type=vocabulary&take=8` fetch immediately after mount, even though the RSC-rendered `initialCardsPage` had already delivered the identical first page of data server-side moments earlier. `cards-tab-switch-scroll.spec.ts` explicitly asserts `cardsPageRequests` (matches on `/api/cards`) has length 0 across its whole tab-switch flow — this test is one of the three specs this plan's Task 1 `<verify>` explicitly requires to pass, and one of the five the plan's overall `<verification>` block requires.
- **Fix:** Changed the revalidation gate from `!cached || cached.dataVersion !== version` to `cached && cached.dataVersion !== version` — revalidation now only fires when there is an EXISTING cache entry whose version has gone stale. A true cold start (no entry) relies on the already-fresh RSC props with no extra client fetch, which is both more correct (no redundant network round trip on first paint) and matches LOCAL-02's own framing ("refetched only when `/api/version` reports a value different from the one the entry was written with" — there is no "one it was written with" when no entry exists yet).
- **Files modified:** `components/CardsClient.tsx`
- **Verification:** `e2e/cards-tab-switch-scroll.spec.ts` passes (0 `/api/cards` requests observed); the mount-effect adoption/persistence-effect paths for an EXISTING stale entry are otherwise unchanged and still covered by `e2e/local-cache-cards-edit.spec.ts`'s reopening test.
- **Committed in:** `788ba5a` (Task 1 commit)

**2. [Rule 1 - Bug] A true cold start never wrote anything to the cache at all**
- **Found during:** Task 2, writing `e2e/local-cache-cards-edit.spec.ts`'s first assertion (reading the cache entry immediately after a first `/cards` visit).
- **Issue:** With Deviation #1's fix in place, a true cold start's mount effect calls neither `setGroups` nor `setGroupCounts` (nothing to adopt from a nonexistent cache entry, and revalidation is now skipped). `versionRef`/`buildIdRef` are plain refs, and writing to a ref does NOT retrigger a dependent `useEffect` — so the group-snapshot persistence effect (dependent on `[groups, groupCounts, hasActiveClientQuery]`) never re-ran after the mount effect resolved, and the cache stayed permanently unwritten until some unrelated later interaction happened to change `groups`/`groupCounts` (e.g. expanding a collapsed group). The very first `/cards` visit for any browser therefore never populated `ks-cache-<buildId>`'s `cards` entry at all — directly undermining LOCAL-01.
- **Fix:** Added a `cacheReady` boolean state, set `true` inside the mount effect's async continuation once `fetchCacheContext()` resolves (immediately after `versionRef`/`buildIdRef` are populated), and added it to the persistence effect's dependency array (`[groups, groupCounts, hasActiveClientQuery, cacheReady]`). This lets the persistence effect's first successful write fire off of the mount effect resolving alone.
- **Files modified:** `components/CardsClient.tsx`
- **Verification:** `e2e/local-cache-cards-edit.spec.ts` (both tests, which each start from a fresh cache and require the entry to exist after the very first visit) passes; `npm run lint`/`npx tsc --noEmit` clean.
- **Committed in:** `6607091` (Task 2 commit — found while writing Task 2's test, though the root cause lives in Task 1's code from the same underlying mount effect)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bug fixes, both required for the plan's own explicit `<verify>` commands to pass)
**Impact on plan:** Both fixes stayed inside this plan's own file (`components/CardsClient.tsx`) and its own new test file. No scope creep. Both are documented here as load-bearing precedent should a future plan touch this mount-effect/persistence-effect pairing again — the "no entry → skip revalidation" and "cacheReady flag" patterns are more correct than the plan's literal text, not merely a workaround.

## Issues Encountered

- **Missing `node_modules` in this worktree.** The worktree directory had no `node_modules` at all at session start (unlike a sibling worktree observed with a working symlink to the main repo's `node_modules`), which made `npx playwright test` fail immediately with `spawnSync .../node_modules/.bin/tsx ENOENT` inside `e2e/seed.ts`'s `resetToBaseline()`. Resolved locally by creating `ln -s /Users/main/Documents/claude-test/node_modules node_modules` (matching the pattern already used by a sibling worktree) — an environment-setup gap, not a code issue, and not a git-tracked change (node_modules is gitignored).
- **`npx prisma generate` had not been run in this worktree.** `npx tsc --noEmit` initially reported dozens of pre-existing errors across the whole repo (`Cannot find module '@/app/generated/prisma/client'`) unrelated to this plan's files — resolved by running `npx prisma generate`, after which only files this plan touches show zero errors (the pre-existing unrelated `implicit any` warnings elsewhere in the repo are untouched, out of scope).
- **Transient `ERR_CONNECTION_REFUSED` on a first freshness-suite run.** A first run of the broader (not required-by-this-plan) freshness e2e suite showed connection-refused failures across routes this plan never touches (`/`, `/study`). A clean re-run passed 22/22 — consistent with a webserver-startup race between successive Playwright invocations in this session, not a real regression.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None.

## Threat Flags

None — this plan's threat register (T-34-10 through T-34-13) was fully addressed by the write-through/interaction-guard/bounded-fetch mechanisms implemented above; no new security-relevant surface was introduced beyond what the plan's own `<threat_model>` already anticipated.

## Next Phase Readiness

- `/cards` now matches `/habits`' cache-first architecture exactly (mount-read, version-checked revalidation, write-through, route-local pull-to-refresh) — plans 34-02 (Study) and 34-04 (Home/Settings) can follow the same shape.
- **Deviation precedent for 34-02/34-04:** if either of those plans' mount effects also revalidate unconditionally on "no cache entry," check whether an analogous Phase-30/31 zero-refetch e2e assertion exists for that route before assuming the plan's literal action text is safe to implement as written — this plan's Deviation #1 is the second documented instance (after 34-01's own two deviations) of the plan text needing a Rule-1 correction against a real, required regression test.
- **`cacheReady`-style state flag may be needed elsewhere too.** Any mount effect that (a) can legitimately have "nothing to adopt" on a cold start and (b) relies on a dependent persistence effect keyed off application state (not refs) should double-check that the persistence effect's first write isn't silently starved the way this plan's Deviation #2 found.
- `useFreshPayload`'s `/cards` consumption is now fully removed from this file — plan 34-05 (FreshnessWatcher narrowing) can delete the `cards` branch of `fetchRoutePayload`/`FreshPayloads['cards']` once `/study` (34-02) and `/habits` (already done, 34-01) are confirmed to have no remaining consumers either.

## Self-Check: PASSED

- FOUND: components/CardsClient.tsx
- FOUND: e2e/local-cache-cards-edit.spec.ts
- FOUND commit: 788ba5a
- FOUND commit: 6607091

---
*Phase: 34-local-first-shell*
*Completed: 2026-08-09*
