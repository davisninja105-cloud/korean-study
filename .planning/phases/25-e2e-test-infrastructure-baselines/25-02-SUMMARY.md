---
phase: 25-e2e-test-infrastructure-baselines
plan: 02
subsystem: testing
tags: [playwright, e2e, prisma, sqlite, tsx, next-js]

# Dependency graph
requires:
  - phase: 25-e2e-test-infrastructure-baselines (Plan 01)
    provides: "playwright.config.ts, e2e/fixture.ts, e2e/seed.ts (resetToBaseline/seedFixture/getTestPrisma), e2e/global-setup.ts, e2e/auth.setup.ts, the tsx-wrapped webServer bootstrap pattern"
provides:
  - "e2e/helpers/readers.ts: waitVisible, dumpUnrecognizedState, readHomeState, readStudySelectModeState, readCardsCount, readHabitsMasteredCount — retry-safe per-route DOM readers"
  - "e2e/smoke.spec.ts: E2E-04 — 4 per-route real-content assertions (FIXTURE-traceable, never generic 200/skeleton checks) plus per-route Navigation Timing capture (informational only)"
  - "e2e/seed.ts: resetToBaseline() reworked to spawn a tsx subprocess (e2e/run-reset-baseline.ts) so spec files can call it safely from inside a Playwright worker process"
affects: [25-03-freshness-regression-specs, 26-freshness-fix, 27-perf-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retry-safe DOM read (waitVisible + dumpUnrecognizedState) — never throws, always resolves to a diagnosable string"
    - "Semantic-token-anchored locators (span.text-reward, div.bg-surface-1) preferred over presentational-class locators where a semantic token exists on the element"
    - "tsx-subprocess delegation for any Prisma work triggered from inside a Playwright test/worker process (extends the Plan 01 globalSetup pattern to a second call site)"

key-files:
  created:
    - e2e/helpers/readers.ts
    - e2e/smoke.spec.ts
    - e2e/run-reset-baseline.ts
  modified:
    - e2e/seed.ts

key-decisions:
  - "readHomeState trimmed to span.text-reward (drops presentational .text-6xl) per 25-RESEARCH.md Ambiguity 3 — text-reward is a documented semantic design token, .text-6xl is not."
  - "readStudySelectModeState kept as the known-fragile p.text-5xl.font-bold.animate-reveal locator — components/StudyClient.tsx:251 has no semantic-token class on this element at all, so there is no stable anchor to trim to. Flagged explicitly in-file per Ambiguity 3's guidance; accepted as a known limitation for this phase."
  - "resetToBaseline() (e2e/seed.ts) reworked to spawn a tsx subprocess (e2e/run-reset-baseline.ts) instead of running Prisma work in-process, because calling it directly from a Playwright spec's test.beforeAll throws 'SyntaxError: Cannot use import.meta outside a module' — a dynamic import() of lib/prisma.ts inside a Playwright worker is routed through Node's native ESM-to-CJS bridge, which cannot load the ESM-only Prisma-generated client.ts. The original direct-Prisma logic is preserved as resetToBaselineDirect(), only safe under tsx."

patterns-established:
  - "tsx-subprocess delegation pattern for spec-file-triggered Prisma work: any future spec-file DB mutation that needs a fresh Prisma client should follow the resetToBaseline()/run-reset-baseline.ts shape rather than a direct dynamic import inside the spec."

requirements-completed: [E2E-04]

coverage:
  - id: D1
    description: "e2e/helpers/readers.ts ports the four retry-safe per-route DOM readers (readHomeState, readStudySelectModeState, readCardsCount, readHabitsMasteredCount) from scripts/diagnose-freshness.mts, with selectors trimmed/flagged per 25-RESEARCH.md Ambiguity 3"
    requirement: E2E-04
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p tsconfig.json reports zero errors attributable to e2e/helpers/readers.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "e2e/smoke.spec.ts asserts 4 specific, FIXTURE-traceable values (one per main route), never a generic HTTP-200/skeleton-absence check"
    requirement: E2E-04
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/smoke.spec.ts --project=chromium — 5 passed (1 setup/authenticate dependency + 4 smoke assertions), grep 'FIXTURE.' e2e/smoke.spec.ts == 4 occurrences, zero toBeLessThan/toBeGreaterThan occurrences"
        status: pass
    human_judgment: false
  - id: D3
    description: "Navigation Timing captured informationally per route (D-06) — zero pass/fail budget assertions in this plan"
    requirement: E2E-04
    verification:
      - kind: e2e
        ref: "grep -c 'nav-timing' on the captured smoke run output >= 4 (one per route)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Smoke assertions are correct regardless of prior DB mutation from other spec files (beforeAll resetToBaseline() ordering safeguard)"
    requirement: E2E-04
    verification:
      - kind: other
        ref: "Manually mutated a due card's nextReview via a probe script (live due count dropped 3 -> 2), then re-ran npx playwright test e2e/smoke.spec.ts --project=chromium — still 5 passed, proving beforeAll recovers the fixture baseline. Plan 03's freshness-*.spec.ts files (the plan's literal acceptance-criteria check) do not exist yet in this worktree, so this is an equivalent proof of the same safeguard."
        status: pass
    human_judgment: false

# Metrics
duration: 55min
completed: 2026-07-11
status: complete
---

# Phase 25 Plan 02: Smoke Spec and Route Readers Summary

**Ported retry-safe per-route DOM readers into e2e/helpers/readers.ts and wrote a 4-route smoke spec (E2E-04) asserting FIXTURE-traceable seeded values plus informational Navigation Timing — no vacuous 200-only checks**

## Performance

- **Duration:** 55 min (commit-to-commit)
- **Started:** 2026-07-11T22:04:34Z (approx, wave start)
- **Completed:** 2026-07-11T22:59:17Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `e2e/helpers/readers.ts` ports all four per-route DOM readers (`readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`) plus the `waitVisible`/`dumpUnrecognizedState` retry-safe support functions from `scripts/diagnose-freshness.mts`, with selectors trimmed per 25-RESEARCH.md Ambiguity 3 where a semantic-token anchor exists
- `e2e/smoke.spec.ts` asserts 4 specific, FIXTURE-traceable values — one per main route (`/`, `/study`, `/cards`, `/habits`) — never a generic HTTP-200 or skeleton-absence check, satisfying E2E-04 and the phase's first-load performance guard-rail purpose
- Navigation Timing captured per-route informationally (`[nav-timing]` console tag), with zero pass/fail budget assertions — verified via grep that no `toBeLessThan`/`toBeGreaterThan` exists anywhere in the spec file
- `beforeAll` ordering safeguard proven empirically: manually mutated the seeded DB (dropped due count from 3 to 2), re-ran the smoke suite, and confirmed all 4 assertions still passed — `resetToBaseline()` reliably restores the fixture baseline regardless of prior mutation
- Discovered and fixed a second instance of the Plan 01 `globalSetup` ESM/CJS bridge bug — this time triggered by calling `resetToBaseline()` directly from a spec file's `test.beforeAll` — via a documented, targeted subprocess-delegation fix

## Task Commits

Each task was committed atomically:

1. **Task 1: Port per-route DOM readers into e2e/helpers/readers.ts** — `f4b74f5` (feat)
2. **Task 2: Write e2e/smoke.spec.ts — 4 specific per-route assertions plus Nav Timing capture** — `ffdb859` (feat)

_Note: no TDD tasks in this plan (Task 1 had `tdd="true"` in frontmatter but its `<behavior>` block describes reader contracts exercised end-to-end by the smoke spec itself, not standalone unit tests — the plan's own verification step for Task 1 is a `tsc --noEmit` type-check, not a test run)._

## Files Created/Modified
- `e2e/helpers/readers.ts` — Retry-safe per-route DOM readers (`waitVisible`, `dumpUnrecognizedState`, `readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`), ported from `scripts/diagnose-freshness.mts` with Ambiguity-3 selector trims/flags
- `e2e/smoke.spec.ts` — E2E-04: 4 route tests + Navigation Timing capture, guarded by a `beforeAll` `resetToBaseline()` call
- `e2e/run-reset-baseline.ts` — New CLI wrapper (`tsx`-invoked) for `resetToBaselineDirect()`, the actual Prisma reset+reseed logic
- `e2e/seed.ts` — `resetToBaseline()` reworked to spawn the `run-reset-baseline.ts` subprocess via `tsx`; original direct-Prisma logic preserved and renamed to `resetToBaselineDirect()`

## Decisions Made

- **Home reader trimmed to `span.text-reward`** (drops `.text-6xl`) per Ambiguity 3 — confirmed against `components/HomeClient.tsx:207`'s actual class list (`text-6xl font-bold leading-none text-reward`) before finalizing.
- **Study reader kept as the known-fragile `p.text-5xl.font-bold.animate-reveal` locator, flagged explicitly in-file.** Confirmed via `components/StudyClient.tsx:251` that no semantic-token class exists on this element at all — there is nothing to trim to. Accepted as a documented limitation for this phase (a future `data-testid` pass would close the gap).
- **Habits reader confirmed collision-free.** Verified `components/ProficiencyArc.tsx`: the band label (line 73) is a `<span>`, not a `<p>`, so `p.text-2xl.font-bold` (line 81, the mastered-count) is the sole match inside the `bg-surface-1`-anchored Proficiency panel.
- **`resetToBaseline()` reworked to spawn a `tsx` subprocess rather than running Prisma work in-process.** See Deviations below — this preserves the plan's exact public contract (`smoke.spec.ts` imports and calls `resetToBaseline` from `./seed` exactly as specified) while fixing the underlying execution environment mismatch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `resetToBaseline()` threw `SyntaxError: Cannot use 'import.meta' outside a module` when called from inside a Playwright spec's `test.beforeAll`**
- **Found during:** Task 2 (first `npx playwright test e2e/smoke.spec.ts` run, at the "Home renders..." test)
- **Issue:** Same root-cause class as 25-01-SUMMARY's `globalSetup` finding, but at a new call site. A dynamic `import('../lib/prisma')` executed from inside a Playwright test/worker process is handed off to Node's native ESM-to-CJS translator bridge (`node:internal/modules/esm/translators`), which `require()`s the target as CommonJS. `lib/prisma.ts` transitively imports the Prisma-generated `app/generated/prisma/client.ts`, which is an ESM-only module using `import.meta` (for WASM query-engine loading) — invalid syntax once forced through the CJS bridge. Reproduced first with a standalone `await import('../lib/prisma')` probe inside a bare Playwright test before touching any plan files, confirming the failure was structural, not specific to `seed.ts`'s logic.
- **Fix:** Split `e2e/seed.ts`'s `resetToBaseline()` into two functions: `resetToBaselineDirect()` (the original direct-Prisma delete+reseed logic, documented as only safe to call from a `tsx`-run process) and a new `resetToBaseline()` (the function spec files call, matching the plan's exact contract) that spawns a `tsx` subprocess running the new `e2e/run-reset-baseline.ts` wrapper — the same proven pattern `e2e/run-global-setup.ts` already uses for `global-setup.ts`. `lib/prisma.ts` itself is untouched (zero production code changes).
- **Files modified:** `e2e/seed.ts` (reworked), `e2e/run-reset-baseline.ts` (new)
- **Verification:** `npx playwright test e2e/smoke.spec.ts` — 4/4 route assertions pass after the fix; a follow-up probe manually mutated the seeded DB and confirmed a subsequent smoke run still passed 4/4, proving `resetToBaseline()` genuinely resets state when called from a spec file.
- **Committed in:** `ffdb859` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking, Rule 3)
**Impact on plan:** Necessary to make Task 2's `test.beforeAll` requirement actually work — without this fix, every smoke test would fail at the first `resetToBaseline()` call. `e2e/smoke.spec.ts`'s public shape (imports `resetToBaseline` from `./seed`, calls it in `beforeAll`) is unchanged from the plan's literal instructions; only `e2e/seed.ts`'s internal implementation of `resetToBaseline()` changed. No production code (`app/`, `components/`, `lib/`, `prisma/schema.prisma`) was touched — success criteria's "zero changes" boundary held.

## Issues Encountered

- **Plan's literal automated verify command (`grep -Eq "4 passed"`) never matches actual Playwright output.** The `chromium` project declares `dependencies: ['setup']`, so every `npx playwright test e2e/smoke.spec.ts` run also executes and tallies the `setup` project's `authenticate` test — the line reporter's final summary always reads `5 passed`, not `4 passed`, for this harness (same structural characteristic established in Plan 01, where the isolated `--project=setup` run alone reported `1 passed`). Verified this is not a spec-file bug: `npx playwright test e2e/smoke.spec.ts --project=chromium` produces the identical `5 passed` tally because Playwright still runs declared project dependencies regardless of the `--project` filter. Treated as a plan-verification-script inaccuracy rather than a functional defect — the actual requirement (4 route assertions specifically passing, FIXTURE-traceable) was verified directly by inspecting each test's pass/fail status and the `FIXTURE.`/`nav-timing` grep counts, all of which matched the plan's acceptance criteria exactly.
- **Task 1's `tdd="true"` frontmatter flag has no corresponding `<behavior>`-driven unit test file.** The task's `<behavior>` block describes reader contracts (e.g. "readCardsCount against a page showing 'Cards (8)' returns the string 'Cards (8)'") that are exercised implicitly by `e2e/smoke.spec.ts`'s real assertions against the real seeded DB and real markup, not by a standalone unit-test file — consistent with the task's own `<verify>` step being a `tsc --noEmit` type-check, not `npm test`. No separate `.test.ts` file was created; the smoke spec itself is the behavioral proof.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `e2e/helpers/readers.ts` is ready for Plan 03's freshness-regression spec files to import without modification (all four readers export the exact signatures Plan 03's read_first section expects).
- `resetToBaseline()`'s new tsx-subprocess-delegation shape is transparent to callers — Plan 03's specs can call `await resetToBaseline()` in `test.beforeEach` exactly as originally planned; the internal fix does not change the public API surface documented in `e2e/fixture.ts`/`e2e/seed.ts`'s existing comments.
- One informational note for Plan 03: any NEW helper that opens its own Prisma client directly from a spec file (not via `resetToBaseline()`) will hit the same `import.meta`/ESM-CJS-bridge issue this plan found — the `run-reset-baseline.ts`-style tsx-subprocess pattern is the proven fix; a fresh `getTestPrisma()` dynamic import from inside a spec file will NOT work in-process.
- No blockers for Plan 03.

---
*Phase: 25-e2e-test-infrastructure-baselines*
*Completed: 2026-07-11*

## Self-Check: PASSED

All claimed files verified present on disk; all claimed commit hashes verified present in git history.
