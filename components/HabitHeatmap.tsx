'use client'

import { useMemo } from 'react'
import { shiftDate, formatDuration, type DayRecord } from '@/lib/habit'

interface Props {
  days: DayRecord[]
  today: string
  goal: number
  weeks?: number
}

export default function HabitHeatmap({ days, today, goal, weeks = 13 }: Props) {
  const secByDate = useMemo(
    () => new Map(days.map((d) => [d.date, d.seconds])),
    [days]
  )

  // Build week columns oldest→newest, rows Sun→Sat.
  const columns = useMemo(() => {
    if (!today) return []
    const [y, m, d] = today.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    const startOfThisWeek = shiftDate(today, -dow)
    const gridStart = shiftDate(startOfThisWeek, -(weeks - 1) * 7)
    const cols: string[][] = []
    for (let c = 0; c < weeks; c++) {
      const col: string[] = []
      for (let r = 0; r < 7; r++) col.push(shiftDate(gridStart, c * 7 + r))
      cols.push(col)
    }
    return cols
  }, [today, weeks])

  const cellStyle = (date: string): { className: string; style?: React.CSSProperties } => {
    if (date > today) return { className: 'w-3 h-3 rounded-sm bg-transparent' }
    const secs = secByDate.get(date) ?? 0
    let className = 'w-3 h-3 rounded-sm '
    let style: React.CSSProperties | undefined

    if (secs >= goal) {
      className += ''
      style = { background: 'var(--reward)' }
    } else if (secs > 0) {
      className += 'bg-reward-soft'
    } else {
      className += 'bg-gray-100 dark:bg-gray-700'
    }
    if (date === today) {
      className += ' ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800'
      style = { ...style, outlineColor: 'var(--reward)', boxShadow: '0 0 0 2px var(--reward)' }
    }
    return { className, style }
  }

  return (
    <div className="flex gap-1 overflow-x-auto py-1">
      {columns.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((date) => {
            const { className, style } = cellStyle(date)
            return (
              <div
                key={date}
                role="img"
                aria-label={`${date}: ${formatDuration(secByDate.get(date) ?? 0)}`}
                className={className}
                style={style}
                title={`${date}: ${formatDuration(secByDate.get(date) ?? 0)}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
