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
  - "Human-approved corpus drop-rate baseline (grammar 8.0%, vocabulary 24.9%, phrase 21.5%, whole-corpus 22.5%) for plan 16-04 to compare retroactive-cleanup counts against"
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
  - "Human-approved drop-rate baseline against the live corpus (2026-07-03): grammar 27/337 dropped (8.0%), vocabulary 539/2169 dropped (24.9%), phrase 53/246 dropped (21.5%), whole-corpus 619/2752 dropped (22.5%). Grammar's drop rate sitting well below vocabulary/phrase is the healthy direction — no sign of RESEARCH.md Pitfall 4 (filter gutting grammar-pattern edges). A follow-up read-only spot-check of the dropped strings showed they are overwhelmingly bare particles/function words never taught as their own cards (을/를, 이/가, 은/는, 에서, 안/번/더/한테/도/저/시), with a smaller tail of real content words lacking a card yet (모르다, 없다, 어머니, 한국, 미국, 사다, 노래, 이야기하다, 없이) — no anomaly. User approved with \"sounds good, approved\"."

patterns-established:
  - "Pattern: pure lib/ deck-lookup filters mirror lib/known-words.ts's two-phase resolution (direct normalizeFront match, then splitParticle stem fallback) — reused verbatim for any future 'does X resolve to a real card' predicate."

requirements-completed: [GRAPH-03, GRAPH-04, GRAPH-05]

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
    description: "scripts/dry-run-filter.mjs read-only per-Card.type (grammar/vocabulary/phrase) drop-rate report against the live corpus, reviewed and approved by a human before any write-path wiring"
    requirement: "GRAPH-05"
    verification:
      - kind: manual
        ref: "Orchestrator ran `node scripts/dry-run-filter.mjs` against the live Turso corpus; user reviewed the grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5% report and responded \"sounds good, approved\""
        status: pass
    human_judgment: true
    rationale: "Success Criterion 4 required a HUMAN to run the dry-run script and judge whether the grammar-type drop rate was disproportionate before approving the filter for wiring into the sync write path. Reviewed and APPROVED — grammar's 8.0% drop rate sits well below vocabulary (24.9%) and phrase (21.5%), the healthy direction; no Pitfall 4 anomaly."

# Metrics
duration: ~35min
completed: 2026-07-03
status: complete
---

# Phase 16 Plan 01: Components Filter Fix — Deck-Lookup Filter + Dry-Run Summary

**Pure `filterComponents()` deck-lookup filter (normalizeFront + splitParticle stem fallback, mirrors lib/known-words.ts) plus a read-only `dry-run-filter.mjs` corpus diagnostic — human-reviewed and APPROVED against the live corpus (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5% drop rate), unblocking the downstream wiring plan.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-03T21:35:44Z (per STATE.md)
- **Completed:** 2026-07-03 — all 3 tasks complete, checkpoint approved
- **Tasks:** 3 of 3 complete
- **Files modified:** 3 created

## Accomplishments
- `lib/filter-components.ts` — pure, unit-tested deck-lookup filter (`filterComponents(rawComponents, deckNormalizedFronts): string[]`) that is the single source of truth for "does this components[] entry resolve to a real deck card?"
- `tests/filter-components.test.ts` — 7 passing Vitest cases covering direct match, stem fallback, no-match, empty input, abstract-grammar-pattern retention (the GRAPH-03 core proof), the real-but-possibly-unrelated documentation case, and order preservation
- `scripts/dry-run-filter.mjs` — read-only Turso diagnostic that reports per-`Card.type` (grammar/vocabulary/phrase) drop-rate counts the filter would produce against the live corpus, with zero writes
- Reached the mandatory Success-Criterion-4 human-verify checkpoint, ran the dry-run script against the live corpus, and got explicit human approval of the drop-rate baseline before unblocking plan 16-03's write-path wiring

## Task Commits

Each task was committed atomically (TDD: test → feat for Task 1):

1. **Task 1 (RED): add failing tests for filterComponents** - `45a1eb3` (test)
2. **Task 1 (GREEN): implement filterComponents deck-lookup filter** - `d62c64b` (feat)
3. **Task 2: add read-only dry-run-filter diagnostic script** - `fec42f5` (feat)
4. **Task 3 (checkpoint:human-verify): APPROVED** — `node scripts/dry-run-filter.mjs` run against the live corpus; user reviewed and responded "sounds good, approved"

## Files Created/Modified
- `lib/filter-components.ts` - Pure deck-lookup filter (direct normalizeFront match, then splitParticle stem fallback)
- `tests/filter-components.test.ts` - 7-case Vitest suite locking the keep/drop contract
- `scripts/dry-run-filter.mjs` - Read-only per-Card.type drop-rate diagnostic against the live Turso corpus

## Corpus Drop-Rate Baseline (Approved)

This is the human-approved baseline plan 16-04's retroactive cleanup will compare its counts against:

| Card type | Dropped / Total | Rate |
|-----------|------------------|------|
| grammar | 27 / 337 | 8.0% |
| vocabulary | 539 / 2169 | 24.9% |
| phrase | 53 / 246 | 21.5% |
| **whole corpus** | **619 / 2752** | **22.5%** |

Grammar's drop rate (8.0%) sits well below vocabulary/phrase — the healthy direction, confirming the filter does not disproportionately gut grammar-pattern edges (RESEARCH.md Pitfall 4 risk did not materialize).

A follow-up read-only inspection (ad-hoc, not committed) of the dropped strings showed they are overwhelmingly bare particles/function words never taught as their own cards (을/를 140x, 이/가 74x, 은/는 28x, 에서 19x, plus 안/번/더/한테/도/저/시), with a smaller tail of real content words that simply don't have a card yet (모르다, 없다, 어머니, 한국, 미국, 사다, 노래, 이야기하다, 없이). This matches expectations — no anomaly.

## Decisions Made
- Retention mechanism is deck-lookup (normalizeFront / splitParticle stem match against the full deck Set), never literal sentence-text containment — confirmed by the dedicated grammar-pattern test case (GRAPH-03).
- This filter's scope is intentionally narrow: "resolves to some real card" only, not "is the correct prerequisite relationship" — documented in both the module JSDoc and a dedicated test case, so GRAPH-01 (prompt-level correctness) is not conflated with this data-integrity control.
- `dry-run-filter.mjs` queries `Card` with no `WHERE` clause when building the deck Set, per RESEARCH.md Pitfall 1 — every card counts toward "is this a real card," not just cards that themselves have a `components` value.
- Human approved the drop-rate baseline (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%) — plan 16-03's write-path wiring is now unblocked.

## Deviations from Plan

None - plan executed exactly as written. Task 3's checkpoint was reached, the dry-run script was run and reviewed by the orchestrator/user in a separate session turn (not fabricated by the executing agent), and approval was received before this plan closed.

## Issues Encountered

None. Both `npm test -- tests/filter-components.test.ts` and `npm run lint` are clean (the one pre-existing `react-hooks/exhaustive-deps` warning in `components/StudySession.tsx` is unrelated to this plan's files and out of scope).

## User Setup Required

None - no external service configuration required. The checkpoint required the human to run `node scripts/dry-run-filter.mjs` locally and review the printed report; this has been done and approved.

## Next Phase Readiness

**UNBLOCKED.** Plan 16-01 is fully complete. Plan 16-03 (write-path wiring) may now proceed — it is gated on this approval, which has landed. The drop-rate baseline recorded above (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%) is the reference plan 16-04's retroactive cleanup will compare its counts against.

---
*Phase: 16-components-filter-fix*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: lib/filter-components.ts
- FOUND: tests/filter-components.test.ts
- FOUND: scripts/dry-run-filter.mjs
- FOUND commit: 45a1eb3 (test: add failing tests for filterComponents)
- FOUND commit: d62c64b (feat: implement filterComponents deck-lookup filter)
- FOUND commit: fec42f5 (feat: add read-only dry-run-filter diagnostic script)
- FOUND commit: cdc059b (docs: partial SUMMARY, checkpoint pause)
- FOUND commit: 8beabac (docs: STATE.md checkpoint-pause bookkeeping)
- `npm test -- tests/filter-components.test.ts`: 7/7 passing
