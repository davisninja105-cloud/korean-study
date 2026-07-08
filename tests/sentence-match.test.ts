import { describe, it, expect } from 'vitest'
import { sentenceMatch, blankSentence, splitParticle } from '../lib/sentence-match'

describe('sentenceMatch', () => {
  it('finds a multi-char target that appears once', () => {
    const r = sentenceMatch('저는 학생입니다', '학생')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(true)
  })

  // --- D-01/D-02: word-boundary-aware single-char blank-safety ---
  // An isolated single-char targetForm (string-edge / whitespace / punctuation on
  // both sides) is blank-safe; an embedded one (Hangul-adjacent on either side)
  // stays unsafe. The multi-occurrence rule still wins for isolated-but-repeated.

  it('single-char target isolated by spaces/string-edge is blank-safe', () => {
    // Replaces the pre-D-02 assertion that expected safeToBlank=false here.
    const r = sentenceMatch('나는 가', '가')
    expect(r.found).toBe(true)
    expect(r.index).toBe(3)
    expect(r.safeToBlank).toBe(true)
  })

  it('isolated single-char mid-sentence is blank-safe (real corpus card 다, D-03)', () => {
    // "밥을 다 먹었어요." — 다 sits between two spaces, occurs once.
    const r = sentenceMatch('밥을 다 먹었어요.', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(true)
  })

  it('isolated single-char followed by punctuation is blank-safe', () => {
    const r = sentenceMatch('정답은 다!', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(true)
  })

  it('embedded single-char with Hangul on the left is unsafe', () => {
    // 다 inside 왔다 — Hangul on the left, string edge on the right.
    const r = sentenceMatch('학교에 왔다', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(false)
  })

  it('embedded single-char with Hangul on the right is unsafe', () => {
    // 다 at string-edge on the left, but Hangul (시) immediately after.
    const r = sentenceMatch('다시 만나요', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(false)
  })

  it('isolated single-char occurring twice is unsafe (multi-occurrence wins)', () => {
    const r = sentenceMatch('다 오면 다 좋아요', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(false)
  })

  it('first-occurrence semantics: embedded first occurrence is unsafe even if a later one is isolated', () => {
    // indexOf finds 다 inside 왔다 first; the predicate evaluates the FIRST occurrence.
    const r = sentenceMatch('왔다 그리고 좋아요', '다')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(false)
  })

  it('returns safeToBlank=false when target appears more than once', () => {
    const r = sentenceMatch('가고 또 가고', '가고')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(false)
  })

  it('returns found=false when target not in sentence', () => {
    const r = sentenceMatch('나는 학생이에요', '선생님')
    expect(r.found).toBe(false)
    expect(r.safeToBlank).toBe(false)
    expect(r.index).toBe(-1)
  })

  it('handles empty inputs', () => {
    expect(sentenceMatch('', '가다').found).toBe(false)
    expect(sentenceMatch('가다', '').found).toBe(false)
  })
})

describe('blankSentence', () => {
  it('replaces first occurrence with ___', () => {
    expect(blankSentence('저는 학생입니다', '학생')).toBe('저는 ___입니다')
  })

  it('returns original string when target not found', () => {
    expect(blankSentence('저는 학생입니다', '선생님')).toBe('저는 학생입니다')
  })
})

describe('splitParticle', () => {
  it('splits multi-char particle', () => {
    expect(splitParticle('학교에서')).toEqual({ stem: '학교', particle: '에서' })
    expect(splitParticle('서울까지')).toEqual({ stem: '서울', particle: '까지' })
  })

  it('splits single-char particle from 2+ syllable stem', () => {
    expect(splitParticle('학생은')).toEqual({ stem: '학생', particle: '은' })
    expect(splitParticle('사람이')).toEqual({ stem: '사람', particle: '이' })
  })

  it('does not split single-char particle from single-syllable stem', () => {
    // '가는' is 2 chars — length < 3 for single-char particle split
    expect(splitParticle('가는')).toEqual({ stem: '가는', particle: '' })
  })

  it('returns whole form when no particle detected', () => {
    expect(splitParticle('안녕하세요')).toEqual({ stem: '안녕하세요', particle: '' })
  })
})
