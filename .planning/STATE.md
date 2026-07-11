---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Freshness, Performance & E2E Testing
current_phase: 24
current_phase_name: freshness-diagnosis-spike
status: executing
stopped_at: Phase 24 context gathered
last_updated: "2026-07-11T09:00:50.366Z"
last_activity: 2026-07-11
last_activity_desc: Phase 24 execution started
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-10)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 24 — freshness-diagnosis-spike

## Current Position

Phase: 24 (freshness-diagnosis-spike) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 24
Last activity: 2026-07-11 — Phase 24 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Prior milestone (v1.5): 9 plans across 4 phases (20–23)
- Prior milestone (v1.4): 15 plans across 4 phases (16–19)

**By Phase (v1.6):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 24 | 0/TBD | - | - |
| 25 | 0/TBD | - | - |
| 26 | 0/TBD | - | - |
| 27 | 0/TBD | - | - |

**Recent Trend:**

- Last milestone: v1.5 Extraction Quality & Reliability shipped 2026-07-10 (4 phases, 9 plans, 5 days)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table and .planning/RETROSPECTIVE.md.

v1.6 roadmap shaping decisions (2026-07-10):

- Coarse granularity: research's suggested 5-phase structure compressed to 4 delivery-coherent phases (24–27); the diagnosis spike stays its own phase because it's the milestone's central risk gate (the prior fix regressed precisely because nobody diagnosed first).
- Hard build-order invariant (research): diagnosis (24) + E2E harness with a red freshness-regression spec and first-load baseline (25) must both exist BEFORE the fix (26) — the fix is proven by red→green, never by feel. Coverage/perf (27) is a non-blocking follow-on.
- Freshness is a client-side Router Cache problem, not a server caching issue — every main page already declares `dynamic = 'force-dynamic'`. Fix is surgical: `router.refresh()` + gated per-shell prop-sync + a `FreshnessWatcher`, not `force-dynamic`/Route-Handler `revalidatePath` (Pitfall 1).
- E2E must never touch production Turso: isolated `file:` SQLite + a fail-fast host guard on any `libsql://` URL (Pitfall 5). Only new deps are dev-only (`@playwright/test`, optional `@playwright/mcp`); zero new production dependencies.

### Pending Todos

None open.

### Blockers/Concerns

- [Phase 26 flag from research] `StudyClient`'s existing lesson-range-filter re-fetch could double-fetch against a route-level `router.refresh()` — must be checked explicitly in the Phase 26 plan.
- [Phase 26 flag from research] Per-shell prop-sync gating strategy (which of the four shells needs what condition) is the highest-risk implementation detail — finalize it in the Phase 26 plan before coding.
- [carried from v1.3] `app/api/review/undo/route.ts` still lacks try/catch (same shape as the Phase 13-hardened routes) — out of scope; deferred candidate.
- [carried from v1.5] 거/게 romanization-flagged card fronts (post-audit cron arrivals) — out of scope; open for a future audit/fix pass.

### Roadmap Evolution

- v1.5 roadmap: 4 phases (20–23), 12/12 requirements mapped, coarse. Archived to `.planning/milestones/v1.5-ROADMAP.md`.
- v1.6 roadmap: 4 phases (24–27), 16/16 requirements mapped, coarse granularity — created 2026-07-10.

## Deferred Items

Carried forward, informational only:

| Category | Item | Status |
|----------|------|--------|
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open |
| feature | Card retirement/mastery flag (MASTERY-01) | Deferred to v2 |
| quality | 거/게 romanization-flagged fronts (post-audit cron arrivals) | Open for future audit/fix pass |
| e2e-v2 | Cards CRUD spec (E2E-08), stubbed sync-route coverage (E2E-09), WebKit project (E2E-10) | Deferred to v2 |

## Session Continuity

Last session: 2026-07-11T05:39:50.429Z
Stopped at: Phase 24 context gathered
Resume file: .planning/phases/24-freshness-diagnosis-spike/24-CONTEXT.md

## Operator Next Steps

- Review the v1.6 roadmap draft (Phases 24–27) below / in `.planning/ROADMAP.md`.
- On approval, plan Phase 24 with `/gsd-plan-phase 24`.
