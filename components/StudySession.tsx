'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { StudyMode, FlashcardSubMode } from './ModeSelector'
import { habitDateStr, DEFAULT_DAY_START_HOUR } from '@/lib/habit'
import HighlightedSentence from './HighlightedSentence'
import { sentenceMatch, blankSentence } from '@/lib/sentence-match'

interface Sentence {
  id: string
  korean: string
  targetForm: string
  translation: string
}

interface Card {
  id: string
  type: string
  front: string
  back: string
  notes?: string | null
  distractors?: string | null      // JSON array of wrong English meanings
  // Legacy cloze fields — kept for backwards-compat fallback in fill-blank
  clozeSentence?: string | null
  clozeAnswer?: string | null
  clozeTranslation?: string | null
  sentences?: Sentence[]
  review?: { reps?: number } | null
}

interface PracticeCard {
  type: string
  front: string
  back: string
  notes?: string
}

// How long multiple-choice waits before auto-advancing. A "Next" button lets
// the user skip the wait and move on immediately.
const MC_ADVANCE_MS = 4500

// Normalize answers for forgiving fill-in-the-blank comparison.
function normalizeAnswer(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

// Deterministic (pure) shuffle so it can run during render without violating
// React's purity rules. Randomness comes from a per-session seed (see below).
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Pure FNV-1a hash for a string → unsigned 32-bit int.
// Used to pick a per-card sentence index that varies across sessions as reps
// grow: (hashStr(card.id) + reps) % sentences.length.
// No Math.random() / Date.now() — purity-safe.
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

type StudyItem =
  | { kind: 'real'; card: Card }
  | { kind: 'practice'; card: PracticeCard }

interface Props {
  cards: Card[]
  extraPractice: PracticeCard[]
  mode: StudyMode
  flashcardSubMode?: FlashcardSubMode  // 'exposure' (default) | 'recall'
  onComplete: (stats: { reviewed: number; correct: number; incorrect: number }) => void
}

export default function StudySession({ cards, extraPractice, mode, flashcardSubMode = 'exposure', onComplete }: Props) {
  // Deterministic seed derived from the due-card set. Pure (no impure call in
  // render), and naturally varies between sessions because the set of due
  // cards differs each time.
  const seed = useMemo(() => {
    let h = 2166136261
    for (const c of cards) {
      for (let i = 0; i < c.id.length; i++) {
        h ^= c.id.charCodeAt(i)
        h = Math.imul(h, 16777619)
      }
    }
    return (h >>> 0) || 1
  }, [cards])

  const items: StudyItem[] = useMemo(() => {
    const shuffled = seededShuffle(cards, seed)
    const real: StudyItem[] = shuffled.map((c) => ({ kind: 'real', card: c }))
    const practice: StudyItem[] = extraPractice.map((c) => ({ kind: 'practice', card: c }))
    return [...real, ...practice]
  }, [cards, extraPractice, seed])

  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [fillInput, setFillInput] = useState('')
  const [mcSelected, setMcSelected] = useState<string | null>(null)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, incorrect: 0 })
  // "See another example →": cycles through a card's extra sentences on the reveal side
  const [exampleOffset, setExampleOffset] = useState(0)

  // Day-start hour for habit attribution (default until settings load).
  const dayStartHourRef = useRef(DEFAULT_DAY_START_HOUR)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { if (typeof d.dayStartHour === 'number') dayStartHourRef.current = d.dayStartHour })
      .catch(() => {})
  }, [])

  // Timer for multiple-choice auto-advance; cleared on manual Next / unmount.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current) }, [])

  // --- Active study-time tracking (feeds the dashboard habit streak) ---
  const secBuffer = useRef(0)
  const reviewBuffer = useRef(0)
  const lastInteraction = useRef(0)
  useEffect(() => {
    const IDLE_MS = 120_000
    lastInteraction.current = Date.now()
    const bump = () => { lastInteraction.current = Date.now() }
    const flush = (useBeacon = false) => {
      const seconds = secBuffer.current
      const reviews = reviewBuffer.current
      if (seconds <= 0 && reviews <= 0) return
      secBuffer.current = 0
      reviewBuffer.current = 0
      const body = JSON.stringify({ date: habitDateStr(dayStartHourRef.current), seconds, reviews })
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/activity', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {})
      }
    }

    const tick = setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current < IDLE_MS) {
        secBuffer.current += 1
      }
    }, 1000)
    const flushInterval = setInterval(() => flush(), 30_000)

    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(true) }
    const onPageHide = () => flush(true)
    window.addEventListener('pointerdown', bump)
    window.addEventListener('keydown', bump)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      clearInterval(tick)
      clearInterval(flushInterval)
      window.removeEventListener('pointerdown', bump)
      window.removeEventListener('keydown', bump)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      flush()
    }
  }, [])

  // Build the four multiple-choice options. Prefer the card's pre-generated
  // distractors (high quality); fall back to scraping other cards' answers for
  // legacy cards or practice items that have none.
  const mcOptions = useMemo(() => {
    if (mode !== 'multiple-choice' || index >= items.length) return []
    const item = items[index]
    const current = item.card

    let distractors: string[] = []
    if (item.kind === 'real' && item.card.distractors) {
      try {
        distractors = (JSON.parse(item.card.distractors) as string[])
          .filter((d) => d && d !== current.back)
      } catch {
        distractors = []
      }
    }

    if (distractors.length < 3) {
      const pool = seededShuffle(
        [...new Set(
          items.map((i) => i.card.back).filter((b) => b !== current.back && !distractors.includes(b))
        )],
        seed + index
      )
      distractors = [...distractors, ...pool].slice(0, 3)
    } else {
      distractors = distractors.slice(0, 3)
    }

    return seededShuffle([...distractors, current.back], seed + index * 31)
  }, [mode, index, items, seed])

  if (index >= items.length) return null

  const item = items[index]
  const currentCard = item.card
  const isPractice = item.kind === 'practice'
  const totalCount = items.length

  // ── Sentence logic ───────────────────────────────────────────────────────
  // All sentence logic is pure (hashStr, sentenceMatch, blankSentence have no side effects).
  const realCard = item.kind === 'real' ? item.card : null
  const cardSentences = realCard?.sentences ?? []

  // Whether the current mode needs a blank-safe sentence to function correctly.
  // Exposure flashcard rotates freely; Recall and fill-blank require safeToBlank.
  const needsBlank =
    mode === 'fill-blank' ||
    (mode === 'flashcard' && flashcardSubMode === 'recall')

  // Rotation base — decorrelated by card id, varies across reviews as reps grows.
  const rotationIdx = cardSentences.length > 0
    ? (hashStr(realCard!.id) + (realCard!.review?.reps ?? 0)) % cardSentences.length
    : -1

  // When a blank is needed and rotation lands on an unsafe sentence, use the first
  // blank-safe sentence instead (the prompt guarantees index 0 is blank-safe).
  // Exposure always uses rotationIdx for contextual variety across sessions.
  const chosenIdx = (() => {
    if (rotationIdx < 0) return -1
    if (!needsBlank) return rotationIdx
    if (sentenceMatch(cardSentences[rotationIdx].korean, cardSentences[rotationIdx].targetForm).safeToBlank) {
      return rotationIdx
    }
    const safeIdx = cardSentences.findIndex(
      (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
    )
    return safeIdx >= 0 ? safeIdx : rotationIdx  // preserve graceful degrade if none safe
  })()

  // chosenSentence = selected for this review; used for fill-blank answer / Recall front
  const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null

  // displayedSentence = shown on revealed side; cycles via "See another example →"
  const displayedSentence = chosenSentence !== null
    ? cardSentences[(chosenIdx + exampleOffset) % cardSentences.length]
    : null

  // Fill-blank: use chosenSentence if safe to blank, else fall back to legacy cloze
  const chosenMatch = chosenSentence
    ? sentenceMatch(chosenSentence.korean, chosenSentence.targetForm)
    : null
  const useChosenForFill = !!(chosenMatch?.found && chosenMatch.safeToBlank)

  // For Recall flashcard front: blank the chosen sentence (or degrade to Exposure if unsafe)
  const recallBlanked = chosenSentence && chosenMatch?.safeToBlank
    ? blankSentence(chosenSentence.korean, chosenSentence.targetForm)
    : null  // null → Recall degrades to Exposure for this card

  const hasCloze = !!(realCard?.clozeSentence && realCard.clozeAnswer)

  // Fill-blank prompts (in priority order: new sentence > legacy cloze > plain)
  const fillSentence = useChosenForFill
    ? blankSentence(chosenSentence!.korean, chosenSentence!.targetForm)
    : hasCloze ? realCard!.clozeSentence! : null
  const fillTranslation = useChosenForFill
    ? chosenSentence!.translation
    : hasCloze ? realCard!.clozeTranslation ?? null : null
  const fillAnswer = useChosenForFill
    ? chosenSentence!.targetForm
    : hasCloze ? realCard!.clozeAnswer! : currentCard.front
  const fillCorrect = normalizeAnswer(fillInput) === normalizeAnswer(fillAnswer)

  // ── Type badge colours ────────────────────────────────────────────────────
  const typeBadgeColor =
    currentCard.type === 'vocabulary'     ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' :
    currentCard.type === 'grammar'        ? 'bg-purple-100 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300' :
    currentCard.type === 'example-sentence' ? 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300' :
    currentCard.type === 'fill-blank'     ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300' :
    currentCard.type === 'transformation' ? 'bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300' :
    'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300'

  // ── FSRS review submission ────────────────────────────────────────────────
  // FSRS ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
  const submitReview = async (rating: number) => {
    reviewBuffer.current += 1
    const isCorrect = rating >= 3
    setStats((s) => ({
      reviewed: s.reviewed + 1,
      correct: s.correct + (isCorrect ? 1 : 0),
      incorrect: s.incorrect + (isCorrect ? 0 : 1),
    }))

    if (!isPractice) {
      await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: (item.card as Card).id, rating }),
      })
    }

    const next = index + 1
    if (next >= totalCount) {
      const finalStats = {
        reviewed: stats.reviewed + 1,
        correct: stats.correct + (isCorrect ? 1 : 0),
        incorrect: stats.incorrect + (isCorrect ? 0 : 1),
      }
      onComplete(finalStats)
      return
    }

    setIndex(next)
    setRevealed(false)
    setFillInput('')
    setMcSelected(null)
    setExampleOffset(0)  // reset "see another" cycling on card advance
  }

  const advanceMc = (rating: number) => {
    if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null }
    submitReview(rating)
  }

  const mcRating = mcSelected === currentCard.back ? 3 : 1

  return (
    <div className="flex flex-col items-center gap-6 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-xl mx-auto">
      {/* Progress */}
      <div className="flex justify-between items-center w-full text-sm text-gray-400 dark:text-gray-500">
        <span className="capitalize">{index + 1} / {totalCount} · {isPractice ? 'AI Practice' : mode.replace('-', ' ')}</span>
        <button
          onClick={() => onComplete(stats)}
          className="px-2 py-1 rounded-md hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          End
        </button>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all"
          style={{ width: `${((index + 1) / totalCount) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
          {currentCard.type}
        </span>

        {/* ── Flashcard mode ── */}
        {mode === 'flashcard' && (
          <>
            {chosenSentence ? (
              /* Sentence-context front */
              <>
                {!revealed ? (
                  /* FRONT — sentence context */
                  <>
                    {flashcardSubMode === 'recall' && recallBlanked ? (
                      /* Recall: sentence with target blanked — retrieve before revealing */
                      <>
                        <p className="text-2xl text-gray-800 dark:text-gray-100 font-medium text-center leading-relaxed">
                          {recallBlanked}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Recall the missing word</p>
                      </>
                    ) : (
                      /* Exposure (default) or Recall-degraded: sentence with target highlighted */
                      <>
                        <HighlightedSentence
                          korean={chosenSentence.korean}
                          targetForm={chosenSentence.targetForm}
                          className="text-2xl text-gray-800 dark:text-gray-100 font-medium text-center leading-relaxed"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Recall the meaning of the highlighted part</p>
                      </>
                    )}
                  </>
                ) : (
                  /* FLIP — sentence stays visible + bare word + meaning */
                  <>
                    {/* Sentence with target still highlighted (context preserved) */}
                    {displayedSentence && (
                      <HighlightedSentence
                        korean={displayedSentence.korean}
                        targetForm={displayedSentence.targetForm}
                        className="text-xl text-gray-700 dark:text-gray-200 text-center leading-relaxed"
                      />
                    )}
                    <hr className="w-full border-gray-200 dark:border-gray-700" />
                    {/* Bare word / pattern */}
                    <p className="text-3xl font-bold text-gray-800 dark:text-gray-100 text-center">{currentCard.front}</p>
                    <p className="text-xl text-gray-600 dark:text-gray-300 text-center">{currentCard.back}</p>
                    {/* Translation of the displayed sentence */}
                    {displayedSentence?.translation && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic">
                        &ldquo;{displayedSentence.translation}&rdquo;
                      </p>
                    )}
                    {currentCard.notes && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic">{currentCard.notes}</p>
                    )}
                    {/* "See another example →" — only when card has >1 sentence */}
                    {cardSentences.length > 1 && (
                      <button
                        onClick={() => setExampleOffset((o) => o + 1)}
                        className="text-xs text-button hover:text-button-hover hover:underline mt-1"
                      >
                        See another example →
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              /* No sentence — unchanged plain front → back */
              <>
                <p className="text-4xl font-bold text-gray-800 dark:text-gray-100 text-center">{currentCard.front}</p>
                {revealed && (
                  <>
                    <hr className="w-full border-gray-200 dark:border-gray-700" />
                    <p className="text-xl text-gray-600 dark:text-gray-300 text-center">{currentCard.back}</p>
                    {currentCard.notes && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic">{currentCard.notes}</p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Multiple choice mode ── */}
        {mode === 'multiple-choice' && (
          <>
            <p className="text-4xl font-bold text-gray-800 dark:text-gray-100 text-center">{currentCard.front}</p>
            <div className="grid grid-cols-2 gap-3 w-full mt-4">
              {mcOptions.map((opt, i) => {
                const isCorrect = opt === currentCard.back
                const isSelected = mcSelected === opt
                const hasAnswered = mcSelected !== null

                let btnClass = 'border-2 rounded-xl p-3 min-h-11 text-sm font-medium transition-colors text-left'
                if (!hasAnswered) {
                  btnClass += ' border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-blue-50 dark:hover:border-blue-500 dark:hover:bg-blue-500/10'
                } else if (isCorrect) {
                  btnClass += ' border-green-500 bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300'
                } else if (isSelected) {
                  btnClass += ' border-red-500 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                } else {
                  btnClass += ' border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 opacity-50'
                }

                return (
                  <button
                    key={i}
                    disabled={hasAnswered}
                    onClick={() => {
                      setMcSelected(opt)
                      const rating = isCorrect ? 3 : 1
                      advanceTimer.current = setTimeout(() => advanceMc(rating), MC_ADVANCE_MS)
                    }}
                    className={btnClass}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {mcSelected && currentCard.notes && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic mt-2">{currentCard.notes}</p>
            )}
          </>
        )}

        {/* ── Fill in the blank mode ── */}
        {mode === 'fill-blank' && (
          <>
            {fillSentence !== null ? (
              <>
                <p className="text-2xl text-gray-800 dark:text-gray-100 font-medium text-center leading-relaxed">
                  {fillSentence}
                </p>
                {fillTranslation && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center italic">{fillTranslation}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">Fill in the blank (___)</p>
              </>
            ) : (
              <>
                <p className="text-xl text-gray-600 dark:text-gray-300 text-center">Type the Korean for:</p>
                <p className="text-lg text-gray-800 dark:text-gray-100 font-medium text-center">{currentCard.back}</p>
              </>
            )}
            <input
              type="text"
              value={fillInput}
              onChange={(e) => setFillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) setRevealed(true) }}
              placeholder="한국어로 입력하세요..."
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
              disabled={revealed}
              autoFocus
            />
            {revealed && (
              <div className="text-center">
                <p className={`text-sm font-medium ${fillCorrect ? 'text-green-600 dark:text-green-400' : 'text-orange-500 dark:text-orange-400'}`}>
                  Correct answer: {fillAnswer}
                </p>
                {currentCard.notes && (
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{currentCard.notes}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Action buttons ── */}
      {mode === 'flashcard' && !revealed && (
        <button
          onClick={() => setRevealed(true)}
          className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
        >
          Show Answer
        </button>
      )}

      {mode === 'flashcard' && revealed && (
        <div className="flex gap-3 w-full">
          <button onClick={() => submitReview(1)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors">
            Again
          </button>
          <button onClick={() => submitReview(2)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-500/30 transition-colors">
            Hard
          </button>
          <button onClick={() => submitReview(3)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-500/30 transition-colors">
            Good
          </button>
          <button onClick={() => submitReview(4)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors">
            Easy
          </button>
        </div>
      )}

      {mode === 'multiple-choice' && mcSelected && (
        <button
          onClick={() => advanceMc(mcRating)}
          className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
        >
          Next →
        </button>
      )}

      {mode === 'fill-blank' && !revealed && (
        <button
          onClick={() => setRevealed(true)}
          className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
        >
          Check Answer
        </button>
      )}

      {mode === 'fill-blank' && revealed && (
        <div className="flex gap-3 w-full">
          <button onClick={() => submitReview(1)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors">
            Wrong
          </button>
          <button onClick={() => submitReview(3)} className="flex-1 min-h-11 py-3 rounded-xl font-semibold text-sm bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-500/30 transition-colors">
            Correct
          </button>
        </div>
      )}
    </div>
  )
}
