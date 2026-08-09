// Phase 33 (VERS-01) real-DB integration coverage for the dataVersion
// counter: the sync-completion bump, the review-write bump, and the
// non-bump regression locks proving what must NOT move the counter.
//
// Setup/teardown skeleton copied verbatim from tests/review-route.test.ts:
// env-first-then-dynamic-import against a real temp SQLite file DB, applied
// with the real prisma/schema.prisma DDL via `prisma migrate diff
// --from-empty --to-schema` (CLAUDE.md's documented Turso-DDL technique,
// reused here purely for local temp-file schema application). Static
// imports of lib/prisma, lib/settings, lib/sync, or app/api/review/route are
// forbidden — ESM hoists static imports above the env assignment below, and
// the prisma singleton would bind to the wrong database (the same gotcha
// CLAUDE.md documents for scripts/local-resync.mts).
//
// Only the two NETWORK dependencies of runSync() are mocked
// (@/lib/google-docs, @/lib/extract-cards) — @/lib/prisma stays real so the
// temp SQLite DB is genuinely exercised, matching RESEARCH.md's Validation
// Architecture guidance and this repo's tests/review-route.test.ts /
// tests/study-cache.test.ts precedent.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { POST as PostHandler } from '../app/api/review/route'
import type { GET as GetVersionHandler } from '../app/api/version/route'

// vi.mock is hoisted above every import in this file by Vitest — the
// factories below reference only globals (Date.now/Math.random), never an
// outer-scope const, so hoisting is safe.
vi.mock('@/lib/google-docs', () => ({
  fetchGoogleDoc: vi.fn(async () => [
    {
      // Unique per invocation so its content hash is always new and
      // runSync() never takes the early "No new content since last sync"
      // return.
      text: `버전 테스트 레슨 ${Date.now()}-${Math.random()}`,
      emphasized: [],
    },
  ]),
}))

vi.mock('@/lib/extract-cards', () => ({
  extractCardsFromNotes: vi.fn(async () => [
    {
      type: 'vocabulary',
      front: `버전단어-${Date.now()}-${Math.random()}`,
      back: 'version test word',
      distractors: [],
      components: [],
      sentences: [
        {
          // targetForm is 2+ chars and appears exactly once — blank-safety
          // filter in normalizeExtractedCards keeps this sentence.
          korean: '저는 버전을 확인해요',
          targetForm: '버전을',
          translation: 'I check the version',
        },
      ],
    },
  ]),
}))

let tmpDir: string
let dbUrl: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getDataVersion: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bumpDataVersion: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let setSessionSize: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runSync: any
let POST: typeof PostHandler
let GET: typeof GetVersionHandler
let reviewableCardId: string
let cardWithoutReviewId: string
const previousDatabaseUrl = process.env.DATABASE_URL
const previousAuthToken = process.env.DATABASE_AUTH_TOKEN

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'version-route-test-'))
  const dbPath = join(tmpDir, 'test.db')
  dbUrl = `file:${dbPath}`

  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN

  const ddl = execSync(
    'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf8' },
  )
  const ddlClient = createClient({ url: dbUrl })
  await ddlClient.executeMultiple(ddl)
  ddlClient.close()

  // Dynamic imports AFTER the schema exists and DATABASE_URL is set.
  ;({ prisma } = await import('../lib/prisma'))
  ;({ getDataVersion, bumpDataVersion, setSessionSize } = await import('../lib/settings'))
  ;({ runSync } = await import('../lib/sync'))
  ;({ POST } = await import('../app/api/review/route'))
  ;({ GET } = await import('../app/api/version/route'))

  const reviewableCard = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '테스트',
      back: 'test (version-route reviewable fixture)',
      normalizedFront: `테스트-version-route-reviewable-${Date.now()}`,
    },
  })
  await prisma.cardReview.create({ data: { cardId: reviewableCard.id } })
  reviewableCardId = reviewableCard.id

  const cardWithoutReview = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '무리뷰',
      back: 'test (version-route no-review fixture)',
      normalizedFront: `무리뷰-version-route-no-review-${Date.now()}`,
    },
  })
  cardWithoutReviewId = cardWithoutReview.id
})

afterAll(async () => {
  await prisma.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  if (previousAuthToken === undefined) delete process.env.DATABASE_AUTH_TOKEN
  else process.env.DATABASE_AUTH_TOKEN = previousAuthToken
})

// The handler only ever calls `await req.json()` on its argument — build the
// minimal object it actually needs rather than a real NextRequest (matches
// tests/review-route.test.ts's fakeRequest()).
function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PostHandler>[0]
}

describe('dataVersion — write-side bumps (VERS-01)', () => {
  it('getDataVersion() on a DB where the key was never written returns "0"', async () => {
    const version = await getDataVersion()
    expect(version).toBe('0')
  })

  // Phase 34 (LOCAL-02): GET /api/version now additionally carries a
  // `buildId` field, sourced server-side from
  // VERCEL_GIT_COMMIT_SHA/VERCEL_DEPLOYMENT_ID/'local-dev' — used by
  // lib/local-cache.ts to namespace the client's IndexedDB database. This is
  // the actual route handler (not just getDataVersion()), confirming both
  // fields land in one response body and the existing `version` field's
  // value/format are unchanged (additive-only per 34-RESEARCH.md Pattern 2).
  it('GET /api/version returns both a version string and a buildId string', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.version).toBe('string')
    expect(typeof body.buildId).toBe('string')
    expect(body.buildId.length).toBeGreaterThan(0)
  })

  it('runSync() completing with one mocked new lesson changes getDataVersion()', async () => {
    const before = await getDataVersion()

    const result = await runSync('any-doc-id')
    expect(result.synced).toBe(true)
    expect(result.newLessons).toBe(1)

    const after = await getDataVersion()
    expect(after).not.toBe(before)
  })

  it('two consecutive bumpDataVersion() calls return different tokens, and getDataVersion() returns the second one', async () => {
    const tokenA = await bumpDataVersion()
    // nextDataVersionToken() is a plain String(Date.now()) with millisecond
    // resolution — a real 2ms wall-clock gap (rather than just an await
    // boundary, which can resolve within the same millisecond) guarantees
    // the two tokens differ, matching how two real-world bumps (seconds-to-
    // minutes apart in this single-user app) are never this close together.
    await new Promise((resolve) => setTimeout(resolve, 2))
    const tokenB = await bumpDataVersion()

    expect(tokenA).not.toBe(tokenB)
    expect(await getDataVersion()).toBe(tokenB)
  })

  it('a committed POST /api/review changes getDataVersion(); a byte-identical duplicate replay leaves it unchanged', async () => {
    const idempotencyKey = `version-route-review-key-${Date.now()}`
    const before = await getDataVersion()

    const firstRes = await POST(fakeRequest({ cardId: reviewableCardId, rating: 3, idempotencyKey }))
    expect(firstRes.status).toBe(200)

    const afterFirst = await getDataVersion()
    expect(afterFirst).not.toBe(before)

    // Duplicate replay: hits the idempotencyKey UNIQUE constraint, rolls
    // back the whole transaction (including the dataVersion upsert), and
    // returns 200 from the catch branch's read-back WITHOUT re-entering the
    // transaction body — the counter must not double-bump for this no-op.
    const secondRes = await POST(fakeRequest({ cardId: reviewableCardId, rating: 3, idempotencyKey }))
    expect(secondRes.status).toBe(200)

    const afterSecond = await getDataVersion()
    expect(afterSecond).toBe(afterFirst)
  })

  it('a POST /api/review for a cardId with no CardReview row returns 404 and leaves getDataVersion() unchanged', async () => {
    const before = await getDataVersion()

    const res = await POST(
      fakeRequest({ cardId: cardWithoutReviewId, rating: 3, idempotencyKey: `version-route-404-${Date.now()}` }),
    )
    expect(res.status).toBe(404)

    const after = await getDataVersion()
    expect(after).toBe(before)
  })
})

describe('dataVersion — non-bump regression guards (LOCKED)', () => {
  // Each lock below carries this same warning: a change to its assertion
  // means VERS-01's trigger scope was reopened, not that a bug was fixed.

  it('LOCKED: setSessionSize(25), an unrelated Setting-table write, leaves getDataVersion() unchanged', async () => {
    const before = await getDataVersion()

    await setSessionSize(25)

    const after = await getDataVersion()
    expect(after).toBe(before)
  })

  it('LOCKED: creating a Card row directly leaves getDataVersion() unchanged', async () => {
    const before = await getDataVersion()

    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '직접생성',
        back: 'test (version-route direct-create regression fixture)',
        normalizedFront: `직접생성-version-route-regression-${Date.now()}`,
      },
    })

    const after = await getDataVersion()
    expect(after).toBe(before)
  })
})
