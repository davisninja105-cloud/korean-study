/**
 * Deterministic Prisma fixture builder for the isolated E2E test DB.
 * Nested-create shape ported from scripts/diagnose-freshness.mts (D-08),
 * data model per 25-RESEARCH.md's "Seed fixture data model" table (D-13,
 * treated as authoritative — not re-derived here).
 */

import type { PrismaClient } from '../app/generated/prisma/client'
import { normalizeFront } from '../lib/card-key'
import { habitDateStr, shiftDate, DEFAULT_DAY_START_HOUR } from '../lib/habit'
import { TEST_DB_URL } from './helpers/test-db'

let prismaSingleton: PrismaClient | null = null

/**
 * Lazy singleton Prisma client pinned to the isolated E2E test DB. Pins
 * process.env.DATABASE_URL to TEST_DB_URL BEFORE dynamically importing
 * lib/prisma — env-first dynamic-import rule (24-PATTERNS.md convention):
 * a static top-of-file import would be hoisted by ESM and would read
 * process.env before this override runs, risking picking up an ambient
 * DATABASE_URL from the invoking shell instead of the isolated test DB.
 */
export async function getTestPrisma(): Promise<PrismaClient> {
  if (prismaSingleton) return prismaSingleton
  process.env.DATABASE_URL = TEST_DB_URL
  const { prisma } = await import('../lib/prisma')
  prismaSingleton = prisma
  return prisma
}

/**
 * Inserts the full D-13 fixture: 2 lessons, 3 due cards, 3 mastered cards,
 * 2 new cards, 1 CardDependency edge, 2 StudyDay rows. Idempotent only in
 * the sense that it always creates fresh rows — callers that need a clean
 * slate should call resetToBaseline() instead, which deletes first.
 */
export async function seedFixture(): Promise<void> {
  const prisma = await getTestPrisma()

  const lesson1 = await prisma.lesson.create({
    data: { title: 'E2E Fixture Lesson 1', rawContent: '', contentHash: 'e2e-fixture-lesson-1', orderIndex: 1 },
  })
  const lesson2 = await prisma.lesson.create({
    data: { title: 'E2E Fixture Lesson 2', rawContent: '', contentHash: 'e2e-fixture-lesson-2', orderIndex: 2 },
  })

  const nextReviewPast = new Date(Date.now() - 60_000)
  const nextReviewFar = new Date(Date.now() + 30 * 86_400_000)

  // ── Due cards (state=1, nextReview in the past, 1 blank-safe sentence each) ──
  interface DueDef {
    front: string
    back: string
    korean: string
    targetForm: string
    translation: string
    components: string[] | null
  }
  const dueDefs: DueDef[] = [
    {
      front: '안녕',
      back: 'hello',
      korean: '안녕하세요, 저는 학생이에요',
      targetForm: '안녕',
      translation: 'Hello, I am a student',
      components: null,
    },
    {
      front: '학교',
      back: 'school',
      korean: '저는 매일 학교에 가요',
      targetForm: '학교',
      translation: 'I go to school every day',
      components: null,
    },
    {
      front: '감사하다',
      back: 'to thank',
      korean: '저는 선생님께 감사해요',
      targetForm: '감사해요',
      translation: 'I am thankful to my teacher',
      // Prerequisite target is one of the "new" cards below (저) — resolved
      // to a CardDependency edge after all cards exist, exactly the way
      // sync-time linking does (normalizedFront lookup).
      components: ['저'],
    },
  ]
  for (const d of dueDefs) {
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: d.front,
        back: d.back,
        normalizedFront: normalizeFront(d.front),
        components: d.components ? JSON.stringify(d.components) : null,
        lessonId: lesson1.id,
        sentences: {
          create: [{ korean: d.korean, targetForm: d.targetForm, translation: d.translation, orderIndex: 0 }],
        },
        review: {
          create: { state: 1, stability: 1, difficulty: 5, nextReview: nextReviewPast },
        },
      },
    })
  }

  // ── Mastered cards (state=2, scheduledDays=30 >= 21) ──────────────────────
  // nextReview is pinned FAR in the future so these never also count toward
  // the due-count query (which counts every CardReview with nextReview <=
  // now, regardless of state) — keeps FIXTURE.dueCards exactly 3.
  const masteredDefs = [
    { front: '가다', back: 'to go', korean: '저는 학교에 가요', targetForm: '가요', translation: 'I go to school' },
    { front: '이다', back: 'to be', korean: '이것은 책이에요', targetForm: '이에요', translation: 'This is a book.' },
    {
      front: '하다',
      back: 'to do',
      korean: '저는 매일 운동해요',
      targetForm: '운동해요',
      translation: 'I exercise every day.',
    },
  ]
  for (const m of masteredDefs) {
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: m.front,
        back: m.back,
        normalizedFront: normalizeFront(m.front),
        lessonId: lesson1.id,
        sentences: {
          create: [{ korean: m.korean, targetForm: m.targetForm, translation: m.translation, orderIndex: 0 }],
        },
        review: {
          create: { state: 2, stability: 50, difficulty: 3, scheduledDays: 30, nextReview: nextReviewFar },
        },
      },
    })
  }

  // ── New cards (no CardReview row at all) ──────────────────────────────────
  // NEW-CARD DETERMINISM RULE: lib/dashboard.ts's due-count query
  // (prisma.cardReview.count) and lib/study-cards.ts's pool query (a to-one
  // `review: { nextReview: {...} }` relation filter, which Prisma requires
  // to both exist AND match) both structurally exclude a card with no
  // CardReview row at all — so these two cards never appear in the due
  // count OR the ahead-scope pool, keeping FIXTURE.dueCards/totalCards exact.
  const newDefs = [
    { front: '매일', back: 'every day' },
    { front: '저', back: 'I / me' },
  ]
  for (const n of newDefs) {
    await prisma.card.create({
      data: {
        type: 'vocabulary',
        front: n.front,
        back: n.back,
        normalizedFront: normalizeFront(n.front),
        lessonId: lesson2.id,
      },
    })
  }

  // ── CardDependency edge: 감사하다 (due) built from 저 (new) ────────────────
  // Resolved by normalizedFront lookup after all cards exist — exactly how
  // sync-time two-phase linking works (components[] lemma → matching card).
  const [prereqCard, dependentCard] = await Promise.all([
    prisma.card.findUnique({ where: { normalizedFront: normalizeFront('저') } }),
    prisma.card.findUnique({ where: { normalizedFront: normalizeFront('감사하다') } }),
  ])
  if (prereqCard && dependentCard) {
    await prisma.cardDependency.create({
      data: { cardId: dependentCard.id, prerequisiteId: prereqCard.id },
    })
  }

  // ── StudyDay: today + yesterday (habit-day, dayStartHour=2 default) ───────
  // Uses lib/habit.ts's habitDateStr/shiftDate (never raw localDateStr) so
  // the Habits streak renders 2 deterministically regardless of wall-clock hour.
  const todayStr = habitDateStr(DEFAULT_DAY_START_HOUR)
  const yesterdayStr = shiftDate(todayStr, -1)
  await prisma.studyDay.create({ data: { date: todayStr, seconds: 400, reviews: 6 } })
  await prisma.studyDay.create({ data: { date: yesterdayStr, seconds: 420, reviews: 7 } })
}

/**
 * Deletes all fixture rows in FK-safe order (children before parents), then
 * re-seeds. Called from test.beforeEach in Plans 02/03 so every spec starts
 * from the same baseline regardless of file ordering or prior mutations.
 * Leaves the Setting table alone (no fixture rows live there).
 */
export async function resetToBaseline(): Promise<void> {
  const prisma = await getTestPrisma()
  await prisma.cardDependency.deleteMany()
  await prisma.sentence.deleteMany()
  await prisma.cardReview.deleteMany()
  await prisma.reviewLog.deleteMany()
  await prisma.card.deleteMany()
  await prisma.lesson.deleteMany()
  await prisma.studyDay.deleteMany()
  await seedFixture()
}
