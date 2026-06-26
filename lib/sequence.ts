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

/**
 * Foundation-first session selector.
 *
 * Given the whole eligible pool of cards, prerequisite edges, and a session-size
 * cap, returns a downward-closed subset: every card in the result has all of its
 * in-pool prerequisites present in the result too.
 *
 * Algorithm:
 *   1. Early exit: if pool.length <= sessionSize, return pool unchanged.
 *   2. Build inPool set, poolById map, and in-pool prereqs adjacency map
 *      (only edges whose both endpoints are in the pool are considered).
 *   3. Sort pool most-due-first as seeds (nextReview ascending; tiebreak by
 *      lesson.orderIndex then id — stable, purity-safe, no Date.now() needed).
 *   4. Iterate seeds: before starting each, break if result.length >= sessionSize.
 *      addClosure(seed) recurses into prerequisites first (foundations-before-
 *      dependent, DFS) guarded by `visiting` (cycle-safe) and `added` (dedup).
 *   5. Return result.slice(0, sessionSize). Because prerequisites always precede
 *      their dependent in the result, any prefix is still downward-closed — the
 *      slice only drops dependents, never orphans a prerequisite.
 *
 * Overshoot: at most one closure beyond sessionSize (the last seed may pull in
 * its prerequisite chain before the break fires).
 *
 * Pure — `now` is a parameter; no Date.now()/new Date()/Math.random() in the body.
 */

const URGENCY_SCALE = 7   // days overdue per depth level
const MAX_BOOST     = 3   // max depth levels a card can climb via urgency

export interface SeqCard {
  id: string
  // The due date lives on the CardReview relation in Prisma (the route fetches
  // with include: { review: true }), so the relation is the primary source.
  // The flat `nextReview` is accepted as a fallback for already-flattened
  // callers and test fixtures.
  review?: { nextReview?: Date | string | null } | null
  nextReview?: Date | string | null
  lesson?: { orderIndex?: number | null } | null
}

export interface SeqEdge {
  cardId: string
  prerequisiteId: string
}

/**
 * Resolve a card's next-review time to epoch milliseconds.
 *
 * Prefers the `review` relation (the real Prisma shape from
 * `include: { review: true }`), falling back to a flattened `nextReview` field.
 * Missing/null → 0 (treated as most-due). Pure — no Date.now()/Math.random().
 *
 * Single source of truth for "when is this card due?" so the seed sort,
 * urgency boost, and tiebreaks all read the date from the same place.
 */
function nextReviewMs(card: SeqCard): number {
  const nr = card.review?.nextReview ?? card.nextReview
  if (!nr) return 0
  return typeof nr === 'string' ? new Date(nr).getTime() : nr.getTime()
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
    const nrMs = nextReviewMs(card)
    if (!nrMs) return 0
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
    const nrA = nextReviewMs(a)
    const nrB = nextReviewMs(b)
    if (nrA !== nrB) return nrA - nrB
    // Tiebreak 3: id lexicographic — stable, purity-safe
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function selectSessionCards<T extends SeqCard>(
  pool: T[],
  edges: SeqEdge[],
  sessionSize: number,
  now: Date = new Date()
): T[] {
  // Early exit: everything fits — return the pool unchanged.
  if (pool.length <= sessionSize) return pool

  // `now` is accepted as a parameter for purity parity with sequenceCards.
  // It is not used directly in the body below; the seed sort reads nextReview
  // directly as an absolute timestamp (no relative-to-now arithmetic needed).
  void now

  // Build fast-lookup structures scoped to the pool.
  const inPool   = new Set(pool.map((c) => c.id))
  const poolById = new Map(pool.map((c) => [c.id, c]))

  // Build in-pool prerequisite adjacency map (only edges where both endpoints
  // are in the pool — same filter pattern as sequenceCards' inSession map).
  const prereqs = new Map<string, Set<string>>()
  for (const c of pool) prereqs.set(c.id, new Set())
  for (const e of edges) {
    if (inPool.has(e.cardId) && inPool.has(e.prerequisiteId)) {
      prereqs.get(e.cardId)!.add(e.prerequisiteId)
    }
  }

  // Sort pool most-due-first to determine seed priority.
  // Comparator is pure (reads stored dates; no Date.now()/Math.random()).
  const seeds = [...pool].sort((a, b) => {
    // Most-due first: nextReview ascending (null/undefined → 0, i.e. most urgent)
    const nrA = nextReviewMs(a)
    const nrB = nextReviewMs(b)
    if (nrA !== nrB) return nrA - nrB
    // Tiebreak: lesson orderIndex ascending
    const loA = a.lesson?.orderIndex ?? 0
    const loB = b.lesson?.orderIndex ?? 0
    if (loA !== loB) return loA - loB
    // Tiebreak: id lexicographic — stable, purity-safe
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // DFS that adds a card and all of its in-pool prerequisites to `result`,
  // prerequisites first (foundations before dependents — downward-closed).
  // `visiting` is the DFS recursion stack guard (cycle-safe: back-edges are ignored).
  // `added` ensures each card is pushed at most once (dedup).
  const result:   T[]         = []
  const added     = new Set<string>()
  const visiting  = new Set<string>()

  function addClosure(card: T): void {
    if (added.has(card.id) || visiting.has(card.id)) return
    visiting.add(card.id)
    for (const pId of prereqs.get(card.id) ?? []) {
      const prereq = poolById.get(pId)
      if (prereq) addClosure(prereq)
    }
    visiting.delete(card.id)
    // Guard again after recursion: a cycle-back-edge may have already added this node.
    if (!added.has(card.id)) {
      added.add(card.id)
      result.push(card)
    }
  }

  // Iterate seeds most-due-first; stop starting new seeds once at capacity.
  // Overshoot is bounded to one closure (the in-flight addClosure for the last seed).
  for (const seed of seeds) {
    if (result.length >= sessionSize) break
    addClosure(seed)
  }

  // Slice to sessionSize. Because prerequisites always appear before their
  // dependent in `result`, any prefix is still downward-closed.
  return result.slice(0, sessionSize)
}
