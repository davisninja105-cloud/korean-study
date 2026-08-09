// lib/local-cache.ts — client-side IndexedDB route cache (Phase 34, Local-First Shell)
// No 'use client' directive: this is a plain module (not a component), same
// convention as lib/usePullToRefresh.ts. It is only ever imported from
// 'use client' components, but importing it does not itself require the
// directive.
//
// ── Build-ID namespacing (D-00 rule 4, LOCAL-02) ────────────────────────────
// The IndexedDB DATABASE itself is named `ks-cache-<buildId>` (CACHE_DB_PREFIX
// + buildId), not a field inside each cache entry. This means a deploy that
// changes a DTO shape opens a brand-new, empty database — there is no
// comparison branch that can be skipped or forgotten, because a mismatched
// old-buildId database is simply never opened again. `buildId` comes from
// `GET /api/version`'s new `buildId` field (server-side only, sourced from
// `VERCEL_GIT_COMMIT_SHA`) via `fetchCacheContext()` below.
//
// ── Version-check revalidation, never TTL (D-00 rule 2, LOCAL-02) ──────────
// Every `CacheEntry` carries the `dataVersion` value (from `/api/version`) it
// was built from. A caller decides to refetch by comparing that value against
// a fresh `/api/version` read — NEVER by comparing `cachedAt` against the
// current time. `cachedAt` exists on every entry purely as display/debug
// metadata; it is written by `writeCache` and never read back for a staleness
// decision anywhere in this module or its callers.
//
// ── Lazy, per-buildId DB open (Pitfall 4, react-hooks/purity) ──────────────
// `openDB(...)` is called only inside `getDb()`, itself only reachable from
// this module's exported async functions — never at module scope, never as
// an import-time side effect. `dbPromise`/`dbBuildId` memoize the open only
// for the currently-known buildId; a call with a different buildId discards
// the memoized promise and opens the new database.

import { openDB, type IDBPDatabase } from 'idb'
import type { ActivityDTO, StatsDTO, CardDTO, GroupCountsDTO } from '@/lib/dto'

export const CACHE_DB_PREFIX = 'ks-cache-'
export const CACHE_STORE = 'routes'

export interface CacheEntry<T> {
  data: T
  dataVersion: string // the /api/version `version` value this entry was built from
  cachedAt: string // ISO — display/debug metadata ONLY, never read for staleness
}

export type RouteKey = 'home' | 'study' | 'cards' | 'habits'

export interface CacheContext {
  version: string
  buildId: string
}

// ── Per-route cache payload shapes ──────────────────────────────────────────
// Declared now even though this task (34-01) only consumes HabitsCachePayload
// — plans 34-02/03/04 build against these, and declaring them here keeps
// lib/local-cache.ts owned by exactly one plan.

// Field-for-field identical to HabitsFreshPayload in
// components/FreshnessWatcher.tsx, so a later plan can delete that type
// without a shape migration.
export interface HabitsCachePayload {
  days: ActivityDTO['days']
  dailyGoalSeconds: number
  dayStartHour: number
  masteredCount: number
  cardsByState: StatsDTO['cardsByState']
}

export interface HomeCachePayload {
  stats: StatsDTO
  activity: ActivityDTO
}

export type StudyCachePayload = CardDTO[]

export interface CardsCachePayload {
  groups: Record<string, { loaded: CardDTO[]; nextCursor: string | null; hasMore: boolean }>
  groupCounts: GroupCountsDTO
}

let dbPromise: Promise<IDBPDatabase> | null = null
let dbBuildId: string | null = null

function getDb(buildId: string): Promise<IDBPDatabase> {
  if (!dbPromise || dbBuildId !== buildId) {
    dbBuildId = buildId
    dbPromise = openDB(`${CACHE_DB_PREFIX}${buildId}`, 1, {
      upgrade(db) {
        // External keys (route key passed to get/put) — no keyPath needed
        // for 4 flat key→JSON-blob entries.
        db.createObjectStore(CACHE_STORE)
      },
    })
  }
  return dbPromise
}

/**
 * Fetches the current `{ version, buildId }` context from `GET /api/version`.
 * Returns `null` on a non-ok response, a malformed body (missing either
 * string field), or a network failure — callers treat `null` as "cache-read-
 * only, offline" and skip any revalidation attempt, never throwing into a
 * client render.
 *
 * Call sites: every `*Client.tsx`'s mount effect and route-local
 * `handleRefresh` (pull-to-refresh escape hatch).
 */
export async function fetchCacheContext(): Promise<CacheContext | null> {
  try {
    const res = await fetch('/api/version')
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown; buildId?: unknown }
    if (typeof body.version !== 'string' || typeof body.buildId !== 'string') return null
    return { version: body.version, buildId: body.buildId }
  } catch {
    return null
  }
}

/**
 * Reads the cache entry for `route` under the database namespaced by
 * `buildId`. Resolves `undefined` on a miss, a genuinely missing entry, OR
 * any underlying IndexedDB failure (unavailable, quota, private-mode
 * restriction) — matches the safe-fallback contract documented on
 * `getButtonColor()` in `lib/settings.ts`. Never rejects; a cache failure
 * must never propagate into a client render.
 *
 * Call sites: every `*Client.tsx`'s mount effect (cache-first paint, LOCAL-01).
 */
export async function readCache<T>(buildId: string, route: RouteKey): Promise<CacheEntry<T> | undefined> {
  try {
    const db = await getDb(buildId)
    return (await db.get(CACHE_STORE, route)) as CacheEntry<T> | undefined
  } catch {
    return undefined
  }
}

/**
 * Writes `data` (tagged with the `dataVersion` it was built from) as the
 * cache entry for `route` under the database namespaced by `buildId`. A
 * second write for the same `(buildId, route)` overwrites in place — the
 * store is keyed by route, so this is never a duplicate. Resolves silently on
 * any underlying IndexedDB failure; never rejects; a cache failure must never
 * propagate into a client render.
 *
 * `cachedAt` (`new Date().toISOString()`) is display/debug metadata only —
 * see this module's header comment. The `new Date()` call lives inside this
 * async function body, never in a render path (react-hooks/purity).
 *
 * Call sites: every `*Client.tsx`'s mount-time revalidation and route-local
 * `handleRefresh` (pull-to-refresh escape hatch).
 */
export async function writeCache<T>(
  buildId: string,
  route: RouteKey,
  data: T,
  dataVersion: string,
): Promise<void> {
  try {
    const db = await getDb(buildId)
    const entry: CacheEntry<T> = { data, dataVersion, cachedAt: new Date().toISOString() }
    await db.put(CACHE_STORE, entry, route)
  } catch {
    // Silent no-op — see this function's doc comment.
  }
}
