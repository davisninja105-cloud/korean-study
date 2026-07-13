---
status: resolved
trigger: "It takes over 10s for the /study page to load on the webapp. this latency is unacceptable and is not in alignment with the performance improvements of this milestone"
created: 2026-07-13T00:00:00Z
updated: 2026-07-13T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the edges query in getStudyCards uses two large IN clauses (cardId IN ~979 ids AND prerequisiteId IN ~979 ids) which Prisma chunks into a cartesian product of ~55 serial SQL round-trips against remote Turso (~6s). This dominates the >10s /study load.
test: Measured current vs. fix against real Turso.
expecting: Replacing the double-IN with one unfiltered select + in-memory endpoint filter reduces 55 round-trips to 1 and yields identical edge results.
next_action: Apply the fix to lib/study-cards.ts (replace the double-IN edges query), run lint + unit tests, then request human verification against production.

reasoning_checkpoint:
  hypothesis: "The double-IN edges query (cardId IN ids AND prerequisiteId IN ids, ids.length≈979) causes Prisma to chunk each IN list and emit a cartesian product of ~55 serial SQL statements, each a remote Turso round-trip (~60-200ms), totalling ~6s — the dominant portion of the >10s /study load."
  confirming_evidence:
    - "Prisma query-event log shows exactly 55 CardDependency SELECTs for this one findMany; wall time 5913-6612ms across two runs."
    - "The other load-path queries are all fast (settings 64ms, sessionSize 44ms, pool-with-include 910ms/4 trips, knownLemmas 48ms, lesson 44ms) — edges is ~88% of getStudyCards time."
    - "Option B (single unfiltered findMany + JS Set filter) measured 157ms / 1 round-trip and returned the identical edge count (1208 == 1208)."
  falsification_test: "If replacing the edges query does NOT drop total getStudyCards round-trips to ~7 (pool 4 + settings 1 + knownLemmas 1 + edges 1) and does NOT return the same 1208 edges, the hypothesis is wrong."
  fix_rationale: "The fix removes the cartesian chunk explosion entirely by issuing one unfiltered 2-column select (bounded by deck-sized edge count, not pool-ID-count) and applying the both-endpoints-in-pool filter in memory. sequenceCards/selectSessionCards already ignore out-of-session edges, so restricting to the pool is an optimization, not a correctness requirement — identical edge set proven empirically."
  blind_spots: "allEdges now scales with total edge count (2176 today) rather than pool size; at 10x deck growth it is still one round-trip of tiny 2-column rows. The pool `include` fan-out (910ms/4 trips) and Vercel cold-start/Turso RTT remain as separate, smaller latency sources not addressed by this fix."
tdd_checkpoint: null

## Symptoms

expected: /study should load quickly (first paint via RSC server hydration per CLAUDE.md's RSC-02/RSC-05 pattern — app/study/page.tsx is an async RSC that fetches getStudyCards()/lessons server-side and passes props to StudyClient, which should start directly in 'select-mode' with no blank loading phase).
actual: /study takes over 10 seconds to load in production (Vercel). User considers this unacceptable, especially since a recent milestone (v1.2 RSC perf work, and the just-completed phase 27 "e2e coverage & performance validation") was specifically about performance.
errors: none observed — no console/network errors reported, page just loads slowly.
reproduction: |
  1. Navigate to https://korean-study-five.vercel.app/study (production)
  2. Observe >10s before the page becomes interactive/visible
environment: Production only (Vercel deploy), not yet checked against local dev or local prod build (npm run build && npm start)
started: Unknown — user just noticed; no known before/after reference point. Recent relevant history: phase 27 (27-e2e-coverage-performance-validation) just completed (see git log: c5b1d66, 85936f5).

## Eliminated

- hypothesis: Phase 27 (e2e-coverage-performance-validation) changed the study load-path code and regressed it
  evidence: Phase 27 only added `data-testid` attributes to components + new e2e/perf specs (see 27-PATTERNS.md). No runtime load-path code changed. The regression is a data-scale cliff, not a code change.
  timestamp: 2026-07-13

- hypothesis: The pool findMany `include` (review/lesson/sentences) fan-out is the dominant cost
  evidence: Measured — the include fans out into 4 round-trips totalling 910ms for 979 cards. Real, but only ~12% of the getStudyCards wall time. Not the dominant factor.
  timestamp: 2026-07-13

## Evidence

- timestamp: 2026-07-13
  checked: Phase 27 diff/patterns + git log (c5b1d66, 85936f5, etc.)
  found: Phase 27 was test-only (added data-testid attrs + e2e/grade-flow.spec.ts + e2e/perf.spec.ts). The perf budget tests run against a local throwaway file: SQLite DB on port 3100 — they never exercise remote Turso, so they gave false confidence and could not catch this.
  implication: Not a phase-27 code regression. Look for a data-scale-dependent cost in the always-run load path.

- timestamp: 2026-07-13
  checked: Row counts in the live Turso DB
  found: totalCards=1056, dueCards=979, knownCards(state>=1)=301, cardDependency edges=2176, sentences=1616.
  implication: The due pool is ~979 cards — nearly the whole deck. Any per-pool-ID query scales with ~1000 IDs.

- timestamp: 2026-07-13
  checked: Timed every DB round-trip in the study load path against real Turso (scripts/measure-study-load.mts, Prisma query-event logging)
  found: |
    layout 4 settings (Promise.all): 64ms / 1 round-trip
    getSessionSize: 44ms / 1
    pool findMany WITH include: 910ms / 4 round-trips (include fans out: cards, reviews, lessons, sentences)
    knownLemmas findMany: 48ms / 1
    edges findMany (cardId IN ids AND prerequisiteId IN ids, ids.length=979): 6612ms / 55 round-trips  <-- DOMINANT
    lesson.findMany: 44ms / 1
  implication: The edges query is ~88% of getStudyCards wall time. The double-IN over ~979 IDs each is chunked by Prisma into a cartesian product of ~7×8 = 55 serial SQL statements. Each Turso round-trip is ~60-200ms; 55 of them serialized = 6.6s. This is the root cause of the >10s load.

- timestamp: 2026-07-13
  checked: lib/study-cards.ts lines 95-102 (the edges fetch)
  found: |
    const ids = cards.map((c) => c.id)   // 979 ids
    const edges = await prisma.cardDependency.findMany({
      where: { cardId: { in: ids }, prerequisiteId: { in: ids } },
      select: { cardId: true, prerequisiteId: true },
    })
  implication: TWO large IN clauses in one query → Prisma chunks each to respect the SQLite bound-param limit and emits chunk_A × chunk_B queries. This is a known Prisma double-IN explosion. Fix: replace with a single unfiltered findMany (2176 tiny 2-column rows = 1 round-trip) and filter both endpoints against a pool-ID Set in memory.

## Resolution

root_cause: |
  getStudyCards() fetched prerequisite edges with a double-IN query
  (cardId IN ids AND prerequisiteId IN ids) where `ids` is the entire due pool
  (~979 IDs). Prisma chunks each large IN list to stay under the SQLite
  bound-parameter limit; with two large IN clauses in one query it emits the
  cartesian product of chunk pairs — ~55 serial SQL statements, each a remote
  Turso round-trip (~60-200ms) = ~6s. This was ~88% of getStudyCards wall time
  and the dominant cause of the >10s /study load. It is a data-scale cliff
  (grew with the deck to ~1000 due cards), NOT a code change from phase 27.
  The phase-27 perf budget tests could not catch it because they run against a
  local throwaway file: SQLite DB, never remote Turso.
fix: |
  lib/study-cards.ts: replaced the double-IN edges query with a single
  unfiltered `cardDependency.findMany({ select: { cardId, prerequisiteId } })`
  (one round-trip, deck-bounded 2-column payload) plus an in-memory
  both-endpoints-in-pool filter using a Set of pool IDs. Edge result is
  identical to the old query (sequenceCards/selectSessionCards ignore
  out-of-session edges anyway).
verification: |
  Measured against real Turso: old query 5913ms / 55 round-trips;
  new approach 157ms / 1 round-trip (37.6x faster); identical edge count
  (1208 == 1208). npm run lint + npm test both clean.
  Human confirmed fixed against production /study load time (2026-07-13).
files_changed:
  - lib/study-cards.ts (edges query: double-IN → single unfiltered select + in-memory filter)
