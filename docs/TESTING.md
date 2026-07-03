<!-- generated-by: gsd-doc-writer -->
# Testing

## Test Framework and Setup

Tests use **Vitest 4.1.9** (`devDependencies` in `package.json`), configured in
`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

No global setup file, mocking library, or database fixture is used — every test
imports a pure function directly from `lib/` and asserts on its return value. There
is no `beforeEach`/`afterEach` teardown and no `vi.mock(...)` anywhere in the suite.
Running `npm install` is the only setup step; tests need no `.env` file, no database
connection, and no network access.

## Running Tests

Run the full suite once (CI-style, no watch):

```bash
npm test
```

This runs `vitest run` (see `package.json` `scripts.test`), which executes every
`*.test.ts` file under `tests/` and exits with a non-zero code on failure.

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
  `lib/card-key.ts`.
- **Imports:** tests import directly from the relative `lib/` path (not the `@/`
  alias), e.g. `import { sequenceCards } from '../lib/sequence'`.
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
- **Only pure `lib/` functions are covered.** Per `CLAUDE.md`, `npm test` runs
  "Vitest unit tests (pure lib functions — no DB/API needed)." API routes
  (`app/api/**/route.ts`), Prisma-backed modules (`lib/prisma.ts`, `lib/settings.ts`),
  and Claude/Google/TTS integration code (`lib/extract-cards.ts`, `lib/google-docs.ts`,
  `lib/tts.ts`, `lib/gloss.ts`) have no automated test coverage — they depend on a
  live database or external API and are validated manually instead.
- **Currently covered modules:** `lib/sequence.ts`, `lib/card-key.ts`,
  `lib/proficiency.ts`, `lib/known-words.ts`, `lib/habit.ts`, `lib/lesson-excerpt.ts`,
  `lib/sentence-selection.ts`, `lib/sentence-match.ts`.

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
