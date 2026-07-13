---
phase: 27-e2e-coverage-performance-validation
verified: 2026-07-13T19:07:36Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 27: E2E Coverage & Performance Validation Verification Report

**Phase Goal:** With infrastructure and the fix both proven, broaden coverage to the full study grade-flow, assert generous page/API timing budgets as behavioral guard rails, and document the Playwright MCP workflow for agent-driven exploratory QA.
**Verified:** 2026-07-13T19:07:36Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A study grade-flow spec covers reveal → grade → queue advance → session completion end-to-end against the seeded DB (E2E-05) | ✓ VERIFIED | `e2e/grade-flow.spec.ts` exists (90 lines), drives the full flow exclusively via `getByTestId` locators (`start-studying-btn`, `mode-flashcard`, `reveal-btn`, `grade-good`, `card-front-word`, `session-complete-heading`, `study-more-btn`), asserts a bounded loop-until-complete, fixture-traceable front coverage, and a polled subprocess DB backstop (`seededDueReviewsPersisted`). Independently re-ran (not trusting SUMMARY): `npx playwright test e2e/grade-flow.spec.ts --reporter=line` → 1 passed, live in this session. |
| 2 | The suite asserts generous page-load timing budgets on key routes via the Navigation Timing API, using median-of-N runs to reduce flakiness (PERF-04) | ✓ VERIFIED | `e2e/perf.spec.ts` has 4 `page-load budget:` tests (`/`, `/study`, `/cards`, `/habits`), each doing 5 `page.goto` samples, reading `performance.getEntriesByType('navigation')[0]` (plain-field extraction, no raw-entry serialization pitfall), per-sample `dcl > 0` vacuity guard, median-of-5 assertion against `PAGE_BUDGET_MS = 3000`. Independently re-ran: all 4 page-budget tests pass live with real nonzero ttfb/dcl/load values logged. |
| 3 | The suite asserts generous API route timing budgets (e.g. /api/cards/due) via direct request timing (PERF-05) | ✓ VERIFIED | Same file, 3 `API round-trip budget:` tests (`/api/cards/due`, `/api/stats`, `/api/activity`), authenticated via one `page.goto('/')` then `page.evaluate(fetch)` timed with `performance.now()`, body consumed inside the timed window, per-sample `ok===true`/`bytes>0` vacuity guards, median-of-5 against `API_BUDGET_MS = 1000`. Independently re-ran: all 3 pass live with real millisecond values logged (single-digit-to-low-teens ms, far under the 1000ms budget). |
| 4 | A documented workflow in CLAUDE.md lets Claude Code drive the running dev server interactively via Playwright MCP for exploratory verification (TOOL-01) | ✓ VERIFIED | `CLAUDE.md` contains a `## Playwright MCP (agent-driven exploratory QA)` section (lines 166–177) with the exact registration command, the `--` separator note, the npm-run-dev/:3000 prerequisite, the :3000-dev vs :3100-harness distinction, the real-dev-DB-writes caveat, the `APP_PASSWORD`-by-name-only login step (no literal secret), and 4 verified tool-call examples. Independently re-ran `claude mcp list` in this session → `playwright: npx @playwright/mcp@latest - ✔ Connected`, confirming live registration, not just a doc claim. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `e2e/grade-flow.spec.ts` | E2E-05 spec | ✓ VERIFIED | Exists, substantive (90 lines), matches PLAN's exact behavioral spec (bounded loop, `MAX_GRADES=25`, `locator.or()` composition, `toBeGreaterThanOrEqual(FIXTURE.dueCards)`, `toHaveText('Session complete!')`, `expect.poll` DB backstop). Ran green live. |
| `e2e/perf.spec.ts` | PERF-04 + PERF-05 spec | ✓ VERIFIED | Exists, substantive (107 lines), 7 tests total (4 page + 3 API), `PAGE_BUDGET_MS=3000`/`API_BUDGET_MS=1000`/`SAMPLES=5` committed as specified. Ran green live. |
| `components/FlashcardMode.tsx` — testid instrumentation | 7 testid instances | ✓ VERIFIED | `grep -c 'data-testid'` = 7 (matches plan's acceptance criterion exactly) |
| `components/StudyClient.tsx` — testid instrumentation | 4 testid instances | ✓ VERIFIED | `grep -c 'data-testid'` = 4 |
| `components/ModeSelector.tsx` — testid instrumentation | 1 testid instance | ✓ VERIFIED | `grep -c 'data-testid'` = 1 |
| `e2e/helpers/readers.ts` — KNOWN-FRAGILE locator retired | `due-count` testid anchor | ✓ VERIFIED | `readStudySelectModeState` now uses `page.getByTestId('due-count')`; the presentational `p.text-5xl.font-bold.animate-reveal` string no longer appears as a live locator (doc comment retained for historical provenance only) |
| `CLAUDE.md` — Playwright MCP section | New documented workflow | ✓ VERIFIED | Section present, secret-free, tool names match research-verified list |
| Claude CLI MCP config — playwright server entry | Registered via `claude mcp add` | ✓ VERIFIED | `claude mcp list` shows `playwright: npx @playwright/mcp@latest - ✔ Connected` (live, re-checked independently) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `e2e/grade-flow.spec.ts` locators | `data-testid` values in `FlashcardMode.tsx`/`StudyClient.tsx`/`ModeSelector.tsx` | exact string match | ✓ WIRED | Spec ran green — a mismatch would have hung/failed the `waitFor` |
| `e2e/grade-flow.spec.ts` → `resetToBaseline()` | `e2e/seed.ts` | `beforeAll` call | ✓ WIRED | Present at line 33-35 |
| `seededDueReviewsPersisted()` → `runMutateOp` → `e2e/run-mutate.ts` OPS map → `seededDueReviewsPersistedDirect()` | subprocess two-layer pattern | function call chain | ✓ WIRED | Backstop assertion in the spec resolved to `'all-persisted'` on live run — proves the whole chain executes and reads real DB state |
| `e2e/perf.spec.ts` API tests | `app/api/cards/due`, `app/api/stats`, `app/api/activity` GET routes | authenticated `page.evaluate(fetch)` | ✓ WIRED | Live run returned `ok===true` and non-empty bodies for all 15 samples (3 endpoints × 5) |
| CLAUDE.md documented tool names | `@playwright/mcp` actual tool surface | registration + live connection | ✓ WIRED | `claude mcp list` confirms the server is live and `Connected`; Plan 27-03's Task 3 recorded a human-verified live smoke (navigate → login → snapshot) matching the doc exactly |

### Behavioral Spot-Checks (re-run independently, not trusting SUMMARY claims)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Grade-flow spec passes | `npx playwright test e2e/grade-flow.spec.ts e2e/perf.spec.ts --reporter=line` | 9/9 passed (19.0s) — grade-flow session reached completion, all 4 page-budget + 3 API-budget tests passed with logged samples | ✓ PASS |
| Full E2E suite coexistence | `npx playwright test --reporter=line` (run 3×) | 31/31 passed twice; one run showed a single flaky failure in `e2e/freshness-fresh-paths.spec.ts:161` (a pre-existing Phase 26 freshness test, not a Phase 27 artifact, running alphabetically *before* grade-flow/perf) that passed cleanly on immediate re-run in isolation and in two subsequent full-suite runs — classified as a pre-existing flake, not a Phase 27 regression (see Anti-Patterns/Notes below) | ✓ PASS (with noted pre-existing flake) |
| Unit test suite | `npm test` | 241/241 passed | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning in `components/StudySession.tsx` (`react-hooks/exhaustive-deps`, not introduced by Phase 27) | ✓ PASS |
| MCP server live | `claude mcp list` | `playwright: npx @playwright/mcp@latest - ✔ Connected` | ✓ PASS |
| Code review Warning-tier fixes present in source | Read `app/api/review/undo/route.ts` | Both WR-01 (`'lastReview' in prevState` presence check) and WR-02 (try/catch + shape validation) fixes are present in the actual file, matching 27-REVIEW-FIX.md's claims exactly (not just claimed — verified by reading the file) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| E2E-05 | 27-01 | Study grade-flow spec, reveal→grade→queue advance→completion | ✓ SATISFIED | `e2e/grade-flow.spec.ts`, live-verified passing |
| PERF-04 | 27-02 | Page-load timing budgets, Navigation Timing API, median-of-N | ✓ SATISFIED | `e2e/perf.spec.ts` page-budget tests, live-verified passing |
| PERF-05 | 27-02 | API route timing budgets, direct request timing | ✓ SATISFIED | `e2e/perf.spec.ts` API-budget tests, live-verified passing |
| TOOL-01 | 27-03 | Playwright MCP documented workflow, agent-drivable dev server | ✓ SATISFIED | CLAUDE.md section + live `claude mcp list` confirmation |

REQUIREMENTS.md maps exactly these 4 IDs to "Phase 27" — no orphaned requirements found for this phase.

### Anti-Patterns Found

No debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) found in any Phase-27-modified file (`e2e/grade-flow.spec.ts`, `e2e/perf.spec.ts`, `app/api/review/undo/route.ts`, `components/FlashcardMode.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx`, `e2e/helpers/readers.ts`, `e2e/helpers/mutate.ts`, `e2e/run-mutate.ts`, `CLAUDE.md`).

**Note (informational, not a blocker):** During independent re-verification, one of three full-suite (`npx playwright test`) runs showed `e2e/freshness-fresh-paths.spec.ts:161` ("/study post-mutation-return stays fresh") fail; the same test passed in isolation and in two subsequent full-suite runs. This is a pre-existing Phase 26 freshness-regression test (uses `page.waitForTimeout(300)` "settle margin" comments, a known timing-sensitivity pattern), not a file this phase modified, and it sorts alphabetically *before* `grade-flow.spec.ts`/`perf.spec.ts` in the single-worker execution order — so Phase 27's additions cannot be a causal mechanism for its occasional flake. Flagged here for project awareness, not as a Phase 27 gap.

Also note (per user-supplied context, independently spot-checked above): plan 27-01's out-of-scope FSRS `learningSteps` persistence fix and the 2 code-review Warning-tier fixes to `app/api/review/undo/route.ts` are both present in the current source and were re-verified directly (not merely trusted from SUMMARY/REVIEW-FIX narrative).

### Human Verification Required

None. TOOL-01's two blocking-human checkpoints (package-legitimacy approval and live MCP exploratory smoke) were already executed and resolved during phase execution — the live smoke was performed in a fresh Claude Code session per the plan's design and reported no mismatches (27-03-SUMMARY.md D4, `human_judgment: true`, no outstanding action). This verification pass independently re-confirmed the MCP server is currently live and connected (`claude mcp list`), which is the durable, re-checkable artifact of that human process.

### Gaps Summary

No gaps. All 4 roadmap success criteria are independently verified against live-running code (not SUMMARY claims): both new spec files exist, are substantive, are correctly wired to the components/API routes they exercise, and pass when executed fresh in this verification session. The CLAUDE.md documentation section and MCP registration are both present and independently confirmed live. The two code-review Warning-tier fixes (unrelated to the 4 success criteria but in phase-touched file scope) were also independently confirmed present in source, not just claimed by 27-REVIEW-FIX.md.

---

_Verified: 2026-07-13T19:07:36Z_
_Verifier: Claude (gsd-verifier)_
