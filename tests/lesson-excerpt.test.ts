import { describe, it, expect } from 'vitest'
import { lessonExcerpt } from '../lib/lesson-excerpt'

describe('lessonExcerpt', () => {
  it('returns the first non-empty line', () => {
    expect(lessonExcerpt('안녕하세요\n둘째 줄')).toBe('안녕하세요')
  })

  it('skips leading blank lines', () => {
    expect(lessonExcerpt('\n\n  \n첫 번째 내용\n둘째')).toBe('첫 번째 내용')
  })

  it('trims and collapses internal whitespace', () => {
    expect(lessonExcerpt('  공백이   많은   줄  ')).toBe('공백이 많은 줄')
  })

  it('truncates lines longer than 48 chars with ellipsis', () => {
    const long = '이'.repeat(60)
    const result = lessonExcerpt(long)
    expect(result).toHaveLength(49) // 48 chars + ellipsis
    expect(result.endsWith('…')).toBe(true)
    expect(result.slice(0, 48)).toBe('이'.repeat(48))
  })

  it('returns a 48-char line as-is (boundary)', () => {
    const exact = '이'.repeat(48)
    expect(lessonExcerpt(exact)).toBe(exact)
  })

  it('returns short lines as-is', () => {
    expect(lessonExcerpt('짧은 줄')).toBe('짧은 줄')
  })

  it('falls back to (untitled lesson) for empty string', () => {
    expect(lessonExcerpt('')).toBe('(untitled lesson)')
  })

  it('falls back to (untitled lesson) for whitespace-only string', () => {
    expect(lessonExcerpt('   \n\t  \n   ')).toBe('(untitled lesson)')
  })

  it('uses only the first non-empty line even if later lines are longer', () => {
    const text = '짧은 첫 줄\n' + '이'.repeat(80)
    expect(lessonExcerpt(text)).toBe('짧은 첫 줄')
  })
})
