# Phase 33: Version-Gated Freshness Backstop - Research

**Researched:** 2026-08-08
**Domain:** Next.js 16 client-side freshness backstop narrowing; Prisma/Turso Setting-table versioning
**Confidence:** HIGH (entirely in-repo investigation; no new external libraries)

## Summary

This phase narrows an existing, deliberately-kept-in-place backstop (`components/FreshnessWatcher.tsx`) rather than building something new. The backstop today does **two things** on every "boundary event" (tab resume, back/forward nav, bfcache restore): (1) an unconditional `router.refresh()`, and (2) an unconditional route-scoped JSON re-fetch of the full payload (`/api/cards/due`, `/api/cards`, or `/api/activity`+`/api/stats` depending on the current route). VERS-01/VERS-02 add a cheap `GET /api/version` counter (a `Setting`-table row, no schema change) and gate **only the JSON re-fetch** behind "has the counter moved since I last checked" — `router.refresh()` stays unconditional, because it is documented as the sole reliable delivery path for `/` and defense-in-depth for the other routes, and every existing freshness e2e test asserts on its RSC-fetch evidence unconditionally.

The single highest-risk finding in this research: **all four `e2e/freshness-*.spec.ts` files simulate "the server changed" via `e2e/helpers/mutate.ts` functions that write directly through Prisma in a subprocess (`flipOneReviewDueStateDirect`, `createMutationCardDirect`, `promoteOneReviewToMasteredDirect`) — they never call `POST /api/sync` or `POST /api/review`.** If the new version counter only advances inside those two real route handlers (as VERS-01 specifies), these direct-Prisma test mutations will **not** move the counter, the gated backstop will never fire in any existing freshness spec, and the specs will either (a) silently pass vacuously (masking that the merge-not-clobber logic they exist to prove is no longer exercised) or (b) become flaky (since `router.refresh()` alone is the exact mechanism the backstop was added to work around a real Next.js 16.2.1 flake in). The plan must update `e2e/helpers/mutate.ts`'s three `*Direct` functions to also bump the new version Setting — mirroring the exact precedent already in this file (`createForwardReferenceAndRelinkDirect` explicitly calls `relinkAllDependencies()` after a raw Prisma write specifically to simulate the real invalidation path a production write would trigger). One specific test section (`e2e/freshness-fresh-paths.spec.ts` lines ~226-288, the "Upsert-not-replace extension") needs an *additional* version-bump call inserted immediately before its `simulateResume` trigger, because by that point in the test no DB write has happened since the client's last real page render already reflects the mutated state — full detail in Pitfall 1 below.

**Primary recommendation:** Add a `dataVersion` Setting key holding a `Date.now()`-derived string token (never a raw-SQL `value = value + 1` increment), written via plain `prisma.setting.upsert()` at the exact call site `bumpStudyCacheVersion()` already uses in `lib/sync.ts:runSync()`, and via `tx.setting.upsert()` inside `POST /api/review`'s existing `prisma.$transaction()` block. Add `GET /api/version` (thin Route Handler, no new lib module strictly required, though a `getDataVersion()`/`bumpDataVersion()` pair in `lib/settings.ts` matches every other Setting accessor in that file). In `FreshnessWatcher.tsx`, keep `router.refresh()` unconditional; wrap only the existing `fetchBackstop()` body in a version check (fetch `/api/version`, compare against a `useRef`-held last-known value, skip the route-specific JSON fetch(es) when unchanged, update the ref either way).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monotonic version counter storage | Database / Storage | — | Lives in existing `Setting` table (no schema change); single source of truth for "has anything changed" |
| Version bump on write | API / Backend | — | `POST /api/sync` (via `runSync()`) and `POST /api/review` are the only two write paths in scope per VERS-01; both are Route Handlers / server-only `lib/` code |
| `GET /api/version` endpoint | API / Backend | — | New lightweight Route Handler, auth-gated by existing `middleware.ts` matcher (no middleware change needed) |
| Version-gated backstop fetch decision | Browser / Client | — | `FreshnessWatcher.tsx`'s `fetchBackstop()`, a `'use client'` component already owning this logic |
| RSC re-fetch (`router.refresh()`) | Frontend Server (SSR) | Browser / Client | Unchanged — stays unconditional; Next.js Router Cache invalidation is orthogonal to the JSON backstop being narrowed |
| e2e simulation of "server changed" | Test harness (out-of-band) | — | `e2e/helpers/mutate.ts`'s `*Direct` functions bypass the API layer entirely (direct Prisma in a `tsx` subprocess) — must be updated to also bump the version, mirroring the existing `createForwardReferenceAndRelinkDirect` precedent |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VERS-01 | `/api/version` returns a monotonic counter bumped by sync completion and review writes | Exact call sites identified: `lib/sync.ts:runSync()` (same spot as `bumpStudyCacheVersion()`, line 387) and `app/api/review/route.ts`'s `prisma.$transaction()` block (line 80-104). Recommended implementation: `Date.now()`-derived string token via plain `upsert`, not a raw-SQL increment — see Pitfall 3 |
| VERS-02 | The `FreshnessWatcher` JSON backstop re-fetches full payloads only when the version counter has changed since the cache was built — the backstop itself is not removed | `FreshnessWatcher.tsx`'s `fetchBackstop()` (lines 93-149) identified as the exact function to gate; `router.refresh()` (lines 151-159) must stay unconditional. Existing e2e specs read in full — see Pitfall 1 for the breaking-test risk this surfaces |

## Standard Stack

No new packages. This phase is a pure in-repo architecture change using the existing stack:

| Component | Already in repo | Role in this phase |
|-----------|-----------------|---------------------|
| Prisma 7 + `@prisma/adapter-libsql` | Yes | `Setting.value` upsert for the new `dataVersion` key |
| Next.js 16.2.1 Route Handlers | Yes | New `GET /api/version` route |
| `crypto.randomUUID()` (Web Crypto, no package) | Yes (used by `bumpStudyCacheVersion`) | Not needed here — `Date.now()` alone is sufficient since inequality, not uniqueness, is what the client checks |

## Package Legitimacy Audit

Not applicable — this phase installs no new packages.

## Architecture Patterns

### System Architecture Diagram

```text
 Write paths (only these two bump dataVersion):
   POST /api/sync ──▶ runSync() ──▶ [existing bumpStudyCacheVersion() call site]
                                     │
                                     └──▶ NEW: bumpDataVersion()  ──▶ Setting{key:'dataVersion', value:'<Date.now()>'}
   POST /api/review ──▶ prisma.$transaction(tx => {
                            tx.cardReview.updateMany(...)
                            tx.reviewLog.create(...)
                            NEW: tx.setting.upsert(dataVersion)  ──▶ same Setting row, same tx (atomic w/ the review write)
                          })

 Read path (every boundary event, client-side):
   visibilitychange(hidden→visible) / popstate / pageshow(persisted)
        │  (COALESCE_MS = 300, unchanged)
        ▼
   refresh() in FreshnessWatcher.tsx
        ├──▶ router.refresh()          [UNCHANGED — unconditional, RSC payload re-fetch]
        └──▶ fetchBackstop()           [MODIFIED — now version-gated]
                │
                ▼
             GET /api/version  ──▶ { version: "<Date.now()-token>" }
                │
                ▼
             compare to lastVersionRef.current
                │
        ┌───────┴────────┐
        │ unchanged        │ changed
        ▼                  ▼
      (skip)         existing route-specific fetch:
                      /api/cards/due  |  /api/cards  |  /api/activity + /api/stats
                        │
                        ▼
                      setPayloads(...) → useFreshPayload() context → StudyClient/CardsClient/HomeClient/HabitsClient
```

### Recommended Project Structure

No new files strictly required beyond the route handler; changes land in existing files:

```
app/api/version/route.ts      # NEW — thin GET handler
lib/settings.ts                # ADD getDataVersion()/bumpDataVersion(), mirroring bumpStudyCacheVersion()
lib/sync.ts                    # ADD bumpDataVersion() call alongside the existing bumpStudyCacheVersion() call (~line 387)
app/api/review/route.ts        # ADD tx.setting.upsert(...) inside the existing $transaction block
components/FreshnessWatcher.tsx # MODIFY fetchBackstop() to check version first
e2e/helpers/mutate.ts          # MODIFY the 3 *Direct mutation functions to also bump dataVersion (see Pitfall 1)
e2e/freshness-fresh-paths.spec.ts # MODIFY: insert one more version-advancing call before the "Upsert-not-replace extension" simulateResume trigger (see Pitfall 1)
```

### Pattern 1: Opaque, upsert-only change token (not a read-modify-write counter)

**What:** `lib/settings.ts:bumpStudyCacheVersion()` is the direct precedent already in this codebase for exactly this problem (Phase 32, STUDY-03). It deliberately does **not** read-then-increment; it writes `${Date.now()}-${randomSuffix}` via a bare `prisma.setting.upsert()` and documents why: two concurrent bumps (e.g. a sync and a relink landing in the same request) can never lose a change to a lost-update race, because whichever upsert lands last simply wins, and any caller-held stale token still compares unequal to it.

**When to use:** Any "has something changed since I last checked" signal backed by a `String`-typed Setting column, where the consumer only ever needs inequality/ordering, not an exact delta count.

**Example (existing code, verbatim — this is the pattern to replicate for `dataVersion`):**
```typescript
// Source: lib/settings.ts:310-318 (read this session)
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

**Divergence for `dataVersion`:** VERS-01's success criterion literally says "monotonic counter" and Phase 34's LOCAL-02 will consume this same value for cache-key comparisons across app restarts (a colder, longer-lived comparison than `studyCacheVersion`'s in-process cache). A **plain `Date.now()`** (no random suffix) is the better choice here specifically because:
- It is genuinely monotonically non-decreasing across the app's real write cadence (writes are seconds-to-minutes apart in this single-user personal app — sync is at most 1x/day via cron plus occasional manual triggers; reviews are human-paced), unlike `studyCacheVersion`'s random-suffixed token which is correct for *inequality* comparison but reads oddly as a "counter."
- It gives the client (and Phase 34's IndexedDB cache) a numerically comparable value (`newVersion > cachedVersion`), which is a strictly stronger and more useful contract for a public-facing endpoint than `bumpStudyCacheVersion()`'s purely-internal inequality token.
- No random suffix is needed to avoid a lost-update race: the race `bumpStudyCacheVersion()`'s comment describes (two concurrent bumps) is solved by the *upsert*, not by the random suffix — the suffix only exists there to avoid two different Date.now() calls in the same millisecond looking identical, which does not matter for this use case since the client only checks `!==`/`>`, never uniqueness.

### Pattern 2: Server-side transaction-scoped Setting write

**What:** `POST /api/review`'s existing `prisma.$transaction(async (tx) => {...})` block (read this session, `app/api/review/route.ts:80-104`) already establishes the pattern of writing multiple rows atomically — `CardReview.updateMany` (optimistic-concurrency guarded) + `ReviewLog.create` land together or neither does. Adding `tx.setting.upsert({ where: { key: 'dataVersion' }, ... })` inside this same block means the version bump is atomic with the actual review write: if the transaction rolls back (e.g. the `StaleReviewError` / idempotency-retry paths at lines 92-93 and 149-165), the version is correctly **not** bumped for a no-op retry.

**When to use:** Any write inside `POST /api/review` that should count as "the data actually changed."

**Example:**
```typescript
// Source: app/api/review/route.ts:80-104 (read this session) — insertion point
const review = await prisma.$transaction(async (tx) => {
  const cardReview = await tx.cardReview.findUnique({ where: { cardId } })
  if (!cardReview) throw new CardReviewNotFoundError()

  const updated = reviewCard(cardReview, rating)
  const { count } = await tx.cardReview.updateMany({
    where: { cardId, reps: cardReview.reps, lastReview: cardReview.lastReview },
    data: updated,
  })
  if (count === 0) throw new StaleReviewError()

  await tx.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } })
  // NEW: bump inside the same tx — rolls back together with everything above
  // await tx.setting.upsert({ where: { key: 'dataVersion' }, create: {...}, update: {...} })

  return tx.cardReview.findUniqueOrThrow({ where: { cardId } })
})
```

Note: this means the idempotency-retry path (the `isUniqueConstraintError`/P2002 branch at lines 149-165, which re-reads and returns 200 without re-running the transaction body) correctly does **not** double-bump the version — the retry never re-enters the transaction body.

### Anti-Patterns to Avoid

- **Gating `router.refresh()` itself:** Every existing freshness e2e test asserts `newFetches.length > 0` (or `toHaveLength(1)`) as network evidence that a boundary-triggered RSC/document fetch occurred, and this is checked unconditionally after every test's mutation+trigger sequence. `router.refresh()` is the mechanism producing that fetch. If it were gated too, and the e2e mutation helpers don't reliably bump the version (see Pitfall 1), every existing freshness spec would break. Keep `router.refresh()` exactly as unconditional as it is today; gate only the JSON backstop.
- **Raw SQL `UPDATE Setting SET value = value + 1`:** Technically possible (SQLite/libSQL's default single-writer serialized model makes a single `UPDATE` statement atomic today — see Sources), but requires `prisma.$executeRaw` with integer casting on a `String` column, bypasses the `upsert`-only pattern every other Setting write in this codebase follows, and needs special-case handling for the row-doesn't-exist-yet case (first-ever bump). No correctness benefit over the `Date.now()` token for a change-detection consumer that never needs an exact count. Do not introduce raw SQL here.
- **Bumping the version on card CRUD (`POST/PUT/DELETE /api/cards/[id]`):** VERS-01 explicitly scopes the trigger to "sync completion and review writes" only. Manual card edits are user-initiated on the current device and are already reflected via `CardsClient.tsx`'s existing optimistic local-state update (the "device-originated writes ... update the cache in the same code path as the optimistic UI update" pattern referenced in `.claude/CLAUDE.md`'s LOCAL-03 constraint for the *next* phase) — the backstop exists to catch changes from *other* origins (cron sync, another tab/device), not to duplicate the current device's own optimistic update. Do not add a third bump call site.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| "Has anything changed" signal | A new caching library, ETags, or a `Last-Modified` header scheme | The existing `Setting`-table opaque-token pattern (`bumpStudyCacheVersion` precedent) | Already proven in this exact codebase for an almost identical problem (Phase 32, STUDY-03); zero new infra, no schema change, same DB round-trip cost as any other Setting read |
| Atomic increment on a String column | Raw SQL cast-and-increment | `Date.now()`-derived token + upsert | See Anti-Patterns above — no correctness win, adds raw-SQL surface area |

**Key insight:** This phase's "don't hand-roll" risk isn't a missing library — it's re-inventing a pattern the codebase already solved one phase ago (`bumpStudyCacheVersion`). Reuse the shape, adjust only the token format (plain `Date.now()`, no random suffix) for the reasons in Pattern 1.

## Common Pitfalls

### Pitfall 1: Existing freshness e2e specs simulate server changes by bypassing the app's write routes entirely — gating the backstop by version will silently defang or flake them unless the test mutators are updated too

**What goes wrong:** `e2e/helpers/mutate.ts` exports `flipOneReviewDueState`, `createMutationCard`, and `promoteOneReviewToMastered` — every one of the 4 freshness spec files (`freshness-client-shell.spec.ts`, `freshness-router-cache.spec.ts`, `freshness-fresh-paths.spec.ts`, `freshness-gate.spec.ts`) uses these as its "the server changed" step before triggering a boundary event. Each of these functions spawns a `tsx` subprocess that writes **directly through Prisma** (`flipOneReviewDueStateDirect` updates `CardReview.nextReview`; `createMutationCardDirect` calls `prisma.card.create`; `promoteOneReviewToMasteredDirect` updates `CardReview.state`/`scheduledDays`) — none of them calls `POST /api/sync` or `POST /api/review`. If the new `dataVersion` counter only advances inside those two real route handlers (as VERS-01 specifies), these test mutations will never move the counter. Once the backstop's JSON fetch is gated on "has the version changed," it will never fire in any of these tests.

Two distinct failure modes result:
1. **Silent vacuity** (most tests): the DOM-correctness assertions in these specs (e.g. `expect.poll(() => cfg.read(page)).toBe(expected)`) currently pass because of a *combination* of `router.refresh()` (unconditional, unaffected by this phase) and the backstop's redundant JSON delivery. Since `router.refresh()` alone already delivers correct data most of the time (the underlying Next.js 16.2.1 flake is intermittent, not deterministic — see `components/FreshnessWatcher.tsx`'s own doc comment and the STATE.md blocker: "Do NOT delete the FreshnessWatcher backstop. It works around a real, unfixed Next.js 16.2.1 Suspense/Segment-Cache bug"), these tests will likely keep passing in CI most runs — but they are no longer proving what they claim to prove, and they lose the specific redundancy that was added to cover the flake. This is a real regression in test guarantee strength even though the test stays green.
2. **A specific test that becomes genuinely broken, not just weakened:** `e2e/freshness-fresh-paths.spec.ts`'s `/cards post-mutation-return` test (~line 201-288, the "Upsert-not-replace extension" section added in Phase 31) intercepts the backstop's own `/api/cards` no-cursor call and forces it to return an empty page, then triggers `simulateResume` and asserts the already-loaded card rows were **not** truncated (proving upsert-not-replace merge behavior). This section's only preceding DB mutation is `createMutationCard()` at line 211 — called *before* a real `<Link>` navigation to `/cards` (line 213) that causes a full RSC remount. By the time execution reaches the interception setup and `simulateResume` trigger (line 278), the client's most-recently-rendered state (and, under this phase's design, its last-known `/api/version` baseline) **already reflects** the mutated DB state — nothing has changed *since* that render. Under version gating, the backstop correctly determines "nothing new" and skips the fetch entirely, meaning the mocked `/api/cards` interception is never hit. The assertion `loadedAfter === loadedBefore` still numerically passes (trivially — nothing happened either way), but the test no longer exercises the merge-not-replace code path it exists to guard. This is the sharpest case of vacuity and needs an explicit fix, not just a note.

**Why it happens:** The e2e harness's `*Direct` mutators exist specifically to simulate "a change happened on the server, outside this session/tab" cheaply (no HTTP round trip, no auth, direct DB access via a `tsx` subprocess — documented rationale in `e2e/helpers/mutate.ts`'s file-header comment). They were written before VERS-01/02 existed and have no reason to know about a version counter that didn't exist yet.

**How to avoid:** The plan must include a task that:
1. Updates `flipOneReviewDueStateDirect`, `createMutationCardDirect`, and `promoteOneReviewToMasteredDirect` in `e2e/helpers/mutate.ts` to also write the new `dataVersion` Setting row (a plain `prisma.setting.upsert({ where: { key: 'dataVersion' }, ... value: String(Date.now()) ... })` call, or an imported `bumpDataVersion()` from `lib/settings.ts` if that module is importable from the subprocess context — check whether `lib/settings.ts` transitively imports the ESM-only generated Prisma client the same way `lib/prisma.ts` does, since this file's header comment documents that exact import hazard for `lib/relink-dependencies.ts`; if so, mirror the existing dynamic-`import()`-inside-function-body pattern used by `createForwardReferenceAndRelinkDirect`, not a static top-of-file import). This exactly mirrors the already-established precedent: `createForwardReferenceAndRelinkDirect` (lines 220-251) explicitly calls the real `relinkAllDependencies()` after a raw Prisma write, specifically to simulate what a production write path would trigger.
2. Adds one more version-advancing call (e.g. another `createMutationCard()`, or a dedicated lightweight `bumpDataVersionOnly()` test helper) immediately before the `simulateResume` trigger inside `freshness-fresh-paths.spec.ts`'s "Upsert-not-replace extension" section (~line 277), so the gate is genuinely open when that section's mocked interception is meant to be exercised.
3. Re-runs all 4 `e2e/freshness-*.spec.ts` files after implementation and confirms (not assumes) each backstop-touching assertion still exercises the gated code path — not just that the suite stays green.

**Warning signs:** A green `e2e/freshness-*` suite immediately after implementing VERS-02 is *not* sufficient proof of correctness given the above — verify by temporarily reverting the gate (or adding a console log / counting `/api/cards`-no-cursor requests) to confirm the backstop fetch actually fires in each test that's supposed to exercise it.

### Pitfall 2: The version check's own "baseline" is undefined at first mount, because `FreshnessWatcher` is mounted in the root layout, and `RootLayout` is constrained (LAYOUT-01) to never block on a DB read

**What goes wrong:** `app/layout.tsx` renders synchronously with no `await` DB read (Phase 30's LAYOUT-01 requirement, already shipped). `FreshnessWatcher` is mounted there, wrapping the whole app. It has no server-supplied initial version to compare against on the very first boundary event of a session — unlike `StudyClient`/`CardsClient`/`HomeClient`, which receive real initial data as RSC props from their own page-level `async` Server Components (a pattern LAYOUT-01 deliberately does not apply to the layout itself).

**Why it happens:** The version-gating logic needs *some* "last known version" to diff against, and the natural place to seed it (root layout SSR) is exactly the place LAYOUT-01 forbids a blocking DB read.

**How to avoid:** Seed the baseline client-side, not server-side: on `FreshnessWatcher`'s mount `useEffect` (not blocking first paint — this fires after hydration), issue one `fetch('/api/version')` and store the result in a `useRef`. This is a genuinely new, small network request per page load, additional to what exists today — acceptable given (a) it is tiny (a single Setting-row read, comparable cost to any of the other cheap GETs already firing on mount, e.g. `useWordTap`'s gloss cache checks) and (b) it directly delivers the "one small version request" language of VERS-02's success criterion 2. Until this first check resolves, treat the ref as unset and either (a) skip the backstop entirely for a boundary event that fires before the baseline is known (matching "assume the just-rendered RSC payload is fresh," consistent with every other route's RSC-hydration-is-truth pattern in this codebase), or (b) fall back to always fetching the backstop payload for that one first check (safer, matches today's unconditional behavior until a baseline exists). Recommend (a) for simplicity and because a boundary event firing within the first render tick is not a realistic scenario (`visibilitychange`/`popstate`/`pageshow` all require the tab to have already been interacted with once).

**Warning signs:** A resume/back-forward that happens extremely early in a fresh page load (e.g. an e2e test that triggers `simulateResume` immediately after `page.goto()` with no intervening `waitForLoadState('networkidle')`) could race the baseline-seeding fetch. None of the existing freshness specs do this — they all call `page.waitForLoadState('networkidle')` before triggering the first mutation+boundary-event pair — but a future test added without that wait could expose the race.

### Pitfall 3: `Setting.value` is a plain `String` column — there is no schema-level way to get Prisma's native atomic `increment` operator

**What goes wrong:** Reaching for `prisma.setting.update({ data: { value: { increment: 1 } } })` (Prisma's normal atomic-increment API) does not compile/work here — that operator only exists for `Int`/`Float`-typed fields, and `Setting.value` (confirmed by reading `prisma/schema.prisma:156-159` this session: `model Setting { key String @id; value String }`) is a `String`. A naive read-modify-write (`findUnique` → `parseInt` → `+1` → `update`) reintroduces exactly the lost-update race `bumpStudyCacheVersion()`'s doc comment explicitly rejected for this same table.

**Why it happens:** VERS-01's "monotonic counter" phrasing reads like it wants integer-increment semantics, but the constraint "no `prisma/schema.prisma` change" rules out adding a real `Int` column, and the existing precedent in this exact file already solved the adjacent problem with a token, not a counter.

**How to avoid:** Use the `Date.now()`-derived string token described in Pattern 1 above. It satisfies "monotonic" (non-decreasing over real wall-clock time) without needing atomic arithmetic on a String column, and reuses the exact `prisma.setting.upsert()` call shape every other Setting write in this codebase already uses.

**Warning signs:** If a future contributor "fixes" this by switching to `prisma.$executeRaw` for a true increment, watch for: (a) the row-doesn't-exist-yet case (first bump ever) needing a separate `INSERT ... ON CONFLICT` path, since raw `UPDATE` on a non-existent row is a silent no-op, and (b) Turso's standard (non-preview) mode is single-writer serialized SQLite — confirmed via web search this session — so a raw `UPDATE ... SET value = value + 1` *would* be safe today, but only because of that serialization guarantee, which is a platform detail this app should not need to depend on for a problem the token approach solves without depending on it at all.

## Code Examples

### Existing precedent: exact bump call site inside `runSync()`

```typescript
// Source: lib/sync.ts:377-394 (read this session) — the new dataVersion bump
// should sit right alongside this, same unconditional-at-end-of-function timing.
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
`runSync()` is called by **both** `POST /api/sync` (manual) and `GET /api/cron/sync` (daily cron) — confirmed by reading both route files this session (`app/api/sync/route.ts:16`, `app/api/cron/sync/route.ts:20`). A single bump call here, following this exact pattern (unconditional, try/catch-non-fatal, logged not thrown), covers "sync completion" for both triggers without touching either route file.

### `GET /api/version` — minimal shape, matching sibling GET routes

```typescript
// Pattern reference: app/api/lessons/route.ts (read this session, full file) —
// the simplest existing GET route: no query params, one Prisma read, plain
// NextResponse.json(). /api/version should follow the same shape, reading the
// new getDataVersion() from lib/settings.ts instead of prisma.lesson.findMany().
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  return NextResponse.json({ version })
}
```
No `middleware.ts` change needed — its matcher (`'/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-icon.*\\.png).*)'`, read this session) already protects everything under `/api/` except the explicitly excluded paths, so `/api/version` is auth-gated automatically like every other API route. No sibling GET route in this codebase declares `export const dynamic = 'force-dynamic'` (checked `/api/lessons`, `/api/stats`, `/api/activity` this session) — Route Handlers reading Prisma are dynamic by default in this app; no explicit directive needed for `/api/version` either.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `FreshnessWatcher.fetchBackstop()` unconditionally re-fetches the full route payload on every boundary event | Version-checked: `GET /api/version` first, full payload only if changed | This phase (VERS-02) | The common "nothing changed" case (the vast majority of resumes/back-forward navigations, per the phase description) drops from a full `/api/cards/due` / `/api/cards` / `/api/activity`+`/api/stats` fetch to one tiny Setting-row read |

**Not deprecated:** `router.refresh()`'s unconditional firing, and the backstop's existence in general — both stay, per the phase's explicit "narrowing only" framing and the STATE.md blocker note that the underlying Next.js 16.2.1 Suspense/Segment-Cache bug is real and unfixed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `Date.now()`-derived token (no random suffix) is the better choice for `dataVersion` vs. `bumpStudyCacheVersion()`'s `Date.now()+randomSuffix` shape, on the reasoning that the client needs numeric comparability | Pattern 1 | Low — either format satisfies "changed since last check"; if the planner prefers exact parity with `bumpStudyCacheVersion()`'s shape for consistency, the random-suffix variant works too, it just can't be parsed as a plain number by a future Phase 34 numeric comparison without stripping the suffix first |
| A2 | Version bump for `POST /api/review` should sit inside the existing `$transaction` block (atomic with the review write) rather than after it | Pattern 2 | Low-medium — if done after the transaction instead, a version bump could land for a request that later fails to commit for an unrelated reason between the transaction resolving and the bump call, though in practice the transaction's `return` already implies success by that point; inside-transaction is strictly safer and no harder to implement |
| A3 | The e2e `*Direct` mutation functions can safely call `lib/settings.ts`'s exported bump function directly (vs. needing their own inline raw Prisma write) without hitting the ESM/`import.meta` hazard documented for `lib/relink-dependencies.ts` | Pitfall 1 | Medium — if `lib/settings.ts` turns out to also transitively import the generated Prisma client in a way that breaks under a Playwright worker's dynamic import (unconfirmed this session — only `lib/prisma.ts` and `lib/relink-dependencies.ts` were confirmed to have this hazard), the same dynamic-import-inside-function-body workaround already used for `relinkAllDependencies()` applies identically; this is a mechanical detail to verify at implementation time, not a design risk |

## Open Questions (RESOLVED)

Both questions below were resolved at planning time; each recommendation is carried into
`33-01-PLAN.md` as a concrete task instruction and an enforceable acceptance criterion.

1. **Should `GET /api/version`'s response shape anticipate Phase 34's LOCAL-02 consumer, or should Phase 34 adapt to whatever this phase ships?** ✓ RESOLVED
   - What we know: `REQUIREMENTS.md` LOCAL-02 (Phase 34, not in scope here) explicitly says "Cache entries are version-checked against `/api/version` (never TTL-based)" — meaning this phase's endpoint gets a second consumer one phase later.
   - What's unclear: Whether Phase 34's IndexedDB cache-key comparison needs anything beyond a bare `{ version: string }` (e.g. per-route versions, or a single global version). Nothing in Phase 33's scope requires per-route granularity — a single global `dataVersion` is sufficient for VERS-01/02 as written.
   - Recommendation: Ship the simplest global-counter shape now (`{ version: string }`, one Setting key). If Phase 34's research later determines it needs finer granularity, that is a Phase 34 concern to solve without a Phase 33 schema change (the Setting-table pattern used here composes fine with adding more keys later).
   - ✓ **RESOLVED — recommendation adopted.** `33-01-PLAN.md` Task 1 ships the bare global `{ version: string }` shape from `app/api/version/route.ts`, with a single `dataVersion` Setting key and a plain `String(Date.now())` token (no random suffix), so a Phase 34 numeric comparison needs no parsing. The plan records this as a `<reversibility rating="costly">` contract precisely because Phase 34's LOCAL-02 will consume it. Per-route version granularity is explicitly out of scope for Phase 33.

2. **Does the coalesce window (`COALESCE_MS = 300`) in `FreshnessWatcher.tsx` need adjustment now that a version check is interposed before the backstop fetch?** ✓ RESOLVED
   - What we know: The 300ms coalesce is applied to the whole `refresh()` function (both `router.refresh()` and `fetchBackstop()`), not per-fetch-type.
   - What's unclear: Whether adding a `GET /api/version` round trip before the conditional backstop fetch meaningfully changes the total latency profile enough to warrant retuning the coalesce window.
   - Recommendation: Leave `COALESCE_MS` unchanged initially — the coalesce exists to collapse *event bursts* (e.g. popstate immediately followed by visibilitychange), not to bound total fetch latency, and a version check is materially cheaper than the payload fetch it may or may not gate. Revisit only if the human-verification pass in execution surfaces a perceptible added delay.
   - ✓ **RESOLVED — recommendation adopted and enforced.** `33-01-PLAN.md` Task 1 states "`COALESCE_MS` stays 300" and locks it with the acceptance criterion `grep -c 'COALESCE_MS = 300' components/FreshnessWatcher.tsx` returns 1, so an unintended retune fails the task rather than landing silently. Retuning remains available as a follow-up if execution-time verification surfaces perceptible added delay.

## Environment Availability

Not applicable — no new external dependency, service, or CLI tool is introduced by this phase. All work is within the existing Next.js/Prisma/Turso stack already running locally and in production.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit/integration) `npm test` = `vitest run`; Playwright (e2e) `npx playwright test` against a prod-build server on port 3100 with a throwaway `file:` SQLite DB |
| Config file | `vitest.config.ts` (excludes `e2e/**`); Playwright config under `e2e/` |
| Quick run command | `npm test -- tests/settings.test.ts` (once added) or targeted `npx vitest run tests/<file>` |
| Full suite command | `npm test` (Vitest) and `npx playwright test e2e/freshness-*.spec.ts` (targeted freshness regression) |

Despite CLAUDE.md's summary line ("Vitest unit tests — pure lib functions, no DB/API needed"), this codebase's actual `tests/` directory already contains multiple **real-DB, real-route-handler** Vitest tests (confirmed by reading `tests/review-route.test.ts` this session in full): they spin up a temp SQLite file via `mkdtempSync`, apply the real `prisma/schema.prisma` DDL via `prisma migrate diff --from-empty --to-schema ... --script` + `@libsql/client.executeMultiple()`, dynamic-`import()` the real unmodified route handler, and invoke it directly. This is the established, precedented pattern for testing `POST /api/review`'s new version-bump behavior and for a new `GET /api/version` route test — not a mock.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| VERS-01 | `GET /api/version` returns a value that changes after `runSync()` completes | integration (real temp SQLite + real `runSync()`) | `npx vitest run tests/version-route.test.ts` | ❌ Wave 0 — new file, pattern from `tests/review-route.test.ts` |
| VERS-01 | `GET /api/version` returns a value that changes after `POST /api/review` writes | integration (real temp SQLite + real route handler, pattern-matches `tests/review-route.test.ts` exactly) | `npx vitest run tests/version-route.test.ts` | ❌ Wave 0 — can extend the same new file |
| VERS-01 | Version does **not** change on an unrelated Setting write (e.g. `sessionSize`) or on a card CRUD write | integration (regression lock, mirrors `tests/study-cache.test.ts`'s existing "reviews don't bump studyCacheVersion" style guard — check that file for the exact pattern before writing a new one) | `npx vitest run tests/version-route.test.ts` | ❌ Wave 0 |
| VERS-02 | Resuming with no server-side change issues a version request but not a full payload re-fetch | e2e (Playwright, network-evidence assertion) | `npx playwright test e2e/freshness-router-cache.spec.ts` (existing, needs the Pitfall 1 mutator fix first) plus a new negative-case test asserting **zero** `/api/cards/due`\|`/api/cards`\|`/api/activity` requests when nothing changed | ❌ Wave 0 — the "nothing changed" negative case does not exist in any current freshness spec (every existing test always mutates first) |
| VERS-02 | When the counter has moved, the same resume path re-fetches and the route shows new data | e2e | existing `e2e/freshness-router-cache.spec.ts`, `e2e/freshness-client-shell.spec.ts` (green only after the Pitfall 1 mutator fix) | ✅ (existing, needs update) |
| VERS-02 | `FreshnessWatcher` backstop still applies when version changed; TODO records the Next.js version tested | manual / code review | N/A — a code comment, not a runtime behavior | N/A |

### Sampling Rate
- **Per task commit:** `npm test -- tests/version-route.test.ts` (fast, no Playwright)
- **Per wave merge:** `npm test && npx playwright test e2e/freshness-*.spec.ts`
- **Phase gate:** Full `npx playwright test e2e/freshness-*.spec.ts` green before `/gsd-verify-work`, plus the new "nothing changed → zero payload fetches" negative-case e2e test passing

### Wave 0 Gaps
- [ ] `tests/version-route.test.ts` — new integration test covering VERS-01 (sync bump, review bump, non-bump on unrelated writes), following `tests/review-route.test.ts`'s temp-SQLite-file pattern
- [ ] A new e2e test (in `e2e/freshness-router-cache.spec.ts` or a new file) asserting the "nothing changed" negative case — no existing freshness spec currently exercises "boundary event fires, no mutation happened, zero payload-route fetches occur"
- [ ] `e2e/helpers/mutate.ts` — the 3 `*Direct` functions need the `dataVersion` bump added (not a new file, but a required Wave 0/1 edit before any freshness spec can be trusted post-implementation — see Pitfall 1)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | No | `GET /api/version` is a new endpoint but inherits the existing `middleware.ts` cookie-gate automatically (matcher already covers all non-excluded `/api/*` paths) — no new auth code needed or possible to get wrong here |
| V3 Session Management | No | Unchanged — this phase adds no session-related state |
| V4 Access Control | No | Single-shared-password, single-tenant app (documented in CLAUDE.md); `/api/version` exposes only an opaque counter value, no per-user or per-record data |
| V5 Input Validation | No | `GET /api/version` takes no input (no query params, no body) — nothing to validate |
| V6 Cryptography | No | No crypto involved; the version token is not a security credential |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Information disclosure via the version counter | Information Disclosure | Negligible — the counter is an opaque `Date.now()`-derived string with no semantic meaning beyond "did something change," already gated by the same auth cookie every other `/api/*` route requires. No user data, no card content, no timing-sensitive secret is exposed. |
| Denial of service via version-polling abuse | Denial of Service | Not a new risk — `/api/version` is only called from `FreshnessWatcher`'s own boundary-event handlers (rate-limited by the existing 300ms coalesce window) and once at mount; it is not client-pollable on an arbitrary interval by this phase's design. No rate limiting beyond the existing auth gate is warranted. |

This phase is security-inert: it adds a single opaque-integer read endpoint behind existing auth, with no new attack surface. No `checkpoint:human-verify` security gate is warranted specifically for this phase's own code; standard code review is sufficient.

## Sources

### Primary (HIGH confidence — read directly this session)
- `components/FreshnessWatcher.tsx` (full file) — current backstop trigger logic, payload shapes, doc comments explaining the Next.js 16.2.1 bug it works around
- `app/api/review/route.ts` (full file) — exact transaction structure for the review-write bump insertion point
- `lib/sync.ts:340-406` — exact `runSync()` bump call site and its surrounding gating logic
- `app/api/sync/route.ts`, `app/api/cron/sync/route.ts` (full files) — confirms both call `runSync()`, so one bump call site covers both triggers
- `lib/settings.ts` (full file) — every existing Setting-table getter/setter convention; `bumpStudyCacheVersion()` is the direct precedent for this phase's core pattern
- `prisma/schema.prisma:156-159` (`Setting` model) — confirms `value` is `String`, ruling out Prisma's native `increment` operator
- `e2e/freshness-client-shell.spec.ts`, `e2e/freshness-router-cache.spec.ts`, `e2e/freshness-gate.spec.ts`, `e2e/freshness-fresh-paths.spec.ts` (full files) — every assertion these specs make, and exactly which DB-mutation helper precedes each boundary-event trigger
- `e2e/helpers/mutate.ts` (full file) — confirms all e2e "server changed" simulation is direct-Prisma, never through the real API routes; documents the `createForwardReferenceAndRelinkDirect` precedent for simulating a real invalidation side-effect after a raw write
- `e2e/helpers/rsc.ts`, `e2e/helpers/resume.ts` (full files) — confirms `waitForRscFetch` matches on `rsc:1` header OR `resourceType === 'document'`, independent of the JSON backstop, which is why `router.refresh()` staying unconditional keeps all existing network-evidence assertions valid
- `middleware.ts` (full file) — confirms `/api/version` needs no middleware change to be auth-gated
- `app/api/lessons/route.ts`, `app/api/cards/route.ts` (partial) — sibling GET route conventions (no `force-dynamic` needed, plain `NextResponse.json`)
- `tests/review-route.test.ts` (partial, setup section) — the established real-DB Vitest integration-test pattern to reuse for `tests/version-route.test.ts`
- `lib/study-cache.ts` (grep + partial) — confirms this codebase already treats "version" as an opaque string compared for inequality elsewhere, reinforcing the token-not-counter recommendation
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — VERS-01/VERS-02 exact wording, and the explicit "Do NOT delete the FreshnessWatcher backstop" blocker carried from Phase 30/STATE.md

### Secondary (MEDIUM confidence)
- [Turso: "Concurrent Writes on Turso Cloud" (turso.tech/blog)](https://turso.tech/blog/concurrent-writes-on-turso-cloud) — confirms standard/production Turso today is single-writer serialized SQLite (BEGIN CONCURRENT / MVCC is an August 2026 early-preview feature, not the default), supporting the claim that a raw single-statement `UPDATE ... SET value = value + 1` would be atomic today if it were used, though this phase recommends against needing that guarantee at all

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure reuse of existing in-repo patterns
- Architecture: HIGH — every insertion point (runSync, review transaction, FreshnessWatcher.fetchBackstop) was read directly, not inferred
- Pitfalls: HIGH — the e2e-breaking risk (Pitfall 1) was discovered by reading all 4 freshness spec files and the mutate.ts helper in full, not assumed

**Research date:** 2026-08-08
**Valid until:** Stable — this is entirely in-repo architecture with no external version-drift risk; re-validate only if `FreshnessWatcher.tsx`, `e2e/helpers/mutate.ts`, or the review/sync routes change before this phase is planned/executed.
