import { describe, it, expect } from 'vitest'
import { computeProficiency } from '../lib/proficiency'

describe('computeProficiency', () => {
  it('returns A1 for 0 cards', () => {
    const r = computeProficiency(0)
    expect(r.band).toBe('A1')
    expect(r.nextBand).toBe('A2')
    expect(r.withinBandPct).toBe(0)
  })

  it('returns A2 at the band boundary', () => {
    expect(computeProficiency(500).band).toBe('A2')
  })

  it('returns B1 at 1200', () => {
    expect(computeProficiency(1200).band).toBe('B1')
  })

  it('computes withinBandPct correctly', () => {
    // A1 band is 0–500; at 100 cards → 20%
    expect(computeProficiency(100).withinBandPct).toBe(20)
    // A2 band is 500–1200 (700 wide); at 850 → 350/700 = 50%
    expect(computeProficiency(850).withinBandPct).toBe(50)
  })

  it('returns null nextBand at the top band', () => {
    const r = computeProficiency(8000)
    expect(r.band).toBe('C1+')
    expect(r.nextBand).toBeNull()
  })

  it('clamps withinBandPct to 100', () => {
    // At exact top of last band (12000) still C1+, 100%
    expect(computeProficiency(12000).withinBandPct).toBe(100)
  })
})
