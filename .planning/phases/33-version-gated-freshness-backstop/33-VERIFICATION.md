---
phase: 33-version-gated-freshness-backstop
verified: 2026-08-09T01:25:27Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 33: Version-Gated Freshness Backstop Verification Report

**Phase Goal:** Stop the freshness backstop from delivering the same payload twice on every resume. Add a cheap monotonic version counter the client can poll, and re-fetch route payloads only when it has actually moved — narrowing the backstop without removing it, since it still guards a real unfixed Next.js 16.2.1 bug.
**Verified:** 2026-08-09T01:25:27Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `GET /api/version` returns a monotonic counter, advances on sync completion + review write, stays put otherwise, no schema change | ✓ VERIFIED | `app/api/version/route.ts` reads `getDataVersion()`; `lib/settings.ts:339-374` (`DATA_VERSION_KEY='dataVersion'`, `getDataVersion`, `bumpDataVersion`, upsert-only, no `crypto.randomUUID()` suffix); bump call sites confirmed inside `app/api/review/route.ts`'s `tx.$transaction` (after `tx.reviewLog.create`, before `findUniqueOrThrow`) and unconditionally at the tail of `lib/sync.ts:runSync()`; `git diff --exit-code prisma/schema.prisma` exits 0 (no change since before phase 33's first commit); `tests/version-route.test.ts` 7/7 passing (re-ran live: empty-DB default `'0'`, sync bump, two-bump ordering, committed-review bump + idempotent-replay no-op, 404 non-commit no-op, `setSessionSize()` lock, direct `Card`-create lock) |
| 2 | Resuming with no server-side change issues one small version request instead of a full payload re-fetch | ✓ VERIFIED | `components/FreshnessWatcher.tsx:202-230` gate logic: mount-time baseline seed + per-boundary-event `fetch('/api/version')`, `fetchRoutePayload()` called only when `previous !== null && previous !== version`; `e2e/freshness-version-gate.spec.ts` test `'/cards resume with no server-side change issues a version request and no payload re-fetch (VERS-02)'` re-ran live and passed |
| 3 | When the counter has moved, resume re-fetches and the route shows new data; existing `e2e/freshness-*` resume/back-forward specs stay green | ✓ VERIFIED | Live re-run of all 5 freshness spec files (`freshness-client-shell`, `freshness-fresh-paths`, `freshness-gate`, `freshness-router-cache`, `freshness-version-gate`) — 22/22 passing on a clean second full run (one flaky failure on the first run, `'/cards resume serves fresh data after boundary refresh (FRESH-05)'`, reproduced as a pass-on-isolated-rerun and again on a second full-suite run — consistent with the documented pre-existing, unfixed Next.js 16.2.1 Suspense/Segment-Cache delivery flake this phase's RSC half deliberately leaves ungated, not a regression) |
| 4 | `FreshnessWatcher` still exists, still applies its JSON re-fetch backstop when the version has changed, carries a TODO naming the Next.js version last tested | ✓ VERIFIED | `components/FreshnessWatcher.tsx` (279 lines) unchanged in shape/purpose; `router.refresh()` appears exactly once, unconditional, outside the version check (`grep -c 'router.refresh()'` → 1); `TODO: 16.2.1 is the Next.js version this delivery flake and its gate were last verified against` present at line 160-162; `COALESCE_MS = 300` unchanged |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/version/route.ts` | GET handler returning `{ version }` from `getDataVersion()` | ✓ VERIFIED | 7-line file, matches sibling `app/api/lessons/route.ts` shape exactly (no try/catch — flagged as WR-04 in code review, non-blocking) |
| `lib/settings.ts` | `DATA_VERSION_KEY`, `nextDataVersionToken()`, `getDataVersion()`, `bumpDataVersion()` | ✓ VERIFIED | All four present, JSDoc documents upsert-only rationale and both call sites |
| `components/FreshnessWatcher.tsx` | Version-gated JSON backstop, unconditional `router.refresh()` | ✓ VERIFIED | Confirmed above |
| `e2e/freshness-version-gate.spec.ts` | Two-sided gate proof + non-vacuity lock | ✓ VERIFIED | 3 tests present and passing live (closed-gate, open-gate, non-vacuity lock covering all 3 freshness mutators) |
| `tests/version-route.test.ts` | Real-DB Vitest integration coverage | ✓ VERIFIED | 7/7 passing live |
| `e2e/helpers/mutate.ts` | `bumpDataVersionDirect()` wired into 3 freshness mutators + `bumpDataVersionOnlyDirect`/`readDataVersionDirect` exports | ✓ VERIFIED | `bumpDataVersionDirect` called from `flipOneReviewDueStateDirect` (both branches), `createMutationCardDirect`, `promoteOneReviewToMasteredDirect` (both branches); read-only helpers (`expectedCardsCountDirect` etc.) confirmed NOT bumped |
| `e2e/run-mutate.ts` | `bumpDataVersionOnly`/`readDataVersion` OPS entries | ✓ VERIFIED | Both entries present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `FreshnessWatcher.tsx` | `app/api/version/route.ts` | `fetch('/api/version')` | ✓ WIRED | 2 call sites (mount baseline + gate check) |
| `app/api/version/route.ts` | `lib/settings.ts` | `getDataVersion()` | ✓ WIRED | Direct import and call |
| `app/api/review/route.ts` | `lib/settings.ts` | `DATA_VERSION_KEY` + `nextDataVersionToken()` used in tx-scoped upsert | ✓ WIRED | Confirmed inside `$transaction` block |
| `lib/sync.ts` | `lib/settings.ts` | `bumpDataVersion()` at end of `runSync()` | ✓ WIRED | Non-fatal try/catch, alongside `bumpStudyCacheVersion()` |
| `e2e/helpers/mutate.ts` | `lib/settings.ts` | dynamic `import('../../lib/settings')` inside `bumpDataVersionDirect()` | ✓ WIRED | No static top-level import (confirmed) |
| `e2e/freshness-fresh-paths.spec.ts` | `e2e/helpers/mutate.ts` | `bumpDataVersionOnly()` before `simulateResume(page, true)` in Upsert-not-replace section | ✓ WIRED | Confirmed ordering via `awk` scan |

### Behavioral Spot-Checks / Live Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Version-route integration suite | `npx vitest run tests/version-route.test.ts` | 7/7 passed | ✓ PASS |
| Full Vitest suite | `npm test` | 333/333 passed (31 files) | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| Production build | `npm run build` | Compiled successfully, `/api/version` route listed | ✓ PASS |
| Full freshness e2e suite (5 files) | `npx playwright test e2e/freshness-*.spec.ts` | Run 1: 21/22 (1 flaky failure, reproduced-clean on isolated rerun); Run 2: 22/22 | ✓ PASS |
| Schema/middleware/sync-route untouched | `git diff --exit-code prisma/schema.prisma middleware.ts app/api/sync/route.ts app/api/cron/sync/route.ts` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VERS-01 | 33-01, 33-02 | `/api/version` returns a monotonic counter bumped by sync completion and review writes | ✓ SATISFIED | `bumpDataVersion()` call sites in `runSync()` and `POST /api/review`; `tests/version-route.test.ts` locks the contract; e2e mutators reproduce the same side-effect (`e2e/helpers/mutate.ts`) |
| VERS-02 | 33-01, 33-02 | `FreshnessWatcher` JSON backstop re-fetches only when the version counter has changed; backstop itself not removed | ✓ SATISFIED | `FreshnessWatcher.tsx` gate logic + `router.refresh()` unconditional; `e2e/freshness-version-gate.spec.ts` two-sided proof passing live |

REQUIREMENTS.md cross-check: both VERS-01 and VERS-02 are marked `[x]` complete and mapped to "Phase 33 — Complete" in the requirements coverage table (lines 34-35, 88-89). No orphaned requirements found for this phase.

### Anti-Patterns Found

None blocking. No `TBD`/`FIXME`/`XXX` markers in phase-modified files. The one `TODO` present (`FreshnessWatcher.tsx:160`) is a deliberate, required artifact per success criterion 4 (names `16.2.1` and its re-test purpose), not a debt marker.

### Code Review Findings (33-REVIEW.md) — Factored Into This Verification

0 critical / 5 warning / 3 info. All warnings are advisory per the phase's own scope, not violations of the stated success criteria:

- **WR-01** (token collision risk within the same millisecond): the phase's own `must_haves.truths` explicitly carries this as a `verification: backstop` item — "confirmed by construction (upsert-only, no read-modify-write), not by a reproducible race test." Acknowledged, low-probability in this single-user app, does not block SC1-4.
- **WR-02/WR-03** (card CRUD, review-undo, and activity-logging writes don't bump the counter): explicitly out of scope per `33-RESEARCH.md`'s and the plan's own `flagged_assumptions` — VERS-01 scopes the trigger to sync completion and review writes only, by design. This is a real narrowing of pre-Phase-33 cross-device freshness for those specific paths, worth a follow-up, but does not fail any of the four roadmap success criteria as written.
- **WR-04** (no try/catch in `/api/version/route.ts`, deviates from CLAUDE.md's documented convention): low-impact (client already treats non-2xx as null), does not affect functional success criteria.
- **WR-05** (`runSync()` bumps counters even on a fully-failed sync with zero new lessons): over-invalidation only (extra fetch, never staleness), does not violate any success criterion.

None of these rise to a BLOCKER against the four stated success criteria. They are flagged here for visibility and potential follow-up but do not change the verification verdict.

### Human Verification Required

None. All four success criteria are independently verifiable via code inspection and live test execution, which was performed as part of this verification (not merely inspecting SUMMARY.md claims).

### Gaps Summary

No gaps. All four ROADMAP success criteria hold:

1. `GET /api/version` returns a monotonic counter sourced from the `Setting` table's `dataVersion` key, advancing on committed review writes and sync completion, confirmed unchanged otherwise by 7 live-passing integration tests. `prisma/schema.prisma` is byte-identical to before the phase.
2. A no-change resume issues one `/api/version` request and zero payload requests — proven live via `e2e/freshness-version-gate.spec.ts`.
3. A moved counter (e.g. after a real graded review) triggers a re-fetch of the new data, and the pre-existing `e2e/freshness-*` suite (22 tests across 5 files, including all pre-Phase-33 specs) passes together — proven live on a clean full-suite run.
4. `FreshnessWatcher` still exists, still applies the JSON backstop conditionally, `router.refresh()` remains unconditional, and the required `TODO` naming Next.js `16.2.1` is present.

Both requirement IDs (VERS-01, VERS-02) are satisfied and correctly reflected as complete in REQUIREMENTS.md.

---

_Verified: 2026-08-09T01:25:27Z_
_Verifier: Claude (gsd-verifier)_
