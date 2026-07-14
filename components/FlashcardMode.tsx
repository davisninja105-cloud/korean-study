'use client'

/**
 * FlashcardMode
 * =============
 * Presentational sub-component for the flashcard study mode. Renders the 3D
 * flip card and its own sticky action bar (Show Answer, or the four FSRS
 * grade buttons Again/Hard/Good/Easy). Shared by both Passive and Active:
 *
 * - Passive faces (front: bare-word / sentence; back: revealed answer +
 *   sentence, with the "See another example →" cycle control) — unchanged
 *   from the pre-Active surface.
 * - Active faces (`studyMode === 'active' && activeFace.face !== 'passive-degrade'`):
 *   front shows an English prompt (`activeFace.prompt`) with an optional
 *   hidden-until-tapped hint pill (sentence-production only — the hint would
 *   be circular for word-production, since the prompt already IS the
 *   English gloss); back pins the reveal to `chosenSentence` (never the
 *   cycling `displayedSentence`) with a grade-anchoring caption, or to the
 *   bare word/gloss block for the word-production fallback (practice cards,
 *   and any matured real card with zero sentences).
 * - A state <= 1 real card in Active mode silently falls through to the
 *   exact same Passive branches as a genuine Passive session — no badge, no
 *   copy, byte-identical rendering (D-03/D-10 — the ACTIVE-05 new-card gate).
 *
 * Pure presentation — owns NO session state. The parent StudySession retains
 * queue/stats/undo/saveError/hintRevealed and all useMemo/handlers (RESEARCH
 * Pitfall 4). The only hook called here is `useWordTap()` (tap-to-gloss),
 * matching the pattern of the pre-refactor inline JSX (RESEARCH Pitfall 3:
 * each mode owns its full sticky action-bar wrapper; no shared slot
 * abstraction).
 *
 * The parent-owned measurement refs (`frontRef`/`backRef`) and reveal-focus
 * ref (`againBtnRef`) are threaded through as props so the parent's measuring
 * `useLayoutEffect` and `handleReveal`'s `requestAnimationFrame` focus call
 * keep working unchanged.
 */
import { Lightbulb } from 'lucide-react'
import HighlightedSentence from './HighlightedSentence'
import AudioButton from './AudioButton'
import { useWordTap } from './GlossProvider'
import { type Card, type PracticeCard, type Sentence } from './StudySession'
import { type StudyMode } from './ModeSelector'
import { type ActiveFace } from '@/lib/active-prompt'

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
  studyMode: StudyMode
  activeFace: ActiveFace
  hintRevealed: boolean
  onToggleHint: () => void
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
  studyMode,
  activeFace,
  hintRevealed,
  onToggleHint,
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
              {studyMode === 'active' && activeFace.face !== 'passive-degrade' ? (
                // Active production faces (ACTIVE-01/03, D-07). English prompt,
                // NO hangul/Korean styling, no highlight, no audio (nothing
                // Korean to play pre-reveal). The hint pill only makes sense
                // for the sentence-production face — for word-production the
                // prompt already IS the English gloss, so a hint would just
                // repeat it (P-03).
                <>
                  <p data-testid="active-prompt" className="font-medium text-center text-2xl text-foreground">
                    {activeFace.prompt}
                  </p>
                  {activeFace.face === 'sentence-production' && (
                    <>
                      <button
                        type="button"
                        data-testid="hint-toggle"
                        onClick={onToggleHint}
                        className="inline-flex items-center gap-1 py-2 px-3 text-button"
                      >
                        <Lightbulb className="w-4 h-4" />
                        {!hintRevealed && <span className="text-sm font-semibold">Show hint</span>}
                      </button>
                      {hintRevealed && (
                        <p data-testid="hint-text" className="text-base italic text-muted-foreground animate-reveal">
                          Hint: {card.back}
                        </p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-muted text-center">Translate this, then reveal</p>
                </>
              ) : showBareFront ? (
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
              {studyMode === 'active' && activeFace.face === 'sentence-production' && chosenSentence ? (
                // Active sentence-production reveal (ACTIVE-03, D-15): pinned
                // to chosenSentence — NEVER the cycling displayedSentence —
                // since the reveal must stay pinned to the sentence the
                // English prompt was translated from (D-02). Keeps the
                // word/gloss block (card-front-word testid, Open Q2) but
                // drops the redundant sentence-translation line (it was the
                // prompt just read) and adds the grade-anchoring caption.
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="flex items-start justify-center gap-1">
                    <HighlightedSentence
                      korean={chosenSentence.korean}
                      targetForm={chosenSentence.targetForm}
                      cardType={card.type}
                      className="text-xl text-muted-foreground text-center"
                      onWordTap={onWordTap}
                    />
                    <AudioButton
                      text={chosenSentence.korean}
                      aria-label={`Play sentence: ${chosenSentence.korean}`}
                      size="sm"
                    />
                  </div>
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
                  {card.notes && (
                    <p className="text-sm text-muted text-center italic">{card.notes}</p>
                  )}
                  <p data-testid="active-anchor-caption" className="text-xs text-muted text-center">
                    Grade yourself on the highlighted expression — wording or word order can differ.
                  </p>
                </div>
              ) : studyMode === 'active' && activeFace.face === 'word-production' ? (
                // Active word-production reveal (P-03): existing bare-word
                // back rendering — no anchor caption (a bare word needs no
                // sentence-anchoring disambiguation).
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
              ) : chosenSentence ? (
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
                      data-testid="cycle-example-btn"
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
