# Requirements: Korean Study — v1.6 Freshness, Performance & E2E Testing

**Defined:** 2026-07-10
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1.6 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Freshness

- [x] **FRESH-01**: A diagnosis spike identifies, per route (`/`, `/cards`, `/study`, `/habits`), exactly which navigation paths serve stale data on a production build (`next build && next start`), distinguishing back/forward Router Cache reuse from client-shell state non-resync
- [x] **FRESH-02**: Client shells (`HomeClient`, `CardsClient`, `StudyClient`, `HabitsClient`) re-sync to fresh server props delivered by `router.refresh()`, gated so an active study session or open editor sheet is never clobbered mid-interaction
- [x] **FRESH-03**: Returning to the Home/Habits/Cards pages after completing a study session reflects the updated stats/due-count/cards immediately, without a manual reload
- [x] **FRESH-04**: Browser back/forward navigation to a previously-visited route shows fresh data, not a cached stale RSC payload
- [x] **FRESH-05**: Resuming the app after it was backgrounded (tab/PWA focus) refreshes stale data, covering the case where the daily cron sync ran while the app was in the background
- [x] **FRESH-06**: The freshness fix does not regress first-load render speed or reintroduce a loading-state flash on any of the four main routes

### E2E Test Infrastructure

- [x] **E2E-01**: Playwright (`@playwright/test`) is configured with a `webServer` that can target either the dev server or a production build, isolated from the existing Vitest test discovery
- [x] **E2E-02**: An authenticated test run works via a setup project that produces a reusable `storageState`, with no per-test login UI interaction required
- [x] **E2E-03**: E2E tests run against an isolated, seeded test database (`file:` SQLite) and are structurally prevented from running against the production Turso database
- [x] **E2E-04**: A smoke spec verifies every main route renders real content on first paint (not just an HTTP 200)
- [ ] **E2E-05**: A study grade-flow spec covers reveal → grade → queue advance → session completion
- [x] **E2E-06**: A freshness regression spec proves FRESH-03/04/05 against a production build, and fails if the staleness bug reappears
- [x] **E2E-07**: Failed test runs produce a trace (`trace: 'on-first-retry'`) and a parseable line-reporter output usable by both a human and an AI agent

### Performance Validation

- [ ] **PERF-04**: The E2E suite asserts generous page-load timing budgets (Navigation Timing API) on key routes, using median-of-N runs to reduce flakiness
- [ ] **PERF-05**: The E2E suite asserts generous API route timing budgets (e.g. `/api/cards/due`) via direct request timing

### Agent Tooling

- [ ] **TOOL-01**: Claude Code can drive the running dev server interactively via Playwright MCP for exploratory verification, registered and documented as a workflow in CLAUDE.md

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### E2E Test Infrastructure

- **E2E-08**: Cards CRUD flow spec (add/edit/delete via SwipeRow/Sheet interactions)
- **E2E-09**: Sync-route coverage beyond auth/validation, via a stubbed extraction boundary (real Claude extraction stays out of E2E — nondeterministic and costs real tokens)
- **E2E-10**: WebKit test project (only if an iOS-Safari-specific bug appears; Chromium-only for now since Playwright's WebKit-on-macOS isn't real iOS Safari)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Migrating mutations to Server Actions | Would rewrite every mutation path and reintroduce grade-button latency by conflicting with the shipped optimistic fire-and-forget grading (UX-01) |
| Adopting Next.js 16 Cache Components (`use cache`/`cacheTag`) | Adds a server caching layer to an app that's deliberately fully dynamic, just to invalidate it; v1.2 already rejected cross-request caching for this single-user app |
| SWR / React Query for page data | Would duplicate the data layer the RSC+DTO pattern already consolidated and reintroduce client-fetch waterfalls/loading states v1.2 eliminated |
| Tuning `experimental.staleTimes` | Dynamic default is already 0; the flag explicitly does not affect back/forward caching, which is the case that's actually broken |
| Cross-browser E2E matrix (Firefox/WebKit) | 3x runtime and flake surface for a single-user personal app; deferred to v2 if ever needed |
| Visual/screenshot regression testing | Notorious flake source (fonts, antialiasing, theme/accent-color permutations); semantic assertions are sufficient and cheaper to maintain solo |
| Strict millisecond perf assertions in CI | Runner variance makes tight thresholds fail randomly and erodes trust in the suite; generous budgets + logged timings instead |
| E2E against production URL / real Turso database | Mutating tests would corrupt real FSRS state, `ReviewLog` history, and streaks |
| Exercising real Claude extraction end-to-end in E2E | Nondeterministic output, slow, costs real Opus tokens per run; lessons/cards are seeded directly instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FRESH-01 | Phase 24 | Complete |
| FRESH-02 | Phase 26 | Complete |
| FRESH-03 | Phase 26 | Complete |
| FRESH-04 | Phase 26 | Complete |
| FRESH-05 | Phase 26 | Complete |
| FRESH-06 | Phase 26 | Complete |
| E2E-01 | Phase 25 | Complete |
| E2E-02 | Phase 25 | Complete |
| E2E-03 | Phase 25 | Complete |
| E2E-04 | Phase 25 | Complete |
| E2E-05 | Phase 27 | Pending |
| E2E-06 | Phase 25 | Complete |
| E2E-07 | Phase 25 | Complete |
| PERF-04 | Phase 27 | Pending |
| PERF-05 | Phase 27 | Pending |
| TOOL-01 | Phase 27 | Pending |
