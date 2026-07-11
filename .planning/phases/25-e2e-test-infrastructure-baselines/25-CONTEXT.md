# Phase 25: E2E Test Infrastructure & Baselines - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up an isolated, authenticated Playwright harness that boots a production build (`next build && next start`), with a smoke/first-load baseline as a performance guard rail and a red freshness-regression spec encoding the Phase 24 diagnosis. This phase makes no fix to the actual freshness bug (that's Phase 26) — its deliverable is test infrastructure plus specs that are currently red where the bug reproduces and green where the diagnosis found paths already fresh. Requirements: E2E-01, E2E-02, E2E-03, E2E-04, E2E-06, E2E-07.

</domain>

<decisions>
## Implementation Decisions

### Freshness-Regression Spec (E2E-06)
- **D-01:** The regression spec encodes the **full 16-cell matrix** from `24-DIAGNOSIS.md` (4 routes × back-forward/resume/post-mutation-return/plain-`<Link>`), not just the 9 confirmed-stale cells. The 7 confirmed-fresh cells get "stays fresh" assertions too — a full regression net so Phase 26's fix can't silently break a path the diagnosis found working.
- **D-02:** Spec files are split **by root cause**, matching the diagnosis's own two-category framing: one file for Router Cache reuse cells (`/` back-forward + all 4 resume cells), one file for client-shell state non-resync cells (`/study`, `/cards`, `/habits` back-forward + `/habits` post-mutation-return). Confirmed-fresh cells (plain `<Link>` + the 3 fresh post-mutation-return cells) belong in whichever file matches the navigation path being exercised, or a shared smoke-adjacent fresh-paths file — planner's call on exact file boundaries as long as the root-cause split is preserved.
- **D-03:** Each assertion checks **both** DOM content (what the user actually sees post-navigation) and network evidence (whether an `rsc: 1`-header request fired), reusing the diagnosis's `isRscRequest()` predicate. Network evidence preserves root-cause fidelity; DOM assertion checks what actually matters to the user. Phase 26 needs both signals to confirm its fix addresses the right mechanism per cell.
- **D-04 (CR-01 resolution):** Phase 24's `24-REVIEW.md` CR-01 flagged 4 back-forward verdicts (`/`, `/study`, `/cards`, `/habits`) as needing independent re-verification — the diagnosis script's `about:blank` recovery `page.goto()` may or may not have fired for those cells, which would have silently converted the evidence. Resolution: **the first real `npx playwright test` run of the finished back-forward specs IS the re-verification.** No separate manual pass. If a spec's actual pass/fail for those 4 cells matches Phase 24's verdict, that confirms it; a mismatch is a flagged finding to escalate (likely to the user or into STATE.md blockers), not silently overwritten or trusted away.

### Smoke / First-Load Baseline (E2E-04)
- **D-05:** "Real content" per route is asserted via **specific per-route data assertions** (due-count number on Home, card list items on Cards, streak/mastered-count on Habits, select-mode due-count on Study) — not a generic "no skeleton class" check. Reuses the same per-route "observable reader" pattern the Phase 24 diagnosis script already built (`scripts/diagnose-freshness.mts`'s per-route readers).
- **D-06:** The smoke spec **captures Navigation Timing data now, with no budget assertions** — informational-only console/artifact output. Phase 27 (PERF-04) adds the actual pass/fail timing budgets on top of this existing capture, per median-of-N guidance in `PITFALLS.md` Pitfall 12. Phase 25 does not gate on timing.
- **D-07:** Smoke and freshness-regression specs share **one global seed/fixture** and **one production-build `webServer` instance** (single `playwright.config.ts` boot, serial workers). No per-spec-file server or fixture duplication — matches `PITFALLS.md` Pitfall 9/10 guidance (dedicated port, `reuseExistingServer: !CI`, `workers: 1`, `fullyParallel: false`).

### Reusing `scripts/diagnose-freshness.mts`
- **D-08:** Port the reusable pieces (DB-isolation hard-fail guard, prod-server child-process orchestration, `ks_auth` cookie/auth wiring pattern, `isRscRequest()` predicate, `simulateResume()` visibility-toggle helper) into the new `e2e/` harness, then **retire/delete the throwaway script**. Single source of truth — no dead duplicate logic left in `scripts/`.
- **D-09:** `isRscRequest()` (and any other shared diagnosis-derived predicates) live in a **shared e2e helper module** (e.g. `e2e/helpers/rsc.ts`), not duplicated inline per spec file — matches this project's existing convention of extracting shared pure logic into dedicated modules.
- **D-10:** Auth uses Playwright's **documented setup-project pattern**: one `e2e/auth.setup.ts` logs in via a real `POST /api/login` call once, saves `storageState` to a gitignored path, and all test projects declare `dependencies: ['setup']` + `storageState`. This differs from the Phase 24 diagnosis script's direct `computeAuthToken()` cookie injection — the setup-project pattern is the more conventional Playwright shape, is what the research explicitly recommends, and exercises the real login route as a side effect. `computeAuthToken()`/direct injection is not used in the new harness.

### Harness Conventions
- **D-11:** E2E suite directory is **`e2e/`** (Claude's discretion, user deferred) — matches the research's `ARCHITECTURE.md` draft exactly and is the Playwright-conventional default, kept distinct from `tests/` (Vitest).
- **D-12:** Dedicated `webServer` port is **3100** (Claude's discretion, user deferred) — matches `PITFALLS.md`'s explicit recommendation; avoids the dev server's 3000 so `reuseExistingServer` can never silently attach to a dev-mode process running with the wrong env.
- **D-13:** The E2E seed fixture is **richer than the Phase 24 diagnosis script's minimal shape** (which was just 1 lesson / 3 cards / 3 due reviews). Add at least: some already-mastered `CardReview` rows (state=2, high `scheduledDays`) for Habits/CEFR-band assertions, and at least one `CardDependency` edge — sized to cover this phase's own smoke + freshness assertions plus getting ahead of Phase 27's coverage needs, without turning fixture design into its own large task.
- **D-14:** No CI wiring in this phase. This repo has no GitHub Actions or other CI pipeline today (deploys via `git push origin main` → Vercel auto-deploy, no test gate). The E2E suite stays local/on-demand-run only — matches the ROADMAP's stated success criteria (nothing in Phase 25's scope mentions CI) and avoids scope creep into a new capability.

### Claude's Discretion
- Exact file boundaries within the root-cause-split freshness-regression spec (D-02) — planner decides where confirmed-fresh cells land as long as the two-file root-cause split for stale cells is preserved.
- `e2e/` directory name (D-11) and port 3100 (D-12) — user explicitly deferred both to Claude/researcher/planner judgment; locked here based on research recommendations.
- Escalation mechanism if a CR-01 re-verification (D-04) surfaces a mismatch against the Phase 24 diagnosis — exact handling (STATE.md blocker entry vs. inline spec comment vs. user callout) left to the executor at that moment.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 25 section, "E2E Test Infrastructure & Baselines") — the 5 success criteria this phase must satisfy; also the "Build-order invariant" note above the phase list
- `.planning/REQUIREMENTS.md` — E2E-01, E2E-02, E2E-03, E2E-04, E2E-06, E2E-07 (this phase's requirements); note E2E-05 (grade-flow spec) and E2E-08/09/10 (deferred v2 items) are explicitly NOT this phase's scope

### Phase 24 diagnosis (this phase's spec directly encodes this)
- `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md` — the full 16-cell matrix, all scenario reproduction steps, expected-vs-actual, and evidence for every cell. This is the primary source the freshness-regression spec is built from. Read in full, including "Notes for Phase 25/26" and "Instrumentation Caveats" (contains the CR-01 detail behind D-04).
- `.planning/phases/24-freshness-diagnosis-spike/24-REVIEW.md` — CR-01 finding detail (the `about:blank` recovery-path ambiguity behind D-04)
- `.planning/phases/24-freshness-diagnosis-spike/24-PATTERNS.md` — pattern map for `scripts/diagnose-freshness.mts` (env-first dynamic-import pattern, DB guard shape, progress-logging style) — informs how ported helpers should be structured in `e2e/`
- `scripts/diagnose-freshness.mts` — the throwaway script itself; read before porting (D-08) to identify exactly which functions/predicates to extract (`assertLocalDb`, `waitForServer`, `checkRouteIsDynamic`, `stopServer`, `isRscRequest`, `simulateResume`, the `computeAuthToken` import pattern) before it is deleted

### E2E research (written for this exact phase)
- `.planning/research/PITFALLS.md` — Pitfalls 7 (Turso isolation guard), 8 (auth setup-project vs UI login), 9 (prod-build webServer, dedicated port), 10 (serial workers / shared DB), 11 (timing assumptions — `waitForResponse` not `waitForTimeout`, `reducedMotion: 'reduce'`), 12 (perf-assertion layering — informs D-06's "capture now, assert in Phase 27" split)
- `.planning/research/ARCHITECTURE.md` — lines ~53-99 (proposed `playwright.config.ts` / `e2e/` tree), Pattern 3 (setup project + storageState, informs D-10), Pattern 4 (prod-mode webServer, informs D-12)
- `.planning/research/FEATURES.md` — line ~20 (canonical E2E shape), lines ~40-55 (feature-to-effort table: webServer, auth setup, isolated DB, trace-on-retry)
- `.planning/research/SUMMARY.md` — E2E infrastructure delivery summary, matches this phase's artifact list

### Architecture this phase's specs test against
- `.planning/codebase/ARCHITECTURE.md` — "Client Shell Layer" and "RSC Page Layer" sections (the exact non-resync pattern under test)
- `CLAUDE.md` — "RSC server hydration + DTO pattern" section; the `loading.tsx` gotcha note; Turso `libsql://` gotcha (relevant to D-01/host-guard porting)
- `lib/auth.ts` — `computeAuthToken()` / `AUTH_COOKIE` — read even though D-10 chose setup-project auth, since `middleware.ts` still needs to be understood for how the cookie gates both pages and API routes

No other external specs apply — requirements fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/diagnose-freshness.mts` — contains working, already-proven implementations of: DB-isolation hard-fail guard (`assertLocalDb`), prod-server boot/wait/stop orchestration (`waitForServer`, `stopServer`), build-output dynamic-route sanity check (`checkRouteIsDynamic`), the locked `isRscRequest()` RSC-fetch predicate (confirmed via a 17/24-match sanity gate in Phase 24), and `simulateResume()` (dual-property `document.hidden`/`visibilityState` override). Per D-08, port these into `e2e/`, then delete the script.
- `lib/auth.ts:computeAuthToken()` / `AUTH_COOKIE` — not used directly per D-10 (setup-project chosen instead), but the underlying HMAC scheme is why the setup-project login is cheap (deterministic, no session table, no expiry) and why `middleware.ts` gating both pages and API routes matters for the `storageState`'s cookie needing to work on `request.*` calls too, not just `page.*`.
- `24-DIAGNOSIS.md`'s per-route "observable reader" descriptions (due-count text, "Cards (N)" toggle button text, Proficiency panel mastered-count, select-mode due-count) — reusable as the concrete DOM assertions for both the smoke spec (D-05) and the freshness-regression spec (D-03).

### Established Patterns
- All four RSC pages (`app/page.tsx`, `app/study/page.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx`) declare `dynamic = 'force-dynamic'` — confirmed pre-Phase-24; server-side freshness is not in question, only client-side Router Cache reuse and client-shell `useState(initialProps)` non-resync (the two categories D-02's file split mirrors).
- Local `file:` SQLite test DBs work with `prisma db push` (the Turso DDL gotcha does not apply) — confirmed in Phase 24, reusable for this phase's seed setup.
- `scripts/local-resync.mts`'s env-first dynamic-import pattern (load env vars, override `DATABASE_URL`/`AUTH_SECRET` BEFORE any dynamic `import()` of `lib/prisma.js`/`lib/auth.js`) — the pattern any new seed script or ported helper module must follow, per `24-PATTERNS.md`.

### Integration Points
- New `e2e/` directory, `playwright.config.ts` at repo root, and a seed script are the only new artifacts — no production code (`app/`, `components/`, `lib/`) changes in this phase.
- `package.json` gains `@playwright/test` as a devDependency (already has raw `playwright` from Phase 24 — confirm whether `@playwright/test` needs a separate install or is bundled).
- `vitest.config.ts` test discovery must stay isolated from Playwright's — confirm Vitest's default include globs don't accidentally pick up `e2e/*.spec.ts` (E2E-01 requirement).

</code_context>

<specifics>
## Specific Ideas

- The freshness-regression spec is explicitly meant to be **red at the end of this phase** — that's the ROADMAP success criterion (#4) and the reason Phase 26 exists. Do not "fix" anything to make it pass; a passing regression spec at the end of Phase 25 would indicate a scope violation.
- The richer seed fixture (D-13) should stay proportionate — enough to make Habits/CEFR assertions and future Phase 27 coverage cheap, not a full mirror of a real user's deck.

</specifics>

<deferred>
## Deferred Ideas

- CI/GitHub Actions wiring (D-14) — explicitly out of scope for this phase; revisit only if a future milestone decides this app needs a CI gate.
- Richer-than-needed fixture scope creep — D-13 sets a floor (mastered cards + 1 dependency edge) but planner should resist over-building the fixture; additional fixture needs for Phase 27's grade-flow spec (E2E-05) can be added in that phase instead.
- Cross-browser (WebKit) testing — already deferred to v2 as E2E-10 per REQUIREMENTS.md; not re-discussed here, just confirmed still out of scope.

### Reviewed Todos (not folded)
None — no open todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 25-E2E Test Infrastructure & Baselines*
*Context gathered: 2026-07-11*
