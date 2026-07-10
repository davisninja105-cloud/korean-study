---
phase: 23-reliability-bug-fixes
verified: 2026-07-10T19:33:03Z
status: passed
score: 7/8 must-haves verified
behavior_unverified: 1 # truths present + wired but behavior not exercised by a test
overrides_applied: 0
behavior_unverified_items:

  - truth: "A relink failure never converts a clean sync into a failed one (failed/failures untouched); syncs with failures or zero new lessons skip the relink entirely"
    test: "Force relinkAllDependencies() to throw inside runSync after the per-lesson pass completes with failures.length === 0 && newLessons > 0 (mock the import or inject a rejecting stub). Inspect the returned SyncResult."
    expected: "SyncResult.failed === 0, failures absent/empty (relink failure does not pollute the failed count); a [sync] auto-relink failed console.warn is emitted; relinkedEdges is absent."
    why_human: "No test exercises the runSync catch path (the relink-failure branch). The catch block at lib/sync.ts:338-345 is provably non-mutating by inspection (only console.warn + a local relinkMsg binding; no assignment to failures/newLessons/newCards/failed), so the invariant holds by construction — but a presence/wiring check cannot prove the cleanup invariant holds at runtime on that exact path."
human_verification:

  - test: "Verify the relink-failure-non-fatal invariant in runSync. Either (a) by code inspection — confirm the catch block at lib/sync.ts:338-345 contains no assignment to failures/newLessons/newCards/failed (only console.warn), OR (b) by adding a test that stubs relinkAllDependencies to reject and asserts runSync returns failed: 0 with no failures entry."
    expected: "The sync's failed count stays 0 when the relink pass throws; the catch logs [sync] auto-relink failed (non-fatal...) and leaves all sync accounting untouched."
    why_human: "The invariant is a cancellation/cleanup guarantee on the runSync error path. The helper (relinkAllDependencies) is test-proven, and the gate + call are statically wired, but the runSync catch branch is not exercised by any existing test (no test imports/calls runSync). Grep cannot see whether the catch leaks state — though inspection shows it cannot."
---

# Phase 23: Reliability Bug Fixes Verification Report

**Phase Goal:** Two known reliability gaps from CONCERNS.md are closed — silent known-lemmas degradation becomes observable, and forward-reference dependency edges relink automatically after a clean sync, retiring the manual relink-dependencies.mjs step.
**Verified:** 2026-07-10T19:33:03Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Must-haves are merged from the ROADMAP success criteria (the contract) and the PLAN frontmatter truths (plan-specific detail). Roadmap SCs are never subtracted; plan truths add detail.

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | (SC1) When the known-lemmas query rejects, a `[study-cards]`-prefixed console.error fires with the rejection reason BEFORE the code degrades to an empty Set | ✓ VERIFIED | lib/study-cards.ts:80-85 — `if (knownRowsResult.status === 'rejected') { console.error('[study-cards] known-lemmas query failed; ...', knownRowsResult.reason) }`, positioned before the empty-Set fallback at lines 108-112. Behavioral test `tests/study-cards.test.ts` test 1 passes: asserts the first arg starts with `[study-cards]` and the 2nd arg === rejection reason. |
| 2 | (SC1) A known-lemmas failure still returns study cards — session loads with unknownCount degraded (non-fatal contract preserved) | ✓ VERIFIED | lib/study-cards.ts:108-112 — empty-Set fallback ternary `knownRowsResult.status === 'fulfilled' ? ... : []` is byte-for-byte unchanged; cards still flow through selectSessionCards/sequenceCards and return with numeric unknownCount. Test 1 asserts `cards.length === 1` and every sentence `unknownCount` is a number ≥ 0. |
| 3 | (SC1) A pool-query failure still throws Error('Database error') so the route 500s — existing contract unchanged | ✓ VERIFIED | lib/study-cards.ts:67-69 — `if (poolResult.status === 'rejected') { throw new Error('Database error') }` unmodified. Test 2 asserts `rejects.toThrow('Database error')`. |
| 4 | (SC2) A sync ending with `failed === 0 && newLessons > 0` automatically creates forward-reference CardDependency edges, replacing the manual relink-dependencies.mjs invocation | ✓ VERIFIED | lib/sync.ts:331 `if (failures.length === 0 && newLessons > 0)` gate → line 333 `await relinkAllDependencies()` → helper proven by `tests/relink-dependencies.test.ts` test 1 (seeds A→B forward ref, returns edgesCreated:1). Manual `scripts/relink-dependencies.mjs` is DELETED; thin `.mts` fallback wrapper remains. Gate + call + helper all wired; helper behavior test-proven. |
| 5 | (SC3) The auto-relink pass is idempotent — a second run creates zero new edges with no duplicate (cardId, prerequisiteId) pairs | ✓ VERIFIED | Pure layer: `computeMissingEdges` subtracts existingEdges (lib/link-dependencies.ts:145-151); `tests/link-dependencies.test.ts` idempotency-algebra test asserts `computeMissingEdges(cards, firstRun) === []` (passes). DB layer: `tests/relink-dependencies.test.ts` test 2 asserts 2nd `relinkAllDependencies()` returns edgesCreated:0 with unchanged `cardDependency.count() === 1` against the real `@@unique([cardId, prerequisiteId])` index (passes). |
| 6 | (Plan 02) A relink failure never converts a clean sync into a failed one (failed/failures untouched); syncs with failures or zero new lessons skip the relink entirely | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Skip clause VERIFIED by gate `if (failures.length === 0 && newLessons > 0)` (lib/sync.ts:331) — it is the only path to the relink call. Non-fatal clause: the catch block at lib/sync.ts:338-345 is provably non-mutating (only `console.warn` + local `relinkMsg`; no assignment to failures/newLessons/newCards/failed). However NO test exercises the runSync catch path — `runSync` is imported by zero test files; the relink-failure branch is unexercised. Routed to human verification. |
| 7 | (Plan 02) Cron syncs inherit auto-relink with zero changes to app/api/cron/sync/route.ts, because the hook lives inside runSync | ✓ VERIFIED | app/api/cron/sync/route.ts:2 imports `runSync`, line 23 calls `await runSync(documentId)`. The hook lives inside runSync (lib/sync.ts:331-346), not the route. `git log -- app/api/cron/sync/route.ts` last commit is `d32b80e` (Phase 19) — zero diff in Phase 23. |
| 8 | (Plan 02) Exactly one component-resolution implementation remains — resolveDependencyEdges; computeMissingEdges composes it; server helper, manual script, and local-resync's final pass all delegate to the shared chain | ✓ VERIFIED | `grep -rn "keyToId.get(normalizeFront" lib/ scripts/` matches ONLY lib/link-dependencies.ts (lines 8, 76) — the single resolve loop. relinkAllDependencies calls computeMissingEdges (lib/relink-dependencies.ts:53); computeMissingEdges calls resolveDependencyEdges (lib/link-dependencies.ts:141); scripts/relink-dependencies.mts:29 and scripts/local-resync.mts:216 both delegate to relinkAllDependencies. local-resync's per-lesson resolveDependencyEdges call (line 194) is untouched. |

**Score:** 7/8 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/study-cards.ts` | logging in the knownRowsResult rejected branch | ✓ VERIFIED | Lines 80-85: conditional on `knownRowsResult.status === 'rejected'` → `console.error('[study-cards] ...', knownRowsResult.reason)`, placed after pool-rejection throw (67-69) and before empty-pool early return (89). 145 lines, substantive. |
| `tests/study-cards.test.ts` | regression tests locking all three truths | ✓ VERIFIED | 173 lines, 3 tests: (1) log + cards on known-lemmas rejection, (2) pool rejection throws 'Database error', (3) no log on happy path. All pass. |
| `lib/link-dependencies.ts` | computeMissingEdges() + DeckCardRow interface (pure, no Prisma) | ✓ VERIFIED | Exports `computeMissingEdges` (line 111) and `DeckCardRow` (line 48). Only import is `./card-key` (line 31) — stays pure/client-safe. Delegates to `resolveDependencyEdges` (line 141); no own resolve loop. 152 lines. |
| `lib/relink-dependencies.ts` | relinkAllDependencies() + RelinkResult (server-only, thin Prisma orchestrator) | ✓ VERIFIED | 67 lines. Exports `relinkAllDependencies` (line 45) + `RelinkResult` (line 19). 2 reads (card.findMany + cardDependency.findMany) + ≤1 createMany. Calls `computeMissingEdges` (line 53); no `normalizeFront` call (grep count 0). |
| `lib/sync.ts` | qualifying-sync hook + optional SyncResult.relinkedEdges field | ✓ VERIFIED | Import `relinkAllDependencies` (line 11). `relinkedEdges?: number` on SyncResult (line 32). Gate + try/catch hook (lines 330-346). Conditional spread into return (line 355). 358 lines. |
| `tests/link-dependencies.test.ts` | pure resolution + idempotency-algebra tests | ✓ VERIFIED | 224 lines, 17 tests (resolveDependencyEdges contract lock + computeMissingEdges forward-ref/leaf-prerequisite/malformed/subtraction + explicit idempotency algebra). All pass. |
| `tests/relink-dependencies.test.ts` | real-schema temp-SQLite double-run idempotency proof | ✓ VERIFIED | 139 lines, 3 tests. Uses mkdtemp + `npx prisma migrate diff` DDL + libsql executeMultiple + env-before-dynamic-import. Asserts first run edgesCreated:1, second run edgesCreated:0 with unchanged count, no Card/Sentence/Lesson creation. All pass. |
| `scripts/relink-dependencies.mts` | thin manual-fallback wrapper (.mjs deleted) | ✓ VERIFIED | 41 lines. Env-first dotenv preamble + `await import('../lib/relink-dependencies.js')` + calls `relinkAllDependencies()`. `test -f scripts/relink-dependencies.mjs` → DELETED; `test -f scripts/relink-dependencies.mts` → EXISTS. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| lib/study-cards.ts knownRowsResult rejected check | console.error('[study-cards] ...') | conditional `if (knownRowsResult.status === 'rejected')` at line 80 → console.error at 81-84 | ✓ WIRED | Log added; empty-Set fallback at 108-112 untouched (byte-for-byte). |
| lib/sync.ts runSync | relinkAllDependencies() | import line 11; gate `failures.length === 0 && newLessons > 0` line 331; call line 333 | ✓ WIRED | Gating expression present (grep count 1); call inside try/catch. |
| relinkAllDependencies | computeMissingEdges | lib/relink-dependencies.ts:53 calls computeMissingEdges(cards, existingEdges) | ✓ WIRED | import line 17 + call line 53 (grep count 5 in file). |
| computeMissingEdges | resolveDependencyEdges | lib/link-dependencies.ts:141 calls resolveDependencyEdges(keyToId, targets) | ✓ WIRED | Single resolve loop (grep `keyToId.get(normalizeFront` matches only this file). |
| @@unique([cardId, prerequisiteId]) | prisma/schema.prisma | schema line 132 | ✓ WIRED | DB-layer idempotency backstop present; exercised by the real-schema test. |
| scripts/local-resync.mts final pass | relinkAllDependencies | dynamic import line 216 + call line 217 | ✓ WIRED | Per-lesson resolveDependencyEdges call (line 194) untouched — confirmed. |
| app/api/cron/sync/route.ts | runSync | import line 2; call line 23 | ✓ WIRED | Hook lives inside runSync; route unchanged in Phase 23 (last commit d32b80e = Phase 19). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| lib/relink-dependencies.ts | `cards` / `existingEdges` / `missing` | prisma.card.findMany (line 46) + prisma.cardDependency.findMany (line 49) + computeMissingEdges (line 53) | Yes — real DB queries, no static fallback | ✓ FLOWING |
| lib/sync.ts | `relinkedEdges` | relinkResult.edgesCreated from relinkAllDependencies() (line 337) | Yes — computed from real deck scan | ✓ FLOWING |
| lib/study-cards.ts | `knownLemmas` | knownRowsResult.value.map (line 110) on fulfilled; `[]` on rejected (line 111) | Yes — real query on happy path; documented empty fallback on failure (intended degradation) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Known-lemmas rejection logs [study-cards] prefix + returns cards + pool-rejection throws | `npx vitest run tests/study-cards.test.ts` | 3 passed | ✓ PASS |
| computeMissingEdges idempotency algebra + leaf-prerequisite + forward-ref + malformed-JSON | `npx vitest run tests/link-dependencies.test.ts` | 17 passed | ✓ PASS |
| relinkAllDependencies double-run idempotency against real @@unique schema | `npx vitest run tests/relink-dependencies.test.ts` | 3 passed (1.13s, real temp-SQLite DDL) | ✓ PASS |

### Probe Execution

No probes declared in this phase's PLAN/SUMMARY. No `scripts/*/tests/probe-*.sh` exist. Step 7c: SKIPPED (no probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RELIABILITY-01 | 23-01 | `lib/study-cards.ts` logs when the known-lemmas query fails and degrades to an empty Set, so the silent ranking-signal degradation becomes visible | ✓ SATISFIED | lib/study-cards.ts:80-85 + tests/study-cards.test.ts (3 tests pass). Truths 1-3 verified. |
| RELIABILITY-02 | 23-02 | Forward-reference CardDependency edges are automatically relinked when a sync completes with `failed === 0 && newLessons > 0`, replacing the manual relink-dependencies.mjs invocation | ✓ SATISFIED | lib/sync.ts:331-346 hook + lib/relink-dependencies.ts helper + scripts/relink-dependencies.mjs deleted. Truths 4, 7, 8 verified. |
| RELIABILITY-03 | 23-02 | The auto-relink pass is idempotent — safe to run after every qualifying sync without creating duplicate or incorrect edges | ✓ SATISFIED | Pure layer (tests/link-dependencies.test.ts idempotency algebra) + DB layer (tests/relink-dependencies.test.ts double-run against real @@unique). Truth 5 verified. |

**Orphaned requirements:** None. REQUIREMENTS.md traceability maps exactly RELIABILITY-01/02/03 to Phase 23; all three are claimed by the plans (23-01 claims RELIABILITY-01; 23-02 claims RELIABILITY-02, RELIABILITY-03).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | — | — | No TBD/FIXME/XXX/PLACEHOLDER/"not yet implemented" markers in any modified file. Scan clean. |

### Human Verification Required

### 1. Relink-failure non-fatal invariant in runSync

**Test:** Verify the relink-failure-non-fatal invariant. Either (a) by code inspection — confirm the catch block at lib/sync.ts:338-345 contains no assignment to `failures`/`newLessons`/`newCards`/`failed` (only `console.warn` + a local `relinkMsg` binding), OR (b) by adding a test that stubs `relinkAllDependencies` to reject and asserts `runSync` returns `failed: 0` with no `failures` entry.
**Expected:** The sync's `failed` count stays 0 when the relink pass throws; the catch logs `[sync] auto-relink failed (non-fatal, will retry next qualifying sync):` and leaves all sync accounting untouched; `relinkedEdges` is absent from the result.
**Why human:** The invariant is a cancellation/cleanup guarantee on the runSync error path. The helper (`relinkAllDependencies`) is test-proven, and the gate + call are statically wired, but the runSync catch branch is not exercised by any existing test (no test file imports or calls `runSync`). Grep/presence cannot prove the catch does not leak state — though inspection shows it cannot (the block has zero state-mutating statements).

### Gaps Summary

No gaps block goal achievement. All three roadmap success criteria are met with test-proven behavior:

- **SC1 (known-lemmas observability):** The `[study-cards]`-prefixed log fires on the rejected branch before the unchanged empty-Set fallback; the pool-failure-throws contract is locked by a regression test. Fully verified.
- **SC2 (auto-relink):** Every clean sync with new lessons now relinks forward-reference edges via the `runSync` → `relinkAllDependencies` hook; the manual `.mjs` script is deleted (thin `.mts` fallback remains); cron inherits for free with zero route changes. Fully verified.
- **SC3 (idempotency):** Proven at the pure layer (computeMissingEdges subtracts existing edges → second run returns `[]`) AND at the real-schema DB layer (second `relinkAllDependencies` returns edgesCreated:0 with unchanged row count against the real `@@unique` index). Fully verified.

The single human-verification item (Truth 6 — relink-failure non-fatal invariant) is a cleanup guarantee on the runSync error path that no test exercises. The catch block is provably non-mutating by inspection, so the risk is low, but per goal-backward verification a cleanup invariant requires behavioral evidence or human confirmation rather than presence alone. All 8 artifacts exist, are substantive, wired, and have real data flowing; all 7 key links are wired; all 23 behavioral tests pass; no anti-patterns found.

---

_Verified: 2026-07-10T19:33:03Z_
_Verifier: the agent (gsd-verifier)_
