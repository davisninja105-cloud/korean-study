'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import ModeSelector, { StudyMode, FlashcardSubMode } from '@/components/ModeSelector'
import StudySession from '@/components/StudySession'
import LessonRangeFilter, { isFullSpan, type LessonItem } from '@/components/LessonRangeFilter'

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
  clozeSentence?: string | null
  clozeAnswer?: string | null
  clozeTranslation?: string | null
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

  // Lesson range filter
  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [lessonFrom, setLessonFrom] = useState(1)
  const [lessonTo, setLessonTo] = useState(1)
  const [lessonsLoaded, setLessonsLoaded] = useState(false)

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
  }, [buildParams])

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
      .catch(() => {
        setLessonsLoaded(true)
        loadDue(1, 1, 1)
      })
  // loadDue is stable (useCallback with stable deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1

  const handleRangeChange = (from: number, to: number) => {
    setLessonFrom(from)
    setLessonTo(to)
    loadDue(from, to, maxOrder)
  }

  const handleModeSelect = async (selectedMode: StudyMode, includeAI: boolean, subMode: FlashcardSubMode) => {
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
      } catch {
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
  }, [buildParams, lessonFrom, lessonTo, maxOrder])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <p className="text-center text-gray-400 dark:text-gray-500 py-16">Loading...</p>
  }

  if (phase === 'select-mode') {
    const noDue = studyCards.length === 0
    const noDueAndNoAhead = noDue && scope === 'ahead'

    return (
      <div className="flex flex-col gap-6">
        {/* Lesson filter (shown above mode selector / empty state) */}
        {lessonsLoaded && (
          <div className="flex justify-center">
            <LessonRangeFilter
              lessons={lessons}
              from={lessonFrom}
              to={lessonTo}
              onChange={handleRangeChange}
            />
          </div>
        )}

        {noDue ? (
          <div className="text-center py-10 flex flex-col items-center gap-4">
            {noDueAndNoAhead ? (
              <>
                <p className="text-gray-500 dark:text-gray-400">
                  🎉 All caught up in this range!
                </p>
                <Link href="/" className="inline-block bg-button text-button-foreground px-6 py-3 min-h-11 rounded-lg font-medium hover:bg-button-hover">
                  Back to Dashboard
                </Link>
              </>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400">No cards due for review right now.</p>
                <button
                  onClick={startAhead}
                  className="inline-block bg-button text-button-foreground px-6 py-3 min-h-11 rounded-lg font-medium hover:bg-button-hover"
                >
                  Study ahead →
                </button>
                <Link href="/" className="text-sm text-gray-400 dark:text-gray-500 hover:underline">
                  Back to Dashboard
                </Link>
              </>
            )}
          </div>
        ) : (
          <ModeSelector cardCount={studyCards.length} onSelect={handleModeSelect} />
        )}
      </div>
    )
  }

  if (phase === 'loading-practice') {
    return <p className="text-center text-gray-400 dark:text-gray-500 py-16">Generating practice questions...</p>
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

  const sessionLabel = scope === 'ahead' ? 'Extra session complete!' : 'Session Complete!'

  return (
    <div className="text-center py-16 flex flex-col items-center gap-4">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">{sessionLabel}</h2>
      <p className="text-gray-500 dark:text-gray-400">Great work on your Korean study!</p>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
          <span className="text-2xl font-bold text-gray-700 dark:text-gray-200">{completeStats.reviewed}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">Reviewed</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
          <span className="text-2xl font-bold text-green-500">{completeStats.correct}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">Correct</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
          <span className="text-2xl font-bold text-blue-500">{accuracy}%</span>
          <p className="text-xs text-gray-500 dark:text-gray-400">Accuracy</p>
        </div>
      </div>

      {/* Study-ahead CTA — always offered after completion */}
      <button
        onClick={startAhead}
        className="inline-block bg-button text-button-foreground px-6 py-3 min-h-11 rounded-lg font-medium hover:bg-button-hover mt-4"
      >
        Study 20 more →
      </button>

      <Link href="/" className="text-sm text-gray-400 dark:text-gray-500 hover:underline">
        Back to Dashboard
      </Link>
    </div>
  )
}
