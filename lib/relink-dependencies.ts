// lib/relink-dependencies.ts — server-only full-deck CardDependency relink.
// No 'use client' — this module runs server-side only.
//
// Thin orchestrator over the pure computeMissingEdges resolver-diff
// (lib/link-dependencies.ts): reads the whole deck + existing edges, computes
// the missing forward-reference edges, and batch-inserts them in a single
// createMany. Called by runSync() after every clean sync with new lessons
// (RELIABILITY-02) so forward-reference edges no longer wait for a manual
// script invocation. Also the single persistence implementation the manual
// fallback script (scripts/relink-dependencies.mts) and local-resync's final
// pass delegate to (IN-02 consolidation).
//
// Bounded for the Vercel 60s budget: exactly 2 reads + at most 2 writes
// regardless of deck size (~hundreds of cards) — the edge createMany (at most
// 1) plus the unconditional studyCacheVersion bump (exactly 1). No per-edge
// round-trips.
//
// Phase 32 (STUDY-03): this function is also the single cache-invalidation
// point for all three real mutating writers — the /api/sync route (via
// runSync()), scripts/local-resync.mts, and scripts/relink-dependencies.mts —
// because it is the only function all three call unconditionally. See the
// unconditional bumpStudyCacheVersion() call at the end of
// relinkAllDependencies() below.

import { prisma } from '@/lib/prisma'
import { computeMissingEdges } from '@/lib/link-dependencies'
import { bumpStudyCacheVersion } from '@/lib/settings'

export interface RelinkResult {
  cardsScanned: number
  edgesCreated: number
  totalEdges: number
}

/**
 * Relink the whole deck's CardDependency edges in one batch-diff pass.
 *
 * Reads all cards (including leaf cards with `components: null` so they stay
 * resolvable as prerequisites) and all existing CardDependency edges, computes
 * the missing edges via the pure `computeMissingEdges` resolver-diff, and
 * batch-inserts them with a single `createMany` when any are missing. Never
 * creates Card/Sentence/Lesson rows and never deletes edges — it only inserts
 * missing CardDependency rows.
 *
 * Idempotent by construction (RELIABILITY-03): `computeMissingEdges` subtracts
 * existing edges, so a second call finds nothing to insert. The
 * `@@unique([cardId, prerequisiteId])` constraint in prisma/schema.prisma
 * backstops duplicates at the DB layer against the read/write race window
 * between concurrent syncs — if a concurrent sync inserts the same edge
 * between this read and write, `createMany` throws on the unique constraint
 * and the caller (runSync's hook) treats that as non-fatal: the DB constraint,
 * not this function, is the final duplicate guard. The next qualifying sync
 * retries the relink naturally.
 */
export async function relinkAllDependencies(): Promise<RelinkResult> {
  // Both reads are independent of each other — run concurrently instead of
  // sequentially (was 2 serial round-trips, now 1).
  const [cards, existingEdges] = await Promise.all([
    prisma.card.findMany({
      select: { id: true, normalizedFront: true, components: true },
    }),
    prisma.cardDependency.findMany({
      select: { cardId: true, prerequisiteId: true },
    }),
  ])

  const missing = computeMissingEdges(cards, existingEdges)

  if (missing.length > 0) {
    // createMany: id/createdAt come from schema defaults. The @@unique
    // constraint is the race backstop (see JSDoc above) — a conflicting
    // insert throws and is caught non-fatally by the runSync hook.
    await prisma.cardDependency.createMany({ data: missing })
  }

  // Phase 32 (STUDY-03): UNCONDITIONAL cache-invalidation bump — outside the
  // `if (missing.length > 0)` guard above. This function is called
  // unconditionally by all three real mutating writers (the /api/sync route
  // via runSync(), scripts/local-resync.mts, scripts/relink-dependencies.mts),
  // and a relink that created zero NEW edges may still follow a sync that
  // created cards and lemmas — the lib/study-cache.ts snapshot must still be
  // invalidated in that case. Non-fatal: a failed bump must never turn a
  // successful relink into a thrown error, so it only costs the next request
  // one extra stale-cache read until the next successful bump.
  try {
    await bumpStudyCacheVersion()
  } catch (bumpErr: unknown) {
    const bumpMsg = bumpErr instanceof Error ? bumpErr.message : 'Unknown error'
    console.warn(
      '[relink] studyCacheVersion bump failed (non-fatal — one stale-cache request until the next bump):',
      bumpMsg
    )
  }

  return {
    cardsScanned: cards.length,
    edgesCreated: missing.length,
    totalEdges: existingEdges.length + missing.length,
  }
}
