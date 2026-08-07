// Route-level test for GET /api/cards/[id] (31-03-PLAN.md Task 3).
//
// Invokes the REAL, unmodified GET handler from app/api/cards/[id]/route.ts
// against a freshly-seeded local SQLite file DB (real schema DDL applied via
// prisma migrate diff, same technique as tests/review-route.test.ts) — so
// the include shape (review/lesson/sentences) and date-serialization
// contract are genuinely exercised, not mocked.
//
// Environment ordering is critical: lib/prisma.ts reads
// process.env.DATABASE_URL at module-evaluation time and caches a singleton,
// and ESM static imports are hoisted — so DATABASE_URL must be set BEFORE
// the route or prisma module is imported. Following the same pattern
// documented in CLAUDE.md for scripts/local-resync.mts, env is set first and
// `@/lib/prisma` + `@/app/api/cards/[id]/route` are dynamic-imported inside
// beforeAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { NextRequest } from 'next/server'
import type { PrismaClient } from '../app/generated/prisma/client'
import type { GET as GetHandler } from '../app/api/cards/[id]/route'

let tmpDir: string
let dbUrl: string
let prisma: PrismaClient
let GET: typeof GetHandler
let cardId: string
const previousDatabaseUrl = process.env.DATABASE_URL
const previousAuthToken = process.env.DATABASE_AUTH_TOKEN

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cards-id-route-test-'))
  const dbPath = join(tmpDir, 'test.db')
  dbUrl = `file:${dbPath}`

  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN

  // Generate the real schema's DDL (same technique CLAUDE.md documents for
  // Turso schema changes: --to-schema, not --to-schema-datamodel) and apply
  // it to the temp file so the real Sentence/CardReview/Lesson tables exist.
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
  ;({ GET } = await import('../app/api/cards/[id]/route'))

  const card = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '테스트',
      back: 'test (cards-id-route regression fixture)',
      normalizedFront: `테스트-cards-id-route-${Date.now()}`,
      sentences: {
        create: [
          {
            korean: '저는 매일 학교에 가요',
            targetForm: '가요',
            translation: 'I go to school every day',
            orderIndex: 0,
          },
        ],
      },
    },
  })
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

function fakeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/cards/[id]', () => {
  it('returns 200 with the full CardDTO including real sentences for an existing card', async () => {
    const res = await GET({} as NextRequest, fakeParams(cardId))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(cardId)
    expect(Array.isArray(body.sentences)).toBe(true)
    expect(body.sentences).toHaveLength(1)
    expect(body.sentences[0].korean).toBe('저는 매일 학교에 가요')
    expect(body.sentences[0].translation).toBe('I go to school every day')
  })

  it('returns a clean 404 with a JSON error body for a nonexistent card id', async () => {
    const res = await GET({} as NextRequest, fakeParams('nonexistent-card-id'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })
})
