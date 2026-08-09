---
phase: 34
slug: local-first-shell
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-09
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (`vitest.config.ts`, `environment: 'node'`) + Playwright (`e2e/*.spec.ts`, prod-build server on port 3100) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| **Quick run command** | `npx vitest run tests/<new-file>.test.ts` |
| **Full suite command** | `npm test` (vitest) |
| **Estimated runtime** | ~4s full vitest suite (31 files / 333 tests, measured 2026-08-09); e2e suite is heavier — reserve for wave-boundary/pre-verify only |

---

## Sampling Rate

- **After every task commit:** Run the quick command scoped to the file(s) touched by that task
- **After every plan wave:** Run `npm test` (full vitest suite)
- **Before `/gsd-verify-work`:** Full vitest suite must be green; run the relevant `e2e/perf.spec.ts` / new e2e coverage if this phase adds Playwright specs
- **Max feedback latency:** ~10s (vitest full suite + margin)

---

## Per-Task Verification Map

*Populated once PLAN.md task IDs exist — the planner assigns `<verify>` commands per task; this table is the execution-time cross-reference. Left unfilled at seed time (draft status) since no plans exist yet.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | LOCAL-01..05 | — | N/A | unit/e2e | TBD | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `package.json` — add `idb` (8.0.3) as a runtime dependency (research-recommended IndexedDB wrapper; no existing IndexedDB dependency in the project)
- [ ] `package.json` (devDependencies) — add `fake-indexeddb` so `lib/local-cache.ts`'s pure read/write/key logic is unit-testable under vitest's `environment: 'node'` (no real IndexedDB in Node; `vitest.config.ts` is not being switched to jsdom for this)
- [ ] `tests/local-cache.test.ts` (new) — stubs for LOCAL-01/LOCAL-02/LOCAL-04 (cache key scheme, build-ID/version discard, read/write API)

*Any additional Wave 0 items (e.g. a shared test fixture for the IndexedDB polyfill) are the planner's call once file layout is decided — record them in the plan's Wave 0 task if introduced.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| First paint from cache before network resolves (SC1) | LOCAL-01 | Requires observing render timing / network-waterfall on a real mount, not just unit-testable state | Throttle network in devtools or Playwright MCP, reload Home/Study/Cards/Habits, confirm real content (not a skeleton) appears before the XHR/fetch for that route's data resolves |
| Fully offline first-visit-of-session behavior (SC2) | LOCAL-05 | Requires actually disabling network (devtools "Offline" / airplane mode), not simulable in vitest's node environment | With network disabled, open the app; confirm last-known Home/Cards/Habits data renders instead of an error or blank screen |
| Pull-to-refresh escape hatch bypasses cache+version-check (SC5) | LOCAL-01..05 | Touch-gesture interaction (`usePullToRefresh`) — requires a real or simulated pointer/touch sequence | Playwright MCP: perform the pull gesture on each of Home/Study/Cards/Habits, confirm a network request fires unconditionally and fresh data replaces cached data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
