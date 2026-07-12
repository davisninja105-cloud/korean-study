---
phase: 26-freshness-fix
plan: 02
subsystem: ui
tags: [nextjs, react, router-cache, freshness, client-shell]

# Dependency graph
requires:
  - phase: 26-freshness-fix (Plan 01)
    provides: "waitForRscFetch e2e helper + freshness-router-cache.spec.ts/freshness-client-shell.spec.ts flipped to the fixed-behavior contract (true red→green bar)"
provides:
  - "components/FreshnessWatcher.tsx: boundary-refresh client component (visibilitychange/popstate/pageshow → router.refresh(), 300ms coalesce)"
  - "app/layout.tsx: FreshnessWatcher mounted once for all routes"
  - "HomeClient ungated render-phase prop adoption pattern (prevInitialStats/prevInitialActivity)"
  - "HabitsClient direct prop reads (days/goal/masteredCount, no useState copies)"
affects: [26-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FreshnessWatcher: render-nothing watcher mirroring ThemeWatcher's shape, registers visibilitychange (document, hidden→visible only) + popstate (window, setTimeout-0 deferred so Next's own Router Cache restore runs first) + pageshow (window, persisted-only) listeners in one mount effect, funneled through a single refresh() closure with a useRef<number> 300ms coalesce guard — Date.now() read only inside the event-triggered closure, never during render"
    - "Ungated render-phase prop adoption (React's official 'adjusting state when props change' pattern): hold the previously-seen prop reference in its own useState (prevInitialStats/prevInitialActivity), compare during render, call the setter when the reference differs — no useEffect, no gate, used when there is no in-flight interaction to protect"
    - "Direct prop reads instead of read-only useState copies: HabitsClient's days/goal/masteredCount are now plain consts assigned from props (not useState(initialX)), so every router.refresh() delivering a new prop reference is automatically reflected — closes the exact non-resync bug pattern documented in 24-DIAGNOSIS.md"

key-files:
  created:
    - components/FreshnessWatcher.tsx
  modified:
    - app/layout.tsx
    - components/HomeClient.tsx
    - components/HabitsClient.tsx

key-decisions:
  - "Environment gap (same as 26-01): this worktree checkout also had no node_modules (UNMET DEPENDENCY for every package) and no generated Prisma client. Fixed identically — npx prisma generate (regenerates the gitignored app/generated/prisma) + a symlink node_modules -> the main repo's node_modules, after confirming via diff that package.json/package-lock.json are byte-identical. Not a package-manager install (no new/different dependency resolved); git status --short stayed clean before and after (both artifacts gitignored)."
  - "HomeClient adoption used the render-phase pattern (not the effect fallback) — the codebase's existing eslint config accepted it cleanly (0 lint errors, only the pre-existing StudySession.tsx warning), so the lint-fallback branch in the plan's action block was not needed. Plan 26-03 should use the same render-phase pattern for consistency."
  - "HabitsClient's initialCardsByState was already read directly (no useState wrapper) before this plan — the fix only needed to touch initialDays/initialGoal/initialMasteredCount, which were the three read-only useState copies causing the non-resync bug."

patterns-established:
  - "FreshnessWatcher is the single, app-wide boundary-refresh mechanism — future shells needing freshness (Plan 26-03: StudyClient, CardsClient) rely on it firing router.refresh() and only need to add their own prop-adoption logic, never their own boundary-event listeners."
  - "Render-phase prev-prop-reference adoption is the established pattern for ungated shells; Plan 26-03 must match it (or document why a gate is needed) for consistency across the four client shells."

requirements-completed: [FRESH-04, FRESH-05, FRESH-06]

coverage:
  - id: D1
    description: "FreshnessWatcher fires router.refresh() at visibilitychange (hidden→visible), popstate (macrotask-deferred), and pageshow (persisted) boundaries, coalesced within a 300ms window; mounted once in app/layout.tsx after ThemeWatcher"
    requirement: FRESH-04
    verification:
      - kind: automated_ui
        ref: "npm run lint (0 errors, 1 pre-existing unrelated warning); npx tsc --noEmit (0 new errors after Prisma client regeneration); grep -c 'FreshnessWatcher' app/layout.tsx >= 2; grep \"'use client'\" and grep 'router.refresh()' in components/FreshnessWatcher.tsx both match"
        status: pass
    human_judgment: false
  - id: D2
    description: "/ back-forward and / resume, /habits resume, /habits back-forward acceptance tests pass (FRESH-04/FRESH-05) — boundary refresh fetch lands AND DOM value matches live truth"
    requirement: FRESH-04
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --grep \"(/ back-forward serves)|(/ resume serves)|(/habits resume serves)|(/habits back-forward serves)\" --reporter=line — 5/5 passed (1 setup + 4 targeted tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Regression net intact: freshness-fresh-paths.spec.ts 7/7 + smoke.spec.ts 4/4 still green — no first-load regression, no loading-state flash, no extra fetch on plain-Link navigation"
    requirement: FRESH-06
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/smoke.spec.ts --reporter=line — 12/12 passed (1 setup + 7 fresh-paths + 4 smoke)"
        status: pass
    human_judgment: false
  - id: D4
    description: "/study resume and /cards resume acceptance tests remain red (expected — their shells gain adoption in Plan 26-03)"
    requirement: FRESH-05
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-router-cache.spec.ts --grep \"(/study resume serves)|(/cards resume serves)\" --reporter=line — 2 failed (both at the DOM-value expect.poll assertion, not a fetch/selector error) / 1 passed (setup) — confirms these two cells are correctly still unaddressed by this plan"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-07-12
status: complete
---

# Phase 26 Plan 02: Boundary-Refresh Mechanism + Home/Habits Adoption Summary

**New `FreshnessWatcher` client component mounted app-wide fires `router.refresh()` at every real staleness boundary (resume/back-forward/bfcache), and `HomeClient`/`HabitsClient` now adopt the fresh props that refresh delivers — flipping 4 of the 8 red acceptance tests green (`/ back-forward`, `/ resume`, `/habits resume`, `/habits back-forward`) while the full regression net (7 fresh-paths + 4 smoke) stays green**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-12T17:37:00Z
- **Completed:** 2026-07-12T17:57:41Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- Created `components/FreshnessWatcher.tsx` — a render-nothing client component (mirrors `ThemeWatcher`'s shape) that registers `visibilitychange` (fires only on hidden→visible), `popstate` (deferred a macrotask so Next's own Router Cache restore runs first), and `pageshow` (fires only on `persisted: true`) listeners in one mount effect, all funneled through a single `refresh()` closure guarded by a `useRef<number>` 300ms coalesce window
- Mounted `<FreshnessWatcher />` once in `app/layout.tsx` immediately after `<ThemeWatcher />` — every route now gets a real RSC re-fetch at back/forward, resume, and bfcache-restore boundaries
- `HomeClient`: added ungated render-phase adoption of `initialStats`/`initialActivity` via React's official "adjusting state when props change" pattern (`prevInitialStats`/`prevInitialActivity`), so a `router.refresh()`-delivered prop update is adopted immediately with no gate — no in-flight interaction on this shell needed protecting
- `HabitsClient`: converted `days`/`goal`/`masteredCount` from read-only `useState(initialX)` copies to plain consts reading the props directly, closing the exact non-resync bug pattern documented in `24-DIAGNOSIS.md` — every `router.refresh()` now adopts automatically; the one-tick `today`-gated `HabitsLoading` skeleton is unchanged
- Verified the 4 targeted acceptance tests pass (`/ back-forward`, `/ resume`, `/habits resume`, `/habits back-forward`), the full regression net stays green (`freshness-fresh-paths.spec.ts` 7/7 + `smoke.spec.ts` 4/4), and `/study resume`/`/cards resume` correctly remain red (their shells gain adoption in Plan 26-03)
- `npm run lint` and `npx tsc --noEmit` both clean (only the pre-existing `StudySession.tsx` warning and, before the environment fix, the known `tests/study-cards.test.ts` debt)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FreshnessWatcher and mount it in the root layout** — `5557823` (feat)
2. **Task 2: HomeClient ungated adoption + HabitsClient direct prop reads** — `8c15346` (feat)

**Plan metadata:** committed alongside this SUMMARY (worktree mode — orchestrator handles the shared STATE.md/ROADMAP.md update after merge)

## Files Created/Modified
- `components/FreshnessWatcher.tsx` — new client component; visibilitychange/popstate/pageshow listeners funneled through a 300ms-coalesced `router.refresh()`
- `app/layout.tsx` — `<FreshnessWatcher />` mounted after `<ThemeWatcher />`
- `components/HomeClient.tsx` — `prevInitialStats`/`prevInitialActivity` render-phase adoption blocks added
- `components/HabitsClient.tsx` — `days`/`goal`/`masteredCount` converted from `useState` copies to direct prop reads

## Decisions Made
- Render-phase adoption pattern (not the effect fallback) worked cleanly for `HomeClient` — the plan's lint-fallback branch was not needed; `npm run lint` reported 0 new errors. Plan 26-03 should use the same pattern for `StudyClient`/`CardsClient` consistency.
- `HabitsClient`'s `initialCardsByState` was already a direct read (no `useState` wrapper) before this plan; only `initialDays`/`initialGoal`/`initialMasteredCount` needed the useState-copy → direct-read conversion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing node_modules + ungenerated Prisma client in this worktree checkout**
- **Found during:** Task 1 verification (`npx tsc --noEmit` reported 33 errors, all `Cannot find module '@/app/generated/prisma/client'` or downstream type-inference failures caused by the missing generated client)
- **Issue:** Same environment gap 26-01-SUMMARY.md documented in its own worktree: `npm ls --depth=0` showed every dependency as `UNMET DEPENDENCY`, and `app/generated/prisma` (gitignored Prisma client output) did not exist in this worktree.
- **Fix:** Confirmed via `diff` that `package.json`/`package-lock.json` are byte-identical to the main repo; ran `npx prisma generate` (regenerated `app/generated/prisma`); created a symlink `node_modules -> /Users/main/Documents/claude-test/node_modules`.
- **Files modified:** none tracked (`app/generated/prisma` and `node_modules` are both gitignored; `git status --short` was clean before and after)
- **Verification:** `npx tsc --noEmit` dropped from 33 errors to 0; `npm run lint` was already clean throughout (eslint resolved its plugins via ancestor `node_modules` directory-walk even before the symlink); full Playwright suite ran successfully afterward.
- **Committed in:** n/a (untracked, gitignored artifacts — no commit needed)

---

**Total deviations:** 1 auto-fixed (1 blocking-issue fix, Rule 3)
**Impact on plan:** Necessary environment repair before `tsc`/Playwright could run correctly; no application/test code was touched by this fix, and it left the git working tree clean. No scope creep.

## Issues Encountered
None beyond the environment gap documented above as a Rule 3 deviation.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 26-03 (StudyClient + CardsClient adoption) can now rely on `FreshnessWatcher` firing `router.refresh()` at every boundary — it only needs to add prop-adoption logic to those two shells (matching the gating decisions from `26-01-PLAN.md`'s design_decisions section and this plan's established render-phase pattern).
- The regression net (`freshness-fresh-paths.spec.ts` 7 green + `smoke.spec.ts` 4 green) is confirmed intact after this plan's changes and must stay green through 26-03.
- `/study resume` and `/cards resume` remain the two outstanding red acceptance cells Plan 26-03 must flip; verified still failing for the expected reason (DOM value stale, not a fetch/selector error) — the boundary fetch itself already lands app-wide since `FreshnessWatcher` is mounted globally, only the shell-level adoption is still missing for those two routes.
- No blockers for Plan 26-03.

---
*Phase: 26-freshness-fix*
*Completed: 2026-07-12*

## Self-Check: PASSED

- FOUND: components/FreshnessWatcher.tsx
- FOUND: app/layout.tsx (contains FreshnessWatcher, count >= 2)
- FOUND: components/HomeClient.tsx (contains prevInitialStats/prevInitialActivity)
- FOUND: components/HabitsClient.tsx (no useState wrapping initialDays/initialGoal/initialMasteredCount)
- FOUND: commit 5557823 (feat: FreshnessWatcher + layout mount)
- FOUND: commit 8c15346 (feat: HomeClient adoption + HabitsClient direct prop reads)
