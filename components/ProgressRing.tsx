'use client'

import { useEffect, useRef } from 'react'

interface Props {
  pct: number           // 0–100
  size?: number         // px diameter, default 80
  strokeWidth?: number  // px, default 8
  color?: string        // CSS color value, default var(--reward)
  trackColor?: string   // CSS color for the background ring
  'aria-label': string
  className?: string
}

export default function ProgressRing({
  pct,
  size = 80,
  strokeWidth = 8,
  color = 'var(--reward)',
  trackColor,
  'aria-label': ariaLabel,
  className,
}: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedPct = Math.min(100, Math.max(0, pct))
  const offset = circumference - (clampedPct / 100) * circumference

  // Check prefers-reduced-motion on the client; server renders static.
  const prefersReduced = useRef(false)
  useEffect(() => {
    prefersReduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={ariaLabel}
      role="img"
      className={className}
      style={
        {
          '--ring-circumference': circumference,
          '--ring-offset': offset,
        } as React.CSSProperties
      }
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={trackColor ?? 'currentColor'}
        strokeWidth={strokeWidth}
        className={trackColor ? '' : 'text-gray-200 dark:text-gray-700'}
        opacity={0.25}
      />
      {/* Fill */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{
          animation: 'ringFill 0.8s ease-out forwards',
          transition: 'stroke-dashoffset 0.6s ease-out',
        }}
      />
    </svg>
  )
}
