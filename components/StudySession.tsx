'use client'

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { StudyMode, FlashcardSubMode } from './ModeSelector'
import { habitDateStr, DEFAULT_DAY_START_HOUR, nextHabitDayStart } from '@/lib/habit'
import HighlightedSentence from './HighlightedSentence'
import { useWordTap } from './GlossProvider'
import AudioButton from './AudioButton'
import { sentenceMatch, blankSentence } from '@/lib/sentence-match'
import { previewIntervalLabels } from '@/lib/fsrs'
import { haptic } from '@/lib/haptics'
import { typeBadgeClass } from '@/lib/card-style'
import ProgressRing from './ProgressRing'

interface Sentence {
  id: string
  korean: string
  targetForm: string
  translation: string
  unknownCount?: number
}

interface Card {
  id: string
  type: string
  front: string
  back: string
  notes?: string | null
  distractors?: string | null      // JSON array of wrong English meanings
  sentences?: Sentence[]
  review?: {
    reps?: number | null
    state?: number | null
    stability?: number | null
    difficulty?: number | null
    elapsedDays?: number | null
    scheduledDays?: number | null
    lapses?: number | null
    nextReview?: string | null
    lastReview?: string | null
  } | null
}

interface PracticeCard {
  type: string
  front: string
  back: string
  notes?: string
}

// How long multiple-choice waits before auto-advancing. A "Next" button lets
// the user skip the wait and move on immediately.
const MC_ADVANCE_MS = 1800

// How many cards ahead a re-queued card is inserted. Keeps a lapsed card from
// reappearing immediately when other cards are available.
const REQUEUE_GAP = 4

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
  // Tap-to-gloss callback (undefined when GlossProvider not mounted — safe)
  const onWordTap = useWordTap()

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

  // Queue: mutable list of remaining items. Always show queue[0].
  // Initialized once — the component is remounted per batch via key={sessionKey}.
  // initialCount is derived from stable props so it's safe to compute during render.
  const initialCount = cards.length + extraPractice.length
  const [queue, setQueue] = useState<StudyItem[]>(() => {
    // Server already returns cards in foundation-first blended order (lib/sequence.ts).
    // Preserve that order — do NOT shuffle here. seededShuffle is still used below
    // for multiple-choice option ordering.
    const real: StudyItem[] = cards.map((c) => ({ kind: 'real', card: c }))
    const practice: StudyItem[] = extraPractice.map((c) => ({ kind: 'practice', card: c }))
    return [...real, ...practice]
  })
  // Monotonically-increasing counter; bumped on every advance/undo to drive the refocus effect.
  const [cursor, setCursor] = useState(0)

  const [revealed, setRevealed] = useState(false)
  const [fillInput, setFillInput] = useState('')
  const [mcSelected, setMcSelected] = useState<string | null>(null)
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, incorrect: 0 })
  // "See another example →": cycles through a card's extra sentences on the reveal side
  const [exampleOffset, setExampleOffset] = useState(0)
  // Interval hints for FSRS rating buttons (computed on reveal, cleared on advance)
  const [intervalHints, setIntervalHints] = useState<{ short: string; mastery: string }[] | null>(null)
  // Undo: track whether the last review can be undone
  const [canUndo, setCanUndo] = useState(false)
  const undoRef = useRef<{
    cardId: string
    prevState: object
    prevQueue: StudyItem[]
    prevStats: { reviewed: number; correct: number; incorrect: number }
    prevSeenCount: number
    prevSeenCardIds: Set<string>
  } | null>(null)

  // Track unique card IDs seen at least once this session so the "Card N of N"
  // counter stays honest when cards are requeued and reviewed multiple times.
  const seenCardIdsRef = useRef(new Set<string>())
  const [seenCount, setSeenCount] = useState(0)

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
    if (mode !== 'multiple-choice' || queue.length === 0) return []
    const item = queue[0]
    const current = item.card
    // Seed by card identity so options are stable across re-shows of the same card.
    const cardSeed = item.kind === 'real' ? hashStr(item.card.id) : hashStr(item.card.front)

    let distractors: string[] = []
    if (item.kind === 'real' && item.card.distractors) {
      try {
        distractors = (JSON.parse(item.card.distractors) as string[])
          .filter((d) => d && d !== current.back)
      } catch (err) {
        console.error('Failed to parse distractors for card', item.card.id, err)
        distractors = []
      }
    }

    if (distractors.length < 3) {
      const pool = seededShuffle(
        [...new Set(
          cards.map((c) => c.back).filter((b) => b !== current.back && !distractors.includes(b))
        )],
        seed + cardSeed
      )
      distractors = [...distractors, ...pool].slice(0, 3)
    } else {
      distractors = distractors.slice(0, 3)
    }

    return seededShuffle([...distractors, current.back], seed + cardSeed * 31)
  }, [mode, queue, seed, cards])

  // Ref for the card container so we can return focus after card advance (keyboard shortcuts)
  const containerRef = useRef<HTMLDivElement>(null)

  // Refs for flashcard faces — used to measure natural height for dynamic card sizing
  const frontRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const [cardHeight, setCardHeight] = useState(220)

  // Measure the active face and update container height before paint (synced with 3D flip)
  useLayoutEffect(() => {
    const el = revealed ? backRef.current : frontRef.current
    if (el) setCardHeight(el.scrollHeight)
  }, [cursor, revealed])

  // Refocus container after each card advance so keyboard shortcuts stay active
  useEffect(() => {
    containerRef.current?.focus({ preventScroll: true })
  }, [cursor])

  if (queue.length === 0) return null

  const item = queue[0]
  const currentCard = item.card
  const isPractice = item.kind === 'practice'

  // Progress bar: advances as cards graduate (leave the queue permanently).
  const remainingDistinct =
    new Set(queue.filter((i): i is { kind: 'real'; card: Card } => i.kind === 'real').map((i) => i.card.id)).size +
    queue.filter((i) => i.kind === 'practice').length
  const progressPct = initialCount > 0
    ? Math.max(0, (initialCount - remainingDistinct) / initialCount * 100)
    : 0

  // ── Sentence logic ───────────────────────────────────────────────────────
  // All sentence logic is pure (hashStr, sentenceMatch, blankSentence have no side effects).
  const realCard = item.kind === 'real' ? item.card : null
  const cardSentences = realCard?.sentences ?? []

  // Bare-word-first gate: computed after chosenSentence (needs unknownCount).
  // isNewCard = never reviewed or still in Learning (state 0 or 1).
  const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1

  // Whether the current mode needs a blank-safe sentence to function correctly.
  // Exposure flashcard rotates freely; Recall and fill-blank require safeToBlank.
  const needsBlank =
    mode === 'fill-blank' ||
    (mode === 'flashcard' && flashcardSubMode === 'recall')

  // Least-unknown sentence selection — replaces bare rotation.
  // Step 1: find the minimum unknownCount tier among all sentences.
  // Step 2: collect candidate indices at that tier.
  // Step 3: pick within the tier by the existing hashStr rotation (variety once words are known).
  // Step 4: when a blank is needed, override with the first blank-safe index.
  // Pure — Math.min/Array.map/Array.filter are all pure; no Date.now() or Math.random().
  const chosenIdx = (() => {
    if (cardSentences.length === 0) return -1
    const reps = realCard!.review?.reps ?? 0

    // Least-unknown tier pick (Exposure and non-blank modes).
    const minUnknown = Math.min(...cardSentences.map((s) => s.unknownCount ?? Infinity))
    const candidates = cardSentences
      .map((_, i) => i)
      .filter((i) => (cardSentences[i].unknownCount ?? Infinity) === minUnknown)
    const tierIdx = candidates[(hashStr(realCard!.id) + reps) % candidates.length]

    if (!needsBlank) return tierIdx

    // Blank-safe override: if the tier pick is unsafe, find first safe sentence.
    if (sentenceMatch(cardSentences[tierIdx].korean, cardSentences[tierIdx].targetForm).safeToBlank) {
      return tierIdx
    }
    const safeIdx = cardSentences.findIndex(
      (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
    )
    return safeIdx >= 0 ? safeIdx : tierIdx  // graceful degrade: no safe sentence
  })()

  // chosenSentence = selected for this review; used for fill-blank answer / Recall front
  const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null

  // Show the bare Korean word on the Exposure front only when the card is new AND
  // the best available sentence still contains words the learner hasn't seen yet.
  // Once all context words are known (unknownCount === 0), show the sentence directly
  // so the learner encounters the new word in a fully readable sentence.
  const showBareFront =
    mode === 'flashcard' &&
    flashcardSubMode === 'exposure' &&
    isNewCard &&
    cardSentences.length > 0 &&
    (chosenSentence?.unknownCount ?? 0) > 0

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

  // Fill-blank prompts: sentence-based when safe, otherwise plain front-prompt
  const fillSentence = useChosenForFill
    ? blankSentence(chosenSentence!.korean, chosenSentence!.targetForm)
    : null
  const fillTranslation = useChosenForFill
    ? chosenSentence!.translation
    : null
  const fillAnswer = useChosenForFill
    ? chosenSentence!.targetForm
    : currentCard.front
  const fillCorrect = normalizeAnswer(fillInput) === normalizeAnswer(fillAnswer)

  // ── Type badge colours (single source of truth: lib/card-style.ts) ──────────
  const typeBadgeColor = typeBadgeClass(currentCard.type)

  // ── FSRS review submission ────────────────────────────────────────────────
  // FSRS ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
  const submitReview = async (rating: number) => {
    const current = queue[0]
    if (!current) return

    haptic(rating >= 3 ? 'success' : 'selection')
    reviewBuffer.current += 1
    const isCorrect = rating >= 3
    // Capture stats before setStats (async) — used for inline recompute and undo snapshot.
    const prevStats = stats
    setStats((s) => ({
      reviewed: s.reviewed + 1,
      correct: s.correct + (isCorrect ? 1 : 0),
      incorrect: s.incorrect + (isCorrect ? 0 : 1),
    }))

    // Only count unique first-time reviews so the counter doesn't cap early on requeues.
    const isFirstSeen = current.kind === 'practice' || !seenCardIdsRef.current.has(current.card.id)
    const prevSeenCount = seenCount
    const prevSeenCardIds = new Set(seenCardIdsRef.current)
    if (isFirstSeen) {
      if (current.kind === 'real') seenCardIdsRef.current.add(current.card.id)
      setSeenCount((c) => c + 1)
    }

    let requeue = false
    let updatedItem: StudyItem = current

    if (current.kind === 'real') {
      const cardId = current.card.id
      const prevState = current.card.review ?? {}
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating }),
      })
      // Parse the updated CardReview row to decide whether to re-queue.
      const updatedReview = await res.json().catch(() => null) as Card['review']
      if (updatedReview?.nextReview) {
        const nextReviewDate = new Date(updatedReview.nextReview)
        // Re-queue if the card is due again before the end of the current habit day.
        requeue = nextReviewDate < nextHabitDayStart(dayStartHourRef.current, new Date())
        // Carry fresh review state into the re-queued card so interval hints stay correct.
        updatedItem = { kind: 'real', card: { ...current.card, review: updatedReview } }
      }
      undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
      setCanUndo(true)
    }

    const rest = queue.slice(1)
    const gap = Math.min(REQUEUE_GAP, rest.length)
    const nextQueue = requeue
      ? [...rest.slice(0, gap), updatedItem, ...rest.slice(gap)]
      : rest

    if (nextQueue.length === 0) {
      const finalStats = {
        reviewed: prevStats.reviewed + 1,
        correct: prevStats.correct + (isCorrect ? 1 : 0),
        incorrect: prevStats.incorrect + (isCorrect ? 0 : 1),
      }
      onComplete(finalStats)
      return
    }

    setQueue(nextQueue)
    setCursor((c) => c + 1)
    setRevealed(false)
    setFillInput('')
    setMcSelected(null)
    setExampleOffset(0)
    setIntervalHints(null)
  }

  const advanceMc = (rating: number) => {
    if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null }
    submitReview(rating)
  }

  const handleUndo = async () => {
    if (!undoRef.current) return
    const { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds } = undoRef.current
    undoRef.current = null
    setCanUndo(false)
    await fetch('/api/review/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, prevState }),
    })
    // Restore queue, stats, and seen-card tracking snapshots captured before the last review.
    setStats(prevStats)
    setQueue(prevQueue)
    seenCardIdsRef.current = prevSeenCardIds
    setSeenCount(prevSeenCount)
    setCursor((c) => c + 1)
    setRevealed(true)
    setIntervalHints(null)
  }

  const mcRating = mcSelected === currentCard.back ? 3 : 1

  const handleReveal = () => {
    setRevealed(true)
    haptic('selection')
    if (item.kind === 'real' && item.card.review) {
      setIntervalHints(previewIntervalLabels(item.card.review))
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Never intercept while the fill-blank input is focused
    if (document.activeElement?.tagName === 'INPUT') return
    // lastInteraction is already bumped by the global 'keydown' listener in the activity effect

    if (!revealed) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleReveal()
      }
      // MC: 1-4 selects an option
      if (mode === 'multiple-choice' && mcOptions.length > 0 && !mcSelected) {
        const n = parseInt(e.key)
        if (n >= 1 && n <= 4 && mcOptions[n - 1] !== undefined) {
          e.preventDefault()
          const opt = mcOptions[n - 1]
          const isCorrect = opt === currentCard.back
          setMcSelected(opt)
          advanceMc(isCorrect ? 3 : 1)
        }
      }
    } else {
      if (mode === 'flashcard') {
        if (e.key === '1') { e.preventDefault(); void submitReview(1) }
        else if (e.key === '2') { e.preventDefault(); void submitReview(2) }
        else if (e.key === '3') { e.preventDefault(); void submitReview(3) }
        else if (e.key === '4') { e.preventDefault(); void submitReview(4) }
      }
      if (mode === 'fill-blank') {
        if (e.key === '1') { e.preventDefault(); void submitReview(1) }
        else if (e.key === '3') { e.preventDefault(); void submitReview(3) }
      }
      if (mode === 'multiple-choice' && mcSelected !== null) {
        const isCorrect = mcSelected === currentCard.back
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceMc(isCorrect ? 3 : 1) }
      }
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col items-center gap-6 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-xl mx-auto outline-none"
    >
      {/* Header: mode label + controls */}
      <div className="flex justify-between items-center w-full text-sm text-muted">
        <span className="capitalize">
          {isPractice ? 'AI Practice' : mode.replace('-', ' ')}
        </span>
        <div className="flex items-center gap-1">
          {canUndo && (
            <button
              onClick={handleUndo}
              className="min-h-[44px] px-3 rounded-md hover:text-muted-foreground hover:bg-surface-3 active:bg-surface-3 transition-colors"
              aria-label="Undo last rating"
            >
              ↩
            </button>
          )}
          <button
            onClick={() => onComplete(stats)}
            className="min-h-[44px] px-3 rounded-md hover:text-muted-foreground hover:bg-surface-3 active:bg-surface-3 transition-colors"
          >
            End
          </button>
        </div>
      </div>
      {/* Progress ring */}
      <div className="flex items-center gap-3 w-full">
        <ProgressRing
          pct={progressPct}
          size={44}
          strokeWidth={4}
          color="var(--button)"
          aria-label={`Session progress: ${Math.round(progressPct)}%`}
        />
        <p className="text-sm text-muted">
          Card {Math.min(seenCount + 1, initialCount)} of {initialCount}
        </p>
      </div>

      {/* Card — flashcard mode uses 3D flip */}
      <div key={cursor} className="animate-card-in w-full">
      {mode === 'flashcard' ? (
        <div className="card-flip-container w-full">
          <div className={`card-flip-inner ${revealed ? 'flipped' : ''}`} style={{ height: cardHeight }}>
            {/* ── Front face ── */}
            <div ref={frontRef} className="card-flip-front w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
                {currentCard.type}
              </span>
              {showBareFront ? (
                // New card whose context words aren't all known yet: bare word on front.
                <div className="flex items-center justify-center gap-2">
                  <p className="hangul text-5xl font-bold text-foreground text-center">{currentCard.front}</p>
                  <AudioButton text={currentCard.front} aria-label={`Play: ${currentCard.front}`} size="sm" />
                </div>
              ) : chosenSentence ? (
                // Matured card (state 2/3) or Recall mode: existing sentence-on-front logic unchanged.
                flashcardSubMode === 'recall' && recallBlanked ? (
                  <>
                    <p className="hangul-sentence text-foreground font-medium text-center text-2xl">
                      {recallBlanked}
                    </p>
                    <p className="text-xs text-muted text-center">Recall the missing word</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-center gap-1">
                      <HighlightedSentence
                        korean={chosenSentence.korean}
                        targetForm={chosenSentence.targetForm}
                        cardType={currentCard.type}
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
                )
              ) : (
                // No sentences at all: bare-word block unchanged.
                <div className="flex items-center justify-center gap-2">
                  <p className="hangul text-5xl font-bold text-foreground text-center">{currentCard.front}</p>
                  <AudioButton
                    text={currentCard.front}
                    aria-label={`Play: ${currentCard.front}`}
                    size="sm"
                  />
                </div>
              )}
            </div>

            {/* ── Back face ── */}
            <div ref={backRef} className="card-flip-back w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
                {currentCard.type}
              </span>
              {chosenSentence ? (
                <div className="flex flex-col items-center gap-4 w-full">
                  {displayedSentence && (
                    <div className="flex items-start justify-center gap-1">
                      <HighlightedSentence
                        korean={displayedSentence.korean}
                        targetForm={displayedSentence.targetForm}
                        cardType={currentCard.type}
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
                    <p className="hangul text-3xl font-bold text-foreground text-center">{currentCard.front}</p>
                    <AudioButton
                      text={currentCard.front}
                      aria-label={`Play: ${currentCard.front}`}
                      size="sm"
                    />
                  </div>
                  <p className="text-xl text-muted-foreground text-center">{currentCard.back}</p>
                  {displayedSentence?.translation && (
                    <p className="text-sm text-muted text-center italic hangul-gloss">
                      &ldquo;{displayedSentence.translation}&rdquo;
                    </p>
                  )}
                  {currentCard.notes && (
                    <p className="text-sm text-muted text-center italic">{currentCard.notes}</p>
                  )}
                  {cardSentences.length > 1 && (
                    <button
                      onClick={() => setExampleOffset((o) => o + 1)}
                      className="text-xs text-button hover:text-button-hover hover:underline mt-1"
                    >
                      See another example →
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 w-full">
                  <div className="flex items-center justify-center gap-2">
                    <p className="hangul text-5xl font-bold text-foreground text-center">{currentCard.front}</p>
                    <AudioButton
                      text={currentCard.front}
                      aria-label={`Play: ${currentCard.front}`}
                      size="sm"
                    />
                  </div>
                  <hr className="w-full border-border" />
                  <p className="text-xl text-muted-foreground text-center">{currentCard.back}</p>
                  {currentCard.notes && (
                    <p className="text-sm text-muted text-center italic">{currentCard.notes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Non-flashcard modes — no flip */
        <div className="w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeColor}`}>
            {currentCard.type}
          </span>

        {/* ── Multiple choice mode ── */}
        {mode === 'multiple-choice' && (
          <>
            <div className="flex items-center justify-center gap-2">
              <p className="hangul text-4xl font-bold text-foreground text-center">{currentCard.front}</p>
              <AudioButton text={currentCard.front} aria-label={`Play: ${currentCard.front}`} size="sm" />
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-4">
              {mcOptions.map((opt, i) => {
                const isCorrect = opt === currentCard.back
                const isSelected = mcSelected === opt
                const hasAnswered = mcSelected !== null

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
                    onClick={() => {
                      setMcSelected(opt)
                      const rating = isCorrect ? 3 : 1
                      advanceTimer.current = setTimeout(() => advanceMc(rating), MC_ADVANCE_MS)
                    }}
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
            {mcSelected && currentCard.notes && (
              <p className="text-sm text-muted text-center italic mt-2">{currentCard.notes}</p>
            )}
          </>
        )}

        {/* ── Fill in the blank mode ── */}
        {mode === 'fill-blank' && (
          <>
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
                <p className="text-lg text-foreground font-medium text-center">{currentCard.back}</p>
              </>
            )}
            <input
              type="text"
              value={fillInput}
              onChange={(e) => setFillInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) handleReveal() }}
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
                {currentCard.notes && (
                  <p className="text-sm text-muted mt-1">{currentCard.notes}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}
      </div>

      {/* ── Action bar (sticky above bottom nav on mobile) ── */}
      <div className="sticky bottom-[calc(4.5rem+var(--sab,0px))] sm:bottom-2 bg-surface-1/95 backdrop-blur-md saturate-150 -mx-4 px-4 pt-2 pb-2 w-[calc(100%+2rem)]">
        {mode === 'flashcard' && !revealed && (
          <button
            onClick={handleReveal}
            className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
          >
            Show Answer
          </button>
        )}

        {mode === 'flashcard' && revealed && (
          <div className="flex gap-2 w-full animate-reveal">
            {/* Again — softer warning */}
            <button
              onClick={() => submitReview(1)}
              aria-label={intervalHints ? `Again, review again in ${intervalHints[0].short}` : 'Again'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Again</span>
              {intervalHints && <span className="text-[10px] opacity-60 text-center leading-tight">{intervalHints[0].short}</span>}
            </button>
            {/* Hard — tertiary */}
            <button
              onClick={() => submitReview(2)}
              aria-label={intervalHints ? `Hard, review again in ${intervalHints[1].short}` : 'Hard'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-surface-3 text-muted hover:bg-surface-3 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Hard</span>
              {intervalHints && <span className="text-[10px] opacity-60 text-center leading-tight">{intervalHints[1].short}</span>}
            </button>
            {/* Good — primary */}
            <button
              onClick={() => submitReview(3)}
              aria-label={intervalHints ? `Good, ${intervalHints[2].mastery}` : 'Good'}
              className="flex-[1.5] min-h-14 py-2 px-2 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex flex-col items-center justify-center gap-0.5 shadow-sm"
            >
              <span>Good</span>
              {intervalHints && <span className="text-[10px] font-normal opacity-80 text-center leading-tight">{intervalHints[2].mastery}</span>}
            </button>
            {/* Easy — warm reward token */}
            <button
              onClick={() => submitReview(4)}
              aria-label={intervalHints ? `Easy, review again in ${intervalHints[3].short}` : 'Easy'}
              className="flex-1 min-h-14 py-2 px-1 rounded-xl font-medium text-xs bg-reward-soft text-reward hover:opacity-90 transition-colors flex flex-col items-center justify-center gap-0.5"
            >
              <span className="font-semibold">Easy</span>
              {intervalHints && <span className="text-[10px] opacity-60 text-center leading-tight">{intervalHints[3].short}</span>}
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
            onClick={handleReveal}
            className="w-full min-h-11 bg-button text-button-foreground px-8 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors"
          >
            Check Answer
          </button>
        )}

        {mode === 'fill-blank' && revealed && (
          <div className="flex gap-3 w-full animate-reveal">
            <button onClick={() => submitReview(1)} aria-label={intervalHints ? `Wrong, review again in ${intervalHints[0].short}` : 'Wrong'} className="flex-1 min-h-14 py-2 rounded-xl font-medium text-sm bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors flex flex-col items-center justify-center gap-0.5">
              <span className="font-semibold">Wrong</span>
              {intervalHints && <span className="text-[10px] opacity-60">{intervalHints[0].short}</span>}
            </button>
            <button onClick={() => submitReview(3)} aria-label={intervalHints ? `Correct, ${intervalHints[2].mastery}` : 'Correct'} className="flex-[1.5] min-h-14 py-2 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 transition-colors flex flex-col items-center justify-center gap-0.5 shadow-sm">
              <span>Correct</span>
              {intervalHints && <span className="text-[10px] font-normal opacity-80">{intervalHints[2].mastery}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
