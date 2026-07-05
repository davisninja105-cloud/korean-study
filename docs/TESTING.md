<!-- generated-by: gsd-doc-writer -->
# Testing

## Test Framework and Setup

Tests use **Vitest 4.1.9** (`devDependencies` in `package.json`), configured in
`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
  },
})
```

The `@` alias mirrors the `tsconfig.json` path mapping so that imported `lib/` and
`app/` modules (which use `@/` imports internally) resolve under Vitest.

There is no global setup file and no mocking library — no `vi.mock(...)` appears
anywhere in the suite. Most tests import a pure function directly from `lib/` and
assert on its return value. The one exception is `tests/review-route.test.ts`, an
integration test that provisions its own throwaway SQLite file database in
`beforeAll` (temp dir via `mkdtempSync`, schema applied with
`npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
piped through `@libsql/client` `executeMultiple()`) and cleans it up in `afterAll`.
Running `npm install` is the only setup step; tests need no `.env` file, no external
database connection, and no network access.

## Running Tests

Run the full suite once (CI-style, no watch):

```bash
npm test
```

This runs `vitest run` (see `package.json` `scripts.test`), which executes every
`*.test.ts` file under `tests/` (currently 14 files) and exits with a non-zero code
on failure.

Run a single file directly with the Vitest CLI:

```bash
npx vitest run tests/sequence.test.ts
```

Run in watch mode while developing (re-runs on file change):

```bash
npx vitest
```

There is no `test:watch`, `test:unit`, `test:integration`, or `test:coverage` script
defined in `package.json` — `npm test` is the only test entry point.

## Writing New Tests

- **Location and naming:** all tests live flat in `tests/` (no nested subdirectories)
  and are named `<module-name>.test.ts`, matching the `lib/` file under test — e.g.
  `tests/sequence.test.ts` tests `lib/sequence.ts`, `tests/card-key.test.ts` tests
  `lib/card-key.ts`. Route-level tests are named after the route
  (`tests/review-route.test.ts` tests `app/api/review/route.ts`).
- **Imports:** tests import directly from the relative `lib/` path (not the `@/`
  alias), e.g. `import { sequenceCards } from '../lib/sequence'`. The `@` alias in
  `vitest.config.ts` exists so that *transitively* imported project modules resolve
  (e.g. the review route imports `@/lib/prisma`).
- **Structure:** one `describe()` block per exported function, with individual
  `it()` cases for each behavior. Files that test a module with multiple exports use
  multiple `describe()` blocks (e.g. `tests/habit.test.ts` has separate blocks for
  `shiftDate`, `formatDuration`, `habitDateStr`, `computeStreaks`, `checkMilestone`,
  and `computeHabitStats`, all exported from `lib/habit.ts`).
- **Fixture helpers:** small local builder functions are defined inline at the top
  of a test file rather than in a shared helpers module — e.g. `tests/sequence.test.ts`
  defines a local `card(id, daysOverdue)` helper that mirrors the real Prisma
  `{ id, review: { nextReview } }` shape; `tests/sentence-selection.test.ts` reuses
  the same pattern with a comment noting it mirrors `sequence.test.ts`. There is no
  shared `tests/helpers.ts` file — copy the pattern from the closest existing test
  file when a new fixture builder is needed.
- **Integration tests against a real DB:** `tests/review-route.test.ts` is the
  template for exercising a real route handler. Key pattern: `lib/prisma.ts` reads
  `process.env.DATABASE_URL` at module-evaluation time and caches a singleton, and
  ESM static imports are hoisted — so the test sets `DATABASE_URL` to the temp
  SQLite file *first* and then dynamic-imports `../lib/prisma` and the route module
  inside `beforeAll` (the same env-ordering technique `CLAUDE.md` documents for
  `scripts/local-resync.mts`). The handler is invoked directly with a minimal fake
  request object (`{ json: async () => body }`), not a real `NextRequest`.
- **Mostly pure `lib/` functions are covered.** Per `CLAUDE.md`, `npm test` runs
  "Vitest unit tests (pure lib functions — no DB/API needed)." API routes (other
  than the `/api/review` idempotency regression test above), Prisma-backed modules
  (`lib/settings.ts`, `lib/dashboard.ts`, `lib/study-cards.ts`), and Claude/Google/
  TTS integration code (`lib/google-docs.ts`, `lib/tts.ts`, `lib/gloss.ts`) have no
  automated test coverage — they depend on a live database or external API and are
  validated manually instead. (`lib/extract-cards.ts` is a partial exception: its
  pure response-parsing function is tested; the Claude API call is not.)
- **Currently covered (14 test files):**
  - `tests/auth.test.ts` → `lib/auth.ts` (`isValidCronAuth`)
  - `tests/card-key.test.ts` → `lib/card-key.ts`
  - `tests/db-errors.test.ts` → `lib/db-errors.ts` (`isUniqueConstraintError`)
  - `tests/extract-cards.test.ts` → `lib/extract-cards.ts` (`parseExtractionResponse` only)
  - `tests/filter-components.test.ts` → `lib/filter-components.ts`
  - `tests/habit.test.ts` → `lib/habit.ts`
  - `tests/known-words.test.ts` → `lib/known-words.ts`
  - `tests/lesson-excerpt.test.ts` → `lib/lesson-excerpt.ts`
  - `tests/proficiency.test.ts` → `lib/proficiency.ts`
  - `tests/review-history.test.ts` → `lib/review-history.ts` (`buildReviewWhere`, `isValidOpaqueId`, `mapReviewLogToDTO`)
  - `tests/review-route.test.ts` → `app/api/review/route.ts` (integration: idempotent duplicate-replay regression guard, real POST handler against a temp SQLite DB)
  - `tests/sentence-match.test.ts` → `lib/sentence-match.ts`
  - `tests/sentence-selection.test.ts` → `lib/sentence-selection.ts`
  - `tests/sequence.test.ts` → `lib/sequence.ts`

## Coverage Requirements

No coverage threshold is configured. `vitest.config.ts` does not define a `coverage`
block, and there is no `.nycrc` or `c8` configuration in the repository. `npm test`
only asserts that all tests pass — it does not measure or enforce line/branch
coverage.

## CI Integration

No CI/CD pipeline is configured for this repository — there is no `.github/workflows/`
directory. Tests are run manually via `npm test` before pushing. Deployment is a
direct `git push origin main` → Vercel auto-deploy (see `CLAUDE.md` and
`docs/DEPLOYMENT.md`); the build step (`prisma generate && next build`) does not run
`npm test`, so a broken test does not currently block a deploy.
