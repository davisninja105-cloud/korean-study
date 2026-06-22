export interface CefrBand {
  band: string
  label: string
  minCards: number
  maxCards: number
}

export const CEFR_BANDS: CefrBand[] = [
  { band: 'A1', label: 'Beginner',      minCards:    0, maxCards:   500 },
  { band: 'A2', label: 'Elementary',    minCards:  500, maxCards:  1200 },
  { band: 'B1', label: 'Intermediate',  minCards: 1200, maxCards:  2500 },
  { band: 'B2', label: 'Upper-Interm.', minCards: 2500, maxCards:  4500 },
  { band: 'C1', label: 'Advanced',      minCards: 4500, maxCards:  8000 },
  { band: 'C1+', label: 'Proficient',   minCards: 8000, maxCards: 12000 },
]

export interface ProficiencyResult {
  band: string
  label: string
  masteredCount: number
  withinBandPct: number  // 0–100, progress within the current band
  nextBand: string | null
  nextBandMin: number
}

export function computeProficiency(masteredCount: number): ProficiencyResult {
  const current = CEFR_BANDS.find(
    (b) => masteredCount >= b.minCards && masteredCount < b.maxCards
  ) ?? CEFR_BANDS[CEFR_BANDS.length - 1]

  const next = CEFR_BANDS[CEFR_BANDS.indexOf(current) + 1] ?? null
  const range = current.maxCards - current.minCards
  const within = masteredCount - current.minCards
  const withinBandPct = range > 0 ? Math.min(100, Math.round((within / range) * 100)) : 100

  return {
    band: current.band,
    label: current.label,
    masteredCount,
    withinBandPct,
    nextBand: next?.band ?? null,
    nextBandMin: next?.minCards ?? current.maxCards,
  }
}
