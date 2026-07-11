# Stack Research

**Domain:** RSC client-navigation freshness + Playwright E2E infrastructure (Next.js 16 App Router, single-tenant hobby app on Vercel Hobby) — v1.6 Freshness, Performance & E2E Testing
**Researched:** 2026-07-10
**Confidence:** HIGH for versions (verified directly against the npm registry and the installed `package.json`); MEDIUM for Next.js cache-behavior claims (all from official nextjs.org docs versioned 16.2.10, mutually cross-consistent, but the research seam classifies web-fetched sources LOW — verify the back/forward diagnosis empirically in Phase 1)

## Executive Answer

**(a) Freshness: zero new dependencies.** Every mechanism needed is already inside the installed `next@16.2.1`. The staleness the milestone targets is a *client-side Router Cache* behavior, not a server one — all four pages (`/`, `/study`, `/cards`, `/habits`) already declare `export const dynamic = 'force-dynamic'`, so the server always renders fresh. The Next.js 16 glossary states the diagnosis directly: *"Pages are not cached by default but are reused during browser back/forward navigation."* Since Next 15, `staleTimes.dynamic` defaults to **0 seconds** — a normal bottom-nav `<Link>` push navigation re-fetches the page segment — but back/forward navigation (browser back button, iOS swipe-back gesture) restores the cached RSC payload unconditionally, and `staleTimes` is explicitly documented as *not* changing that. The fix is the built-in invalidation APIs: `router.refresh()` (same-route) and `revalidatePath` called **from a Server Action** (cross-route, purges the Client Cache including back/forward entries). No `staleTimes` tweak, no Cache Components migration, no client data library.

**(b) E2E: two new dev dependencies.** `@playwright/test` (^1.61.1, latest as of 2026-07-10) as the test runner, plus a downloaded Chromium browser binary. Playwright's `webServer` config boots `next dev` (or `next build && next start`) automatically and — critically for this repo — its `env` option can override `DATABASE_URL` to a local `file:` SQLite DB so E2E runs never touch the production Turso deck. For AI-agent driving, Microsoft's official `@playwright/mcp` (0.0.78) gives Claude Code interactive accessibility-tree browser control against the running dev server; the `npx playwright test` CLI (runnable from Claude Code's Bash tool with `--reporter=list`) covers repeatable regression suites. Both integrate with the existing Vitest setup via a one-line `exclude` addition.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `next` | 16.2.1 installed (16.2.10 latest patch) | Freshness APIs: `router.refresh()`, `revalidatePath`, Server Actions | Already installed — all three invalidation mechanisms ship in it. Behavior claims in this doc were verified against docs versioned 16.2.10; the optional patch bump is hygiene, not a prerequisite. |
| `@playwright/test` | ^1.61.1 | E2E test runner + browser automation | The framework Next.js officially documents for E2E (`nextjs.org/docs/app/guides/testing/playwright`). Auto-manages the dev server via `webServer`, ships trace/screenshot debugging, and is the same engine the agent-facing MCP server uses — one browser stack for both humans-in-CI and agents. |
| `@playwright/mcp` | 0.0.78 (run via `npx @playwright/mcp@latest`, not a package.json dep) | MCP server letting Claude Code drive a real browser | Microsoft-official. Operates on the accessibility tree (structured snapshots via `browser_snapshot`), not screenshots — token-cheap and deterministic for an agent. ~34 tools: navigate, click, type, snapshot, screenshot. Registered once via `claude mcp add playwright npx @playwright/mcp@latest`. |

### The Freshness Mechanism Matrix (all built into next@16)

This is the core finding — which API fixes which staleness path:

| Mechanism | Called from | Effect on client Router Cache | Use for |
|-----------|-------------|-------------------------------|---------|
| `router.refresh()` (`next/navigation`) | Client component | Clears **current route only**; re-fetches RSC payload, merges without losing `useState`/scroll | Same-route refresh: Home after pull-to-refresh sync completes; Study completion screen's due count |
| `revalidatePath(path)` / `revalidatePath('/', 'layout')` in a **Server Action** | `'use server'` function invoked from client | **Purges the Client Cache** — docs: "causes all previously visited pages to refresh when navigated to again" (documented as current, temporarily-broad behavior). `('/', 'layout')` purges everything | Cross-route staleness: the back/forward-restored `/` or `/cards` after grading/sync/CRUD. This is the only documented API that invalidates *other routes'* back/forward entries |
| `revalidatePath` in a **Route Handler** | `app/api/*/route.ts` | **Does NOT purge the client cache** — only marks the path for server-side revalidation on next visit (a no-op for already-force-dynamic pages) | Nothing here. Adding it to the existing `POST /api/review`/`/api/sync` would *not* fix the bug — this is why the fix needs a small Server Action, not a route-handler edit |
| `experimental.staleTimes` | `next.config.ts` | `dynamic` already defaults to 0s (since v15); explicitly "doesn't change back/forward caching behavior" | Nothing — it cannot address the observed staleness and is experimental |
| Cache Components (`cacheComponents: true`, `use cache`, `cacheTag`, `updateTag`, `cacheLife`) | App-wide config + directives | `updateTag` expires tagged cached data; `cacheLife.stale` is the per-route successor to `staleTimes` | Not this milestone — it's a system for *adding* caching to static-ish content. These pages are fully dynamic; adopting it is an app-wide migration (`force-dynamic` removed, Suspense-boundary restructuring) that solves a problem this app doesn't have. PROJECT.md already deferred cross-request caching twice for staleness-risk reasons |

### Recommended fix shape (integration with the existing RSC/DTO pattern)

1. **One Server Action file** (e.g. `app/actions.ts`): `'use server'; export async function refreshAppData() { revalidatePath('/', 'layout') }`. Invoked fire-and-forget from the client at mutation **commit points** — study-session end (not per grade), sync completion, card create/edit/delete. This purges every route's Client Cache entry, so the next navigation — push *or* back/forward — re-runs the force-dynamic RSC and arrives fresh, preserving the v1.2 instant-first-paint on cold loads (that path is untouched: server render still carries the data).
2. **`router.refresh()`** where the *current* route must update in place (Home after pull-to-refresh sync).
3. **Do not call `revalidatePath` per grade.** From a Server Action it immediately refreshes the route you're viewing — mid-session that means a `getStudyCards()` DB round-trip per grade and a Vercel function invocation per grade, for data the session deliberately ignores. Once at session end is correct and cheap (one extra invocation, well inside the Hobby 60s limit since it's just a page re-render).
4. **Client-shell caveat (design constraint, not a dependency):** the `*Client.tsx` shells copy props into state (`useState(initialCards)`), which initializes **only on mount**. A `router.refresh()` on the *same* route delivers new props to an already-mounted shell that ignores them. Cross-route navigation remounts the page's client shell, so the Server-Action purge path is unaffected — but any same-route `router.refresh()` fix must also make the shell consume updated props (e.g. derive display from props, sync via effect, or `key` the shell). Budget for this in the phase plan.
5. **Empirically confirm the diagnosis first** (MEDIUM confidence): reproduce with `npm run build && npm start` (per the repo's own gotcha, `next dev` does not exercise Router Cache/first-paint behavior like production). Verify whether plain bottom-nav push navigation is also stale (would implicate the shells' `useState`-on-mount, not the router cache) versus only back/forward (pure router-cache reuse).

### Supporting Libraries (E2E)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | ^1.61.1 (devDep) | Runner, assertions, fixtures, `webServer` lifecycle, trace viewer | All persisted E2E specs in `e2e/` |
| Chromium (Playwright-managed binary) | pinned to Playwright version | The single browser to test against | `npx playwright install chromium` — skip Firefox/WebKit; single-tenant personal app used from one browser family, and one browser keeps CI-less local runs fast |
| `@playwright/mcp` | 0.0.78, via `npx` | Agent-interactive browser (exploratory QA, bug repro, UAT assist) | Not in `package.json` — registered in Claude Code once. Use MCP for exploration; use `npx playwright test` for repeatable suites |

### Development Tools / Config

| Tool | Purpose | Notes |
|------|---------|-------|
| `playwright.config.ts` | Runner config | `testDir: './e2e'`, `use: { baseURL: 'http://localhost:3000' }`, `webServer` (below). Keep specs out of `tests/` (Vitest's turf) |
| `webServer` block | Boots the app for tests | `{ command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, timeout: 120_000, env: { DATABASE_URL: 'file:./e2e.db', DATABASE_AUTH_TOKEN: '' } }` — `env` inherits `process.env` and adds `PLAYWRIGHT_TEST=1`; explicit `DATABASE_URL` here wins over `.env` (Next.js never overrides pre-set process env), which is the isolation guarantee against the production Turso deck |
| E2E database seed | Isolated SQLite DB | `DATABASE_URL=file:./e2e.db npx prisma db push` works fine — the Turso `prisma db push` limitation applies only to `libsql://` URLs, not `file:`. Add a small seed script (or Playwright `globalSetup`) for deterministic cards/reviews |
| Auth `globalSetup` / setup project | One login, reused everywhere | Shared-password gate: a setup test POSTs `/api/login` (password from `APP_PASSWORD`) or drives the login form once, saves `storageState` to `e2e/.auth/user.json`; all projects declare `use: { storageState }`. Standard Playwright pattern — no auth changes needed |
| `vitest.config.ts` edit | Keep runners apart | Vitest's default include (`**/*.{test,spec}.ts`) would swallow `e2e/*.spec.ts` and crash on `@playwright/test` imports. Add `exclude: [...configDefaults.exclude, 'e2e/**']` |
| npm scripts | Ergonomics | `"test:e2e": "playwright test"`, `"test:e2e:ui": "playwright test --ui"`. Leave `"test": "vitest run"` untouched |

### How an AI agent drives it (two complementary paths)

1. **Claude Code → Bash → `npx playwright test --reporter=list`** — repeatable regression suites; `list`/`line` reporters are agent-parseable, failures carry file:line; `trace: 'on-first-retry'` + `npx playwright show-trace` for post-mortems. The `webServer.reuseExistingServer: true` (non-CI) means the agent can keep one `npm run dev` running in the background and iterate test↔fix quickly without server restarts.
2. **Claude Code → Playwright MCP (`claude mcp add playwright npx @playwright/mcp@latest`)** — interactive: `browser_navigate` to `localhost:3000`, `browser_snapshot` (accessibility tree, not pixels), `browser_click`/`browser_type`, `browser_take_screenshot` for visual checks. Best for exploratory UAT (e.g. reproducing the staleness bug live, verifying the fix), then codifying what worked into an `e2e/` spec. Note: the MCP session drives whatever server is already running — for cache-behavior verification, run it against `npm run build && npm start`, not `next dev`.

### Dev server vs production build for E2E

The official Next.js guide recommends testing against `next build && next start` for realism, while explicitly blessing `webServer` + dev server. For **this milestone specifically**, the staleness/Router Cache specs MUST run against a production build (repo gotcha: `loading.tsx`/RSC-cache behavior differs in dev). Practical split: default `webServer.command: 'npm run build && npm run start'` for the persisted suite (slow but correct), `reuseExistingServer` so a manually-started server (dev for flow tests, prod-build for cache tests) is picked up during iteration.

### Performance regression tests

No new dependency needed: Playwright's built-in `test.step` timing, `page.evaluate(() => performance.getEntriesByType('navigation'))`, and trace files cover "did first-paint/query timing regress" assertions. Do **not** add Lighthouse CI / `@playwright/test`-external perf harnesses for a single-tenant app — coarse thresholds in plain Playwright specs are proportionate.

## Installation

```bash
# E2E (the only installs this milestone needs)
npm install -D @playwright/test
npx playwright install chromium

# One-time: register the MCP server for Claude Code (not a package.json dep)
claude mcp add playwright npx @playwright/mcp@latest

# One-time: create the isolated E2E database schema
DATABASE_URL=file:./e2e.db npx prisma db push

# Optional hygiene (not required by any finding)
npm install next@16.2.10
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Server Action + `revalidatePath('/', 'layout')` at commit points | Pathname-watcher client component calling `router.refresh()` on arrival at each route | If the Server Action's documented "refreshes all previously visited pages" behavior proves too broad/changed in a future Next release — the watcher works purely client-side but shows a stale→fresh flash on arrival (it can't refresh a route before you land on it) |
| Keep mutations as existing API routes + one tiny Server Action | Migrate `POST /api/review`/`/api/sync`/cards CRUD fully to Server Actions | Only if a later milestone wants progressive-enhancement forms. Today the routes are shared with cron (`runSync`) and carry bespoke retry logic (`postReviewWithRetry`) — full migration is churn without freshness gain beyond the one-action approach |
| `@playwright/test` | Cypress | No case here: Playwright is what Next.js documents first-class, has native `webServer`, better parallelism, and is the only option with an official agent-facing MCP server |
| Playwright `webServer` boots the app | Manually starting servers in docs/scripts | Fine during agent iteration (that's what `reuseExistingServer` is for), but persisted suites must be one-command runnable |
| Cache Components adoption | — | Revisit only if the app ever wants *cached* segments (e.g. an expensive stats aggregation) — then `use cache` + `cacheTag` + `updateTag` is the sanctioned path, and `cacheLife.stale` replaces `staleTimes` per-route |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| SWR / TanStack Query / Zustand (client data layer) | Solves cross-route freshness by *duplicating* the data layer client-side — directly undoes the v1.2 RSC/DTO architecture and re-introduces loading flashes | `revalidatePath` (Server Action) + `router.refresh()` |
| `experimental.staleTimes` tweaks | `dynamic` is already 0s by default; the option is experimental ("not recommended for production") and explicitly does not affect back/forward caching — it cannot fix the observed bug | Nothing — leave `next.config.ts` alone |
| `revalidatePath` inside the existing Route Handlers | Documented to only mark server-side revalidation for the next visit; does not purge the client Router Cache — would look like a fix and change nothing | A `'use server'` action invoked from the client |
| Cache Components migration (`cacheComponents: true`) this milestone | App-wide semantic change (dynamic-by-default, `force-dynamic` removed, Suspense restructuring) to enable caching the app deliberately doesn't want; PROJECT.md has deferred cross-request caching twice | Keep `force-dynamic` pages; revisit per the alternatives table |
| Cypress, Selenium | Heavier, no first-class Next.js docs path, no official MCP story | `@playwright/test` |
| E2E cloud services (Checkly, BrowserStack, Playwright service grids) | Single-tenant hobby app with no CI budget requirement; local Chromium is sufficient and free | Local `npx playwright test` |
| Running E2E against `.env`'s Turso `DATABASE_URL` | Tests would grade cards / create cards / trigger syncs against the production deck | `webServer.env.DATABASE_URL: 'file:./e2e.db'` + `prisma db push` seed |
| All three browser engines (`chromium`+`firefox`+`webkit`) | 3× runtime and flake surface for a personal app | Chromium only |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@playwright/test@1.61.1` | Node 25.8 (dev machine) | Playwright requires Node ≥20 — fine. Browser binaries are version-locked to the npm package; re-run `npx playwright install chromium` after Playwright upgrades |
| `@playwright/test@1.61.1` | `vitest@^4.1.9` | No runtime conflict; the only hazard is test-file discovery overlap — fixed by the `e2e/**` exclude and never cross-importing the two runners' APIs |
| `next@16.2.1` | `revalidatePath`/`router.refresh` behaviors cited | Docs verified at 16.2.10; no changelog entry between 16.2.1→16.2.10 alters these APIs, but the "all previously visited pages refresh" breadth is explicitly documented as *temporary* behavior — pin the expectation in an E2E spec so a future Next upgrade that narrows it fails loudly |
| `@playwright/mcp@0.0.78` | Claude Code MCP client | Pre-1.0, moves fast — invoke via `@latest` rather than pinning |
| `prisma@7.6.0` `db push` | `file:` SQLite URLs | Works (the P1013 limitation is `libsql://`-only) — this is what makes the isolated E2E DB cheap |

## Sources

- https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes (docs v16.2.10) — dynamic default 0s since v15, back/forward exemption [official docs via webfetch; seam tier LOW, corroborated across three official pages]
- https://nextjs.org/docs/app/glossary (docs v16.2.10) — Client Cache definition, "pages reused during back/forward navigation", invalidation API list [same tier]
- https://nextjs.org/docs/app/api-reference/functions/use-router — `router.refresh()` semantics (current-route-only, state-preserving) [same tier]
- https://nextjs.org/docs/app/api-reference/functions/revalidatePath — Server Function vs Route Handler behavior split; `('/', 'layout')` full-cache purge [same tier]
- `vercel:next-cache-components` curated skill (plugin 0.44.0) — Cache Components enablement/migration and `updateTag` vs `revalidateTag` [curated; MEDIUM]
- https://nextjs.org/docs/app/guides/testing/playwright + https://playwright.dev/docs/test-webserver — official setup, `webServer` options incl. `env` [official docs via webfetch; LOW tier per seam]
- npm registry via `npm view` — `@playwright/test@1.61.1`, `@playwright/mcp@0.0.78`, `next@16.2.10` latest [direct registry query; HIGH]
- [Playwright MCP getting started](https://playwright.dev/docs/getting-started-mcp), [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp), [Builder.io Playwright MCP + Claude Code guide](https://www.builder.io/blog/playwright-mcp-server-claude-code) — agent-driving workflow [websearch; LOW]
- [Vitest projects/exclude guidance](https://vitest.dev/guide/projects), [vitest#3102](https://github.com/vitest-dev/vitest/issues/3102) — e2e-dir exclusion pattern [websearch; LOW]
- Local ground truth: `package.json`, `vitest.config.ts` (default include — needs the exclude), `app/page.tsx` / `app/study/page.tsx` (`force-dynamic` already present), `next.config.ts` (empty) [HIGH]

---
*Stack research for: v1.6 Freshness, Performance & E2E Testing (Korean Study app)*
*Researched: 2026-07-10*
