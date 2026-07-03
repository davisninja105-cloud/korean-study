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
  - "Desired CardDependency edge set is computed from CLEANED (post-filter) components, not the raw persisted values — this is what makes the edge reconciliation correctly prune edges that only existed because of a now-dropped spurious component."
  - "Writes are fully gated behind an explicit --apply CLI flag; the reporting section (per-type before/after, baseline comparison, prune/add counts) runs identically in both modes so a developer can review the exact effect before ever committing to a write."
  - "Task 3 (production execution) is a blocking-human checkpoint per the plan's threat model (T-16-08, T-16-09) — this executor did NOT run the dry-run or --apply itself, and did not fabricate approval. The actual developer must run the script, compare output to the 16-01 baseline, and explicitly approve before any production write happens."

patterns-established:
  - "Pattern: retroactive data-cleanup scripts that both read AND write should report identically in dry-run and --apply modes, and should express their write plan as a diff against a freshly-computed 'desired state' (not an imperative sequence of raw JSON edits) — makes the human-review step meaningful and keeps the operation idempotent."

requirements-completed: []

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
    description: "Production execution: developer runs the dry-run, compares to the 16-01 baseline, sanity-checks prune-set plausibility, applies, and confirms idempotent re-run (0 further changes) — this closes GRAPH-03 Success Criterion 1 against the EXISTING corpus"
    requirement: "GRAPH-03"
    verification: []
    human_judgment: true
    rationale: "This is a blocking-human, hard-to-reverse production data mutation (T-16-08/T-16-09 in the plan's threat model). The executing agent is explicitly instructed NOT to run the script (dry-run or --apply) itself and not to fabricate approval — only a human developer reviewing real output against the 16-01 baseline can authorize the write."

# Metrics
duration: ~15min (Tasks 1-2 only; Task 3 pending human action)
completed: 2026-07-03
status: paused
---

# Phase 16 Plan 04: Retroactive Corpus Cleanup Script — Task 1-2 Summary (Checkpoint Pending)

**Dry-run-by-default `scripts/retro-filter-cleanup.mts` that re-filters every persisted `Card.components` row and reconciles `CardDependency` edges using an all-cards `keyToId` — writes gated behind `--apply`, execution against production deferred to a blocking-human checkpoint.**

## Performance

- **Duration:** ~15 min (Tasks 1-2)
- **Started:** 2026-07-03 (session continuation from plan 16-03)
- **Completed:** Tasks 1-2 complete; Task 3 (blocking-human checkpoint) reached and PAUSED
- **Tasks:** 2 of 3 complete (Task 3 is a blocking-human checkpoint, not auto-executable)
- **Files modified:** 2

## Accomplishments
- Created `scripts/retro-filter-cleanup.mts` — dry-run-by-default, mirrors `local-resync.mts`'s dotenv-first dynamic-import pattern so it can import the TypeScript `lib/filter-components.ts` directly
- Loads ALL cards (no where clause) to build both the deck-lookup Set and the edge-reconciliation `keyToId` map, matching the plan 16-03 scoping fix
- Re-filters every persisted `Card.components` row via `filterComponents()`, tallies per-`Card.type` before/after/dropped counts, and prints a comparison against the human-approved plan 16-01 baseline (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%)
- Computes a desired `CardDependency` edge set from the CLEANED components, diffs it against existing rows to get precise prune/add deltas (not a blind delete-and-recreate)
- All writes (`Card.components` batch update via chunked `$transaction`, `CardDependency` prune via chunked `deleteMany`, edge creation via idempotent `upsert`) are gated behind an explicit `--apply` flag; dry-run mode performs the identical read/report path and writes nothing
- Never touches `Card` or `Lesson` delete paths — only `Card.components` values and `CardDependency` rows
- Documented the script in `CLAUDE.md`'s Scripts section (dry-run-first, `--apply` gate, developer-run-only, never in the `/api/sync` request path)
- `npm run lint` clean (1 pre-existing unrelated warning); `npx tsc --noEmit` clean

## Task Commits

1. **Task 1: Create scripts/retro-filter-cleanup.mts** - `16b4507` (feat)
2. **Task 2: Document the cleanup script in CLAUDE.md Scripts section** - `f39f2af` (docs)

**Task 3 (checkpoint:human-verify, gate="blocking-human"): PAUSED — awaiting developer action.**

## Files Created/Modified
- `scripts/retro-filter-cleanup.mts` - NEW. Dry-run-default corpus cleanup: re-filters `Card.components`, reconciles `CardDependency` edges, `--apply`-gated writes, before/after reporting against the 16-01 baseline
- `CLAUDE.md` - Added one bullet to the Scripts section documenting the new script

## Decisions Made
- Loaded ALL cards (no `where` clause) for both the deck Set (Phase A) and the `keyToId` map (Phase C) — mirrors RESEARCH.md Pitfall 1 and the plan 16-03 scoping fix. A leaf-node card without its own components remains a valid, resolvable prerequisite target for other cards.
- The desired edge set is computed from CLEANED (post-filter) components, not raw persisted values, so edges that only existed because of a now-dropped spurious component are correctly identified as stale and pruned.
- Reporting runs identically in dry-run and `--apply` modes (same per-type table, same baseline comparison, same prune/add counts) so a developer reviews the exact effect before ever triggering a write.
- Per the plan's `sequential_execution` instructions and threat model (T-16-08 unsafe/partial production mutation, T-16-09 over-pruning), this executor did NOT run the dry-run or `--apply` itself and did not fabricate approval — Task 3 is a genuine blocking-human checkpoint.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1-2. Task 3's blocking-human checkpoint was reached and this executor stopped as instructed, without running the script.

## Issues Encountered

None. Both `npm run lint` and `npx tsc --noEmit` are clean.

## User Setup Required

**Action required — blocking-human checkpoint (Task 3).** The developer must:
1. Dry run: `npx tsx scripts/retro-filter-cleanup.mts` (writes NOTHING). Review the per-type report.
2. Compare its dropped-component totals (grammar % / vocabulary % / phrase %) against the plan 16-01 baseline (grammar 8.0%, vocabulary 24.9%, phrase 21.5%, whole-corpus 22.5%) recorded in `16-01-SUMMARY.md`. A wildly different grammar drop rate is a red flag — investigate before applying.
3. Sanity-check the edges-to-prune count/sample: they should look plausibly spurious, not obviously-correct prerequisite links.
4. If the dry run looks right: apply with `npx tsx scripts/retro-filter-cleanup.mts --apply`.
5. Confirm the final report (cards changed, edges pruned, edges added, total edges after). Optionally cross-check with `node scripts/check-edges.mjs`.
6. Re-run the dry run once more — it should report 0 cards to change and 0 edges to prune/add (idempotency proof).
7. Report back with "approved" and the recorded before/after counts, or describe any anomaly.

## Next Phase Readiness

**PAUSED at Task 3 (blocking-human checkpoint).** Tasks 1-2 are complete and committed. GRAPH-03 Success Criterion 1 will not be closed against the EXISTING corpus until the developer runs the cleanup script per the steps above and this plan is resumed with the approved counts recorded. This is the final plan in Phase 16 — the phase cannot be marked complete until this checkpoint resolves.

---
*Phase: 16-components-filter-fix*
*Completed: 2026-07-03 (Tasks 1-2; Task 3 pending)*

## Self-Check: PASSED

- FOUND: scripts/retro-filter-cleanup.mts
- FOUND commit: 16b4507 (feat: add retro-filter-cleanup.mts dry-run corpus cleanup script)
- FOUND commit: f39f2af (docs: document retro-filter-cleanup.mts in CLAUDE.md Scripts section)
- `npm run lint`: clean (1 pre-existing unrelated warning)
- `npx tsc --noEmit`: clean
