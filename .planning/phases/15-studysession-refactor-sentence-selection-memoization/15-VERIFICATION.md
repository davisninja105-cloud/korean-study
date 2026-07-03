---
phase: 15-studysession-refactor-sentence-selection-memoization
verified: 2026-07-03T00:58:29Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 15: StudySession Refactor & Sentence-Selection Memoization Verification Report

**Phase Goal:** `StudySession.tsx` is decomposed into focused, independently-testable pieces and stops recomputing sentence selection on every render — with study behavior preserved exactly.
**Verified:** 2026-07-03T00:58:29Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

(ROADMAP Success Criteria, merged with PLAN frontmatter `must_haves.truths` — PLAN truths matched to the SC they support, no reduction of scope.)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Sentence-selection logic lives in a pure module with its own unit tests, importable and testable without rendering `StudySession` (SC1, REFACTOR-02). | ✓ VERIFIED | `lib/sentence-selection.ts` (91 lines) exports `SelectableSentence`, `hashStr`, `selectSentence` — no `'use client'`, no `import ... from 'react'` (`grep -c "use client\|from 'react'"` → 0). `tests/sentence-selection.test.ts` (104 lines) imports directly from `../lib/sentence-selection` and never renders `StudySession`. `npx vitest run tests/sentence-selection.test.ts` → 8/8 pass. |
| 2 | `selectSentence()` reproduces the exact pre-refactor `chosenIdx` algorithm: least-`unknownCount` tier, `(hashStr(cardId)+reps)%candidates.length` tie-break, blank-safety override, graceful degrade, `-1` on empty (SC1/SC2, REFACTOR-02). | ✓ VERIFIED | Read `lib/sentence-selection.ts:66-91` — logic matches the plan's specified body exactly (min-tier via `Math.min`, candidate filter, hash-mod tie-break, `sentenceMatch(...).safeToBlank` override with `findIndex` fallback, degrade-to-tier-pick). All 6 behaviors covered by named `it` cases in the test file, each passing. Spot-ran the single named test exercising the tie-break rotation: `npx vitest run tests/sentence-selection.test.ts -t "rotates among tied-lowest candidates"` → 1 passed. |
| 3 | Sentence selection is memoized in `StudySession.tsx` via `useMemo` with dependency array `[cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]`, so it recomputes only when those inputs change — not on every unrelated re-render (SC2, PERF-03). | ✓ VERIFIED | `components/StudySession.tsx:367-370`: `const chosenIdx = useMemo(() => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, needsBlank), [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank])`. The dependency array literally names every free variable the callback reads — no missing deps (React's `useMemo` contract guarantees no recompute when a dep array is unchanged and complete, which is a structural, not runtime-only, guarantee once the array is verified complete). `npm run lint` confirms no `exhaustive-deps` error on this hook (the one pre-existing warning is on the unrelated `cardSentences ?? []` fallback, documented and accepted in 15-01-SUMMARY.md). Additionally exercised live: 15-UAT.md Test 1 ("Sentence-selection memoization holds up in a live session") — human-verified `pass`, no flicker/wrong-sentence/undo-mode-switch regression. |
| 4 | `StudySession` renders each study mode through a dedicated `FlashcardMode` / `MultipleChoiceMode` / `FillBlankMode` sub-component; the giant inline per-mode conditional no longer lives in `StudySession` (SC3, REFACTOR-01). | ✓ VERIFIED | `components/StudySession.tsx:722-770` — three-way ternary dispatching `<FlashcardMode .../>` / `<MultipleChoiceMode .../>` / `<FillBlankMode .../>`. `grep -c "<FlashcardMode\|<MultipleChoiceMode\|<FillBlankMode" components/StudySession.tsx` → 3. Inline JSX markers fully absent from the parent: `grep -c "card-flip-inner\|grid grid-cols-2 gap-3\|Fill in the blank" components/StudySession.tsx` → 0/0/0. Each mode file read directly: `FlashcardMode.tsx` (257 lines), `MultipleChoiceMode.tsx` (106 lines), `FillBlankMode.tsx` (137 lines) each render their own card-face wrapper + a `sticky bottom-...` action bar (`grep -c "sticky bottom-"` → 1 each) with mode-specific buttons only (no shared slot/render-prop component exists in the codebase). No session-state hooks in mode components: `grep -c "useState\|useRef"` → 0 for `MultipleChoiceMode.tsx`/`FillBlankMode.tsx`, 0 for `FlashcardMode.tsx` (its only hook is `useWordTap()`). |
| 5 | A live study session behaves identically to before — flip, grade all four ratings, undo, Exposure/Recall toggle, and mode switching all work with no regression (SC4, REFACTOR-01). | ✓ VERIFIED | Behavior-dependent (session state transitions across flip/grade/undo/mode-switch) — cannot be proven by grep alone. Evidence chain: `15-02-PLAN.md` Task 3 is a `checkpoint:human-verify` gate with an explicit `<resume-signal>` requiring the human to type "approved" or describe a regression; `.planning/STATE.md` records `stopped_at: "... Task 3 live UAT approved by human"`; `15-02-SUMMARY.md` D3 coverage entry records `human_judgment: true` with the approval rationale; `15-UAT.md` (already produced, `status: complete`) records Test 2 ("StudySession mode-split behaves identically to before") as `result: pass`, sourced from the same approved checkpoint. This is a completed, audited human checkpoint (not an unverified executor claim) — treated as valid runtime evidence for this behavior-dependent truth. |
| 6 | `hashStr` has exactly one definition in the codebase, and both the sentence-selection tie-break and `mcOptions`' distractor seeding import it from there (REFACTOR-02, single-source-of-truth). | ✓ VERIFIED | `grep -rn "function hashStr" . --include="*.ts" --include="*.tsx" \| grep -v node_modules` → exactly one match: `lib/sentence-selection.ts:51`. `components/StudySession.tsx:10` imports `{ selectSentence, hashStr }` from `@/lib/sentence-selection`; `mcOptions` (line 295) calls `hashStr(item.card.id)` / `hashStr(item.card.front)` — the imported function, no local copy remains. |
| 7 | `npm run lint` stays clean (`react-hooks/purity` respected) and `npm test` passes, including the new `tests/sentence-selection.test.ts` (SC5). | ✓ VERIFIED | Ran directly: `npm run lint` → 0 errors, 1 pre-existing/documented `exhaustive-deps` warning on `cardSentences ?? []` (not a purity violation, not a new issue). `npm test` → 75/75 tests pass across 8 files (includes `tests/sentence-selection.test.ts`). `npm run build` → succeeds (Next.js 16.2.1, TypeScript check passes, all 25 routes generated). |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `lib/sentence-selection.ts` | Pure module: `SelectableSentence`, `hashStr`, `selectSentence` | ✓ VERIFIED | Exists, 91 lines. Substantive (full JSDoc contract + real FNV-1a + real tier/tie-break/blank-safety logic, no stubs). Wired: imported by `components/StudySession.tsx:10`. |
| `tests/sentence-selection.test.ts` | Vitest suite covering the 6 selection behaviors + hashStr | ✓ VERIFIED | Exists, 104 lines, 8 `it` cases (6 `selectSentence` + 2 `hashStr`), all passing. |
| `components/FlashcardMode.tsx` | Presentational flip-card face + Show Answer/grade action bar | ✓ VERIFIED | Exists, 257 lines. Renders the full flip-container JSX (front/back faces with `frontRef`/`backRef`), Show Answer / 4-grade-button action bar, calls `useWordTap()` internally. Wired: imported and dispatched by `StudySession.tsx:6,723`. |
| `components/MultipleChoiceMode.tsx` | Presentational options grid + Next action bar | ✓ VERIFIED | Exists, 106 lines. Renders 4-option grid with local correctness/selection coloring, Next action bar. Wired: imported and dispatched by `StudySession.tsx:7,744`. |
| `components/FillBlankMode.tsx` | Presentational fill-input + Check Answer/Wrong/Correct action bar | ✓ VERIFIED | Exists, 137 lines. Renders blanked-sentence/word-prompt, input, reveal panel, Check Answer / Wrong / Correct action bar. Wired: imported and dispatched by `StudySession.tsx:8,754`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `components/StudySession.tsx` | `lib/sentence-selection.ts` | `import { selectSentence, hashStr } from '@/lib/sentence-selection'` | ✓ WIRED | Line 10; `grep -c "from '@/lib/sentence-selection'"` → 1. Old inline `hashStr` def and `chosenIdx` IIFE fully removed (`grep -c "cardSentences.findIndex"` → 0 in StudySession — that logic now lives only in `lib/sentence-selection.ts`). |
| `StudySession.mcOptions` | `hashStr` (imported) | Direct call `hashStr(item.card.id)` / `hashStr(item.card.front)` | ✓ WIRED | Line 295. Confirmed single source of truth — no local re-declaration anywhere in the repo. |
| `components/StudySession.tsx` return body | `FlashcardMode` / `MultipleChoiceMode` / `FillBlankMode` | Three-way `mode === ...` ternary passing derived props + callbacks | ✓ WIRED | Lines 722-770. All props read by each mode component (verified by reading each Props interface against what StudySession passes) match exactly — no undefined-prop or type mismatch (confirmed by a successful `npm run build` type-check). |
| `FlashcardMode` | `frontRef`/`backRef`/`againBtnRef` (parent-owned) | Props threaded through, attached to the flip-face divs and Again button | ✓ WIRED | `FlashcardMode.tsx:33-35` (Props) → `:79,131,217` (`ref={frontRef}`, `ref={backRef}`, `ref={againBtnRef}`). Parent's measuring `useLayoutEffect` (`StudySession.tsx:335-338`) and `handleReveal`'s `requestAnimationFrame` focus call (`:624`) are unchanged and still target these same ref objects. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full sentence-selection unit suite | `npx vitest run tests/sentence-selection.test.ts` | 8/8 passed | ✓ PASS |
| Single named test exercising the hash tie-break rotation (the one behavior most likely to hide a subtle bug) | `npx vitest run tests/sentence-selection.test.ts -t "rotates among tied-lowest candidates"` | 1 passed, 7 skipped (targeted run) | ✓ PASS |
| Full project test suite (run once, not filtered per-truth) | `npm test` | 75/75 passed (8 files) | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing documented warning | ✓ PASS |
| Production build (type-checks all new wiring) | `npm run build` | Succeeds, 25 routes generated | ✓ PASS |
| Task commits exist in git history | `git log --oneline \| grep -E "9e3118e\|7e0e664\|46a171c\|89c32b1\|bc98179"` | All 5 commits found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REFACTOR-02 | 15-01-PLAN.md | Sentence-selection logic extracted into a pure, independently-testable module | ✓ SATISFIED | `lib/sentence-selection.ts` + `tests/sentence-selection.test.ts`, single-source `hashStr` (Truths 1, 2, 6). |
| PERF-03 | 15-01-PLAN.md | `StudySession`'s sentence-selection calculation is memoized instead of recomputing every render | ✓ SATISFIED | `useMemo` with complete dependency array (Truth 3). |
| REFACTOR-01 | 15-02-PLAN.md | `StudySession.tsx` is split into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` sub-components | ✓ SATISFIED | Mode dispatch, per-mode action bars, no session-state leakage, live UAT approved (Truths 4, 5). |

**Orphaned requirements check:** REQUIREMENTS.md maps exactly `REFACTOR-02, PERF-03, REFACTOR-01` to Phase 15 (traceability table lines 64-66); all three appear in one of the two plans' `requirements:` frontmatter. No orphaned requirements for this phase. Full v1 milestone traceability (11/11 requirements mapped) is also confirmed unmapped-count-zero in REQUIREMENTS.md.

### Anti-Patterns Found

Scanned all 6 files touched/created by this phase (`lib/sentence-selection.ts`, `tests/sentence-selection.test.ts`, `components/StudySession.tsx`, `components/FlashcardMode.tsx`, `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-language patterns.

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `components/FillBlankMode.tsx` | 83 | `placeholder="한국어로 입력하세요..."` | ℹ️ INFO | False positive — this is the HTML `<input placeholder>` attribute (existing UX copy carried over verbatim from the pre-refactor inline JSX), not a stub marker. |

No debt markers (`TBD`/`FIXME`/`XXX`), no `TODO`/`HACK`, no empty-implementation patterns (`return null`/`return {}`/`=> {}`), and no hardcoded-empty-data stubs found in any phase-15 file.

### Regression Check (Phase 13 / Phase 14)

Phase 13's hardened review/undo pipeline is the piece most at risk from this structural refactor (per the PLAN's explicit "do not touch" instructions). Verified byte-for-byte preservation by reading the full `StudySession.tsx`:
- `postReviewWithRetry` (lines 106-140) — unchanged 3-attempt bounded retry with 4xx-short-circuit and AbortController timeout.
- `isMountedRef` + mount/unmount effect (lines 216-220) — unchanged.
- `undoRef.current = {...}` snapshot capture (line 514) still precedes `setQueue(nextQueue)` (line 549) in `submitReview` — ordering preserved.
- `handleUndo`'s atomic restoration block (lines 588-605), including the `if (!isMountedRef.current) return` guard (line 596) before the unconditional `seenCardIdsRef.current = prevSeenCardIds` write (line 600) — unchanged.
- `saveError`/`Toast` wiring (lines 211, 674-679) — unchanged.

`grep -c "postReviewWithRetry\|isMountedRef\|undoRef.current = {"` → 13 (well above the plan's ≥3 threshold). Phase 13's own VERIFICATION.md (`13-VERIFICATION.md`) had one `⚠️ PRESENT_BEHAVIOR_UNVERIFIED` item (the unmount-mid-undo cleanup invariant, REVIEW-05) — that gap is pre-existing to Phase 13 and structurally unaffected by this refactor (the same guard, at the same relative position in the same function, in the same file); it is not a new or reopened gap introduced by Phase 15 and is out of this phase's scope to close.

No regressions found against Phase 13 or Phase 14 deliverables.

### Human Verification Required

None. The one behavior-dependent truth in this phase (Truth 5 — live session no-regression) was already exercised through a completed, audited `checkpoint:human-verify` gate with an explicit typed approval, corroborated across `STATE.md`, `15-02-SUMMARY.md`, and the existing `15-UAT.md`. No further human action is needed to close this phase.

### Gaps Summary

None. All 7 observable truths verified, all 5 artifacts present/substantive/wired, all 4 key links wired, both requirement plans' must_haves satisfied, all 3 requirement IDs traced with no orphans, lint/test/build all green, no debt markers, no regressions against Phase 13/14.

---

_Verified: 2026-07-03T00:58:29Z_
_Verifier: Claude (gsd-verifier)_
