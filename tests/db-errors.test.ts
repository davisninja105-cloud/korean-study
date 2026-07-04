import { describe, it, expect } from 'vitest'
import { isUniqueConstraintError } from '../lib/db-errors'

describe('isUniqueConstraintError', () => {
  it('matches a top-level message containing the constraint phrase and column (real DriverAdapterError shape)', () => {
    const error = new Error(
      'SQLITE_CONSTRAINT: SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: ReviewLog.idempotencyKey',
    )
    expect(isUniqueConstraintError(error, 'idempotencyKey')).toBe(true)
  })

  it('matches when the constraint text is only on a nested .cause', () => {
    const error = Object.assign(new Error('write failed'), {
      cause: { kind: 'sqlite', message: 'UNIQUE constraint failed: ReviewLog.idempotencyKey' },
    })
    expect(isUniqueConstraintError(error, 'idempotencyKey')).toBe(true)
  })

  it('returns false for a UNIQUE violation on a different column', () => {
    const error = new Error('UNIQUE constraint failed: Card.normalizedFront')
    expect(isUniqueConstraintError(error, 'idempotencyKey')).toBe(false)
  })

  it('returns false for a generic error', () => {
    const error = new Error('Failed to record review')
    expect(isUniqueConstraintError(error, 'idempotencyKey')).toBe(false)
  })

  it('returns false for a non-unique DB/connection error', () => {
    const error = new Error('SQLITE_BUSY: database is locked')
    expect(isUniqueConstraintError(error, 'idempotencyKey')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isUniqueConstraintError(null, 'idempotencyKey')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isUniqueConstraintError(undefined, 'idempotencyKey')).toBe(false)
  })

  it('returns false for a non-object (string)', () => {
    expect(isUniqueConstraintError('UNIQUE constraint failed: idempotencyKey', 'idempotencyKey')).toBe(false)
  })

  it('returns false for an object with no string message', () => {
    expect(isUniqueConstraintError({ kind: 'sqlite' }, 'idempotencyKey')).toBe(false)
  })

  it('bounds cause-chain walking to 5 levels (does not throw on deep/cyclic causes)', () => {
    const deep: { message: string; cause?: unknown } = { message: 'no match here' }
    let current = deep
    for (let i = 0; i < 10; i++) {
      const next: { message: string; cause?: unknown } = { message: 'no match here' }
      current.cause = next
      current = next
    }
    expect(isUniqueConstraintError(deep, 'idempotencyKey')).toBe(false)
  })
})
