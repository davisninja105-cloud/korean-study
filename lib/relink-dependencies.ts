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
// Bounded for the Vercel 60s budget: exactly 2 reads + at most 1 write
// regardless of deck size (~hundreds of cards). No per-edge round-trips.

import { prisma } from '@/lib/prisma'
import { computeMissingEdges } from '@/lib/link-dependencies'

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

  return {
    cardsScanned: cards.length,
    edgesCreated: missing.length,
    totalEdges: existingEdges.length + missing.length,
  }
}
