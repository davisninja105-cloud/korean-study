import { describe, it, expect } from 'vitest'
import { sequenceCards, selectSessionCards, SeqCard, SeqEdge } from '../lib/sequence'

function card(id: string, daysOverdue = 0): SeqCard {
  const now = new Date('2026-06-23T12:00:00Z')
  const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
  // Mirror the real Prisma shape: nextReview lives on the `review` relation
  // (the due-cards route fetches with include: { review: true }). Using the
  // relation shape here guards against CR-01 (reading card.nextReview directly,
  // which is undefined for real cards) regressing.
  return { id, review: { nextReview } }
}

const NOW = new Date('2026-06-23T12:00:00Z')

describe('sequenceCards', () => {
  it('returns empty array for empty input', () => {
    expect(sequenceCards([], [], NOW)).toEqual([])
  })

  it('returns single card unchanged', () => {
    const c = card('a')
    expect(sequenceCards([c], [], NOW)).toEqual([c])
  })

  it('places prerequisite before dependent card', () => {
    const prereq = card('prereq')
    const dep = card('dep')
    const edges: SeqEdge[] = [{ cardId: 'dep', prerequisiteId: 'prereq' }]
    const result = sequenceCards([dep, prereq], edges, NOW)
    expect(result[0].id).toBe('prereq')
    expect(result[1].id).toBe('dep')
  })

  it('urgency can promote an overdue card ahead of a shallow prereq', () => {
    // dep depends on prereq. dep is 25 days overdue → boost=min(25/7,3)≈3
    // dep score = depth(1) - boost(3) = -2; prereq score = depth(0) - boost(0) = 0
    // → dep comes first
    const prereq = card('prereq', 0)
    const dep = card('dep', 25)
    const edges: SeqEdge[] = [{ cardId: 'dep', prerequisiteId: 'prereq' }]
    const result = sequenceCards([dep, prereq], edges, NOW)
    expect(result[0].id).toBe('dep')
  })

  it('handles cycles without infinite loop', () => {
    const a = card('a')
    const b = card('b')
    const edges: SeqEdge[] = [
      { cardId: 'a', prerequisiteId: 'b' },
      { cardId: 'b', prerequisiteId: 'a' },
    ]
    // Should not throw and should return both cards
    const result = sequenceCards([a, b], edges, NOW)
    expect(result).toHaveLength(2)
  })

  it('ignores edges where either side is not in the session', () => {
    const a = card('a')
    const edges: SeqEdge[] = [{ cardId: 'a', prerequisiteId: 'missing' }]
    const result = sequenceCards([a], edges, NOW)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('a')
  })
})

describe('selectSessionCards', () => {
  it('returns all cards when pool <= sessionSize', () => {
    const pool = [card('a', 1), card('b', 2), card('c', 3)]
    const result = selectSessionCards(pool, [], 10, NOW)
    expect(result).toHaveLength(3)
    const ids = result.map((c) => c.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).toContain('c')
  })

  it('pulls a less-due prerequisite into the session with its dependent', () => {
    // 'dep' is 5 days overdue; 'filler' is 3 days overdue; 'prereq' is 1 day overdue.
    // sessionSize=2, so a naive most-due-only cap would pick [dep, filler] and skip 'prereq'.
    // selectSessionCards must pull 'prereq' in as a prerequisite of 'dep' instead.
    const dep    = card('dep',    5)   // most overdue → selected as first seed
    const filler = card('filler', 3)   // more overdue than prereq but not a prerequisite
    const prereq = card('prereq', 1)   // less overdue → excluded by naive cap but required by dep
    const edges: SeqEdge[] = [{ cardId: 'dep', prerequisiteId: 'prereq' }]
    const result = selectSessionCards([dep, filler, prereq], edges, 2, NOW)
    const ids = result.map((c) => c.id)
    expect(ids).toContain('dep')
    expect(ids).toContain('prereq')
    // prerequisite must precede the dependent
    expect(ids.indexOf('prereq')).toBeLessThan(ids.indexOf('dep'))
  })

  it('output is downward-closed and capped at sessionSize', () => {
    // Card 'e' depends on 'a','b','c','d'; sessionSize=3 so the naive cap would
    // exclude some prerequisites. The closure of adding 'e' pulls in all 4 prereqs.
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id, 0))
    const edges: SeqEdge[] = [
      { cardId: 'e', prerequisiteId: 'a' },
      { cardId: 'e', prerequisiteId: 'b' },
      { cardId: 'e', prerequisiteId: 'c' },
      { cardId: 'e', prerequisiteId: 'd' },
    ]
    const result = selectSessionCards(pool, edges, 3, NOW)
    // At most sessionSize + one closure overshoot
    expect(result.length).toBeLessThanOrEqual(4)
    // Every prerequisite of a returned card is also in the result (downward-closed)
    const resultIds = new Set(result.map((c) => c.id))
    for (const c of result) {
      for (const e of edges.filter((e) => e.cardId === c.id)) {
        if (resultIds.has(e.cardId)) {
          expect(resultIds.has(e.prerequisiteId)).toBe(true)
        }
      }
    }
  })

  it('handles 2-node cycle without infinite loop or duplicate cards', () => {
    const a = card('a')
    const b = card('b')
    const edges: SeqEdge[] = [
      { cardId: 'a', prerequisiteId: 'b' },
      { cardId: 'b', prerequisiteId: 'a' },
    ]
    const result = selectSessionCards([a, b], edges, 10, NOW)
    expect(result).toHaveLength(2)
    // no duplicates
    const ids = result.map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('overshoot is bounded by at most one prerequisite closure', () => {
    // 'seed' has 2 prerequisites: 'p1' and 'p2'. sessionSize=1.
    // When 'seed' is selected as a seed, its closure adds p1+p2+seed = 3 cards.
    // The final result.slice(0, sessionSize) must cap at 1.
    const seed = card('seed', 5)
    const p1   = card('p1',   1)
    const p2   = card('p2',   1)
    const edges: SeqEdge[] = [
      { cardId: 'seed', prerequisiteId: 'p1' },
      { cardId: 'seed', prerequisiteId: 'p2' },
    ]
    const result = selectSessionCards([seed, p1, p2], edges, 1, NOW)
    // Final slice must be <= sessionSize
    expect(result.length).toBeLessThanOrEqual(1)
  })

  it('prioritizes the most-due card as seed, reading nextReview from the review relation', () => {
    // Independent cards (no edges). ids are deliberately REVERSE-alphabetical to
    // due-ness: 'aaa' is least due, 'zzz' is most due. With sessionSize 1, correct
    // most-due-first selection must pick 'zzz'. If nextReview were read off the
    // (absent) flat field instead of card.review.nextReview, all cards would tie at
    // 0 and the id tiebreak would wrongly pick 'aaa' — so this asserts the CR-01
    // relation read, which the membership/ordering cases above do not discriminate.
    const pool = [card('aaa', 1), card('mmm', 5), card('zzz', 10)]
    const result = selectSessionCards(pool, [], 1, NOW)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('zzz')
  })
})
