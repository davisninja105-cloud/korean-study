import { describe, it, expect } from 'vitest'
import { normalizeFront } from '../lib/card-key'

describe('normalizeFront', () => {
  it('trims whitespace', () => {
    expect(normalizeFront('  가다  ')).toBe('가다')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeFront('가  다')).toBe('가 다')
  })

  it('strips trailing English gloss in parens', () => {
    expect(normalizeFront('가다 (to go)')).toBe('가다')
    expect(normalizeFront('~(으)면 (if/when)')).toBe('~(으)면')
    expect(normalizeFront('~(으)로 (direction particle)')).toBe('~(으)로')
  })

  it('keeps Hangul-only parens intact', () => {
    expect(normalizeFront('~(으)면')).toBe('~(으)면')
    expect(normalizeFront('~(이)다')).toBe('~(이)다')
  })

  it('keeps mixed Hangul+ASCII parens intact', () => {
    // Inner has Hangul → not stripped
    expect(normalizeFront('Action verb ~는 (현재형)')).toBe('Action verb ~는 (현재형)')
  })

  it('is idempotent', () => {
    const s = normalizeFront('가다 (to go)')
    expect(normalizeFront(s)).toBe(s)
  })

  it('handles empty string', () => {
    expect(normalizeFront('')).toBe('')
  })
})
