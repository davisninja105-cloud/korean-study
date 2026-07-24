---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Active Recall Study Mode
current_phase: 29
current_phase_name: Distractor Write-Side Retirement
status: ready_to_plan
stopped_at: Phase 28 complete, ready to plan Phase 29
last_updated: "2026-07-24T06:04:48.267Z"
last_activity: 2026-07-24
last_activity_desc: Phase 28 complete, transitioned to Phase 29
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-24)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 29 — Distractor Write-Side Retirement

## Current Position

Phase: 29 — Distractor Write-Side Retirement
Plan: Not started
Status: Ready to plan Phase 29
Last activity: 2026-07-24 — Phase 28 complete, transitioned to Phase 29

Progress: [██████████░░░░░░░░░░] 50%

## Performance Metrics

**Velocity:**

- Prior milestone (v1.6): 14 plans across 4 phases (24–27), 3 days
- Prior milestone (v1.5): 9 plans across 4 phases (20–23)

**Recent Trend:** —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table and .planning/RETROSPECTIVE.md.

v1.7 roadmap shaping decisions (2026-07-14):

- Coarse granularity: research's suggested 3-phase split (remove-modes → add-active → cleanup) consolidated to 2 delivery-coherent phases. The mode removal and Active build are one continuous StudySession/ModeSelector refactor whose only user-observable deliverable (Passive/Active toggle, no MC/Fill-blank) is coherent as a whole — a standalone "remove modes" phase would ship a broken Active toggle position. Removal-first ordering is preserved as intra-phase implementation sequencing (type-narrow `StudyMode`, let the compiler enumerate stale refs) per research.
- Distractor write-side retirement (CLEANUP-03) kept as its own Phase 29: it touches a distinct subsystem (extraction/sync/DTO/audit, not the study UI), changes the `CardDTO` shape, and is safest done AFTER Active is stable — retired atomically across all sites and validated with `scripts/prompt-eval.mts` (research Pitfall 8).
- Product decisions baked into Phase 28 scope: Passive is the default toggle position (MODE-02, reversed from research's Active-default suggestion during requirements); the Active hint control is tap-to-reveal / hidden-by-default (ACTIVE-02, reversed from research's always-visible suggestion).
- New-card gate (ACTIVE-05): state 0/1 cards in Active mode degrade to the Passive/exposure experience (not a full-sentence production prompt) — protects Core Value; gate design to be finalized in Phase 28 discuss-phase (research Pitfall 1).

Phase 28 close (2026-07-24): MODE-01/02, ACTIVE-01..05, CLEANUP-01/02/04 all shipped and UAT-verified (2/2 passed); `activeFace` derived fresh in render scope so mid-session state graduation (1→2) flips faces live with no reload; security review closed 4 threats at ASVS L1 with zero open. Full detail in PROJECT.md Key Decisions.

### Pending Todos

None open.

### Blockers/Concerns

- [Phase 29 flag from research — Pitfall 8] Retire the distractor chain atomically across prompt/schema/DTO/audit/tests in one pass; a half-retired chain leaves warn spam / extraction overhead.
- [carried from v1.3] `app/api/review/undo/route.ts` still lacks try/catch — out of scope; deferred candidate.
- [carried from v1.5] 거/게 romanization-flagged card fronts (post-audit cron arrivals) — out of scope; open for a future audit/fix pass.

## Deferred Items

Carried forward, informational only:

| Category | Item | Status |
|----------|------|--------|
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open |
| feature | Card retirement/mastery flag (MASTERY-01) | Deferred to v2 |
| quality | 거/게 romanization-flagged fronts (post-audit cron arrivals) | Open for future audit/fix pass |
| e2e-v2 | Cards CRUD spec (E2E-08), stubbed sync-route coverage (E2E-09), WebKit project (E2E-10) | Deferred to v2 |
| feature | Remember last-used Passive/Active toggle in localStorage (ACTIVE-06); progressive hint escalation (ACTIVE-07) | Deferred to v2 |
| hardening | `FreshnessWatcher` JSON backstop request-sequencing race (WR-01) — no observed occurrence across 44+ e2e runs | Open, non-blocking |

## Session Continuity

Last session: 2026-07-24T06:04:48.267Z
Stopped at: Phase 28 complete, ready to plan Phase 29
Resume file: None

## Operator Next Steps

- Plan Phase 29 with `/gsd-plan-phase 29` (Distractor Write-Side Retirement — CLEANUP-03)
