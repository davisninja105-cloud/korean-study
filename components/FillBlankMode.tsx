'use client'

/**
 * FillBlankMode
 * =============
 * Presentational sub-component for the fill-in-the-blank study mode. Renders
 * the blanked-sentence prompt (or "Type the Korean for:" fallback), the text
 * input, the revealed answer panel, and its own sticky action bar (Check
 * Answer, or Wrong/Correct grade buttons).
 *
 * Pure presentation — owns NO session state (RESEARCH Pitfall 4). The parent
 * StudySession owns `fillInput`/`revealed`/`fillCorrect` and the
 * `normalizeAnswer`-based comparison; this component receives already-derived
 * values + `onInputChange`/`onReveal`/`onGrade` callbacks.
 *
 * Each mode owns its full sticky action-bar wrapper (RESEARCH Pitfall 3).
 */
import AudioButton from './AudioButton'
import { type Card, type PracticeCard, type Sentence } from './StudySession'

interface Props {
  card: Card | PracticeCard
  typeBadgeColor: string
  cursor: number
  fillSentence: string | null
  fillTranslation: string | null
  fillAnswer: string
  fillInput: string
  fillCorrect: boolean
  revealed: boolean
  chosenSentence: Sentence | null
  hints: { short: string; mastery: string }[] | null
  onInputChange: (value: string) => void
  onReveal: () => void
  onGrade: (rating: number) => void
}

export default function FillBlankMode({
  card,
  typeBadgeColor,
  cursor,
  fillSentence,
  fillTranslation,
  fillAnswer,
  fillInput,
  fillCorrect,
  revealed,
  chosenSentence,
  hints,
  onInputChange,
  onReveal,
  onGrade,
}: Props) {
  return (
    <>
      <div key={cursor} className="animate-card-in w-full">
        <div className="w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
            {card.type}
          </span>

          {fillSentence !== null ? (
            <>
              <p className="hangul-sentence text-foreground font-medium text-center">
                {fillSentence}
              </p>
              {fillTranslation && (
                <p className="text-sm text-muted text-center italic">{fillTranslation}</p>
              )}
              <p className="text-xs text-muted text-center">Fill in the blank (___)</p>
            </>
          ) : (
            <>
              <p className="text-xl text-muted-foreground text-center">Type the Korean for:</p>
              <p className="text-lg text-foreground font-medium text-center">{card.back}</p>
            </>
          )}
          <input
            type="text"
            value={fillInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) onReveal() }}
            placeholder="한국어로 입력하세요..."
            className="w-full border border-border bg-surface-1 text-foreground rounded-lg px-4 py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-button/50"
            disabled={revealed}
            autoFocus
          />
          {revealed && (
            <div className="text-center animate-reveal">
              <p className={`text-sm font-medium ${fillCorrect ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}`}>
                Correct answer: {fillAnswer}
              </p>
              {chosenSentence && (
                <div className="mt-2 flex items-center justify-center gap-1">
                  <AudioButton
                    text={chosenSentence.korean}
                    aria-label={`Play sentence: ${chosenSentence.korean}`}
                    size="sm"
                  />
                  <span className="text-xs text-muted">Hear it</span>
                </div>
              )}
              {card.notes && (
                <p className="text-sm text-muted mt-1">{card.notes}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Action bar (sticky above bottom nav on mobile) ── */}
      <div className="sticky bottom-[calc(4.5rem+var(--sab,0px))] sm:bottom-2 bg-surface-1/95 backdrop-blur-md saturate-150 -mx-4 px-4 pt-2 pb-2 w-[calc(100%+2rem)]">
        {!revealed && (
          <button
            onClick={onReveal}
            className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
          >
            Check Answer
          </button>
        )}

        {revealed && (
          <div className="flex gap-3 w-full animate-reveal">
            <button onClick={() => onGrade(1)} aria-label={hints ? `Wrong, review again in ${hints[0].short}` : 'Wrong'} className="flex-1 min-h-14 py-2 rounded-xl font-medium text-sm bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex flex-col items-center justify-center gap-0.5">
              <span className="font-semibold">Wrong</span>
              {hints && <span className="text-[10px] opacity-60">{hints[0].short}</span>}
            </button>
            <button onClick={() => onGrade(3)} aria-label={hints ? `Correct, ${hints[2].mastery}` : 'Correct'} className="flex-[1.5] min-h-14 py-2 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex flex-col items-center justify-center gap-0.5 shadow-sm">
              <span>Correct</span>
              {hints && <span className="text-[10px] font-normal opacity-80">{hints[2].mastery}</span>}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
