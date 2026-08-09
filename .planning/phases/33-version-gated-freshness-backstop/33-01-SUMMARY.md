---
phase: 33-version-gated-freshness-backstop
plan: 01
subsystem: performance
tags: [nextjs, prisma, freshness, cache-invalidation, playwright, vitest]

# Dependency graph
requires:
  - phase: 32-study-load-round-trip-collapse
    provides: bumpStudyCacheVersion() opaque-token upsert precedent in lib/settings.ts, reused for the dataVersion shape
provides:
  - "GET /api/version endpoint returning { version } sourced from a dataVersion Setting row"
  - "getDataVersion()/bumpDataVersion()/nextDataVersionToken() in lib/settings.ts"
  - "dataVersion bump wired into POST /api/review (tx-scoped) and lib/sync.ts:runSync() (unconditional, non-fatal)"
  - "FreshnessWatcher's JSON backstop gated behind a version check; router.refresh() stays unconditional"
affects: [34-local-first-cache, 35-offline-queue]

actuals:
  tokens: 8610
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Opaque, upsert-only change token (plain String(Date.now()), no random suffix) for a numerically-comparable, publicly-served counter — divergent from bumpStudyCacheVersion()'s random-suffixed internal token"
    - "Transaction-scoped Setting upsert co-located with a write's existing prisma.$transaction() block so a rollback also rolls back the version bump"
    - "Module-internal fetch function taking a React state setter as a parameter, extracted from a component closure so a version-gate wrapper can call it conditionally without duplicating its body"

key-files:
  created:
    - app/api/version/route.ts
    - e2e/freshness-version-gate.spec.ts
    - tests/version-route.test.ts
  modified:
    - lib/settings.ts
    - app/api/review/route.ts
    - components/FreshnessWatcher.tsx
    - lib/sync.ts

key-decisions:
  - "dataVersion token is a plain String(Date.now()) with no random suffix (unlike studyCacheVersion), so a later numeric-comparison consumer (Phase 34's LOCAL-02) can compare with `>` directly without stripping a suffix — the upsert alone (not the suffix) is what prevents the lost-update race."
  - "The review-write bump lives inside app/api/review/route.ts's existing prisma.$transaction() block via tx.setting.upsert(), not the top-level bumpDataVersion() helper, so it rolls back together with StaleReviewError/CardReviewNotFoundError and is skipped entirely by the idempotent duplicate-idempotencyKey replay path."
  - "FreshnessWatcher's mount-time /api/version baseline seed assigns lastVersionRef.current ONLY when it is still null, and fetchBackstop() treats a still-null ref as 'assume fresh, skip' rather than 'always fetch' — a boundary event racing the baseline seed can never corrupt it or force an unnecessary fetch."

patterns-established:
  - "Extracting a component's inner closure into a module-scope function that takes the relevant state setter as a parameter, so a new gating layer can wrap the call site without touching (or duplicating) the extracted function's body."

requirements-completed: [VERS-01, VERS-02]

coverage:
  - id: D1
    description: "GET /api/version serves a monotonic dataVersion counter that advances after a committed review write and after runSync() completion, and does not advance on an unrelated Setting write, a direct Card create, or a non-committing review request (404 / stale-review / idempotent duplicate replay)"
    requirement: "VERS-01"
    verification:
      - kind: integration
        ref: "tests/version-route.test.ts — all 7 cases (empty-DB default, sync bump, two-bump ordering, committed review + duplicate replay, 404 non-commit, setSessionSize lock, direct Card-create lock)"
        status: pass
    human_judgment: false
  - id: D2
    description: "FreshnessWatcher's JSON backstop skips the route payload re-fetch when GET /api/version reports no change, while router.refresh() still fires unconditionally; a real graded review re-opens the gate on the next resume"
    requirement: "VERS-02"
    verification:
      - kind: e2e
        ref: "e2e/freshness-version-gate.spec.ts — '/cards resume with no server-side change issues a version request and no payload re-fetch (VERS-02)' and '/study resume after a real graded review re-fetches the payload (VERS-01 + VERS-02)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "The version gate does not regress pre-existing freshness backstop coverage for cases the e2e harness simulates via direct-Prisma mutation (bypassing the real write routes this phase's counter is scoped to)"
    verification: []
    human_judgment: true
    rationale: "Confirmed regression (not a hypothesis): e2e/freshness-router-cache.spec.ts's '/study resume' and '/habits resume' tests now fail because their *Direct mutators never bump dataVersion, so the gate correctly stays closed and the pre-existing Next.js 16.2.1 delivery flake is no longer masked by the (now-gated) redundant JSON fetch. This is the exact risk 33-RESEARCH.md Pitfall 1 predicted before implementation, and its fix (bumping dataVersion inside e2e/helpers/mutate.ts's *Direct functions) is explicitly scoped to plan 33-02, not this plan — see Deviations below. A human/33-02 executor must confirm the full freshness-*.spec.ts suite is green again after 33-02 lands."

duration: 55min
completed: 2026-08-09
status: complete
---

# Phase 33 Plan 01: Version Counter, GET /api/version, and Gated FreshnessWatcher Backstop Summary

**A `dataVersion` Setting-table counter now backs `GET /api/version`, is bumped atomically by a committed review write and unconditionally at the end of every sync, and `FreshnessWatcher`'s redundant JSON payload re-fetch is skipped whenever that counter hasn't moved — while `router.refresh()` keeps firing on every boundary event exactly as before.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-09T00:26:18Z (approx., per STATE.md `last_updated`)
- **Completed:** 2026-08-09T00:43:05Z
- **Tasks:** 2/2 completed
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- Shipped a global, monotonic, opaque `dataVersion` change token (`lib/settings.ts`) using the same upsert-only pattern `bumpStudyCacheVersion()` established in Phase 32, but as a plain `String(Date.now())` (no random suffix) so a later numeric-comparison consumer can use it directly.
- `GET /api/version` (new route) serves that token, auto-inherits the existing `middleware.ts` auth gate with zero middleware changes.
- The counter is bumped from exactly two write paths per VERS-01's scope: inside `POST /api/review`'s existing transaction (rolls back together with a stale/not-found/duplicate-replay outcome) and unconditionally at the tail of `lib/sync.ts:runSync()` (non-fatal, logged, covers both the manual and cron sync triggers via one call site).
- `components/FreshnessWatcher.tsx`'s JSON backstop (`/api/cards/due`, `/api/cards`, `/api/activity`+`/api/stats`) is now version-gated: a "nothing changed" resume costs one tiny `/api/version` read instead of a full payload fetch, while `router.refresh()` remains completely unconditional (the sole reliable delivery path for `/` and the mechanism every pre-existing freshness e2e test still asserts network evidence against).
- New `e2e/freshness-version-gate.spec.ts` proves both sides of the gate end-to-end against a real dev-build server: a no-change `/cards` resume issues a version request and zero `/api/cards` payload requests while `router.refresh()`'s own fetch still lands; a real graded review through the study UI reopens the gate and a subsequent `/study` resume re-fetches `/api/cards/due`.
- New `tests/version-route.test.ts` (7 real-temp-SQLite integration tests) locks in the full VERS-01 write/non-write contract: empty-DB default `'0'`, the sync bump, two-consecutive-bump ordering, a committed review bump plus its idempotent duplicate-replay no-op, a 404 non-commit no-op, and two regression locks (`setSessionSize()` and a direct `Card` create must never move the counter).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a review write narrows the next resume" — one path only** - `f30ab31` (feat)
2. **Task 2: Widen the write side to sync completion and lock down what must NOT bump** - `b23c0df` (feat)

_Both tasks carried `tdd="true"`; each landed as a single commit containing its `<behavior>` proof (the e2e spec for Task 1, the vitest integration suite for Task 2) together with the implementation, per the plan's own task-level TDD framing rather than separate RED/GREEN commits._

**Plan metadata:** commit pending (this SUMMARY + config.json, see below)

## Files Created/Modified

- `lib/settings.ts` - Added `DATA_VERSION_KEY`, `nextDataVersionToken()`, `getDataVersion()`, `bumpDataVersion()`; registered `dataVersion` in `SETTING_KEYS`
- `app/api/version/route.ts` - New GET route serving `{ version }` from `getDataVersion()`
- `app/api/review/route.ts` - Added a `tx.setting.upsert()` dataVersion bump inside the existing `$transaction`, after the `ReviewLog` insert and before the read-back
- `components/FreshnessWatcher.tsx` - Extracted the pre-gate `fetchBackstop()` body into a module-internal `fetchRoutePayload()`; added a mount-time `/api/version` baseline seed (`lastVersionRef`) and rewrote `fetchBackstop()` as the version-gate check; extended (never removed) the existing dual-delivery doc comments and added the `TODO ... 16.2.1` re-test note
- `e2e/freshness-version-gate.spec.ts` - New Playwright spec: the closed-gate no-change case and the real-graded-review re-open case
- `lib/sync.ts` - Added a second, independent, non-fatal `bumpDataVersion()` call at the tail of `runSync()`, alongside the existing `bumpStudyCacheVersion()` call
- `tests/version-route.test.ts` - New real-temp-SQLite Vitest integration suite, 7 tests across two `describe` blocks (write-side bumps, locked non-bump regression guards)

## Decisions Made

- **Plain `String(Date.now())` token, no random suffix** (diverging from `bumpStudyCacheVersion()`'s `${Date.now()}-${randomSuffix}` shape) — the upsert alone prevents the lost-update race; the plain numeric string is what Phase 34's LOCAL-02 IndexedDB cache-key comparison will need to compare with `>` without stripping a suffix first. Carried forward from 33-RESEARCH.md Pattern 1 and locked by the plan's own `<reversibility rating="costly">` framing.
- **Review-write bump lives inline as `tx.setting.upsert()`, not a call to the top-level `bumpDataVersion()` helper** — a transaction-scoped write must use the `tx` client, and `bumpDataVersion()` (like every other setter in `lib/settings.ts`) writes through the top-level `prisma` singleton. `nextDataVersionToken()` was factored out as a pure token generator so both call sites produce the same kind of token without duplicating the `Date.now()` logic.
- **`fetchRoutePayload()` extracted to module scope, not left as a nested closure** — makes the "verbatim extraction, unchanged" plan requirement independently readable and testable in isolation from the new version-gate logic that now wraps it in `fetchBackstop()`.
- **A `null` `lastVersionRef` is treated as "assume fresh, skip"** (not "always fetch") for a boundary event that races the mount-time baseline seed — matches 33-RESEARCH.md Pitfall 2's recommendation (a) and every other route's RSC-hydration-is-truth pattern in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `nextDataVersionToken()` collision in the two-consecutive-bump test**
- **Found during:** Task 2, writing `tests/version-route.test.ts`
- **Issue:** Two `bumpDataVersion()` calls made back-to-back within the same test can both land on the same JS-engine millisecond (`Date.now()` resolution), producing identical tokens and failing the "two consecutive bumps produce different tokens" assertion — an artifact of the test's timing, not a real-world race (real bumps in this single-user app are seconds-to-minutes apart).
- **Fix:** Inserted a real 2ms `setTimeout` wait between the two calls in that one test case, with an inline comment explaining why.
- **Files modified:** `tests/version-route.test.ts`
- **Verification:** `npx vitest run tests/version-route.test.ts` — 7/7 passing, deterministically re-run 3× with no flake.
- **Committed in:** `b23c0df` (part of the Task 2 commit)

**2. [Rule 3 - Blocking issue] `tests/version-route.test.ts` unused `PrismaClient` type import**
- **Found during:** post-Task-2 `npm run lint` pass
- **Issue:** The file imported `PrismaClient` as a type but never used it (the `prisma` variable is typed `any` to match `review-route.test.ts`'s dynamic-import pattern for the singleton, not `PrismaClient` directly), tripping `@typescript-eslint/no-unused-vars`.
- **Fix:** Removed the unused type import.
- **Files modified:** `tests/version-route.test.ts`
- **Verification:** `npm run lint` — 0 errors, 1 pre-existing unrelated warning in `components/StudySession.tsx` (untouched by this plan).
- **Committed in:** `b23c0df` (part of the Task 2 commit)

**3. [Rule 3 - Blocking issue] Worktree missing its own `node_modules`, blocking `npx playwright test`**
- **Found during:** first `npx playwright test e2e/freshness-version-gate.spec.ts` attempt
- **Issue:** This worktree has no `node_modules/` of its own — `npm run lint`/`npm run build` succeed anyway because `npm run <script>` walks up the directory tree for `.bin` resolution and this worktree is nested inside the main repo, but `e2e/seed.ts:resetToBaseline()` hardcodes `path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')`, which does not do that walk-up. Confirmed pre-existing/environmental (not caused by this plan's changes) by reproducing the identical `ENOENT` on an untouched pre-existing spec (`e2e/smoke.spec.ts`).
- **Fix:** Symlinked this worktree's `node_modules` to the main repo's `node_modules` for the duration of verification, then removed the symlink once verification completed (it is gitignored and was never staged/committed — confirmed with `git status --short` before and after).
- **Files modified:** none (the symlink was never a tracked file)
- **Verification:** `npx playwright test e2e/freshness-version-gate.spec.ts` — 2/2 passing (plus the shared auth setup project).
- **Committed in:** N/A — no commit involved; the symlink was removed before this SUMMARY was written.

---

**Total deviations:** 3 auto-fixed (1 Rule 1, 2 Rule 3).
**Impact on plan:** All three are test-infrastructure/environment fixes necessary to produce a genuinely passing verification run; none touch production behavior or expand the plan's `files_modified` scope. No scope creep.

## Known Issues (Not Auto-Fixed — Explicitly Deferred to Plan 33-02)

Running the full pre-existing freshness e2e suite (`e2e/freshness-router-cache.spec.ts`, `e2e/freshness-fresh-paths.spec.ts`, `e2e/freshness-gate.spec.ts`, `e2e/freshness-client-shell.spec.ts`) alongside the new spec surfaced a **confirmed, pre-analyzed regression**:

- `e2e/freshness-router-cache.spec.ts`'s `/study resume` and `/habits resume` tests now fail (DOM-content poll timeout). Their mutation step (`flipOneReviewDueState` / `promoteOneReviewToMastered`, from `e2e/helpers/mutate.ts`) writes directly through Prisma in a subprocess and never calls `POST /api/review` or `POST /api/sync` — so it never bumps `dataVersion`. The version gate correctly stays closed, and the pre-existing (real, unfixed) Next.js 16.2.1 Suspense/Segment-Cache delivery flake — previously masked by the now-gated redundant JSON fetch — surfaces as a genuine test failure for these two routes.
- This is **exactly** the risk `.planning/phases/33-version-gated-freshness-backstop/33-RESEARCH.md`'s "Pitfall 1" predicted before any code was written, and its fix is **explicitly scoped to `33-02-PLAN.md`** (confirmed by reading that plan: it adds a `dataVersion` bump inside `e2e/helpers/mutate.ts`'s three `*Direct` mutators plus a version-advancing call in `freshness-fresh-paths.spec.ts`'s "Upsert-not-replace extension"), not to this plan's `files_modified` list.
- This plan's own `<verification>` section only requires `npx playwright test e2e/freshness-version-gate.spec.ts` (2/2 passing — confirmed) — it does not require the full freshness suite to stay green, precisely because that suite's fix is plan 33-02's job.
- **Action for whoever executes 33-02 (or the phase orchestrator):** re-run all 4 pre-existing `e2e/freshness-*.spec.ts` files after 33-02 lands and confirm they are green again — do not assume; RESEARCH.md's own warning-signs section is explicit that a green suite is not sufficient proof without confirming the gate is actually being exercised.

None of the above blocks this plan's own success criteria — both are documented here for full transparency per the "no green-but-vacuous" prohibition in this plan's `must_haves`.

## Issues Encountered

None beyond the three auto-fixed deviations above.

## User Setup Required

None — no external service configuration required. No `prisma/schema.prisma` change (confirmed via `git diff --exit-code prisma/schema.prisma`); no `middleware.ts` change (confirmed via `git diff --exit-code middleware.ts`).

## Next Phase Readiness

- `GET /api/version`'s `{ version: string }` shape and plain-numeric-string token format are locked and ready for Phase 34's LOCAL-02 IndexedDB cache-key consumer to compare directly.
- Plan 33-02 (already scaffolded in this phase directory as `33-02-PLAN.md`) is next: it must land before the phase can be considered fully verified, since it owns the fix for the Known Issue above.
- All 333 Vitest tests pass (`npm test`); `npm run lint` is clean (0 errors); `npm run build` succeeds.

---
*Phase: 33-version-gated-freshness-backstop*
*Completed: 2026-08-09*

## Self-Check: PASSED

- FOUND: `app/api/version/route.ts`
- FOUND: `e2e/freshness-version-gate.spec.ts`
- FOUND: `tests/version-route.test.ts`
- FOUND: commit `f30ab31` (Task 1)
- FOUND: commit `b23c0df` (Task 2)
