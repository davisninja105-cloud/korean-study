---
phase: 33-version-gated-freshness-backstop
plan: 02
subsystem: testing
tags: [playwright, e2e, freshness, cache-invalidation, non-vacuity]

# Dependency graph
requires:
  - phase: 33-version-gated-freshness-backstop
    provides: "bumpDataVersion()/getDataVersion() in lib/settings.ts and the version-gated FreshnessWatcher backstop (plan 33-01)"
provides:
  - "dataVersion bump inside the three freshness e2e mutators (flipOneReviewDueStateDirect, createMutationCardDirect, promoteOneReviewToMasteredDirect), so they open the version gate the same way POST /api/review and POST /api/sync do in production"
  - "bumpDataVersionOnly()/readDataVersion() public e2e helpers, dispatchable through e2e/run-mutate.ts's OPS map"
  - "A non-vacuity lock test in e2e/freshness-version-gate.spec.ts proving each freshness mutator moves dataVersion"
  - "A version-advancing call in freshness-fresh-paths.spec.ts's Upsert-not-replace extension, reopening the gate for its mocked no-cursor /api/cards interception"
affects: [34-local-first-cache, 35-offline-queue]

actuals:
  tokens: 1620
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A private, module-internal *Direct helper (bumpDataVersionDirect) called from every branch of several other *Direct mutators, so a single dynamically-imported side-effect call is reused without duplicating the import-hazard-safe dynamic-import pattern at each call site"

key-files:
  created: []
  modified:
    - e2e/helpers/mutate.ts
    - e2e/run-mutate.ts
    - e2e/freshness-version-gate.spec.ts
    - e2e/freshness-fresh-paths.spec.ts

key-decisions:
  - "bumpDataVersionDirect() is called inside EACH branch of the if/else in flipOneReviewDueStateDirect and promoteOneReviewToMasteredDirect (not once after the merged control flow), matching the plan's acceptance-criteria call-site count exactly and making the awk-scoped per-branch checks trivially satisfiable — functionally identical to a single post-conditional call, since every branch reaches it either way, but structurally makes 'every branch bumps' independently verifiable without reasoning about control-flow convergence."
  - "The Assumption A3 import-hazard fallback (an inline prisma.setting.upsert() using getTestPrisma()) was NOT needed — the dynamic import('../../lib/settings') inside bumpDataVersionDirect()'s function body worked on the first attempt, resolved empirically by running the real Task 1 verification command rather than assumed."
  - "promoteOneDueCardToProductionDirect and ensureAllSeededReviewsDueDirect were left deliberately unbumped, each with an inline comment recording the scoping decision (neither is ever used as a freshness spec's 'the server changed since the client rendered' trigger)."

patterns-established: []

requirements-completed: [VERS-01, VERS-02]

coverage:
  - id: D1
    description: "Each of the three freshness-spec mutators (flipOneReviewDueState, createMutationCard, promoteOneReviewToMastered) demonstrably moves the dataVersion counter"
    requirement: "VERS-01"
    verification:
      - kind: e2e
        ref: "e2e/freshness-version-gate.spec.ts — 'every freshness-spec mutator moves the dataVersion counter (non-vacuity lock)'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Upsert-not-replace extension in freshness-fresh-paths.spec.ts genuinely reaches its mocked no-cursor /api/cards interception (proves the upsert-by-id merge, not a trivially-passing no-op)"
    requirement: "VERS-02"
    verification:
      - kind: e2e
        ref: "e2e/freshness-fresh-paths.spec.ts — '/cards post-mutation-return stays fresh - regression net for Phase 26 (D-06 DB-level variant)', Upsert-not-replace extension section"
        status: pass
    human_judgment: false
  - id: D3
    description: "All four pre-existing freshness-*.spec.ts files pass unedited (except the one line added to freshness-fresh-paths.spec.ts) alongside the new gate spec, with no test silently disappearing or skipped"
    requirement: "VERS-01, VERS-02"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-version-gate.spec.ts e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-client-shell.spec.ts e2e/freshness-router-cache.spec.ts — 22/22 passing (19 pre-existing + 3 new)"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-08-08
status: complete
---

# Phase 33 Plan 02: Freshness Harness Truthfulness Under the Version Gate Summary

**The three e2e freshness mutators now bump `dataVersion` exactly like `POST /api/review`/`POST /api/sync` do, a new non-vacuity lock proves it deterministically, and the Upsert-not-replace section reopens the gate it needs — closing the Known Issue plan 33-01 explicitly deferred here.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2/2 completed
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

- `flipOneReviewDueStateDirect`, `createMutationCardDirect`, and `promoteOneReviewToMasteredDirect` in `e2e/helpers/mutate.ts` now call a shared private `bumpDataVersionDirect()` helper on every branch (including each function's `else` fallback), reproducing the `dataVersion` bump the real `POST /api/review`/`POST /api/sync` write paths perform in production — so every existing `e2e/freshness-*.spec.ts` spec that uses one of these three as its "the server changed" step correctly opens the version gate landed in plan 33-01, instead of silently passing vacuously with the gate closed.
- The dynamic `import('../../lib/settings')` inside `bumpDataVersionDirect()`'s function body worked on the first attempt — 33-RESEARCH.md's Assumption A3 (the unconfirmed `import.meta` hazard risk) resolved empirically as "no fallback needed," confirmed by running the real Task 1 verification command against a live dev-build Playwright server rather than assumed.
- Two new harness primitives, `bumpDataVersionOnlyDirect()`/`readDataVersionDirect()`, mirror the file's existing conventions exactly (`readStudyCacheVersionDirect`'s shape for the read; the `createForwardReferenceAndRelinkDirect` dynamic-import precedent for the write) and are dispatchable end-to-end through `e2e/run-mutate.ts`'s `OPS` map — confirmed live: `readDataVersion` printed a `MUTATE_RESULT:` line.
- `e2e/freshness-version-gate.spec.ts` gained a third test, the non-vacuity lock, proving all three freshness mutators move the counter deterministically (no reliance on a green suite alone as proof) — sitting alongside plan 33-01's two gate-proof tests so the file reads as one closed/open/non-vacuous contract.
- `e2e/freshness-fresh-paths.spec.ts`'s Upsert-not-replace extension gained a single `await bumpDataVersionOnly()` call immediately before its `simulateResume(page, true)` trigger, reopening the gate that was otherwise closed at that point in the flow (its only preceding DB mutation, `createMutationCard()`, happens before the client's last render) — genuinely re-exercising the mocked no-cursor `/api/cards` interception rather than passing trivially.
- Full combined freshness suite run: 22/22 passing (19 pre-existing tests across `freshness-client-shell.spec.ts`, `freshness-router-cache.spec.ts`, `freshness-fresh-paths.spec.ts`, `freshness-gate.spec.ts` + 3 new tests in `freshness-version-gate.spec.ts`) — matching the human-check requirement that no test silently disappeared.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the freshness mutators move the counter the way a real write would** - `be8d3a2` (feat)
2. **Task 2: Lock non-vacuity and reopen the gate for the Upsert-not-replace section** - `dcab683` (test)

## Files Created/Modified

- `e2e/helpers/mutate.ts` - Added private `bumpDataVersionDirect()` helper (dynamic import of `bumpDataVersion()` from `lib/settings.ts`, called from every branch of the three freshness mutators); added `bumpDataVersionOnlyDirect()`/`readDataVersionDirect()` exports plus their subprocess-delegating public wrappers `bumpDataVersionOnly()`/`readDataVersion()`; added scoping-decision comments to `promoteOneDueCardToProductionDirect` and `ensureAllSeededReviewsDueDirect` explaining why they stay unbumped
- `e2e/run-mutate.ts` - Registered `bumpDataVersionOnly`/`readDataVersion` as two new `OPS` dispatch entries
- `e2e/freshness-version-gate.spec.ts` - Added the non-vacuity lock test and its `flipOneReviewDueState`/`createMutationCard`/`promoteOneReviewToMastered`/`readDataVersion` imports
- `e2e/freshness-fresh-paths.spec.ts` - Added `bumpDataVersionOnly` import and a single call before the Upsert-not-replace section's `simulateResume(page, true)` trigger

## Decisions Made

- **Bump call placed inside EACH branch of the if/else** (not once after the merged control flow) in `flipOneReviewDueStateDirect` and `promoteOneReviewToMasteredDirect` — functionally identical to a single post-conditional call (every branch reaches it either way), but matches the plan's acceptance-criteria call-site count exactly (2+1+2 mutator call sites + 1 `bumpDataVersionOnlyDirect` call = 5, plus the declaration = 6, satisfying "at least 6") and makes "every branch bumps" independently verifiable via the per-function `awk` checks without reasoning about control-flow convergence.
- **No import-hazard fallback needed** — 33-RESEARCH.md's Assumption A3 (dynamic `import('../../lib/settings')` might throw `SyntaxError: Cannot use 'import.meta' outside a module` under `e2e/run-mutate.ts`) did not materialize; the dynamic import worked cleanly on the first Task 1 verification run, so the plan's documented inline-`prisma.setting.upsert()` fallback was never invoked.
- **Comment wording in freshness-fresh-paths.spec.ts avoids the literal acceptance-criteria assertion string** — the first draft of the explanatory comment quoted `` `expect(loadedAfter).toBe(loadedBefore)` `` verbatim, which made the plan's own `grep -c "expect(loadedAfter).toBe(loadedBefore)"` acceptance check report 2 instead of 1 (comment + real assertion). Reworded to describe the assertion without repeating its exact text, keeping the automated check's literal-count semantics meaningful.

## Deviations from Plan

None — plan executed exactly as written. The one A3-fallback contingency built into the plan's own action text was not triggered (see Decisions Made above), which is itself the plan's documented "record which path was taken" outcome, not a deviation.

## Issues Encountered

One transient failure was observed during full-suite verification and reproduced-clean on an immediate rerun: `e2e/freshness-router-cache.spec.ts`'s `/cards resume serves fresh data after boundary refresh (FRESH-05)` test failed once (`expect("Cards (8)").toBe("Cards (9)")`, a 5s poll timeout) then passed cleanly both in isolation and in a full-suite rerun immediately after. This file is untouched by this plan (`git diff --stat e2e/freshness-router-cache.spec.ts` confirms no edits) — this is the pre-existing Next.js 16.2.1 Suspense/Segment-Cache delivery flake documented in `33-01-SUMMARY.md`'s own Known Issues, not a regression introduced here.

Worktree environment note (same class of issue as 33-01-SUMMARY's deviation #3, not repeated as a deviation here since no files were modified to fix it): this worktree has no `node_modules/` or `app/generated/prisma/` of its own. Both were temporarily symlinked to the main repo's copies for the duration of verification (`npm run lint`, `npx playwright test`, `npm test`) and removed before this SUMMARY was written — confirmed via `git status --short` showing a clean tree with no untracked entries after removal.

## User Setup Required

None.

## Next Phase Readiness

- All four pre-existing `e2e/freshness-*.spec.ts` files plus the new `e2e/freshness-version-gate.spec.ts` (3 tests) pass together — 22/22, closing the Known Issue plan 33-01 explicitly deferred to this plan.
- `npm test` — 333/333 Vitest tests passing. `npm run lint` — 0 errors (1 pre-existing unrelated warning in `components/StudySession.tsx`).
- Phase 33 (version-gated-freshness-backstop) is now fully verified per ROADMAP Success Criterion 3 (all freshness specs pass together against the gated backstop).

---
*Phase: 33-version-gated-freshness-backstop*
*Completed: 2026-08-08*
