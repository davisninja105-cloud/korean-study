'use client'

import { computeProficiency } from '@/lib/proficiency'

interface Props {
  masteredCount: number
}

export default function ProficiencyArc({ masteredCount }: Props) {
  const { band, label, withinBandPct, nextBand, nextBandMin } = computeProficiency(masteredCount)

  const size = 120
  const strokeWidth = 10
  const radius = (size - strokeWidth) / 2
  // Arc spans 210° (from 195° to 345° by convention — left of bottom to right of bottom)
  const ARC_DEG = 210
  const circumference = 2 * Math.PI * radius
  const arcLength = (ARC_DEG / 360) * circumference
  const fillLength = (withinBandPct / 100) * arcLength

  // SVG arcs: start at 195°, sweep 210° clockwise.
  // strokeDasharray trick: fill | gap to end of arc | gap around back
  const trackDash = `${arcLength} ${circumference - arcLength}`
  const fillDash  = `${fillLength} ${circumference - fillLength}`
  const startAngle = 195

  return (
    <div className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
        Proficiency
      </h2>

      <div className="flex items-center gap-6">
        {/* Arc */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${band} — ${withinBandPct}% through this level`} role="img">
            {/* Track arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={trackDash}
              className="text-border"
              transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}
            />
            {/* Fill arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--cat-vocab)"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={fillDash}
              transform={`rotate(${startAngle} ${size / 2} ${size / 2})`}
            />
            {/* C1 marker dot at end of arc (345° from start = startAngle + ARC_DEG) */}
            {(() => {
              const endAngleDeg = startAngle + ARC_DEG
              const endRad = (endAngleDeg * Math.PI) / 180
              const x = size / 2 + radius * Math.cos(endRad)
              const y = size / 2 + radius * Math.sin(endRad)
              return <circle cx={x} cy={y} r={4} fill="var(--cat-vocab)" opacity={0.4} />
            })()}
          </svg>
          {/* Centre label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{band}</span>
            <span className="text-xs text-muted">{label}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-col gap-2 min-w-0">
          <div>
            <p className="text-2xl font-bold" style={{ color: 'var(--cat-vocab)' }}>
              {masteredCount.toLocaleString()}
            </p>
            <p className="text-xs text-muted">cards mastered</p>
          </div>
          {nextBand && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {(nextBandMin - masteredCount).toLocaleString()} to {nextBand}
              </p>
              <div className="mt-1 w-full bg-surface-3 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${withinBandPct}%`, background: 'var(--cat-vocab)' }}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-muted mt-1">
            C1 target: 4,500 cards
          </p>
        </div>
      </div>
    </div>
  )
}
