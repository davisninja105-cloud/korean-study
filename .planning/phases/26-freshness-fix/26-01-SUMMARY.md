---
phase: 26-freshness-fix
plan: 01
subsystem: testing
tags: [playwright, e2e, rsc, freshness, router-cache, prisma]

# Dependency graph
requires:
  - phase: 25-e2e-test-infrastructure-baselines (Plan 03)
    provides: "e2e/freshness-router-cache.spec.ts, e2e/freshness-client-shell.spec.ts, e2e/freshness-fresh-paths.spec.ts (16-cell matrix), e2e/helpers/rsc.ts (isRscRequest), e2e/helpers/readers.ts, e2e/helpers/mutate.ts"
provides:
  - "e2e/helpers/rsc.ts: waitForRscFetch(page, routePath, timeout) — deterministic page.waitForResponse wrapper for boundary-refresh evidence"
  - "e2e/freshness-router-cache.spec.ts: 5 tests re-contracted to the fixed-behavior bar (FRESH-04/FRESH-05), still red pre-fix"
  - "e2e/freshness-client-shell.spec.ts: 3 back-forward tests re-contracted (FRESH-04), still red pre-fix; /habits post-mutation-return untouched (already green)"
  - "Pristine-baseline 16-cell table + empirical answers to the two open mechanism-attribution questions carried from Phase 25"
affects: [26-02, 26-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "waitForRscFetch: promise created BEFORE the triggering action (goBack/simulateResume), awaited AFTER — replaces fixed-timeout-only evidence windows with a real page.waitForResponse race-free wait"
    - "expect.poll(() => reader(page), { timeout }) for post-refresh DOM assertions — readers only poll for element visibility, not value, so a one-shot read after a fetch resolves is a flake source"

key-files:
  created: []
  modified:
    - e2e/helpers/rsc.ts
    - e2e/freshness-router-cache.spec.ts
    - e2e/freshness-client-shell.spec.ts

key-decisions:
  - "Environment gap found and fixed before any test could run: this worktree checkout had no node_modules at all (npm ls showed every dependency UNMET) and no generated Prisma client. Fixed via `npx prisma generate` (regenerates app/generated/prisma, gitignored) plus a symlink from the worktree's node_modules to the main repo's node_modules (package.json/package-lock.json confirmed byte-identical via diff; node_modules is gitignored so the symlink is untracked). This is infrastructure setup, not a package install — no new/different dependency was introduced, only a link to the already-resolved, lockfile-matching install."
  - "Task 1 (pristine-baseline re-run) resolves both open questions carried from Phase 25/STATE.md empirically: (1) ALL 8 currently-red cells (5 router-cache + 3 client-shell back-forward) present with the 0-new-fetch (Router-Cache-reuse) evidence signature today — none of the client-shell back-forward cells' original 1-fetch client-shell-non-resync signature reproduced on this pristine run, confirming and extending 25-03-SUMMARY's D-04 CR-01 finding; (2) /habits post-mutation-return re-confirmed genuinely FRESH (fetch + DOM both correct) — no fix effort targets it, test left byte-identical per plan instruction."
  - "waitForRscFetch's predicate mirrors newDataFetchesForRoute's existing evidence definition (isRscRequest(request) OR resourceType === 'document') rather than introducing a new/different fetch-classification rule — keeps the network-evidence half of the dual-evidence assertion internally consistent between the wait-primitive and the count-assertion in the same test."
  - "Resume-cell trigger ordering: rscFetch awaited immediately after simulateResume(page, false) (the actual resume-completion trigger), before the pre-existing 250ms + 300ms settle margins — those margins are kept in their original relative position after the await, per the plan's 'await it after the trigger, keep the existing 300ms settle after that' instruction."

patterns-established:
  - "waitForRscFetch(page, routePath, timeout?) is the new standard trigger-then-wait primitive for any freshness test asserting a boundary refresh landed; Plans 26-02/26-03 consume it directly rather than re-deriving fixed-timeout evidence windows."

requirements-completed: [FRESH-03, FRESH-04, FRESH-05, FRESH-06]

coverage:
  - id: D1
    description: "Pristine-baseline re-run of all 16 freshness-matrix cells (fresh-paths 7 + smoke 4 green regression net; router-cache 5 + client-shell 4 red/green baseline), resolving mechanism-attribution and /habits post-mutation-return open questions empirically"
    requirement: FRESH-03
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/smoke.spec.ts --reporter=line — 12/12 passed (1 setup + 7 fresh-paths + 4 smoke). npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --reporter=line — 8 failed / 2 passed (1 setup + /habits post-mutation-return), matching 25-03-SUMMARY's documented 8-red/1-green shape exactly, with 0 new fetches (network-half pass) observed for all 8 failing cells."
        status: pass
    human_judgment: false
  - id: D2
    description: "waitForRscFetch(page, routePath, timeout) exported from e2e/helpers/rsc.ts alongside isRscRequest"
    requirement: FRESH-06
    verification:
      - kind: other
        ref: "npx tsc --noEmit (zero new errors, only the pre-existing tests/study-cards.test.ts debt); npm run lint (0 errors, 1 pre-existing unrelated warning)"
        status: pass
    human_judgment: false
  - id: D3
    description: "freshness-router-cache.spec.ts (5 tests) and freshness-client-shell.spec.ts (3 back-forward tests) rewritten to the fixed-behavior contract with exact required titles; /habits post-mutation-return left byte-identical"
    requirement: FRESH-04
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --reporter=line — 8 failed (all at the waitForRscFetch 15s timeout, not a selector/reader/TypeScript error) / 2 passed (setup + /habits post-mutation-return). diff of the /habits post-mutation-return test body against HEAD confirms byte-identical (exit 0)."
        status: pass
    human_judgment: false
  - id: D4
    description: "Regression net stays intact: freshness-fresh-paths.spec.ts passes 7/7 after the rewrite; zero expected-failure/skip annotations anywhere in the three freshness spec files"
    requirement: FRESH-06
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/freshness-fresh-paths.spec.ts --reporter=line — 8/8 passed (1 setup + 7 tests). grep -rn 'test.fail(|test.fixme(|test.skip(' across all three freshness spec files — zero matches (grep exit 1)."
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-12
status: complete
---

# Phase 26 Plan 01: Baseline Re-verification + Fixed-Behavior Contract Flip Summary

**Re-verified the live 16-cell freshness baseline on pristine code (all 8 red cells now present as 0-fetch Router-Cache-reuse; /habits post-mutation-return confirmed genuinely fresh), then flipped the two red spec files to assert the fixed-behavior contract via a new `waitForRscFetch` deterministic-wait helper — all 8 rewritten tests fail cleanly at the missing-boundary-fetch timeout, the true red→green bar for Plans 26-02/26-03**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-12T17:36:18Z
- **Completed:** 2026-07-12T17:48:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Re-ran the full 16-cell freshness matrix on pristine code: `freshness-fresh-paths.spec.ts` (7/7) + `smoke.spec.ts` (4/4) confirmed green (regression net intact); `freshness-router-cache.spec.ts` (5) + `freshness-client-shell.spec.ts` (4) confirmed 8 red / 1 green, matching 25-03-SUMMARY's documented shape
- Resolved both open mechanism-attribution questions empirically: all 8 currently-red cells now show the 0-new-fetch (Router-Cache-reuse) evidence pattern — not a mix of two mechanisms as 24-DIAGNOSIS.md originally recorded — and `/habits post-mutation-return` is reconfirmed genuinely fresh, requiring no fix effort
- Added `waitForRscFetch(page, routePath, timeout)` to `e2e/helpers/rsc.ts` — a race-free `page.waitForResponse` wrapper that must be created before the triggering action and awaited after, replacing fixed-timeout-only evidence windows
- Rewrote `freshness-router-cache.spec.ts` (5 tests) and the 3 back-forward tests in `freshness-client-shell.spec.ts` to assert the FIXED behavior: a boundary refresh fetch lands (nonzero count) AND the DOM value matches live truth (polled, not one-shot read); retitled to the exact strings downstream plans grep for
- Confirmed all 8 rewritten tests are red for the right reason — every failure is a clean `waitForRscFetch` 15s timeout (no boundary fetch exists pre-fix), never a selector/reader/TypeScript error — and `/habits post-mutation-return` stayed green, byte-identical to its Phase 25 form
- `tsc --noEmit` and `npm run lint` both clean (only pre-existing, documented debt); zero `test.fail()`/`test.fixme()`/`test.skip()` anywhere across all three freshness spec files; `freshness-fresh-paths.spec.ts` and `smoke.spec.ts` are byte-untouched and still fully green after the flip

## Task Commits

Task 1 (pristine-baseline re-run) was verification-only — zero file modifications, no commit. Task 2 was committed atomically:

1. **Task 2: Flip the two red spec files to the fixed-behavior contract + add waitForRscFetch helper** — `55d4fc0` (test)

## Files Created/Modified
- `e2e/helpers/rsc.ts` — added `waitForRscFetch(page, routePath, timeout?)` export alongside the existing `isRscRequest`
- `e2e/freshness-router-cache.spec.ts` — 5 tests rewritten to the fixed-behavior contract (FRESH-04/FRESH-05 titles)
- `e2e/freshness-client-shell.spec.ts` — 3 back-forward tests rewritten (FRESH-04 titles); `/habits post-mutation-return` byte-identical

## Decisions Made
- **Pristine-baseline table** (16 cells total — the SUMMARY artifact this plan's Task 1 exists to produce):

  | File | Cell | Result | Fetch evidence (pre-flip) |
  |------|------|--------|---------------------------|
  | freshness-fresh-paths.spec.ts | `/` plain-Link | PASS | 1 new fetch |
  | freshness-fresh-paths.spec.ts | `/study` plain-Link | PASS | 1 new fetch |
  | freshness-fresh-paths.spec.ts | `/cards` plain-Link | PASS | 1 new fetch |
  | freshness-fresh-paths.spec.ts | `/habits` plain-Link | PASS | 1 new fetch |
  | freshness-fresh-paths.spec.ts | `/` post-mutation-return | PASS | 1 new fetch |
  | freshness-fresh-paths.spec.ts | `/study` post-mutation-return | PASS | 2 new fetches (prefetch + nav) |
  | freshness-fresh-paths.spec.ts | `/cards` post-mutation-return | PASS | 2 new fetches (prefetch + nav) |
  | freshness-router-cache.spec.ts | `/` back-forward | RED (DOM half only) | 0 new fetches |
  | freshness-router-cache.spec.ts | `/` resume | RED (DOM half only) | 0 new fetches |
  | freshness-router-cache.spec.ts | `/study` resume | RED (DOM half only) | 0 new fetches |
  | freshness-router-cache.spec.ts | `/cards` resume | RED (DOM half only) | 0 new fetches |
  | freshness-router-cache.spec.ts | `/habits` resume | RED (DOM half only) | 0 new fetches |
  | freshness-client-shell.spec.ts | `/study` back-forward | RED (DOM half only) | 0 new fetches |
  | freshness-client-shell.spec.ts | `/cards` back-forward | RED (DOM half only) | 0 new fetches |
  | freshness-client-shell.spec.ts | `/habits` back-forward | RED (DOM half only) | 0 new fetches |
  | freshness-client-shell.spec.ts | `/habits` post-mutation-return | PASS | 2 new fetches (prefetch + nav) |

  Every RED cell's fetch-count assertion (`toHaveLength(0)`) passed silently before the failing DOM assertion — confirmed via grep on the run log showing zero `toHaveLength` failures — so all 8 red cells are unambiguously in the "network half passes, DOM half fails" shape 25-03-SUMMARY predicted.

  **Open question 1 (mechanism attribution) — answered:** on this pristine run, ALL 8 red cells present the 0-new-fetch (Router-Cache-reuse) evidence signature, including the 3 client-shell back-forward cells that 24-DIAGNOSIS.md originally classified as 1-fetch client-shell-non-resync. This confirms and hardens 25-03-SUMMARY's D-04 CR-01 finding rather than reversing it — the mechanism-attribution shift is stable across two independent re-verifications now. Per design_decisions #1 in the plan, this does not change what Plans 26-02/26-03 must build: the fix architecture (FreshnessWatcher `router.refresh()` + gated per-shell prop-adoption) already covers both mechanisms regardless of which one a given cell currently presents.

  **Open question 2 (`/habits post-mutation-return`) — answered:** reconfirmed genuinely FRESH (2 new fetches, correct DOM value). No fix effort targets this cell; its test was left byte-identical in Task 2 per the plan's explicit instruction (diff against `HEAD` confirms zero-byte difference).

- **Environment fix (Rule 3 — blocking issue, not a package install):** the worktree checkout had no `node_modules` directory at all — `npm ls --depth=0` showed every single dependency as `UNMET DEPENDENCY`, and `app/generated/prisma` (the Prisma client output, gitignored) didn't exist either, so the very first `playwright test` invocation failed at webServer startup (`Cannot find module '@/app/generated/prisma/client'`, then `spawnSync .../node_modules/.bin/tsx ENOENT`). Fixed via `npx prisma generate` (regenerates the gitignored Prisma client) plus a symlink `node_modules -> /Users/main/Documents/claude-test/node_modules` after confirming via `diff` that this worktree's `package.json` and `package-lock.json` are byte-identical to the main repo's. This is not a package-manager install (no new/different package resolved) — it links to the already-verified, lockfile-matching install already present in the main checkout. `node_modules` is gitignored so the symlink itself is untracked; `git status --short` was clean before and after this fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing node_modules + ungenerated Prisma client in the worktree checkout**
- **Found during:** Task 1 (first `npx playwright test` invocation, before any spec assertions could even run)
- **Issue:** `npm ls --depth=0` showed every dependency as `UNMET DEPENDENCY`; `app/generated/prisma` (gitignored Prisma client output) did not exist. The webServer bootstrap failed first at `Cannot find module '@/app/generated/prisma/client'`, and after regenerating the Prisma client, failed again at `spawnSync .../node_modules/.bin/tsx ENOENT` inside `e2e/seed.ts`'s `resetToBaseline()`.
- **Fix:** `npx prisma generate` (regenerated `app/generated/prisma`); confirmed via `diff` that `package.json`/`package-lock.json` are byte-identical between this worktree and the main repo; created a symlink `node_modules -> /Users/main/Documents/claude-test/node_modules`.
- **Files modified:** none tracked (both `app/generated/prisma` and `node_modules` are gitignored; `git status --short` clean before and after)
- **Verification:** Re-ran `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/smoke.spec.ts --reporter=line` — 12/12 passed, confirming the fix unblocked the full harness (build, server start, DB reset/seed subprocess, browser test run).
- **Committed in:** n/a (untracked, gitignored artifacts — no commit needed)

---

**Total deviations:** 1 auto-fixed (1 blocking-issue fix, Rule 3)
**Impact on plan:** Necessary environment repair before any test could run at all; no application/test code was touched by this fix, and it left the git working tree clean. No scope creep.

## Issues Encountered

None beyond the environment gap documented above as a Rule 3 deviation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plans 26-02 and 26-03 now have their true red→green acceptance bar: `freshness-router-cache.spec.ts` (5 tests) and `freshness-client-shell.spec.ts`'s 3 back-forward tests assert the fixed-behavior contract and fail cleanly (waitForRscFetch timeout) because the fix does not exist yet. `waitForRscFetch` is available for both plans to reuse directly.
- The regression net (`freshness-fresh-paths.spec.ts` 7 green + `smoke.spec.ts` 4 green) is confirmed intact and must stay green through 26-02/26-03.
- Mechanism-attribution finding for Plans 26-02/26-03: all 8 red cells currently present as 0-fetch Router-Cache-reuse. This does not narrow the fix scope — per the plan's own design decisions, the `FreshnessWatcher` + gated per-shell prop-adoption architecture already covers both possible mechanisms regardless of which one currently presents, so no plan revision is needed.
- `/habits post-mutation-return` requires zero fix effort — confirmed fresh twice now (25-03 and this plan). Any future work should not "fix" this cell.
- No blockers for Plans 26-02/26-03.

---
*Phase: 26-freshness-fix*
*Completed: 2026-07-12*
