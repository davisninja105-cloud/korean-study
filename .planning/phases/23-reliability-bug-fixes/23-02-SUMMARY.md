---
phase: 23-reliability-bug-fixes
plan: 02
subsystem: api
tags: [prisma, carddependency, idempotency, sync, auto-relink, vitest, libsql, turso]

# Dependency graph
requires:
  - phase: 14
    provides: runSync() in lib/sync.ts (the per-lesson linking loop + SyncResult interface) and the normalizedFront card-key map pattern
  - phase: 16
    provides: resolveDependencyEdges() in lib/link-dependencies.ts — the single-source-of-truth component→edge resolution (IN-02)
provides:
  - "computeMissingEdges() pure resolver-diff in lib/link-dependencies.ts (RELIABILITY-03 pure-layer idempotency)"
  - "relinkAllDependencies() server-only orchestrator in lib/relink-dependencies.ts (batch-diff: 2 reads + ≤1 createMany)"
  - "runSync() auto-relink hook gated on failures.length === 0 && newLessons > 0 (RELIABILITY-02) — cron inherits for free"
  - "tests/link-dependencies.test.ts — 17-test pure idempotency-algebra suite"
  - "tests/relink-dependencies.test.ts — 3-test real-schema temp-SQLite double-run idempotency proof"
  - "scripts/relink-dependencies.mts thin manual-fallback wrapper (old .mjs deleted); local-resync final pass consolidated"
affects: [reliability, sync, knowledge-graph, cron, local-resync]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pure resolver-diff (computeMissingEdges) composes the existing single-source resolver (resolveDependencyEdges) — never reimplements resolution", "server-only relink orchestrator (2 reads + ≤1 createMany) bounded for the Vercel 60s budget", "auto-relink hook inside runSync so all three entry points (manual POST /api/sync, cron GET /api/cron/sync, local-resync) inherit the behavior with zero route changes", "non-fatal try/catch around the relink pass — relink failure never converts a clean sync into a failed one"]

key-files:
  created:
    - lib/relink-dependencies.ts
    - tests/link-dependencies.test.ts
    - tests/relink-dependencies.test.ts
    - scripts/relink-dependencies.mts
  modified:
    - lib/link-dependencies.ts
    - lib/sync.ts
    - scripts/local-resync.mts
    - CLAUDE.md

key-decisions:
  - "Single-source-of-truth consolidation: one resolution implementation remains — relinkAllDependencies → computeMissingEdges → resolveDependencyEdges. The old scripts/relink-dependencies.mjs is deleted because it hand-rolled its own normalizeFront copy AND built keyToId only from cards WHERE components IS NOT NULL (omitting leaf-prerequisite cards — the CR-02 bug shape). The local-resync.mts final pass (the third copy of the full-deck relink persistence loop) is consolidated onto the same helper (IN-02)."
  - "Auto-relink hook lives inside runSync in lib/sync.ts, gated on failures.length === 0 && newLessons > 0. Both app/api/sync/route.ts and app/api/cron/sync/route.ts call runSync, so both inherit the behavior with zero route changes — cron auto-relinks for free."
  - "Relink failure is non-fatal: the relinkAllDependencies() call is wrapped in try/catch; on catch, console.warn a prefixed message and leave failures/newLessons/newCards untouched. app/api/cron/sync/route.ts stamps lastAutoSyncedAt only when failed === 0, so polluting failed would falsely mark the sync stale; the next qualifying sync retries the relink naturally."
  - "Idempotency backstops at two layers: the pure computeMissingEdges diff subtracts existingEdges (so a second call against the same deck returns []), and @@unique([cardId, prerequisiteId]) backstops at the DB layer against read/write races — a conflicting createMany throws, caught non-fatal, retried next sync."
  - "computeMissingEdges builds its lookup from ALL cards including rows with components: null — a leaf-prerequisite card IS resolvable as another card's prerequisite (regression test locks the old script's WHERE-components-IS-NOT-NULL gap)."
  - "Batch-diff + single createMany keeps relinkAllDependencies to exactly 2 reads + at most 1 write regardless of deck size (~hundreds of cards per CONCERNS scaling notes), bounded for the Vercel 60s budget."

patterns-established:
  - "Pure resolver-diff pattern: a new pure function (computeMissingEdges) composes an existing single-source resolver (resolveDependencyEdges) rather than reimplementing resolution — honors the IN-02 mandate that resolution logic is never duplicated"
  - "Auto-relink-as-sync-hook: the relink pass fires inside runSync, not in the route, so every caller (manual tap, cron, local-resync) inherits the behavior with zero call-site changes"
  - "Non-fatal hook pattern: an optional post-processing pass wrapped in try/catch that enriches the result (relinkedEdges) on success and logs+continues on failure, never degrading the primary sync outcome"

requirements-completed: [RELIABILITY-02, RELIABILITY-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "computeMissingEdges pure resolver-diff delegates resolution to resolveDependencyEdges and is idempotent at the pure layer — a second call against the same deck with the first run's result returns [] (RELIABILITY-03 pure layer)"
    requirement: RELIABILITY-03
    verification:
      - kind: unit
        ref: "tests/link-dependencies.test.ts#idempotency algebra: second computeMissingEdges run returns empty array"
        status: pass
      - kind: unit
        ref: "tests/link-dependencies.test.ts#leaf-prerequisite card with components: null resolves as another card's prerequisite"
        status: pass
    human_judgment: false
  - id: D2
    description: "relinkAllDependencies server helper + runSync auto-relink hook: a sync completing with failed === 0 && newLessons > 0 relinks forward-reference edges across the WHOLE deck automatically (RELIABILITY-02); cron inherits with zero route changes"
    requirement: RELIABILITY-02
    verification:
      - kind: integration
        ref: "tests/relink-dependencies.test.ts#first run returns edgesCreated: 1 against seeded temp DB"
        status: pass
      - kind: unit
        ref: "lib/sync.ts contains failures.length === 0 && newLessons > 0 gating + try/catch (grep-verified)"
        status: pass
      - kind: unit
        ref: "npm run build exits 0 (type-checks SyncResult.relinkedEdges + new module)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real-DB double-run idempotency: a second consecutive relinkAllDependencies() returns edgesCreated: 0 with unchanged CardDependency.count() against the real schema with @@unique present (RELIABILITY-03 DB layer)"
    requirement: RELIABILITY-03
    verification:
      - kind: integration
        ref: "tests/relink-dependencies.test.ts#second run returns edgesCreated: 0 and cardDependency.count() unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "Script consolidation: exactly one resolution implementation remains; the old scripts/relink-dependencies.mjs is deleted (replaced by a thin .mts wrapper), and local-resync's final relink pass delegates to the shared helper"
    verification:
      - kind: unit
        ref: "grep -rn 'keyToId.get(normalizeFront' lib/ scripts/ matches only lib/link-dependencies.ts"
        status: pass
      - kind: unit
        ref: "test -f scripts/relink-dependencies.mts && ! test -f scripts/relink-dependencies.mjs"
        status: pass
      - kind: unit
        ref: "npm test && npm run lint exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 58 min
completed: 2026-07-10
status: complete
---

# Phase 23 Plan 02: Auto-Relink Forward-Reference Edges Summary

**Idempotent full-deck auto-relink inside runSync closes RELIABILITY-02/03: every clean sync with new lessons now resolves forward-reference CardDependency edges via a pure computeMissingEdges → resolveDependencyEdges chain, retiring the manual relink script and consolidating three duplicated relink loops onto one shared helper**

## Performance

- **Duration:** 58 min (spanned a cancelled-executor continuation; see Deviations)
- **Started:** 2026-07-10T18:11:26Z
- **Completed:** 2026-07-10T19:09:22Z
- **Tasks:** 3
- **Files modified:** 8 (4 created, 4 modified, 1 deleted)

## Accomplishments
- Added `computeMissingEdges(cards, existingEdges)` — a pure resolver-diff in `lib/link-dependencies.ts` that composes the existing `resolveDependencyEdges()` (no resolution logic of its own), builds its lookup from ALL cards (fixing the old script's leaf-prerequisite gap), and subtracts existing edges so a second call returns `[]` (RELIABILITY-03 pure-layer idempotency). Backed by a 17-test suite with realistic Hangul fixtures and an explicit idempotency-algebra assertion.
- Added `lib/relink-dependencies.ts` — a thin server-only orchestrator exporting `relinkAllDependencies()` (batch-diff: 2 reads + ≤1 createMany, bounded for the Vercel 60s budget) and `RelinkResult`. Wired into `runSync()` in `lib/sync.ts` behind a `failures.length === 0 && newLessons > 0` gate with a non-fatal try/catch, so both `/api/sync` and `/api/cron/sync` auto-relink with zero route changes (RELIABILITY-02). A 3-test real-schema temp-SQLite suite proves the double-run idempotency against the real `@@unique` index (RELIABILITY-03 DB layer).
- Consolidated the three duplicated full-deck relink persistence loops onto the shared helper: deleted `scripts/relink-dependencies.mjs` (its hand-rolled `normalizeFront` copy + `WHERE components IS NOT NULL` lookup were the CR-02 bug shape), replaced it with a thin `scripts/relink-dependencies.mts` manual-fallback wrapper, and rewrote `scripts/local-resync.mts`'s final pass to call `relinkAllDependencies()`. Exactly one resolution implementation remains (IN-02). Updated CLAUDE.md's Database + Scripts sections to reflect the auto-relink and the new wrapper.

## Task Commits

Each task was committed atomically (Tasks 1 & 2 are TDD RED → GREEN; Task 3 is a refactor):

1. **Task 1: Pure computeMissingEdges resolver-diff with idempotency-algebra tests**
   - `2051189` (test) — RED: 17 failing tests for computeMissingEdges (incl. resolveDependencyEdges contract lock + idempotency algebra + leaf-prerequisite case)
   - `2deeace` (feat) — GREEN: implement computeMissingEdges + DeckCardRow (pure, delegates to resolveDependencyEdges)
2. **Task 2: relinkAllDependencies server helper, runSync hook, and real-DB double-run idempotency test**
   - `63ed61e` (test) — RED: failing real-schema temp-SQLite idempotency test for relinkAllDependencies
   - `55b817f` (feat) — GREEN: relink helper + runSync auto-relink hook (RELIABILITY-02/03)
3. **Task 3: Consolidate manual relink script and local-resync final pass onto the shared helper; update CLAUDE.md**
   - `2a1fc32` (refactor) — delete .mjs, add thin .mts wrapper, consolidate local-resync final pass, update CLAUDE.md

**Plan metadata:** *(appended after tracking-file commit)*

## Files Created/Modified
- `lib/link-dependencies.ts` — added exported `DeckCardRow` interface and `computeMissingEdges()` pure resolver-diff (delegates to `resolveDependencyEdges`, no direct resolve loop); module header comment extended to name computeMissingEdges as the shared full-deck relink core. Stays pure/client-safe (only import is `./card-key`).
- `lib/relink-dependencies.ts` — new server-only module: `relinkAllDependencies()` (2 reads + ≤1 createMany) + `RelinkResult` interface; delegates resolution to `computeMissingEdges`; no `normalizeFront` call.
- `lib/sync.ts` — imported `relinkAllDependencies`; added `relinkedEdges?: number` to `SyncResult`; added the `failures.length === 0 && newLessens > 0`-gated try/catch hook after the per-lesson loop (logs `[sync] auto-relink:` on success, `[sync] auto-relink failed (non-fatal` on catch; never touches `failures`/`newLessons`).
- `tests/link-dependencies.test.ts` — new 17-test suite: resolveDependencyEdges contract lock, computeMissingEdges forward-reference resolution, leaf-prerequisite case, malformed-components survival, existing-edge subtraction, and explicit idempotency-algebra (second run returns `[]`).
- `tests/relink-dependencies.test.ts` — new 3-test real-schema temp-SQLite suite (mkdtemp + `prisma migrate diff` DDL + libSQL executeMultiple + env-before-dynamic-import pattern from `tests/review-route.test.ts`): first run returns `{cardsScanned:2, edgesCreated:1, totalEdges:1}`, second run returns `edgesCreated:0` with unchanged `cardDependency.count()`, helper never creates Card/Sentence/Lesson rows.
- `scripts/relink-dependencies.mts` — new thin manual-fallback wrapper (env-first dynamic-import preamble mirroring `local-resync.mts`); calls `relinkAllDependencies()`, prints summary, exits 0.
- `scripts/local-resync.mts` — final relink pass (~lines 211-239) replaced with a single `relinkAllDependencies()` call; per-lesson `resolveDependencyEdges` call earlier in the script is untouched.
- `CLAUDE.md` — Database section CardDependency bullet + Scripts section entry updated to document auto-relink inside runSync and the new `.mts` manual-fallback wrapper.
- `scripts/relink-dependencies.mjs` — **deleted** (superseded; its `normalizeFront` reimplementation + components-only keyToId were the CR-02 bug shape).

## Decisions Made
- **Single-source-of-truth consolidation:** One resolution implementation remains — `relinkAllDependencies` → `computeMissingEdges` → `resolveDependencyEdges`. The old `.mjs` is deleted because it reimplemented `normalizeFront` and built its keyToId only from cards with non-null components (omitting leaf prerequisites — the CR-02 bug). The local-resync final pass (the third copy of the relink loop) is consolidated onto the helper (IN-02).
- **Auto-relink inside runSync, not the route:** The hook lives in `lib/sync.ts` so both `/api/sync` and `/api/cron/sync` inherit the behavior with zero route changes — cron auto-relinks for free.
- **Non-fatal relink failure:** The hook wraps `relinkAllDependencies()` in try/catch; on catch it logs and leaves `failures`/`newLessons`/`newCards` untouched. `app/api/cron/sync/route.ts` stamps `lastAutoSyncedAt` only when `failed === 0`, so polluting `failed` would falsely mark the sync stale. The next qualifying sync retries the relink naturally.
- **Two-layer idempotency:** Pure `computeMissingEdges` subtracts existingEdges (second call returns `[]`); `@@unique([cardId, prerequisiteId])` backstops the DB layer against read/write races (a conflicting createMany throws → caught non-fatal → retried next sync).
- **Whole-deck lookup including null-components rows:** `computeMissingEdges` builds its Map from EVERY row's `normalizedFront` → id, so a leaf-prerequisite card (no components of its own) is resolvable as another card's prerequisite — fixing the old script's `WHERE components IS NOT NULL` gap.
- **Batch-diff bounded for the 60s budget:** Exactly 2 reads + at most 1 createMany regardless of deck size (~hundreds of cards), runs at most once per sync and only after the qualifying gate.

## Deviations from Plan

### Continuation after cancelled executor

- **Found during:** Task 3 (the final task)
- **Issue:** A prior executor was CANCELLED mid-flight after completing Tasks 1 and 2 (4 TDD commits: `2051189`, `2deeace`, `63ed61e`, `55b817f`) and making Task 3's code changes on disk but not committing them. The committed Tasks 1 & 2 work was verified sound against the plan's acceptance criteria (computeMissingEdges/DeckCardRow exports, relinkAllDependencies/RelinkResult exports, the `failures.length === 0 && newLessons > 0` gate, `relinkedEdges?` field, no duplicate resolve loop) and left untouched.
- **Fix:** This continuation pass verified the uncommitted Task 3 changes against the plan's Task 3 acceptance criteria (all 5 criteria passed on first check — `.mts` exists, `.mjs` deleted, `relinkAllDependencies` in both scripts, `relink-dependencies.mts` referenced twice in CLAUDE.md, per-lesson `resolveDependencyEdges` call untouched), ran the full verification suite (`npm test` 241 passing, `npm run lint` 0 errors, `npm run build` clean), and committed Task 3 atomically as `2a1fc32`.
- **Files modified:** none beyond the planned Task 3 set (the on-disk changes were already correct).
- **Verification:** all Task 3 acceptance criteria + plan-level verification pass; Self-Check PASSED.
- **Committed in:** `2a1fc32` (Task 3 commit)

---

**Total deviations:** 1 (continuation after a cancelled executor — no code deficiency found; the on-disk Task 3 work was already correct and verified, then committed).
**Impact on plan:** None — all 3 tasks are complete and verified; the 4 prior TDD commits are intact and the 5th commit closes the plan.

## Issues Encountered
None — the on-disk Task 3 changes left by the cancelled executor matched the plan's acceptance criteria exactly, requiring no fixes.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED Task 1 (`test(23-02):`) | `2051189` | ✓ Present — 17 tests failed for the right reason (computeMissingEdges not yet implemented) |
| GREEN Task 1 (`feat(23-02):`) | `2deeace` | ✓ Present after RED — all 17 tests pass |
| RED Task 2 (`test(23-02):`) | `63ed61e` | ✓ Present — real-schema idempotency test failed (relinkAllDependencies not yet implemented) |
| GREEN Task 2 (`feat(23-02):`) | `55b817f` | ✓ Present after RED — 3-test real-schema suite passes |
| REFACTOR (`refactor(23-02):`) | `2a1fc32` | ✓ Present (Task 3) — script consolidation, no behavior change to the relink logic; tests still pass |

## Verification Results

- `npm test -- tests/link-dependencies.test.ts` → exits 0, 17 passing tests ✓
- `npm test -- tests/relink-dependencies.test.ts` → exits 0, 3 passing tests ✓
- `npm test` (whole suite) → exits 0, 241 passing tests across 18 test files (221 baseline + 17 Task 1 + 3 Task 2) ✓
- `npm run lint` → exits 0, 0 errors (1 pre-existing warning in `components/StudySession.tsx`, unrelated to this plan — same as 23-01) ✓
- `npm run build` → exits 0 (type-checks `SyncResult.relinkedEdges` + new `lib/relink-dependencies.ts` module) ✓
- Source-chain assertion: `grep -rn "keyToId.get(normalizeFront" lib/ scripts/` matches only `lib/link-dependencies.ts` (single source of truth; no duplicate resolve loop) ✓
- Task 3 acceptance criteria: all 5 pass (`.mts` exists, `.mjs` deleted, `relinkAllDependencies` in both scripts, `relink-dependencies.mts` ×2 in CLAUDE.md, per-lesson `resolveDependencyEdges` untouched) ✓
- Reachability: the hook fires on every qualifying sync from all three entry points — Home pull-to-refresh + Settings SyncPanel (POST /api/sync) and daily cron (GET /api/cron/sync) — because it lives inside runSync ✓

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- RELIABILITY-02 and RELIABILITY-03 closed: forward-reference CardDependency edges now auto-relink inside runSync after every clean sync with new lessons, proven idempotent at both the pure layer and the real-schema DB layer.
- Phase 23 is now 2/2 plans complete — the milestone's final phase is done.
- v1.5 milestone (Phases 20–23) is fully complete: all 12 requirements satisfied. Ready for `/gsd-complete-milestone`.
- No blockers.

## Self-Check: PASSED

- FOUND: lib/link-dependencies.ts (modified — computeMissingEdges + DeckCardRow)
- FOUND: lib/relink-dependencies.ts (created)
- FOUND: lib/sync.ts (modified — auto-relink hook + relinkedEdges)
- FOUND: tests/link-dependencies.test.ts (created)
- FOUND: tests/relink-dependencies.test.ts (created)
- FOUND: scripts/relink-dependencies.mts (created)
- FOUND: scripts/local-resync.mts (modified)
- FOUND: CLAUDE.md (modified)
- NOT FOUND (expected deleted): scripts/relink-dependencies.mjs ✓
- FOUND: 2051189 (test commit — Task 1 RED)
- FOUND: 2deeace (feat commit — Task 1 GREEN)
- FOUND: 63ed61e (test commit — Task 2 RED)
- FOUND: 55b817f (feat commit — Task 2 GREEN)
- FOUND: 2a1fc32 (refactor commit — Task 3)

---
*Phase: 23-reliability-bug-fixes*
*Completed: 2026-07-10*
