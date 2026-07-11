# Phase 24: Freshness Diagnosis Spike - Research

**Researched:** 2026-07-10
**Domain:** Next.js 16 App Router client-side caching internals + throwaway Playwright instrumentation for a diagnosis-only spike (zero production code changes)
**Confidence:** MEDIUM-HIGH (project-specific facts confirmed by direct codebase inspection = HIGH; Next.js cache-layer mechanics confirmed via official docs fetched live = MEDIUM; RSC network-signature and `visibilitychange`-override technique = LOW/community-pattern, flagged for empirical verification by the executor)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Reproduction is fully scripted, not manual. Install `playwright` as a throwaway/dev tool (not the Phase 25 harness — do not create `playwright.config.ts` or `tests-e2e/` conventions here) and write a one-off script that drives Chromium against `npm run build && npm start`, capturing per-path whether the RSC payload actually refetched (network-level evidence), not just visual inspection.
- **D-02:** The script is throwaway — it exists to produce the diagnosis, not to become Phase 25's suite. It does not need to follow Phase 25's future conventions (dedicated port, `webServer`, storageState setup project, etc.) but MUST still avoid the same production-DB landmine: never point it at the real `libsql://` `DATABASE_URL`. Use a local `file:` SQLite test DB, seeded with minimal fixture data (a card or two, at least one due for review) — reuse `prisma db push` against `file:` (works fine per Pitfall 7's finding; the Turso DDL gotcha doesn't apply to local SQLite).
- **D-03:** Auth: reuse the deterministic HMAC cookie approach documented in `PITFALLS.md` Pitfall 8 (`lib/auth.ts:computeAuthToken()` + inject the `ks_auth` cookie directly) rather than scripting UI login — faster and this is a throwaway script, not a suite that needs to cover the login flow itself.
- **D-04:** Test all four ROADMAP-listed navigation paths, per route (`/`, `/cards`, `/study`, `/habits`): back/forward restore, tab/PWA resume, post-mutation same-route return, plain `<Link>`.
- **D-05:** Post-mutation scenario priority — **primary:** finish a study session (grade cards) → navigate to Home and back to Study select-mode → check due-count/stats refresh. This is the exact scenario from the prior regression incident and must be tested thoroughly.
- **D-06:** **Lower-priority, include if cheap:** sync (or direct-seed a new lesson/card to simulate one) → Home/Cards; card edit/delete → Cards list; review undo → Study. Script these only if the harness makes it cheap to add once the primary scenario's scaffolding exists — do not let them block finishing the primary diagnosis.
- **D-07:** Simulate backgrounding+resume via `page.evaluate()` dispatching `visibilitychange` (document `hidden` → `visible`) — the standard Playwright technique, and it exercises the actual resume-detection code path (which listens for `visibilitychange`), unlike closing/reopening a tab or browser context.
- **D-08:** Written diagnosis = **matrix + scenario blocks**. Lead with a summary table (route × navigation path × stale/fresh × root cause) for at-a-glance scanning, followed by one detailed scenario block per **stale** path: steps to reproduce + expected-vs-actual + evidence.
- **D-09:** Explicitly confirm and list paths that are **already fresh** (e.g. plain `<Link>` under `staleTimes.dynamic = 0`) in the summary table too — Success Criteria #4 requires this so the eventual fix (Phase 26) stays surgical and doesn't touch working paths.
- **D-10:** Root-cause attribution is binary and must be explicit per stale row: "Router Cache reuse" (no RSC re-fetch observed at all) vs. "client-shell state non-resync" (RSC re-fetch happened — network evidence shows it — but the mounted `*Client.tsx` shell's UI didn't reflect it, because of `useState(initialProps)`). Never leave a stale path "ambiguous".

### Claude's Discretion

- Diagnosis file name/location: no strong user preference — `24-DIAGNOSIS.md` in the phase directory is the natural GSD-convention choice.
- Whether the throwaway Playwright script itself gets committed to the repo (e.g., under a `scratch/` or scripts location) vs. run-and-discard is left to the planner/executor — it does not need to survive as a maintained artifact, but keeping it around costs little and could accelerate Phase 25's initial harness setup.

### Deferred Ideas (OUT OF SCOPE)

- Sync → Home/Cards, card edit/delete → Cards list, and review undo → Study mutation scenarios are lower-priority for this phase (D-06) — if the throwaway harness doesn't make them cheap to add, defer their diagnosis to whenever Phase 26 touches those shells.
- Full cross-browser or real-device PWA testing (actually installing the PWA and backgrounding it on a phone) is out of scope — `visibilitychange` dispatch (D-07) is the accepted proxy for this spike.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FRESH-01 | A diagnosis spike identifies, per route (`/`, `/cards`, `/study`, `/habits`), exactly which navigation paths serve stale data on a production build, distinguishing back/forward Router Cache reuse from client-shell state non-resync | This document's Architecture Patterns (script structure + detection technique) and Code Examples sections give the executor the concrete mechanics (RSC network signature, `visibilitychange` override, prod-server orchestration, cookie injection, DB isolation) needed to actually build the instrumented script that produces the diagnosis; Common Pitfalls section covers the specific ways this measurement can silently lie |
</phase_requirements>

## Summary

This phase produces zero production code — its only job is to build a small, disposable Playwright script that proves, with network-level evidence, which of 16 (4 routes × 4 nav paths) combinations serve stale data on `npm run build && npm start`. The two root causes to distinguish are already well understood at the conceptual level (project's own prior research, HIGH confidence): the **client-side Router Cache** (`staleTimes` governs prefetched/static segment reuse but **explicitly does not affect back/forward restoration** — confirmed directly against the live Next.js 16.2.10 docs) and **`useState(initialProps)` client shells that never re-read fresh props** even when a real RSC re-fetch does occur. The gap this research closes is *how* to build the instrumented script: how to identify a real RSC re-fetch on the wire (a `_rsc` query param / `Rsc: 1` header signature — community-confirmed, not verified against this app's actual traffic, so the executor must log real headers from this app once and confirm), how to reliably force a `visibilitychange` event when `document.hidden`/`document.visibilityState` are read-only accessor properties (an `Object.defineProperty` override before dispatch — standard but unverified-in-this-repo technique), how to script `npm run build && npm start` orchestration without pulling in the full `@playwright/test` config (raw `playwright` package + `child_process` + polling), and how to safely seed an isolated `file:` SQLite DB via `prisma db push` for the throwaway run (confirmed working from this repo's own `prisma.config.ts`, which reads `DATABASE_URL` straight from env — no Turso DDL gotcha applies).

A codebase-specific gotcha this research surfaced that CONTEXT.md did not flag: **`StudySession.tsx` already has a `visibilitychange` listener** (lines 287-308) that reads `document.visibilityState === 'hidden'` (not `document.hidden`) to pause/flush the study-time tracker. The diagnosis script's `visibilitychange` simulation must override **both** `document.hidden` and `document.visibilityState` — overriding only one will silently fail to trigger this existing app behavior and could produce a false "nothing happened" reading for the resume scenario. There is also **no `data-testid` convention anywhere in this codebase** — due-count assertions (`{studyCards.length}` in `StudyClient.tsx:252`, `{stats.dueCards}` in `HomeClient.tsx:208`) must be located via text/structural selectors, and this phase's "zero production code changes" rule forbids adding test ids to fix that.

**Primary recommendation:** Write one throwaway `.mts` script (`scripts/diagnose-freshness.mts`, following this repo's existing dynamic-import-after-dotenv convention from `local-resync.mts`) that: (1) seeds an isolated `file:` test DB via `prisma db push` + a minimal Prisma seed, (2) builds and starts the production server as a child process on a non-3000 port with the test DB's env vars, (3) launches raw `playwright` (not `@playwright/test`) chromium, injects the `ks_auth` cookie computed from the same `AUTH_SECRET`, and (4) for each of the 16 route×path cells, records a before/after RSC-request-signature diff plus a before/after DOM-text diff on the due/count element, tagging each cell Fresh / Stale-RouterCache / Stale-ClientShell. Feed the raw log straight into `24-DIAGNOSIS.md`'s matrix + per-stale-path scenario blocks (D-08/D-09/D-10).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| RSC data fetch on navigation | API/Backend (Next.js server, via `getStudyCards()`/`getStats()`) | — | Already `force-dynamic`; server always computes fresh data when actually invoked — the question is whether it's invoked, not whether its output is correct |
| Router Cache reuse decision | Browser / Client | — | Entirely client-side (in-memory segment cache keyed by URL + `staleTimes`); server has no visibility into or control over back/forward restoration |
| Client-shell state adoption of fresh props | Browser / Client | — | `useState(initialProps)` shells (`HomeClient`, `CardsClient`, `StudyClient`, `HabitsClient`) own this; a correct RSC re-fetch can still render stale UI if the shell ignores updated props |
| Diagnosis instrumentation (this phase's actual deliverable) | N/A (tooling, not app tier) | — | The throwaway script is an external observer or the three tiers above — it does not modify any of them |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `playwright` | 1.61.1 (verified via `npm view playwright version`) | Browser automation + network interception for the diagnosis script | Official Microsoft package; the raw library (not `@playwright/test`) is the correct choice here because D-01 explicitly forbids creating `playwright.config.ts`/test-runner conventions in this phase — Phase 25 owns that |
| `@prisma/adapter-libsql` | 7.6.0 (already a prod dependency — no new install) | Programmatic Prisma client construction against the isolated `file:` test DB | Same adapter the app already uses (`lib/prisma.ts`); a `file:` URL needs no `authToken`, unlike Turso |
| `prisma` CLI | 7.6.0 (already a devDependency) | `prisma db push` against the isolated test DB to create schema | This repo's own `prisma.config.ts` reads `DATABASE_URL` from env via `dotenv/config` — pointing it at a `file:` path is a one-line env override, no Turso DDL workaround needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in `child_process` | — (Node 25.8.2 per this repo) | Spawn `npm run build && npm start` as a child process and poll for readiness | No extra dependency needed; standard `spawn`/`execSync` |
| Node built-in `crypto` | — | Not needed directly — `lib/auth.ts:computeAuthToken()` already uses Web Crypto, importable as-is | Reuse, don't reimplement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `playwright` library | `@playwright/test` with a minimal ad-hoc config | Rejected by D-01 explicitly — would blur the line with Phase 25's real harness and risk the throwaway script becoming "the" E2E config by accident |
| `child_process` polling for server readiness | `wait-on` npm package | Not worth a new dependency for a throwaway script; a 10-line poll loop is simpler to reason about and delete later |
| Fresh `file:` test DB per run | Reusing `prisma/dev.db` | Rejected — `dev.db` may hold real local iteration data the developer doesn't want mutated/wiped by a disposable script; use a dedicated path (e.g. `scripts/.tmp/24-diagnosis.db`, already covered by the repo's blanket `*.db` gitignore rule) |

**Installation:**
```bash
npm install -D playwright
npx playwright install chromium
```

**Version verification:** `npm view playwright version` → `1.61.1` (checked live during this research pass, 2026-07-10). `@prisma/adapter-libsql` and the `prisma` CLI are already pinned at `7.6.0` in this repo's `package.json` — no version drift risk since nothing new is installed for the DB side.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `playwright` | npm | Actively released (latest publish 2026-06-23, per `npm view`) | 65.4M/week | `github.com/microsoft/playwright` | `SUS` (heuristic reason: `"too-new"`) | **Approved with override** — the `package-legitimacy` seam flags "too-new" because Playwright ships new versions on a near-weekly cadence (a *release-cadence* artifact, not a legitimacy signal); 65M weekly downloads + an official Microsoft-owned repo is unambiguous. Per protocol this is still tagged `[SUS]` inline and the planner should add a lightweight `checkpoint:human-verify` before `npm install -D playwright` — expect it to be a rubber-stamp given the evidence above, but the gate stays per-protocol. |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `playwright` — see override note above; planner inserts a `checkpoint:human-verify` before the install step regardless.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  scripts/diagnose-freshness.mts  (throwaway, run via `npx tsx …`)        │
└─────────────────────────────────────────────────────────────────────────┘
   │
   │ 1. env setup (BEFORE any lib/ import — dotenv-first, per local-resync.mts)
   │    DATABASE_URL=file:./scripts/.tmp/24-diagnosis.db
   │    AUTH_SECRET=<throwaway value>  APP_PASSWORD=<unused, cookie injected directly>
   ▼
┌─────────────────────┐   npx prisma db push --skip-generate   ┌──────────────────┐
│  Schema setup        │ ──────────────────────────────────────▶│ file: SQLite      │
│  (child_process)      │                                       │ (isolated, .db    │
└─────────────────────┘                                        │ gitignored)        │
   │                                                             └──────────────────┘
   │ 2. dynamic import lib/prisma.js (now sees the test DATABASE_URL)
   ▼
┌─────────────────────┐   seed 2-3 cards + sentences +          │
│  Seed fixture data    │   ≥1 due CardReview + a lesson row      │
│  (Prisma, direct)     │ ────────────────────────────────────────┘
└─────────────────────┘
   │
   │ 3. spawn('npm', ['run', 'build']) → spawn('npm', ['run', 'start', '--', '-p', '3200'])
   │    (same DATABASE_URL/AUTH_SECRET env passed to the child)
   ▼
┌─────────────────────┐  poll http://localhost:3200 until 200/redirect
│  Production server    │ ◀────────────────────────────────────────
│  (child process)       │
└─────────────────────┘
   │
   │ 4. chromium.launch() → browser.newContext() → context.addCookies([{ name:'ks_auth',
   │    value: await computeAuthToken() /* AUTH_SECRET matches the server's */ }])
   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  For each of 4 routes × 4 nav paths (16 cells):                          │
│    a. page.on('request') listener records every request since context   │
│       creation, tagged { pathname, isRscRequest, ts }                    │
│    b. trigger the nav action (Link click / page.goBack() / dispatch      │
│       visibilitychange / grade-then-return)                              │
│    c. diff: any NEW RSC-signature request for this pathname in the       │
│       post-action window?  →  yes/no                                     │
│    d. diff: did the on-screen due/count text element actually change     │
│       to the expected fresh value?  →  yes/no                            │
│    e. classify: (no fetch) → Stale-RouterCache                           │
│                 (fetch, DOM unchanged) → Stale-ClientShell                │
│                 (fetch, DOM changed OR was already correct) → Fresh      │
└─────────────────────────────────────────────────────────────────────────┘
   │
   ▼
  raw per-cell log  →  hand-authored into 24-DIAGNOSIS.md (matrix + scenario blocks)
```

### Recommended Project Structure
```
scripts/
├── diagnose-freshness.mts   # this phase's throwaway script (or delete after use — Claude's Discretion)
└── .tmp/                     # gitignored via existing `*.db` rule; holds the isolated test DB file
.planning/phases/24-freshness-diagnosis-spike/
└── 24-DIAGNOSIS.md           # the actual deliverable — matrix + scenario blocks
```

### Pattern 1: Env-first dynamic import (reuse `local-resync.mts`'s pattern)
**What:** Set `process.env.DATABASE_URL`/`AUTH_SECRET` (or load them via `dotenv.config()` from a throwaway `.env.diagnosis` / inline `process.env.X = '...'`) at the top of the script, *before* any static or dynamic `import` of `lib/prisma.ts` or `lib/auth.ts`. Then use dynamic `await import('../lib/prisma.js')` (note the `.js` specifier even though the source is `.ts` — this repo's `tsx`-based scripts consistently use `.js` extensions on relative imports of TypeScript files; `tsx` resolves them at runtime).
**When to use:** Any time a script needs `lib/` modules that read `process.env` at module-init time (Prisma singleton, auth secret).
**Example:**
```typescript
// Source: this repo's scripts/local-resync.mts (existing pattern), adapted
import { fileURLToPath } from 'url'
import path from 'path'

process.env.DATABASE_URL = 'file:./scripts/.tmp/24-diagnosis.db'
process.env.AUTH_SECRET  = 'diagnosis-throwaway-secret'
process.env.APP_PASSWORD = 'unused' // cookie is injected directly, no login flow

// Dynamic import AFTER env is set — static imports are hoisted in ESM and
// would read process.env before the lines above run.
const { prisma } = await import('../lib/prisma.js')
const { computeAuthToken } = await import('../lib/auth.js')
```

### Pattern 2: Isolated schema setup via `prisma db push`
**What:** Run the Prisma CLI as a child process with `DATABASE_URL` overridden to the isolated `file:` path — this repo's `prisma.config.ts` reads the datasource URL straight from `process.env.DATABASE_URL` via `dotenv/config`, and `db push` (unlike Turso) works fine against `file:` URLs.
**When to use:** Once, before seeding, to create the schema in the fresh test DB file.
**Example:**
```typescript
// Source: this repo's prisma.config.ts (confirms DATABASE_URL is read from env)
// and CLAUDE.md's own Turso-gotcha note ("the schema engine only speaks file:/postgres")
import { execSync } from 'child_process'

execSync('npx prisma db push --skip-generate --accept-data-loss', {
  env: { ...process.env, DATABASE_URL: 'file:./scripts/.tmp/24-diagnosis.db' },
  stdio: 'inherit',
})
```

### Pattern 3: Detecting a real RSC re-fetch on the wire
**What:** Next.js client-side navigations that actually hit the server carry a distinguishing `_rsc=<hash>` query parameter and/or an `Rsc: 1` request header (community-confirmed pattern — **not verified against this app's real traffic in this research pass**; the executor's first script run should log every request's URL + headers for one full navigation cycle and confirm the exact signature before trusting it for all 16 cells). `page.on('request')` fires for every network request in a context; filter and tag.
**When to use:** For every one of the 16 route×path cells — this is the network-level evidence D-01 requires (not just visual inspection).
**Example:**
```typescript
// Source: community-confirmed Next.js RSC signature (see Sources below) — VERIFY against
// this app's real headers before relying on it for the full matrix.
const rscRequests: { pathname: string; url: string; ts: number }[] = []
page.on('request', (req) => {
  const url = new URL(req.url())
  const isRsc = url.searchParams.has('_rsc') || req.headers()['rsc'] === '1'
  if (isRsc) rscRequests.push({ pathname: url.pathname, url: req.url(), ts: Date.now() })
})

// ... trigger nav action ...

const markAfter = Date.now()
const newFetchForThisRoute = rscRequests.some(
  (r) => r.pathname === '/study' && r.ts >= navigationStartTs
)
```
**Gotcha — prefetch pollution:** Next.js prefetches `<Link>` targets when they enter the viewport or on hover, *before* the click. If the RSC request log isn't scoped to "since this specific action started," a prefetch that happened seconds earlier can be mistaken for "no fetch on click" or double-counted. Snapshot the request-log length immediately before each triggered action and only look at entries appended after that snapshot.

### Pattern 4: Simulating tab/PWA resume via `visibilitychange`
**What:** `document.hidden` and `document.visibilityState` are read-only accessor properties in real browsers — a bare `document.dispatchEvent(new Event('visibilitychange'))` does not change what `document.hidden` reports, so any app code branching on it (or reading it, like `StudySession.tsx`'s existing time-tracker) won't see the "hidden" state. The standard community workaround is to `Object.defineProperty` override both properties (they are spec'd as configurable) immediately before dispatching.
**When to use:** For every route's tab/PWA-resume cell (D-07). **Must override both `hidden` and `visibilityState`** — this codebase's `StudySession.tsx` (lines 287-308) already listens for `visibilitychange` and specifically reads `document.visibilityState === 'hidden'`, not `document.hidden`; overriding only one property will silently produce a false negative.
**Example:**
```typescript
// Source: community pattern (Playwright issue #2286 confirms no native visibility-toggle
// API exists) + MDN (Document.hidden / Document.visibilityState) — UNVERIFIED in this exact
// repo; confirm the override actually flips document.visibilityState as read by the app
// before trusting the resume-scenario results.
async function simulateResume(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true })
    Object.defineProperty(document, 'visibilityState', {
      value: h ? 'hidden' : 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

// Simulate backgrounding, wait, then resume:
await simulateResume(page, true)
await page.waitForTimeout(100) // let any hidden-state handlers run
await simulateResume(page, false)
```

### Pattern 5: Orchestrating `npm run build && npm start` from a raw script (no `webServer`)
**What:** Outside `@playwright/test`, there is no built-in equivalent of the `webServer` config option (D-01 forbids using it anyway). Spawn the build, wait for it to exit 0, then spawn `next start` on a dedicated port and poll until it responds before launching the browser.
**When to use:** Once per script run, before any Playwright browser launch.
**Example:**
```typescript
// Source: standard Node child_process + polling pattern (Playwright's own webServer
// option does the same thing internally, just not exposed outside the test runner)
import { execSync, spawn } from 'child_process'

execSync('npm run build', { env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: 'inherit' })

const server = spawn('npm', ['run', 'start', '--', '-p', '3200'], {
  env: { ...process.env, DATABASE_URL: TEST_DB_URL, AUTH_SECRET, APP_PASSWORD },
  stdio: 'inherit',
})

async function waitForServer(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.status < 500) return // 200 or a redirect to /login both prove the server is up
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Server did not become ready in time')
}
await waitForServer('http://localhost:3200/login')
```
**Teardown:** `server.kill()` in a `finally` block; also consider deleting the `.tmp` DB file so re-runs start clean (or make seeding idempotent/upsert-based).

### Pattern 6: Auth cookie injection (no UI login)
**What:** `lib/auth.ts:computeAuthToken()` is a pure `AUTH_SECRET`-derived HMAC with no expiry — call it directly with the same secret the server child process was started with, then inject via `context.addCookies()`.
**Example:**
```typescript
// Source: lib/auth.ts (read directly), applying Pitfall 8's documented pattern
process.env.AUTH_SECRET = 'diagnosis-throwaway-secret' // same value passed to the server child
const { computeAuthToken, AUTH_COOKIE } = await import('../lib/auth.js')
const token = await computeAuthToken()

const context = await browser.newContext()
await context.addCookies([
  { name: AUTH_COOKIE, value: token, url: 'http://localhost:3200' },
])
```

### Anti-Patterns to Avoid
- **Testing against `next dev`:** This repo's own CLAUDE.md already warns "Test RSC first-paint behavior with `npm run build && npm start`, not `next dev`" — dev mode disables/alters the exact Router Cache and prefetch behavior under diagnosis. Every one of the 16 cells must run against the production server.
- **Adding `playwright.config.ts` or a `tests-e2e/` directory:** Explicitly forbidden by D-01 — that convention belongs to Phase 25.
- **Adding `data-testid` attributes to production components to make selectors easier:** This phase makes zero production code changes (Phase Boundary in CONTEXT.md). Use existing text/structural selectors (e.g., `page.getByText(/ready to review$/)`) even though it's less robust than a test id would be.
- **Measuring "did a fetch happen" only in a tight window right after the click:** Misses prefetch-before-click pollution (Pattern 3's gotcha) — always diff against a request-log snapshot taken immediately before the triggering action, not a fixed time window.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Auth token computation | A second HMAC implementation for the script | `lib/auth.ts:computeAuthToken()`, dynamically imported | Single source of truth; the server child process and the script must agree on the exact token bytes or the cookie won't validate |
| Schema setup for the test DB | Hand-written `CREATE TABLE` DDL | `npx prisma db push` against the `file:` URL | This repo's `prisma.config.ts` already wires `DATABASE_URL` from env for exactly this; `db push` is the one-command path for `file:` (the Turso DDL workaround is irrelevant here) |
| Waiting for the prod server to be ready | Fixed `setTimeout` sleep | Poll `fetch()` against a known route until non-5xx | A fixed sleep either wastes time or races a slow first build; polling is deterministic |

**Key insight:** Every piece of this script's plumbing (auth, DB access, env loading order) already has an established, working pattern somewhere in this repo (`lib/auth.ts`, `prisma.config.ts`, `scripts/local-resync.mts`). The only genuinely new territory is the Playwright-side instrumentation (RSC request signature, `visibilitychange` override, no-webServer orchestration) — everything else should be reused, not reinvented.

## Common Pitfalls

### Pitfall 1: Trusting the `_rsc`/`Rsc: 1` signature without confirming it against this app's real traffic
**What goes wrong:** The community-confirmed RSC request signature (`_rsc` query param, `Rsc: 1` header) was not verified against a live run of this specific app in this research pass. If Next.js 16.2.10 uses a different or additional signal (e.g., a `Next-Router-State-Tree` header that this search did not confirm either way), a script that filters strictly on the wrong signature will silently misclassify every cell as "Stale-RouterCache" (false negative — looks like no fetch happened when one did).
**Why it happens:** RSC wire-protocol details are undocumented/internal and can shift between minor versions; official docs don't publish the exact header/query-param contract.
**How to avoid:** Before writing the classification logic, run one full navigation cycle with `page.on('request')` logging **every** request's full URL and headers (no filter) to the console, visually confirm which request is the RSC payload fetch (it will be a request to the same pathname returning a non-HTML content type, fired at click/back time), and lock the filter to whatever is actually observed.
**Warning signs:** Every single cell classifies as "Stale-RouterCache" including ones expected to be fresh (e.g., plain `<Link>` nav, which `staleTimes.dynamic=0` should make always-fresh per the official docs) — that pattern means the filter itself is broken, not that the app is broken.

### Pitfall 2: `visibilitychange` override missing `document.visibilityState`
**What goes wrong:** `StudySession.tsx` reads `document.visibilityState === 'hidden'`, not `document.hidden`. An override that only sets `document.hidden` will not trigger this existing listener, and any future resume-detection code (Phase 26's planned `FreshnessWatcher`) is equally likely to read `visibilityState` since that's the more standard Page Visibility API property. Overriding only one produces a false "the resume path does nothing" reading.
**Why it happens:** `document.hidden` is the more commonly Googled/quoted property in Playwright workaround snippets; `visibilityState` is easy to forget.
**How to avoid:** Always override both properties together (Pattern 4's example does this).
**Warning signs:** The resume scenario's evidence log shows the `visibilitychange` event fired but zero observable app-level side effect anywhere, including places known to have a listener.

### Pitfall 3: Build-time vs. run-time env mismatch
**What goes wrong:** `npm run build` runs `prisma generate && next build`. If the test `DATABASE_URL` isn't set during `npm start` (only during `build`), the server process falls back to `lib/prisma.ts`'s default (`file:./prisma/dev.db`) — silently reading/writing the developer's real local dev DB instead of the isolated fixture DB, producing misleading "fresh" or "stale" results that have nothing to do with the seeded scenario.
**Why it happens:** `child_process.spawn` calls for `build` and `start` are two separate invocations; forgetting to pass `env` to *both* is an easy copy-paste gap.
**How to avoid:** Explicitly pass the same `env: { ...process.env, DATABASE_URL: TEST_DB_URL, AUTH_SECRET, APP_PASSWORD }` object to both the build and start child-process calls (Pattern 5). Since all 4 main pages are `force-dynamic`, `next build` doesn't need to actually query the DB at build time (no data is fetched during prerendering for dynamic routes), so this is lower-risk for `build` than for `start`, but pass it to both for consistency and to avoid relying on that nuance.
**Warning signs:** The script's seeded due-count doesn't match what the app shows even on first load (before any navigation-path test runs) — that's a sign the server is talking to the wrong DB.

### Pitfall 4: Misreading "no code change" as "no build output check"
**What goes wrong:** Skipping the build-output rendering-mode check (`○` static vs `ƒ` dynamic) that `PITFALLS.md` Pitfall 1 calls the mandatory first diagnosis step, and jumping straight to browser scripting. If a route unexpectedly shows `○` (statically prerendered) rather than the expected `ƒ` (dynamic, per the `force-dynamic` export already confirmed present on all 4 pages), everything downstream is diagnosing the wrong failure mode.
**How to avoid:** Capture and grep the `npm run build` output for the 4 route paths before writing a single line of Playwright code; assert all 4 show `ƒ`. This is a near-zero-cost sanity check that the CONTEXT.md's pre-verified assumption ("every main page already declares `dynamic = 'force-dynamic'`") still holds at build time.

### Pitfall 5: Selector fragility from the missing `data-testid` convention
**What goes wrong:** Locating the due-count element via loose text matching (`page.getByText(/ready/)`) can accidentally match multiple elements (e.g., both the Home hero count and a nav badge, if one exists) or break silently if copy changes mid-phase.
**How to avoid:** Scope selectors as tightly as the existing DOM structure allows (e.g., combine with a parent container role/class already in the component, verified by reading the actual JSX before writing the selector — `HomeClient.tsx:208`/`StudyClient.tsx:252` are the two concrete anchor points confirmed by this research). Print the matched element's full text in the script's evidence log so a human reviewing `24-DIAGNOSIS.md` can sanity-check the assertion wasn't vacuous.

## Code Examples

### Minimal seed for the isolated test DB
```typescript
// Not sourced from an existing script (no seed script currently exists in this repo) —
// pattern follows the existing Card/Sentence/CardReview shape from prisma/schema.prisma
const lesson = await prisma.lesson.create({
  data: { title: 'Diagnosis fixture', rawContent: '', contentHash: 'diagnosis-fixture', orderIndex: 1 },
})
const card = await prisma.card.create({
  data: {
    type: 'vocabulary', front: '안녕', back: 'hello', normalizedFront: '안녕',
    lessonId: lesson.id,
    sentences: { create: [{ korean: '안녕하세요', targetForm: '안녕', translation: 'Hello', orderIndex: 0 }] },
  },
})
await prisma.cardReview.create({
  data: { cardId: card.id, state: 1, stability: 1, difficulty: 5, nextReview: new Date(Date.now() - 60_000) }, // due 1 min ago
})
```
*(Field names should be re-verified against the full `prisma/schema.prisma` `CardReview` model by the plan/executor — this research pass confirmed the `Card`/`Lesson`/`Sentence` shape from the schema head but did not read the full `CardReview` field list.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| `staleTimes.dynamic` default 30s | Default 0s | Next.js v15.0.0 | Every dynamic-route `<Link>` navigation in this app is already expected to be fresh by default — narrows the diagnosis's "surprising stale" candidates to back/forward + resume + client-shell issues, not plain tab taps |

**Deprecated/outdated:** None specific to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Next.js 16 RSC navigation requests carry a `_rsc` query param and/or `Rsc: 1` header as the detection signature | Architecture Patterns → Pattern 3 | If the actual signature differs, the script's classification logic silently misattributes every cell — mitigated by requiring an unfiltered request-log confirmation pass before trusting the filter (Pitfall 1) |
| A2 | `Object.defineProperty` override of `document.hidden`/`document.visibilityState` reliably fools app code reading those properties, including inside a Chromium page driven by Playwright | Architecture Patterns → Pattern 4 | If Chromium's implementation makes these non-configurable in some context, the override throws or silently no-ops and the resume scenario can't be tested this way — low risk (both are spec'd as configurable accessor properties) but unverified against this exact Playwright+Chromium combination |
| A3 | No `Next-Router-State-Tree` or other additional required header is needed to distinguish RSC fetches from ordinary navigations in this app's traffic | Architecture Patterns → Pattern 3 | Search did not positively confirm or rule this out; same mitigation as A1 |

**If this table is empty:** N/A — see rows above; all three are already flagged with the required mitigation (empirical confirmation via an unfiltered first-run request log) built into the recommended script structure.

## Open Questions

1. **Exact RSC request signature on Next.js 16.2.10 in this specific app**
   - What we know: Community sources describe `_rsc` query param + `Rsc: 1` header as the historical/current pattern; official Next.js docs did not surface a page documenting this wire contract directly in this research pass.
   - What's unclear: Whether anything changed for Next.js 16 specifically, and whether this app's actual middleware/auth layer alters headers in a way that obscures the signal.
   - Recommendation: The script's first action on first run should log every request's full URL + all headers for one navigation, unfiltered — this is a 5-minute check that resolves the open question empirically and should happen before any of the 16 cells are scripted for real.

2. **Exact `CardReview` field names/defaults for a valid due-card seed row**
   - What we know: `state`, `stability`, `difficulty`, `nextReview` are the fields referenced elsewhere in this app's docs (`components/StudySession.tsx`, `lib/fsrs.ts`).
   - What's unclear: The full required-field list and defaults straight from `prisma/schema.prisma`'s `CardReview` model (this research pass read the schema head but not the full model).
   - Recommendation: The planner/executor should read `prisma/schema.prisma`'s full `CardReview` block (and ideally `lib/fsrs.ts`'s `reviewCard()` return shape) before writing the seed script, rather than trusting the illustrative example above verbatim.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| `playwright` (npm package) | Browser automation for the diagnosis script | ✗ (not yet installed) | 1.61.1 latest on npm | Install via `npm install -D playwright` + `npx playwright install chromium` — no viable fallback, this is the phase's core tool |
| `prisma` CLI | Test DB schema setup | ✓ | 7.6.0 (already a devDependency) | — |
| `@prisma/adapter-libsql` | Programmatic Prisma client against `file:` test DB | ✓ | 7.6.0 (already a dependency) | — |
| Node.js | Running the `.mts` script via `tsx` | ✓ | 25.8.2 (per this repo's dev environment) | — |
| `npx tsx` | Executing `.mts` scripts (existing repo convention) | ✓ (used by `local-resync.mts` already) | — | — |

**Missing dependencies with no fallback:**
- `playwright` npm package — must be installed as a devDependency for this phase to be executable at all (flagged `[SUS]`/override in the Package Legitimacy Audit above; planner should gate the install behind a `checkpoint:human-verify`).

**Missing dependencies with fallback:**
- None — everything else needed is already present in this repo.

## Validation Architecture

> This phase produces no production code and no persistent automated test suite (Phase 25 owns that). The "validation" for FRESH-01 is the diagnosis script's own execution and the resulting written artifact, not a checked-in Vitest/Playwright test.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None persisted for this phase — Vitest (`^4.1.9`) is the project's existing unit-test framework but does not exercise browser/RSC-cache behavior; the throwaway Playwright script is the diagnostic instrument itself, not a framework-integrated test |
| Config file | none — explicitly forbidden by D-01 |
| Quick run command | `npx tsx scripts/diagnose-freshness.mts` (once written) |
| Full suite command | Same — this is a one-shot diagnostic run, not a repeatable suite |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| FRESH-01 | Diagnosis names every stale/fresh path per route with root-cause attribution | scripted browser experiment (not a pass/fail test — an evidence-gathering run) | `npx tsx scripts/diagnose-freshness.mts` | ❌ Wave 0 — script does not exist yet, must be written this phase |

### Sampling Rate
- **Per task commit:** N/A — no incremental test suite; the script is written once and run to produce the final artifact.
- **Per wave merge:** N/A.
- **Phase gate:** The phase is complete when `24-DIAGNOSIS.md` exists and covers all 16 route×path cells per D-08/D-09/D-10 — verified by a human/reviewer reading the document against the success criteria, not by a green/red automated gate.

### Wave 0 Gaps
- [ ] `scripts/diagnose-freshness.mts` — does not exist; this phase's core task.
- [ ] Isolated test DB seed data (2-3 cards, ≥1 due `CardReview`, 1 lesson) — no existing seed script to reuse (`scripts/` has no generic seeder; closest analog is `local-resync.mts`, which seeds via real Claude extraction, not usable here).
- [ ] `playwright` devDependency install — see Package Legitimacy Audit.

## Security Domain

> `security_enforcement: true` in `.planning/config.json` (ASVS Level 1). This phase's security surface is narrow — a local, throwaway diagnostic script, never deployed, never touching production data — but the DB-isolation and secret-handling rules from the project's own Pitfalls research still apply in full.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|-----------------|---------|--------------------|
| V2 Authentication | Yes (narrow) | The script computes and injects a deterministic HMAC cookie via `lib/auth.ts:computeAuthToken()` using a **throwaway `AUTH_SECRET`** set only in the script's own process env — never the real repo `.env`'s `AUTH_SECRET`/`APP_PASSWORD`. No new auth mechanism is introduced; this is reuse of the existing, already-reviewed stateless HMAC scheme. |
| V3 Session Management | No | Out of scope — no new session concept introduced. |
| V4 Access Control | No | Single-tenant app, unchanged. |
| V5 Input Validation | No | The script only reads app-controlled seeded data; no new user-facing input surface. |
| V6 Cryptography | No | Reuses `lib/auth.ts`'s existing Web Crypto HMAC call verbatim — no new crypto code. |

### Known Threat Patterns for this phase's script

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Script accidentally targets the real Turso `DATABASE_URL` (e.g. via env-loading order bug or a forgotten override on one of the two child-process spawns) | Tampering | Hard-fail guard at script start: read the resolved `DATABASE_URL` and `process.exit(1)` if it starts with `libsql://` — this repo's own Pitfall 7/CLAUDE.md gotcha already documents this exact failure mode for a near-identical script (`local-resync.mts` targets Turso *intentionally*; this diagnosis script must never do so) |
| Real `AUTH_SECRET`/`APP_PASSWORD` leaking into the throwaway script's logs or being reused from `.env` | Information Disclosure | Set fresh throwaway values in the script's own `process.env` assignment, never read them from the real `.env`/`.env.local` files |
| Seeded test DB file (`scripts/.tmp/24-diagnosis.db`) accidentally committed | Information Disclosure (low severity — synthetic data only, but still hygiene) | Already covered by this repo's existing blanket `*.db` gitignore rule — no new gitignore entry needed, but confirm the chosen path matches the `*.db` glob |

## Sources

### Primary (HIGH confidence — direct codebase read)
- `lib/auth.ts` — HMAC cookie computation, exact contract for cookie injection
- `lib/prisma.ts` — confirms `file:` fallback and adapter construction shape
- `prisma.config.ts` — confirms `DATABASE_URL` is read from env via `dotenv/config` for CLI commands like `db push`
- `prisma/schema.prisma` (head) — datasource provider, Card/Lesson/Sentence field shapes
- `scripts/local-resync.mts` — the dynamic-import-after-dotenv pattern this phase's script should follow
- `middleware.ts` — confirms auth cookie name (`ks_auth`) and matcher scope
- `components/StudySession.tsx` (lines 287-308) — confirms an existing `visibilitychange` listener reads `document.visibilityState`, not `document.hidden`
- `components/HomeClient.tsx` (line 208), `components/StudyClient.tsx` (line 252) — confirms due-count DOM anchors and absence of `data-testid`
- `.gitignore` — confirms `*.db` is already globally ignored (no new entry needed for the test DB file)
- `package.json` — confirms `playwright` is not yet a dependency; confirms `.mts`/`tsx` script convention

### Secondary (MEDIUM confidence — official docs fetched live)
- [Next.js docs — staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes) (fetched live, v16.2.10, last updated 2026-03-03) — confirms `dynamic` defaults to 0s (since v15.0.0), `static` defaults to 300s, and explicitly states staleTimes "doesn't change back/forward caching behavior"
- [Next.js docs — Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating) (fetched live, v16.2.10, last updated 2026-06-23) — confirms prefetch-on-viewport-entry behavior relevant to Pattern 3's prefetch-pollution gotcha
- `.planning/research/PITFALLS.md` (this project's own v1.6 research, Pitfalls 1/2/7/8/9) — HIGH confidence within this project, treated as secondary here only because it's this phase's own upstream research rather than freshly verified in this pass
- `.planning/research/ARCHITECTURE.md` (line ~280) — the "Suggested Build Order" section sketching example failing-spec scenarios, directly informed the script structure above

### Tertiary (LOW confidence — community sources, flagged for empirical verification)
- Next.js Discord forum thread on `_rsc` query param / `Rsc: 1` header (community-reported, not an official doc page) — see Open Question #1 and Assumption A1
- Playwright GitHub issue #2286 ("Toggle page visibility") — confirms no native API exists, motivating the `Object.defineProperty` workaround, but does not provide a canonical verified code sample — see Assumption A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `playwright` version verified live via `npm view`; Prisma/adapter versions already pinned in this repo, no drift risk
- Architecture (script structure): MEDIUM — orchestration patterns (child_process, cookie injection, env-first import) are all directly grounded in existing repo code; the RSC-detection and visibilitychange-override techniques are community patterns pending this app's own empirical confirmation
- Pitfalls: HIGH — five of five pitfalls above are either directly grounded in a specific line of this repo's code (StudySession's `visibilitychange` listener, missing `data-testid`, `prisma.config.ts`'s env-read behavior) or a direct extension of this project's own already-HIGH-confidence Pitfalls research

**Research date:** 2026-07-10
**Valid until:** 14 days (fast-moving: Next.js 16.x is receiving frequent point releases and this phase depends on undocumented wire-protocol details that could shift; re-verify the RSC request signature empirically regardless of this document's age, per Open Question #1)
