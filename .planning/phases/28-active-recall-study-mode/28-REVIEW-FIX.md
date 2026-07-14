---
phase: 28-active-recall-study-mode
fixed_at: 2026-07-14T16:30:00Z
review_path: .planning/phases/28-active-recall-study-mode/28-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 28: Code Review Fix Report

**Fixed at:** 2026-07-14
**Source review:** .planning/phases/28-active-recall-study-mode/28-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (fix_scope: critical_warning — CR-01, WR-01, WR-02, WR-03; IN-01 excluded)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Active mode's word-production fallback leaks/breaks content for AI-generated practice cards

**Files modified:** `lib/active-prompt.ts`, `tests/active-prompt.test.ts`
**Commit:** `54dd70f`
**Applied fix:** Applied fix option 1 from the review (simpler/safer, no `lib/generate-practice.ts` schema changes needed). `deriveActiveFace()` now routes `isPractice` items to `passive-degrade` unconditionally, instead of the previous `{ face: 'word-production', prompt: card.back }`. AI-generated `PracticeCard` items have no guaranteed single-language front/back split (`front` is a Korean instruction, `back` is mixed Korean+English), so they can never safely support the production mechanic — they now render via the exact same silent Passive/exposure face a brand-new real card uses. Updated the doc comment's precedence list and the `ActiveFace` type's inline comments to reflect the new rule. Updated the existing unit test (`returns word-production for a practice card…` → `returns passive-degrade for a practice card…`) and added a second case (`isNewCard: false`) confirming the practice check still wins either way. All 6 `tests/active-prompt.test.ts` cases pass.

### WR-01: Hint-reveal button loses its accessible name after being tapped

**Files modified:** `components/FlashcardMode.tsx`
**Commit:** `84f230f`
**Applied fix:** Added a persistent `aria-label={hintRevealed ? 'Hint shown' : 'Show hint'}` to the hint button, exactly as suggested. The button's accessible name is now always non-empty for screen-reader users regardless of whether the visible "Show hint" text has been removed post-tap.

### WR-02: `onToggleHint`/`hint-toggle` naming implies bidirectional toggle behavior it doesn't have

**Files modified:** `components/FlashcardMode.tsx`, `components/StudySession.tsx`, `e2e/active-flow.spec.ts`
**Commit:** `8fac908`
**Applied fix:** Renamed the prop `onToggleHint` → `onRevealHint` and `data-testid="hint-toggle"` → `data-testid="hint-reveal-btn"` at both the definition (`FlashcardMode.tsx`) and call site (`StudySession.tsx`). Added `disabled={hintRevealed}` (plus `disabled:opacity-60 disabled:cursor-default` styling) so the button visibly goes inert once the hint has been revealed, matching its actual one-way-reveal semantics. Updated all 3 e2e references (`e2e/active-flow.spec.ts`) to the renamed testid so the existing Active-mode spec and the new CR-01/WR-03 regression test both still pass.

### WR-03: No test coverage for the Active + AI-practice combination that triggers CR-01

**Files modified:** `e2e/active-flow.spec.ts`
**Commits:** `756daf1`, `dca3a5a`
**Applied fix:** Added a new e2e test, "Active mode + AI practice: practice card degrades to Passive face, never leaks the answer pre-reveal (CR-01)", which mocks `POST /api/generate` (`page.route`) with a `PracticeCard` shaped exactly like `lib/generate-practice.ts`'s real output (Korean instruction `front`, mixed Korean+English `back`) — avoiding any dependency on the real Claude API. The test ticks "Include AI-generated practice questions", selects Active mode, drives the session to the mocked practice card, and asserts (a) no `active-prompt`/`hint-reveal-btn` testids render for it (confirming the passive-degrade path, not production), and (b) the un-revealed front face never contains the mixed-language answer text.
- Changed the file's `test.beforeAll` → `test.beforeEach` reset/promote hook, since the pre-existing single test in this file grades every seeded due card to completion — a second test would otherwise start with zero due cards (`StudyClient` only fetches AI practice when `studyCards.length > 0`). Matches the `beforeEach(resetToBaseline)` pattern already used by `e2e/freshness-gate.spec.ts` for the same multi-test-per-file need.
- Follow-up fix (`dca3a5a`): the initial assertion checked `page.locator('body')` for the leaked answer text and false-failed, because the 3D flip card keeps both the front AND back faces in the DOM simultaneously (the back face is rotated out of view via CSS `transform`/`backface-visibility`, not unmounted) — the back face's own unchanged reveal content (which legitimately shows `card.back`) was tripping a body-wide text check. Rescoped the assertion to `.card-flip-front` only. Verified via `npx playwright test e2e/active-flow.spec.ts` — all 3 tests pass.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification

- `npm run lint`: 0 errors (1 pre-existing warning in `components/StudySession.tsx:300`, unrelated to this fix — confirmed present before these changes via `git stash`).
- `npm test`: 248/248 passed.
- `npm run build`: succeeded (Turbopack compile + TypeScript check clean).
- `npx playwright test e2e/active-flow.spec.ts`: 3/3 passed (both the pre-existing Active-mode spec and the new CR-01/WR-03 regression test).
- `npx playwright test e2e/grade-flow.spec.ts e2e/smoke.spec.ts`: 5/5 passed (no regression from the `beforeAll` → `beforeEach` change or the FlashcardMode/StudySession prop rename).
- `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts`: 10/10 passed.

## Out of scope (not fixed by this run)

- **IN-01** (`lib/active-prompt.ts:36` — `deriveActiveFace`'s unused `front` field): Info-level, excluded by `fix_scope: critical_warning`.

---

_Fixed: 2026-07-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
