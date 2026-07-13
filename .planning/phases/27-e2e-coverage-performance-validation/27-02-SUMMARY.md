---
phase: 27-e2e-coverage-performance-validation
plan: 02
subsystem: testing
tags: [playwright, e2e, performance, navigation-timing, page-evaluate-fetch]

# Dependency graph
requires:
  - phase: 27-01
    provides: data-testid instrumentation + e2e/grade-flow.spec.ts (perf.spec.ts sorts alphabetically after it and relies on the same resetToBaseline() ordering safeguard)
provides:
  - "e2e/perf.spec.ts — PERF-04 + PERF-05 performance-budget spec: 4 page-load budget tests (median-of-5 DCL < 3000ms per route) + 3 API round-trip budget tests (median-of-5 < 1000ms per endpoint)"
  - "Falsifiability-proven guard rail: verified genuinely capable of failing (1ms budget probe → 7/7 red) and flake-resistant (median-of-5 + generous headroom + per-sample vacuity guards)"
affects: [future performance-regression work, any future E2E spec added to the suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "median-of-N timing assertion (sorted-middle picker, N=5 → true median) — absorbs first-sample cold-start skew without masking real regressions"
    - "per-sample vacuity guard positioned BEFORE the median assertion (dcl > 0 for pages; res.ok === true + non-empty body for APIs) — a fast-failing response must fail the budget test, never sail under it"
    - "page.evaluate(fetch) with body consumption inside the timed window, timed via performance.now() — the full round-trip cost, not just header arrival"
    - "one test per route/endpoint (not one mega-test) — keeps each test comfortably inside Playwright's 30s default timeout and makes failures route-attributable"

key-files:
  created:
    - e2e/perf.spec.ts
  modified: []

key-decisions:
  - "Asserted median DCL (domContentLoadedEventEnd), not median TTFB, as the PERF-04 pass/fail criterion — DCL is the user-facing milestone; TTFB is captured and logged alongside every sample for diagnostic value (research Open Question 2's recommended resolution of D-08's ambiguous 'TTFB / domContentLoaded' wording)"
  - "D-09's 3-endpoint set implemented as specified with zero deviation: /api/cards/due (named directly by the ROADMAP requirement) + /api/stats + /api/activity (the two data-heavy GETs backing Home/Habits via lib/dashboard.ts)"
  - "Falsifiability probe executed live during Task 2 rather than deferred/skipped: budgets temporarily dropped to 1ms via sed, full spec run (7/7 failed on median assertions as expected), then restored via the .bak file and re-verified green (8/8) before committing — proves the assertions are genuinely capable of failing, not just decorative"

requirements-completed: [PERF-04, PERF-05]

coverage:
  - id: D1
    description: "4 page-load budget tests (/, /study, /cards, /habits) — median-of-5 Navigation Timing DCL < 3000ms, per-sample vacuity guard, all 20 samples logged"
    requirement: PERF-04
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts --reporter=line — 4/4 page tests passing with real nonzero ttfb/dcl/load values logged per sample"
        status: pass
    human_judgment: false
  - id: D2
    description: "3 API round-trip budget tests (/api/cards/due, /api/stats, /api/activity) — median-of-5 authenticated page.evaluate(fetch) < 1000ms, per-sample res.ok + non-empty-body vacuity guard, all 15 samples logged"
    requirement: PERF-05
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts --reporter=line — 3/3 API tests passing with real millisecond values logged per sample"
        status: pass
    human_judgment: false
  - id: D3
    description: "Falsifiability proven: 1ms budgets → all 7 perf tests fail on their median assertions; restored 3000/1000ms budgets → all 7 pass again"
    verification:
      - kind: e2e
        ref: "Live probe run: 7 failed (1ms budgets) → 7/8 total including setup passed on restore (8 passed, 15.5s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full 7-spec-file E2E suite (4 freshness specs + smoke + grade-flow + perf) green in one run — proves the per-file-reset regime holds with both new Phase 27 spec files coexisting in alphabetical discovery order"
    verification:
      - kind: e2e
        ref: "npx playwright test --reporter=line — 31 passed (1.3m), zero failures"
        status: pass
      - kind: automated_ui
        ref: "npm run lint — 0 errors (1 pre-existing unrelated warning in components/StudySession.tsx)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-07-13
status: complete
---

# Phase 27 Plan 02: Performance Budget E2E Coverage Summary

**Shipped `e2e/perf.spec.ts` (PERF-04 + PERF-05): 4 page-load budget tests (median-of-5 Navigation Timing DCL < 3000ms) and 3 API round-trip budget tests (median-of-5 authenticated fetch timing < 1000ms), both with per-sample vacuity guards and logged samples, falsifiability-proven live via a 1ms-budget probe, and verified green in the full 7-spec-file suite alongside Plan 01's grade-flow spec.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-13T17:53:00Z (approx, after worktree node_modules symlink + prisma generate)
- **Completed:** 2026-07-13T18:14:00Z
- **Tasks:** 2 planned tasks, 0 deviations
- **Files modified:** 1 (created)

## Accomplishments

- `e2e/perf.spec.ts` created with `median()` and `sampleNav()` file-local helpers, `PAGE_BUDGET_MS = 3000` / `API_BUDGET_MS = 1000` / `SAMPLES = 5` constants (D-08/D-09 exact numbers), and `beforeAll(resetToBaseline)` ordering safeguard matching `smoke.spec.ts`'s established convention.
- 4 page-load budget tests (`/`, `/study`, `/cards`, `/habits`) — each does 5 fresh `page.goto` navigations, reads `performance.getEntriesByType('navigation')[0]` via picked plain fields only (never the raw entry — Pitfall 2), logs every sample, asserts `dcl > 0` per sample, then asserts median DCL < 3000ms.
- 3 API round-trip budget tests (`/api/cards/due`, `/api/stats`, `/api/activity`) — one `page.goto('/')` to attach the authenticated `ks_auth` cookie, then 5 `page.evaluate` fetches timed via `performance.now()` with `res.text()` consumed inside the timed window; asserts `ok === true` and `bytes > 0` per sample before asserting median < 1000ms.
- Falsifiability probe executed live: budgets temporarily set to 1ms (via `sed` + a `.bak` backup), full spec run showed all 7 perf tests failing on their median assertions; budgets restored from the `.bak`, re-run confirmed 8/8 passing (setup + 7 perf tests) before committing. Committed file carries the real 3000/1000 values.
- Full-suite integration confirmed: `npx playwright test --reporter=line` — 31 passed (1.3m) across all 7 spec files (4 freshness + smoke + grade-flow + perf) plus the setup project, zero failures.

## Observed Median Values (passing run, trend baseline)

**Page-load budgets (median DCL, budget 3000ms):**

| Route | Median DCL | Samples (ms) |
|-------|-----------|--------------|
| `/` | 32ms | 15, 34, 32, 50, 27 |
| `/study` | 30ms | 15, 33, 30, 30, 21 |
| `/cards` | 26ms | 21, 19, 33, 26, 37 |
| `/habits` | 27ms | 16, 28, 27, 27, 25 |

**API round-trip budgets (median, budget 1000ms):**

| Endpoint | Median | Samples (ms) |
|----------|--------|---------------|
| `/api/cards/due` | 9ms | 10, 8, 9, 11, 4 |
| `/api/stats` | 7ms | 12, 8, 7, 6, 3 |
| `/api/activity` | 5ms | 9, 7, 5, 4, 3 |

All values are 2–3 orders of magnitude under budget, consistent with D-08/D-09's "generous guard rail, not a target" framing — these numbers are a local-machine trend baseline for future eyeballing, not a claim about production Vercel/Turso latency.

## Falsifiability Probe Evidence

| Run | Budgets | Result |
|-----|---------|--------|
| Probe | `PAGE_BUDGET_MS = 1`, `API_BUDGET_MS = 1` | 7 failed (all 4 page tests + all 3 API tests failed their median assertion; setup project's 1 test unaffected) |
| Restore | `PAGE_BUDGET_MS = 3000`, `API_BUDGET_MS = 1000` (committed values) | 8 passed (setup + 7 perf tests) |

This confirms the assertions are genuinely capable of failing (not tautological/vacuous), satisfying `27-VALIDATION.md`'s anti-tautology contract (b).

## Task Commits

1. **Task 1: Page-load budget tests (PERF-04)** - `9371f62` (feat)
2. **Task 2: API round-trip budget tests + falsifiability probe (PERF-05)** - `70abcbd` (feat)

_No plan-metadata commit in worktree mode — the orchestrator commits STATE.md/ROADMAP.md centrally after merge._

## Files Created/Modified

- `e2e/perf.spec.ts` - New PERF-04 + PERF-05 spec: 4 page-load budget tests + 3 API round-trip budget tests, both median-of-5 with per-sample vacuity guards and full sample logging

## Decisions Made

- Asserted median **DCL** (not TTFB) as the PERF-04 pass/fail gate — the user-facing milestone; TTFB is still captured and logged per sample for diagnostic value alongside the DCL/load figures.
- Implemented D-09's exact 3-endpoint set with zero substitutions: `/api/cards/due` (named directly by the requirement), `/api/stats`, `/api/activity`.
- Ran the falsifiability probe live rather than skipping it — this is the one part of the plan that directly proves the spec isn't a decorative stopwatch; both run outcomes (probe-red, restore-green) are recorded above.

## Deviations from Plan

None - plan executed exactly as written. No Rule 1/2/3 auto-fixes were needed; the target API GET handlers (`/api/activity`, `/api/stats`, `/api/cards/due`) were already confirmed present and functioning correctly during the pre-execution read.

## Issues Encountered

- **Worktree environment gap (not a code issue, same as Plan 01):** this worktree had no `node_modules` and no generated Prisma client. Symlinked `node_modules` from the main repo checkout (`ln -s <main-repo>/node_modules node_modules`) and ran `npx prisma generate` once before any Playwright command would resolve. Both are gitignored/local-only fixes, not part of any commit.

## User Setup Required

None — zero production code changes, zero new dependencies, zero config changes. Dev-only E2E test file.

## Next Phase Readiness

- `e2e/perf.spec.ts` establishes the performance-budget pattern (median-of-N + vacuity guard + generous headroom + per-sample logging) available for any future E2E performance coverage.
- The observed median values table above is a trend baseline — a future run showing medians drifting materially upward (while still under budget) would be worth a manual look even though the automated gate itself would still be green.
- No blockers for Plan 27-03 or any subsequent work in this phase.

## Self-Check: PASSED

- `e2e/perf.spec.ts` exists: FOUND
- Commit `9371f62` (Task 1): FOUND in `git log`
- Commit `70abcbd` (Task 2): FOUND in `git log`
- `npx playwright test e2e/perf.spec.ts --reporter=line`: 8/8 passing (1 setup + 7 perf tests) on final restored-budget run
- `npx playwright test --reporter=line` (full suite): 31/31 passing
- `npm run lint`: 0 errors (1 pre-existing, unrelated warning in `components/StudySession.tsx`)

---
*Phase: 27-e2e-coverage-performance-validation*
*Plan: 02*
*Completed: 2026-07-13*
