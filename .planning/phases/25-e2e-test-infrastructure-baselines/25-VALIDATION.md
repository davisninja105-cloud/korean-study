---
phase: 25
slug: e2e-test-infrastructure-baselines
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.61.1 (new this phase) |
| **Config file** | `playwright.config.ts` (new — created by this phase, does not exist yet) |
| **Quick run command** | `npx playwright test e2e/smoke.spec.ts` (single file, fastest signal) |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~90–180s (includes production build + boot; serial workers per D-07 keep execution itself fast) |

Note: `npm test` (Vitest) must remain unaffected — Vitest's default `include` glob would otherwise match `e2e/*.spec.ts`. An explicit `exclude: ['e2e/**']` in `vitest.config.ts` is part of this phase's Wave 0 work (E2E-01).

---

## Sampling Rate

- **After every task commit:** `npx playwright test e2e/smoke.spec.ts` (fastest meaningful signal; `reuseExistingServer` amortizes prod-build cost during local iteration)
- **After every plan wave:** `npx playwright test` (full suite — confirms the deliberate red/green split is exactly as expected, not accidentally all-red from a config bug or all-green from a scope violation)
- **Before `/gsd-verify-work`:** Full suite run once more with explicit manual confirmation of the expected split — **this phase's success condition is NOT "full suite green"**: `freshness-fresh-paths.spec.ts` must be 100% green, `freshness-router-cache.spec.ts` + `freshness-client-shell.spec.ts` must be red on exactly the 9 cells `24-DIAGNOSIS.md` predicts, and `smoke.spec.ts` must be 100% green. A fully-green freshness run is a scope violation (Phase 26's job), not a pass.
- **Max feedback latency:** ~180s (one full local run, includes prod build + boot)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-0N | 01 | 1 | E2E-01, E2E-02 | T-25-01 / — | `webServer` boots prod build only (never dev mode); setup project authenticates via real `POST /api/login`, never direct cookie injection | config + e2e | `npx playwright test --project=setup && npx playwright test --list` | ❌ W0 — `playwright.config.ts` does not exist yet | ⬜ pending |
| 25-01-0N | 01 | 1 | E2E-03 | T-25-02 / — | DB-isolation guard hard-fails fast on any `libsql://` `DATABASE_URL`, before any browser work starts | negative test | Temporarily set `DATABASE_URL=libsql://fake`, run `npx playwright test`, confirm non-zero exit occurs before any browser opens | ❌ W0 — `global-setup.ts` does not exist yet | ⬜ pending |
| 25-0N-0N | 0N | N | E2E-04 | — | Smoke spec asserts specific per-route seeded data (due-count, card-count, mastered-count, streak text), not a generic 200/skeleton-absence check | e2e | `npx playwright test e2e/smoke.spec.ts` | ❌ W0 — spec does not exist yet | ⬜ pending |
| 25-0N-0N | 0N | N | E2E-06 | — | Freshness-regression specs encode all 16 matrix cells; 9 deliberately red, 7 green; use `page.goBack()`/visibility-toggle resume simulation, never a `page.goto()`-based recovery or `test.fail()`/`test.fixme()` masking | e2e | `npx playwright test e2e/freshness-*.spec.ts` | ❌ W0 — specs do not exist yet | ⬜ pending |
| 25-0N-0N | 0N | N | E2E-07 | — | A failed run emits a trace and parseable `line`-reporter output | config | Force one assertion to fail (or rely on the real freshness red state), run `npx playwright test`, inspect `test-results/*/trace.zip` via `npx playwright show-trace` | ❌ W0 — trace/reporter config does not exist yet | ⬜ pending |

*Final task IDs are assigned by the planner; this table's shape (webServer + auth setup, DB-isolation guard, smoke spec, freshness-regression specs, trace/reporter config) is the validation contract the planner's tasks must satisfy.*

---

## Wave 0 Requirements

- [ ] `playwright.config.ts` — does not exist; `webServer` (prod build, dedicated port 3100 per D-12), `projects` (`setup` + `chromium`, `dependencies: ['setup']`, `storageState`), `trace: 'on-first-retry'`, `reporter: 'line'`
- [ ] `@playwright/test` devDependency install — raw `playwright` already present from Phase 24; confirm whether a separate install is required
- [ ] `e2e/` directory tree — does not exist; `auth.setup.ts`, `global-setup.ts`, `helpers/` (ported `isRscRequest()`, `simulateResume()`, DB guard), `smoke.spec.ts`, `freshness-router-cache.spec.ts`, `freshness-client-shell.spec.ts`, `freshness-fresh-paths.spec.ts`
- [ ] `vitest.config.ts` — needs an explicit `exclude: ['e2e/**']` added (currently has no `exclude` key) so Vitest doesn't pick up `e2e/*.spec.ts` (E2E-01)
- [ ] Seed script/fixture for the isolated `file:` test DB (D-13's richer fixture: ~8 cards / 2 lessons / 1 `CardDependency` edge / some mastered `CardReview` rows)

*Wave 0 exists because none of this phase's test infrastructure exists yet — it must all be built before any spec can run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| D-04 CR-01 re-verification match/mismatch | E2E-06 | Requires comparing the real spec run's pass/fail against Phase 24's documented per-cell verdict — a judgment call on whether a mismatch is a flagged finding vs. a genuine spec bug, not a pass/fail assertion | After the first real `npx playwright test` run of the finished back-forward specs, compare actual results for the `/`, `/study`, `/cards`, `/habits` back-forward cells against `24-DIAGNOSIS.md`'s verdicts; escalate any mismatch per CONTEXT.md's deferred escalation mechanism |
| Freshness-regression red state is real, not `test.fail()`-masked | E2E-06 | Automated checks can't distinguish a genuinely-red assertion from a `test.fail()`/`test.fixme()`-annotated one without reading spec source | Read each freshness spec file; confirm plain `expect()` assertions are used for the 9 stale cells, never Playwright's expected-failure annotations |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
