---
phase: 16-components-filter-fix
plan: 04
subsystem: knowledge-graph
tags: [prisma, turso, data-integrity, dry-run, tsx]

# Dependency graph
requires:
  - phase: 16-01
    provides: "lib/filter-components.ts — pure filterComponents(rawComponents, deckNormalizedFronts) deck-lookup filter; human-approved corpus drop-rate baseline (grammar 8.0%, vocabulary 24.9%, phrase 21.5%, whole-corpus 22.5%)"
  - phase: 16-03
    provides: "keyToId all-cards scope fix (no components-not-null where clause) mirrored here for edge reconciliation"
provides:
  - "scripts/retro-filter-cleanup.mts — dry-run-by-default corpus cleanup: re-filters every persisted Card.components row via filterComponents(), reconciles CardDependency edges (prune stale, add newly-valid), gated behind --apply"
  - "CLAUDE.md Scripts section entry documenting the new script"
  - "Production corpus cleaned: 511 cards rewritten, 2 stale edges pruned, 4 newly-valid edges added; live corpus now at 1039 cards / 2133 CardDependency edges, confirmed idempotent"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dotenv-first dynamic-import pattern (mirrors scripts/local-resync.mts) applied to a NEW cleanup script that also WRITES corrected data, not just reads"
    - "Desired-edge-set reconciliation (compute full desired set from cleaned data, diff against existing rows to get prune/add deltas) rather than blind delete-and-recreate — avoids edge churn/downtime and stays idempotent"

key-files:
  created:
    - scripts/retro-filter-cleanup.mts
  modified:
    - CLAUDE.md

key-decisions:
  - "Script loads ALL cards with no where clause for both the deck Set and the keyToId map (RESEARCH.md Pitfall 1 / mirrors the 16-03 fix) — a card with no components of its own remains a valid, resolvable prerequisite target."
  - "Desired CardDependency edge set is computed from CLEANED (post-filter) components, not raw persisted values — this is what makes the edge reconciliation correctly prune edges that only existed because of a now-dropped spurious component."
  - "Writes are fully gated behind an explicit --apply CLI flag; the reporting section (per-type before/after, baseline comparison, prune/add counts) runs identically in both modes so a developer can review the exact effect before ever committing to a write."
  - "Production execution was a blocking-human checkpoint (T-16-08, T-16-09). The orchestrator ran the dry-run, cross-checked its per-type drop counts against the plan 16-01 baseline (exact match: grammar 8.0%/27/337, vocabulary 24.9%/539/2169, phrase 21.5%/53/246, whole 22.5%/619/2752), inspected the actual to-be-pruned/to-be-added edges for plausibility, surfaced one known-acceptable anomaly (see below), and the user responded \"apply as is\" — only then was --apply run against the live Turso corpus."
  - "One accepted known-limitation edge: 화나다 → 화 (episode counter) is a homonym collision (화 as 'anger' resolves against a same-spelled 화 that is actually a TV-episode counter card). This is a pre-existing data-ambiguity issue in the deck-lookup resolution mechanism itself (normalizeFront string match has no sense-disambiguation), not something this filter-fix milestone's scope (GRAPH-01/03/04) covers — the filter only answers 'does this component resolve to SOME real card,' never 'is it the CORRECT sense.' Explicitly flagged to and accepted by the user; out of scope for this phase, a candidate for a future card-sense-disambiguation effort if it recurs."

patterns-established:
  - "Pattern: retroactive data-cleanup scripts that both read AND write should report identically in dry-run and --apply modes, and should express their write plan as a diff against a freshly-computed 'desired state' (not an imperative sequence of raw JSON edits) — makes the human-review step meaningful and keeps the operation idempotent."

requirements-completed: [GRAPH-03]

coverage:
  - id: D1
    description: "scripts/retro-filter-cleanup.mts created: dry-run-default, --apply-gated, imports filterComponents from lib/filter-components.ts (not re-derived), reconciles CardDependency edges, never deletes Card/Lesson rows, builds deck Set + keyToId from ALL cards"
    requirement: "GRAPH-03"
    verification:
      - kind: other
        ref: "bash -c 'test -f scripts/retro-filter-cleanup.mts && grep -q \"const APPLY = process.argv.includes(.--apply.)\" scripts/retro-filter-cleanup.mts && grep -q \"filter-components\" scripts/retro-filter-cleanup.mts && grep -Eq \"deleteMany|cardDependency\" scripts/retro-filter-cleanup.mts && echo OK' → OK"
        status: pass
      - kind: other
        ref: "npm run lint → clean (1 pre-existing unrelated warning in components/StudySession.tsx); npx tsc --noEmit → clean"
        status: pass
    human_judgment: false
  - id: D2
    description: "CLAUDE.md Scripts section documents retro-filter-cleanup.mts (dry-run-first, --apply gate, developer-run-only, never in the sync request path); no other section touched"
    requirement: "GRAPH-03"
    verification:
      - kind: other
        ref: "grep -c retro-filter-cleanup.mts CLAUDE.md → 1; git diff CLAUDE.md touches only the Scripts section"
        status: pass
    human_judgment: false
  - id: D3
    description: "Production execution: developer (orchestrator + user) ran the dry-run, compared to the 16-01 baseline (exact match), sanity-checked prune-set plausibility (one accepted homonym-collision edge), applied, and confirmed idempotent re-run (0 further changes) — this closes GRAPH-03 Success Criterion 1 against the EXISTING corpus"
    requirement: "GRAPH-03"
    verification:
      - kind: other
        ref: "npx tsx scripts/retro-filter-cleanup.mts --apply → cards changed 511, edges pruned 2, edges added 4, total edges after 2133; re-run dry-run afterward → 0 cards to change / 0 edges to prune / 0 edges to add (idempotent); this continuation session independently re-ran the dry-run and confirmed the same 0/0/0 state against 1039 cards / 2133 edges"
        status: pass
      - kind: manual
        ref: "User reviewed dry-run output against the 16-01 baseline and the 화나다 → 화 (episode counter) homonym-collision flag, responded \"apply as is\""
        status: pass
    human_judgment: true
    rationale: "This was a blocking-human, hard-to-reverse production data mutation (T-16-08/T-16-09 in the plan's threat model). The prior executing agent explicitly did not run the script itself; the orchestrator ran it after receiving user approval. This continuation session independently re-verified the resulting DB state rather than trusting the prior session's report."

# Metrics
duration: ~20min (Tasks 1-2 in prior session ~15min; this continuation session verification + bookkeeping ~5min)
completed: 2026-07-03
status: complete
---

# Phase 16 Plan 04: Retroactive Corpus Cleanup Script — Summary

**Dry-run-by-default `scripts/retro-filter-cleanup.mts` re-filtered every persisted `Card.components` row and reconciled `CardDependency` edges using an all-cards `keyToId`; the human-approved production run rewrote 511 cards, pruned 2 stale edges, and added 4 newly-valid edges, closing GRAPH-03 Success Criterion 1 against the existing corpus.**

## Performance

- **Duration:** ~20 min total (Tasks 1-2 ~15 min in the initial session; this continuation session's independent verification + bookkeeping ~5 min)
- **Started:** 2026-07-03 (session continuation from plan 16-03)
- **Completed:** 2026-07-03 — all tasks complete, checkpoint approved, production cleanup applied and verified
- **Tasks:** 3 of 3 complete
- **Files modified:** 2

## Accomplishments
- Created `scripts/retro-filter-cleanup.mts` — dry-run-by-default, mirrors `local-resync.mts`'s dotenv-first dynamic-import pattern so it can import the TypeScript `lib/filter-components.ts` directly
- Loads ALL cards (no where clause) to build both the deck-lookup Set and the edge-reconciliation `keyToId` map, matching the plan 16-03 scoping fix
- Re-filters every persisted `Card.components` row via `filterComponents()`, tallies per-`Card.type` before/after/dropped counts, and prints a comparison against the human-approved plan 16-01 baseline
- Computes a desired `CardDependency` edge set from the CLEANED components, diffs it against existing rows to get precise prune/add deltas (not a blind delete-and-recreate)
- All writes (`Card.components` batch update via chunked `$transaction`, `CardDependency` prune via chunked `deleteMany`, edge creation via idempotent upsert) are gated behind an explicit `--apply` flag; dry-run mode performs the identical read/report path and writes nothing
- Never touches `Card` or `Lesson` delete paths — only `Card.components` values and `CardDependency` rows
- Documented the script in `CLAUDE.md`'s Scripts section (dry-run-first, `--apply` gate, developer-run-only, never in the `/api/sync` request path)
- `npm run lint` clean (1 pre-existing unrelated warning); `npx tsc --noEmit` clean
- **Production cleanup executed and verified:** dry-run matched the plan 16-01 baseline exactly (grammar 8.0%/27/337, vocabulary 24.9%/539/2169, phrase 21.5%/53/246, whole 22.5%/619/2752); one known-acceptable homonym-collision edge (화나다 → 화 (episode counter)) was flagged and explicitly accepted by the user as a pre-existing, out-of-scope data ambiguity; `--apply` ran against the live Turso corpus (511 cards changed, 2 edges pruned, 4 edges added, 2133 total edges after); a follow-up dry-run confirmed idempotency (0/0/0); this continuation session independently re-ran the dry-run and confirmed the same steady state (1039 cards, 2133 edges, 0 pending changes)

## Task Commits

1. **Task 1: Create scripts/retro-filter-cleanup.mts** - `16b4507` (feat)
2. **Task 2: Document the cleanup script in CLAUDE.md Scripts section** - `f39f2af` (docs)
3. **Task 3 (checkpoint:human-verify, gate="blocking-human"): APPROVED** — dry-run reviewed against the 16-01 baseline (exact match), one homonym-collision edge flagged and accepted, user responded "apply as is"; `npx tsx scripts/retro-filter-cleanup.mts --apply` run against production (511 cards changed, 2 edges pruned, 4 edges added, 2133 total edges); idempotency confirmed by a follow-up dry-run and independently re-confirmed by this continuation session

## Files Created/Modified
- `scripts/retro-filter-cleanup.mts` - NEW. Dry-run-default corpus cleanup: re-filters `Card.components`, reconciles `CardDependency` edges, `--apply`-gated writes, before/after reporting against the 16-01 baseline
- `CLAUDE.md` - Added one bullet to the Scripts section documenting the new script

## Production Cleanup Results

| Metric | Value |
|---|---|
| Cards changed | 511 |
| Edges pruned | 2 |
| Edges added | 4 |
| Total cards in DB (after) | 1039 |
| Total CardDependency edges in DB (after) | 2133 |
| Idempotency re-run | 0 cards to change / 0 edges to prune / 0 edges to add |

**Comparison to plan 16-01 dry-run baseline** (exact match — confirms the retroactive-cleanup script's filter logic and deck-set scope are consistent with the earlier read-only diagnostic):

| Card type | 16-01 baseline (dropped/total, %) | 16-04 dry-run (pre-apply) |
|---|---|---|
| grammar | 27/337, 8.0% | 27/337, 8.0% |
| vocabulary | 539/2169, 24.9% | 539/2169, 24.9% |
| phrase | 53/246, 21.5% | 53/246, 21.5% |
| whole corpus | 619/2752, 22.5% | 619/2752, 22.5% |

**Known accepted limitation:** one pruned/re-resolved edge involves a homonym collision — 화나다 ("to get angry") had a component 화 that resolved via `normalizeFront()` string match to an unrelated 화 (TV-episode counter) card, rather than the correct sense. This is a pre-existing ambiguity in the deck-lookup resolution mechanism itself (it matches on surface string only, with no sense-disambiguation) — not a defect introduced by this phase's filter, and outside GRAPH-01/03/04's scope (which only guarantee "resolves to a real card," not "resolves to the correct sense of that card"). Flagged during human review and explicitly accepted by the user as an out-of-scope, pre-existing data issue. If homonym collisions like this recur, they are a candidate for a future card-sense-disambiguation initiative — not a Phase 16 defect.

## Decisions Made
- Loaded ALL cards (no `where` clause) for both the deck Set (Phase A) and the `keyToId` map (Phase C) — mirrors RESEARCH.md Pitfall 1 and the plan 16-03 scoping fix. A leaf-node card without its own components remains a valid, resolvable prerequisite target for other cards.
- The desired edge set is computed from CLEANED (post-filter) components, not raw persisted values, so edges that only existed because of a now-dropped spurious component are correctly identified as stale and pruned.
- Reporting runs identically in dry-run and `--apply` modes (same per-type table, same baseline comparison, same prune/add counts) so a developer reviews the exact effect before ever triggering a write.
- Production execution was a genuine blocking-human checkpoint (T-16-08 unsafe/partial production mutation, T-16-09 over-pruning): the executing agent that built the script did not run it; the orchestrator ran the dry-run, brought results to the user for review (including the one homonym-collision anomaly), and only ran `--apply` after explicit approval ("apply as is").
- The 화나다 → 화 (episode counter) homonym collision is accepted as out of scope for this phase — the deck-lookup filter's contract is "resolves to a real card," never "resolves to the correct sense," and fixing sense-disambiguation is a separate, larger initiative not currently on the roadmap.

## Deviations from Plan

None - plan executed exactly as written across all three tasks. Task 3's blocking-human checkpoint was genuinely gated on human approval; approval was obtained and the production write was executed and independently re-verified in this continuation session.

## Issues Encountered

None. `npm run lint` and `npx tsc --noEmit` were clean at Task 1-2 completion. Production apply and the two independent dry-run confirmations (orchestrator's post-apply check, and this continuation session's fresh check) all returned consistent, expected results.

## User Setup Required

None further — the one piece of user setup required by this plan (running/approving the production cleanup) has been completed. No ongoing service configuration is needed; the script is a one-off developer tool, safe to re-run in dry-run mode at any time for a sanity check (it will report 0/0/0 unless new spurious components enter the corpus via a regression).

## Next Phase Readiness

**COMPLETE.** All three tasks are done and committed. GRAPH-03 Success Criterion 1 is now closed against the EXISTING corpus (not just future syncs) — the production Turso database has been cleaned (511 cards rewritten, 2 stale edges pruned, 4 newly-valid edges added) and confirmed idempotent by two independent dry-run checks. This is the final plan in Phase 16 — **Phase 16 (Components[] Filter Fix) is now fully complete: 4/4 plans, all 5 requirements (GRAPH-01 through GRAPH-05) satisfied.** Phase 17 (ReviewLog Schema & Idempotent Write Path) may now proceed per the roadmap's dependency ordering.

---
*Phase: 16-components-filter-fix*
*Completed: 2026-07-03*

## Self-Check: PASSED

- FOUND: scripts/retro-filter-cleanup.mts
- FOUND commit: 16b4507 (feat: add retro-filter-cleanup.mts dry-run corpus cleanup script)
- FOUND commit: f39f2af (docs: document retro-filter-cleanup.mts in CLAUDE.md Scripts section)
- FOUND: CLAUDE.md documents retro-filter-cleanup.mts (grep confirms 1 match)
- Independently re-ran `npx tsx scripts/retro-filter-cleanup.mts` (dry-run) in this continuation session: reported 1039 cards loaded, deck set size 1039, 0 cards to change, 0 edges to prune, 0 edges to add, existing edge total 2133 — matches the prior session's reported post-apply state exactly
- `npm run lint`: clean (1 pre-existing unrelated warning)
- `npx tsc --noEmit`: clean
