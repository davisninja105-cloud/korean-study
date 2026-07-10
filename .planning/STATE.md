---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Extraction Quality & Reliability
current_phase: 22
current_phase_name: findings-driven-prompt-improvement-corpus-fixes
status: executing
stopped_at: Completed 22-02-PLAN.md
last_updated: "2026-07-10T07:38:47.859Z"
last_activity: 2026-07-10
last_activity_desc: Phase 22 execution resumed (wave continue)
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 7
  completed_plans: 6
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-05)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 22 — findings-driven-prompt-improvement-corpus-fixes

## Current Position

Phase: 22 (findings-driven-prompt-improvement-corpus-fixes) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-07-10 — Phase 22 execution resumed (wave continue)

Progress: [███████░░░] 71%

## Performance Metrics

**Velocity:**

- Total plans completed (v1.4): 15 plans across 4 phases (16–19)
- Prior milestone (v1.3): 6 plans across 3 phases

**By Phase (v1.5):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 20 | 0/TBD | - | - |
| 21 | 2/2 | - | - |
| 22 | 1/3 | - | - |
| 23 | 0/TBD | - | - |

**Recent Trend:**

- Last milestone: v1.4 Knowledge Graph Quality & History shipped 2026-07-05 (4 phases, 15 plans)
- Trend: —

*Updated after each plan completion*
| Phase 21 P01 | 16 min | 3 tasks | 2 files |
| Phase 21 P02 | 4 min | 2 tasks | 2 files |
| Phase 22 P01 | 3 min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table and .planning/RETROSPECTIVE.md.

v1.5 roadmap shaping decisions (2026-07-06):

- Coarse granularity: research's 9-phase suggestion compressed to 4 delivery-coherent phases (20–23).
- Extraction hardening (Phase 20) and reliability bugs (Phase 23) are independent tracks; the audit→prompt/fix track (21 → 22) is strictly serial and findings-first.
- Prompt review + validation + corpus fixes combined into Phase 22 (one "act on the findings" workflow); validation must show audit-check counts drop before fixes are applied.
- Hard rule for the milestone (research pitfall): all corpus fixes mutate cards in place by `id` — never delete+recreate (cascades wipe FSRS state + ReviewLog history).
- [Phase 21]: Phase 21-01: audit-checks module delegates to production helpers (sentenceMatch/normalizeFront/filterComponents) — audit truth is production truth by structural construction
- [Phase 21]: Phase 21-01: superNormalize lifted verbatim from find-duplicates.mjs into lib/audit-checks.ts; slash-removal decision preserved
- [Phase 21]: Phase 21-01: zero-sentence cards routed to own section with hasLegacyCloze flag, not blankSafety — Phase 22 fix strategy differs
- [Phase 21]: Phase 21-02: audit-cards.mts is a thin I/O adapter — zero classification logic; all checks in lib/audit-checks.ts (runAuditChecks). Script: load → runAuditChecks → render markdown → write file → console → exit(0).
- [Phase 21]: Phase 21-02: env-first dynamic-import preamble (dotenv → await import('../lib/*.js')) — 1039-card live count confirms the real Turso deck was read, not the empty local fallback (Pitfall 4 avoided).
- [Phase 21]: Phase 21-02: dated report interpolates only findings fields + date (never env/credentials); every finding carries the card id for Phase 22 fix-in-place (STATE.md v1.5 hard rule).
- [Phase 22]: Phase 22-01: sentenceMatch single-char branch rewritten to word-boundary-aware (D-01/D-02) — isolated single-char tokens (string-edge/whitespace/punctuation both sides) are now blank-safe; embedded ones (Hangul-adjacent either side) stay unsafe; multi-occurrence rule still wins for isolated-but-repeated. Signature unchanged → all 3 consumers (HighlightedSentence/StudySession/CardEditor) inherit with zero call-site edits.
- [Phase 22]: Phase 22-01: FIX-01 resolved by rule change, not DB mutation — card 다 (cmqlm1w0u014k0gsa6eydclfd) is blank-safe under both existing sentences with zero DB writes (milestone hard rule honored trivially).
- [Phase 22]: Phase 22-01: reused the exact Hangul character class from normalizeFront (lib/card-key.ts) for the new HANGUL_CHAR regex — single source of truth for "what counts as Hangul" across dedup-key normalizer and blank-safety predicate.
- [Phase 22]: Phase 22-01: first-occurrence semantics preserved — predicate evaluates the FIRST indexOf hit; an embedded first occurrence is unsafe even if a later one is isolated (matches how blankSentence actually blanks). Locked by an explicit test case.

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

Last session: 2026-07-10T07:38:47.854Z
Stopped at: Completed 22-02-PLAN.md
Resume file: .planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-03-PLAN.md

## Operator Next Steps

- Continue Phase 22: execute 22-02-PLAN.md (prompt-eval baseline) via `/gsd-execute-phase 22`
