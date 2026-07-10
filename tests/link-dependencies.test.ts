import { describe, it, expect } from 'vitest'
import {
  resolveDependencyEdges,
  computeMissingEdges,
  type DeckCardRow,
  type ResolvedEdge,
  type DependencyLinkTarget,
} from '../lib/link-dependencies'

// --- helpers -------------------------------------------------------------

/** A deck row with a Hangul front and an optional components JSON string. */
function row(
  id: string,
  normalizedFront: string,
  components: string[] | null
): DeckCardRow {
  return { id, normalizedFront, components: components === null ? null : JSON.stringify(components) }
}

// --- resolveDependencyEdges (existing — first-ever contract tests) ------

describe('resolveDependencyEdges', () => {
  it('resolves a component string to an edge via normalizeFront lookup', () => {
    const keyToId = new Map([
      ['가다', 'card-가다'],
    ])
    const targets: DependencyLinkTarget[] = [
      { id: 'card-보다', components: ['가다'] },
    ]
    expect(resolveDependencyEdges(keyToId, targets)).toEqual([
      { cardId: 'card-보다', prerequisiteId: 'card-가다' },
    ])
  })

  it('resolves through normalizeFront (strips trailing English gloss)', () => {
    // The component "가다 (to go)" normalizes to "가다" and still matches.
    const keyToId = new Map([
      ['가다', 'card-가다'],
    ])
    const targets: DependencyLinkTarget[] = [
      { id: 'dep', components: ['가다 (to go)'] },
    ]
    expect(resolveDependencyEdges(keyToId, targets)).toEqual([
      { cardId: 'dep', prerequisiteId: 'card-가다' },
    ])
  })

  it('drops unresolvable components', () => {
    const keyToId = new Map([['가다', 'card-가다']])
    const targets: DependencyLinkTarget[] = [
      { id: 'dep', components: ['가다', '없는단어'] },
    ]
    expect(resolveDependencyEdges(keyToId, targets)).toEqual([
      { cardId: 'dep', prerequisiteId: 'card-가다' },
    ])
  })

  it('drops self-references (component normalizing to the card own front)', () => {
    const keyToId = new Map([
      ['가다', 'card-가다'],
    ])
    const targets: DependencyLinkTarget[] = [
      { id: 'card-가다', components: ['가다'] },
    ]
    expect(resolveDependencyEdges(keyToId, targets)).toEqual([])
  })

  it('dedupes repeated (cardId, prerequisiteId) pairs across the call', () => {
    const keyToId = new Map([
      ['가다', 'card-가다'],
    ])
    const targets: DependencyLinkTarget[] = [
      { id: 'dep', components: ['가다', '가다'] },
      { id: 'dep', components: ['가다'] },
    ]
    expect(resolveDependencyEdges(keyToId, targets)).toEqual([
      { cardId: 'dep', prerequisiteId: 'card-가다' },
    ])
  })
})

// --- computeMissingEdges (new — pure resolver-diff) ----------------------

describe('computeMissingEdges', () => {
  it('builds its lookup from ALL cards including components:null rows — a leaf prerequisite is resolvable', () => {
    // Regression test against the old script's WHERE components IS NOT NULL gap:
    // card B has components: null (a leaf) but is still a valid prerequisite
    // target for card A's component naming B's front.
    const cards: DeckCardRow[] = [
      row('A', '공부', ['길']),   // A's component names B's front
      row('B', '길', null),      // leaf prerequisite, no components of its own
    ]
    expect(computeMissingEdges(cards, [])).toEqual([
      { cardId: 'A', prerequisiteId: 'B' },
    ])
  })

  it('resolves a forward reference (card synced first, prerequisite created later)', () => {
    // Order in the array is deliberately "first-synced" card first. card B
    // appears AFTER card A even though A depends on B — the forward-reference
    // shape that the per-lesson pass misses and the full-deck relink catches.
    // normalizedFront holds the already-normalized form (as the DB stores it).
    const cards: DeckCardRow[] = [
      row('A', '공부', ['~(으)로']), // A's component names a later card's front
      row('B', '~(으)로', null),     // B created later; leaf (no own components)
    ]
    expect(computeMissingEdges(cards, [])).toEqual([
      { cardId: 'A', prerequisiteId: 'B' },
    ])
  })

  it('resolves through normalizeFront in both the lookup key and the component', () => {
    // Card B's normalizedFront already has the gloss stripped; the component
    // string still carries "(direction particle)" and must normalize to match.
    const cards: DeckCardRow[] = [
      row('A', '공부', ['~(으)로 (direction particle)']),
      row('B', '~(으)로', null),
    ]
    expect(computeMissingEdges(cards, [])).toEqual([
      { cardId: 'A', prerequisiteId: 'B' },
    ])
  })

  it('skips a row whose components string is not valid JSON without throwing', () => {
    const cards: DeckCardRow[] = [
      { id: 'A', normalizedFront: '공부', components: 'not-json{' },
      row('B', '공부', null),
    ]
    expect(() => computeMissingEdges(cards, [])).not.toThrow()
    expect(computeMissingEdges(cards, [])).toEqual([])
  })

  it('skips a row whose components parse to a non-array', () => {
    const cards: DeckCardRow[] = [
      { id: 'A', normalizedFront: '공부', components: JSON.stringify({ foo: 'bar' }) },
      row('B', '공부', null),
    ]
    expect(computeMissingEdges(cards, [])).toEqual([])
  })

  it('skips array elements that are not strings or are empty strings', () => {
    const cards: DeckCardRow[] = [
      { id: 'A', normalizedFront: '공부', components: JSON.stringify([42, '', '   ', null, true, '길']) },
      row('B', '길', null),
    ]
    // Only the valid non-empty string '길' resolves; numbers/empty/null/bool drop.
    expect(computeMissingEdges(cards, [])).toEqual([
      { cardId: 'A', prerequisiteId: 'B' },
    ])
  })

  it('subtracts existing edges from the result', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['길']),
      row('B', '길', null),
    ]
    const existing: ResolvedEdge[] = [
      { cardId: 'A', prerequisiteId: 'B' },
    ]
    expect(computeMissingEdges(cards, existing)).toEqual([])
  })

  it('subtracts only the exact (cardId, prerequisiteId) pairs present in existingEdges', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['길', '물']),
      row('B', '길', null),
      row('C', '물', null),
    ]
    const existing: ResolvedEdge[] = [
      { cardId: 'A', prerequisiteId: 'B' }, // already linked
    ]
    expect(computeMissingEdges(cards, existing)).toEqual([
      { cardId: 'A', prerequisiteId: 'C' },
    ])
  })

  it('drops self-references (component resolves to the same card)', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['공부']),
    ]
    expect(computeMissingEdges(cards, [])).toEqual([])
  })

  it('returns edges in first-seen order', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['물', '길']),
      row('B', '길', null),
      row('C', '물', null),
    ]
    expect(computeMissingEdges(cards, [])).toEqual([
      { cardId: 'A', prerequisiteId: 'C' },
      { cardId: 'A', prerequisiteId: 'B' },
    ])
  })

  // --- RELIABILITY-03 idempotency algebra (pure layer) -------------------

  it('second run over the first run result returns an empty array', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['길', '물']),
      row('B', '길', null),
      row('C', '물', null),
    ]
    const firstRun = computeMissingEdges(cards, [])
    expect(firstRun.length).toBeGreaterThan(0)
    expect(computeMissingEdges(cards, firstRun)).toEqual([])
  })

  it('is idempotent when existing edges already contain a superset-subset mix', () => {
    const cards: DeckCardRow[] = [
      row('A', '공부', ['길', '물']),
      row('B', '길', null),
      row('C', '물', null),
    ]
    const firstRun = computeMissingEdges(cards, [])
    // Mix an unrelated existing edge with the full first-run result.
    const mixed: ResolvedEdge[] = [
      { cardId: 'X', prerequisiteId: 'Y' }, // unrelated, not in the deck
      ...firstRun,
    ]
    expect(computeMissingEdges(cards, mixed)).toEqual([])
  })
})
