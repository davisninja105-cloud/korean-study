import { describe, it, expect } from 'vitest'
import { sequenceCards, SeqCard, SeqEdge } from '../lib/sequence'

function card(id: string, daysOverdue = 0): SeqCard {
  const now = new Date('2026-06-23T12:00:00Z')
  const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
  return { id, nextReview }
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
