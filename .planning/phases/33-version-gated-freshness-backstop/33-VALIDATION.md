---
phase: 33
slug: version-gated-freshness-backstop
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-08
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

Two frameworks, both already installed, configured, and green on `main`. No Wave 0
framework install is required.

| Property | Value |
|----------|-------|
| **Framework** | **Vitest 4.1.9** (unit + real-DB integration) and **Playwright** (`@playwright/test`, e2e) |
| **Config file** | `vitest.config.ts` (root; `@` → repo root alias, `environment: 'node'`, excludes `e2e/**`) · `playwright.config.ts` (root; `testDir: './e2e'`, `workers: 1`, `fullyParallel: false`, `retries: 0`, `reporter: 'line'`) |
| **Quick run command** | `npm test` — whole Vitest suite (it is fast enough to never need narrowing) or `npx vitest run tests/<file>` for a single file |
| **Full suite command** | `npm test && npx playwright test e2e/freshness-*.spec.ts` |
| **Estimated runtime** | Vitest full suite **~3 s** (measured 2026-08-08: 30 files / 326 tests in 2.99 s) · four pre-existing freshness specs **~75 s cold** (measured: 19 tests in 1.2 m wall, including `tsx e2e/run-global-setup.ts` + `npm run build` + `next start`) |

**Playwright harness notes** (carried from `playwright.config.ts`, relevant to reading a
failure correctly during execution):
- The e2e suite runs against a **prod build on port 3100** with a throwaway `file:` SQLite
  DB (`TEST_DB_URL`), never the developer's dev DB. `assertLocalDb` refuses to start if an
  ambient remote `DATABASE_URL` is present.
- `retries: 0` — a red freshness spec is a real signal, never a masked flake. This is
  exactly the property Phase 33 depends on (see T-33-08 below).
- The `webServer` command chains global-setup → `npm run build` → `next start`, so the
  first Playwright invocation in a session pays the build cost; back-to-back runs reuse a
  live server (`reuseExistingServer: !process.env.CI`).
- Every Playwright invocation also runs the `setup` project (`e2e/auth.setup.ts`), so the
  reported test count is always **chromium tests + 1**.

---

## Sampling Rate

- **After every task commit:** run that task's own `<automated>` command (table below),
  then `npm test`. The whole Vitest suite is ~3 s, so there is no reason to narrow it.
- **After every plan wave:** `npm test && npx playwright test e2e/freshness-*.spec.ts`
  (wave 1 → also `npm run build`; wave 2 → the full five-spec freshness run).
- **Before `/gsd-verify-work`:** full suite green — `npm test`, all five freshness specs,
  `npm run lint`, `npm run build`, plus the untouched-file diff gates listed in each plan's
  `<verification>` block.
- **Max feedback latency:** **< 90 s** — the slowest single task verify is task 33-02-02's
  three-spec Playwright run; the measured four-spec cold baseline is 75 s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | VERS-01, VERS-02 | T-33-01, T-33-02, T-33-03, T-33-05 | `/api/version` exposes only an opaque `Date.now()` token and inherits auth from an **unmodified** `middleware.ts` matcher (`git diff --exit-code middleware.ts` is an acceptance criterion); the review-path bump is `tx.setting.upsert` inside the existing transaction, so a 404 / 409 / idempotent-replay request leaves the counter untouched | e2e (Playwright, network-evidence) | `npx playwright test e2e/freshness-version-gate.spec.ts` | ◑ created in-task (TDD, RED-first) | ⬜ pending |
| 33-01-02 | 01 | 1 | VERS-01 | T-33-04 | A throwing `bumpDataVersion()` must never fail a `runSync()` that already persisted lessons and cards — wrapped in the same non-fatal `try/catch` + `console.warn` shape as the adjacent `bumpStudyCacheVersion()` block, enforced by the `console.warn`-count acceptance criterion | integration (Vitest, real temp SQLite + real route handler) | `npx vitest run tests/version-route.test.ts` | ◑ created in-task (TDD, RED-first) | ⬜ pending |
| 33-02-01 | 02 | 2 | VERS-02 (VERS-01 harness parity) | T-33-06, T-33-07 | The two new harness ops resolve against a **closed literal** `OPS` record that throws `Unknown mutate op` on a miss — no dynamic name construction, no `eval`; `bumpDataVersionDirect()` can only reach the throwaway test DB because `runMutateOp` pins `DATABASE_URL: TEST_DB_URL` and `assertLocalDb` runs at config load | e2e (Playwright, regression) | `npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts` | ✅ existing | ⬜ pending |
| 33-02-02 | 02 | 2 | VERS-02 | T-33-08 (**high** — the phase's top threat) | The non-vacuity lock turns a stopped bump **red** instead of hollow: a freshness suite that silently no longer exercises the backstop it guards is an unfalsifiable success report. Reinforced by the acceptance criterion forbidding edits to the other three freshness specs (`git diff --stat` must be empty) | e2e (Playwright, non-vacuity lock) | `npx playwright test e2e/freshness-version-gate.spec.ts e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts` | ✅ existing + created in phase | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*File Exists: ✅ exists on `main` today · ◑ does not exist yet, but is created **by the same
task that verifies with it**, is named in that task's `<files>`, and is specified RED-first
via its `<behavior>` block — so no Wave 0 stub is needed · ❌ W0 would mean no task in the
phase creates it.*

---

## Wave 0 Requirements

**Existing infrastructure covers all phase requirements.** No Wave 0 wave is scheduled, and
`wave_0_complete: true` reflects "nothing to do", not "done later".

Justification, item by item:

- **Framework install:** none needed. Vitest and Playwright are both installed, configured
  at the repo root, and currently green (`npm test` → 326 passing; the four freshness specs
  → 19 passing).
- **Shared fixtures:** none needed. `tests/version-route.test.ts` reuses the established
  real-temp-SQLite setup from `tests/review-route.test.ts` verbatim (`mkdtempSync` →
  `prisma migrate diff --from-empty --to-schema` → `executeMultiple()` → dynamic import of
  the real route handler). `e2e/freshness-version-gate.spec.ts` reuses
  `registerRequestLog` / `newDataFetchesForRoute` from `e2e/freshness-router-cache.spec.ts`
  and `simulateResume` from `e2e/helpers/resume.ts`.
- **`MISSING` references:** zero. No `<automated>` block in either plan contains a
  `MISSING` marker; all four are concrete, runnable commands.
- **The three Wave 0 gaps flagged by `33-RESEARCH.md`** are each owned by a named in-phase
  task rather than deferred:

  | 33-RESEARCH.md Wave 0 gap | Owned by |
  |---|---|
  | `tests/version-route.test.ts` (sync bump, review bump, non-bump locks) | task 33-01-02 |
  | An e2e test for the "nothing changed → zero payload fetches" negative case | task 33-01-01 (test 1 of `e2e/freshness-version-gate.spec.ts`) |
  | `e2e/helpers/mutate.ts` — the 3 `*Direct` mutators need the `dataVersion` bump | task 33-02-01 |

---

## Manual-Only Verifications

**All phase behaviors have automated verification.** The one `<human-check>` in the phase
is *supplementary* to an automated command, not a substitute for one — it guards a failure
mode a green exit code cannot express (a test silently disappearing).

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| No freshness test silently disappeared or was skipped to reach green (task 33-02-02 `<human-check>`) | VERS-02 | Playwright exits 0 for a suite that *lost* a test just as readily as for one that passes it. The count itself must be eyeballed once. | Read the `line` reporter's `Running N tests` header. **Measured pre-phase baseline (2026-08-08): 19** for `e2e/freshness-client-shell.spec.ts` + `freshness-router-cache.spec.ts` + `freshness-fresh-paths.spec.ts` + `freshness-gate.spec.ts` (18 chromium + 1 `auth.setup.ts`). Adding the 3 tests in `freshness-version-gate.spec.ts`, the expected post-phase total for all five specs is **22**. Anything lower means a test was lost. |

Two behaviors that `33-RESEARCH.md` initially expected to be manual are in fact automated
by the plans, and are therefore **not** listed above:
- *"`FreshnessWatcher` backstop still applies / TODO records the Next.js version tested"* —
  automated by task 33-01-01's grep gates: `grep -Ec 'TODO.*16\.2\.1'` returns 1,
  `grep -c 'router.refresh()'` returns 1, `grep -c 'COALESCE_MS = 300'` returns 1.
- *"the gate is genuinely open when the Upsert-not-replace section runs"* — automated by
  task 33-02-02's `awk`-scoped ordering criteria over that section of
  `e2e/freshness-fresh-paths.spec.ts`.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 4 tasks, 4 `<automated>`
      blocks, zero `MISSING` markers.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the longest
      run of tasks without an automated verify is **0**.
- [x] Wave 0 covers all MISSING references — there are none; the three research-flagged
      gaps are each owned by a named task (table above).
- [x] No watch-mode flags — `npx vitest run` (explicit `run`, not the default watch),
      `npm test` = `vitest run`, and every Playwright command is a bare
      `npx playwright test <files>` with no `--ui` / `--watch` / `--headed`. Verified by
      grep across both PLAN.md files.
- [x] Feedback latency < 90 s — measured: Vitest full suite 3 s; four freshness specs 75 s
      cold (build + server boot included); the slowest single task verify is a three-spec
      run.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-08-08
