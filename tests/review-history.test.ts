import { describe, it, expect } from 'vitest'
import { buildReviewWhere, isValidOpaqueId, mapReviewLogToDTO } from '../lib/review-history'
import { masteryPhrase } from '../lib/fsrs'

describe('mapReviewLogToDTO — gradeName', () => {
  const createdAt = new Date('2026-07-04T12:00:00Z')
  const nextReview = new Date('2026-07-07T12:00:00Z') // 3 days out

  function rawRow(rating: number) {
    return {
      id: 'log1',
      createdAt,
      cardId: 'card1',
      rating,
      nextReview,
      card: { front: '가다', type: 'vocabulary' },
    }
  }

  it('maps rating 1 to "Again"', () => {
    expect(mapReviewLogToDTO(rawRow(1)).gradeName).toBe('Again')
  })

  it('maps rating 2 to "Hard"', () => {
    expect(mapReviewLogToDTO(rawRow(2)).gradeName).toBe('Hard')
  })

  it('maps rating 3 to "Good"', () => {
    expect(mapReviewLogToDTO(rawRow(3)).gradeName).toBe('Good')
  })

  it('maps rating 4 to "Easy"', () => {
    expect(mapReviewLogToDTO(rawRow(4)).gradeName).toBe('Easy')
  })

  it('sets mastery to masteryPhrase(nextReview, createdAt)', () => {
    const dto = mapReviewLogToDTO(rawRow(3))
    expect(dto.mastery).toBe(masteryPhrase(nextReview, createdAt))
  })

  it('serializes createdAt to an ISO string', () => {
    const dto = mapReviewLogToDTO(rawRow(3))
    expect(dto.createdAt).toBe(createdAt.toISOString())
  })

  it('maps cardFront/cardType from the nested card', () => {
    const dto = mapReviewLogToDTO(rawRow(3))
    expect(dto.cardFront).toBe('가다')
    expect(dto.cardType).toBe('vocabulary')
  })
})

describe('buildReviewWhere — where clause', () => {
  it('returns { cardId } for a non-empty id', () => {
    expect(buildReviewWhere('abc123')).toEqual({ cardId: 'abc123' })
  })

  it('returns {} for null', () => {
    expect(buildReviewWhere(null)).toEqual({})
  })

  it('returns {} for undefined', () => {
    expect(buildReviewWhere(undefined)).toEqual({})
  })
})

describe('isValidOpaqueId — length bound', () => {
  it('rejects empty string', () => {
    expect(isValidOpaqueId('')).toBe(false)
  })

  it('accepts a normal cuid-length string', () => {
    expect(isValidOpaqueId('cljk3x9z10001qzrmn831i7d')).toBe(true)
  })

  it('accepts exactly 64 characters', () => {
    expect(isValidOpaqueId('a'.repeat(64))).toBe(true)
  })

  it('rejects 65 characters', () => {
    expect(isValidOpaqueId('a'.repeat(65))).toBe(false)
  })
})
