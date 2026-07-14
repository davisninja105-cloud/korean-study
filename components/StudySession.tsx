'use client'

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { StudyMode } from './ModeSelector'
import { habitDateStr, DEFAULT_DAY_START_HOUR, nextHabitDayStart } from '@/lib/habit'
import FlashcardMode from './FlashcardMode'
import { selectSentence } from '@/lib/sentence-selection'
import { deriveActiveFace } from '@/lib/active-prompt'
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
  sentences?: Sentence[]
  review?: {
    reps?: number | null
    state?: number | null
    stability?: number | null
    difficulty?: number | null
    elapsedDays?: number | null
    scheduledDays?: number | null
    // ts-fsrs's internal (re)learning-step index — see CardReview.learningSteps
    // doc comment in prisma/schema.prisma for why this must round-trip.
    learningSteps?: number | null
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

// How many cards ahead a re-queued card is inserted. Keeps a lapsed card from
// reappearing immediately when other cards are available.
const REQUEUE_GAP = 4

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
// WR-03: distinguishes a permanent failure (4xx — retrying won't help, e.g.
// a stale/deleted card) from a network/timeout/5xx failure, so the caller can
// show connection-neutral copy for the former instead of misleadingly
// blaming the user's connection.
type SaveFailureReason = 'network' | 'permanent'

async function postReviewWithRetry(
  cardId: string,
  rating: number,
  idempotencyKey: string,
  cancelSignal: AbortSignal,
  onExhausted: (reason: SaveFailureReason) => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  let failureReason: SaveFailureReason = 'network'
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cancelSignal.aborted) return
    const ctrl = new AbortController()
    // Forward the outer (undo-triggered) cancel signal into this attempt's
    // controller — manual addEventListener forwarding, not the newer variadic
    // AbortSignal.any() combinator (later browser-support floor, unused
    // elsewhere in this codebase; HIST-03 / RESEARCH Architecture Pattern 2).
    const forwardAbort = () => ctrl.abort()
    cancelSignal.addEventListener('abort', forwardAbort, { once: true })
    const timeoutId = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating, idempotencyKey }),
        signal: ctrl.signal,
      })
      if (res.ok) return
      // 4xx is a permanent failure — don't retry; go straight to exhausted.
      if (res.status >= 400 && res.status < 500) {
        failureReason = 'permanent'
        break
      }
    } catch {
      // A deliberate cancel (undo) is not a failed attempt — return silently
      // without ever calling onExhausted (HIST-03).
      if (cancelSignal.aborted) return
      // fetch rejected or aborted (timeout) — counts as a failed attempt; fall through to backoff/retry
    } finally {
      // IN-01: always clear the per-attempt timer, including when fetch
      // rejects for a reason other than the abort firing (e.g. an immediate
      // offline TypeError) — otherwise the stale timer fires ~8s later and
      // aborts a controller whose fetch has already settled (harmless no-op,
      // but an avoidable dangling timer).
      clearTimeout(timeoutId)
      cancelSignal.removeEventListener('abort', forwardAbort)
    }
    if (attempt < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs[attempt]))
      if (cancelSignal.aborted) return
    }
  }
  if (!cancelSignal.aborted) onExhausted(failureReason)
}

type StudyItem =
  | { kind: 'real'; card: Card }
  | { kind: 'practice'; card: PracticeCard }

interface Props {
  cards: Card[]
  extraPractice: PracticeCard[]
  mode: StudyMode
  onComplete: (stats: { reviewed: number; correct: number; incorrect: number }) => void
}

export default function StudySession({ cards, extraPractice, mode, onComplete }: Props) {
  // Queue: mutable list of remaining items. Always show queue[0].
  // Initialized once — the component is remounted per batch via key={sessionKey}.
  // initialCount is derived from stable props so it's safe to compute during render.
  const initialCount = cards.length + extraPractice.length
  const [queue, setQueue] = useState<StudyItem[]>(() => {
    // Server already returns cards in foundation-first blended order (lib/sequence.ts).
    // Preserve that order — do NOT shuffle here.
    const real: StudyItem[] = cards.map((c) => ({ kind: 'real', card: c }))
    const practice: StudyItem[] = extraPractice.map((c) => ({ kind: 'practice', card: c }))
    return [...real, ...practice]
  })
  // Monotonically-increasing counter; bumped on every advance/undo to drive the refocus effect.
  const [cursor, setCursor] = useState(0)

  const [revealed, setRevealed] = useState(false)
  // Active mode's hidden-until-tapped hint control (ACTIVE-02). Parent-owned
  // (REFACTOR-01 — FlashcardMode is not remounted per card, only its inner
  // key={cursor} div is, so a local useState there would leak across cards).
  // Reset alongside `revealed` on both advance (submitReview) and undo.
  const [hintRevealed, setHintRevealed] = useState(false)
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
    controller: AbortController
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
  // Least-unknown sentence selection — see lib/sentence-selection.ts (REFACTOR-02).
  // Step 1: minimum unknownCount tier. Step 2: collect candidate indices at that tier.
  // Step 3: hash-tie-break rotation by reps. Step 4: blank-safety override.
  // Memoized (PERF-03): recomputes only when [cardSentences, realCard?.id,
  // realCard?.review?.reps] change — not on every unrelated re-render
  // (exampleOffset cycling). needsBlank is a literal `false` (D-13) — the
  // Passive/Active split no longer has a blanked front, so blank-safety is
  // never required for sentence selection.
  const chosenIdx = useMemo(
    () => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, false),
    [cardSentences, realCard?.id, realCard?.review?.reps]
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

  // chosenSentence = selected for this review
  const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null

  // Active mode's face derivation (ACTIVE-01..05, D-15). Derived in render
  // scope from queue[0]-derived values — never snapshotted, so a requeued
  // card re-derives its face on every render (Pitfall N-3): a state-1 card
  // graded up mid-session flips from passive-degrade to production on its
  // next appearance, and a lapsed card keeps degrading.
  const activeFace = deriveActiveFace(currentCard, chosenSentence, isNewCard, isPractice)

  // Show the bare Korean word on the front only when the card is new AND
  // the best available sentence still contains words the learner hasn't seen yet.
  // Once all context words are known (unknownCount === 0), show the sentence directly
  // so the learner encounters the new word in a fully readable sentence.
  const showBareFront =
    isNewCard &&
    cardSentences.length > 0 &&
    (chosenSentence?.unknownCount ?? 0) > 0

  // displayedSentence = shown on revealed side; cycles via "See another example →"
  const displayedSentence = chosenSentence !== null
    ? cardSentences[(chosenIdx + exampleOffset) % cardSentences.length]
    : null

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
          learningSteps: reviewData.learningSteps ?? 0,
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
              learningSteps: localResult.learningSteps,
              reps: localResult.reps,
              lapses: localResult.lapses,
              nextReview: localResult.nextReview.toISOString(),
              lastReview: localResult.lastReview?.toISOString() ?? null,
            },
          },
        }
      } else {
        // WR-05: this "should never happen" for a card in the due-card pool
        // (getStudyCards() always attaches a review). If it ever does, the
        // silent fallback below leaves `requeue = false` and `updatedItem =
        // current` unchanged — the card is treated as fully graduated and
        // permanently leaves the session queue regardless of the rating
        // given. Log so the failure is visible instead of silent.
        console.error(
          'submitReview: card missing review.nextReview, cannot compute local FSRS state',
          cardId,
        )
      }

      // One idempotency key + one AbortController generated ONCE per grade
      // action, here in the event-handler flow (Pitfall 5 / react-hooks/purity
      // — never lift these into useMemo/render). The key is reused unchanged
      // across every retry attempt (HIST-02); the controller lets handleUndo
      // cancel the in-flight retry chain (HIST-03).
      const idempotencyKey = crypto.randomUUID()
      const controller = new AbortController()

      // Capture undo snapshot BEFORE queue advance (Pitfall 4 — critical ordering).
      undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds, controller }
      setCanUndo(true)

      // 4. Fire background save — NOT awaited; bounded silent retry (REVIEW-04).
      // A toast surfaces only after all retries are exhausted (via onExhausted),
      // guarded by isMountedRef so a setState fired after unmount is skipped.
      // `void` marks the promise as intentionally fire-and-forget.
      void postReviewWithRetry(cardId, rating, idempotencyKey, controller.signal, (reason) => {
        if (isMountedRef.current) {
          // WR-03: a permanent (4xx) failure has nothing to do with
          // connectivity — telling the user to "check your connection" is
          // actively misleading. Use connection-neutral copy for it.
          setSaveError(
            reason === 'permanent'
              ? "Couldn't save your last review. Your progress may not be recorded."
              : "Couldn't save your last review — check your connection.",
          )
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
    setHintRevealed(false)
    setExampleOffset(0)
    setIntervalHints(null)
  }

  const handleUndo = async () => {
    if (!undoRef.current) return
    const { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds, controller } = undoRef.current
    undoRef.current = null
    setCanUndo(false)
    // HIST-03: cancel the in-flight background retry chain BEFORE the undo
    // request goes out, so a stale retry can never re-apply the undone rating.
    controller.abort()

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
      // Re-include the SAME (already-aborted) controller — do not create a new
      // one; retrying undo does not need to un-abort the review's save.
      undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds, controller }
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
    setHintRevealed(false)
    setIntervalHints(null)
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
    // Never intercept while an input element is focused (tap-to-gloss / other UI)
    if (document.activeElement?.tagName === 'INPUT') return
    // lastInteraction is already bumped by the global 'keydown' listener in the activity effect

    if (!revealed) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        handleReveal()
      }
    } else {
      // Both Passive and Active grade via 1-4 (Again/Hard/Good/Easy).
      if (e.key === '1') { e.preventDefault(); submitReview(1) }
      else if (e.key === '2') { e.preventDefault(); submitReview(2) }
      else if (e.key === '3') { e.preventDefault(); submitReview(3) }
      else if (e.key === '4') { e.preventDefault(); submitReview(4) }
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

      {/* ── FlashcardMode (REFACTOR-01) ──
          Renders its own card face + sticky action bar. Session state, both
          useMemos, and the Phase 13 review/undo pipeline stay in this parent
          (RESEARCH Pitfall 4). MC/fill-blank dispatch retired (D-11/D-14) —
          Passive and Active both render through FlashcardMode; the Active
          production branch lands in Plan 28-02. */}
      <FlashcardMode
        card={currentCard}
        typeBadgeColor={typeBadgeColor}
        revealed={revealed}
        cardHeight={cardHeight}
        frontRef={frontRef}
        backRef={backRef}
        againBtnRef={againBtnRef}
        cursor={cursor}
        showBareFront={showBareFront}
        chosenSentence={chosenSentence}
        displayedSentence={displayedSentence}
        hasMultipleSentences={cardSentences.length > 1}
        hints={hints}
        onReveal={handleReveal}
        onGrade={submitReview}
        onCycleExample={() => setExampleOffset((o) => o + 1)}
        studyMode={mode}
        activeFace={activeFace}
        hintRevealed={hintRevealed}
        onToggleHint={() => setHintRevealed(true)}
      />
    </div>
  )
}
