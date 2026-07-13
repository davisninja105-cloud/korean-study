---
phase: 27-e2e-coverage-performance-validation
plan: 03
subsystem: testing
tags: [playwright-mcp, claude-code, mcp-server, documentation, exploratory-qa]

# Dependency graph
requires:
  - phase: 27-01
    provides: e2e/grade-flow.spec.ts and the established E2E harness (:3100 isolated prod-build) that this plan's CLAUDE.md section explicitly distinguishes MCP's :3000 dev-server target from
  - phase: 27-02
    provides: no direct code dependency; sibling plan in the same wave
provides:
  - "playwright MCP server registered in this project's Claude CLI MCP config (`claude mcp add playwright npx @playwright/mcp@latest`), approved unpinned via blocking human legitimacy checkpoint"
  - "CLAUDE.md '## Playwright MCP (agent-driven exploratory QA)' section: registration command, npm run dev / :3000 target, :3000-dev vs :3100-harness distinction, real-dev-DB-writes caveat, APP_PASSWORD login step (env-var name only), verified tool-call examples"
  - "Human-verified live MCP exploratory smoke: fresh Claude Code session drove the real dev server (navigate → login → snapshot) and confirmed it matches the documented workflow exactly"
affects: [any future Claude Code session doing exploratory/manual QA against this project's dev server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "MCP server registration is a one-time, machine-local CLI operation (`claude mcp add`), not a repo/package.json change — @playwright/mcp is npx-run, never installed as a dependency"
    - "Package-legitimacy blocking checkpoint (gate=\"blocking-human\") for any [SUS]-flagged npm package before registration/install, per Phase 24/25 precedent — never auto-approvable even under auto_advance"

key-files:
  created: []
  modified:
    - CLAUDE.md

key-decisions:
  - "Human approved the unpinned @latest registration (not the offered @0.0.78 pin) after verifying the [SUS] flag was a version-recency artifact only — official microsoft/playwright-mcp repo, 6.4M downloads/week, no postinstall scripts"
  - "Live smoke (Task 3) reported zero mismatches — the CLAUDE.md section required no post-smoke corrections, so no additional commit was needed beyond Task 2's"

requirements-completed: [TOOL-01]

coverage:
  - id: D1
    description: "Package-legitimacy checkpoint for [SUS]-flagged @playwright/mcp — human reviewed npm registry evidence and approved before any registration/install occurred"
    requirement: TOOL-01
    verification:
      - kind: manual_procedural
        ref: "Task 1 checkpoint — human responded 'approved' (unpinned @latest)"
        status: pass
    human_judgment: true
    rationale: "Package-legitimacy decisions are explicitly excluded from auto-approval (gate=\"blocking-human\") even under workflow.auto_advance — a human must weigh supply-chain trust signals."
  - id: D2
    description: "playwright MCP server registered and listed by the Claude CLI"
    requirement: TOOL-01
    verification:
      - kind: other
        ref: "claude mcp list 2>/dev/null | grep -i playwright -> 'playwright: npx @playwright/mcp@latest - Connected'"
        status: pass
    human_judgment: false
  - id: D3
    description: "CLAUDE.md documents the registration command, npm run dev / :3000 target, :3000-dev vs :3100-harness distinction, real-dev-DB-writes caveat, and APP_PASSWORD login step (env-var name only, no literal secret)"
    requirement: TOOL-01
    verification:
      - kind: other
        ref: "grep -n \"claude mcp add playwright npx @playwright/mcp\" CLAUDE.md (line 168) && grep -n \"APP_PASSWORD\" CLAUDE.md (lines 160, 172 — env-var name only)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live MCP exploratory smoke in a fresh Claude Code session (navigate -> login -> snapshot against localhost:3000) matches the documented CLAUDE.md workflow exactly"
    requirement: TOOL-01
    verification: []
    human_judgment: true
    rationale: "MCP tools only load at session start, so the registering session cannot itself exercise them — the live smoke inherently requires a human running a separate fresh Claude Code session and comparing behavior to the doc (27-VALIDATION.md classifies this as manual-only)."

# Metrics
duration: ~15min (across two agent invocations spanning the Task 3 human checkpoint wait)
completed: 2026-07-13
status: complete
---

# Phase 27 Plan 03: Playwright MCP Registration & Workflow Documentation Summary

**Registered the `playwright` Claude Code MCP server (approved unpinned `@latest` via a blocking package-legitimacy checkpoint) and documented the exploratory-QA workflow in a new CLAUDE.md section, human-verified end-to-end in a fresh session against the real dev server.**

## Performance

- **Duration:** ~15 min of agent execution time (Task 1-2 in the first invocation, Task 3 resolved after a human-side live-smoke session in a separate Claude Code window)
- **Started:** 2026-07-13T17:xx (Task 1 checkpoint presented)
- **Completed:** 2026-07-13 (Task 3 approved: "approved" — live workflow matched CLAUDE.md exactly)
- **Tasks:** 3/3 (1 checkpoint, 1 auto, 1 checkpoint)
- **Files modified:** 1 (CLAUDE.md)

## Accomplishments

- **Task 1 — Package-legitimacy checkpoint:** presented npm-registry evidence for the [SUS]-flagged `@playwright/mcp` (official `microsoft/playwright-mcp` repo, 6,402,173 downloads/week, `postinstall: null`) per the Phase 24/25 precedent. Human approved the unpinned `@latest` variant.
- **Task 2 — Registration + documentation:** ran `claude mcp add playwright npx @playwright/mcp@latest`; confirmed via `claude mcp list` (`playwright: npx @playwright/mcp@latest - ✔ Connected`). Added the `## Playwright MCP (agent-driven exploratory QA)` section to CLAUDE.md, placed immediately before `## Gotchas / conventions`, covering: the exact registration command + `--` separator rule for server flags, the `npm run dev` / `localhost:3000` prerequisite and its distinction from the isolated `:3100` prod-build E2E harness, the real-dev-DB-writes tradeoff, the `APP_PASSWORD` login step (env-var name only, never a literal value), and 4 tool-name examples (`browser_navigate`, `browser_snapshot`, `browser_type`, `browser_click`) verified against the @playwright/mcp 0.0.78 tool list in 27-RESEARCH.md.
- **Task 3 — Live smoke (human-driven, cross-session):** the human opened a fresh Claude Code session (required — MCP tools load only at session start, so the registering session couldn't self-test), ran `npm run dev`, and asked Claude to navigate/login/snapshot the Home page via the newly available MCP tools. Result: **"approved"** — the live workflow matched the documented CLAUDE.md section exactly, with no mismatches in tool names, login flow, or target port. No corrective edit to CLAUDE.md was needed.

## Task Commits

1. **Task 1: Package-legitimacy checkpoint — [SUS]-flagged @playwright/mcp** - checkpoint only, no commit (human approval recorded in conversation)
2. **Task 2: Register the MCP server and write the CLAUDE.md workflow section** - `c88fd75` (docs)
3. **Task 3: Live MCP exploratory smoke** - checkpoint only, no commit (human confirmed live behavior matched Task 2's doc as-written; no correction needed)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified

- `CLAUDE.md` - New `## Playwright MCP (agent-driven exploratory QA)` section (lines 166-176): registration command, dev-server target/port distinction, real-DB-writes caveat, `APP_PASSWORD`-by-name login step, verified tool-call examples.

## Decisions Made

- Approved the unpinned `@latest` registration form over the offered `@0.0.78` pin — the [SUS] flag was judged a version-recency artifact only, not a genuine legitimacy concern, after reviewing the official-repo/download-count/no-postinstall evidence.
- No CLAUDE.md correction was required post-smoke — the doc was accurate to actual MCP behavior on the first live test, so Task 3 concluded without an additional commit.

## Deviations from Plan

None - plan executed exactly as written. Both checkpoints resolved with clean approvals; no Rule 1/2/3 auto-fixes were needed in Task 2, and no corrective re-documentation was needed after Task 3's live smoke.

## Issues Encountered

None.

## User Setup Required

None — MCP server registration is a one-time, machine-local Claude CLI operation already completed during Task 2 (`claude mcp list` confirms it is live). No environment variables, dashboard configuration, or repo changes beyond the CLAUDE.md doc are required.

## REQUIREMENTS.md Traceability Gap Closed

While updating REQUIREMENTS.md for this plan's TOOL-01, this pass also closed a pre-existing gap for **PERF-04**/**PERF-05** (27-02): that plan ran in worktree mode and its central "mark requirement complete" step had not yet been performed (the phase-27 orchestrator commits for waves 1-2 only touched ROADMAP.md, not REQUIREMENTS.md — visible via `git log -- .planning/REQUIREMENTS.md`). Since this is the final plan in Phase 27 and no further plan will touch REQUIREMENTS.md, PERF-04 and PERF-05 are marked complete alongside TOOL-01 in this plan's metadata commit, citing 27-02-SUMMARY.md's already-recorded passing evidence (`e2e/perf.spec.ts`, 8/8 passing, falsifiability-proven).

## Next Phase Readiness

- Phase 27 (e2e-coverage-performance-validation) is now fully complete: all three plans (grade-flow E2E, performance budgets, Playwright MCP) delivered and verified.
- All 16 v1.6 requirements are now complete (FRESH-01..06, E2E-01..07, PERF-04/05, TOOL-01) — milestone v1.6 is ready for a completion pass (`/gsd-complete-milestone` or equivalent).
- No blockers.

## Self-Check: PASSED

- `CLAUDE.md` contains the Playwright MCP section: FOUND (lines 166-176, confirmed via Read)
- Commit `c88fd75` (Task 2): FOUND in `git log --oneline`
- `claude mcp list 2>/dev/null | grep -i playwright`: FOUND (`playwright: npx @playwright/mcp@latest - ✔ Connected`)
- `grep -n "claude mcp add playwright npx @playwright/mcp" CLAUDE.md`: FOUND (line 168)
- `grep -n "APP_PASSWORD" CLAUDE.md`: FOUND (lines 160, 172, 187 — all env-var-name references, no literal secret)

---
*Phase: 27-e2e-coverage-performance-validation*
*Plan: 03*
*Completed: 2026-07-13*
