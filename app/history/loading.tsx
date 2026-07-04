export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header row: title + back link */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-surface-3 animate-pulse" />
        <div className="h-5 w-24 rounded bg-surface-3 animate-pulse" />
      </div>

      {/* Feed rows */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 w-full rounded-xl bg-surface-3 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
