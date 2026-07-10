# Testing Patterns

**Analysis Date:** 2026-07-10

## Test Framework

**Runner:**
- Vitest 4.1.9
- Config: `vitest.config.ts` (`environment: 'node'`; `@` alias → project root)

**Assertion Library:**
- Vitest built-in `expect`

**Run Commands:**
```bash
npm test               # vitest run (all tests, single pass)
npx vitest             # Watch mode
npx vitest run tests/sequence.test.ts   # Single file
```

No coverage tooling is configured.

## Test File Organization

**Location:**
- Separate `tests/` directory at project root (not co-located). 18 test files as of this analysis.

**Naming:**
- `tests/<lib-module>.test.ts` — mirrors the `lib/` module under test (`tests/card-key.test.ts` ↔ `lib/card-key.ts`, `tests/sequence.test.ts` ↔ `lib/sequence.ts`). Route tests are named for the route (`tests/review-route.test.ts`).

**Structure:**
```
tests/
├── audit-checks.test.ts        # largest suite (625 lines)
├── extract-cards.test.ts       # schema + salvage-path guards (673 lines)
├── sequence.test.ts            # pure sequencing logic
├── study-cards.test.ts         # mocked-Prisma pipeline tests
├── review-route.test.ts        # real route handler against temp SQLite
├── card-key.test.ts, habit.test.ts, sentence-match.test.ts, …
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest'
import { sequenceCards, SeqCard, SeqEdge } from '../lib/sequence'

const NOW = new Date('2026-06-23T12:00:00Z')  // fixed clock — time is always injected

describe('sequenceCards', () => {
  it('places prerequisite before dependent card', () => {
    const edges: SeqEdge[] = [{ cardId: 'dep', prerequisiteId: 'prereq' }]
    const result = sequenceCards([dep, prereq], edges, NOW)
    expect(result[0].id).toBe('prereq')
  })
})
```

**Patterns:**
- Deterministic time: pure lib functions take `now: Date` as a parameter; tests pass a fixed `new Date('…')` constant — never `Date.now()`.
- Factory helpers at file top build minimal fixtures matching real Prisma relation shapes (`card(id, daysOverdue)` in `tests/sequence.test.ts`; `makePoolCard()` in `tests/study-cards.test.ts` — deliberately "serialization-complete" to survive the DTO block).
- Regression tests open with a block comment naming the issue ID and the exact failure it guards (RELIABILITY-01, HIST-02, CR-01, EXTRACT-01 — "RED→GREEN regression guard").
- `beforeEach`/`afterEach` for spy setup + `mockReset()`; `vi.spyOn(console, 'error').mockImplementation(() => {})` to suppress and assert degradation logging.

## Mocking

**Framework:** Vitest `vi.mock` / `vi.fn` / `vi.spyOn`

**Patterns:**
```typescript
// tests/study-cards.test.ts — mock the prisma singleton (hoisted above imports)
vi.mock('@/lib/prisma', () => ({
  prisma: {
    card: { findMany: vi.fn() },
    cardDependency: { findMany: vi.fn() },
  },
}))
// Import AFTER the mock declaration
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
```

**What to Mock:**
- The `@/lib/prisma` singleton for pipeline tests — the factory also neutralizes the real module body, so no `DATABASE_URL` is needed.
- `console.error` spies to lock log-prefix contracts (`[study-cards]`).

**What NOT to Mock:**
- Pure lib functions (`lib/sequence.ts`, `lib/card-key.ts`, `lib/habit.ts`, `lib/sentence-match.ts`) — tested directly with real inputs.
- The route handler + DB in `tests/review-route.test.ts`: the REAL `POST` from `app/api/review/route.ts` runs against a fresh temp SQLite file with the real schema DDL applied, so UNIQUE-constraint behavior genuinely fires. Env ordering is critical: set `DATABASE_URL` BEFORE dynamic-importing `@/lib/prisma` and the route inside `beforeAll` (ESM static imports are hoisted; `lib/prisma.ts` caches at module eval).
- The Anthropic SDK schema helpers in `tests/extract-cards.test.ts`: `zodOutputFormat(ExtractionSchema)` wire-schema shape is asserted directly (walks JSON-Schema nodes to require `additionalProperties: false` everywhere; truncated-text parse must throw `AnthropicError`).

## Fixtures and Factories

**Test Data:**
```typescript
// Minimal fixture factory mirroring the real Prisma relation shape
function card(id: string, daysOverdue = 0): SeqCard {
  const now = new Date('2026-06-23T12:00:00Z')
  return { id, review: { nextReview: new Date(now.getTime() - daysOverdue * 86_400_000) } }
}
```

**Location:**
- Inline per test file (no shared fixtures directory). Real-DB tests seed via `@libsql/client` in `beforeAll` and clean up temp dirs in `afterAll` (`tests/review-route.test.ts`).

## Coverage

**Requirements:** None enforced; no coverage tooling configured.

**View Coverage:**
```bash
# Not configured — would require adding @vitest/coverage-v8
```

## Test Types

**Unit Tests:**
- Dominant type. Pure `lib/` functions with no DB/network: `tests/card-key.test.ts`, `tests/habit.test.ts`, `tests/proficiency.test.ts`, `tests/known-words.test.ts`, `tests/sentence-match.test.ts`, `tests/sequence.test.ts`, `tests/lesson-excerpt.test.ts`, `tests/filter-components.test.ts`.

**Integration Tests:**
- Mocked-Prisma pipeline tests (`tests/study-cards.test.ts`, `tests/relink-dependencies.test.ts`, `tests/link-dependencies.test.ts`).
- Real-handler + real-SQLite route tests (`tests/review-route.test.ts`, `tests/db-errors.test.ts`, `tests/review-history.test.ts`).

**E2E Tests:**
- Not used. No browser/component testing (no Testing Library, no Playwright); components are untested.

## Common Patterns

**Async Testing:**
```typescript
it('degrades to empty known-lemmas set when that query rejects', async () => {
  ;(prisma.card.findMany as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce([makePoolCard()])   // pool query
    .mockRejectedValueOnce(new Error('boom'))  // known-lemmas query
  const cards = await getStudyCards({ sessionSize: 20 })
  expect(errorSpy).toHaveBeenCalled()          // '[study-cards]' log locked
})
```

**Error Testing:**
```typescript
// Contract: parsing truncated LLM output throws AnthropicError
expect(() => zodOutputFormat(ExtractionSchema).parse('{"cards":[{"type":"vocabulary"')).toThrow(AnthropicError)
```

**Guidance for new tests:**
- New pure `lib/` logic gets a `tests/<name>.test.ts` unit suite with injected time.
- New API-route behavior involving DB constraints follows the `review-route.test.ts` temp-SQLite pattern.
- Regression fixes get a persisted test with an issue-ID block comment explaining the RED state it guards against.

---

*Testing analysis: 2026-07-10*
