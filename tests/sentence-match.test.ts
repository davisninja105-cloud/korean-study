import { describe, it, expect } from 'vitest'
import { sentenceMatch, blankSentence, splitParticle } from '../lib/sentence-match'

describe('sentenceMatch', () => {
  it('finds a multi-char target that appears once', () => {
    const r = sentenceMatch('저는 학생입니다', '학생')
    expect(r.found).toBe(true)
    expect(r.safeToBlank).toBe(true)
  })

  it('returns safeToBlank=false for single-char target', () => {
    const r = sentenceMatch('나는 가', '가')
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
