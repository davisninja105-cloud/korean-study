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
  - "vercel.json regions field pinned to pdx1 (matches Turso primary region aws-us-west-2)"
affects: [31-cards-pagination, 32-study-round-trips, 33-freshness-backstop]

# Actuals (#2632)
actuals:
  tokens: 1050
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - tests/manifest.test.ts
  modified:
    - app/manifest.ts
    - e2e/perf.spec.ts
    - vercel.json

key-decisions:
  - "Task 2 (REGION-01) was initially blocked mid-execution on an unauthenticated `turso` CLI in the sandboxed worktree; a human authenticated the CLI out-of-band (`turso auth login`), and this continuation session re-verified authentication live (`turso auth whoami` -> jasond28) before proceeding — the plan's precondition protocol requires a live re-check, not trusting a handed-off value."
  - "Live lookup (`turso db show korean-study`) returned `LOCATION: aws-us-west-2` for the primary instance — an AWS region identifier, not one of the 3-letter Fly.io codes (`iad`, `sjc`, `fra`, etc.) enumerated in 30-RESEARCH.md's Turso <-> Vercel mapping table. This is the plan's documented fallback case ('if the actual Turso code isn't in this table, pick the geographically nearest Vercel region... and record the reasoning in the plan SUMMARY')."
  - "Resolved to Vercel's `pdx1` (Portland, Oregon): per vercel.com/docs/regions, `pdx1` runs on underlying AWS region `us-west-2` — the exact same AWS region Turso reported, not merely the nearest by geography. This is an exact infrastructure match, the strongest possible resolution under the fallback rule."
  - "Tasks 1 and 3 had no dependency on Task 2 and were completed/committed independently in the prior session; Task 2 was completed standalone in this continuation session once its precondition was met."
  - "Consistent with Tasks 1/3's prior commits, this plan does not modify STATE.md/ROADMAP.md/REQUIREMENTS.md directly (worktree mode) — the orchestrator updates those centrally after merge."

patterns-established: []

requirements-completed: [PERCEPT-02, REGION-01]

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
    description: "vercel.json regions field pinned to the Vercel code matching Turso's actual primary region for korean-study (live lookup: aws-us-west-2 -> pdx1, exact AWS infra match)"
    requirement: "REGION-01"
    verification:
      - kind: static
        ref: "node -e check on vercel.json — single-element regions array, format /^[a-z]{3}[0-9]$/"
        status: pass
      - kind: manual
        ref: "turso auth whoami (jasond28) + turso db show korean-study (LOCATION: aws-us-west-2), run live in this session"
        status: pass
    human_judgment: false
  - id: D3
    description: "e2e/perf.spec.ts PAGE_BUDGET_MS single constant replaced by a per-route PAGE_BUDGETS_MS map; /habits tightened to 1500ms, /, /study, /cards held at 3000ms"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts — 8/8 passed"
        status: pass
    human_judgment: false

duration: ~50min (across two sessions; ~35min initial + ~15min continuation)
completed: 2026-08-06
status: complete
---

# Phase 30 Plan 03: Manifest colors, per-route perf budgets, and Vercel region pin — all complete

**`app/manifest.ts` now matches the app's dark chrome (`#0b0f1a`) eliminating the PWA cold-launch white flash; `e2e/perf.spec.ts` enforces a tightened 1500ms `/habits` budget as the phase 30 re-measurement baseline; and `vercel.json` pins the deployed function region to `pdx1`, an exact AWS infrastructure match for Turso's primary region (`aws-us-west-2`).**

## Performance

- **Duration:** ~50 min total (initial session ~35 min for Tasks 1/3; continuation session ~15 min for Task 2 once its precondition was met)
- **Started:** 2026-08-06T17:20:00Z (approx)
- **Completed:** 2026-08-06T18:10:00Z (approx)
- **Tasks:** 3 of 3 completed
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments
- PWA manifest `background_color`/`theme_color` now both `'#0b0f1a'`, matching `app/layout.tsx`'s dark `viewport.themeColor` entry and dark `--background` — closes the white splash-frame flash on Android/Chrome PWA installs (PERCEPT-02)
- New `tests/manifest.test.ts` (3 tests) proving the color change and that no other manifest field regressed
- `e2e/perf.spec.ts`'s single `PAGE_BUDGET_MS` constant replaced with a typed `PAGE_BUDGETS_MS` map; `/habits` tightened to 1500ms (D-05), `/`, `/study`, `/cards` held at 3000ms (D-06) — verified live: `/habits` samples ran 17–29ms, comfortably under budget
- `vercel.json`'s new `regions` field pins the deployed Vercel function to `pdx1`, matching Turso's actual primary region for `korean-study` (REGION-01) — resolved via a live `turso db show korean-study` lookup, not a guess or reused prior-session value

## Task Commits

Each completed task was committed atomically:

1. **Task 1: PWA manifest colors match dark theme (PERCEPT-02)** - `93c99ab` (feat)
2. **Task 2: Pin Vercel function region to Turso's primary region (REGION-01)** - `972fd6b` (feat)
3. **Task 3: Per-route perf budget map — tighten /habits, hold others (D-05, D-06)** - `2fef250` (feat)

**Plan metadata:** `2fef190` (interim, superseded) and this commit (final SUMMARY)

## Files Created/Modified
- `app/manifest.ts` - `background_color`/`theme_color` changed `#f9fafb`/`#3b82f6` → `#0b0f1a`
- `tests/manifest.test.ts` - new Vitest unit test (3 cases) calling `manifest()` directly
- `e2e/perf.spec.ts` - `PAGE_BUDGET_MS` constant replaced by `PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number>`; loop and assertion re-target the per-route map
- `vercel.json` - new top-level `regions: ["pdx1"]` field, sibling to the existing (unchanged) `crons` array

## Decisions Made
- Task 2 was left undone in the initial session rather than guessing a Turso region or hardcoding a plausible-looking value — the plan explicitly requires a **live** `turso db show korean-study` lookup and forbids reusing any prior-session value. Guessing would silently mis-pin the region and defeat REGION-01's entire purpose (T-30-08 in the plan's own threat register).
- In this continuation session, the `turso` CLI's authentication was re-verified live (`turso auth whoami` → `jasond28`) rather than trusting the human's report that it had been resolved — per the plan's precondition protocol and T-30-08's mitigation (auditable live lookup, never hardcoded/guessed).
- Turso's `LOCATION` for the primary instance (`aws-us-west-2`) is not one of 30-RESEARCH.md's Fly.io-derived 3-letter codes. Resolved independently: Vercel's `pdx1` region runs on the underlying AWS region `us-west-2` (per vercel.com/docs/regions) — an **exact infrastructure match** to Turso's reported region, stronger than the "nearest geographically" fallback the plan anticipated as the worst case.
- Tasks 1 and 3 have zero dependency on Task 2 (`depends_on: []`, independent `<files>`), so they were completed and committed normally rather than blocking the whole plan on the earliest blocker, in both the initial and continuation sessions.
- Consistent with how Tasks 1 and 3 handled shared-file updates (no touches to STATE.md/ROADMAP.md/REQUIREMENTS.md — worktree mode defers those to the orchestrator post-merge), Task 2's commit and this SUMMARY update also leave those files untouched.

## Deviations from Plan

### Auto-fixed Issues (initial session, Tasks 1/3)

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

None in this continuation session (Task 2) — the precondition was met, the live lookup and mapping proceeded cleanly, and no unrelated issues surfaced.

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking environment-provisioning gaps from the initial session, neither touched any git-tracked file)
**Impact on plan:** Both fixes were required only to run the plan's own `<verify>` commands in this sandboxed worktree; they restore standard local dev-environment state (`npm install`/`prisma generate` equivalents) and introduce no code or behavior change.

## Issues Encountered

None outstanding. Task 2's earlier blocker (unauthenticated `turso` CLI) was resolved by the human out-of-band before this continuation session; this session re-verified authentication live and completed the task per plan.

## Next Phase Readiness
- PERCEPT-02 (manifest colors), REGION-01 (Vercel region pin), and the `/habits` perf-budget tightening (D-05/D-06) are all shipped and verified — no blockers for Phase 31/32 work.
- The full plan `<verification>` block passes clean: `npm test -- manifest` (3/3), `npx playwright test e2e/perf.spec.ts` (8/8), `node -e "require('./vercel.json')"` (valid JSON, single-element `regions` array), `npm run lint` (0 errors; 1 pre-existing unrelated warning in `components/StudySession.tsx`, untouched by this plan).
- `e2e/perf.spec.ts`'s tightened `/habits` budget is this phase's re-measurement baseline for the rest of the v1.8 milestone, per ROADMAP.md's Progress section instruction.

---
*Phase: 30-instant-feedback-cold-start-unblocking*
*Completed: 2026-08-06*
