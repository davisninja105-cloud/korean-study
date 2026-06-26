import { describe, it, expect } from 'vitest'
import { countUnknownWords } from '../lib/known-words'

describe('countUnknownWords', () => {
  it('counts tokens not in knownLemmas', () => {
    // Sentence: "나는 사과 먹어요" (I eat an apple)
    // targetForm: "사과" (apple)
    // knownLemmas contains "나는" only — "먹어요" is unknown
    // "사과" is the target so excluded; "나는" is known → only "먹어요" is unknown → count = 1
    const knownLemmas = new Set(['나는'])
    expect(countUnknownWords('나는 사과 먹어요', '사과', knownLemmas)).toBe(1)
  })

  it('excludes the targetForm token from the unknown count', () => {
    // Sentence: "나는 공부해요" (I study)
    // targetForm: "공부해요"
    // knownLemmas is empty — "나는" is unknown, but "공부해요" is the target and excluded
    // → count = 1 (only "나는" is unknown)
    const knownLemmas = new Set<string>([])
    expect(countUnknownWords('나는 공부해요', '공부해요', knownLemmas)).toBe(1)
  })

  it('resolves particle stems via splitParticle', () => {
    // Sentence: "학교에서 공부해요" (study at school)
    // targetForm: "공부해요"
    // Token "학교에서" → splitParticle → stem "학교", particle "에서" (multi-char, unambiguous)
    // knownLemmas contains "학교" → token resolves as known via stem
    // "공부해요" is targetForm → excluded
    // → count = 0
    const knownLemmas = new Set(['학교'])
    expect(countUnknownWords('학교에서 공부해요', '공부해요', knownLemmas)).toBe(0)
  })

  it('returns 0 when all non-target tokens are known', () => {
    // Sentence: "저는 물 마셔요" (I drink water)
    // targetForm: "마셔요"
    // knownLemmas contains "저는" and "물" → both non-target tokens are known
    // "마셔요" is the target and excluded
    // → count = 0
    const knownLemmas = new Set(['저는', '물'])
    expect(countUnknownWords('저는 물 마셔요', '마셔요', knownLemmas)).toBe(0)
  })

  it('handles empty sentence', () => {
    const knownLemmas = new Set(['가다'])
    expect(countUnknownWords('', '가다', knownLemmas)).toBe(0)
  })
})
