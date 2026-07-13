// Regression tests for RELIABILITY-01: the known-lemmas query in
// lib/study-cards.ts runs concurrently with the pool query via
// Promise.allSettled. When the known-lemmas query rejects it silently
// degrades to an empty Set — invisibly turning the unknownCount ranking
// signal into "everything is unknown". These tests lock the now-observable
// `[study-cards]`-prefixed log AND the pre-existing degradation contract
// (pool failure still throws 'Database error'; happy path stays silent).
//
// getStudyCards() now does a two-phase fetch: Phase A batches sessionSize +
// a LIGHTWEIGHT pool query (select: id/review.nextReview/lesson.orderIndex)
// + edges + knownLemmas via Promise.allSettled; Phase B re-fetches only the
// chosen/ordered card ids with the full include shape. So
// `prisma.card.findMany` is called up to THREE times per getStudyCards()
// call in these tests (light pool, knownLemmas, full re-fetch) — the mock
// implementation below distinguishes them by args shape:
//   - light pool:   args.select.id === true
//   - knownLemmas:  args.select.normalizedFront === true
//   - full re-fetch: args.include is present (no args.select)
//
// The prisma singleton is mocked via vi.mock('@/lib/prisma', ...), which
// also neutralizes the real module body — so no DATABASE_URL is needed and
// no real DB connection is attempted. getSessionSize() is never invoked
// because every test passes an explicit sessionSize in StudyCardsParams.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vi.mock is hoisted above all imports by vitest. The factory replaces the
// prisma singleton with vi.fn stubs we can program per-test.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    card: {
      findMany: vi.fn(),
    },
    cardDependency: {
      findMany: vi.fn(),
    },
  },
}))

// Import AFTER the mock declaration (vitest hoists vi.mock above imports).
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'

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

// The Phase A lightweight pool shape: only id/review.nextReview/lesson.orderIndex
// (what selectSessionCards/sequenceCards read). Derived from makePoolCard() so
// the two fixtures never drift out of sync on id/nextReview.
function makeLightPoolCard() {
  const full = makePoolCard()
  return {
    id: full.id,
    review: { nextReview: full.review.nextReview },
    lesson: null,
  }
}

// Distinguishes the three distinct prisma.card.findMany call shapes used by
// the two-phase getStudyCards() pipeline (see file-header comment above).
function isLightPoolArgs(args: { select?: { id?: boolean } }): boolean {
  return !!args?.select?.id
}
function isKnownLemmasArgs(args: { select?: { normalizedFront?: boolean } }): boolean {
  return !!args?.select?.normalizedFront
}

describe('getStudyCards — RELIABILITY-01 known-lemmas degradation logging', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Spy on console.error (suppress output during tests) and reset call
    // history + mock implementations before each test.
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockReset()
    ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockReset()
    // The edge query always resolves to an empty array in these tests.
    ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('logs a [study-cards]-prefixed reason and still returns cards when the known-lemmas query rejects but the pool fulfills', async () => {
    const rejectionReason = new Error('known-lemmas boom')
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockImplementation((args) => {
      if (isKnownLemmasArgs(args)) {
        return Promise.reject(rejectionReason)
      }
      if (isLightPoolArgs(args)) {
        return Promise.resolve([makeLightPoolCard()])
      }
      // Phase B full re-fetch (args.include, id: { in: [...] })
      return Promise.resolve([makePoolCard()])
    })

    const cards = await getStudyCards({
      scope: 'due',
      lessonFrom: null,
      lessonTo: null,
      sessionSize: 20,
    })

    // Sessions still load on a known-lemmas failure (non-fatal contract).
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
      (c) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(studyCardCall).toBeDefined()
    expect(studyCardCall![1]).toBe(rejectionReason)
  })

  it('still throws Error("Database error") when the pool query rejects (existing contract unchanged)', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockImplementation((args) => {
      if (isKnownLemmasArgs(args)) {
        return Promise.resolve([{ normalizedFront: '공부' }])
      }
      if (isLightPoolArgs(args)) {
        return Promise.reject(new Error('pool boom'))
      }
      // Phase B should never be reached when the Phase A pool query rejects.
      return Promise.resolve([makePoolCard()])
    })

    await expect(
      getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null, sessionSize: 20 })
    ).rejects.toThrow('Database error')
  })

  it('does not emit a [study-cards]-prefixed console.error on the happy path (both queries fulfill)', async () => {
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockImplementation((args) => {
      if (isKnownLemmasArgs(args)) {
        return Promise.resolve([{ normalizedFront: '공부' }])
      }
      if (isLightPoolArgs(args)) {
        return Promise.resolve([makeLightPoolCard()])
      }
      // Phase B full re-fetch (args.include, id: { in: [...] })
      return Promise.resolve([makePoolCard()])
    })

    const cards = await getStudyCards({
      scope: 'due',
      lessonFrom: null,
      lessonTo: null,
      sessionSize: 20,
    })

    expect(cards).toHaveLength(1)
    // No [study-cards]-prefixed console.error on the clean path.
    const studyCardCall = errorSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(studyCardCall).toBeUndefined()
  })
})
