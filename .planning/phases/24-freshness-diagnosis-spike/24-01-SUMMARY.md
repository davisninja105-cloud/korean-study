---
phase: 24-freshness-diagnosis-spike
plan: 01
subsystem: tooling
tags: [playwright, diagnosis-spike, prod-server-orchestration, e2e-plumbing]
dependency-graph:
  requires: []
  provides:
    - scripts/diagnose-freshness.mts (plumbing + smoke; Plan 24-02 extends with the 16-cell matrix)
    - playwright devDependency + Chromium binary
  affects:
    - .planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md (Plan 24-02's deliverable, built on this plumbing)
tech-stack:
  added:
    - playwright ^1.61.1 (devDependency, raw library — not @playwright/test)
  patterns:
    - Env-first dynamic import (process.env override before `await import('../lib/prisma.js')`)
    - assertLocalDb() hard-fail guard, run twice (script start + right before server spawn)
    - Single childEnv object shared by both `npm run build` and `npm run start` child processes
key-files:
  created:
    - scripts/diagnose-freshness.mts
    - .planning/phases/24-freshness-diagnosis-spike/deferred-items.md
  modified:
    - package.json (playwright added to devDependencies)
    - package-lock.json
decisions:
  - "Removed --skip-generate from `prisma db push` (Rule 3 auto-fix) — this repo's installed Prisma CLI 7.6.0 rejects that flag; harmless since `npm run build` already runs `prisma generate` itself"
  - "Due-count smoke selector: `span.text-reward.text-6xl` (first match) — the exact class combo from components/HomeClient.tsx:207, reused as-is by Plan 24-02"
metrics:
  duration: "~45 minutes"
  completed: 2026-07-11
status: complete
---

# Phase 24 Plan 01: Playwright install + diagnose-freshness.mts plumbing Summary

Installed `playwright` ~1.61.1 as a raw-library devDependency (behind an already-approved blocking human-verify checkpoint) and built the throwaway `scripts/diagnose-freshness.mts` script: a DB-isolation hard-fail guard, an isolated `file:` SQLite seed, production-server build+start orchestration sharing one env object, deterministic `ks_auth` cookie injection via `lib/auth.ts`, and an end-to-end smoke check — all verified working on a real run.

## What Was Built

- **`playwright@1.61.1`** installed as a devDependency (`npm install -D playwright` + `npx playwright install chromium`). No `playwright.config.ts`, no `tests-e2e/` directory — Phase 25 owns those conventions (D-01).
- **`scripts/diagnose-freshness.mts`** — the throwaway plumbing script, structured exactly per the plan's 12-step action list:
  1. Header comment identifying it as a Phase 24 throwaway script, never the Phase 25 harness.
  2. Module constants: `DIAG_PORT=3200`, `BASE_URL`, `TEST_DB_PATH` (absolute, via `fileURLToPath`), `TEST_DB_URL`, `THROWAWAY_SECRET`.
  3. Env override (`DATABASE_URL`/`AUTH_SECRET`/`APP_PASSWORD` to throwaway values, `DATABASE_AUTH_TOKEN` deleted) — runs before any dynamic import of `lib/prisma.js`/`lib/auth.js`.
  4. `assertLocalDb(url)` — hard-fails (`process.exit(1)`) on any `libsql://` URL; called at script start and again on `childEnv.DATABASE_URL` immediately before the server spawn.
  5. Fresh-run reset: `mkdirSync(scripts/.tmp, {recursive:true})` + `rmSync(TEST_DB_PATH, {force:true})`.
  6. Schema setup via `npx prisma db push --accept-data-loss` (see Deviations — `--skip-generate` was dropped).
  7. Seed: 1 `Lesson`, 3 `Card`s (안녕/hello, 학교/school, 감사하다/to thank) each with one blank-safe `Sentence` and a nested `review: { create: { state: 1, stability: 1, difficulty: 5, nextReview: <1 min ago> } } }` — all fields verified against the full `CardReview` model in `prisma/schema.prisma` (Open Question #2 — no missing required fields; everything else uses schema defaults).
  8. Build: one `childEnv` object shared by both child processes; `npm run build` output captured and parsed for the `ƒ`/`○` route markers; asserts `/`, `/cards`, `/study`, `/habits` are all dynamic before any browser work.
  9. Start + `waitForServer()` polling `${BASE_URL}/login` every 500ms (60s timeout, no fixed sleep).
  10. Browser + auth: `chromium.launch({headless:true})`, `context.addCookies` with `AUTH_COOKIE` (imported, not hardcoded) and `computeAuthToken()`.
  11. Smoke check: loads `/`, asserts final pathname is `/` (not `/login`), computes the expected due count live via `prisma.cardReview.count({ where: { nextReview: { lte: new Date() } } })`, locates the Home hero due-count element, prints its full text, asserts it matches.
  12. Teardown in a `finally` block: closes the browser, sends `SIGTERM` to the server child (with a 5s `SIGKILL` fallback) and awaits exit, disconnects Prisma, exits `0`/`1`.

## Smoke-Run Output (verified real run)

```
Route dynamic-rendering check (Pitfall 4 sanity gate):
    ✓ / — dynamic (ƒ)
    ✓ /cards — dynamic (ƒ)
    ✓ /study — dynamic (ƒ)
    ✓ /habits — dynamic (ƒ)
  ✓ All four routes confirmed dynamic
...
  ✓ Landed on / (not redirected to /login — cookie auth worked)
  Matched due-count element text: "3"

SMOKE OK: due count = 3 (matches live query of 3)
...
Diagnosis plumbing run: SUCCESS
```

## Selector for Plan 24-02

The Home due-count anchor is `span.text-reward.text-6xl` (first match) — the exact class combo at `components/HomeClient.tsx:207` (`<span className="text-6xl font-bold leading-none text-reward">{stats.dueCards}</span>`). Confirmed unique on the page during the smoke run; Plan 24-02 can reuse this selector directly for its Home-route due-count assertions.

## CardReview Seed-Field Resolution (Open Question #2)

The full `CardReview` model in `prisma/schema.prisma` was read before writing the seed. All fields beyond `state`/`stability`/`difficulty`/`nextReview` (`elapsedDays`, `scheduledDays`, `reps`, `lapses`) default to `0`; `lastReview` is nullable and omitted. No corrections were needed versus the illustrative example in `24-RESEARCH.md` — the schema-verified nested create is:

```typescript
review: {
  create: {
    state: 1,
    stability: 1,
    difficulty: 5,
    nextReview: new Date(Date.now() - 60_000), // due 1 min ago
  },
},
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `prisma db push --skip-generate` rejected by installed Prisma CLI**
- **Found during:** Task 3, first script run
- **Issue:** The plan's action step specified `npx prisma db push --skip-generate --accept-data-loss`, but this repo's installed Prisma CLI (7.6.0) does not recognize `--skip-generate` on the `db push` subcommand (`! unknown or unexpected option: --skip-generate`), failing the whole run before any seeding.
- **Fix:** Dropped `--skip-generate`, keeping `--accept-data-loss`. Harmless — `npm run build`'s own `prisma generate && next build` step (invoked later in the same script) regenerates the client regardless, so there is no functional loss from letting `db push` also (redundantly, cheaply) attempt generation.
- **Files modified:** `scripts/diagnose-freshness.mts`
- **Commit:** `ff806d3`

No other deviations — the rest of the plan executed as written, and the full run succeeded on the first attempt after this one-line fix.

## Auth Gates

Task 1's blocking `checkpoint:human-verify` gate (playwright package legitimacy) was already satisfied in a prior session before this execution began — the human explicitly reviewed npmjs.com/package/playwright and typed "approved" (confirmed official microsoft/playwright, 65.4M weekly downloads, latest publish 2026-06-23, version ~1.61.x). This retry dispatch treated that approval as still valid and proceeded directly to Task 2 without re-presenting the checkpoint, per the retry_context provided by the orchestrator.

## Known Stubs

None — this plan produces a throwaway diagnostic script, not application UI; there is no stubbed data flow to track.

## Threat Flags

None beyond what the plan's `<threat_model>` already covers (T-24-SC, T-24-01, T-24-02, T-24-03) — no new network endpoints, auth paths, or schema changes were introduced. `assertLocalDb()` and the throwaway-secret env overrides implement T-24-01/T-24-02 exactly as specified; the seeded `scripts/.tmp/24-diagnosis.db` file is confirmed gitignored via the existing blanket `*.db` rule (T-24-03).
