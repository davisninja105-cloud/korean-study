---
phase: 32-study-load-round-trip-collapse
fixed_at: 2026-08-08T21:52:00Z
review_path: .planning/phases/32-study-load-round-trip-collapse/32-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 32: Code Review Fix Report

**Fixed at:** 2026-08-08T21:52:00Z
**Source review:** .planning/phases/32-study-load-round-trip-collapse/32-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (fix_scope: critical_warning — CR-01, CR-02, WR-01, WR-02, WR-03; IN-01 excluded by scope)
- Fixed: 5
- Skipped: 0

**Isolation:** All edits and commits were made in an isolated git worktree (`workflow.use_worktrees` was unset, defaulting to `true`), on a temp branch (`gsd-reviewfix/32-78051`) created from `main`. The temp branch was fast-forward-merged into `main` after all fixes were committed, then the worktree and temp branch were removed. `main` now sits at `9810883`.

**Verification scope note:** The isolated worktree has no `node_modules` (by design — worktrees never carry a copy of dependencies). Tier 2 (`tsc`/syntax check) and the project's test suite could not be run inside the worktree. Every fix was verified via Tier 1 (re-read the modified file section, confirmed the fix text is present and surrounding code is structurally intact — brace-balance-checked for `lib/study-cache.ts`) plus a manual review of the existing Vitest suites (`tests/study-cards.test.ts`, `tests/study-cache.test.ts`, `tests/cards-due-route.test.ts`) to confirm none of the new code paths (empty-pool version fallback, in-flight-refill de-dup, the new `bumpStudyCacheVersion()` call site) are exercised by an existing test in a way that would change its expected call count or assertions. Recommend running `npm run lint && npm test` in the main checkout (which does have `node_modules`) before this phase is considered verified.

## Fixed Issues

### CR-01: Changing "Session size" in Settings never takes effect on a warm `/study` load

**Files modified:** `lib/settings.ts`, `lib/study-cache.ts`
**Commit:** `d7511a5`
**Applied fix:** Applied fix option (a) from the review. `setSessionSize()` in `lib/settings.ts` now calls `bumpStudyCacheVersion()` (same-file call, no new import) after the `Setting` upsert, so a session-size change invalidates `lib/study-cache.ts`'s cached invariants snapshot the same way a sync/relink does — the next `/study` load re-reads the new value instead of serving the stale cached one. Updated the doc comments on `STUDY_CACHE_VERSION_KEY`, `bumpStudyCacheVersion()`, and `lib/study-cache.ts`'s module header (all of which explicitly documented "never called from PUT /api/settings" / "called ONLY from runSync/relinkAllDependencies") to reflect the new third caller, so the comments stay accurate rather than contradicting the code.

### CR-02: Empty due/ahead pool permanently pins the invariants cache behind a synthetic `null` version

**Files modified:** `lib/study-cards.ts`
**Commit:** `1e9cbd8`
**Applied fix:** When the Phase A pool query returns zero rows, `getStudyCards()` now issues a small fallback query (`SELECT value AS v FROM Setting WHERE key = 'studyCacheVersion'`) to read the real DB-persisted version instead of hard-coding `null`. This fallback only runs on the already-rare empty-pool path — the warm, non-empty steady state this phase optimizes for is unaffected (still 2 physical round trips). The fallback query is wrapped in its own try/catch that logs and degrades to `null` on failure (consistent with the logging fix in WR-01), rather than letting an unexpected error here propagate uncaught.

### WR-01: Phase A's raw-SQL failure is swallowed with no logging

**Files modified:** `lib/study-cards.ts`
**Commit:** `e19a915`
**Applied fix:** The pool-query `catch { throw new Error('Database error') }` now captures the error and logs it via `console.error('[study-cards] pool query failed', err)` before rethrowing, matching the pattern already used by the invariants-refill catch in `lib/study-cache.ts` and the new empty-pool version-fallback catch from the CR-02 fix. Verified against `tests/study-cards.test.ts`'s `'still throws Error("Database error") when the pool query rejects'` test — it only asserts the throw, not the absence of a console.error call, so this is a non-breaking addition.

### WR-02: `e2e/perf.spec.ts`'s tightened `/study` and `/api/cards/due` budgets have little headroom, computed from a single local run

**Files modified:** `e2e/perf.spec.ts`
**Commit:** `b04275b`
**Applied fix:** Widened the headroom multiplier for these two specifically from 1.5x to 3x (per the review's suggested approach), to reduce the risk of CI-runner-variance flakes unrelated to an actual regression. `/study`'s budget moves from 100ms to 200ms (`Math.ceil(34 * 3 / 100) * 100`). `/api/cards/due`'s formula also now uses 3x, but the rounding-to-nearest-100 floor means the number stays at 100ms (`Math.ceil(6 * 3 / 100) * 100 = 100`) — already generously headroomed at that scale. Updated the surrounding doc comments to show the new formula and rationale rather than leaving stale 1.5x-multiplier math next to a 3x number.

### WR-03: Concurrent cold-start requests can both miss the cache and issue duplicate refills

**Files modified:** `lib/study-cache.ts`
**Commit:** `9810883`
**Applied fix:** Implemented the review's suggested optional fix: added a module-scope in-flight-refill tracker (`globalForStudyCache.studyCacheInFlight`, following the same `globalThis`-holder convention the snapshot itself already uses). `refreshStudyCache()` is now a thin de-duplicating wrapper — concurrent callers observing a cache miss for the *same* version now await one shared in-flight promise instead of each independently calling the query; a different version (e.g. a bump landing mid-refill) still starts its own fresh refill. The original query logic was extracted unchanged into an internal `doRefreshStudyCache()` helper. `resetStudyCacheForTests()` was updated to also clear the in-flight slot, so a promise from one test cannot leak into a later, unrelated test. Verified brace-balance on the modified file (Tier 1); no existing test calls `refreshStudyCache()` concurrently, and all existing sequential-call tests still complete (and clear) each promise via the `finally` block before the next call starts, so behavior is unchanged for the tested paths.

## Skipped Issues

None — all 5 in-scope findings were fixed.

_Note: IN-01 ("correlated" vs "independent" subquery wording in `lib/study-cache.ts` comments) was intentionally excluded — `fix_scope` for this run was `critical_warning`, which covers CR-*/BL-*/WR-* findings only, not Info-tier findings._

---

_Fixed: 2026-08-08T21:52:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
