import { describe, it, expect } from 'vitest'
import { isValidCronAuth } from '../lib/auth'

describe('isValidCronAuth', () => {
  it('returns true for a valid bearer header with a matching non-empty secret', () => {
    expect(isValidCronAuth('Bearer supersecret123', 'supersecret123')).toBe(true)
  })

  it('returns false when the header is well-formed but the secret value does not match', () => {
    expect(isValidCronAuth('Bearer wrongvalue', 'supersecret123')).toBe(false)
  })

  it('fails closed when cronSecret is undefined, regardless of header', () => {
    expect(isValidCronAuth('Bearer anything', undefined)).toBe(false)
    expect(isValidCronAuth(null, undefined)).toBe(false)
  })

  it('fails closed when cronSecret is an empty string', () => {
    expect(isValidCronAuth('Bearer ', '')).toBe(false)
    expect(isValidCronAuth('Bearer anything', '')).toBe(false)
  })

  it('returns false when the header is missing entirely (null)', () => {
    expect(isValidCronAuth(null, 'supersecret123')).toBe(false)
  })

  it('returns false for a malformed header (missing prefix, wrong case, extra whitespace)', () => {
    expect(isValidCronAuth('supersecret123', 'supersecret123')).toBe(false)
    expect(isValidCronAuth('bearer supersecret123', 'supersecret123')).toBe(false)
    expect(isValidCronAuth('Bearer  supersecret123', 'supersecret123')).toBe(false)
    expect(isValidCronAuth('Bearer supersecret123 ', 'supersecret123')).toBe(false)
  })
})
