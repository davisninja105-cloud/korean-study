import { describe, it, expect } from 'vitest'
import { filterComponents } from '../lib/filter-components'

describe('filterComponents', () => {
  it('keeps a component on direct normalizeFront match', () => {
    // "먹다" (to eat) is a real deck card front — direct match, no stem needed.
    expect(filterComponents(['먹다'], new Set(['먹다']))).toEqual(['먹다'])
  })

  it('keeps a component via splitParticle stem fallback', () => {
    // "학교에서" (at school) is not itself a card, but splitParticle strips the
    // multi-char particle 에서 → stem "학교", which IS a real deck card.
    expect(filterComponents(['학교에서'], new Set(['학교']))).toEqual(['학교에서'])
  })

  it('drops a component with no direct or stem match', () => {
    // A fabricated string that resolves to nothing in the deck — dropped.
    expect(filterComponents(['존재하지않는단어'], new Set(['먹다']))).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(filterComponents([], new Set(['먹다']))).toEqual([])
  })

  it('retains an abstract grammar pattern by deck-lookup, not sentence-text containment (GRAPH-03)', () => {
    // "~(으)면" (if/when) is an abstract grammar-pattern notation. It is retained
    // here because it resolves to its OWN deck card via normalizeFront — this
    // proves the filter's retention mechanism is deck membership, not whether
    // the literal string appears inside some sentence text.
    expect(filterComponents(['~(으)면'], new Set(['~(으)면']))).toEqual(['~(으)면'])
  })

  it('retains a real-but-possibly-unrelated card (documents this filter\'s scope boundary)', () => {
    // "~(으)ㄴ 후에" (after ~) IS a real card in the deck, so this filter alone
    // retains it. This filter only answers "does this string resolve to SOME
    // real card?" — it does NOT verify the resolved card is actually a correct
    // prerequisite *relationship* for the card that referenced it. Catching a
    // real-but-wrong-relationship component is GRAPH-01's job (prompt
    // tightening / Claude self-verification), not this deck-lookup filter's.
    expect(filterComponents(['~(으)ㄴ 후에'], new Set(['~(으)ㄴ 후에']))).toEqual(['~(으)ㄴ 후에'])
  })

  it('preserves original order and drops only the non-matching entries', () => {
    // "먹다" is a direct match (kept); "없는단어" resolves to nothing (dropped).
    // Order of the surviving entries must match their order in the input.
    expect(filterComponents(['먹다', '없는단어'], new Set(['먹다']))).toEqual(['먹다'])
    expect(filterComponents(['없는단어', '먹다'], new Set(['먹다']))).toEqual(['먹다'])
  })
})
