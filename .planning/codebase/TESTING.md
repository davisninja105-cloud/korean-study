# Testing Patterns
_Last updated: 2026-06-23_

## Summary

This codebase has **no automated test suite**. There are no test files, no test framework dependencies (no Jest, Vitest, Playwright, Cypress, etc.), and no CI pipeline configured. Verification happens through manual testing, local script execution, and production observation. This is a significant gap for a production app with complex pure-logic modules that would be straightforward to unit test.

---

## Test Framework

**None installed.** The `package.json` includes no testing dependencies (`jest`, `vitest`, `@testing-library/*`, `playwright`, `cypress`, etc.).

```bash
npm run lint    # Only automated quality check available
npm run build   # TypeScript type-check + Next.js build validation
```

---

## What Is Verified

### TypeScript Compilation

`npm run build` runs `prisma generate && next build`, which includes a full TypeScript type-check pass. This catches type errors but not runtime logic bugs.

### ESLint

`npm run lint` runs `eslint` with `eslint-config-next` (core-web-vitals + TypeScript rules). Zero errors is the baseline. This catches:
- React hooks violations (`react-hooks/purity`, `react-hooks/set-state-in-effect`)
- Unused variables, unreachable code
- TypeScript-specific lint rules

### Operational Scripts (Manual)

Scripts in `scripts/` serve as integration-level smoke tests for data pipeline operations:

- `scripts/local-resync.mts` — Re-runs full extraction against Turso. Verifies the Google Docs → Claude → DB pipeline end-to-end. Run with `npx tsx scripts/local-resync.mts`.
- `scripts/find-duplicates.mjs` — Scans for near-duplicate card fronts. Useful for validating dedup logic after a resync.
- `scripts/relink-dependencies.mjs` — Rebuilds all `CardDependency` edges. Idempotent; can verify the knowledge graph is consistent.
- `scripts/full-resync.mjs` — Drives repeated `POST /api/sync` calls until `remaining=0`. Exercises the sync API route in sequence.

### Manual Browser Testing

All feature testing is manual via the browser at:
- Local: `http://localhost:3000` (`npm run dev`)
- Production: `https://korean-study-five.vercel.app`

### Production Deployment as Verification

`git push origin main` triggers automatic Vercel deployment. The deploy either succeeds (build passes) or fails with a build error — the Vercel build log is the only CI-like feedback.

---

## Test File Locations

No test files exist anywhere in the repository. A `find` for `*.test.*` and `*.spec.*` returns no results.

---

## Known Coverage Gaps

The following modules contain pure, side-effect-free logic that would be straightforward to unit test but currently has no coverage:

### High Priority (Complex Logic, No Tests)

- **`lib/sequence.ts` — `sequenceCards()`**
  The blended depth + urgency card ordering algorithm. Has documented edge cases (cycles, tiebreakers, urgency boost clamping). Pure function with `now: Date` parameter — ideal for unit tests.

- **`lib/card-key.ts` — `normalizeFront()`**
  The dedup key function. Has specific rules for stripping English glosses in trailing parens while preserving Korean patterns (e.g., `~(으)면` should not be stripped). Pure, no imports.

- **`lib/sentence-match.ts` — `sentenceMatch()`, `blankSentence()`**
  Substring matching with blank-safety rules (2+ chars, appears exactly once). Powers all three study modes. Pure helpers.

- **`lib/habit.ts` — `computeStreaks()`, `computeFreezeBudget()`**
  Streak computation with freeze-budget bridging logic. Pure functions over `DayRecord[]`.

- **`lib/fsrs.ts` — `previewIntervalLabels()`, `reviewCard()`**
  FSRS algorithm wrappers. Logic depends on `ts-fsrs` but the wrapper mapping is testable.

- **`lib/proficiency.ts` — `computeProficiency()`**
  CEFR band mapping. Pure lookup with boundary math.

- **`lib/copy.ts`**
  Warm-copy message helpers. Purely deterministic on their inputs.

### Medium Priority

- **`app/api/sync/route.ts`** — Integration test for the sync pipeline (would require mocking Google Docs API and Anthropic SDK).
- **`app/api/cards/due/route.ts`** — Query logic for FSRS-due cards with filtering, sequencing, and session capping.
- **`components/StudySession.tsx`** — Core interaction logic (queue management, undo, REQUEUE_GAP behavior). Complex React component that would benefit from React Testing Library tests.

### Low Priority (External Dependencies / UI)

- TTS provider switching (`lib/tts.ts`) — depends on external API calls.
- Google Docs fetch (`lib/google-docs.ts`) — requires real OAuth and a live Doc.
- Visual/animation components (`Sheet.tsx`, `ProgressRing.tsx`, `SwipeRow.tsx`).

---

## Recommended First Steps (If Adding Tests)

1. **Add Vitest** — compatible with TypeScript ESM, no config overhead with Next.js, and fast.
   ```bash
   npm install -D vitest @vitest/ui
   ```

2. **Start with pure lib modules** — `lib/card-key.ts`, `lib/sequence.ts`, `lib/sentence-match.ts` can each have a `lib/__tests__/` test file with zero mocking required.

3. **Test file placement** — Co-locate with source: `lib/__tests__/sequence.test.ts`, or use a top-level `__tests__/` directory. No convention is established yet; pick one and commit to it.

4. **Do NOT add tests for modules that import Prisma** without a mock strategy — the libSQL adapter requires a live database connection.

---

## CI Configuration

None. There is no `.github/workflows/`, no CircleCI, no pre-commit hooks beyond whatever the local git configuration provides. The only automated check on push is the Vercel build.
