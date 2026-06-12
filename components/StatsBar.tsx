interface Stats {
  totalCards: number
  dueCards: number
  totalLessons: number
}

export default function StatsBar({ totalCards, dueCards, totalLessons }: Stats) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-4 sm:p-6 flex flex-col items-center gap-1">
        <span className="text-2xl sm:text-3xl font-bold text-blue-500">{dueCards}</span>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Due Today</span>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-4 sm:p-6 flex flex-col items-center gap-1">
        <span className="text-2xl sm:text-3xl font-bold text-gray-700 dark:text-gray-200">{totalCards}</span>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Total Cards</span>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-4 sm:p-6 flex flex-col items-center gap-1">
        <span className="text-2xl sm:text-3xl font-bold text-gray-700 dark:text-gray-200">{totalLessons}</span>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Lessons</span>
      </div>
    </div>
  )
}
