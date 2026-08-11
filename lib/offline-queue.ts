// lib/offline-queue.ts — durable IndexedDB offline review queue (Phase 35, OFFLINE-03)
// No 'use client' directive: this is a plain module (not a component), same
// convention as lib/local-cache.ts / lib/usePullToRefresh.ts. It is only
// ever imported from 'use client' components, but importing it does not
// itself require the directive.
//
// ── D-00: own database, NOT the buildId-namespaced route cache ─────────────
// lib/local-cache.ts's `ks-cache-<buildId>` database is deliberately opened
// fresh on every new buildId — an old buildId's database is simply never
// reopened again (see that module's own header comment). That is exactly the
// event this queue must survive: a deploy landing while a device is offline
// with unflushed grades. If the queue lived inside that database, a real
// deploy during a real offline study session would silently orphan
// already-graded reviews in a database the app will never open again — data
// lost that way cannot be recovered afterwards. This module therefore opens
// its own fixed-name, non-buildId-keyed database, entirely independent of the
// route cache's version-check/build-ID invalidation logic, and must never
// import CACHE_DB_PREFIX or any other build-ID constant from
// lib/local-cache.ts.
//
// ── Sequential, enqueue-order flush ─────────────────────────────────────────
// app/api/review/route.ts's optimistic-concurrency check reads CURRENT server
// state fresh on every request — it does not validate against a
// client-supplied prior state. Two queued reviews of the SAME card, if
// flushed out of enqueue order, would each succeed individually but apply
// FSRS grades in the wrong chronological order, silently producing a
// different final CardReview state than the learner actually experienced.
// `flushQueue()` below therefore walks the queue strictly one entry at a
// time (an `await` between each), never in parallel, and stops the walk
// entirely on the first 5xx/thrown failure rather than skipping ahead.
//
// ── Idempotency-key reuse, never a second dedup scheme ──────────────────────
// The idempotencyKey is generated ONCE at grade time (components/StudySession.tsx)
// and stored with the queued entry; flushQueue() never mints a new one on a
// retry. app/api/review/route.ts's `ReviewLog.idempotencyKey` UNIQUE
// constraint turns a re-flush of an already-applied entry (e.g. after a
// force-quit mid-flush) into a safe, idempotent no-op — see that route's
// P2002/isUniqueConstraintError handling. This module is a buffer in front
// of that existing guarantee, not a new trust boundary.

import { openDB, type IDBPDatabase } from 'idb'

export const QUEUE_DB_NAME = 'ks-offline-queue'
export const QUEUE_STORE = 'reviews'

export interface QueuedReview {
  id?: number
  cardId: string
  rating: number
  idempotencyKey: string
  queuedAt: string // ISO — display/debug metadata only, never read for ordering
}

export interface FlushOutcome {
  flushed: number
  dropped: number
  remaining: number
}

// Injectable transport result shape — the default implementation posts a
// real request; tests inject a stub so every branch (2xx/4xx/5xx/throw) can
// be driven without stubbing the global fetch.
export interface PostResult {
  status: number
}

// ── Lazy DB open (Pitfall 4 / react-hooks/purity) ───────────────────────────
// `openDB(...)` is called only inside `getDb()`, itself only reachable from
// this module's exported async functions — never at module scope, never as
// an import-time side effect. Auto-incrementing key path on `id` means
// cursor/getAll iteration order is enqueue order by construction, not by
// sorting a stored timestamp.
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(QUEUE_DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
      },
    })
  }
  return dbPromise
}

/**
 * Durably enqueues a graded review. Resolves silently on any underlying
 * IndexedDB failure — matches lib/local-cache.ts's established safe-fallback
 * convention. A queue write that can't durably land falls back to today's
 * existing lost-background-save behavior (no queue at all), never throws
 * into the caller's event-handler flow.
 *
 * Call site: components/StudySession.tsx's background-save exhaustion
 * callback, on the 'network'-classified failure branch.
 */
export async function enqueueReview(entry: Omit<QueuedReview, 'id'>): Promise<void> {
  try {
    const db = await getDb()
    await db.add(QUEUE_STORE, entry)
  } catch {
    // Silent no-op — see this function's doc comment.
  }
}

/**
 * Reads every queued entry in enqueue order. Resolves an empty array on any
 * underlying IndexedDB failure. Never rejects.
 */
export async function readQueue(): Promise<QueuedReview[]> {
  try {
    const db = await getDb()
    return (await db.getAll(QUEUE_STORE)) as QueuedReview[]
  } catch {
    return []
  }
}

async function deleteEntry(id: number): Promise<void> {
  try {
    const db = await getDb()
    await db.delete(QUEUE_STORE, id)
  } catch {
    // Silent no-op — a delete failure just means the entry stays queued and
    // is retried (or re-counted) on the next flush; never throws.
  }
}

async function defaultPost(entry: QueuedReview): Promise<PostResult> {
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId: entry.cardId, rating: entry.rating, idempotencyKey: entry.idempotencyKey }),
  })
  return { status: res.status }
}

// Module-level reentrancy guard (never per-call state) — two flush triggers
// firing at the same moment (e.g. 'online' plus a coalesced foreground
// resume landing in the same tick) must not interleave. The guard is set
// synchronously before the first `await`, so a second call made before the
// first call's own first await resolves observes it immediately.
let flushing = false

/**
 * Sequentially replays every queued entry against `post` (default: a real
 * POST /api/review carrying the entry's original idempotencyKey), in strict
 * enqueue order, never concurrently.
 *
 * - 2xx: delete the entry, count it `flushed`.
 * - 4xx: delete the entry, count it `dropped` — the card was deleted or the
 *   payload is no longer valid; retrying forever would never help.
 * - 5xx or a thrown network error: STOP the walk immediately, leaving that
 *   entry and every later entry queued for the next trigger. Never deletes,
 *   never continues past this point — continuing would break enqueue
 *   ordering for a card graded more than once in the same offline session.
 *
 * A flush invoked while another is already in flight returns immediately
 * with every count at zero, touching neither the queue nor the network.
 */
export async function flushQueue(
  post: (entry: QueuedReview) => Promise<PostResult> = defaultPost,
): Promise<FlushOutcome> {
  if (flushing) {
    return { flushed: 0, dropped: 0, remaining: 0 }
  }
  flushing = true
  try {
    const entries = await readQueue()
    let flushed = 0
    let dropped = 0
    let stoppedAt = entries.length // exclusive index at which the walk stopped

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      try {
        const result = await post(entry)
        if (result.status >= 200 && result.status < 300) {
          await deleteEntry(entry.id!)
          flushed++
          continue
        }
        if (result.status >= 400 && result.status < 500) {
          await deleteEntry(entry.id!)
          dropped++
          continue
        }
        // 5xx — stop; this entry and all later ones stay queued.
        stoppedAt = i
        break
      } catch {
        // Network error mid-flush — stop; this entry and all later ones
        // stay queued for the next trigger.
        stoppedAt = i
        break
      }
    }

    return { flushed, dropped, remaining: entries.length - stoppedAt }
  } finally {
    flushing = false
  }
}
