# Phase 32 Plan 01: Measured Round-Trip Baseline

**Measured:** 2026-08-08
**Method:** `scripts/measure-study-roundtrips.mts --probe-json` against the isolated, seeded E2E test DB (`e2e/.tmp/e2e-test.db`), instrumented via `lib/query-counter.ts`'s counting Proxy (`STUDY_QUERY_COUNTER=1`).

This file is a hard input to `32-03-PLAN.md` Task 2's Phase-B branch condition — not a report. Its `## Phase B verdict` heading below is the literal answer that decision reads.

## Raw measured numbers

Two independent runs recorded, exactly as printed (no rounding, no smoothing):

**Run 1 — whole-pipeline (Task 1, `getStudyCards()` called directly, no `--probe-json`):**
```
physical round trips: 10
prisma query events: 10
```

**Run 2 — per-segment breakdown (Task 2, `--probe-json`):**
```
phase A physical: 6
phase B physical: 4
page lessons physical: 1
total physical: 11
prisma query events: 11
json probe result (local test DB): [{"a":1},{"a":2}]
json aggregation: available
```

### Segment attribution

| Segment | Physical round trips | What it measures |
|---|---|---|
| Phase A | 6 | `lib/study-cards.ts:53-82`'s `Promise.allSettled` batch — `sessionSize` + light pool (`select` only) + `CardDependency` edges + known-lemmas — 4 logical Prisma calls compiling to 6 physical HTTP requests |
| Phase B | 4 | `lib/study-cards.ts:135-142`'s single `card.findMany({ include: { review, lesson, sentences } })` — 1 logical Prisma call compiling to 4 physical HTTP requests |
| Page lessons | 1 | `app/study/page.tsx`'s standalone `prisma.lesson.findMany(...)`, outside `getStudyCards()` entirely but inside the whole `/study` page's round-trip budget |
| **Total (whole `/study` page)** | **11** | Phase A + Phase B + page lessons |

**Cross-check:** Run 2's Phase A (6) + Phase B (4) = 10, exactly matching Run 1's independently-measured whole-`getStudyCards()` total (10). The two measurement methods agree on the `getStudyCards()`-only cost; Run 2's extra `page lessons physical: 1` line accounts for the difference between "a `getStudyCards()` call" (10) and "a whole `/study` page load" (11). No unexplained discrepancy.

## Physical count vs. Prisma event count agreement

**Agreed exactly** on both runs: Run 1 — 10 physical / 10 Prisma events. Run 2 — 11 physical / 11 Prisma events (summed across segments; each segment's physical and Prisma-event counts were also equal per-segment). Per `lib/query-counter.ts`'s definition, **the physical count is authoritative** when the two disagree (they did not, here) — Prisma's `$on('query')` event, for this exact driver-adapter/version combination (`@prisma/adapter-libsql@7.6.0`, `@libsql/client@0.17.2`), fires 1:1 with the physical `execute()`/`batch()` calls the counting Proxy observes.

## Comparison against REQUIREMENTS.md's stated "4-5" baseline

**The measured number is higher than REQUIREMENTS.md's stated baseline, not equal to or lower than it.** REQUIREMENTS.md's STUDY-01 text reads "at most two round trips to Turso per load (down from 4–5)". The measured current cost is:
- **10** physical round trips for `getStudyCards()` alone — 2x to 2.5x REQUIREMENTS.md's stated "4–5".
- **11** physical round trips for a whole `/study` page load (including the page's own separate lessons query, which REQUIREMENTS.md's "4-5" figure did not account for as a distinct line item).

This confirms 32-RESEARCH.md's central inference (Assumption A1 / Open Question 1): SQLite's lack of `relationLoadStrategy: 'join'` means Phase B's `include`-based `card.findMany` does NOT compile to 1 physical query on this stack — it measures at **4**, not 1. REQUIREMENTS.md's "4-5" figure undercounts the real baseline; it was evidently derived by counting *logical* Prisma calls (`sessionSize` + pool + edges + knownLemmas + one `findMany` ≈ 5), not physical HTTP requests. The contradiction is recorded here, not reconciled — per 32-01-PLAN.md's own instruction ("If it contradicts... write the contradiction down explicitly under its own heading rather than reconciling it").

## JSON aggregation (`json_group_array`/`json_object`) verdict

**Available on both the local isolated test DB and production Turso** — verified empirically, not assumed:

- **Local test DB** (`e2e/.tmp/e2e-test.db`, via `prisma.$queryRaw` inside `scripts/measure-study-roundtrips.mts --probe-json`): `SELECT json_group_array(json_object('a', x)) FROM (SELECT 1 AS x UNION ALL SELECT 2 AS x)` returned `[{"a":1},{"a":2}]` — correctly shaped, 2-element array, one object per source row. Verdict: **available**.
- **Production Turso** (`turso db shell korean-study "SELECT json_group_array(json_object('a', 1)) as result;"`, run directly this session — `turso` CLI is present at `/opt/homebrew/bin/turso` and authenticated): returned `[{"a":1}]` — correctly shaped. Verdict: **available**.

This resolves 32-RESEARCH.md's Assumption A3 / Pitfall 5 (unverified this session in research) and the CONTEXT.md "Claude's Discretion" open item on whether `json_group_array`/`json_object` behave identically on Turso's libSQL fork as on stock SQLite: **confirmed identical behavior on both**, so a raw-SQL Phase B rewrite using `json_group_array`/`json_object` for the `sentences` relation is safe to build without a fallback path.

## Phase B verdict

**RAW SQL REQUIRED.**

Justification (the measured number is the sole justification, per Task 2's instruction): `phase B physical` measured **4**, which is greater than 1. Phase B's current `card.findMany({ include: { review, lesson, sentences } })` costs 4 physical round trips on this stack, not the 1 a Postgres/MySQL/CockroachDB `relationLoadStrategy: 'join'` would achieve. Reaching STUDY-01's ≤2-round-trip steady-state budget requires converting Phase B to raw SQL (using `json_group_array`/`json_object` for the one-to-many `sentences` relation, now confirmed available on both the local test DB and production Turso — see above) in addition to Phase A's cache-and-collapse work. This is the data-backed verdict `32-03-PLAN.md` Task 2 reads as its branch condition.

## Fixture scale caveat

The isolated E2E test DB's seed fixture (`e2e/fixture.ts`) contains **8 total cards** (3 due, 3 mastered, 2 new — no `CardReview` row) across 2 lessons, with 3 due cards passing `getStudyCards({ scope: 'due' })`'s pool filter. Every number in this file is a round-trip **count** — the number of physical HTTP requests issued — which is **fixture-size-independent**: `card.findMany({ include: {...} })` issues the same fixed number of physical queries (one per included relation type, per the SQLite "query" load strategy) whether it returns 3 rows or 3,000. **No latency claim about the ~1056-card production deck can be drawn from this file** — this is the same caveat `e2e/perf.spec.ts` already carries for `/cards` (see its D-06/D-07 comment block: "the real win this phase targets is the ~1056-card production deck... which this e2e fixture is deliberately too small to exercise"). Whether ≤2 round trips at production scale translates to a materially faster `/study` load in wall-clock time is a separate, not-yet-measured question this plan does not answer — round-trip *count* is what STUDY-01 asks for, and count is what is measured here.

## After

**Measured:** 2026-08-08, by `tests/study-roundtrips.test.ts` (32-04-PLAN.md Task 1 — the committed, runnable proof; re-run via `npx vitest run tests/study-roundtrips.test.ts`) against a real temp SQLite DB seeded with the real `prisma/schema.prisma` DDL, and cross-checked via `npx tsx scripts/measure-study-roundtrips.mts --probe-json` against the isolated E2E test DB.

Per D-01's deliberately-split reading (steady-state warm guarantee, not one unconditional number across every call shape) — **quoting both numbers together, never the warm number alone**:

- **Warm-cache `getStudyCards()` call (steady-state, the common case): 2 physical round trips.** Phase A's pool-plus-version query (1) + Phase B's full-row re-fetch (1); the invariants refill is skipped entirely on a version match. Matches STUDY-01's success criterion #1 (≤2) exactly, not just under budget.
- **Cache-miss call (cold instance with no snapshot yet, OR the first call after `bumpStudyCacheVersion()` runs — both D-01-named triggers, both independently measured): 3 physical round trips.** Phase A (1) + the invariants refill (1) + Phase B (1). The very next call, still on the same (now-warm) snapshot, returns to 2 — proven as a distinct assertion in the same test, not inferred from the miss number.
- **Cross-check:** on a warm run, the physical count and Prisma's own `$on('query')` event count agreed exactly (2 and 2) — no discrepancy to resolve for research Assumption A4 on this exact stack.

### Before → after delta

| | Before (32-01 baseline) | After (this plan) | Delta |
|---|---|---|---|
| Warm-cache `getStudyCards()` | 10 physical | 2 physical | −8 (−80%) |
| Cache-miss `getStudyCards()` | 10 physical (no cache existed yet — every call was effectively a "miss") | 3 physical | −7 (−70%) |

### Implementation note (Task 1 finding, not a Task-1-scope file)

Task 1's own instrumentation test is what surfaced this: the invariants refill inside `lib/study-cache.ts`, as originally implemented in Plan 02 (four independent Prisma calls — `cardDependency.findMany` + `card.findMany` + `getSessionSize()` + `lesson.findMany` — run concurrently via `Promise.allSettled`), measured at **4 physical round trips**, not the ≤1 the ≤3-cold-miss budget requires. A cold `getStudyCards()` call under that shape cost **6** total (Phase A 1 + refill 4 + Phase B 1) — double the "at most 3" target. 32-CONTEXT.md's own "Claude's Discretion" note had explicitly anticipated this exact fork ("whether the cache-miss refill is one combined `json_group_array`-based query or several... the planner/executor should follow whichever shape passes the round-trip-count instrumentation") — it didn't pass at four, so `lib/study-cache.ts`'s `refreshStudyCache()` was revised (Phase 32-04 Task 1) to fold all four reads into ONE `prisma.$queryRaw` via correlated `json_group_array`/`json_object` subqueries, the same technique `lib/study-cards.ts`'s Phase B already uses for the `Sentence` relation. This brought the refill down to 1 physical round trip and the cold-miss total down to 3, matching D-01's projected architecture number exactly. The tradeoff taken: the four-separate-call shape could degrade PER FIELD independently on a read failure; the combined query is atomic (succeeds or throws as a whole), so a failure now degrades all four fields together. Recorded here, not smoothed over, per this file's own "no flattering numbers" convention — see `lib/study-cache.ts`'s REFILL SHAPE / DEGRADATION TRADEOFF header comments for the full reasoning, and `tests/study-cache.test.ts` / `tests/study-cards.test.ts` for the updated regression coverage.

### Fixture-scale caveat (restated)

Both the warm (2) and cache-miss (3) numbers above are round-trip **counts** — fixture-size-independent, exactly like every other number in this file (see "Fixture scale caveat" above). They say nothing about wall-clock latency at the ~1056-card production deck; that remains a separate, not-yet-measured question. What round-trip count answers — the only thing STUDY-01 asks for — is answered here, honestly, with both the warm and the miss number quoted side by side.
