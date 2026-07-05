---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Knowledge Graph Quality & History
current_phase: 19
current_phase_name: vercel-cron-auto-sync
status: executing
stopped_at: Completed 18-02-PLAN.md
last_updated: "2026-07-05T06:37:54.184Z"
last_activity: 2026-07-05
last_activity_desc: Phase 19 execution started
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 14
  completed_plans: 11
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 19 — vercel-cron-auto-sync

## Current Position

Phase: 19 (vercel-cron-auto-sync) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 19
Last activity: 2026-07-05 — Phase 19 execution started

Progress: [█████░░░░░] 50% (2/4 phases complete; Phase 16 + 17 done, Phase 18 next)

## Performance Metrics

**Velocity:**

- Total plans completed (v1.4): 4
- Prior milestone (v1.3): 4 plans, ~7.5 min avg, ~0.5 h total

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 16 | 4 | - | - |
| 17 | 0/TBD | - | - |
| 18 | 3 | - | - |
| 19 | 0/TBD | - | - |

**Recent Trend:**

- Last milestone: v1.3 Reliability & Hardening shipped 2026-07-03 (3 phases, 6 plans)
- Trend: —

*Updated after each plan completion*
| Phase 16 P01 | 35min | 3 tasks | 3 files |
| Phase 16 P02 | 4min | 2 tasks | 2 files |
| Phase 16 P03 | 15min | 2 tasks | 4 files |
| Phase 16 P04 | ~20min | 3 tasks | 2 files |
| Phase 17 P01 | 12min | 3 tasks | 2 files |
| Phase 17 P02 | 6min | 1 tasks | 1 files |
| Phase 17 P03 | 4min | 1 tasks | 1 files |
| Phase 17 P04 | 8min | 2 tasks | 3 files |
| Phase 18 P01 | 12min | 3 tasks | 6 files |
| Phase 18 P02 | 8min | 2 tasks | 3 files |
| Phase 18 P03 | 18min | 3 tasks | 4 files |

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
- [Phase 16]: Production cleanup approved and applied — 511 cards changed, 2 edges pruned, 4 edges added, corpus now at 1039 cards / 2133 CardDependency edges; dry-run matched the 16-01 baseline exactly and a follow-up dry-run confirmed idempotency (0/0/0). One known-acceptable homonym-collision edge (화나다 → 화 (episode counter)) flagged and explicitly accepted by the user as a pre-existing, out-of-scope data ambiguity. Phase 16 is now fully complete (4/4 plans, GRAPH-01..05 satisfied).
- [Phase 17]: ReviewLog mirrors CardReview's full FSRS field set (D-01) so Phase 18 never needs a backfill migration; cardId is NOT unique (append-only), only idempotencyKey is @unique
- [Phase 17]: idempotencyKey validation placed after isGrade(rating) check and before the try block, mirroring the existing WR-05 cardId validation idiom exactly
- [Phase 17]: P2002 catch does not inspect e.meta.target (Pitfall 3) — idempotencyKey is the only reachable unique constraint in this transaction
- [Phase 17]: idempotencyKey and AbortController generated exactly once in submitReview's event-handler flow, immediately before the undoRef.current snapshot — never inside postReviewWithRetry (would defeat server-side dedup) and never lifted into render/useMemo (react-hooks/purity)
- [Phase 17]: undo network-failure re-arm path reuses the SAME already-aborted controller rather than creating a new one — retrying undo does not need to un-abort the review's background save
- [Phase 17]: Widened POST /api/review's idempotent-200 catch to OR isUniqueConstraintError(e, 'idempotencyKey') (new pure lib/db-errors.ts helper) with the existing P2002 check, closing the interactive-transaction DriverAdapterError gap from Phase 17 UAT Test 6
- [Phase 18]: masteryPhrase gained export only — no logic change; previewIntervalLabels internal call unaffected
- [Phase 18]: getReviewHistory has no try/catch — lib throws, route catches (mirrors lib/study-cards.ts convention)
- [Phase 18]: GET /api/reviews never reads a client-controlled take param — always uses server-side PAGE_SIZE=25 (closes T-18-01 DoS threat)
- [Phase 18]: cardsByState groupBy runs on prisma.cardReview, matching the table already queried for dueCards/masteredCount
- [Phase 18]: Card progress section placed immediately after 'All-time totals' on the Habits page so it reads as a first-class feature
- [Phase 18]: Hard grade rows use the amber warnUnsafe precedent from CardEditor.tsx, not orange - orange has zero precedent in the codebase and CONTEXT.md D-02 forbids it
- [Phase 18]: Error-state copy rendered via a module-level string constant + JSX expression rather than literal JSX text, avoiding react/no-unescaped-entities while keeping a plain apostrophe

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

Last session: 2026-07-04T21:20:32.909Z
Stopped at: Completed 18-02-PLAN.md
Resume file: None

## Operator Next Steps

- Phase 16 and Phase 17 are fully complete. No further action needed for either phase.
- Next: run `/gsd-plan-phase` (or the equivalent GSD workflow entry point) for Phase 18 — Review History Page (HIST-04, HIST-05, HIST-06, HIST-07).
