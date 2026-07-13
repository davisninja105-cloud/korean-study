---
phase: 26-freshness-fix
plan: 05
subsystem: ui
tags: [nextjs, react, router-cache, freshness, client-shell, context, e2e, playwright]

# Dependency graph
requires:
  - phase: 26-freshness-fix (Plan 02)
    provides: "FreshnessWatcher (app-wide router.refresh() at real staleness boundaries) + HomeClient/HabitsClient ungated adoption pattern"
  - phase: 26-freshness-fix (Plan 03)
    provides: "StudyClient/CardsClient gated prevInitialCards adoption + deferred-items.md's full root-cause investigation and its own recommendation (JSON re-fetch backstop), which this plan implements"
provides:
  - "components/FreshnessWatcher.tsx: now a context provider (default export accepts children) exposing useFreshPayload()/FreshPayloads/HabitsFreshPayload; every coalesced boundary event fires router.refresh() AND a route-scoped JSON backstop fetch (/api/cards/due, /api/cards, /api/activity+/api/stats)"
  - "app/layout.tsx: FreshnessWatcher wraps the GlossProvider/Nav/main subtree instead of self-closing as a sibling"
  - "components/StudyClient.tsx / CardsClient.tsx: prevFreshStudy/prevFreshCards gated backstop-adoption blocks, character-identical gates to their existing prevInitialCards blocks plus a null check"
  - "components/HabitsClient.tsx: freshOverride derived-read layer (backstop wins until a fresher initialDays reference arrives); days/goal/masteredCount/dayStartHour/cardsByState now derive override-else-props"
  - "Empirical proof that the JSON backstop closes the previously-flaky /study, /study back-forward, /habits resume cells: 5/5, 5/5, 3/3 isolated passes respectively (verification baseline was 0/7 for /study resume)"
affects: [27]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-delivery boundary refresh: router.refresh() (Router Cache hygiene, sole delivery path for '/') supplemented by an explicit client-side JSON fetch of the route's existing API endpoint, delivered via React context (useFreshPayload) — bypasses the RSC/Suspense/Segment-Cache client-application path entirely for the three loading.tsx routes that exhibited the flake."
    - "Gated/ungated backstop adoption reuses the exact same prev-reference render-phase pattern established in Plans 26-02/26-03, now applied to a second delivery channel: mount-seeded prev-holder means only post-mount deliveries are ever adopted, so cross-visit context leftovers are structurally inert."
    - "HabitsClient's no-setter 'direct prop read' design (26-02) is extended, not reverted, via a derived-read override layer (freshOverride) that a fresher RSC prop reference clears — props always win over a stale backstop."

key-files:
  created: []
  modified:
    - components/FreshnessWatcher.tsx
    - app/layout.tsx
    - components/StudyClient.tsx
    - components/CardsClient.tsx
    - components/HabitsClient.tsx

key-decisions:
  - "Implemented exactly the LOCKED USER DECISION (the JSON re-fetch alternative named in deferred-items.md's own recommendation) — supplement router.refresh(), never replace it; '/' (no loading.tsx, never observed to fail) was left completely untouched, receiving router.refresh() only."
  - "None of the six PROHIBITED approaches (startTransition wrap, setTimeout-deferred refresh, second coalesced refresh, Nav prefetch disabling, router.push()/replace(), Next.js patch bump) were reintroduced in any form — the fix operates entirely through a new delivery channel, not a retry/timing change to the existing router.refresh() call."
  - "No automatic accepted-risk fallback mechanism was added anywhere — the HONESTY RULE in Task 3 was followed verbatim (see below): every reliability-proof run genuinely passed, so no fallback was ever needed, but none was written defensively either."
  - "fetchBackstop() reads window.location.pathname at call time (never a closure-captured value) and re-checks it before every setPayloads call, so a response arriving after the user navigated away is dropped rather than written into the wrong route's slice — this mirrors the popstate macrotask-deferral rationale already established in the file."

patterns-established:
  - "Second delivery channel via React context, gated by the same prev-reference pattern as prop adoption — established as the template for any future case where a framework-level delivery path proves unreliable but the underlying data-fetch/gate logic is already correct."

requirements-completed: [FRESH-04, FRESH-05]

coverage:
  - id: D1
    description: "FreshnessWatcher becomes a provider: default export accepts children, exports useFreshPayload()/FreshPayloads/HabitsFreshPayload; each coalesced boundary event fires router.refresh() plus exactly one route-scoped JSON backstop fetch (/api/cards/due on /study, /api/cards on /cards, /api/activity+/api/stats on /habits); all other paths (including /) get router.refresh() only; app/layout.tsx wraps the GlossProvider subtree"
    requirement: FRESH-05
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/smoke.spec.ts — 12/12 passed immediately after Task 1 (before any shell consumed the context), proving the change is observably inert as required"
        status: pass
      - kind: other
        ref: "npm run lint (0 errors) + filtered npx tsc --noEmit (0 errors) + grep 'useFreshPayload' components/FreshnessWatcher.tsx + grep '</FreshnessWatcher>' app/layout.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "StudyClient/CardsClient/HabitsClient adopt the JSON backstop payload through the same gated/derived-read patterns already proven correct for RSC props; all six targeted /study,/cards,/habits x resume,back-forward acceptance cells pass in a single combined run"
    requirement: FRESH-04
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --grep \"(/study resume serves)|(/cards resume serves)|(/habits resume serves)|(/study back-forward serves)|(/cards back-forward serves)|(/habits back-forward serves)\" — 7/7 passed (6 targeted cells + setup)"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/smoke.spec.ts — 12/12 passed after Task 2 (FRESH-06 regression guard intact)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reliability proof on the exact cells 26-VERIFICATION.md measured as flaky: /study resume 5/5 isolated (baseline 0/7), /study back-forward 5/5 isolated, /habits resume 3/3 isolated, plus one full combined 3-file sweep (17/17) and unit/lint/tsc net"
    requirement: FRESH-05
    verification:
      - kind: e2e
        ref: "5x isolated `npx playwright test e2e/freshness-router-cache.spec.ts --grep \"/study resume serves\"` → 5/5; 5x isolated `npx playwright test e2e/freshness-client-shell.spec.ts --grep \"/study back-forward serves\"` → 5/5; 3x isolated `npx playwright test e2e/freshness-router-cache.spec.ts --grep \"/habits resume serves\"` → 3/3; combined `npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts e2e/freshness-fresh-paths.spec.ts` → 17/17"
        status: pass
      - kind: unit
        ref: "npm test — 241/241 passed"
        status: pass
      - kind: other
        ref: "npm run lint — 0 errors; filtered npx tsc --noEmit — 0 errors; git diff --stat -- e2e/ — empty (zero spec files modified)"
        status: pass
    human_judgment: false

# Metrics
duration: ~1h
completed: 2026-07-13
status: complete
---

# Phase 26 Plan 05: JSON Re-fetch Backstop for Boundary Freshness Summary

**Added a Suspense-independent JSON re-fetch backstop to `FreshnessWatcher` (React context + `useFreshPayload()` hook) so `/study`, `/cards`, `/habits` boundary freshness no longer depends on Next.js 16.2.1 successfully applying a `router.refresh()`-fetched RSC payload to the mounted client tree — closing the previously 0/7-passing `/study resume` cell to a clean 5/5 across repeated isolated runs**

## Performance

- **Duration:** ~1h
- **Completed:** 2026-07-13T01:19:42Z
- **Tasks:** 3 (Task 3 is verification-only, no files modified)
- **Files modified:** 5 (`components/FreshnessWatcher.tsx`, `app/layout.tsx`, `components/StudyClient.tsx`, `components/CardsClient.tsx`, `components/HabitsClient.tsx`)

## Accomplishments
- `components/FreshnessWatcher.tsx` reworked into a context provider: default export now accepts `children`, wraps them in a `FreshPayloadContext.Provider`, and exports `useFreshPayload()`, `FreshPayloads`, `HabitsFreshPayload`. All three original listeners (visibilitychange, popstate w/ macrotask deferral, pageshow persisted) and the 300ms coalesce guard are preserved verbatim.
- Each coalesced boundary event now fires `router.refresh()` **and** a route-scoped JSON backstop fetch inside the same handler: `/study` → `/api/cards/due`, `/cards` → `/api/cards`, `/habits` → `/api/activity` + `/api/stats` (composed into a `HabitsFreshPayload`). Any other path (including `/`) fires `router.refresh()` only — `/` never exhibited the delivery flake across 10+ isolated runs per deferred-items.md, so it stays on its proven path, completely untouched.
- `app/layout.tsx` converts `<FreshnessWatcher />` from a self-closing sibling into a wrapper around the `GlossProvider`/`Nav`/`main` subtree.
- `StudyClient`/`CardsClient` each gained a `prevFreshStudy`/`prevFreshCards` gated adoption block — character-identical to their existing `prevInitialCards` gates, plus a null check (the backstop slice starts `null` until a delivery actually arrives).
- `HabitsClient` gained a `freshOverride` derived-read layer: the backstop payload wins until a genuinely fresher `initialDays` reference arrives (a real RSC delivery), which clears the override. `days`/`goal`/`masteredCount`/`dayStartHour`/`cardsByState` now derive `freshOverride ? freshOverride.X : initialX`; the today-effect recompute (CR-01) now depends on `[dayStartHour, days, masteredCount]` so it also fires on backstop adoption.
- Reliability proof: `/study resume` 5/5 isolated passes (verification baseline: 0/7), `/study back-forward` 5/5, `/habits resume` 3/3, plus a clean 17/17 combined sweep, `npm test` 241/241, `npm run lint` 0 errors, filtered `tsc --noEmit` 0 errors.

## Task Commits

Each task was committed atomically:

1. **Task 1: FreshnessWatcher becomes a provider with a route-aware JSON backstop fetch** — `847286e` (feat)
2. **Task 2: Backstop adoption in StudyClient, CardsClient, HabitsClient** — `fbcc95e` (feat)
3. **Task 3: Targeted reliability proof — repeated isolated runs** — verification-only, zero file modifications, no commit (per plan's own file list: "(verification only — no files modified)")

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles the shared STATE.md/ROADMAP.md update after merge)

## Files Created/Modified
- `components/FreshnessWatcher.tsx` — Context provider (`FreshPayloadContext`, `useFreshPayload()`, `FreshPayloads`, `HabitsFreshPayload`); coalesced boundary handler now fires `router.refresh()` + `fetchBackstop()` (route-dispatched JSON fetch)
- `app/layout.tsx` — `<FreshnessWatcher>` wraps the `GlossProvider`/`Nav`/`main` subtree instead of self-closing as a sibling
- `components/StudyClient.tsx` — `prevFreshStudy` gated adoption block (gate: select-mode + !isFilterLoading + isFullSpan + non-null); adopts via `setStudyCards` + `setScope('due')`
- `components/CardsClient.tsx` — `prevFreshCards` gated adoption block (gate: editingId null + !showAdd + !adding + empty deletingIds + non-null); adopts via `setCards`
- `components/HabitsClient.tsx` — `freshOverride` state + two consume blocks (`prevFreshHabits` backstop-adopt, `prevInitialDays` props-win clear); `days`/`goal`/`masteredCount`/`dayStartHour`/`cardsByState` now derive override-else-props; today-effect deps widened to `[dayStartHour, days, masteredCount]`

## Decisions Made
- Implemented exactly the LOCKED USER DECISION (JSON re-fetch backstop, the recommendation deferred-items.md itself named) — supplement, not replace, `router.refresh()`. `/` was left completely untouched.
- None of the six PROHIBITED rejected approaches were reintroduced in any form.
- No automatic accepted-risk fallback mechanism exists anywhere in the new code — every reliability-proof run genuinely passed, so this was never exercised, but it also was never written defensively (per the locked decision, the user explicitly declined that option).
- `fetchBackstop()` reads `window.location.pathname` at call time and re-checks it at response time before any `setPayloads`, so a response arriving after navigation away is silently dropped rather than corrupting another route's slice.

## Deviations from Plan

None - plan executed exactly as written. The only environment setup needed (symlinking `node_modules` and running `npx prisma generate` in this fresh worktree checkout — the same gap documented independently by 26-01/26-02/26-03-SUMMARY.md) is untracked/gitignored infrastructure, not a plan deviation.

## Issues Encountered

One transient false alarm during Task 2 verification: an initial combined run of `freshness-fresh-paths.spec.ts` + `smoke.spec.ts` showed 11 failures, traced to Playwright's `reuseExistingServer` picking up a `next start` server process left over from a prior test invocation (built before Task 2's source changes were saved). Killing the stale port-3100 process and re-running produced a clean rebuild and 12/12 passes — not a code defect, purely a stale-server artifact of running many playwright invocations back-to-back in the same session.

## HONESTY RULE Compliance (Task 3, locked decision)

Every reliability-proof run genuinely passed on the first attempt for each cell — no run failed, so no weakening of assertions, retries, timeout re-tuning, or accepted-risk override was ever needed or applied. The per-run results are recorded verbatim below exactly as observed.

## Task 3 Per-Run Results

**/study resume (`e2e/freshness-router-cache.spec.ts`), 5 isolated runs — required 5/5, verification baseline was 0/7:**

| Run | Result |
|-----|--------|
| 1 | PASS (15.7s) |
| 2 | PASS (18.3s) |
| 3 | PASS (14.3s) |
| 4 | PASS (20.6s) |
| 5 | PASS (16.8s) |

**Total: 5/5**

**/study back-forward (`e2e/freshness-client-shell.spec.ts`), 5 isolated runs — required 5/5:**

| Run | Result |
|-----|--------|
| 1 | PASS (19.7s) |
| 2 | PASS (15.6s) |
| 3 | PASS (15.4s) |
| 4 | PASS (15.6s) |
| 5 | PASS (17.9s) |

**Total: 5/5**

**/habits resume (`e2e/freshness-router-cache.spec.ts`), 3 isolated runs — required 3/3, baseline ~50%:**

| Run | Result |
|-----|--------|
| 1 | PASS (14.5s) |
| 2 | PASS (14.2s) |
| 3 | PASS (14.2s) |

**Total: 3/3**

**One combined 3-file sweep** (`freshness-router-cache.spec.ts` + `freshness-client-shell.spec.ts` + `freshness-fresh-paths.spec.ts`, 17 tests including setup): **17/17 passed** (1.1m).

**Unit + static net:** `npm test` — 241/241 passed. `npm run lint` — 0 errors (1 pre-existing unrelated `StudySession.tsx` warning). Filtered `npx tsc --noEmit` — 0 errors. `git diff --stat -- e2e/` — empty (zero spec files modified during this task).

No rejected approach was reintroduced, no accepted-risk auto-fallback exists, and the phase-level formal acceptance re-run (including Plan 26-04's new FRESH-02 e2e cells) is handed to Plan 26-06 as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FRESH-04/FRESH-05 gap closure is implemented and empirically proven on the exact cells `26-VERIFICATION.md` measured as flaky, with margin beyond the plan's required run counts.
- All five declared files were modified and nothing else — `git diff` across both feature commits confirms scope stayed exactly within `components/FreshnessWatcher.tsx`, `app/layout.tsx`, `components/StudyClient.tsx`, `components/CardsClient.tsx`, `components/HabitsClient.tsx`.
- Zero spec files, API routes, or middleware were touched — the acceptance specs' network-evidence assertions continue to hold without modification, keeping an apples-to-apples comparison available for Plan 26-06.
- Plan 26-06 (formal acceptance re-run: 2x combined sweep including Plan 26-04's new FRESH-02 cells, 5x isolated runs) can proceed directly — no blockers, no known remaining flake to report.

---
*Phase: 26-freshness-fix*
*Completed: 2026-07-13*

## Self-Check: PASSED

- FOUND: components/FreshnessWatcher.tsx
- FOUND: app/layout.tsx
- FOUND: components/StudyClient.tsx
- FOUND: components/CardsClient.tsx
- FOUND: components/HabitsClient.tsx
- FOUND: commit 847286e (feat: FreshnessWatcher provider + JSON backstop fetch)
- FOUND: commit fbcc95e (feat: backstop adoption in StudyClient/CardsClient/HabitsClient)
