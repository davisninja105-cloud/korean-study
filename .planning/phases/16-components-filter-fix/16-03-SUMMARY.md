---
phase: 16-components-filter-fix
plan: 03
subsystem: knowledge-graph
tags: [prisma, vitest, tdd, data-integrity]

# Dependency graph
requires:
  - phase: 16-01
    provides: "lib/filter-components.ts — pure filterComponents(rawComponents, deckNormalizedFronts) deck-lookup filter, human-approved corpus drop-rate baseline"
  - phase: 16-02
    provides: "lib/extract-cards.ts — exported parseExtractionResponse(text: string): ExtractedCard[] pure entry point to extend"
provides:
  - "lib/extract-cards.ts — parseExtractionResponse(text, deckNormalizedFronts) now calls filterComponents() at a single integration point; extractCardsFromNotes threads the full deck set through"
  - "app/api/sync/route.ts — keyToId lookup seeded from ALL cards (no where clause); stale keyToId.delete branch removed"
  - "scripts/local-resync.mts — both keyToId-feeding queries (per-lesson link + final relink) corrected to the same all-cards scope"
  - "tests/extract-cards.test.ts — 5 new deckNormalizedFronts cases (spurious dropped, real retained, grammar-pattern retained by deck-lookup, default-empty-Set behavior, self-exclusion ordering)"
affects: [16-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single integration point inside extractCardsFromNotes: both the live sync route and scripts/local-resync.mts inherit the deck-lookup filter for free since both call extractCardsFromNotes directly — no second call site needed"
    - "keyToId lookup maps now built from ALL cards (no where clause), matching the same broad shape already used by existingNormalizedFronts — a card with no components of its own remains a valid resolvable prerequisite for other cards"

key-files:
  created: []
  modified:
    - lib/extract-cards.ts
    - tests/extract-cards.test.ts
    - app/api/sync/route.ts
    - scripts/local-resync.mts

key-decisions:
  - "parseExtractionResponse(text, deckNormalizedFronts: Set<string> = new Set()) applies filterComponents() AFTER the existing self-dedup/self-exclude step, never before — cheap in-memory dedup runs first, then the deck-lookup filter against the full deck set (matches RESEARCH.md's stated insertion-point ordering)."
  - "Default empty Set for deckNormalizedFronts means any caller that omits the second argument gets ALL components filtered out — this is intentional (documented in the JSDoc and locked by a dedicated test) since the only production caller (extractCardsFromNotes) always passes the real deck set."
  - "The pre-existing 16-02 dedup test (`returns well-formed cards with normalized fields...`) was updated to pass an explicit deckSet containing '학교' so it continues isolating self-dedup/self-exclude behavior from the new deck-lookup filter, rather than accidentally asserting a stale expectation now that empty-Set means 'drop everything'."
  - "keyToId in app/api/sync/route.ts is now seeded with NO where clause (all cards), matching existingNormalizedFronts' shape. The keyToId.delete(nf) branch on the 'card is losing its components' update path was removed entirely — a card with no components of its own is still a legitimate prerequisite target for other cards, so it must stay resolvable, not be deleted from the map."
  - "scripts/local-resync.mts had the identical narrow-scope bug in two places (per-lesson link pass and the final cross-lesson relink pass) — both corrected the same way. The existing `!dbCard.components` guards in both loops already skip iterating a card as an edge SOURCE when it has no components, so broadening only the LOOKUP populates more valid prerequisite TARGETS — exactly the intended fix, no double-counting risk."

patterns-established:
  - "Pattern: any in-memory normalizedFront→id lookup map that feeds prerequisite/dependency resolution must be seeded from the full deck (no where-clause narrowing) — narrowing the SOURCE query is fine (a card must have components to be a dependency SOURCE) but narrowing the LOOKUP/TARGET query silently produces false-negative edges."

requirements-completed: [GRAPH-03]

coverage:
  - id: D1
    description: "filterComponents() wired into parseExtractionResponse's per-card pipeline; extractCardsFromNotes threads the full existingNormalizedFronts deck set through as a Set<string>, so both the live sync route and scripts/local-resync.mts get write-path filtering from one integration point"
    requirement: "GRAPH-03"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#deckNormalizedFronts filtering (GRAPH-03 write-path wiring) — 5/5 passing (spurious dropped, real retained, grammar-pattern retained by deck-lookup / SC3, default-empty-Set drops all, self-exclusion ordering preserved)"
        status: pass
      - kind: other
        ref: "grep -n \"filterComponents\" lib/extract-cards.ts — exactly one call site inside parseExtractionResponse's per-card map, plus the import"
        status: pass
    human_judgment: false
  - id: D2
    description: "keyToId lookup scope corrected to ALL cards (no components-not-null where clause) in both app/api/sync/route.ts and scripts/local-resync.mts, so real leaf-node prerequisites are resolvable and no longer under-linked; stale keyToId.delete branch removed"
    requirement: "GRAPH-03"
    verification:
      - kind: other
        ref: "bash -c 'grep -RnE \"where:\\s*\\{\\s*components:\\s*\\{\\s*not:\\s*null\\s*\\}\\s*\\}\" app/api/sync/route.ts scripts/local-resync.mts | wc -l' → 0"
        status: pass
      - kind: unit
        ref: "npm test — 93/93 passing (full suite, no regression)"
        status: pass
      - kind: other
        ref: "npm run lint — clean (1 pre-existing unrelated warning in components/StudySession.tsx)"
        status: pass
    human_judgment: false

# Metrics
duration: ~15min
completed: 2026-07-03
status: complete
---

# Phase 16 Plan 03: Wire filterComponents Into the Extraction Write Path + Fix keyToId Scoping Summary

**Wired the plan 16-01 deck-lookup filter into `parseExtractionResponse` (single integration point inside `extractCardsFromNotes`) and fixed the pre-existing `keyToId` scoping bug in both `app/api/sync/route.ts` and `scripts/local-resync.mts` so leaf-node cards are resolvable as prerequisites — together closing GRAPH-03 Success Criterion 1.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-03 (session continuation from plan 16-02)
- **Completed:** 2026-07-03
- **Tasks:** 2 of 2 complete
- **Files modified:** 4

## Accomplishments
- `parseExtractionResponse(text, deckNormalizedFronts)` now runs `filterComponents()` (from plan 16-01) immediately after the existing self-dedup/self-exclude step, dropping any `components[]` entry that doesn't resolve to a real deck card
- `extractCardsFromNotes` builds the deck Set from its existing `existingNormalizedFronts` parameter and threads it through — `scripts/local-resync.mts` inherits filtering for free since it calls `extractCardsFromNotes` directly (no second integration point needed)
- Fixed the `keyToId` scoping bug (user-locked decision): both the sync route and `local-resync.mts`'s two keyToId-feeding queries now build their lookup from ALL cards, not just cards that themselves carry `components` — real leaf-node cards are now correctly resolvable as other cards' prerequisites
- Removed the now-incorrect `keyToId.delete(nf)` branch in the sync route's update path — a card losing its own components is still a valid prerequisite target for other cards
- Extended `tests/extract-cards.test.ts` with 5 new cases (TDD RED → GREEN) covering spurious-drop, real-retain, grammar-pattern-retain-by-deck-lookup (SC3), default-empty-Set behavior, and self-exclusion-before-deck-filter ordering
- Full `npm test` (93/93) and `npm run lint` (clean) both pass with no regressions

## Task Commits

Each task was committed atomically (TDD: test → feat for Task 1):

1. **Task 1 (RED): add failing tests for deckNormalizedFronts component filtering** - `7b036d7` (test)
2. **Task 1 (GREEN): wire filterComponents into parseExtractionResponse write path** - `1412938` (feat)
3. **Task 2: fix keyToId scoping bug in sync route + local-resync.mts** - `5c9ad40` (fix)

## Files Created/Modified
- `lib/extract-cards.ts` - `parseExtractionResponse` gains `deckNormalizedFronts: Set<string> = new Set()` param; `filterComponents` imported and called after self-dedup; `extractCardsFromNotes` builds and passes the deck Set
- `tests/extract-cards.test.ts` - 5 new cases under `describe('deckNormalizedFronts filtering (GRAPH-03 write-path wiring)')`; the pre-existing dedup test updated to pass an explicit deck set
- `app/api/sync/route.ts` - `seedCards` query drops its `where: { components: { not: null } }` clause; `keyToId.delete(nf)` branch removed
- `scripts/local-resync.mts` - Both keyToId-feeding queries (per-lesson link pass, final cross-lesson relink pass) drop the same narrow-scope where clause

## Decisions Made
- Deck-filter runs strictly AFTER self-dedup/self-exclude (cheap in-memory work first, then the deck-lookup filter) — matches RESEARCH.md's stated insertion-point ordering.
- Default empty `Set()` for `deckNormalizedFronts` is intentional: any caller omitting the second argument gets all components filtered out. Documented in the JSDoc and locked by a dedicated test since the only production caller always passes the real deck set.
- The pre-existing 16-02 dedup test needed an explicit deck set (`new Set(['학교'])`) to keep testing dedup behavior in isolation from the new deck-filter default — this is a direct, expected consequence of extending the signature, not an unplanned deviation, so it's not logged under "Deviations from Plan."
- `keyToId` is now seeded from ALL cards in both files, mirroring `existingNormalizedFronts`' existing broad shape. The `!dbCard.components` guards already present in `local-resync.mts`'s two edge-linking loops continue to correctly skip a card as an edge SOURCE when it lacks components — broadening only affects which cards can be resolved as edge TARGETS (prerequisites), exactly the intended fix.

## Deviations from Plan

None - plan executed exactly as written. The pre-existing test update described above is a direct, anticipated consequence of the signature change specified by the plan itself (adding a second parameter with a default), not an unplanned deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All changes are pure code + tests; no new dependencies, no schema changes.

## Next Phase Readiness

**UNBLOCKED.** Plan 16-04 (retroactive edge reconciliation / cleanup) can now proceed with two confirmed facts from this plan:
1. The write path is fully wired — new syncs will only ever persist `components[]` entries that resolve to a real deck card, and the `keyToId` lookup used to create `CardDependency` edges is now built from the FULL deck (all cards), not just cards that themselves carry components.
2. Plan 16-04's retroactive cleanup pass should compare its drop counts against the human-approved baseline recorded in `16-01-SUMMARY.md` (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%) — any retroactive run should land in the same range, since it uses the identical `filterComponents()` logic against the same corpus.

---
*Phase: 16-components-filter-fix*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: lib/extract-cards.ts
- FOUND: tests/extract-cards.test.ts
- FOUND: app/api/sync/route.ts
- FOUND: scripts/local-resync.mts
- FOUND commit: 7b036d7 (test: add failing tests for deckNormalizedFronts component filtering)
- FOUND commit: 1412938 (feat: wire filterComponents into parseExtractionResponse write path)
- FOUND commit: 5c9ad40 (fix: scope keyToId to all cards, not just cards with components)
- `npm test`: 93/93 passing
- `npm run lint`: clean (1 pre-existing unrelated warning in components/StudySession.tsx)
