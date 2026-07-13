# Phase 27: E2E Coverage & Performance Validation - Research

**Researched:** 2026-07-13
**Domain:** Playwright E2E coverage (grade-flow spec), browser/API performance budgets, Playwright MCP agent tooling
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Grade-Flow Spec (E2E-05)**
- **D-01:** Cover **Flashcards mode only** (not Multiple Choice or Fill-in-the-Blank). Matches E2E-05's literal wording (reveal→grade→queue advance→session completion) with the least new locator surface; the other two modes have different interaction shapes (click option / type answer), not a materially different grading/queue risk.
- **D-02:** Drive the **full session to completion** — grade all 3 seeded due cards (`FIXTURE.dueCards`) through to the "Session complete!" screen, not just one card. Directly satisfies E2E-05's explicit "session completion" wording and exercises `REQUEUE_GAP`/queue-advance logic for real.
- **D-03:** Use the **Exposure** sub-mode (ModeSelector's default), not Recall — no blanking/needsBlank fallback logic in this spec's scope.
- **D-04:** Reuse the **existing D-13 seed baseline** via `resetToBaseline()` — same 3 due cards (including the `감사하다`/`저` `CardDependency` edge) every other spec already uses. No new fixture code. Grading proceeds in `sequenceCards()`'s foundation-first server order.

**Grade-Button Locators (production code change)**
- **D-05:** Add `data-testid` attributes to `components/FlashcardMode.tsx`'s "Show Answer" button and the 4 grade buttons (Again/Hard/Good/Easy) — e.g. `data-testid="reveal-btn"`, `data-testid="grade-again"`, `data-testid="grade-hard"`, `data-testid="grade-good"`, `data-testid="grade-easy"`. Resolves the exact known-fragile-locator gap `e2e/helpers/readers.ts` flagged in Phase 25 (grade buttons' `aria-label`s are dynamic per-card FSRS hint text — unusable as a stable accessible-name locator). This phase IS that future phase.
- **D-06:** Extend the testid pass to the **surrounding session-flow controls**: `components/StudyClient.tsx`'s "Start studying →" button, `components/ModeSelector.tsx`'s Flashcards mode-select button, and the session-complete screen's heading / "Study N more →" button. One coherent pass across the whole grade-flow path.
- Existing `aria-label`s are left unchanged (still needed for screen-reader hint text, per WR-02) — `data-testid` is purely additive, not a replacement.

**Performance Budget Mechanics (PERF-04, PERF-05)**
- **D-07:** Page-load timing lives in a **new dedicated `e2e/perf.spec.ts` file**, separate from `e2e/smoke.spec.ts`. `smoke.spec.ts`'s existing informational `captureNavTiming()` (D-06 from Phase 25) is untouched — this is additive, not a replacement.
- **D-08:** Page-load budgets cover the same **4 main routes** (`/`, `/study`, `/cards`, `/habits`), each measured across **N=5** navigations, asserting the **median** Navigation Timing value (TTFB / `domContentLoaded`) against a **generous ~3s budget**. Matches PITFALLS.md Pitfall 12's median-of-N + heavy-headroom guidance — regression guard rails, not aspirational targets, on a local prod-build server.
- **D-09:** API timing (PERF-05) covers **three routes**: `/api/cards/due`, `/api/stats`, `/api/activity` (the latter two backed by `lib/dashboard.ts`). Same N=5-median approach, budget **~1s**.
- **D-10:** API timing is measured via **`page.evaluate(fetch(...))`** from within an already-authenticated page (cookies auto-attached via the chromium project's `storageState`), timed with `performance.now()` inside the evaluate call — not a separate `APIRequestContext`.
- Both `perf.spec.ts` page and API assertions should log every individual sample (not just the median) to the line-reporter output.

**Playwright MCP Workflow (TOOL-01)**
- **D-11:** **Register the MCP server now** as part of this phase's execution: `claude mcp add playwright npx @playwright/mcp@latest` (per STACK.md's exact recommended command), rather than leaving it purely a documentation exercise.
- **D-12:** The documented workflow targets the **dev server** (`npm run dev`, `localhost:3000`), not the E2E harness's isolated prod-build+seeded-DB server on port 3100. MCP is for everyday exploratory QA, complementing — never replacing — the isolated spec suite.
- **D-13:** The new CLAUDE.md section is a **concise how-to** (registration command, "start `npm run dev` first," the login step using `APP_PASSWORD` from `.env.local`, and 2–3 example MCP tool calls — `browser_navigate` / `browser_snapshot` / `browser_click`) — matching CLAUDE.md's terse, reference-style prose.

### Claude's Discretion
- Exact `data-testid` string values (D-05/D-06) beyond the ones named above — planner/executor's call as long as the naming stays kebab-case and descriptive.
- Exact CLAUDE.md section placement/heading (D-13) — likely near the existing "Vercel function timeout" / E2E-related gotchas, planner's call.
- Whether `perf.spec.ts` shares `resetToBaseline()` in a `beforeAll` (matching `smoke.spec.ts`'s pattern) — implied by D-07/D-08; standard practice for this harness, no need to re-decide.

### Deferred Ideas (OUT OF SCOPE)
- Multiple Choice / Fill-in-the-Blank grade-flow coverage — explicitly deferred (D-01).
- Recall sub-mode coverage for the grade-flow spec (D-03).
- A fuller worked-example Playwright MCP walkthrough in CLAUDE.md (D-13) — concise how-to only.
- Broader `data-testid` sweep beyond the grade-flow path (D-06's scope) — add incrementally as future specs need more stable anchors.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-05 | A study grade-flow spec covers reveal → grade → queue advance → session completion | Grade-flow spec design (Pattern 1) with empirically verified FSRS grading behavior — loop-until-complete design required because Good-grades on the seeded cards yield sub-day intervals (10m) that requeue; exact grade-count assertions would be wall-clock-dependent. Current on-disk line refs for every testid target verified. |
| PERF-04 | Generous page-load timing budgets (Navigation Timing API) on key routes, median-of-N | Pattern 2: `page.goto` + `page.evaluate(() => performance.getEntriesByType('navigation')[0].toJSON())`, N=5 samples per route, median assert < ~3000ms, all samples logged. PerformanceEntry serialization pitfall documented (Pitfall 2). |
| PERF-05 | Generous API route timing budgets via direct request timing | Pattern 3: `page.evaluate` async fetch timed with `performance.now()`, body consumption inside the timed window, `res.ok` asserted to prevent vacuous fast-500 passes. Endpoints `/api/cards/due`, `/api/stats`, `/api/activity` confirmed live (backed by `lib/study-cards.ts` / `lib/dashboard.ts`). |
| TOOL-01 | Claude Code drives the dev server via Playwright MCP, registered + documented in CLAUDE.md | D-11 command verified against the official microsoft/playwright-mcp README (exact string matches, current as of 2026-07-12; `--` separator needed only when passing extra flags). Current tool names verified: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_take_screenshot` all exist in @playwright/mcp 0.0.78. `claude` CLI 2.1.198 present on this machine. |
</phase_requirements>

## Summary

This phase is a follow-on with zero new production behavior: two new spec files (`e2e/grade-flow.spec.ts`, `e2e/perf.spec.ts`), a small additive `data-testid` pass on three client components, one MCP registration command, and one CLAUDE.md section. The Phase 25 harness (isolated `file:` DB, auth setup-project, prod-build webServer on port 3100, `workers: 1`, line reporter, `resetToBaseline()` subprocess pattern) needs **no config changes** — verified against the current on-disk `playwright.config.ts`.

The single most important discovery of this research is **empirical, not documentary**: the seeded due cards have `lastReview: null`, so the client's `reviewCard()` treats the first grade of each card as a brand-new FSRS card, and the installed ts-fsrs 5.3.1 defaults (`enable_short_term: true`, `learning_steps: ['1m','10m']`) mean **Again→1m, Hard→6m, Good→10m (sub-day → in-session requeue), Easy→8d (immediate graduation, no requeue)** [VERIFIED: local ts-fsrs execution]. Grading "Good" on all 3 cards therefore takes ~6 grade taps (each card requeued once), and the exact count is wall-clock-dependent near the 2am habit-day boundary. The grade-flow spec must be a **bounded loop-until-complete**, never a fixed-count script — this both satisfies D-02's "exercises REQUEUE_GAP for real" intent and stays deterministic.

On the tooling side, everything CONTEXT.md locked in was re-verified as current: `@playwright/mcp` is at 0.0.78 (published 2026-07-12), the registration command `claude mcp add playwright npx @playwright/mcp@latest` is verbatim from the official README (the `--` separator is only needed when passing flags to the server), and D-13's three example tool names all exist in the current tool list.

**Primary recommendation:** Plan two waves — (1) `data-testid` pass + grade-flow spec + perf spec (all buildable/verifiable together via one `npx playwright test` run), (2) MCP registration + CLAUDE.md doc. Design the grade-flow spec as a bounded reveal→grade loop asserting distinct-fronts-seen, completion heading, and a polled DB backstop.

## Project Constraints (from CLAUDE.md)

| Directive | Impact on this phase |
|-----------|---------------------|
| ESLint strict (`react-hooks/purity`, `set-state-in-effect`); lint must stay clean | `data-testid` additions are pure JSX attributes — zero risk, but `npm run lint` must be run after edits |
| RSC pages stay data-only; all interactivity in `*Client.tsx` shells | All testid targets are already client components (`FlashcardMode`, `StudyClient`, `ModeSelector`) — no page.tsx edits |
| `'use client'` must be the very first line of client components | Preserved — edits are attribute-only |
| Semantic color tokens; never literal color utilities | N/A — no class changes, testids are additive attributes |
| Test RSC first-paint with `npm run build && npm start`, not `next dev` | The E2E harness already does this (prod build on port 3100); the MCP workflow (D-12) deliberately targets `next dev` for exploratory QA — document the distinction in the CLAUDE.md section |
| Keep CLAUDE.md + `.planning/codebase/*.md` current; verify claims against source | D-13's new section must use the verified tool names/commands from this research, not guessed ones |
| Vercel 60s function limit | N/A — no serverless changes; perf specs run against the local prod server |
| GSD workflow enforcement (no direct edits outside GSD commands) | Phase executes via `/gsd-execute-phase` |
| E2E must never touch production Turso (`libsql://` fail-fast guard) | Both new spec files run under the existing harness guards; any new DB helper must follow the tsx-subprocess pattern (see Pattern 4) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Grade-flow UI driving (reveal/grade/complete) | E2E test process (Playwright chromium) | Browser/Client (React study components) | Spec drives the real client shell; all session state lives client-side in `StudySession.tsx` |
| FSRS grade computation | Browser/Client (`lib/fsrs.ts` via `submitReview`) | API `/api/review` (background persistence) | Optimistic client-side grading (shipped v1.2); the fire-and-forget POST is the only server write |
| Page-load timing measurement | Browser (Navigation Timing API via `page.evaluate`) | — | Timing must come from the real navigation the browser performed, not the test process clock |
| API timing measurement | Browser (`page.evaluate` fetch, per D-10) | API routes (`/api/cards/due`, `/api/stats`, `/api/activity`) | Exercises the exact authenticated same-origin request path a real client takes |
| Test DB reset/inspection | tsx subprocess (`e2e/run-reset-baseline.ts` shape) | — | Playwright worker processes cannot load the ESM-only Prisma client (documented failure, `e2e/helpers/mutate.ts` header) |
| MCP browser control | Local MCP server (`npx @playwright/mcp`) → dev server :3000 | — | Agent-interactive; deliberately decoupled from the port-3100 isolated harness (D-12) |
| Stable locators | Client components (`data-testid` attributes) | E2E specs (`page.getByTestId`) | Playwright's default `testIdAttribute` is `data-testid` — no config change needed [CITED: playwright.dev/docs/locators] |

## Standard Stack

### Core (all already installed — no new package.json dependencies this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.61.1 (installed; `^1.61.1` in devDependencies) | Test runner for both new specs | Existing Phase 25 harness [VERIFIED: node_modules + package.json] |
| `playwright` | 1.61.1 (installed) | Browser automation engine | Already present; chromium-1228 browsers downloaded [VERIFIED: ~/Library/Caches/ms-playwright] |
| `ts-fsrs` | 5.3.1 | Determines grading intervals the spec must survive | Defaults empirically verified this session (see Pitfall 1) [VERIFIED: local execution] |
| `tsx` | ^4.23.0 | Subprocess runner for any DB helper the specs need | Established harness pattern [VERIFIED: package.json] |

### Supporting (npx-executed, NOT a package.json dependency)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/mcp` | 0.0.78 (latest, published 2026-07-12) | MCP server for agent-driven browser control | Registered once via `claude mcp add`; run on-demand by Claude Code via npx [VERIFIED: npm registry + official README] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `page.evaluate(fetch)` for API timing | Playwright `APIRequestContext` (`request.get()`) | Less noisy, but D-10 explicitly locks `page.evaluate` to exercise the real client path — do not substitute |
| Fixed grade-count grade-flow script | Bounded loop-until-complete | Fixed count is wall-clock-nondeterministic (see Pitfall 1) — loop is mandatory |
| CDP/tracing-based perf metrics | Navigation Timing via `page.evaluate` | D-08 locks Navigation Timing; CDP metrics add complexity for no gate value at these generous budgets |

**Installation:** none. `@playwright/mcp` is intentionally not added to package.json (STACK.md line ~49, reconfirmed).

**Version verification** (performed this session):
```bash
node -e "console.log(require('@playwright/test/package.json').version)"  # → 1.61.1
npm view @playwright/mcp version   # → 0.0.78 (modified 2026-07-12)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/mcp` | npm | latest version published 2026-07-09 (package long-established) | 6,402,173/wk | github.com/microsoft/playwright-mcp | [SUS] | Flagged — planner must add a checkpoint before the `claude mcp add` registration step |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `@playwright/mcp` — the seam's `too-new` reason is a **version-recency artifact** (the 0.0.78 release is 4 days old), not a legitimacy concern: 6.4M weekly downloads, official Microsoft repository, `postinstall: null` (no install scripts) [VERIFIED: npm registry signals via package-legitimacy seam]. Phase 24 already ran a blocking [SUS] legitimacy checkpoint for the sibling `playwright` packages. Recommended planner treatment: a lightweight `checkpoint:human-verify` on the registration task noting the verdict + signals, consistent with the Phase 24/25 precedent. Note D-11 uses `@latest` (unpinned) — acceptable for an agent-tooling npx invocation per STACK.md; pinning to `@0.0.78` is a valid conservative option if the human reviewer prefers it.

No package.json dependencies are added this phase — `npm install` is not run.

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────── E2E harness (unchanged, port 3100) ───────────────────────────┐
                       │                                                                                            │
 npx playwright test ──┤ setup project (auth.setup.ts) ── POST /api/login ──> storageState playwright/.auth/user.json
                       │        │                                                                                   │
                       │        v                                                                                   │
                       │ chromium project (workers:1, alphabetical file order):                                     │
                       │   freshness-*.spec.ts → grade-flow.spec.ts (NEW) → perf.spec.ts (NEW) → smoke.spec.ts     │
                       │        │                        │                        │                                 │
                       │        │   beforeAll: resetToBaseline() ── execFileSync tsx ──> run-reset-baseline.ts ──> file: SQLite
                       │        │                        │                        │                                 │
                       │        │                        v                        v                                 │
                       │        │        page.goto('/study') ─ getByTestId loop   page.goto(route) ×5 ─ nav-timing │
                       │        │        reveal→grade→…→'Session complete!'       page.evaluate(fetch) ×5 ─ API ms │
                       │        │             │ (background POST /api/review)          │                            │
                       │        │             v                                       v                            │
                       │        │        next start :3100 (prod build) ── Prisma(libSQL adapter) ──> isolated test DB
                       └────────────────────────────────────────────────────────────────────────────────────────────┘

 TOOL-01 (separate, interactive):
 Claude Code ── MCP (stdio) ──> npx @playwright/mcp@latest ── real browser ──> npm run dev :3000 (developer's live DB)
```

### Recommended Project Structure (additions only)
```
e2e/
├── grade-flow.spec.ts    # NEW — E2E-05 (name sorts between freshness-* and perf/smoke; any name works since every spec resets)
├── perf.spec.ts          # NEW — PERF-04 + PERF-05
└── helpers/
    └── (optional) perf.ts  # pure median/sample helpers if the planner wants them shared; inline in perf.spec.ts is also fine
components/
├── FlashcardMode.tsx     # MODIFIED — data-testid on Show Answer + 4 grade buttons (D-05)
├── StudyClient.tsx       # MODIFIED — data-testid on "Start studying →", complete heading, "Study N more →" (D-06)
└── ModeSelector.tsx      # MODIFIED — data-testid on Flashcards mode button (D-06)
CLAUDE.md                 # MODIFIED — new Playwright MCP subsection (D-13)
```

### Verified current on-disk anchor points (line numbers current as of 2026-07-13)

| Target | File | Lines (current) |
|--------|------|-----------------|
| "Show Answer" button | `components/FlashcardMode.tsx` | 205–211 |
| Again / Hard / Good / Easy buttons | `components/FlashcardMode.tsx` | 216–224 / 226–233 / 235–242 / 244–252 |
| Due-count `<p class="text-5xl font-bold animate-reveal">` (the known-fragile locator) | `components/StudyClient.tsx` | 305–307 |
| "Start studying →" button (opens mode Sheet) | `components/StudyClient.tsx` | 312–317 |
| `SessionComplete` heading `<h2>{heading}</h2>` ('Session complete!' when scope='due', line 425) | `components/StudyClient.tsx` | 431 |
| "Study N more →" button | `components/StudyClient.tsx` | 473–478 |
| Flashcards mode-select button (first entry of `modes` array) | `components/ModeSelector.tsx` | 31–37 |
| `REQUEUE_GAP = 4` | `components/StudySession.tsx` | 59 |
| Requeue condition (`nextReview < nextHabitDayStart`) | `components/StudySession.tsx` | 519 |
| `onComplete(finalStats)` fires when queue empties | `components/StudySession.tsx` | 593–600 |
| "Card N of N" counter | `components/StudySession.tsx` | 772–774 |
| Known-fragile-locator comment this phase closes | `e2e/helpers/readers.ts` | 63–72 |
| `captureNavTiming()` (informational, untouched) | `e2e/smoke.spec.ts` | 28–31 |

### Pattern 1: Grade-flow spec — bounded loop-until-complete (E2E-05)

**What:** Drive `/study` → Start studying → Flashcards → repeat {reveal, grade} until the "Session complete!" heading appears, with a hard iteration cap.
**When to use:** Mandatory shape for this spec — a fixed-count script is nondeterministic (see Pitfall 1).
**Example (skeleton, adapt to planner's testid names):**
```typescript
// e2e/grade-flow.spec.ts — pattern verified against current StudySession.tsx/StudyClient.tsx state machine
import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeAll(async () => { await resetToBaseline() })

test('full flashcard session: reveal → grade → queue advance → completion', async ({ page }) => {
  await page.goto('/study')
  await page.getByTestId('start-studying-btn').click()          // opens the mode Sheet
  await page.getByTestId('mode-flashcard').click()               // Exposure is the default sub-mode (D-03)

  const frontsSeen = new Set<string>()
  const MAX_GRADES = 25 // 3 cards × worst-case requeues, with generous headroom
  let grades = 0
  while (grades < MAX_GRADES) {
    // Session over? (heading testid from D-06)
    if (await page.getByTestId('session-complete-heading').isVisible().catch(() => false)) break

    // Queue advance evidence: record the visible card front before grading.
    // (Optional but recommended — proves the card actually changed.)
    const front = await page.locator('.card-flip-front .hangul').first().textContent().catch(() => null)
    if (front) frontsSeen.add(front.trim())

    await page.getByTestId('reveal-btn').click()
    await expect(page.getByTestId('grade-good')).toBeVisible()   // reveal → grade bar transition is a REAL state assertion
    await page.getByTestId('grade-good').click()
    grades++
  }

  await expect(page.getByTestId('session-complete-heading')).toHaveText('Session complete!')
  expect(grades).toBeGreaterThanOrEqual(FIXTURE.dueCards)        // ≥3; typically 6 with all-Good (each card requeued once)
  // All 3 seeded fronts were actually shown (downward assertion on real content):
  for (const c of FIXTURE.cards.due) expect(frontsSeen).toContain(c.front)
})
```
Notes verified against source:
- The mode Sheet uses the shared `Sheet` primitive with a spring animation; `contextOptions: { reducedMotion: 'reduce' }` is already set in `playwright.config.ts` (line 46) and `Sheet` is reduced-motion-aware — clicks after `getByTestId(...).click()` auto-wait for actionability, so no manual animation waits are needed.
- Grading "Good" gives each seed card a 10-minute interval on first grade (sub-day → requeued to the queue end, since `gap = min(REQUEUE_GAP=4, rest.length=2) = 2`); the second Good graduates it to Review (~2 days). Typical run: A B C A B C = 6 grades. [VERIFIED: local ts-fsrs 5.3.1 execution]
- The front-face locator above (`.card-flip-front .hangul`) is illustrative; the planner may prefer a `data-testid` on the card front too — that stays within D-05/D-06's "grade-flow path" scope.

**DB backstop (optional but recommended — proves persistence, not just UI):** after completion, the fire-and-forget `POST /api/review` saves may still be in flight. Use `expect.poll` around a tsx-subprocess query (Pattern 4) — e.g. assert all 3 due-card `CardReview` rows now have `reps >= 1` and `lastReview != null`, or that `expectedDueStateDirect()`-style due count is `zero-due-state`. Never assert DB state synchronously right after the completion screen (Pitfall 4).

### Pattern 2: Page-load Navigation Timing, median of N (PERF-04)

**What:** N=5 fresh `page.goto` navigations per route; read the `PerformanceNavigationTiming` entry via `page.evaluate`; assert the median.
**Example:**
```typescript
// Source: playwright.dev evaluate docs + Checkly/marcusfelling Navigation Timing pattern,
// consistent with the existing captureNavTiming() in e2e/smoke.spec.ts:28-31
type NavSample = { ttfb: number; dcl: number; load: number }

async function sampleNav(page: Page, route: string): Promise<NavSample> {
  await page.goto(route) // default waitUntil: 'load' — loadEventEnd is populated
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    // MUST return plain data — a raw PerformanceEntry serializes to {} across the evaluate boundary (Pitfall 2)
    return { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd }
  })
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] // N=5 → index 2, true median
}

const PAGE_BUDGET_MS = 3000 // generous guard rail (D-08), not a target

for (const route of ['/', '/study', '/cards', '/habits']) {
  test(`page-load budget: ${route}`, async ({ page }) => {
    const samples: NavSample[] = []
    for (let i = 0; i < 5; i++) samples.push(await sampleNav(page, route))
    for (const [i, s] of samples.entries()) {
      console.log(`[perf] ${route} sample ${i + 1}: ttfb=${s.ttfb.toFixed(0)}ms dcl=${s.dcl.toFixed(0)}ms load=${s.load.toFixed(0)}ms`)
      expect(s.dcl).toBeGreaterThan(0) // sanity: a zero sample means the entry wasn't ready — vacuity guard
    }
    expect(median(samples.map((s) => s.dcl))).toBeLessThan(PAGE_BUDGET_MS)
  })
}
```
Notes:
- Each `page.goto` is a full document navigation, so `getEntriesByType('navigation')[0]` is fresh per sample — no stale-entry risk. Values are ms relative to `startTime ≈ 0` (TTFB = `responseStart`, DCL = `domContentLoadedEventEnd`).
- One test **per route** (not one test for all 4): keeps each test comfortably inside Playwright's default 30s per-test timeout (5 navs × ≤3s ≈ 15s worst case) and makes failures route-attributable. `playwright.config.ts` sets no custom `timeout`, so the 30s default applies. [VERIFIED: playwright.config.ts on disk]
- D-08 names "TTFB / domContentLoaded" — asserting the median **DCL** (the user-facing one) and logging TTFB alongside satisfies the requirement; asserting both against the same 3s budget is equally valid. Planner's call.
- `workers: 1` + `fullyParallel: false` (already configured) means perf tests never contend with parallel test load — good for stability.

### Pattern 3: API timing via authenticated `page.evaluate(fetch)` (PERF-05, per D-10)

```typescript
const API_BUDGET_MS = 1000

test('API route budgets', async ({ page }) => {
  await page.goto('/') // one page load; ks_auth cookie attaches to same-origin fetches automatically
  for (const path of ['/api/cards/due', '/api/stats', '/api/activity']) {
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      const { ms, ok, bytes } = await page.evaluate(async (p) => {
        const t0 = performance.now()
        const res = await fetch(p)
        const text = await res.text()          // body consumption INSIDE the timed window — full round-trip
        return { ms: performance.now() - t0, ok: res.ok, bytes: text.length }
      }, path)
      expect(ok).toBe(true)                    // vacuity guard: a fast 401/500 must FAIL, not pass the budget
      expect(bytes).toBeGreaterThan(0)
      samples.push(ms)
      console.log(`[perf] ${path} sample ${i + 1}: ${ms.toFixed(0)}ms`)
    }
    expect(median(samples)).toBeLessThan(API_BUDGET_MS)
  }
})
```
Note: 3 endpoints × 5 fetches × ≤1s ≈ 15s worst case — fits one test; splitting per-endpoint is fine too.

### Pattern 4: Any new DB helper follows the tsx-subprocess shape

If the grade-flow spec adds a DB backstop query, it must follow `e2e/helpers/mutate.ts`'s two-layer shape (a `*Direct` Prisma function called only from a tsx-run entry script + a public wrapper spawning `execFileSync(node_modules/.bin/tsx, ...)` and parsing a `RESULT:`-prefixed stdout line). Calling `getTestPrisma()` in-process from a Playwright worker throws `SyntaxError: Cannot use 'import.meta' outside a module` — confirmed twice in this codebase (25-01, 25-02 findings, documented in `e2e/helpers/mutate.ts:8-23`). The existing `expectedDueStateDirect` / run-mutate plumbing may already cover the needed query — check before writing a new one.

### Anti-Patterns to Avoid
- **Fixed-count grade script** ("grade exactly 3 times then assert complete") — breaks whenever FSRS defaults, seed state, or wall-clock hour change the requeue count (Pitfall 1).
- **Asserting exact grade totals** (`expect(grades).toBe(6)`) — the 2am habit-day boundary makes the requeue decision time-dependent; assert `>= FIXTURE.dueCards` instead.
- **Timing assertions without response-validity assertions** — a 50ms `500` response sails under a 1s budget; always pair `res.ok`/non-empty-body checks (vacuity guard).
- **Returning raw `PerformanceEntry` objects from `page.evaluate`** — serializes to `{}`; return picked fields or `entry.toJSON()`.
- **A second Prisma client or in-worker Prisma import** in spec files — use the subprocess pattern.
- **Replacing `aria-label`s with testids** — D-05 note: testids are additive; aria-labels carry the FSRS hint text for screen readers (WR-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stable element targeting | Custom CSS-class/XPath locator helpers | `data-testid` + `page.getByTestId()` (default `testIdAttribute`, zero config) | Playwright first-class support; this exact gap is what D-05 closes |
| Waiting for UI transitions | `page.waitForTimeout(...)` sleeps | Locator auto-waiting (`click()`, `toBeVisible()`, `expect.poll`) | Sleeps are the #1 flake source; harness already uses actionability polling (`waitVisible` in readers.ts) |
| Navigation timing capture | CDP sessions / custom timing hooks | `performance.getEntriesByType('navigation')` via `page.evaluate` | Browser-native, already proven in `smoke.spec.ts` |
| Waiting for the background review save | Fixed sleep after completion | `expect.poll` around a subprocess DB query | Poll converges as fast as the save lands; sleep is both slow and racy |
| Test DB access | New ad-hoc Prisma client in specs | `e2e/run-mutate.ts` / `run-reset-baseline.ts` subprocess pattern | ESM/CJS bridge failure documented twice in this repo |
| Agent browser control | Custom Puppeteer/CDP scripts for Claude | `@playwright/mcp` (official Microsoft server) | ~30 accessibility-tree tools, token-cheap snapshots, already the locked decision (D-11) |

**Key insight:** Phase 25 already paid down every infrastructure cost this phase needs — the entire phase is composition of existing, proven pieces plus one genuinely new discipline: perf assertions that are *capable of failing but resistant to flaking* (median-of-N + generous budget + vacuity guards).

## Common Pitfalls

### Pitfall 1: Assuming 3 grades completes the session (FSRS sub-day requeue)
**What goes wrong:** A spec that reveals+grades exactly 3 times then asserts "Session complete!" fails — with "Good" grades the session needs ~6 grades.
**Why it happens:** Seeded `CardReview` rows have `lastReview: null` (see `e2e/seed.ts:108` — the create sets only state/stability/difficulty/nextReview), so `reviewCard()` (`lib/fsrs.ts:102-124`) falls to `createEmptyCard()` — the first grade treats each card as brand-new. Installed ts-fsrs 5.3.1 defaults: `enable_short_term: true`, `learning_steps: ['1m','10m']` → Again 1m / Hard 6m / **Good 10m** / Easy 8d [VERIFIED: local execution]. A 10m `nextReview` is `< nextHabitDayStart(2am)` at almost every wall-clock hour → requeued (`StudySession.tsx:519`).
**How to avoid:** Bounded loop-until-complete (Pattern 1). Assert `grades >= FIXTURE.dueCards`, never an exact count — within ~10 minutes of 2am local, the Good interval crosses the habit-day boundary and requeue is skipped.
**Warning signs:** Spec passes on one machine at 3pm, fails in a late-night run; or hangs at `MAX_GRADES` after a queue-advance regression (which is precisely the failure signal you want).

### Pitfall 2: `PerformanceEntry` doesn't survive the `evaluate` boundary
**What goes wrong:** `page.evaluate(() => performance.getEntriesByType('navigation')[0])` returns `{}` — every metric reads `undefined`, and a `< 3000` assertion on `undefined` fails confusingly (or passes vacuously if written as `!(x > 3000)`).
**Why it happens:** Playwright serializes evaluate return values as plain data; host objects like `PerformanceNavigationTiming` aren't plain.
**How to avoid:** Return picked fields or `entry.toJSON()` (smoke.spec.ts sidesteps it via `JSON.stringify`, which invokes `toJSON`). Add the `> 0` sanity assertion per sample so a serialization regression fails loudly.
**Warning signs:** All samples log as `NaN`/`undefined`/`0`.

### Pitfall 3: Vacuously-passing perf budgets
**What goes wrong:** An unauthenticated fetch gets a fast 401 redirect, or a broken route returns a fast 500 — the 1s budget "passes" while the endpoint is broken.
**How to avoid:** Assert `res.ok` + non-empty body inside the API timing loop; assert `dcl > 0` per page sample. This is what makes the perf spec a real behavioral guard rail rather than a stopwatch.
**Warning signs:** API samples suspiciously uniform and tiny (<20ms) — likely an error short-circuit, not real query work.

### Pitfall 4: Racing the fire-and-forget review save
**What goes wrong:** A DB assertion immediately after the completion screen intermittently sees pre-grade state.
**Why it happens:** `submitReview` fires `POST /api/review` in the background with bounded retry (`postReviewWithRetry`, up to ~2s backoff between attempts) — the UI completes before persistence settles.
**How to avoid:** `expect.poll(() => subprocessQuery(), { timeout: 15_000 })` for any DB backstop. UI assertions (heading, stats tiles) have no race — the completion screen renders from client state.

### Pitfall 5: Spec-file ordering and DB mutation
**What goes wrong:** grade-flow mutates FSRS state in the shared test DB; alphabetically later specs (`perf.spec.ts`, `smoke.spec.ts`) would see 0 due cards.
**How to avoid:** Both new spec files call `resetToBaseline()` in `beforeAll`, exactly like `smoke.spec.ts:24-26` (the harness convention; also covered by CONTEXT's discretion note). `smoke.spec.ts` already resets itself, so grade-flow's mutations can't leak into it regardless.

### Pitfall 6: Perf test exceeding the default 30s test timeout
**What goes wrong:** One mega-test doing 4 routes × 5 navigations can exceed 30s (no custom `timeout` in playwright.config.ts) and fail on timeout rather than budget.
**How to avoid:** One test per route (Pattern 2) and one test per endpoint-group (Pattern 3); or set `test.setTimeout(...)` locally in perf.spec.ts if consolidation is preferred.

### Pitfall 7: MCP registration `--` separator confusion
**What goes wrong:** `claude mcp add playwright npx @playwright/mcp@latest --headless` fails or misparses — the claude CLI consumes `--headless` itself.
**How to avoid:** D-11's exact command needs no separator (no server flags). If the CLAUDE.md doc ever shows a flagged variant, it must use `claude mcp add playwright -- npx @playwright/mcp@latest --flag` [CITED: github.com/microsoft/playwright-mcp issue #1154; code.claude.com MCP docs]. The concise D-13 how-to should show the flagless form and may note the `--` rule in one sentence.

### Pitfall 8: MCP session driving the wrong server
**What goes wrong:** An agent MCP session pointed at `localhost:3100` mutates the E2E test DB mid-suite, or one pointed at :3000 is mistaken for the isolated harness.
**How to avoid:** D-12 locks MCP → dev server :3000. The CLAUDE.md section should state this explicitly ("MCP drives whatever is running; use `npm run dev` at :3000 — the port-3100 prod harness belongs to `npx playwright test`"). Note the dev server uses the developer's real `.env` `DATABASE_URL` — exploratory grading via MCP writes real FSRS state; that is the accepted, documented tradeoff of exploratory QA (matches FEATURES.md framing).

### Pitfall 9: First-sample cold-start skew
**What goes wrong:** The first navigation to each route after server boot pays one-time module-init/DB-open cost, inflating sample 1.
**How to avoid:** Median-of-5 absorbs a single outlier by construction — this is exactly why D-08 chose median. Optionally add one unmeasured warm-up `page.goto` per route before sampling; not required.

## Code Examples

See Patterns 1–3 above (all verified against the current on-disk component/harness state; grading intervals verified by executing the installed ts-fsrs).

### Playwright MCP registration + example calls (for the D-13 CLAUDE.md section)
```bash
# One-time registration (verbatim from microsoft/playwright-mcp README, current 2026-07-13):
claude mcp add playwright npx @playwright/mcp@latest
# (add flags only with a -- separator: claude mcp add playwright -- npx @playwright/mcp@latest --headless)
```
Verified current tool names in @playwright/mcp 0.0.78 [VERIFIED: npm registry + official README, 2026-07-13]:
`browser_navigate`, `browser_snapshot` (accessibility tree — the token-cheap default), `browser_click`, `browser_type`, `browser_fill_form`, `browser_take_screenshot`, `browser_press_key`, `browser_navigate_back`, `browser_wait_for`, `browser_console_messages`, `browser_network_requests`, `browser_evaluate`, `browser_tabs`, `browser_handle_dialog`, `browser_resize`, `browser_select_option`, `browser_hover`, `browser_drag`, `browser_file_upload`, `browser_close`. Opt-in capability sets exist behind `--caps` (tracing/video, coordinate mouse, PDF, `browser_generate_locator`/`browser_verify_*`). D-13's three examples (`browser_navigate`, `browser_snapshot`, `browser_click`) are all accurate.

Workflow shape for the doc: (1) `npm run dev` (port 3000) must already be running; (2) `browser_navigate` to `http://localhost:3000` → redirected to `/login`; (3) log in via `browser_type`/`browser_fill_form` + `browser_click` using `APP_PASSWORD` from `.env.local`; (4) `browser_snapshot` to read state, `browser_click` to interact.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-run wall-clock perf assertions | Median-of-N + generous budgets + logged samples | Practitioner consensus (Checkly/TestingBot guidance; PITFALLS.md Pitfall 12) | This phase's whole PERF design |
| Screenshot-driven agent browsing | Accessibility-tree snapshots (`browser_snapshot`) | @playwright/mcp design (2025→) | Token-cheap, deterministic agent QA — why MCP complements rather than duplicates specs |
| Fragile presentational-class locators (`p.text-5xl…`) | `data-testid` + `getByTestId` | This phase (closes the readers.ts:63-72 known gap) | Grade-flow spec becomes markup-refactor-proof |
| `trace: 'on-first-retry'` | `trace: 'retain-on-failure'` with `retries: 0` | Phase 25 documented deviation | New specs inherit it — failed grade-flow/perf runs emit traces automatically |

**Deprecated/outdated:** nothing relevant changed since the milestone research (2026-07-10). `@playwright/mcp` 0.0.78 and `@playwright/test` 1.61.1 both match STACK.md's recorded versions exactly.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `--` separator rule for `claude mcp add` (needed only when passing server flags) reflects current claude CLI 2.1.198 behavior | Pitfall 7 | Low — D-11's flagless command is verbatim from the official README; if the CLI errors, the executor sees it immediately at registration time and adds `--` [ASSUMED, corroborated by web sources + official README] |
| A2 | ts-fsrs interval numbers measured at research time (Good→10m etc.) hold at spec-run time | Pitfall 1 | Low — same installed package executes in both; but the loop-until-complete design is deliberately immune even if params change |
| A3 | `/api/stats` and `/api/activity` GET handlers stay thin delegations to `lib/dashboard.ts` (verified today) with no auth quirks beyond the standard middleware cookie | Pattern 3 | Low — a broken assumption fails loudly via the `res.ok` vacuity guard |

All other claims in this document are `[VERIFIED]` (direct file reads, local execution, npm registry) or `[CITED]` (official docs/README).

## Open Questions

1. **Should the grade-flow spec include the DB persistence backstop, or is UI-completion sufficient for E2E-05?**
   - What we know: E2E-05's wording is pure UI flow; the optimistic-grading architecture means UI completion does NOT prove persistence; a polled subprocess query proves it cheaply.
   - Recommendation: include the `expect.poll` backstop — it is the only non-inferable check that the fire-and-forget save pipeline actually landed (see Validation Architecture). Planner's call on exact query (reps ≥ 1 vs. due-count = 0).
2. **Assert median TTFB, median DCL, or both for PERF-04?**
   - What we know: D-08 says "TTFB / domContentLoaded" without picking; both are captured either way and all samples are logged.
   - Recommendation: assert median DCL < 3000ms (user-facing), log TTFB; asserting both against 3s is also acceptable and costs nothing.
3. **Registration verification for D-11:** `claude mcp add` mutates the developer's user/project MCP config — how does the executor prove success?
   - Recommendation: run `claude mcp list` (or `claude mcp get playwright`) after registration and capture the output in the SUMMARY; this is inherently a human-adjacent step (pairs naturally with the [SUS] checkpoint).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` + chromium browsers | Both new specs | ✓ | 1.61.1 / chromium-1228 | — |
| `tsx` (local bin) | resetToBaseline / subprocess helpers | ✓ | 4.23.x | — |
| Node.js | everything | ✓ | v25.8.2 | — |
| `claude` CLI | D-11 MCP registration | ✓ | 2.1.198 | Manual `.mcp.json` edit (documented in Claude Code docs) — not needed |
| `@playwright/mcp` (via npx, network fetch at registration/first-run) | TOOL-01 | ✓ reachable (npm registry verified) | 0.0.78 latest | Pin `@0.0.78` if `@latest` is a concern |
| `npm run dev` port 3000 free | MCP workflow doc verification | assumed free (standard dev port) | — | Any port via `npm run dev -- -p N`; doc targets 3000 |
| Port 3100 free / prod build | spec runs | ✓ (existing harness; `reuseExistingServer: !CI`) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none missing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.61.1 (E2E) + Vitest 4.1.9 (unit — not needed this phase; new specs live in `e2e/`, already excluded from Vitest discovery per E2E-01) |
| Config file | `playwright.config.ts` (no changes anticipated — verified compatible) |
| Quick run command | `npx playwright test e2e/grade-flow.spec.ts --reporter=line` (or `e2e/perf.spec.ts`) — note: first run per session includes the webServer build (~minutes); subsequent runs reuse the server (`reuseExistingServer: !CI`) |
| Full suite command | `npx playwright test --reporter=line` (= `npm run test:e2e`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-05 | reveal → grade → queue advance → session completion | e2e | `npx playwright test e2e/grade-flow.spec.ts --reporter=line` | ❌ Wave 0 (this phase's deliverable) |
| PERF-04 | median page-load DCL < 3s on 4 routes, samples logged | e2e | `npx playwright test e2e/perf.spec.ts --reporter=line` | ❌ Wave 0 (deliverable) |
| PERF-05 | median API round-trip < 1s on 3 routes, `res.ok` asserted | e2e | same perf.spec.ts run | ❌ Wave 0 (deliverable) |
| TOOL-01 | MCP registered + CLAUDE.md workflow accurate | manual-only + command check | `claude mcp list` shows `playwright`; then a live MCP smoke (browser_navigate → login → browser_snapshot against `npm run dev`) | manual — justification: MCP tool calls are agent-interactive by nature; cannot run inside the Playwright suite |

### Anti-tautology requirements (what the plan-checker should demand of each spec)

**(a) Grade-flow spec must assert real state transitions, not their absence:**
- reveal transition: `reveal-btn` visible → after click, `grade-good` visible (two distinct states, both positively asserted);
- queue advance: the set of distinct card fronts seen must equal `FIXTURE.cards.due`'s 3 fronts (content-anchored, seed-traceable — same anti-vacuous rule smoke.spec.ts follows);
- completion: heading text `'Session complete!'` exactly (not merely "session UI gone");
- grade count `>= FIXTURE.dueCards` (proves ≥1 full pass; typically 6 proves requeue exercised);
- **non-inferable backstop:** `expect.poll`'d subprocess DB query proving the background `POST /api/review` persisted (reps ≥ 1 on all 3 seeded due cards). UI state alone cannot prove this — optimistic grading renders completion before (and regardless of whether) the save lands.
- Falsifiability probe (dev-time, not committed): commenting out `setQueue(nextQueue)` in `submitReview` must make the spec fail at `MAX_GRADES`; grading via a broken testid must fail at the visibility assert.

**(b) Perf assertions must be genuinely capable of failing:**
- every sample individually asserted `> 0` (kills the `undefined`/`{}` serialization vacuity — Pitfall 2);
- API samples asserted `res.ok === true` + body non-empty (a fast error response must fail — Pitfall 3);
- the median comparison uses a real number (`expect(median).toBeLessThan(BUDGET)` fails on NaN since NaN comparisons are false — but the `> 0` per-sample guard catches it earlier with a clearer message);
- Falsifiability probe (dev-time): temporarily set the budget to 1ms — every perf test must go red; restore afterward.

**(c) Backstop checks (non-inferable from specs alone):**
- `npm run lint` green after the `data-testid` pass (CLAUDE.md hard constraint);
- `npm run build` green (testids can't break it, but it's the phase gate anyway);
- full `npx playwright test` green — proves the two new specs coexist with the 4 freshness specs + smoke under the alphabetical-order + per-file-reset regime;
- CLAUDE.md MCP section reviewed against the verified tool list in this document (a doc-accuracy check, human or agent).

### Sampling Rate
- **Per task commit:** targeted single-spec run (`npx playwright test e2e/<file>.spec.ts --reporter=line`) + `npm run lint`
- **Per wave merge:** full `npx playwright test --reporter=line`
- **Phase gate:** full suite green + `claude mcp list` shows the playwright server + one live MCP exploratory smoke before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `e2e/grade-flow.spec.ts` — covers E2E-05
- [ ] `e2e/perf.spec.ts` — covers PERF-04, PERF-05
- (framework/config/fixtures: none — Phase 25 infrastructure covers everything; no `playwright.config.ts` change needed)

## Security Domain

Phase adds no production attack surface: `data-testid` attributes are inert markup; both spec files are dev-only; the CLAUDE.md change is documentation. `security_enforcement` is on, so the applicable review is narrow:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | marginal | E2E specs reuse the existing setup-project login (real `POST /api/login`); MCP workflow doc instructs typing `APP_PASSWORD` into the local login form — password stays in `.env.local`, never in CLAUDE.md (the doc must reference the env var, not a literal value) |
| V3 Session Management | no | unchanged HMAC cookie |
| V4 Access Control | no | unchanged middleware |
| V5 Input Validation | no | no new inputs |
| V6 Cryptography | no | — |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Test harness touching production Turso | Tampering | Already structurally prevented (E2E-03 guards in `playwright.config.ts:17-21`, `assertLocalDb`); new specs run under the same harness — no new guard needed |
| Supply-chain via npx-run MCP server | Tampering/Elevation | `@playwright/mcp` legitimacy checked (official MS repo, 6.4M dl/wk, no postinstall script [VERIFIED: npm signals]); [SUS]-flagged for version recency → human checkpoint at registration; optionally pin `@0.0.78` |
| Secrets leaking into committed docs | Information disclosure | D-13 doc must say "use `APP_PASSWORD` from `.env.local`" — never inline the value; `DATABASE_AUTH_TOKEN` blanking convention already carried in the harness |
| MCP agent mutating real dev DB | Tampering (accepted) | Documented tradeoff: MCP targets dev server + real dev DB by design (D-12); the CLAUDE.md section should state this so an agent session knows grades/edits made via MCP are real |

## Sources

### Primary (HIGH confidence)
- Direct file reads (2026-07-13): `e2e/*` (seed.ts, fixture.ts, smoke.spec.ts, helpers/readers.ts, helpers/mutate.ts, auth.setup.ts), `playwright.config.ts`, `components/FlashcardMode.tsx`, `components/StudySession.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx`, `lib/dashboard.ts`, `lib/fsrs.ts`, `app/api/review/route.ts`, `package.json`
- Local execution of installed ts-fsrs 5.3.1 (grading intervals for a new card under `new FSRS({})` defaults) — the load-bearing Pitfall 1 evidence
- npm registry: `npm view @playwright/mcp` (0.0.78, 2026-07-12), installed `@playwright/test` 1.61.1
- [github.com/microsoft/playwright-mcp README](https://github.com/microsoft/playwright-mcp) — tool names, registration command, config flags (fetched 2026-07-13)
- gsd-tools package-legitimacy seam — `@playwright/mcp` signals

### Secondary (MEDIUM confidence)
- WebSearch: `--` separator behavior for `claude mcp add` ([microsoft/playwright-mcp issue #1154](https://github.com/microsoft/playwright-mcp/issues/1154), [code.claude.com MCP quickstart](https://code.claude.com/docs/en/mcp-quickstart), [playwright.dev getting-started-mcp](https://playwright.dev/docs/getting-started-mcp))
- WebSearch: Navigation Timing measurement patterns ([Checkly Playwright performance guide](https://www.checklyhq.com/docs/learn/playwright/performance/), [marcusfelling.com Navigation Timing post](https://marcusfelling.com/blog/2023/measuring-website-performance-with-playwright-test-and-navigation-timing-api/), [TestingBot Playwright performance](https://testingbot.com/support/web-automate/playwright/performance))

### Tertiary (LOW confidence)
- none relied upon

### Milestone research (treated as project canon, per CONTEXT.md)
- `.planning/research/PITFALLS.md` Pitfall 12, `.planning/research/STACK.md` (lines 11, 20-21, 49, 65), `.planning/research/FEATURES.md` (lines 20, 52-53) — all cross-checked against current sources this session; no drift found.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything installed and version-verified; zero new deps
- Architecture (spec designs): HIGH — patterns verified against current on-disk source + local FSRS execution; the one behavioral unknown (grade count) was resolved empirically
- Pitfalls: HIGH for 1–6 (source-verified/executed), MEDIUM for 7 (CLI behavior corroborated but not executed — registration is a checkpointed step anyway)
- MCP tooling facts: HIGH — official README + registry, fetched today

**Research date:** 2026-07-13
**Valid until:** ~2026-08-13 for the harness/spec patterns (stable); re-verify `@playwright/mcp` tool list if registration happens more than ~2 weeks out (0.0.x cadence is fast, but D-13's three example tools are long-stable core tools)
