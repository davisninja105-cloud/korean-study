# Phase 32: Study Load Round-Trip Collapse - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 8 (2 new, 6 modified)
**Analogs found:** 8 / 8 (all modified files are their own strongest analog — this is a refactor phase, not new-surface-area)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `lib/study-cards.ts` (Phase A/B rewrite) | service | CRUD (read, raw SQL) | itself (current version) + `lib/relink-dependencies.ts` (batch-diff concurrency pattern) | exact (self) |
| `lib/study-cache.ts` (NEW) | service/store (module-scope cache) | request-response | `lib/prisma.ts` (globalThis singleton pattern) | role-match |
| `lib/sync.ts` (bump version counter) | service | event-driven (write-then-signal) | itself — the existing auto-relink hook at end of `runSync()` | exact (self) |
| `lib/relink-dependencies.ts` (bump version counter) | service | event-driven | itself — existing `relinkAllDependencies()` | exact (self) |
| `app/study/page.tsx` (drop separate lessons query) | route (RSC page) | request-response | itself + `app/habits/page.tsx` / `app/page.tsx` (thin-RSC-plus-Client-shell pattern) | exact (self) |
| `app/api/cards/due/route.ts` | route (API) | request-response | itself (unchanged call shape; benefits from cache transparently) | exact (self) |
| `e2e/perf.spec.ts` (tighten budgets) | test (e2e) | request-response | itself — existing thresholds explicitly reserved "for Phase 32" | exact (self) |
| `tests/study-cards.test.ts` (extend mocks) + `tests/study-cache.test.ts` (NEW) | test (unit) | CRUD / event-driven | itself + `lib/settings.ts` getter/setter pattern (for cache invalidation test shape) | exact (self) / role-match |

## Pattern Assignments

### `lib/study-cards.ts` (service, CRUD — raw SQL rewrite of Phase A/B)

**Analog:** itself (`lib/study-cards.ts:1-186`, current Prisma-`findMany`-based version) — this phase rewrites the query bodies, not the surrounding contract (`StudyCardsParams` in, `CardDTO[]` out stays the same).

**Imports pattern** (lines 1-12):
```typescript
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { DEFAULT_SESSION_SIZE } from '@/lib/habit'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'
```
Add `import { getStudyCache, refreshStudyCache } from '@/lib/study-cache'` for the new cache module.

**Current Phase A/B concurrency pattern to preserve the SHAPE of** (lines 53-82, 135-142):
```typescript
const [sessionSizeResult, poolResult, edgesResult, knownRowsResult] = await Promise.allSettled([...])
// ...
const fullCards = await prisma.card.findMany({
  where: { id: { in: orderedIds } },
  include: { review: true, lesson: {...}, sentences: {...} },
})
```
Per RESEARCH.md, Phase A becomes a single `prisma.$queryRaw` (pool + `Setting.studyCacheVersion` scalar subquery in one round trip) and Phase B becomes a single `prisma.$queryRaw` using `json_group_array(json_object(...))` for `sentences` — **only if Task 1's instrumentation confirms the current `include` costs >1 physical query**. Preserve the existing safety cap (`take: 1000` → `LIMIT 1000` in raw SQL) and the existing in-memory edge filter comment (lines 111-120) verbatim — it documents a real historical perf bug (55 serial round-trips) that raw SQL must not reintroduce.

**Error handling pattern to keep** (lines 84-86, 100-105):
```typescript
if (poolResult.status === 'rejected') {
  throw new Error('Database error')
}
// ...
if (knownRowsResult.status === 'rejected') {
  console.error('[study-cards] known-lemmas query failed; ...', knownRowsResult.reason)
}
```
This graceful-degradation-per-query contract (critical pool throws, non-critical signals degrade with a logged reason) must be preserved for whichever fields move into the cache — the cache-miss refill path should degrade the same way, not introduce a new failure mode.

**DTO serialization pattern to keep verbatim** (lines 164-185): every `Date` field `.toISOString()`'d before return — RSC-05 contract, unaffected by this phase's query-shape change but must still hold when raw SQL rows (plain strings from SQLite, not Prisma `Date` objects) are mapped into `CardDTO`.

---

### `lib/study-cache.ts` (NEW — service/store, request-response)

**Analog:** `lib/prisma.ts` (lines 1-19) for the `globalThis`-scoped singleton pattern; `lib/settings.ts` (lines 68-79, `getSettings()`) for the batched-read/parse-separation convention.

**Singleton pattern to copy** (`lib/prisma.ts:4-19`):
```typescript
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}
function createPrismaClient() { ... }
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```
Adapt to a `globalThis`-scoped cache object (e.g. `{ version: string | null, edges, lemmas, sessionSize, lessons } | undefined`) so a dev-mode hot-reload doesn't recreate it every request — same rationale `lib/prisma.ts` already documents (dev-mode module reload creates a fresh singleton without this guard).

**Batched-read style to copy** (`lib/settings.ts:76-79`):
```typescript
export async function getSettings(keys: string[]): Promise<Map<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } })
  return new Map(rows.map((r) => [r.key, r.value]))
}
```
Use this exact `prisma.setting.findMany({ where: { key: { in: [...] } } })` shape if the version counter is read outside the raw-SQL scalar subquery in any code path (e.g. a standalone verification script). The `SETTING_KEYS` single-source-of-truth object pattern (`lib/settings.ts:17-26`) should be extended with a `studyCacheVersion` key rather than a new ad-hoc string literal.

**JSDoc header comment convention to copy** (`lib/sequence.ts` style, per CLAUDE.md conventions doc): explain the cache's contract, invalidation triggers, and cross-process caveat in a block comment at the top of the file — this project's convention for "single source of truth" modules.

---

### `lib/sync.ts` (service, event-driven — add unconditional version bump)

**Analog:** itself — the existing auto-relink hook at the end of `runSync()` (`lib/sync.ts:358-374`).

**Pattern to copy (non-fatal, logged, never blocks the return)**:
```typescript
let relinkedEdges: number | undefined
if (failures.length === 0 && newLessons > 0) {
  try {
    const relinkResult = await relinkAllDependencies()
    console.log(`[sync] auto-relink: created ${relinkResult.edgesCreated} edge(s) across ${relinkResult.cardsScanned} cards`)
    relinkedEdges = relinkResult.edgesCreated
  } catch (relinkErr: unknown) {
    const relinkMsg = relinkErr instanceof Error ? relinkErr.message : 'Unknown error'
    console.warn(`[sync] auto-relink failed (non-fatal, will retry next qualifying sync):`, relinkMsg)
  }
}
```
Per RESEARCH.md's Cache Invalidation Ownership table, the version-counter bump must be **unconditional** (not gated on `failures.length === 0 && newLessons > 0` like the relink call is) and should sit near the `return` statement, following the same try/catch-non-fatal-log style — a failed bump should log a warning, not fail the whole sync (a bump failure just means one extra stale-cache request on a rare double-failure path, not a correctness bug per D-01/D-02).

**Setting upsert pattern to copy** (`lib/settings.ts:86-94`, `setDailyGoalSeconds`):
```typescript
await prisma.setting.upsert({
  where: { key: GOAL_KEY },
  create: { key: GOAL_KEY, value: String(clamped) },
  update: { value: String(clamped) },
})
```
Use this exact upsert shape for bumping `studyCacheVersion` (e.g. incrementing an integer string, or writing a fresh ISO timestamp/uuid — either satisfies "changes on every bump," per RESEARCH.md's note that the counter is only ever compared for inequality, never counted).

---

### `lib/relink-dependencies.ts` (service, event-driven — add unconditional version bump)

**Analog:** itself — `relinkAllDependencies()` (lines 45-71).

**Pattern to copy** (the existing concurrent-read-then-conditional-write shape, lines 48-64):
```typescript
const [cards, existingEdges] = await Promise.all([...])
const missing = computeMissingEdges(cards, existingEdges)
if (missing.length > 0) {
  await prisma.cardDependency.createMany({ data: missing })
}
return { cardsScanned: cards.length, edgesCreated: missing.length, totalEdges: existingEdges.length + missing.length }
```
Add the version-counter bump as an **unconditional** final step before `return` (unlike the `createMany` above, which is conditional on `missing.length > 0` — the version bump must fire every call, since `relinkAllDependencies()` is the one function all three writer paths — API route, `local-resync.mts`, `relink-dependencies.mts` — call unconditionally per RESEARCH.md's ownership table). Keep the existing bounded-round-trip JSDoc guarantee ("exactly 2 reads + at most 1 write") updated to reflect the new unconditional write.

---

### `app/study/page.tsx` (route/RSC, request-response — drop separate lessons query, fix Pitfall 4 race)

**Analog:** itself (current version, lines 1-21) + `app/habits/page.tsx` / `app/page.tsx` for the general thin-RSC-calls-one-lib-function-then-renders-Client-shell convention already established project-wide.

**Current pattern to REPLACE (the race Pitfall 4 warns about)**:
```typescript
const [cardDTOs, lessons] = await Promise.all([
  getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null }),
  prisma.lesson.findMany({
    select: { id: true, orderIndex: true, title: true },
    orderBy: { orderIndex: 'asc' },
  }),
])
return <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
```
**Required new shape** (sequenced, not concurrent, per RESEARCH.md Pitfall 4): change `getStudyCards()`'s return type to `{ cards: CardDTO[], lessons: LessonRefDTO[] }` (or a second export reading the now-populated `study-cache` module), and call it with a single `await` before rendering — `Promise.all` must not be used here once lessons is served from the same cache Phase A populates. `dynamic = 'force-dynamic'` (line 10) must stay untouched — do not remove it.

**Existing `force-dynamic` comment to preserve verbatim** (lines 6-9): explains why the page must not be statically prerendered — directly load-bearing for STUDY-01's cache design (the pool read itself is never cached; only the four invariant reads are).

---

### `e2e/perf.spec.ts` (test, request-response — tighten budgets)

**Analog:** itself — existing generic thresholds already reserved for this phase.

Read the current threshold values and their surrounding comments before editing; the file's own comment (per RESEARCH.md line 452) already flags `3000ms`/`1000ms` as placeholders "explicitly reserved for Phase 32." Follow the same D-06/D-07-precedent caveat pattern already used elsewhere in this file: fixture-size caveats (the e2e seed DB is ~8 cards, not production-scale ~1056) must be called out in a comment near any new/tightened threshold, not asserted as if latency-representative.

---

### `tests/study-cards.test.ts` (extend) + `tests/study-cache.test.ts` (NEW)

**Analog:** `tests/study-cards.test.ts` itself (lines 1-60+) for the `vi.mock('@/lib/prisma', ...)` + hoisted-import convention.

**Mock pattern to copy** (lines 26-40):
```typescript
vi.mock('@/lib/prisma', () => ({
  prisma: {
    card: { findMany: vi.fn() },
    cardDependency: { findMany: vi.fn() },
  },
}))
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
```
Extend the mock object to also stub `prisma.$queryRaw` (as a `vi.fn()`) once Phase A/B move to raw SQL, and `prisma.setting.findUnique`/`upsert` if `study-cache.ts` reads/writes `Setting` directly rather than exclusively via the scalar subquery. The existing top-of-file comment block (lines 1-24) documenting "which findMany call is which by args shape" is the established convention for disambiguating mocked calls — write an equivalent comment for whichever raw-SQL/cache calls `tests/study-cache.test.ts` needs to distinguish.

**New test file (`tests/study-cache.test.ts`)** should follow the identical `vi.mock` + `beforeEach`/`afterEach` reset structure (see `beforeEach, afterEach, vi` import at line 24) — no new testing convention needed, this project already has the exact shape STUDY-03's cache-hit/miss/invalidation assertions require.

---

## Shared Patterns

### Non-fatal degrade-and-log for secondary reads
**Source:** `lib/study-cards.ts:100-105` (known-lemmas rejection log), `lib/sync.ts:366-373` (auto-relink catch)
**Apply to:** the new cache-miss refill path in `lib/study-cache.ts` and the version-counter bump calls added to `lib/sync.ts`/`lib/relink-dependencies.ts` — failures must log with a `[module-name]`-prefixed message and degrade gracefully, never throw and abort an otherwise-successful request/sync.
```typescript
console.error(
  '[study-cards] known-lemmas query failed; unknownCount ranking degrading to an empty known-lemma set',
  knownRowsResult.reason
)
```

### `Setting` table upsert as the single cross-process invalidation channel
**Source:** `lib/settings.ts:86-94` (upsert shape), `lib/settings.ts:17-26` (`SETTING_KEYS` single-source-of-truth object)
**Apply to:** `lib/study-cache.ts` (reading `studyCacheVersion`), `lib/sync.ts` and `lib/relink-dependencies.ts` (writing it). Add `studyCacheVersion: 'studyCacheVersion'` to `SETTING_KEYS` rather than a bare string literal anywhere else in the codebase.

### Concurrent-independent-reads via `Promise.all`/`Promise.allSettled`
**Source:** `lib/relink-dependencies.ts:48-55` (`Promise.all`, both critical), `lib/study-cards.ts:53-82` (`Promise.allSettled`, mixed critical/non-critical)
**Apply to:** the cache-miss refill path (edges + lemmas + sessionSize + lessons) — use `Promise.all` if all four are treated as equally critical on a cache-miss refill, or `Promise.allSettled` matching the existing per-query criticality split if graceful per-field degradation is preferred. Do NOT use `prisma.$transaction([...])` for this — verified in RESEARCH.md to increase round-trip count on this stack, not reduce it.

### RSC-05 DTO serialization (Date → ISO string) at the return boundary
**Source:** `lib/study-cards.ts:164-185`, `lib/dto.ts`
**Apply to:** any raw-SQL rewrite of Phase A/B — raw SQL rows return plain JS values (SQLite has no native Date type; timestamps come back as strings already, per libSQL's storage format), but the serialization/shape-mapping step at the end of `getStudyCards()` must still produce byte-identical `CardDTO` output, so don't assume raw SQL removes the need for this mapping block — it likely changes what needs mapping, not whether mapping happens.

## No Analog Found

None — every touched file already exists in the codebase with an established pattern to extend (this is a performance-refactor phase, not new-feature surface area). `lib/study-cache.ts` is the only wholly new file, and its two closest analogs (`lib/prisma.ts` singleton pattern, `lib/settings.ts` batched-read pattern) are both strong, direct matches.

## Metadata

**Analog search scope:** `lib/`, `app/study/`, `app/api/cards/due/`, `tests/`, `e2e/` — directories named explicitly in CONTEXT.md's Phase Boundary and RESEARCH.md's Recommended Project Structure.
**Files scanned:** `lib/study-cards.ts`, `lib/prisma.ts`, `lib/settings.ts`, `lib/sync.ts`, `lib/relink-dependencies.ts`, `app/study/page.tsx`, `tests/study-cards.test.ts`, `e2e/perf.spec.ts` (all read directly this session).
**Pattern extraction date:** 2026-08-08
