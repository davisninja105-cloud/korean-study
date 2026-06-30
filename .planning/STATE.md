---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Performance & Snappiness
current_phase: 10
current_phase_name: cards-hydration-api-parallelization
status: completed
stopped_at: Phase 10 UI-SPEC approved
last_updated: "2026-06-30T01:19:21.698Z"
last_activity: 2026-06-30
last_activity_desc: Phase 10 execution started
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 10 complete — RSC hydration and query parallelization shipped

## Current Position

Phase: 10 (cards-hydration-api-parallelization) — EXECUTING
Plan: 2 of 2
Status: complete
Last activity: 2026-06-30 — Phase 10 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 8 (v1.0) + 12 (v1.1)
- Average duration: -
- Total execution time: 0 hours (v1.2)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 9 | TBD | - | - |
| 10 | TBD | - | - |
| 11 | TBD | - | - |
| 12 | TBD | - | - |

**Recent Trend:**

- Last milestone: v1.1 UI/UX Polish shipped 2026-06-29 (7 phases, 20 commits)
- Trend: -

*Updated after each plan completion*
| Phase 10 P01 | 45min | 3 tasks | 2 files |
| Phase 10 P02 | 3min | - tasks | - files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.2 phase order is RSC build-order driven: Skeletons (additive, zero-risk) → Cards+API (establishes RSC+DTO pattern, parallelizes /api/cards/due) → Study (most complex, phase state machine) → Home+Habits (dashboard hydration)
- DTO pattern (RSC-05) is the first code-review gate in Phase 10 and enforced in every later RSC conversion — no raw Prisma Date crosses the server→client boundary (ISO string or epoch ms only)
- DB-01 (Promise.all in /api/cards/due) is independent of RSC conversion; grouped with Cards in Phase 10 for focus; wrap in try/catch for graceful degradation
- No new npm packages — every v1.2 pattern (RSC, loading.tsx, Promise.all, Suspense) is built into Next.js 16 + React 19
- [Phase ?]: Promise.allSettled parallelizes pool + known-lemmas queries in /api/cards/due; edge query stays sequential (depends on pool IDs)
- [Phase ?]: Pool failure returns 500; known-lemmas failure degrades to empty Set — non-critical ranking signal never crashes the request

### Pending Todos

None yet.

### Blockers/Concerns

- `loading.tsx` only shows on client-side navigation, not first load — first-load speed comes from RSC hydration, navigation jank from the skeleton; test in a production build (`next build && next start`), not `next dev`
- Keep `app/layout.tsx` structural-only — its existing runtime data fetch (button/reward colors) could block `loading.tsx`; audit during Phase 12
- Turso parallel-query rate-limit behavior unconfirmed — verify during Phase 10 planning; fall back to `Promise.allSettled` if parallelizing trips limits
- Verify no other page (`/study`, `/wrapped`) relies on `HabitTracker` self-fetch before adding an `initialData` prop (Phase 12)
- Each skeleton must match real content height to avoid layout shift — manual height audit during Phase 9

### Roadmap Evolution

- v1.2 roadmap created 2026-06-29: 4 phases (9–12), 11/11 requirements mapped, coarse granularity.

## Deferred Items

Items acknowledged and deferred at v1.1 milestone close on 2026-06-29:

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 3 (ui-ux-audit) — no VERIFICATION.md | Low risk — doc-only phase; self-check passed |
| verification | Phase 4 (design-system-tokens-sweep) — no VERIFICATION.md | Low risk — grep evidence in 3 SUMMARY files |
| tech_debt | WR-01: --sab useEffect runs post-hydration (brief layout shift on first iPhone hard-load) | Inherent to approach |
| tech_debt | IN-01: Cards view-toggle missing role="group" aria-label="View" | Minor a11y gap |
| tech_debt | NAV-01: iOS safe-area runtime behavior unverified on physical device | Code wiring correct; requires physical iPhone to confirm |

## Session Continuity

Last session: 2026-06-30T01:04:58.242Z
Stopped at: Phase 10 UI-SPEC approved
Resume file: .planning/phases/10-cards-hydration-api-parallelization/10-UI-SPEC.md

## Operator Next Steps

- Plan the first v1.2 phase with `/gsd-plan-phase 9`
