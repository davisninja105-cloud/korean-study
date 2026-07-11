---
phase: 25-e2e-test-infrastructure-baselines
plan: 01
subsystem: testing
tags: [playwright, e2e, prisma, sqlite, tsx, next-js, vitest]

# Dependency graph
requires:
  - phase: 24-freshness-diagnosis-spike
    provides: scripts/diagnose-freshness.mts (DB guard, isRscRequest, simulateResume, auth cookie pattern — ported/superseded here)
provides:
  - "@playwright/test@1.61.1 installed, npm run test:e2e script"
  - "playwright.config.ts: prod-build webServer on loopback port 3100, setup+chromium projects, trace: retain-on-failure, line reporter, workers:1/fullyParallel:false/retries:0"
  - "e2e/helpers/test-db.ts + build-guard.ts: TEST_DB_URL single source of truth + assertLocalDb allow-list guard (E2E-03)"
  - "e2e/fixture.ts + e2e/seed.ts: deterministic D-13 fixture (2 lessons, 3 due, 3 mastered, 2 new cards, 1 dependency edge, 2 study days) + getTestPrisma/seedFixture/resetToBaseline"
  - "e2e/global-setup.ts + e2e/run-global-setup.ts: DB reset/push/WAL/seed/sanity-check, invoked via the local tsx binary at the front of webServer.command"
  - "e2e/auth.setup.ts: setup-project login via real POST /api/login -> storageState (D-10)"
  - "vitest.config.ts excludes e2e/** (E2E-01 discovery isolation)"
affects: [25-02-smoke-and-readers, 25-03-freshness-regression-specs, 26-freshness-fix]

# Tech tracking
tech-stack:
  added: ["@playwright/test@1.61.1", "tsx@^4.23.0 (devDependency)"]
  patterns:
    - "Isolated file: SQLite E2E test DB, absolute-path single source of truth (e2e/helpers/test-db.ts)"
    - "Allow-list DB guard (assertLocalDb) called at config-load time AND runtime, both defense-in-depth"
    - "Setup-project auth (storageState) instead of direct cookie injection"
    - "DB bootstrap runs via webServer.command's tsx wrapper, NOT via Playwright's globalSetup: hook (see Deviations)"

key-files:
  created:
    - playwright.config.ts
    - e2e/helpers/test-db.ts
    - e2e/helpers/build-guard.ts
    - e2e/fixture.ts
    - e2e/seed.ts
    - e2e/global-setup.ts
    - e2e/run-global-setup.ts
    - e2e/auth.setup.ts
  modified:
    - package.json
    - package-lock.json
    - vitest.config.ts
    - .gitignore

key-decisions:
  - "Task 1's package-legitimacy checkpoint was pre-approved by the human in a prior session (verified against npmjs.com/package/@playwright/test: Microsoft publisher, 44.7M weekly downloads, version parity with the already-vetted playwright package) — this execution proceeded directly through it per the retry note in the orchestrator's objective."
  - "playwright.config.ts does NOT wire globalSetup: — Playwright's own globalSetup hook loads .ts files via Node's native loader, which cannot resolve this project's tsconfig.json @/* path alias (lib/prisma.ts imports @/app/generated/prisma/client). The DB reset/push/seed instead runs via e2e/run-global-setup.ts, invoked through the tsx binary (which does resolve tsconfig paths) chained at the front of webServer.command."
  - "tsx added as an explicit devDependency (previously only implicitly available via npx per this repo's scripts/ convention) so this critical, automated bootstrap step never depends on ad-hoc npx package resolution."
  - "webServer.stdout: 'pipe' added — Playwright only forwards webServer stderr to the reporter by default; without this the [global-setup] ordering-check log lines would never appear in a captured run."
  - "New-card determinism: the 2 'new' fixture cards get no CardReview row at all (not state=0), because lib/study-cards.ts's pool query uses a to-one review relation filter that Prisma requires to both exist and match — no row means structural exclusion from both due and ahead scope, and from the due-count query."

patterns-established:
  - "e2e/helpers/test-db.ts: absolute TEST_DB_PATH/TEST_DB_URL, single source of truth for every DB connection in the harness"
  - "e2e/helpers/build-guard.ts: assertLocalDb allow-list, called at config-load AND runtime"
  - "resetToBaseline() pattern for future specs' test.beforeEach (deletes FK-safe order, reseeds)"

requirements-completed: [E2E-01, E2E-02, E2E-03, E2E-07]

coverage:
  - id: D1
    description: "@playwright/test@1.61.1 installed and pinned; npm run test:e2e script added"
    requirement: E2E-01
    verification:
      - kind: other
        ref: "npm ls @playwright/test reports exactly @playwright/test@1.61.1"
        status: pass
    human_judgment: false
  - id: D2
    description: "Vitest and Playwright test discovery are mutually exclusive (E2E-01)"
    requirement: E2E-01
    verification:
      - kind: unit
        ref: "npm test — 241 tests, 18 files, zero e2e/ paths discovered"
        status: pass
    human_judgment: false
  - id: D3
    description: "DB-isolation allow-list guard hard-fails on any non-file: DATABASE_URL, before any build/server/browser work (E2E-03)"
    requirement: E2E-03
    verification:
      - kind: other
        ref: "DATABASE_URL=libsql://fake npx playwright test --list exits 1 with FATAL message; DATABASE_URL=file:/tmp/whatever.db passes the guard (no FATAL)"
        status: pass
    human_judgment: false
  - id: D4
    description: "npx playwright test --project=setup boots a production build, seeds the isolated DB, and produces a reusable storageState with a ks_auth cookie via a real POST /api/login (E2E-02)"
    requirement: E2E-02
    verification:
      - kind: e2e
        ref: "npx playwright test --project=setup — 1 passed; playwright/.auth/user.json created and contains ks_auth"
        status: pass
    human_judgment: false
  - id: D5
    description: "Trace and line-reporter config in place; failed runs produce a retain-on-failure trace (E2E-07 — full trace-artifact proof deferred to Plan 03 where real failures exist per plan's <output> instructions)"
    requirement: E2E-07
    verification:
      - kind: other
        ref: "playwright.config.ts use.trace: 'retain-on-failure', reporter: 'line' — config present and loaded successfully in the setup-project run"
        status: pass
    human_judgment: false
  - id: D6
    description: "Global setup ordering: DB reset/push/WAL/seed/sanity-check runs before the Next.js production build, verified via captured log line ordering"
    verification:
      - kind: other
        ref: "captured run log shows [global-setup] Resetting/Pushing/WAL/Seeding lines, then post-seed sanity counts (8 cards: 3 due, 3 mastered), THEN the npm run build / npm run start output"
        status: pass
    human_judgment: false

duration: 41min
completed: 2026-07-11
status: complete
---

# Phase 25 Plan 01: E2E Harness Foundation Summary

**Playwright harness with an isolated file:-SQLite DB, allow-list DB guard, setup-project auth via real /api/login, and a D-13 seed fixture — first full production-build boot verified green (`npx playwright test --project=setup` exits 0)**

## Performance

- **Duration:** 41 min (commit-to-commit; excludes the pre-approved Task 1 checkpoint from a prior session)
- **Started:** 2026-07-11T22:02:29Z (approx, base commit)
- **Completed:** 2026-07-11T22:43:08Z
- **Tasks:** 3 (Task 1 checkpoint pre-approved; Tasks 2–3 executed)
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments
- `@playwright/test@1.61.1` installed and pinned; `playwright.config.ts` boots a real production build (`npm run build && npm run start`) on loopback port 3100 against an isolated `file:` SQLite DB
- DB-isolation allow-list guard (`assertLocalDb`) is structurally proven: a fake `libsql://` URL hard-fails with a FATAL message before any build/server/browser work occurs, verified by actually running the negative test
- Setup-project auth (`e2e/auth.setup.ts`) drives a real `POST /api/login` and produces a reusable `storageState` containing a genuine `ks_auth` cookie — no direct cookie injection
- Deterministic seed fixture (`e2e/fixture.ts` + `e2e/seed.ts`): 2 lessons, 3 due cards, 3 mastered cards, 2 new cards, 1 `CardDependency` edge, 2 `StudyDay` rows — post-seed sanity-checked against `FIXTURE` on every run
- Vitest and Playwright test discovery are proven mutually exclusive (`npm test` stays green with zero `e2e/` files discovered)
- All runtime artifacts (`e2e/.tmp/`, `playwright/.auth/`, `test-results/`, `playwright-report/`) are git-ignored and verified absent from `git status` after a real run
- Two non-obvious Playwright/tsx integration bugs diagnosed and fixed (see Deviations) — the harness's first full boot is genuinely green, not superficially green

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirm @playwright/test package legitimacy** — pre-approved in a prior session (worktree garbage-collected before any commit landed); this execution proceeded directly through the already-satisfied gate per the orchestrator's retry note. No commit for this task (nothing was built).
2. **Task 2: Install @playwright/test and build the config + isolation layer** — `7d46262` (feat)
3. **Task 3: Global setup, fixture, auth-setup project, and first full boot** — `543b7a9` (feat)

_Note: no TDD tasks in this plan._

## Files Created/Modified
- `playwright.config.ts` — root Playwright config: prod-build webServer, setup+chromium projects, DB guard, trace/reporter config
- `e2e/helpers/test-db.ts` — `TEST_DB_PATH`/`TEST_DB_URL` single source of truth
- `e2e/helpers/build-guard.ts` — `assertLocalDb` allow-list guard
- `e2e/fixture.ts` — `FIXTURE` constants, traceable seed shape for future specs
- `e2e/seed.ts` — `getTestPrisma`/`seedFixture`/`resetToBaseline`
- `e2e/global-setup.ts` — DB reset/push/WAL/seed/sanity-check, default export
- `e2e/run-global-setup.ts` — CLI wrapper invoking `global-setup.ts`'s default export via `tsx`
- `e2e/auth.setup.ts` — setup-project login via real `POST /api/login`
- `package.json` / `package-lock.json` — `@playwright/test`, `tsx` devDependencies, `test:e2e` script
- `vitest.config.ts` — `exclude: [...configDefaults.exclude, 'e2e/**']`
- `.gitignore` — `/playwright/.auth/`, `/playwright-report/`, `/test-results/`, `/e2e/.tmp/`

## Decisions Made

- **Task 1 checkpoint honored as pre-satisfied.** The orchestrator's objective explicitly stated the human had already approved the `@playwright/test` install in a prior session (verified against npmjs.com/package/@playwright/test), and that session's worktree was garbage-collected before any commit landed. This execution treated Task 1 as done and proceeded directly to the install — no re-block, per the retry note.
- **`globalSetup:` deliberately NOT wired in `playwright.config.ts`.** See Deviations below — this is the plan's own documented contingency ("if the observed order is inverted... STOP... move the reset/push/seed steps... record the finding in SUMMARY") triggered for real, with a more precise root cause than the plan anticipated.
- **`tsx` promoted from an implicit npx-resolved tool to an explicit devDependency**, scoped to this plan's new automated bootstrap path only — `scripts/local-resync.mts`'s existing `npx tsx` convention is untouched.
- **`webServer.stdout: 'pipe'`** added so the ordering-check acceptance criterion (informational `[global-setup]` log lines visible before the build output) is actually satisfied — Playwright's default only forwards stderr.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing generated Prisma client in fresh worktree checkout**
- **Found during:** Task 2 verification (`npm test`)
- **Issue:** `app/generated/prisma/client` did not exist in this freshly-provisioned worktree (never had `prisma generate` run), causing all Prisma-dependent Vitest suites to fail with `Cannot find package '@/app/generated/prisma/client'`.
- **Fix:** Ran `npx prisma generate`.
- **Files modified:** none tracked (generated output is gitignored: `/app/generated/prisma`)
- **Verification:** `npm test` — 241 tests / 18 files pass afterward.
- **Committed in:** n/a (generated artifact, not committed)

**2. [Rule 1 - Bug] `reducedMotion` is not a top-level `use` option in this installed `@playwright/test` version**
- **Found during:** Task 3 (first full `--project=setup` boot; caught by `next build`'s project-wide typecheck)
- **Issue:** `use: { reducedMotion: 'reduce' }` (per 25-PATTERNS.md's literal shape) fails TypeScript compilation — this version's `PlaywrightTestOptions` interface nests `reducedMotion` under `contextOptions`, not as a top-level key.
- **Fix:** Changed to `use: { contextOptions: { reducedMotion: 'reduce' } } }`.
- **Files modified:** `playwright.config.ts`
- **Verification:** `next build`'s typecheck step passes.
- **Committed in:** `543b7a9`

**3. [Rule 4 → resolved via plan's own contingency, not an architectural question requiring a new checkpoint] `globalSetup` runs AFTER webServer's build starts, not before**
- **Found during:** Task 3 (first full `--project=setup` boot)
- **Issue:** `npm run build` failed prerendering `/_not-found` with `ConnectionFailed` against the isolated test DB — because the DB file did not exist yet when the build ran. Investigation (reading `node_modules/playwright/lib/runner/index.js`'s `createGlobalSetupTasks()`) confirmed the webServer plugin's `setup()` task — which spawns and blocks on `npm run build && npm run start` — runs strictly BEFORE the config's `globalSetup:` file, the reverse of the plan's ORDERING CHECK assumption. This is exactly the contingency the plan anticipated ("if the observed order is inverted... STOP... move the reset/push/seed steps into a first project that runs before setup instead") — except tracing the task-runner further showed that a "first project" restructure would not actually help either: ALL project-based tests, like `globalSetup`, also run strictly after `pluginSetupTasks` (webServer) completes in this Playwright version.
- **Deeper finding:** a second, independent bug compounds this — Playwright's own `globalSetup:` config hook loads its target file via Node's NATIVE module loader, which does not understand this project's `tsconfig.json` `@/*` path alias. Every attempt to load `e2e/global-setup.ts` that way (which transitively imports `lib/prisma.ts`, which imports `@/app/generated/prisma/client`) throws `Cannot find module '@/app/generated/prisma/client'` — confirmed via the failing stack trace (`node:internal/modules/esm/loader` → `Object.setup` in `createGlobalSetupTask`). `tsx` (used to invoke the wrapper) correctly resolves tsconfig paths; Node's native loader does not.
- **Fix:** (a) Created `e2e/run-global-setup.ts`, a thin CLI wrapper around `global-setup.ts`'s default export, invoked via the local `tsx` binary (`tsx --tsconfig ./tsconfig.json e2e/run-global-setup.ts`) chained at the FRONT of `webServer.command`, before `npm run build`. (b) Removed `globalSetup:` from `playwright.config.ts` entirely — wiring it would only ever fail given finding (2), and the actual DB bootstrap now happens reliably via (a). (c) Added `tsx` as an explicit devDependency so this automated path never depends on ad-hoc `npx` resolution. (d) Added `webServer.stdout: 'pipe'` and flush-safe `logFlushed()` writes in `global-setup.ts` so the milestone log lines are deterministically visible in the captured run output (Node's async pipe-write behavior on macOS was intermittently dropping plain `console.log` lines emitted immediately before a blocking `execSync` call).
- **Files modified:** `playwright.config.ts`, `e2e/run-global-setup.ts` (new), `e2e/global-setup.ts`, `package.json`, `package-lock.json`
- **Verification:** `npx playwright test --project=setup` exits 0 across multiple repeated clean runs; captured log shows `[global-setup]` reset/push/WAL/seed/sanity-check lines strictly BEFORE the `npm run build`/`npm run start` output, matching the plan's ordering-check acceptance criterion; `playwright/.auth/user.json` created with a `ks_auth` cookie; port 3100 unbound after teardown.
- **Committed in:** `543b7a9`

---

**Total deviations:** 3 auto-fixed (1 missing-artifact/Rule 3, 1 bug/Rule 1, 1 blocking-issue/Rule 3 with a documented architectural-adjacent finding resolved via the plan's own named contingency rather than a fresh Rule 4 checkpoint)
**Impact on plan:** All three were necessary to reach a genuinely green first boot. The `globalSetup` finding is the most consequential — it changes *how* the harness bootstraps (via `webServer.command`'s `tsx` wrapper instead of Playwright's own `globalSetup:` hook) but does not change what Plans 02/03 consume (`resetToBaseline()`, `FIXTURE`, `getTestPrisma()` all have their originally-planned signatures and behavior). No scope creep — no production code (`app/`, `components/`, `lib/`, `prisma/schema.prisma`) was touched.

## Issues Encountered

Beyond the three deviations above, no unresolved issues. Debugging the `globalSetup` finding required several rounds of standalone `child_process.spawn` reproductions to isolate the root cause from red herrings (an initial hypothesis about "nested npx resolution" turned out to be a secondary robustness improvement, not the actual blocker — the real cause was Node's native loader vs. tsx's tsconfig-paths resolution, confirmed via the failing stack trace).

## User Setup Required

None — no external service configuration required. The harness runs with zero required `.env.test` (in-code fallback secrets: `e2e-test-secret` / `e2e-test-password`).

## Next Phase Readiness

- The harness foundation is real and proven: Plans 02/03 can write specs against `resetToBaseline()`, `FIXTURE`, `getTestPrisma()`, `e2e/helpers/rsc.ts`-shaped helpers (not yet created — Plan 02 scope), and the `chromium` project's `storageState`-based auth.
- `e2e/helpers/readers.ts`, `e2e/smoke.spec.ts` (Plan 02), and the freshness-regression spec files (Plan 03) are unblocked.
- No blockers for Plan 02. One informational note for Plan 03: the `webServer.command`'s `tsx` wrapper now handles ALL DB bootstrap — any future spec-level DB reset (`resetToBaseline()` in `test.beforeEach`) uses the SAME `getTestPrisma()` singleton and is unaffected by this plan's `globalSetup:` finding, since specs never go through Playwright's `globalSetup` hook themselves.

---
*Phase: 25-e2e-test-infrastructure-baselines*
*Completed: 2026-07-11*
