'use client'

/**
 * FlashcardMode
 * =============
 * Presentational sub-component for the flashcard study mode. Renders the 3D
 * flip card (front: bare-word / sentence; back: revealed answer + sentence)
 * and its own sticky action bar (Show Answer, or the four FSRS grade buttons
 * Again/Hard/Good/Easy). Shared by both Passive and Active — Active's
 * production-mode front/back branches land in Plan 28-02.
 *
 * Pure presentation — owns NO session state. The parent StudySession retains
 * queue/stats/undo/saveError and all useMemo/handlers (RESEARCH Pitfall 4).
 * The only hook called here is `useWordTap()` (tap-to-gloss), matching the
 * pattern of the pre-refactor inline JSX (RESEARCH Pitfall 3: each mode owns
 * its full sticky action-bar wrapper; no shared slot abstraction).
 *
 * The parent-owned measurement refs (`frontRef`/`backRef`) and reveal-focus
 * ref (`againBtnRef`) are threaded through as props so the parent's measuring
 * `useLayoutEffect` and `handleReveal`'s `requestAnimationFrame` focus call
 * keep working unchanged.
 */
import HighlightedSentence from './HighlightedSentence'
import AudioButton from './AudioButton'
import { useWordTap } from './GlossProvider'
import { type Card, type PracticeCard, type Sentence } from './StudySession'

interface Props {
  card: Card | PracticeCard
  typeBadgeColor: string
  revealed: boolean
  cardHeight: number
  frontRef: React.RefObject<HTMLDivElement | null>
  backRef: React.RefObject<HTMLDivElement | null>
  againBtnRef: React.RefObject<HTMLButtonElement | null>
  cursor: number
  showBareFront: boolean
  chosenSentence: Sentence | null
  displayedSentence: Sentence | null
  hasMultipleSentences: boolean
  hints: { short: string; mastery: string }[] | null
  onReveal: () => void
  onGrade: (rating: number) => void
  onCycleExample: () => void
}

export default function FlashcardMode({
  card,
  typeBadgeColor,
  revealed,
  cardHeight,
  frontRef,
  backRef,
  againBtnRef,
  cursor,
  showBareFront,
  chosenSentence,
  displayedSentence,
  hasMultipleSentences,
  hints,
  onReveal,
  onGrade,
  onCycleExample,
}: Props) {
  // Tap-to-gloss callback (undefined when GlossProvider not mounted — safe).
  // Sole hook permitted in mode components per RESEARCH Pitfall 4.
  const onWordTap = useWordTap()

  return (
    <>
      <div key={cursor} className="animate-card-in w-full">
        <div className="card-flip-container w-full">
          <div className={`card-flip-inner ${revealed ? 'flipped' : ''}`} style={{ height: cardHeight }}>
            {/* ── Front face ── */}
            <div ref={frontRef} className="card-flip-front w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
                {card.type}
              </span>
              {showBareFront ? (
                // New card whose context words aren't all known yet: bare word on front.
                <div className="flex items-center justify-center gap-2">
                  <p className="hangul text-5xl font-bold text-foreground text-center">{card.front}</p>
                  <AudioButton text={card.front} aria-label={`Play: ${card.front}`} size="sm" />
                </div>
              ) : chosenSentence ? (
                // Matured card (state 2/3): sentence-on-front.
                <>
                  <div className="flex items-start justify-center gap-1">
                    <HighlightedSentence
                      korean={chosenSentence.korean}
                      targetForm={chosenSentence.targetForm}
                      cardType={card.type}
                      className="font-medium text-center text-2xl text-foreground"
                      onWordTap={onWordTap}
                    />
                    <AudioButton
                      text={chosenSentence.korean}
                      aria-label={`Play sentence: ${chosenSentence.korean}`}
                      size="sm"
                    />
                  </div>
                  <p className="text-xs text-muted text-center">Recall the meaning of the highlighted part</p>
                </>
              ) : (
                // No sentences at all: bare-word block unchanged.
                <div className="flex items-center justify-center gap-2">
                  <p className="hangul text-5xl font-bold text-foreground text-center">{card.front}</p>
                  <AudioButton
                    text={card.front}
                    aria-label={`Play: ${card.front}`}
                    size="sm"
                  />
                </div>
              )}
            </div>

            {/* ── Back face ── */}
            <div ref={backRef} className="card-flip-back w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
                {card.type}
              </span>
              {chosenSentence ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  {displayedSentence && (
                    <div className="flex items-start justify-center gap-1">
                      <HighlightedSentence
                        korean={displayedSentence.korean}
                        targetForm={displayedSentence.targetForm}
                        cardType={card.type}
                        className="text-xl text-muted-foreground text-center"
                        onWordTap={onWordTap}
                      />
                      <AudioButton
                        text={displayedSentence.korean}
                        aria-label={`Play sentence: ${displayedSentence.korean}`}
                        size="sm"
                      />
                    </div>
                  )}
                  <hr className="w-full border-border" />
                  <div className="flex items-center justify-center gap-2">
                    <p data-testid="card-front-word" className="hangul text-3xl font-bold text-foreground text-center">{card.front}</p>
                    <AudioButton
                      text={card.front}
                      aria-label={`Play: ${card.front}`}
                      size="sm"
                    />
                  </div>
                  <p className="text-xl text-muted-foreground text-center">{card.back}</p>
                  {displayedSentence?.translation && (
                    <p className="text-sm text-muted text-center italic hangul-gloss">
                      &ldquo;{displayedSentence.translation}&rdquo;
                    </p>
                  )}
                  {card.notes && (
                    <p className="text-sm text-muted text-center italic">{card.notes}</p>
                  )}
                  {hasMultipleSentences && (
                    <button
                      onClick={onCycleExample}
                      className="text-xs text-button hover:text-button-hover hover:underline mt-1"
                    >
                      See another example →
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="flex items-center justify-center gap-2">
                    <p data-testid="card-front-word" className="hangul text-5xl font-bold text-foreground text-center">{card.front}</p>
                    <AudioButton
                      text={card.front}
                      aria-label={`Play: ${card.front}`}
                      size="sm"
                    />
                  </div>
                  <hr className="w-full border-border" />
                  <p className="text-xl text-muted-foreground text-center">{card.back}</p>
                  {card.notes && (
                    <p className="text-sm text-muted text-center italic">{card.notes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action bar (sticky above bottom nav on mobile) ── */}
      <div className="sticky bottom-[calc(4.5rem+var(--sab,0px))] sm:bottom-2 bg-surface-1/95 backdrop-blur-md saturate-150 -mx-4 px-4 pt-2 pb-2 w-[calc(100%+2rem)]">
        {!revealed && (
          <button
            data-testid="reveal-btn"
            onClick={onReveal}
            className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
          >
            Show Answer
          </button>
        )}

        {revealed && (
          <div className="flex gap-2 w-full animate-reveal">
            {/* Again — softer warning */}
            <button
              ref={againBtnRef}
              data-testid="grade-again"
              onClick={() => onGrade(1)}
              aria-label={hints ? `Again, review again in ${hints[0].short}` : 'Again'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Again</span>
              {hints && <span className="text-[10px] opacity-60 text-center leading-tight">{hints[0].short}</span>}
            </button>
            {/* Hard — tertiary */}
            <button
              data-testid="grade-hard"
              onClick={() => onGrade(2)}
              aria-label={hints ? `Hard, review again in ${hints[1].short}` : 'Hard'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-surface-3 text-muted hover:bg-surface-3 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Hard</span>
              {hints && <span className="text-[10px] opacity-60 text-center leading-tight">{hints[1].short}</span>}
            </button>
            {/* Good — primary */}
            <button
              data-testid="grade-good"
              onClick={() => onGrade(3)}
              aria-label={hints ? `Good, ${hints[2].mastery}` : 'Good'}
              className="flex-[1.5] min-h-14 py-2 px-2 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex flex-col items-center justify-center gap-0.5 shadow-sm"
            >
              <span>Good</span>
              {hints && <span className="text-[10px] font-normal opacity-80 text-center leading-tight">{hints[2].mastery}</span>}
            </button>
            {/* Easy — warm reward token */}
            <button
              data-testid="grade-easy"
              onClick={() => onGrade(4)}
              aria-label={hints ? `Easy, review again in ${hints[3].short}` : 'Easy'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-reward-soft text-reward hover:opacity-90 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Easy</span>
              {hints && <span className="text-[10px] opacity-60 text-center leading-tight">{hints[3].short}</span>}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
