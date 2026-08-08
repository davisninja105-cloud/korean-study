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
import type { GET as GetHandler, PUT as PutHandler } from '../app/api/cards/[id]/route'
import { normalizeFront } from '../lib/card-key'

let tmpDir: string
let dbUrl: string
let prisma: PrismaClient
let GET: typeof GetHandler
let PUT: typeof PutHandler
let cardId: string
let otherCardId: string
let otherSentenceId: string
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
  ;({ GET, PUT } = await import('../app/api/cards/[id]/route'))

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

  // Second card, seeded with its own sentence, exclusively for the
  // cross-card foreign-id PUT test (CARDS-01/IDOR-shaped threat_model check)
  // — never reused by any other test in this file.
  const otherCard = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '다른',
      back: 'other (cards-id-route cross-card fixture)',
      normalizedFront: `다른-cards-id-route-${Date.now()}`,
      sentences: {
        create: [
          {
            korean: '이것은 다른 카드예요',
            targetForm: '다른',
            translation: 'This is a different card',
            orderIndex: 0,
          },
        ],
      },
    },
    include: { sentences: true },
  })
  otherCardId = otherCard.id
  otherSentenceId = otherCard.sentences[0].id
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

// CR-01 fix regression coverage (31-07-PLAN.md Task 1 Step 4): direct PUT-
// route proof that sentences are upserted by id — a client-echoed existing
// id is updated in place (stable id), a missing id creates a fresh row, an
// id genuinely absent from the incoming array is deleted, and an empty
// array deletes everything. Each test creates its own isolated card (rather
// than reusing the shared `cardId` fixture) so PUT mutations in one test
// never leak into another regardless of run order — mirrors this file's
// existing dynamic-import/temp-SQLite-fixture pattern, just scoped per test.
function fakePutRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

describe('PUT /api/cards/[id]', () => {
  it('preserves a Sentence id across a save when the client echoes it back unchanged', async () => {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-preserve-${Date.now()}`,
        sentences: {
          create: [
            {
              korean: '저는 매일 학교에 가요',
              targetForm: '학교',
              translation: 'I go to school every day',
              orderIndex: 0,
            },
          ],
        },
      },
      include: { sentences: true },
    })
    const originalSentenceId = card.sentences[0].id

    // Only `sentences` in the payload — front/back are deliberately omitted
    // so the route's `normalizedFront` update path is never exercised here
    // (each test's card shares the literal front '학교' for readability;
    // touching normalizedFront would collide across these isolated test
    // cards' otherwise-unique `normalizedFront` seed values).
    const res = await PUT(
      fakePutRequest({
        sentences: [
          {
            id: originalSentenceId,
            korean: '저는 오늘도 학교에 가요',
            targetForm: '학교',
            translation: 'I go to school today too',
          },
        ],
      }),
      fakeParams(card.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sentences).toHaveLength(1)
    expect(body.sentences[0].id).toBe(originalSentenceId)
    expect(body.sentences[0].korean).toBe('저는 오늘도 학교에 가요')
    expect(body.sentences[0].translation).toBe('I go to school today too')
  })

  it('creates a new Sentence row with a fresh id for an entry with no id', async () => {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-create-${Date.now()}`,
        sentences: {
          create: [
            {
              korean: '저는 매일 학교에 가요',
              targetForm: '학교',
              translation: 'I go to school every day',
              orderIndex: 0,
            },
          ],
        },
      },
      include: { sentences: true },
    })
    const existingSentenceId = card.sentences[0].id

    const res = await PUT(
      fakePutRequest({
        sentences: [
          {
            id: existingSentenceId,
            korean: '저는 매일 학교에 가요',
            targetForm: '학교',
            translation: 'I go to school every day',
          },
          {
            korean: '학교가 정말 크네요',
            targetForm: '학교',
            translation: 'The school is really big',
          },
        ],
      }),
      fakeParams(card.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sentences).toHaveLength(2)
    const ids: string[] = body.sentences.map((s: { id: string }) => s.id)
    expect(ids).toContain(existingSentenceId)
    const newSentence = body.sentences.find((s: { id: string }) => s.id !== existingSentenceId)
    expect(newSentence).toBeTruthy()
    expect(newSentence.id).not.toBe(existingSentenceId)
    expect(newSentence.korean).toBe('학교가 정말 크네요')
  })

  it('deletes a Sentence row genuinely absent from the incoming array', async () => {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-delete-${Date.now()}`,
        sentences: {
          create: [
            { korean: '문장 하나', targetForm: '문장', translation: 'sentence one', orderIndex: 0 },
            { korean: '문장 둘', targetForm: '문장', translation: 'sentence two', orderIndex: 1 },
          ],
        },
      },
      include: { sentences: { orderBy: { orderIndex: 'asc' } } },
    })
    const [keepId, dropId] = card.sentences.map((s) => s.id)

    const res = await PUT(
      fakePutRequest({
        sentences: [
          { id: keepId, korean: '문장 하나', targetForm: '문장', translation: 'sentence one' },
        ],
      }),
      fakeParams(card.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sentences).toHaveLength(1)
    expect(body.sentences[0].id).toBe(keepId)

    const dropped = await prisma.sentence.findUnique({ where: { id: dropId } })
    expect(dropped).toBeNull()
  })

  it('accepts sentences: [] and deletes every existing sentence, returning 200 with an empty array', async () => {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-empty-${Date.now()}`,
        sentences: {
          create: [
            { korean: '문장 하나', targetForm: '문장', translation: 'sentence one', orderIndex: 0 },
          ],
        },
      },
    })

    const res = await PUT(
      fakePutRequest({ sentences: [] }),
      fakeParams(card.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.sentences)).toBe(true)
    expect(body.sentences).toHaveLength(0)

    const remaining = await prisma.sentence.findMany({ where: { cardId: card.id } })
    expect(remaining).toHaveLength(0)
  })

  it('never updates or deletes a foreign sentence id belonging to a different card (IDOR-shaped, T-31-12)', async () => {
    const card = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-foreign-${Date.now()}`,
        sentences: {
          create: [
            { korean: '원래 문장', targetForm: '문장', translation: 'original sentence', orderIndex: 0 },
          ],
        },
      },
    })

    const before = await prisma.sentence.findUnique({ where: { id: otherSentenceId } })
    expect(before?.cardId).toBe(otherCardId)
    expect(before?.korean).toBe('이것은 다른 카드예요')

    const res = await PUT(
      fakePutRequest({
        sentences: [
          {
            id: otherSentenceId,
            korean: 'hijack attempt',
            targetForm: '학교',
            translation: 'attempted cross-card overwrite',
          },
        ],
      }),
      fakeParams(card.id)
    )
    expect(res.status).toBe(200)
    const body = await res.json()

    // The foreign id falls through to the `create` branch — a harmless new
    // row on the TARGET card, never a mutation of the foreign row.
    expect(body.sentences).toHaveLength(1)
    expect(body.sentences[0].id).not.toBe(otherSentenceId)
    expect(body.sentences[0].cardId).toBe(card.id)

    // The other card's original sentence is completely untouched — not
    // updated, not deleted.
    const after = await prisma.sentence.findUnique({ where: { id: otherSentenceId } })
    expect(after).not.toBeNull()
    expect(after?.cardId).toBe(otherCardId)
    expect(after?.korean).toBe('이것은 다른 카드예요')
  })

  // WR-01 regression coverage (31-REVIEW-FIX.md): PUT previously fell
  // through to the generic 500 for a nonexistent card id (P2025 was only
  // mapped to 404 for GET/DELETE, not PUT).
  it('returns a clean 404 with a JSON error body for a nonexistent card id', async () => {
    const res = await PUT(
      fakePutRequest({ front: 'anything' }),
      fakeParams('nonexistent-card-id')
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  // WR-03 regression coverage (31-REVIEW-FIX.md): the PUT handler now uses
  // an INTERACTIVE `prisma.$transaction(async (tx) => {...})` (to close the
  // sentence-ownership TOCTOU race), which is exactly the shape the
  // documented Prisma 7 + @prisma/adapter-libsql quirk affects (a
  // UNIQUE-constraint violation inside an interactive transaction can
  // surface as a raw, unclassified DriverAdapterError instead of a
  // classified P2002 — see .planning/debug/reviewlog-p2002-catch-never-fires.md).
  // This test runs against the REAL local-SQLite libsql adapter (same
  // driver shape as production Turso), so it genuinely proves the
  // `isUniqueConstraintError` fallback keeps the friendly 400 working after
  // the transaction-form change, rather than asserting it by inspection only.
  it('returns a friendly 400 (not a 500) when a PUT front collides with another card\'s normalizedFront', async () => {
    // Two fresh, isolated cards (per this file's established PUT-test
    // pattern) — a collision TARGET whose normalizedFront is the real
    // normalizeFront() output for a distinctive front, and the card under
    // edit, which will be PUT to that exact same front.
    const collidingFront = `충돌-put-collision-${Date.now()}`
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: collidingFront,
        back: 'collision target (cards-id-route regression fixture)',
        normalizedFront: normalizeFront(collidingFront),
      },
    })
    const editCard = await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: '학교',
        back: 'school',
        normalizedFront: `학교-put-collision-${Date.now()}`,
      },
    })

    const res = await PUT(
      fakePutRequest({ front: collidingFront }),
      fakeParams(editCard.id)
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body.error).toMatch(/already exists/i)

    // The edited card's front must be unchanged — the whole interactive
    // transaction (including the sentence ops that would have run first)
    // rolled back.
    const unchanged = await prisma.card.findUniqueOrThrow({ where: { id: editCard.id } })
    expect(unchanged.front).toBe('학교')
  })
})
