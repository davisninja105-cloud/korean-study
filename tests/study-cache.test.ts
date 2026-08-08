// Regression + behavior coverage for lib/study-cache.ts (Phase 32, STUDY-03;
// mock shape revised Phase 32-04 Task 1 — see below).
//
// Two describe blocks:
//   1. Pure hit/miss/stamp/failure cases against a MOCKED prisma singleton
//      (vi.mock('@/lib/prisma', ...)).
//   2. A cross-process invalidation proof against a REAL temp SQLite database
//      (mirroring tests/relink-dependencies.test.ts's harness) — a mocked
//      Prisma cannot prove that a change written by a separate `tsx` process
//      (scripts/local-resync.mts / scripts/relink-dependencies.mts) is visible
//      to the next /study load in an already-running server process.
//
// Mock shape (block 1): refreshStudyCache() now issues ONE prisma.$queryRaw
// call folding edges/lemmas/sessionSize/lessons into correlated
// json_group_array/json_object subqueries (Phase 32-04 Task 1 — see
// lib/study-cache.ts's REFILL SHAPE header comment for why the original
// four-separate-Prisma-call shape was replaced: it measured 4 physical round
// trips against a real DB, pushing a cold getStudyCards() call to 6 total,
// double STUDY-01's "at most 3" budget). The mock factory below stubs only
// $queryRaw; there is no longer a separate cardDependency/card/lesson/setting
// call to mock. One consequence of one physical round trip replacing four:
// a read failure is now necessarily WHOLE-QUERY (all four fields degrade
// together), not per-field — see the single combined failure test below,
// which replaces the four separate per-field-failure tests this block used
// to carry.

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}))

import { prisma } from '@/lib/prisma'
import {
  getStudyCache,
  refreshStudyCache,
  resetStudyCacheForTests,
} from '@/lib/study-cache'

// Builds the single combined-invariants row refreshStudyCache()'s raw query
// returns — see lib/study-cache.ts's InvariantsRow interface.
function invariantsRow(overrides: {
  edges?: { cardId: string; prerequisiteId: string }[]
  lemmas?: string[]
  sessionSizeValue?: string | null
  lessons?: { id: string; orderIndex: number; title: string }[]
} = {}) {
  return [
    {
      edgesJson: JSON.stringify(overrides.edges ?? [{ cardId: 'c1', prerequisiteId: 'c0' }]),
      lemmasJson: JSON.stringify(overrides.lemmas ?? ['공부']),
      sessionSizeValue: overrides.sessionSizeValue !== undefined ? overrides.sessionSizeValue : '25',
      lessonsJson: JSON.stringify(
        overrides.lessons ?? [{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }]
      ),
    },
  ]
}

describe('study-cache — pure hit/miss/stamp/failure (mocked prisma)', () => {
  beforeEach(() => {
    resetStudyCacheForTests()
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cache empty: getStudyCache() returns undefined', () => {
    expect(getStudyCache()).toBeUndefined()
  })

  it('refreshStudyCache("v1") with the combined query resolving stores a snapshot stamped "v1", and getStudyCache() returns it by reference', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(invariantsRow())

    const snapshot = await refreshStudyCache('v1')

    expect(snapshot.version).toBe('v1')
    expect(snapshot.edges).toEqual([{ cardId: 'c1', prerequisiteId: 'c0' }])
    expect(snapshot.lemmas).toEqual(new Set(['공부']))
    expect(snapshot.sessionSize).toBe(25)
    expect(snapshot.lessons).toEqual([{ id: 'lesson-1', orderIndex: 1, title: 'Lesson 1' }])

    expect(getStudyCache()).toBe(snapshot)
  })

  it('refreshStudyCache("v2") called while a "v1" snapshot is stored replaces the whole object; the previously returned "v1" object is not mutated', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(invariantsRow())
    const v1 = await refreshStudyCache('v1')
    const v1EdgesRef = v1.edges
    const v1LemmasRef = v1.lemmas

    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(
      invariantsRow({
        edges: [{ cardId: 'c2', prerequisiteId: 'c1' }],
        lemmas: ['학교'],
        sessionSizeValue: '30',
        lessons: [{ id: 'lesson-2', orderIndex: 2, title: 'Lesson 2' }],
      })
    )

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

  it('refreshStudyCache("v-empty") with an empty deck (json_group_array over zero rows) returns edges: [] / lemmas: empty Set / lessons: [] — never null/throw', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(
      invariantsRow({ edges: [], lemmas: [], sessionSizeValue: null, lessons: [] })
    )

    const snapshot = await refreshStudyCache('v-empty')

    expect(snapshot.edges).toEqual([])
    expect(snapshot.lemmas).toEqual(new Set())
    expect(snapshot.sessionSize).toBe(20) // DEFAULT_SESSION_SIZE — no Setting row yet
    expect(snapshot.lessons).toEqual([])
  })

  it('refreshStudyCache where the combined query rejects degrades ALL FOUR fields together, leaves the previously stored snapshot untouched, and preserves the RELIABILITY-01 [study-cards] log', async () => {
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue(invariantsRow())
    const v1 = await refreshStudyCache('v1')

    const rejectionReason = new Error('invariants query boom')
    ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(rejectionReason)

    const degraded = await refreshStudyCache('v-fail')

    expect(degraded.edges).toEqual([])
    expect(degraded.lemmas).toEqual(new Set())
    expect(degraded.sessionSize).toBe(20) // DEFAULT_SESSION_SIZE
    expect(degraded.lessons).toEqual([])
    // The degraded result is never stored — the previous v1 snapshot survives.
    expect(getStudyCache()).toBe(v1)
    expect(getStudyCache()?.version).toBe('v1')

    const errorSpy = console.error as unknown as ReturnType<typeof vi.fn>
    const call = errorSpy.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && c[0].startsWith('[study-cards]')
    )
    expect(call).toBeDefined()
    expect(call![1]).toBe(rejectionReason)
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
