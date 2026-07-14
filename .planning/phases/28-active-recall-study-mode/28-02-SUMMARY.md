---
phase: 28-active-recall-study-mode
plan: 02
subsystem: ui
tags: [react, nextjs, typescript, study-session, flashcards, fsrs, playwright, vitest]

# Dependency graph
requires:
  - phase: 28-active-recall-study-mode (plan 01)
    provides: StudyMode narrowed to 'passive' | 'active', single Passive/Active toggle, MC/fill-blank fully removed, narrowed StudySession/FlashcardMode surface ready for the Active production branch
provides:
  - "lib/active-prompt.ts: pure deriveActiveFace() — the four-row Active face precedence (practice -> passive-degrade -> zero-sentence -> sentence-production)"
  - "Active production mode fully wired into FlashcardMode/StudySession: English prompt front, hidden-until-tapped hint, pinned Korean reveal with audio/gloss, grade-anchoring caption"
  - "ACTIVE-05 new-card gate: state <=1 real cards silently degrade to the Passive/exposure face inside an Active session"
  - "e2e/active-flow.spec.ts + promoteOneDueCardToProduction mutate helper: full Active-mode e2e coverage against a genuinely production-eligible card"
  - "Full unit + e2e suite green at phase close (CLEANUP-04) — phase 28 complete"
affects: [29-distractor-write-side-retirement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure face-derivation module (lib/active-prompt.ts) mirroring lib/sentence-selection.ts's conventions: discriminated-union return type, structural (not DTO) input types, precedence documented in the module header"
    - "Parent-owned, render-derived mode-state (hintRevealed, activeFace) rather than child-local useState — required because FlashcardMode is not remounted per card, only its inner key={cursor} div is"

key-files:
  created:
    - lib/active-prompt.ts
    - tests/active-prompt.test.ts
    - e2e/active-flow.spec.ts
  modified:
    - tests/sentence-selection.test.ts
    - components/StudySession.tsx
    - components/FlashcardMode.tsx
    - e2e/helpers/mutate.ts
    - e2e/run-mutate.ts
    - e2e/freshness-gate.spec.ts
    - e2e/freshness-fresh-paths.spec.ts

key-decisions:
  - "ACTIVE-05 interpretation recorded per plan: existing isNewCard semantics (state <= 1 degrades, state >= 2 produces) — the requirement's 'graduate once state >= 1' wording is a slip against its own 'state 0/1 degrade' opening (Pitfall N-2, Assumption A1)"
  - "Active back face keeps the card.front/card.back word-gloss block (card-front-word testid survives) and drops only the redundant sentence-translation line (Open Q2, Assumption A2)"
  - "Word-production fallback omits the hint control entirely — the prompt already IS the English gloss, so showing 'Hint: {card.back}' would be circular (P-03)"
  - "cycle-example-btn (See another example) renders whenever the shared Passive/degrade back branch is reached — i.e. genuine Passive mode AND Active-degrade both show it, since D-03 requires byte-identical rendering on the degrade path; it is absent only for the two genuine Active production faces"
  - "Purity-guarantee JSDoc line in lib/active-prompt.ts reworded to avoid literally containing the strings 'Date.now()'/'Math.random()' (which would have false-tripped the plan's own literal verify grep) while preserving the same guarantee"

patterns-established:
  - "Active face precedence as a pure, total, unit-tested function — any future mode/face needing similar new-card-aware branching should follow lib/active-prompt.ts's shape rather than inlining conditionals in the component"

requirements-completed: [ACTIVE-01, ACTIVE-02, ACTIVE-03, ACTIVE-04, ACTIVE-05, CLEANUP-04]

coverage:
  - id: D1
    description: "deriveActiveFace() implements the locked four-row precedence (practice -> word-production, new real card -> passive-degrade, matured zero-sentence -> word-production, matured with sentence -> sentence-production), unit-tested for all rows plus explicit practice-precedes-new-card ordering"
    requirement: "ACTIVE-01"
    verification:
      - kind: unit
        ref: "tests/active-prompt.test.ts (5 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Active front shows a hidden-until-tapped hint control ('Show hint' -> 'Hint: {card.back}'), distinct from and preceding the main reveal; resets on both advance and undo"
    requirement: "ACTIVE-02"
    verification:
      - kind: e2e
        ref: "e2e/active-flow.spec.ts#Active mode: toggle entry, production front, hint flow, pinned reveal, silent degrade, grading"
        status: pass
    human_judgment: false
  - id: D3
    description: "Main reveal pins to chosenSentence (never the cycling displayedSentence) with HighlightedSentence + AudioButton + tap-to-gloss; no example cycling in Active (cycle-example-btn absent on production faces)"
    requirement: "ACTIVE-03"
    verification:
      - kind: e2e
        ref: "e2e/active-flow.spec.ts (cycle-example-btn asserted absent on the production path)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Self-grade on the existing Again/Hard/Good/Easy bar after reveal, with the grade-anchoring caption present on sentence-production reveals"
    requirement: "ACTIVE-04"
    verification:
      - kind: e2e
        ref: "e2e/active-flow.spec.ts (active-anchor-caption asserted visible; grade-good clicked)"
        status: pass
    human_judgment: false
  - id: D5
    description: "State <=1 real cards silently degrade to the Passive/exposure face inside an Active session (no badge, no copy); a requeued card re-derives its face per render; the promoted state-2 card renders production"
    requirement: "ACTIVE-05"
    verification:
      - kind: unit
        ref: "tests/active-prompt.test.ts (new-card degrade rows, including the null-sentence Core Value case)"
        status: pass
      - kind: e2e
        ref: "e2e/active-flow.spec.ts (productionSeen >= 1 AND degradeSeen >= 1 asserted; degrade path asserts active-prompt/hint-toggle absent)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Mid-session face graduation (state 1 -> 2 flips exposure -> production visibly) and hint-control placement/feel — manual UAT"
    verification: []
    human_judgment: true
    rationale: "Visual/interaction feel (micro-interaction of the hint reveal, the live face-flip moment) requires human judgment per the plan's Task 2 human-check; not mechanically verifiable beyond the e2e assertions already covering the underlying logic"
  - id: D7
    description: "Full unit + e2e suite green at phase close: npm test (247 passed) and npx playwright test (32 passed, all specs incl. smoke, freshness x4, grade-flow, active-flow, perf)"
    requirement: "CLEANUP-04"
    verification:
      - kind: unit
        ref: "npm test — 19 files, 247 tests passed"
        status: pass
      - kind: e2e
        ref: "npx playwright test — 32 tests passed"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-07-14
status: complete
---

# Phase 28 Plan 2: Active production mode + full-suite phase gate Summary

**Wired the Active recall face (English prompt -> hidden hint -> pinned Korean reveal + audio/gloss -> anchored self-grade) into FlashcardMode/StudySession via a new pure `lib/active-prompt.ts` derivation, added e2e coverage against a state-promoted production-eligible card, and closed Phase 28 with the complete unit + Playwright suite green.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-14
- **Tasks:** 3 completed
- **Files modified:** 3 created, 7 modified

## Accomplishments
- `lib/active-prompt.ts` (new, ~40 lines): pure `deriveActiveFace()` implementing the locked four-row precedence — practice card -> word-production (before the new-card check), real card state <=1 -> passive-degrade (checked before the zero-sentence fallback — Core Value), matured zero-sentence -> word-production, matured with a chosen sentence -> sentence-production. Unit-tested with 5 tests covering all rows plus the explicit practice-precedes-new-card ordering.
- `tests/sentence-selection.test.ts` gained the D-13 parity test: Active (`needsBlank=false`) picks the same sentence index as Passive when the least-unknown sentence is blank-unsafe.
- `StudySession.tsx`: parent-owned `hintRevealed` state (reset alongside `revealed` in both the `submitReview` advance block and `handleUndo`'s restore); `activeFace` derived in render scope from `queue[0]`-derived values (`isNewCard`, `chosenSentence`, `isPractice`) so a requeued card re-derives its face every render — a state-1 card graded up mid-session correctly flips from degrade to production on its next appearance (Pitfall N-3).
- `FlashcardMode.tsx`: new Active front branch (English prompt, hint pill for sentence-production only, "Translate this, then reveal" caption) and back branch (pinned `chosenSentence` reveal with audio/gloss + grade-anchoring caption for sentence-production; bare-word block for word-production with no anchor caption per P-03). State <=1 real cards and genuine Passive sessions fall through to the exact same existing branches — byte-identical rendering, no new markup on the degrade path (D-03/D-10).
- `e2e/helpers/mutate.ts` + `e2e/run-mutate.ts`: new `promoteOneDueCardToProduction[Direct]` pair promotes one seeded due card (state 1 -> 2) while keeping `nextReview` in the past, so an Active-mode e2e spec has a genuinely production-eligible card without touching `FIXTURE.dueCards`/`FIXTURE.masteredCards`.
- `e2e/active-flow.spec.ts` (new): drives the Passive/Active toggle, asserts MODE-01/02 redundantly, then a bounded loop-until-complete session asserting the hint flow (hidden -> tap -> "Hint:" prefix -> reset on advance), the pinned reveal with anchor caption and no cycle button, the silent degrade for unmutated state-1 cards, and that both production and degrade faces were genuinely exercised (`productionSeen >= 1 && degradeSeen >= 1`) — plus the DB-persistence backstop poll.
- Phase gate: `npm test` (247 passed) and `npx playwright test` (32 passed — smoke, freshness x4, grade-flow, active-flow, perf) both green. Phase 28 closes with zero regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1a: RED — failing tests for active-prompt + D-13 parity** - `dedcdce` (test)
2. **Task 1b: GREEN — implement lib/active-prompt.ts** - `db3f552` (feat)
3. **Task 2: Wire Active into StudySession + FlashcardMode** - `445ce10` (feat)
4. **Task 3: State-promotion mutate helper + active-flow e2e spec + phase gate** - `1770c37` (test)

_No plan-metadata commit was made in this executor run — STATE.md/ROADMAP.md updates and the final docs commit are owned by the orchestrator per this execution's instructions._

## Files Created/Modified
- `lib/active-prompt.ts` - New pure module: `ActiveFace` discriminated union + `deriveActiveFace()`
- `tests/active-prompt.test.ts` - New unit test file: 5 tests covering all precedence rows + explicit ordering
- `tests/sentence-selection.test.ts` - Added the D-13 Active/Passive sentence-pick parity test
- `components/StudySession.tsx` - `hintRevealed` state + reset points; `activeFace` render-scope derivation; new props threaded to `FlashcardMode`
- `components/FlashcardMode.tsx` - New Active front/back branches (sentence-production, word-production); passive-degrade fallthrough unchanged; `cycle-example-btn` testid added
- `e2e/helpers/mutate.ts` - New `promoteOneDueCardToProductionDirect`/`promoteOneDueCardToProduction` pair
- `e2e/run-mutate.ts` - Registers the new op in the OPS map
- `e2e/active-flow.spec.ts` - New e2e spec: full Active-mode coverage
- `e2e/freshness-gate.spec.ts` - Session-entry click sequence updated to the new toggle (deviation, see below)
- `e2e/freshness-fresh-paths.spec.ts` - Session-entry click sequence updated to the new toggle (deviation, see below)

## Decisions Made
- ACTIVE-05 interpretation recorded per the plan's explicit statement: existing `isNewCard` semantics (state <= 1 degrades, state >= 2 produces) — the requirement's "graduate once state >= 1" clause is a wording slip against its own "state 0/1 degrade" opening (Pitfall N-2 / Assumption A1)
- Active back face keeps the `card.front`/`card.back` word-gloss block (`card-front-word` testid survives — e2e content anchoring depends on it) and drops only the redundant sentence-translation line (Open Q2 / Assumption A2)
- Word-production fallback (practice cards, matured zero-sentence cards) omits the hint control entirely — the prompt already IS the English gloss, so a hint would repeat it verbatim (P-03)
- `cycle-example-btn` renders whenever the shared Passive/degrade back branch is reached (genuine Passive AND Active-degrade both show it) — required by D-03's "zero visual difference from a genuine Passive session" — and is absent only on the two genuine Active production faces, which never reach that branch
- Reworded `lib/active-prompt.ts`'s purity-guarantee JSDoc line to avoid literally containing the strings `Date.now()`/`Math.random()` (present in the plan's own suggested header text, mirrored from `lib/sentence-selection.ts`), since the plan's own verify command greps for those exact strings — kept the same guarantee, different wording, so the mechanical check passes without any actual purity change

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two pre-existing freshness specs still drove session entry via the retired "Flashcards" button**
- **Found during:** Task 3 (running the full `npx playwright test` phase gate)
- **Issue:** `e2e/freshness-gate.spec.ts` and `e2e/freshness-fresh-paths.spec.ts` clicked `page.getByRole('button', { name: /Flashcards/ })` — the 3-mode grid option removed in Plan 28-01's `ModeSelector` rewrite. `e2e/grade-flow.spec.ts` was updated in Plan 28-01 to use the new toggle, but these two freshness specs (written before Plan 28-01, unrelated to this plan's own file list) were missed. Without a fix, the CLEANUP-04 full-suite phase gate this plan is explicitly responsible for closing would fail.
- **Fix:** Updated both call sites to `page.getByTestId('mode-passive').click()` followed by `page.getByTestId('begin-session-btn').click()`, matching the pattern already established in `e2e/grade-flow.spec.ts`.
- **Files modified:** `e2e/freshness-gate.spec.ts`, `e2e/freshness-fresh-paths.spec.ts`
- **Verification:** `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts` — 10 passed; full `npx playwright test` — 32 passed
- **Committed in:** `1770c37` (Task 3 commit)

**2. [Rule 3 - Blocking] Worktree `node_modules` had no `.bin` symlinks, breaking the e2e harness's tsx-subprocess delegation**
- **Found during:** Task 3 (running `npx playwright test e2e/active-flow.spec.ts e2e/grade-flow.spec.ts`)
- **Issue:** Same environment-provisioning gap documented in 28-01-SUMMARY.md's deviations — `node_modules/.bin/tsx` was missing, breaking `resetToBaseline()` and every mutate-helper subprocess call with `ENOENT`.
- **Fix:** Ran `npm ci` against the existing, unmodified `package-lock.json` (verified byte-identical via diff before running) — restored the already-locked dependency tree; no new packages resolved or added.
- **Files modified:** none tracked (`node_modules/` is gitignored)
- **Verification:** `npx playwright test` — 32 passed afterward
- **Committed in:** n/a (no trackable file changes from `npm ci`)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking; one code fix required for the phase-gate to pass, one environment-only)
**Impact on plan:** The freshness-spec fix is a small, mechanical parity update (same pattern already applied to `grade-flow.spec.ts` in Plan 28-01) required to satisfy this plan's own CLEANUP-04 full-suite gate — no scope creep beyond making the existing suite consistent with Plan 28-01's toggle rewrite. The `npm ci` fix is purely local environment provisioning, no code/behavior change.

## Issues Encountered
- `npx tsc --noEmit` initially reported many errors across unrelated files (`app/api/*`, `lib/study-cards.ts`, `lib/sync.ts`, etc.) because the Prisma client hadn't been generated in this worktree (`app/generated/prisma` missing). Ran `npx prisma generate` (idempotent, standard build step per `CLAUDE.md`'s Commands section) — resolved all but 2 errors in `tests/study-cards.test.ts`, which 28-01-SUMMARY.md already documented as pre-existing and out-of-scope for this phase.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 28 is complete: MODE-01/02, ACTIVE-01..05, CLEANUP-01/02/04 all implemented and verified; the full unit + e2e suite (247 unit tests, 32 Playwright tests) is green.
- `Card.distractors` write-side retirement (CLEANUP-03, deferred to Phase 29 per the phase boundary) is unaffected — nothing in this plan's diff touches the extraction pipeline or the distractors column.
- Milestone-close doc refresh is still owed (per CLAUDE.md's Gotchas/conventions and this phase's RESEARCH.md): `CLAUDE.md` and `.planning/codebase/*.md` describe the retired 3-mode grid / Exposure-Recall sub-toggle in multiple places — should be refreshed before/at milestone close, not blocking this plan's completion.

---
*Phase: 28-active-recall-study-mode*
*Completed: 2026-07-14*

## Self-Check: PASSED

All claimed files verified present (`lib/active-prompt.ts`, `tests/active-prompt.test.ts`,
`e2e/active-flow.spec.ts`, and the modified files listed above); all four task commits
(`dedcdce`, `db3f552`, `445ce10`, `1770c37`) verified present in `git log --oneline --all`;
full suite re-confirmed green (`npm test` 247 passed, `npx playwright test` 32 passed)
immediately before writing this summary.
