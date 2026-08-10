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

// Field-for-field identical to the JSON backstop payload FreshnessWatcher.tsx
// used to expose for '/habits' before Phase 34 (34-05-PLAN.md) retired that
// half of the dual-delivery design.
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

// ── Write-through patch helpers (LOCAL-03) ──────────────────────────────────
// Every helper below follows the same read-modify-write shape against a
// single route entry, wrapped in try/catch with a silent no-op fallback (a
// device-originated write must never throw into the optimistic UI update it
// rides alongside), and every one PRESERVES the entry's existing
// `dataVersion` — a device-originated write does not invent a new server
// version, it patches the payload the current version already describes.
//
// Deliberately NOT patched here: `StatsDTO.dueCards`, `StatsDTO.cardsByType`,
// `StatsDTO.masteredCount`, and `cardsByState` are server-computed `groupBy`
// aggregates. Keeping them perfectly in sync with every single review/edit
// client-side would mean re-implementing that Prisma aggregation logic in
// the browser — a "Don't Hand-Roll" violation (34-RESEARCH.md). These rely
// on version-check background revalidation instead (which review writes DO
// bump, per lib/settings.ts's `bumpDataVersion()`).

// Card.type -> Cards-page group-key mapping. Mirrors
// components/CardsClient.tsx's local (unexported) `groupKeyForType()` —
// duplicated rather than imported because that constant lives in a client
// component module, and this module must stay importable from any context.
const KNOWN_TYPE_GROUPS = ['vocabulary', 'grammar', 'phrase']
function groupKeyForCardType(type: string): string {
  return KNOWN_TYPE_GROUPS.includes(type) ? type : 'other'
}

/**
 * Replaces `cardId`'s entry in the `study` cache entry's `CardDTO[]` in
 * place, preserving array order. `updatedCard: null` removes the card
 * (fully graduated / no longer due this session). A no-op when the `study`
 * entry doesn't exist yet — never creates one. Never rejects.
 *
 * Call site: StudySession.tsx's `submitReview`, alongside the existing
 * optimistic in-memory `queue` update.
 */
export async function patchStudyCard(
  buildId: string,
  cardId: string,
  updatedCard: CardDTO | null,
): Promise<void> {
  try {
    const entry = await readCache<StudyCachePayload>(buildId, 'study')
    if (!entry) return
    const nextData = updatedCard
      ? entry.data.map((c) => (c.id === cardId ? updatedCard : c))
      : entry.data.filter((c) => c.id !== cardId)
    await writeCache(buildId, 'study', nextData, entry.dataVersion)
  } catch {
    // Silent no-op — see this section's header comment.
  }
}

/**
 * Applies `updater` to the matching card (by id) inside whichever `cards`
 * group holds it, and relocates it (removes from the old group, prepends
 * into the new one) when the updated card's `type` maps to a different
 * group key — mirroring `CardsClient.handleSave`'s `newGroupNeedsRealFetch`
 * guard: relocation only happens into a group that already has
 * `loaded.length > 0`; splicing a lone row into an unfetched group would
 * permanently hide the rest of that group's real cards. A no-op when the
 * `cards` entry doesn't exist, or when the card isn't found in any group.
 * Never rejects.
 *
 * Call site: CardsClient.tsx's `handleSave`, alongside the existing
 * optimistic `setGroups` update.
 */
export async function patchCachedCard(
  buildId: string,
  cardId: string,
  updater: (c: CardDTO) => CardDTO,
): Promise<void> {
  try {
    const entry = await readCache<CardsCachePayload>(buildId, 'cards')
    if (!entry) return
    const groups = entry.data.groups
    let oldKey: string | null = null
    let updatedCard: CardDTO | null = null
    for (const key of Object.keys(groups)) {
      const found = groups[key].loaded.find((c) => c.id === cardId)
      if (found) {
        oldKey = key
        updatedCard = updater(found)
        break
      }
    }
    if (!oldKey || !updatedCard) return

    const newKey = groupKeyForCardType(updatedCard.type)
    const nextGroups: CardsCachePayload['groups'] = { ...groups }

    if (newKey === oldKey) {
      nextGroups[oldKey] = {
        ...nextGroups[oldKey],
        loaded: nextGroups[oldKey].loaded.map((c) => (c.id === cardId ? updatedCard! : c)),
      }
    } else {
      nextGroups[oldKey] = { ...nextGroups[oldKey], loaded: nextGroups[oldKey].loaded.filter((c) => c.id !== cardId) }
      const destination = nextGroups[newKey]
      if (destination && destination.loaded.length > 0) {
        nextGroups[newKey] = { ...destination, loaded: [updatedCard, ...destination.loaded] }
      }
      // Destination group doesn't exist in the cache entry yet, or has never
      // been fetched (loaded.length === 0) — matches CardsClient's own
      // newGroupNeedsRealFetch guard: don't splice a lone row into an
      // unfetched group. The card simply drops out of the cache until a real
      // fetch populates that group.
    }

    await writeCache(buildId, 'cards', { ...entry.data, groups: nextGroups }, entry.dataVersion)
  } catch {
    // Silent no-op — see this section's header comment.
  }
}

/**
 * Drops `cardId` from every group in the `cards` cache entry. A no-op when
 * the entry doesn't exist. Never rejects.
 *
 * Call site: CardsClient.tsx's `handleDelete`.
 */
export async function removeCachedCard(buildId: string, cardId: string): Promise<void> {
  try {
    const entry = await readCache<CardsCachePayload>(buildId, 'cards')
    if (!entry) return
    const nextGroups: CardsCachePayload['groups'] = {}
    for (const key of Object.keys(entry.data.groups)) {
      nextGroups[key] = { ...entry.data.groups[key], loaded: entry.data.groups[key].loaded.filter((c) => c.id !== cardId) }
    }
    await writeCache(buildId, 'cards', { ...entry.data, groups: nextGroups }, entry.dataVersion)
  } catch {
    // Silent no-op — see this section's header comment.
  }
}

/**
 * Prepends `card` into the `cards` cache entry's group matching its type —
 * ONLY when that group already has loaded rows (same "never splice into an
 * unfetched group" rule as `patchCachedCard`). A no-op when the `cards`
 * entry doesn't exist, or when the destination group has never been
 * fetched. Never rejects.
 *
 * Call site: CardsClient.tsx's `handleAdd`.
 */
export async function insertCachedCard(buildId: string, card: CardDTO): Promise<void> {
  try {
    const entry = await readCache<CardsCachePayload>(buildId, 'cards')
    if (!entry) return
    const key = groupKeyForCardType(card.type)
    const destination = entry.data.groups[key]
    if (!destination || destination.loaded.length === 0) return
    const nextGroups: CardsCachePayload['groups'] = {
      ...entry.data.groups,
      [key]: { ...destination, loaded: [card, ...destination.loaded] },
    }
    await writeCache(buildId, 'cards', { ...entry.data, groups: nextGroups }, entry.dataVersion)
  } catch {
    // Silent no-op — see this section's header comment.
  }
}

/**
 * Patches `dailyGoalSeconds`/`dayStartHour` on BOTH the `home` entry's
 * `activity` slice and the `habits` entry, leaving every other field
 * untouched. Each entry independently no-ops if absent. Exists because `PUT
 * /api/settings` does NOT call `bumpDataVersion()` (lib/settings.ts), so
 * version-check revalidation can never detect a settings change on its own
 * (34-RESEARCH.md Pitfall 3) — this write-through is the ONLY mechanism that
 * keeps the Home/Habits cache honest after a settings save. Never rejects.
 *
 * Call site: SettingsClient.tsx's `save()`.
 */
export async function patchActivitySlice(
  buildId: string,
  patch: { dailyGoalSeconds?: number; dayStartHour?: number },
): Promise<void> {
  try {
    const homeEntry = await readCache<HomeCachePayload>(buildId, 'home')
    if (homeEntry) {
      const nextActivity: ActivityDTO = { ...homeEntry.data.activity, ...patch }
      await writeCache(buildId, 'home', { ...homeEntry.data, activity: nextActivity }, homeEntry.dataVersion)
    }
  } catch {
    // Silent no-op — see this section's header comment.
  }
  try {
    const habitsEntry = await readCache<HabitsCachePayload>(buildId, 'habits')
    if (habitsEntry) {
      const nextHabits: HabitsCachePayload = { ...habitsEntry.data, ...patch }
      await writeCache(buildId, 'habits', nextHabits, habitsEntry.dataVersion)
    }
  } catch {
    // Silent no-op — see this section's header comment.
  }
}
