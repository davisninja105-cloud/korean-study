---
phase: 16-components-filter-fix
fixed_at: 2026-07-04T02:16:15Z
review_path: .planning/phases/16-components-filter-fix/16-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-07-04T02:16:15Z
**Source review:** .planning/phases/16-components-filter-fix/16-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (2 critical, 5 warning, 3 info — `fix_scope: all`)
- Fixed: 10
- Skipped: 0

## Fixed Issues

### CR-01: Deck-lookup filter runs against a stale, pre-batch deck set — strips legitimate same-lesson forward-reference components before they're ever persisted

**Files modified:** `lib/extract-cards.ts`, `tests/extract-cards.test.ts`
**Commit:** `54ddb5a`
**Applied fix:** Inside `parseExtractionResponse`, unioned the current extraction batch's own (post-validation) card fronts into the resolution set (`effectiveDeckSet`) before calling `filterComponents()` per card, so a forward reference to a same-response sibling card survives instead of being stripped before it's ever persisted. Added a regression test (`retains a component referencing a sibling card in the same extraction batch (CR-01)…`) asserting the sibling reference survives even when neither card pre-exists in the deck set.
**Verification:** New test passes; full suite (14 tests in this file, 96 project-wide) green; `tsc` shows no new errors in the modified file.

### CR-02: `keyToId` incremental augmentation is gated behind `card.components.length > 0`, reintroducing the leaf-node scoping bug this phase's seed-query fix was meant to close

**Files modified:** `app/api/sync/route.ts`
**Commit:** `e1a248e`
**Applied fix:** Made `keyToId.set(nf, id)` unconditional in both the CREATE and UPDATE branches of the per-card upsert (previously gated behind `card.components.length > 0`), mirroring `seedCards`' whole-deck scope. The `linkTargets.push(...)` (edge-source registration) remains conditional — only cards that themselves have components need to be edge sources.
**Verification:** Re-read confirms both branches now register unconditionally; `tsc` shows only a pre-existing, unrelated error on line 55 (implicit `any` on a different line, confirmed via `git stash` diff against the pre-fix state). No automated test exercises the live `/api/sync` route (Prisma-backed) — **flagged below as requiring human verification.**

### WR-01: Truncation-salvage logic assumes the last `},` is a top-level card boundary, but every card now contains a nested `sentences` array

**Files modified:** `lib/extract-cards.ts`, `tests/extract-cards.test.ts`
**Commit:** `69f9fe9`
**Applied fix:** Added `findLastTopLevelCardBoundary()`, a depth-aware scanner (tracks `[`/`{`/`]`/`}` nesting depth, skipping string-literal contents including escaped quotes) that finds the last `}` closing a top-level card object rather than assuming the last `},` in the text is always that boundary. Also changed the "truncated mid-array" salvage branch to scan the **original full `text`** rather than the regex-trimmed `jsonMatch[0]` substring — the greedy `/\[[\s\S]*\]/` regex can itself exclude a later, fully-complete card's own closing brace when a further trailing card is truncated with no closing bracket at all (discovered while writing the regression test). Added a regression test using cards whose nested `sentences` array is truncated mid-element, confirming both complete cards are recovered.
**Verification:** New test initially failed (recovered only 1 of 2 cards) until the `jsonMatch[0]` → full-`text` scanning fix was applied; now passes. Full suite green (96 tests); no new `tsc` errors.

### WR-02: `components` is unconditionally overwritten on the sync UPDATE path with no corresponding `CardDependency` pruning

**Files modified:** `app/api/sync/route.ts`
**Commit:** `c159095`
**Applied fix:** `updateData.components` is now only set when `card.components.length > 0` — an empty/filtered-out result from a routine re-sync no longer silently nulls out a previously-good value. When components ARE refreshed, the fix diffs the previous (pre-update) components against the new ones and inline-prunes any `CardDependency` row whose prerequisite is no longer listed, via `keyToId` lookup + `deleteMany`.
**Verification:** Re-read confirms logic; `tsc` shows only the same pre-existing unrelated error. No automated test exercises this DB write path — **flagged below as requiring human verification.**

### WR-03: Retro-cleanup script prunes existing edges for cards whose `components` JSON fails to parse, instead of leaving those edges untouched

**Files modified:** `scripts/retro-filter-cleanup.mts`
**Commit:** `5809f58`
**Applied fix:** Added a `skipCardIds` set populated whenever a card's `components` JSON fails to parse; `pruneIds` computation now filters out any existing edge whose `cardId` is in `skipCardIds` before checking against the `desired` set, so malformed-JSON cards' real edges are reported but never silently mutated.
**Verification:** Re-read confirms the filter is applied before the `desired`-set check; `tsc` clean for this file. No test file exists for this script (developer-run, dry-run-by-default) — **flagged below as requiring human verification.**

### WR-04: `dry-run-filter.mjs`'s hand-copied `normalizeFront` diverges from `lib/card-key.ts`, contradicting its own "must mirror it exactly" comment

**Files modified:** `scripts/dry-run-filter.mjs`
**Commit:** `bbc86be`
**Applied fix:** Updated the Hangul-detection regex from `/[가-힣ᄀ-ᇿ]/` to `/[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/`, restoring the three missing Unicode ranges (Hangul Compatibility Jamo, Hangul Jamo Extended-A, Hangul Jamo Extended-B) so the script's copy matches `lib/card-key.ts` byte-for-byte.
**Verification:** Confirmed via direct string extraction/comparison (`grep -o`) that both regex literals are now identical; `node -c` syntax check passes.

### WR-05: Concurrent per-card upserts can turn one Claude-returned duplicate front into a whole-lesson failure

**Files modified:** `app/api/sync/route.ts`
**Commit:** `8483f55`
**Applied fix:** Added a `dedupedCards` filter step (keep-first-occurrence by `normalizeFront(card.front)`) before the concurrent `Promise.all` upsert, so two Claude-returned entries normalizing to the same front can no longer race the DB unique-constraint check-then-act and crash the whole lesson.
**Verification:** Re-read confirms the filter runs before `Promise.all`; `tsc` shows only the same pre-existing unrelated error. No automated test exercises concurrent DB upserts — **flagged below as requiring human verification.**

### IN-01: `notes` and `distractors` entries lack the type-checking rigor applied elsewhere in the same normalization step

**Files modified:** `lib/extract-cards.ts`, `tests/extract-cards.test.ts`
**Commit:** `b0102f3`
**Applied fix:** `notes` is now coerced to `string | undefined` (was passed through untyped); `distractors` now filters to string elements before slicing to 3 (was only checking the container was an array). Added a regression test with a malformed `notes: 12345` and a non-string `distractors` entry, confirming both are cleaned.
**Verification:** New test passes; full suite green; no new `tsc` errors.

### IN-02: `CardDependency` resolve-and-upsert loop is reimplemented near-verbatim in three separate files

**Files modified:** `lib/link-dependencies.ts` (new), `app/api/sync/route.ts`, `scripts/local-resync.mts`, `scripts/retro-filter-cleanup.mts`
**Commit:** `84035c3`
**Applied fix:** Extracted a new pure helper `lib/link-dependencies.ts:resolveDependencyEdges(keyToId, targets)` that resolves components[] strings to real card ids, deduping and self-excluding, without touching Prisma. Rewired all four call sites (live sync route, local-resync's per-lesson pass, local-resync's final relink pass, and retro-filter-cleanup's Phase C desired-edge computation) to call this shared function instead of independently reimplementing the resolve loop. Prisma-specific persistence (per-edge upsert vs. batch prune/add) remains at each call site since that behavior legitimately differs.
**Verification:** Full suite green (96 tests); `tsc` shows no new errors in any of the four touched files (pre-existing unrelated errors confirmed via `git stash` diff). `eslint` clean on all touched files. No direct test coverage of `route.ts`/`local-resync.mts`/`retro-filter-cleanup.mts` themselves (Prisma-backed, developer/production-run) — **flagged below as requiring human verification** given this is a structural refactor across 4 files.

### IN-03: `retro-filter-cleanup.mts` silently buckets any unrecognized `Card.type` into the `vocabulary` tally

**Files modified:** `scripts/retro-filter-cleanup.mts`
**Commit:** `a6e28a3`
**Applied fix:** Added a `console.warn` when `card.type` doesn't match one of the three known values, logged before the value is folded into the default `vocabulary` bucket — mirrors the existing malformed-JSON warning's style and placement.
**Verification:** Re-read confirms warning fires before the fold; `tsc` clean for this file. Purely additive logging — no control-flow change.

## Notes — Findings Flagged for Human Verification

The 3-tier verification strategy (re-read, `tsc`/syntax check, full test suite) confirms these changes are **syntactically correct and don't regress any existing test**, but the following findings touch DB-write logic in files with no direct automated test coverage (`app/api/sync/route.ts` is a Prisma-backed live API route; `scripts/local-resync.mts` and `scripts/retro-filter-cleanup.mts` are developer-run scripts against a real database). Recommend a manual dry-run / staging verification before the next production sync:

- **CR-02** (`e1a248e`) — unconditional `keyToId` registration
- **WR-02** (`c159095`) — conditional components overwrite + inline edge pruning
- **WR-03** (`5809f58`) — malformed-JSON edge-prune exclusion
- **WR-05** (`8483f55`) — pre-`Promise.all` dedup
- **IN-02** (`84035c3`) — shared-helper refactor across 4 files

All other findings (CR-01, WR-01, WR-04, IN-01, IN-03) are either covered by new/existing regression tests or are low-risk, purely-additive/mechanical changes.

---

_Fixed: 2026-07-04T02:16:15Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
