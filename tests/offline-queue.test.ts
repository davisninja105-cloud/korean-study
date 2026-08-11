// Vitest unit coverage for lib/offline-queue.ts under fake-indexeddb (Node
// has no native IndexedDB). Mirrors tests/local-cache.test.ts's setup —
// the polyfill import MUST be the first line, before importing
// @/lib/offline-queue, since `openDB` (called lazily inside getDb()) needs
// the global `indexedDB` to already exist by the time any exported function
// actually runs.
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueReview,
  readQueue,
  flushQueue,
  removeQueuedReviewByKey,
  type QueuedReview,
  type PostResult,
} from '../lib/offline-queue'

// fake-indexeddb persists across tests within the same module registration
// (a single global `indexedDB`), and this module opens ONE fixed-name
// database (ks-offline-queue) rather than one-per-test like
// lib/local-cache.ts's buildId-namespaced design. Draining the queue before
// each test keeps every test's assertions independent of execution order.
beforeEach(async () => {
  const entries = await readQueue()
  if (entries.length > 0) {
    await flushQueue(async () => ({ status: 200 }))
  }
})

function entry(overrides: Partial<Omit<QueuedReview, 'id'>> = {}): Omit<QueuedReview, 'id'> {
  return {
    cardId: 'card-1',
    rating: 3,
    idempotencyKey: 'key-1',
    queuedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('enqueueReview / readQueue', () => {
  it('an enqueued entry is readable back with its fields intact', async () => {
    await enqueueReview(entry({ cardId: 'c1', rating: 4, idempotencyKey: 'k1', queuedAt: '2026-02-01T00:00:00.000Z' }))
    const queue = await readQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ cardId: 'c1', rating: 4, idempotencyKey: 'k1', queuedAt: '2026-02-01T00:00:00.000Z' })
    expect(typeof queue[0].id).toBe('number')
  })

  it('multiple enqueues read back in enqueue order', async () => {
    await enqueueReview(entry({ cardId: 'first', idempotencyKey: 'k-first' }))
    await enqueueReview(entry({ cardId: 'second', idempotencyKey: 'k-second' }))
    await enqueueReview(entry({ cardId: 'third', idempotencyKey: 'k-third' }))
    const queue = await readQueue()
    expect(queue.map((e) => e.cardId)).toEqual(['first', 'second', 'third'])
  })
})

describe('flushQueue — status classification', () => {
  it('an all-2xx transport empties the store and reports the right flushed count', async () => {
    await enqueueReview(entry({ cardId: 'a' }))
    await enqueueReview(entry({ cardId: 'b' }))
    const outcome = await flushQueue(async () => ({ status: 200 }))
    expect(outcome).toEqual({ flushed: 2, dropped: 0, remaining: 0 })
    expect(await readQueue()).toEqual([])
  })

  it('a 4xx entry is deleted and counted dropped, while later entries still flush', async () => {
    await enqueueReview(entry({ cardId: 'bad', idempotencyKey: 'k-bad' }))
    await enqueueReview(entry({ cardId: 'good', idempotencyKey: 'k-good' }))
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      return { status: e.cardId === 'bad' ? 400 : 200 }
    })
    expect(outcome).toEqual({ flushed: 1, dropped: 1, remaining: 0 })
    expect(calls).toEqual(['bad', 'good'])
    expect(await readQueue()).toEqual([])
  })

  it('a 5xx entry stops the walk, leaving that entry and all later ones queued with the correct remaining count', async () => {
    await enqueueReview(entry({ cardId: 'ok', idempotencyKey: 'k-ok' }))
    await enqueueReview(entry({ cardId: 'server-error', idempotencyKey: 'k-500' }))
    await enqueueReview(entry({ cardId: 'never-reached', idempotencyKey: 'k-never' }))
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      return { status: e.cardId === 'server-error' ? 500 : 200 }
    })
    expect(outcome).toEqual({ flushed: 1, dropped: 0, remaining: 2 })
    // The third entry's transport is never even called — the walk stops at
    // the 5xx entry, it does not skip ahead.
    expect(calls).toEqual(['ok', 'server-error'])
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['server-error', 'never-reached'])
  })

  it('a thrown transport error behaves identically to a 5xx — stop, leave remaining queued', async () => {
    await enqueueReview(entry({ cardId: 'ok', idempotencyKey: 'k-ok' }))
    await enqueueReview(entry({ cardId: 'throws', idempotencyKey: 'k-throws' }))
    await enqueueReview(entry({ cardId: 'never-reached', idempotencyKey: 'k-never' }))
    const outcome = await flushQueue(async (e) => {
      if (e.cardId === 'throws') throw new Error('network down')
      return { status: 200 }
    })
    expect(outcome).toEqual({ flushed: 1, dropped: 0, remaining: 2 })
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['throws', 'never-reached'])
  })
})

describe('flushQueue — sequential ordering, never concurrent', () => {
  it('the transport receives entries in enqueue order and is never called concurrently', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-a' }))
    await enqueueReview(entry({ cardId: 'b', idempotencyKey: 'k-b' }))
    await enqueueReview(entry({ cardId: 'c', idempotencyKey: 'k-c' }))

    const events: { cardId: string; kind: 'start' | 'end' }[] = []
    const post = async (e: QueuedReview): Promise<PostResult> => {
      events.push({ cardId: e.cardId, kind: 'start' })
      // Yield a couple of microtask turns so a concurrent (non-awaited) call
      // would interleave its own 'start' before this 'end' if the
      // implementation were parallel.
      await Promise.resolve()
      await Promise.resolve()
      events.push({ cardId: e.cardId, kind: 'end' })
      return { status: 200 }
    }

    await flushQueue(post)

    expect(events).toEqual([
      { cardId: 'a', kind: 'start' },
      { cardId: 'a', kind: 'end' },
      { cardId: 'b', kind: 'start' },
      { cardId: 'b', kind: 'end' },
      { cardId: 'c', kind: 'start' },
      { cardId: 'c', kind: 'end' },
    ])
  })
})

describe('flushQueue — idempotency-key reuse', () => {
  it('the transport receives the same idempotencyKey that was enqueued, and a second flush after an already-applied entry leaves the store empty rather than duplicating', async () => {
    await enqueueReview(entry({ cardId: 'c1', idempotencyKey: 'stable-key-123' }))

    const seenKeys: string[] = []
    const outcome1 = await flushQueue(async (e) => {
      seenKeys.push(e.idempotencyKey)
      return { status: 200 } // server treats this as the idempotent-apply response
    })
    expect(seenKeys).toEqual(['stable-key-123'])
    expect(outcome1).toEqual({ flushed: 1, dropped: 0, remaining: 0 })
    expect(await readQueue()).toEqual([])

    // Second flush of the now-empty queue: transport is never called again
    // (nothing queued), and the store stays empty — no duplicate re-apply.
    const outcome2 = await flushQueue(async (e) => {
      seenKeys.push(e.idempotencyKey)
      return { status: 200 }
    })
    expect(outcome2).toEqual({ flushed: 0, dropped: 0, remaining: 0 })
    expect(seenKeys).toEqual(['stable-key-123']) // unchanged — transport not called again
    expect(await readQueue()).toEqual([])
  })
})

describe('flushQueue — 409 is retryable, not a drop', () => {
  it('a 409 for the first of three queued entries stops the walk with flushed 0 / dropped 0, transport called once, all three still queued in order', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-a' }))
    await enqueueReview(entry({ cardId: 'b', idempotencyKey: 'k-b' }))
    await enqueueReview(entry({ cardId: 'c', idempotencyKey: 'k-c' }))
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      return { status: 409 }
    })
    expect(outcome).toEqual({ flushed: 0, dropped: 0, remaining: 3 })
    expect(calls).toEqual(['a'])
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['a', 'b', 'c'])
  })

  it('a 409 for the second of three: transport called for entries one and two only, one and two land differently — flushed 1 / dropped 0 / remaining 2, entries two and three still queued in order', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-a' }))
    await enqueueReview(entry({ cardId: 'b', idempotencyKey: 'k-b' }))
    await enqueueReview(entry({ cardId: 'c', idempotencyKey: 'k-c' }))
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      return { status: e.cardId === 'b' ? 409 : 200 }
    })
    expect(outcome).toEqual({ flushed: 1, dropped: 0, remaining: 2 })
    expect(calls).toEqual(['a', 'b'])
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['b', 'c'])
  })

  it('a later flush whose transport returns 200 for the previously-409 entry flushes it, empties the store, and the entry lands with the SAME idempotencyKey it was enqueued with', async () => {
    await enqueueReview(entry({ cardId: 'retry-me', idempotencyKey: 'stable-key' }))
    const firstOutcome = await flushQueue(async () => ({ status: 409 }))
    expect(firstOutcome).toEqual({ flushed: 0, dropped: 0, remaining: 1 })

    const seenKeys: string[] = []
    const secondOutcome = await flushQueue(async (e) => {
      seenKeys.push(e.idempotencyKey)
      return { status: 200 }
    })
    expect(secondOutcome).toEqual({ flushed: 1, dropped: 0, remaining: 0 })
    expect(seenKeys).toEqual(['stable-key'])
    expect(await readQueue()).toEqual([])
  })

  it('a 400 and a 404 keep today\'s behavior exactly: deleted, counted dropped, the walk continues to later entries', async () => {
    await enqueueReview(entry({ cardId: 'bad-400', idempotencyKey: 'k-400' }))
    await enqueueReview(entry({ cardId: 'bad-404', idempotencyKey: 'k-404' }))
    await enqueueReview(entry({ cardId: 'good', idempotencyKey: 'k-good' }))
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      if (e.cardId === 'bad-400') return { status: 400 }
      if (e.cardId === 'bad-404') return { status: 404 }
      return { status: 200 }
    })
    expect(outcome).toEqual({ flushed: 1, dropped: 2, remaining: 0 })
    expect(calls).toEqual(['bad-400', 'bad-404', 'good'])
    expect(await readQueue()).toEqual([])
  })

  it('a 409 never increments dropped', async () => {
    await enqueueReview(entry({ cardId: 'only', idempotencyKey: 'k-only' }))
    const outcome = await flushQueue(async () => ({ status: 409 }))
    expect(outcome.dropped).toBe(0)
  })
})

describe('removeQueuedReviewByKey', () => {
  it('removing an existing key deletes exactly that entry and leaves every other entry present, in order', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-a' }))
    await enqueueReview(entry({ cardId: 'b', idempotencyKey: 'k-b' }))
    await enqueueReview(entry({ cardId: 'c', idempotencyKey: 'k-c' }))
    await removeQueuedReviewByKey('k-b')
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['a', 'c'])
  })

  it('removing a key that matches nothing is a no-op that resolves and leaves the queue untouched', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-a' }))
    await removeQueuedReviewByKey('does-not-exist')
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['a'])
  })

  it('a key that is a strict prefix of a queued entry\'s key removes nothing', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'k-abc' }))
    await removeQueuedReviewByKey('k-ab')
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['a'])
  })

  it('a key differing only in case removes nothing', async () => {
    await enqueueReview(entry({ cardId: 'a', idempotencyKey: 'K-A' }))
    await removeQueuedReviewByKey('k-a')
    const remaining = await readQueue()
    expect(remaining.map((e) => e.cardId)).toEqual(['a'])
  })

  it('resolves rather than rejecting even when called with no matching store state', async () => {
    await expect(removeQueuedReviewByKey('anything')).resolves.toBeUndefined()
  })

  it('after removal, a subsequent flushQueue never calls the transport for the removed entry', async () => {
    await enqueueReview(entry({ cardId: 'keep', idempotencyKey: 'k-keep' }))
    await enqueueReview(entry({ cardId: 'cancel-me', idempotencyKey: 'k-cancel' }))
    await removeQueuedReviewByKey('k-cancel')
    const calls: string[] = []
    const outcome = await flushQueue(async (e) => {
      calls.push(e.cardId)
      return { status: 200 }
    })
    expect(calls).toEqual(['keep'])
    expect(outcome).toEqual({ flushed: 1, dropped: 0, remaining: 0 })
  })
})

describe('flushQueue — reentrancy guard', () => {
  it('a flush invoked while another is in flight returns a zeroed outcome without touching the store', async () => {
    await enqueueReview(entry({ cardId: 'in-flight', idempotencyKey: 'k-in-flight' }))

    let releaseFirst: () => void = () => {}
    const gate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const firstPromise = flushQueue(async () => {
      await gate
      return { status: 200 }
    })

    // Invoked synchronously, before the first call's gated post() resolves —
    // the module-level flushing flag is already set at this point (set
    // synchronously before flushQueue's first await), so this call must
    // short-circuit without reading or mutating the store.
    const secondOutcome = await flushQueue(async () => ({ status: 200 }))
    expect(secondOutcome).toEqual({ flushed: 0, dropped: 0, remaining: 0 })

    // The entry is still queued — the second call never touched it.
    const midFlightQueue = await readQueue()
    expect(midFlightQueue.map((e) => e.cardId)).toEqual(['in-flight'])

    releaseFirst()
    const firstOutcome = await firstPromise
    expect(firstOutcome).toEqual({ flushed: 1, dropped: 0, remaining: 0 })
    expect(await readQueue()).toEqual([])
  })
})
