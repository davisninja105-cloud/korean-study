---
gsd_state_version: 1.0
milestone: v1.7
milestone_name: Active Recall Study Mode
status: planning
last_updated: "2026-07-14T02:00:00.000Z"
last_activity: 2026-07-14
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 28 — Active Recall Study Mode (roadmap created, ready to plan)

## Current Position

Phase: 28 of 29 (Active Recall Study Mode)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-14 — v1.7 roadmap created (Phases 28–29, 11/11 requirements mapped)

Progress: [░░░░░░░░░░] 0%

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

### Pending Todos

None open.

### Blockers/Concerns

- [Phase 28 flag from research — Pitfall 2] Active mode must pass `needsBlank: false` to sentence selection (blank-safety doesn't apply when the whole sentence is hidden); passing `true` silently picks the wrong sentence. Verify parity with Passive selection.
- [Phase 28 flag from research — Pitfall 5] Delete modes by narrowing the `StudyMode` type first and letting `tsc` enumerate stale refs (mcOptions, seed, fillInput, advanceTimer, keyboard branches); avoid manual grep-deletion. Delete per mode atomically.
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

Last session: 2026-07-14 — v1.7 roadmap created
Stopped at: ROADMAP.md + REQUIREMENTS.md traceability written for Phases 28–29
Resume file: None

## Operator Next Steps

- Plan Phase 28 with `/gsd-plan-phase 28` (discuss-phase first to finalize the ACTIVE-05 new-card gate design)
