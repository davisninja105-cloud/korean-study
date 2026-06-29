export default function StudyLoading() {
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 pt-4">
      {/* Thin progress bar */}
      <div className="h-3 w-full rounded bg-surface-2 animate-pulse" />
      {/* Large flashcard placeholder */}
      <div className="h-[220px] w-full rounded-2xl bg-surface-2 animate-pulse" />
      {/* Start button placeholder */}
      <div className="h-12 w-full rounded-xl bg-surface-2 animate-pulse" />
    </div>
  )
}
