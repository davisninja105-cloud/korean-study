'use client'

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { StudyMode, FlashcardSubMode } from './ModeSelector'
import { habitDateStr, DEFAULT_DAY_START_HOUR, nextHabitDayStart } from '@/lib/habit'
import FlashcardMode from './FlashcardMode'
import MultipleChoiceMode from './MultipleChoiceMode'
import FillBlankMode from './FillBlankMode'
import { sentenceMatch, blankSentence } from '@/lib/sentence-match'
import { selectSentence, hashStr } from '@/lib/sentence-selection'
import { previewIntervalLabels, reviewCard, type Grade } from '@/lib/fsrs'
import { haptic } from '@/lib/haptics'
import { typeBadgeClass } from '@/lib/card-style'
import ProgressRing from './ProgressRing'
import Toast from './Toast'

export interface Sentence {
  id: string
  korean: string
  targetForm: string
  translation: string
  unknownCount?: number
}

export interface Card {
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

export interface PracticeCard {
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

// Background review-save endpoint (REVIEW-04). Kept as a module constant so the
// retry wrapper can issue the POST without reintroducing a bare inline
// `fetch('/api/review', …)` at the submitReview call site.
const REVIEW_ENDPOINT = '/api/review'

// Bounded silent-retry wrapper for the background review save (REVIEW-04).
// Makes up to 3 total attempts (1 initial + 2 retries) of POST /api/review.
// An attempt counts as failed when the fetch rejects/aborts OR `res.ok` is
// false. Between attempts it awaits a short backoff (~500ms then ~1500ms). On
// any success it returns immediately WITHOUT invoking onExhausted; only after
// all attempts fail does it call onExhausted once.
//
// WR-04 hardening:
// - A 4xx response is a permanent failure (bad input / stale card) — retrying
//   won't help and would delay + mislabel the "check your connection" toast.
//   Only network errors / 5xx / timeouts are retried.
// - Each attempt has an 8s AbortController timeout so a hung connection
//   (paused serverless instance, stalled libSQL) can't stall the loop forever
//   and starve onExhausted from ever firing.
//
// Runs from an event-handler flow (submitReview), never during render, so the
// setTimeout usage is purity-safe (react-hooks/purity).
async function postReviewWithRetry(
  cardId: string,
  rating: number,
  onExhausted: () => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating }),
        signal: ctrl.signal,
      })
      if (res.ok) return
      // 4xx is a permanent failure — don't retry; go straight to exhausted.
      if (res.status >= 400 && res.status < 500) break
    } catch {
      // fetch rejected or aborted (timeout) — counts as a failed attempt; fall through to backoff/retry
    } finally {
      // IN-01: always clear the per-attempt timer, including when fetch
      // rejects for a reason other than the abort firing (e.g. an immediate
      // offline TypeError) — otherwise the stale timer fires ~8s later and
      // aborts a controller whose fetch has already settled (harmless no-op,
      // but an avoidable dangling timer).
      clearTimeout(timeoutId)
    }
    if (attempt < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs[attempt]))
    }
  }
  onExhausted()
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

  // ── REVIEW-04/05: save-failure toast + mount guard ──────────────────────
  // saveError holds a background-review-save failure message; when set, the
  // Toast (components/Toast.tsx) renders and self-dismisses. Cleared on dismiss.
  const [saveError, setSaveError] = useState<string | null>(null)
  // isMountedRef gates async callbacks (retry exhaustion in submitReview, and
  // the undo restore in handleUndo) so a setState/ref-write fired after
  // unmount is skipped. Ref writes in an effect body are allowed (not
  // setState); the guards themselves run in event/async flows.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

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
  // Ref for the "Again" grade button — focus moves here on reveal so screen readers
  // immediately announce the grade options (WR-02).
  const againBtnRef = useRef<HTMLButtonElement>(null)

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

  // ── Sentence selection (memoized, REFACTOR-02 + PERF-03) ─────────────────
  // Derived BEFORE the empty-queue early return so the chosenIdx useMemo (a
  // hook) is always called in the same order on every render (rules-of-hooks).
  // When the queue is empty, realCard is null / cardSentences is [] and the memo
  // returns -1 instantly — the early return discards it. RESEARCH Anti-Patterns:
  // the `?? []` fallback makes a fresh [] each render when realCard is null; the
  // memo does no work-saving on that path but stays correct. Expected — do not
  // "fix" it.
  const item = queue[0]
  const realCard = item?.kind === 'real' ? item.card : null
  const cardSentences = realCard?.sentences ?? []
  // Whether the current mode needs a blank-safe sentence to function correctly.
  // Exposure flashcard rotates freely; Recall and fill-blank require safeToBlank.
  const needsBlank =
    mode === 'fill-blank' ||
    (mode === 'flashcard' && flashcardSubMode === 'recall')
  // Least-unknown sentence selection — see lib/sentence-selection.ts (REFACTOR-02).
  // Step 1: minimum unknownCount tier. Step 2: collect candidate indices at that tier.
  // Step 3: hash-tie-break rotation by reps. Step 4: blank-safety override.
  // Memoized (PERF-03): recomputes only when [cardSentences, realCard?.id,
  // realCard?.review?.reps, needsBlank] change — not on every unrelated re-render
  // (typing in fill-blank input, MC selection, exampleOffset cycling).
  const chosenIdx = useMemo(
    () => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, needsBlank),
    [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]
  )

  if (queue.length === 0) return null

  const currentCard = item.card
  const isPractice = item.kind === 'practice'

  // Bounds-check intervalHints before accessing fixed indices 0–3 (CR-03).
  // previewIntervalLabels() should always return 4 entries, but guard defensively.
  const hints = intervalHints?.length === 4 ? intervalHints : null

  // Progress bar: advances as cards graduate (leave the queue permanently).
  const remainingDistinct =
    new Set(queue.filter((i): i is { kind: 'real'; card: Card } => i.kind === 'real').map((i) => i.card.id)).size +
    queue.filter((i) => i.kind === 'practice').length
  const progressPct = initialCount > 0
    ? Math.max(0, (initialCount - remainingDistinct) / initialCount * 100)
    : 0

  // Bare-word-first gate: computed after chosenSentence (needs unknownCount).
  // isNewCard = never reviewed or still in Learning (state 0 or 1).
  const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1

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
  // Optimistic: computes FSRS locally, advances queue immediately, persists in background (D-08/D-09).
  const submitReview = (rating: number) => {
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

      // 1. Compute FSRS result locally — instant, no network (D-08).
      // Guard only requires nextReview (present for any due card). Brand-new cards
      // have lastReview === null; reviewCard() handles that via createEmptyCard(),
      // so they must NOT be excluded here — otherwise a new card graded Again gets
      // a sub-day interval but is never requeued within the session (the "sub-day
      // cards not replayed" bug). Pass lastReview through as null when absent.
      const reviewData = current.card.review
      if (reviewData && reviewData.nextReview) {
        // Convert ISO strings to Date objects — CardReviewFields requires Date, not string (Pitfall 1).
        const cardReviewFields = {
          state: reviewData.state ?? 0,
          stability: reviewData.stability ?? 0,
          difficulty: reviewData.difficulty ?? 0,
          elapsedDays: reviewData.elapsedDays ?? 0,
          scheduledDays: reviewData.scheduledDays ?? 0,
          reps: reviewData.reps ?? 0,
          lapses: reviewData.lapses ?? 0,
          nextReview: new Date(reviewData.nextReview),
          lastReview: reviewData.lastReview ? new Date(reviewData.lastReview) : null,
        }
        const localResult = reviewCard(cardReviewFields, rating as Grade)
        // 2. Decide requeue from local result — instant, no network.
        requeue = localResult.nextReview < nextHabitDayStart(dayStartHourRef.current, new Date())
        // 3. Carry updated state into the re-queued card; serialize Dates back to ISO strings.
        updatedItem = {
          kind: 'real',
          card: {
            ...current.card,
            review: {
              ...reviewData,
              state: localResult.state,
              stability: localResult.stability,
              difficulty: localResult.difficulty,
              elapsedDays: localResult.elapsedDays,
              scheduledDays: localResult.scheduledDays,
              reps: localResult.reps,
              lapses: localResult.lapses,
              nextReview: localResult.nextReview.toISOString(),
              lastReview: localResult.lastReview?.toISOString() ?? null,
            },
          },
        }
      }

      // Capture undo snapshot BEFORE queue advance (Pitfall 4 — critical ordering).
      undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
      setCanUndo(true)

      // 4. Fire background save — NOT awaited; bounded silent retry (REVIEW-04).
      // A toast surfaces only after all retries are exhausted (via onExhausted),
      // guarded by isMountedRef so a setState fired after unmount is skipped.
      // `void` marks the promise as intentionally fire-and-forget.
      void postReviewWithRetry(cardId, rating, () => {
        if (isMountedRef.current) {
          setSaveError("Couldn't save your last review — check your connection.")
        }
      })
    } else {
      // Practice cards have no server-side FSRS state to revert; grading one
      // invalidates any pending undo so it can never act on a stale real card.
      undoRef.current = null
      setCanUndo(false)
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

    try {
      const res = await fetch('/api/review/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, prevState }),
      })
      if (!res.ok) throw new Error(`Undo failed: ${res.status}`)
    } catch {
      // IN-02: guarded for symmetry with the success-path restore below
      // (REVIEW-05) — if the session ended mid-undo, there is no UI left to
      // re-arm, so skip the ref write + setState entirely.
      if (!isMountedRef.current) return
      // Network failure: undo could not be persisted. Re-arm canUndo so the user
      // can retry, and do NOT restore client state (server is still at post-review).
      undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }
      setCanUndo(true)
      return
    }

    // Restore queue, stats, and seen-card tracking snapshots captured before
    // the last review. Guarded by isMountedRef so the entire restoration —
    // including the unconditional seenCardIdsRef write — applies as ONE atomic
    // unit or is fully skipped when the component unmounted between the awaited
    // fetch resolving and the restore (REVIEW-05). React 18/19 auto-batches the
    // setState calls into a single commit; the mount guard makes the ref write
    // share the same all-or-nothing gate, so an interrupted undo can never leave
    // the ref mutated while the setters silently no-op post-unmount.
    if (!isMountedRef.current) return

    setStats(prevStats)
    setQueue(prevQueue)
    seenCardIdsRef.current = prevSeenCardIds
    setSeenCount(prevSeenCount)
    setCursor((c) => c + 1)
    setRevealed(false)
    setIntervalHints(null)
  }

  const mcRating = mcSelected === currentCard.back ? 3 : 1

  // Multiple-choice option select: set selected, then arm the auto-advance
  // timer. The parent owns advanceTimer, MC_ADVANCE_MS, and advanceMc so the
  // timer lifecycle (clear on manual Next / unmount) stays in one place.
  const handleMcSelect = (opt: string) => {
    setMcSelected(opt)
    advanceTimer.current = setTimeout(() => advanceMc(opt === currentCard.back ? 3 : 1), MC_ADVANCE_MS)
  }

  const handleReveal = () => {
    setRevealed(true)
    haptic('selection')
    if (item.kind === 'real' && item.card.review) {
      setIntervalHints(previewIntervalLabels(item.card.review))
    }
    // Move focus to grade buttons on the next frame so screen readers announce them (WR-02)
    requestAnimationFrame(() => againBtnRef.current?.focus())
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
        if (e.key === '1') { e.preventDefault(); submitReview(1) }
        else if (e.key === '2') { e.preventDefault(); submitReview(2) }
        else if (e.key === '3') { e.preventDefault(); submitReview(3) }
        else if (e.key === '4') { e.preventDefault(); submitReview(4) }
      }
      if (mode === 'fill-blank') {
        if (e.key === '1') { e.preventDefault(); submitReview(1) }
        else if (e.key === '3') { e.preventDefault(); submitReview(3) }
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
      className="flex flex-col items-center gap-6 px-4 pt-4 pb-[max(1rem,var(--sab,0px))] w-full max-w-xl mx-auto outline-none"
    >
      {/* REVIEW-04: save-failure toast — fixed-position, self-dismissing */}
      {saveError && (
        <Toast
          message={saveError}
          onDismiss={() => setSaveError(null)}
        />
      )}
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
            aria-label="End study session"
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

      {/* ── Mode dispatch (REFACTOR-01) ──
          Each mode sub-component renders its own card face + sticky action bar.
          Session state, both useMemos, and the Phase 13 review/undo pipeline
          stay in this parent (RESEARCH Pitfall 4). */}
      {mode === 'flashcard' ? (
        <FlashcardMode
          card={currentCard}
          typeBadgeColor={typeBadgeColor}
          revealed={revealed}
          cardHeight={cardHeight}
          frontRef={frontRef}
          backRef={backRef}
          againBtnRef={againBtnRef}
          cursor={cursor}
          flashcardSubMode={flashcardSubMode}
          showBareFront={showBareFront}
          chosenSentence={chosenSentence}
          displayedSentence={displayedSentence}
          recallBlanked={recallBlanked}
          hasMultipleSentences={cardSentences.length > 1}
          hints={hints}
          onReveal={handleReveal}
          onGrade={submitReview}
          onCycleExample={() => setExampleOffset((o) => o + 1)}
        />
      ) : mode === 'multiple-choice' ? (
        <MultipleChoiceMode
          card={currentCard}
          typeBadgeColor={typeBadgeColor}
          cursor={cursor}
          options={mcOptions}
          selected={mcSelected}
          onSelect={handleMcSelect}
          onAdvance={() => advanceMc(mcRating)}
        />
      ) : (
        <FillBlankMode
          card={currentCard}
          typeBadgeColor={typeBadgeColor}
          cursor={cursor}
          fillSentence={fillSentence}
          fillTranslation={fillTranslation}
          fillAnswer={fillAnswer}
          fillInput={fillInput}
          fillCorrect={fillCorrect}
          revealed={revealed}
          chosenSentence={chosenSentence}
          hints={hints}
          onInputChange={setFillInput}
          onReveal={handleReveal}
          onGrade={submitReview}
        />
      )}
    </div>
  )
}
