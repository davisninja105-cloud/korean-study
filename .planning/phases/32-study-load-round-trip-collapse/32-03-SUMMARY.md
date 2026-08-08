---
phase: 32-study-load-round-trip-collapse
plan: 03
subsystem: database
tags: [prisma, raw-sql, queryRaw, sqlite, turso, nextjs, vitest]

requires:
  - phase: 32-study-load-round-trip-collapse
    provides: "32-01's measured baseline (10-11 physical round trips), the Phase B verdict (RAW SQL REQUIRED, measured 4 > 1), and the permanent scripts/measure-study-roundtrips.mts harness this plan is measured against"
  - phase: 32-study-load-round-trip-collapse
    provides: "32-02's lib/study-cache.ts (getStudyCache()/refreshStudyCache(version)) and the studyCacheVersion Setting-table change token this plan's Phase A subquery reads"
provides:
  - "lib/study-cards.ts: Phase A rewritten as a single prisma.$queryRaw returning the light pool (id/nextReview/orderIndex) plus the studyCacheVersion token as a correlated scalar subquery column — the version check now costs zero extra round trips"
  - "lib/study-cards.ts: Phase B rewritten as a single prisma.$queryRaw (RAW SQL REQUIRED verdict) folding the one-to-many Sentence relation into one row per card via json_group_array(json_object(...))"
  - "StudyCardsResult { cards, lessons } — getStudyCards()'s new return shape; lessons rides the same cache-gated invariants snapshot Phase A already populated, so app/study/page.tsx needs no separate prisma.lesson.findMany() call"
  - "app/study/page.tsx: Promise.all(getStudyCards(), prisma.lesson.findMany()) race removed in favor of one sequenced await (32-RESEARCH.md Pitfall 4)"
  - "app/api/cards/due/route.ts: still responds with a bare CardDTO[] JSON array (unwraps { cards }) — components/StudyClient.tsx's two re-fetches are unaffected"
  - "scripts/measure-study-roundtrips.mts --dump-order: composition-equivalence differ; tests/study-cards.order-fixture.txt is byte-identical to the pre-rewrite .planning/phases/32-study-load-round-trip-collapse/order-before.txt"
affects: [32-04-study-load-round-trip-collapse]

actuals:
  tokens: 11803
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Raw SQL crosses this codebase's Prisma boundary for the first time: tagged-template prisma.$queryRaw exclusively (never the Unsafe variants), variable predicates composed as Prisma.sql fragments, IN lists built with Prisma.join — never string concatenation, even for server-derived values"
    - "Every raw block is headed with a comment naming the prisma/schema.prisma line ranges it depends on, as the mitigation for the schema-drift risk hand-written SQL introduces with no compile-time link to the schema"
    - "SQLite DateTime comparison goes through julianday() on both sides, never lexicographic string comparison — Prisma stores +00:00-offset TEXT while Date.prototype.toISOString() emits Z-suffixed TEXT, and the two only agree by accident"
    - "Raw-row DateTime values are re-normalized through new Date(value).toISOString() before entering a DTO, never called directly on the raw TEXT value"
    - "A page-level RSC awaits getStudyCards() before reading anything from the invariants snapshot it populates — never Promise.all, because that would let a sibling read race the snapshot's population"

key-files:
  created:
    - tests/cards-due-route.test.ts
    - tests/study-cards.order-fixture.txt
  modified:
    - lib/study-cards.ts
    - app/study/page.tsx
    - app/api/cards/due/route.ts
    - tests/study-cards.test.ts
    - scripts/measure-study-roundtrips.mts

key-decisions:
  - "Phase B took the RAW SQL REQUIRED branch per 32-BASELINE.md's measured verdict (phase B physical: 4, not the 1 a join-strategy load would cost) — the decision was read from the recorded number, not re-litigated from the sibling design doc's assumption."
  - "json_group_array(json_object(...)) folds the one-to-many Sentence relation into exactly one row per card, confirmed available on both the local test DB and production Turso per 32-BASELINE.md's probe — no flat-row fallback was needed."
  - "Phase A's version check rides in as a correlated scalar subquery column on the SAME query as the pool read, not a second query — this is the mechanism that makes the cache-version check free."
  - "app/study/page.tsx's Promise.all was replaced with a single sequenced await, not parallelized differently — running the lessons read concurrently with getStudyCards() would let it observe lib/study-cache.ts's snapshot before Phase A ever populates it (a real race, not a style preference)."
  - "GET /api/cards/due keeps returning a bare CardDTO[] (unwraps { cards }) rather than exposing the new { cards, lessons } shape — components/StudyClient.tsx's two re-fetches parse the body via Array.isArray semantics and would break silently, with no type error, if the shape changed."

patterns-established:
  - "The two-phase raw-SQL query pair (light pool + version subquery, then full-row IN-list re-fetch) is the shape any future `/study`-adjacent read should follow: fold what can be folded into one physical request, keep what's genuinely a second concern (~sessionSize rows vs. up to 1000) as a second bounded request, and never reach for $transaction to bundle independent reads — it serializes round trips on this stack, verified from adapter source in 32-RESEARCH.md."

requirements-completed: [STUDY-01, STUDY-02]

coverage:
  - id: D1
    description: "Phase A costs exactly one physical request for the live due-card pool plus the cache-version check (correlated scalar subquery, not a separate Setting read)"
    requirement: "STUDY-01"
    verification:
      - kind: unit
        ref: "npx tsx scripts/measure-study-roundtrips.mts > 'phase A physical: 1'"
        status: pass
      - kind: unit
        ref: "tests/study-cards.test.ts > cache-gating (matching version skips refill; differing version triggers exactly one)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Phase B is retained (not deleted) and confirmed non-duplicative — its column set is disjoint from Phase A's light pool — and now costs exactly one physical request via json_group_array/json_object row-folding"
    requirement: "STUDY-02"
    verification:
      - kind: unit
        ref: "npx tsx scripts/measure-study-roundtrips.mts > 'phase B physical: 1', 'total physical: 2'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Session composition (the ordered card-ID sequence) is provably unchanged across the rewrite — proven by diff, not inspection"
    verification:
      - kind: unit
        ref: "diff tests/study-cards.order-fixture.txt .planning/phases/32-study-load-round-trip-collapse/order-before.txt (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/cards/due still responds with a bare CardDTO[] JSON array even though getStudyCards() now returns { cards, lessons }; components/StudyClient.tsx needed no edit"
    verification:
      - kind: unit
        ref: "tests/cards-due-route.test.ts > GET /api/cards/due — bare array response contract"
        status: pass
    human_judgment: false
  - id: D5
    description: "The page-level Promise.all race (lessons read could observe the snapshot before Phase A populates it) is fixed by sequencing, with force-dynamic and the direct-prisma-import removal both intact"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (app/study/page.tsx); grep -c \"export const dynamic = 'force-dynamic'\" app/study/page.tsx == 1; grep -cE \"^import .*prisma\" app/study/page.tsx == 0"
        status: pass
    human_judgment: true
    rationale: "The plan's own <verify> block includes a <human-check> step (load /study in npm run build && npm start, confirm no empty flash, confirm lesson-range filtering and session ordering) that automated checks cannot substitute for."

duration: ~65min
completed: 2026-08-08
status: complete
---

# Phase 32 Plan 03: The Round-Trip Collapse Summary

**Rewrote both phases of `getStudyCards()` as tagged-template raw SQL — Phase A folds the live due-card pool and the cache-version check into one query via a correlated scalar subquery; Phase B folds the one-to-many `Sentence` relation into one row per card via `json_group_array`/`json_object` — bringing a warm-cache `/study` load from the measured 10-11 physical round trips down to 2, with the ordered card sequence proven byte-identical across the rewrite.**

## Performance

- **Duration:** ~65 min (across two dispatch attempts interrupted by session/weekly usage limits — see Issues Encountered)
- **Started:** 2026-08-08T17:47:00Z (approx.)
- **Completed:** 2026-08-08T20:55:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **Phase A → one physical request.** Rewrote it as a single `prisma.$queryRaw` tagged-template selecting `c.id`, `r.nextReview`, `l.orderIndex`, and a correlated scalar subquery `(SELECT value FROM Setting WHERE key = 'studyCacheVersion')` aliased as the version column — `INNER JOIN CardReview` (reproducing the current review-required filter) `LEFT JOIN Lesson` (reproducing the optional-relation lesson-range semantics). Timestamps compared through `julianday()` on both sides, never lexicographic string comparison (Prisma's `+00:00`-offset TEXT vs. `toISOString()`'s `Z`-suffixed TEXT only agree by accident). `LIMIT 1000` carried over as a literal, matching today's `take: 1000` DoS guard. The version read from the first row gates whether `refreshStudyCache()` runs — a match uses the snapshot as-is, a miss refills exactly once. The four invariant reads that used to live inline (`cardDependency.findMany`, the lemmas `card.findMany`, `getSessionSize()`, the `Promise.allSettled` wrapper) are gone from this file — they live in `lib/study-cache.ts` now (Plan 02).
- **Phase B → one physical request, RAW SQL REQUIRED branch taken.** Per `32-BASELINE.md`'s measured verdict (`phase B physical: 4`), replaced the typed `card.findMany({ include })` with a raw `$queryRaw` selecting every `CardDTO` column plus the card's sentences folded into one JSON column via a correlated `json_group_array(json_object(...))` subquery ordered by `orderIndex` ASC — confirmed available on both the local test DB and production Turso in `32-BASELINE.md`'s probe, so no flat-row fallback was needed. The `IN` list over `orderedIds` is built with `Prisma.join`, never string concatenation. Every raw-TEXT timestamp is re-normalized through `new Date(value).toISOString()` before entering the DTO; `lesson`/`review` are reconstructed as `null` when their joined key columns are null rather than emitting an object of nulls; the sentences JSON column is parsed with a try/catch degrading to an empty array on malformed JSON, matching this repo's existing convention.
- **`{ cards, lessons }` return contract + page-level race fix.** `getStudyCards()` now returns the exported `StudyCardsResult` interface; `lessons` comes from the same cache-gated invariants snapshot Phase A already populated. `app/study/page.tsx` dropped its `Promise.all(getStudyCards(), prisma.lesson.findMany())` — running the lessons read concurrently could let it observe the snapshot before Phase A ever populates it (32-RESEARCH.md Pitfall 4), a real race, not a style call. `export const dynamic = 'force-dynamic'` and the direct-`prisma`-import removal both verified intact. `GET /api/cards/due` still unwraps to a bare `CardDTO[]` array — `components/StudyClient.tsx` needed no edit (verified: not in `git diff --name-only`).
- **Composition equivalence proven, not assumed.** `--dump-order` was added to `scripts/measure-study-roundtrips.mts`; the pre-rewrite ordering was captured to `.planning/phases/32-study-load-round-trip-collapse/order-before.txt` before Task 1 touched `lib/study-cards.ts`, and the post-rewrite capture (`tests/study-cards.order-fixture.txt`, committed as a regression fixture) is byte-identical (`diff` exit 0) — the session card sequence did not move across the rewrite.
- **Measured result: `total physical: 2`** on a warm-cache run (pre-warmed, then reset+measured — simulating an already-running server), down from the 10-11 physical round trips `32-BASELINE.md` measured before this plan. This is STUDY-01's target met and measured, not inferred.

## Task Commits

1. **Task 1: Phase A as one physical request — pool plus version subquery, cache-gated invariants** - `117ac78` (feat)
2. **Task 2: Phase B — execute Plan 01's verdict, and keep the DTO contract exact** - `6e0a4b5` (feat)
3. **Task 3: Return `{ cards, lessons }`, fix the page-level race, prove ordering did not move** - `909b260` (feat)

**Plan metadata:** committed separately by the orchestrator (this plan runs in a git worktree; STATE.md/ROADMAP.md updates are the orchestrator's responsibility per the wave protocol).

## Files Created/Modified

- `lib/study-cards.ts` (modified) - Phase A and Phase B both rewritten as raw `$queryRaw`; new exported `StudyCardsResult` interface; new `PoolRow`/raw-row local types; drift-anchor comments naming `prisma/schema.prisma` line ranges.
- `app/study/page.tsx` (modified) - `Promise.all` replaced with one sequenced `await getStudyCards(...)`; direct `prisma` import removed; `force-dynamic` untouched.
- `app/api/cards/due/route.ts` (modified) - Unwraps `{ cards }` from the new return shape; `INTEGER_RE` validation and all existing checks untouched.
- `tests/study-cards.test.ts` (modified) - Mock factory extended for `$queryRaw`/lesson/setting stubs; new cache-gating and lessons-from-snapshot cases; existing RELIABILITY-01 and `Database error` cases preserved.
- `scripts/measure-study-roundtrips.mts` (modified) - `--dump-order` flag added.
- `tests/cards-due-route.test.ts` (created) - Route-level proof of the bare-array response contract.
- `tests/study-cards.order-fixture.txt` (created) - Post-rewrite `--dump-order` capture, committed as a regression fixture against future sequencing changes.

## Decisions Made

See `key-decisions` in frontmatter — Phase B branch selection, the raw-SQL boundary rules (tagged-template only, `Prisma.join` for `IN` lists, `julianday()` for timestamp comparison), and the sequenced-not-parallel page read are the load-bearing ones.

## Deviations from Plan

None in the code itself — plan executed as written across all three tasks, including the RAW SQL REQUIRED branch, the `julianday()` comparison, and the ordering-equivalence proof.

## Issues Encountered

- **Two prior dispatch attempts were cut off by usage limits**, not by any defect in the plan or the code: the first hit a session limit mid-exploration (no commits made, nothing lost); the second hit a weekly limit after Tasks 1 and 2 were already committed (`117ac78`, `6e0a4b5`) and Task 3 was substantially complete but uncommitted in its worktree. The orchestrator resumed by inspecting the existing worktree state directly, running the full verification gate against the in-progress Task 3 changes (`tsc`, `lint`, `npm test`, the round-trip measurement, and the ordering diff — all green), then committing Task 3 (`909b260`) and this summary. No code was rewritten or second-guessed; the interruption was purely an orchestration/dispatch concern.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- STUDY-01 and STUDY-02 are both measured-and-met: warm-cache `/study` load costs 2 physical requests, down from 10-11.
- Plan 04 (this phase's final plan) turns these claims into committed, runnable regression proofs — the round-trip count, the tightened e2e perf budgets, and the cross-process freshness guarantee (`e2e/study-cache-invalidation.spec.ts`).
- The `<human-check>` in this plan's `<verification>` block (load `/study` in `npm run build && npm start`, confirm no empty flash, confirm lesson-range filtering and foundation-first session ordering) has not yet been performed interactively — flagged for the phase's end-of-phase human verification, consistent with `workflow.human_verify_mode: end-of-phase` in `.planning/config.json`.

---
*Phase: 32-study-load-round-trip-collapse*
*Completed: 2026-08-08*
