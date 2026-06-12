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
  'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'text-gray-800 dark:text-gray-100 rounded-lg px-2 py-1.5 text-sm'

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
      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Lessons</span>
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
      <span className="text-sm text-gray-400 dark:text-gray-500">–</span>
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
          className="text-xs text-button hover:text-button-hover px-2 py-1 rounded-md hover:bg-button-soft"
        >
          All
        </button>
      )}
    </div>
  )
}
