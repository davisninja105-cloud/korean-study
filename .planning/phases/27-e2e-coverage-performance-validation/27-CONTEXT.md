# Phase 27: E2E Coverage & Performance Validation - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

With E2E infrastructure (Phase 25) and the freshness fix (Phase 26) both proven, this phase broadens coverage to the full study grade-flow, asserts generous page/API timing budgets as behavioral guard rails, and documents the Playwright MCP workflow for agent-driven exploratory QA. This phase makes no further fixes to freshness behavior and does not add new production features — its deliverable is one new grade-flow spec, one new perf spec, a small number of `data-testid` attributes on existing study-session components, and a CLAUDE.md documentation addition. Requirements: E2E-05, PERF-04, PERF-05, TOOL-01.

</domain>

<decisions>
## Implementation Decisions

### Grade-Flow Spec (E2E-05)
- **D-01:** Cover **Flashcards mode only** (not Multiple Choice or Fill-in-the-Blank). Matches E2E-05's literal wording (reveal→grade→queue advance→session completion) with the least new locator surface; the other two modes have different interaction shapes (click option / type answer), not a materially different grading/queue risk.
- **D-02:** Drive the **full session to completion** — grade all 3 seeded due cards (`FIXTURE.dueCards`) through to the "Session complete!" screen, not just one card. Directly satisfies E2E-05's explicit "session completion" wording and exercises `REQUEUE_GAP`/queue-advance logic for real.
- **D-03:** Use the **Exposure** sub-mode (ModeSelector's default), not Recall — no blanking/needsBlank fallback logic in this spec's scope.
- **D-04:** Reuse the **existing D-13 seed baseline** via `resetToBaseline()` — same 3 due cards (including the `감사하다`/`저` `CardDependency` edge) every other spec already uses. No new fixture code. Grading proceeds in `sequenceCards()`'s foundation-first server order.

### Grade-Button Locators (production code change)
- **D-05:** Add `data-testid` attributes to `components/FlashcardMode.tsx`'s "Show Answer" button and the 4 grade buttons (Again/Hard/Good/Easy) — e.g. `data-testid="reveal-btn"`, `data-testid="grade-again"`, `data-testid="grade-hard"`, `data-testid="grade-good"`, `data-testid="grade-easy"`. Resolves the exact known-fragile-locator gap `e2e/helpers/readers.ts` flagged in Phase 25 (grade buttons' `aria-label`s are dynamic per-card FSRS hint text, e.g. "Good, Long-term memory → 3d" — unusable as a stable accessible-name locator) — that comment explicitly deferred the fix to "a future phase adding `data-testid` attributes." This phase IS that future phase.
- **D-06:** Extend the testid pass to the **surrounding session-flow controls** beyond just the grade buttons: `components/StudyClient.tsx`'s "Start studying →" button, `components/ModeSelector.tsx`'s Flashcards mode-select button, and the session-complete screen's heading / "Study N more →" button. One coherent pass across the whole grade-flow path rather than a second future phase re-opening the same files.
- Existing `aria-label`s are left unchanged (still needed for screen-reader hint text, per WR-02) — `data-testid` is purely additive, not a replacement.

### Performance Budget Mechanics (PERF-04, PERF-05)
- **D-07:** Page-load timing lives in a **new dedicated `e2e/perf.spec.ts` file**, separate from `e2e/smoke.spec.ts`. Keeps perf-budget assertions (which can theoretically fail on a slow machine) independently readable/failable from first-paint content-correctness assertions. `smoke.spec.ts`'s existing informational `captureNavTiming()` (D-06 from Phase 25) is untouched — this is additive, not a replacement.
- **D-08:** Page-load budgets cover the same **4 main routes** (`/`, `/study`, `/cards`, `/habits`), each measured across **N=5** navigations, asserting the **median** Navigation Timing value (TTFB / `domContentLoaded`) against a **generous ~3s budget**. Matches `.planning/research/PITFALLS.md` Pitfall 12's median-of-N + heavy-headroom guidance exactly — these are regression guard rails against a real slowdown, not aspirational performance targets, on a local prod-build server.
- **D-09:** API timing (PERF-05) covers **three routes**: `/api/cards/due` (the one ROADMAP.md names explicitly), plus `/api/stats` and `/api/activity` — the other two data-heavy GETs backing the Home/Habits RSC pages via `lib/dashboard.ts`. Same N=5-median approach, budget **~1s**.
- **D-10:** API timing is measured via **`page.evaluate(fetch(...))`** from within an already-authenticated page (cookies auto-attached via the chromium project's `storageState`), timed with `performance.now()` inside the evaluate call — not a separate `APIRequestContext`. Exercises the exact code path a real client request takes, at the cost of one page load before the fetch loop starts.
- Both `perf.spec.ts` page and API assertions should log every individual sample (not just the median) to the line-reporter output, so a real regression vs. a single noisy run is distinguishable by eye — consistent with this project's "generous budgets + logged timings for trend eyeballing" convention (REQUIREMENTS.md "Out of Scope" table, "Strict millisecond perf assertions in CI" row).

### Playwright MCP Workflow (TOOL-01)
- **D-11:** **Register the MCP server now** as part of this phase's execution: `claude mcp add playwright npx @playwright/mcp@latest` (per `.planning/research/STACK.md`'s exact recommended command), rather than leaving it purely as a documentation exercise for the user to opt into later.
- **D-12:** The documented workflow targets the **dev server** (`npm run dev`, `localhost:3000`), not the E2E harness's isolated prod-build+seeded-DB server on port 3100. Matches TOOL-01's literal wording ("driving the running dev server") and `.planning/research/FEATURES.md`'s framing: MCP is for everyday exploratory QA against whatever's running locally, complementing — never replacing or duplicating — the isolated Playwright spec suite.
- **D-13:** The new CLAUDE.md section is a **concise how-to** (registration command, "start `npm run dev` first," the login step using `APP_PASSWORD` from `.env.local`, and 2–3 example MCP tool calls — `browser_navigate` / `browser_snapshot` / `browser_click`) — matching CLAUDE.md's existing terse, reference-style prose. Not a full worked-example walkthrough of a specific verification task (would go stale as UI changes, and this file's convention is reference density over tutorial depth).

### Claude's Discretion
- Exact `data-testid` string values (D-05/D-06) beyond the ones named above — planner/executor's call as long as the naming stays kebab-case and descriptive (matching this project's `kebab-case` file-naming convention, informally extended to test ids).
- Exact CLAUDE.md section placement/heading (D-13) — likely near the existing "Vercel function timeout" / E2E-related gotchas, planner's call.
- Whether `perf.spec.ts` shares `resetToBaseline()` in a `beforeAll` (matching `smoke.spec.ts`'s pattern) — implied by D-07/D-08 but not explicitly asked; standard practice for this harness, no need to re-decide.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` (Phase 27 section, "E2E Coverage & Performance Validation") — the 4 success criteria this phase must satisfy
- `.planning/REQUIREMENTS.md` — E2E-05, PERF-04, PERF-05, TOOL-01 (this phase's requirements); note the "Out of Scope" table's "Strict millisecond perf assertions in CI" row directly shapes D-08/D-09's generous-budget approach

### E2E research (written for this exact milestone)
- `.planning/research/PITFALLS.md` Pitfall 12 ("Browser-timing 'performance regression tests' that flake instead of gate") — the median-of-N + generous-headroom methodology D-08/D-09 implement directly
- `.planning/research/FEATURES.md` — Playwright MCP entry (line ~20, ~52) informing D-11/D-12; Performance budget assertions entry (line ~53) informing D-07/D-08
- `.planning/research/STACK.md` line ~65 — the exact `claude mcp add playwright npx @playwright/mcp@latest` registration command (D-11) and the dev-server-vs-prod-build framing (D-12)

### Prior phase artifacts this phase builds directly on
- `.planning/phases/25-e2e-test-infrastructure-baselines/25-CONTEXT.md` — D-05 (per-route "observable reader" pattern), D-09 (shared helper module convention), D-11/D-12 (harness conventions: `e2e/` dir, port 3100) all still apply
- `e2e/helpers/readers.ts` — the exact comment block on `readStudySelectModeState` documenting the known-fragile-locator gap this phase's D-05/D-06 close
- `e2e/smoke.spec.ts` — the existing `captureNavTiming()` informational pattern (D-06 from Phase 25) that D-07/D-08 build on top of without duplicating
- `e2e/fixture.ts` / `e2e/seed.ts` — `FIXTURE` constants and the D-13 (Phase 25) baseline fixture reused as-is per D-04

### Architecture this phase's specs test against
- `components/StudySession.tsx`, `components/FlashcardMode.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx` — the grade-flow UI these specs drive and where D-05/D-06's `data-testid` attributes land
- `lib/dashboard.ts` — backs `/api/stats` and `/api/activity`, the two additional PERF-05 endpoints (D-09)
- `CLAUDE.md` — "Gotchas / conventions" section is the likely home for the new Playwright MCP subsection (D-13)

No other external specs apply — requirements fully captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/seed.ts:resetToBaseline()` / `e2e/fixture.ts:FIXTURE` — the grade-flow spec's fixture, used as-is (D-04)
- `e2e/helpers/readers.ts` — existing reader patterns (`waitVisible`, `dumpUnrecognizedState`) to follow for any new grade-flow-specific readers
- `playwright.config.ts` — existing prod-build `webServer` (port 3100, `reuseExistingServer: !CI`), auth setup-project (`playwright/.auth/user.json` storageState) reused by both new spec files; no config changes needed for E2E-05/PERF-04/PERF-05

### Established Patterns
- `components/FlashcardMode.tsx` — pure presentational sub-component; grade buttons at lines ~216-251, "Show Answer" at line ~206 — exact JSX D-05 modifies
- `components/StudySession.tsx` — owns queue/stats/undo state; `onComplete` callback (line ~175) fires when `queue` empties, driving `StudyClient.tsx`'s `phase = 'complete'` transition the spec asserts against
- Subprocess-delegation pattern (`e2e/run-mutate.ts`, `e2e/run-reset-baseline.ts`) — any new DB query helper for perf/grade-flow specs must follow this `tsx`-subprocess shape, not call `getTestPrisma()` directly from a spec/worker process (documented failure mode in `e2e/helpers/mutate.ts`'s header comment)

### Integration Points
- New files: `e2e/grade-flow.spec.ts` (or similar name, planner's call), `e2e/perf.spec.ts`
- Modified files: `components/FlashcardMode.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx` (data-testid additions only — no behavior change), `CLAUDE.md` (new Playwright MCP subsection)
- No `playwright.config.ts` changes anticipated — both new spec files run under the existing `chromium` project

</code_context>

<specifics>
## Specific Ideas

- The grade-flow spec should grade through all 3 due cards to reach the actual "Session complete!" screen (`components/StudyClient.tsx`'s `SessionComplete` component) — not stop early.
- `data-testid` additions are explicitly scoped to the grade-flow path (reveal/grade/mode-select/session-complete controls) — not a blanket sweep of every interactive element in the app.
- Perf budgets are guard rails, not targets: ~3s pages / ~1s API with N=5-median, matching this project's explicit "generous budgets + logged timings for trend eyeballing" stance (already established in REQUIREMENTS.md's Out of Scope table before this discussion even started).

</specifics>

<deferred>
## Deferred Ideas

- Multiple Choice / Fill-in-the-Blank grade-flow coverage — explicitly deferred within this phase's own scope (D-01); could be added in a future phase if either mode's queue/grading logic diverges enough to warrant its own spec.
- Recall sub-mode coverage for the grade-flow spec (D-03) — same rationale, not this phase's concern.
- A fuller worked-example Playwright MCP walkthrough in CLAUDE.md (D-13) — deferred in favor of the concise how-to; revisit only if the concise version proves insufficient in practice.
- Broader `data-testid` sweep beyond the grade-flow path (D-06's scope) — not deferred as a "todo," just explicitly out of this phase's boundary; add incrementally as future specs need more stable anchors.

### Reviewed Todos (not folded)
None — no open todos matched this phase (`todo.match-phase` returned 0 matches).

</deferred>

---

*Phase: 27-E2E Coverage & Performance Validation*
*Context gathered: 2026-07-13*
