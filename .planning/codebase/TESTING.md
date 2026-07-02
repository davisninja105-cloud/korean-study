# Testing Patterns
_Last updated: 2026-07-01 (v1.2 Performance & Snappiness)_

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

| File | Covers | Test count |
|------|--------|-----------|
| `tests/card-key.test.ts` | `lib/card-key.ts` — `normalizeFront()` | 7 |
| `tests/habit.test.ts` | `lib/habit.ts` — `computeStreaks()`, `computeFreezeBudget()`, etc. | 17 |
| `tests/known-words.test.ts` | `lib/known-words.ts` — `countUnknownWords()` | 5 |
| `tests/proficiency.test.ts` | `lib/proficiency.ts` — `computeProficiency()` | 6 |
| `tests/sentence-match.test.ts` | `lib/sentence-match.ts` — match/blank-safety rules | 11 |
| `tests/sequence.test.ts` | `lib/sequence.ts` — `sequenceCards()`, `selectSessionCards()` | 12 |

**Total: 58 tests, 6 files.**

---

## What Is Verified

### Automated

- **Vitest (`npm test`):** the 58 tests above — pure function behavior only, no DB/API/component involved.
- **TypeScript (`npm run build` / `npx tsc --noEmit`):** full strict-mode type-check. Catches type errors, not runtime logic bugs.
- **ESLint (`npm run lint`):** `eslint-config-next` (core-web-vitals + TypeScript rules), zero errors is the baseline. Catches React hooks violations (`react-hooks/purity`, `react-hooks/set-state-in-effect`), unused variables, and TypeScript-specific issues.

### Manual / Not Automatable

- **API routes** (`app/api/*/route.ts`) — no integration tests; verified by manual browser exercise or production observation.
- **React components** — no component/rendering tests (no React Testing Library, no `@testing-library/react` installed).
- **RSC hydration / paint-timing behavior (v1.2):** claims like "no blank flash on first paint" or "no perceptible jitter between grade tap and next card" are runtime, human-observable properties — they cannot be verified by `tsc`/ESLint/Vitest, only by running a production build (`npm run build && npm start`) and watching the browser. This was a recurring gap during the v1.2 milestone: 2 of 4 phases shipped without a live browser check closing these claims (see `.planning/RETROSPECTIVE.md` — "v1.2 — Performance & Snappiness" section).
- **Operational scripts (`scripts/`)** serve as informal integration smoke tests: `local-resync.mts` exercises the full Google Docs → Claude → DB pipeline; `relink-dependencies.mjs` and `find-duplicates.mjs` validate data-integrity invariants after a bulk operation.

### Production Deployment as Verification

`git push origin main` triggers automatic Vercel deployment. The deploy either succeeds (build passes, including the type-check) or fails with a build error — the Vercel build log is the only CI-like feedback beyond local `npm run build`/`npm run lint`/`npm test`.

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

- **Co-location vs. top-level `tests/`:** the existing convention is a single top-level `tests/` directory, one file per `lib/` module, named `<module>.test.ts`. Follow this pattern rather than introducing `lib/__tests__/`.
- **Do NOT add tests for modules that import Prisma** (`lib/study-cards.ts`, `lib/dashboard.ts`, any `app/api/*/route.ts`) without first deciding on a mock/test-DB strategy — the libSQL adapter requires a live database connection and none of the existing tests set one up.
- **For RSC/paint-timing assertions**, the existing suite cannot help — this needs either Playwright (not installed) or continued reliance on the manual production-build browser check documented in `CLAUDE.md` and the phase VERIFICATION.md files under `.planning/milestones/v1.2-phases/`.

---

## CI Configuration

None. There is no `.github/workflows/`, no CircleCI, no pre-commit hooks beyond whatever the local git configuration provides. The only automated check on push is the Vercel build, which runs `prisma generate && next build` (type-check + production build) — it does **not** run `npm test` or `npm run lint`.
