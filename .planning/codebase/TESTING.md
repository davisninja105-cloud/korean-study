# Testing Patterns

**Analysis Date:** 2026-07-02

## Summary

This codebase has a **narrow-scope Vitest suite**: 58 tests across 6 files, covering only pure `lib/` functions with no side effects (no DB, no network, no React rendering). Everything else — API routes, React components, RSC hydration/paint-timing behavior — has no automated coverage and relies on strict TypeScript, strict ESLint, and manual/browser verification. There is no CI pipeline; the only automated gate on push is the Vercel build (`next build`, which includes a full type-check).

---

## Test Framework

**Vitest** (`^4.1.9`), configured at `vitest.config.ts` (`environment: 'node'` — no DOM, no jsdom).

```bash
npm test       # → vitest run (all tests, single run, no watch)
npm run lint   # ESLint — the other automated quality gate
npm run build  # prisma generate && next build — full TypeScript type-check + production build
```

---

## Test File Locations

All tests live in a single top-level `tests/` directory (not co-located with source), one file per pure `lib/` module:

| File | Covers | Test count | Sample assertions |
|------|--------|-----------|-------------------|
| `tests/card-key.test.ts` | `lib/card-key.ts` — `normalizeFront()` | 7 | Trims whitespace, strips English gloss, handles empty string, idempotence |
| `tests/habit.test.ts` | `lib/habit.ts` — `computeStreaks()`, `computeFreezeBudget()`, `habitDateStr()` | 17 | Streak counting with freeze budgets, date shifting, month/year boundaries |
| `tests/known-words.test.ts` | `lib/known-words.ts` — `countUnknownWords()` | 5 | Token counting excluding target/known, particle stem resolution |
| `tests/proficiency.test.ts` | `lib/proficiency.ts` — `computeProficiency()` | 6 | CEFR band boundaries (A1 0–500, A2 500–1200, …, C1+ 8000+), percentage within band |
| `tests/sentence-match.test.ts` | `lib/sentence-match.ts` — match/blank-safety rules | 11 | Multi-char target matching, single-char safety, multi-occurrence detection, particle splitting |
| `tests/sequence.test.ts` | `lib/sequence.ts` — `sequenceCards()`, `selectSessionCards()` | 12 | Prerequisite ordering, urgency boost scoring, downward-closed selection, cycle safety |

**Total: 58 tests, 6 files.**

---

## Test Structure

### Pattern: Vitest + `describe` / `it` / `expect`

All test files follow a consistent structure:

```typescript
import { describe, it, expect } from 'vitest'
import { functionUnderTest } from '../lib/module-name'

describe('functionUnderTest', () => {
  it('does X when given Y', () => {
    expect(functionUnderTest(Y)).toBe(X)
  })

  it('handles edge case: Z', () => {
    expect(functionUnderTest(Z)).toEqual(expectedResult)
  })
})
```

### Fixtures and Test Data

Test data is created inline within test cases. For pure functions with simple inputs:

- **`sequence.test.ts`:** uses a `card()` helper factory function to construct `SeqCard` objects with controllable overdue days. Uses a fixed `NOW = new Date('2026-06-23T12:00:00Z')` to avoid impurity.
  ```typescript
  function card(id: string, daysOverdue = 0): SeqCard {
    const now = new Date('2026-06-23T12:00:00Z')
    const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
    return { id, review: { nextReview } }
  }
  ```

- **`card-key.test.ts`:** creates inline test strings (Korean and English) without fixtures.

- **`habit.test.ts`:** defines inline `DayRecord[]` arrays and computes expected outputs manually.

---

## What Is Verified

### Automated

- **Vitest (`npm test`):** the 58 tests above — pure function behavior only, no DB/API/component involved.
- **TypeScript (`npm run build` / `npx tsc --noEmit`):** full strict-mode type-check. Catches type errors, not runtime logic bugs.
- **ESLint (`npm run lint`):** `eslint-config-next` (core-web-vitals + TypeScript rules), zero errors is the baseline. Catches React hooks violations (`react-hooks/purity`, `react-hooks/set-state-in-effect`), unused variables, and TypeScript-specific issues.

### Manual / Not Automatable

- **API routes** (`app/api/*/route.ts`) — no integration tests; verified by manual browser exercise or production observation.
- **React components** — no component/rendering tests (no React Testing Library, no `@testing-library/react` installed).
- **RSC hydration / paint-timing behavior (v1.2):** claims like "no blank flash on first paint" or "no perceptible jitter between grade tap and next card" are runtime, human-observable properties — they cannot be verified by `tsc`/ESLint/Vitest, only by running a production build (`npm run build && npm start`) and watching the browser. This was a recurring gap during the v1.2 milestone: 2 of 4 phases shipped without a live browser check closing these claims.
- **Operational scripts (`scripts/`)** serve as informal integration smoke tests: `local-resync.mts` exercises the full Google Docs → Claude → DB pipeline; `relink-dependencies.mjs` and `find-duplicates.mjs` validate data-integrity invariants after a bulk operation.

### Production Deployment as Verification

`git push origin main` triggers automatic Vercel deployment. The deploy either succeeds (build passes, including the type-check) or fails with a build error — the Vercel build log is the only CI-like feedback beyond local `npm run build`/`npm run lint`/`npm test`.

---

## Assertion Library

All tests use **Vitest's built-in `expect()`** from the `vitest` package (no external assertion library needed). Common patterns:

```typescript
// Exact equality
expect(result).toBe(expected)
expect(result).toBe(true)

// Structural equality (for objects, arrays)
expect(result).toEqual(expectedObject)
expect(result).toEqual([itemA, itemB])

// Type checks
expect(result).toHaveLength(3)
expect(result.map(c => c.id)).toContain('a')

// Existence
expect(result.nextBand).toBeNull()
expect(result).toBeDefined()

// Numeric / percentile comparisons
expect(result).toBeLessThan(10)
expect(result).toBeLessThanOrEqual(4)
expect(new Set(ids).size).toBe(2)
```

---

## Known Coverage Gaps

The following are NOT covered by the existing 58 tests and would need new test files or a different testing approach:

### High Priority

- **`app/api/sync/route.ts`** — the sync pipeline (would require mocking the Google Docs API and the Anthropic SDK).
- **`lib/study-cards.ts` / `lib/dashboard.ts`** *(v1.2)* — the server-only pipeline functions that back both the RSC pages and their API routes. Both call Prisma directly, so testing requires either a real/test DB or a Prisma mock — neither is set up.
- **`components/StudySession.tsx`** (964 lines) — core interaction logic (queue management, undo, `REQUEUE_GAP` behavior, the v1.2 optimistic `submitReview` path). Would benefit from React Testing Library, which is not installed.
- **RSC first-paint / no-flash claims** — see "Manual / Not Automatable" above. No tooling in this project can assert on this; would require Playwright or similar browser-automation testing, which is not installed.

### Medium Priority

- **`app/api/cards/due/route.ts`** — now a thin delegator to `getStudyCards()`; testing the route itself mostly means testing `lib/study-cards.ts`.
- **DTO serialization correctness** — no automated check that every `DateTime` field crossing an RSC→client boundary is actually serialized; relies on convention + manual browser-console check (see `.planning/codebase/CONVENTIONS.md` gotcha #10).

### Low Priority (External Dependencies / UI)

- TTS provider switching (`lib/tts.ts`) — depends on external API calls.
- Google Docs fetch (`lib/google-docs.ts`) — requires real OAuth and a live Doc.
- Visual/animation components (`Sheet.tsx`, `ProgressRing.tsx`, `SwipeRow.tsx`).

---

## If Extending the Suite

**File location convention:**
- Keep the single top-level `tests/` directory — do not introduce `lib/__tests__/` or co-location.
- Name new test files `<module>.test.ts` to match existing pattern.

**Module selection:**
- Only add tests for modules that are **pure** (no Prisma, no Node.js builtins, no external API calls).
- Do NOT add tests for modules that import Prisma (`lib/study-cards.ts`, `lib/dashboard.ts`, any `app/api/*/route.ts`) without first deciding on a mock/test-DB strategy — the libSQL adapter requires a live database connection and none of the existing tests set one up.

**Test data strategy:**
- Prefer inline fixture creation (factories, helper functions) over external data files.
- For time-dependent tests, use a fixed `now` parameter rather than `Date.now()` to ensure reproducibility and maintain purity.

**For RSC/paint-timing assertions:**
- The existing suite cannot help — this needs either Playwright (not installed) or continued reliance on the manual production-build browser check documented in `CLAUDE.md` and the phase VERIFICATION.md files under `.planning/milestones/v1.2-phases/`.

---

## CI Configuration

None. There is no `.github/workflows/`, no CircleCI, no pre-commit hooks beyond whatever the local git configuration provides. The only automated check on push is the Vercel build, which runs `prisma generate && next build` (type-check + production build) — it does **not** run `npm test` or `npm run lint`.

---

*Testing analysis: 2026-07-02*
