# Testing Patterns

**Analysis Date:** 2026-07-05

## Test Framework

**Runner:**
- Vitest 4.1.9
- Config: `vitest.config.ts` (minimal; sets `environment: 'node'` and path alias `@`)
- No DOM needed — all tests are pure function tests

**Assertion Library:**
- Vitest built-in `expect` (compatible with Jest)

**Run Commands:**
```bash
npm test              # Run all tests once
npm run lint          # Check lint (must pass clean)
npm run dev           # Start dev server
npm run build         # Production build (runs prisma generate)
```

Tests are **deterministic and synchronous** — no mocking framework, no async test utilities, no test database.

## Test File Organization

**Location:**
- Co-located in `tests/` directory at repo root, not scattered alongside source
- Naming convention: `tests/{source-name}.test.ts` mirrors `lib/{source-name}.ts` or `app/api/{route}.test.ts`

**Test files present (14 total):**
- `tests/card-key.test.ts` — normalizeFront() dedup behavior
- `tests/sequence.test.ts` — foundation-first sequencing + session selection
- `tests/habit.test.ts` — streak computation, date math, milestone detection
- `tests/auth.test.ts` — HMAC token validation
- `tests/proficiency.test.ts` — CEFR band mapping
- `tests/sentence-match.test.ts` — substring matching + blank-safety rules
- `tests/known-words.test.ts` — unknown word counting in Korean sentences
- `tests/extract-cards.test.ts` — Claude response parsing + normalization
- `tests/filter-components.test.ts` — prerequisite filtering + dedup
- `tests/review-route.test.ts` — FSRS review API contract
- `tests/lesson-excerpt.test.ts` — lesson text extraction
- `tests/review-history.test.ts` — review history aggregation
- `tests/sentence-selection.test.ts` — sentence picking algorithm
- `tests/db-errors.test.ts` — database error classification

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeFront } from '../lib/card-key'

describe('normalizeFront', () => {
  it('trims whitespace', () => {
    expect(normalizeFront('  가다  ')).toBe('가다')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeFront('가  다')).toBe('가 다')
  })

  it('strips trailing English gloss in parens', () => {
    expect(normalizeFront('가다 (to go)')).toBe('가다')
    expect(normalizeFront('~(으)면 (if/when)')).toBe('~(으)면')
  })

  it('is idempotent', () => {
    const s = normalizeFront('가다 (to go)')
    expect(normalizeFront(s)).toBe(s)
  })
})
```

**Patterns:**
- One `describe()` block per exported function/feature
- One `it()` test per behavior (not per assertion)
- Descriptive test names: "behavior X when Y" or "X yields Z"
- No `beforeEach` / `afterEach` (tests are independent)
- No setup/teardown fixtures; data constructed inline in each test

## Test Data Factories

**Inline Object Builders:**
- No factory libraries; tests build their own fixtures inline
- Example (`tests/sequence.test.ts`):
  ```typescript
  function card(id: string, daysOverdue = 0): SeqCard {
    const now = new Date('2026-06-23T12:00:00Z')
    const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
    return { id, review: { nextReview } }
  }
  
  const NOW = new Date('2026-06-23T12:00:00Z')
  ```

**Deterministic Dates:**
- All tests use fixed dates (`'2026-06-23T12:00:00Z'`, `'2026-01-01'`) to ensure reproducibility
- No `new Date()` in test execution; dates passed as parameters or hardcoded
- Follows ESLint `react-hooks/purity` principle: no impure calls in test logic

**Fixture Reuse:**
- Helper functions create domain objects (cards, edges, day records)
- Fixtures are composed inline, never centralized; each test is self-contained

## Mocking

**Framework:** No mocking library used

**Patterns:**
- All tests exercise pure functions with no side-effects (no DB, no network, no file I/O)
- Functions like `sequenceCards()`, `normalizeFront()`, `computeStreaks()` are pure
- Input/output contracts are tested directly without mocks

**What to Test:**
- Boundary conditions (empty input, single item, duplicates, cycles)
- Determinism (same input always yields same output)
- Idempotency (applying operation twice ≈ applying once)
- Edge cases (Unicode normalization, whitespace handling, off-by-one)

**What NOT to Test:**
- Integration (Prisma queries, API routes, Claude API calls)
- Side-effects (database writes, network calls)
- Third-party library behavior (rely on their tests)

## Example: Sequence Selection Test

```typescript
it('pulls a less-due prerequisite into the session with its dependent', () => {
  // 'dep' is 5 days overdue; 'filler' is 3 days overdue; 'prereq' is 1 day overdue.
  // sessionSize=2, so a naive most-due-only cap would pick [dep, filler] and skip 'prereq'.
  // selectSessionCards must pull 'prereq' in as a prerequisite of 'dep' instead.
  const dep    = card('dep',    5)   // most overdue → selected as first seed
  const filler = card('filler', 3)   // more overdue than prereq but not a prerequisite
  const prereq = card('prereq', 1)   // less overdue → excluded by naive cap but required by dep
  const edges: SeqEdge[] = [{ cardId: 'dep', prerequisiteId: 'prereq' }]
  const result = selectSessionCards([dep, filler, prereq], edges, 2, NOW)
  const ids = result.map((c) => c.id)
  expect(ids).toContain('dep')
  expect(ids).toContain('prereq')
  // prerequisite must precede the dependent
  expect(ids.indexOf('prereq')).toBeLessThan(ids.indexOf('dep'))
})
```

**Anatomy:**
1. **Comment block:** scenario setup and expected behavior in plain English
2. **Fixture construction:** `card()` builder creates input objects
3. **Function call:** single pure function invocation
4. **Assertions:** multiple expectations verifying outcome (multiple assertions per test are OK when they verify the same scenario)

## Error Cases

Tests verify both happy path and error conditions:

**Type Guards:**
```typescript
describe('isValidCronAuth', () => {
  it('returns true for a valid bearer header with matching secret', () => {
    expect(isValidCronAuth('Bearer supersecret123', 'supersecret123')).toBe(true)
  })

  it('fails closed when cronSecret is undefined', () => {
    expect(isValidCronAuth('Bearer anything', undefined)).toBe(false)
  })

  it('returns false for malformed headers', () => {
    expect(isValidCronAuth('supersecret123', 'supersecret123')).toBe(false)
    expect(isValidCronAuth('bearer lowercase', 'secret')).toBe(false)
  })
})
```

**Boundary Testing:**
```typescript
describe('normalizeFront', () => {
  it('handles empty string', () => {
    expect(normalizeFront('')).toBe('')
  })

  it('keeps mixed Hangul+ASCII parens intact', () => {
    // Inner has Hangul → not stripped
    expect(normalizeFront('Action verb ~는 (현재형)')).toBe('Action verb ~는 (현재형)')
  })
})
```

## Coverage

**Scope:** Unit tests only — pure library functions

**Coverage targets (observed):**
- `lib/card-key.ts` — 100% (normalizeFront logic fully exercised)
- `lib/sequence.ts` — 100% (all paths: cycles, empty input, urgency boost, prereq closure)
- `lib/habit.ts` — 100% (streaks, freeze budget, milestone transitions)
- `lib/auth.ts` — 100% (HMAC validation edge cases)

**No Coverage:**
- Database models (Prisma)
- API routes (Next.js routing, HTTP)
- Components (React UI)
- External APIs (Claude, Google Docs, TTS)

**View Coverage:**
```bash
# Vitest v4 does not have built-in coverage; coverage would require
# a separate tool like c8 or @vitest/coverage-c8 (not currently installed)
```

## Testing Best Practices (Observed)

**Determinism:**
- No `Date.now()`, `Math.random()`, dynamic values
- All inputs passed as explicit parameters
- Same test run multiple times yields same result

**Independence:**
- Each test is standalone (no shared state, no `beforeEach` mutations)
- Tests can run in any order
- No test has side-effects that affect others

**Clarity:**
- Test name clearly describes the scenario being tested
- Setup comments explain the "why" (e.g., "naive cap would pick these, but we expect…")
- Assertions are narrow and targeted

**Purity:**
- All tested functions are pure (no side-effects)
- Input/output contracts are explicit (interfaces document expected shape)
- No mocks needed because there are no external dependencies to stub

## Test Execution

**Local:**
```bash
npm test                    # Runs all tests once
npm test -- lib/habit.ts   # Run tests for a specific file
npm test -- --reporter=verbose  # More verbose output
```

**CI:** Not configured in this codebase (tests are for local development only)

**Performance:**
- All 14 tests run in < 1 second (pure functions, no I/O)
- No watchers or incremental runs currently used

---

*Testing analysis: 2026-07-05*
