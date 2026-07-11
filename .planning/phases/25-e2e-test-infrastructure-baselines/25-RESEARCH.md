# Phase 25: E2E Test Infrastructure & Baselines - Research

**Researched:** 2026-07-11
**Domain:** Playwright E2E harness (isolated DB, auth setup, prod-build webServer) for a Next.js 16 RSC/DTO app; freshness-regression spec encoding a prior diagnosis
**Confidence:** HIGH

## Summary

This is a **synthesis pass**, not a from-scratch investigation. The project's own 2026-07-10 milestone research (`SUMMARY.md`, `PITFALLS.md`, `ARCHITECTURE.md`, `FEATURES.md`) already covers this exact phase in depth and explicitly recommends skipping a dedicated research phase here, citing Playwright-with-Next.js as officially documented territory and this repo's own Phase-22 dry-run/host-guard precedent. Phase 24 then went further and produced a working, empirically-validated throwaway script (`scripts/diagnose-freshness.mts`) that already implements every hard part of the harness — DB isolation guard, prod-server orchestration, cookie-auth injection, the RSC-fetch predicate, and a resume simulator — against this exact codebase. CONTEXT.md's 14 decisions (D-01–D-14) lock the phase's scope precisely.

This document's job is narrow: (1) resolve the handful of places where the general research's recommendations and CONTEXT.md's specific locked decisions could read ambiguously to a planner, (2) supply the concrete artifacts CONTEXT.md deliberately left to "planner's/executor's discretion" — exact `playwright.config.ts` shape, exact spec-file boundaries, exact seed-fixture data model, exact function-by-function port plan for `scripts/diagnose-freshness.mts` — and (3) provide the mandatory Validation Architecture section this project's Nyquist-validation workflow requires.

**Primary recommendation:** Build the harness as three coordinated artifacts — `playwright.config.ts` (single prod-mode `webServer` on port 3100, `workers: 1`, `trace: 'on-first-retry'`, `line` reporter), an `e2e/` tree with a `setup` project + 3 freshness spec files split by root cause (matching D-02) + 1 smoke spec, and a `global-setup.ts` that resets/seeds the isolated `file:./e2e/.tmp/e2e-test.db`. Port the diagnosis script's `isRscRequest()`, `simulateResume()`, `assertLocalDb()`, and `checkRouteIsDynamic()` verbatim; do **not** port `waitForServer()`/`stopServer()` — Playwright's built-in `webServer` config already replaces that exact functionality (see Ambiguity 1 below). Encode the freshness-regression spec using Playwright's native `page.goBack()` rather than the diagnosis script's `window.history.back()` + manual recovery dance, and — critically — do **not** reproduce the CR-01 `page.goto()` recovery fallback; let a stuck `about:blank` fail the assertion honestly, since that IS the re-verification D-04 calls for.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Test runner config (webServer, projects, reporters) | Build/Tooling (repo root) | — | `playwright.config.ts` is a dev-only build artifact, not part of the deployed app |
| Auth bootstrap for tests | Browser (Playwright `APIRequestContext`) | API / Backend | The setup project drives a real `POST /api/login` (Backend), but the *storageState* artifact it produces is consumed entirely client-side by Playwright's browser/request contexts |
| Isolated test database | Database / Storage | Build/Tooling | `file:./e2e-test.db` is a genuine SQLite datastore, but its lifecycle (reset/seed/teardown) is owned by test tooling, not app code |
| RSC-fetch detection (`isRscRequest`) | Browser / Client | — | Inspects real network request headers from within a Playwright browser context — an observational tool, not a server concern |
| Freshness-regression assertions | Browser / Client | API / Backend (network evidence) | DOM assertions run in the browser tier; the paired network-evidence assertion (`rsc: 1` header) observes the API/backend boundary from the client side |
| Smoke/first-load assertions | Browser / Client | Frontend Server (SSR) | Assert on content the RSC page layer already rendered server-side — the browser tier is where the assertion executes, but what's being proven is server-side freshness |

No production `app/`, `components/`, or `lib/` code changes occur in this phase (CONTEXT.md Integration Points) — every capability above lives in new `e2e/`/`playwright.config.ts`/dev-tooling files.

## Package Legitimacy Audit

Only one new package this phase: `@playwright/test`. `playwright` (the raw library) is already installed (`^1.61.1`, used by Phase 24's throwaway script).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@playwright/test` | npm | Microsoft-maintained, part of the Playwright monorepo (first published 2020) | 44.7M/week | `github.com/microsoft/playwright` | [SUS — seam flag] | **Approved** (see note) |

**Seam note on the `[SUS]` verdict:** `gsd-tools query package-legitimacy check` flagged `@playwright/test` with reason `too-new`, based on its **most recent patch release date** (2026-06-23) rather than the package's actual age. This is a known false-positive shape for high-velocity official packages that ship frequent patch releases — 44.7M weekly downloads and the `microsoft/playwright` source repo are unambiguous legitimacy signals that outweigh the "recent publish" heuristic. `[VERIFIED: npm registry]` — confirmed via `npm view @playwright/test version` (1.61.1) `[VERIFIED: npm registry]`, matching the already-installed `playwright` package's version exactly, and cross-referenced against the official `playwright.dev` docs used throughout this milestone's prior research.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@playwright/test` — flagged by the automated heuristic only; approved above based on manual verification (official Microsoft repo, download volume, version parity with the already-vetted `playwright` package). No `checkpoint:human-verify` gate is warranted for a Tier-1 Microsoft package the project already partially depends on, but the planner may still add a lightweight confirmation step if it prefers not to override the seam's verdict silently.

**Installation:**
```bash
npm install -D @playwright/test@1.61.1
```
No `npx playwright install chromium` step needed — Chromium 1228 and its headless-shell/ffmpeg companions are already present in `~/Library/Caches/ms-playwright` from Phase 24's setup `[VERIFIED: local filesystem check]`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | 1.61.1 (pin exact, matches installed `playwright`) | Test runner: `test`/`expect`, `webServer`, projects/fixtures, trace/reporter config | The dedicated test-runner package (vs. raw `playwright` library) is what supplies `playwright.config.ts`, `test.describe`, auto-waiting `expect(locator)`, and the `webServer` lifecycle manager — none of which the raw `playwright` package used by Phase 24's throwaway script provides |
| `playwright` | ^1.61.1 (already installed) | Browser automation primitives; stays a transitive dependency of `@playwright/test` | Already vetted in Phase 24; no action needed beyond keeping versions aligned |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `prisma` CLI (already installed) | 7.6.0 | `prisma db push --accept-data-loss` against `file:./e2e-test.db` in global setup | Schema application for the isolated test DB — `db push` works against `file:` URLs (the Turso `libsql://` DDL gotcha does not apply) `[VERIFIED: Phase 24 diagnosis run, confirmed again in scripts/diagnose-freshness.mts:160-164]` |
| `dotenv` (already installed) | ^17.3.1 | Load a gitignored `.env.test` for test-only secrets (`AUTH_SECRET`, `APP_PASSWORD`) into `playwright.config.ts` | Keeps real production secrets out of both `webServer.env` and the config file itself (PITFALLS.md Security Mistakes) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Setup-project auth (D-10) | Direct `computeAuthToken()` cookie injection (Phase 24's approach) | Faster (no HTTP round-trip), fully offline, but skips exercising `/api/login` and duplicates cookie-shape knowledge in test code — CONTEXT.md D-10 explicitly rejects this in favor of the conventional pattern |
| Per-file dedicated `webServer` instances | One shared `webServer` (D-07) | Per-file servers would eliminate any cross-spec-file ordering coupling, but at 1–2 min build cost each — D-07 locks one shared instance |
| `@playwright/mcp` (interactive browser driving) | N/A this phase | Explicitly Phase 27 scope (TOOL-01); not installed here |

## Ambiguities Between General Research and CONTEXT.md's Locked Decisions

These are the specific places where a planner reading both RESEARCH-shape docs and CONTEXT.md side-by-side could reach different conclusions. Each is resolved below so the plan doesn't have to re-litigate it.

### Ambiguity 1: D-08's "prod-server child-process orchestration" vs. Playwright's built-in `webServer`

CONTEXT.md D-08 lists "prod-server child-process orchestration" among the reusable pieces to port from `scripts/diagnose-freshness.mts`. Read literally, this could be misinterpreted as "port `waitForServer()`/`stopServer()`/the `spawn('npm', ['run', 'start', ...])` call into `e2e/`." **This is not the right target.** The diagnosis script hand-rolled process spawning + polling + teardown *because it had no test runner* — it was a raw `playwright` library script. `@playwright/test`'s `webServer` config block (`command`, `url`, `env`, `reuseExistingServer`, `timeout`) is the framework-native replacement for exactly that functionality: it builds/starts the command, polls the URL until ready, and tears the process down after the run, all declaratively. **Resolution:** do not port `waitForServer`/`stopServer` as functions. What genuinely ports is the *shape of the command and env* (`npm run build && npm run start -- -p 3100`, `DATABASE_URL`/`AUTH_SECRET`/`APP_PASSWORD` overrides) — expressed as `playwright.config.ts`'s `webServer` block, not as hand-rolled orchestration code.

### Ambiguity 2: D-04's "first real run IS the re-verification" vs. reproducing CR-01's recovery bug

D-04 resolves the CR-01 finding by treating the harness's first real spec run as the re-verification — no separate manual pass. This only works if the harness's `back-forward` implementation does **not** carry over the exact bug CR-01 found (a silent `page.goto()` recovery that converts a true Router-Cache-reuse verdict into a false "Fresh" one by injecting a genuine fetch before the evidence window closes). **Resolution:** the new `e2e/` spec must use Playwright's native `page.goBack({ waitUntil: 'networkidle' })` (not the diagnosis script's manual `window.history.back()` + `waitForURL` + `page.goto()` fallback), and must **not** add any goto-based recovery when the page fails to settle. If `page.goBack()` times out or the page ends up on an unexpected URL, the assertion should fail loudly (that's a real bug or infra problem to fix), never silently recover by re-navigating. This is the mechanism that makes D-04's "the spec run itself re-verifies" claim actually true rather than aspirational.

### Ambiguity 3: D-05's "reuse the observable-reader pattern" vs. IN-04's selector-fragility warning vs. the "no production code changes" boundary

D-05 says to reuse the diagnosis script's per-route "observable reader" pattern for both the smoke spec and the freshness-regression spec. Phase 24's own code review (IN-04) flagged that those readers hardcode exact Tailwind utility-class chains (e.g. `p.text-5xl.font-bold.animate-reveal`) and recommended `data-testid`/`aria-label`/role-based selectors instead if reused. But CONTEXT.md's Integration Points explicitly forbid touching `app/`, `components/`, or `lib/` this phase — so adding `data-testid` attributes to fix this is off the table. **Resolution (verified against the actual component source this session):**
- `/cards`'s "Cards (N)" toggle is **already** role-based and robust: `page.getByRole('button', { name: /^Cards \(\d+\)$/ })` — no class dependency at all, safe to reuse as-is.
- Home's due-count (`components/HomeClient.tsx:207`), Study's select-mode due-count (`components/StudyClient.tsx:251`), and Habits' Proficiency panel have **no** `aria-label`/`data-testid` wrapping the number itself.
- However, this project's own CSS convention (CLAUDE.md "Color system & theming") makes `text-reward` and `bg-surface-1`/`bg-surface-2`/`bg-surface-3` **semantic design tokens**, not incidental Tailwind utilities — they're documented as the single stable abstraction a future polish pass is expected to preserve. Purely-presentational classes on the same elements (`text-6xl`, `text-5xl`, `font-bold`, `animate-reveal`) are not part of that contract and are the most likely to change on a cosmetic tweak.
- **Recommendation:** anchor locators on the semantic-token half only where possible — `page.locator('span.text-reward').first()` for Home, `page.locator('div.bg-surface-1', { hasText: 'Proficiency' })` for Habits (Phase 24's script already did this for Habits; only Home's/Study's selectors need trimming to drop the presentational classes). Study's due-count container has no semantic-token class to anchor on (`p.text-5xl.font-bold.animate-reveal` is 100% presentational) — for that one locator, anchor on the *surrounding structural context* instead (e.g. the parent element within the known select-mode button group, or a text-based `getByText` fallback via the "zero-due-state" empty-copy strings, which are already stable literal strings per D-05). Flag this specific selector as the fragile one to watch; it is an acceptable known limitation for this phase, not a blocker (a future phase adding `data-testid` attributes would close this gap cleanly).

### Ambiguity 4: "Serial workers" (D-07/Pitfall 10) vs. `fullyParallel` project-level settings

PITFALLS.md Pitfall 10 and D-07 both call for `workers: 1`/`fullyParallel: false`. Note this must be set in `playwright.config.ts` at the **top level**, not just per-project — Playwright's `fullyParallel` and `workers` are config-wide settings; setting them only inside a `projects: [...]` entry has no effect on cross-project execution order. Also set `retries: 0` locally (retries mask the exact DB-race class Pitfall 10 warns about) — CI-only retry tuning is moot per D-14 (no CI this phase).

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────── npx playwright test ────────────────────────────┐
│                                                                              │
│  1. global-setup.ts (once, before any project runs)                        │
│     ├─ assertLocalDb(DATABASE_URL) — hard-fail if libsql://                 │
│     ├─ rm e2e-test.db (+ -wal/-shm sidecars, per WR-03 lesson)              │
│     ├─ npx prisma db push --accept-data-loss (file: URL — works)           │
│     └─ seed.ts: lessons, cards, sentences, reviews, 1 CardDependency edge   │
│                          │                                                  │
│                          ▼                                                  │
│  2. webServer (Playwright-managed, replaces hand-rolled spawn/poll)         │
│     command: "npm run build && npm run start -- -p 3100"                   │
│     env: { DATABASE_URL: file:..., AUTH_SECRET, APP_PASSWORD }             │
│     → polls http://localhost:3100/login until ready, tears down after run   │
│                          │                                                  │
│                          ▼                                                  │
│  3. project "setup" → e2e/auth.setup.ts                                     │
│     APIRequestContext.post('/api/login', { password }) → storageState      │
│     → playwright/.auth/user.json (gitignored)                              │
│                          │                                                  │
│                          ▼                                                  │
│  4. project "chromium" (dependencies: ['setup'], use: { storageState })    │
│     ├─ e2e/smoke.spec.ts — 4 routes render real seeded content (E2E-04)    │
│     ├─ e2e/freshness-router-cache.spec.ts — RED (Stale-RouterCache, 5 cells)│
│     ├─ e2e/freshness-client-shell.spec.ts — RED (Stale-ClientShell, 4 cells)│
│     └─ e2e/freshness-fresh-paths.spec.ts — GREEN (7 confirmed-fresh cells) │
│         each assertion: DOM read (e2e/helpers/readers.ts)                  │
│                        + network evidence (e2e/helpers/rsc.ts:isRscRequest)│
│                          │                                                  │
│  On failure: trace: 'on-first-retry' → playwright-report/ + test-results/  │
│  Reporter: line (parseable by human + agent stdout)                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
playwright.config.ts                    # NEW — root config
.env.test                               # NEW — gitignored; AUTH_SECRET/APP_PASSWORD test values
e2e/
├── global-setup.ts                     # reset + prisma db push + seed (calls seed.ts)
├── seed.ts                             # deterministic Prisma fixture (D-13 shape, see below)
├── auth.setup.ts                       # POST /api/login → storageState (D-10)
├── helpers/
│   ├── rsc.ts                          # isRscRequest() — ported from diagnose-freshness.mts (D-09)
│   ├── resume.ts                       # simulateResume() — ported verbatim
│   ├── build-guard.ts                  # assertLocalDb() + checkRouteIsDynamic() — ported
│   └── readers.ts                      # per-route DOM readers (Home/Study/Cards/Habits) — ported + selector-trimmed per Ambiguity 3
├── smoke.spec.ts                       # E2E-04: all 4 routes render real content + capture Nav Timing (D-06, informational only)
├── freshness-router-cache.spec.ts      # D-02 file 1: `/` back-forward + 4 resume cells — expected RED
├── freshness-client-shell.spec.ts      # D-02 file 2: `/study`/`/cards`/`/habits` back-forward + `/habits` post-mutation-return — expected RED
└── freshness-fresh-paths.spec.ts       # 7 confirmed-fresh cells (4 plain-link + 3 post-mutation-return) — expected GREEN, regression net for Phase 26
playwright/.auth/                       # NEW — gitignored storageState output
e2e-test.db, e2e-test.db-wal/-shm       # NEW — gitignored (see .gitignore additions below)
scripts/diagnose-freshness.mts          # DELETED at end of this phase (D-08)
```

### Pattern 1: Ported RSC-fetch predicate (verbatim port, D-09)

**What:** `isRscRequest()` — the single locked predicate confirmed via Phase 24's 17/24-match sanity gate. Playwright's `Request` type from `@playwright/test` is structurally identical to the raw `playwright` library's `Request` type (same underlying package), so this ports with zero adaptation beyond the import path.
**When to use:** Every freshness-regression assertion's network-evidence half (D-03).
```typescript
// e2e/helpers/rsc.ts — Source: scripts/diagnose-freshness.mts:131-134 (drop the dead
// uppercase-'RSC' branch per Phase 24 code review IN-01)
import type { Request as PwRequest } from '@playwright/test'

export function isRscRequest(req: PwRequest): boolean {
  return req.headers()['rsc'] === '1'
}
```

### Pattern 2: Ported resume simulator (verbatim port, D-08)

**What:** `simulateResume()` — dual-property `document.hidden`/`document.visibilityState` override, required because `StudySession.tsx` reads `visibilityState` specifically.
```typescript
// e2e/helpers/resume.ts — Source: scripts/diagnose-freshness.mts:465-477
import type { Page } from '@playwright/test'

export async function simulateResume(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}
```

### Pattern 3: Playwright-native back-forward (NOT ported — deliberately rewritten per Ambiguity 2)

```typescript
// e2e/freshness-router-cache.spec.ts (excerpt)
test('/ back-forward stays stale (Stale-RouterCache) — RED until Phase 26', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Cards', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await mutateOneReviewDueState()           // e2e/helpers — direct Prisma mutation
  const preLen = requestLog.length          // requestLog populated by a page.on('request') listener registered once per test
  await page.goBack({ waitUntil: 'networkidle' })   // native API — no manual history.back() dance, no goto() recovery
  const newFetches = requestLog.slice(preLen).filter((r) => r.pathname === '/' && (isRscRequest(r) || r.resourceType === 'document'))
  expect(newFetches).toHaveLength(0)        // Router Cache reuse: zero fetches is the defining signature
  await expect(page.locator('span.text-reward').first()).toHaveText(String(await expectedDueCount()))
  // ^ This assertion is EXPECTED TO FAIL today (D-04/D-01) — the stale count is what's on screen.
})
```
**Note:** encoding "expected to fail" as a real `expect()` (not `test.fail()` or `test.skip()`) is deliberate — `test.fail()` marks the whole test as an expected-failure annotation that Playwright treats specially in reporting (inverted pass/fail semantics), which would make the freshness-regression spec's "red" state look like a "green, expected-fail" pass in the report. Per the Validation Architecture section below, the plan should use a plain `expect()` that is genuinely red, so the report unambiguously shows failing tests until Phase 26 turns them green — matching ROADMAP Success Criterion 4's literal wording ("currently red").

### Anti-Patterns to Avoid

- **Reproducing CR-01's `page.goto()` recovery fallback:** silently converts a true stale verdict into a false "fresh" one; never add a goto-based recovery inside a freshness assertion (Ambiguity 2).
- **`test.fail()`/`test.fixme()` on the freshness-regression spec's stale cells:** these Playwright annotations invert or skip reporting semantics — the spec must be a plain, genuinely-failing `expect()` so CI/local runs show real red (see Pattern 3 note).
- **Porting `waitForServer`/`stopServer` as hand-rolled functions:** redundant with `webServer` config (Ambiguity 1); adds a second, uncoordinated readiness/teardown mechanism.
- **Adding `data-testid` attributes to fix selector fragility:** violates the phase's "no production code changes" boundary (Ambiguity 3) — use semantic-token-class anchoring or structural/text fallbacks instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server readiness polling + teardown | Custom `spawn`/`setTimeout` poll loop (Phase 24's `waitForServer`/`stopServer`) | `playwright.config.ts`'s `webServer` block | Framework-native, handles `reuseExistingServer`, timeout, and SIGTERM/SIGKILL teardown already (Ambiguity 1) |
| Auth cookie injection | Manual `computeAuthToken()` + `context.addCookies()` per test | Setup-project + `storageState` (D-10) | Documented Playwright pattern; exercises the real `/api/login` route once instead of duplicating HMAC knowledge in test code |
| Retry/backoff for SQLite contention | Hand-rolled `withDbRetry` wrapper (needed in Phase 24 because ITS OWN long-lived script Prisma client + the server's client both hit the DB under 16-cell sustained load) | `workers: 1` + a fresh Prisma client per seed script invocation (not a long-lived client held across the whole suite) | The contention Phase 24 worked around was specific to holding one Prisma client open across ~20 minutes of sustained dual-process load; a normal Playwright suite's seed step is a single short-lived script run before the server even starts serving traffic — the race window Phase 24 needed to guard against structurally doesn't exist here |

**Key insight:** almost everything genuinely reusable from Phase 24 is *predicates/simulators* (pure functions operating on Playwright API objects), not *orchestration* (which Playwright's own test-runner config replaces more robustly than any hand-rolled equivalent).

## Common Pitfalls

(Full detail in `.planning/research/PITFALLS.md` Pitfalls 7–12 — summarized here with this phase's specific resolution.)

### Pitfall: E2E hitting production Turso
**What goes wrong:** `.env` contains the real `libsql://` URL; an unguarded webServer would inherit it.
**How to avoid:** `assertLocalDb()` ported into `global-setup.ts`, checked before the seed step AND again as a defense-in-depth re-check right before `webServer` env is assembled. Per Phase 24's WR-01 code-review finding, invert the check to a positive allow-list (`!url.startsWith('file:')` → fail), not the deny-list shape (`url.startsWith('libsql://')` → fail) the throwaway script used — the allow-list closes the gap the reviewer flagged (a non-`libsql://`-prefixed remote URL sailing through undetected).
**Warning signs:** suite "passes" seeing familiar real card fronts; Anthropic API usage spike during a run.

### Pitfall: Testing against `next dev`
**How to avoid:** `webServer.command: 'npm run build && npm run start -- -p 3100'` — never `npm run dev`. Dedicated port 3100 (D-12) so `reuseExistingServer: !process.env.CI` can never silently attach to a dev-mode process on 3000.

### Pitfall: Parallel workers racing the shared SQLite file
**How to avoid:** `workers: 1`, `fullyParallel: false` at config top level (Ambiguity 4).

### Pitfall: Timing assumptions (animations, fire-and-forget writes)
**How to avoid:** `use: { reducedMotion: 'reduce' }` globally in `playwright.config.ts` (this app already gates every animation on `prefers-reduced-motion`, so this is a free stabilizer, not a workaround). Zero `waitForTimeout` in specs — prefer `page.waitForResponse()`/`expect.poll()`/web-first `expect(locator)` auto-waiting. For the freshness specs specifically, `page.waitForLoadState('networkidle')` after each navigation trigger (matching the proven diagnosis-script pattern) plus a `page.waitForTimeout(300)` settle margin was empirically necessary in Phase 24 to let React's `startTransition`-wrapped soft-navigation commit finish before reading the DOM — this is one of the few justified `waitForTimeout` uses (a fixed post-settle margin after an already-awaited `networkidle`, not a substitute for waiting on a specific condition) and should be preserved, not removed, when porting the reader helpers.

### Pitfall: Sidecar WAL files corrupting a "fresh" DB reset (WR-03, this repo's own finding)
**What goes wrong:** if the seed script or a prior run enabled WAL mode, `-wal`/`-shm` sidecar files persist alongside the main `.db` file; recreating only the `.db` file for a "fresh" run can leave stale sidecars that cause checksum-mismatch/recovery errors.
**How to avoid:** `global-setup.ts`'s reset step must remove `e2e-test.db`, `e2e-test.db-wal`, AND `e2e-test.db-shm` — not just the main file. Note this phase's harness likely does **not** need WAL mode at all (unlike Phase 24's script, there is no long-lived competing Prisma client holding the DB open during seeding — see Don't Hand-Roll table above) — but if flakiness under the shared `webServer` + seed script does appear, WAL is the proven fix and the sidecar-cleanup gotcha applies the moment it's enabled.

## Code Examples

### `playwright.config.ts` (concrete shape)

```typescript
// Source: synthesized from ARCHITECTURE.md Pattern 3/4 + PITFALLS.md 7-12 + CONTEXT.md D-07/D-11/D-12/D-14
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.test' })  // gitignored: AUTH_SECRET, APP_PASSWORD test values only

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,       // D-07 / Pitfall 10 — must be top-level, not per-project
  workers: 1,                 // same
  retries: 0,                 // no CI this phase (D-14); local runs should surface real flakes, not mask them
  reporter: 'line',            // E2E-07: parseable by human + agent
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',   // E2E-07
    reducedMotion: 'reduce',   // Pitfall 11 — stabilizes animation timing, exercises the app's own invariant
  },
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run build && npm run start -- -p ' + PORT,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: 'file:./e2e-test.db',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'e2e-test-secret',
      APP_PASSWORD: process.env.APP_PASSWORD ?? 'e2e-test-password',
    },
  },
})
```

### `e2e/auth.setup.ts` (D-10)

```typescript
// Source: Playwright docs — Authentication (setup project + storageState),
// adapted for this app's single-shared-password + APIRequestContext login.
import { test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

setup('authenticate', async ({ request }) => {
  const res = await request.post('/api/login', {
    data: { password: process.env.APP_PASSWORD ?? 'e2e-test-password' },
  })
  if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`)
  await request.storageState({ path: authFile })
})
```

### Seed fixture data model (fills D-13's floor — concrete shape)

CONTEXT.md D-13 sets a floor ("at least" mastered reviews + 1 dependency edge) but deliberately leaves the exact shape to the planner. Concrete recommendation, sized for this phase's own smoke + freshness assertions plus a head start on Phase 27's E2E-05 grade-flow spec:

| Entity | Count | Shape | Used by |
|--------|-------|-------|---------|
| `Lesson` | 2 | `orderIndex: 1, 2` | Lesson-range filter has real data to filter (not required this phase but cheap) |
| `Card` (due) | 3 | `CardReview.state=1`, `nextReview` in the past, 1 `Sentence` each | Home/Study due-count assertions; primary grade-through-completion scenario used by the fresh post-mutation-return cells |
| `Card` (mastered) | 3 | `CardReview.state=2`, `scheduledDays: 30` (`>= 21` per `lib/dashboard.ts`'s mastered-count query) | Habits Proficiency panel mastered-count assertion; CEFR-band rendering |
| `Card` (new, no due bias) | 2 | `CardReview.state=0` or omitted | Cards-page count padding; `CardDependency` prerequisite target |
| `CardDependency` | 1 | One "due" card's `components` names a "new" card's front; resolved to an edge exactly like sync-time linking does | Satisfies D-13's floor; exercises `lib/sequence.ts` foundation-first ordering if Phase 27 reuses this fixture |
| `StudyDay` | 1–2 | Consecutive recent dates, small `seconds`/`reviews` | Habits streak text has something to render beyond zero-state |

Total: 8 cards, 2 lessons — deliberately smaller than a real deck (per CONTEXT.md's Specifics: "stay proportionate... not a full mirror of a real user's deck"). Build via the same nested-create Prisma shape `24-PATTERNS.md` already validated (`prisma.card.create({ data: { ..., sentences: { create: [...] }, review: { create: {...} } } })`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hand-rolled throwaway diagnostic script (Phase 24) | Real `@playwright/test` harness with declarative `webServer`/projects/fixtures | This phase | Replaces bespoke orchestration with framework-native lifecycle management; the throwaway script is deleted (D-08) |
| `next-cache-components`/`staleTimes` tuning as "the fix" (rejected in prior milestone research) | N/A — out of scope for this phase entirely (no fix lands here) | v1.2/v1.6 research | Not this phase's concern; noted only so the freshness-regression spec doesn't accidentally encode an already-rejected fix shape as an assertion |

**Deprecated/outdated:** `scripts/diagnose-freshness.mts` itself — retired at the end of this phase per D-08, its useful pieces having been ported into `e2e/helpers/`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@playwright/test`'s `Request`/`Page` types are structurally compatible with the raw `playwright` library types the diagnosis script used, allowing a verbatim function port | Pattern 1/2 | LOW — same underlying npm org/monorepo; if wrong, a trivial type-import fix, not a logic change |
| A2 | The harness does not need SQLite WAL journal mode (unlike Phase 24's script) because there is no long-lived competing Prisma client during seeding | Don't Hand-Roll table | LOW-MEDIUM — if wrong, flakiness would surface as intermittent `P1008`/`SQLITE_BUSY` errors during the seed step or early test runs; the fix (enable WAL + clean up `-wal`/`-shm` sidecars per WR-03) is well-understood and already proven in this exact codebase |
| A3 | Study's due-count locator has no viable semantic-token class to anchor on, requiring a structural/text-based fallback instead | Ambiguity 3 | LOW — worst case, a slightly more brittle selector for one of ~16 assertions; does not block the phase, and the mitigation (text-based fallback via the already-stable "zero-due-state" copy strings) is already identified |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Exact escalation path if D-04's re-verification surfaces a mismatch**
   - What we know: CONTEXT.md's Claude's Discretion explicitly defers this to "the executor at that moment" (STATE.md blocker vs. inline spec comment vs. user callout).
   - What's unclear: nothing further to resolve at planning time — this is correctly left open per CONTEXT.md.
   - Recommendation: the plan should still name a default (e.g., "if a back-forward cell's real spec run disagrees with 24-DIAGNOSIS.md's verdict, log it in STATE.md Blockers/Concerns and continue — do not block phase completion on it, since Phase 26 will act on whatever the spec actually shows regardless of the discrepancy's cause").

2. **Whether the seed script needs its own throwaway `AUTH_SECRET`/`APP_PASSWORD` distinct from `.env.test`, or should read the same values `global-setup.ts` and `webServer.env` use**
   - What we know: all three (`global-setup.ts`'s DB reset, `webServer.env`, and `auth.setup.ts`'s login POST) must agree on `APP_PASSWORD` for login to succeed, and on `AUTH_SECRET` for the resulting cookie to validate against `middleware.ts`.
   - What's unclear: nothing structurally — this is a single shared `.env.test` file consumed by all three, per the `playwright.config.ts` example above. Flagging only so the plan doesn't accidentally introduce three independently-hardcoded secret strings that drift out of sync (a real risk pattern Phase 24's script had to be careful about with its `THROWAWAY_SECRET`/`THROWAWAY_APP_PASSWORD` constants).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` | Test runner | ✗ (not yet in `package.json`) | install `1.61.1` | None needed — trivial `npm install -D` |
| `playwright` (raw lib) | Transitive dep of `@playwright/test` | ✓ | `^1.61.1` (installed) | — |
| Chromium browser binary | `webServer`/browser launch | ✓ | `chromium-1228` (`~/Library/Caches/ms-playwright`) | — already installed by Phase 24, no `npx playwright install` needed |
| `prisma` CLI | `db push` against `file:` test DB | ✓ | `7.6.0` (installed) | — |
| Node.js | test runner + Next.js build | ✓ | 25.8.2 (dev) | — |
| GitHub Actions / CI | N/A this phase (D-14) | ✗ (no CI exists) | — | Not needed — suite is local/on-demand only per D-14 |

**Missing dependencies with no fallback:** none — the only missing item (`@playwright/test`) is a one-line install.
**Missing dependencies with fallback:** none applicable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.61.1 (new this phase) |
| Config file | `playwright.config.ts` (new — created by this phase, does not exist yet) |
| Quick run command | `npx playwright test e2e/smoke.spec.ts` (single file, fastest signal) |
| Full suite command | `npx playwright test` |

Note: `npm test` (Vitest) must remain unaffected — Vitest's default `include` glob (`**/*.{test,spec}.ts`) would otherwise match `e2e/*.spec.ts`. Add an explicit `exclude: ['e2e/**']` to `vitest.config.ts` (currently has no `exclude` key at all) as part of this phase's config work, satisfying E2E-01's "isolated from the existing Vitest test discovery" clause.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Validation Command | Expected State |
|--------|----------|-----------|---------------------|-----------------|
| E2E-01 | `webServer` boots prod build; Playwright/Vitest discovery don't collide | config + smoke | `npx playwright test --list` (confirms discovery) then `npm test` (confirms Vitest doesn't pick up `e2e/**`) | Both green; `--list` shows only `e2e/*.spec.ts` files, `npm test` shows only `tests/*.test.ts` files |
| E2E-02 | Setup project logs in once via real `/api/login`, produces reusable `storageState`, no per-spec login UI | `e2e/auth.setup.ts` run as part of any full suite invocation | `npx playwright test --project=setup` | `playwright/.auth/user.json` created; subsequent chromium-project specs load authenticated (no `/login` redirect) |
| E2E-03 | Isolated `file:` DB; structurally prevented from hitting production Turso | `global-setup.ts`'s `assertLocalDb()` | Manual negative test: temporarily set `DATABASE_URL=libsql://fake` and run `npx playwright test` — must hard-fail immediately, before any browser work | Guard fires and exits non-zero; normal runs (real `.env.test` `DATABASE_URL=file:...`) proceed past the guard silently |
| E2E-04 | Smoke spec: every main route renders real content on first paint | `e2e/smoke.spec.ts` | `npx playwright test e2e/smoke.spec.ts` | **GREEN** — all 4 routes assert specific seeded data (due-count number, "Cards (N)" text, mastered-count, streak text), not just HTTP 200 |
| E2E-06 | Freshness-regression spec encodes FRESH-03/04/05; fails if staleness reappears | `e2e/freshness-router-cache.spec.ts` + `e2e/freshness-client-shell.spec.ts` (+ `e2e/freshness-fresh-paths.spec.ts` for the confirmed-fresh half) | `npx playwright test e2e/freshness-*.spec.ts` | **DELIBERATELY RED** for the 9 stale cells (5 router-cache + 4 client-shell); **GREEN** for the 7 confirmed-fresh cells. A fully-green run of the two "stale" files at the end of Phase 25 is a scope violation (CONTEXT.md Specifics) — Phase 26 is what turns them green |
| E2E-07 | Failed runs produce a trace + parseable line-reporter output | config (`trace: 'on-first-retry'`, `reporter: 'line'`) | Deliberately break one assertion (or rely on the freshness spec's real red state) and run `npx playwright test`, then inspect `test-results/*/trace.zip` via `npx playwright show-trace` | Trace file exists and opens; stdout is `line`-reporter formatted (one line per test, parseable by both a human skimming and an agent grepping) |

### Sampling Rate
- **Per task commit:** `npx playwright test e2e/smoke.spec.ts` (fastest meaningful signal; full prod build cost is amortized via `reuseExistingServer` during local iteration)
- **Per wave merge:** `npx playwright test` (full suite — confirms the deliberate red/green split is exactly as expected, not accidentally all-red from a config bug or all-green from a scope violation)
- **Phase gate:** Full suite run once more immediately before `/gsd-verify-work`, with explicit manual confirmation that: (a) `freshness-fresh-paths.spec.ts` is 100% green, (b) `freshness-router-cache.spec.ts` + `freshness-client-shell.spec.ts` are red on exactly the cells 24-DIAGNOSIS.md predicts (9 total), and (c) `smoke.spec.ts` is 100% green.

### What "Done" Looks Like (no production code changes this phase)

Because this phase ships zero production code changes, "done" is entirely about the *harness's own correctness*, not app behavior:
- `playwright.config.ts` + `e2e/` tree exist, are internally consistent, and the negative test (E2E-03's fake `libsql://` URL) actually hard-fails.
- The full 16-cell matrix is represented as real Playwright assertions (not merely re-narrated in a doc) — 9 deliberately red, 7 green, matching 24-DIAGNOSIS.md's Summary Matrix exactly.
- `scripts/diagnose-freshness.mts` is deleted, with its reusable logic (Patterns 1–2 above) verifiably present in `e2e/helpers/`.
- `npm test` (Vitest) and `npx playwright test` are mutually exclusive in file discovery — verified by actually running both, not just by reading config.

### False-Positive Risks (what could look done but isn't)

- **A smoke spec that passes vacuously:** asserting only `expect(response.status()).toBe(200)` or a generic "page loaded" check, rather than D-05's specific per-route data assertions (due-count number, card-count text, mastered-count, streak text). A vacuous smoke spec would stay green through an entire RSC-hydration regression and defeat E2E-04's actual purpose (a first-load performance/content guard rail). **Check:** read the smoke spec's assertions directly — each of the 4 routes must assert a *specific value* traceable to the seed fixture, not a structural/presence-only check.
- **A freshness-regression spec that's green because it never actually exercises the stale path:** e.g. a `back-forward` test that accidentally uses `page.goto()` instead of `page.goBack()` (Ambiguity 2) would always show "Fresh" regardless of the real bug, silently passing a spec that's supposed to be red. **Check:** confirm each stale-cell test uses the native back-navigation/resume-simulation APIs (Pattern 2/3), not a full-document reload.
- **A "done" DB-isolation guard that's never actually been proven to fire:** E2E-03's negative test (deliberately pointing at a fake `libsql://` URL) must actually be run once during this phase's own verification, not just code-reviewed — a guard that looks correct on paper but was never triggered is exactly the failure mode Phase 24's WR-01 finding describes (a deny-list gap that "worked" only because nothing ever exercised the edge it didn't cover).
- **Reporting the freshness-regression spec's red state via `test.fail()`:** as covered in Pattern 3, this Playwright annotation would make a red spec *report as a passing, expected-failure* test — satisfying a naive "is the suite green" check while completely inverting the actual signal ROADMAP Success Criterion 4 requires ("currently red — failing because the staleness bug is still present").

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (indirectly — testing the existing auth, not changing it) | Setup-project storageState reuses the app's real deterministic-HMAC cookie scheme (`lib/auth.ts`); no new auth mechanism introduced |
| V4 Access Control | Yes (indirectly) | `middleware.ts`'s existing allowlist is exercised, not modified, by the harness |
| V5 Input Validation | N/A this phase | No new input-handling code |
| V6 Cryptography | N/A this phase | No new crypto — reuses existing HMAC scheme unchanged |
| V14 Configuration | Yes | Test secrets (`AUTH_SECRET`/`APP_PASSWORD` for the E2E run) must never be the real production values, and `playwright/.auth/user.json` (a real, if test-scoped, session cookie) must never be committed |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Test harness accidentally targeting production Turso, corrupting real FSRS/review history | Tampering | `assertLocalDb()` allow-list guard in `global-setup.ts` (Ambiguity/Pitfall above), run before any DB write |
| Committing `playwright/.auth/user.json` (a real, permanent-until-secret-rotation HMAC cookie) | Information Disclosure | `.gitignore` entry for `playwright/.auth/` (added this phase) |
| Hardcoding real `AUTH_SECRET`/`APP_PASSWORD` in `playwright.config.ts` (a committed file) | Information Disclosure | Load test-only values from a gitignored `.env.test`, with an in-code fallback default that is obviously not a real secret (`'e2e-test-secret'`) |
| Diagnostic/test server binding to all interfaces with a weak fixed password, reachable on the LAN for the run's duration | Elevation of Privilege (LAN-adjacent) | Carried forward from Phase 24's WR-02 finding — bind the `next start` child explicitly to loopback (`-H 127.0.0.1`) in the `webServer.command`, not just the default (which binds `0.0.0.0`) |

**Gitignore additions needed this phase** (not yet present per the repo's current `.gitignore`, which globally ignores `*.db` but not WAL/SHM sidecars or Playwright's own output dirs):
```
playwright/.auth/
playwright-report/
test-results/
e2e-test.db-wal
e2e-test.db-shm
```

## Sources

### Primary (HIGH confidence)
- Direct code inspection this session: `package.json`, `vitest.config.ts`, `lib/auth.ts`, `middleware.ts`, `app/api/login/route.ts`, `prisma/schema.prisma`, `lib/dashboard.ts`, `components/HomeClient.tsx`, `components/StudyClient.tsx`, `components/HabitsClient.tsx`, `.gitignore`
- `scripts/diagnose-freshness.mts` (full read, 1167 lines) — the primary port source
- `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md`, `24-REVIEW.md`, `24-PATTERNS.md` (full reads)
- `npm view @playwright/test version` / `npm view playwright version` — both `1.61.1` `[VERIFIED: npm registry]`
- `gsd-tools query package-legitimacy check --ecosystem npm @playwright/test` — returned `SUS`/`too-new`, manually overridden per the Package Legitimacy Audit note above
- Local filesystem check: `~/Library/Caches/ms-playwright` confirms Chromium 1228 already installed

### Secondary (MEDIUM confidence — carried forward from the 2026-07-10 milestone research, cross-verified against official docs at that time)
- `.planning/research/SUMMARY.md`, `PITFALLS.md`, `ARCHITECTURE.md`, `FEATURES.md` (all read in full this session)
- Playwright official docs (via those research files): Authentication (setup project + storageState), Web server, Parallelism/worker isolation
- Next.js official docs (via those research files): `staleTimes`, `revalidatePath`, Playwright guide

### Tertiary (LOW confidence)
- None newly introduced this session — this pass deliberately did not conduct new web research per the task's efficiency mandate, relying instead on the already-cross-verified prior research plus direct codebase confirmation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single new package, version-verified against the registry, already partially installed
- Architecture: HIGH — grounded directly in a working, empirically-validated prior implementation (`scripts/diagnose-freshness.mts`) plus direct reads of every component this phase's specs will assert against
- Pitfalls: HIGH — every pitfall here has already fired once (in Phase 24's own code review) or is drawn from this project's own prior cross-verified research; nothing is speculative

**Research date:** 2026-07-11
**Valid until:** 30 days (stable domain — Playwright/Next.js version pins are locked for this milestone; re-verify only if `package.json` versions change before planning executes)
