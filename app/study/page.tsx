'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ModeSelector, { StudyMode, FlashcardSubMode } from '@/components/ModeSelector'
import StudySession from '@/components/StudySession'
import LessonRangeFilter, { isFullSpan, type LessonItem } from '@/components/LessonRangeFilter'
import ProgressRing from '@/components/ProgressRing'
import Sheet from '@/components/Sheet'
import { SlidersHorizontal } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { computeStreaks, habitDateStr, DEFAULT_DAY_START_HOUR, DEFAULT_GOAL_SECONDS, type DayRecord } from '@/lib/habit'

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
  distractors?: string | null
  sentences?: Sentence[]
  review?: { reps?: number } | null
  lesson?: { id: string; orderIndex: number; title: string } | null
}

interface PracticeCard {
  type: string
  front: string
  back: string
  notes?: string
}

type Phase = 'loading' | 'select-mode' | 'loading-practice' | 'studying' | 'complete'
type Scope  = 'due' | 'ahead'

export default function StudyPage() {
  const [studyCards, setStudyCards] = useState<Card[]>([])
  const [practice, setPractice] = useState<PracticeCard[]>([])
  const [mode, setMode] = useState<StudyMode>('flashcard')
  const [flashcardSubMode, setFlashcardSubMode] = useState<FlashcardSubMode>('exposure')
  const [phase, setPhase] = useState<Phase>('loading')
  const [scope, setScope] = useState<Scope>('due')
  const [completeStats, setCompleteStats] = useState({ reviewed: 0, correct: 0, incorrect: 0 })
  const [sessionKey, setSessionKey] = useState(0) // bump to remount StudySession
  const [sessionSize, setSessionSize] = useState(20) // for "Study N more" label
  const [habitData, setHabitData] = useState<{ days: DayRecord[]; today: string; goal: number } | null>(null)

  // Lesson range filter
  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [lessonFrom, setLessonFrom] = useState(1)
  const [lessonTo, setLessonTo] = useState(1)
  const [lessonsLoaded, setLessonsLoaded] = useState(false)
  const [showModeSheet, setShowModeSheet] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)

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

  const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
    setPhase('loading')
    fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
      .then((r) => r.json())
      .then((cards: Card[]) => {
        setStudyCards(cards)
        setScope('due')
        setPhase('select-mode')
      })
      .catch(() => {
        setStudyCards([])
        setPhase('select-mode')
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

  // Load lessons once; then load due cards for the full span
  useEffect(() => {
    fetch('/api/lessons')
      .then((r) => r.json())
      .then((data: LessonItem[]) => {
        setLessons(data)
        const from = data.length > 0 ? data[0].orderIndex : 1
        const to   = data.length > 0 ? data[data.length - 1].orderIndex : 1
        setLessonFrom(from)
        setLessonTo(to)
        setLessonsLoaded(true)
        loadDue(from, to, to)
      })
      .catch((err: unknown) => {
        console.error('Failed to load lessons:', err)
        setLessonsLoaded(true)
        loadDue(1, 1, 1)
      })
  // loadDue is stable (useCallback with stable deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1

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
  const startAhead = useCallback(() => {
    setPhase('loading')
    fetch(`/api/cards/due${buildParams(lessonFrom, lessonTo, 'ahead', maxOrder)}`)
      .then((r) => r.json())
      .then((cards: Card[]) => {
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
        {lessonsLoaded && lessons.length >= 2 && (
          <div className="flex justify-center">
            <button
              onClick={() => setShowFilterSheet(true)}
              className="flex items-center gap-2 px-4 py-2 min-h-11 rounded-full bg-surface-2 text-sm text-muted-foreground hover:bg-surface-3 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {rangeLabel}
            </button>
          </div>
        )}

        {noDue ? (
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
            <div className="text-center">
              <p className="text-5xl font-bold" style={{ color: 'var(--reward)' }}>
                {studyCards.length}
              </p>
              <p className="text-muted mt-1">
                card{studyCards.length !== 1 ? 's' : ''} ready
              </p>
            </div>
            <button
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
          <div className="p-4 flex justify-center">
            <LessonRangeFilter
              lessons={lessons}
              from={lessonFrom}
              to={lessonTo}
              onChange={handleRangeChange}
            />
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
  const todayPct = habitData && habitData.goal > 0
    ? Math.min(100, Math.round((streakInfo!.todaySeconds / habitData.goal) * 100))
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
        <h2 className="text-3xl font-bold text-foreground">{heading}</h2>
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
