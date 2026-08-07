---
phase: 30-instant-feedback-cold-start-unblocking
plan: 03
subsystem: infra
tags: [pwa, manifest, vercel, region, playwright, e2e, perf]

# Dependency graph
requires: []
provides:
  - "app/manifest.ts background_color/theme_color matching dark chrome (#0b0f1a)"
  - "tests/manifest.test.ts unit coverage for manifest() output"
  - "e2e/perf.spec.ts per-route PAGE_BUDGETS_MS map, /habits tightened to 1500ms"
affects: [31-cards-pagination, 32-study-round-trips, 33-freshness-backstop]

# Actuals (#2632)
actuals:
  tokens: 900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - tests/manifest.test.ts
  modified:
    - app/manifest.ts
    - e2e/perf.spec.ts

key-decisions:
  - "Task 2 (REGION-01 — pin Vercel function region to Turso's primary region) is BLOCKED, not completed. Its precondition (`turso` CLI authenticated) is unmet in this sandboxed worktree environment — `turso auth login` requires an interactive browser OAuth flow this agent cannot complete. Per the executor's precondition protocol, unmet preconditions are never auto-approved; Task 2 was left undone rather than guessing/hardcoding a region value, which the plan explicitly forbids (\"never copy-pasted from 30-RESEARCH.md's illustrative table alone\")."
  - "Tasks 1 and 3 have no dependency on Task 2 and were completed and committed independently."

patterns-established: []

requirements-completed: [PERCEPT-02]
# REGION-01 intentionally NOT listed — Task 2 is blocked, see Deviations/Issues below.

coverage:
  - id: D1
    description: "app/manifest.ts background_color/theme_color changed to '#0b0f1a', matching dark chrome; tests/manifest.test.ts verifies the change and that all other manifest fields are unchanged"
    requirement: "PERCEPT-02"
    verification:
      - kind: unit
        ref: "tests/manifest.test.ts — npm test -- manifest"
        status: pass
    human_judgment: false
  - id: D2
    description: "vercel.json regions field pinned to the Vercel code matching Turso's actual primary region for korean-study"
    requirement: "REGION-01"
    verification: []
    human_judgment: true
    rationale: "BLOCKED — not implemented. turso CLI is unauthenticated in this sandboxed worktree (`turso auth login` requires an interactive browser flow unavailable here). The plan requires a live `turso db show korean-study` lookup, never a guessed/hardcoded value. A human must either authenticate the turso CLI and rerun this task, or supply the actual Turso primary region directly."
  - id: D3
    description: "e2e/perf.spec.ts PAGE_BUDGET_MS single constant replaced by a per-route PAGE_BUDGETS_MS map; /habits tightened to 1500ms, /, /study, /cards held at 3000ms"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts — 8/8 passed"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-06
status: blocked
---

# Phase 30 Plan 03: Manifest colors + perf budget map shipped; Vercel region pin BLOCKED

**`app/manifest.ts` now matches the app's dark chrome (`#0b0f1a`) eliminating the PWA cold-launch white flash, and `e2e/perf.spec.ts` enforces a tightened 1500ms `/habits` budget as the phase 30 re-measurement baseline — but the Vercel region pin (REGION-01) is BLOCKED on an unauthenticated `turso` CLI in this sandboxed environment.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-06T17:20:00Z (approx)
- **Completed:** 2026-08-06T17:55:00Z (approx)
- **Tasks:** 2 of 3 completed (Task 2 blocked)
- **Files modified:** 3

## Accomplishments
- PWA manifest `background_color`/`theme_color` now both `'#0b0f1a'`, matching `app/layout.tsx`'s dark `viewport.themeColor` entry and dark `--background` — closes the white splash-frame flash on Android/Chrome PWA installs (PERCEPT-02)
- New `tests/manifest.test.ts` (3 tests) proving the color change and that no other manifest field regressed
- `e2e/perf.spec.ts`'s single `PAGE_BUDGET_MS` constant replaced with a typed `PAGE_BUDGETS_MS` map; `/habits` tightened to 1500ms (D-05), `/`, `/study`, `/cards` held at 3000ms (D-06) — verified live: `/habits` samples ran 16–32ms, comfortably under budget
- **Task 2 (REGION-01) NOT completed** — see Deviations below

## Task Commits

Each completed task was committed atomically:

1. **Task 1: PWA manifest colors match dark theme (PERCEPT-02)** - `93c99ab` (feat)
2. **Task 2: Pin Vercel function region to Turso's primary region (REGION-01)** - NOT DONE (blocked, no commit)
3. **Task 3: Per-route perf budget map — tighten /habits, hold others (D-05, D-06)** - `2fef250` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/manifest.ts` - `background_color`/`theme_color` changed `#f9fafb`/`#3b82f6` → `#0b0f1a`
- `tests/manifest.test.ts` - new Vitest unit test (3 cases) calling `manifest()` directly
- `e2e/perf.spec.ts` - `PAGE_BUDGET_MS` constant replaced by `PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number>`; loop and assertion re-target the per-route map

## Decisions Made
- Task 2 left undone rather than guessing a Turso region or hardcoding a plausible-looking value — the plan explicitly requires a **live** `turso db show korean-study` lookup and forbids reusing any prior-session value. Guessing would silently mis-pin the region and defeat REGION-01's entire purpose (T-30-08 in the plan's own threat register).
- Tasks 1 and 3 have zero dependency on Task 2 (`depends_on: []`, independent `<files>`), so they were completed and committed normally rather than blocking the whole plan on the earliest blocker.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored missing `node_modules/.bin/tsx` symlink**
- **Found during:** Task 3 verification (`npx playwright test e2e/perf.spec.ts`)
- **Issue:** This worktree's `node_modules/.bin/` directory did not exist (pre-existing worktree provisioning gap, unrelated to this plan's file changes). `e2e/seed.ts`'s `resetToBaseline()` calls `execFileSync(path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx'), ...)`, which bypasses PATH/npx resolution and fails with `ENOENT` when that exact path is missing.
- **Fix:** Created `node_modules/.bin/tsx` as a symlink to the already-installed `tsx` package at the main repo root (`/Users/main/Documents/claude-test/node_modules/tsx/dist/cli.mjs`) — this mirrors exactly what `npm install` would have produced; no package was installed or downloaded.
- **Files modified:** none tracked by git (`node_modules/` is gitignored)
- **Verification:** `node_modules/.bin/tsx --version` succeeded; `npx playwright test e2e/perf.spec.ts` subsequently ran to completion
- **Committed in:** N/A (gitignored, not part of any task commit)

**2. [Rule 3 - Blocking] Ran `npx prisma generate`**
- **Found during:** Task 3 verification (`npx playwright test e2e/perf.spec.ts`)
- **Issue:** `app/generated/prisma` (the Prisma client output directory) did not exist in this worktree, causing `Cannot find module '@/app/generated/prisma/client'` when the E2E harness's global-setup script imported `lib/prisma.ts`.
- **Fix:** Ran `npx prisma generate` (standard, documented command in `CLAUDE.md` — "Regenerate Prisma client after schema changes" / part of `npm run build`'s `prebuild`). No schema was modified.
- **Files modified:** none tracked by git (`app/generated/` is gitignored)
- **Verification:** Subsequent Prisma imports resolved correctly; E2E harness's global-setup and build steps proceeded
- **Committed in:** N/A (gitignored)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking environment-provisioning gaps, neither touched any git-tracked file)
**Impact on plan:** Both fixes were required only to run the plan's own `<verify>` commands in this sandboxed worktree; they restore standard local dev-environment state (`npm install`/`prisma generate` equivalents) and introduce no code or behavior change.

## Issues Encountered

**Task 2 is blocked and was not completed.** The task's `<precondition>` (`turso` CLI authenticated — `turso db list` succeeds) is unmet: `turso auth login` requires visiting `https://api.turso.tech?redirect=false` in an interactive browser and completing an OAuth flow, which is unavailable to this agent in this sandboxed worktree session. A `~/Library/Application Support/turso/settings.json` file exists but does not contain a currently-valid session (`turso db list` still reports "You are not logged in").

Per the executor's precondition protocol, this is **never auto-approved** — the region value must come from a live `turso db show korean-study` lookup, and guessing/hardcoding would silently defeat REGION-01's purpose (confirmed cross-region latency risk) while looking superficially done. Rather than fabricate a plausible region code, Task 2 (and only Task 2) was left incomplete.

**To unblock:** a human with access to an authenticated terminal (per `STATE.md`/`30-CONTEXT.md`, `turso` is described as the user's normally-authenticated tool in the real dev environment) should either:
1. Run `turso auth login` in their normal terminal, then `turso db show korean-study`, read the `TYPE=primary` row's `LOCATION` column, map it through the table in `30-RESEARCH.md` § Code Examples § "Turso ↔ Vercel region mapping", and add `"regions": ["<vercel-code>"]` to `vercel.json` (sibling to the existing `"crons"` array) — or
2. Supply the actual Turso primary-region code directly so it can be mapped and written without a live CLI call.

## Next Phase Readiness
- PERCEPT-02 (manifest colors) and the `/habits` perf-budget tightening (D-05/D-06) are shipped and verified — no blockers for Phase 31/32 work.
- REGION-01 remains open. It has zero dependents inside this plan or phase (no other Phase 30 deliverable reads `vercel.json`), so it does not block phase closeout mechanically, but the phase's stated goal ("pin the Vercel function region") is not yet met until Task 2 lands.
- Recommend re-running Task 2 in a session with an authenticated `turso` CLI, or having the user supply the region value directly, before considering Phase 30 fully complete.

---
*Phase: 30-instant-feedback-cold-start-unblocking*
*Completed: 2026-08-06 (partial — Task 2 blocked)*
