---
phase: 15-studysession-refactor-sentence-selection-memoization
plan: 01
subsystem: ui
tags: [react, usememo, refactor, pure-module, vitest, fnv-1a, sentence-selection]

# Dependency graph
requires:
  - phase: 13-review-api-hardening-undo-reliability
    provides: locked StudySession behavior (postReviewWithRetry, isMountedRef, saveError/Toast, atomic handleUndo) that this refactor must preserve byte-for-byte
  - phase: 02-foundation-first-presentation
    provides: the inline chosenIdx IIFE + local hashStr in StudySession.tsx that this plan extracts
provides:
  - "lib/sentence-selection.ts — pure, tested module exporting SelectableSentence, hashStr, selectSentence"
  - "tests/sentence-selection.test.ts — 8 Vitest cases covering the selection algorithm + hashStr"
  - "Single-source-of-truth hashStr shared by both sentence-selection tie-break and mcOptions distractor seeding"
  - "Memoized chosenIdx in StudySession (useMemo with [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank])"
affects: [15-02 (mode-split reuses the memoized selectSentence + imported hashStr), components/StudySession.tsx, components that may later import hashStr]

# Tech tracking
tech-stack:
  added: []  # no new packages — pure internal refactor using already-installed react@19.2.4 useMemo + vitest@4.1.9
  patterns:
    - "Pure-module extraction with JSDoc contract header (mirrors lib/sentence-match.ts / lib/sequence.ts house style)"
    - "useMemo for render-derived selection, with every free variable named in the dep array (RESEARCH Pitfall 1)"
    - "Single-source-of-truth utility shared across two call sites (sentence tie-break + mcOptions) via named import"
    - "TDD RED/GREEN for pure-module extraction: failing test (module-not-found) → implementation → green"

key-files:
  created:
    - lib/sentence-selection.ts
    - tests/sentence-selection.test.ts
  modified:
    - components/StudySession.tsx

key-decisions:
  - "Co-located hashStr in lib/sentence-selection.ts (not a separate lib/hash.ts) — lower ceremony, avoids a one-function file; mcOptions imports it from there (RESEARCH Open Question 2)"
  - "Used a minimal structural SelectableSentence interface ({korean, targetForm, unknownCount?}) instead of importing SentenceDTO — mirrors lib/sequence.ts SeqCard convention, keeps the pure module decoupled from the DTO layer (RESEARCH Open Question 3)"
  - "Moved the chosenIdx useMemo + its inputs above the empty-queue early return to satisfy react-hooks/rules-of-hooks — the original IIFE was not a hook so could sit after the return; useMemo cannot"
  - "Used item?.kind === 'real' (optional chaining) for runtime safety when the queue is empty — noUncheckedIndexedAccess is off so TS types queue[0] as StudyItem, but it is undefined at runtime when empty"
  - "Kept the react-hooks/exhaustive-deps warning on cardSentences ?? [] per RESEARCH Anti-Patterns — the memo returns -1 instantly on that path; do not 'fix' it (eslint exits 0 on warnings)"

patterns-established:
  - "Pattern: extract render-body pure logic into lib/*.ts with a JSDoc 'Used by:' call-site list + closing 'Pure — no Date.now()/Math.random()' sentence before wrapping the call site in useMemo"
  - "Pattern: when memoizing a derivation that reads values computed after an early return, move the derivation (and the hook) above the return and guard queue[0] access with optional chaining"

requirements-completed: [REFACTOR-02, PERF-03]

# Coverage metadata (#1602) — one entry per shipped deliverable
coverage:
  - id: D1
    description: "selectSentence + hashStr extracted into lib/sentence-selection.ts as a pure, independently unit-tested module importable without rendering StudySession; hashStr is single-source-of-truth (one definition, shared by mcOptions)"
    requirement: REFACTOR-02
    verification:
      - kind: unit
        ref: "tests/sentence-selection.test.ts#selectSentence (6 cases) + #hashStr (2 cases)"
        status: pass
      - kind: other
        ref: "grep -rn 'function hashStr' . | grep -v node_modules → exactly one match (lib/sentence-selection.ts:51)"
        status: pass
      - kind: other
        ref: "npm run build (type-checks the import + SelectableSentence structural typing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "StudySession computes chosenIdx via useMemo(selectSentence, [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]) so selection recomputes only on input change, not every render"
    requirement: PERF-03
    verification:
      - kind: other
        ref: "grep confirms useMemo dep array literally contains cardSentences, realCard?.id, realCard?.review?.reps, needsBlank (components/StudySession.tsx:372)"
        status: pass
      - kind: other
        ref: "npm run lint exits 0 (react-hooks/rules-of-hooks satisfied — useMemo moved above early return) + npm run build type-checks the wiring"
        status: pass
    human_judgment: true
    rationale: "No component-rendering test infrastructure (@testing-library/react/jsdom) exists in this codebase (vitest.config.ts environment: node), and REQUIREMENTS.md Out-of-Scope explicitly excludes UI component test coverage. The useMemo + verified-correct dependency array is the structural proof (a React semantic guarantee), but the runtime 'no recompute on unrelated re-render' effect is confirmed via live UAT (flip/grade/undo/mode-switch) per the phase's Success Criterion 4/5, not an automated test. Per RESEARCH Validation Architecture Test Map, PERF-03 is classified manual."

# Metrics
duration: 6 min
completed: 2026-07-02
status: complete
---

# Phase 15 Plan 01: Sentence-Selection Extraction & Memoization Summary

**Pure `lib/sentence-selection.ts` (selectSentence + single-source hashStr) with 8 Vitest cases, and a memoized `chosenIdx` `useMemo` in StudySession — behavior preserved, Phase 13 hardening untouched**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T23:34:56Z
- **Completed:** 2026-07-02T23:41:09Z
- **Tasks:** 2 (Task 1 TDD: RED → GREEN; Task 2: rewire + memoize)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Extracted the inline `chosenIdx` IIFE and its `hashStr` dependency out of `components/StudySession.tsx` into a new pure, tested module `lib/sentence-selection.ts` (REFACTOR-02) — importable and unit-testable without rendering StudySession
- Memoized sentence selection at the call site with `useMemo` and a complete dependency array `[cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]` so it recomputes only when its real inputs change (PERF-03)
- Established `hashStr` as a single source of truth — both the sentence-selection tie-break and `mcOptions`' distractor seeding now import it from `lib/sentence-selection.ts`; the local copy was deleted
- 8 new Vitest cases covering all six selection behaviors (tier pick, hash-rotation tie-break, empty → -1, blank-safety fallback, graceful degrade, needsBlank=false skip) plus two hashStr behaviors (deterministic positive int, never-0 guard)
- Full suite green (75 tests), lint clean (0 errors), build succeeds; Phase 13 hardening (`postReviewWithRetry`, `isMountedRef`, `saveError`/`Toast`, undo-snapshot ordering, atomic `handleUndo`) byte-for-byte preserved

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing test for sentence-selection pure module** — `9e3118e` (test)
2. **Task 1 GREEN: implement sentence-selection pure module** — `7e0e664` (feat)
3. **Task 2: memoize sentence selection + single-source hashStr in StudySession** — `46a171c` (refactor)

_Note: Task 1 was `tdd="true"` — RED (failing test, module-not-found) → GREEN (implementation, 8 tests pass). No separate REFACTOR commit needed; the implementation was clean and matched house style on first pass._

## Files Created/Modified
- `lib/sentence-selection.ts` — NEW pure module: `SelectableSentence` interface, `hashStr` (FNV-1a, moved verbatim from StudySession), `selectSentence` (generalized chosenIdx IIFE). Imports `sentenceMatch` from `./sentence-match` for blank-safety. No `'use client'`, no React import. JSDoc header lists both call sites + purity guarantee.
- `tests/sentence-selection.test.ts` — NEW Vitest suite: 6 `selectSentence` behaviors + 2 `hashStr` behaviors, `sentence(korean, targetForm, unknownCount?)` fixture helper mirroring `tests/sequence.test.ts`'s `card(...)`.
- `components/StudySession.tsx` — MODIFIED: added `import { selectSentence, hashStr } from '@/lib/sentence-selection'`; deleted local `hashStr` (mcOptions now uses the imported one); replaced inline IIFE with `useMemo(selectSentence, [...])`; moved selection derivation above the empty-queue early return for rules-of-hooks. Net −26 lines.

## Decisions Made
- Co-located `hashStr` in `lib/sentence-selection.ts` rather than a separate `lib/hash.ts` — lower ceremony, avoids a one-function file; `mcOptions` imports it from there (RESEARCH Open Question 2).
- Used a minimal structural `SelectableSentence` interface (`{korean, targetForm, unknownCount?}`) instead of importing `SentenceDTO` — mirrors `lib/sequence.ts`'s `SeqCard` convention and keeps the pure module decoupled from the DTO layer's evolution (RESEARCH Open Question 3).
- Followed the plan's exact dependency array `[cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]` (not the roadmap's illustrative `[cardSentences, reps]`) — every free variable the selection reads is named (RESEARCH Pitfall 1).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed react-hooks/rules-of-hooks error from memoizing after an early return**
- **Found during:** Task 2 (rewiring StudySession)
- **Issue:** The plan's `<action>` said to replace the inline IIFE (which sat AFTER `if (queue.length === 0) return null`) with a `useMemo` at the same location. But `useMemo` is a hook and must be called in the same order on every render — placing it after an early return makes it conditional, which `react-hooks/rules-of-hooks` flags as an error (lint failed: `React Hook "useMemo" is called conditionally`). The original IIFE was not a hook, so this was a new constraint introduced by the memoization, not a pre-existing issue.
- **Fix:** Moved the `chosenIdx` `useMemo` and its inputs (`item`, `realCard`, `cardSentences`, `needsBlank`) ABOVE the empty-queue early return. Used `item?.kind === 'real'` (optional chaining) for runtime safety — `noUncheckedIndexedAccess` is off so TS types `queue[0]` as `StudyItem`, but it is `undefined` at runtime when the queue is empty; the `?.` short-circuits to `null` realCard and the memo returns `-1` instantly, which the early return discards. Non-hook derivations (`currentCard`, `isPractice`, `hints`, `progressPct`, `isNewCard`) stay below the early return.
- **Files modified:** components/StudySession.tsx
- **Verification:** `npm run lint` exits 0 (the rules-of-hooks error is gone; one expected `exhaustive-deps` warning remains on `cardSentences ?? []` per RESEARCH Anti-Patterns); `npm run build` type-checks the restructured wiring; full 75-test suite green.
- **Committed in:** 46a171c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was necessary for the memoization to be hook-safe and is fully within the plan's intent (PERF-03 memoization at the call site). No scope creep — the selection algorithm, dependency array, and single-source `hashStr` are exactly as specified; only the placement of the `useMemo` relative to the early return changed for React correctness.

## Issues Encountered
None beyond the rules-of-hooks fix documented above (resolved inline as a Rule 1 auto-fix).

## User Setup Required
None — no external service configuration required. This plan installs zero packages and adds no API routes, env vars, or external integrations (pure internal refactor).

## Next Phase Readiness
- Plan 15-02 (the mode-split, REFACTOR-01) can now import `{ selectSentence, hashStr }` from `lib/sentence-selection.ts` and reuse the memoized `chosenIdx` pattern without restructuring the selection logic a second time — exactly the sequencing the ROADMAP locked in (extract+memoize BEFORE split).
- The `SelectableSentence` interface and `selectSentence` signature are stable contracts for Plan 02's `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` props (each mode receives already-computed `chosenSentence`/`displayedSentence`/etc., never re-derives selection).
- No blockers. A live study-session UAT (flip/grade/undo/mode-switch) is the remaining phase-level verification for PERF-03 runtime behavior and overall no-regression (per Success Criterion 4/5), to be run via `/gsd-verify-work` after Plan 02 or at phase close.

---
*Phase: 15-studysession-refactor-sentence-selection-memoization*
*Completed: 2026-07-02*

## Self-Check: PASSED

- `lib/sentence-selection.ts` exists (FOUND)
- `tests/sentence-selection.test.ts` exists (FOUND)
- `components/StudySession.tsx` exists (FOUND)
- Task commit `9e3118e` (test/RED) exists (FOUND)
- Task commit `7e0e664` (feat/GREEN) exists (FOUND)
- Task commit `46a171c` (refactor) exists (FOUND)
- TDD gate sequence: `test(15-01)` → `feat(15-01)` → `refactor(15-01)` present and ordered (RED ✓, GREEN ✓)
- `grep -rn "function hashStr" . | grep -v node_modules` → exactly one match (lib/sentence-selection.ts:51) ✓
- `useMemo` dep array at components/StudySession.tsx:372 contains `[cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]` ✓
- `npx vitest run tests/sentence-selection.test.ts` → 8 tests pass ✓
- `npm test` → 75 tests pass (8 files) ✓
- `npm run lint` → exit 0 (0 errors, 1 expected warning) ✓
- `npm run build` → exit 0 ✓
