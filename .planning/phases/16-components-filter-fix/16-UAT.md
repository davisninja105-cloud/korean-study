---
status: complete
phase: 16-components-filter-fix
source: [16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md, 16-VERIFICATION.md]
started: 2026-07-04T03:25:34Z
updated: 2026-07-04T03:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. filterComponents deck-lookup filter — unit coverage (GRAPH-03)
expected: lib/filter-components.ts pure filterComponents() has full Vitest coverage (direct match, stem fallback, no-match, empty input, grammar-pattern retention, real-but-unrelated documentation case, order-preserving) — tests/filter-components.test.ts, 7/7 passing
result: pass
source: automated
coverage_id: D1

### 2. filterComponents is a pure module (GRAPH-04)
expected: lib/filter-components.ts has zero Prisma/Anthropic/Node-builtin imports (grep for lib/prisma, @anthropic-ai/sdk, fs, crypto returns no matches)
result: pass
source: automated
coverage_id: D2

### 3. Dry-run drop-rate baseline review (GRAPH-05)
expected: |
  scripts/dry-run-filter.mjs was run against the live corpus and reported per-Card.type
  drop rates: grammar 8.0% (27/337), vocabulary 24.9% (539/2169), phrase 21.5% (53/246),
  whole-corpus 22.5% (619/2752). A human reviewed this baseline and judged the grammar-type
  drop rate as NOT disproportionate (the healthy direction — well below vocabulary/phrase)
  before approving the filter for write-path wiring.
result: pass

### 4. Extraction prompt tightened (GRAPH-01)
expected: lib/extract-cards.ts components[] prompt instructions include the anchor sentence "Only list it if this card actually depends on it as a prerequisite — never because it merely appears elsewhere in the lesson." (grep confirms exactly 1 match, scoped to the components instructions block only)
result: pass
source: automated
coverage_id: D1

### 5. parseExtractionResponse structural validation (GRAPH-02)
expected: parseExtractionResponse(text) drops cards with missing/empty front, missing/empty back, or a present-but-invalid type, while tolerating an absent type (defaults to vocabulary) and preserving the existing truncation-salvage parser byte-for-byte — tests/extract-cards.test.ts, 6/6 passing
result: pass
source: automated
coverage_id: D2

### 6. filterComponents wired into the extraction write path (GRAPH-03)
expected: parseExtractionResponse(text, deckNormalizedFronts) calls filterComponents() once, after self-dedup/self-exclude, so both the live sync route and scripts/local-resync.mts get write-path filtering — tests/extract-cards.test.ts, 5/5 new cases passing (spurious dropped, real retained, grammar-pattern retained, default-empty-Set behavior, self-exclusion ordering)
result: pass
source: automated
coverage_id: D1

### 7. keyToId lookup scope fixed (GRAPH-03)
expected: app/api/sync/route.ts and scripts/local-resync.mts build their keyToId lookup from ALL cards (no components-not-null where clause), so leaf-node cards are resolvable as prerequisites; full npm test (93/93) and npm run lint clean
result: pass
source: automated
coverage_id: D2

### 8. retro-filter-cleanup.mts script created (GRAPH-03)
expected: scripts/retro-filter-cleanup.mts exists, is dry-run-by-default and --apply-gated, imports filterComponents from lib/filter-components.ts, reconciles CardDependency edges, never deletes Card/Lesson rows, and builds its deck Set + keyToId from ALL cards; npm run lint and npx tsc --noEmit clean
result: pass
source: automated
coverage_id: D1

### 9. CLAUDE.md documents the cleanup script
expected: CLAUDE.md Scripts section has exactly one new entry documenting retro-filter-cleanup.mts (dry-run-first, --apply gate, developer-run-only); no other section touched
result: pass
source: automated
coverage_id: D2

### 10. Production retroactive cleanup applied & verified (GRAPH-03)
expected: |
  scripts/retro-filter-cleanup.mts --apply was run against the live Turso corpus after a human
  compared its dry-run output to the 16-01 baseline (exact match) and reviewed prune/add-set
  plausibility (one accepted homonym-collision edge: 화나다 → 화 (episode counter), flagged and
  explicitly accepted as an out-of-scope pre-existing ambiguity). Result: 511 cards changed,
  2 edges pruned, 4 edges added, 2133 total edges after. A follow-up dry-run confirmed
  idempotency (0 cards / 0 edges to change).
result: pass

### 11. Live POST /api/sync run against a real new lesson, post-review-fix
expected: |
  Trigger a real sync (pull-to-refresh in the app, or curl -X POST .../api/sync) against at
  least one genuinely new lesson that introduces 2+ cards which legitimately reference each
  other (a same-lesson forward-reference case — e.g. a new vocabulary card whose components[]
  lists a new grammar pattern also being created in this same lesson). Inspect the resulting
  Card.components and CardDependency rows for both new cards:
  (a) the sibling-referencing component survives in persisted components[] JSON and a
      CardDependency edge links the two same-batch cards, even though the referenced
      sibling has zero components of its own (CR-01 / CR-02 fixes)
  (b) if a later re-sync legitimately shrinks a card's components[], no stale CardDependency
      edge remains (WR-02 fix)
  (c) if Claude ever returns two entries with the same normalized front in one response, only
      one card is created, not a whole-lesson failure (WR-05 fix)
result: pass

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
