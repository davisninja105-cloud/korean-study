---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Extraction Quality & Reliability
status: planning
last_updated: "2026-07-06T09:00:00.000Z"
last_activity: 2026-07-06
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** v1.5 roadmap created — Phase 20 (Extraction Pipeline Hardening) ready to plan

## Current Position

Phase: 20 of 23 (Extraction Pipeline Hardening) — first v1.5 phase
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-06 — v1.5 roadmap created (Phases 20–23), 12/12 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.4): 15 plans across 4 phases (16–19)
- Prior milestone (v1.3): 6 plans across 3 phases

**By Phase (v1.5):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 20 | 0/TBD | - | - |
| 21 | 0/TBD | - | - |
| 22 | 0/TBD | - | - |
| 23 | 0/TBD | - | - |

**Recent Trend:**

- Last milestone: v1.4 Knowledge Graph Quality & History shipped 2026-07-05 (4 phases, 15 plans)
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table and .planning/RETROSPECTIVE.md.

v1.5 roadmap shaping decisions (2026-07-06):
- Coarse granularity: research's 9-phase suggestion compressed to 4 delivery-coherent phases (20–23).
- Extraction hardening (Phase 20) and reliability bugs (Phase 23) are independent tracks; the audit→prompt/fix track (21 → 22) is strictly serial and findings-first.
- Prompt review + validation + corpus fixes combined into Phase 22 (one "act on the findings" workflow); validation must show audit-check counts drop before fixes are applied.
- Hard rule for the milestone (research pitfall): all corpus fixes mutate cards in place by `id` — never delete+recreate (cascades wipe FSRS state + ReviewLog history).

### Pending Todos

None open.

### Blockers/Concerns

- [carried from v1.3] `app/api/review/undo/route.ts` still lacks try/catch (same shape as the Phase 13-hardened routes) — out of scope; deferred candidate for a future milestone.

### Roadmap Evolution

- v1.4 roadmap: 4 phases (16–19), 15/15 requirements mapped, coarse. Archived to `.planning/milestones/v1.4-ROADMAP.md`.
- v1.5 roadmap: 4 phases (20–23), 12/12 requirements mapped, coarse granularity — created 2026-07-06.

## Deferred Items

Carried forward, informational only:

| Category | Item | Status |
|----------|------|--------|
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open |
| feature | Card retirement/mastery flag (MASTERY-01) | Deferred to v2 |
| gap | Near-duplicate card *merging* (FSRS history absorption) | Out of scripted scope for Phase 22; becomes its own decision if the audit finds a large cluster |

## Session Continuity

Last session: 2026-07-06T09:00:00.000Z
Stopped at: v1.5 roadmap created (Phases 20–23); files written (ROADMAP.md, STATE.md, REQUIREMENTS.md traceability)
Resume file: None

## Operator Next Steps

- Plan the first phase: `/gsd-plan-phase 20`
