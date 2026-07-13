---
phase: 27-e2e-coverage-performance-validation
reviewed: 2026-07-13T18:40:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - e2e/grade-flow.spec.ts
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
  - e2e/perf.spec.ts
  - CLAUDE.md
  - scripts/apply-learning-steps-ddl.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-07-13T18:40:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The headline work of this phase — the `CardReview.learningSteps` / `ReviewLog.learningSteps` round-trip fix (`lib/fsrs.ts`, `components/StudySession.tsx`, `lib/dto.ts`, `prisma/schema.prisma`, `app/api/review/undo/route.ts`, `tests/study-cards.test.ts`) — is correct and complete. I traced ts-fsrs's actual scheduler source (`node_modules/ts-fsrs/dist/index.umd.js`) to confirm: (1) `card.learning_steps` genuinely gates which (re)learning-step entry a "Good"/"Hard"/etc. grade advances to (`BasicScheduler.getLearningInfo`/`applyLearningSteps`), so the pre-fix bug (every reconstructed `FSRSCard` implicitly pinned at `learning_steps=0`) really would have stuck any card graded "Good" repeatedly at the first learning interval forever; (2) the fix threads the field through every reconstruction site with no gaps — `reviewCard()`, `previewIntervalLabels()`, `ReviewDTO`, `StudySession`'s local optimistic round-trip, and the undo-restore route all now carry it; (3) `app/api/review/route.ts` and `lib/study-cards.ts` correctly needed no changes since both already pass/spread whole Prisma rows. I also grepped the whole non-generated codebase for any other explicit-field-list `CardReview`/`reviewCard` call site that could have been missed — there are none. The Turso DDL script (`scripts/apply-learning-steps-ddl.mjs`) matches the `NOT NULL DEFAULT 0` semantics SQLite/libSQL requires and mirrors the existing `apply-*-ddl.mjs` convention exactly.

The e2e additions (`e2e/grade-flow.spec.ts`, the `data-testid` instrumentation pass, `e2e/perf.spec.ts`) are sound: the grade-flow spec's bounded-loop-until-complete design, DB persistence backstop, and lower-bound (not exact) grade-count assertion are all correctly reasoned against the actual habit-day/requeue mechanics, and the perf spec's budgets run against an authenticated `storageState` context (confirmed in `playwright.config.ts`), so there's no vacuous-pass risk from an unauthenticated redirect.

While investigating the undo path (as directed), I found a **pre-existing** (not introduced by this phase, but directly adjacent to the line this phase touched, and squarely in the reviewed file's scope) data-integrity bug in `app/api/review/undo/route.ts`: undoing a card's very first review does not restore `lastReview` back to `null`. I traced the practical impact all the way through ts-fsrs's `State.New` branching to confirm it does *not* currently cause an incorrect FSRS schedule (the algorithm dispatches on `state`, not `last_review`, for New cards) — but it is still a real, provable defect that silently corrupts a nullable column and would resurface the moment any future feature reads `lastReview` to answer "has this card ever been studied." I also found the same route lacks the try/catch + input-shape validation every other route handler in this codebase carries per CLAUDE.md convention. Both are flagged below as Warnings, with the FSRS-safety analysis included so a fixer doesn't have to re-derive it.

## Warnings

### WR-01: `POST /api/review/undo` does not restore `lastReview` to `null` when undoing a card's first-ever review

**File:** `app/api/review/undo/route.ts:29`
**Issue:** The restore uses a truthiness ternary that cannot distinguish "the previous value was legitimately `null`" from "the field was absent":
```ts
lastReview: prevState.lastReview ? new Date(prevState.lastReview) : exists.lastReview,
```
When a brand-new card (`review.lastReview === null`, per `e2e/seed.ts:108`'s doc comment and `StudySession.tsx`'s own "have lastReview === null" comment) is graded for the first time and then undone, `StudySession.tsx`'s `prevState` snapshot correctly captures `lastReview: null` (it is `current.card.review ?? {}`, taken *before* the grade is applied). But because `null` is falsy, the undo route's ternary falls through to `exists.lastReview` — the row's **current, post-grade** value — instead of restoring `null`. The DB is left with a nonsensical state: `reps` correctly reset to `0` (via the `??` pattern used for every other field), but `lastReview` still stamped with the timestamp of the review that was supposedly undone.

I verified this does **not** currently cause an incorrect FSRS schedule on the card's next grade: `reviewCard()` branches into ts-fsrs's "reconstruct" path instead of `createEmptyCard()` because `review.lastReview` is (wrongly) truthy, but since `state`/`stability`/`difficulty`/`elapsedDays`/`scheduledDays`/`learningSteps`/`reps`/`lapses` are all correctly zeroed, the reconstructed card is field-for-field identical to `createEmptyCard()`'s output *except* for `due`/`last_review` — and ts-fsrs's own `AbstractScheduler.init()` (`node_modules/ts-fsrs/dist/index.umd.js:372-377`) unconditionally recomputes `elapsed_days`/`last_review` from `state`/`now` for any card whose `state !== State.New` check fails to apply (i.e. it's still New), so the stale values never reach the scheduling math. It's a real corruption of the persisted column, not a scheduling regression — but it should still be fixed, since it's exactly the kind of state the app's own review-history/"last studied" affordances would eventually read.

**Fix:** Use presence, not truthiness, to decide whether to fall back:
```ts
lastReview: 'lastReview' in prevState
  ? (prevState.lastReview ? new Date(prevState.lastReview) : null)
  : exists.lastReview,
```

### WR-02: `POST /api/review/undo` has no top-level try/catch or `prevState` shape validation, unlike every other route handler in the codebase

**File:** `app/api/review/undo/route.ts:4-34`
**Issue:** `.claude/CLAUDE.md` documents the project's Error Handling convention explicitly: "All route handlers wrap their body in try { … } catch (e) { return NextResponse.json({ error: … }, { status: 500 }) }." The sibling route `app/api/review/route.ts` follows this carefully (wraps `req.json()` in its own try/catch, validates `cardId`/`rating`/`idempotencyKey` before touching the DB). `app/api/review/undo/route.ts` does neither:
- `await req.json()` (line 5) is not wrapped — malformed JSON throws an unhandled `SyntaxError`.
- `prevState` is destructured and used directly (`prevState.state`, line 20) with no check that it is a non-null object. If a request omits `prevState` (or sends `null`), `prevState.state` throws `TypeError: Cannot read properties of undefined/null`.

Under normal use the app's own client always sends a non-null `prevState` object (`StudySession.tsx`'s `current.card.review ?? {}`), so this is not reachable through the UI today — but it's an unhandled-exception crash for any malformed/replayed request, and it's inconsistent with the rest of the codebase's own documented convention (this file is the one outlier).

**Fix:**
```ts
export async function POST(req: NextRequest) {
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { cardId, prevState } = body ?? {}

  if (!cardId || typeof cardId !== 'string') {
    return NextResponse.json({ error: 'cardId required' }, { status: 400 })
  }
  if (prevState === null || typeof prevState !== 'object') {
    return NextResponse.json({ error: 'prevState required' }, { status: 400 })
  }
  try {
    // ...existing findUnique/update logic...
  } catch (e) {
    console.error('POST /api/review/undo failed:', e)
    return NextResponse.json({ error: 'Failed to undo review' }, { status: 500 })
  }
}
```

## Info

### IN-01: New DDL script not documented in CLAUDE.md's `Scripts (scripts/)` section

**File:** `CLAUDE.md`, `scripts/apply-learning-steps-ddl.mjs`
**Issue:** `scripts/apply-learning-steps-ddl.mjs` is a new, permanent, one-time-DDL script (already run against production per this phase's context) added in the same shape as `apply-graph-ddl.mjs` and `apply-sentence-ddl.mjs` — both of which are listed in CLAUDE.md's `## Scripts (scripts/)` section. The new script is not. CLAUDE.md itself states the project convention: "Keep this file and `.planning/codebase/*.md` current: refresh both after every milestone close." This is the kind of doc-drift that convention exists to prevent.
**Fix:** Add a bullet to the Scripts section, matching the style of its siblings, e.g.:
```
- `apply-learning-steps-ddl.mjs` — Adds `learningSteps` columns to `CardReview` and `ReviewLog` (Phase 27 FSRS round-trip fix). Run ONCE. DO NOT re-run — not idempotent (errors on duplicate column, which is the expected/safe failure mode). Already applied to production.
```

### IN-02: Pre-existing `tsc --noEmit` errors in a reviewed file, unrelated to this phase's change

**File:** `tests/study-cards.test.ts:133,170`
**Issue:** `npx tsc --noEmit` reports `TS7006: Parameter 'c' implicitly has an 'any' type` at both lines. `git blame` confirms both lines predate this phase (introduced in `59a584a`, phase 23) — phase 27 only added the single `learningSteps: 0,` mock field (line 62) to this file and did not touch these lines. Flagging for completeness since the file is in this phase's review scope and the errors are real, but they are not a regression introduced by phase 27.
**Fix:** Not phase 27's responsibility; worth a follow-up cleanup ticket (`(c: { front: string }) => …` or similar explicit typing) since it currently means `npx tsc --noEmit` cannot be used as a clean CI gate as-is.

---

_Reviewed: 2026-07-13T18:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
