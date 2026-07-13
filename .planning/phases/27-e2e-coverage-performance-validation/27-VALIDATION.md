---
phase: 27
slug: e2e-coverage-performance-validation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-13
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` 1.61.1 (E2E) — no new install this phase; Vitest untouched (new specs live in `e2e/`, already excluded from Vitest discovery per E2E-01) |
| **Config file** | `playwright.config.ts` (no changes anticipated — verified compatible with both new spec files under the existing `chromium` project) |
| **Quick run command** | `npx playwright test e2e/grade-flow.spec.ts --reporter=line` (or `e2e/perf.spec.ts`) |
| **Full suite command** | `npx playwright test --reporter=line` (= `npm run test:e2e`) |
| **Estimated runtime** | Targeted single-spec run ~30–90s (webServer reuses the existing prod build via `reuseExistingServer: !CI`, per Phase 25's precedent); full suite ~180s including the 6 existing freshness/smoke specs plus these 2 new ones |

---

## Sampling Rate

- **After every task commit:** targeted single-spec run (`npx playwright test e2e/<file>.spec.ts --reporter=line`) + `npm run lint` (project's hard constraint on the `data-testid` pass)
- **After every plan wave:** full suite (`npx playwright test --reporter=line`) — confirms the two new specs coexist with the 4 freshness specs + smoke under the existing alphabetical-order + per-file-reset regime
- **Before `/gsd-verify-work`:** full suite green + `claude mcp list` shows the `playwright` server registered + one live MCP exploratory smoke (`browser_navigate` → login → `browser_snapshot`) against `npm run dev`
- **Max feedback latency:** ~90s (one targeted spec run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-0N-0N | 0N | N | E2E-05 | — | Grade-flow spec is a **bounded loop-until-complete** (never a fixed grade count — FSRS "Good" grades need ~6 taps to clear 3 seeded due cards under default ts-fsrs intervals, not 3); asserts reveal→grade positive state transitions, content-anchored queue-advance (all 3 seeded fronts seen), exact `'Session complete!'` heading, and a non-inferable subprocess DB backstop proving `reps >= 1` on all 3 cards (optimistic grading renders completion regardless of whether the background save landed) | e2e | `npx playwright test e2e/grade-flow.spec.ts --reporter=line` | ❌ W0 — spec does not exist yet | ⬜ pending |
| 27-0N-0N | 0N | N | PERF-04 | — | Page-load budgets (4 routes, N=5-median, ~3s) assert every individual sample `> 0` (kills the `PerformanceEntry`-serializes-to-`{}` vacuity pitfall) before comparing the median | e2e | `npx playwright test e2e/perf.spec.ts --reporter=line` | ❌ W0 — spec does not exist yet | ⬜ pending |
| 27-0N-0N | 0N | N | PERF-05 | — | API timing (3 routes incl. `/api/cards/due`, N=5-median, ~1s) asserts `res.ok === true` + non-empty body per sample (a fast error response must fail the budget, not vacuously pass) | e2e | same `perf.spec.ts` run | ❌ W0 — spec does not exist yet | ⬜ pending |
| 27-0N-0N | 0N | N | TOOL-01 | — | `claude mcp add playwright npx @playwright/mcp@latest` registered; `@playwright/mcp` flagged `[SUS]` by the package-legitimacy seam (too-new heuristic, not an actual risk — 6.4M dl/wk, official MS repo, no postinstall) — gate behind a `checkpoint:human-verify` per the Phase 24 precedent; CLAUDE.md's new subsection documents only tool calls verified to exist in the installed `@playwright/mcp` 0.0.78 | manual-only + command check | `claude mcp list` shows `playwright`; then a live MCP smoke (`browser_navigate` → login via `APP_PASSWORD` → `browser_snapshot`) against `npm run dev` | ❌ W0 — not registered yet | ⬜ pending |

*Final task IDs are assigned by the planner; this table's shape (grade-flow spec, perf spec, MCP registration + doc) is the validation contract the planner's tasks must satisfy.*

---

## Wave 0 Requirements

- [ ] `e2e/grade-flow.spec.ts` — covers E2E-05 (does not exist yet)
- [ ] `e2e/perf.spec.ts` — covers PERF-04, PERF-05 (does not exist yet)
- (framework/config/fixtures: none — Phase 25 infrastructure (`playwright.config.ts`, `e2e/fixture.ts`, `e2e/seed.ts`, `e2e/helpers/`) covers everything; no `playwright.config.ts` change needed)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Playwright MCP registration + exploratory smoke | TOOL-01 | MCP tool calls are agent-interactive by nature (drives a live browser session against the dev server) — cannot run inside the Playwright test suite | Run `claude mcp add playwright npx @playwright/mcp@latest`, confirm via `claude mcp list`; start `npm run dev`; drive one exploratory pass (`browser_navigate` to `localhost:3000`, log in with `APP_PASSWORD`, `browser_snapshot`) and confirm the documented CLAUDE.md workflow matches actual tool behavior |
| `@playwright/mcp` package-legitimacy `[SUS]` flag | TOOL-01 | The registration seam flagged the package `too-new` (a version-recency heuristic, not a real risk signal) — human judgment call to proceed, consistent with the Phase 24 precedent for flagged-but-legitimate packages | Before registering, confirm: official `microsoft/playwright-mcp` repo, 6.4M downloads/week, no postinstall scripts; present as a `checkpoint:human-verify` before running the registration command |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
