---
phase: 16-components-filter-fix
plan: 01
subsystem: knowledge-graph
tags: [vitest, deck-lookup, pure-module, turso-diagnostic]

# Dependency graph
requires: []
provides:
  - "lib/filter-components.ts — pure filterComponents(rawComponents, deckNormalizedFronts) deck-lookup filter"
  - "tests/filter-components.test.ts — 7-case Vitest coverage locking the keep/drop contract"
  - "scripts/dry-run-filter.mjs — read-only per-Card.type drop-rate diagnostic against the live corpus"
affects: [16-02, 16-03, 16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure two-phase deck-lookup resolution (normalizeFront direct match, then splitParticle stem fallback) mirroring lib/known-words.ts"
    - "Plain .mjs diagnostic scripts re-derive TS lib logic inline (cannot import .ts modules) — mirrors scripts/relink-dependencies.mjs convention"

key-files:
  created:
    - lib/filter-components.ts
    - tests/filter-components.test.ts
    - scripts/dry-run-filter.mjs
  modified: []

key-decisions:
  - "filterComponents retains a components[] entry purely by deck-membership lookup (normalizeFront direct match or splitParticle stem fallback) — never by sentence-text containment. This is the GRAPH-03 core requirement: abstract grammar patterns like ~(으)면 must be retained when they exist as their own deck card."
  - "This filter answers only 'does this component resolve to SOME real card?' — it deliberately does not validate that the resolved card is the CORRECT prerequisite relationship. That is documented as GRAPH-01's scope (prompt tightening / Claude self-verification), tested explicitly via the '~(으)ㄴ 후에' real-but-possibly-unrelated case."
  - "dry-run-filter.mjs builds its deck-lookup Set from ALL cards (no WHERE clause) per RESEARCH.md Pitfall 1 — scoping the query to components IS NOT NULL would have under-populated the Set and inflated the apparent drop rate."

patterns-established:
  - "Pattern: pure lib/ deck-lookup filters mirror lib/known-words.ts's two-phase resolution (direct normalizeFront match, then splitParticle stem fallback) — reused verbatim for any future 'does X resolve to a real card' predicate."

requirements-completed: []  # NOT complete yet — Task 3 checkpoint is pending human review; requirements will be marked complete only once the checkpoint is approved and the plan fully closes.

coverage:
  - id: D1
    description: "filterComponents pure deck-lookup filter with full Vitest coverage (direct match, stem fallback, no-match, empty, grammar-pattern retention, real-but-unrelated documentation, order-preserving)"
    requirement: "GRAPH-03"
    verification:
      - kind: unit
        ref: "tests/filter-components.test.ts#filterComponents"
        status: pass
    human_judgment: false
  - id: D2
    description: "filterComponents is a pure module with zero Prisma/Anthropic/Node-builtin imports (GRAPH-04)"
    requirement: "GRAPH-04"
    verification:
      - kind: other
        ref: "grep -nE \"from '@?/?lib/prisma'|@anthropic-ai/sdk|from 'fs'|from 'crypto'\" lib/filter-components.ts (no matches)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/dry-run-filter.mjs read-only per-Card.type (grammar/vocabulary/phrase) drop-rate report against the live corpus, reviewed by a human before any write-path wiring"
    requirement: "GRAPH-05"
    verification: []
    human_judgment: true
    rationale: "Success Criterion 4 explicitly requires a HUMAN to run the dry-run script and judge whether the grammar-type drop rate is disproportionate before approving the filter for wiring into the sync write path — this is a judgment call about real corpus data, not something a unit test can assert. Checkpoint task 3 is PENDING at time of this SUMMARY; not yet approved."

# Metrics
duration: ~25min (through Task 2; Task 3 checkpoint pending)
completed: 2026-07-03
status: paused-at-checkpoint
---

# Phase 16 Plan 01: Components Filter Fix — Deck-Lookup Filter + Dry-Run Summary

**Pure `filterComponents()` deck-lookup filter (normalizeFront + splitParticle stem fallback, mirrors lib/known-words.ts) plus a read-only `dry-run-filter.mjs` corpus diagnostic — PAUSED at the mandatory human-verify checkpoint before any write-path wiring.**

## Performance

- **Duration:** ~25 min (Tasks 1–2)
- **Started:** 2026-07-03T21:35:44Z (per STATE.md)
- **Completed:** Tasks 1 and 2 complete; Task 3 (checkpoint) reached and PAUSED — plan not yet closed
- **Tasks:** 2 of 3 complete (checkpoint task intentionally not executed by the agent)
- **Files modified:** 3 created

## Accomplishments
- `lib/filter-components.ts` — pure, unit-tested deck-lookup filter (`filterComponents(rawComponents, deckNormalizedFronts): string[]`) that is the single source of truth for "does this components[] entry resolve to a real deck card?"
- `tests/filter-components.test.ts` — 7 passing Vitest cases covering direct match, stem fallback, no-match, empty input, abstract-grammar-pattern retention (the GRAPH-03 core proof), the real-but-possibly-unrelated documentation case, and order preservation
- `scripts/dry-run-filter.mjs` — read-only Turso diagnostic that reports per-`Card.type` (grammar/vocabulary/phrase) drop-rate counts the filter would produce against the live corpus, with zero writes
- Reached the mandatory Success-Criterion-4 human-verify checkpoint and STOPPED as instructed — did not run the script or approve on the user's behalf

## Task Commits

Each task was committed atomically (TDD: test → feat for Task 1):

1. **Task 1 (RED): add failing tests for filterComponents** - `45a1eb3` (test)
2. **Task 1 (GREEN): implement filterComponents deck-lookup filter** - `d62c64b` (feat)
3. **Task 2: add read-only dry-run-filter diagnostic script** - `fec42f5` (feat)
4. **Task 3: checkpoint:human-verify** — NOT executed; plan paused here awaiting human review of the dry-run report

**Plan metadata:** pending — final metadata commit deferred until checkpoint resolves and plan closes.

## Files Created/Modified
- `lib/filter-components.ts` - Pure deck-lookup filter (direct normalizeFront match, then splitParticle stem fallback)
- `tests/filter-components.test.ts` - 7-case Vitest suite locking the keep/drop contract
- `scripts/dry-run-filter.mjs` - Read-only per-Card.type drop-rate diagnostic against the live Turso corpus

## Decisions Made
- Retention mechanism is deck-lookup (normalizeFront / splitParticle stem match against the full deck Set), never literal sentence-text containment — confirmed by the dedicated grammar-pattern test case (GRAPH-03).
- This filter's scope is intentionally narrow: "resolves to some real card" only, not "is the correct prerequisite relationship" — documented in both the module JSDoc and a dedicated test case, so GRAPH-01 (prompt-level correctness) is not conflated with this data-integrity control.
- `dry-run-filter.mjs` queries `Card` with no `WHERE` clause when building the deck Set, per RESEARCH.md Pitfall 1 — every card counts toward "is this a real card," not just cards that themselves have a `components` value.

## Deviations from Plan

None - plan executed exactly as written through Task 2. Task 3 (checkpoint) was reached and intentionally NOT auto-approved per explicit run instructions — this is expected checkpoint behavior, not a deviation.

## Issues Encountered

None. Both `npm test -- tests/filter-components.test.ts` and `npm run lint` are clean (the one pre-existing `react-hooks/exhaustive-deps` warning in `components/StudySession.tsx` is unrelated to this plan's files and out of scope).

## User Setup Required

None - no external service configuration required. The checkpoint requires the human to **run** `node scripts/dry-run-filter.mjs` locally (it needs `DATABASE_URL`/`DATABASE_AUTH_TOKEN` from `.env`/`.env.local`, already configured per project setup) and review the printed report — this is the checkpoint's verification step, not new setup.

## Next Phase Readiness

**BLOCKED on checkpoint approval.** Plan 16-01's Task 3 is a `gate="blocking"` `checkpoint:human-verify`:
1. Run `node scripts/dry-run-filter.mjs`.
2. Review the per-type report — confirm the grammar-type drop rate is not disproportionately higher than vocabulary (RESEARCH.md Pitfall 4 warning sign).
3. Spot-check a few dropped entries for plausibility (should look like fabrications, not real lemmas).
4. Approve (recording the headline numbers as the baseline plan 16-04 will compare against) or flag an anomaly for filter-logic review.

Once approved, this plan's remaining bookkeeping (final metadata commit, STATE.md/ROADMAP.md updates marking the plan fully complete, requirements-completed) will be finished by the resuming executor. Plan 16-03 (write-path wiring) is gated on this approval and must not proceed until it lands.

---
*Phase: 16-components-filter-fix*
*Completed: PENDING (paused at checkpoint) — Tasks 1–2 completed 2026-07-03*
