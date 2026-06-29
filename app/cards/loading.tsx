export default function CardsLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: search input + filter button + add button */}
      <div className="flex gap-2 items-center">
        <div className="h-11 rounded-lg bg-surface-2 animate-pulse flex-1 min-w-0" />
        <div className="h-11 w-11 rounded-lg bg-surface-2 animate-pulse shrink-0" />
        <div className="h-11 w-24 rounded-lg bg-surface-2 animate-pulse shrink-0" />
      </div>

      {/* View-toggle pill */}
      <div className="h-11 w-56 rounded-lg bg-surface-2 animate-pulse" />

      {/* Card row skeletons */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-2">
          <div className="h-4 w-16 rounded-full bg-surface-2 animate-pulse" />
          <div className="h-5 w-32 rounded bg-surface-2 animate-pulse" />
          <div className="h-4 w-48 rounded bg-surface-2 animate-pulse" />
          <div className="h-4 w-3/4 rounded bg-surface-2 animate-pulse" />
        </div>
      ))}
    </div>
  )
}
