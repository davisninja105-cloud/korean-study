// Regression + behavior coverage for lib/study-cache.ts (Phase 32, STUDY-03).
//
// Two describe blocks:
//   1. Pure hit/miss/stamp/partial-failure cases against a MOCKED prisma
//      singleton (vi.mock('@/lib/prisma', ...), following the args-shape
//      disambiguation convention already established in tests/study-cards.test.ts).
//   2. A cross-process invalidation proof against a REAL temp SQLite database
//      (mirroring tests/relink-dependencies.test.ts's harness) — a mocked
//      Prisma cannot prove that a change written by a separate `tsx` process
//      (scripts/local-resync.mts / scripts/relink-dependencies.mts) is visible
//      to the next /study load in an already-running server process.
//
// Mock disambiguation (block 1): the mock factory below stubs
// cardDependency.findMany, card.findMany, lesson.findMany, and
// setting.findUnique/setting.upsert as vi.fn()s. refreshStudyCache() calls
// exactly one of each of the first three per invocation (no args-shape
// disambiguation needed within this file, unlike tests/study-cards.test.ts's
// three-call-shape card.findMany situation) plus getSessionSize() (which
// itself calls setting.findUnique — mocked directly here rather than via
// lib/settings.ts, since getSessionSize() is a thin wrapper).

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'

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

describe('study-cache — cross-process invalidation proof (real temp SQLite DB)', () => {
  // Following tests/relink-dependencies.test.ts's harness structure verbatim:
  // env-first-then-dynamic-import against a real temp file: DB, applied with
  // the real prisma/schema.prisma DDL. Static imports of lib/prisma,
  // lib/study-cache, lib/settings, or lib/relink-dependencies are forbidden
  // here — ESM hoists static imports above the env assignment below, and the
  // prisma singleton would bind to the wrong database (the same gotcha
  // CLAUDE.md documents for scripts/local-resync.mts).
  let tmpDir: string
  let dbUrl: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma2: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refreshStudyCache2: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let getStudyCache2: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let resetStudyCacheForTests2: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bumpStudyCacheVersion2: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let relinkAllDependencies2: any
  const previousDatabaseUrl = process.env.DATABASE_URL
  const previousAuthToken = process.env.DATABASE_AUTH_TOKEN

  beforeAll(async () => {
    const { execSync } = await import('child_process')
    const { createClient } = await import('@libsql/client')
    const { mkdtempSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    tmpDir = mkdtempSync(join(tmpdir(), 'study-cache-test-'))
    const dbPath = join(tmpDir, 'test.db')
    dbUrl = `file:${dbPath}`

    process.env.DATABASE_URL = dbUrl
    delete process.env.DATABASE_AUTH_TOKEN

    const ddl = execSync(
      'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
      { encoding: 'utf8' }
    )
    const ddlClient = createClient({ url: dbUrl })
    await ddlClient.executeMultiple(ddl)
    ddlClient.close()

    // The top-of-file vi.mock('@/lib/prisma', ...) is HOISTED above every
    // import in this file (Vitest's standard hoisting behavior), so it would
    // otherwise intercept these dynamic import() calls too (the '@/' alias
    // and the relative '../lib/prisma' specifier resolve to the same
    // underlying module id). vi.unmock() is ALSO hoisted (Vitest warns about
    // this) — calling it here would retroactively cancel the mock for the
    // FIRST describe block too, since hoisting moves both calls to the top
    // of the file in textual order and the mock would never take effect at
    // all. vi.doUnmock() is the non-hoisted counterpart: it takes effect
    // exactly where it's called (at runtime, after the first describe
    // block's tests have already run against the real mock), so combined
    // with vi.resetModules() it makes ONLY the dynamic imports below (and
    // everything they transitively import — lib/study-cache, lib/settings,
    // lib/relink-dependencies) load the REAL lib/prisma against the real
    // temp DATABASE_URL set above.
    vi.doUnmock('@/lib/prisma')
    vi.resetModules()

    // Dynamic imports AFTER the schema exists and DATABASE_URL is set — at
    // least 4 dynamic imports of ../lib/* modules, no static value imports of
    // them anywhere in this describe block.
    ;({ prisma: prisma2 } = await import('../lib/prisma'))
    ;({
      refreshStudyCache: refreshStudyCache2,
      getStudyCache: getStudyCache2,
      resetStudyCacheForTests: resetStudyCacheForTests2,
    } = await import('../lib/study-cache'))
    ;({ bumpStudyCacheVersion: bumpStudyCacheVersion2 } = await import('../lib/settings'))
    ;({ relinkAllDependencies: relinkAllDependencies2 } = await import('../lib/relink-dependencies'))
  })

  afterAll(async () => {
    const { rmSync } = await import('fs')
    await prisma2?.$disconnect()
    rmSync(tmpDir, { recursive: true, force: true })
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
    if (previousAuthToken === undefined) delete process.env.DATABASE_AUTH_TOKEN
    else process.env.DATABASE_AUTH_TOKEN = previousAuthToken
  })

  beforeEach(() => {
    resetStudyCacheForTests2()
  })

  it('two consecutive bumpStudyCacheVersion() calls produce different stored values; reading Setting returns the second one', async () => {
    const tokenA = await bumpStudyCacheVersion2()
    const tokenB = await bumpStudyCacheVersion2()

    expect(tokenA).not.toBe(tokenB)

    const row = await prisma2.setting.findUnique({ where: { key: 'studyCacheVersion' } })
    expect(row?.value).toBe(tokenB)
  })

  it('STUDY-03 / success-criterion #3 proof: an edge created by relinkAllDependencies() from a "separate process" perspective is visible via the Setting-table version token, and the next refreshStudyCache() picks it up with no server restart', async () => {
    // Seed two cards where one names the other in `components` — a
    // forward-reference the per-lesson linker misses, exactly what
    // relinkAllDependencies() exists to catch.
    const cardA = await prisma2.card.create({
      data: {
        type: 'vocabulary',
        front: '도서관',
        back: 'library',
        normalizedFront: '도서관',
        components: JSON.stringify(['책']),
      },
    })
    const cardB = await prisma2.card.create({
      data: {
        type: 'vocabulary',
        front: '책',
        back: 'book',
        normalizedFront: '책',
        components: null,
      },
    })

    const tokenA = await bumpStudyCacheVersion2()

    const before = await refreshStudyCache2(tokenA)
    expect(before.edges).toEqual([])

    // relinkAllDependencies() is the only function all three real mutating
    // writers (the /api/sync route via runSync(), scripts/local-resync.mts,
    // scripts/relink-dependencies.mts) call unconditionally — this is the
    // Setting-table channel a SEPARATE `tsx` process shares with the running
    // server (a globalThis-only cache would be invisible to it).
    await relinkAllDependencies2()

    const versionRow = await prisma2.setting.findUnique({
      where: { key: 'studyCacheVersion' },
    })
    const tokenAfterRelink = versionRow?.value as string
    expect(tokenAfterRelink).toBeDefined()
    expect(tokenAfterRelink).not.toBe(tokenA)

    // Re-fetching with the new token reflects the newly linked edge — proving
    // a freshly linked edge is visible to the next load with no process
    // restart and no redeploy (STUDY-03, success criterion #3).
    const after = await refreshStudyCache2(tokenAfterRelink)
    expect(after.version).toBe(tokenAfterRelink)
    expect(after.edges).toEqual([{ cardId: cardA.id, prerequisiteId: cardB.id }])
    expect(getStudyCache2()).toBe(after)
  })

  it('D-02 (locked): writing a CardReview row with state 1 directly does NOT change the stored studyCacheVersion token — known-lemmas staleness invalidates on sync/relink only, never on a review write', async () => {
    const card = await prisma2.card.create({
      data: {
        type: 'vocabulary',
        front: '먹다',
        back: 'to eat',
        normalizedFront: '먹다',
      },
    })

    const tokenBefore = await bumpStudyCacheVersion2()

    // Simulates what POST /api/review does to CardReview — deliberately NOT
    // calling bumpStudyCacheVersion() here, because the whole point of this
    // assertion is that review writes must NOT invalidate this cache (D-02).
    // A change to this assertion means D-02 was reopened, not that a bug was
    // fixed.
    await prisma2.cardReview.create({
      data: {
        cardId: card.id,
        state: 1,
        nextReview: new Date(),
      },
    })

    const row = await prisma2.setting.findUnique({ where: { key: 'studyCacheVersion' } })
    expect(row?.value).toBe(tokenBefore)
  })
})
