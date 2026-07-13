---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Freshness, Performance & E2E Testing
current_phase: 27
current_phase_name: E2E Coverage & Performance Validation
status: executing
stopped_at: Phase 25 planning complete — 3 plans ready
last_updated: "2026-07-13T06:14:45.818Z"
last_activity: 2026-07-13
last_activity_desc: Phase 26 complete, transitioned to Phase 27
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-11)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 26 — freshness-fix

## Current Position

Phase: 27 — E2E Coverage & Performance Validation
Plan: Not started
Status: Executing Phase 26
Last activity: 2026-07-13 — Phase 26 complete, transitioned to Phase 27

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Prior milestone (v1.5): 9 plans across 4 phases (20–23)
- Prior milestone (v1.4): 15 plans across 4 phases (16–19)

**By Phase (v1.6):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 24 | 2 | - | - |
| 25 | 3 | - | - |
| 26 | 6 | - | - |
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

Phase 24 diagnosis decisions (2026-07-11):

- 16-cell matrix confirms two distinct root causes, not one: Router Cache reuse (5 cells, zero RSC re-fetch) vs. client-shell `useState(initialProps)` non-resync (4 cells, RSC re-fetch happens but the shell never adopts it). Phase 26's fix must address both mechanisms.
- The primary regression scenario (real UI grade session → Home → Study via `<Link>`) is currently Fresh, not stale — Phase 26 must not touch that path; only `/habits`'s post-mutation-return path is a confirmed-reproducing bug via that scenario shape.
- CR-01 (code review): the `back-forward` cell's `about:blank` recovery `page.goto()` was flagged as a possible evidence-corruption risk for 4 verdicts (`/`, `/study`, `/cards`, `/habits`). Re-verified during UAT via a 4th independent full script run — the recovery's own trigger check never fired for any of the 4 cells; verdicts confirmed accurate, no reclassification needed.

Phase 25 E2E harness decisions (2026-07-12):

- D-04 CR-01 second re-verification (Plan 25-03, via real Playwright runs, not the diagnosis script): all 4 back-forward cells' stale/fresh verdicts still match 24-DIAGNOSIS.md, but the underlying evidence pattern shifted for `/study`, `/cards`, `/habits` — originally 1 new RSC fetch per cell (client-shell non-resync), now 0 new fetches (reads as router-cache reuse). Phase 26 should re-confirm mechanism attribution at fix time rather than assume the original evidence still holds; the fix likely still needs to address both root-cause mechanisms.
- `/habits post-mutation-return` (outside the 4-cell back-forward scope) re-verified genuinely FRESH today, contradicting 24-DIAGNOSIS.md's stale finding for that cell — `HabitsClient` now correctly adopts fresh data on that navigation path. Phase 26 should confirm this cell no longer needs fixing before spending effort on it.

### Pending Todos

None open.

### Blockers/Concerns

- [Phase 26 flag from research] `StudyClient`'s existing lesson-range-filter re-fetch could double-fetch against a route-level `router.refresh()` — must be checked explicitly in the Phase 26 plan.
- [Phase 26 flag from research] Per-shell prop-sync gating strategy (which of the four shells needs what condition) is the highest-risk implementation detail — finalize it in the Phase 26 plan before coding.
- [Phase 26 flag from Phase 25 Plan 03] D-04 CR-01 re-verification found the 3 non-`/` back-forward cells now present as router-cache reuse (0 new fetches) rather than the originally diagnosed client-shell non-resync (1 new fetch) — re-confirm mechanism attribution before assuming `24-DIAGNOSIS.md`'s original evidence still holds. Also, `/habits post-mutation-return` is now genuinely fresh (not stale) — confirm before spending fix effort on it. Full detail in `25-03-SUMMARY.md`.
- [carried from Phase 25 Plan 03, non-blocking] Three WARNING-level code-review findings in `25-REVIEW.md`: a non-functional per-subprocess uniqueness counter in `createMutationCard()`, unblanked `DATABASE_AUTH_TOKEN` in two subprocess spawn envs (inconsistent with `playwright.config.ts`'s own blanking), and a silent no-op on `CardDependency` edge-creation lookup miss in the seed fixture (with no sanity-check coverage for edge count). Worth an opportunistic fix pass; not blocking Phase 26.
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
| hardening | `scripts/diagnose-freshness.mts` REVIEW.md warnings (WR-01 deny-list DB guard, WR-02 diagnostic server binds all interfaces, WR-03 no WAL sidecar cleanup) | Open — throwaway script, low severity, logged in 24-SECURITY.md; worth carrying into Phase 25's real E2E harness as defense-in-depth |
| debt | Pre-existing `tsc --noEmit` errors in `tests/study-cards.test.ts:132,169` (implicit `any`), predates Phase 24 | Open — unrelated to Phase 24 scope |

## Session Continuity

Last session: 2026-07-11T17:25:30.358Z
Stopped at: Phase 25 planning complete — 3 plans ready
Resume file: .planning/phases/25-e2e-test-infrastructure-baselines/25-01-PLAN.md

## Operator Next Steps

- `/gsd-execute-phase 25` — execute all 3 plans (Wave 1: 25-01 has a blocking package-legitimacy checkpoint; Wave 3: 25-03 has a blocking trace/CR-01/deletion checkpoint).
