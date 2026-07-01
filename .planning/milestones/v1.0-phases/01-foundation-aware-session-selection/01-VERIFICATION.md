---
phase: 01-foundation-aware-session-selection
verified: 2026-06-25T23:38:30Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 1: Foundation-Aware Session Selection — Verification Report

**Phase Goal:** Sessions are prerequisite-coherent — a due dependent never appears without its still-unlearned, in-pool prerequisites, and the session size cap operates during selection rather than after it.
**Verified:** 2026-06-25T23:38:30Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A due dependent whose in-pool prerequisite is also due (but less overdue) appears in the selected set alongside that prerequisite, with the prerequisite ordered before it (SEL-01) | VERIFIED | `selectSessionCards` DFS recurses into prerequisites before pushing the dependent; test "pulls a less-due prerequisite into the session with its dependent" asserts `prereq` appears before `dep` when `dep` is 5 days overdue and `prereq` is only 1 day overdue — 53/53 pass |
| 2 | The selected set is downward-closed under the prerequisite relation: no returned card has an in-pool prerequisite that was bumped out by the size cap (SEL-02) | VERIFIED | `addClosure` DFS always recurses into prerequisites before pushing the card; test "output is downward-closed and capped at sessionSize" verifies that for every returned card, all in-pool prerequisites are also present in the result |
| 3 | `selectSessionCards` honors `sessionSize` DURING selection; overshoot bounded to at most one prerequisite closure beyond `sessionSize`; final `slice(0, sessionSize)` never orphans a prerequisite (SEL-03) | VERIFIED | Loop breaks before starting a new seed when `result.length >= sessionSize`; `result.slice(0, sessionSize)` applied at end; test "overshoot is bounded by at most one prerequisite closure" with sessionSize=1 asserts `result.length <= 1` |
| 4 | Dependency cycles never cause infinite recursion or duplicate cards in the selected set (SEL-04) | VERIFIED | `visiting` recursion-stack guard short-circuits back-edges; `added` dedup set prevents duplicate pushes; test "handles 2-node cycle without infinite loop or duplicate cards" passes with `new Set(ids).size === 2` |
| 5 | Edge fetching and selection run over the whole eligible pool (bounded by `take: 1000`), not the already-capped most-due IDs (SEL-05) | VERIFIED | `route.ts:55` — `take: 1000` (no `take: sessionSize`); edge query `in: ids` where `ids` is the full pool; `selectSessionCards(cards, edges, sessionSize, now)` called before `sequenceCards` |
| 6 | `selectSessionCards` unit tests pass: pool <= size returns all; due dependent pulls in less-due prereq; output downward-closed and capped; cycle-safe; overshoot bounded (QUAL-01) | VERIFIED | `npm test` — 53 passed (5 files); all five `selectSessionCards` cases pass plus discriminating seed-priority test (6 total in the describe block) |
| 7 | `selectSessionCards` is pure: `now` is a parameter, no `Date.now()`/`new Date()`/`Math.random()` in the function body — lint stays clean | VERIFIED | `grep "Date\.now\|Math\.random\|new Date()"` finds only parameter defaults (`now: Date = new Date()` at line 159) and comments; `npm run lint` exits 0 with zero errors |
| 8 | GET /api/cards/due response shape, empty-result early return, lesson-range where clause, and scope validation are unchanged — no regression | VERIFIED | Validation block lines 18–28 unchanged; `lessonClause` build lines 32–35 unchanged; `if (cards.length === 0) return NextResponse.json([])` at line 58 unchanged; `return NextResponse.json(ordered)` at line 77 unchanged; `npm run build` compiles clean |

**Score:** 8/8 truths verified

### CR-01 Fix Verification (Critical — b354d0c)

The crux of the post-review fix: `nextReview` lives on `CardReview` (schema line 81), not on `Card` directly. The fix introduced the `nextReviewMs(card)` helper at `lib/sequence.ts:84–88`:

```
const nr = card.review?.nextReview ?? card.nextReview
```

Relation-first read, flat fallback. Used at lines 85, 131, 147–148, 187–188 — covers the seed sort in `selectSessionCards` AND the urgency boost in `sequenceCards`. The test fixture at `tests/sequence.test.ts:11` uses the real Prisma shape `{ id, review: { nextReview } }`. The discriminating seed-priority test at line 148 uses reverse-alphabetical ids relative to due-ness and sessionSize=1 — it would fail under the bug (id tiebreak would pick `'aaa'`) and passes with the fix (most-due picks `'zzz'`). Confirmed passing in `npm test` run.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/sequence.ts` | Exports `selectSessionCards<T extends SeqCard>(pool, edges, sessionSize, now?)` | VERIFIED | Exists; function exported at line 155; `nextReviewMs` helper at line 84; no impure calls in body |
| `tests/sequence.test.ts` | `describe('selectSessionCards')` block with 5+ QUAL-01 cases | VERIFIED | 6 cases in the describe block (5 QUAL-01 + discriminating seed-priority test from CR-01 fix); fixture uses real Prisma shape |
| `app/api/cards/due/route.ts` | `take: 1000` pool cap + whole-pool edges + `selectSessionCards`-then-`sequenceCards` | VERIFIED | Line 55: `take: 1000`; line 74: `selectSessionCards(cards, edges, sessionSize, now)`; line 75: `sequenceCards(chosen, edges, now)` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/cards/due/route.ts` | `lib/sequence.ts` | `import { sequenceCards, selectSessionCards } from '@/lib/sequence'` (line 4) | WIRED | Both functions imported and used at lines 74–75 |
| `selectSessionCards` | `SeqCard`/`SeqEdge` types | Reuses existing types defined at `lib/sequence.ts:58–72` | WIRED | Same file; no type redefinition |
| `selectSessionCards` seed sort | `nextReviewMs(card)` | Helper at line 84 reads `card.review?.nextReview ?? card.nextReview` | WIRED | All date reads in `selectSessionCards` go through this helper (lines 187–188) |
| `sequenceCards` urgency boost | `nextReviewMs(card)` | Same helper at line 84 | WIRED | `urgencyBoost` at line 131 calls `nextReviewMs` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 53 tests pass including 6 selectSessionCards cases | `npm test` | 53 passed (5 files), 0 failed, 264ms | PASS |
| Seed-priority test discriminates CR-01 fix | `npm test` (named test exists at line 148) | "prioritizes the most-due card as seed, reading nextReview from the review relation" — passes | PASS |
| Lint clean (purity, no impure render calls) | `npm run lint` | Exit 0, no output (zero errors) | PASS |
| Production build compiles route and lib | `npm run build` | "Compiled successfully in 2.5s", TypeScript clean, `/api/cards/due` listed as dynamic route | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEL-01 | 01-01-PLAN.md | Due dependent never enters session without its in-pool prerequisites | SATISFIED | `addClosure` DFS + "pulls a less-due prerequisite" test |
| SEL-02 | 01-01-PLAN.md | Selected set is downward-closed under the prerequisite relation | SATISFIED | DFS prerequisites-first traversal + "downward-closed and capped" test |
| SEL-03 | 01-01-PLAN.md | `sessionSize` honored during selection; overshoot bounded to one closure | SATISFIED | Break-before-seed + `slice(0, sessionSize)` + "overshoot bounded" test |
| SEL-04 | 01-01-PLAN.md | Cycles cause no infinite recursion or duplicate cards | SATISFIED | `visiting` + `added` guards + "2-node cycle" test |
| SEL-05 | 01-01-PLAN.md | Whole-pool fetch (`take: 1000`) and whole-pool edges; `selectSessionCards` before `sequenceCards` | SATISFIED | `route.ts:55` + `route.ts:74–75` |
| QUAL-01 | 01-01-PLAN.md | Five `selectSessionCards` unit tests pass | SATISFIED | 6 tests pass (5 original + 1 discriminating CR-01 regression) |

**Note on QUAL-01 scope:** REQUIREMENTS.md also lists QUAL-02 (countUnknownWords tests) and QUAL-03/QUAL-04 for Phase 2. These are not in the Phase 1 plan's `requirements:` field and are correctly deferred to Phase 2 — no orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/sequence.ts` | 167 | `void now` — parameter accepted but discarded | Info | Cosmetic; intentional per plan (purity parity with `sequenceCards`); dispositioned WR-04 in 01-REVIEW.md |
| `lib/sequence.ts` | 170–171 | `inPool` set + `poolById` map duplicate membership role | Info | Minor redundancy; dispositioned WR-04; no live bug |

No `TBD`, `FIXME`, or `XXX` markers found in modified files. No unreferenced debt markers. No stub patterns (empty returns, placeholder JSX, hardcoded empty arrays in production paths).

### Human Verification Required

None. All must-haves are verifiable programmatically via unit tests, static analysis (lint/build), and code inspection. The phase produces no UI.

### Gaps Summary

No gaps. All 8 must-haves are verified against the actual codebase.

The four commits are present in git history in the expected TDD order:
- `494d044` — RED test (failing `selectSessionCards` describe block)
- `57af011` — GREEN implementation
- `60890a3` — route rewire
- `b354d0c` — CR-01 fix (relation read + discriminating test)

The SUMMARY's reported test count of 52 in the original run is superseded by the CR-01 fix commit (b354d0c) which added the discriminating seed-priority test, bringing the total to 53. The current `npm test` run confirms 53 passing.

---

_Verified: 2026-06-25T23:38:30Z_
_Verifier: Claude (gsd-verifier)_
