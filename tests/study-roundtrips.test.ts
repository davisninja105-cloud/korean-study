// tests/study-roundtrips.test.ts — the committed proof of STUDY-01.
//
// ROUND-TRIP DEFINITION (single source of truth: lib/query-counter.ts's
// header comment): one physical libSQL HTTP request, counted at the
// `@libsql/client` boundary (execute()/batch()/transaction()) — BELOW
// `@prisma/adapter-libsql`, not at Prisma's own logical-query layer. Counting
// there, rather than at Prisma's `$on('query')` event, gives the ground-truth
// physical cost regardless of how many logical Prisma operations a given
// call folds into (or splits out of). This file also reads Prisma's own
// `$on('query')` event count on the same run and asserts the two agree —
// research Assumption A4 flagged that they might not, for this exact
// driver-adapter/version combination; the cross-check below is where that
// gets resolved for this project rather than assumed (see 32-BASELINE.md's
// "Physical count vs. Prisma event count agreement" section for the prior
// finding this test locks as a regression).
//
// D-01's WARM/COLD SPLIT IS DELIBERATE, NOT A LOOSENED ASSERTION: STUDY-01's
// ≤2-round-trip steady-state claim only holds once `lib/study-cache.ts`'s
// invariants snapshot is warm. A cold instance (no snapshot yet) or a
// snapshot invalidated by `bumpStudyCacheVersion()` (the sync/relink signal)
// must refill once — costing up to 3 physical requests, not 2 — and the VERY
// NEXT call must be back down to 2. Asserting one unconditional ≤2 across
// both cases would either be flaky (failing on every cold start) or
// dishonest (silently relaxed to ≤3 everywhere, hiding the real steady-state
// win). Both numbers are asserted explicitly below, and both are recorded in
// 32-BASELINE.md's `## After` section — never the warm number alone.
//
// HARNESS: copies tests/relink-dependencies.test.ts's structure exactly — a
// real temp SQLite file DB, seeded with the real prisma/schema.prisma DDL
// (via `prisma migrate diff --from-empty`), because a mocked Prisma client
// cannot count physical libSQL round trips; there is no physical round trip
// to count. `DATABASE_URL` and `STUDY_QUERY_COUNTER` are set BEFORE any of
// ../lib/prisma, ../lib/study-cards, ../lib/study-cache, ../lib/settings,
// ../lib/query-counter are imported — ESM static imports are hoisted above
// any assignment in this file, so a static import would construct the Prisma
// singleton (and read the instrumentation flag) against the wrong DB/flag
// state before this beforeAll ever runs. All five are dynamic-imported
// inside beforeAll instead, typed `any` (matching tests/study-cache.test.ts's
// real-DB block precedent) so no static import line in this file mentions
// lib/prisma, lib/study-cards, lib/study-cache, or lib/query-counter by path
// — even as a type-only import, which would still be a static import line.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let tmpDir: string
let dbUrl: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getStudyCards: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resetStudyCacheForTests: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bumpStudyCacheVersion: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let resetQueryCount: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getQueryCounts: any

const previousDatabaseUrl = process.env.DATABASE_URL
const previousAuthToken = process.env.DATABASE_AUTH_TOKEN
const previousQueryCounterFlag = process.env.STUDY_QUERY_COUNTER

const STUDY_PARAMS = { scope: 'due' as const, lessonFrom: null, lessonTo: null }

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'study-roundtrips-test-'))
  const dbPath = join(tmpDir, 'test.db')
  dbUrl = `file:${dbPath}`

  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN
  process.env.STUDY_QUERY_COUNTER = '1'

  // Same DDL technique CLAUDE.md documents for Turso schema changes
  // (--to-schema, not --to-schema-datamodel), applied to the temp file so
  // this test runs against the real schema, not a hand-rolled subset.
  const ddl = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
    encoding: 'utf8',
  })
  const ddlClient = createClient({ url: dbUrl })
  await ddlClient.executeMultiple(ddl)
  ddlClient.close()

  // Dynamic imports AFTER DATABASE_URL/STUDY_QUERY_COUNTER are set and the
  // schema exists — see header comment for why these cannot be static
  // imports.
  ;({ prisma } = await import('../lib/prisma'))
  ;({ getStudyCards } = await import('../lib/study-cards'))
  ;({ resetStudyCacheForTests } = await import('../lib/study-cache'))
  ;({ bumpStudyCacheVersion } = await import('../lib/settings'))
  ;({ resetQueryCount, getQueryCounts } = await import('../lib/query-counter'))

  // Seed enough cards with review rows + sentences that the due-card pool is
  // non-empty (a mirror of e2e/seed.ts's "due cards" shape, trimmed to just
  // what this file needs — round-trip counting doesn't care about session
  // composition, only that Phase A/Phase B/refill each have real rows to
  // touch).
  const lesson = await prisma.lesson.create({
    data: {
      title: 'Round-trip fixture lesson',
      rawContent: '',
      contentHash: 'study-roundtrips-fixture',
      orderIndex: 1,
    },
  })
  const nextReviewPast = new Date(Date.now() - 60_000)
  const dueDefs = [
    {
      front: '안녕',
      back: 'hello',
      korean: '안녕하세요, 저는 학생이에요',
      targetForm: '안녕',
      translation: 'Hello, I am a student',
    },
    {
      front: '학교',
      back: 'school',
      korean: '저는 매일 학교에 가요',
      targetForm: '학교',
      translation: 'I go to school every day',
    },
    {
      front: '책',
      back: 'book',
      korean: '저는 책을 읽어요',
      targetForm: '책',
      translation: 'I read a book',
    },
  ]
  for (const d of dueDefs) {
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: d.front,
        back: d.back,
        normalizedFront: d.front,
        lessonId: lesson.id,
        sentences: {
          create: [{ korean: d.korean, targetForm: d.targetForm, translation: d.translation, orderIndex: 0 }],
        },
        review: { create: { state: 1, stability: 1, difficulty: 5, nextReview: nextReviewPast } },
      },
    })
  }
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = previousDatabaseUrl
  if (previousAuthToken === undefined) delete process.env.DATABASE_AUTH_TOKEN
  else process.env.DATABASE_AUTH_TOKEN = previousAuthToken
  if (previousQueryCounterFlag === undefined) delete process.env.STUDY_QUERY_COUNTER
  else process.env.STUDY_QUERY_COUNTER = previousQueryCounterFlag
})

describe('study round trips — STUDY-01 warm/cold proof (physical libSQL round trips at the @libsql/client boundary)', () => {
  it('cold snapshot: resetStudyCacheForTests() then one getStudyCards() call costs at most 3 physical requests', async () => {
    resetStudyCacheForTests()

    resetQueryCount()
    await getStudyCards(STUDY_PARAMS)
    const { physical } = getQueryCounts()

    console.log(`[study-roundtrips] cold (post resetStudyCacheForTests): physical=${physical}`)
    // A zero count means the counting Proxy detached (STUDY_QUERY_COUNTER
    // instrumentation branch in lib/prisma.ts did not activate) — that must
    // fail loudly, never be misread as "zero round trips, perfect score".
    expect(physical).toBeGreaterThan(0)
    expect(physical).toBeLessThanOrEqual(3)
  })

  it('warm repeat: the same call immediately after the cold call costs at most 2 physical requests', async () => {
    resetQueryCount()
    await getStudyCards(STUDY_PARAMS)
    const { physical } = getQueryCounts()

    console.log(`[study-roundtrips] warm (immediately after cold): physical=${physical}`)
    expect(physical).toBeGreaterThan(0)
    expect(physical).toBeLessThanOrEqual(2)
  })

  it('after bumpStudyCacheVersion() runs, the next call costs at most 3, and the call after that returns to at most 2', async () => {
    await bumpStudyCacheVersion()

    resetQueryCount()
    await getStudyCards(STUDY_PARAMS)
    const missCounts = getQueryCounts()
    console.log(`[study-roundtrips] cache-miss (post bumpStudyCacheVersion): physical=${missCounts.physical}`)
    expect(missCounts.physical).toBeGreaterThan(0)
    expect(missCounts.physical).toBeLessThanOrEqual(3)

    resetQueryCount()
    await getStudyCards(STUDY_PARAMS)
    const warmCounts = getQueryCounts()
    console.log(`[study-roundtrips] warm (immediately after the post-bump miss): physical=${warmCounts.physical}`)
    expect(warmCounts.physical).toBeGreaterThan(0)
    expect(warmCounts.physical).toBeLessThanOrEqual(2)
  })

  it('physical count vs Prisma $on(query) event count cross-check on a warm run — physical is authoritative on disagreement', async () => {
    resetQueryCount()
    await getStudyCards(STUDY_PARAMS)
    const { physical, prismaEvents } = getQueryCounts()

    console.log(`[study-roundtrips] cross-check: physical=${physical} prismaEvents=${prismaEvents}`)
    expect(physical).toBeGreaterThan(0)
    // Research Assumption A4 flagged that Prisma's $on('query') event may not
    // fire 1:1 with the physical execute()/batch()/transaction() calls the
    // counting Proxy observes, for some driver-adapter/version combinations.
    // This assertion is where that gets resolved for this project rather
    // than assumed. Fails with BOTH numbers in the message (never averaged,
    // never silently passed on the lower number) — physical is authoritative
    // per lib/query-counter.ts's header comment.
    expect(
      physical,
      `physical (${physical}) and prismaEvents (${prismaEvents}) disagree. The physical count — measured at the ` +
        `@libsql/client execute()/batch()/transaction() boundary — is authoritative per lib/query-counter.ts's ` +
        `header comment; investigate the discrepancy before trusting prismaEvents.`
    ).toBe(prismaEvents)
  })
})
