import { describe, it, expect } from 'vitest'
import {
  classifyBlankSafety,
  notFoundSentenceIndices,
  frontHasRomanization,
  sentenceHasRomanization,
  checkDistractors,
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
