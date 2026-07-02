---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Reliability & Hardening
current_phase: 15
current_phase_name: StudySession Refactor & Sentence-Selection Memoization
status: executing
stopped_at: "Phase 14 complete and verified (UAT 3/3, SECURITY threats_open:0, VALIDATION partial); ready to plan Phase 15"
last_updated: "2026-07-02T23:42:46.017Z"
last_activity: 2026-07-02
last_activity_desc: Phase 15 execution started
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 6
  completed_plans: 5
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-02)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 15 — StudySession Refactor & Sentence-Selection Memoization

## Current Position

Phase: 15 (StudySession Refactor & Sentence-Selection Memoization) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-07-02 — Phase 15 execution started

Progress: [██████░░░░] 67% (milestone: 2 of 3 phases complete; 4 of 4 plans done)

## Performance Metrics

**Velocity:**

- Total plans completed (v1.3): 4
- Average duration: ~7.5 min
- Total execution time: ~0.5 hours (v1.3)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 13 | 2/2 | ~15 min | ~7.5 min |
| 14 | 2 | - | - |
| 15 | TBD | - | - |

**Recent Trend:**

- Last milestone: v1.2 Performance & Snappiness shipped 2026-07-01 (4 phases, 9 plans)
- Trend: —

*Updated after each plan completion*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 13 P01 | 5 min | 2 | 2 |
| Phase 13 P02 | ~10 min | 3 | 2 |
| Phase 14 P01 | ~8 min | 2 | 1 |
| Phase 14 P02 | ~7 min | 3 | 3 |
| Phase 15 P01 | 6 min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v1.3 is a bug-fix/hardening milestone sourced directly from `.planning/codebase/CONCERNS.md` (2026-07-02); no research phase (fix approaches already specified in the audit).
- Phase order is risk/rework driven: server-side review correctness first (Phase 13), then sync visibility + caching (Phase 14), then the StudySession structural refactor last (Phase 15) so it preserves already-verified behavior.
- Behavior-changing StudySession work (REVIEW-04 retry, REVIEW-05 undo atomicity) lands in Phase 13; Phase 15 restructures the same file only after behavior is locked.
- Within Phase 15: extract the pure sentence-selection module (REFACTOR-02) + memoize it (PERF-03) BEFORE splitting into mode sub-components (REFACTOR-01) — avoids restructuring the selection logic twice.
- Deferred (out of scope): rate limiting, time-bound auth tokens, API/UI test coverage, card retirement, review-log table, background sync, model fallback — see REQUIREMENTS.md Out of Scope.
- [Phase 13]: Plan 13-01: rating range guard placed before try block (pure validation, zero DB/FSRS work for invalid rating); 404 kept inside try since findUnique can throw — Plan prose said 404 outside try, but binding acceptance_criteria + must_have truths require findUnique inside catch so DB hiccups are caught (REVIEW-01)
- [Phase 13]: Plan 13-01: /api/review 500 returns generic 'Failed to record review' (raw error console.error'd server-side only) per threat T-13-02; cards route 500 left echoing e.message since REVIEW-03 scopes only the collision branch — Avoid internal-schema disclosure on review route; changing cards 500 behavior would be scope creep beyond REVIEW-03
- [Phase 13]: Plan 13-01: used Prisma P2002 catch (not a pre-update normalizedFront findUnique) for the card-front collision 400 — Matches the codebase's existing catch-based error-handling idiom and avoids an extra query per edit
- [Phase 13]: Plan 13-01: app/api/review/undo/route.ts left untouched despite same missing-try/catch shape — Out of scope for REVIEW-01..05 per the plan; deferred to a future phase
- [Phase 13]: Plan 13-02: postReviewWithRetry uses 3 total attempts (1 initial + 2 retries) with ~500ms/~1500ms backoff, toast only on exhaustion (REVIEW-04) — Hard-bounded so a persistent failure can't spin an unbounded request loop (threat T-13-05); toast scoped to background-save failure path only, not handleUndo
- [Phase 13]: Plan 13-02: atomic undo via mount-guard + React 18/19 auto-batched setState block (not useReducer) — isMountedRef gates the whole restoration incl. seenCardIdsRef write so it applies all-or-nothing (REVIEW-05); Phase 15 owns the larger StudySession refactor so this plan minimized churn
- [Phase 13]: Plan 13-02: Toast dismiss callback held in a ref so auto-dismiss setTimeout is set up once on mount and survives parent re-renders; onDismiss fires inside the timeout (not the effect body) — satisfies react-hooks/set-state-in-effect; token-styled, no new npm dep
- [Phase 14]: Plan 14-01: Kept where:{components:{not:null}} on the seed findMany (not broadened to all cards) — preserves existing CardDependency edge-creation semantics exactly; broadening would change which edges are created and is out of scope for a perf-preserving refactor (PERF-01)
- [Phase 14]: Plan 14-01: Dropped `components` from the seed findMany select; component strings now come from the in-memory extraction result (card.components) instead of JSON.parse-ing a DB re-read — eliminates the parse-error path entirely and removes a DB column read (PERF-01)
- [Phase 14]: Plan 14-01: linkTargets declared in the per-lesson try block (resets each lesson) and in scope for both the Promise.all callback (push) and the post-await linking loop (iterate); keyToId fully populated by link time so forward references within a lesson resolve (PERF-01)
- [Phase 14]: Plan 14-01: lessonExcerpt returns the user's OWN Google Doc content (first non-empty line) — intentionally surfaced back to the sole authenticated owner (T-14-02 accepted); raw msg/dbMsg confined to server-side console.error/console.warn only (T-14-01 mitigated), mirroring Phase 13 T-13-02 (SYNC-01)
- [Phase 14]: Plan 14-01: Response shape (failed/failures/remaining/newLessons/newCards) left unchanged so components/SyncPanel.tsx renders the new excerpt strings with zero client-side edit (SYNC-01)
- [Phase 14]: Plan 14-02: Gloss preload keyed by `normalizeFront(raw)` on the client to match the server DB key `gloss:<normalizeFront(word)>` — the load-bearing alignment that makes a preloaded entry a HIT on the next tap; `raw` (display + POST body) kept separate so server resolution is unchanged (PERF-02)
- [Phase 14]: Plan 14-02: Mount preload effect writes to `cache.current` (a ref) ONLY — no setState in the effect body — so it is `react-hooks/set-state-in-effect` safe; React StrictMode double-invoke is harmless (idempotent `Map.set`); rendering is never gated on preload resolving (PERF-02)
- [Phase 14]: Plan 14-02: Preload endpoint bounded + gloss-scoped — fixed server-side `take: GLOSS_PRELOAD_LIMIT` (300), no client-controllable limit param (T-14-04); `where: { key: { startsWith: 'gloss:' } }` so app-config settings are never read/serialized (T-14-05); degrades to `{ entries: [] }` on error, never a 500 (PERF-02)
- [Phase 14]: Plan 14-02: Per-row `JSON.parse` in try/catch (skip + console.warn malformed, mirroring getCachedGloss) — a corrupt cache row never crashes the preload (T-14-06); no new npm deps, no schema changes (T-14-SC accepted)
- [Phase ?]: [Phase 15] Plan 15-01: Co-located hashStr in lib/sentence-selection.ts (not a separate lib/hash.ts) — single source of truth shared by sentence-selection tie-break and mcOptions distractor seeding; lower ceremony than a one-function file (REFACTOR-02)
- [Phase ?]: [Phase 15] Plan 15-01: Moved chosenIdx useMemo + its inputs above the empty-queue early return to satisfy react-hooks/rules-of-hooks — the original inline IIFE was not a hook so could sit after the return, but useMemo cannot be called conditionally (PERF-03)
- [Phase ?]: [Phase 15] Plan 15-01: Used minimal structural SelectableSentence interface ({korean, targetForm, unknownCount?}) instead of importing SentenceDTO — mirrors lib/sequence.ts SeqCard, keeps the pure module decoupled from the DTO layer (REFACTOR-02)

### Pending Todos

- `2026-07-02-fix-spurious-components-in-card-extraction.md` — Claude extraction lists spurious `components` (e.g. `~(으)ㄴ 후에` on a `~ㄹ 것 같다` sentence), creating wrong CardDependency edges. Area: general. Files: `lib/extract-cards.ts:110-117`, `app/api/sync/route.ts:240-264`.

### Blockers/Concerns

- [Phase 13 → resolved] Phases 13 & 15 both touched `components/StudySession.tsx` — Phase 13 shipped first, so Phase 15's refactor must preserve the `postReviewWithRetry` wiring, `isMountedRef` mount-guard, `saveError`/`<Toast>` plumbing, and atomic `handleUndo` restoration.
- Phase 15 is a behavior-preserving refactor — needs a live study-session UAT (flip/grade/undo/mode-switch) to confirm no regression; lint (`react-hooks/purity`) must stay clean.
- [Phase 14 → resolved] PERF-01 & SYNC-01 both edited `app/api/sync/route.ts` — landed together in plan 14-01 with no conflict (PERF-01 hoisted the map; SYNC-01 added the excerpt helper + rewrote failure strings; both tasks committed atomically).
- [Phase 14 → resolved] UAT complete (3/3 passed, 0 issues): SYNC-01 excerpt rendering confirmed, PERF-01 CardDependency edge creation confirmed (2095 edges, 0 self-edges, edges connect cards with components to prereq cards with components), PERF-02 live-verified at plan level. Security: threats_open:0 (8 threats, all closed). Nyquist: partial (lessonExcerpt unit-tested, sync route + gloss preload manual-only).
- [Phase 13 deferred] `app/api/review/undo/route.ts` has the same missing-try/catch shape as the hardened `/api/review` route but was out of scope for REVIEW-01..05 — left for a future hardening pass.

### Roadmap Evolution

- v1.3 roadmap created 2026-07-02: 3 phases (13–15), 11/11 requirements mapped, coarse granularity.

## Deferred Items

Carried forward from v1.2 close (2026-07-01) — informational only:

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 10/11 `human_needed` RSC paint-timing checks | Resolved in practice via Phase 11 live UAT; low risk |
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open — future hardening pass |

## Session Continuity

Last session: 2026-07-02T23:42:23.440Z
Stopped at: Phase 14 complete and verified (UAT 3/3, SECURITY + VALIDATION produced); ready to plan Phase 15
Resume file: None

## Operator Next Steps

- Phase 14 complete and verified (UAT 3/3 passed, 0 issues; SECURITY threats_open:0; VALIDATION partial with lessonExcerpt unit test). Next: plan Phase 15 (StudySession refactor & sentence-selection memoization — REFACTOR-02, PERF-03, REFACTOR-01). A pending todo was captured during UAT: spurious `components` in Claude extraction creating wrong CardDependency edges (lib/extract-cards.ts) — future work, not blocking Phase 15.
