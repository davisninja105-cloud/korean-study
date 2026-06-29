export default function HabitsLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header row: title + back link */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-surface-3 animate-pulse" />
        <div className="h-5 w-24 rounded bg-surface-3 animate-pulse" />
      </div>

      {/* Streak hero */}
      <div className="h-32 w-full rounded-2xl bg-surface-3 animate-pulse" />

      {/* All-time totals */}
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded bg-surface-3 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface-3 animate-pulse" />
          ))}
        </div>
      </div>

      {/* 30-day trend */}
      <div className="flex flex-col gap-3">
        <div className="h-6 w-32 rounded bg-surface-3 animate-pulse" />
        <div className="h-16 w-full rounded-xl bg-surface-3 animate-pulse" />
      </div>

      {/* Heatmap */}
      <div className="flex flex-col gap-3">
        <div className="h-6 w-24 rounded bg-surface-3 animate-pulse" />
        <div className="h-40 w-full rounded-2xl bg-surface-3 animate-pulse" />
      </div>
    </div>
  )
}
