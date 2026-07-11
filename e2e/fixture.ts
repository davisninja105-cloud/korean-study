/**
 * Deterministic E2E seed fixture constants (D-13). Pure — no Prisma, no side
 * effects, importable by spec files directly. Specs assert values traceable
 * to the seed rather than hardcoding numbers that could silently drift out
 * of sync with e2e/seed.ts (anti-vacuous-smoke rule, 25-RESEARCH.md
 * False-Positive Risks).
 *
 * Shape (see e2e/seed.ts for the concrete Prisma creates):
 *  - 2 lessons
 *  - 3 due cards (CardReview state=1, nextReview in the past, 1 blank-safe
 *    sentence each)
 *  - 3 mastered cards (CardReview state=2, scheduledDays=30 >= 21)
 *  - 2 new cards (no CardReview row — excluded from both due/ahead scope
 *    queries and the due-count query; see NEW-CARD DETERMINISM RULE in
 *    e2e/seed.ts)
 *  - 1 CardDependency edge (due card "감사하다" built from new card "저")
 *  - 2 StudyDay rows (today + yesterday, habit-day dayStartHour=2)
 */

export const FIXTURE = {
  lessons: 2,
  dueCards: 3,
  masteredCards: 3,
  newCards: 2,
  totalCards: 8,
  dependencyEdges: 1,
  studyDays: 2,
  cards: {
    due: [
      { front: '안녕', back: 'hello' },
      { front: '학교', back: 'school' },
      { front: '감사하다', back: 'to thank' },
    ],
    mastered: [
      { front: '가다', back: 'to go' },
      { front: '이다', back: 'to be' },
      { front: '하다', back: 'to do' },
    ],
    new: [
      { front: '매일', back: 'every day' },
      { front: '저', back: 'I / me' },
    ],
  },
} as const
