---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Knowledge Graph Quality & History
current_phase: 16
current_phase_name: components-filter-fix
status: executing
stopped_at: "16-04-PLAN.md Tasks 1-2 complete; paused at Task 3 blocking-human checkpoint"
last_updated: "2026-07-03T23:10:00.000Z"
last_activity: 2026-07-03
last_activity_desc: Phase 16 plan 04 Tasks 1-2 complete; awaiting developer checkpoint approval
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 16 — components-filter-fix

## Current Position

Phase: 16 (components-filter-fix) — EXECUTING
Plan: 4 of 4
Status: PAUSED at Task 3 blocking-human checkpoint (production data mutation gate)
Last activity: 2026-07-03 — Phase 16 plan 04 Tasks 1-2 complete (script created + documented); Task 3 requires a developer to run scripts/retro-filter-cleanup.mts locally, review the dry-run against the 16-01 baseline, and approve --apply

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.4): 0
- Prior milestone (v1.3): 4 plans, ~7.5 min avg, ~0.5 h total

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 16 | 0/TBD | - | - |
| 17 | 0/TBD | - | - |
| 18 | 0/TBD | - | - |
| 19 | 0/TBD | - | - |

**Recent Trend:**

- Last milestone: v1.3 Reliability & Hardening shipped 2026-07-03 (3 phases, 6 plans)
- Trend: —

*Updated after each plan completion*
| Phase 16 P01 | 35min | 3 tasks | 3 files |
| Phase 16 P02 | 4min | 2 tasks | 2 files |
| Phase 16 P03 | 15min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Roadmap-shaping decisions for v1.4:

- Phase order is dependency-driven (per research SUMMARY.md): (16) filter fix first — standalone, lowest risk, and its correctness gates whether unattended cron sync is safe to enable; (17) ReviewLog schema + idempotent write path before (18) the history page — the DDL-then-code split is a hard Turso constraint and the page is only as trustworthy as the write path; (19) cron last — highest blast-radius (first route reachable without the session cookie).
- Filter (GRAPH-03/04) resolves components by `normalizeFront()` deck-lookup, NOT literal sentence-text containment — research Reconciliation #2: substring matching would gut abstract grammar-pattern edges, the opposite of the milestone's intent. Dry-run the corpus (GRAPH-05) before wiring into the write path.
- ReviewLog idempotency (HIST-02) is core scope, not a stretch — client-generated key + `prisma.$transaction([cardReview.update, reviewLog.create])` (array form, sidesteps Turso interactive-transaction uncertainty). Undo cancels in-flight retries (HIST-03); ReviewLog stays append-only, undo never mutates rows (HIST-06).
- Zero new npm dependencies expected — all three features build on platform config (Vercel Cron + `vercel.json` + `CRON_SECRET`), one Prisma model via the manual Turso-DDL workaround, and reuse of existing pure `lib/` helpers.
- [Phase 16]: filterComponents retains components purely by deck-lookup (normalizeFront direct match or splitParticle stem fallback), never by sentence-text containment, so abstract grammar patterns like ~(으)면 are preserved (GRAPH-03)
- [Phase 16]: Human-approved corpus drop-rate baseline: grammar 8.0% (27/337), vocabulary 24.9% (539/2169), phrase 21.5% (53/246), whole-corpus 22.5% (619/2752) — grammar's low drop rate confirms no Pitfall 4 anomaly; plan 16-04 will compare its cleanup counts against this baseline
- [Phase 16]: parseExtractionResponse exported as single pure entry point for salvage + structural validation; plan 16-03 will extend it with a deckNormalizedFronts Set<string> parameter
- [Phase 16]: Deck-lookup filter (filterComponents) wired into parseExtractionResponse's per-card pipeline via a single integration point inside extractCardsFromNotes; scripts/local-resync.mts inherits filtering for free (GRAPH-03)
- [Phase 16]: keyToId lookup in app/api/sync/route.ts and scripts/local-resync.mts rescoped to ALL cards (no components-not-null where clause) so real leaf-node cards are resolvable as prerequisites; stale keyToId.delete branch removed
- [Phase 16]: scripts/retro-filter-cleanup.mts created — dry-run-by-default retroactive corpus cleanup that re-filters every persisted Card.components row and reconciles CardDependency edges (prune stale, add newly-valid), gated behind --apply; production execution is a blocking-human checkpoint per the plan's threat model (T-16-08/T-16-09), not auto-approvable

### Pending Todos

- `2026-07-02-fix-spurious-components-in-card-extraction.md` — now IN SCOPE for v1.4 Phase 16 (GRAPH-01..05). Was deferred at v1.3 close; the roadmap folds it into the Components[] Filter Fix phase.

### Blockers/Concerns

- [Phase 16 → blocking-human checkpoint] Plan 16-04 Task 3 requires a developer to run `npx tsx scripts/retro-filter-cleanup.mts` locally (dry-run), compare its per-type drop counts to the 16-01 baseline (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%), then run with `--apply` and confirm an idempotent re-run (0 further changes) before Phase 16 can close.
- [Phase 17 → research flag] The idempotency-key mechanism + its interaction with `handleUndo`'s in-flight retry is a genuine design decision, not a copy-paste. Recommend a focused discuss/research pass on the idempotency/undo interaction before planning (see research SUMMARY.md Research Flags).
- [Phase 19 → research flag] The Vercel Cron auth pattern (middleware bearer-token branch alongside the existing cookie gate) is architecturally new for this codebase (MEDIUM confidence). Worth a final direct-docs check at plan time.
- [carried from v1.3] `app/api/review/undo/route.ts` still lacks try/catch (same shape as the Phase 13-hardened routes) — out of scope; may be touched incidentally by Phase 17's undo work.

### Roadmap Evolution

- v1.3 roadmap: 3 phases (13–15), 11/11 requirements mapped, coarse granularity — shipped 2026-07-03.
- v1.4 roadmap created 2026-07-02: 4 phases (16–19), 15/15 requirements mapped, coarse granularity. Structure follows research SUMMARY.md's dependency-ordered 4-phase suggestion; boundaries and success criteria owned by roadmapper.

## Deferred Items

Carried forward, informational only:

| Category | Item | Status |
|----------|------|--------|
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open — may be addressed incidentally in Phase 17 |
| feature | Card retirement/mastery flag (MASTERY-01) | Deferred to v2 — see REQUIREMENTS.md |
| gap | "Last cron sync" visibility raised by two research passes | Confirmed IN scope as SYNC-04 (Settings ▸ Advanced timestamp) |

## Session Continuity

Last session: 2026-07-03T23:10:00.000Z
Stopped at: 16-04-PLAN.md Tasks 1-2 complete; PAUSED at Task 3 blocking-human checkpoint
Resume file: .planning/phases/16-components-filter-fix/16-04-PLAN.md

## Operator Next Steps

- Run `npx tsx scripts/retro-filter-cleanup.mts` locally (dry-run, no writes). Review the per-type report and compare to the 16-01 baseline (grammar 8.0% / vocabulary 24.9% / phrase 21.5% / whole-corpus 22.5%).
- If the dry run looks right, run `npx tsx scripts/retro-filter-cleanup.mts --apply` to mutate production, then confirm the final report and re-run the dry run once more to prove idempotency (0 further changes).
- Report back with "approved" and the recorded before/after counts (cards changed, edges pruned, edges added) — or describe any anomaly — so the plan/phase can be closed out.
