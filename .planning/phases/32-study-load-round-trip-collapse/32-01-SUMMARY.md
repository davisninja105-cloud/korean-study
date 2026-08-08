---
phase: 32-study-load-round-trip-collapse
plan: 01
subsystem: database
tags: [prisma, libsql, turso, sqlite, round-trip-instrumentation, testing]

requires:
  - phase: 31-cards-list-pagination-virtualization
    provides: cursor-paginated /cards baseline pattern (no direct code dependency; sequencing precedent only)
provides:
  - "lib/query-counter.ts: countingLibsqlClient()/resetQueryCount()/getQueryCounts()/notePrismaQueryEvent() — a reusable, permanent physical round-trip counting harness"
  - "lib/prisma.ts: STUDY_QUERY_COUNTER env-gated instrumentation branch, inert by default"
  - "scripts/measure-study-roundtrips.mts: runnable per-segment round-trip measurement tool (phase A / phase B / page lessons / total / prisma events / json-aggregation probe)"
  - "32-BASELINE.md: measured baseline (10 physical round trips for getStudyCards() alone, 11 for a whole /study page load) and the Phase-B raw-SQL verdict that 32-03 reads as its branch condition"
affects: [32-02-study-load-round-trip-collapse, 32-03-study-load-round-trip-collapse, 32-04-study-load-round-trip-collapse]

actuals:
  tokens: 5804
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Physical libSQL round-trip counting via a Proxy wrapped around the @libsql/client instance BEFORE @prisma/adapter-libsql receives it, activated only by subclassing PrismaLibSql and overriding its createClient() method (the constructor itself only accepts a config object, not a pre-built client)"
    - "Proxy-wrapped client methods must be explicitly .bind(target)ed — the local file: transport's Sqlite3Client (native-addon-backed) throws a receiver-identity TypeError otherwise; the HTTP/Turso transport doesn't hit this but binding is harmless there too"

key-files:
  created:
    - lib/query-counter.ts
    - scripts/measure-study-roundtrips.mts
    - .planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md
  modified:
    - lib/prisma.ts
    - tests/study-cards.test.ts

key-decisions:
  - "Interception point: override PrismaLibSql.createClient() in a thin subclass, not the constructor — PrismaLibSql (@prisma/adapter-libsql 7.6.0) only accepts a config object, never a pre-built @libsql/client instance"
  - "Proxy binds every returned function to the real target object — fixes a real TypeError crash on the local file: transport (Sqlite3Client's native binding requires exact receiver identity), not just a defensive nicety"
  - "Per-segment (phase A / phase B / page lessons) breakdown is measured by replicating each segment's exact Prisma query shape directly inside the measurement script, not by instrumenting lib/study-cards.ts internally — this plan's files_modified scope excludes lib/study-cards.ts"
  - "Phase B verdict recorded as RAW SQL REQUIRED: measured 4 physical round trips for the include-based card.findMany, confirming 32-RESEARCH.md's inference that SQLite has no single-query relationLoadStrategy: 'join'"
  - "requirements-completed left empty in this SUMMARY's frontmatter (see below) — this plan only measures and proves infrastructure; STUDY-01's literal ≤2-round-trip target is not yet met (measured 10-11), so marking it complete here would be exactly the 'flattering, unfalsifiable claim' this phase's own prohibitions forbid"

patterns-established:
  - "Round-trip definition: one physical libSQL HTTP request, counted at the @libsql/client boundary (execute()/batch()/transaction()), cross-checked against Prisma's own $on('query') event count on the same run — both numbers reported, physical treated as authoritative on disagreement (none observed)"
  - "Instrumentation is fully inert by default: STUDY_QUERY_COUNTER unset reproduces lib/prisma.ts's pre-existing construction path byte-for-byte"

requirements-completed: []

coverage:
  - id: D1
    description: "A single command (scripts/measure-study-roundtrips.mts) prints the measured physical round-trip count for a real getStudyCards() call against the seeded e2e test DB, non-zero, failing loudly if the counting Proxy isn't attached"
    requirement: "STUDY-01"
    verification:
      - kind: other
        ref: "npx tsx scripts/measure-study-roundtrips.mts (exit 0, `physical round trips: 10`, `prisma query events: 10`)"
        status: pass
    human_judgment: false
  - id: D2
    description: "STUDY_QUERY_COUNTER unset reproduces the exact pre-existing lib/prisma.ts construction path (no Proxy, no log option, no extra allocation on the production path)"
    verification:
      - kind: other
        ref: "grep -n 'new PrismaClient({ adapter })' lib/prisma.ts (matches default path); npm test (310/310 pass, unaffected by the branch)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-segment breakdown separates Phase A (Promise.allSettled batch) from Phase B (full-row card.findMany) so the Phase-B raw-SQL fork is decided from measured data"
    requirement: "STUDY-01"
    verification:
      - kind: other
        ref: "npx tsx scripts/measure-study-roundtrips.mts --probe-json (phase A physical: 6, phase B physical: 4, page lessons physical: 1, total physical: 11)"
        status: pass
    human_judgment: false
  - id: D4
    description: "json_group_array/json_object availability on the actual libSQL build (both local test DB and production Turso) is known before any raw SQL is written"
    verification:
      - kind: other
        ref: "npx tsx scripts/measure-study-roundtrips.mts --probe-json (local: available) + turso db shell korean-study \"SELECT json_group_array(json_object('a', 1)) as result;\" (production: available, [{\"a\":1}])"
        status: pass
    human_judgment: false
  - id: D5
    description: "32-BASELINE.md records the measured baseline, physical-vs-Prisma-event agreement, comparison against REQUIREMENTS.md's stated 4-5 figure, and a Phase B verdict (RAW SQL REQUIRED) that 32-03 reads as its branch condition"
    requirement: "STUDY-01"
    verification:
      - kind: other
        ref: ".planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md (## Phase B verdict heading present, RAW SQL REQUIRED literal present)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-08
status: complete
---

# Phase 32 Plan 01: Round-Trip Measurement Instrumentation Summary

**Built a permanent physical-round-trip counting harness and measured the real, unmodified `/study` baseline: 10 physical libSQL round trips for `getStudyCards()` alone (11 for a whole `/study` page load) — roughly double REQUIREMENTS.md's stated "4-5" — with Phase B's `include`-based query alone costing 4, confirming SQLite has no single-query relation-join strategy and settling the Phase-B verdict as RAW SQL REQUIRED for the later plans in this phase.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-08T16:52:04Z (approx., per STATE.md's `last_updated`)
- **Completed:** 2026-08-08T17:12:00Z
- **Tasks:** 2/2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Built `lib/query-counter.ts` — a permanent, reusable Proxy-based physical round-trip counter wrapping the `@libsql/client` instance *below* `@prisma/adapter-libsql`, the only point in the stack that observes ground-truth physical HTTP requests rather than logical Prisma operations.
- Wired an env-gated (`STUDY_QUERY_COUNTER=1`) instrumentation branch into `lib/prisma.ts` via a `PrismaLibSql` subclass overriding `createClient()` — the constructor itself has no pre-built-client option, so this is the earliest interceptable point. The default (flag-unset) path is byte-equivalent to before this phase.
- Discovered and fixed a real crash: naively proxying the `@libsql/client` instance breaks the local `file:` transport's native-addon-backed `Sqlite3Client`, which throws `TypeError: Receiver must be an instance of class Sqlite3Client` unless every intercepted method is explicitly rebound to the real target. Fixed before any measurement could run at all.
- Measured the actual, current, unmodified `/study` cost: **10 physical round trips** for `getStudyCards()` (Phase A: 6, Phase B: 4), **11** for a whole `/study` page load (+1 for `app/study/page.tsx`'s separate lessons query). This is roughly double REQUIREMENTS.md's stated "4-5" baseline — recorded as a contradiction, not smoothed over.
- Confirmed `json_group_array`/`json_object` are available and correctly shaped on both the local isolated test DB *and* live production Turso (verified directly via `turso db shell korean-study`), de-risking the raw-SQL Phase B rewrite the later plans in this phase will need.
- Recorded the Phase B verdict — **RAW SQL REQUIRED** — in `32-BASELINE.md`, the hard input `32-03-PLAN.md` Task 2 reads as its branch condition.

## Task Commits

1. **Task 1: End-to-end round-trip counting — one measured `/study` path** - `0de77e2` (feat)
2. **Task 2: Measure the real baseline, probe libSQL JSON aggregation, and record the Phase-B verdict** - `4d708a1` (feat)

_Note: this plan's tasks were `type="tracer"` (Task 1) and `type="auto"` (Task 2), not TDD — no separate test→feat→refactor commit sequence._

**Plan metadata:** committed separately by the orchestrator (this plan runs in a git worktree; STATE.md/ROADMAP.md updates are the orchestrator's responsibility per the wave protocol).

## Files Created/Modified

- `lib/query-counter.ts` (created) - Counting Proxy factory (`countingLibsqlClient`), reset/read accessors (`resetQueryCount`/`getQueryCounts`), and the Prisma-event sink (`notePrismaQueryEvent`); dev/test instrumentation only, no production behavior.
- `lib/prisma.ts` (modified) - Added the `STUDY_QUERY_COUNTER`-gated branch (subclassed `PrismaLibSql`, wired `log`/`$on('query')`); default construction path unchanged.
- `scripts/measure-study-roundtrips.mts` (created) - Runnable harness: env-first DB pin, per-segment breakdown (phase A / phase B / page lessons / total physical / prisma events), `--probe-json` JSON-aggregation smoke test.
- `.planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md` (created) - Measured baseline numbers, physical-vs-Prisma-event agreement, REQUIREMENTS.md comparison, JSON-aggregation verdicts (local + Turso), Phase B verdict, fixture-scale caveat.
- `tests/study-cards.test.ts` (modified) - Two `(c: unknown[])` type annotations fixing a pre-existing, unrelated TS7006 implicit-any error that blocked this task's required `tsc --noEmit` gate (see Deviations).

## Decisions Made

- **Interception point:** subclass `PrismaLibSql`, override `createClient()` — its constructor only accepts a config object, never a pre-built `@libsql/client` instance (verified against the installed `.d.ts`). This is the documented plan fallback for "if PrismaLibSql does not accept a pre-built client instance."
- **Bind every proxied method to `target`:** required for correctness on the local `file:` transport (native `Sqlite3Client` receiver-identity check), not just Turso's HTTP transport.
- **Per-segment breakdown via replicated query shapes in the measurement script**, not internal instrumentation of `lib/study-cards.ts` — this plan's `files_modified` scope deliberately excludes that file; Phase A + Phase B's replicated totals were cross-checked against Task 1's independent whole-pipeline measurement (6+4=10, exact match) to guard against drift.
- **`requirements-completed` left empty** in this SUMMARY (see Deviations/Issues below) — this plan measures and proves infrastructure only; the literal STUDY-01 target (≤2 round trips) is not met yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `TypeError: Receiver must be an instance of class Sqlite3Client` on the local `file:` transport**
- **Found during:** Task 1, first run of `scripts/measure-study-roundtrips.mts`
- **Issue:** The initial `countingLibsqlClient()` implementation used a bare `Reflect.get(target, prop, receiver)` in the Proxy `get` trap. Calling a returned method via `proxy.execute(...)` invokes it with `this = proxy`, not `this = target`. `@libsql/client`'s local-file `Sqlite3Client` (backed by a native addon) explicitly checks receiver identity and throws when `this` isn't the real instance.
- **Fix:** Every returned function value is now explicitly `.bind(target)`ed before being returned from the `get` trap, so `this` is always the real client object regardless of how it's invoked.
- **Files modified:** `lib/query-counter.ts`
- **Verification:** `npx tsx scripts/measure-study-roundtrips.mts` went from a hard crash to a clean `physical round trips: 10` / `prisma query events: 10` on the local isolated test DB.
- **Committed in:** `0de77e2` (part of Task 1's commit)

**2. [Rule 3 - Blocking issue] Pre-existing TS7006 implicit-any error blocking the task's required `tsc --noEmit` gate**
- **Found during:** Task 1, running the automated `<verify>` chain (`npx tsc --noEmit && npm run lint && ...`)
- **Issue:** `tests/study-cards.test.ts` (confirmed via `git diff` against this worktree's base commit to be byte-identical, i.e. genuinely pre-existing and unrelated to this task) had two `.find((c) => ...)` callbacks where `c`'s type couldn't be inferred, tripping `noImplicitAny`. This blocked the task's own required `tsc --noEmit` verification step, which is a genuine prerequisite for declaring Task 1 done.
- **Fix:** Added explicit `(c: unknown[])` parameter annotations at both call sites — no logic change, no test-behavior change.
- **Files modified:** `tests/study-cards.test.ts`
- **Verification:** `npx tsc --noEmit` went from 2 errors to a clean exit 0; `npm test` unaffected (310/310 pass before and after).
- **Committed in:** `0de77e2` (part of Task 1's commit)

**3. [Rule 3 - Blocking issue] Missing `node_modules`/generated Prisma client in this worktree**
- **Found during:** Task 1 precondition check (running `npx tsx e2e/run-global-setup.ts`)
- **Issue:** This git worktree had no `app/generated/prisma` directory (gitignored, per-worktree artifact) and no local `node_modules` of its own (resolved from the parent checkout via `npx`'s directory-walk, except for the generated Prisma client which is worktree-root-relative).
- **Fix:** Ran `npx prisma generate` before the precondition's `e2e/run-global-setup.ts`, per the standard Turso/Prisma workflow documented in `CLAUDE.md`. No code change — a one-time environment setup step.
- **Files modified:** none (generated output is gitignored)
- **Verification:** `e2e/run-global-setup.ts` then completed cleanly, seeding 8 cards (3 due, 3 mastered) as `e2e/fixture.ts` expects.
- **Committed in:** n/a (gitignored artifact, not tracked)

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 3)
**Impact on plan:** All three were necessary to get a genuinely correct, runnable measurement — none represent scope creep. The Sqlite3Client fix in particular is load-bearing: without it, the entire instrumentation approach would silently fail on local/dev `file:` databases (though it would still have worked against production's HTTP/Turso transport, masking a real bug until someone tried to run the harness locally).

## Issues Encountered

The initial per-segment measurement design (Task 2) considered calling `getStudyCards()` as a whole and trying to attribute physical round trips to Phase A vs. Phase B after the fact from timing/ordering — explicitly rejected per the plan's own instruction ("do not attempt to attribute retroactively from a single total"). Resolved by replicating each segment's exact query shape directly in the measurement script (with an explicit cross-check against Task 1's independently-measured whole-pipeline total, which matched exactly: 6+4=10).

## User Setup Required

None - no external service configuration required. (The `turso db shell korean-study` JSON-aggregation probe against production was run read-only during this session using the developer's existing, already-authenticated `turso` CLI — no new credentials or setup needed.)

## Next Phase Readiness

**Ready for 32-02/32-03:** `32-BASELINE.md`'s Phase B verdict (RAW SQL REQUIRED) is the data-backed branch condition `32-03-PLAN.md` Task 2 needs. The permanent harness (`scripts/measure-study-roundtrips.mts`) is reusable as-is to prove the eventual ≤2-round-trip claim once the cache + raw-SQL work lands — it does not need to be rebuilt or extended for that verification, just re-run.

**Not yet done (by design — later plans in this phase):** STUDY-01's literal ≤2-round-trip target is not met by this plan (measured 10-11, both phases still on the original `Promise.allSettled` + `include` code paths — completely unmodified from before this phase, as `<verification>` requires). STUDY-02 (confirmed non-duplicative) and STUDY-03 (cache + version-counter invalidation) are also not implemented by this plan — this plan is measurement/instrumentation only, per its own objective. `requirements-completed` is deliberately left empty in this SUMMARY's frontmatter for that reason; do not mark STUDY-01/02/03 complete in REQUIREMENTS.md based on this plan alone.

**No blockers.** `npx tsc --noEmit`, `npm run lint`, and `npm test` (310/310) are all clean on top of this plan's changes.

---
*Phase: 32-study-load-round-trip-collapse*
*Completed: 2026-08-08*

## Self-Check: PASSED

All created/modified files exist on disk; both task commit hashes (`0de77e2`, `4d708a1`) are present in git history.
