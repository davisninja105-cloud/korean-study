---
phase: 16-components-filter-fix
verified: 2026-07-03T21:10:00Z
status: passed
score: 4/5 must-haves verified
behavior_unverified: 1
overrides_applied: 0
---

# Phase 16: Components[] Filter Fix Verification Report

**Phase Goal:** Card extraction stops inventing prerequisites — a card's `components[]` list contains only real prerequisites that resolve to an actual card in the deck, so the foundation-first knowledge graph is built on true edges instead of hallucinated ones.
**Verified:** 2026-07-03T21:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After a sync, a newly-extracted card's `components[]` contains only lemmas that resolve to a real card in the deck — spurious entries no longer create `CardDependency` edges (Success Criterion 1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Core filtering logic (`filterComponents`, `parseExtractionResponse`, CR-01 same-batch-sibling fix) is present, wired, and covered by 21 passing unit tests. But the write-path fixes that make this true in the LIVE `POST /api/sync` route — CR-02 (unconditional `keyToId` registration), WR-02 (inline stale-edge pruning on update), WR-05 (pre-`Promise.all` dedup) — live entirely in `app/api/sync/route.ts`, which has **zero automated test coverage** (no `tests/*sync*` or route-test file exists). The code-review fixer itself flagged these five fixes as "requiring human verification" (`16-REVIEW-FIX.md` lines 95-105) because no test exercises the live DB-backed route, and no artifact in this phase records that a human actually ran a fresh `POST /api/sync` against a real lesson post-fix to confirm the behavior end-to-end. See Human Verification below. |
| 2 | A malformed or truncated Claude extraction response is rejected on receipt (structurally validated) rather than persisted as broken card data (Success Criterion 2) | ✓ VERIFIED | `isValidExtractedCard` in `lib/extract-cards.ts:185-197` drops cards with missing/empty front/back or an invalid-but-present `type`; `findLastTopLevelCardBoundary()` (WR-01 fix, `lib/extract-cards.ts:234-267`) replaces the naive `lastIndexOf('},')` truncation heuristic with a depth-aware scanner. `tests/extract-cards.test.ts` — 14 passing cases directly exercise malformed-card-dropped, invalid-type-dropped, non-object-entry, and truncated-with-nested-`sentences`-array salvage (the exact WR-01 regression case). Full suite: `npm test` → 96/96 passing. `npm run lint` clean. `npx tsc --noEmit` clean. |
| 3 | Abstract grammar-pattern components that never appear verbatim in conjugated sentences are correctly retained (resolution is by deck-lookup, not literal containment) (Success Criterion 3) | ✓ VERIFIED | `lib/filter-components.ts` implements two-phase deck-lookup (`normalizeFront` direct match, then `splitParticle` stem fallback) — no substring/containment check anywhere in the module. `tests/filter-components.test.ts` has a dedicated case (`'retains an abstract grammar pattern by deck-lookup, not sentence-text containment (GRAPH-03)'`) plus `tests/extract-cards.test.ts` has an end-to-end deck-lookup grammar-retention case. Both pass. |
| 4 | Before the filter is wired into the write path, a dry run against the real corpus reports its drop rate separately for grammar- vs vocabulary-type components, confirming grammar edges are not disproportionately dropped (Success Criterion 4) | ✓ VERIFIED | `scripts/dry-run-filter.mjs` is read-only (no INSERT/UPDATE/DELETE; verified by grep), builds its deck Set from ALL cards (no `WHERE` clause — Pitfall 1 avoided), and reports grammar/vocabulary/phrase drop rates separately. `16-01-SUMMARY.md` records the human-approved baseline (grammar 8.0%, vocabulary 24.9%, phrase 21.5%, whole-corpus 22.5%) obtained BEFORE plan 16-03 wired the filter into the write path (enforced via `depends_on: [16-01]` in the 16-03 plan). Independently re-ran `node scripts/dry-run-filter.mjs` against the live Turso corpus during this verification — confirms the script still runs read-only and correctly (now reporting 0% drop, consistent with the corpus having already been cleaned by plan 16-04). |
| 5 | Every already-persisted `Card.components` row has been retroactively cleaned and `CardDependency` edges reconciled against the existing corpus (user-locked scope addition, closes SC1 for pre-phase data) | ✓ VERIFIED | Independently re-ran `npx tsx scripts/retro-filter-cleanup.mts` (dry-run, read-only) during this verification against the live production Turso database: reported 1039 cards loaded, deck set size 1039, **0 cards to change, 0 edges to prune, 0 edges to add**, existing edge total 2133 — matches the SUMMARY's claimed post-`--apply` idempotent state exactly. This is live, independently-reproduced evidence (not a SUMMARY claim taken on faith) that the production cleanup (511 cards changed, 2 edges pruned, 4 edges added per `16-04-SUMMARY.md`) was actually applied and the corpus is in the claimed steady state. |

**Score:** 4/5 truths verified (1 present + wired, behavior not exercised)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/filter-components.ts` | Pure deck-lookup filter, exported `filterComponents(rawComponents, deckNormalizedFronts)` | ✓ VERIFIED | Exists, pure (no Prisma/Anthropic/fs/crypto imports confirmed by grep), correct two-phase logic, JSDoc contract present |
| `tests/filter-components.test.ts` | 7-case Vitest coverage | ✓ VERIFIED | 7 `it()` blocks present, all passing |
| `scripts/dry-run-filter.mjs` | Read-only per-type drop-rate diagnostic | ✓ VERIFIED | `node --check` passes; no write statements; Hangul regex now matches `lib/card-key.ts` byte-for-byte (WR-04 fix confirmed via diff) |
| `lib/extract-cards.ts` | Tightened prompt (GRAPH-01) + exported `parseExtractionResponse` (GRAPH-02) + filter wiring (GRAPH-03) | ✓ VERIFIED | Anchor sentence present (`grep -c` → 1); `parseExtractionResponse` exported, pure, calls `filterComponents` at one site; CR-01 same-batch-sibling union present; IN-01 notes/distractors coercion present |
| `tests/extract-cards.test.ts` | Coverage for validation + deck-filter wiring | ✓ VERIFIED | 14 cases, all passing, including CR-01 regression and WR-01 nested-`sentences`-truncation regression |
| `app/api/sync/route.ts` | `keyToId` seeded from ALL cards; CR-02/WR-02/WR-05 fixes | ✓ VERIFIED (static) / ⚠️ (behavioral) | Code present and internally consistent (seedCards has no `where`; `keyToId.set` unconditional in both CREATE/UPDATE branches; `updateData.components` only set when non-empty + inline stale-edge pruning; `dedupedCards` pre-`Promise.all` dedup present). No automated test exercises this route (Prisma-backed). `tsc --noEmit` clean, `npm run lint` clean. |
| `scripts/local-resync.mts` | Same `keyToId` scope fix + shared `resolveDependencyEdges` | ✓ VERIFIED | Both keyToId-feeding queries have no `where: components not null`; imports `resolveDependencyEdges` from `lib/link-dependencies.ts` (IN-02 shared-helper refactor) |
| `scripts/retro-filter-cleanup.mts` | Dry-run-default cleanup + edge reconciliation | ✓ VERIFIED | `const APPLY = process.argv.includes('--apply')` gates all writes; imports `filterComponents` and `resolveDependencyEdges`; WR-03 (`skipCardIds` malformed-JSON edge-prune exclusion) and IN-03 (unrecognized-type warning) fixes present; independently re-ran dry-run against production — 0/0/0 (idempotent, matches claimed post-apply state) |
| `lib/link-dependencies.ts` | IN-02 shared edge-resolution helper | ✓ VERIFIED | Exists, pure, exported `resolveDependencyEdges`; used by all 3 call sites (`route.ts`, `local-resync.mts` x2, `retro-filter-cleanup.mts`) |
| `CLAUDE.md` Scripts section | Documents `retro-filter-cleanup.mts` | ✓ VERIFIED | 1 matching entry, dry-run-first / `--apply` / developer-run-only language present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `extractCardsFromNotes` | `parseExtractionResponse` | `deckSet` built from `existingNormalizedFronts`, passed as 2nd arg | ✓ WIRED | Confirmed at `lib/extract-cards.ts:172-173` |
| `parseExtractionResponse` | `filterComponents` | Single call site per-card, after self-dedup, using `effectiveDeckSet` (CR-01 union) | ✓ WIRED | Confirmed at `lib/extract-cards.ts:353`, exactly one call site (grep) |
| `app/api/sync/route.ts` | `lib/link-dependencies.ts` | `resolveDependencyEdges(keyToId, linkTargets)` | ✓ WIRED | Confirmed at `route.ts:279` |
| `scripts/local-resync.mts` | `extractCardsFromNotes` | Direct call — inherits filtering "for free" | ✓ WIRED | Confirmed; `local-resync.mts` calls `extractCardsFromNotes` directly, no bypass |
| `scripts/retro-filter-cleanup.mts` | `lib/filter-components.ts` | Dynamic `await import()` after dotenv config (env-first ordering) | ✓ WIRED | Confirmed at `scripts/retro-filter-cleanup.mts` imports section |

### Data-Flow Trace (Level 4)

Not applicable in the standard UI-rendering sense (this phase has no React components). The relevant "data flow" is DB-corpus state, which was independently re-verified live:

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Live drop-rate against production corpus | `node scripts/dry-run-filter.mjs` | 1039 cards loaded; grammar/vocab/phrase all 0.0% drop | ✓ FLOWING (real DB query, real data, consistent with post-cleanup state) |
| Live retro-cleanup idempotency | `npx tsx scripts/retro-filter-cleanup.mts` (dry-run) | 0 cards to change / 0 edges to prune / 0 edges to add / 2133 existing edges | ✓ FLOWING (matches `16-04-SUMMARY.md`'s claimed post-`--apply` state exactly — independently reproduced, not taken on faith) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite passes | `npm test` | 96/96 passing (10 test files) | ✓ PASS |
| Filter + extract-cards suites in isolation | `npx vitest run tests/extract-cards.test.ts tests/filter-components.test.ts` | 21/21 passing | ✓ PASS |
| Lint clean | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`components/StudySession.tsx`) | ✓ PASS |
| Type-check clean | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| `keyToId` narrow-scope regression grep | `grep -RnE "where:\s*\{\s*components:\s*\{\s*not:\s*null\s*\}\s*\}" app/api/sync/route.ts scripts/local-resync.mts scripts/retro-filter-cleanup.mts` | No matches | ✓ PASS |
| Live `POST /api/sync` against a real/new lesson, post-fix | Not run (requires a live Google Doc lesson + Anthropic call + DB write) | N/A | ? SKIP — this is exactly the gap driving Truth #1's PRESENT_BEHAVIOR_UNVERIFIED status; routed to Human Verification below |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or phase-declared probes found in the PLAN/SUMMARY files for this phase. Step 7c: SKIPPED (no probes declared or discovered).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| GRAPH-01 | 16-02 | Extraction prompt tightened to only list genuine prerequisites | ✓ SATISFIED | Anchor sentence present, verbatim, exactly once; prompt section scoped correctly |
| GRAPH-02 | 16-02 | Claude's extraction response structurally validated on receipt | ✓ SATISFIED | `isValidExtractedCard` + salvage preserved (WR-01 hardened); 14 unit tests pass |
| GRAPH-03 | 16-01, 16-03, 16-04 | `components[]` entry kept only via deck-lookup, not literal containment | ✓ SATISFIED (logic) / ⚠️ (live route) | `filterComponents` unit-verified; wiring in `extract-cards.ts` unit-verified including CR-01; wiring in `route.ts` (keyToId, edge pruning, dedup) code-reviewed and static-verified but has no automated/live-route test — see Truth #1 |
| GRAPH-04 | 16-01 | Filter is a pure, unit-tested `lib/` module reusing the two-phase pattern | ✓ SATISFIED | Zero Prisma/Anthropic/Node-builtin imports confirmed; mirrors `lib/known-words.ts` |
| GRAPH-05 | 16-01 | Dry-run validated against real corpus, drop-rate reported separately by type, before write-path wiring | ✓ SATISFIED | Baseline recorded and human-approved before `depends_on: [16-01]`-gated plan 16-03 executed |

No orphaned requirements — all 5 GRAPH-* requirements in `.planning/REQUIREMENTS.md` are claimed by a plan in this phase and cross-checked above.

### Anti-Patterns Found

None. Scanned all 9 phase-touched files (`lib/filter-components.ts`, `lib/extract-cards.ts`, `lib/link-dependencies.ts`, `app/api/sync/route.ts`, `scripts/local-resync.mts`, `scripts/retro-filter-cleanup.mts`, `scripts/dry-run-filter.mjs`, `tests/extract-cards.test.ts`, `tests/filter-components.test.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and `placeholder|coming soon|not yet implemented|not available` (case-insensitive) — zero matches.

### Human Verification Required

### 1. Live `POST /api/sync` run against a real new lesson, post-review-fix

**Test:** Trigger a real sync (via the app's pull-to-refresh, or `curl -X POST .../api/sync`) against at least one genuinely new lesson that introduces 2+ cards which legitimately reference each other (a same-lesson forward-reference case, e.g. a new vocabulary card whose `components[]` lists a new grammar pattern also being created in this same lesson). Inspect the resulting `Card.components` and `CardDependency` rows for both new cards.

**Expected:** (a) The sibling-referencing component survives in the persisted `components[]` JSON (CR-01 fix) and a `CardDependency` edge is created linking the two same-batch cards (CR-02 fix — the referenced sibling card, even if it itself has zero components, must be resolvable as a prerequisite). (b) If a re-sync later updates one of these cards and its refreshed `components[]` legitimately shrinks, no stale `CardDependency` edge should remain (WR-02 fix). (c) If Claude ever returns two entries with the same normalized front in one response, only one card is created, not a whole-lesson failure (WR-05 fix).

**Why human:** `app/api/sync/route.ts` has zero automated test coverage — it is a live, Prisma-backed, Anthropic-calling API route. The code-review fixer that applied CR-02/WR-02/WR-05/IN-02 explicitly flagged all four as "requiring human verification" in `16-REVIEW-FIX.md` (lines 95-105) because "no automated test exercises the live `/api/sync` route." No artifact reviewed for this verification (SUMMARYs, UAT, STATE.md) records that this live end-to-end run was performed after the review-fix commits landed — the `16-UAT.md` file's 10 test cases source only from the four plan SUMMARY.md files (predating the code review) and do not reference `16-REVIEW.md`/`16-REVIEW-FIX.md` at all. The unit-test coverage for the CR-01 fix (in `parseExtractionResponse` alone, without the live DB/Anthropic round-trip) is strong, but it does not substitute for confirming the fix holds when the full route runs end-to-end.

### Gaps Summary

No hard gaps (no FAILED truths, no missing/stub artifacts, no broken key links, no debt markers). The phase's core deliverable — the pure `filterComponents()` deck-lookup module, the tightened extraction prompt, the structural-validation guard, and the retroactive corpus cleanup — is genuinely built, unit-tested, and (for the retroactive-cleanup piece) independently re-verified live against the production database during this verification pass.

The one open item is that Success Criterion 1's "after a sync" clause depends on `app/api/sync/route.ts` fixes (CR-02, WR-02, WR-05) that were applied during a post-execution code-review-fix pass and are code-reviewed/statically sound (tsc clean, lint clean, logic re-read and consistent) but have never been exercised by a real sync request or any automated test — a gap the review-fix report itself flagged and that no subsequent artifact closes. This is a state-transition/cleanup-invariant class of truth that presence-and-wiring checks cannot resolve; it needs one live sync run against a real multi-card lesson to close out with confidence before this phase is fully trusted for unattended/cron use (relevant given Phase 19 will add cron-triggered sync).

---

_Verified: 2026-07-03T21:10:00Z_
_Verifier: Claude (gsd-verifier)_
