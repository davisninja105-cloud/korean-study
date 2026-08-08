---
phase: 32-study-load-round-trip-collapse
plan: 04
subsystem: database
tags: [prisma, libsql, sqlite, turso, vitest, playwright, round-trip-instrumentation, e2e]

requires:
  - phase: 32-study-load-round-trip-collapse
    provides: "32-01's query-counter harness (lib/query-counter.ts, scripts/measure-study-roundtrips.mts) and measured 10-11 physical round-trip baseline"
  - phase: 32-study-load-round-trip-collapse
    provides: "32-02's lib/study-cache.ts invariants snapshot + studyCacheVersion cross-process invalidation channel"
  - phase: 32-study-load-round-trip-collapse
    provides: "32-03's raw-SQL Phase A/B rewrite of lib/study-cards.ts, measured at 2 physical round trips warm"
provides:
  - "tests/study-roundtrips.test.ts — the committed, runnable proof of STUDY-01: warm ≤2, cache-miss ≤3, warm-after-miss ≤2, physical-vs-Prisma-event cross-check, all against a real temp SQLite DB"
  - "lib/study-cache.ts's refreshStudyCache() rewritten from four concurrent Prisma calls (measured 4 physical round trips) to ONE prisma.$queryRaw folding edges/lemmas/sessionSize/lessons via json_group_array/json_object — the fix that actually gets STUDY-01's cold-miss budget to ≤3"
  - "e2e/perf.spec.ts: /study and /api/cards/due budgets tightened from 3000ms/1000ms to 100ms/100ms, each derived from real measured medians with full pre/post-change derivation comments"
  - "e2e/study-cache-invalidation.spec.ts — the cross-process no-redeploy proof (STUDY-03 success criterion #3) plus a locked D-02 regression (review writes do not invalidate the cache)"
  - "e2e/helpers/mutate.ts + e2e/run-mutate.ts: createForwardReferenceAndRelink() / readStudyCacheVersion() — new out-of-band mutation ops following the existing *Direct + subprocess-delegating pattern"
  - "32-BASELINE.md's ## After section: warm-cache (2) and cache-miss (3) counts recorded side by side, before/after delta, fixture-scale caveat restated"
affects: []

actuals:
  tokens: 18000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Invariant-refill collapse: four independent Prisma calls run via Promise.allSettled measured at 4 physical libSQL round trips (not 1-per-call as assumed) — folding them into ONE prisma.$queryRaw with correlated json_group_array/json_object subqueries (the same technique Phase B already used for the Sentence relation) is what actually gets a concurrent-looking batch down to its ground-truth physical cost on this stack."
    - "Round-trip proof harness: mkdtempSync + real prisma/schema.prisma DDL + env-first dynamic-import (DATABASE_URL and STUDY_QUERY_COUNTER set before any lib/prisma-adjacent import), mirroring tests/relink-dependencies.test.ts and tests/study-cache.test.ts's real-DB block — the only way to count genuine physical round trips rather than mocked call counts."
    - "e2e cross-process mutation: a new DB mutator lives in e2e/helpers/mutate.ts as a `*Direct` function calling the target lib function via a DYNAMIC import inside the function body (never a static top-of-file import) — a static import of an ESM-only-generated-Prisma-client-adjacent module would break every Playwright-worker importer of the same file."

key-files:
  created:
    - tests/study-roundtrips.test.ts
    - e2e/study-cache-invalidation.spec.ts
  modified:
    - lib/study-cache.ts
    - lib/settings.ts
    - tests/study-cache.test.ts
    - tests/study-cards.test.ts
    - e2e/perf.spec.ts
    - e2e/helpers/mutate.ts
    - e2e/run-mutate.ts
    - .planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "Task 1's own instrumentation test exposed that lib/study-cache.ts's Plan-02 refill shape (four concurrent Prisma calls) cost 4 physical round trips, not ≤1 — pushing a cold getStudyCards() call to 6 total, double the ≤3 budget. Fixed by folding all four reads into one prisma.$queryRaw, per 32-CONTEXT.md's own 'Claude's Discretion' note anticipating exactly this fork ('whichever shape passes the round-trip-count instrumentation'). Treated as in-scope Rule 1/2 (the phase's headline, named requirement not yet met), not a Rule 4 checkpoint, because CONTEXT.md had already pre-authorized this exact discretion point."
  - "The refill's failure mode changed from per-field degradation (edges/lemmas/sessionSize/lessons could each fail independently) to whole-query degradation (one physical request is atomic — it succeeds or throws as a whole). This is an unavoidable consequence of collapsing 4 round trips into 1, documented in lib/study-cache.ts's DEGRADATION TRADEOFF comment and reflected in the updated tests/study-cache.test.ts / tests/study-cards.test.ts coverage."
  - "parseSessionSize() exported from lib/settings.ts so the combined invariants query reuses the exact same default/validation logic getSessionSize() used, rather than duplicating parse rules."
  - "The RELIABILITY-01 log keeps its legacy [study-cards]-prefixed message (not this file's own [study-cache] prefix) specifically because two existing regression tests key off that exact prefix — preserving it avoids an unrelated test-contract break."
  - "e2e budgets (100ms for /study and /api/cards/due) are computed from real measured medians (34ms and 6ms respectively) times 1.5, rounded up to the nearest 100ms — the same formula and comment structure the pre-existing /cards entry uses. Both were re-measured after the tightening to confirm stability (33ms and 6ms on the second run)."
  - "The cross-process freshness proof (Task 3) creates its new dependent card ('숙제하다') built from an EXISTING seeded due card ('학교') so both land in the same session pool without needing to seed a second fixture card, and asserts ordering via /api/cards/due's response body rather than driving the full study-session UI (both are explicitly permitted by the plan)."

patterns-established:
  - "When a Promise.allSettled batch of N Prisma calls needs to be genuinely 1 physical round trip (not N), fold it into one prisma.$queryRaw with correlated json_group_array/json_object subqueries per field — Promise.allSettled concurrency does not, by itself, reduce physical round-trip count on this stack."

requirements-completed: [STUDY-01, STUDY-03]

coverage:
  - id: D1
    description: "STUDY-01's ≤2 warm-cache / ≤3 cache-miss round-trip claim is proven by a committed, runnable Vitest test against a real temp SQLite DB — not asserted by inspection"
    requirement: "STUDY-01"
    verification:
      - kind: unit
        ref: "tests/study-roundtrips.test.ts > study round trips — STUDY-01 warm/cold proof (4 cases, all passing: cold ≤3, warm ≤2, post-bump miss ≤3, warm-after-miss ≤2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Physical round-trip count and Prisma's own $on('query') event count are cross-checked on the same run and agree exactly (2 and 2) — research Assumption A4 resolved for this stack"
    requirement: "STUDY-01"
    verification:
      - kind: unit
        ref: "tests/study-roundtrips.test.ts > physical count vs Prisma $on(query) event count cross-check"
        status: pass
    human_judgment: false
  - id: D3
    description: "/study and /api/cards/due perf budgets tightened from 3000ms/1000ms to 100ms/100ms, each traceable to a real measured median (34ms, 6ms) via the documented ×1.5-rounded-up formula"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts (8/8 pass)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A CardDependency edge created by a separate tsx subprocess (mirroring scripts/local-resync.mts) is visible in the very next /study load of a server that was never restarted — STUDY-03 success criterion #3"
    requirement: "STUDY-03"
    verification:
      - kind: e2e
        ref: "e2e/study-cache-invalidation.spec.ts > a CardDependency edge created by a separate process shows up in the next /study load"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-02 locked: grading a card through POST /api/review does NOT bump studyCacheVersion"
    verification:
      - kind: e2e
        ref: "e2e/study-cache-invalidation.spec.ts > grading a card through POST /api/review does NOT bump studyCacheVersion — D-02 locked"
        status: pass
    human_judgment: false
  - id: D6
    description: "Session composition is unchanged: every pre-existing unit and e2e behavioral assertion still passes, including grade-flow and freshness specs"
    verification:
      - kind: unit
        ref: "npm test (326/326 pass)"
        status: pass
      - kind: e2e
        ref: "npx playwright test (44/44 pass, full suite including grade-flow.spec.ts and freshness-*.spec.ts)"
        status: pass
    human_judgment: false

duration: ~90min
completed: 2026-08-08
status: complete
---

# Phase 32 Plan 04: The STUDY-01/STUDY-03 Proof — and the Fix That Made It True Summary

**Committed the round-trip and no-redeploy-freshness proofs the whole phase was building toward — `tests/study-roundtrips.test.ts` and `e2e/study-cache-invalidation.spec.ts` — and, in the process of writing the first one, discovered and fixed a real gap: `lib/study-cache.ts`'s invariants refill measured 4 physical round trips (not ≤1), pushing a cold `/study` load to 6 total instead of STUDY-01's ≤3 budget; folding it into one `json_group_array`-based raw query (the same technique Phase B already used) brought the measured numbers to exactly warm=2 / cache-miss=3.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-08-08T21:00:00Z (approx., continuing from Plan 03's completion)
- **Completed:** 2026-08-08T22:30:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments

- **Built `tests/study-roundtrips.test.ts`** — the committed proof of STUDY-01. Copies `tests/relink-dependencies.test.ts`'s real-temp-SQLite-DB harness exactly (env-first, dynamic-import-only, real `prisma/schema.prisma` DDL). Four behavior cases plus a cross-check, encoding D-01's deliberate warm/cold split literally rather than one unconditional number: cold snapshot ≤3, immediate warm repeat ≤2, post-`bumpStudyCacheVersion()` miss ≤3, warm-after-miss ≤2, and a physical-vs-Prisma-`$on('query')`-event cross-check that agreed exactly (2 and 2) on this stack.
- **Found and fixed a real bug the test itself exposed.** Running the cold-miss case against real DB traffic measured **6 physical round trips**, not ≤3 — `lib/study-cache.ts`'s Plan-02 refill (four concurrent Prisma calls via `Promise.allSettled`) cost 4 physical round trips, not the ≤1 the budget needs, because each of the four independent calls is its own physical HTTP request regardless of `Promise.allSettled` concurrency. 32-CONTEXT.md's own "Claude's Discretion" note had explicitly anticipated this fork ("whether the cache-miss refill is one combined `json_group_array`-based query or several... whichever shape passes the round-trip-count instrumentation") — so `refreshStudyCache()` was rewritten to fold all four reads into ONE `prisma.$queryRaw` via correlated `json_group_array`/`json_object` subqueries, the same technique `lib/study-cards.ts`'s Phase B already uses for the `Sentence` relation. This brought the refill to 1 physical round trip and the cold-miss total to exactly 3 — matching the target, not just clearing it. The tradeoff: per-field degradation (only the failed field falling back) becomes whole-query degradation (one physical request is atomic) — documented in `lib/study-cache.ts`'s new REFILL SHAPE / DEGRADATION TRADEOFF header comments, and reflected in updated coverage in `tests/study-cache.test.ts` and `tests/study-cards.test.ts`.
- **Tightened `/study` and `/api/cards/due` budgets** in `e2e/perf.spec.ts` from 3000ms/1000ms to 100ms/100ms — `API_BUDGET_MS` converted to a per-path record (`/api/stats`/`/api/activity` untouched at 1000ms). Both new numbers trace to real measured medians (34ms, 6ms) via the same ×1.5-rounded-up-to-100ms formula the pre-existing `/cards` entry documents, with pre-change and post-change sample sets recorded in the comment block above each.
- **Proved the no-redeploy freshness claim end to end.** `e2e/study-cache-invalidation.spec.ts` warms `/study`, mutates the DB from a SEPARATE `tsx` subprocess (`e2e/run-mutate.ts`, via two new `e2e/helpers/mutate.ts` ops — `createForwardReferenceAndRelink()` and `readStudyCacheVersion()`), reloads `/study` on the same still-running server, and asserts the newly relinked prerequisite (`학교`) sorts before its new dependent card (`숙제하다`) in `/api/cards/due`'s response. A second case locks D-02: grading a card through the real `POST /api/review` path does NOT bump `studyCacheVersion`.
- **Updated `32-BASELINE.md`'s `## After` section** with both the warm-cache (2) and cache-miss (3) counts side by side, the before/after delta table, an honest account of the refill-shape finding, and the fixture-scale caveat restated.
- **Marked STUDY-01 and STUDY-03 complete** in `.planning/REQUIREMENTS.md` (checkbox + traceability table) — this plan's declared `requirements:` frontmatter. STUDY-02 (confirmed non-duplicative by Plan 03) remains marked Pending in REQUIREMENTS.md — outside this plan's declared requirements list, flagged below for the orchestrator to reconcile.

## Task Commits

1. **Task 1: The committed round-trip assertion — warm, cold, and back to warm** - `7b16019` (test)
2. **Task 2: Tighten the /study and /api/cards/due budgets from measured medians** - `33e7fdd` (test)
3. **Task 3: Prove no-redeploy freshness end to end, from a separate process** - `2053396` (test)

**Plan metadata:** committed separately by the orchestrator (this plan runs in a git worktree; STATE.md/ROADMAP.md updates are the orchestrator's responsibility per the wave protocol). `.planning/REQUIREMENTS.md` was updated and committed as part of this plan's own metadata commit, per worktree-mode convention (SUMMARY.md + REQUIREMENTS.md are this agent's responsibility; STATE.md/ROADMAP.md are excluded).

## Files Created/Modified

- `tests/study-roundtrips.test.ts` (created) - The committed STUDY-01 proof: real temp SQLite DB, four warm/cold behavior cases plus a physical-vs-Prisma-event cross-check.
- `lib/study-cache.ts` (modified) - `refreshStudyCache()` rewritten from four concurrent Prisma calls to one `prisma.$queryRaw` folding edges/lemmas/sessionSize/lessons via `json_group_array`/`json_object`. New REFILL SHAPE / DEGRADATION TRADEOFF header comments document why and what changed.
- `lib/settings.ts` (modified) - `parseSessionSize()` exported so the combined invariants query reuses the same default/validation logic.
- `tests/study-cache.test.ts` (modified) - Mocked block rewritten for the single-`$queryRaw` refill shape; the four separate per-field-failure tests collapsed into one whole-query-failure test matching the new atomic reality.
- `tests/study-cards.test.ts` (modified) - Mock factory reduced to `$queryRaw`-only; three-way query-shape disambiguation (Phase A / invariants refill / Phase B) added; cache-gating test now counts `$queryRaw` calls directly (3 on miss, 2 on hit).
- `e2e/perf.spec.ts` (modified) - `API_BUDGET_MS` converted to a per-path record; `/study` and `/api/cards/due` budgets tightened with full derivation comments.
- `e2e/study-cache-invalidation.spec.ts` (created) - The cross-process no-redeploy freshness proof plus the D-02 regression lock.
- `e2e/helpers/mutate.ts` (modified) - `createForwardReferenceAndRelinkDirect()`/`readStudyCacheVersionDirect()` plus their public subprocess-delegating wrappers.
- `e2e/run-mutate.ts` (modified) - Registered the two new ops.
- `.planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md` (modified) - `## After` section appended.
- `.planning/REQUIREMENTS.md` (modified) - STUDY-01 and STUDY-03 marked complete (checkbox + traceability table).

## Decisions Made

See `key-decisions` in frontmatter — the refill-shape fix (and why it was treated as in-scope rather than a Rule-4 checkpoint), the per-field-to-whole-query degradation tradeoff, the `parseSessionSize()` export, the legacy `[study-cards]` log-prefix preservation, the budget-derivation formula, and the cross-process test's card-selection choice are the load-bearing ones.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `lib/study-cache.ts`'s invariants refill measured 4 physical round trips, not ≤1 — cold `getStudyCards()` cost 6 total instead of STUDY-01's ≤3 budget**
- **Found during:** Task 1, first run of `tests/study-roundtrips.test.ts`'s cold-snapshot case (measured 6, asserted ≤3)
- **Issue:** Plan 02's `refreshStudyCache()` ran four independent Prisma calls (`cardDependency.findMany`, `card.findMany`, `getSessionSize()`, `lesson.findMany`) concurrently via `Promise.allSettled`. Verified via a standalone probe script that each of the four costs exactly 1 physical round trip on its own — `Promise.allSettled` concurrency does not collapse them into fewer physical HTTP requests on this stack (each is still its own `execute()` call). Total: Phase A (1) + refill (4) + Phase B (1) = 6, double the ≤3 cold-miss budget.
- **Fix:** Rewrote `refreshStudyCache()` to issue ONE `prisma.$queryRaw` folding all four reads into correlated `json_group_array`/`json_object` subqueries — the same technique `lib/study-cards.ts`'s Phase B already uses for the `Sentence` relation. Verified empirically first (via a throwaway probe script, since removed) that `json_group_array` over zero matching rows genuinely returns `"[]"`, not `NULL`, so no empty-result special-casing was needed. 32-CONTEXT.md's "Claude's Discretion" note pre-authorized this exact fork.
- **Files modified:** `lib/study-cache.ts`, `lib/settings.ts` (exported `parseSessionSize`), `tests/study-cache.test.ts`, `tests/study-cards.test.ts` (both updated for the new mock shape and the whole-query-failure semantics)
- **Verification:** `tests/study-roundtrips.test.ts` now measures cold=3, warm=2, post-bump-miss=3, warm-after-miss=2 — matching the target exactly. Full `npm test` (326/326) and `npx tsc --noEmit`/`npm run lint` clean.
- **Committed in:** `7b16019` (Task 1's commit)

**2. [Rule 3 - Blocking issue] Missing `node_modules/.bin/tsx` in this worktree, needed by `e2e/seed.ts`'s `resetToBaseline()` and `e2e/helpers/mutate.ts`'s `runMutateOp()`**
- **Found during:** Task 2, first `npx playwright test e2e/perf.spec.ts` run (`spawnSync .../node_modules/.bin/tsx ENOENT`)
- **Issue:** This git worktree has no local `node_modules` (gitignored, per-worktree artifact, same class of gap as Plan 01's precondition finding), but `e2e/seed.ts` and `e2e/helpers/mutate.ts` resolve `tsx` via an explicit local `path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')` rather than `npx`'s directory-walk resolution.
- **Fix:** Symlinked `node_modules/.bin/tsx` in this worktree directly to the parent checkout's already-installed `tsx` binary (`node_modules/.bin` created, one symlink added) — no package install, no new dependency, purely a local environment link to an already-vetted binary. `node_modules/` is gitignored, so this is not part of any commit.
- **Files modified:** none (gitignored, untracked)
- **Verification:** `npx playwright test e2e/perf.spec.ts` and the full `npx playwright test` suite (44/44) ran cleanly afterward.
- **Committed in:** n/a (gitignored artifact, not tracked)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** The Rule 1 fix is load-bearing — without it, STUDY-01's cold-miss budget is simply not met, and this plan's own required `npm test`/`tests/study-roundtrips.test.ts` gate would not pass. It touched two files outside Task 1's declared `<files>` scope (`lib/study-cache.ts`, `lib/settings.ts`) plus two test files from earlier plans (`tests/study-cache.test.ts`, `tests/study-cards.test.ts`), but was explicitly pre-authorized by 32-CONTEXT.md's "Claude's Discretion" note and is squarely within this phase's headline, named requirement. The Rule 3 fix is a one-time local environment link, not a code change.

## Issues Encountered

**Minor plan-text inaccuracy, not a regression:** Task 3's acceptance criteria states `grep -c "force-dynamic" app/study/page.tsx` should return `1`; the actual file (unmodified by this plan, last touched by Plan 03's commit `909b260`) returns `2` — one match is the `export const dynamic = 'force-dynamic'` line itself, the other is an explanatory comment on the preceding line that also contains the string "force-dynamic". The underlying invariant this criterion checks (force-dynamic is present and was not removed) genuinely holds; the exact grep count was miscounted at plan-writing time against a file this plan never touches. No code change made — editing the comment just to satisfy a grep count would be optimizing for the assertion string rather than genuine correctness.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 32 is functionally complete.** STUDY-01 (≤2 warm / ≤3 cold-miss, committed proof) and STUDY-03 (cross-process no-redeploy freshness, committed proof) are both measured, proven, and marked complete in `.planning/REQUIREMENTS.md`. STUDY-02 (confirmed non-duplicative, per Plan 03) was already implementation-complete but remains marked Pending in `.planning/REQUIREMENTS.md` — it is outside this plan's declared `requirements:` frontmatter (`[STUDY-01, STUDY-03]`), so it was not marked here per the executor's own scope rule. **Flagged for the orchestrator/next phase-close pass to reconcile** — `.planning/phases/32-study-load-round-trip-collapse/32-03-SUMMARY.md`'s own `requirements-completed: [STUDY-01, STUDY-02]` frontmatter already documents this as done; only the REQUIREMENTS.md checkbox is stale.
- Full verification green: `npm test` (326/326), `npx playwright test` (44/44, full suite including `grade-flow.spec.ts`, `freshness-*.spec.ts`, and the tightened `perf.spec.ts`), `npx tsc --noEmit` clean, `npm run lint` clean (1 pre-existing unrelated warning in `components/StudySession.tsx`, unchanged from before this plan).
- `force-dynamic` and `FreshnessWatcher` both confirmed present/unmodified (see Issues Encountered above for the grep-count nuance).
- No raw `$queryRawUnsafe`/`$executeRawUnsafe` calls anywhere in `lib`/`app` (T-32-01 threat-model grep re-verified clean).

---
*Phase: 32-study-load-round-trip-collapse*
*Completed: 2026-08-08*
