# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- ✅ **v1.3 Reliability & Hardening** — Phases 13–15 (shipped 2026-07-03)
- ✅ **v1.4 Knowledge Graph Quality & History** — Phases 16–19 (shipped 2026-07-05)
- ✅ **v1.5 Extraction Quality & Reliability** — Phases 20–23 (shipped 2026-07-10)
- 🚧 **v1.6 Freshness, Performance & E2E Testing** — Phases 24–27 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 UI/UX Polish (Phases 3–8 + 8.1) — SHIPPED 2026-06-29</summary>

- [x] Phase 3: UI/UX Audit (1/1 plans) — completed 2026-06-27
- [x] Phase 4: Design System Tokens & Sweep (3/3 plans) — completed 2026-06-27
- [x] Phase 5: Study Session Polish (2/2 plans) — completed 2026-06-28
- [x] Phase 6: Home Dashboard Polish (1/1 plan) — completed 2026-06-28
- [x] Phase 7: Secondary Screens & Navigation (2/2 plans) — completed 2026-06-29
- [x] Phase 8: Accessibility & PWA Baseline (2/2 plans) — completed 2026-06-29
- [x] Phase 8.1: Close gap NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (1/1 inline fix) — completed 2026-06-29

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Performance & Snappiness (Phases 9–12) — SHIPPED 2026-07-01</summary>

- [x] Phase 9: Skeleton Loading Screens (1/1 plans) — completed 2026-06-29
- [x] Phase 10: Cards Hydration + API Parallelization (2/2 plans) — completed 2026-06-30
- [x] Phase 11: Study Page Hydration & Interaction Polish (3/3 plans) — completed 2026-06-30
- [x] Phase 12: Home & Habits Hydration (3/3 plans) — completed 2026-07-01

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Reliability & Hardening (Phases 13–15) — SHIPPED 2026-07-03</summary>

- [x] Phase 13: Review API Hardening & Save Reliability (2/2 plans) — completed 2026-07-02
- [x] Phase 14: Sync Failure Visibility & Caching Performance (2/2 plans) — completed 2026-07-02
- [x] Phase 15: StudySession Refactor & Sentence-Selection Memoization (2/2 plans) — completed 2026-07-03

See `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.4 Knowledge Graph Quality & History (Phases 16–19) — SHIPPED 2026-07-05</summary>

- [x] Phase 16: Components[] Filter Fix (4/4 plans) — completed 2026-07-03
- [x] Phase 17: ReviewLog Schema & Idempotent Write Path (5/5 plans) — completed 2026-07-05
- [x] Phase 18: Review History Page (3/3 plans) — completed 2026-07-04
- [x] Phase 19: Vercel Cron Auto-Sync (3/3 plans) — completed 2026-07-05

See `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.5 Extraction Quality & Reliability (Phases 20–23) — SHIPPED 2026-07-10</summary>

- [x] Phase 20: Extraction Pipeline Hardening (2/2 plans) — completed 2026-07-06
- [x] Phase 21: Card Database Quality Audit (2/2 plans) — completed 2026-07-07
- [x] Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes (3/3 plans) — completed 2026-07-10
- [x] Phase 23: Reliability Bug Fixes (2/2 plans) — completed 2026-07-10

See `.planning/milestones/v1.5-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.6 Freshness, Performance & E2E Testing (In Progress)

**Milestone Goal:** Fix the RSC hydration staleness-vs-speed tradeoff (pages don't show fresh data after navigating back post-study/sync) without regressing first-load speed, and stand up a performance-aware Playwright E2E suite that both automated runs and Claude Code can drive in a real browser.

**Build-order invariant (research):** diagnosis (Phase 24) and the E2E harness + red freshness-regression spec (Phase 25) must both exist *before* the fix (Phase 26), so the fix is validated by a red→green spec and guarded by a first-load baseline — never shipped by feel. Coverage + perf (Phase 27) is a non-blocking follow-on.

- [ ] **Phase 24: Freshness Diagnosis Spike** - Empirically identify, per route, which navigation paths serve stale data on a production build
- [ ] **Phase 25: E2E Test Infrastructure & Baselines** - Playwright harness (isolated DB, auth setup), smoke + first-load baseline, and a red freshness-regression spec
- [ ] **Phase 26: Freshness Fix** - Gated client-shell prop re-sync + resume/mutation-boundary refresh; turn the regression spec green without regressing first-load speed
- [ ] **Phase 27: E2E Coverage & Performance Validation** - Study grade-flow spec, generous page/API timing budgets, and a documented Playwright MCP workflow

#### Phase 24: Freshness Diagnosis Spike

**Goal**: Produce an empirical, per-route diagnosis of exactly which navigation paths serve stale data on a production build (`next build && next start`), attributing each stale path to its cache layer and capturing it as a reproducible failing scenario the later regression spec can encode.
**Depends on**: Nothing (first phase of milestone)
**Requirements**: FRESH-01
**Success Criteria** (what must be TRUE):

  1. A written diagnosis names, for each of `/`, `/cards`, `/study`, `/habits`, which navigation paths (back/forward restore, tab/PWA resume, post-mutation same-route return, plain `<Link>`) do and do not serve stale data, tested on a production build — never `next dev`.
  2. Every stale path is attributed to a root cause — back/forward Router Cache reuse vs. client-shell `useState(initialProps)` non-resync — not left ambiguous.
  3. The diagnosis is captured as a concrete, reproducible scenario (steps + expected-vs-actual) that Phase 25's freshness-regression spec can encode directly.
  4. Paths already fresh (e.g. plain `<Link>` under `staleTimes.dynamic = 0`) are explicitly confirmed non-stale, so the fix stays surgical and leaves them untouched.

**Plans**: 1/2 plans executed

Plans:
**Wave 1**

- [x] 24-01-PLAN.md — Playwright install (blocking [SUS] legitimacy checkpoint) + diagnosis-script plumbing: libsql:// hard-fail guard, isolated file: DB seed, prod-server orchestration, ks_auth cookie injection, end-to-end smoke check

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 24-02-PLAN.md — Empirical RSC-signature confirmation, 16-cell route×path matrix run with binary root-cause classification, and 24-DIAGNOSIS.md authoring

#### Phase 25: E2E Test Infrastructure & Baselines

**Goal**: Stand up an isolated, authenticated Playwright harness that boots a production build, with a smoke/first-load baseline as a performance guard rail and a red freshness-regression spec encoding the Phase 24 diagnosis — the guard rails that must exist before any fix lands.
**Depends on**: Phase 24
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04, E2E-06, E2E-07
**Success Criteria** (what must be TRUE):

  1. `npx playwright test` boots a production build via `webServer`, runs Chromium specs discovered separately from the existing Vitest suite (neither runner picks up the other's tests), and a setup project logs in once via `/api/login` to produce a reusable `storageState` so no spec performs login UI steps. (E2E-01, E2E-02)
  2. E2E runs execute against an isolated, seeded `file:` SQLite database, with a host guard that fails the run fast if `DATABASE_URL` points at a `libsql://` (Turso) URL. (E2E-03)
  3. A smoke spec asserts every main route (`/`, `/cards`, `/study`, `/habits`) renders real content on first paint (not merely HTTP 200), establishing the first-load performance guard rail. (E2E-04)
  4. A freshness-regression spec encodes the Phase 24 diagnosis (FRESH-03/04/05) against the production build and is currently red — failing because the staleness bug is still present. (E2E-06)
  5. A failed run emits a Playwright trace (`trace: 'on-first-retry'`) plus a parseable line-reporter output usable by both a human and an AI agent. (E2E-07)

**Plans**: TBD

#### Phase 26: Freshness Fix

**Goal**: Client shells re-sync to fresh server props at real resume/mutation boundaries (via `router.refresh()` + gated render-phase prop-sync + a `FreshnessWatcher`), turning Phase 25's red freshness-regression spec green while keeping first-load speed and the no-flash guarantee intact.
**Depends on**: Phase 25
**Requirements**: FRESH-02, FRESH-03, FRESH-04, FRESH-05, FRESH-06
**Success Criteria** (what must be TRUE):

  1. Returning to the Home/Habits/Cards pages after completing a study session shows updated stats, due-count, and cards immediately — no manual reload. (FRESH-03)
  2. Browser back/forward navigation to a previously-visited route shows fresh data, not a stale cached RSC payload. (FRESH-04)
  3. Resuming the app after it was backgrounded (tab/PWA focus) refreshes stale data, including the case where the daily cron sync ran while the app was backgrounded. (FRESH-05)
  4. Prop re-sync never clobbers an in-flight interaction — an active study session or an open editor sheet is preserved mid-interaction. (FRESH-02)
  5. First-load render speed is unchanged and no loading-state flash reappears on any of the four main routes; Phase 25's freshness-regression spec is now green and its first-load baseline spec stays green. (FRESH-06)

**Plans**: TBD

#### Phase 27: E2E Coverage & Performance Validation

**Goal**: With infrastructure and the fix both proven, broaden coverage to the full study grade-flow, assert generous page/API timing budgets as behavioral guard rails, and document the Playwright MCP workflow for agent-driven exploratory QA.
**Depends on**: Phase 26
**Requirements**: E2E-05, PERF-04, PERF-05, TOOL-01
**Success Criteria** (what must be TRUE):

  1. A study grade-flow spec covers reveal → grade → queue advance → session completion end-to-end against the seeded DB. (E2E-05)
  2. The suite asserts generous page-load timing budgets on key routes via the Navigation Timing API, using median-of-N runs to reduce flakiness. (PERF-04)
  3. The suite asserts generous API route timing budgets (e.g. `/api/cards/due`) via direct request timing. (PERF-05)
  4. A documented workflow in CLAUDE.md lets Claude Code drive the running dev server interactively via Playwright MCP for exploratory verification. (TOOL-01)

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → ... → 23 (all complete) → 24 → 25 → 26 → 27.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8.1. Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete | 2026-06-29 |
| 9. Skeleton Loading Screens | v1.2 | 1/1 | Complete | 2026-06-29 |
| 10. Cards Hydration + API Parallelization | v1.2 | 2/2 | Complete | 2026-06-30 |
| 11. Study Page Hydration & Interaction Polish | v1.2 | 3/3 | Complete | 2026-06-30 |
| 12. Home & Habits Hydration | v1.2 | 3/3 | Complete | 2026-07-01 |
| 13. Review API Hardening & Save Reliability | v1.3 | 2/2 | Complete | 2026-07-02 |
| 14. Sync Failure Visibility & Caching Performance | v1.3 | 2/2 | Complete | 2026-07-02 |
| 15. StudySession Refactor & Sentence-Selection Memoization | v1.3 | 2/2 | Complete | 2026-07-03 |
| 16. Components[] Filter Fix | v1.4 | 4/4 | Complete | 2026-07-03 |
| 17. ReviewLog Schema & Idempotent Write Path | v1.4 | 5/5 | Complete | 2026-07-05 |
| 18. Review History Page | v1.4 | 3/3 | Complete | 2026-07-04 |
| 19. Vercel Cron Auto-Sync | v1.4 | 3/3 | Complete | 2026-07-05 |
| 20. Extraction Pipeline Hardening | v1.5 | 2/2 | Complete | 2026-07-06 |
| 21. Card Database Quality Audit | v1.5 | 2/2 | Complete | 2026-07-07 |
| 22. Findings-Driven Prompt Improvement & Corpus Fixes | v1.5 | 3/3 | Complete | 2026-07-10 |
| 23. Reliability Bug Fixes | v1.5 | 2/2 | Complete | 2026-07-10 |
| 24. Freshness Diagnosis Spike | v1.6 | 1/2 | In Progress|  |
| 25. E2E Test Infrastructure & Baselines | v1.6 | 0/TBD | Not started | - |
| 26. Freshness Fix | v1.6 | 0/TBD | Not started | - |
| 27. E2E Coverage & Performance Validation | v1.6 | 0/TBD | Not started | - |

---
*Last updated: 2026-07-10 — v1.6 roadmap created (Phases 24–27, 16/16 requirements mapped, coarse granularity). Ready to plan Phase 24.*
