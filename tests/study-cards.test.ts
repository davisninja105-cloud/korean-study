// Coverage for lib/study-cards.ts's cache-gated, two-phase raw-SQL pipeline
// (Phase 32-03; mock shape revised Phase 32-04 Task 1 — see below). Two
// concerns:
//
//   1. RELIABILITY-01: the invariants refill (lib/study-cache.ts's
//      refreshStudyCache()) is now ONE prisma.$queryRaw call folding edges/
//      lemmas/sessionSize/lessons into correlated json_group_array/
//      json_object subqueries (Phase 32-04 Task 1 — see lib/study-cache.ts's
//      REFILL SHAPE header comment: the original four-separate-Prisma-call
//      shape measured 4 physical round trips against a real DB, pushing a
//      cold getStudyCards() call to 6 total, double STUDY-01's "at most 3"
//      budget). When the combined query rejects, ALL FOUR fields silently
//      degrade together — invisibly turning the unknownCount ranking signal
//      into "everything is unknown" (among other degradations). These tests
//      lock the now-observable `[study-cards]`-prefixed log AND the
//      pre-existing degradation contract (pool failure still throws
//      'Database error'; happy path stays silent).
//   2. STUDY-03 cache-gating: a version match must skip the invariant
//      refill entirely (zero extra round trips); a version mismatch must
//      trigger exactly one refill. getStudyCards() now returns
//      { cards, lessons } (StudyCardsResult) — `lessons` comes from the
//      same cache-gated invariants snapshot, not a separate query.
//
// getStudyCards() does a raw-SQL Phase A — one prisma.$queryRaw call
// returning the light pool (id/nextReview/orderIndex) plus the
// studyCacheVersion token as a correlated scalar subquery column — followed
// by a cache-gated invariant read (lib/study-cache.ts's getStudyCache() /
// refreshStudyCache(), now itself ONE prisma.$queryRaw call on a cache miss,
// zero calls on a cache hit) and a raw-SQL Phase B prisma.$queryRaw re-fetch
// of only the chosen/ordered card ids, with sentences folded into a JSON text
// column. So `prisma.$queryRaw` is called up to THREE times per
// getStudyCards() call in these tests (Phase A, invariants refill, Phase B)
// — the mock implementation below distinguishes all three by query text:
// Phase B's SELECT is the only one that mentions "sentencesJson", the
// invariants refill's SELECT is the only one that mentions "edgesJson", and
// Phase A is whichever call is neither.
//
// The prisma singleton is mocked via vi.mock('@/lib/prisma', ...), which
// also neutralizes the real module body — so no DATABASE_URL is needed and
// no real DB connection is attempted. getSessionSize() is never read from
// its result because every test passes an explicit sessionSize in
// StudyCardsParams, which always overrides the cached value.
//
// resetStudyCacheForTests() runs in beforeEach so lib/study-cache.ts's
// globalThis-held snapshot (module state that otherwise persists across
// tests within this one file) cannot leak a prior test's refill into a
// later test's cache-hit/miss decision — except in the cache-gating test
// itself, which deliberately calls getStudyCards() multiple times within
// one test body to observe the snapshot surviving across calls.
//
// tests/study-cards.order-fixture.txt (alongside this file): the
// composition-equivalence proof for the 32-03 rewrite — one card id per
// line, in session order, captured via `npx tsx
// scripts/measure-study-roundtrips.mts --dump-order` against the seeded
// e2e test DB AFTER the raw-SQL rewrite. It is byte-identical to
// .planning/phases/32-study-load-round-trip-collapse/order-before.txt,
// captured BEFORE the rewrite from the same seed — proving the ordered
// session card sequence did not move. Re-run the same command and diff
// against this fixture to catch any future change to sequencing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vi.mock is hoisted above all imports by vitest. The factory replaces the
// prisma singleton with a vi.fn stub we can program per-test. Phase 32-04
// Task 1: getStudyCards()'s entire pipeline (Phase A, the invariants refill,
// Phase B) now goes through prisma.$queryRaw exclusively — no more separate
// card/cardDependency/lesson/setting model calls to mock.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

// Import AFTER the mock declaration (vitest hoists vi.mock above imports).
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import { resetStudyCacheForTests } from '@/lib/study-cache'

// A minimal but serialization-complete pool card. It must survive:
//   - selectSessionCards / sequenceCards (reads id, review.nextReview,
//     lesson.orderIndex — all present)
//   - countUnknownWords on its sentence (reads korean + targetForm)
//   - the final DTO serialization block (toISOString on createdAt/updatedAt
//     for card + each sentence; review.nextReview Date; lesson null ok)
function makePoolCard() {
  const past = new Date('2026-01-01T00:00:00Z')
  return {
    id: 'card-1',
    createdAt: past,
    updatedAt: past,
    type: 'vocabulary',
    front: '공부',
    back: 'study',
    notes: null,
    normalizedFront: '공부',
    components: null,
    distractors: null,
    lessonId: null,
    lesson: null,
    review: {
      id: 'review-1',
      cardId: 'card-1',
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      reps: 0,
      lapses: 0,
      nextReview: past, // past Date → due now
      lastReview: null,
    },
    sentences: [
      {
        id: 'sentence-1',
        cardId: 'card-1',
        korean: '저는 공부해요',
        targetForm: '공부해요',
        translation: 'I study',
        orderIndex: 0,
        createdAt: past,
        updatedAt: past,
      },
    ],
  }
}

// The raw-SQL Phase A row shape: id/nextReview/orderIndex/version (what the
// prisma.$queryRaw pool-plus-version-subquery query returns — see
// lib/study-cards.ts's PoolRow interface). Derived from makePoolCard() so
// the two fixtures never drift out of sync on id/nextReview. version is
// always null here — resetStudyCacheForTests() in beforeEach guarantees a
// cache miss regardless (getStudyCache() returns undefined), so the exact
// version value is irrelevant to these tests.
function makePoolRow() {
  const full = makePoolCard()
  return {
    id: full.id,
    nextReview: full.review.nextReview,
    orderIndex: null,
    version: null,
  }
}

// The raw-SQL Phase B row shape: the flat, review_*/lesson_*-prefixed
// columns plus a JSON-stringified sentencesJson column (see
// lib/study-cards.ts's FullCardRow/RawSentenceRow interfaces). Derived from
// makePoolCard() so the two fixtures never drift out of sync. lesson_* is
// null here (makePoolCard()'s card has no lesson) — matches the LEFT JOIN
// miss case.
function makeFullCardRow() {
  const full = makePoolCard()
  return {
    id: full.id,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    type: full.type,
    front: full.front,
    back: full.back,
    notes: full.notes,
    normalizedFront: full.normalizedFront,
    components: full.components,
    distractors: full.distractors,
    lessonId: full.lessonId,
    review_id: full.review.id,
    review_state: full.review.state,
    review_stability: full.review.stability,
    review_difficulty: full.review.difficulty,
    review_elapsedDays: full.review.elapsedDays,
    review_scheduledDays: full.review.scheduledDays,
    review_learningSteps: full.review.learningSteps,
    review_reps: full.review.reps,
    review_lapses: full.review.lapses,
    review_nextReview: full.review.nextReview,
    review_lastReview: full.review.lastReview,
    lesson_id: null,
    lesson_orderIndex: null,
    lesson_title: null,
    lesson_createdAt: null,
    sentencesJson: JSON.stringify(
      full.sentences.map((s) => ({
        id: s.id,
        cardId: s.cardId,
        korean: s.korean,
        targetForm: s.targetForm,
        translation: s.translation,
        orderIndex: s.orderIndex,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))
    ),
  }
}

// The raw-SQL invariants-refill row shape (lib/study-cache.ts's
// InvariantsRow) — one row, four JSON/scalar columns. lemmas/lessons default
// empty; overrides let a test populate exactly the field it's exercising
// without needing to restate the other three every time.
function makeInvariantsRow(
  overrides: {
    lemmas?: string[]
    lessons?: { id: string; orderIndex: number; title: string }[]
  } = {}
) {
  return {
    edgesJson: JSON.stringify([]),
    lemmasJson: JSON.stringify(overrides.lemmas ?? []),
    sessionSizeValue: null,
    lessonsJson: JSON.stringify(overrides.lessons ?? []),
  }
}

// Distinguishes the three prisma.$queryRaw call shapes by query text: Phase
// B's SELECT is the only one that mentions "sentencesJson"; the invariants
// refill's SELECT is the only one that mentions "edgesJson" (lib/study-cache.ts's
// combined query). Phase A is whichever call is neither.
function isPhaseBQuery(strings: TemplateStringsArray): boolean {
  return strings.join('').includes('sentencesJson')
}
function isInvariantsQuery(strings: TemplateStringsArray): boolean {
  return strings.join('').includes('edgesJson')
}

describe('getStudyCards — RELIABILITY-01 invariants-refill degradation logging', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset the in-memory invariant-snapshot cache so no test can observe a
    // prior test's refill as a cache hit.
    resetStudyCacheForTests()
    // Spy on console.error (suppress output during tests) and reset call
    // history + mock implementation before each test.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs a [study-cards]-prefixed reason and still returns cards when the invariants refill query rejects but Phase A/Phase B fulfill', async () => {
    const rejectionReason = new Error('invariants refill boom')
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
      if (isPhaseBQuery(strings)) return Promise.resolve([makeFullCardRow()])
      if (isInvariantsQuery(strings)) return Promise.reject(rejectionReason)
      return Promise.resolve([makePoolRow()])
    })

    const { cards } = await getStudyCards({
      scope: 'due',
      lessonFrom: null,
      lessonTo: null,
      sessionSize: 20,
    })

    // Sessions still load on an invariants-refill failure (non-fatal contract).
    expect(cards).toHaveLength(1)
    // Every sentence carries a numeric unknownCount (the ranking signal,
    // degraded to treat all context words as unknown — still a number).
    for (const s of cards[0].sentences) {
      expect(typeof s.unknownCount).toBe('number')
      expect(s.unknownCount).toBeGreaterThanOrEqual(0)
    }

    // The degradation is now observable: console.error was called with a
    // first argument starting with the literal prefix "[study-cards]" and
    // a second argument equal to the rejection reason.
    expect(errorSpy).toHaveBeenCalled()
    const calls = errorSpy.mock.calls
    const studyCardCall = calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(studyCardCall).toBeDefined()
    expect(studyCardCall![1]).toBe(rejectionReason)
  })

  it('still throws Error("Database error") when the pool query rejects (existing contract unchanged)', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('pool boom'))

    await expect(
      getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null, sessionSize: 20 })
    ).rejects.toThrow('Database error')
  })

  it('does not emit a [study-cards]-prefixed console.error on the happy path (all three queries fulfill)', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
      if (isPhaseBQuery(strings)) return Promise.resolve([makeFullCardRow()])
      if (isInvariantsQuery(strings)) return Promise.resolve([makeInvariantsRow({ lemmas: ['공부'] })])
      return Promise.resolve([makePoolRow()])
    })

    const { cards } = await getStudyCards({
      scope: 'due',
      lessonFrom: null,
      lessonTo: null,
      sessionSize: 20,
    })

    expect(cards).toHaveLength(1)
    // No [study-cards]-prefixed console.error on the clean path.
    const studyCardCall = errorSpy.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(studyCardCall).toBeUndefined()
  })

  it('a warm cache (matching version) skips the invariant refill entirely (2 $queryRaw calls, not 3); a version change forces exactly one refill (3 calls)', async () => {
    // First call: cache miss (resetStudyCacheForTests() cleared it in
    // beforeEach), pool reports version "v1".
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
      if (isPhaseBQuery(strings)) return Promise.resolve([makeFullCardRow()])
      if (isInvariantsQuery(strings)) return Promise.resolve([makeInvariantsRow({ lemmas: ['공부'] })])
      return Promise.resolve([{ ...makePoolRow(), version: 'v1' }])
    })
    await getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null, sessionSize: 20 })
    // Miss: Phase A + invariants refill + Phase B = 3 physical $queryRaw calls.
    expect((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)

    // Second call: SAME version "v1" — cache hit. Only Phase A + Phase B run
    // (2 more calls, cumulative 5) — the invariants refill is skipped.
    await getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null, sessionSize: 20 })
    expect((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls.length).toBe(5)

    // Third call: DIFFERENT version "v2" — cache miss, exactly one more
    // refill (3 more calls, cumulative 8).
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
      if (isPhaseBQuery(strings)) return Promise.resolve([makeFullCardRow()])
      if (isInvariantsQuery(strings)) return Promise.resolve([makeInvariantsRow({ lemmas: ['공부'] })])
      return Promise.resolve([{ ...makePoolRow(), version: 'v2' }])
    })
    await getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null, sessionSize: 20 })
    expect((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls.length).toBe(8)
  })

  it('returns lessons from the invariants snapshot, not a separate query', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockImplementation((strings: TemplateStringsArray) => {
      if (isPhaseBQuery(strings)) return Promise.resolve([makeFullCardRow()])
      if (isInvariantsQuery(strings)) {
        return Promise.resolve([
          makeInvariantsRow({
            lemmas: ['공부'],
            lessons: [{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }],
          }),
        ])
      }
      return Promise.resolve([makePoolRow()])
    })

    const result = await getStudyCards({
      scope: 'due',
      lessonFrom: null,
      lessonTo: null,
      sessionSize: 20,
    })

    expect(result.lessons).toEqual([{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }])
  })
})
