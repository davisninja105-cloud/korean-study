'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ModeSelector, { StudyMode, FlashcardSubMode } from '@/components/ModeSelector'
import StudySession from '@/components/StudySession'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import ProgressRing from '@/components/ProgressRing'
import Sheet from '@/components/Sheet'
import { SlidersHorizontal, Loader2 } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { computeStreaks, habitDateStr, DEFAULT_DAY_START_HOUR, DEFAULT_GOAL_SECONDS, type DayRecord } from '@/lib/habit'
import { useFreshPayload } from '@/components/FreshnessWatcher'
import type { CardDTO, LessonDTO } from '@/lib/dto'

interface PracticeCard {
  type: string
  front: string
  back: string
  notes?: string
}

type Phase = 'loading' | 'select-mode' | 'loading-practice' | 'studying' | 'complete'
type Scope  = 'due' | 'ahead'

interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]
}

export default function StudyClient({ initialCards, initialLessons }: Props) {
  const [studyCards, setStudyCards] = useState<CardDTO[]>(initialCards)
  const [practice, setPractice] = useState<PracticeCard[]>([])
  const [mode, setMode] = useState<StudyMode>('flashcard')
  const [flashcardSubMode, setFlashcardSubMode] = useState<FlashcardSubMode>('exposure')
  const [phase, setPhase] = useState<Phase>('select-mode')
  const [scope, setScope] = useState<Scope>('due')
  const [completeStats, setCompleteStats] = useState({ reviewed: 0, correct: 0, incorrect: 0 })
  const [sessionKey, setSessionKey] = useState(0) // bump to remount StudySession
  const [sessionSize, setSessionSize] = useState(20) // for "Study N more" label
  const [habitData, setHabitData] = useState<{ days: DayRecord[]; today: string; goal: number } | null>(null)
  const [isFilterLoading, setIsFilterLoading] = useState(false)

  // Lesson range filter — initialized from server-provided props (no initial fetch needed)
  const [lessons] = useState<LessonDTO[]>(initialLessons)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [lessonTo, setLessonTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )
  const [showModeSheet, setShowModeSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  // Draft lesson range — local to the filter sheet; only committed to lessonFrom/To on Apply
  const [draftFrom, setDraftFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [draftTo, setDraftTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )

  // Build the URL params for the current lesson range.
  // Omit when the full span is selected so back-compat is preserved.
  const buildParams = useCallback((from: number, to: number, sc: Scope, maxOrder: number) => {
    const params = new URLSearchParams()
    if (!isFullSpan(from, to, maxOrder)) {
      params.set('lessonFrom', String(from))
      params.set('lessonTo', String(to))
    }
    if (sc === 'ahead') params.set('scope', 'ahead')
    const qs = params.toString()
    return qs ? `?${qs}` : ''
  }, [])

  // Filter re-fetch only — spinner in select-mode, never drops to blank loading phase (D-06)
  const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
    setIsFilterLoading(true)
    fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
      .then((r) => r.json())
      .then((cards: CardDTO[]) => {
        // Guard: only update study cards when we're still in select-mode.
        // If the user is mid-session, the fetch result is stale and must be discarded.
        setPhase((currentPhase) => {
          if (currentPhase !== 'select-mode') return currentPhase
          setStudyCards(cards)
          setScope('due')
          setIsFilterLoading(false)
          return currentPhase
        })
      })
      .catch(() => {
        setIsFilterLoading(false)
      })
  }, [buildParams])

  // Load session size + habit data for complete screen
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { if (typeof d.sessionSize === 'number') setSessionSize(d.sessionSize) })
      .catch(() => {})
    fetch('/api/activity')
      .then((r) => r.json())
      .then((d) => {
        const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
        setHabitData({
          days: d.days ?? [],
          today: habitDateStr(hour),
          goal: d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS,
        })
      })
      .catch(() => {})
  }, [])

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1

  // Gated adoption of fresh initialCards (26-01-PLAN.md design decision 4c).
  // FreshnessWatcher's router.refresh() re-delivers initialCards with a new
  // object reference at every boundary refresh, but naive adoption here
  // would clobber real user state: mid-session (phase === 'studying') the
  // queue owns the cards, and every path back to select-mode either
  // re-fetches (startAhead) or crosses a navigation boundary that produces a
  // fresh payload of its own; under a narrowed lesson-range filter the
  // server payload is always the UNFILTERED full-span due pool (the RSC
  // page queries with null lesson bounds), so adopting it would silently
  // widen the user's chosen range. The incoming reference is ALWAYS
  // consumed (prevInitialCards updated exactly once per delivered payload)
  // so a later gate-open refresh isn't blocked by a stale comparison; the
  // payload itself is adopted only when no in-flight interaction needs
  // protecting. No new listener/fetch is added here — FreshnessWatcher
  // remains the single boundary-refresh owner (design decision 3); the
  // existing loadDue filter re-fetch is untouched and races benignly with
  // this gate (loadDue's guarded response wins for the filtered view, and a
  // stale refresh payload is discarded by the full-span check below).
  const [prevInitialCards, setPrevInitialCards] = useState(initialCards)
  if (initialCards !== prevInitialCards) {
    setPrevInitialCards(initialCards)
    if (phase === 'select-mode' && !isFilterLoading && isFullSpan(lessonFrom, lessonTo, maxOrder)) {
      setStudyCards(initialCards)
      setScope('due')
    }
  }

  // JSON backstop delivery (26-05-PLAN.md) — Suspense-independent second
  // delivery path for the SAME payload getStudyCards() (and the RSC page's
  // props above) both derive from: FreshnessWatcher's boundary handler also
  // fetches /api/cards/due directly and exposes it via context, so this
  // shell adopts fresh due-cards even when Next.js drops the RSC payload
  // application (deferred-items.md). Same 3-part gate as prevInitialCards
  // verbatim, plus the null check (freshStudy starts null until a backstop
  // delivery actually arrives). The prev-holder is mount-seeded to the
  // CURRENT slice value, so only deliveries arriving AFTER mount are ever
  // adopted — a plain-Link-navigated shell with fresh RSC props sees no
  // post-mount slice change at all and adopts nothing.
  const { study: freshStudy } = useFreshPayload()
  const [prevFreshStudy, setPrevFreshStudy] = useState(freshStudy)
  if (freshStudy !== prevFreshStudy) {
    setPrevFreshStudy(freshStudy)
    if (
      freshStudy !== null &&
      phase === 'select-mode' &&
      !isFilterLoading &&
      isFullSpan(lessonFrom, lessonTo, maxOrder)
    ) {
      setStudyCards(freshStudy)
      setScope('due')
    }
  }

  const handleRangeChange = (from: number, to: number) => {
    setShowFilterSheet(false)
    setLessonFrom(from)
    setLessonTo(to)
    loadDue(from, to, maxOrder)
  }

  const handleModeSelect = async (selectedMode: StudyMode, includeAI: boolean, subMode: FlashcardSubMode) => {
    setShowModeSheet(false)
    setMode(selectedMode)
    setFlashcardSubMode(subMode)

    if (includeAI && studyCards.length > 0) {
      setPhase('loading-practice')
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cards: studyCards.map((c) => ({ front: c.front, back: c.back, type: c.type })),
          }),
        })
        const data = await res.json()
        setPractice(data.practice ?? [])
      } catch (err) {
        console.error('Failed to generate AI practice:', err)
        setPractice([])
      }
    }

    setPhase('studying')
  }

  const handleComplete = (stats: { reviewed: number; correct: number; incorrect: number }) => {
    setCompleteStats(stats)
    setPhase('complete')
  }

  // Fetch the next batch of ahead cards and start a new session.
  // startAhead still uses setPhase('loading') — brief skeleton is acceptable for the
  // ahead fetch per the UI-SPEC; 'loading' is only eliminated from the INITIAL paint path.
  const startAhead = useCallback(() => {
    setPhase('loading')
    fetch(`/api/cards/due${buildParams(lessonFrom, lessonTo, 'ahead', maxOrder)}`)
      .then((r) => r.json())
      .then((cards: CardDTO[]) => {
        if (cards.length === 0) {
          // Nothing left to study ahead in this range
          setStudyCards([])
          setScope('ahead')
          setPhase('select-mode')
        } else {
          setStudyCards(cards)
          setPractice([])
          setScope('ahead')
          setSessionKey((k) => k + 1) // remount StudySession → fresh seed/index
          setPhase('studying')
        }
      })
      .catch(() => {
        setStudyCards([])
        setPhase('select-mode')
      })
  }, [buildParams, lessonFrom, lessonTo, maxOrder])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="w-full max-w-xl mx-auto animate-pulse flex flex-col gap-4 pt-4">
        <div className="h-3 bg-surface-3 rounded w-full" />
        <div className="h-[220px] bg-surface-3 rounded-2xl" />
        <div className="h-12 bg-surface-3 rounded-xl" />
      </div>
    )
  }

  if (phase === 'select-mode') {
    const noDue = studyCards.length === 0
    const noDueAndNoAhead = noDue && scope === 'ahead'
    const rangeLabel = isFullSpan(lessonFrom, lessonTo, maxOrder)
      ? 'All lessons'
      : lessonFrom === lessonTo
      ? `Lesson ${lessonFrom}`
      : `Lessons ${lessonFrom}–${lessonTo}`

    return (
      <div className="flex flex-col gap-6 pt-4">
        {/* Filter trigger → opens a bottom sheet */}
        {lessons.length >= 2 && (
          <div className="flex justify-center">
            <button
              onClick={() => { setDraftFrom(lessonFrom); setDraftTo(lessonTo); setShowFilterSheet(true) }}
              className="flex items-center gap-2 px-4 py-2 min-h-11 rounded-full bg-surface-2 text-sm text-muted-foreground hover:bg-surface-3 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {rangeLabel}
            </button>
          </div>
        )}

        {isFilterLoading ? (
          <div className="h-16 flex items-center justify-center" role="status" aria-label="Loading cards">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        ) : noDue ? (
          <div className="text-center py-10 flex flex-col items-center gap-4">
            {noDueAndNoAhead ? (
              <>
                <p className="text-muted">
                  🎉 All caught up in this range!
                </p>
                <Link href="/" className="inline-block bg-button text-button-foreground px-6 py-3 min-h-11 rounded-lg font-medium hover:bg-button-hover">
                  Back to Dashboard
                </Link>
              </>
            ) : (
              <>
                <p className="text-muted">No cards due for review right now.</p>
                <button
                  onClick={startAhead}
                  className="inline-block bg-button text-button-foreground px-6 py-3 min-h-11 rounded-lg font-medium hover:bg-button-hover"
                >
                  Study ahead →
                </button>
                <Link href="/" className="text-sm text-muted hover:underline">
                  Back to Dashboard
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-6">
            {/* Fixed-height slot: card count — no layout shift */}
            <div className="h-16 flex flex-col items-center justify-center">
              <p data-testid="due-count" className="text-5xl font-bold animate-reveal" style={{ color: 'var(--reward)' }}>
                {studyCards.length}
              </p>
              <p className="text-muted mt-1">
                card{studyCards.length !== 1 ? 's' : ''} ready
              </p>
            </div>
            <button
              data-testid="start-studying-btn"
              onClick={() => setShowModeSheet(true)}
              className="w-full max-w-sm min-h-14 bg-button text-button-foreground rounded-2xl text-lg font-semibold hover:bg-button-hover transition-colors"
            >
              Start studying →
            </button>
          </div>
        )}

        {/* Mode selection — bottom sheet (ModeSelector keeps its own heading) */}
        <Sheet open={showModeSheet} onClose={() => setShowModeSheet(false)} title="Study options">
          <ModeSelector cardCount={studyCards.length} onSelect={handleModeSelect} />
        </Sheet>

        {/* Lesson range — bottom sheet */}
        <Sheet open={showFilterSheet} onClose={() => setShowFilterSheet(false)} title="Lessons">
          <div className="p-4 flex flex-col items-center gap-4">
            <LessonRangeFilter
              lessons={lessons}
              from={draftFrom}
              to={draftTo}
              onChange={(f, t) => { setDraftFrom(f); setDraftTo(t) }}
            />
            <button
              onClick={() => handleRangeChange(draftFrom, draftTo)}
              className="w-full max-w-xs text-sm font-medium px-6 min-h-11 flex items-center justify-center rounded-xl bg-button text-button-foreground hover:opacity-90 transition-opacity"
            >
              Apply
            </button>
          </div>
        </Sheet>
      </div>
    )
  }

  if (phase === 'loading-practice') {
    return (
      <div className="w-full max-w-xl mx-auto animate-pulse flex flex-col gap-4 pt-4">
        <div className="h-3 bg-surface-3 rounded w-full" />
        <div className="h-[220px] bg-surface-3 rounded-2xl" />
        <div className="h-4 bg-surface-3 rounded w-48 mx-auto" />
        <div className="h-12 bg-surface-3 rounded-xl" />
      </div>
    )
  }

  if (phase === 'studying') {
    return (
      <StudySession
        key={sessionKey}
        cards={studyCards}
        extraPractice={practice}
        mode={mode}
        flashcardSubMode={flashcardSubMode}
        onComplete={handleComplete}
      />
    )
  }

  // ── Complete ────────────────────────────────────────────────────────────────
  const accuracy = completeStats.reviewed > 0
    ? Math.round((completeStats.correct / completeStats.reviewed) * 100)
    : 0

  const streakInfo = habitData
    ? computeStreaks(habitData.days, habitData.today, habitData.goal)
    : null
  const todayPct = habitData && habitData.goal > 0 && streakInfo
    ? Math.min(100, Math.round((streakInfo.todaySeconds / habitData.goal) * 100))
    : 0

  return (
    <SessionComplete
      scope={scope}
      completeStats={completeStats}
      accuracy={accuracy}
      sessionSize={sessionSize}
      streakInfo={streakInfo}
      todayPct={todayPct}
      onStudyMore={startAhead}
    />
  )
}

function SessionComplete({
  scope,
  completeStats,
  accuracy,
  sessionSize,
  streakInfo,
  todayPct,
  onStudyMore,
}: {
  scope: string
  completeStats: { reviewed: number; correct: number; incorrect: number }
  accuracy: number
  sessionSize: number
  streakInfo: { current: number; longest: number } | null
  todayPct: number
  onStudyMore: () => void
}) {
  useEffect(() => {
    haptic('impact-heavy')
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    let cancelled = false
    import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#f97316', '#fde68a', '#6366f1', '#14b8a6'] })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const heading = scope === 'ahead' ? 'Going the extra mile!' : 'Session complete!'

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 max-w-sm mx-auto text-center">
      {/* Heading */}
      <div>
        <h2 data-testid="session-complete-heading" className="text-3xl font-bold text-foreground">{heading}</h2>
        <p className="text-muted mt-1 text-sm">Keep showing up every day.</p>
      </div>

      {/* Today's goal ring + streak */}
      <div className="flex items-center gap-6 bg-surface-1 rounded-2xl shadow-md px-8 py-6 w-full justify-center">
        <div className="flex flex-col items-center gap-2">
          <ProgressRing
            pct={todayPct}
            size={80}
            strokeWidth={7}
            color="var(--reward)"
            aria-label={`Today's goal: ${todayPct}%`}
          />
          <p className="text-xs text-muted">Today&apos;s goal</p>
        </div>
        {streakInfo && streakInfo.current > 0 && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-4xl font-bold" style={{ color: 'var(--reward)' }}>
              🔥 {streakInfo.current}
            </p>
            <p className="text-xs text-muted">day streak</p>
          </div>
        )}
      </div>

      {/* Stat tiles — supporting detail */}
      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <span className="text-xl font-bold text-muted-foreground">{completeStats.reviewed}</span>
          <p className="text-xs text-muted mt-0.5">Reviewed</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <span className="text-xl font-bold text-green-600 dark:text-green-400">{completeStats.correct}</span>
          <p className="text-xs text-muted mt-0.5">Correct</p>
        </div>
        <div className="bg-surface-2 rounded-xl p-3 text-center">
          <span className="text-xl font-bold text-cat-vocab">{accuracy}%</span>
          <p className="text-xs text-muted mt-0.5">Accuracy</p>
        </div>
      </div>

      <button
        data-testid="study-more-btn"
        onClick={onStudyMore}
        className="w-full bg-button text-button-foreground px-6 py-3 min-h-11 rounded-xl font-medium hover:bg-button-hover transition-colors"
      >
        Study {sessionSize} more →
      </button>

      <Link href="/" className="text-sm text-muted hover:underline">
        Back to Dashboard
      </Link>
    </div>
  )
}
