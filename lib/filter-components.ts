/**
 * Pure deck-lookup filter — single source of truth for "does this
 * components[] entry resolve to a real card in the deck?"
 *
 * Contract: keeps a components[] entry only if it resolves to a real card's
 * normalizedFront via direct match or particle-stripped stem match; drops
 * everything else. Retention is DECK-LOOKUP, not sentence-text containment —
 * an abstract grammar-pattern notation (e.g. ~(으)면) is retained when it
 * exists as its own deck card, exactly the same as a plain vocabulary lemma.
 *
 * This does NOT verify that a resolved component is the *correct*
 * prerequisite relationship for the card that referenced it — only that it
 * resolves to SOME real card. Catching a real-but-wrong-relationship
 * component is a prompt/self-verification concern (GRAPH-01), not this
 * filter's job.
 *
 * Mirrors the two-phase resolution in lib/known-words.ts (countUnknownWords).
 *
 * Used by:
 *  - lib/extract-cards.ts  (wired in plan 16-03, the sync write-path filter)
 *
 * No side-effects; safe server AND client.
 */

import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'

/**
 * Filter raw components[] down to only entries that resolve to a real card
 * in the deck.
 *
 * @param rawComponents        Raw component lemma strings as returned by Claude.
 *                             Caller has already deduped/self-excluded these
 *                             (see lib/extract-cards.ts:208-215) — this function
 *                             does not re-dedupe.
 * @param deckNormalizedFronts Set of every card's normalizedFront in the deck.
 * @returns A new array containing only the entries that resolve to a real
 *          card, in their original order.
 */
export function filterComponents(
  rawComponents: string[],
  deckNormalizedFronts: Set<string>
): string[] {
  return rawComponents.filter((comp) => {
    // Resolution step 1: direct normalizeFront match.
    if (deckNormalizedFronts.has(normalizeFront(comp))) return true

    // Resolution step 2: particle-stem fallback — strip a trailing particle
    // and check whether the bare stem resolves to a real card.
    const { stem } = splitParticle(comp)
    if (stem && stem !== comp && deckNormalizedFronts.has(normalizeFront(stem))) {
      return true
    }

    // Neither direct match nor stem match — this component is spurious.
    return false
  })
}
