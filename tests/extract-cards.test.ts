import { describe, it, expect } from 'vitest'
import { parseExtractionResponse } from '../lib/extract-cards'

describe('parseExtractionResponse', () => {
  it('returns well-formed cards with normalized fields (distractors sliced, sentences filtered, components deduped/self-excluded)', () => {
    // Card A (가다): 4 distractors → sliced to 3; two sentences, one whose targetForm
    // ("안") is NOT a substring of its korean text → dropped by sentenceMatch filtering;
    // components duplicate "학교" plus self-reference "가다" → deduped to ["학교"].
    // Card B (~(으)면): straightforward valid grammar card.
    const cardA = {
      type: 'vocabulary',
      front: '가다',
      back: 'to go',
      distractors: ['w1', 'w2', 'w3', 'w4'],
      sentences: [
        { korean: '학교에 가다', targetForm: '가다', translation: 'go to school' },
        { korean: '학교에 가다', targetForm: '안', translation: 'not a real match' },
      ],
      components: ['학교', '학교', '가다'],
    }
    const cardB = {
      type: 'grammar',
      front: '~(으)면',
      back: 'if/when',
      distractors: ['a', 'b', 'c'],
      sentences: [{ korean: '가면 좋다', targetForm: '가면', translation: 'good if you go' }],
      components: ['가다', '이다'],
    }
    const result = parseExtractionResponse(JSON.stringify([cardA, cardB]))

    expect(result).toHaveLength(2)
    expect(result[0].front).toBe('가다')
    expect(result[0].distractors).toHaveLength(3)
    expect(result[0].sentences).toHaveLength(1)
    expect(result[0].sentences[0].targetForm).toBe('가다')
    expect(result[0].components).toEqual(['학교'])
    expect(result[1].front).toBe('~(으)면')
    expect(result[1].type).toBe('grammar')
  })

  it('drops a card with missing/empty front, keeps the valid sibling', () => {
    // Sibling A: valid. Sibling B: front is an empty/whitespace string → dropped.
    const valid = {
      type: 'vocabulary',
      front: '오다',
      back: 'to come',
      distractors: ['a', 'b', 'c'],
      sentences: [{ korean: '집에 오다', targetForm: '오다', translation: 'come home' }],
      components: [],
    }
    const badFront = { ...valid, front: '   ' }
    const result = parseExtractionResponse(JSON.stringify([valid, badFront]))

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('오다')
  })

  it('drops a card with missing/empty back, keeps the valid sibling', () => {
    const valid = {
      type: 'vocabulary',
      front: '먹다',
      back: 'to eat',
      distractors: ['a', 'b', 'c'],
      sentences: [{ korean: '밥을 먹다', targetForm: '먹다', translation: 'eat rice' }],
      components: [],
    }
    const badBack = { ...valid, front: '마시다', back: '' }
    const result = parseExtractionResponse(JSON.stringify([valid, badBack]))

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('먹다')
  })

  it('drops a card with a present-but-invalid type, keeps a card with absent type defaulted to vocabulary', () => {
    // "노트" has type "noun" — not one of vocabulary/grammar/phrase → dropped.
    // "책" has NO type field at all — tolerated, defaults to 'vocabulary' (matches
    // the existing `c.type ?? 'vocabulary'` behavior: absence tolerated, garbage rejected).
    const validVocab = {
      type: 'vocabulary',
      front: '가방',
      back: 'bag',
      distractors: ['a', 'b', 'c'],
      sentences: [{ korean: '가방을 사다', targetForm: '가방', translation: 'buy a bag' }],
      components: [],
    }
    const invalidType = { ...validVocab, front: '노트', type: 'noun' }
    const absentType: Record<string, unknown> = { ...validVocab, front: '책' }
    delete absentType.type
    const result = parseExtractionResponse(JSON.stringify([validVocab, invalidType, absentType]))

    expect(result).toHaveLength(2)
    const fronts = result.map((c) => c.front)
    expect(fronts).toContain('가방')
    expect(fronts).toContain('책')
    expect(fronts).not.toContain('노트')
    const bookCard = result.find((c) => c.front === '책')
    expect(bookCard?.type).toBe('vocabulary')
  })

  it('drops non-object array entries (bare string, null), keeps the valid sibling', () => {
    const valid = {
      type: 'vocabulary',
      front: '사다',
      back: 'to buy',
      distractors: ['a', 'b', 'c'],
      sentences: [{ korean: '가방을 사다', targetForm: '사다', translation: 'buy a bag' }],
      components: [],
    }
    const result = parseExtractionResponse(JSON.stringify([valid, 'just a string', null]))

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('사다')
  })

  it('preserves the existing truncation-salvage logic — a raw response with no closing bracket still yields its complete cards', () => {
    // Raw text mimics a truncated Claude stream: 2 complete card objects (no nested
    // arrays, so no stray "]" characters confuse the outer-array regex) followed by a
    // partial third object with no closing "]" anywhere in the string. The tolerant
    // salvage parser (lib/extract-cards.ts) must trim back to the last complete "},"
    // and re-close the array so the 2 complete cards are still recovered and validated.
    const truncatedText = `[
{"type":"vocabulary","front":"가다","back":"to go"},
{"type":"vocabulary","front":"오다","back":"to come"},
{"type":"vocabulary","front":"먹다","back":"to eat`
    const result = parseExtractionResponse(truncatedText)

    expect(result).toHaveLength(2)
    const fronts = result.map((c) => c.front)
    expect(fronts).toEqual(['가다', '오다'])
  })

  describe('deckNormalizedFronts filtering (GRAPH-03 write-path wiring)', () => {
    it('drops a spurious component not present in the deck set', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        components: ['학교', '완전히-지어낸단어'],
      }
      const deckSet = new Set(['학교'])
      const result = parseExtractionResponse(JSON.stringify([card]), deckSet)

      expect(result[0].components).toEqual(['학교'])
    })

    it('retains a component whose normalizeFront is in the deck set', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        components: ['학교'],
      }
      const deckSet = new Set(['학교'])
      const result = parseExtractionResponse(JSON.stringify([card]), deckSet)

      expect(result[0].components).toEqual(['학교'])
    })

    it('retains an abstract grammar-pattern component by deck-membership, not sentence-text containment (SC3)', () => {
      const card = {
        type: 'grammar',
        front: '가면 좋다',
        back: 'good if you go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '가면 좋다', targetForm: '가면', translation: 'good if you go' }],
        components: ['~(으)면'],
      }
      const deckSet = new Set(['~(으)면'])
      const result = parseExtractionResponse(JSON.stringify([card]), deckSet)

      expect(result[0].components).toEqual(['~(으)면'])
    })

    it('drops all components when deckSet is absent (default empty Set)', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        components: ['학교', '이다'],
      }
      const result = parseExtractionResponse(JSON.stringify([card]))

      expect(result[0].components).toEqual([])
    })

    it('still self-excludes the card\'s own headword before the deck filter runs', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        // "가다" duplicates the card's own front and would also be in the deck set —
        // self-exclusion must drop it BEFORE the deck-lookup filter ever sees it.
        components: ['가다', '학교'],
      }
      const deckSet = new Set(['가다', '학교'])
      const result = parseExtractionResponse(JSON.stringify([card]), deckSet)

      expect(result[0].components).toEqual(['학교'])
    })
  })
})
