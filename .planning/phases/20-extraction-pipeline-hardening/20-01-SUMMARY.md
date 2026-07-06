---
phase: 20-extraction-pipeline-hardening
plan: 01
subsystem: api
tags: [extraction, json-parsing, blank-safety, vitest, korean-study]

# Dependency graph
requires:
  - phase: 16-components-filter-fix
    provides: filterComponents() deck-lookup filter for CardDependency components (GRAPH-03), reused unchanged
provides:
  - "normalizeExtractedCards(rawCards, deckSet): ExtractedCard[] — shared pure normalization pipeline (structural validation, CR-01 batch-fronts union, components dedup/filter, IN-01 coercion, EXTRACT-03 blank-safety partition/rejection)"
  - "parseExtractionResponse rewritten for the { cards: [...] } wrapper shape with depth-2 truncation salvage"
  - "Code-enforced blank-safety invariant: sentences[0] is always safeToBlank for every card in the returned array; zero-safe cards are dropped whole"
affects: [20-02-structured-outputs-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared pure normalization boundary consumed by both a salvage-parse path and a future structured-outputs happy path (one pipeline, one test surface)"
    - "flatMap-based whole-record rejection ([] vs [record]) for enforcing an invariant that can require dropping an entire parsed object, not just a field"

key-files:
  created: []
  modified:
    - lib/extract-cards.ts
    - tests/extract-cards.test.ts

key-decisions:
  - "Delegated fully to the RESEARCH.md-verified rewrite rather than re-deriving the depth arithmetic or branching design — RESEARCH.md's Salvage Parser Adaptation and Blank-Safety Enforcement Design sections were followed as written"
  - "Legacy bare-array parseExtractionResponse input now throws (no dual-shape tolerance) — matches the phase's single-contract mandate for EXTRACT-02"
  - "Non-safe supplementary sentences are RETAINED after safe ones, not dropped — only blank modes need safeToBlank; Exposure mode and the selection-layer fallback already handle unsafe sentences correctly"

patterns-established:
  - "normalizeExtractedCards(rawCards: unknown[], deckSet): ExtractedCard[] is now the single normalization boundary — Plan 02's structured-outputs happy path calls it directly on parsed_output.cards with no duplicated business logic"

requirements-completed: [EXTRACT-02, EXTRACT-03]

coverage:
  - id: D1
    description: "parseExtractionResponse accepts only the { cards: [...] } wrapper shape and salvages genuine mid-stream truncations at the depth-2 card boundary (re-closing with ']}' and locating the wrapper start via indexOf('{'))"
    requirement: "EXTRACT-02"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#wrapper-shape truncation salvage (EXTRACT-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 14 pre-existing dedup/self-exclude/filterComponents/CR-01 tests pass with fixtures re-wrapped only, no logic changes (phase criterion #4 regression safety, unit half)"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#parseExtractionResponse (pre-existing describe blocks)"
        status: pass
    human_judgment: false
  - id: D3
    description: "normalizeExtractedCards guarantees sentences[0] is code-verified blank-safe for every returned card; cards with zero blank-safe sentences (including zero-sentence and all-unsafe cases) are dropped whole with a console.warn; non-safe supplementary sentences are retained after safe ones (not dropped)"
    requirement: "EXTRACT-03"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#blank-safety enforcement (EXTRACT-03)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live single-lesson extraction produces correctly-shaped, blank-safe cards end to end (requires ANTHROPIC_API_KEY + Turso; also depends on Plan 02 landing the structured-outputs happy path since extractCardsFromNotes is unchanged this plan)"
    verification: []
    human_judgment: true
    rationale: "Requires a live Claude API call and a real DB; deferred to phase-end manual verification alongside Plan 02 per RESEARCH.md's Validation Architecture (\"Criterion #4 live check\" row)"

duration: 7min
completed: 2026-07-06
status: complete
---

# Phase 20 Plan 01: Extraction Parser Rewrite & Blank-Safety Enforcement Summary

**Rewrote `parseExtractionResponse` for the `{ cards: [...] }` wrapper with depth-2 truncation salvage, extracted a shared pure `normalizeExtractedCards()`, and added code-enforced blank-safety (safe-first partition + zero-safe whole-card rejection) — no card can reach the DB without a verified blank-safe first sentence, and the parser only accepts the new wrapper contract.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-06T21:55:25Z
- **Completed:** 2026-07-06T22:02:01Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Extracted the source-agnostic normalization block into a new exported `normalizeExtractedCards(rawCards: unknown[], deckSet: Set<string>): ExtractedCard[]` — the one pipeline both the salvage path (this plan) and the future structured-outputs happy path (Plan 02) will flow through
- Rewrote `parseExtractionResponse` to require the `{ cards: [...] }` wrapper: full `JSON.parse` first, falling back to a depth-2 salvage scan (was depth-1 for the old bare-array shape) that re-closes with `]}` and locates the wrapper start via `indexOf('{')`; deleted the old bare-array regex salvage branch entirely
- Updated `findLastTopLevelCardBoundary`'s boundary rule from `depth === 1` to `depth === 2` to match the new wrapper nesting (wrapper `{` = depth 1, `cards` array `[` = depth 2, each card `{` = depth 3)
- Added code-enforced blank-safety inside `normalizeExtractedCards`: compute `sentenceMatch` once per found-and-shape-valid sentence, stable-partition into safe-first / non-safe-after (both halves preserve relative order), cap at 3, and reject the whole card (via `console.warn` + `flatMap`-to-`[]`) when zero blank-safe sentences remain
- Migrated all 14 pre-existing `parseExtractionResponse` test fixtures to the wrapper shape with zero logic changes, and added 10 new tests covering EXTRACT-02 truncation-salvage edge cases and EXTRACT-03 blank-safety enforcement (24 tests total, all green)

## Task Commits

Each task was committed atomically, following the plan's TDD (`tdd="true"`) protocol — RED (test) then GREEN (feat) per task:

1. **Task 1: Rewrite parseExtractionResponse for the {cards:[...]} wrapper, extract normalizeExtractedCards, migrate all test fixtures (EXTRACT-02)**
   - `4910d1d` (test) - migrate 14 fixtures to `{ cards: [...] }` wrapper, add 4 new EXTRACT-02 truncation-salvage cases
   - `cb341f7` (feat) - rewrite `parseExtractionResponse`, extract `normalizeExtractedCards`, update `findLastTopLevelCardBoundary` to depth-2, delete the bare-array regex branch
2. **Task 2: Code-enforced blank-safety — safe-first partition + zero-safe whole-card rejection (EXTRACT-03)**
   - `cf5ea31` (test) - add 5 blank-safety enforcement cases (zero-.found drop, single-char/twice-occurring unsafe rejection, stable partition retention, empty-array rejection, 3-sentence cap)
   - `7944e69` (feat) - implement the safe-first partition + zero-safe whole-card rejection inside `normalizeExtractedCards`

**Plan metadata:** commit pending (this SUMMARY.md, see final commit below)

## Files Created/Modified
- `lib/extract-cards.ts` - Rewrote `parseExtractionResponse` for the wrapper shape; extracted `normalizeExtractedCards` (new export); updated `findLastTopLevelCardBoundary` depth rule (1→2); implemented EXTRACT-03 blank-safety partition + rejection; `extractCardsFromNotes` unchanged (still calls `parseExtractionResponse` with the same signature — contract-mismatched with the live prompt until Plan 02 lands, acceptable mid-phase since deploy is a manual `git push`)
- `tests/extract-cards.test.ts` - Migrated all 14 pre-existing fixtures to `{ cards: [...] }`; added a `describe('wrapper-shape truncation salvage (EXTRACT-02)')` block (4 tests) and a `describe('blank-safety enforcement (EXTRACT-03)')` block (5 tests)

## Decisions Made
- Followed RESEARCH.md's verified rewrite (§Salvage Parser Adaptation, §Blank-Safety Enforcement Design) exactly rather than re-deriving the depth arithmetic or partition design from scratch — both were already grounded in SDK-source verification and existing `lib/sentence-selection.ts`/`StudySession.tsx` behavior
- Kept `parseExtractionResponse` wrapper-only (no dual bare-array/wrapper tolerance) — matches the phase's single-contract mandate; a legacy bare-array input now throws
- Non-safe supplementary sentences are retained after safe ones rather than dropped — the selection layer already falls back to the first blank-safe sentence when blanking, and Exposure mode rotates across all sentences for grammar-card variety; dropping them would shrink variety with zero correctness benefit

## Deviations from Plan

None — plan executed exactly as written. One environment-setup note (not a deviation): `npx prisma generate` had not yet been run in this fresh worktree checkout, causing 2 unrelated pre-existing test files (`tests/review-history.test.ts`, `tests/review-route.test.ts`) to fail on missing `@/app/generated/prisma/client`. Ran `npx prisma generate` (a normal, documented dev-setup command per CLAUDE.md, not a code change) so `npm test` could run clean; this did not touch any file in `files_modified` for this plan and the generated output is gitignored (not committed).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `normalizeExtractedCards` is ready to be called directly by Plan 02's structured-outputs happy path (`parsed_output.cards`) with no further changes needed to this pipeline.
- `extractCardsFromNotes`'s live prompt still expects a bare JSON array per its current instructions — it is contract-mismatched with the now wrapper-only `parseExtractionResponse` until Plan 02 migrates the prompt + call to `output_config.format`/`zodOutputFormat`. This is expected and documented in the plan (task 1, step 4); no live sync call should be exercised against `main` until Plan 02 lands.
- Full test suite (140 tests) and lint (0 errors) are green as of this plan's completion.

---
*Phase: 20-extraction-pipeline-hardening*
*Completed: 2026-07-06*
