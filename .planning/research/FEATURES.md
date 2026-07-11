# Feature Research

**Domain:** RSC freshness-after-navigation + Playwright E2E infrastructure for a solo-maintained Next.js 16 App Router app (v1.6 milestone)
**Researched:** 2026-07-10
**Confidence:** MEDIUM (Next.js behavior cross-verified against official v16.2.10 docs + community issue threads; Playwright patterns cross-verified against official Playwright/Next.js docs + practitioner guides; per the classify-confidence seam, cross-verified web findings = MEDIUM)

## Scope Note

This is a **subsequent-milestone** research file; it replaces the v1.5 (extraction-quality) FEATURES.md, now superseded. Existing features (RSC hydration pattern, Vitest unit tests, optimistic grading, pull-to-refresh sync) are NOT re-researched — this file maps only the two new feature categories: **(A) freshness after navigation** and **(B) Playwright E2E test infrastructure**, and their dependencies on the existing RSC/DTO architecture.

## How This Actually Works in Real Products (Context for Both Categories)

**Freshness.** In Next.js 15+/16, the client Router Cache default `staleTime` for dynamic pages is already **0 seconds** (changed from 30s in v15) — a fresh `<Link>` navigation to a fully dynamic page re-fetches the RSC payload. Staleness survives on two things:

1. **Back/forward navigation always reuses the Router Cache**, regardless of `staleTimes` — by design (scroll/layout preservation), not configurable away. `router.refresh()` is the only escape hatch.
2. **Client shells that copy props into `useState`** — `router.refresh()` re-renders the RSC tree and streams new props **without remounting** client components, so `useState(initialCards)`-style initialization silently ignores the fresh data. This app uses exactly that pattern (`CardsClient`, `HomeClient`, `HabitsClient`, `StudyClient` per RSC-01..04).

A third structural fact: **`revalidatePath`/`revalidateTag` called in a Route Handler never purges the in-memory client Router Cache** — it only marks server cache stale for the *next* visit. Only Server Actions push client-cache invalidation automatically. This app mutates exclusively through Route Handlers (`POST /api/review`, `/api/sync`, `/api/cards`), so server-side revalidate calls are not a lever here. Real-world Route-Handler-based apps converge on: **`router.refresh()` after mutation settles, plus refresh-on-focus/navigation listeners** (SWR-style revalidation applied to RSC). And since this app's pages are fully dynamic (direct Prisma, no fetch cache, `unstable_cache` explicitly rejected in v1.2), there is **no server-side cache staleness at all** — the entire fix is client-side.

**E2E.** The canonical small-app shape: `@playwright/test` + `webServer` config (Playwright boots the app itself, `reuseExistingServer: !CI`), a `setup` project that authenticates once and saves `storageState`, one smoke spec (every route renders), and a handful of critical-flow specs. Vercel's official guidance is to run against the **production build** (`next build && next start`) because `next dev` never caches pages — which matters specifically for testing this milestone's freshness behavior. "AI agent can drive the dev site" means two complementary things in practice: (a) the **Playwright MCP server** (`@playwright/mcp`) giving Claude Code accessibility-tree-based browser tools for exploratory QA, and (b) a deterministic, headless spec suite the agent runs via `npx playwright test --reporter=line` and debugs via traces. The persisted suite provides regression safety; MCP is for interactive verification.

## Feature Landscape

### Table Stakes (Users Expect These)

#### Category A — Freshness

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Diagnosis spike: identify *which* layer is stale per route | Pages are dynamic + staleTime already 0, so plain `<Link>` nav *should* refetch — the bug is almost certainly back/forward Router Cache reuse and/or `useState(initialProps)` non-resync; the fix differs per cause | LOW | Must test with `npm run build && npm start` (CLAUDE.md gotcha: dev mode never caches). Verify each of the 4 routes separately |
| Prop→state re-sync in client shells | Any `router.refresh()`-based fix is a **no-op** for `CardsClient`/`HomeClient`/`HabitsClient` while they `useState(initialProps)` — refresh delivers new props to a component that ignores them | MEDIUM | Options: render from props where no local mutation exists; `useEffect` sync on prop identity change; `key` the shell on a data version. Touches the core RSC-01..05 pattern — highest-risk part of the milestone |
| Fresh data after navigating back post-study/sync | The milestone's headline user story: grade cards → return Home → hero/due-count/streak reflect it immediately | MEDIUM | Standard pattern: `router.refresh()` fired on session end / on navigation events. Back/forward cache reuse **cannot** be fixed via `staleTimes` config — only `refresh()` |
| Refresh-on-focus/visibility (SWR-style revalidation for RSC) | Covers PWA resume-from-background — the daily cron sync means data changes while the app is backgrounded on the user's phone | LOW | Tiny client component in `app/layout.tsx` listening to `visibilitychange`/`focus` → `router.refresh()`. Well-established community pattern for Route-Handler-mutating apps |
| No first-load speed regression | v1.2's entire point was no blank flash / instant first paint; the fix must not reintroduce loading states | LOW (constraint, not work) | `router.refresh()` re-renders in place with existing UI visible — no flash by design. But it re-runs *all* server queries for the route incl. `layout.tsx` color fetches — fine for single-user, just don't fire it in a loop |

#### Category B — E2E Infrastructure

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `@playwright/test` + `playwright.config.ts` with `webServer` | Standard entry point; Playwright boots/waits for the app itself (`reuseExistingServer: !process.env.CI`), `baseURL: http://localhost:3000` | LOW | First new dev dependency in several milestones. Official Next.js docs bless this shape verbatim |
| Auth setup project → `storageState` | Every page/API is behind the `ks_auth` HMAC cookie gate; without this no test can load any route | LOW | Best case for this app: POST `/api/login` via `APIRequestContext` with `APP_PASSWORD` (or compute the HMAC cookie directly reusing `lib/auth.ts`) → save storageState → all projects depend on `setup`. No per-test login UI. Never commit the storageState file |
| Isolated test database | Tests that grade/create cards mutate FSRS state — running against production Turso would corrupt the user's real learning record | MEDIUM | The libSQL adapter already supports `file:` URLs (dev mode). Inject `DATABASE_URL=file:./e2e.db` via `webServer.env`, apply schema (the `prisma migrate diff --from-empty` DDL path — or plain `db push`, which works fine against `file:` even though it fails on `libsql://`), seed known cards/reviews. Serial workers (`workers: 1`) since one server + one DB |
| Smoke spec: every route renders | The universal first spec — catches auth regressions, RSC crashes, hydration errors across `/`, `/study`, `/cards`, `/habits`, `/history`, `/settings`, `/wrapped` | LOW | Assert on a content-bearing element per route (not just HTTP 200) so RSC data hydration is actually exercised |
| Critical-flow specs: study grade flow, cards CRUD | The two flows where regressions hurt most: flashcard reveal→grade→queue-advance→completion, and add/edit/delete card | MEDIUM | Study flow requires seeded due cards. Optimistic grading means asserting on UI state first, then separately on persisted `ReviewLog`/`CardReview` rows |
| Freshness regression spec | The milestone's acceptance test: grade a card → navigate Home → assert updated stats *without* manual reload | MEDIUM | Where Category A and B meet — the E2E suite exists partly to prove the freshness fix and keep it proven. Must run against production build |
| Agent-runnable execution mode | The stated goal: Claude Code verifies behavior itself | LOW | Headless default, deterministic seeds, `--reporter=line` (parseable), no watch mode, bounded runtimes. Falls out of doing the above correctly rather than being separate work |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Playwright MCP server registered for Claude Code | `claude mcp add playwright npx @playwright/mcp@latest` — agent drives a real browser via accessibility-tree snapshots (semantic locators, no vision model), enabling exploratory QA and "verify this UAT item yourself" workflows | LOW | Complements, never replaces, the persisted suite: MCP = interactive verification; specs = repeatable regression. Document the workflow (dev server port, login step) in CLAUDE.md so any agent session can use it |
| Performance budget assertions | Catches query-time/render-cost regressions (e.g., a future change re-serializing the whole deck per request) before they're felt on the phone | MEDIUM | Practitioner consensus: Navigation Timing API via `page.evaluate` (TTFB, `domContentLoaded`), **generous** budgets (e.g., < 2–3s), median-of-N runs, Chromium-only. Also assert API route timing directly via `request.get('/api/cards/due')` elapsed time — less noisy than browser metrics for "query timing" |
| Trace-on-failure + HTML report | `trace: 'on-first-retry'` gives a post-mortem timeline (DOM snapshots, network, console) — the biggest debugging lever for both human and agent | LOW | Effectively free config. An agent can be pointed at the trace zip; humans use `npx playwright show-trace` |
| Dual-target config: dev server for iteration, prod build for cache-sensitive specs | `next dev` never caches, so freshness specs against dev prove nothing; but dev-server iteration is faster for everything else | MEDIUM | Two Playwright projects or an env switch on `webServer.command`. CLAUDE.md already documents this exact gotcha for manual testing — the suite codifies it |
| Codegen bootstrap (`npx playwright codegen`) | Fast way to draft selectors for the first specs | LOW | One-time authoring aid, not infrastructure. Recorded output should be rewritten to role/text locators |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Migrate mutations to Server Actions (to get automatic client-cache invalidation) | It's the "official" way — Server Actions purge the client Router Cache on `revalidatePath` | Rewrites every mutation path; conflicts directly with the shipped optimistic fire-and-forget grading (UX-01) — Server Actions are awaited POSTs integrated with transitions, reintroducing grade-button latency | `router.refresh()` + focus/navigation listeners achieve the same freshness with zero mutation-path changes |
| Adopt Cache Components (`cacheComponents: true`, `use cache`, `cacheTag`/`updateTag`) | Next 16's headline caching model; tag-based invalidation sounds like the "right" fix | Adds a *server* caching layer to an app that deliberately has none, just to then invalidate it; `updateTag` only works from Server Actions anyway; v1.2 already rejected cross-request caching (staleness risk, single-user app) | Stay fully dynamic; fix the client-side Router Cache + state-sync problem, which is the actual bug |
| SWR / React Query layer for page data | Battle-tested revalidate-on-focus, mutate-and-invalidate ergonomics | Duplicates the data layer the RSC+DTO pattern just consolidated (`lib/study-cards`, `lib/dashboard`); reintroduces client-fetch waterfalls and loading states v1.2 eliminated | `router.refresh()` *is* the RSC-native equivalent of SWR revalidation for this architecture |
| Tuning `experimental.staleTimes` | Looks like the purpose-built knob for exactly this problem | Dynamic default is already 0; the flag is experimental ("not recommended for production"); and it explicitly does **not** affect back/forward caching — the case that's actually broken | No config change; behavioral fix via refresh |
| Cross-browser matrix (Chromium + Firefox + WebKit) | Playwright makes it one config line; the user's real device is iOS Safari | 3× CI time and 3× flake surface for a single-user app; WebKit-on-macOS still isn't iOS Safari | Chromium-only now; a WebKit project is a cheap later add if an iOS-specific bug ever appears |
| Visual screenshot regression | "Catch any UI change" appeal | Notorious flake source (fonts, antialiasing, animation timing); two themes × user-configurable accent colors multiply baselines; solo maintainer pays the re-baseline tax on every intentional polish pass | Semantic assertions (roles, text, counts). Reduced-motion is already a project invariant, which helps determinism anyway |
| Strict millisecond perf assertions in CI | "Fail the build if Home takes >800ms" | Runner variance makes tight thresholds fail randomly; erodes trust in the whole suite | Generous budgets (2–3× baseline) as hard assertions + logged timings for trend eyeballing; median-of-N for anything tighter |
| E2E against production URL / real Turso DB | "Test what's really deployed" | Mutating tests would corrupt real FSRS state, `ReviewLog` history, and streaks; sync tests would burn Opus tokens | Local server + seeded `file:` SQLite; production keeps the existing manual UAT + `vercel crons run`-style checks |
| Exercising real Claude extraction in E2E (`POST /api/sync` end-to-end) | Sync is a critical flow | Nondeterministic output, slow, costs real Opus tokens per run; agent-run suites would multiply that cost | Seed lessons/cards directly in the test DB; if sync-shape coverage is wanted, assert route auth/validation behavior only, or stub the extraction boundary |

## Feature Dependencies

```
[Freshness regression E2E spec]
    ├──requires──> [Freshness fix (refresh-on-nav/focus)]
    └──requires──> [E2E infra: config + auth + test DB]
                       ├──requires──> [Auth storageState setup] ──requires──> APP_PASSWORD/AUTH_SECRET env
                       └──requires──> [Isolated test DB + seed] ──requires──> libSQL file: adapter (already used in dev)

[Freshness fix (refresh-on-nav/focus)]
    ├──requires──> [Prop→state re-sync in client shells]   ← the useState(initialProps) landmine
    └──requires──> [Diagnosis spike]                        ← determines which routes need which fix

[Perf budget assertions] ──requires──> [E2E infra] + [prod-build test target]
[Playwright MCP workflow] ──enhances──> [E2E suite] (exploratory QA feeding new specs)
[Prod-build test target] ──required-by──> any spec asserting caching behavior (dev never caches)

[Server Actions migration] ──conflicts──> [Optimistic grading (UX-01, shipped)]
[Cache Components adoption] ──conflicts──> [fully-dynamic architecture + v1.2 no-cross-request-cache decision]
```

### Dependency Notes

- **Freshness fix requires prop→state re-sync:** `router.refresh()` streams new props without remounting; `CardsClient`/`HomeClient`/`HabitsClient` initialize state from props once (documented pattern, RSC-01..04). Without re-sync, refresh "works" at the framework level and changes nothing on screen. This is the single most likely way the milestone silently fails.
- **Freshness spec requires prod build:** `next dev` renders every page on demand — the stale behavior being fixed is not reproducible there (already a CLAUDE.md gotcha for manual testing).
- **Auth setup is unusually cheap here:** single shared password + stateless HMAC cookie means one `APIRequestContext` POST (or direct cookie computation reusing `lib/auth.ts`) — no per-test login UI, no token refresh.
- **Test DB leans on existing architecture:** the same `lib/prisma.ts` libSQL adapter already runs against `file:` in dev; the only genuinely new work is schema-apply + seed for a throwaway DB and `webServer.env` injection.
- **`StudySession`'s active session is intentionally exempt:** the in-session queue is client-owned by design (optimistic grading); freshness applies to *route-level* data on navigation, not mid-session state. Refresh triggers should fire on session end / navigation, never mid-grade.
- **Vitest + Playwright coexistence:** keep the Playwright specs in a separate `e2e/` dir excluded from Vitest's include glob (and vice versa) — the standard split; no runner conflict when directories don't overlap.

## MVP Definition

### Launch With (v1.6)

- [ ] Diagnosis spike across all 4 routes (prod build) — everything else is guesswork without it
- [ ] Prop→state re-sync in the client shells that need it — prerequisite for any refresh to be visible
- [ ] `router.refresh()` on study-session end + refresh-on-focus/visibility listener — covers post-study navigation, back/forward, and PWA resume after cron sync
- [ ] Playwright infra: config + `webServer` + auth storageState + isolated seeded test DB
- [ ] Smoke spec (all routes) + study grade flow + freshness regression spec — minimum set proving the milestone
- [ ] Trace-on-retry + line reporter — agent- and human-debuggable by default

### Add After Validation (v1.6.x)

- [ ] Cards CRUD flow spec — once infra is stable; exercises SwipeRow/Sheet interactions
- [ ] Perf budgets (Navigation Timing + API route timing, generous thresholds) — after a few suite runs establish baseline variance
- [ ] Playwright MCP registration + CLAUDE.md workflow docs — as soon as the suite exists to complement it

### Future Consideration (v2+)

- [ ] WebKit project — only if an iOS-Safari-specific bug appears
- [ ] Sync-route E2E coverage beyond auth/validation — only with a stubbed extraction boundary
- [ ] Visual regression — likely never for this app; semantic assertions suffice

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Diagnosis spike | HIGH (de-risks everything) | LOW | P1 |
| Prop→state re-sync | HIGH | MEDIUM | P1 |
| refresh() on session end + focus listener | HIGH | LOW | P1 |
| Playwright infra (config/auth/test DB) | HIGH | MEDIUM | P1 |
| Smoke + study flow + freshness specs | HIGH | MEDIUM | P1 |
| Trace/report config | MEDIUM | LOW | P1 (free) |
| Cards CRUD spec | MEDIUM | MEDIUM | P2 |
| Perf budgets | MEDIUM | MEDIUM | P2 |
| Playwright MCP workflow | MEDIUM | LOW | P2 |
| WebKit project | LOW | LOW | P3 |
| Visual regression | LOW | HIGH | P3 (avoid) |

## Sources

Official docs (cross-verified, current for Next.js 16.2.10 / 2026):
- [Next.js staleTimes reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes) — dynamic=0 default since v15; explicitly does not affect back/forward caching
- [Next.js revalidatePath reference](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) — Server Function vs Route Handler client-cache behavior
- [Next.js caching guide (previous model)](https://nextjs.org/docs/app/guides/caching-without-cache-components)
- [Next.js Playwright guide](https://nextjs.org/docs/app/guides/testing/playwright) — webServer config, prod-build recommendation
- Vercel `next-cache-components` + `nextjs` skills (Cache Components / `updateTag` semantics, data patterns)

Community/practitioner (MEDIUM confidence, cross-checked):
- [vercel/next.js issue #69979 — stale data after navigation with internal API + SSR](https://github.com/vercel/next.js/issues/69979) and [discussion #52370](https://github.com/vercel/next.js/discussions/52370) — the canonical statement of this app's exact bug
- [Playwright: Authentication](https://playwright.dev/docs/auth), [setup-project pattern](https://dev.to/playwright/a-better-global-setup-in-playwright-reusing-login-with-project-dependencies-14)
- [Playwright MCP](https://playwright.dev/docs/getting-started-mcp), [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp), [Builder.io: Playwright MCP with Claude Code](https://www.builder.io/blog/playwright-mcp-server-claude-code), [Simon Willison TIL](https://til.simonwillison.net/claude-code/playwright-mcp-claude-code)
- [Checkly: measuring page performance with Playwright](https://www.checklyhq.com/docs/learn/playwright/performance/), [TestingBot Playwright performance](https://testingbot.com/support/web-automate/playwright/performance)
- [Prisma E2E testing guide](https://www.prisma.io/blog/testing-series-4-OVXtDis201), [testdouble/nextjs-e2e-test-example](https://github.com/testdouble/nextjs-e2e-test-example)

---
*Feature research for: v1.6 Freshness, Performance & E2E Testing (Korean Study app)*
*Researched: 2026-07-10*
