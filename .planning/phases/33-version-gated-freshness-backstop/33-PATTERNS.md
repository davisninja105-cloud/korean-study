# Phase 33: Version-Gated Freshness Backstop - Pattern Map

**Mapped:** 2026-08-08
**Files analyzed:** 7 (created/modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app/api/version/route.ts` | route (API) | request-response | `app/api/lessons/route.ts` | exact |
| `lib/settings.ts` (add `getDataVersion`/`bumpDataVersion`) | utility/service | CRUD (Setting-table upsert) | `lib/settings.ts:bumpStudyCacheVersion()` (same file) | exact |
| `lib/sync.ts` (add bump call in `runSync()`) | service | event-driven (post-write invalidation) | existing `bumpStudyCacheVersion()` call site in same function | exact |
| `app/api/review/route.ts` (add `tx.setting.upsert` in transaction) | route (API) | CRUD (transactional write) | same file's existing `$transaction` block | exact |
| `components/FreshnessWatcher.tsx` (gate `fetchBackstop()`) | component (client, side-effect) | request-response (conditional fetch) | same file's existing `fetchBackstop()`/`refresh()` | exact |
| `e2e/helpers/mutate.ts` (`*Direct` fns + version bump) | test utility | event-driven (test simulation) | same file's `createForwardReferenceAndRelinkDirect()` | exact |
| `tests/version-route.test.ts` | test | integration (real temp SQLite + real route) | `tests/review-route.test.ts` | exact |

## Pattern Assignments

### `app/api/version/route.ts` (route, request-response)

**Analog:** `app/api/lessons/route.ts` (full file, 15 lines)

**Full analog (imports + core pattern combined — file is tiny):**
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const lessons = await prisma.lesson.findMany({ ... })
  return NextResponse.json(lessons)
}
```

**Target implementation shape** (per RESEARCH.md Code Examples):
```typescript
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  return NextResponse.json({ version })
}
```

**Error handling:** None needed — no input to validate (no params/body), matches `/api/lessons` (no try/catch; Prisma failures bubble to Next.js's default 500). No `export const dynamic = 'force-dynamic'` needed (confirmed no sibling GET route declares it).

**Auth:** None to add — `middleware.ts`'s matcher already covers all `/api/*` paths except the explicit exclusion list; `/api/version` is auto-gated.

---

### `lib/settings.ts` (utility, CRUD) — add `getDataVersion()`/`bumpDataVersion()`

**Analog:** `bumpStudyCacheVersion()`, same file, lines 310-317 (verbatim, this is the pattern to replicate):
```typescript
export async function bumpStudyCacheVersion(): Promise<string> {
  const token = `${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`
  await prisma.setting.upsert({
    where: { key: STUDY_CACHE_VERSION_KEY },
    create: { key: STUDY_CACHE_VERSION_KEY, value: token },
    update: { value: token },
  })
  return token
}
```

**Key constant declaration pattern** (lines 5-20, module top):
```typescript
const GOAL_KEY = 'dailyGoalSeconds'
...
const STUDY_CACHE_VERSION_KEY = 'studyCacheVersion'
```
New key: `const DATA_VERSION_KEY = 'dataVersion'` — declare alongside the other Setting keys, with a doc comment matching the `STUDY_CACHE_VERSION_KEY` comment style (explains what invalidates it, who calls it).

**Divergence for `dataVersion` (per RESEARCH.md Pattern 1):** use plain `Date.now()` token (NO random suffix) — unlike `bumpStudyCacheVersion()` — because the client/Phase-34 consumer needs numeric comparability (`newVersion > cachedVersion`), and the upsert alone (not the random suffix) is what prevents the lost-update race.

```typescript
export async function getDataVersion(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: DATA_VERSION_KEY } })
  return row?.value ?? '0'
}

export async function bumpDataVersion(): Promise<string> {
  const token = String(Date.now())
  await prisma.setting.upsert({
    where: { key: DATA_VERSION_KEY },
    create: { key: DATA_VERSION_KEY, value: token },
    update: { value: token },
  })
  return token
}
```

**SETTING_KEYS registry (lines 25-36):** Note comment explicitly says `getAllSettings()` does NOT spread `Object.values(this)` — it's fine to add `dataVersion` to the `SETTING_KEYS` object (or omit it) without affecting `GET /api/settings`; follow the `studyCacheVersion` precedent (it IS present in `SETTING_KEYS` at line 35) for consistency if this key needs to be discoverable elsewhere.

**JSDoc block comment convention** (lines 296-309, above `bumpStudyCacheVersion`):
```typescript
/**
 * ... explains: what it does, why upsert (not read-increment) avoids the
 * lost-update race, and lists every call site.
 */
```
Apply the same block-comment convention to `bumpDataVersion()`, listing its two call sites (`lib/sync.ts:runSync()`, `app/api/review/route.ts`).

---

### `lib/sync.ts` (service, event-driven invalidation) — add `bumpDataVersion()` call

**Analog:** same file's existing `bumpStudyCacheVersion()` call, lines 377-394 (verbatim, this is the exact insertion pattern):
```typescript
try {
  await bumpStudyCacheVersion()
} catch (bumpErr: unknown) {
  const bumpMsg = bumpErr instanceof Error ? bumpErr.message : 'Unknown error'
  console.warn(
    '[sync] studyCacheVersion bump failed (non-fatal — one stale-cache request until the next bump):',
    bumpMsg
  )
}
```

**Pattern to copy:** unconditional (fires regardless of `failures.length`/`newLessons`), try/catch-non-fatal (logged via `console.warn`, never thrown), placed adjacent to the existing bump call at the end of `runSync()`. Add a second, near-identical `try { await bumpDataVersion() } catch { ... }` block right after/alongside it — same non-fatal logging style, different log-message prefix (`'[sync] dataVersion bump failed...'`).

**Coverage note:** `runSync()` is called by both `POST /api/sync` (manual) and `GET /api/cron/sync` (daily cron) — one call site here covers both triggers, no route file changes needed.

---

### `app/api/review/route.ts` (route, CRUD/request-response) — add `tx.setting.upsert` inside transaction

**Analog:** same file's existing `$transaction` block, lines 80-104 (verbatim):
```typescript
const review = await prisma.$transaction(async (tx) => {
  const cardReview = await tx.cardReview.findUnique({ where: { cardId } })
  if (!cardReview) {
    throw new CardReviewNotFoundError()
  }

  const updated = reviewCard(cardReview, rating)

  const { count } = await tx.cardReview.updateMany({
    where: { cardId, reps: cardReview.reps, lastReview: cardReview.lastReview },
    data: updated,
  })
  if (count === 0) {
    throw new StaleReviewError()
  }

  await tx.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } })

  return tx.cardReview.findUniqueOrThrow({ where: { cardId } })
})
```

**Insertion point:** immediately after the `tx.reviewLog.create(...)` call, before the `return`:
```typescript
  await tx.setting.upsert({
    where: { key: 'dataVersion' },
    create: { key: 'dataVersion', value: String(Date.now()) },
    update: { value: String(Date.now()) },
  })
```
(Or call a shared helper if one is exported as tx-compatible — but `bumpDataVersion()` in `lib/settings.ts` uses the top-level `prisma` client, not a passed-in `tx`, so either write it inline here with `tx.setting.upsert`, matching this exact shape, or refactor `bumpDataVersion()` to accept an optional client param. Inline is simplest and matches the file's existing style of not over-abstracting the transaction body.)

**Why inside the transaction (not after):** atomicity with the review write — if the transaction rolls back (`StaleReviewError`, `CardReviewNotFoundError`, or the idempotency-retry P2002 branch at lines 149-165 which never re-enters the transaction body), the version bump correctly never lands for a no-op.

**Error handling pattern** (this file's existing convention, sentinel error classes + catch block):
```typescript
class CardReviewNotFoundError extends Error {}
class StaleReviewError extends Error {}
...
} catch (e) {
  if (e instanceof CardReviewNotFoundError) {
    return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
  }
  ...
```
No changes needed to this catch block — the new upsert doesn't introduce a new error class.

---

### `components/FreshnessWatcher.tsx` (client component, conditional fetch)

**Analog:** same file's existing `fetchBackstop()`/`refresh()` functions (lines 84-172, read this session per RESEARCH.md).

**Core pattern to modify:**
```typescript
const lastRefreshRef = useRef<number>(0)
...
const fetchBackstop = () => {
  // route-specific JSON fetch(es): /api/cards/due | /api/cards | /api/activity+/api/stats
  ...
}
...
if (now - lastRefreshRef.current < COALESCE_MS) return
router.refresh()      // stays UNCONDITIONAL — do not gate
fetchBackstop()        // GATE THIS — wrap body in version check
```

**New pattern to add:** a `useRef<string | null>` (e.g. `lastVersionRef`) seeded via a mount-time `useEffect` that fetches `/api/version` once (per RESEARCH.md Pitfall 2 — root layout can't block on DB read per LAYOUT-01, so seed client-side post-hydration). Inside `fetchBackstop()`, fetch `/api/version` first, compare to `lastVersionRef.current`; skip the route-specific payload fetch(es) when unchanged; update the ref either way.

**Doc comment convention:** this file already has extensive block comments explaining the Next.js 16.2.1 bug workaround (lines ~60, ~92-93, ~147, ~155-158) — follow the same style when documenting the new version-gate logic (explain WHY the gate exists, not just what it does), and preserve the existing `router.refresh()` unconditional-and-untouched comment/behavior.

---

### `e2e/helpers/mutate.ts` (test utility, event-driven simulation)

**Analog:** same file's `createForwardReferenceAndRelinkDirect()`, lines 220-251 — the established precedent for "simulate a real invalidation side-effect after a raw Prisma write":
```typescript
export async function createForwardReferenceAndRelinkDirect(): Promise<void> {
  ...raw Prisma write(s)...
  const { relinkAllDependencies } = await import('../../lib/relink-dependencies')
  await relinkAllDependencies()
}
```

**Pattern to copy into the 3 target functions** (`flipOneReviewDueStateDirect`, `createMutationCardDirect`, `promoteOneReviewToMasteredDirect`, lines 74, 96, 122): after each function's raw Prisma write, add a dynamic-import call to bump `dataVersion` — mirroring the dynamic-`import()`-inside-function-body style (NOT a static top-of-file import — this file's header comment documents an ESM/`import.meta` hazard for the generated Prisma client under a Playwright worker's dynamic import, the same hazard documented in `lib/relink-dependencies.ts`):
```typescript
const { bumpDataVersion } = await import('../../lib/settings')
await bumpDataVersion()
```
(Verify at implementation time whether `lib/settings.ts` transitively hits the same import hazard as `lib/relink-dependencies.ts` — RESEARCH.md Assumption A3 flags this as unconfirmed/medium-risk; if it does, fall back to an inline `prisma.setting.upsert(...)` write using this file's own `getTestPrisma()` helper instead of importing `lib/settings.ts`.)

**Existing `getTestPrisma()` helper convention** (referenced throughout file, e.g. inside `flipOneReviewDueStateDirect`) — the 3 `*Direct` functions already obtain a Prisma client this way; reuse the same client instance for the version-bump write to stay in the same subprocess/connection.

---

### `tests/version-route.test.ts` (test, integration)

**Analog:** `tests/review-route.test.ts` (partial, setup section read this session) — the established real-DB Vitest integration pattern:
- Spins up a temp SQLite file via `mkdtempSync`
- Applies real `prisma/schema.prisma` DDL via `prisma migrate diff --from-empty --to-schema ... --script` + `@libsql/client.executeMultiple()`
- Dynamic-`import()`s the real unmodified route handler
- Invokes it directly (no mocking)

**Structure to replicate:** setup/teardown boilerplate identical to `tests/review-route.test.ts`; new test cases per RESEARCH.md's Phase Requirements → Test Map:
1. `GET /api/version` value changes after `runSync()` completes
2. `GET /api/version` value changes after `POST /api/review` writes
3. Version does NOT change on an unrelated Setting write (e.g. `sessionSize`) or card CRUD — check `tests/study-cache.test.ts` for the exact "reviews don't bump studyCacheVersion" regression-guard style before writing this negative-case test (same repo already has this pattern for `studyCacheVersion`).

## Shared Patterns

### Setting-table opaque-token change-detection
**Source:** `lib/settings.ts:bumpStudyCacheVersion()` (lines 310-317) + its call sites in `lib/sync.ts` and `lib/relink-dependencies.ts`
**Apply to:** `lib/settings.ts` (new `bumpDataVersion`/`getDataVersion`), `lib/sync.ts` (bump call), `app/api/review/route.ts` (tx-scoped bump)
```typescript
await prisma.setting.upsert({
  where: { key: KEY },
  create: { key: KEY, value: token },
  update: { value: token },
})
```
This is THE pattern for this entire phase — do not introduce raw SQL increments or a new caching library (see RESEARCH.md Don't Hand-Roll / Anti-Patterns).

### Non-fatal try/catch logging for post-write invalidation
**Source:** `lib/sync.ts:377-394` (existing `bumpStudyCacheVersion()` try/catch)
**Apply to:** the new `bumpDataVersion()` call in `runSync()`
```typescript
try {
  await bumpXxx()
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : 'Unknown error'
  console.warn('[context] xxx bump failed (non-fatal — ...):', msg)
}
```

### Sentinel-error transaction pattern
**Source:** `app/api/review/route.ts` (`CardReviewNotFoundError`, `StaleReviewError` classes + catch block)
**Apply to:** No new sentinel needed for the version bump — it's additive inside the existing transaction and doesn't introduce a new failure mode; just ensure the new `tx.setting.upsert` call sits inside the existing try/transaction scope so it inherits the existing rollback-on-throw semantics.

### Auth gating — no action needed
**Source:** `middleware.ts` matcher (full file read in RESEARCH.md)
**Apply to:** `app/api/version/route.ts` — automatically covered, no middleware edit required.

## No Analog Found

None — every file in scope has a strong, directly-precedented analog already in the codebase (this phase is explicitly framed in RESEARCH.md as "narrowing existing infrastructure," not building new patterns).

## Metadata

**Analog search scope:** `app/api/**`, `lib/settings.ts`, `lib/sync.ts`, `components/FreshnessWatcher.tsx`, `e2e/helpers/mutate.ts`, `tests/review-route.test.ts`, `tests/study-cache.test.ts`
**Files scanned:** 7 target files + their exact analogs (all read directly, not inferred — RESEARCH.md's "Sources" section already lists full-file reads for all of these)
**Pattern extraction date:** 2026-08-08
