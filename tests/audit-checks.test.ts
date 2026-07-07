import { describe, it, expect } from 'vitest'
import {
  classifyBlankSafety,
  notFoundSentenceIndices,
  frontHasRomanization,
  sentenceHasRomanization,
  checkDistractors,
  superNormalize,
  normalizedFrontMismatch,
  frontUntrimmed,
  clusterNearDuplicates,
  countStaleComponents,
  runAuditChecks,
} from '../lib/audit-checks'

describe('classifyBlankSafety (AUDIT-02)', () => {
  it('returns "zero-sentences" for an empty sentence array', () => {
    // A card with no example sentences cannot be blank-tested at all — its own
    // distinct sub-class, reported separately so Phase 22 can decide whether to
    // regenerate sentences or retire the card.
    expect(classifyBlankSafety([])).toBe('zero-sentences')
  })

  it('returns "ok" when the first sentence is blank-safe (AUDIT-02)', () => {
    // "저는 밥을 먹다" (I eat rice) contains "먹다" (to eat) exactly once, and
    // "먹다" is 2 syllables — sentenceMatch().safeToBlank is true. This is the
    // post-Phase-20 invariant every persisted card's sentences[0] should hold.
    expect(
      classifyBlankSafety([
        { korean: '저는 밥을 먹다', targetForm: '먹다', orderIndex: 0 },
      ])
    ).toBe('ok')
  })

  it('returns "unsafe-first" when sentences[0] is unsafe but a later sentence is safe', () => {
    // sentences[0] has a 1-syllable targetForm "가" (go) — sentenceMatch marks
    // length<=1 as unsafe-to-blank because it would match inside other words.
    // sentences[1] is a normal safe sentence. Phase 20's safe-first reorder
    // fixes this in place by swapping orderIndex — distinct from zero-safe.
    expect(
      classifyBlankSafety([
        { korean: '이것이 가나다', targetForm: '가', orderIndex: 0 },
        { korean: '저는 밥을 먹다', targetForm: '먹다', orderIndex: 1 },
      ])
    ).toBe('unsafe-first')
  })

  it('returns "zero-safe" when no sentence in the card is blank-safe', () => {
    // Both sentences use 1-syllable target forms (length<=1 → unsafe per
    // sentenceMatch). No safe-first reorder can rescue the card — Phase 22
    // must regenerate the sentences (or retire the card). Distinct fix
    // strategy from unsafe-first, which is why these stay separate classes.
    expect(
      classifyBlankSafety([
        { korean: '가나다', targetForm: '가', orderIndex: 0 },
        { korean: '마바사', targetForm: '마', orderIndex: 1 },
      ])
    ).toBe('zero-safe')
  })

  it('returns "zero-safe" when every target occurs multiple times (multi-occurrence is unsafe)', () => {
    // "를" appears twice in the sentence — sentenceMatch marks multi-occurrence
    // as unsafe-to-blank because the blank would be ambiguous. This documents
    // that the second safeToBlank failure mode (not just length<=1) also
    // classifies as zero-safe when no sentence passes.
    expect(
      classifyBlankSafety([
        { korean: '을를 을를', targetForm: '를', orderIndex: 0 },
      ])
    ).toBe('zero-safe')
  })
})

describe('notFoundSentenceIndices (AUDIT-02)', () => {
  it('returns [] when every sentence targetForm is found verbatim in its korean', () => {
    // Both sentences contain their target forms — no un-highlighted render.
    expect(
      notFoundSentenceIndices([
        { korean: '저는 밥을 먹다', targetForm: '먹다', orderIndex: 0 },
        { korean: '학교에 가요', targetForm: '가요', orderIndex: 1 },
      ])
    ).toEqual([])
  })

  it('returns the indices of sentences whose targetForm is absent from korean', () => {
    // sentences[0] is fine; sentences[1] has targetForm "먹다" but the korean
    // text is about going to school — the targetForm is not found, so the UI
    // would render the sentence un-highlighted and fill-blank would have no
    // answer. Reported as its own blank-safety sub-class.
    expect(
      notFoundSentenceIndices([
        { korean: '저는 밥을 먹다', targetForm: '먹다', orderIndex: 0 },
        { korean: '학교에 가요', targetForm: '먹다', orderIndex: 1 },
      ])
    ).toEqual([1])
  })

  it('returns multiple indices when several sentences are not-found', () => {
    // Both sentences carry a targetForm absent from their korean — both
    // indices returned, in ascending order.
    expect(
      notFoundSentenceIndices([
        { korean: '안녕하세요', targetForm: '먹다', orderIndex: 0 },
        { korean: '반갑습니다', targetForm: '가다', orderIndex: 1 },
      ])
    ).toEqual([0, 1])
  })
})

describe('frontHasRomanization (AUDIT-02)', () => {
  it('returns false for a front whose only Latin is a trailing English gloss (scope boundary)', () => {
    // "~(으)로 (direction particle)" — the trailing "(direction particle)" is
    // an English clarifying gloss. normalizeFront strips it (Hangul-absent,
    // ASCII-present paren group), leaving "~(으)로" which is all Hangul + ~.
    // This is the RESEARCH Pitfall 3 guard: the heuristic must NOT flag
    // legitimate glosses as romanization leakage.
    expect(frontHasRomanization('~(으)로 (direction particle)')).toBe(false)
  })

  it('returns true when Latin letters survive outside any paren group', () => {
    // "kkujunhada" is a bare romanized fragment with no paren gloss to strip —
    // normalizeFront leaves it untouched, and the LATIN test sees the
    // surviving ASCII. This is real romanization leakage.
    expect(frontHasRomanization('kkujunhada')).toBe(true)
  })

  it('returns false for an all-Hangul front', () => {
    // "먹다" (to eat) — pure Hangul, no Latin anywhere. No gloss, no leakage.
    expect(frontHasRomanization('먹다')).toBe(false)
  })

  it('returns false for a grammar pattern with a Hangul paren group (gloss NOT stripped)', () => {
    // "~(으)면" — the paren group contains Hangul, so normalizeFront keeps it
    // intact. No Latin survives, so no romanization flag. Documents that the
    // gloss-stripping heuristic is Hangul-aware (lib/card-key.ts regex).
    expect(frontHasRomanization('~(으)면')).toBe(false)
  })
})

describe('sentenceHasRomanization (AUDIT-02)', () => {
  it('returns true when a sentence korean contains Latin letters', () => {
    // "저는 apple을 먹어요" — the English word "apple" leaked into the Korean
    // sentence. Sentences have NO gloss allowance, so any Latin is leakage.
    expect(sentenceHasRomanization('저는 apple을 먹어요')).toBe(true)
  })

  it('returns false for an all-Hangul sentence', () => {
    // "저는 밥을 먹어요" — pure Hangul (and particles), no Latin. Clean.
    expect(sentenceHasRomanization('저는 밥을 먹어요')).toBe(false)
  })

  it('returns false for an all-Hangul sentence with punctuation', () => {
    // "학교에 갔어요." — Hangul + a period. No Latin letters. Clean.
    expect(sentenceHasRomanization('학교에 갔어요.')).toBe(false)
  })
})

describe('checkDistractors (AUDIT-02)', () => {
  it('returns ["null"] when the distractors column is null', () => {
    // A null column is its own anomaly — the prompt demands exactly 3. No
    // other anomalies are reported (cannot inspect what isn't there).
    expect(checkDistractors(null, 'back')).toEqual(['null'])
  })

  it('returns ["malformed-json"] for unparseable JSON string (never throws)', () => {
    // "not json" is not valid JSON — JSON.parse throws, caught by the
    // try/catch, and reported as a 'malformed-json' finding. V5 input
    // validation: DB JSON columns are untrusted (retro-filter-cleanup.mts
    // precedent).
    expect(checkDistractors('not json', 'back')).toEqual(['malformed-json'])
  })

  it('returns ["malformed-json"] when JSON parses but is not an array', () => {
    // '{"a":1}' parses to an object, not an array — same 'malformed-json'
    // finding class. The UI's parse/pad treats this shape as [] at render;
    // the audit flags it as a stored anomaly.
    expect(checkDistractors('{"a":1}', 'back')).toEqual(['malformed-json'])
  })

  it('includes "not-string-array" when an entry is non-string', () => {
    // [1, 2, 3] parses as an array of length 3 (count ok), but every entry
    // is a number, not a string. The prompt demands English-meaning strings.
    expect(checkDistractors('[1, 2, 3]', 'back')).toEqual(['not-string-array'])
  })

  it('includes "count-mismatch" for an array of length 2 (under 3)', () => {
    // ["a", "b"] — 2 entries, prompt demands exactly 3. Phase 20 warns
    // when < 3 but persists; UI pads from other cards' backs. Legacy rows
    // can hold any shape.
    expect(checkDistractors('["a", "b"]', 'back')).toEqual(['count-mismatch'])
  })

  it('includes "count-mismatch" for an array of length 4 (over 3)', () => {
    // ["a", "b", "c", "d"] — 4 entries. Phase 20 slices to 3 at extraction,
    // UI also slices, but stored legacy rows can exceed 3 (RESEARCH Pitfall 6).
    expect(checkDistractors('["a", "b", "c", "d"]', 'back')).toEqual([
      'count-mismatch',
    ])
  })

  it('includes "duplicate-entries" when two entries are identical strings', () => {
    // ["a", "a", "b"] — length 3 (count ok), but "a" appears twice. Duplicate
    // distractors make multiple-choice too easy.
    expect(checkDistractors('["a", "a", "b"]', 'back')).toEqual([
      'duplicate-entries',
    ])
  })

  it('includes "equals-back" when an entry strictly equals the card back', () => {
    // ["a", "b", "back"] — the third distractor equals the card's back
    // (the correct answer), which would surface the answer in multiple-choice.
    expect(checkDistractors('["a", "b", "back"]', 'back')).toEqual([
      'equals-back',
    ])
  })

  it('returns [] for a healthy 3-distinct-string array none equal to back', () => {
    // ["a", "b", "c"] vs back "back" — length 3, all strings, no duplicates,
    // none equal to back. The empty array means healthy.
    expect(checkDistractors('["a", "b", "c"]', 'back')).toEqual([])
  })

  it('accumulates multiple anomalies (count-mismatch + duplicate-entries)', () => {
    // ["a", "a"] — length 2 (count-mismatch) AND "a" duplicated
    // (duplicate-entries). Both anomalies are reported together; empty array
    // would mean healthy, so this documents the accumulation contract.
    const result = checkDistractors('["a", "a"]', 'back')
    expect(result).toContain('count-mismatch')
    expect(result).toContain('duplicate-entries')
    expect(result).toHaveLength(2)
  })

  it('accumulates count-mismatch + equals-back + duplicate-entries for a broken legacy row', () => {
    // ["x", "x", "back", "y"] — length 4 (count-mismatch), "x" duplicated
    // (duplicate-entries), "back" equals back (equals-back). Three anomalies
    // at once — documents that every applicable finding is reported.
    const result = checkDistractors('["x", "x", "back", "y"]', 'back')
    expect(result).toContain('count-mismatch')
    expect(result).toContain('duplicate-entries')
    expect(result).toContain('equals-back')
    expect(result).toHaveLength(3)
  })
})

describe('superNormalize (AUDIT-02)', () => {
  it('~(으)면 and (으)면 cluster to the same key (parity fixture, AUDIT-02)', () => {
    // The VALIDATION.md parity fixture: tilde and paren-group stripping make
    // these two grammar-pattern notations collapse to the same bare Hangul
    // core, so near-duplicate clustering groups them together.
    expect(superNormalize('~(으)면')).toBe(superNormalize('(으)면'))
  })

  it('preserves slashes (meaning-bearing — rejected slash-removal decision)', () => {
    // "아/어" (verb alternation pattern) — the slash is intentionally left
    // as-is because removing it changes meaning. The commented-out
    // slash-removal decision is preserved in the lifted source.
    expect(superNormalize('아/어')).toContain('/')
  })

  it('lowercases Latin letters', () => {
    // NFC → strip ~ → strip parens → collapse ws → trim → lowercase.
    // "HelloWorld" has no ~ or parens, so it just lowercases.
    expect(superNormalize('HelloWorld')).toBe('helloworld')
  })

  it('NFC-normalizes (composed and decomposed forms produce the same key)', () => {
    // "가" (가) has a composed NFC form and a decomposed NFD form. superNormalize
    // applies .normalize('NFC') first, so both inputs produce the same key.
    expect(superNormalize('가'.normalize('NFC'))).toBe(
      superNormalize('가'.normalize('NFD'))
    )
  })

  it('collapses internal whitespace', () => {
    // "a  b   c" → "a b c" (whitespace runs collapsed to a single space).
    expect(superNormalize('a  b   c')).toBe('a b c')
  })

  it('strips all paren groups including Hangul ones', () => {
    // "(으)면" → "면" — the Hangul paren group (으) is removed entirely.
    expect(superNormalize('(으)면')).toBe('면')
  })

  it('strips all tilde characters', () => {
    // "~면" → "면" — the grammar-pattern marker ~ is removed.
    expect(superNormalize('~면')).toBe('면')
  })
})

describe('normalizedFrontMismatch (AUDIT-02)', () => {
  it('returns true when stored normalizedFront does not match recomputed value', () => {
    // front "먹다 (to eat)" → normalizeFront strips the gloss → "먹다".
    // stored "먹다 (to eat)" (a pre-gloss-stripping legacy value) → mismatch.
    expect(normalizedFrontMismatch('먹다 (to eat)', '먹다 (to eat)')).toBe(true)
  })

  it('returns false when stored matches recomputed value', () => {
    // normalizeFront("먹다") === "먹다" === stored → no mismatch.
    expect(normalizedFrontMismatch('먹다', '먹다')).toBe(false)
  })

  it('returns false when gloss is stripped and matches stored', () => {
    // normalizeFront("먹다 (to eat)") === "먹다" === stored → no mismatch.
    // This is the normal post-Phase-20 case: front has a gloss, stored doesn't.
    expect(normalizedFrontMismatch('먹다 (to eat)', '먹다')).toBe(false)
  })
})

describe('frontUntrimmed (AUDIT-02)', () => {
  it('returns true when front has leading whitespace', () => {
    // Legacy rows may predate Phase 20's WR-01 trim — " 먹다" !== "먹다".
    expect(frontUntrimmed(' 먹다')).toBe(true)
  })

  it('returns true when front has trailing whitespace', () => {
    expect(frontUntrimmed('먹다 ')).toBe(true)
  })

  it('returns false when front is already trimmed', () => {
    expect(frontUntrimmed('먹다')).toBe(false)
  })
})

describe('clusterNearDuplicates (AUDIT-02)', () => {
  it('returns only groups of 2+ cards, sorted by member count descending', () => {
    // Cards a,b share superNormalize key "면" (2 members).
    // Cards c,d,e share superNormalize key "가다" (3 members).
    // Card f ("먹다") is alone — excluded.
    const cards = [
      { id: 'a', type: 'grammar', front: '~(으)면', back: 'if/when', normalizedFront: '~(으)면' },
      { id: 'b', type: 'grammar', front: '(으)면', back: 'if/when', normalizedFront: '(으)면' },
      { id: 'c', type: 'vocabulary', front: '가다', back: 'to go', normalizedFront: '가다' },
      { id: 'd', type: 'vocabulary', front: '가다', back: 'to go2', normalizedFront: '가다' },
      { id: 'e', type: 'vocabulary', front: '가다', back: 'to go3', normalizedFront: '가다' },
      { id: 'f', type: 'vocabulary', front: '먹다', back: 'to eat', normalizedFront: '먹다' },
    ]
    const clusters = clusterNearDuplicates(cards)
    expect(clusters).toHaveLength(2)
    // Descending sort: 3-member cluster first, then 2-member
    expect(clusters[0].key).toBe('가다')
    expect(clusters[0].members).toHaveLength(3)
    expect(clusters[1].key).toBe('면')
    expect(clusters[1].members).toHaveLength(2)
  })

  it('each member carries id/type/front/back (CardRef, not normalizedFront)', () => {
    const cards = [
      { id: 'a', type: 'grammar', front: '~(으)면', back: 'if/when', normalizedFront: '~(으)면' },
      { id: 'b', type: 'grammar', front: '(으)면', back: 'if/when', normalizedFront: '(으)면' },
    ]
    const clusters = clusterNearDuplicates(cards)
    expect(clusters).toHaveLength(1)
    const member = clusters[0].members[0]
    expect(member).toHaveProperty('id')
    expect(member).toHaveProperty('type')
    expect(member).toHaveProperty('front')
    expect(member).toHaveProperty('back')
    expect(member).not.toHaveProperty('normalizedFront')
  })

  it('returns [] when no two cards share a superNormalize key', () => {
    const cards = [
      { id: 'a', type: 'vocabulary', front: '먹다', back: 'to eat', normalizedFront: '먹다' },
      { id: 'b', type: 'vocabulary', front: '가다', back: 'to go', normalizedFront: '가다' },
    ]
    expect(clusterNearDuplicates(cards)).toEqual([])
  })

  it('falls back to front when normalizedFront is empty', () => {
    // If normalizedFront is empty string, the cluster key uses front instead.
    const cards = [
      { id: 'a', type: 'vocabulary', front: '먹다', back: 'to eat', normalizedFront: '' },
      { id: 'b', type: 'vocabulary', front: '먹다', back: 'to eat2', normalizedFront: '먹다' },
    ]
    const clusters = clusterNearDuplicates(cards)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].members).toHaveLength(2)
  })
})

describe('countStaleComponents (AUDIT-02)', () => {
  it('reports zero stale and not-malformed for a null components column', () => {
    expect(countStaleComponents(null, new Set(['먹다']))).toEqual({
      stale: 0,
      malformed: false,
    })
  })

  it('reports malformed=true without throwing for unparseable JSON', () => {
    // 'broken' is not valid JSON — try/catch catches, returns malformed=true.
    expect(countStaleComponents('broken', new Set(['먹다']))).toEqual({
      stale: 0,
      malformed: true,
    })
  })

  it('reports malformed=true for JSON that parses but is not an array', () => {
    // '{"a":1}' parses to an object — not an array → malformed.
    expect(countStaleComponents('{"a":1}', new Set(['먹다']))).toEqual({
      stale: 0,
      malformed: true,
    })
  })

  it('counts entries dropped by filterComponents against the deckSet', () => {
    // '["존재하지않는단어","먹다"]' — "존재하지않는단어" resolves to nothing
    // (not in deckSet, no particle stem match); "먹다" resolves directly.
    // filterComponents returns ["먹다"] → stale = 2 - 1 = 1.
    expect(
      countStaleComponents('["존재하지않는단어","먹다"]', new Set(['먹다']))
    ).toEqual({ stale: 1, malformed: false })
  })

  it('reports zero stale when all components resolve', () => {
    // '["먹다"]' — "먹다" is in the deckSet → filterComponents keeps it.
    // stale = 1 - 1 = 0.
    expect(
      countStaleComponents('["먹다"]', new Set(['먹다']))
    ).toEqual({ stale: 0, malformed: false })
  })

  it('reuses splitParticle transitively through filterComponents (stem resolution)', () => {
    // "학교에서" is not in the deckSet directly, but splitParticle strips
    // the multi-char particle 에서 → stem "학교", which IS in the deckSet.
    // filterComponents keeps "학교에서" → stale = 0. This proves the audit
    // reuses the production particle-resolution logic, not a reimplementation.
    expect(
      countStaleComponents('["학교에서"]', new Set(['학교']))
    ).toEqual({ stale: 0, malformed: false })
  })
})

describe('runAuditChecks (AUDIT-02 — integration)', () => {
  // A small mixed fixture deck exercising every check class simultaneously.
  // Each card is crafted to trigger exactly one or two check classes so the
  // assertions can pinpoint which findings each card produces.
  const deck = [
    // Card A: zero-sentences + legacy cloze + null distractors
    {
      id: 'a', type: 'vocabulary', front: '단어', back: 'word', notes: null,
      normalizedFront: '단어', components: null, distractors: null,
      clozeSentence: 'legacy cloze', lessonId: null, sentences: [],
    },
    // Card B: ok, healthy (the baseline clean card)
    {
      id: 'b', type: 'vocabulary', front: '먹다', back: 'to eat', notes: null,
      normalizedFront: '먹다', components: null, distractors: '["x","y","z"]',
      clozeSentence: null, lessonId: null,
      sentences: [{ korean: '저는 밥을 먹다', targetForm: '먹다', orderIndex: 0 }],
    },
    // Card C: unsafe-first blank-safety (first sentence 1-char target, second safe)
    {
      id: 'c', type: 'vocabulary', front: '가다', back: 'to go', notes: null,
      normalizedFront: '가다', components: null, distractors: '["x","y","z"]',
      clozeSentence: null, lessonId: null,
      sentences: [
        { korean: '이것이 가나다', targetForm: '가', orderIndex: 0 },
        { korean: '저는 학교에 가요', targetForm: '가요', orderIndex: 1 },
      ],
    },
    // Card D: zero-safe + not-found + bad distractors (count-mismatch + dup)
    {
      id: 'd', type: 'vocabulary', front: '마바사', back: 'foo', notes: null,
      normalizedFront: '마바사', components: null, distractors: '["x","x"]',
      clozeSentence: null, lessonId: null,
      sentences: [{ korean: '안녕하세요', targetForm: '먹다', orderIndex: 0 }],
    },
    // Card E: romanization in front+sentence + normalizedFront mismatch + untrimmed
    {
      id: 'e', type: 'vocabulary', front: ' kkujunhada ', back: 'short', notes: null,
      normalizedFront: 'old-key', components: null, distractors: '["x","y","z"]',
      clozeSentence: null, lessonId: null,
      sentences: [{ korean: '저는 apple을 먹어요', targetForm: 'apple', orderIndex: 0 }],
    },
    // Card F: near-duplicate of G (superNormalize key "면"), zero-sentences
    {
      id: 'f', type: 'grammar', front: '~(으)면', back: 'if/when', notes: null,
      normalizedFront: '~(으)면', components: null, distractors: '["x","y","z"]',
      clozeSentence: null, lessonId: null, sentences: [],
    },
    // Card G: near-duplicate of F, zero-sentences
    {
      id: 'g', type: 'grammar', front: '(으)면', back: 'if/when', notes: null,
      normalizedFront: '(으)면', components: null, distractors: '["x","y","z"]',
      clozeSentence: null, lessonId: null, sentences: [],
    },
    // Card H: stale components (one entry doesn't resolve to any deck card)
    {
      id: 'h', type: 'vocabulary', front: '공부하다', back: 'to study', notes: null,
      normalizedFront: '공부하다', components: '["존재하지않는단어","먹다"]',
      distractors: '["x","y","z"]', clozeSentence: null, lessonId: null,
      sentences: [{ korean: '저는 공부하다', targetForm: '공부하다', orderIndex: 0 }],
    },
  ]

  it('returns totalCards matching the input deck size', () => {
    const findings = runAuditChecks(deck)
    expect(findings.totalCards).toBe(8)
  })

  it('routes zero-sentence cards to zeroSentenceCards with hasLegacyCloze flag, NOT to blankSafety', () => {
    const findings = runAuditChecks(deck)
    // Cards A, F, G have zero sentences
    expect(findings.zeroSentenceCards).toHaveLength(3)
    const cardA = findings.zeroSentenceCards.find((e) => e.card.id === 'a')
    expect(cardA).toBeDefined()
    expect(cardA?.hasLegacyCloze).toBe(true) // clozeSentence is 'legacy cloze'
    const cardF = findings.zeroSentenceCards.find((e) => e.card.id === 'f')
    expect(cardF?.hasLegacyCloze).toBe(false) // clozeSentence is null
    // Card A must NOT appear in any blankSafety bucket
    expect(findings.blankSafety.zeroSafe.find((c) => c.id === 'a')).toBeUndefined()
    expect(findings.blankSafety.unsafeFirst.find((c) => c.id === 'a')).toBeUndefined()
  })

  it('classifies unsafe-first cards into blankSafety.unsafeFirst', () => {
    const findings = runAuditChecks(deck)
    expect(findings.blankSafety.unsafeFirst).toHaveLength(1)
    expect(findings.blankSafety.unsafeFirst[0].id).toBe('c')
  })

  it('classifies zero-safe cards into blankSafety.zeroSafe and reports not-found indices', () => {
    const findings = runAuditChecks(deck)
    expect(findings.blankSafety.zeroSafe).toHaveLength(1)
    expect(findings.blankSafety.zeroSafe[0].id).toBe('d')
    // Card D's targetForm "먹다" is not found in "안녕하세요" → orderIndex 0
    expect(findings.blankSafety.notFound).toHaveLength(1)
    expect(findings.blankSafety.notFound[0].card.id).toBe('d')
    expect(findings.blankSafety.notFound[0].orderIndices).toEqual([0])
  })

  it('flags romanization in fronts and sentences separately', () => {
    const findings = runAuditChecks(deck)
    expect(findings.romanization.flaggedFronts).toHaveLength(1)
    expect(findings.romanization.flaggedFronts[0].id).toBe('e')
    expect(findings.romanization.flaggedSentences).toHaveLength(1)
    expect(findings.romanization.flaggedSentences[0].card.id).toBe('e')
    expect(findings.romanization.flaggedSentences[0].orderIndices).toEqual([0])
  })

  it('reports distractor findings only for cards with non-empty anomaly arrays', () => {
    const findings = runAuditChecks(deck)
    // Card A (null) and Card D (count-mismatch + dup) have anomalies
    expect(findings.distractorFindings).toHaveLength(2)
    const cardAFinding = findings.distractorFindings.find((f) => f.card.id === 'a')
    expect(cardAFinding?.anomalies).toEqual(['null'])
    const cardDFinding = findings.distractorFindings.find((f) => f.card.id === 'd')
    expect(cardDFinding?.anomalies).toContain('count-mismatch')
    expect(cardDFinding?.anomalies).toContain('duplicate-entries')
  })

  it('reports normalizedFront mismatches with the recomputed expected value', () => {
    const findings = runAuditChecks(deck)
    expect(findings.normalizedFrontMismatches).toHaveLength(1)
    const mismatch = findings.normalizedFrontMismatches[0]
    expect(mismatch.card.id).toBe('e')
    expect(mismatch.expected).toBe('kkujunhada') // normalizeFront(' kkujunhada ') trims
    expect(mismatch.stored).toBe('old-key')
  })

  it('reports untrimmed fronts', () => {
    const findings = runAuditChecks(deck)
    expect(findings.untrimmedFronts).toHaveLength(1)
    expect(findings.untrimmedFronts[0].id).toBe('e')
  })

  it('clusters near-duplicate cards by superNormalize key', () => {
    const findings = runAuditChecks(deck)
    expect(findings.nearDuplicateClusters).toHaveLength(1)
    expect(findings.nearDuplicateClusters[0].key).toBe('면')
    expect(findings.nearDuplicateClusters[0].members).toHaveLength(2)
    const memberIds = findings.nearDuplicateClusters[0].members.map((m) => m.id).sort()
    expect(memberIds).toEqual(['f', 'g'])
  })

  it('counts stale components via filterComponents against the internal deckSet', () => {
    const findings = runAuditChecks(deck)
    // Card H has one stale entry ("존재하지않는단어" doesn't resolve; "먹다" does)
    expect(findings.staleComponents.cardsAffected).toBe(1)
    expect(findings.staleComponents.totalStaleEntries).toBe(1)
    expect(findings.staleComponents.malformedCards).toEqual([])
  })

  it('every finding entry carries the card id (STATE.md v1.5 fix-in-place rule)', () => {
    const findings = runAuditChecks(deck)
    // Spot-check that every CardRef in every finding section has a non-empty id
    for (const c of findings.blankSafety.zeroSafe) expect(typeof c.id).toBe('string')
    for (const c of findings.blankSafety.unsafeFirst) expect(typeof c.id).toBe('string')
    for (const e of findings.blankSafety.notFound) expect(typeof e.card.id).toBe('string')
    for (const e of findings.zeroSentenceCards) expect(typeof e.card.id).toBe('string')
    for (const c of findings.romanization.flaggedFronts) expect(typeof c.id).toBe('string')
    for (const e of findings.romanization.flaggedSentences) expect(typeof e.card.id).toBe('string')
    for (const e of findings.distractorFindings) expect(typeof e.card.id).toBe('string')
    for (const e of findings.normalizedFrontMismatches) expect(typeof e.card.id).toBe('string')
    for (const c of findings.untrimmedFronts) expect(typeof c.id).toBe('string')
    for (const cl of findings.nearDuplicateClusters) for (const m of cl.members) expect(typeof m.id).toBe('string')
  })
})
