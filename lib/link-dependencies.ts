/**
 * Pure resolver for CardDependency edges — single source of truth for
 * "given a normalizedFront -> cardId lookup and a set of cards' raw
 * components[] strings, which real {cardId, prerequisiteId} edges does
 * that resolve to?"
 *
 * IN-02: this exact resolve loop (`for comp of components { prereqId =
 * keyToId.get(normalizeFront(comp)); if (!prereqId || prereqId === id)
 * continue; ... }`) was independently reimplemented in
 * app/api/sync/route.ts, scripts/local-resync.mts (twice — per-lesson pass
 * and final relink pass), and scripts/retro-filter-cleanup.mts. That
 * duplication is exactly what let CR-02 (keyToId incremental-augmentation
 * scoping bug) slip through in one call site but not the others — a future
 * correctness fix now only needs to be made here.
 *
 * Does NOT touch Prisma. Callers own how the resolved edges are persisted:
 * upsert one-by-one for the live sync path and local-resync.mts, or
 * batch-diff against existing edges for the offline retro-cleanup script.
 *
 * No side-effects; safe server AND client (mirrors lib/filter-components.ts).
 */

import { normalizeFront } from './card-key'

export interface DependencyLinkTarget {
  id: string
  components: string[]
}

export interface ResolvedEdge {
  cardId: string
  prerequisiteId: string
}

/**
 * Resolve each target card's components[] strings to real card ids via
 * `keyToId`, dropping unresolvable components and self-references, and
 * deduping repeated (cardId, prerequisiteId) pairs across the whole call.
 *
 * @param keyToId  normalizedFront -> cardId lookup. MUST cover the whole
 *                 deck (not just cards that themselves have components) so
 *                 a leaf-node card with no components of its own is still a
 *                 valid prerequisite target — mirrors CR-02's fix.
 * @param targets  cards whose components[] should be resolved into edges.
 * @returns deduped {cardId, prerequisiteId} pairs, in the order first seen.
 */
export function resolveDependencyEdges(
  keyToId: Map<string, string>,
  targets: DependencyLinkTarget[]
): ResolvedEdge[] {
  const seen = new Set<string>()
  const edges: ResolvedEdge[] = []

  for (const { id, components } of targets) {
    for (const comp of components) {
      if (!comp) continue
      const prereqId = keyToId.get(normalizeFront(comp))
      if (!prereqId || prereqId === id) continue
      const key = `${id}::${prereqId}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ cardId: id, prerequisiteId: prereqId })
    }
  }

  return edges
}
