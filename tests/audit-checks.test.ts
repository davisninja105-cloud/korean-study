import { describe, it, expect } from 'vitest'
import { classifyBlankSafety, notFoundSentenceIndices } from '../lib/audit-checks'

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
