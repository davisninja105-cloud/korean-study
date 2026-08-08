---
phase: 32-study-load-round-trip-collapse
reviewed: 2026-08-08T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - app/api/cards/due/route.ts
  - app/study/page.tsx
  - e2e/helpers/mutate.ts
  - e2e/perf.spec.ts
  - e2e/run-mutate.ts
  - e2e/study-cache-invalidation.spec.ts
  - lib/prisma.ts
  - lib/query-counter.ts
  - lib/relink-dependencies.ts
  - lib/settings.ts
  - lib/study-cache.ts
  - lib/study-cards.ts
  - lib/sync.ts
  - scripts/measure-study-roundtrips.mts
  - tests/cards-due-route.test.ts
  - tests/study-cache.test.ts
  - tests/study-cards.order-fixture.txt
  - tests/study-cards.test.ts
  - tests/study-roundtrips.test.ts
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-08-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

This phase replaces several typed Prisma calls in `lib/study-cards.ts` with hand-written raw SQL
(`prisma.$queryRaw` tagged templates + `Prisma.sql`/`Prisma.join`) and introduces a new
process-global invariants cache (`lib/study-cache.ts`) gated by a `studyCacheVersion` Setting
token, to collapse the `/study` page load from ~10 physical libSQL round trips down to 2 warm / 3
cold.

**SQL injection:** clean. Every raw query in `lib/study-cards.ts`, `lib/study-cache.ts`, and
`scripts/measure-study-roundtrips.mts` interpolates values exclusively through `Prisma.sql`
fragments and `Prisma.join()`, both of which produce bound parameters — never
`$queryRawUnsafe`, never string concatenation. `lessonFrom`/`lessonTo` are validated to be
canonical positive integers by `app/api/cards/due/route.ts`'s `INTEGER_RE` before they ever reach
the query layer, and even unvalidated they'd still be safely bound. No injection vector found.

**`julianday()` rationale:** the dual-format TEXT-timestamp comparison problem is real (Prisma's
SQLite DateTime serialization uses `+00:00`, `Date.toISOString()` emits `Z`) and `julianday()` on
both sides is a correct, tested fix — `tests/study-roundtrips.test.ts` and the e2e specs exercise
real due/not-due rows through this path successfully.

**`lib/query-counter.ts` production no-op guarantee:** verified. `lib/prisma.ts` only constructs
the counting `Proxy`/`CountingPrismaLibSql` subclass when `process.env.STUDY_QUERY_COUNTER === '1'`
(a strict equality check, not truthy-check), and the counter module logs nothing beyond integer
counts. The default (unset) production path is byte-identical to the pre-instrumentation
construction path.

The real problems found are two BLOCKER-level cache-invalidation gaps in the *new* invariants
cache in `lib/study-cache.ts` / `lib/study-cards.ts` — both are genuinely new to this phase (the
pre-phase code, recovered via `git show da365f8:lib/study-cards.ts`, read `sessionSize` fresh on
every call and had no cross-request cache to poison), and neither is covered by the existing test
suite.

## Critical Issues

### CR-01: Changing "Session size" in Settings never takes effect on a warm `/study` load

**File:** `lib/study-cache.ts:64-182` (the combined invariants snapshot), `lib/settings.ts:128-136,
300-308` (`setSessionSize`/`bumpStudyCacheVersion`), `app/api/settings/route.ts:19-45` (PUT handler)

**Issue:** `refreshStudyCache()` folds `sessionSize` into the same `globalThis`-cached snapshot as
`edges`/`lemmas`/`lessons`, and that snapshot's *only* invalidation trigger is
`bumpStudyCacheVersion()`, which is called exclusively from `lib/sync.ts:runSync()` and
`lib/relink-dependencies.ts:relinkAllDependencies()` (`lib/settings.ts:295-298` documents this
scope explicitly). `PUT /api/settings` → `setSessionSize()` (`lib/settings.ts:128-136`) writes the
new value to the `Setting` table but never calls `bumpStudyCacheVersion()` — confirmed by reading
`app/api/settings/route.ts:19-45`, which calls `setSessionSize(sessionSize)` directly with no
cache-invalidation call anywhere in the handler.

Concretely: user loads `/study` once (warms the cache with `sessionSize=20`). User goes to
Settings and changes "Session size" to 50 — the DB write succeeds and the PUT response echoes
`50`. User navigates back to `/study` on the *same still-running server process* (exactly the
warm-lambda-reuse scenario this phase's whole design assumes and Playwright's
`study-cache-invalidation.spec.ts` exercises for the edge-relink case) — `getStudyCards()` still
serves the stale cached `sessionSize=20`, silently ignoring the user's change, until an unrelated
sync or relink happens to bump the token (or the process cold-starts).

Before this phase, `getSessionSize()` was read fresh from the DB on every single `/study` load
(confirmed via `git show da365f8:lib/study-cards.ts` lines 20-38, 82-83) — this is a genuine
regression, not a pre-existing limitation, and it is untested: `grep -rl sessionSize e2e/ tests/`
turns up no test that changes `sessionSize` via Settings and then reloads `/study` to check it
took effect.

**Fix:** Either (a) call `bumpStudyCacheVersion()` from `setSessionSize()` (or from the PUT
handler when `hasSize` is true) so a session-size change invalidates the snapshot like a sync
does, or (b) stop bundling `sessionSize` into the version-gated snapshot and read it with its own
lightweight per-request lookup (it was previously a single cheap `findUnique`, and CLAUDE.md's own
`STUDY_QUERY_COUNTER` framing treats it as a distinct concern from the CardDependency/lemma graph
data). Option (a) preserves the round-trip win; e.g.:

```ts
// lib/settings.ts
export async function setSessionSize(n: number): Promise<number> {
  const clamped = Math.max(5, Math.min(100, Math.round(n)))
  await prisma.setting.upsert({
    where: { key: SESSION_SIZE_KEY },
    create: { key: SESSION_SIZE_KEY, value: String(clamped) },
    update: { value: String(clamped) },
  })
  await bumpStudyCacheVersion() // invalidate lib/study-cache.ts's snapshot
  return clamped
}
```
(Watch for the import cycle: `lib/settings.ts` already defines `bumpStudyCacheVersion`, so this is
a same-file call, not a new import.)

---

### CR-02: An empty due/ahead pool makes `getStudyCards()` stop reading the real `studyCacheVersion`, permanently pinning stale `lessons`/`edges`/`lemmas` behind a synthetic `null` version

**File:** `lib/study-cards.ts:170-186`

**Issue:**
```ts
const version = rows.length > 0 ? rows[0].version : null
const cached = getStudyCache()
const invariants =
  cached && cached.version === version ? cached : await refreshStudyCache(version)
if (rows.length === 0) return { cards: [], lessons: invariants.lessons }
```
When the Phase A pool query returns zero rows (no cards due, or none "ahead"), there is no row to
read `studyCacheVersion` from, so `version` is hard-coded to `null` — completely independent of
the real value in the `Setting` table. The first time this happens, `refreshStudyCache(null)` is
called and **stores** a snapshot stamped `version: null` in the process-global cache
(`lib/study-cache.ts:179-181`, `globalForStudyCache.studyCache = snapshot`). Every *subsequent*
empty-pool request also computes `version = null`, matches the cached `null`-stamped snapshot, and
reuses it — **without ever comparing against the real DB-persisted `studyCacheVersion` token**.

If a sync or relink happens in between (bumping the real token, e.g. adding a new lesson) while the
due/ahead pool *remains* empty across that window, the stale `lessons`/`edges`/`lemmas` snapshot is
served indefinitely — directly contradicting this module's own documented invalidation contract
(`lib/study-cache.ts:10-17`: "the ONLY trigger is a change to the `studyCacheVersion` Setting
row... the next `/study` request... reads the DB-persisted version, sees it changed, and refills
for itself"). In practice this means a user who has cleared all due cards for the day, then syncs
in a new lesson via `scripts/local-resync.mts`/cron (without any of the new lesson's cards
happening to already be due), would not see the new lesson in `LessonRangeFilter` on `/study`
until the pool becomes non-empty at least once.

Untested: `tests/study-cards.test.ts`'s cache-gating test (`'a warm cache... skips the invariant
refill'`) only exercises the non-empty-pool path (`makePoolRow()` always returns one row).

**Fix:** Read the real `studyCacheVersion` even when the pool is empty, e.g. via a tiny fallback
scalar query, or restructure Phase A so the version subquery runs unconditionally rather than
being derived from `rows[0]`:

```ts
// after the try/catch that fetches `rows`
const version = rows.length > 0
  ? rows[0].version
  : (await prisma.$queryRaw<{ v: string | null }[]>`
      SELECT value AS v FROM Setting WHERE key = 'studyCacheVersion'
    `)[0]?.v ?? null
```
(Costs one extra physical round trip only on the already-rare empty-pool path — never on the warm,
non-empty steady state this phase optimizes for.)

## Warnings

### WR-01: Phase A's raw-SQL failure is swallowed with no logging

**File:** `lib/study-cards.ts:144-168`

**Issue:** `catch { throw new Error('Database error') }` discards the actual driver/SQL error
entirely — nothing is logged anywhere. Contrast with the invariants-refill catch two blocks later
(`lib/study-cache.ts:159-171`), which explicitly `console.error`s the rejection reason before
degrading. A production 500 from the primary due-card pool query would surface only the generic
"Database error" message in the client response and leave zero trace in server logs of *why* —
this is pre-existing behavior (confirmed unchanged from `git show da365f8:lib/study-cards.ts`),
but it's now sitting next to a sibling raw-SQL call in the same function that does the right
thing, making the inconsistency more visible and worth fixing while this file is already being
touched.

**Fix:**
```ts
} catch (err) {
  console.error('[study-cards] pool query failed', err)
  throw new Error('Database error')
}
```

### WR-02: `e2e/perf.spec.ts`'s tightened budgets have very little headroom and were computed from a single local run

**File:** `e2e/perf.spec.ts:73-103`

**Issue:** `/study` and `/api/cards/due` budgets were tightened to 100ms based on one local
dev-machine measurement each (median ~33-46ms, "50% headroom... rounded up to the nearest 100ms").
CI runners are typically shared/slower and more variable than a developer's local machine; a
budget with only ~50% headroom over a single-run local median is a plausible source of flaky CI
failures that have nothing to do with an actual regression. The comments are admirably honest
about this being a local-fixture-scale measurement, but that honesty doesn't change the flake
risk in practice.

**Fix:** Either widen the headroom multiplier for these two specifically (e.g. 3x instead of
1.5x, matching the "generous guard rail, not a target" philosophy the file states for the other
budgets), or take the tightened budgets from a small sample of CI runs rather than one local run,
so the number reflects the actual measurement environment these tests run in.

### WR-03: Concurrent cold-start requests can both miss the cache and issue duplicate refills

**File:** `lib/study-cache.ts:84-182`, `lib/study-cards.ts:182-184`

**Issue:** `getStudyCache()`/`refreshStudyCache()` read/write a single `globalThis`-held object
with no locking or in-flight-request de-duplication. Two `/study` requests arriving concurrently
against a cold (or just-invalidated) cache will both observe `cached === undefined` (or a version
mismatch), both call `refreshStudyCache()`, and both pay the extra round trip — the second write
simply clobbers the first with an equivalent result. This is not a correctness bug (both
snapshots carry the same version and equivalent data), but it silently doubles the "cold-miss"
round-trip cost under concurrent load, which works against this phase's own stated goal, and isn't
exercised by any test (`tests/study-cache.test.ts`/`tests/study-cards.test.ts` only ever await one
call at a time).

**Fix:** Optional — a module-scope in-flight `Promise` that concurrent callers await instead of
each calling `refreshStudyCache()` independently would close this gap if it turns out to matter in
practice; not blocking for this review given the actual measured impact is bounded (one extra
round trip, self-correcting).

## Info

### IN-01: `refreshStudyCache()`'s doc comments call its subqueries "correlated" when they are not

**File:** `lib/study-cache.ts:37-51, 89-96`

**Issue:** The header and inline comments repeatedly describe the four subqueries inside
`refreshStudyCache()`'s single `SELECT` (which has no top-level `FROM`) as "correlated
json_group_array/json_object subqueries." None of the four actually reference an outer-query
column — they're independent, non-correlated scalar subqueries, unlike Phase B's genuinely
correlated `sentencesJson` subquery (`lib/study-cards.ts:260-271`, which does reference the outer
`c.id`). This doesn't affect behavior, but a future reader debugging this query using the
"correlated" framing could waste time looking for a join condition that isn't there.

**Fix:** Reword to "independent scalar subqueries" (or just drop "correlated") in the three
comment blocks that use the term for this specific query.

---

_Reviewed: 2026-08-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
