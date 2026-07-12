---
phase: 25-e2e-test-infrastructure-baselines
verified: 2026-07-11T20:30:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 25: E2E Test Infrastructure & Baselines Verification Report

**Phase Goal:** Stand up an isolated, authenticated Playwright harness that boots a production build, with a smoke/first-load baseline as a performance guard rail and a red freshness-regression spec encoding the Phase 24 diagnosis — the guard rails that must exist before any fix lands.

**Verified:** 2026-07-11T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

**Verification method:** Every claim below was checked by actually running the relevant command in this repo (not by reading SUMMARY.md prose or grepping for symbol presence alone). Playwright suites were executed end-to-end against a real production build (`npm run build && npm run start`) on an isolated `file:` SQLite DB, and their real pass/fail output was inspected directly.

## Goal Achievement

### Observable Truths (mapped to ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npx playwright test` boots a production build via `webServer`, Chromium specs discovered separately from Vitest, setup project logs in once via `/api/login` producing a reusable `storageState` (E2E-01, E2E-02) | ✓ VERIFIED | Ran `npx playwright test --project=setup`: webServer log shows `[global-setup]` seed lines, then `prisma generate && next build`, then `next start -p 3100 -H 127.0.0.1`, then `1 passed` (authenticate). `playwright/.auth/user.json` created and contains a `ks_auth` cookie (grepped directly). Ran `npm test`: 241 tests / 18 files pass, zero `e2e/` paths discovered. |
| 2 | E2E runs execute against an isolated, seeded `file:` SQLite DB with a host guard that fails fast on a `libsql://` URL (E2E-03) | ✓ VERIFIED | Ran `DATABASE_URL=libsql://fake npx playwright test --list`: exit code **1**, stderr contains `✗ FATAL: DATABASE_URL must be an isolated local file: test database.` — before any build/server/browser work. Traced `assertLocalDb` call sites: `playwright.config.ts` (config-load), `e2e/global-setup.ts` (runtime re-check), `e2e/seed.ts:getTestPrisma()` (force-overrides `process.env.DATABASE_URL = TEST_DB_URL` before every dynamic import). No code path in the harness can reach a non-`file:` DB. |
| 3 | A smoke spec asserts every main route (`/`, `/cards`, `/study`, `/habits`) renders real content on first paint, establishing the first-load perf guard rail (E2E-04) | ✓ VERIFIED | Ran `npx playwright test e2e/smoke.spec.ts --project=chromium`: **5 passed** (1 setup + 4 route assertions). Each assertion compares against a `FIXTURE`-derived value (`FIXTURE.dueCards`, `FIXTURE.totalCards`, `FIXTURE.masteredCards` — grepped 4 occurrences of `FIXTURE.` in the spec, zero hardcoded literals). `[nav-timing]` lines captured for all 4 routes; zero `toBeLessThan`/`toBeGreaterThan` in the file (informational-only, no budget assertion, matching D-06). Re-ran the freshness specs first, then smoke — still 4/4 pass, proving the `beforeAll resetToBaseline()` ordering safeguard actually works (not just claimed). |
| 4 | A freshness-regression spec encodes the Phase 24 diagnosis (FRESH-03/04/05) against the production build and is currently red (E2E-06) | ✓ VERIFIED | Ran all three freshness spec files directly: `freshness-router-cache.spec.ts` → **5 failed** (all 5 predicted Stale-RouterCache cells); `freshness-client-shell.spec.ts` → **3 failed / 1 passed** (documented, human-approved re-verification divergence — `/habits post-mutation-return` is now genuinely fresh, contradicting the original 24-DIAGNOSIS.md finding for that specific cell; the 3 back-forward cells still fail as predicted); `freshness-fresh-paths.spec.ts` → **7 passed** (all 7 predicted fresh cells). Totals: 8 red / 8 green out of 16 cells (matches 25-03-SUMMARY.md's documented tally exactly, including the one intentional divergence). `grep -c "test.fail(\|test.fixme(\|test.skip("` across all three spec files returns **0** — no annotation-masking. Every test body pairs a network-evidence check (`isRscRequest`/fetch-count) with a DOM-content check (reader functions) — confirmed via grep counts on both. |
| 5 | A failed run emits a Playwright trace and parseable line-reporter output usable by both human and AI agent (E2E-07) | ✓ VERIFIED | Re-ran `freshness-router-cache.spec.ts` (genuinely failing today) — `test-results/` contains 5 real `trace.zip` files (2.17MB, 2.36MB, 121KB, 118KB, 102KB). Validated one with `file` (confirmed "Zip archive data") and `unzip -l` (confirmed non-empty, contains `test.trace`, `0-trace.trace`, `0-trace.network`, page screenshots, DOM snapshots — a genuinely inspectable trace). Reporter stdout is one line per test (`line` reporter format), confirmed by direct inspection of captured output. Deviation note: config uses `trace: 'retain-on-failure'` instead of the requirement's parenthetical `'on-first-retry'`, documented in-code and in 25-01-SUMMARY.md with clear rationale (`retries: 0` is locked, so `on-first-retry` would never fire and produce zero traces — `retain-on-failure` is the mechanism that actually satisfies the requirement's stated behavior). Accepted as a reasoned, documented deviation, not a gap. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified — every truth above was proven by actually executing the test suite, not by reading claims or checking symbol presence)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `playwright.config.ts` | webServer (prod build, port 3100, loopback), setup+chromium projects, trace retain-on-failure, line reporter, workers:1 | ✓ VERIFIED | Present, matches spec exactly; loaded and used successfully across every run in this verification |
| `e2e/helpers/test-db.ts` | `TEST_DB_PATH`/`TEST_DB_URL` | ✓ VERIFIED | Present, exports confirmed, used by config/global-setup/seed |
| `e2e/helpers/build-guard.ts` | `assertLocalDb` allow-list guard | ✓ VERIFIED | Present; negative test (`libsql://fake`) actually run and confirmed to fail closed |
| `e2e/global-setup.ts` + `e2e/run-global-setup.ts` | DB reset/push/WAL/seed/sanity, tsx-invoked wrapper | ✓ VERIFIED | Present; log ordering confirmed (`[global-setup]` lines precede `next build` output in a real captured run) |
| `e2e/fixture.ts` | `FIXTURE` constants | ✓ VERIFIED | Present, values (dueCards:3, masteredCards:3, totalCards:8, etc.) match what the DB actually contains post-seed (sanity-checked by global-setup itself) |
| `e2e/seed.ts` | `seedFixture`/`resetToBaseline`/`getTestPrisma` | ✓ VERIFIED | Present; `resetToBaseline()` reworked to a tsx-subprocess delegation (documented deviation, transparent to callers) — confirmed working via the ordering-safeguard re-test |
| `e2e/auth.setup.ts` | setup-project login via `/api/login` → storageState | ✓ VERIFIED | Present; storageState file genuinely produced with a `ks_auth` cookie via a real POST, not a direct cookie injection |
| `e2e/helpers/readers.ts` | 6 retry-safe DOM readers | ✓ VERIFIED | Present; exercised end-to-end by the smoke spec's real pass |
| `e2e/smoke.spec.ts` | 4 route tests + nav-timing | ✓ VERIFIED | Present; 4/4 pass with FIXTURE-traceable assertions |
| `e2e/helpers/rsc.ts` | `isRscRequest` | ✓ VERIFIED | Present; used across all 3 freshness spec files |
| `e2e/helpers/resume.ts` | `simulateResume` | ✓ VERIFIED | Present; drives the 4 router-cache "resume" cells (all fail as predicted) |
| `e2e/helpers/mutate.ts` + `e2e/run-mutate.ts` | DB mutators + live expected-value queries | ✓ VERIFIED | Present; used by all 16 freshness cells |
| `e2e/freshness-router-cache.spec.ts` | 5 Stale-RouterCache cells (RED) | ✓ VERIFIED | 5/5 fail as predicted, real run |
| `e2e/freshness-client-shell.spec.ts` | 4 Stale-ClientShell cells (RED, one documented divergence) | ✓ VERIFIED | 3/4 fail as predicted; 1/4 (`/habits post-mutation-return`) re-verified genuinely fresh — documented, human-approved divergence, not a defect |
| `e2e/freshness-fresh-paths.spec.ts` | 7 confirmed-fresh cells (GREEN) | ✓ VERIFIED | 7/7 pass, real run |
| `scripts/diagnose-freshness.mts` | DELETED (D-08) | ✓ VERIFIED | File absent (`ls` confirms no such file); `grep -rn "diagnose-freshness" app/ components/ lib/ package.json scripts/` returns zero matches |
| `vitest.config.ts` | `test.exclude` gains `e2e/**` | ✓ VERIFIED | Present; `npm test` confirms zero `e2e/` files discovered |
| `.gitignore` | runtime artifact entries | ✓ VERIFIED | `/playwright/.auth/`, `/playwright-report/`, `/test-results/`, `/e2e/.tmp/` all present; `git status --porcelain` clean after multiple real test runs in this verification session |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `playwright.config.ts` | `e2e/helpers/test-db.ts` | `webServer.env.DATABASE_URL` pinned to `TEST_DB_URL` | ✓ WIRED | Confirmed in config source; confirmed by the fact the harness never touches the real Turso DB across every run performed |
| `e2e/global-setup.ts` | `e2e/seed.ts` | calls `seedFixture()` after db push | ✓ WIRED | Confirmed via captured log: "Seeding fixture data…" → "seeded 8 cards (3 due, 3 mastered)" |
| `e2e/auth.setup.ts` | `app/api/login/route.ts` | real `POST /api/login` | ✓ WIRED | Confirmed: `playwright/.auth/user.json` contains a genuine `ks_auth` cookie produced by a real request, not injected |
| `playwright.config.ts` | `playwright/.auth/user.json` | chromium project `storageState` + `dependencies: ['setup']` | ✓ WIRED | Confirmed: chromium-project tests (smoke, freshness) run authenticated without any login UI interaction |
| `e2e/smoke.spec.ts` | `e2e/helpers/readers.ts` | imports 4 readers | ✓ WIRED | Confirmed via real pass of all 4 route assertions |
| `e2e/smoke.spec.ts` | `e2e/fixture.ts` | assertions compare against `FIXTURE.*` | ✓ WIRED | Grepped: 4 occurrences of `FIXTURE.` in the spec |
| `e2e/smoke.spec.ts` | `e2e/seed.ts` | `resetToBaseline()` in `beforeAll` | ✓ WIRED | Confirmed via the freshness-then-smoke ordering re-run: smoke still passes 4/4 |
| all 3 freshness specs | `e2e/helpers/rsc.ts` / `resume.ts` / `mutate.ts` / `readers.ts` / `e2e/seed.ts` | dual DOM+network evidence per D-03, `resetToBaseline()` in `beforeEach` | ✓ WIRED | Confirmed by real, independent runs of all three files matching the predicted matrix |

### Behavioral Spot-Checks / Real Runs Performed

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| E2E-03 negative test | `DATABASE_URL=libsql://fake npx playwright test --list` | exit 1, FATAL message | ✓ PASS |
| Vitest/Playwright discovery isolation | `npm test` | 241 tests/18 files, 0 e2e/ paths | ✓ PASS |
| Full harness boot | `npx playwright test --project=setup` | 1 passed; storageState + ks_auth cookie produced; log ordering correct | ✓ PASS |
| Smoke spec | `npx playwright test e2e/smoke.spec.ts --project=chromium` | 5 passed (1 setup + 4 routes), nav-timing x4 | ✓ PASS |
| Smoke ordering safeguard | freshness-router-cache then smoke, same run | 5 failed (freshness) + 5 passed (setup+smoke) | ✓ PASS |
| Freshness — router cache | `npx playwright test e2e/freshness-router-cache.spec.ts --project=chromium` | 5 failed (predicted RED) | ✓ PASS (matches prediction) |
| Freshness — client shell | `npx playwright test e2e/freshness-client-shell.spec.ts --project=chromium` | 3 failed / 1 passed (documented divergence) | ✓ PASS (matches documented, human-approved finding) |
| Freshness — fresh paths | `npx playwright test e2e/freshness-fresh-paths.spec.ts --project=chromium` | 7 passed (predicted GREEN) | ✓ PASS (matches prediction) |
| E2E-07 trace evidence | re-run router-cache spec, inspect `test-results/` | 5 valid trace.zip files (102KB–2.36MB), `unzip -l` confirms real trace content | ✓ PASS |
| Anti-masking gate | `grep "test.fail(\|test.fixme(\|test.skip("` across freshness specs | 0 matches | ✓ PASS |
| Script deletion | `ls scripts/diagnose-freshness.mts`; `grep -rn "diagnose-freshness" app/ components/ lib/ package.json scripts/` | file absent; 0 dangling references | ✓ PASS |
| Lint | `npx eslint e2e playwright.config.ts vitest.config.ts` | clean | ✓ PASS |
| Typecheck | `npx tsc --noEmit` (excluding pre-existing deferred errors) | clean | ✓ PASS |
| Git cleanliness | `git status --porcelain` after multiple real test runs | clean (no test artifacts leaked) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| E2E-01 | 25-01 | Playwright configured with webServer, isolated from Vitest discovery | ✓ SATISFIED | Config present and proven; Vitest exclusion proven live. Note: implementation narrows to production-build-only `webServer` (not "either dev or prod" as REQUIREMENTS.md's literal text allows) — this narrowing is the ROADMAP's own Success Criterion 1 wording ("boots a production build via webServer") and D-12/Pitfall-9's explicit recommendation, made and documented during phase planning. Not a gap — the ROADMAP contract (the authoritative success criteria for this phase) matches what was built. |
| E2E-02 | 25-01 | Setup project produces reusable storageState, no per-test login UI | ✓ SATISFIED | Real `/api/login` POST → storageState with `ks_auth` cookie, proven live |
| E2E-03 | 25-01 | Isolated seeded `file:` DB, structurally prevented from hitting Turso | ✓ SATISFIED | Negative test proven live; guard traced at every Prisma-client construction path (config, global-setup, seed, mutate/reset subprocesses) |
| E2E-04 | 25-02 | Smoke spec verifies real content on first paint on every main route | ✓ SATISFIED | 4/4 FIXTURE-traceable assertions proven live; zero HTTP-200-only/skeleton-absence check |
| E2E-06 | 25-03 | Freshness regression spec proves FRESH-03/04/05, fails if bug reappears | ✓ SATISFIED | 16-cell matrix proven live: 8 red / 8 green, matching 24-DIAGNOSIS.md except one explicitly documented, human-approved re-verification divergence (`/habits post-mutation-return` now fresh) |
| E2E-07 | 25-01, 25-03 | Failed runs produce a trace + parseable line-reporter output | ✓ SATISFIED | Real trace.zip validated live from a genuine (not synthetic) failure; line-reporter format confirmed |

No orphaned requirements — all 6 requirements declared in this phase's PLAN frontmatter (E2E-01, E2E-02, E2E-03, E2E-04, E2E-06, E2E-07) match the phase's REQUIREMENTS.md traceability row assignments exactly. E2E-05 (grade-flow spec, Phase 27) and PERF-04/05/TOOL-01 (Phase 27) are correctly out of this phase's scope and not claimed by any Phase 25 plan.

### Anti-Patterns Found

No TBD/FIXME/XXX/HACK/PLACEHOLDER/"not yet implemented" markers found in any `e2e/` file, `playwright.config.ts`, or `vitest.config.ts` (grepped directly). No `test.fail()`/`test.fixme()`/`test.skip()` masking anywhere in the freshness specs (grepped directly, zero matches).

Three WARNING-level findings from 25-REVIEW.md (0 critical, 3 warning, 5 info) were re-confirmed directly against the source during this verification — all are genuine, secondary robustness gaps, none of them break or falsify anything claimed above:

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `e2e/helpers/mutate.ts:93-96` | `cardMutationCounter` | Module-level counter resets to 0 on every subprocess spawn, so `createMutationCard()` always produces the identical front `추가단어1` | WARNING | Harmless today (every spec resets to baseline and calls it at most once per test), but would throw a Prisma `P2002` unique-constraint error the moment a future test calls it twice without an intervening reset. Confirmed via direct code read (`e2e/helpers/mutate.ts:93-119`) matching REVIEW.md's WR-01 exactly. |
| `e2e/helpers/mutate.ts:150-157`, `e2e/seed.ts:235-241` | `DATABASE_AUTH_TOKEN` | Not blanked in mutate/reset subprocess envs (webServer.env blanks it, these two spawn sites don't) | WARNING | Low practical risk (`@libsql/client` ignores the token for `file:` URLs), but inconsistent with the harness's own stated defense-in-depth pattern. Confirmed via REVIEW.md's WR-02. |
| `e2e/seed.ts:173-181`, `e2e/global-setup.ts:80-93` | `CardDependency` edge creation | Silent no-op on lookup miss; sanity check doesn't cover `dependencyEdges`/`lessons`/`studyDays` counts | WARNING | A future fixture-string drift would silently produce zero edges rather than failing loudly at seed time. Confirmed via REVIEW.md's WR-03. |

These are pre-existing findings from the phase's own code review (already surfaced, not newly discovered here) and are appropriately scoped as future hardening — they do not affect whether this phase's stated goal (a working, authenticated, isolated harness with real smoke and freshness guard rails) was achieved. Recommend addressing WR-01/02/03 opportunistically in Phase 26/27, not as a Phase 25 blocker.

### Documentation gap (non-blocking)

`.planning/STATE.md`'s "Blockers/Concerns" section does not yet contain the D-04 CR-01 re-verification divergence recorded in 25-03-SUMMARY.md (the finding that 3 of 4 back-forward cells now show router-cache-reuse evidence rather than client-shell-non-resync evidence, and that `/habits post-mutation-return` re-verified fresh). The plan's Task 2 acceptance criteria asked for this to be recorded "in the SUMMARY and STATE.md's Blockers/Concerns." It is fully recorded in 25-03-SUMMARY.md (verified by direct read) but STATE.md still reflects a pre-wave-3 snapshot (progress 25%, `stopped_at: Phase 25 planning complete`). This is a documentation-sync gap, not a functional gap — the actual spec files correctly encode the finding in their test names and the SUMMARY records it in full detail for Phase 26 to consume. Recommend syncing STATE.md before starting Phase 26 so the mechanism-attribution shift isn't missed by a future session that only skims STATE.md.

### Human Verification Required

None. Both blocking human-verify checkpoints in this phase's plans (Task 1: `@playwright/test` package legitimacy in 25-01; Task 3: trace/reporter proof + CR-01 outcome + script deletion in 25-03) were already resolved via direct, explicit `AskUserQuestion` confirmation from the user during execution (confirmed in 25-03-SUMMARY.md's "Issues Encountered" — the executing agent correctly refused a coordinator-relayed approval and required direct re-confirmation for the irreversible deletion). No further human judgment is needed to close out this phase; the one deferred judgment call (the CR-01 divergence) has already been made and documented as intentional, not a defect.

### Gaps Summary

No blocking gaps. All 5 ROADMAP Success Criteria and all 6 declared requirements (E2E-01, E2E-02, E2E-03, E2E-04, E2E-06, E2E-07) are genuinely satisfied, verified by directly executing the Playwright suites in this session rather than trusting SUMMARY.md claims. The one apparent "gap" — `/habits post-mutation-return` no longer failing in `freshness-client-shell.spec.ts` — is not a defect: it is the documented, human-approved outcome of the D-04 CR-01 re-verification the plan explicitly required, matching the note provided for this verification pass. Two minor non-blocking items are recorded for future attention: (1) three WARNING-level code-review findings (non-functional mutation counter, unblanked auth token in two subprocess spawns, silent CardDependency-edge failure path) that are pre-existing, already-documented robustness gaps rather than newly discovered defects; (2) a documentation-sync gap where STATE.md's Blockers/Concerns section hasn't yet been updated with the CR-01 divergence recorded in 25-03-SUMMARY.md.

---

_Verified: 2026-07-11T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
