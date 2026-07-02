import { describe, it, expect } from 'vitest'
import { selectSentence, hashStr, type SelectableSentence } from '../lib/sentence-selection'

// Fixture helper — mirrors tests/sequence.test.ts's `card(...)` builder.
// Only the three fields the algorithm reads are required; the rest of the
// real SentenceDTO shape (id, translation) is irrelevant to selection.
function sentence(korean: string, targetForm: string, unknownCount?: number): SelectableSentence {
  return { korean, targetForm, unknownCount }
}

describe('selectSentence', () => {
  // REFACTOR-02
  it('picks the sentence with the lowest unknownCount when tiers differ', () => {
    const sentences = [
      sentence('학교에 가요', '가요', 2),
      sentence('집에 갑니다', '갑니다', 0),
      sentence('책을 읽어요', '읽어요', 1),
    ]
    // Only index 1 is in the lowest tier (unknownCount 0) → candidates=[1].
    const idx = selectSentence(sentences, 'card-1', 0, false)
    expect(idx).toBe(1)
  })

  // REFACTOR-02
  it('rotates among tied-lowest candidates by (hashStr(id) + reps) % candidates.length', () => {
    // Two tied candidates (both unknownCount 0). With 2 candidates, indices
    // (H + reps) % 2 flip parity as reps changes — so reps=0 and reps=1 must
    // select different indices for the same cardId.
    const sentences = [
      sentence('학교에 가요', '가요', 0),
      sentence('집에 갑니다', '갑니다', 0),
    ]
    const idx0 = selectSentence(sentences, 'card-xyz', 0, false)
    const idx1 = selectSentence(sentences, 'card-xyz', 1, false)
    expect(idx0).not.toBe(idx1)
    // Both must be valid indices within the candidate set.
    expect([0, 1]).toContain(idx0)
    expect([0, 1]).toContain(idx1)
  })

  // REFACTOR-02
  it('returns -1 for an empty sentence array', () => {
    expect(selectSentence([], 'any-card', 0, false)).toBe(-1)
  })

  // REFACTOR-02
  it('falls back to the first blank-safe sentence when needsBlank and the tier pick is unsafe', () => {
    // tier pick = index 0 (lowest unknownCount 0), but its targetForm is a
    // single Korean syllable "가" → sentenceMatch(...).safeToBlank === false
    // (matches inside other words/particles). Index 1 has unknownCount 1 and a
    // multi-char, single-occurrence targetForm → safeToBlank === true.
    const sentences = [
      sentence('가나다라마바사', '가', 0),
      sentence('학교에 갑니다', '갑니다', 1),
    ]
    const idx = selectSentence(sentences, 'card-1', 0, true)
    expect(idx).toBe(1)
  })

  // REFACTOR-02
  it('gracefully degrades to the tier pick when needsBlank but no sentence is blank-safe', () => {
    // Both sentences have single-char targetForms → both unsafe to blank.
    // tier pick = index 0 (lowest unknownCount 0); no safe fallback exists.
    const sentences = [
      sentence('가나다라마바사', '가', 0),
      sentence('나다라마바사아', '나', 1),
    ]
    const idx = selectSentence(sentences, 'card-1', 0, true)
    // Must not throw, and must return the tier pick (0), not -1.
    expect(idx).toBe(0)
  })

  // REFACTOR-02
  it('returns the tier pick without invoking the blank-safety override when needsBlank is false', () => {
    // Same unsafe tier pick as the fallback case, but needsBlank=false → the
    // override path must never run; the (unsafe) tier pick is returned as-is.
    const sentences = [
      sentence('가나다라마바사', '가', 0),
      sentence('학교에 갑니다', '갑니다', 1),
    ]
    const idx = selectSentence(sentences, 'card-1', 0, false)
    expect(idx).toBe(0)
  })
})

describe('hashStr', () => {
  // REFACTOR-02
  it('returns a positive 32-bit integer and is deterministic', () => {
    const h1 = hashStr('card-1')
    const h2 = hashStr('card-1')
    expect(h1).toBe(h2)
    expect(h1).toBeGreaterThan(0)
    expect(Number.isInteger(h1)).toBe(true)
  })

  // REFACTOR-02
  it('never returns 0 (the || 1 guard) so modulo never yields NaN/0-divisor', () => {
    // An empty string would XOR nothing and imul the seed — the guard forces
    // a non-zero return. Verify across a few inputs including the edge case.
    expect(hashStr('')).toBeGreaterThanOrEqual(1)
    expect(hashStr('a')).toBeGreaterThanOrEqual(1)
    expect(hashStr('non-empty-card-id')).toBeGreaterThanOrEqual(1)
  })
})
