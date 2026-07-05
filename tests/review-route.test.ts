// Persisted RED→GREEN regression guard for HIST-02's duplicate-replay path.
//
// Invokes the REAL, unmodified POST handler from app/api/review/route.ts
// twice with a byte-identical body against a freshly-seeded local SQLite
// file DB (the actual ReviewLog.idempotencyKey UNIQUE index is applied via
// the real prisma/schema.prisma DDL, so the collision genuinely fires).
//
// Pre-fix (before 17-05's isUniqueConstraintError extension), the second
// invocation returns 500 — this is exactly the gap 17-VERIFICATION.md found
// by hand (the classified-P2002 shape whose meta.target is undefined). This
// test closes the "only ever caught by hand" pattern that regressed this
// requirement twice (UAT Test 6, then the retroactive verification).
//
// Environment ordering is critical: lib/prisma.ts reads
// process.env.DATABASE_URL at module-evaluation time and caches a singleton,
// and ESM static imports are hoisted — so DATABASE_URL must be set BEFORE
// the route or prisma module is imported. Following the same pattern
// documented in CLAUDE.md for scripts/local-resync.mts, env is set first and
// `@/lib/prisma` + `@/app/api/review/route` are dynamic-imported inside
// beforeAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PrismaClient } from '../app/generated/prisma/client'
import type { POST as PostHandler } from '../app/api/review/route'

let tmpDir: string
let dbUrl: string
let prisma: PrismaClient
let POST: typeof PostHandler
let cardId: string
const previousDatabaseUrl = process.env.DATABASE_URL
const previousAuthToken = process.env.DATABASE_AUTH_TOKEN

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'review-route-test-'))
  const dbPath = join(tmpDir, 'test.db')
  dbUrl = `file:${dbPath}`

  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN

  // Generate the real schema's DDL (same technique CLAUDE.md documents for
  // Turso schema changes: --to-schema, not --to-schema-datamodel) and apply
  // it to the temp file so the ReviewLog.idempotencyKey UNIQUE index
  // genuinely exists — without it the collision never fires and this test
  // would pass vacuously.
  const ddl = execSync(
    'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf8' },
  )
  const ddlClient = createClient({ url: dbUrl })
  await ddlClient.executeMultiple(ddl)
  ddlClient.close()

  // Set up AFTER the schema exists, so the singleton's adapter connects to a
  // DB that already has the tables/indexes it needs.
  ;({ prisma } = await import('../lib/prisma'))
  ;({ POST } = await import('../app/api/review/route'))

  const card = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '테스트',
      back: 'test (review-route regression fixture)',
      normalizedFront: `테스트-review-route-regression-${Date.now()}`,
    },
  })
  await prisma.cardReview.create({ data: { cardId: card.id } })
  cardId = card.id
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
// minimal object it actually needs rather than a real NextRequest.
function fakeRequest(body: unknown) {
  return { json: async () => body } as unknown as Parameters<typeof PostHandler>[0]
}

describe('POST /api/review — idempotent duplicate replay (HIST-02)', () => {
  it('returns 200 for both the first and a byte-identical duplicate request, applying FSRS state exactly once', async () => {
    const idempotencyKey = 'review-route-regression-fixed-key'

    const firstRes = await POST(fakeRequest({ cardId, rating: 3, idempotencyKey }))
    expect(firstRes.status).toBe(200)
    const firstBody = await firstRes.json()

    // This is the regression: pre-fix, the second invocation returns 500
    // instead of the idempotent 200 the route's own catch branch already
    // intends to produce.
    const secondRes = await POST(fakeRequest({ cardId, rating: 3, idempotencyKey }))
    expect(secondRes.status).toBe(200)
    const secondBody = await secondRes.json()

    const logCount = await prisma.reviewLog.count({ where: { idempotencyKey } })
    expect(logCount).toBe(1)

    // No double-applied FSRS state across the two idempotent responses.
    expect(secondBody.reps).toBe(firstBody.reps)
    expect(secondBody.state).toBe(firstBody.state)
    expect(secondBody.stability).toBe(firstBody.stability)
    expect(secondBody.nextReview).toBe(firstBody.nextReview)
  })
})
