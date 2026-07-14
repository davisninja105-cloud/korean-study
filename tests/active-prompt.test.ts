import { describe, it, expect } from 'vitest'
import { deriveActiveFace } from '../lib/active-prompt'

// Fixture helper — mirrors tests/sentence-selection.test.ts's `sentence()` builder.
function card(front: string, back: string) {
  return { front, back }
}

describe('deriveActiveFace', () => {
  // CR-01: practice cards always degrade to the Passive/exposure face,
  // regardless of isNewCard or chosenSentence — AI-generated PracticeCard
  // items have no guaranteed single-language front/back split, so they can
  // never safely support the production mechanic.
  it('returns passive-degrade for a practice card even when isNewCard is true', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), { translation: 'Hello there' }, true, true)
    expect(result).toEqual({ face: 'passive-degrade' })
  })

  // CR-01: a practice card with isNewCard false (shouldn't normally happen,
  // since practice items have no FSRS state, but the practice check must
  // still take precedence over the new-card branch either way).
  it('returns passive-degrade for a practice card even when isNewCard is false', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), null, false, true)
    expect(result).toEqual({ face: 'passive-degrade' })
  })

  // ACTIVE-05/D-10: a real card that is still new (state <= 1) degrades to
  // Passive even though it has a chosen sentence — new words are never
  // production-prompted.
  it('returns passive-degrade for a real new card with a chosen sentence', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), { translation: 'Hello there' }, true, false)
    expect(result).toEqual({ face: 'passive-degrade' })
  })

  // ACTIVE-05, Core Value: the new-card degrade precedes the null-sentence
  // fallback — a brand-new, zero-sentence real card must NOT get a
  // production prompt for a never-seen word.
  it('returns passive-degrade for a real new card with a null sentence', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), null, true, false)
    expect(result).toEqual({ face: 'passive-degrade' })
  })

  // D-15: a matured real card with no sentences at all falls back to the
  // word-production face.
  it('returns word-production for a matured real card with a null sentence', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), null, false, false)
    expect(result).toEqual({ face: 'word-production', prompt: 'hello' })
  })

  // ACTIVE-01: a matured real card with a chosen sentence gets the full
  // sentence-production face, prompted with the sentence's translation.
  it('returns sentence-production for a matured real card with a chosen sentence', () => {
    const result = deriveActiveFace(card('안녕', 'hello'), { translation: 'Hello there' }, false, false)
    expect(result).toEqual({ face: 'sentence-production', prompt: 'Hello there' })
  })
})
