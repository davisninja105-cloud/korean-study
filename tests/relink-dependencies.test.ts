// Persisted RED→GREEN regression guard for RELIABILITY-02/03: the full-deck
// auto-relink pass that runs inside runSync after a clean sync with new
// lessons, proven idempotent against the real schema with the real
// @@unique([cardId, prerequisiteId]) index present.
//
// Seeds a temp SQLite file DB with the real prisma/schema.prisma DDL (so the
// @@unique index genuinely fires), then invokes relinkAllDependencies() twice
// and asserts the double-run idempotency contract: the first run creates the
// forward-reference edge, the second run creates nothing.
//
// Environment ordering is critical: lib/prisma.ts reads process.env.DATABASE_URL
// at module-evaluation time and caches a singleton, and ESM static imports are
// hoisted — so DATABASE_URL must be set BEFORE @/lib/prisma or
// @/lib/relink-dependencies is imported. Following the same pattern documented
// in CLAUDE.md for scripts/local-resync.mts and tests/review-route.test.ts,
// env is set first and both modules are dynamic-imported inside beforeAll.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PrismaClient } from '../app/generated/prisma/client'
import type { relinkAllDependencies as RelinkFn, RelinkResult } from '../lib/relink-dependencies'

let tmpDir: string
let dbUrl: string
let prisma: PrismaClient
let relinkAllDependencies: typeof RelinkFn
let cardAId: string
let cardBId: string
const previousDatabaseUrl = process.env.DATABASE_URL
const previousAuthToken = process.env.DATABASE_AUTH_TOKEN

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'relink-dependencies-test-'))
  const dbPath = join(tmpDir, 'test.db')
  dbUrl = `file:${dbPath}`

  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN

  // Generate the real schema's DDL (same technique CLAUDE.md documents for
  // Turso schema changes: --to-schema, not --to-schema-datamodel) and apply
  // it to the temp file so the CardDependency @@unique([cardId, prerequisiteId])
  // index genuinely exists — without it the double-run idempotency proof would
  // pass vacuously (a duplicate insert would succeed instead of throwing).
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
  ;({ relinkAllDependencies } = await import('../lib/relink-dependencies'))

  // Seed the forward-reference shape: card A's components name card B's front,
  // but card B has no components of its own (a leaf prerequisite). Zero
  // CardDependency rows exist before the first relink — exactly the gap the
  // per-lesson pass misses (A was synced first, B created later).
  const cardA = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '도서관',
      back: 'library',
      normalizedFront: '도서관',
      components: JSON.stringify(['책']), // names card B's front
    },
  })
  const cardB = await prisma.card.create({
    data: {
      type: 'vocabulary',
      front: '책',
      back: 'book',
      normalizedFront: '책',
      components: null, // leaf — no components of its own
    },
  })
  cardAId = cardA.id
  cardBId = cardB.id
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  if (previousAuthToken === undefined) delete process.env.DATABASE_AUTH_TOKEN
  else process.env.DATABASE_AUTH_TOKEN = previousAuthToken
})

describe('relinkAllDependencies — full-deck relink idempotency (RELIABILITY-02/03)', () => {
  it('first run resolves the forward-reference edge and returns the expected counts', async () => {
    const result: RelinkResult = await relinkAllDependencies()

    expect(result.cardsScanned).toBe(2)
    expect(result.edgesCreated).toBe(1)
    expect(result.totalEdges).toBe(1)

    // Exactly one CardDependency row exists, connecting A → B.
    const edges = await prisma.cardDependency.findMany()
    expect(edges).toHaveLength(1)
    expect(edges[0].cardId).toBe(cardAId)
    expect(edges[0].prerequisiteId).toBe(cardBId)
  })

  it('second consecutive run creates zero edges — RELIABILITY-03 double-run proof against the real @@unique index', async () => {
    const result: RelinkResult = await relinkAllDependencies()

    expect(result.edgesCreated).toBe(0)
    expect(result.cardsScanned).toBe(2)
    // totalEdges still counts the existing edge from the first run.
    expect(result.totalEdges).toBe(1)

    // The row count is unchanged — no duplicate (cardId, prerequisiteId) pair.
    const count = await prisma.cardDependency.count()
    expect(count).toBe(1)
  })

  it('never creates Card/Sentence/Lesson rows and never deletes edges — only inserts missing CardDependency rows', async () => {
    // After two runs, the deck still has exactly the two seeded cards.
    const cardCount = await prisma.card.count()
    expect(cardCount).toBe(2)

    // No sentences or lessons were created.
    const sentenceCount = await prisma.sentence.count()
    expect(sentenceCount).toBe(0)
    const lessonCount = await prisma.lesson.count()
    expect(lessonCount).toBe(0)

    // The edge from the first run is still present (not deleted).
    const edgeCount = await prisma.cardDependency.count()
    expect(edgeCount).toBe(1)
  })
})
