---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Knowledge Graph Quality & History
current_phase: 16
current_phase_name: components-filter-fix
status: executing
stopped_at: "Phase 16 plan 01 complete (checkpoint approved) — ready to execute plan 02"
last_updated: "2026-07-03T22:29:53.650Z"
last_activity: 2026-07-03
last_activity_desc: Phase 16 plan 01 complete (checkpoint approved)
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 16 — components-filter-fix

## Current Position

Phase: 16 (components-filter-fix) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-07-03 — Phase 16 execution started

Progress: [███░░░░░░░] 25%

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Roadmap-shaping decisions for v1.4:

- Phase order is dependency-driven (per research SUMMARY.md): (16) filter fix first — standalone, lowest risk, and its correctness gates whether unattended cron sync is safe to enable; (17) ReviewLog schema + idempotent write path before (18) the history page — the DDL-then-code split is a hard Turso constraint and the page is only as trustworthy as the write path; (19) cron last — highest blast-radius (first route reachable without the session cookie).
- Filter (GRAPH-03/04) resolves components by `normalizeFront()` deck-lookup, NOT literal sentence-text containment — research Reconciliation #2: substring matching would gut abstract grammar-pattern edges, the opposite of the milestone's intent. Dry-run the corpus (GRAPH-05) before wiring into the write path.
- ReviewLog idempotency (HIST-02) is core scope, not a stretch — client-generated key + `prisma.$transaction([cardReview.update, reviewLog.create])` (array form, sidesteps Turso interactive-transaction uncertainty). Undo cancels in-flight retries (HIST-03); ReviewLog stays append-only, undo never mutates rows (HIST-06).
- Zero new npm dependencies expected — all three features build on platform config (Vercel Cron + `vercel.json` + `CRON_SECRET`), one Prisma model via the manual Turso-DDL workaround, and reuse of existing pure `lib/` helpers.
- [Phase 16]: filterComponents retains components purely by deck-lookup (normalizeFront direct match or splitParticle stem fallback), never by sentence-text containment, so abstract grammar patterns like ~(으)면 are preserved (GRAPH-03)
- [Phase 16]: Human-approved corpus drop-rate baseline: grammar 8.0% (27/337), vocabulary 24.9% (539/2169), phrase 21.5% (53/246), whole-corpus 22.5% (619/2752) — grammar's low drop rate confirms no Pitfall 4 anomaly; plan 16-04 will compare its cleanup counts against this baseline

### Pending Todos

- `2026-07-02-fix-spurious-components-in-card-extraction.md` — now IN SCOPE for v1.4 Phase 16 (GRAPH-01..05). Was deferred at v1.3 close; the roadmap folds it into the Components[] Filter Fix phase.

### Blockers/Concerns

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

Last session: 2026-07-03T22:28:26.876Z
Stopped at: Completed 16-01-PLAN.md (checkpoint approved) — plan 01 of 4 complete in Phase 16
Resume file: .planning/phases/16-components-filter-fix/16-02-PLAN.md

## Operator Next Steps

- Plan 16-01 complete. Continue Phase 16 with plan 02 (`/gsd-execute-phase 16` or equivalent).
