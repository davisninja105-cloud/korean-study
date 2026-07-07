import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseExtractionResponse, ExtractionSchema, normalizeExtractedCards, extractCardsFromNotes } from '../lib/extract-cards'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import Anthropic, { AnthropicError } from '@anthropic-ai/sdk'

describe('schema shape (EXTRACT-01)', () => {
  // Walks a JSON-Schema tree (including $defs) collecting every node whose
  // "type" is "object" — used to assert additionalProperties:false is forced
  // on ALL of them (root wrapper, card item, and the sentence $defs ref),
  // not just the top level.
  function collectObjectNodes(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
    if (typeof node !== 'object' || node === null) return acc
    const obj = node as Record<string, unknown>
    if (obj.type === 'object') acc.push(obj)
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        value.forEach((v) => collectObjectNodes(v, acc))
      } else if (typeof value === 'object' && value !== null) {
        collectObjectNodes(value, acc)
      }
    }
    return acc
  }

  it('generates a wire schema where every object node forces additionalProperties:false, sentences keeps minItems:1, and notes is absent from required', () => {
    const wireSchema = zodOutputFormat(ExtractionSchema).schema as Record<string, unknown>

    // Root is a wrapper object whose only property is a cards array.
    expect(wireSchema.type).toBe('object')
    const properties = wireSchema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(['cards'])

    // Every object node (root, card item, and any $defs entries) forces
    // additionalProperties:false.
    const objectNodes = collectObjectNodes(wireSchema)
    expect(objectNodes.length).toBeGreaterThanOrEqual(2) // at least root + card item ($defs sentence too)
    for (const node of objectNodes) {
      expect(node.additionalProperties).toBe(false)
    }

    // sentences array keeps minItems: 1 (server-enforced whitelist survivor).
    const cardsSchema = properties.cards as Record<string, unknown>
    const cardItemSchema = cardsSchema.items as Record<string, unknown>
    const cardProperties = cardItemSchema.properties as Record<string, unknown>
    const sentencesSchema = cardProperties.sentences as Record<string, unknown>
    expect(sentencesSchema.minItems).toBe(1)

    // notes is absent from the card object's required list (optional field).
    const required = cardItemSchema.required as string[]
    expect(required).not.toContain('notes')
  })

  it('throws AnthropicError when parsing mid-card truncated wrapper text (SDK-parse-throw drift guard)', () => {
    const truncated = '{"cards":[{"type":"vocabulary"'
    expect(() => zodOutputFormat(ExtractionSchema).parse(truncated)).toThrow(AnthropicError)
  })

  it('throws AnthropicError when parsing valid JSON that violates the schema (empty sentences array)', () => {
    const violatesSchema = JSON.stringify({
      cards: [
        {
          type: 'vocabulary',
          front: 'a',
          back: 'b',
          distractors: [],
          sentences: [], // violates .min(1) — client-side zod enforces this
          components: [],
        },
      ],
    })
    expect(() => zodOutputFormat(ExtractionSchema).parse(violatesSchema)).toThrow(AnthropicError)
  })

  it('parses a valid wrapper string and strips unknown extra keys (documents zod v4 SDK-observed behavior)', () => {
    const withExtraKey = JSON.stringify({
      cards: [
        {
          type: 'vocabulary',
          front: 'a',
          back: 'b',
          distractors: [],
          sentences: [{ korean: 'x', targetForm: 'x', translation: 'y' }],
          components: [],
          bogus: 'should be stripped',
        },
      ],
    })
    const parsed = zodOutputFormat(ExtractionSchema).parse(withExtraKey) as {
      cards: Array<Record<string, unknown>>
    }
    expect(parsed.cards).toHaveLength(1)
    expect(parsed.cards[0]).not.toHaveProperty('bogus')
  })

  it('happy-path object input (normalizeExtractedCards) and salvaged text input (parseExtractionResponse) produce identical normalized output (EXTRACT-01 path equivalence)', () => {
    const rawCards = [
      {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        components: ['학교'],
      },
      {
        type: 'grammar',
        front: '~(으)면',
        back: 'if/when',
        distractors: ['x', 'y', 'z'],
        sentences: [{ korean: '가면 좋다', targetForm: '가면', translation: 'good if you go' }],
        components: ['가다'],
      },
    ]
    const deckSet = new Set(['학교'])

    // Happy path: parsed_output.cards is a raw JS object array, consumed
    // directly by normalizeExtractedCards — no JSON.parse in between.
    const happyPathResult = normalizeExtractedCards(rawCards, deckSet)

    // Salvage/text path: the same cards serialized to the {cards:[...]}
    // wrapper text and re-parsed by parseExtractionResponse.
    const textPathResult = parseExtractionResponse(JSON.stringify({ cards: rawCards }), deckSet)

    expect(happyPathResult).toEqual(textPathResult)
  })
})

// WR-03: extractCardsFromNotes contains the actual streaming/salvage control
// flow (the "register .on('text') before awaiting finalMessage()" ordering,
// the happy-path parsed_output branch, the zero-text-blocks throw, and the
// salvage-vs-rethrow-original branch) and was previously untested — every
// other test in this file exercises only the pure helpers below it. These
// tests replace Anthropic.Messages.prototype.stream with a fake that mimics
// the real MessageStream's on('text', cb) + finalMessage() contract closely
// enough to drive each branch without a network call.
describe('extractCardsFromNotes streaming/salvage control flow (WR-03)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  interface FakeStreamOpts {
    textChunks?: string[]
    resolveWith?: unknown
    rejectWith?: unknown
  }

  // Builds a fake MessageStream: `on('text', cb)` just registers a listener
  // (matching the real SDK); `finalMessage()` replays any queued text chunks
  // to those listeners (simulating streaming deltas arriving before the
  // final message settles) and then resolves/rejects — mirroring the real
  // SDK's guarantee that text delivered via events precedes finalMessage()
  // settling, which is exactly the ordering extractCardsFromNotes depends on.
  function mockAnthropicStream(opts: FakeStreamOpts) {
    const { textChunks = [], resolveWith, rejectWith } = opts
    const textListeners: Array<(delta: string) => void> = []
    const fakeStream = {
      on(event: string, cb: (...args: unknown[]) => void) {
        if (event === 'text') textListeners.push(cb as (delta: string) => void)
        return fakeStream
      },
      async finalMessage() {
        for (const chunk of textChunks) {
          textListeners.forEach((cb) => cb(chunk))
        }
        if (rejectWith !== undefined) throw rejectWith
        return resolveWith
      },
    }
    vi.spyOn(Anthropic.Messages.prototype, 'stream').mockReturnValue(
      fakeStream as unknown as ReturnType<typeof Anthropic.Messages.prototype.stream>
    )
  }

  it('(a) happy path: a resolved message with a non-null parsed_output flows through normalizeExtractedCards', async () => {
    mockAnthropicStream({
      resolveWith: {
        stop_reason: 'end_turn',
        parsed_output: {
          cards: [
            {
              type: 'vocabulary',
              front: '가다',
              back: 'to go',
              distractors: ['a', 'b', 'c'],
              sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
              components: [],
            },
          ],
        },
      },
    })

    const result = await extractCardsFromNotes('lesson notes')

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('가다')
    expect(result[0].back).toBe('to go')
  })

  it('(b) truncation salvage: finalMessage() rejects with AnthropicError + non-empty rawText salvages the completed card', async () => {
    // Same truncated-mid-card-2 fixture already proven (in the
    // parseExtractionResponse suite above) to salvage exactly card 1.
    const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school"}]},
{"type":"vocabulary","front":"오다","back":"to come","sentences":[{"korean":"집에 오다","targetForm":"오다","translation":"come home`

    mockAnthropicStream({
      textChunks: [truncatedText],
      rejectWith: new AnthropicError('stream truncated'),
    })

    const result = await extractCardsFromNotes('lesson notes')

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('가다')
  })

  it('(c) salvage-fails-so-rethrow-original: rethrows the ORIGINAL AnthropicError, not the generic salvage error', async () => {
    const originalErr = new AnthropicError('stream truncated mid-first-card')
    // Cut happens before any top-level card boundary closes — the same
    // fixture proven above (parseExtractionResponse suite) to throw
    // "No cards found in extraction response" on its own. The salvage path
    // must swallow THAT error and rethrow originalErr instead.
    const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school`

    mockAnthropicStream({
      textChunks: [truncatedText],
      rejectWith: originalErr,
    })

    await expect(extractCardsFromNotes('lesson notes')).rejects.toBe(originalErr)
  })

  it('(d) resolved message with zero text blocks (no parsed_output, not a truncation) throws with stop_reason context', async () => {
    mockAnthropicStream({
      resolveWith: { stop_reason: 'refusal', parsed_output: null },
    })

    await expect(extractCardsFromNotes('lesson notes')).rejects.toThrow(
      /No text response from Claude \(stop_reason: refusal\)/
    )
  })
})

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
    // Deck set includes "학교" so this test isolates dedup/self-exclusion behavior
    // from the deck-lookup filter (GRAPH-03, covered separately below).
    const deckSet = new Set(['학교'])
    const result = parseExtractionResponse(JSON.stringify({ cards: [cardA, cardB] }), deckSet)

    expect(result).toHaveLength(2)
    expect(result[0].front).toBe('가다')
    expect(result[0].distractors).toHaveLength(3)
    expect(result[0].sentences).toHaveLength(1)
    expect(result[0].sentences[0].targetForm).toBe('가다')
    expect(result[0].components).toEqual(['학교'])
    expect(result[1].front).toBe('~(으)면')
    expect(result[1].type).toBe('grammar')
  })

  it('coerces a malformed notes value to undefined and filters non-string distractors entries (IN-01)', () => {
    const card = {
      type: 'vocabulary',
      front: '가다',
      back: 'to go',
      notes: 12345, // malformed — not a string
      distractors: ['plausible', { bogus: 'object' }, 'also plausible', 'third'],
      sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
      components: [],
    }
    const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

    expect(result).toHaveLength(1)
    expect(result[0].notes).toBeUndefined()
    expect(result[0].distractors).toEqual(['plausible', 'also plausible', 'third'])
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
    const result = parseExtractionResponse(JSON.stringify({ cards: [valid, badFront] }))

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
    const result = parseExtractionResponse(JSON.stringify({ cards: [valid, badBack] }))

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
    const result = parseExtractionResponse(
      JSON.stringify({ cards: [validVocab, invalidType, absentType] })
    )

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
    const result = parseExtractionResponse(
      JSON.stringify({ cards: [valid, 'just a string', null] })
    )

    expect(result).toHaveLength(1)
    expect(result[0].front).toBe('사다')
  })

  it('preserves the existing truncation-salvage logic — a raw wrapper response with no closing brace still yields its complete cards', () => {
    // Raw text mimics a truncated Claude stream inside the {cards:[...]} wrapper:
    // 2 complete card objects (each given a blank-safe sentence per EXTRACT-02
    // migration note — keeps Task 2's zero-sentence-rejection diff purely
    // behavioral) followed by a partial third object with no closing brace
    // anywhere in the string. The tolerant salvage parser must trim back to the
    // last complete top-level card boundary (depth === 2) and re-close both the
    // cards array and the wrapper object so the 2 complete cards are recovered.
    const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school"}]},
{"type":"vocabulary","front":"오다","back":"to come","sentences":[{"korean":"집에 오다","targetForm":"오다","translation":"come home"}]},
{"type":"vocabulary","front":"먹다","back":"to eat`
    const result = parseExtractionResponse(truncatedText)

    expect(result).toHaveLength(2)
    const fronts = result.map((c) => c.front)
    expect(fronts).toEqual(['가다', '오다'])
  })

  it('salvages complete cards when truncation happens mid-way through a nested sentences array (WR-01)', () => {
    // Two complete card objects, each with a nested "sentences" array (the real
    // shape every card now has), followed by a third card whose "sentences"
    // array itself gets cut off mid-element. The last "}," in the raw text
    // belongs to the truncated nested sentence object, NOT the card boundary —
    // a depth-unaware lastIndexOf('},') would slice there and produce
    // bracket-mismatched JSON. The depth-aware scanner must instead find the
    // last '},' that closes a TOP-LEVEL card object (depth === 2, after "가다"'s
    // sentences array), recovering both complete cards.
    const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school"}]},
{"type":"vocabulary","front":"오다","back":"to come","sentences":[{"korean":"집에 오다","targetForm":"오다","translation":"come home"}]},
{"type":"vocabulary","front":"먹다","back":"to eat","sentences":[{"korean":"밥을 먹다","targetForm":"먹다","translation":"eat rice`
    const result = parseExtractionResponse(truncatedText)

    expect(result).toHaveLength(2)
    const fronts = result.map((c) => c.front)
    expect(fronts).toEqual(['가다', '오다'])
  })

  describe('wrapper-shape truncation salvage (EXTRACT-02)', () => {
    it('salvages card 1 when truncation cuts mid-card-2 inside the wrapper', () => {
      const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school"}]},
{"type":"vocabulary","front":"오다","back":"to come","sentences":[{"korean":"집에 오다","targetForm":"오다","translation":"come home`
      const result = parseExtractionResponse(truncatedText)

      expect(result).toHaveLength(1)
      expect(result[0].front).toBe('가다')
    })

    it('throws when the cut happens mid-first-card (no complete top-level card boundary exists)', () => {
      const truncatedText = `{"cards":[
{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school`
      expect(() => parseExtractionResponse(truncatedText)).toThrow()
    })

    it('still parses all cards when truncation happens after the cards array closes but before the wrapper object closes', () => {
      // Ends with the cards array's closing "]" but is missing the wrapper's
      // final "}" — full JSON.parse fails, but the depth-2 salvage scanner finds
      // the last complete card's boundary and the re-close (']}') still succeeds.
      const truncatedText =
        '{"cards":[{"type":"vocabulary","front":"가다","back":"to go","sentences":[{"korean":"학교에 가다","targetForm":"가다","translation":"go to school"}]}]'
      const result = parseExtractionResponse(truncatedText)

      expect(result).toHaveLength(1)
      expect(result[0].front).toBe('가다')
    })

    it('throws on legacy bare-array input (no wrapper) — the contract is wrapper-only now', () => {
      const legacyBareArray = JSON.stringify([
        {
          type: 'vocabulary',
          front: '가다',
          back: 'to go',
          sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        },
      ])
      expect(() => parseExtractionResponse(legacyBareArray)).toThrow()
    })
  })

  describe('blank-safety enforcement (EXTRACT-03)', () => {
    it('drops a card whose sentences all fail .found, keeps a valid sibling', () => {
      const noMatchCard = {
        type: 'vocabulary',
        front: '이상한',
        back: 'strange',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '없는말', translation: 'no match' }],
        components: [],
      }
      const validCard = {
        type: 'vocabulary',
        front: '오다',
        back: 'to come',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '집에 오다', targetForm: '오다', translation: 'come home' }],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [noMatchCard, validCard] }))

      expect(result).toHaveLength(1)
      expect(result[0].front).toBe('오다')
    })

    it('drops a card whose only sentence has a single-character targetForm (found-but-unsafe)', () => {
      const card = {
        type: 'vocabulary',
        front: '물',
        back: 'water',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '물을 사다', targetForm: '물', translation: 'buy water' }],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result).toHaveLength(0)
    })

    it('drops a card whose only sentence has a targetForm occurring twice (found-but-unsafe)', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '가다 또 가다', targetForm: '가다', translation: 'go again' }],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result).toHaveLength(0)
    })

    it('promotes a safe sentence to index 0 and RETAINS the unsafe survivor after it (stable partition, not dropped)', () => {
      const card = {
        type: 'grammar',
        front: '~(으)면',
        back: 'if/when',
        distractors: ['a', 'b', 'c'],
        sentences: [
          { korean: '가다 또 가다', targetForm: '가다', translation: 'unsafe — occurs twice' },
          { korean: '가면 좋다', targetForm: '가면', translation: 'good if you go' },
        ],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result).toHaveLength(1)
      expect(result[0].sentences).toHaveLength(2)
      expect(result[0].sentences[0].targetForm).toBe('가면')
      expect(result[0].sentences[1].targetForm).toBe('가다')
    })

    it('drops a card with an empty sentences array (possible on the salvage path)', () => {
      const card = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result).toHaveLength(0)
    })

    it('caps the returned sentences at 3 even when 4 are blank-safe', () => {
      const card = {
        type: 'grammar',
        front: '~고',
        back: 'and (connector)',
        distractors: ['a', 'b', 'c'],
        sentences: [
          { korean: '가고 싶다', targetForm: '가고', translation: 's1' },
          { korean: '먹고 싶다', targetForm: '먹고', translation: 's2' },
          { korean: '보고 싶다', targetForm: '보고', translation: 's3' },
          { korean: '자고 싶다', targetForm: '자고', translation: 's4' },
        ],
        components: [],
      }
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result[0].sentences).toHaveLength(3)
    })
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
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }), deckSet)

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
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }), deckSet)

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
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }), deckSet)

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
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }))

      expect(result[0].components).toEqual([])
    })

    it('retains a component referencing a sibling card in the same extraction batch (CR-01), even though neither card is pre-existing in the deck set', () => {
      // 학교 and 가다 are both brand-new in this response (deckSet is empty —
      // neither exists in the DB yet). 학교's components legitimately reference
      // 가다, a sibling card produced in this same batch. Before CR-01 this was
      // stripped because filterComponents only checked the pre-batch deck set.
      const school = {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '학교', translation: 'go to school' }],
        components: ['가다'],
      }
      const go = {
        type: 'vocabulary',
        front: '가다',
        back: 'to go',
        distractors: ['a', 'b', 'c'],
        sentences: [{ korean: '학교에 가다', targetForm: '가다', translation: 'go to school' }],
        components: [],
      }
      const deckSet = new Set<string>() // empty — neither card pre-exists in the DB
      const result = parseExtractionResponse(JSON.stringify({ cards: [school, go] }), deckSet)

      const schoolResult = result.find((c) => c.front === '학교')
      expect(schoolResult?.components).toEqual(['가다'])
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
      const result = parseExtractionResponse(JSON.stringify({ cards: [card] }), deckSet)

      expect(result[0].components).toEqual(['학교'])
    })
  })
})
