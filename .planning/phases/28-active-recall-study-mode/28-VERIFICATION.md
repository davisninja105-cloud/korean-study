---
phase: 28-active-recall-study-mode
verified: 2026-07-14T16:25:59Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "In dev (npm run dev), start an Active-mode session and grade a state-1 card Good/Easy repeatedly until FSRS requeues it at state >= 2. Confirm the re-shown card visibly flips from the silent Passive/exposure face to the English-prompt production face on its next appearance (no page reload)."
    expected: "The same card, on a later appearance in the same session, renders the Active production front (English prompt + hint pill) instead of the Passive/exposure face it showed earlier — proving activeFace re-derives per render from live queue state rather than a stale snapshot."
    why_human: "This is a live, in-session visual state transition (mid-session face graduation). e2e/active-flow.spec.ts proves productionSeen >= 1 and degradeSeen >= 1 within one session and unit tests prove deriveActiveFace's precedence in isolation, but neither pins the SAME card visibly changing face across two appearances in one run — that specific perceptual moment is what the plan's own Task 2 human-check calls out as needing eyes-on confirmation."
  - test: "In dev, tap through the hint control ('Show hint' -> 'Hint: {card.back}') on a sentence-production card."
    expected: "The hint pill sits above the reveal button, expands inline without layout jank, reads 'Hint: {gloss}' in italic muted text, and visibly goes inert (disabled, dimmed) after the first tap."
    why_human: "Micro-interaction feel (placement, animation smoothness, disabled-state legibility) is a UI-SPEC/visual quality judgment, not something grep or an accessibility-tree assertion can rate."
gaps: []
---

# Phase 28: Active Recall Study Mode Verification Report

**Phase Goal:** Replace the /study 3-mode grid (Flashcards / Multiple Choice / Fill-in-the-Blank) and the Exposure/Recall sub-toggle with a single Passive/Active toggle (Passive default), retire Multiple Choice and standalone Fill-in-the-Blank entirely, and add the Active production mode (English sentence prompt → tap-to-reveal Korean + audio → self-grade). Remove the old modes first via a `StudyMode` type-narrowing pass so the compiler enumerates stale references, then extend `FlashcardMode` with the Active front-face branch into the smaller surface.

**Verified:** 2026-07-14T16:25:59Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Single Passive/Active toggle replaces the 3-mode grid + sub-toggle; opens on Passive by default (MODE-01/MODE-02) | ✓ VERIFIED | `components/ModeSelector.tsx:5,13,22-49` — `StudyMode = 'passive' \| 'active'`, `useState<StudyMode>('passive')`, segmented toggle with `data-testid="mode-passive"`/`"mode-active"`; `e2e/active-flow.spec.ts` + `e2e/grade-flow.spec.ts` assert `aria-pressed="true"` on `mode-passive` pre-interaction and `toHaveCount(0)` for `mode-multiple-choice`/`mode-fill-blank`; both specs pass live |
| 2 | Multiple Choice fully removed (component, state, dispatch) (CLEANUP-01) | ✓ VERIFIED | `components/MultipleChoiceMode.tsx` absent from filesystem (confirmed); `grep -rE 'mcOptions\|seededShuffle\|MC_ADVANCE_MS\|mcSelected'` over `components/` returns zero hits |
| 3 | Standalone Fill-in-the-Blank fully removed (component, sub-toggle, state) (CLEANUP-02) | ✓ VERIFIED | `components/FillBlankMode.tsx` absent; `grep -rE 'fillInput\|normalizeAnswer\|FlashcardSubMode\|recallBlanked'` over `components/` returns zero hits |
| 4 | Active mode front shows English translation of the chosen sentence for matured cards (ACTIVE-01) | ✓ VERIFIED | `lib/active-prompt.ts:52` (`sentence-production` returns `chosenSentence.translation`), unit-tested (`tests/active-prompt.test.ts` "returns sentence-production…"); `components/FlashcardMode.tsx:112-114` renders `activeFace.prompt`; e2e asserts `active-prompt` visible on the promoted production card |
| 5 | Hidden-until-tapped hint reveals "Hint: {card.back}", resets on advance AND undo (ACTIVE-02) | ✓ VERIFIED | `components/FlashcardMode.tsx:117-133` (`hint-reveal-btn` → `hint-text` = `Hint: {card.back}`); `components/StudySession.tsx:506-507,557-558` reset `setHintRevealed(false)` in both the advance block and `handleUndo` (grep count = 2); e2e asserts hidden by default, visible after tap with "Hint:" prefix, absent after next advance |
| 6 | Main reveal shows full Korean sentence pinned to the SAME sentence prompted, with highlight, audio, tap-to-gloss; no cycling in Active (ACTIVE-03) | ✓ VERIFIED | `components/FlashcardMode.tsx:180-219` pins to `chosenSentence` (never `displayedSentence`) with `HighlightedSentence`+`AudioButton`+`onWordTap`; `cycle-example-btn` only renders in the Passive/degrade branch (line 275); e2e asserts `cycle-example-btn` count 0 on the production path |
| 7 | Self-grade on existing Again/Hard/Good/Easy bar; grade-anchor caption present (ACTIVE-04) | ✓ VERIFIED | `components/FlashcardMode.tsx:216-218` renders `active-anchor-caption` with the exact locked copy; action bar (`grade-again/hard/good/easy`) is shared/untouched (lines 319-362); e2e clicks `grade-good` and asserts the caption visible first |
| 8 | State ≤1 cards silently degrade to Passive face inside Active session; requeued cards re-derive face per render (ACTIVE-05) | ✓ VERIFIED | `lib/active-prompt.ts:49-50` (`isPractice`/`isNewCard` → `passive-degrade`, before the null-sentence check); `components/StudySession.tsx:343` derives `activeFace` in render scope from `queue[0]`-derived `isNewCard`/`chosenSentence` (no `useEffect`/snapshot); unit tests cover all rows; e2e's bounded session loop asserts `productionSeen >= 1 && degradeSeen >= 1` (non-vacuous) |
| 9 | Practice cards ALWAYS take the safe fallback before the new-card check; CR-01 fix confirmed live in code (D-04/D-15) | ✓ VERIFIED | `lib/active-prompt.ts:39,49` — `isPractice` routes to `passive-degrade` unconditionally (post-review fix; the original word-production-for-practice-cards design was found broken by code review and corrected). `lib/generate-practice.ts:5-10` confirms `PracticeCard.back` is genuinely mixed Korean+English (the exact defect condition) — the CR-01 regression test in `e2e/active-flow.spec.ts` mocks this shape and asserts the front never leaks it pre-reveal; ran live, passes |
| 10 | Existing Passive flow (grade/undo/requeue/audio/tap-to-gloss) has no regressions; full suite green (CLEANUP-04) | ✓ VERIFIED | Ran independently (not trusting SUMMARY): `npx tsc --noEmit` (0 errors in phase-28 files; 2 pre-existing unrelated errors in `tests/study-cards.test.ts`, documented pre-existing in `deferred-items.md`), `npm run lint` (0 errors, 1 pre-existing warning), `npm test` (248/248 passed), `npx playwright test` (33/33 passed), `npm run build` (clean) |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/ModeSelector.tsx` | Narrowed `StudyMode`, Passive/Active toggle, `begin-session-btn` launcher | ✓ VERIFIED | Matches interfaces-block contract exactly; `mode-passive`/`mode-active`/`begin-session-btn` all present and wired |
| `components/StudySession.tsx` | Single unconditional `FlashcardMode` dispatch; zero MC/fill state; `hintRevealed`+`activeFace` wiring | ✓ VERIFIED | One `<FlashcardMode .../>` render (line 649); `deriveActiveFace` imported and called in render scope (line 343); `hintRevealed` reset ×2 |
| `components/FlashcardMode.tsx` | Exposure-only + Active front/back branches; no sub-mode props | ✓ VERIFIED | Active branches gated on `studyMode === 'active' && activeFace.face !== 'passive-degrade'`; degrade path falls through unchanged (byte-identical markup, D-03) |
| `lib/active-prompt.ts` | Pure, total Active face derivation | ✓ VERIFIED | 53 lines, exports exactly `ActiveFace`+`deriveActiveFace`, no impure reads, no `'use client'`, no Prisma/Node imports |
| `tests/active-prompt.test.ts` | Unit coverage of all precedence rows | ✓ VERIFIED | 6 tests (5 planned + 1 added for CR-01 fix), all passing |
| `tests/sentence-selection.test.ts` | D-13 parity case | ✓ VERIFIED | "Active (needsBlank=false) picks the same index as Passive…" present and passing |
| `e2e/grade-flow.spec.ts` | Drives session entry via toggle; MODE-01/02 assertions | ✓ VERIFIED | Present, passing |
| `e2e/active-flow.spec.ts` | Full Active-mode e2e + CR-01 regression coverage | ✓ VERIFIED | 2 tests (main flow + CR-01/WR-03 regression), both passing |
| `e2e/helpers/mutate.ts` + `e2e/run-mutate.ts` | `promoteOneDueCardToProduction` pair, registered in OPS map | ✓ VERIFIED | `state: 2` set, `nextReview` left untouched; subprocess-delegated; registered |
| `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx` | Deleted | ✓ VERIFIED | Both absent from filesystem |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `ModeSelector.tsx` | `StudyClient.tsx` | `onSelect(mode, includeAI)` | ✓ WIRED | `handleModeSelect(selectedMode, includeAI)` signature narrowed; called at `ModeSelector` render site |
| `StudyClient.tsx` | `StudySession.tsx` | `mode` prop, narrowed `StudyMode` | ✓ WIRED | `mode: StudyMode` threaded through |
| `StudySession.tsx` | `lib/sentence-selection.ts` | `selectSentence(..., false)` (D-13) | ✓ WIRED | Literal `false` confirmed at call site (line 310) |
| `StudySession.tsx` | `lib/active-prompt.ts` | `deriveActiveFace(...)` in render | ✓ WIRED | Called every render from `queue[0]`-derived values, no snapshot |
| `FlashcardMode.tsx` | `StudySession.tsx` | `studyMode`/`activeFace`/`hintRevealed`/`onRevealHint` props | ✓ WIRED | All four props threaded (post-WR-02 rename applied consistently at both def and call site) |
| `e2e/active-flow.spec.ts` | `e2e/helpers/mutate.ts` | `promoteOneDueCardToProduction()` in `beforeEach` after `resetToBaseline()` | ✓ WIRED | Correct order confirmed in source and by passing run |
| `StudyClient.tsx` FreshnessWatcher blocks | (D-16 constraint) | byte-identical, gated on `phase`, never `mode` | ✓ VERIFIED UNCHANGED | `prevInitialCards`/`prevFreshStudy` blocks present, gate on `phase === 'select-mode'` only |

### Behavioral Spot-Checks / Suite Re-Run (independently executed, not trusted from SUMMARY)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Type-check | `npx tsc --noEmit` | 0 errors in phase-28 files; 2 pre-existing unrelated errors (`tests/study-cards.test.ts`, documented) | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing warning (`StudySession.tsx:300`, documented + code-commented as expected) | ✓ PASS |
| Unit tests | `npm test` | 19 files, 248/248 passed | ✓ PASS |
| E2E suite | `npx playwright test` | 33/33 passed (smoke, freshness×2, grade-flow, active-flow×2, perf) | ✓ PASS |
| Production build | `npm run build` | Clean, all routes generated | ✓ PASS |
| Dead-symbol grep | `grep -rE 'mcOptions\|seededShuffle\|MC_ADVANCE_MS\|mcSelected\|fillInput\|normalizeAnswer\|advanceTimer\|FlashcardSubMode\|recallBlanked' components/` | zero hits | ✓ PASS |
| Retired testid grep | `grep -rE 'mode-flashcard\|mode-multiple-choice\|mode-fill-blank' components/` | zero hits | ✓ PASS |
| Old hint testid/prop grep | `grep -rn 'hint-toggle\|onToggleHint' components/ e2e/ lib/` | zero hits (WR-02 rename fully applied) | ✓ PASS |
| Survivor check | `lib/generate-practice.ts` (fill-blank type), `lib/audit-checks.ts` (distractor checks) | both present and untouched | ✓ PASS |
| Debt-marker scan | `grep -nE 'TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER'` over phase-28 files | zero hits | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| MODE-01 | 28-01 | Passive/Active toggle replaces 3-mode grid | ✓ SATISFIED | ModeSelector rewrite + e2e assertions |
| MODE-02 | 28-01 | Passive default on load | ✓ SATISFIED | `useState<StudyMode>('passive')` + e2e `aria-pressed` check |
| ACTIVE-01 | 28-02 | English translation front for matured cards | ✓ SATISFIED | `deriveActiveFace` sentence-production row + unit/e2e |
| ACTIVE-02 | 28-02 | Hidden hint control, resets on advance/undo | ✓ SATISFIED | `hintRevealed` state + 2 reset sites + e2e hint flow |
| ACTIVE-03 | 28-02 | Pinned Korean reveal + audio + tap-to-gloss, no cycling | ✓ SATISFIED | Pinned to `chosenSentence`; `cycle-example-btn` absent on production faces |
| ACTIVE-04 | 28-02 | Self-grade with anchor caption | ✓ SATISFIED | `active-anchor-caption` rendered + e2e assertion |
| ACTIVE-05 | 28-02 | New-card silent degrade / graduation | ✓ SATISFIED (interpretation recorded) | `isNewCard` (state ≤1) degrades, state ≥2 produces — matches plan's explicitly recorded interpretation of a self-contradictory roadmap wording (see Note below); unit + e2e cover both paths |
| CLEANUP-01 | 28-01 | Multiple Choice fully removed | ✓ SATISFIED | File deleted, symbols gone (grep-verified) |
| CLEANUP-02 | 28-01 | Fill-in-the-Blank retired | ✓ SATISFIED | File deleted, symbols gone (grep-verified) |
| CLEANUP-04 | 28-01/28-02 | No Passive regressions, full suite green | ✓ SATISFIED | Full suite independently re-run green (tsc/lint/unit/e2e/build) |

No orphaned requirements: all 10 phase-28 requirement IDs from `REQUIREMENTS.md`'s "Phase 28" mapping appear in the merged PLAN frontmatter `requirements:` lists (28-01: MODE-01, MODE-02, CLEANUP-01, CLEANUP-02, CLEANUP-04; 28-02: ACTIVE-01..05, CLEANUP-04). CLEANUP-03 is correctly mapped to Phase 29, not phase 28, per `REQUIREMENTS.md` and the ROADMAP — out of scope here.

**Note on ACTIVE-05 / ROADMAP wording:** `ROADMAP.md`'s Phase 28 Success Criterion 5 says a new card "graduates to full Active production once state ≥ 1," which contradicts its own opening clause ("state 0/1... falls back to Passive"). The plan recorded this as a roadmap wording slip and implemented the internally-consistent existing-codebase semantics (`isNewCard = state <= 1` degrades; state ≥ 2 produces), matching `showBareFront`'s pre-existing pattern and the Core Value (new words never production-prompted). This is a documented interpretation, not a silent deviation, and the resulting behavior is verified in code/tests. Flagging here for visibility rather than as a gap, since the implemented behavior is the more defensible reading and was explicit in the plan before execution.

### Anti-Patterns Found

None. No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER), no stub returns, no hardcoded-empty props, no `dangerouslySetInnerHTML` in any phase-28-touched file.

### Code Review Findings — Fix Verification

The phase's own code review (`28-REVIEW.md`) found 1 critical + 3 warnings (1 info excluded by scope). All 4 in-scope findings were independently re-verified as fixed in the current codebase (not merely claimed in `28-REVIEW-FIX.md`):

| Finding | Fix Verified Live? | Evidence |
|---------|--------------------|----------|
| CR-01 (practice-card leak) | ✓ Yes | `lib/active-prompt.ts:39,49` routes `isPractice` to `passive-degrade` unconditionally; `tests/active-prompt.test.ts` has 2 tests confirming this; `e2e/active-flow.spec.ts` has a dedicated mocked-practice-card regression test, run live and passing |
| WR-01 (hint button loses accessible name) | ✓ Yes | `components/FlashcardMode.tsx:122` — `aria-label={hintRevealed ? 'Hint shown' : 'Show hint'}` present |
| WR-02 (misleading toggle naming) | ✓ Yes | `grep -rn 'hint-toggle\|onToggleHint'` over `components/`, `e2e/`, `lib/` returns zero hits; renamed to `hint-reveal-btn`/`onRevealHint` everywhere, `disabled={hintRevealed}` present |
| WR-03 (no Active+AI-practice test coverage) | ✓ Yes | Second test in `e2e/active-flow.spec.ts`, mocks `POST /api/generate`, asserts no leak pre-reveal; ran live, passes |

### Human Verification Required

2 items — both explicitly deferred to end-of-phase manual UAT by the plan's own Task 2 `<human-check>` block (28-02-PLAN.md), not skipped by the executor:

#### 1. Mid-session face graduation (state 1 → 2 visible flip)

**Test:** In `npm run dev`, start an Active-mode session; grade a state-1 card Good/Easy repeatedly until FSRS requeues it at state ≥ 2.
**Expected:** The same card, reappearing later in the same session, visibly renders the English-prompt production face instead of the Passive/exposure face it showed on its earlier appearance.
**Why human:** This is a live perceptual state transition across two appearances of the same card within one running session. `activeFace`'s render-scope, no-snapshot derivation is code-verified (grep + unit tests) and the e2e suite proves both faces appear somewhere in a session (`productionSeen >= 1 && degradeSeen >= 1`), but neither pins the same card visibly changing face — that specific moment is what the plan calls out as needing eyes-on confirmation.

#### 2. Hint control placement and micro-interaction feel

**Test:** Tap through the hint control on a sentence-production card in dev.
**Expected:** Placement/animation/legibility match UI-SPEC intent — no jank, readable disabled state after tap.
**Why human:** Visual/interaction quality judgment, not mechanically verifiable.

### Gaps Summary

None. All 10 must-have truths, all required artifacts, all key links, and all requirement IDs are verified present, substantive, and wired in the current codebase (independently re-run, not trusted from SUMMARY claims). The one Critical + three Warning code-review findings were independently confirmed fixed in the live source (not just asserted in 28-REVIEW-FIX.md). The full suite (tsc, lint, 248 unit tests, 33 e2e tests, production build) was re-run fresh during this verification and is green. The only outstanding item is the two-item manual UAT the plan itself deferred to human judgment (visual/perceptual checks) — this routes the phase to `human_needed`, not `gaps_found`.

---

_Verified: 2026-07-14T16:25:59Z_
_Verifier: Claude (gsd-verifier)_
