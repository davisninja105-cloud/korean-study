# Phase 34: Local-First Shell - Research

**Researched:** 2026-08-09
**Domain:** Client-side caching (IndexedDB) for a Next.js 16 App Router PWA; stale-while-revalidate; write-through cache consistency
**Confidence:** HIGH (architecture/integration), MEDIUM (build-ID mechanics, verified against Vercel docs but not live-tested), LOW (nothing — no unverifiable claims left un-flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-00: The 5 staleness rules from `lag_remediation_plan.md` §P3.6 are binding design constraints, not suggestions**: (1) classify writes by origin — device-originated writes (reviews/edits/settings) put the phone ahead of the cache via the same code path as the optimistic UI update; the only server-originated write is the daily cron; (2) version-check, never TTL — compare against `/api/version`, refetch only on change; (3) **replace layers, don't add one** — once IndexedDB is the client's source of truth, first paint stops depending on RSC-payload freshness, which is exactly the class of bug `FreshnessWatcher`'s JSON backstop exists to work around. **If this phase's cache doesn't let the backstop shrink, it has been implemented wrong.** (4) key the cache by build ID, so a DTO shape change becomes a cold start, not a render crash; (5) ship pull-to-refresh as the manual escape hatch. Reversibility: one-way for rule 3's relationship to `FreshnessWatcher`.
- **D-00b: Do NOT delete `FreshnessWatcher`.** Narrow its JSON backstop (per rule 3) — it still guards a real, unfixed Next.js bug.
- **D-00c: No `prisma/schema.prisma` changes.** The cache lives entirely client-side in IndexedDB; nothing server-side changes shape.
- **D-01: A small, quiet indicator (not a blocking skeleton, not a toast) shows only while a background revalidation is in flight, then disappears.** Content itself doesn't flash or shift. Exact pixel/placement/copy is UI-phase territory.
- **D-02: A small persistent indicator appears while the device has no network connection**, distinguishing "you're looking at saved data" from a normal cached-but-online view. Disappears the moment connectivity returns. Distinct from D-01.
- **D-03: Pull-to-refresh extends to all 4 routes** (Home already has it; Study/Cards/Habits currently have none).
- **D-04: The four routes do NOT all mean the same thing when pulled.** Home's existing pull-to-refresh keeps its current behavior — `POST /api/sync`, "Pull to sync" copy — and must additionally write the freshly-fetched data through to the cache and bypass the version check. Study/Cards/Habits get a lighter, route-local "Pull to refresh": bypass that route's cache + version check and re-fetch only that route's own data, with **no** Google Doc sync triggered. Keep `handleSync` (Home) and a new route-local `handleRefresh` (Study/Cards/Habits) as clearly separate functions, never one parameterized function.
- **D-05: The Cards cache accumulates whatever was loaded during the session** (via Phase 31's incremental scroll-loading), not the full ~1056-card deck. No separate "cache everything" prefetch pass.

### Claude's Discretion

- Exact pixel/placement/copy for both the D-01 and D-02 indicators — belongs to `/gsd-ui-phase 34`.
- How `FreshnessWatcher`'s backstop should shrink in response to this phase's cache (D-00 rule 3) — this research resolves it below.
- IndexedDB library choice (raw `indexedDB` API vs. a small wrapper like `idb`) — this research resolves it below.
- Exact cache eviction/size-bound policy for the Cards accumulation (D-05) — treat as an implementation default unless it surfaces as a real problem.

### Deferred Ideas (OUT OF SCOPE)

- **Full-deck offline prefetch for Cards** — belongs with Phase 35 if ever wanted.
- **Offline review-taking / study sessions with no network** — explicitly Phase 35 (OFFLINE-01/02/03). This phase only guarantees *viewing* last-known data offline (LOCAL-05), not completing a graded session offline.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOCAL-01 | Home/Study/Cards/Habits render last-known cached data immediately on mount from IndexedDB, before the network request resolves | §Architecture Patterns Pattern 1 (mount-read), §Code Examples |
| LOCAL-02 | Cache entries are version-checked against `/api/version` (never TTL-based) and keyed by build ID | §Standard Stack, §Pattern 2 (build-ID keying), §Pattern 3 (version-check) |
| LOCAL-03 | Device-originated writes (reviews, card edits, settings) update the cache in the same code path as the optimistic UI update | §Pattern 4 (write-through), §Pitfall 3 (version counter does not cover edits/settings) |
| LOCAL-04 | A pull-to-refresh (or equivalent) escape hatch bypasses the cache and version check entirely | §Pattern 5 (pull-to-refresh wiring per route) |
| LOCAL-05 | With the network fully disabled, opening the app shows last-known home stats, card list, and habit data instead of an error or a blank screen | §Pattern 1, §Validation Architecture (offline test via `context.setOffline`) |

</phase_requirements>

## Summary

This phase adds one new client-side module (`lib/local-cache.ts`) and modifies the four `*Client.tsx` shells plus `FreshnessWatcher.tsx`. Every route in scope is already `force-dynamic` with a thin-RSC → `*Client.tsx` shape (`app/*/page.tsx` fetches via Prisma, passes typed DTOs as `initial*` props) — this phase does not change that RSC layer at all; it adds a client-only IndexedDB read on mount that races ahead of (and eventually supersedes) the RSC props for repeat visits. The RSC props remain exactly what they are today: the cold-start fallback for a browser with no cache yet.

The critical integration finding, verified by reading `components/FreshnessWatcher.tsx` in full this session: its JSON backstop (`fetchRoutePayload`) exists **only** as a second, Suspense-independent delivery mechanism for the same per-route JSON (`/api/cards/due`, `/api/cards`, `/api/activity`+`/api/stats`) that a Next.js 16.2.1 bug sometimes fails to apply after a `router.refresh()`. Once each `*Client.tsx` performs its own direct, Suspense-independent `fetch('/api/...')` on mount and on background revalidation — which this phase requires anyway for LOCAL-01/02 — that fetch **is** a second delivery path, structurally identical in purpose to what `fetchRoutePayload` already does. The backstop's per-route fetch logic (`/study`, `/cards`, `/habits` branches) becomes redundant and should be **deleted**, not extended; `FreshnessWatcher` keeps its `router.refresh()` half (still the only mechanism for `'/'` and still needed as defense-in-depth for the Router Cache) and its event-listener/coalesce plumbing, but sheds `FreshPayloadContext`, `useFreshPayload`, `fetchRoutePayload`, and the version-gate logic that guarded it (VERS-02) — that version-gating logic itself doesn't disappear, it *relocates* into `lib/local-cache.ts`'s own revalidation check, which every `*Client.tsx` now performs independently. This is the concrete, code-grounded answer to D-00 rule 3.

A second load-bearing finding: `getDataVersion()`/`bumpDataVersion()` — read directly from `lib/settings.ts` this session — is called from **exactly two places**: `lib/sync.ts:runSync()` and `app/api/review/route.ts`'s transaction. `PUT /api/cards/[id]` and `PUT /api/settings` do **not** bump it. This means version-check revalidation can never detect a card edit or a settings change — write-through (D-00 rule 1 / LOCAL-03) is not an optimization for those two write types, it is the *only* mechanism that keeps their caches honest. This should directly shape how the plan treats LOCAL-03: it is structurally mandatory, not best-effort.

**Primary recommendation:** Use the `idb` package (a ~1.2KB gzip promise wrapper over raw IndexedDB, by the same author who wrote the Workbox / web.dev IndexedDB guidance) rather than raw `indexedDB` callbacks or a heavier ORM like Dexie. Name the IndexedDB database itself `ks-cache-<buildId>` (obtained from a new field on the existing `GET /api/version` endpint) so a deploy that changes DTO shapes opens a fresh, empty database with zero manual comparison logic — this satisfies D-00 rule 4 for free. Keep the single global `dataVersion` counter (already used by `FreshnessWatcher`) as the one version-check value for all four routes' cache entries; scope write-through narrowly to the route that actually owns the mutated data (Study's own due-card list for reviews, Cards' own loaded groups for edits, Home+Habits' `ActivityDTO` slice for settings) rather than trying to keep every aggregate (e.g. Home's `dueCards` count) synchronously perfect — that would mean re-implementing server aggregation client-side, which is exactly the kind of hand-rolling this phase should avoid.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cache read-on-mount (LOCAL-01) | Browser / Client | — | IndexedDB is a browser-only API; must live in `*Client.tsx`, never the RSC page |
| Build-ID + version negotiation (LOCAL-02) | Browser / Client | API / Backend | Client reads `/api/version` (backend-owned counter + new buildId field); comparison logic is client-only |
| Write-through on device writes (LOCAL-03) | Browser / Client | — | Same code path as the existing optimistic UI update, which already lives client-side in `StudySession.tsx`/`CardsClient.tsx`/`SettingsClient.tsx` |
| Pull-to-refresh escape hatch (LOCAL-04) | Browser / Client | API / Backend | Gesture handling + cache bypass is client-only; the actual re-fetch still hits existing API routes |
| Offline detection (D-02) | Browser / Client | — | `navigator.onLine` + `online`/`offline` events are browser-only |
| RSC first-render fallback | Frontend Server (SSR) | — | Unchanged from today — `app/*/page.tsx` stays the cold-start data source; this phase does not touch it |
| `/api/version` buildId field | API / Backend | — | Server-only env var (`VERCEL_GIT_COMMIT_SHA`) must be read server-side; client never has direct access to it |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `idb` | 8.0.3 | Promise-based wrapper over raw `indexedDB` | Authored by Jake Archibald (Google, Workbox/service-worker tooling); the de facto standard thin wrapper referenced in MDN and web.dev IndexedDB guides; avoids hand-writing `IDBRequest`→Promise boilerplate and upgrade-transaction plumbing for 4 cache "tables" |

**Version verification:** `npm view idb version` → `8.0.3` `[VERIFIED: npm registry]` (checked live this session, 2026-08-09). Published 2025-05-07, ~23M weekly downloads, repo `github.com/jakearchibald/idb`, no `postinstall` script. `[VERIFIED: npm registry]`

### Supporting (dev-only, for testing)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | latest (checked: published 2025-11-07, ~5M weekly downloads, repo `github.com/dumbmatter/fakeIndexedDB`) | In-memory polyfill of `indexedDB` for Vitest (Node has no native IndexedDB) | Only if the plan wants unit tests for `lib/local-cache.ts`'s pure key/version logic in Vitest rather than relying solely on Playwright's real-browser IndexedDB. `[VERIFIED: npm registry]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `idb` | Raw `indexedDB` API, no dependency | Zero new deps, but every read/write is 10-20 lines of `IDBRequest` → callback → Promise boilerplate, repeated across 4 cache "tables" (home/study/cards/habits) and the write-through call sites in 3+ components. Given the project's stated preference is "no new dependencies where **reasonable**" (not absolute), and `idb` is ~1.2KB, maintained by an authoritative source, and has zero runtime dependencies of its own, the wrapper is the reasonable choice here — this is exactly the class of "small, well-known utility that avoids reinventing a browser API's ergonomics" the project already accepts elsewhere (e.g. `canvas-confetti`, `lucide-react`). |
| `idb` | `Dexie.js` | Full ORM-style query layer, schema versioning, reactive queries — all overkill for 4 flat key→JSON-blob cache entries with no querying beyond "get by route key." Adds real weight (tens of KB) for capability this phase does not need. |
| `idb` | `localforage` | Falls back to WebSQL/localStorage on old browsers — the project's target is "iOS/WebKit-only" (per `STATE.md` Blockers/Concerns), where modern IndexedDB is always present, so the fallback matrix is dead weight. |

**Installation:**
```bash
npm install idb
npm install -D fake-indexeddb   # only if Vitest unit tests are added for lib/local-cache.ts
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `idb` | npm | published 2025-05-07 (this major, package itself much older — Jake Archibald's long-running IndexedDB wrapper) | ~23.1M/wk | `github.com/jakearchibald/idb` | OK | Approved |
| `fake-indexeddb` | npm | published 2025-11-07 | ~5.1M/wk | `github.com/dumbmatter/fakeIndexedDB` | OK | Approved (dev-only, optional) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Both packages were checked via `gsd-tools query package-legitimacy check --ecosystem npm idb fake-indexeddb` (returned `OK` for both, with `postinstall: null`) and cross-confirmed with a direct `npm view idb version` / `npm view idb repository.url` call this session. `[VERIFIED: npm registry]`

## Architecture Patterns

### System Architecture Diagram

```text
                         ┌─────────────────────────────────────────┐
                         │  app/*/page.tsx  (RSC, force-dynamic)    │
                         │  Prisma fetch → initial*Props            │
                         └───────────────────┬───────────────────────┘
                                              │ SSR HTML + props
                                              ▼
┌──────────────────────────── *Client.tsx (mount) ────────────────────────────┐
│                                                                              │
│  useEffect(() => {                                                         │
│    const cached = await localCache.read(route)     ──────┐                │
│    if (cached) setState(cached.data)     // instant paint  │ IndexedDB      │
│    else setState(initialProps)           // cold-start fb  │ (ks-cache-<buildId>)│
│                                                             │                │
│    const { version, buildId } = await fetch('/api/version')│                │
│    if (buildId !== currentBuildId) { wipe old DB entries }│                │
│    if (!cached || version !== cached.dataVersion) {        │                │
│      const fresh = await fetch(routeEndpoint)     ─────────┼──> API route   │
│      setState(fresh); localCache.write(route, fresh, version)              │
│    }                                                        │                │
│  }, [])                                                     │                │
│                                                              ▼                │
│  ── background-revalidation indicator (D-01) shown only during the above ── │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                              ▲
                                              │ write-through, same code path
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
   StudySession.submitReview          CardsClient.handleSave/            SettingsClient
   (optimistic FSRS update)           handleDelete/handleAdd             (optimistic PUT)
              │                               │                               │
              └──> localCache.patchStudyCard  └──> localCache.write('cards',…)└──> localCache.patchActivity(…)

  ── Pull-to-refresh (all 4 routes) ──────────────────────────────────────────
  usePullToRefresh(handleRefresh)  →  bypasses BOTH localCache.read AND the
  version-check  →  fetch(routeEndpoint) directly  →  setState + localCache.write
  (Home's handleSync additionally triggers POST /api/sync first)

  ── FreshnessWatcher (root layout, narrowed) ────────────────────────────────
  visibilitychange / popstate / pageshow  →  router.refresh()  (RSC half, unchanged)
  [REMOVED: fetchRoutePayload / FreshPayloadContext / useFreshPayload — superseded
   by each *Client.tsx's own mount+background-revalidation fetch above]
```

### Recommended Project Structure

```
lib/
├── local-cache.ts        # new — IndexedDB read/write/clear + build-ID/version logic
components/
├── FreshnessWatcher.tsx  # narrowed — router.refresh() half only, JSON backstop removed
├── HomeClient.tsx        # + cache-read-on-mount, + write-through in checkBandUp/loadStats path
├── StudyClient.tsx       # + cache-read-on-mount, + write-through in (new) patch hook consumed by StudySession
├── CardsClient.tsx       # + cache-read-on-mount, + write-through in handleSave/handleDelete/handleAdd
├── HabitsClient.tsx      # + cache-read-on-mount
├── StudySession.tsx      # submitReview calls a passed-down onReviewCommitted(cardId, updatedCardOrNull) prop
├── CardEditor.tsx        # unchanged — CardsClient already owns the merge/write logic in handleSave
```

### Pattern 1: Cache-first mount read (LOCAL-01, LOCAL-05)

**What:** On mount, each `*Client.tsx` reads its IndexedDB entry synchronously-ish (still async — IndexedDB has no sync API — but before the network request resolves) and adopts it into state immediately if present; otherwise it renders the RSC-provided `initial*` props exactly as it does today.

**When to use:** Every one of the 4 routes, replacing the elaborate `prevInitialX`/`prevFreshX` gated-adoption dance currently used to reconcile late-arriving RSC props and backstop payloads.

**Why this satisfies react-hooks/purity:** The IndexedDB read is async and must happen inside a `useEffect`, never during render. The pattern below never calls `setState` synchronously inside the effect body — it's inside a `.then()`/`await` continuation, matching the existing codebase convention (see `FreshnessWatcher.tsx`'s own comment: "Assigned inside the `.then()` callback, never synchronously in the effect body").

```typescript
// components/HomeClient.tsx — illustrative, matches existing effect conventions
useEffect(() => {
  let cancelled = false
  localCache.read<HomeCachePayload>('home').then((cached) => {
    if (cancelled || !cached) return
    setStats(cached.data.stats)
    setActivityData(cached.data.activity)
  })
  return () => { cancelled = true }
}, [])
```

### Pattern 2: Build-ID keying via database naming (LOCAL-02, D-00 rule 4)

**What:** Rather than storing a `buildId` field inside each cache entry and comparing it on every read (extra branching, extra failure mode if the comparison is ever skipped), name the IndexedDB **database itself** `ks-cache-<buildId>`. A deploy that bumps the build ID opens a brand-new, empty database — there is no code path that can "forget" to check it, because a mismatched old database is simply never opened again.

**Where `buildId` comes from:** Extend the existing `GET /api/version/route.ts` — read in full this session, currently:
```typescript
// app/api/version/route.ts (current, verbatim) [VERIFIED: app/api/version/route.ts:1-7]
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  return NextResponse.json({ version })
}
```
to also return a `buildId` field, sourced **server-side only** from `process.env.VERCEL_GIT_COMMIT_SHA` (a Vercel *system* environment variable automatically populated on every deploy — server-side access requires no configuration or opt-in toggle; only *client-side* access via `NEXT_PUBLIC_`-prefixed inlining requires the separate "Automatically expose System Environment Variables" project setting) `[CITED: Vercel/Next.js community discussion on VERCEL_GIT_COMMIT_SHA, cross-referenced against Vercel's documented System Environment Variables list]`, falling back to a fixed local-dev constant when unset:

```typescript
// app/api/version/route.ts — proposed extension
import { NextResponse } from 'next/server'
import { getDataVersion } from '@/lib/settings'

export async function GET() {
  const version = await getDataVersion()
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev'
  return NextResponse.json({ version, buildId })
}
```

This is deliberately **not** `window.__NEXT_DATA__.buildId` (a Pages-Router-era global whose availability/shape under a pure App Router deployment on Next.js 16.2.1 could not be confirmed from official docs this session — treat any claim about it as `[ASSUMED]` and avoid depending on it) and **not** a custom `generateBuildId()` in `next.config.ts` requiring the client-exposure toggle. Reading it from the same versioned `/api/version` endpoint the app already polls keeps the surface area to one file.

**Only consumer of `GET /api/version` today** (grepped this session across the whole repo, zero other matches): `components/FreshnessWatcher.tsx` and `e2e/freshness-version-gate.spec.ts`. Both only read `.version`; adding `.buildId` is additive and non-breaking. `[VERIFIED: grep across repo this session — components/FreshnessWatcher.tsx, lib/settings.ts (comment reference), e2e/freshness-version-gate.spec.ts are the only matches]`

### Pattern 3: Version-check revalidation, never TTL (LOCAL-02)

**What:** `dataVersion` (returned by `GET /api/version`) is a single, app-wide monotonic numeric string. Read directly from `lib/settings.ts` this session:

```typescript
// lib/settings.ts:335-337, 339-342 [VERIFIED: lib/settings.ts:335-342]
export function nextDataVersionToken(): string {
  return String(Date.now())
}

export async function getDataVersion(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: DATA_VERSION_KEY } })
  return row?.value ?? '0'
}
```

The doc comment immediately above `bumpDataVersion()` (lines 344-364, read in full this session) states explicitly: *"the plain numeric string gives a later numeric-comparison consumer (Phase 34's LOCAL-02 IndexedDB cache-key check) a value it can compare with `>` directly, without stripping a suffix first"* and *"Called from exactly two places: lib/sync.ts:runSync() ... and app/api/review/route.ts's `prisma.$transaction()` block."* `[VERIFIED: lib/settings.ts:344-364]` — this project's own code was written anticipating this phase and already documents the exact contract to rely on.

**Practical consequence:** because it's one global counter (not per-route), any review write bumps the SAME counter Cards/Habits/Home use for their own version-check — this is not new coarseness, it's the same granularity `FreshnessWatcher`'s existing VERS-02 gate already uses across 3 routes today.

**Recommended local-cache.ts shape:**
```typescript
// lib/local-cache.ts — proposed API shape
import { openDB, type IDBPDatabase } from 'idb'

interface CacheEntry<T> {
  data: T
  dataVersion: string   // the /api/version value this entry was built from
  cachedAt: string       // ISO — display/debug only, NEVER used for staleness decisions
}

const STORE = 'routes'
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(buildId: string): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(`ks-cache-${buildId}`, 1, {
      upgrade(db) { db.createObjectStore(STORE) },
    })
  }
  return dbPromise
}

export async function read<T>(buildId: string, route: string): Promise<CacheEntry<T> | undefined> {
  const db = await getDb(buildId)
  return db.get(STORE, route)
}

export async function write<T>(buildId: string, route: string, data: T, dataVersion: string): Promise<void> {
  const db = await getDb(buildId)
  await db.put(STORE, { data, dataVersion, cachedAt: new Date().toISOString() }, route)
}
```
`buildId` is threaded in as a parameter (read once per app session from `/api/version`, cached in a module-level variable or a tiny React context) rather than baked into the module — this keeps the module pure/testable and avoids a hidden module-scope fetch running at import time (which would itself be an impurity risk).

### Pattern 4: Write-through on device-originated writes (LOCAL-03)

**What:** Each optimistic-update code path calls into `lib/local-cache.ts` **synchronously alongside** its existing `setState` call — not as a separate effect, not on a delay. Three call sites, each already located and read this session:

**1. `StudySession.tsx:submitReview`** (read in full, lines 365-480+). The FSRS result is computed locally (`reviewCard(cardReviewFields, rating as Grade)`), then `updatedItem` is built and the in-memory `queue` is advanced — this is the existing optimistic path (`postReviewWithRetry` fires the persist in the background, never awaited). Add one call right where `updatedItem`/removal is decided:
```typescript
// after computing requeue/updatedItem, before the background persist:
localCache.patchStudyCard(buildId, cardId, requeue ? updatedItem.card : null /* null = remove: fully graduated */)
```
This requires `StudySession.tsx` to receive `buildId` (or a `localCache`-bound callback) as a prop from `StudyClient.tsx`, since `StudySession` itself has no cache-read responsibility today — the cleanest shape is `StudyClient` passing an `onReviewCommitted={(cardId, updatedCardOrNull) => localCache.patchStudyCard(...)}` callback, mirroring the existing `onComplete` prop pattern already on `StudySession`.

**2. `CardsClient.tsx:handleSave`** (read in full, lines 914-1012). Already computes a fully merged `CardDTO` (`merge(c)`) and patches `groups`/`searchResults`/`readingPractice` state in place. Add, immediately after the existing `setGroups`/`setSearchResults` calls:
```typescript
localCache.patchCardsEntry(buildId, updated.id, merge)
```
`handleDelete` and `handleAdd` need the equivalent (remove-by-id / insert respectively) — same code path, same transaction boundary as the existing state updates.

**3. `SettingsClient.tsx`'s PUT handler.** Settings PUT only affects the `ActivityDTO` slice cached under `home` and `habits` (`dailyGoalSeconds`, `dayStartHour` — the only two `ActivityDTO` fields, per `lib/dto.ts:133-137` read this session) — `buttonColor`/`rewardColor`/`readingTextScale`/`readingAid` are delivered via the `ks_settings` cookie + pre-paint script (per `CLAUDE.md`'s RSC hydration section), not through any of the 4 cached DTOs, so they need **no** cache write-through at all. After a successful PUT, patch both cache entries:
```typescript
localCache.patchActivitySlice(buildId, { dailyGoalSeconds: newGoal, dayStartHour: newHour })
```

**Deliberately out of scope for synchronous write-through:** Home's `StatsDTO.dueCards`/`cardsByType`/`masteredCount` and Habits' `cardsByState` are *aggregates* the server computes with a Prisma `groupBy`. Keeping them perfectly in sync with every single review client-side would mean re-implementing that aggregation logic in the browser — a "Don't Hand-Roll" violation (see below). These aggregates rely on the version-check background revalidation instead (which reviews DO bump, per Pattern 3), consistent with D-00 rule 1's own framing: the *review write itself* (Study's queue) is the optimistic-UI code path that must not go stale; Home/Habits' downstream aggregate views are legitimately allowed a background-revalidation-length lag, same as they already tolerate today between navigations.

### Pattern 5: Pull-to-refresh wiring per route (LOCAL-04, D-03, D-04)

**What:** `lib/usePullToRefresh.ts` (read in full this session — 71 lines, exports `usePullToRefresh(onRefresh)` and `PULL_THRESHOLD = 70`) is already route-agnostic; it takes any `() => Promise<void> | void` callback. `HomeClient.tsx`'s existing `handleSync` (read in full — lines 149-178) is the only current consumer. Per D-04, Study/Cards/Habits must NOT reuse `handleSync`; each gets its own `handleRefresh`:

```typescript
// StudyClient.tsx — new, route-local (mirrors handleSync's shape, no /api/sync call)
const handleRefresh = useCallback(async () => {
  haptic('impact-light')
  const { version } = await fetch('/api/version').then(r => r.json())
  const fresh = await fetch(`/api/cards/due${buildParams(lessonFrom, lessonTo, 'due', maxOrder)}`).then(r => r.json())
  setStudyCards(fresh)
  localCache.write(buildId, 'study', fresh, version)
}, [/* deps mirroring loadDue's */])

const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)
```

Mount `usePullToRefresh` at the top level of each `*Client.tsx` render (same placement pattern `HomeClient.tsx` already uses — the returned `pullDistance`/`refreshing` drive a small indicator, styled per whatever `/gsd-ui-phase 34` decides, using "Pull to refresh"/"Refreshing…" copy per D-04's locked wording distinction from Home's "Pull to sync"/"Syncing…").

**Cards route nuance (D-05):** Cards' pull-to-refresh should re-fetch only what's *already loaded* (each expanded group's current page count), not silently expand into a full-deck fetch — otherwise the gesture's behavior would contradict D-05's "accumulates whatever was loaded" scope. Concretely: re-run `fetchGroupPageForFilterCommit` (or equivalent) for every group with `loaded.length > 0`, at `take: loaded.length` (or its current page boundary), then `localCache.write('cards', ...)` the merged result.

### Anti-Patterns to Avoid

- **Re-deriving `FreshPayloadContext`'s gated-adoption dance for the new cache.** The `prevInitialCards`/`prevFreshStudy`/`prevInitialCardsPage`/`prevFreshCards`/`prevFreshHabits` pattern exists ONLY because RSC props and backstop payloads could each arrive independently and out of order relative to in-flight user interactions. Once `lib/local-cache.ts` is the single client-owned source of truth read once on mount and updated only via explicit write-through/revalidation calls, this whole class of race-guarding becomes unnecessary — reintroducing it around the new cache would be solving an already-solved problem with the wrong tool.
- **TTL-based expiry anywhere in `lib/local-cache.ts`.** D-00 rule 2 is explicit and non-negotiable; no `Date.now() - cachedAt > N` check should ever gate a refetch decision. `cachedAt` is for display/debug only.
- **Storing the full ~1056-card deck in the Cards cache "for completeness."** D-05 explicitly scopes this to session-accumulated data only; over-fetching here defeats the "make repeat visits instant" goal by turning first paint back into a large-payload wait.
- **Hand-rolling client-side aggregate recomputation for `StatsDTO`/`cardsByState` on every review.** See Pattern 4's "deliberately out of scope" note — this duplicates server `groupBy` logic and is exactly the over-engineering trap LOCAL-03's phrasing ("same code path as the optimistic UI update") is scoped to avoid; the optimistic UI update for a review only ever touches the in-session `queue`, never Home's dashboard stats.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Promise-wrapping `IDBRequest`/`IDBTransaction` boilerplate | A custom `promisifyRequest()` helper reinvented per call site | `idb`'s `openDB`/`db.get`/`db.put` | `idb` is exactly this helper, written by the IndexedDB spec's most active tooling author, already handles the "reject on `onerror`, resolve on `onsuccess`" and transaction-lifetime edge cases correctly |
| Detecting a build/deploy change | A custom version-string diffing/migration scheme inside the cache | Namespacing the IndexedDB database by `buildId` (Pattern 2) | Turns an entire class of "did I forget to check this" bugs into "the old database is simply never opened again" — no comparison code to get wrong |
| Recomputing `cardsByState`/`dueCards` aggregates client-side after each review | Client-side `groupBy` reimplementation to keep Home/Habits perfectly in sync in real time | Version-check background revalidation (already bumped by review writes) | The server already computes this correctly via Prisma; duplicating it client-side is a maintenance/correctness liability for a lag the UI already tolerates today between navigations |
| Detecting offline state | Polling `fetch('/api/ping')` on an interval | `navigator.onLine` + `window.addEventListener('online'/'offline', ...)` (D-02's own locked spec explicitly names this pattern) | Native browser API, zero network cost, instant |

**Key insight:** every piece of "don't hand-roll" guidance here reduces to the same principle D-00 rule 3 states explicitly — replace a layer, don't stack a new one that reimplements what an existing layer (server aggregation, the version counter, the browser's own connectivity events) already does correctly.

## Common Pitfalls

### Pitfall 1: Resurrecting the Next.js 16.2.1 Suspense/Segment-Cache flake by sequencing the cache-read before FreshnessWatcher's narrowing

**What goes wrong:** If the plan adds each `*Client.tsx`'s IndexedDB mount-read without also removing `fetchRoutePayload`'s per-route branches from `FreshnessWatcher.tsx`, the app ends up with TWO independent JSON-fetch-and-adopt mechanisms racing on every boundary event (visibilitychange/popstate/pageshow) — the original bug `FreshnessWatcher` was built for was about a *third* mechanism (RSC payload application) silently failing; adding a cache layer without removing the now-redundant backstop doesn't fix that bug, it just adds more surface area on top of it, directly violating D-00 rule 3's explicit acceptance criterion.
**Why it happens:** It's tempting to treat this phase as purely additive ("ship the cache, don't touch what already works").
**How to avoid:** Execute the `FreshnessWatcher.tsx` narrowing (remove `fetchRoutePayload`, `FreshPayloadContext`, `useFreshPayload`, the VERS-02 gate logic that guarded it) in the SAME plan/wave as the `*Client.tsx` cache-read additions — not as a follow-up. Also update every call site of `useFreshPayload()` (currently `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx` — confirmed by grep this session) to remove the corresponding gated-adoption blocks.
**Warning signs:** `grep -rn "useFreshPayload\|FreshPayloadContext" components/` still returning matches after the phase is "done."

### Pitfall 2: Assuming `window.__NEXT_DATA__.buildId` works under App Router

**What goes wrong:** `__NEXT_DATA__` is a Pages Router-era serialization mechanism. Its presence/shape under a pure App Router (Next.js 16.2.1) deployment could not be confirmed against official documentation this session — building the cache-key mechanism around it risks silent breakage on a Next.js upgrade, with no test coverage catching it (since dev-mode behavior can differ from production).
**Why it happens:** Older tutorials and Stack Overflow answers referencing `buildId` predate the App Router and are easy to find via search.
**How to avoid:** Use the server-route approach (Pattern 2) instead — reading `process.env.VERCEL_GIT_COMMIT_SHA` server-side inside `GET /api/version` is documented, stable Vercel behavior with no App-Router-internals dependency.
**Warning signs:** Any code referencing `window.__NEXT_DATA__` in a new file.

### Pitfall 3: Treating version-check as sufficient for LOCAL-03

**What goes wrong:** `PUT /api/cards/[id]` and `PUT /api/settings` do not call `bumpDataVersion()` (confirmed by grep across `app/` this session — zero matches outside `lib/sync.ts` and `app/api/review/route.ts`, cross-verified against `lib/settings.ts`'s own doc comment listing "exactly two places"). If write-through is skipped and the plan relies on background version-check revalidation to eventually correct a card edit or a settings change in the cache, it never will — the counter simply never moves for those writes.
**Why it happens:** Version-check revalidation "feels" like it should cover every write, since it's the phase's headline mechanism (D-00 rule 2).
**How to avoid:** Implement Pattern 4's three write-through call sites explicitly; do not treat them as optional or as a "nice to have on top of" version-check.
**Warning signs:** Editing a card, reopening `/cards` from cache, and seeing the pre-edit value — the exact regression LOCAL-03's success criterion calls out by name.

### Pitfall 4: Building `lib/local-cache.ts` as a module-scope singleton that opens the DB at import time

**What goes wrong:** Calling `openDB(...)` at module top-level (outside any function) runs it as a side effect of `import`, before `buildId` is known (buildId requires an async `/api/version` fetch) — this either forces a hard-coded/guessed buildId at import time or creates an import-time async operation that's awkward to test and can violate `react-hooks/purity` if any component reads its result synchronously during render.
**Why it happens:** Singletons are a natural first instinct for "the one shared cache instance."
**How to avoid:** Lazily open the DB inside an exported async function (Pattern 3's `getDb(buildId)`), called only from inside `useEffect` bodies, memoized via a module-level `Promise` cache keyed by the resolved `buildId` — never called during render.
**Warning signs:** ESLint `react-hooks/purity` firing on any file importing `lib/local-cache.ts`.

### Pitfall 5: Cards pull-to-refresh silently growing into a full-deck fetch

**What goes wrong:** The most natural implementation of "refresh what's on screen" is easy to accidentally write as "refetch everything," which both contradicts D-05's explicit scope and could push the Vercel Hobby 60s-per-request budget on a large deck (unlikely to hit the limit at ~1056 cards, but a real anti-pattern regardless per D-05's stated rationale).
**Why it happens:** It's simpler to write one `fetch('/api/cards?take=99999')` than to loop per already-loaded group at its current boundary.
**How to avoid:** Explicitly re-run the existing per-group fetch functions (`fetchGroupPageForFilterCommit` or equivalent) at each group's *current* `loaded.length`, one group at a time, mirroring exactly what's already loaded — never a single unbounded query.
**Warning signs:** A refresh on `/cards` taking noticeably longer than the initial page load, or the network tab showing a `take` parameter far larger than 30.

## Code Examples

### Reading the version + buildId together on mount (any `*Client.tsx`)

```typescript
// Source: synthesized from app/api/version/route.ts (read in full this session)
// and lib/settings.ts:335-364 (read in full this session)
useEffect(() => {
  let cancelled = false
  ;(async () => {
    const { version, buildId } = await fetch('/api/version').then((r) => r.json())
    if (cancelled) return
    const cached = await localCache.read(buildId, 'study')
    if (cached) setStudyCards(cached.data)
    if (!cached || cached.dataVersion !== version) {
      const fresh = await fetch('/api/cards/due').then((r) => r.json())
      if (cancelled) return
      setStudyCards(fresh)
      await localCache.write(buildId, 'study', fresh, version)
    }
  })()
  return () => { cancelled = true }
}, [])
```

### Detecting offline (D-02) — no dependency required

```typescript
// Pattern locked by D-02: "uses the standard navigator.onLine + online/offline
// event pattern (no new dependency)" — confirmed: zero existing usages of
// navigator.onLine anywhere in the repo this session, this is genuinely new.
const [isOffline, setIsOffline] = useState(false)
useEffect(() => {
  const update = () => setIsOffline(!navigator.onLine)
  update()
  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  return () => {
    window.removeEventListener('online', update)
    window.removeEventListener('offline', update)
  }
}, [])
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `FreshnessWatcher`'s dual-delivery (router.refresh() + JSON backstop) as the sole freshness mechanism for `/study`, `/cards`, `/habits` | Each route owns its own IndexedDB-backed cache-read + version-check revalidation; `FreshnessWatcher` narrows to the RSC-refresh half only | This phase (34) | First paint on repeat visits stops depending on the network or on RSC payload delivery succeeding at all |
| No offline signal anywhere in the app | `navigator.onLine`-driven persistent indicator (D-02) | This phase | Users can distinguish "cached but online" from "genuinely offline" |
| Pull-to-refresh only on Home | All 4 routes have a pull-to-refresh escape hatch, with Home's remaining a full doc-sync and the other 3 being lighter route-local refetches | This phase | Any cache bug becomes recoverable from the phone (D-00 rule 5) |

**Deprecated/outdated:**
- `FreshPayloadContext`/`useFreshPayload`/`fetchRoutePayload` (all in `components/FreshnessWatcher.tsx`): superseded by `lib/local-cache.ts`'s own per-route revalidation once this phase ships — see Pitfall 1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `process.env.VERCEL_GIT_COMMIT_SHA` is reliably populated on every Vercel production deploy for this project without any additional project-setting toggle (server-side read only, not client-inlined) | Pattern 2 | If unset in this project's actual Vercel configuration, `buildId` falls back to `process.env.VERCEL_DEPLOYMENT_ID`, then `'local-dev'` — worst case the cache never invalidates on deploy, which is a soft-fail (stale-shape data could reach a component expecting a new shape) rather than a crash; the plan should include a quick manual check (`vercel env ls` or checking a deployed `/api/version` response) before relying on this in production. Not independently confirmed this session via a live Vercel API call — `[CITED: community/GitHub discussion, cross-referenced against Vercel's documented System Environment Variables]`, not `[VERIFIED]` against this project's actual Vercel dashboard. |
| A2 | `window.__NEXT_DATA__.buildId` is unavailable or unreliable under Next.js 16.2.1's App Router | Pitfall 2 | Low risk — this assumption only argues AGAINST using a mechanism, and the recommended alternative (Pattern 2) does not depend on it either way |

## Open Questions

1. **Should `PUT /api/cards/[id]` and `PUT /api/settings` also call `bumpDataVersion()`?**
   - What we know: they currently don't (verified via `lib/settings.ts`'s own doc comment + repo-wide grep). Write-through (LOCAL-03) makes this a non-blocker for THIS phase's success criteria on a single device.
   - What's unclear: whether a future multi-tab/multi-device scenario (not this milestone's scope — single shared-password, effectively single-user) would benefit from these writes also bumping the counter, so a background tab's revalidation would pick them up too.
   - Recommendation: leave as-is for this phase; note it as a candidate low-risk follow-up if cross-tab staleness is ever reported as a real problem, per the same "don't add a layer until there's a real problem" principle D-00 rule 3 embodies.

2. **Exact eviction/size-bound policy for the Cards IndexedDB entry (D-05 discretion).**
   - What we know: D-05 explicitly defers this — "treat as an implementation default unless it surfaces as a real problem."
   - What's unclear: whether repeated old-buildId `ks-cache-*` databases (Pattern 2's naming scheme) should be actively cleaned up via `indexedDB.databases()` + delete, or left to accumulate.
   - Recommendation: for this phase, skip active cleanup (not required by any of LOCAL-01..05); note as a natural Phase 35 or later-hardening candidate if storage-quota issues are ever observed on-device.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| IndexedDB (browser API) | LOCAL-01/02/03/04/05 | ✓ (iOS/WebKit target, per `STATE.md`) | native, no version | — |
| `idb` npm package | Pattern 2/3 code examples | ✗ (not yet installed — confirmed via `package.json` read this session) | to be installed: 8.0.3 | Raw `indexedDB` API if the planner rejects the new dependency |
| `process.env.VERCEL_GIT_COMMIT_SHA` (Vercel system env var) | Pattern 2 build-ID keying | Not independently confirmed live this session | — | `VERCEL_DEPLOYMENT_ID`, then `'local-dev'` constant |
| `navigator.onLine` + `online`/`offline` events | D-02 | ✓ (native, all target browsers) | — | — |

**Missing dependencies with no fallback:** none — every dependency above has a documented fallback.
**Missing dependencies with fallback:** `idb` (falls back to raw `indexedDB`), `VERCEL_GIT_COMMIT_SHA` (falls back to `VERCEL_DEPLOYMENT_ID` then a local-dev constant).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit, pure functions), Playwright 1.61.1 (e2e, real browser + real IndexedDB) — both confirmed via `package.json` read this session |
| Config file | `vitest.config.ts` (excludes `e2e/**`), `playwright.config.ts` (port 3100, throwaway local SQLite DB, `retries: 0`, `workers: 1`) — both read this session |
| Quick run command | `npx vitest run lib/local-cache.test.ts` |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| LOCAL-01 | Second visit to each route paints from cache before network resolves | e2e (Playwright, real IndexedDB) | `npx playwright test e2e/local-cache-first-paint.spec.ts` | ❌ Wave 0 |
| LOCAL-02 | Cache entry keyed by build ID + version-checked, never TTL | unit (Vitest + `fake-indexeddb`) | `npx vitest run lib/local-cache.test.ts` | ❌ Wave 0 |
| LOCAL-03 | Write-through updates cache in the same code path as optimistic UI | e2e (grade a card, reopen route, assert no stale value) | `npx playwright test e2e/local-cache-write-through.spec.ts` | ❌ Wave 0 |
| LOCAL-04 | Pull-to-refresh bypasses cache + version check | e2e (mirrors existing `study-cache-invalidation.spec.ts` pattern) | `npx playwright test e2e/pull-to-refresh.spec.ts` | ❌ Wave 0 |
| LOCAL-05 | Network fully disabled → last-known data still renders | e2e via Playwright's `context.setOffline(true)` (confirmed: no existing spec in this repo uses `setOffline` or `route.abort` — this is genuinely new test territory) | `npx playwright test e2e/local-cache-offline.spec.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/local-cache.test.ts`
- **Per wave merge:** `npm test && npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/local-cache.test.ts` — unit tests for `read`/`write`/build-ID-namespacing logic, using `fake-indexeddb` (new devDependency, see Standard Stack)
- [ ] `e2e/local-cache-first-paint.spec.ts` — covers LOCAL-01 (second-visit instant paint)
- [ ] `e2e/local-cache-write-through.spec.ts` — covers LOCAL-03
- [ ] `e2e/pull-to-refresh.spec.ts` — covers LOCAL-04 across all 4 routes
- [ ] `e2e/local-cache-offline.spec.ts` — covers LOCAL-05, first use of `context.setOffline()` in this repo's e2e suite (existing specs use route-level assertions, not full network disable — confirmed by grep this session)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | No | Unchanged — this phase adds no auth surface; `middleware.ts` continues to gate all routes except `/login`/`/api/login`/static assets (confirmed via `.claude/CLAUDE.md` architecture doc) |
| V3 Session Management | No | Unchanged |
| V4 Access Control | No | Single shared-password, single-tenant app — no per-user access boundaries to cross |
| V5 Input Validation | Marginal | Data written to IndexedDB originates entirely from already-validated API responses (`CardDTO`, `StatsDTO`, etc.) or from client-computed FSRS state (`reviewCard()`, an existing, already-trusted pure function) — no new untrusted input enters the system through this phase |
| V8 Data Protection (client-side storage) | Yes | IndexedDB is unencrypted browser storage, readable by any script with same-origin access and by anyone with physical device access while the browser profile is unlocked. This app already stores auth state in an httpOnly cookie (`ks_auth`) — the new IndexedDB cache stores study/card/stats data, not credentials, so the exposure is limited to the user's own study content (Korean vocabulary/grammar cards, review history, streak stats). No PII beyond what's already visible in the UI itself. Standard control: do not cache anything beyond what the DTOs already expose to an authenticated session (i.e., cache exactly what `GET /api/stats`, `/api/activity`, `/api/cards`, `/api/cards/due` already return — no new fields, no auth tokens, no raw settings secrets). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Stale cache serving pre-edit data as if current (the exact failure mode LOCAL-03 targets) | Tampering (data integrity, not attacker-driven) | Write-through at the same code path as the optimistic UI update (Pattern 4) — this is a correctness/UX threat, not a malicious-actor threat, but ASVS V8's "protect stored data from corruption" spirit still applies |
| A stale build's cached DTO shape crashing a newer component (`undefined.someField`) after a deploy | Denial of Service (self-inflicted, not attacker-driven) | Build-ID-namespaced database naming (Pattern 2) turns this into a clean cold start instead of a render crash — this is explicitly D-00 rule 4's own stated purpose |
| Cache poisoning via a malicious response injected into `write()` | Tampering | Out of scope for this phase's threat model — all writes originate from same-origin `fetch()` calls to this app's own already-authenticated API routes; there is no cross-origin or third-party data path feeding `lib/local-cache.ts` |

## Sources

### Primary (HIGH confidence)

- `components/FreshnessWatcher.tsx` (read in full, 278 lines) — the exact backstop mechanics D-00 rule 3 requires shrinking
- `lib/usePullToRefresh.ts` (read in full, 71 lines)
- `app/api/version/route.ts` (read in full, 7 lines)
- `lib/settings.ts` lines 320-364 (read in full) — `getDataVersion`/`bumpDataVersion`/`nextDataVersionToken`, including the doc comment explicitly anticipating this phase
- `lib/dto.ts` (read in full, 138 lines) — every DTO shape this phase caches
- `components/HomeClient.tsx`, `components/StudyClient.tsx`, `components/CardsClient.tsx` (partial, 1266 of 1743 lines), `components/HabitsClient.tsx` (all read in full or substantially this session)
- `components/StudySession.tsx` lines 350-480 (`submitReview`, read this session)
- `app/api/settings/route.ts` (read in full)
- `app/page.tsx`, `app/study/page.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx` (all read in full — confirms `force-dynamic` + thin-RSC pattern for all 4 routes)
- `package.json` (read in full — confirms `idb`/`fake-indexeddb` are not yet dependencies)
- `/Users/main/Documents/travel-fun/lag_remediation_plan.md` §P3.6 (lines 298-369, read in full) — the authoritative source design doc for the staleness rules
- `.planning/phases/34-local-first-shell/34-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (all read in full)
- `npm view idb version` / `npm view idb repository.url` / `npm view idb scripts.postinstall` — live registry checks this session
- `gsd-tools query package-legitimacy check --ecosystem npm idb fake-indexeddb` — returned `OK` for both this session

### Secondary (MEDIUM confidence)

- Vercel/Next.js community discussion on `VERCEL_GIT_COMMIT_SHA`/`NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` semantics (WebSearch this session, cross-referenced against the general shape of Vercel's documented System Environment Variables) — server-side availability without a toggle is well-established Vercel behavior; not independently confirmed against this project's live Vercel dashboard this session
- `idb` package characterization (size, authorship, adoption) — WebSearch this session, cross-checked against the live `npm view` result

### Tertiary (LOW confidence)

- None retained — the one low-confidence claim explored this session (`window.__NEXT_DATA__.buildId` under App Router) is documented in the Assumptions Log as an argument AGAINST relying on it, not a claim the plan should build on

## Metadata

**Confidence breakdown:**
- Standard stack (`idb`): HIGH — live registry + legitimacy-check verified this session
- Architecture / FreshnessWatcher integration: HIGH — grounded in a full read of the actual current implementation, not inference from docs
- Build-ID mechanics (Vercel env var): MEDIUM — sound and standard, but not live-tested against this project's actual Vercel deployment this session
- Pitfalls: HIGH — Pitfall 3 (version counter doesn't cover edits/settings) is derived from the project's own source code, not external research

**Research date:** 2026-08-09
**Valid until:** 30 days (stable Next.js/Vercel platform behavior; re-verify build-ID mechanics if `next.config.ts` or the Vercel project's env-var configuration changes before this phase executes)
