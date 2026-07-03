---
phase: 15-studysession-refactor-sentence-selection-memoization
plan: 02
subsystem: ui
tags: [react, client-component, refactor, mode-split, study-session]

# Dependency graph
requires:
  - phase: 15-studysession-refactor-sentence-selection-memoization
    provides: "Plan 01's memoized selectSentence/hashStr in lib/sentence-selection.ts, reused unchanged by the mode dispatch this plan adds"
  - phase: 13-review-api-hardening-undo-reliability
    provides: "locked StudySession behavior (postReviewWithRetry, isMountedRef, saveError/Toast, atomic handleUndo) that this refactor must preserve byte-for-byte"
provides:
  - "components/FlashcardMode.tsx — presentational flip-card face + Show Answer/grade action bar"
  - "components/MultipleChoiceMode.tsx — presentational options grid + Next action bar"
  - "components/FillBlankMode.tsx — presentational fill-input + Check Answer/Wrong/Correct action bar"
  - "components/StudySession.tsx slimmed to header + progress ring + three-way mode dispatch; exports Card, PracticeCard, Sentence types"
affects: [components/StudySession.tsx, any future phase touching study-mode UI]

# Tech tracking
tech-stack:
  added: []  # no new packages — pure internal component-split refactor
  patterns:
    - "Presentational mode components each own their full card face + sticky action bar (no shared render-prop/slot abstraction)"
    - "Session state (queue/stats/undo/save-retry) stays exclusively in the parent orchestrator; mode components receive only derived values + callbacks"
    - "Type-only import cycle between StudySession (source of truth for Card/PracticeCard/Sentence) and the mode components (erased at build, safe)"

key-files:
  created:
    - components/FlashcardMode.tsx
    - components/MultipleChoiceMode.tsx
    - components/FillBlankMode.tsx
  modified:
    - components/StudySession.tsx

key-decisions:
  - "Widened mode-component card prop from Card to Card | PracticeCard (exported PracticeCard) — currentCard is the StudyItem discriminated union at the call site; mode components only touch fields common to both (type/front/back/notes), so the union is the accurate prop type. The plan's narrower 'card: Card' failed the build type-check (Rule 3 auto-fix, documented in bc98179)."
  - "handleMcSelect added as a parent handler reproducing the inline MC onClick (set mcSelected + arm advanceTimer); advanceTimer/MC_ADVANCE_MS/advanceMc stay in the parent so timer lifecycle isn't split across components."
  - "FlashcardMode calls useWordTap() internally rather than receiving it as a prop — the sole hook call permitted inside a mode component per RESEARCH Pitfall 4."
  - "Now-unused imports (HighlightedSentence, useWordTap, AudioButton) and the parent's own useWordTap() call removed from StudySession after the move, keeping lint clean."

patterns-established:
  - "Pattern: split a large per-mode conditional render into sibling presentational components, each importing its shared types from the parent as `import type {...} from './Parent'` rather than promoting them to a separate types file — avoids churn for a two-file relationship."

requirements-completed: [REFACTOR-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "StudySession renders each study mode through a dedicated FlashcardMode/MultipleChoiceMode/FillBlankMode sub-component selected by the mode prop; the giant inline per-mode conditional JSX block no longer lives in StudySession"
    requirement: REFACTOR-01
    verification:
      - kind: other
        ref: "grep -c '<FlashcardMode\\|<MultipleChoiceMode\\|<FillBlankMode' components/StudySession.tsx → 3"
        status: pass
      - kind: other
        ref: "grep -c 'card-flip-inner' components/StudySession.tsx → 0 (inline flip JSX fully removed from parent)"
        status: pass
      - kind: unit
        ref: "npm test (75 tests, 8 files) — full suite including tests/sentence-selection.test.ts"
        status: pass
      - kind: other
        ref: "npm run lint (0 errors) && npm run build (succeeds)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each mode sub-component renders its own card-face wrapper AND its own sticky action bar with mode-specific buttons; no shared render-prop/slot abstraction introduced; session-owned state and the Phase 13 hardening pipeline stay entirely in the StudySession parent"
    requirement: REFACTOR-01
    verification:
      - kind: other
        ref: "grep -c 'sticky bottom-' components/FlashcardMode.tsx components/MultipleChoiceMode.tsx components/FillBlankMode.tsx → 1 each"
        status: pass
      - kind: other
        ref: "grep -c 'useState\\|useRef' components/MultipleChoiceMode.tsx components/FillBlankMode.tsx → 0 each; components/FlashcardMode.tsx → 0 (only useWordTap)"
        status: pass
      - kind: other
        ref: "grep -c 'postReviewWithRetry\\|isMountedRef\\|undoRef.current = {' components/StudySession.tsx → 3+ (Phase 13 pipeline intact in parent)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A live study session behaves identically to before: flip, grade all four ratings, undo, Exposure/Recall toggle, and switching between the three modes all work with no regression"
    requirement: REFACTOR-01
    verification:
      - kind: manual_procedural
        ref: "Live UAT per Task 3 how-to-verify steps: flip/grade (Again/Hard/Good/Easy), undo restores queue+counter+ring, Exposure/Recall toggle (bare-word-first + blank-safe sentence), MC options grid + keyboard 1-4, Fill-blank type+Enter/Check Answer + keyboard 1/3, AudioButton + tap-to-gloss, offline save-failure toast"
        status: pass
    human_judgment: true
    rationale: "No component-rendering test infrastructure (@testing-library/react/jsdom) exists in this codebase (vitest.config.ts environment: node), and REQUIREMENTS.md Out-of-Scope explicitly excludes UI component test coverage. Behavior-preservation across the mode split can only be confirmed by a human driving a real study session; user completed the Task 3 how-to-verify checklist and typed the resume-signal 'approved'."

# Metrics
duration: ~15 min (Tasks 1+2 execution) + human verification pause
completed: 2026-07-03
status: complete
---

# Phase 15 Plan 02: StudySession Mode-Split Summary

**Three presentational `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` client components carved out of `StudySession.tsx`'s 300-line inline conditional; parent slimmed to header + progress + a three-way mode dispatch — human-verified with zero behavior regression**

## Performance

- **Duration:** ~15 min (Tasks 1+2), plus a human-verification pause for Task 3
- **Started:** 2026-07-02T23:46:49Z
- **Completed:** 2026-07-03T00:51:24Z (code); human "approved" received in a prior session
- **Tasks:** 3 (2 auto + 1 blocking human-verify checkpoint)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- Extracted the flashcard flip face + grade action bar into `components/FlashcardMode.tsx` (owns `useWordTap()` internally, receives `frontRef`/`backRef`/`againBtnRef` for parent-owned height measurement and reveal focus)
- Extracted the multiple-choice options grid + Next action bar into `components/MultipleChoiceMode.tsx` (computes `isCorrect`/`isSelected`/`hasAnswered` locally from `selected` + `card.back`)
- Extracted the fill-in-the-blank input + Check Answer/Wrong/Correct action bar into `components/FillBlankMode.tsx`
- Slimmed `StudySession.tsx`'s return body to the outer container (undo/End header, `saveError` Toast, progress ring) plus a single three-way `mode === 'flashcard' ? <FlashcardMode/> : mode === 'multiple-choice' ? <MultipleChoiceMode/> : <FillBlankMode/>` dispatch — net −266 lines in the parent
- All session state (`queue`, `cursor`, `stats`, `seenCardIdsRef`, `undoRef`, `saveError`/`isMountedRef`), the Phase 13 hardening pipeline (`postReviewWithRetry`, atomic `handleUndo`), and both `useMemo`s (`mcOptions`, `chosenIdx`/`selectSentence` from Plan 01) stay unchanged in the parent — zero session-state hooks introduced in any mode component
- Live study-session UAT completed and approved by the user: flip/grade (all 4 ratings), undo, Exposure/Recall toggle, all three mode switches, audio, and tap-to-gloss all behave identically to the pre-refactor session
- Full suite green throughout (75 tests, 8 files), lint clean (0 errors, 1 pre-existing `exhaustive-deps` warning on `cardSentences ?? []` per Plan 01), build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Create FlashcardMode, MultipleChoiceMode, FillBlankMode presentational components** - `89c32b1` (feat)
2. **Task 2: Slim StudySession to header + progress + three-way mode dispatch** - `bc98179` (refactor)
3. **Task 3: Live UAT — study session behaves identically to before** - human resume-signal "approved" (no code commit; verification-only checkpoint)

**Plan metadata:** this SUMMARY commit (docs: complete plan)

## Files Created/Modified
- `components/FlashcardMode.tsx` — NEW: `'use client'` presentational component; 3D flip card face (`frontRef`/`backRef`/`cardHeight`), Show Answer / 4 grade buttons, "See another example →", calls `useWordTap()` internally.
- `components/MultipleChoiceMode.tsx` — NEW: `'use client'` presentational component; options grid with per-option correctness coloring, Next action bar.
- `components/FillBlankMode.tsx` — NEW: `'use client'` presentational component; blanked-sentence/word-prompt input, reveal panel with "Hear it" audio, Check Answer / Wrong / Correct action bar.
- `components/StudySession.tsx` — MODIFIED: return body reduced to outer container + header (undo/End) + `saveError` Toast + progress ring + three-way mode dispatch; exports `Card`, `PracticeCard`, `Sentence` types for the mode components to import type-only; removed now-unused `HighlightedSentence`/`useWordTap`/`AudioButton` imports and the parent's own `useWordTap()` call; added `handleMcSelect` parent handler. Net −334 lines removed / +68 added (dispatch + type exports + handler) per `bc98179`.

## Decisions Made
- Widened the mode-component card prop from `Card` to `Card | PracticeCard` (exported `PracticeCard`) — `currentCard` at the call site is the `StudyItem` discriminated union; mode components only read fields common to both (`type`/`front`/`back`/`notes`), so the union is the accurate type. The plan's narrower `card: Card` was an overspecification that failed the build type-check — fixed as part of Task 2 (documented inline in `bc98179`).
- `handleMcSelect` added to the parent to reproduce the inline MC `onClick` (set `mcSelected`, arm `advanceTimer`) — keeps `advanceTimer`/`MC_ADVANCE_MS`/`advanceMc` timer lifecycle entirely in `StudySession`.
- `FlashcardMode` calls `useWordTap()` internally instead of receiving it as a prop — the one hook call permitted inside a mode component, per RESEARCH Pitfall 4.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened mode-component card prop from `Card` to `Card | PracticeCard`**
- **Found during:** Task 2 (slimming StudySession's return body)
- **Issue:** The plan specified `card: Card` on each mode component's Props, but `currentCard` (the value actually passed at the call site) is typed as the `StudyItem` discriminated union (`Card | PracticeCard`), so the build's TypeScript check failed on the narrower prop type.
- **Fix:** Exported `PracticeCard` from `StudySession.tsx` alongside `Card`/`Sentence`, and widened each mode component's `card` prop to `Card | PracticeCard`. Mode components only ever read `type`/`front`/`back`/`notes`, which both union members share, so no runtime behavior changed.
- **Files modified:** components/FlashcardMode.tsx, components/MultipleChoiceMode.tsx, components/FillBlankMode.tsx, components/StudySession.tsx
- **Verification:** `npm run build` succeeds (type-checks the widened prop); `npm run lint` clean; `npm test` full suite green.
- **Committed in:** bc98179 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type-check fix)
**Impact on plan:** Necessary correction for the build to type-check; no behavior change and no scope creep — the union was already the real runtime type flowing through the parent.

## Issues Encountered
None beyond the type-widening fix documented above.

## User Setup Required
None — no external service configuration required. Pure internal component-split refactor; zero new packages, routes, or env vars.

## Next Phase Readiness
- Phase 15 (StudySession Refactor & Sentence-Selection Memoization) is now feature-complete: both plans done, all 5 ROADMAP success criteria met (pure tested sentence-selection module, memoized selection, three-way mode dispatch, live-UAT-confirmed no-regression, lint/test green).
- v1.3 (Reliability & Hardening) milestone is complete — all three phases (13, 14, 15) done and verified.
- No blockers for milestone close-out / next-milestone planning.

---
*Phase: 15-studysession-refactor-sentence-selection-memoization*
*Completed: 2026-07-03*
