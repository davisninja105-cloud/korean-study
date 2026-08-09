'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import ModeSelector, { StudyMode } from '@/components/ModeSelector'
import StudySession, { type Card as StudySessionCard } from '@/components/StudySession'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import ProgressRing from '@/components/ProgressRing'
import Sheet from '@/components/Sheet'
import { SlidersHorizontal } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { computeStreaks, habitDateStr, DEFAULT_DAY_START_HOUR, DEFAULT_GOAL_SECONDS, type DayRecord } from '@/lib/habit'
import { fetchCacheContext, readCache, writeCache, patchStudyCard, type StudyCachePayload } from '@/lib/local-cache'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
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
  const [mode, setMode] = useState<StudyMode>('passive')
  const [phase, setPhase] = useState<Phase>('select-mode')
  const [scope, setScope] = useState<Scope>('due')
  const [completeStats, setCompleteStats] = useState({ reviewed: 0, correct: 0, incorrect: 0 })
  const [sessionKey, setSessionKey] = useState(0) // bump to remount StudySession
  const [sessionSize, setSessionSize] = useState(20) // for "Study N more" label
  const [habitData, setHabitData] = useState<{ days: DayRecord[]; today: string; goal: number } | null>(null)
  const [isFilterLoading, setIsFilterLoading] = useState(false)

  // WR-03 fix: loadDue below needs the CURRENT phase without depending on it
  // (re-creating the callback every phase change would be wasteful and,
  // worse, invite a stale-closure race with the in-flight fetch). A ref kept
  // in sync via effect is the standard escape hatch — reading it from inside
  // a .then() callback is a normal effect-adjacent read, not a render read,
  // so it doesn't trip react-hooks/purity. This replaces the previous
  // setPhase-functional-updater trick, which called setStudyCards/setScope/
  // setIsFilterLoading from *inside* the updater passed to setPhase — updater
  // functions must be pure per React's contract, and Strict Mode double-
  // invokes them in dev specifically to catch exactly that side-effect
  // pattern.
  const phaseRef = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  // The /api/version value + buildId this mount observed — read once on
  // mount (and refreshed by revalidation), held in refs so the render-phase
  // prevInitialCards-win block below (which cannot await) can fire a
  // write-through without needing a second fetch (mirrors HabitsClient.tsx).
  const versionRef = useRef<string | null>(null)
  const buildIdRef = useRef<string | null>(null)
  const [isRevalidating, setIsRevalidating] = useState(false)

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
        if (phaseRef.current !== 'select-mode') {
          setIsFilterLoading(false)
          return
        }
        setStudyCards(cards)
        setScope('due')
        setIsFilterLoading(false)
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
    // A genuinely fresher RSC delivery is strictly newer than any cache
    // entry — fire-and-forget write-through so the cache does not fall
    // behind an RSC-delivered update (34-02-PLAN.md Task 1). Only fires once
    // a version is known (post-mount); matches HabitsClient.tsx's identical
    // precedent.
    if (versionRef.current && buildIdRef.current) {
      writeCache(buildIdRef.current, 'study', initialCards, versionRef.current).catch(() => {})
    }
  }

  // Shared revalidation body (mirrors HabitsClient.tsx's `revalidate`,
  // 34-01-PLAN.md Task 3 precedent): fetches the unfiltered (full-span) due
  // list — always with NO lesson params, matching what the `study` cache
  // entry itself always stores — applies the SAME discard guard `loadDue`
  // already uses (phaseRef.current === 'select-mode') PLUS a full-span
  // check (an unfiltered fetch must never clobber a narrowed lesson-range
  // view), then writes the cache regardless of whether adoption was
  // rejected — the payload is server truth for that version regardless of
  // what the user is currently looking at.
  const revalidate = useCallback(async (buildId: string, version: string, cancelledRef: { current: boolean }) => {
    setIsRevalidating(true)
    try {
      const res = await fetch('/api/cards/due')
      if (cancelledRef.current || !res.ok) return
      const fresh = (await res.json()) as CardDTO[]
      if (cancelledRef.current) return
      if (phaseRef.current === 'select-mode' && isFullSpan(lessonFrom, lessonTo, maxOrder)) {
        setStudyCards(fresh)
        setScope('due')
      }
      await writeCache(buildId, 'study', fresh, version)
    } finally {
      if (!cancelledRef.current) setIsRevalidating(false)
    }
  }, [lessonFrom, lessonTo, maxOrder])

  // Cache-first mount read (LOCAL-01) + version-checked background
  // revalidation (LOCAL-02) — never gated on elapsed time (D-00 rule 2). No
  // gate is needed on the initial cache-read paint itself: this effect runs
  // at mount, where phase is 'select-mode', isFilterLoading is false, and
  // the lesson range is the full span by construction.
  useEffect(() => {
    const cancelledRef = { current: false }
    ;(async () => {
      const ctx = await fetchCacheContext()
      if (cancelledRef.current || !ctx) return // offline cold path — RSC-provided initialCards already rendered
      const { version, buildId } = ctx
      versionRef.current = version
      buildIdRef.current = buildId

      const cached = await readCache<StudyCachePayload>(buildId, 'study')
      if (cancelledRef.current) return
      if (cached) {
        setStudyCards(cached.data)
        setScope('due')
      }

      if (!cached || cached.dataVersion !== version) {
        await revalidate(buildId, version, cancelledRef)
        if (!cancelledRef.current) versionRef.current = version
      }
    })()
    return () => { cancelledRef.current = true }
  }, [revalidate])

  // Boundary-event revalidation (Rule 2 auto-add — see SUMMARY Deviations):
  // /study has its own app/study/loading.tsx, making it one of the exact
  // routes affected by the same real, unfixed Next.js 16.2.1 RSC-application
  // flake 34-01-SUMMARY.md's Deviation #2 found and fixed for /habits — a
  // boundary-triggered router.refresh() can fetch a fresh RSC payload on the
  // server but silently fail to apply it to the already-mounted client tree.
  // Mirrors HabitsClient.tsx's second effect: re-checks /api/version on the
  // same three events FreshnessWatcher's now-removed JSON backstop used to
  // (visibility hidden→visible, popstate, a genuine bfcache pageshow), with
  // the same 300ms coalesce guard.
  useEffect(() => {
    const cancelledRef = { current: false }
    const lastCheckRef = { current: 0 }
    const check = () => {
      const now = Date.now()
      if (now - lastCheckRef.current < 300) return
      lastCheckRef.current = now
      ;(async () => {
        const ctx = await fetchCacheContext()
        if (cancelledRef.current || !ctx) return
        if (ctx.version !== versionRef.current) {
          buildIdRef.current = ctx.buildId
          await revalidate(ctx.buildId, ctx.version, cancelledRef)
          if (!cancelledRef.current) versionRef.current = ctx.version
        }
      })()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check()
    }
    const onPopState = () => { setTimeout(check, 0) }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      cancelledRef.current = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [revalidate])

  const handleRangeChange = (from: number, to: number) => {
    setShowFilterSheet(false)
    setLessonFrom(from)
    setLessonTo(to)
    loadDue(from, to, maxOrder)
  }

  const handleModeSelect = async (selectedMode: StudyMode, includeAI: boolean) => {
    setShowModeSheet(false)
    setMode(selectedMode)

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

  // Cache write-through (LOCAL-03) — StudySession calls this synchronously
  // from the same code path as its optimistic queue advance (submitReview)
  // and a successful undo. Fire-and-forget, never awaited: patchStudyCard
  // owns its own error swallowing (lib/local-cache.ts). No-ops before a
  // buildId is known (offline cold path — nothing was ever cached to patch).
  // updatedCardOrNull is typed as StudySession's own (narrower) Card shape;
  // the runtime value always originates from a real CardDTO passed in as
  // `cards` prop, only ever spread with additive `review` field updates.
  const handleReviewCommitted = useCallback((cardId: string, updatedCardOrNull: StudySessionCard | null) => {
    if (!buildIdRef.current) return
    void patchStudyCard(buildIdRef.current, cardId, updatedCardOrNull as CardDTO | null)
  }, [])

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

  // Mount-guard for handleRefresh (mirrors HabitsClient.tsx's isMountedRef):
  // a pull-to-refresh can still be in flight when the user navigates away
  // mid-gesture; this prevents its continuation from calling setState after
  // unmount.
  const isMountedRef = useRef(true)
  useEffect(() => { return () => { isMountedRef.current = false } }, [])

  // Route-local pull-to-refresh (D-04, LOCAL-04) — a separate function from
  // Home's sync handler (HomeClient.tsx), never parameterised together.
  // Bypasses BOTH the cache read AND the version check entirely: fetches
  // the CURRENT lesson range unconditionally and triggers NO Google Doc sync.
  const [refreshError, setRefreshError] = useState(false)
  const handleRefresh = useCallback(async () => {
    haptic('impact-light')
    if (isMountedRef.current) setRefreshError(false)
    try {
      // NOT a gate — the result is used only to stamp the subsequent write.
      const ctx = await fetchCacheContext()
      const res = await fetch(`/api/cards/due${buildParams(lessonFrom, lessonTo, 'due', maxOrder)}`)
      if (!isMountedRef.current) return
      if (!res.ok) throw new Error('refresh failed')
      const fresh = (await res.json()) as CardDTO[]
      if (!isMountedRef.current) return
      if (phaseRef.current === 'select-mode') {
        setStudyCards(fresh)
        setScope('due')
      }
      if (ctx) {
        versionRef.current = ctx.version
        buildIdRef.current = ctx.buildId
        await writeCache(ctx.buildId, 'study', fresh, ctx.version)
      }
    } catch {
      if (isMountedRef.current) setRefreshError(true)
    }
  }, [buildParams, lessonFrom, lessonTo, maxOrder])

  const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="w-full max-w-xl mx-auto animate-pulse flex flex-col gap-4 pt-4">
        <div className="h-3 bg-skeleton rounded w-full" />
        <div className="h-[220px] bg-skeleton rounded-2xl" />
        <div className="h-12 bg-skeleton rounded-xl" />
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
        {/* ── Route-local pull-to-refresh indicator (D-03/D-04, UI-SPEC Component Note 3) ── */}
        {(pullDistance > 0 || refreshing) && (
          <div
            className="flex items-center justify-center overflow-hidden text-xs text-muted"
            style={{ height: refreshing ? 28 : pullDistance }}
          >
            {refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}
        {refreshError && !refreshing && pullDistance === 0 && (
          <p className="text-center text-sm text-muted">
            Couldn&apos;t refresh. Check your connection and try again.{' '}
            <button type="button" onClick={handleRefresh} className="text-button font-semibold">
              Try again
            </button>
          </p>
        )}

        {/* ── Background-revalidation pill (D-01, UI-SPEC Component Note 1) ── */}
        {isRevalidating && (
          <div
            role="status"
            aria-live="polite"
            className="fixed left-1/2 -translate-x-1/2 z-[5] flex items-center gap-1.5 bg-surface-1 border border-border text-muted text-xs px-2 py-1 rounded-full shadow-sm"
            style={{ top: 'calc(var(--nav-height, 68px) + 8px)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" aria-hidden="true" />
            Updating…
          </div>
        )}

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
          <div
            className="flex flex-col items-center gap-6 py-6"
            role="status"
            aria-label="Loading cards"
            data-testid="filter-loading-skeleton"
          >
            {/* Fixed-height slot: card count — mirrors the real content's h-16 slot */}
            <div className="h-16 flex flex-col items-center justify-center gap-1">
              {/* bar 1: stands in for the text-5xl font-bold due-count number */}
              <div className="h-12 w-16 rounded-lg bg-skeleton animate-pulse" />
              {/* bar 2: stands in for the "card(s) ready" label */}
              <div className="h-4 w-24 rounded bg-skeleton animate-pulse" />
            </div>
            {/* button placeholder: stands in for "Start studying →" */}
            <div className="w-full max-w-sm min-h-14 rounded-2xl bg-skeleton animate-pulse" />
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
        <div className="h-3 bg-skeleton rounded w-full" />
        <div className="h-[220px] bg-skeleton rounded-2xl" />
        <div className="h-4 bg-skeleton rounded w-48 mx-auto" />
        <div className="h-12 bg-skeleton rounded-xl" />
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
        onComplete={handleComplete}
        onReviewCommitted={handleReviewCommitted}
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
