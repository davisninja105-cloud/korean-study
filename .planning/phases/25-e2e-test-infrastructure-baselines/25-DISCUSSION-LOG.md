# Phase 25: E2E Test Infrastructure & Baselines - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 25-E2E Test Infrastructure & Baselines
**Areas discussed:** Freshness-regression spec scope, Smoke/first-load baseline assertions, Reusing scripts/diagnose-freshness.mts, Harness conventions (directory/port/seed/CI)

---

## Freshness-Regression Spec Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Stale-only (9 cells) | Minimal, encodes only "red because bug present" cells | |
| Full 16-cell net | Also assert the 7 confirmed-fresh cells stay fresh | ✓ |
| You decide | Researcher/planner chooses | |

**User's choice:** Full 16-cell net.
**Notes:** Stronger regression protection so Phase 26's fix can't silently break an already-working path.

| Option | Description | Selected |
|--------|-------------|----------|
| Re-verify via first real run | The finished spec's actual pass/fail against the 4 flagged back-forward cells IS the CR-01 re-verification | |
| Trust diagnosis as-is | Encode all 4 verdicts directly, no extra scrutiny | |
| You decide | Researcher/planner chooses | ✓ |

**User's choice:** You decide (confirmed in a follow-up question: "First real test run is the verification").
**Notes:** Closes Phase 24's `24-REVIEW.md` CR-01 gap cheaply, using work already being done rather than adding a separate manual step.

| Option | Description | Selected |
|--------|-------------|----------|
| Split by root cause (2 files) | router-cache-reuse.spec.ts + client-shell-nonresync.spec.ts | ✓ |
| Single spec file | freshness-regression.spec.ts, all cases | |
| Split by route (4 files) | Mirrors app route structure | |

**User's choice:** Split by root cause (2 files).
**Notes:** Mirrors the diagnosis's own two-category framing; keeps Phase 26's fix-verification aligned to the mechanism being fixed.

| Option | Description | Selected |
|--------|-------------|----------|
| Both DOM + network | Network evidence for root-cause fidelity + DOM assertion for user-visible truth | ✓ |
| DOM-only | Simpler, user-visible behavior only | |
| Network-only | Matches diagnosis methodology exactly | |

**User's choice:** Both DOM + network.
**Notes:** Phase 26 needs both signals to confirm its fix addresses the right mechanism per cell.

---

## Smoke / First-Load Baseline Assertions

| Option | Description | Selected |
|--------|-------------|----------|
| Specific per-route data assertions | Due-count, card list items, streak number, etc. — reuses diagnosis script's reader pattern | ✓ |
| Generic content-shape check | No-skeleton-class + known heading present | |
| You decide | Researcher/planner picks per route | |

**User's choice:** Specific per-route data assertions.

| Option | Description | Selected |
|--------|-------------|----------|
| Content-only, no timing | Phase 27 owns all timing instrumentation | |
| Capture timing data now, no assertions | Informational Navigation Timing capture; Phase 27 adds budgets | ✓ |
| You decide | Researcher/planner decides | |

**User's choice:** Capture timing data now, no assertions.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared global seed | One seed script/fixture for all specs, serial workers | ✓ |
| Dedicated smoke fixture | Smoke seeds its own minimal independent dataset | |

**User's choice:** Shared global seed.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared webServer (one boot) | One playwright.config.ts, one server for all specs | ✓ |
| Separate webServer for smoke | Isolates smoke from mutation-heavy freshness scenarios | |

**User's choice:** Shared webServer (one boot).

---

## Reusing scripts/diagnose-freshness.mts

| Option | Description | Selected |
|--------|-------------|----------|
| Port + retire the script | Extract reusable pieces into e2e/, delete the throwaway script | ✓ |
| Keep both | Leave script standalone, duplicate logic into harness | |

**User's choice:** Port + retire the script.

| Option | Description | Selected |
|--------|-------------|----------|
| First real test run is the verification | No separate manual step for CR-01 | ✓ |
| Separate manual pass first | Extra confidence step before finalizing spec text | |

**User's choice:** First real test run is the verification. (Confirms the earlier "you decide" resolution.)

| Option | Description | Selected |
|--------|-------------|----------|
| Shared helper module | e.g. e2e/helpers/rsc.ts, single source of truth | ✓ |
| Inline per spec file | Simpler, less abstraction | |

**User's choice:** Shared helper module.

| Option | Description | Selected |
|--------|-------------|----------|
| Setup project → storageState | Playwright's documented pattern, POST /api/login once | ✓ |
| Direct cookie injection | Reuse computeAuthToken() directly, what the diagnosis script did | |
| You decide | Researcher/planner picks | |

**User's choice:** Setup project → storageState.
**Notes:** More conventional Playwright shape, matches research's stated preference, exercises the real login route once as a side benefit.

---

## Harness Conventions

| Option | Description | Selected |
|--------|-------------|----------|
| e2e/ | Matches research's ARCHITECTURE.md draft | |
| tests-e2e/ | Parallels existing tests/ (Vitest) naming | |
| You decide | Researcher/planner picks | ✓ |

**User's choice:** You decide → locked to `e2e/` (matches research draft, Playwright-conventional default).

| Option | Description | Selected |
|--------|-------------|----------|
| 3100 | Matches PITFALLS.md's explicit recommendation | |
| 3200 | Matches what diagnose-freshness.mts already used | |
| You decide | Researcher/planner picks | ✓ |

**User's choice:** You decide → locked to `3100` (matches PITFALLS.md's explicit research recommendation).

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse diagnosis seed as-is | Proven minimal shape (1 lesson, 3 cards, 3 due reviews) | |
| Richer fixture now | Add mastered cards, dependency edges, etc. | ✓ |
| You decide | Researcher/planner sizes it | |

**User's choice:** Richer fixture now.
**Notes:** Covers Habits/CEFR-band assertions and gets ahead of Phase 27's coverage needs.

| Option | Description | Selected |
|--------|-------------|----------|
| Local/on-demand only | No CI wiring, matches repo's current no-CI reality | ✓ |
| Add basic CI wiring | Set up GitHub Actions to run E2E on push/PR | |

**User's choice:** Local/on-demand only.

---

## Claude's Discretion

- Exact file boundaries within the root-cause-split freshness-regression spec — where confirmed-fresh cells land, as long as the two-file root-cause split for stale cells is preserved.
- `e2e/` directory name and port `3100` — user explicitly deferred both; locked based on research recommendations.
- Escalation mechanism if a CR-01 re-verification surfaces a mismatch against the Phase 24 diagnosis — exact handling left to the executor at that moment.

## Deferred Ideas

- CI/GitHub Actions wiring — explicitly out of scope for this phase.
- Fixture scope creep — D-13 sets a floor (mastered cards + 1 dependency edge); planner should resist over-building beyond what Phase 25's own specs need.
- Cross-browser (WebKit) testing — already deferred to v2 as E2E-10; confirmed still out of scope, not re-discussed in depth.
