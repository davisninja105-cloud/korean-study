---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Performance & Snappiness
current_phase: 12
status: completed
stopped_at: Completed 12-02-PLAN.md
last_updated: "2026-07-01T15:44:58.522Z"
last_activity: 2026-07-01
last_activity_desc: Phase 12 complete
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
  percent: 100
current_phase_name: home-habits-hydration
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** v1.2 milestone complete — ready to archive

## Current Position

Phase: 12 (home-habits-hydration) — COMPLETE
Plan: 3/3 complete
Status: Milestone v1.2 100% complete (4/4 phases) — ready for /gsd-complete-milestone
Last activity: 2026-07-01 — Phase 12 complete (UAT 5/5 passed, security verified, VERIFICATION.md passed)

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 3 (v1.0) + 12 (v1.1)
- Average duration: -
- Total execution time: 0 hours (v1.2)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 9 | TBD | - | - |
| 10 | TBD | - | - |
| 11 | TBD | - | - |
| 12 | 3 | - | - |

**Recent Trend:**

- Last milestone: v1.1 UI/UX Polish shipped 2026-06-29 (7 phases, 20 commits)
- Trend: -

*Updated after each plan completion*
| Phase 10 P01 | 45min | 3 tasks | 2 files |
| Phase 10 P02 | 3min | - tasks | - files |
| Phase 11 P01 | 2min | 2 tasks | 4 files |
| Phase 11 P03 | 1m | 1 tasks | 1 files |
| Phase 11 P02 | 12min | 3 tasks | 3 files |
| Phase 12 P01 | 4m | 2 tasks | 4 files |
| Phase 12 P02 | 15m | 3 tasks | 3 files |
| Phase 12 P03 | 7m | 2 tasks | 2 files |

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
- [Phase ?]: submitReview is now synchronous — queue advances immediately via client-side reviewCard() with fire-and-forget POST /api/review (D-08/D-09)
- [Phase ?]: StudyClient starts in select-mode — cards arrive as props from RSC (RSC-02)
- [Phase ?]: Filter re-fetch uses isFilterLoading spinner in select-mode, not setPhase(loading) — D-06
- [Phase ?]: No try/catch at RSC page level — Next.js error boundaries handle getStudyCards throws
- [Phase ?]: Prisma 7 groupBy with _count:true returns scalar
- [Phase ?]: No new ActivityDayDTO type invented; reuses existing DayRecord
- [Phase ?]: Single source of truth for getStats() and getActivityData() per D-05

### Pending Todos

None yet.

### Blockers/Concerns

- `loading.tsx` only shows on client-side navigation, not first load — first-load speed comes from RSC hydration, navigation jank from the skeleton; test in a production build (`next build && next start`), not `next dev`
- Keep `app/layout.tsx` structural-only — its existing runtime data fetch (button/reward colors) could block `loading.tsx`; audit during Phase 12
- Turso parallel-query rate-limit behavior unconfirmed — verify during Phase 10 planning; fall back to `Promise.allSettled` if parallelizing trips limits
- Each skeleton must match real content height to avoid layout shift — manual height audit during Phase 9
- ⚠️ [Phase 12] CEFR band-up confetti/banner (checkBandUp) is present and wired but not exercised by any automated test or this phase's UAT — flagged in 12-VERIFICATION.md as a human-verification item; low risk (pre-existing v1.1 behavior, only call sites moved)

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

Last session: 2026-07-01T05:30:00Z
Stopped at: Phase 12 complete (UAT passed, security verified, VERIFICATION.md passed) — v1.2 milestone 100% complete
Resume file: None

## Operator Next Steps

- `/gsd-complete-milestone v1.2` — archive milestone v1.2 and prepare for the next milestone
