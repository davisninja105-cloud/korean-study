'use client'

export interface LessonItem {
  orderIndex: number
}

interface Props {
  lessons: LessonItem[]
  from: number
  to: number
  onChange: (from: number, to: number) => void
}

const SELECT_CLASS =
  'border border-border bg-surface-1 ' +
  'text-foreground rounded-lg px-2 py-1.5 text-sm'

export function isFullSpan(from: number, to: number, maxOrder: number): boolean {
  return from <= 1 && to >= maxOrder
}

/** Renders nothing if fewer than 2 lessons exist (filter is meaningless). */
export default function LessonRangeFilter({ lessons, from, to, onChange }: Props) {
  if (lessons.length < 2) return null

  const maxOrder = lessons[lessons.length - 1].orderIndex
  const full = isFullSpan(from, to, maxOrder)

  const handleFrom = (v: number) => {
    // Ensure from <= to
    onChange(v, Math.max(v, to))
  }

  const handleTo = (v: number) => {
    // Ensure from <= to
    onChange(Math.min(from, v), v)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted whitespace-nowrap">Lessons</span>
      <select
        value={from}
        onChange={(e) => handleFrom(Number(e.target.value))}
        className={SELECT_CLASS}
        aria-label="From lesson"
      >
        {lessons.map((l) => (
          <option key={l.orderIndex} value={l.orderIndex}>
            Lesson {l.orderIndex}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted">–</span>
      <select
        value={to}
        onChange={(e) => handleTo(Number(e.target.value))}
        className={SELECT_CLASS}
        aria-label="To lesson"
      >
        {lessons.map((l) => (
          <option key={l.orderIndex} value={l.orderIndex}>
            Lesson {l.orderIndex}
          </option>
        ))}
      </select>
      {!full && (
        <button
          onClick={() => onChange(1, maxOrder)}
          className="text-xs text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft"
        >
          All
        </button>
      )}
    </div>
  )
}
