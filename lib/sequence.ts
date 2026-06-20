/**
 * Foundation-first blended sequencer.
 *
 * Given a set of study cards and their in-session prerequisite edges, returns
 * the cards in an order where foundations (prerequisites) tend to come before
 * the cards that build on them — blended with FSRS urgency so that a badly-
 * overdue card can still leapfrog its prerequisite.
 *
 * Score formula (sort ascending — lowest score shown first):
 *   score(card) = depth(card) − urgencyBoost(card)
 *
 *   depth        = longest prerequisite chain within the session
 *                  (0 = no in-session prereqs; foundation cards score 0)
 *   urgencyBoost = min(max(0, daysOverdue) / URGENCY_SCALE, MAX_BOOST)
 *                  — ahead-scope cards (nextReview in the future) get boost 0
 *
 * Tunable constants at the top of the file:
 *   URGENCY_SCALE = 7   (~1 week overdue buys 1 depth level of priority)
 *   MAX_BOOST     = 3   (most a card can leapfrog: 3 prerequisite levels)
 *
 * Cycle-safety: DFS tracks a visited-stack; a node already on the current
 * recursion stack contributes 0 to depth (the cycle is treated as if the
 * edge doesn't exist for ordering purposes).
 *
 * Pure — `now` is a parameter so the function has no impure side-effects and
 * is safe to call in server contexts and unit tests alike.
 */

const URGENCY_SCALE = 7   // days overdue per depth level
const MAX_BOOST     = 3   // max depth levels a card can climb via urgency

export interface SeqCard {
  id: string
  nextReview?: Date | string | null
  lesson?: { orderIndex?: number | null } | null
}

export interface SeqEdge {
  cardId: string
  prerequisiteId: string
}

export function sequenceCards<T extends SeqCard>(
  cards: T[],
  edges: SeqEdge[],
  now: Date = new Date()
): T[] {
  if (cards.length === 0) return cards

  const nowMs = now.getTime()
  const dayMs = 86_400_000

  // Build a set of IDs in this session for fast lookup.
  const inSession = new Set(cards.map((c) => c.id))

  // Build adjacency map: cardId → set of in-session prerequisiteIds.
  const prereqs = new Map<string, Set<string>>()
  for (const c of cards) prereqs.set(c.id, new Set())
  for (const e of edges) {
    if (inSession.has(e.cardId) && inSession.has(e.prerequisiteId)) {
      prereqs.get(e.cardId)!.add(e.prerequisiteId)
    }
  }

  // Memoized depth(id) = longest in-session prereq chain.
  // visiting tracks the current DFS stack to detect/break cycles.
  const depthMemo = new Map<string, number>()
  const visiting  = new Set<string>()

  function depth(id: string): number {
    if (depthMemo.has(id)) return depthMemo.get(id)!
    if (visiting.has(id)) return 0   // cycle: treat as no contribution
    visiting.add(id)
    let d = 0
    for (const pId of prereqs.get(id) ?? []) {
      d = Math.max(d, depth(pId) + 1)
    }
    visiting.delete(id)
    depthMemo.set(id, d)
    return d
  }

  function urgencyBoost(card: T): number {
    const nr = card.nextReview
    if (!nr) return 0
    const nrMs = typeof nr === 'string' ? new Date(nr).getTime() : nr.getTime()
    const daysOverdue = (nowMs - nrMs) / dayMs
    if (daysOverdue <= 0) return 0   // not yet due
    return Math.min(daysOverdue / URGENCY_SCALE, MAX_BOOST)
  }

  return [...cards].sort((a, b) => {
    const scoreA = depth(a.id) - urgencyBoost(a)
    const scoreB = depth(b.id) - urgencyBoost(b)
    if (scoreA !== scoreB) return scoreA - scoreB
    // Tiebreak 1: lesson orderIndex ascending (earlier lessons first)
    const loA = a.lesson?.orderIndex ?? 0
    const loB = b.lesson?.orderIndex ?? 0
    if (loA !== loB) return loA - loB
    // Tiebreak 2: nextReview ascending (most urgent first among ties)
    const nrA = a.nextReview ? (typeof a.nextReview === 'string' ? new Date(a.nextReview).getTime() : a.nextReview.getTime()) : 0
    const nrB = b.nextReview ? (typeof b.nextReview === 'string' ? new Date(b.nextReview).getTime() : b.nextReview.getTime()) : 0
    if (nrA !== nrB) return nrA - nrB
    // Tiebreak 3: id lexicographic — stable, purity-safe
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}
