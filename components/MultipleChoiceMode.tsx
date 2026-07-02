'use client'

/**
 * MultipleChoiceMode
 * ==================
 * Presentational sub-component for the multiple-choice study mode. Renders the
 * 4-option grid (correct/selected coloring after answer) and its own sticky
 * action bar with a single "Next →" button.
 *
 * Pure presentation — owns NO session state (RESEARCH Pitfall 4). The parent
 * StudySession owns `mcSelected`, the auto-advance timer, and `mcRating`; this
 * component receives `selected` + `onSelect`/`onAdvance` callbacks. Selecting
 * an option calls `onSelect(opt)` (the parent sets `mcSelected` and arms the
 * auto-advance timer). The "Next →" button calls `onAdvance` (the parent calls
 * `advanceMc(mcRating)`).
 *
 * Each mode owns its full sticky action-bar wrapper (RESEARCH Pitfall 3).
 */
import AudioButton from './AudioButton'
import { type Card } from './StudySession'

interface Props {
  card: Card
  typeBadgeColor: string
  cursor: number
  options: string[]
  selected: string | null
  onSelect: (opt: string) => void
  onAdvance: () => void
}

export default function MultipleChoiceMode({
  card,
  typeBadgeColor,
  cursor,
  options,
  selected,
  onSelect,
  onAdvance,
}: Props) {
  return (
    <>
      <div key={cursor} className="animate-card-in w-full">
        <div className="w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
            {card.type}
          </span>

          <div className="flex items-center justify-center gap-2">
            <p className="hangul text-4xl font-bold text-foreground text-center">{card.front}</p>
            <AudioButton text={card.front} aria-label={`Play: ${card.front}`} size="sm" />
          </div>
          <div className="grid grid-cols-2 gap-3 w-full mt-4">
            {options.map((opt, i) => {
              const isCorrect = opt === card.back
              const isSelected = selected === opt
              const hasAnswered = selected !== null

              let btnClass = 'border-2 rounded-xl p-3 min-h-11 text-sm font-medium transition-colors text-left'
              if (!hasAnswered) {
                btnClass += ' border-border text-muted-foreground hover:border-button hover:bg-button-soft'
              } else if (isCorrect) {
                btnClass += ' border-green-500 bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
              } else if (isSelected) {
                btnClass += ' border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
              } else {
                btnClass += ' border-border text-muted-foreground opacity-50'
              }

              return (
                <button
                  key={i}
                  disabled={hasAnswered}
                  onClick={() => onSelect(opt)}
                  className={`relative ${btnClass}`}
                >
                  {!hasAnswered && (
                    <span className="absolute top-1 left-1.5 text-[10px] text-muted font-mono leading-none select-none">
                      {i + 1}
                    </span>
                  )}
                  {opt}
                </button>
              )
            })}
          </div>
          {selected && card.notes && (
            <p className="text-sm text-muted text-center italic mt-2">{card.notes}</p>
          )}
        </div>
      </div>

      {/* ── Action bar (sticky above bottom nav on mobile) ── */}
      <div className="sticky bottom-[calc(4.5rem+var(--sab,0px))] sm:bottom-2 bg-surface-1/95 backdrop-blur-md saturate-150 -mx-4 px-4 pt-2 pb-2 w-[calc(100%+2rem)]">
        {selected && (
          <button
            onClick={onAdvance}
            className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
          >
            Next →
          </button>
        )}
      </div>
    </>
  )
}
