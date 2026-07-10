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
 * computeMissingEdges is the shared full-deck relink core: it builds the
 * whole-deck lookup (so leaf cards with components: null stay resolvable as
 * prerequisites — the CR-02 fix made structural), parses + filters each
 * row's components JSON defensively, delegates resolution to
 * resolveDependencyEdges (never reimplements the resolve loop), and
 * subtracts edges that already exist. Callers (lib/relink-dependencies.ts)
 * own persistence — this module never touches Prisma.
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
 * The exact select shape prisma returns for
 * `card.findMany({ select: { id, normalizedFront, components } })`.
 * Used by computeMissingEdges so callers can pass Prisma rows straight in.
 */
export interface DeckCardRow {
  id: string
  normalizedFront: string
  components: string | null
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

/**
 * Compute the CardDependency edges missing from the deck given the current
 * cards and the edges that already exist. This is the shared full-deck relink
 * core: callers (lib/relink-dependencies.ts) own persistence.
 *
 * The lookup is built from EVERY row (not just cards with components) so a
 * leaf card whose own `components` is null is still resolvable as another
 * card's prerequisite — the CR-02 fix, made structural.
 *
 * Each row's `components` JSON is parsed defensively: invalid JSON, non-array
 * payloads, and non-string / empty-string elements are skipped without
 * throwing. Rows that yield no usable component are excluded from resolution.
 *
 * Resolution is delegated to resolveDependencyEdges — this function never
 * reimplements the resolve loop. Existing edges are subtracted using the
 * same `${cardId}::${prerequisiteId}` composite key resolveDependencyEdges
 * uses internally.
 *
 * @param cards          whole deck rows (id, normalizedFront, components).
 * @param existingEdges  edges already persisted; excluded from the result.
 * @returns the missing edges, in first-seen order. Idempotent:
 *          computeMissingEdges(cards, computeMissingEdges(cards, [])) === [].
 */
export function computeMissingEdges(
  cards: DeckCardRow[],
  existingEdges: ResolvedEdge[]
): ResolvedEdge[] {
  // Whole-deck lookup: leaf prerequisite cards (components: null) are valid
  // targets — mirrors CR-02's fix and the per-lesson pass in local-resync.mts.
  const keyToId = new Map<string, string>()
  for (const { normalizedFront, id } of cards) {
    keyToId.set(normalizedFront, id)
  }

  // Parse + defensively filter each row's components JSON. Only rows with at
  // least one usable (non-empty string) component become resolution targets.
  const targets: DependencyLinkTarget[] = []
  for (const { id, components } of cards) {
    if (components === null) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(components)
    } catch {
      continue // malformed JSON — skip the row entirely, never throw.
    }
    if (!Array.isArray(parsed)) continue
    const usable = parsed.filter(
      (el): el is string => typeof el === 'string' && el.length > 0
    )
    if (usable.length === 0) continue
    targets.push({ id, components: usable })
  }

  const resolved = resolveDependencyEdges(keyToId, targets)

  // Subtract edges that already exist, reusing the same composite-key
  // convention resolveDependencyEdges uses internally for dedup.
  const existing = new Set<string>()
  for (const { cardId, prerequisiteId } of existingEdges) {
    existing.add(`${cardId}::${prerequisiteId}`)
  }
  return resolved.filter(
    ({ cardId, prerequisiteId }) => !existing.has(`${cardId}::${prerequisiteId}`)
  )
}
