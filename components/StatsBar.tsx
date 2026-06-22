interface Props {
  totalCards: number
  totalLessons: number
  level: string
}

/**
 * Quiet secondary stats strip for the home dashboard. Reference numbers only —
 * the actionable "due" count lives in the hero, so this recedes (small text,
 * surface-2, no shadow).
 */
export default function StatsBar({ totalCards, totalLessons, level }: Props) {
  const items = [
    { value: totalCards.toLocaleString(), label: 'Cards' },
    { value: totalLessons.toLocaleString(), label: 'Lessons' },
    { value: level || '—', label: 'Level' },
  ]
  return (
    <div className="grid grid-cols-3 bg-surface-2 rounded-2xl divide-x divide-gray-200 dark:divide-gray-700">
      {items.map((it) => (
        <div key={it.label} className="px-3 py-3 flex flex-col items-center gap-0.5">
          <span className="text-base font-semibold text-gray-700 dark:text-gray-200">{it.value}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{it.label}</span>
        </div>
      ))}
    </div>
  )
}
