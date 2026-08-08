# Phase 32: Study Load Round-Trip Collapse - Research

**Researched:** 2026-08-08
**Domain:** Prisma 7 + `@prisma/adapter-libsql` round-trip behavior over Turso HTTP; Next.js 16.2.1 server-side caching; cross-process cache invalidation
**Confidence:** MEDIUM — the core "does `$transaction` batch?" question is HIGH confidence (verified directly from installed driver-adapter source, not docs/training data). The recommended caching architecture is MEDIUM (reasoned from verified primitives, not yet run against the real DB). One central claim — Phase B's `include` query issuing multiple physical queries on SQLite — is a verified premise (`relationLoadStrategy` unsupported on SQLite, confirmed via search) combined with a reasoned inference that needs empirical confirmation as the plan's first task.

## Project Constraints (from CLAUDE.md)

These are binding, not suggestions — the plan must satisfy all of them:

- **No `prisma db push`/`migrate` against `libsql://`.** Any schema change requires: edit `prisma/schema.prisma` → `npx prisma generate` → `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` → apply only the new DDL to Turso via `@libsql/client.executeMultiple()`. **This phase should need zero schema changes** — the `Setting` table (`key String @id`, `value String`) already exists and is suffficient for a new version-counter key (verified: `prisma/schema.prisma:156-159`).
- **`react-hooks/purity`**: no `Date.now()`/`new Date()`(no-arg)/`Math.random()` in render. Not directly implicated here (this phase is server-only query/caching work), but any client-side instrumentation code added for verification must respect this.
- **Vercel Hobby 60s function timeout** — irrelevant to this phase's normal path (a `/study` load is well under 60s already even at 4-5 round trips), but relevant to `local-resync.mts`, which is exempt (runs locally).
- **`export const dynamic = 'force-dynamic'` on `app/study/page.tsx` must not be removed.** It exists specifically so `getStudyCards()` re-queries per request (avoids the "same cards just reviewed" staleness bug). Caching must be scoped to the *invariant* reads inside `getStudyCards()`/the page, not to the dynamic pool/session-composition reads.
- **Do not delete `FreshnessWatcher`.** Out of this phase's scope entirely (Phase 33).
- **Lint must stay clean** (`npm run lint`).
- **Single-tenant, no multi-tenancy** — simplifies cache-key design; no per-user cache partitioning is ever needed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STUDY-01 | `/study` issues at most two round trips to Turso per load (down from 4-5) | See "Research Question 1" and "Research Question 4" below — the round-trip floor is verified to be higher than the sibling design doc assumed; achieving ≤2 requires both a caching layer (Research Question 2) AND, likely, converting Phase B's `include`-based fetch to raw SQL (SQLite has no `relationLoadStrategy: 'join'`) — see Pitfall 1. |
| STUDY-02 | The redundant second `card.findMany` is eliminated or confirmed non-duplicative | **Resolved by direct code read** — see "STUDY-02: Verified Non-Duplicative" below. Keep both queries; do not eliminate the second one. |
| STUDY-03 | `CardDependency` edges + `normalizedFront` lemmas cached, invalidated only on sync | See "Research Question 2" and "Cache Invalidation Ownership" below — a DB-persisted version counter is required (in-memory-only invalidation cannot reach the standalone scripts that also mutate this data). |
</phase_requirements>

## Summary

The sibling design doc's proposed fix — "wrap the three independent reads in `prisma.$transaction([...])`, which libSQL sends as one batch request" — is **verified false** for this exact stack (Prisma 7.6.0 + `@prisma/adapter-libsql` 7.6.0 + `@libsql/client` 0.17.2). I read the installed driver-adapter source directly: `PrismaLibSqlAdapter.startTransaction()` opens a libSQL *interactive* transaction (`client.transaction("deferred")`), and every subsequent `queryRaw`/`executeRaw` call inside that transaction goes through `HranaTransaction.execute()`, which does `this.batch([stmt])` — **one physical HTTP round trip per statement**, not one for the whole array. A 3-query `$transaction([...])` costs 4 physical round trips (BEGIN+q1 bundled, then q2, then q3, then COMMIT), each one strictly sequential (the client must await each response before issuing the next) — objectively *worse* for round-trip count than the current `Promise.allSettled` (which fires 4 concurrent requests: same count, less wall-clock time). The one API that genuinely batches N statements into one physical HTTP request — `@libsql/client`'s own `.batch()` method on the *plain* (non-transaction) `HttpClient` — is **not exposed anywhere on `@prisma/adapter-libsql`'s public surface**; Prisma's query engine cannot reach it through the normal `$transaction`/`$queryRaw` API.

A second, more consequential finding surfaced while researching instrumentation (Research Question 4): **SQLite (and therefore libSQL) does not support Prisma's `relationLoadStrategy: 'join'`** — it is only available on PostgreSQL, CockroachDB, and MySQL. That means Phase B's `card.findMany({ include: { review: true, lesson: {...}, sentences: {...} } })` almost certainly compiles to **multiple physical SQL queries** (1 for cards + up to 1 per included relation, each batched via `WHERE id IN (...)` to avoid N+1 *per row*, but still N+1 *per relation*) rather than the single round trip the current code's own comments assume. If confirmed, the *actual* current baseline is higher than the "4 to 5" figure in REQUIREMENTS.md, and the literal floor for "≤2 total round trips" cannot be reached by caching alone — Phase B itself would need to become a single hand-written raw SQL query (using SQLite's `json_group_array`/`json_object` to fold the one-to-many `sentences` relation into one row per card) to collapse to 1 physical request. **This must be empirically verified as the plan's first task**, before any other work, using Prisma's query-event log or adapter-level instrumentation (see Research Question 4) — it changes the shape of the whole solution.

Given both findings, the round-trip floor for `getStudyCards()` is: **1 physical request for Phase A's live pool read (raw SQL, batched with a cache-version check via a scalar subquery) + 1 physical request for Phase B's live full-row read (also raw SQL, using JSON aggregation for the one-to-many sentences relation)** = 2, with `CardDependency` edges / `normalizedFront` lemmas / `sessionSize` / the lessons list all served from an in-process cache populated inside that same Phase A request on a cache miss (adding zero extra round trips because they ride along in the same batch/subquery, not a separate call). **Primary recommendation:** verify the real baseline round-trip count first (Task 1, instrumentation-only, no behavior change), then implement a version-counter-gated cache (new `Setting` row, e.g. `studyCacheVersion`, bumped unconditionally at the end of `lib/sync.ts:runSync()` **and** unconditionally inside `lib/relink-dependencies.ts:relinkAllDependencies()` — the only function actually shared by all three data-mutating paths: the API sync route, `local-resync.mts`, and `relink-dependencies.mts`), with Phase A and (if the instrumentation confirms the N+1-relation-query problem) Phase B rewritten as raw SQL via `prisma.$queryRaw` to guarantee exactly one physical HTTP round trip each, regardless of cache hit/miss.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Due-card pool selection (`review.nextReview <= now`) | API/Backend (`lib/study-cards.ts`, server-only) | Database | Must always reflect live FSRS state; the `force-dynamic` constraint on `app/study/page.tsx` exists precisely to keep this live. Not cacheable. |
| Prerequisite closure / foundation-first ordering (`selectSessionCards`/`sequenceCards`) | API/Backend (`lib/sequence.ts`, pure function) | — | Pure, already tested, already correct — this phase must not touch its logic, only its inputs' provenance (cached vs. live). |
| `CardDependency` edge storage | Database | API/Backend (cache) | Edges only ever change during a sync/relink write path — a textbook invariant-read caching candidate. |
| `normalizedFront` "known lemmas" set (`review.state >= 1`) | Database | API/Backend (cache) | Technically changes on *every* review write (state 0→1 transition), not just sync — see Pitfall 3. STUDY-03 explicitly scopes invalidation to "sync completes" only; this is a deliberate, bounded staleness tradeoff that needs sign-off, not a bug. |
| Lessons list (`Lesson.orderIndex`/`title`) | Database | API/Backend (cache) | Only created during sync — cacheable with the same invalidation trigger as edges/lemmas. Currently fetched by a *separate* query in `app/study/page.tsx`, not inside `getStudyCards()` at all — must be folded in to make the whole-page "≤2 round trips" criterion hold. |
| `sessionSize` setting | Database | API/Backend (cache) | Only changes via `PUT /api/settings` (in-process, no standalone-script writer) — the simplest of the four invariant reads to cache correctly. |
| Cache invalidation signal (cross-process, cross-runtime) | Database (`Setting` table) | — | The **only** channel common to all three writers: the Next.js API route (`POST /api/sync`), `scripts/local-resync.mts` (standalone Node process, own DB connection), and `scripts/relink-dependencies.mts` (standalone Node process). Module-scope (`globalThis`) in-memory state is invisible to the latter two — verified by reading both scripts (neither imports/calls anything inside the Next.js server process). |
| Round-trip-count verification | API/Backend (Prisma query-event log or adapter-level instrumentation) + Test (Vitest/Playwright) | — | Success criterion #1 explicitly demands "demonstrable from query instrumentation rather than asserted by inspection" — this is a testable artifact, not a documentation claim. |

## Standard Stack

No new libraries are needed for this phase — it is exclusively a query-shape/caching change against tooling already in the project.

### Core (already installed — verified versions)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `prisma` / `@prisma/client` | 7.6.0 [VERIFIED: package.json] | ORM / query compiler | Already the project's ORM; Prisma 7's query-compiler architecture (not the old Rust binary engine) is what actually executes through the driver adapter. |
| `@prisma/adapter-libsql` | 7.6.0 [VERIFIED: package.json] | Prisma → libSQL driver adapter | Already in use (`lib/prisma.ts:2`); source read directly this session (see Code Examples). |
| `@libsql/client` | 0.17.2 [VERIFIED: package.json] | Low-level libSQL client (Hrana-over-HTTP) | Already a transitive dependency of the adapter; this phase's raw-SQL/batch path would import it directly as a peer, not add it. |

### Supporting (candidates evaluated, not adopted — see Research Question 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vercel/functions` (`getCache()`, Runtime Cache API) | current on Vercel platform [CITED: vercel:runtime-cache skill] | Ephemeral per-region KV with tag invalidation | **Not recommended for this phase** — see Research Question 2: not reachable from `local-resync.mts`/`relink-dependencies.mts` (standalone Node processes outside a Vercel Function), which are two of the three writers this phase must support. |
| Next.js 16 `"use cache"` / `unstable_cache` + `revalidateTag`/`updateTag` | Next.js 16.2.1 [VERIFIED: package.json], API confirmed via vercel:next-cache-components skill | Framework-level cached Server Component / function output | **Not recommended for this phase** — `revalidateTag`/`updateTag` are Next.js request-context-only APIs; the standalone scripts have no such context. Also conflicts with `app/study/page.tsx`'s `force-dynamic` requirement conceptually (Cache Components' PPR model wants `cacheComponents: true` in `next.config.ts`, not currently enabled, and migrating would be a much larger change than this phase's scope). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DB-persisted version counter (`Setting` table) | Module-scope (`globalThis`) in-memory cache only | Rejected as the sole mechanism: cannot be invalidated by the two standalone-script writers; would only self-heal on that Vercel instance's next cold start, violating success criterion #3 ("no stale-prerequisite behavior... no redeploy"). |
| Raw `$queryRaw` for Phase A/B | `prisma.$transaction([...])` (sequential array form) | Verified this session to cost *more* physical round trips than `Promise.all`, not fewer — see Summary. Do not use for this purpose. |
| Raw `$queryRaw` for Phase A/B | A separate `@libsql/client` instance calling `.batch()` directly (bypassing Prisma entirely for these two queries) | Genuinely achieves single-round-trip batching (verified from source — see Code Examples) and would work, but doubles the amount of "how do we talk to the DB" code paths in the project (Prisma singleton + a second raw client) for no benefit over `$queryRaw`, which already gets 1 physical round trip per call (verified — see Research Question 1) without introducing a second client. |

**Installation:** none — no new packages.

**Version verification:** All three relevant packages' versions were read directly from `package.json` this session, not assumed from training data — `prisma@^7.6.0`, `@prisma/client@^7.6.0`, `@prisma/adapter-libsql@^7.6.0`, `@libsql/client@^0.17.2`. Installed versions were cross-checked against `node_modules/@prisma/adapter-libsql/package.json` (`"version": "7.6.0"`) and `node_modules/@libsql/client/package.json` (`"version": "0.17.2"`) — exact match, no drift.

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new dependencies. All work is against packages already installed, in production use, and previously vetted in this codebase (`prisma`, `@prisma/client`, `@prisma/adapter-libsql`, `@libsql/client`). If the plan ends up needing a second raw `@libsql/client` instance (see "Alternatives Considered" — not recommended), no new registry package is required either; `@libsql/client` is already a direct dependency.

## Architecture Patterns

### Research Question 1 — Does `$transaction([...])` batch into one HTTP request? **VERIFIED: No.**

Read directly from the installed adapter source (`node_modules/@prisma/adapter-libsql/dist/index-node.js`):

```js
// [VERIFIED: node_modules/@prisma/adapter-libsql/dist/index-node.js:381-401]
async startTransaction(isolationLevel) {
  ...
  const tx = await this.client.transaction("deferred");
  return new LibSqlTransaction(tx, options, this.adapterOptions, release);
}
```

`LibSqlTransaction extends LibSqlQueryable`, and `LibSqlQueryable.queryRaw`/`executeRaw` both funnel through `performIO()`:

```js
// [VERIFIED: node_modules/@prisma/adapter-libsql/dist/index-node.js:313-320]
async performIO(query) {
  const release = await this[LOCK_TAG].acquire();
  try {
    const result = await this.client.execute({ sql: query.sql, args: ... });
    return result;
  } ...
}
```

`this.client` here is the libSQL `tx` object from `client.transaction("deferred")` — for the HTTP transport (Turso), that's `HttpTransaction extends HranaTransaction`. Its `execute()`:

```js
// [VERIFIED: node_modules/@libsql/client/lib-cjs/hrana.js:42-44]
execute(stmt) {
    return this.batch([stmt]).then((results) => results[0]);
}
```

Every individual `execute()` call inside an interactive transaction constructs its own single-statement `batch()` and does `await batch.execute()` — a **new physical HTTP round trip per statement** (the first call also bundles the `BEGIN`; `commit()` is one more round trip). Contrast with the plain (non-transaction) `HttpClient.batch(stmts)`, which genuinely sends N statements in one physical request:

```js
// [VERIFIED: node_modules/@libsql/client/lib-cjs/http.js:124-163]
async batch(stmts, mode = "deferred") {
  ...
  // Pipeline all operations, so `hrana.HttpClient` can open the stream, execute the batch and
  // close the stream in a single HTTP request.
  ...
}
```

**This `.batch()` method is never called by `@prisma/adapter-libsql`** — `PrismaLibSqlAdapter`'s only two methods beyond the inherited `queryRaw`/`executeRaw` are `executeScript()` (uses `client.executeMultiple()`, for raw multi-statement scripts, not for `$transaction`) and `startTransaction()` (interactive tx, per above). There is no code path from `prisma.$transaction([...])` to `HttpClient.batch()`. **Conclusion: `$transaction([...])` cannot be used to collapse round trips on this stack; it makes round-trip count worse (N+1 instead of N) while also serializing what is currently concurrent.** Do not implement the sibling design doc's suggestion as written.

The one thing that *does* genuinely batch on this stack is a plain (non-transaction) `prisma.$queryRaw`/`$executeRaw` call, or a raw `@libsql/client.batch()` call outside Prisma — both go through `HttpClient.execute()`/`HttpClient.batch()` directly, each "pipelining" (per the source's own comment) into exactly one physical HTTP request regardless of internal SQL complexity (subqueries, JOINs — all server-side, free of extra round trips).

### Research Question 4 (folded in here — it's architecturally load-bearing) — Phase B's `include` may already be N queries, not 1

**VERIFIED via search** (Prisma official docs, cross-checked): `relationLoadStrategy: 'join'` — the setting that makes Prisma emit a single SQL `JOIN` for `include`d relations — is supported only on PostgreSQL, CockroachDB, and MySQL. **SQLite is explicitly excluded.** Confirmed no override is present in this project (`prisma/schema.prisma:1-8` — `provider = "sqlite"`, no `relationLoadStrategy` config anywhere in the schema or in `lib/study-cards.ts`'s Phase B call).

This means Prisma's default (and only available) strategy for SQLite is **"query" strategy**: one query for the base rows, plus one *additional* query **per included relation**, each scoped with a batched `WHERE parentId IN (...)` to avoid true N+1 (it does not re-query per row, but it does re-query per relation *type*). Phase B's call:

```ts
// lib/study-cards.ts:135-142 — as currently written
const fullCards = await prisma.card.findMany({
  where: { id: { in: orderedIds } },
  include: {
    review:    true,
    lesson:    { select: { id: true, orderIndex: true, title: true, createdAt: true } },
    sentences: { orderBy: { orderIndex: 'asc' } },
  },
})
```

...has 3 relations (`review`, `lesson`, `sentences`). Reasoned inference (not yet run against a live DB this session, since no dev server/DB was available in this research pass): this single Prisma call is likely **3-4 physical queries**, not 1 — meaning today's actual `/study` round-trip count is plausibly **7-8**, not the "4-5" figure REQUIREMENTS.md states. **This must be the plan's very first task**: instrument (see Research Question 4 below) and measure the *real* current count before designing anything, because if this inference is confirmed, hitting "≤2 total" requires converting Phase B to raw SQL too (not just Phase A), which is a materially bigger lift than a half-day phase implies. Flag this to the user/planner explicitly — it is a legitimate scope fork, not a research nicety.

### STUDY-02: Verified Non-Duplicative

Read directly, this session, both sides of the column overlap:

`lib/sequence.ts:58-72` — the ONLY fields either selection algorithm reads:
```
[VERIFIED: lib/sequence.ts:58-72]
export interface SeqCard {
  id: string
  review?: { nextReview?: Date | string | null } | null
  nextReview?: Date | string | null
  lesson?: { orderIndex?: number | null } | null
}
export interface SeqEdge {
  cardId: string
  prerequisiteId: string
}
```

`lib/study-cards.ts:59-68` — the light pool's `select`:
```
[VERIFIED: lib/study-cards.ts:59-68]
select: {
  id:      true,
  review:  { select: { nextReview: true } },
  lesson:  { select: { orderIndex: true } },
},
```

These are exactly the same three fields, nothing more. `lib/dto.ts:54-76`'s `CardDTO` (what the *second* query's richer `include` is for) additionally requires `type`, `front`, `back`, `notes`, `normalizedFront`, `components`, `distractors`, `lessonId`, the full `lesson` object, the full `review` object, and `sentences[]` — none of which are present in the light-pool `select`. **The two queries are genuinely disjoint in columns; the second is not redundant.** STUDY-02 resolves to "confirmed non-duplicative" — do not eliminate Phase B. (Whether Phase B itself needs to become raw SQL to hit the round-trip budget is a separate question — see above; that is about *how* Phase B executes, not about deleting it.)

### System Architecture Diagram

```
                     app/study/page.tsx (RSC, force-dynamic)
                                  │
                                  │ await getStudyCards({scope:'due', lessonFrom:null, lessonTo:null})
                                  ▼
                     lib/study-cards.ts : getStudyCards()
                                  │
        ┌─────────────────────────────────────────────────────┐
        │  PHASE A — one physical round trip (raw SQL)          │
        │  ┌───────────────────────────────────────────────┐   │
        │  │ SELECT id, nextReview, lesson.orderIndex,       │   │
        │  │   (SELECT value FROM Setting                    │   │
        │  │    WHERE key='studyCacheVersion') AS _version    │   │
        │  │ FROM Card ... WHERE review.nextReview <= now     │   │
        │  │ (LIVE — never cached; force-dynamic requires it) │   │
        │  └───────────────────────────────────────────────┘   │
        └─────────────────────────────────────────────────────┘
                                  │
                     compare _version to in-process cache
                       ┌──────────┴───────────┐
                  version matches         version differs / empty
                  (common case)           (rare — right after a sync)
                       │                       │
              reuse cached:              ONE extra concurrent
              edges / lemmas /           Promise.all refetch of
              sessionSize / lessons      edges+lemmas+sessionSize+
              (0 extra round trips,      lessons, repopulate cache
              read from globalThis)      (adds round trips ONLY on
                       │                  this rare cache-miss path)
                       └──────────┬───────────┘
                                  ▼
              selectSessionCards() + sequenceCards()  (pure, lib/sequence.ts — untouched)
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │  PHASE B — one physical round trip (raw SQL, using    │
        │  json_group_array for the one-to-many sentences        │
        │  relation — SQLite has no relationLoadStrategy:'join') │
        │  SELECT card.*, review.*, lesson.*,                    │
        │    json_group_array(json_object(...)) AS sentences     │
        │  FROM Card JOIN CardReview JOIN Lesson                 │
        │  LEFT JOIN Sentence ... WHERE Card.id IN (orderedIds)  │
        │  (LIVE — must reflect just-graded review state)        │
        └─────────────────────────────────────────────────────┘
                                  ▼
                  countUnknownWords() annotation (pure, lib/known-words.ts)
                                  ▼
                        CardDTO[] serialization
                                  ▼
                  StudyClient (cards) + lessons (from Phase A's cache, 0 extra cost)
```

### Recommended Project Structure

No new directories. Touched files:
```
lib/
├── study-cards.ts        # Phase A/B rewritten as raw $queryRaw; cache read/populate logic
├── study-cache.ts         # NEW — module-scope cache object + version-check helper (small, pure-ish)
├── sync.ts                 # bump studyCacheVersion unconditionally at the end of runSync()
├── relink-dependencies.ts  # bump studyCacheVersion unconditionally inside relinkAllDependencies()
app/study/page.tsx          # stop its own separate lesson.findMany(); read from getStudyCards()'s return
app/api/cards/due/route.ts  # unchanged call shape, just benefits from the cache transparently
e2e/perf.spec.ts            # tightened /study, /api/cards/due budgets + D-11 rationale comment
tests/study-cards.test.ts   # extend mocks for the new raw-SQL call shape + cache behavior
```

### Pattern 1: Version-Counter-Gated Cache with Cross-Process Invalidation

**What:** A `globalThis`-scoped in-memory cache (same pattern as `lib/prisma.ts`'s Prisma singleton) storing `{ version, edges, lemmas, sessionSize, lessons }`, validated on every request against a `Setting`-table-persisted integer counter read as a *scalar subquery inside the same physical request as the live pool query* — not as a separate round trip.

**When to use:** Any read that (a) changes only via a small, enumerable set of write paths, (b) some of which run outside the Next.js process (standalone scripts), and (c) must be provably fresh with no polling/TTL window.

**Example (Phase A, illustrative — table/column names verified against `prisma/schema.prisma`):**
```ts
// Illustrative — table/column names verified against prisma/schema.prisma:10-159.
// Card.lessonId (line 42), CardReview.cardId/nextReview (line 76,91),
// Lesson.orderIndex (line 13), Setting.key/value (line 157-158).
const rows = await prisma.$queryRaw<{ id: string; nextReview: string; orderIndex: number | null; _version: string | null }[]>`
  SELECT c.id, r.nextReview, l.orderIndex,
    (SELECT value FROM Setting WHERE key = 'studyCacheVersion') AS _version
  FROM Card c
  JOIN CardReview r ON r.cardId = c.id
  LEFT JOIN Lesson l ON l.id = c.lessonId
  WHERE r.nextReview <= ${now.toISOString()}
  ORDER BY r.nextReview ASC
  LIMIT 1000
`
// One physical HTTP round trip (verified: plain prisma.$queryRaw funnels through
// HttpClient.execute(), which pipelines open-stream+query+close-stream into a
// single request — node_modules/@libsql/client/lib-cjs/http.js:92-123).
const version = rows[0]?._version ?? null
if (version !== cache?.version) {
  // Rare path — only right after a sync/relink bumped the counter, or a cold
  // instance's first request. Concurrent Promise.all refetch, cache repopulated.
  cache = await refreshInvariants(version)
}
```

**Cache Invalidation Ownership (verified from reading all three writer code paths this session):**

| Writer | File | Calls `runSync()`? | Calls `relinkAllDependencies()`? |
|--------|------|---------------------|-----------------------------------|
| `POST /api/sync` (in-process) | `app/api/sync/route.ts` → `lib/sync.ts` | Yes | Conditionally, inside `runSync()` (only when `failures.length === 0 && newLessons > 0` — `lib/sync.ts:359`) |
| `scripts/local-resync.mts` | standalone `tsx` process | **No** — duplicates the upsert loop inline (verified: no `runSync` import anywhere in the file) | Yes, unconditionally, as its final step (`scripts/local-resync.mts:216-218`) |
| `scripts/relink-dependencies.mts` | standalone `tsx` process | No | Yes, unconditionally (`scripts/relink-dependencies.mts:29-32`) |

**Because `local-resync.mts` never calls `runSync()`, bumping the version counter only inside `runSync()` would silently miss that writer.** `relinkAllDependencies()` (`lib/relink-dependencies.ts:45-71`) is the only function actually called, unconditionally, by all three real mutating flows except the in-process API route's own per-lesson inline linking step (which can create edges/cards even when the end-of-sync auto-relink is gated off by failures). **Recommendation: bump the counter in two places** — (1) unconditionally at the very end of `runSync()` (covers per-lesson inline edge/card creation regardless of whether the auto-relink gate fires), and (2) unconditionally inside `relinkAllDependencies()` itself (covers both standalone scripts, and harmlessly double-bumps when `runSync()`'s own auto-relink also runs in the same request — bumping twice is inert, not a correctness bug, since the counter is only ever compared for inequality, not counted).

### Anti-Patterns to Avoid

- **`prisma.$transaction([...])` for round-trip reduction:** verified to increase round-trip count on this stack, not decrease it. Use it only where you actually need transactional atomicity, never as a batching mechanism.
- **In-memory-only cache with no persisted invalidation signal:** works for the in-process writer, silently fails for the two standalone-script writers. This is not a hypothetical edge case — it is the only realistic way this app's data actually gets bulk-synced today (per `CLAUDE.md`: "For bulk initial syncs... run locally: `npx tsx scripts/local-resync.mts`").
- **Assuming `include` = 1 query on SQLite because it would be 1 query on Postgres.** `relationLoadStrategy: 'join'` is a Postgres/MySQL/CockroachDB-only feature; code and mental models carried over from a Postgres background will be wrong here.
- **Caching `sessionSize` without an invalidation hook in `setSessionSize()`.** It's tempting to treat it as "basically invariant," but it genuinely does write via `PUT /api/settings` — must be wired into the same invalidation counter, or excluded from caching and read live (only 1 extra tiny query, but see the round-trip-budget math in the Summary for why that tips the total over 2).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Round-trip counting/proof | A bespoke network-level HTTP request counter (e.g. patching `fetch` globally) | Prisma's `log: [{ emit: 'event', level: 'query' }]` + `$on('query', ...)`, cross-checked once against a thin counting wrapper around the adapter's `performIO`/`client.execute` (both already read this session — see Code Examples) | Prisma's query-event API is the officially documented mechanism and, per the source read this session, each event should correspond 1:1 to a physical `client.execute()`/`batch()` call for this specific adapter. Community reports flag inconsistent behavior with driver adapters "in certain configurations" (unverified for this exact version) — cross-checking against a second, adapter-level counter is cheap insurance, not redundant effort. |
| Cross-process cache invalidation | A pub/sub or webhook mechanism between the Vercel deployment and local scripts | A single integer row in the already-existing `Setting` table, read/written by the same Prisma client every writer already has | The `Setting` table is already the project's generic key/value store (`lastAutoSyncedAt` already lives there — `lib/settings.ts:12,25`) and every one of the three writers already has a live Prisma/Turso connection. No new infrastructure needed. |
| One-to-many relation flattening in raw SQL | Application-code post-processing (fetch flat rows, group in JS) | SQLite's `json_group_array(json_object(...))` inside the SQL itself | Keeps the "one physical request" property (grouping happens server-side); application-code grouping after a flat multi-row-per-card result set works too but is more code for the same outcome — either is acceptable, SQL-side grouping is the tighter payload. |

**Key insight:** every temptation in this phase to write "clever" application-level plumbing (a manual batching queue, a custom cache-bus) has a boring, already-present alternative sitting one line away — the `Setting` table, Prisma's own logging hooks, or plain SQL. The actual hard part of this phase is not infrastructure, it is verifying, empirically, exactly how many physical round trips the current and proposed code costs, because both the sibling design doc and (very plausibly) REQUIREMENTS.md's stated baseline are measurably wrong about that number.

## Common Pitfalls

### Pitfall 1: Believing `include` on SQLite behaves like `include` on Postgres
**What goes wrong:** A plan that treats Phase B's existing `card.findMany({ include: {...} })` as "already 1 round trip, just needs caching around it" will fail success criterion #1 even after everything else is done correctly.
**Why it happens:** `relationLoadStrategy: 'join'` is the Postgres/MySQL/CockroachDB default and is easy to assume as universal; it silently does not apply to SQLite (verified via search this session, not from training-data assumption alone — flagged `[CITED: prisma.io docs via WebSearch]`).
**How to avoid:** Task 1 of the plan must instrument and measure the *actual* current round-trip count (not trust the "4-5" figure) before any redesign. If Phase B is confirmed to issue 3-4 physical queries, it must also become raw SQL (with `json_group_array` for `sentences`) to hit the ≤2 budget.
**Warning signs:** Query-event log shows more than 2 physical queries firing even after Phase A is fully cached/collapsed to 1.

### Pitfall 2: `$transaction([...])` "looks like" batching and isn't
**What goes wrong:** Wrapping the 3-4 independent Phase A reads in `prisma.$transaction([q1, q2, q3])` — exactly what the sibling design doc suggests — makes things *worse*: more round trips, and they become sequential instead of concurrent.
**Why it happens:** The phrase "transaction... which libSQL sends as one batch request" sounds plausible and matches how `client.batch()` (a different, unexposed API) actually behaves — it's an easy mix-up between two different libSQL client concepts (interactive transactions vs. one-shot batches).
**How to avoid:** Verified this session directly from source (see Research Question 1) — do not use `$transaction([...])` for this purpose at all. Use plain (non-transaction) `$queryRaw` calls, one per physical request needed.
**Warning signs:** Query-instrumentation count goes UP after adding `$transaction`, not down.

### Pitfall 3: Caching the "known lemmas" set with sync-only invalidation silently degrades a ranking signal
**What goes wrong:** `normalizedFront` where `review.state >= 1` genuinely changes on every card's *first* review (state 0→1), which happens via `POST /api/review`, far more often than sync. STUDY-03's literal text scopes invalidation to "sync completes" only — implementing that literally means a card graded for the first time today won't be reflected as "known" (for the `unknownCount`/bare-word-gate ranking signal on OTHER cards' sentences) until the next sync.
**Why it happens:** The requirement text conflates two genuinely different invariance properties: `CardDependency` edges are *purely* sync-invariant (100% true — only sync/relink write them); the known-lemmas set is *not* purely sync-invariant (review writes also mutate it).
**How to avoid:** This is a genuine judgment call with no CONTEXT.md to resolve it (this phase explicitly skipped `/gsd-discuss-phase`). Flagged in the Assumptions Log below — the plan should either (a) implement STUDY-03 literally as worded (sync-only invalidation, accept the bounded staleness — it only affects sentence-picking/bare-word-gate presentation, never session composition/prerequisite closure, which success criterion #4 explicitly protects), or (b) also bump the cache version on `POST /api/review` writes (closer to what Phase 33's future `VERS-01` counter will do generally, but pulls Phase 33 scope earlier). Recommend (a) — it matches the literal requirement text and keeps Phase 32 self-contained — but this needs explicit confirmation before implementation, not silent assumption.
**Warning signs:** A freshly-graded-to-state-1 card's word still shows as "unknown" in another card's sentence selection until the next sync — expected under (a), a bug under (b).

### Pitfall 4: Racing `Promise.all` against cache population in `app/study/page.tsx`
**What goes wrong:** The current page code does `Promise.all([getStudyCards(...), prisma.lesson.findMany(...)])` — if the lessons list is moved to be served from the SAME cache `getStudyCards()`'s Phase A populates, running them concurrently risks reading the cache *before* `getStudyCards()` has populated it in that request.
**Why it happens:** `Promise.all` doesn't guarantee ordering; the whole point of consolidating the lessons read into the shared cache only works if it's read *after* `getStudyCards()` has resolved.
**How to avoid:** Change `getStudyCards()`'s return shape to include `{ cards, lessons }` (or otherwise sequence: `await getStudyCards()` THEN read the (now-populated) cached lessons) rather than keeping `Promise.all([getStudyCards(), lesson.findMany()])`. This is a deliberate, necessary behavior change from the current code, not an oversight — call it out explicitly in the plan.
**Warning signs:** Intermittent extra round trip on `/study` loads (the lessons query still fires live sometimes) that doesn't reproduce under sequential debugging.

### Pitfall 5: SQLite `json_group_array` compatibility on libSQL — not independently confirmed this session
**What goes wrong:** If `json_group_array`/`json_object` behave differently (or are unavailable) on Turso's libSQL fork vs. stock SQLite, the raw-SQL Phase B rewrite could fail or silently mis-aggregate sentences.
**Why it happens:** libSQL is SQLite-compatible but is a fork with its own JSON1-extension packaging; this session did not run a query against the actual Turso instance to confirm.
**How to avoid:** The plan's first raw-SQL task should include a small, throwaway manual verification (`turso db shell korean-study` — already a documented tool per CLAUDE.md — running a `SELECT json_group_array(json_object('a', 1))` smoke test) before committing to the pattern.
**Warning signs:** `unknown function: json_group_array` or malformed JSON in the sentences field after the rewrite.

## Code Examples

### Adapter-level round-trip counting (fallback if `$on('query')` proves unreliable — Research Question 4)

```ts
// Illustrative wrapper — verified against the exact shape of
// node_modules/@prisma/adapter-libsql/dist/index-node.js's PrismaLibSqlAdapter
// (constructor takes a config object with url/authToken and calls
// createClient(config) internally at connect()-time — index-node.js:427-430).
// A thin counting proxy around `createClient`'s return value (the plain
// @libsql/client instance) intercepts .execute()/.batch()/.transaction()
// BEFORE @prisma/adapter-libsql wraps it, giving a ground-truth physical
// request count independent of whether Prisma's own `log: 'query'` events
// fire reliably through the driver-adapter path.
import { createClient } from '@libsql/client'

let physicalRequestCount = 0
function countingClient(config: Parameters<typeof createClient>[0]) {
  const real = createClient(config)
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'execute' || prop === 'batch' || prop === 'transaction') {
        physicalRequestCount++
      }
      return Reflect.get(target, prop, receiver)
    },
  })
}
```

### Prisma query-event logging (primary instrumentation method — try first)

```ts
// [CITED: Prisma logging docs via WebSearch — log: [{ emit: 'event', level: 'query' }]
// then prisma.$on('query', (e) => ...) with e.query/e.params/e.duration]
// lib/prisma.ts — instrumentation variant for verification only, not necessarily
// left in production code permanently (see success-criteria note below).
const client = new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }] })
let queryCount = 0
client.$on('query' as never, () => { queryCount++ })
```

**Verification method for success criterion #1:** wire one of the two counters above into a dedicated Vitest test (mocking nothing — running against the real isolated e2e test DB, same pattern `e2e/seed.ts`'s `getTestPrisma()` already establishes) or a focused Playwright spec that calls `getStudyCards()` directly and asserts `physicalRequestCount <= 2` after a warm cache. This produces the "demonstrable from query instrumentation" artifact success criterion #1 explicitly demands, rather than a comment claiming the count by inspection.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Sequential `findMany` calls (pre-2026-07 RSC hydration milestone) | `Promise.allSettled` concurrent batch (current `lib/study-cards.ts`) | 2026-07 RSC hydration milestone | Reduced wall-clock time via concurrency; did NOT reduce round-trip *count* — this is the gap Phase 32 closes. |
| Prisma binary query engine (Rust) | Prisma 7's query-compiler architecture + driver adapters | Prisma 7 (installed: 7.6.0) | Driver adapters are now mandatory (not optional) for non-Postgres/embedded setups; `$transaction`'s actual network behavior is adapter-defined, not engine-defined — verified this session to matter a great deal for libSQL specifically. |
| `relationLoadStrategy` unset (implicit default) | Still unset in this project's schema | N/A — SQLite never had this option | Not a "changed" item, but a commonly-assumed-universal Postgres feature that silently doesn't apply here; worth flagging as a durable gotcha for any future Prisma work on this codebase, not just this phase. |

**Deprecated/outdated:** None directly relevant — no libraries used by this phase are deprecated. The sibling design doc's `$transaction`-as-batching suggestion is effectively "informationally outdated" for this specific driver-adapter combination even though it wasn't ever correct for it — worth noting in case similar guidance resurfaces in a future phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phase B's `card.findMany({ include: {...} })` issues 3-4 physical queries on SQLite, not 1 (reasoned from the verified fact that `relationLoadStrategy: 'join'` is unsupported on SQLite, but not directly measured against a running instance this session) | "Research Question 4" / Pitfall 1 | If wrong (Phase B is actually already 1 physical query via some other Prisma-internal optimization not surfaced by the search results), the recommended raw-SQL rewrite of Phase B is unnecessary extra work — but Task 1 (instrument-first) catches this regardless, so the risk is bounded to "wasted design effort," not a shipped defect. |
| A2 | STUDY-03's "invalidated only on sync" should be implemented literally, accepting known-lemmas staleness across review writes until the next sync (Pitfall 3) | "Pitfall 3" | If the actual product intent was for the known-lemmas ranking signal to stay fresh across review writes too, literal implementation ships a real (if bounded, presentation-only) UX regression that the phase's own success criteria don't explicitly test for. |
| A3 | `json_group_array`/`json_object` work identically on Turso's libSQL fork as on stock SQLite (Pitfall 5) | "Pitfall 5" | If unsupported/different, the Phase B raw-SQL rewrite fails outright and needs a fallback (e.g., a second small query for sentences, or application-code grouping) — not a silent-data-corruption risk, a build-time-discoverable one. |
| A4 | Prisma's `$on('query', ...)` event fires once per physical adapter call (1:1 with round trips) for this specific driver-adapter combination, despite a general community report of "issues... in certain configurations" | "Code Examples" / "Don't Hand-Roll" | If events under- or over-fire relative to physical requests, the query-count assertion used to prove STUDY-01 would be measuring the wrong thing — mitigated by cross-checking against the adapter-level counting proxy (also provided) before trusting either alone. |
| A5 | Bumping the version counter unconditionally inside `runSync()` (in addition to inside `relinkAllDependencies()`) is necessary because `runSync()`'s own per-lesson inline edge-linking (lines 299-328) can create edges even when the end-of-function auto-relink is gated off | "Cache Invalidation Ownership" | If wrong (e.g., if the inline linking never actually creates an edge not also caught by the subsequent auto-relink pass in practice), this is a harmless extra bump, not a correctness risk either way — low-stakes assumption. |

## Open Questions

1. **What is the actual current round-trip count for a `/study` load, measured, not inferred?**
   - What we know: the code issues at least 4 concurrent Phase A queries + at least 1 Phase B query = ≥5 logical Prisma calls; `relationLoadStrategy` being SQLite-unsupported strongly suggests Phase B alone is 3-4 physical queries.
   - What's unclear: the exact number, until instrumented and run.
   - Recommendation: Task 1 of the plan, before any redesign — wire up query-event or adapter-level counting (Code Examples above) against the seeded e2e test DB and print the real number. This also validates the instrumentation method itself, needed for STUDY-01's success criterion anyway.

2. **Is the full raw-SQL rewrite of BOTH Phase A and Phase B in scope for a phase originally estimated at "~half day" by the sibling design doc, or should the team accept a materially larger effort estimate?**
   - What we know: hitting a literal, unconditional ≤2 requires raw SQL for both phases if A1 is confirmed.
   - What's unclear: whether "at most two round trips" should be read as a hard architectural constraint worth the raw-SQL complexity/maintenance cost, or whether a looser reading (e.g., ≤2 in the steady-state warm-cache case, allowing a rare 3rd on cache-miss, and accepting Phase B may cost slightly more if the JSON-aggregation rewrite proves too risky) is acceptable.
   - Recommendation: surface this explicitly to the user before planning locks in an approach — it is a real scope/risk fork, not something research should silently resolve. There is no CONTEXT.md for this phase to have already settled it.

3. **Does bypassing Prisma's typed query builder for Phase A/B raw SQL create a schema-drift risk worth a regression test?**
   - What we know: raw SQL strings duplicate column/table names that Prisma's schema already encodes; a future (currently not-planned-until-Phase-35-or-later) schema change could silently desync them without a TypeScript error.
   - What's unclear: whether a lightweight guard (e.g., a Vitest test that runs the raw SQL against the schema-generated Prisma client's introspected types, or simply a code comment linking the raw SQL to the schema line numbers, as done in this document) is sufficient, or whether a stronger check is warranted.
   - Recommendation: at minimum, comment each raw SQL block with the `prisma/schema.prisma` line numbers it depends on (this document's own convention); a stronger typed-raw-query wrapper is optional, not blocking.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Turso (`libsql://` remote DB) | Real round-trip measurement against production-shaped data | Not directly probed this session (no `.env` credentials exercised in research) | — | Development/measurement should use the isolated e2e test DB (`e2e/seed.ts`'s `TEST_DB_URL`) for correctness, and acknowledge (per the existing `/cards` D-06/D-07 precedent in `e2e/perf.spec.ts`) that its ~8-card fixture cannot validate production-scale (~1056-card) latency, only round-trip *count*, which is fixture-size-independent. |
| `node_modules/@prisma/adapter-libsql`, `node_modules/@libsql/client` | Source-level verification (this research) | ✓ (read directly this session) | 7.6.0 / 0.17.2 | — |
| `turso db shell korean-study` | Pitfall 5's `json_group_array` smoke test | Documented as available per `CLAUDE.md` ("Inspect data the same way, or with `turso db shell korean-study`") — not run this session | — | If unavailable, run the smoke test against the local `file:./dev.db` SQLite file instead (same JSON1 extension family, lower confidence it matches Turso's fork exactly). |

**Missing dependencies with no fallback:** None — everything needed is already installed or already documented as available.

**Missing dependencies with fallback:** Turso credential-backed live measurement (fallback: e2e test DB for correctness + round-trip count; production-scale latency numbers deferred to the plan's own execution-time measurement, same as Phase 31's precedent).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 [VERIFIED: package.json] (unit) + Playwright ^1.61.1 [VERIFIED: package.json] (e2e) |
| Config file | `vitest.config.ts` (unit); `playwright.config.ts` (e2e, not read this session but referenced throughout `e2e/*.spec.ts`) |
| Quick run command | `npm test` (Vitest, no DB/API needed — pure lib functions per CLAUDE.md) |
| Full suite command | `npm test && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STUDY-01 | `/study` issues ≤2 physical round trips | unit (query-count assertion against instrumented Prisma/adapter) | `npx vitest run tests/study-cards.test.ts` | ⚠️ Existing file covers query *shape* (which findMany fires with what args) but not physical *round-trip count* — needs a new assertion, see Wave 0 Gaps |
| STUDY-01 | Mode-select due count + lesson-filter Apply settle "well ahead" of baseline | e2e (perf budget) | `npx playwright test e2e/perf.spec.ts` | ✅ exists, thresholds need tightening (currently generic `3000ms`/`1000ms` guard rails, explicitly reserved for "Phase 32" per the file's own comment) |
| STUDY-02 | Second `card.findMany` confirmed non-duplicative, not eliminated | unit (already resolved by static analysis this session — a regression test could assert the two selects' column sets stay disjoint, but this is a design invariant, not new runtime behavior) | `npx vitest run tests/study-cards.test.ts` | ✅ existing mocked-call-shape tests already exercise this by construction |
| STUDY-03 | Edges/lemmas served from cache; invalidated on sync completion | unit (cache-hit/miss + invalidation-trigger assertions) | new test file, e.g. `npx vitest run tests/study-cache.test.ts` | ❌ Wave 0 — file doesn't exist yet |
| STUDY-03 | No stale-prerequisite behavior after a fresh sync, no redeploy | e2e (sync → study round trip, asserting sequencing reflects newly-linked edges without restarting the server) | new or extended e2e spec | ❌ Wave 0 — no existing spec exercises a live sync→study cache-invalidation round trip |
| (regression) | Session composition byte-for-byte unchanged (prerequisite closure, foundation-first order, bare-word gate, least-unknown sentence) | unit + e2e | `npx vitest run tests/sequence.test.ts tests/study-cards.test.ts tests/known-words.test.ts` + `npx playwright test e2e/grade-flow.spec.ts` | ✅ all exist — must stay green, unmodified in *behavior* (test file updates for new mock shapes are expected and fine) |

### Sampling Rate
- **Per task commit:** `npm test` (fast, pure-function/mocked-Prisma tests, no DB needed)
- **Per wave merge:** `npm test && npx playwright test` (full suite, including the real isolated e2e DB)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the new query-instrumentation assertion specifically proving STUDY-01's ≤2 count (not just "tests pass" — an explicit, printed/asserted number per success criterion #1's "demonstrable... rather than asserted by inspection" wording)

### Wave 0 Gaps
- [ ] `tests/study-cache.test.ts` — covers STUDY-03 (cache hit/miss, version-counter comparison, cache population on miss)
- [ ] A query-instrumentation harness (adapter-level counting proxy or Prisma `$on('query')` wrapper, per Code Examples) — covers STUDY-01's "demonstrable from instrumentation" requirement; doesn't exist anywhere in the current test suite
- [ ] An e2e spec (new, or an extension of `e2e/freshness-fresh-paths.spec.ts`'s pattern) exercising: seed → run sync (or directly mutate `CardDependency`/`Setting` rows to simulate one) → hit `/study` → assert the newly-linked edge affects sequencing, with no server restart — covers STUDY-03's "no redeploy... no stale-prerequisite behavior"
- [ ] `e2e/seed.ts` fixture currently has exactly 1 `CardDependency` edge (`e2e/seed.ts:170-181`) and 8 cards total — sufficient to prove round-trip *count* and cache *correctness*, but the plan should not attempt to validate production-scale *latency* against this fixture (same documented caveat as `/cards`' D-06/D-07 in `e2e/perf.spec.ts`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No — unchanged | `lib/auth.ts` HMAC cookie, untouched by this phase |
| V3 Session Management | No — unchanged | Same |
| V4 Access Control | No — single-tenant, no per-user data isolation needed; the new cache is process-wide, not per-user, which is correct for a single-shared-password app | — |
| V5 Input Validation | Marginal — raw SQL introduced for the first time in this codebase | Parameterize every raw SQL value via Prisma's tagged-template `$queryRaw` (never string-interpolate user input into SQL text) — the `now`/`orderedIds` values feeding Phase A/B are server-derived (from `new Date()` and prior query results), not directly user-controlled, but the *pattern* must still use tagged templates, not manual string concatenation, to avoid establishing a bad precedent for future raw-SQL usage in this codebase. |
| V6 Cryptography | No | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SQL injection via hand-written raw SQL (new attack surface introduced by this phase) | Tampering | Prisma's `$queryRaw` **tagged template literal** form (`` prisma.$queryRaw`SELECT ... WHERE x = ${value}` ``) auto-parameterizes interpolated values — never use `$queryRawUnsafe` or manual string concatenation for any value, even server-derived ones, to keep the pattern safe by construction for whoever extends this code later. |
| Cache poisoning / stale-data leakage across the version-counter cache | Tampering / Information Disclosure | Not applicable in a meaningful way here — single-tenant app, no per-user cache partitioning, the counter only gates *which* deck-wide invariant data is served, not access control. |
| Denial of service via an unbounded raw SQL query | Denial of Service | Preserve the existing `LIMIT 1000` safety cap on the pool query (already present as `take: 1000` in the current Prisma call — must be carried over verbatim into the raw SQL rewrite, not dropped). |

## Sources

### Primary (HIGH confidence)
- `node_modules/@prisma/adapter-libsql/dist/index-node.js` — read directly this session; source of the `$transaction` round-trip-count finding.
- `node_modules/@libsql/client/lib-cjs/http.js` and `hrana.js` — read directly this session; source of the `.batch()` vs. `.execute()` distinction.
- `lib/study-cards.ts`, `lib/sequence.ts`, `lib/dto.ts`, `lib/sync.ts`, `lib/relink-dependencies.ts`, `scripts/local-resync.mts`, `scripts/relink-dependencies.mts`, `lib/settings.ts`, `lib/prisma.ts`, `prisma/schema.prisma`, `app/study/page.tsx`, `app/api/cards/due/route.ts`, `e2e/seed.ts`, `e2e/perf.spec.ts`, `tests/study-cards.test.ts` — all read directly this session.

### Secondary (MEDIUM confidence)
- Prisma official docs / GitHub discussions (via WebSearch) on `relationLoadStrategy` SQLite unsupported — cross-referenced across multiple independent result snippets (Prisma blog, Prisma docs, GitHub issue #26101), consistent finding.
- Prisma logging docs (via WebSearch) on `log: [{ emit: 'event', level: 'query' }]` + `$on('query', ...)` — official API surface, but with an unverified-for-this-exact-version community caveat about driver-adapter reliability.
- `vercel:runtime-cache` and `vercel:next-cache-components` skill content — current platform documentation bundled with the Claude Code environment, treated as authoritative per the session's explicit instruction to prefer these over possibly-stale training data.

### Tertiary (LOW confidence)
- The inference that Phase B currently issues 3-4 physical queries (not directly measured against a running Turso/SQLite instance this session — see Assumption A1 and Open Question 1).
- `json_group_array`/`json_object` compatibility on Turso's specific libSQL fork (see Assumption A3 and Pitfall 5) — not run this session.

## Metadata

**Confidence breakdown:**
- `$transaction` round-trip behavior: HIGH — verified directly from installed source code, not docs or training data.
- Phase B's true round-trip count: MEDIUM — verified premise (`relationLoadStrategy` SQLite-unsupported) + reasoned but unmeasured inference; flagged as the plan's mandatory first empirical task.
- Caching architecture (version counter + invalidation ownership): MEDIUM — verified from reading all three writer code paths directly, but the specific "bump in two places" design is this session's synthesis, not something independently confirmed against a working implementation.
- Standard stack / package legitimacy: HIGH — no new packages; existing versions read directly from `package.json` and cross-checked against installed `node_modules`.
- Pitfall 3 (known-lemmas staleness scope): LOW-MEDIUM — a genuine interpretive judgment call flagged explicitly for user confirmation, not a fact.

**Research date:** 2026-08-08
**Valid until:** Effectively pinned to the current `package.json` lockfile state (`prisma@7.6.0`, `@prisma/adapter-libsql@7.6.0`, `@libsql/client@0.17.2`, `next@16.2.1`) — any Prisma or libSQL client version bump before this phase executes should trigger a re-verification of the Research Question 1 finding, since it depends on exact adapter internals, not a stable public API contract. Recommend treating this research as valid for **7 days** given the fast-moving Next.js 16 Cache Components / Vercel Runtime Cache surface referenced in Research Question 2, even though this phase does not end up depending on either.
