// Regression + behavior coverage for lib/study-cache.ts (Phase 32, STUDY-03).
//
// Pure hit/miss/stamp/partial-failure cases against a MOCKED prisma singleton
// (vi.mock('@/lib/prisma', ...), following the args-shape disambiguation
// convention already established in tests/study-cards.test.ts). A
// cross-process invalidation proof against a REAL temp SQLite database is
// added in a second describe block once lib/relink-dependencies.ts's
// unconditional bump exists (see the file-level comment there).
//
// Mock disambiguation: the mock factory below stubs cardDependency.findMany,
// card.findMany, lesson.findMany, and setting.findUnique/setting.upsert as
// vi.fn()s. refreshStudyCache() calls exactly one of each of the first three
// per invocation (no args-shape disambiguation needed within this file,
// unlike tests/study-cards.test.ts's three-call-shape card.findMany
// situation) plus getSessionSize() (which itself calls setting.findUnique —
// mocked directly here rather than via lib/settings.ts, since
// getSessionSize() is a thin wrapper).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cardDependency: { findMany: vi.fn() },
    card: { findMany: vi.fn() },
    lesson: { findMany: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getStudyCache,
  refreshStudyCache,
  resetStudyCacheForTests,
} from '@/lib/study-cache'

function mockAllFulfilled() {
  ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { cardId: 'c1', prerequisiteId: 'c0' },
  ])
  ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { normalizedFront: '공부' },
  ])
  ;(prisma.setting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    key: 'sessionSize',
    value: '25',
  })
  ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' },
  ])
}

describe('study-cache — pure hit/miss/stamp/partial-failure (mocked prisma)', () => {
  beforeEach(() => {
    resetStudyCacheForTests()
    ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockReset()
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockReset()
    ;(prisma.setting.findUnique as ReturnType<typeof vi.fn>).mockReset()
    ;(prisma.setting.upsert as ReturnType<typeof vi.fn>).mockReset()
    ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cache empty: getStudyCache() returns undefined', () => {
    expect(getStudyCache()).toBeUndefined()
  })

  it('refreshStudyCache("v1") with all four reads resolving stores a snapshot stamped "v1", and getStudyCache() returns it by reference', async () => {
    mockAllFulfilled()

    const snapshot = await refreshStudyCache('v1')

    expect(snapshot.version).toBe('v1')
    expect(snapshot.edges).toEqual([{ cardId: 'c1', prerequisiteId: 'c0' }])
    expect(snapshot.lemmas).toEqual(new Set(['공부']))
    expect(snapshot.sessionSize).toBe(25)
    expect(snapshot.lessons).toEqual([{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }])

    expect(getStudyCache()).toBe(snapshot)
  })

  it('refreshStudyCache("v2") called while a "v1" snapshot is stored replaces the whole object; the previously returned "v1" object is not mutated', async () => {
    mockAllFulfilled()
    const v1 = await refreshStudyCache('v1')
    const v1EdgesRef = v1.edges
    const v1LemmasRef = v1.lemmas

    ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { cardId: 'c2', prerequisiteId: 'c1' },
    ])
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { normalizedFront: '학교' },
    ])
    ;(prisma.setting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      key: 'sessionSize',
      value: '30',
    })
    ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'lesson-2', orderIndex: 2, title: 'Lesson 2' },
    ])

    const v2 = await refreshStudyCache('v2')

    expect(v2.version).toBe('v2')
    expect(v2).not.toBe(v1)
    expect(getStudyCache()).toBe(v2)

    // The old object's fields still hold the old values — not mutated in place.
    expect(v1.version).toBe('v1')
    expect(v1.edges).toBe(v1EdgesRef)
    expect(v1.edges).toEqual([{ cardId: 'c1', prerequisiteId: 'c0' }])
    expect(v1.lemmas).toBe(v1LemmasRef)
    expect(v1.lemmas).toEqual(new Set(['공부']))
  })

  it('refreshStudyCache("v3") where the edges read rejects returns edges: [] AND leaves getStudyCache() returning the previously stored snapshot', async () => {
    mockAllFulfilled()
    const v1 = await refreshStudyCache('v1')

    ;(prisma.cardDependency.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('edges boom')
    )

    const degraded = await refreshStudyCache('v3')

    expect(degraded.edges).toEqual([])
    // The degraded result is never stored — the previous v1 snapshot survives.
    expect(getStudyCache()).toBe(v1)
    expect(getStudyCache()?.version).toBe('v1')
  })

  it('refreshStudyCache where the lemmas read rejects returns lemmas: an empty Set and leaves the previously stored snapshot untouched, with the RELIABILITY-01 log preserved', async () => {
    resetStudyCacheForTests()
    mockAllFulfilled()
    const rejectionReason = new Error('lemmas boom')
    ;(prisma.card.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(rejectionReason)

    const degraded = await refreshStudyCache('v-lemmas-fail')

    expect(degraded.lemmas).toEqual(new Set())
    expect(getStudyCache()).toBeUndefined()

    const errorSpy = console.error as unknown as ReturnType<typeof vi.fn>
    const call = errorSpy.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(call).toBeDefined()
    expect(call![1]).toBe(rejectionReason)
  })

  it('refreshStudyCache where the sessionSize read rejects falls back to DEFAULT_SESSION_SIZE and leaves the previously stored snapshot untouched', async () => {
    resetStudyCacheForTests()
    mockAllFulfilled()
    ;(prisma.setting.findUnique as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('sessionSize boom')
    )

    const degraded = await refreshStudyCache('v-size-fail')

    expect(degraded.sessionSize).toBe(20) // DEFAULT_SESSION_SIZE
    expect(getStudyCache()).toBeUndefined()
  })

  it('refreshStudyCache where the lessons read rejects returns lessons: [] and leaves the previously stored snapshot untouched', async () => {
    resetStudyCacheForTests()
    mockAllFulfilled()
    ;(prisma.lesson.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('lessons boom')
    )

    const degraded = await refreshStudyCache('v-lessons-fail')

    expect(degraded.lessons).toEqual([])
    expect(getStudyCache()).toBeUndefined()
  })
})
