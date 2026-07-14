---
phase: 28-active-recall-study-mode
plan: 01
subsystem: ui
tags: [react, nextjs, typescript, study-session, flashcards, playwright]

# Dependency graph
requires:
  - phase: 27-e2e-test-infrastructure-baselines
    provides: e2e/grade-flow.spec.ts baseline (bounded-loop, DB-backstop patterns) and seeded test DB
provides:
  - StudyMode narrowed to 'passive' | 'active' (ModeSelector.tsx)
  - Single Passive/Active segmented toggle replacing the 3-mode grid + Exposure/Recall sub-toggle
  - Multiple Choice mode fully removed (component, session state, dispatch)
  - Standalone Fill-in-the-Blank mode fully removed (component, session state, dispatch)
  - Narrowed StudySession/FlashcardMode surface ready for the Active production branch (Plan 28-02)
  - grade-flow e2e spec driving session entry via the new toggle, asserting MODE-01/MODE-02
affects: [28-02-active-flashcard-face]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-14 type-narrow-first removal: narrow the exported union type first, then let tsc enumerate every stale call site across the dependent component chain instead of manual grep-and-delete"

key-files:
  created: []
  modified:
    - components/ModeSelector.tsx
    - components/StudyClient.tsx
    - components/StudySession.tsx
    - components/FlashcardMode.tsx
    - e2e/grade-flow.spec.ts
  deleted:
    - components/MultipleChoiceMode.tsx
    - components/FillBlankMode.tsx

key-decisions:
  - "D-14 removal sequence followed exactly: narrowed StudyMode in ModeSelector.tsx first, then iterated npx tsc --noEmit until clean rather than grep-deleting symbols ahead of time"
  - "P-01: added a dedicated begin-session-btn launcher below the AI checkbox since a selectable toggle (unlike the old tap-to-launch grid) must not fire onSelect on selection"
  - "P-02: mode-select heading changed to 'How do you want to study?' (Sheet title 'Study options' unchanged)"
  - "D-13: needsBlank collapsed to a literal false passed into selectSentence; the lib parameter and its tests are kept as accepted debt this milestone"
  - "D-16: StudyClient's prevInitialCards/prevFreshStudy FreshnessWatcher blocks verified byte-identical via git diff — no changes"

patterns-established:
  - "Neutral segmented-toggle styling (bg-surface-3 shell, bg-surface-1 selected pill) reused unchanged from the retired Exposure/Recall sub-toggle for the new Passive/Active toggle — accent color reserved for the Start session / Show Answer CTAs only"

requirements-completed: [MODE-01, MODE-02, CLEANUP-01, CLEANUP-02, CLEANUP-04]

coverage:
  - id: D1
    description: "/study mode-select sheet shows a single Passive/Active segmented toggle; no 3-mode grid, no Multiple Choice option, no standalone Fill-in-the-Blank option, no Exposure/Recall sub-toggle"
    requirement: "MODE-01"
    verification:
      - kind: e2e
        ref: "e2e/grade-flow.spec.ts#full flashcard session: reveal → grade → queue advance → completion"
        status: pass
      - kind: other
        ref: "grep -rE 'mode-flashcard|mode-multiple-choice|mode-fill-blank' components/ (zero hits)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Passive is the selected segment when the sheet opens, before any user interaction"
    requirement: "MODE-02"
    verification:
      - kind: e2e
        ref: "e2e/grade-flow.spec.ts — asserts mode-passive aria-pressed=true before any tap"
        status: pass
    human_judgment: false
  - id: D3
    description: "Multiple Choice is fully removed: component file deleted, selector option gone, all MC session state gone from StudySession"
    requirement: "CLEANUP-01"
    verification:
      - kind: other
        ref: "test ! -f components/MultipleChoiceMode.tsx && grep -rE 'mcOptions|MC_ADVANCE_MS|mcSelected' components/ (zero hits)"
        status: pass
      - kind: unit
        ref: "npm test (241 passed) + npx tsc --noEmit (clean for touched files)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fill-in-the-Blank is retired as a standalone mode: component file deleted, sub-toggle gone, all fill session state gone"
    requirement: "CLEANUP-02"
    verification:
      - kind: other
        ref: "test ! -f components/FillBlankMode.tsx && grep -rE 'fillInput|normalizeAnswer|FlashcardSubMode|recallBlanked' components/ (zero hits)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Passive flow (reveal, grade, undo, requeue, audio, tap-to-gloss) works end-to-end via the updated e2e grade-flow spec"
    requirement: "CLEANUP-04"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/grade-flow.spec.ts (2 passed)"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-14
status: complete
---

# Phase 28 Plan 1: Retire MC/Fill-blank, add Passive/Active toggle Summary

**Narrowed `StudyMode` to `'passive' | 'active'` via tsc-driven removal, deleted Multiple Choice and standalone Fill-in-the-Blank entirely, and replaced the 3-mode grid with a single Passive/Active segmented toggle (Passive default) on `/study`.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-14
- **Tasks:** 2 completed
- **Files modified:** 5 modified, 2 deleted

## Accomplishments
- `ModeSelector.tsx` rewritten: `StudyMode` narrowed to `'passive' | 'active'`, `FlashcardSubMode` export deleted, 3-mode grid + Exposure/Recall sub-toggle replaced with a single segmented Passive/Active toggle (Passive selected on mount, MODE-02), heading changed to "How do you want to study?" (P-02), a new `begin-session-btn` launcher added below the unchanged AI checkbox (P-01)
- `components/MultipleChoiceMode.tsx` and `components/FillBlankMode.tsx` deleted; every MC/fill session-state symbol, handler, keyboard branch, and dispatch arm removed from `StudySession.tsx` per the D-14 dead-symbol inventory (verified by grep in acceptance criteria)
- `StudySession.tsx` narrowed: `needsBlank` collapsed to a literal `false` into `selectSentence` (D-13), `showBareFront` dropped its sub-mode clause, 1-4 keyboard grading is now unconditional for both modes, and the three-way mode-dispatch ternary collapsed to a single unconditional `<FlashcardMode/>` render — file shrank from 837 to 654 lines
- `StudyClient.tsx` mechanically updated (sub-mode threading removed, `handleModeSelect` loses its third param); the `prevInitialCards`/`prevFreshStudy` FreshnessWatcher gate blocks (D-16) verified untouched via `git diff`
- `FlashcardMode.tsx` recall front-face arm deleted; header prose updated to describe the shared Passive-only faces (Active production branch is Plan 28-02's scope)
- `e2e/grade-flow.spec.ts` updated to assert MODE-02 (Passive `aria-pressed="true"` before interaction) and MODE-01 (retired mode testids resolve to zero DOM elements), then drives session entry via `mode-passive` + `begin-session-btn` explicitly

## Task Commits

Each task was committed atomically:

1. **Task 1: Type-narrow StudyMode, delete MC/fill/sub-toggle, rewrite ModeSelector** - `a607074` (feat)
2. **Task 2: Update e2e grade-flow spec to drive the toggle explicitly** - `258d383` (test)

_No plan-metadata commit was made — per this execution's instructions, STATE.md/ROADMAP.md updates and the final docs commit are owned by the orchestrator, not this executor run._

## Files Created/Modified
- `components/ModeSelector.tsx` - Rewritten: narrowed `StudyMode` type, Passive/Active segmented toggle, `begin-session-btn` launcher
- `components/StudyClient.tsx` - Sub-mode threading removed; `handleModeSelect` signature narrowed; FreshnessWatcher blocks untouched
- `components/StudySession.tsx` - MC/fill state, handlers, keyboard branches, and dispatch collapsed; `needsBlank` literal-false; `showBareFront` sub-mode clause dropped
- `components/FlashcardMode.tsx` - Recall front-face arm deleted; header prose updated; props narrowed (no more `flashcardSubMode`/`recallBlanked`)
- `components/MultipleChoiceMode.tsx` - Deleted
- `components/FillBlankMode.tsx` - Deleted
- `e2e/grade-flow.spec.ts` - Session entry drives the new toggle explicitly; asserts MODE-01/MODE-02

## Decisions Made
- Followed the D-14 removal sequence exactly: narrowed the type first, then iterated `npx tsc --noEmit` to find every stale reference rather than pre-emptively grepping and deleting (per the plan's explicit instruction not to grep-delete ahead of the compiler)
- P-01/P-02 copy and launcher decisions (recorded in the plan) applied as specified: "Start session" launcher button, "How do you want to study?" heading, Sheet title unchanged
- Kept `selectSentence`'s `needsBlank` lib parameter and its existing tests as accepted debt this milestone (D-13) rather than removing the parameter entirely — only the call site collapsed to a literal `false`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree `node_modules` had no local install, breaking the e2e spec's `resetToBaseline()`**
- **Found during:** Task 2 (running `npx playwright test e2e/grade-flow.spec.ts`)
- **Issue:** This worktree's `node_modules` contained only cache directories (no `.bin` symlinks), so `e2e/seed.ts`'s `execFileSync(node_modules/.bin/tsx, ...)` failed with `ENOENT`. Confirmed via `git stash` that this was pre-existing (unrelated to any code change in this plan) — an environment-provisioning gap in the worktree, not a plan defect.
- **Fix:** Ran `npm ci` against the existing, unmodified `package-lock.json` (verified byte-identical to the main repo's lockfile) — restored the already-locked dependency tree; no new packages were resolved or added.
- **Files modified:** none tracked (`node_modules/` is gitignored)
- **Verification:** `npx playwright test e2e/grade-flow.spec.ts` — 2 passed
- **Committed in:** n/a (no trackable file changes from `npm ci`)

Logged additionally to `.planning/phases/28-active-recall-study-mode/deferred-items.md` for visibility across parallel worktrees.

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only)
**Impact on plan:** No code-level deviation from the plan. The fix was purely local environment provisioning (dependency restore from an unchanged lockfile) required to run the e2e verification step; no plan file, behavior, or scope was affected.

## Issues Encountered
- Two pre-existing, out-of-scope issues were discovered and left untouched per the scope-boundary rule (verified via `git stash` to be present on the pre-28-01 baseline): (1) `tests/study-cards.test.ts` has 2 implicit-`any` tsc errors unrelated to any file this plan touches; (2) `components/StudySession.tsx` carries one pre-existing `react-hooks/exhaustive-deps` lint *warning* (not an error — `npm run lint` still exits 0) on the `chosenIdx` memo, which the existing code comment explicitly documents as expected and not to be "fixed". Both logged in `deferred-items.md`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `StudySession`/`FlashcardMode` surface is narrowed and clean (837 → 654 lines in `StudySession.tsx`), ready for Plan 28-02 to add the Active production-mode front/back branches to `FlashcardMode.tsx`
- **Intermediate-state note (expected, documented in the plan):** selecting "Active" on `/study` currently starts a session that still renders the shared Passive faces — this is correct and expected until Plan 28-02 lands; the phase cannot close in this state
- All survivors verified unchanged: `lib/generate-practice.ts`'s `'fill-blank'` practice-card type, `lib/card-style.ts`'s badge map, `lib/audit-checks.ts`'s distractor checks

---
*Phase: 28-active-recall-study-mode*
*Completed: 2026-07-14*

## Self-Check: PASSED

All claimed files verified present (`components/ModeSelector.tsx`, `StudyClient.tsx`,
`StudySession.tsx`, `FlashcardMode.tsx`, `e2e/grade-flow.spec.ts`, this SUMMARY.md,
`deferred-items.md`); both deletions verified absent
(`components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx`); both task
commits (`a607074`, `258d383`) verified present in `git log --oneline --all`.
