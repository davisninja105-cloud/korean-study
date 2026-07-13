---
phase: 27-e2e-coverage-performance-validation
plan: 01
subsystem: testing
tags: [playwright, e2e, data-testid, fsrs, ts-fsrs, prisma, sqlite]

# Dependency graph
requires:
  - phase: 25-e2e-harness
    provides: Playwright harness (isolated seeded test DB, subprocess-delegation pattern for DB access, resetToBaseline, readers.ts conventions)
provides:
  - "data-testid instrumentation across the grade-flow path (reveal-btn, grade-again/hard/good/easy, card-front-word, due-count, start-studying-btn, session-complete-heading, study-more-btn, mode-${mode.value})"
  - "e2e/grade-flow.spec.ts — E2E-05 bounded loop-until-complete flashcard session spec with a non-inferable DB persistence backstop"
  - "seededDueReviewsPersisted() DB-backstop op (two-layer tsx-subprocess pattern)"
  - "Fix for a production FSRS scheduling bug: CardReview.learningSteps now persists ts-fsrs's internal learning-step index, so cards graded 'Good' repeatedly actually graduate out of the Learning state instead of looping at a fixed 10-minute interval forever"
affects: [27-02, 27-03, future study-flow E2E specs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "data-testid additive-only instrumentation alongside existing aria-labels (aria-labels stay for screen-reader FSRS hint text, WR-02)"
    - "value-parameterized testid for list-rendered elements: data-testid={`mode-${mode.value}`}"
    - "bounded loop-until-complete E2E pattern (MAX_GRADES hard cap, break on completion-heading visibility) instead of a fixed-count grading script"
    - "locator.or() composition to race two mutually-exclusive UI states without page.waitForTimeout"
    - "DB backstop via expect.poll() around a tsx-subprocess query, never a synchronous post-completion assertion (races the fire-and-forget background save)"

key-files:
  created:
    - e2e/grade-flow.spec.ts
  modified:
    - components/FlashcardMode.tsx
    - components/StudyClient.tsx
    - components/ModeSelector.tsx
    - e2e/helpers/readers.ts
    - e2e/helpers/mutate.ts
    - e2e/run-mutate.ts
    - prisma/schema.prisma
    - lib/fsrs.ts
    - lib/dto.ts
    - app/api/review/undo/route.ts
    - components/StudySession.tsx
    - tests/study-cards.test.ts

key-decisions:
  - "Fixed a pre-existing production FSRS bug (CardReview never persisted ts-fsrs's internal learning_steps index) rather than deferring it — the bug directly blocked the plan's own acceptance criteria (the spec could never reach 'Session complete!' under repeated Good grading) and is a genuine correctness defect independent of this test"
  - "Added CardReview.learningSteps / ReviewLog.learningSteps as new Int columns (default 0) rather than reconstructing step position heuristically — ts-fsrs's Card.learning_steps has no derivable equivalent from the app's existing persisted fields"
  - "card-front-word testid placed on the back-face card.front paragraph in BOTH conditional branches (chosenSentence ? ... : ...), never the front-face bare-word paragraph — guarantees exactly one instance in the DOM per mounted card regardless of front-face display mode"

patterns-established:
  - "Grade-flow E2E specs must use a bounded loop-until-complete keyed off a completion-heading testid, never a fixed grade count, because ts-fsrs learning-step intervals make the exact grade count wall-clock/state dependent"
  - "Any code that reconstructs an FSRSCard object from persisted DB fields must round-trip learning_steps or repeated same-rating grades will never progress past the first learning interval"

requirements-completed: [E2E-05]

coverage:
  - id: D1
    description: "Additive data-testid pass across the grade-flow path (reveal-btn, 4 grade buttons, card-front-word ×2, due-count, start-studying-btn, session-complete-heading, study-more-btn, mode-${mode.value}); readStudySelectModeState migrated off the KNOWN-FRAGILE presentational locator"
    requirement: E2E-05
    verification:
      - kind: e2e
        ref: "e2e/smoke.spec.ts — 4/4 tests passing against the new due-count testid locator"
        status: pass
      - kind: automated_ui
        ref: "npm run lint — 0 errors; git diff components/ attribute-only (verified)"
        status: pass
    human_judgment: false
  - id: D2
    description: "e2e/grade-flow.spec.ts — full flashcard session driven via testids: reveal → grade → queue advance → 'Session complete!', with fixture-traceable assertions and a non-inferable DB persistence backstop"
    requirement: E2E-05
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/grade-flow.spec.ts — 1 passed (plus setup project)"
        status: pass
    human_judgment: false
  - id: D3
    description: "FSRS learning_steps persistence fix (CardReview/ReviewLog schema + lib/fsrs.ts + StudySession.tsx + undo route + ReviewDTO) — cards now correctly graduate out of the Learning state on repeated Good grades instead of looping forever at a fixed 10-minute interval"
    verification:
      - kind: unit
        ref: "npm test — 241/241 passing (tests/study-cards.test.ts mock updated for schema parity)"
        status: pass
      - kind: e2e
        ref: "e2e/grade-flow.spec.ts — session reaches completion in ~6 grades (was: never completes, hits MAX_GRADES=25 every run)"
        status: pass
    human_judgment: true
    rationale: "Schema change affecting production FSRS scheduling correctness — requires a human-reviewed Turso DDL step before deploy (see 'Production Deploy Note' below); automated tests confirm the fix is correct on the isolated test DB but cannot confirm the production migration was applied."

# Metrics
duration: 40min
completed: 2026-07-13
status: complete
---

# Phase 27 Plan 01: Grade-Flow E2E Coverage Summary

**Closed the Phase 25 KNOWN-FRAGILE locator gap with a data-testid pass, shipped the E2E-05 grade-flow spec with a subprocess DB persistence backstop, and fixed a genuine production FSRS bug (learning_steps never persisted) discovered while writing the spec — cards were permanently stuck at a 10-minute review interval and could never graduate to long-term review.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-07-13T17:22:00Z (approx, worktree setup + context read)
- **Completed:** 2026-07-13T18:01:32Z
- **Tasks:** 2 planned tasks, plus 1 deviation fix
- **Files modified:** 12 (1 created, 11 modified)

## Accomplishments

- 12 `data-testid` attributes added across `FlashcardMode.tsx` / `StudyClient.tsx` / `ModeSelector.tsx`, all additive-only (zero className/handler/aria-label changes — verified via `git diff`)
- `readStudySelectModeState` (`e2e/helpers/readers.ts`) migrated from the Phase 25 KNOWN-FRAGILE presentational locator (`p.text-5xl.font-bold.animate-reveal`) to `getByTestId('due-count')`
- `e2e/grade-flow.spec.ts` — E2E-05 spec: bounded loop-until-complete flashcard session, driven exclusively via testids, with fixture-traceable assertions (`FIXTURE.dueCards`, `FIXTURE.cards.due` fronts) and a polled subprocess DB backstop proving the fire-and-forget `POST /api/review` saves actually persisted
- `seededDueReviewsPersisted()` DB backstop op added to `e2e/helpers/mutate.ts` / `e2e/run-mutate.ts` following the existing two-layer tsx-subprocess pattern
- **Deviation fix:** discovered and fixed a real production bug — `lib/fsrs.ts`'s `reviewCard()` never round-tripped ts-fsrs's internal `Card.learning_steps` index through the DB, so every card graded "Good" repeatedly during the Learning phase was reconstructed at step 0 on its next review and never progressed past the first 10-minute interval. This is a genuine spaced-repetition correctness bug (unrelated to this task's file scope) that also happened to block the grade-flow spec from ever reaching completion.

## Task Commits

1. **Task 1: Additive data-testid pass across the grade-flow path** - `c65709b` (feat)
2. **Deviation: FSRS learning_steps persistence fix** - `7601e0b` (fix)
3. **Task 2: E2E-05 grade-flow spec + DB persistence backstop** - `0b25753` (feat)

_No plan-metadata commit in worktree mode — the orchestrator commits STATE.md/ROADMAP.md centrally after merge._

## Files Created/Modified

- `e2e/grade-flow.spec.ts` - New E2E-05 spec: bounded loop-until-complete grade-flow session + DB backstop
- `components/FlashcardMode.tsx` - `reveal-btn`, `grade-again/hard/good/easy`, `card-front-word` (×2 branches) testids
- `components/StudyClient.tsx` - `due-count`, `start-studying-btn`, `session-complete-heading`, `study-more-btn` testids
- `components/ModeSelector.tsx` - `mode-${mode.value}` value-parameterized testid
- `e2e/helpers/readers.ts` - `readStudySelectModeState` migrated to `getByTestId('due-count')`; KNOWN-FRAGILE comment retired
- `e2e/helpers/mutate.ts` - `seededDueReviewsPersistedDirect()` + `seededDueReviewsPersisted()` wrapper
- `e2e/run-mutate.ts` - `seededDueReviewsPersisted` entry registered in the `OPS` map
- `prisma/schema.prisma` - `CardReview.learningSteps` / `ReviewLog.learningSteps` (Int, `@default(0)`)
- `lib/fsrs.ts` - `reviewCard()` / `previewIntervalLabels()` round-trip `learning_steps` through the reconstructed `FSRSCard`
- `lib/dto.ts` - `ReviewDTO.learningSteps` added
- `app/api/review/undo/route.ts` - restores `learningSteps` on undo
- `components/StudySession.tsx` - local `Card.review.learningSteps`, threaded through `submitReview`'s FSRS round-trip
- `tests/study-cards.test.ts` - mock `CardReview` fixture updated for schema parity

## Decisions Made

- Fixed the FSRS `learning_steps` bug immediately rather than deferring it (Rule 1/Rule 3): it directly blocked Task 2's acceptance criteria (the spec could never observe `'Session complete!'` — it exhausted `MAX_GRADES=25` every run, cycling the same 3 cards indefinitely at a fixed 10-minute interval) and is a genuine, severe production correctness bug independent of this test (verified via a standalone ts-fsrs simulation: with `learning_steps` correctly chained, a card graduates to Review on its 2nd Good grade at a ~2-day interval; with it dropped — the app's actual pre-fix behavior — the card is permanently reconstructed at step 0 and never graduates).
- Added `CardReview.learningSteps` / `ReviewLog.learningSteps` as new `Int @default(0)` columns rather than attempting to derive the step index from existing fields — ts-fsrs's internal counter has no equivalent derivable from `state`/`reps`/`scheduledDays`.
- `app/api/review/route.ts` and `lib/study-cards.ts` required **zero code changes** for the fix — both already pass/spread whole Prisma rows (`reviewCard(cardReview, rating)` / `{ ...c.review, ... }`) rather than an explicit field allowlist, so the new column flows through automatically once present in the schema.
- `card-front-word` testid placed on the back-face `card.front` paragraph in both conditional render branches (never the front-face bare-word paragraph) so the DOM always has exactly one instance per mounted card, regardless of whether the front face shows a bare word or a sentence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/Rule 3 - Bug / Blocking] FSRS `learning_steps` never persisted across reviews**
- **Found during:** Task 2 (writing/running `e2e/grade-flow.spec.ts`)
- **Issue:** `lib/fsrs.ts`'s `reviewCard()` reconstructs an `FSRSCard` from `CardReviewFields` on every review, but that interface (and the underlying `CardReview` Prisma model) had no field for ts-fsrs's internal `Card.learning_steps` index. The reconstructed card was always implicitly pinned at `learning_steps=0` (the `createEmptyCard` template default). A card in the Learning state graded "Good" repeatedly therefore always computed as "first learning step" and never advanced to the 2nd step (which is what triggers graduation to the Review state with a multi-day interval) — the card was stuck at a fixed 10-minute interval forever. Confirmed via a standalone simulation comparing (a) chaining the raw `FSRSCard` object across calls (correctly graduates on the 2nd Good grade to ~2 days) vs. (b) round-tripping only the app's `CardReviewFields` shape (reproduces the stuck-at-10-minutes bug exactly). This is a real production defect (any user grading "Good" on a Learning-phase card would experience the same non-progression) — not an artifact of the test.
- **Fix:** Added `CardReview.learningSteps` / `ReviewLog.learningSteps` (`Int`, `@default(0)`) to `prisma/schema.prisma`; threaded the field through `lib/fsrs.ts` (`CardReviewFields`, `PartialReview`, `reviewCard()`, `previewIntervalLabels()`), `lib/dto.ts` (`ReviewDTO`), `components/StudySession.tsx` (local `Card.review` type + the `cardReviewFields`/`updatedItem.review` round-trip in `submitReview`), and `app/api/review/undo/route.ts` (undo restoration). `app/api/review/route.ts` and `lib/study-cards.ts` needed no changes since both already operate on whole Prisma rows rather than explicit field lists.
- **Files modified:** `prisma/schema.prisma`, `lib/fsrs.ts`, `lib/dto.ts`, `app/api/review/undo/route.ts`, `components/StudySession.tsx`, `tests/study-cards.test.ts` (mock fixture parity)
- **Verification:** `npx prisma generate` + `npx tsc --noEmit` (no new errors — the 2 pre-existing `tests/study-cards.test.ts` implicit-`any` errors are unrelated line-number-shifted duplicates of a previously-documented issue); `npm test` 241/241 passing; `npm run lint` 0 errors; `e2e/grade-flow.spec.ts` went from "never completes (hits MAX_GRADES=25 every run)" to "1 passed, ~6 grades to completion" — matching the plan's own predicted typical run.
- **Committed in:** `7601e0b`

---

**Total deviations:** 1 auto-fixed (Rule 1/Rule 3 — bug that also blocked task completion)
**Impact on plan:** Necessary for both correctness (a real, severe FSRS scheduling defect) and for Task 2's own acceptance criteria to be satisfiable. No scope creep beyond what was required to make the spec pass against genuinely correct application behavior.

## Issues Encountered

- **Worktree environment gap (not a code issue):** this worktree had no `node_modules` directory at all (git worktrees don't carry gitignored directories), so the hardcoded `path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')` calls in `e2e/seed.ts`/`e2e/helpers/mutate.ts` failed with `ENOENT` even though `npm`/`npx`/`playwright` themselves resolved fine via Node's parent-directory module-resolution walk-up. Fixed locally by symlinking `node_modules` from the main repo checkout into the worktree (`node_modules` is gitignored, so this is a local-only, non-committed fix and does not appear in any commit). Also ran `npx prisma generate` once to produce the gitignored `app/generated/prisma/client` the worktree also lacked.
- The `card-front-word` testid could theoretically appear ambiguous if a future edit added a third back-face branch — the spec uses `.first()` on the locator as a defensive measure, but the actual JSX guarantees exactly one instance per mount (verified via the diff).

## Production Deploy Note

**Required before deploying this branch to production:** per `CLAUDE.md`'s documented Turso schema-change workflow, `prisma db push`/`migrate` do not work against `libsql://`. Before deploy, run the DDL migration against the production Turso DB:

```sql
ALTER TABLE CardReview ADD COLUMN learningSteps INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ReviewLog ADD COLUMN learningSteps INTEGER NOT NULL DEFAULT 0;
```

(Or generate via `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` and apply only the new statements, per the documented workflow.) This was **not** applied here — this worktree has no production DB credentials/access, and applying schema changes to production is out of scope for a feature-branch executor. The isolated E2E test DB already picks up the new column automatically via `e2e/run-global-setup.ts`'s schema-push step (verified: `npx playwright test e2e/grade-flow.spec.ts` passes end-to-end against it).

## User Setup Required

None beyond the Production Deploy Note above — no new environment variables or dashboard configuration required.

## Next Phase Readiness

- The `data-testid` set added here (`reveal-btn`, `grade-again/hard/good/easy`, `card-front-word`, `due-count`, `start-studying-btn`, `session-complete-heading`, `study-more-btn`, `mode-${mode.value}`) is available for Plan 27-02/27-03 and any future study-flow E2E specs to consume directly.
- `seededDueReviewsPersisted()` establishes the pattern for any future "prove the background save landed" DB backstop in this suite.
- No blockers for subsequent plans in this phase.

## Self-Check: PASSED

- `e2e/grade-flow.spec.ts` exists: FOUND
- `components/FlashcardMode.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx`, `e2e/helpers/readers.ts`, `e2e/helpers/mutate.ts`, `e2e/run-mutate.ts`, `prisma/schema.prisma`, `lib/fsrs.ts`, `lib/dto.ts`, `app/api/review/undo/route.ts`, `components/StudySession.tsx`, `tests/study-cards.test.ts`: all FOUND
- Commit `c65709b` (Task 1): FOUND in `git log`
- Commit `7601e0b` (deviation fix): FOUND in `git log`
- Commit `0b25753` (Task 2): FOUND in `git log`
- `npm run lint`: 0 errors
- `npm test`: 241/241 passing
- `npx playwright test e2e/grade-flow.spec.ts e2e/smoke.spec.ts --reporter=line`: 6/6 passing (1 setup + 1 grade-flow + 4 smoke)

---
*Phase: 27-e2e-coverage-performance-validation*
*Plan: 01*
*Completed: 2026-07-13*
