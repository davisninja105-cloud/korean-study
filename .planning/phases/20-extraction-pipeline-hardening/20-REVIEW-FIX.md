---
phase: 20-extraction-pipeline-hardening
fixed_at: 2026-07-07T02:50:00Z
review_path: .planning/phases/20-extraction-pipeline-hardening/20-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-07-07T02:50:00Z
**Source review:** .planning/phases/20-extraction-pipeline-hardening/20-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Card `front`/`back` are persisted without trimming, unlike the DB dedup key

**Files modified:** `lib/extract-cards.ts`
**Commit:** 82d7f4b
**Applied fix:** Computed `front`/`back` as `(c.front ?? '').trim()` / `(c.back ?? '').trim()` once at the top of the `normalizeExtractedCards` flatMap callback (matching the existing IN-01 coercion pattern), and used the trimmed values in the returned card object. This brings the persisted `Card.front`/`Card.back` into alignment with `normalizeFront()` (the DB dedup key), which already trims — closing the whitespace-divergence gap the reviewer identified.

### WR-02: `ExtractedCard`/`ExtractedSentence` interfaces are hand-duplicated alongside the new zod schemas

**Files modified:** `lib/extract-cards.ts`
**Commit:** 6ff5d35
**Applied fix:** Kept the hand-written `ExtractedCard`/`ExtractedSentence` interfaces (their JSDoc, especially on `components`, is valuable documentation that `z.infer` would erase) and added a compile-time equality guard instead — `AssertShapesEqual<A, B>` plus two `const _*ShapeCheck: AssertShapesEqual<...> = true` assignments comparing each interface against `z.infer<typeof ...Schema>`. If a future field is added/removed on one side without the other, this line fails to typecheck and breaks the build, per the review's documented fallback option ("If the hand-written JSDoc ... is important to preserve, keep the interface but add a compile-time equality assertion").

### WR-03: `extractCardsFromNotes` has zero test coverage

**Files modified:** `tests/extract-cards.test.ts`
**Commit:** b4f4265
**Applied fix:** Added a new `describe('extractCardsFromNotes streaming/salvage control flow (WR-03)')` block with 4 tests, covering exactly the branches the reviewer named:
- (a) happy path — resolved message with non-null `parsed_output` flows through `normalizeExtractedCards`
- (b) truncation salvage — `finalMessage()` rejects with `AnthropicError`, non-empty accumulated `rawText`, salvage succeeds and returns the completed card
- (c) salvage-fails-so-rethrow-original — salvage itself throws (cut before any top-level card boundary), and the original `AnthropicError` instance is rethrown, not the generic "No cards found" error
- (d) resolved message with zero text blocks (`parsed_output: null`) — throws with `stop_reason` context

Implemented via `vi.spyOn(Anthropic.Messages.prototype, 'stream')` returning a fake stream object exposing `on('text', cb)` (listener registration) and `finalMessage()` (replays queued text chunks to listeners, then resolves/rejects) — enough surface to drive the real `on('text')`-before-`await finalMessage()` ordering in `extractCardsFromNotes` without a network call. Reused the exact truncated-JSON fixtures already proven correct by the existing `parseExtractionResponse` unit tests in the same file. Full suite: 33/33 passing (was 29/29).

### IN-01: `distractors` count is not validated/enforced

**Files modified:** `lib/extract-cards.ts`
**Commit:** 35b72f4
**Applied fix:** Added a `console.warn` in `normalizeExtractedCards` when a card's filtered `distractors.length < 3`, naming the card's front for sync-log observability, mirroring the existing blank-safety warning pattern. No behavior change — the study UI already pads short distractor lists, per the review's own note that this is optional/observability-only.

## Verification

For each fix: re-read the modified section (Tier 1), ran `npx tsc --noEmit -p tsconfig.json` scoped to `lib/extract-cards.ts` (Tier 2, no new errors), ran `npx eslint` on each modified file (clean, exit 0), and ran `npx vitest run tests/extract-cards.test.ts` after every change (29/29 -> 29/29 -> 29/29 -> 33/33, all passing). A full `npx vitest run` afterward showed 2 unrelated pre-existing failures (`tests/review-history.test.ts`, `tests/review-route.test.ts`) caused by the isolated worktree lacking a `.env`/`DATABASE_URL` (env files are gitignored and not present in a fresh worktree) — unrelated to `lib/extract-cards.ts` or this phase's changes.

---

_Fixed: 2026-07-07T02:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
