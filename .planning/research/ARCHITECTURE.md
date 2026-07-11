# Architecture Research

**Domain:** RSC freshness-on-navigation + Playwright E2E infrastructure for an existing Next.js 16 thin-RSC/DTO/Prisma app
**Researched:** 2026-07-10
**Confidence:** HIGH for codebase-grounded integration points (read directly from source); MEDIUM-HIGH for Next.js/Playwright behavior claims (verified against first-party docs — nextjs.org v16.2.10, playwright.dev)

This file supersedes the 2026-07-05 ARCHITECTURE.md (v1.5 milestone — audit pipeline; all shipped). It is scoped to v1.6: **freshness-on-navigation fix + Playwright E2E harness**.

---

## Context: What Already Exists (verified in source)

Three facts from the actual codebase change the problem's shape:

1. **Every main RSC page is already `export const dynamic = 'force-dynamic'`** (`app/page.tsx`, `app/study/page.tsx` — with comments explaining the build-time-snapshot bug it fixed). The *server* render is always fresh. Staleness is therefore a **client-side Router Cache / client-shell-state problem**, not a server caching problem.
2. **Since Next.js 15, `staleTimes.dynamic` defaults to 0 seconds** — dynamic page segments are *not* reused on a normal `<Link>` navigation. A fresh tab-bar navigation to `/` or `/habits` should already hit the server. But per the official docs, `staleTimes` **"doesn't change back/forward caching behavior"** — back/forward navigation (browser back button, iOS swipe-back) always restores the cached RSC payload to preserve scroll position, regardless of config. This is the primary suspected staleness vector, plus PWA resume-from-background (no navigation event at all).
3. **Every `*Client.tsx` shell initializes state from props once**: `useState<CardDTO[]>(initialCards)` in `StudyClient`, `useState<StatsDTO>(initialStats)` in `HomeClient`. `router.refresh()` re-renders the RSC and passes fresh props **without remounting client components** — so fresh props are silently ignored by these `useState` initializers. Any fix built on `router.refresh()` is a no-op until the shells also sync state from prop changes.

## Standard Architecture

### System Overview — freshness data flow (target state)

```
┌────────────────────────────── Browser ──────────────────────────────┐
│  Trigger events                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐    │
│  │ pageshow     │ │ visibility-  │ │ mutation-complete moments │    │
│  │ (persisted / │ │ change →     │ │ (session complete, sync   │    │
│  │  back-nav)   │ │ visible      │ │  done, card CRUD)         │    │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬──────────────┘    │
│         └────────────────┴──────────────────────┘                   │
│                          ↓ (throttled)                              │
│              router.refresh()  ← NEW: FreshnessWatcher +            │
│                          │        targeted calls in client shells   │
├──────────────────────────┼──────────────────────────────────────────┤
│                          ↓ RSC re-render request                    │
│  ┌── Server (unchanged) ────────────────────────────────────────┐   │
│  │ app/*/page.tsx (force-dynamic) → lib/study-cards.ts /        │   │
│  │ lib/dashboard.ts → Prisma → DTO serialization                │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             ↓ fresh props (NO remount)              │
│  ┌── Client shells (MODIFIED) ──────────────────────────────────┐   │
│  │ *Client.tsx: gated prop→state sync                           │   │
│  │ (render-phase compare-and-set; gated so an active study      │   │
│  │  session / open editor sheet is never clobbered)             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### E2E harness overview (target state)

```
playwright.config.ts
  ├─ webServer: next build && next start   (prod-mode — cache behavior
  │    env: DATABASE_URL=file:./e2e.db,     differs under `next dev`;
  │         AUTH_SECRET/APP_PASSWORD=test   CLAUDE.md already documents this)
  ├─ project "setup" → e2e/auth.setup.ts
  │    POST /api/login via APIRequestContext → storageState
  │    → playwright/.auth/user.json (gitignored)
  └─ project "chromium" (depends on setup, uses storageState)
       └─ e2e/*.spec.ts — study flow, cards CRUD, freshness scenarios

globalSetup: reset file:./e2e.db → prisma db push → seed fixtures
  (`prisma db push` WORKS against file: URLs — only libsql:// fails;
   the CLAUDE.md Turso gotcha does not apply to the local test DB)
```

### Component Responsibilities

| Component | Responsibility | New / Modified |
|-----------|----------------|----------------|
| `components/FreshnessWatcher.tsx` | Renders nothing (like `ThemeWatcher`). Listens for `pageshow` with `event.persisted` (bfcache/back-forward restore) and `visibilitychange` → visible (PWA resume); calls `router.refresh()` throttled (e.g. ≥5s between refreshes). Mounted once in `app/layout.tsx`. | **New** |
| `components/HomeClient.tsx` | Add render-phase prop-sync: when `initialStats`/`initialActivity` prop identity changes, adopt it into state. Always safe to sync (no in-progress interaction to protect). | Modified |
| `components/StudyClient.tsx` | Prop-sync `initialCards` **gated on `phase === 'select-mode'`** — a `router.refresh()` firing mid-session must never replace the active queue. | Modified |
| `components/CardsClient.tsx` | Prop-sync `initialCards` gated on no editor/add sheet open (don't clobber an in-progress edit). | Modified |
| `components/HabitsClient.tsx` | Prop-sync activity/mastered props; always safe. | Modified |
| Mutation-complete call sites | Targeted `router.refresh()` after the *last* review of a session flushes (StudyClient completion), after sync completes (SyncPanel / pull-to-refresh in HomeClient), after card create/edit/delete (CardsClient). Ensures the *current* route's Router Cache entry is fresh before any later back-nav restores it. | Modified |
| `playwright.config.ts` | webServer, projects (setup + chromium), storageState wiring, `testDir: 'e2e'`. | **New** |
| `e2e/auth.setup.ts` | Programmatic login: `request.post('/api/login', { data: { password } })` → `request.storageState({ path })`. No UI login per test; no duplication of `lib/auth.ts` HMAC logic. | **New** |
| `e2e/global-setup.ts` (or setup project step) | Delete/recreate `e2e.db`, `prisma db push` against `file:./e2e.db`, run seed. | **New** |
| `e2e/seed.ts` | Deterministic fixtures via Prisma client: ~3 lessons, ~15 cards with sentences/components/CardDependency edges, a mix of due/not-due `CardReview` rows, a few `StudyDay` rows. Reuses `normalizeFront` from `lib/card-key.ts`. | **New** |
| `e2e/*.spec.ts` | Freshness scenarios, study flow, cards CRUD, smoke/perf checks. | **New** |
| Vitest config / test script | Exclude `e2e/**` from Vitest so `npm test` stays unit-only (Vitest's default include globs would match `e2e/*.spec.ts`). | Modified |
| `package.json` | `@playwright/test` devDep; scripts `test:e2e`, `test:e2e:ui`. | Modified |
| `.gitignore` | `playwright/.auth/`, `e2e.db`, `playwright-report/`, `test-results/`. | Modified |

## Recommended Project Structure

```
e2e/                        # NEW — Playwright specs (separate from tests/ = Vitest)
├── auth.setup.ts           # login once → storageState
├── global-setup.ts         # reset + push schema + seed e2e.db
├── seed.ts                 # deterministic Prisma fixtures
├── freshness.spec.ts       # back-nav / resume / post-mutation staleness scenarios
├── study.spec.ts           # full study session flow (grade → complete → due count drops)
├── cards.spec.ts           # cards CRUD (add via sheet, edit, swipe-delete)
└── smoke.spec.ts           # all routes render authenticated, login redirect works
playwright/.auth/           # NEW — gitignored storage state
playwright.config.ts        # NEW
components/FreshnessWatcher.tsx  # NEW
tests/                      # EXISTING Vitest unit tests — untouched
```

### Structure Rationale

- **`e2e/` separate from `tests/`:** the existing Vitest tests are pure/unit and run with no server. Playwright specs need a running server + seeded DB — different lifecycle, different runner, must not be picked up by `npm test`.
- **Seed via Prisma client, not raw SQL:** reuses `lib/card-key.ts` and the real schema; survives schema evolution automatically after `prisma generate`.
- **`FreshnessWatcher` mirrors `ThemeWatcher`:** the codebase already has the "renders-nothing watcher mounted in layout" pattern — same shape, zero new conventions.

## Architectural Patterns

### Pattern 1: `router.refresh()` + gated render-phase prop-sync

**What:** `router.refresh()` re-fetches the current route's RSC payload server-side and re-renders, *preserving client state* (no remount). The client shells then adopt fresh props via React's documented "adjusting state when props change" pattern — a render-phase compare-and-set, not an effect.
**When to use:** Any moment the client knows the DB changed (post-mutation) or suspects it (bfcache restore, tab re-focus).
**Trade-offs:** Preserving client state is exactly right here (an active study session or open sheet survives), but it's why the prop-sync half is mandatory. The sync must be *gated* per shell.

```tsx
// In HomeClient — render-phase adjustment (NOT an effect; satisfies
// react-hooks/set-state-in-effect, and is the React-docs-endorsed pattern)
const [prevStats, setPrevStats] = useState(initialStats)
if (initialStats !== prevStats) {
  setPrevStats(initialStats)
  setStats(initialStats)
}

// In StudyClient — same, but gated:
if (initialCards !== prevInitialCards) {
  setPrevInitialCards(initialCards)
  if (phase === 'select-mode') setStudyCards(initialCards)
}
```

Verify early that this render-phase pattern passes this repo's strict `react-hooks` rules (`purity` allows it — deterministic given props; `set-state-in-effect` targets effects, not render-phase adjustment). If the lint config rejects it, the fallback is `useEffect` keyed on the prop with the setter inside a `.then()`/callback per the existing codebase idiom.

### Pattern 2: FreshnessWatcher — refresh on restore/resume

**What:** A layout-mounted null component handling the two paths `staleTimes` cannot fix: back/forward Router-Cache restore (`pageshow` with `persisted`) and PWA resume (`visibilitychange` → `visible`).
**When to use:** Always mounted; throttle so a rapid tab-flick doesn't spam `getStudyCards()` (each refresh is a full force-dynamic server render — cheap for this single-user app, but Vercel-billed).
**Trade-offs:** A refresh while a session is active triggers a server render whose props the gated sync ignores — harmless but wasted; throttle + gate make this acceptable. Do **not** instead re-key the client shells to force remounts — that destroys active session state.

```tsx
'use client'
// components/FreshnessWatcher.tsx — renders nothing, like ThemeWatcher
const THROTTLE_MS = 5000
export default function FreshnessWatcher() {
  const router = useRouter()
  useEffect(() => {
    let last = 0
    const refresh = () => {
      const now = Date.now() // inside handler — purity-safe
      if (now - last < THROTTLE_MS) return
      last = now
      router.refresh()
    }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) refresh() }
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVis)
    return () => { /* remove both listeners */ }
  }, [router])
  return null
}
```

### Pattern 3: Programmatic auth via setup project + storageState

**What:** Playwright's recommended pattern: authenticate **once** in a `setup` project, persist cookies to `playwright/.auth/user.json`, and give every test project `storageState` + `dependencies: ['setup']`. Because `middleware.ts` only compares the `ks_auth` cookie against a deterministic HMAC, a single `request.post('/api/login', { data: { password: process.env.APP_PASSWORD } })` followed by `request.storageState({ path })` captures the cookie with zero UI steps.
**When to use:** All authenticated specs (everything except a dedicated login/redirect spec that intentionally starts unauthenticated via `storageState: { cookies: [], origins: [] }`).
**Trade-offs:** Computing the HMAC directly in test code (importing `lib/auth.ts` and `context.addCookies`) also works and is fully offline — but it duplicates knowledge of the cookie name/shape in tests and skips exercising `/api/login`. The API-login setup project is the better default.

### Pattern 4: Prod-mode webServer for cache-behavior tests

**What:** `webServer: { command: 'npm run build && npm run start', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI, env: { DATABASE_URL: 'file:./e2e.db', AUTH_SECRET: 'e2e-secret', APP_PASSWORD: 'e2e-password' } }`.
**When to use:** Always for freshness specs. `next dev` alters caching/prefetch behavior — CLAUDE.md already documents "Test RSC first-paint behavior with `npm run build && npm start`, not `next dev`". A freshness test that passes under dev proves nothing.
**Trade-offs:** Build adds ~1–2 min per cold run. Mitigate locally with `reuseExistingServer: true` against a manually-started server. For fast iteration on non-cache specs (CRUD, study flow), an env switch flipping the command to `next dev` is fine — but freshness specs must run prod-only.

## Data Flow

### Freshness flow — before vs after

```
BEFORE (stale path):
  study session grades cards → POST /api/review (fire-and-forget) → DB updated
  user swipes back to /  →  Router Cache restores old RSC payload  →  STALE hero/due count
  (staleTimes cannot fix this; revalidatePath in the route handler cannot fix this)

AFTER:
  swipe back → pageshow(persisted) → FreshnessWatcher → router.refresh()
  → server re-runs getStats()/getActivityData() → fresh DTO props
  → HomeClient render-phase sync adopts fresh props → CORRECT due count
```

### E2E flow

```
npx playwright test
  → global setup: rm e2e.db → prisma db push (file: URL — works) → seed fixtures
  → webServer: next build && next start (env-scoped to e2e.db)
  → setup project: POST /api/login → save storageState
  → specs run with ks_auth cookie pre-loaded
      freshness.spec: visit / (note due count) → study N cards → page.goBack()
        → expect due count decreased  ← this is the regression test for the fix
```

### Key Data Flows

1. **Post-review freshness:** client-side FSRS (optimistic) → background `POST /api/review` → on session complete, one `router.refresh()` after the last background save settles (hook the existing bounded-retry helper's resolution) → current-route props fresh; FreshnessWatcher covers cross-route back-nav.
2. **Post-sync freshness:** `SyncPanel`/pull-to-refresh already refetch `/api/stats` client-side; add `router.refresh()` so the RSC payload for the current route is also refreshed (otherwise a later back-nav restores pre-sync props).
3. **E2E ↔ external services:** `/api/sync` calls Google Docs + Claude — non-deterministic, billable, needs real creds. **Do not E2E the extraction pipeline.** Seed lessons/cards directly; E2E sync coverage stops at auth/shape assertions (e.g. cron route without bearer → 401). Extraction already has its own eval script (`scripts/prompt-eval.mts`) and unit coverage.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (single user) | Everything above. `router.refresh()` per resume/back-nav is a full dynamic render — trivially cheap at this scale. |
| If refresh volume ever mattered | Raise throttle; or move Home/Habits data into `use cache` + `cacheTag`/`updateTag` (Next 16 Cache Components) with tag updates from write routes — cross-request caching was explicitly deferred in v1.2 ("staleness risk outweighed gain"); this milestone does not reopen that decision. |
| E2E suite growth | Keep freshness specs serial (they depend on nav history); CRUD specs parallel with per-spec unique card fronts to avoid `normalizedFront @unique` collisions in the shared e2e.db. |

### Scaling Priorities

1. **First bottleneck:** E2E wall-clock from `next build` per run — mitigate with `reuseExistingServer` locally and build caching in CI.
2. **Second bottleneck:** flaky perf assertions — see Anti-Pattern 4.

## Anti-Patterns

### Anti-Pattern 1: `revalidatePath()` in the API route handlers as the freshness fix

**What people do:** Add `revalidatePath('/')` inside `POST /api/review` / `POST /api/sync`.
**Why it's wrong:** Per the official docs, in Route Handlers `revalidatePath` only "marks the path for revalidation … on the next visit" — it invalidates *server-side* caches, and these pages are already `force-dynamic` with no server cache to invalidate. It **does not purge the browser's Router Cache**, which is where the staleness lives. Only Server Functions push invalidation to the client.
**Do this instead:** Client-initiated `router.refresh()` (Patterns 1–2).

### Anti-Pattern 2: Converting review grading to a Server Action for its cache-purge behavior

**What people do:** Rewrite `POST /api/review` as a Server Action so `revalidatePath` "updates the UI immediately."
**Why it's wrong:** Grading is deliberately optimistic and fire-and-forget (UX-01, a validated v1.2 requirement) — awaiting a Server Action round-trip per grade reintroduces the 100–200 ms jitter that was explicitly engineered out; the bounded-retry helper (REVIEW-04) would also need reworking.
**Do this instead:** Keep the write path untouched; refresh once at session boundaries.

### Anti-Pattern 3: Forcing remounts (key-ing the client shell, or `window.location.reload()`)

**What people do:** `<StudyClient key={...}>` with a changing key, or full reloads, to "guarantee" fresh state.
**Why it's wrong:** Destroys active session state, undo snapshots, and open sheets; impure key sources (`Date.now()`) also violate `react-hooks/purity`. A reload throws away the entire instant-feel work of v1.2.
**Do this instead:** Gated prop-sync (Pattern 1) — adopt freshness only where it's safe.

### Anti-Pattern 4: Wall-clock performance assertions as CI gates

**What people do:** `expect(navigationTime).toBeLessThan(300)` style budgets.
**Why it's wrong:** Cold Prisma clients, machine variance, and CI noise make tight wall-clock budgets chronically flaky.
**Do this instead:** Assert *behavioral* performance invariants: first HTML response contains real seeded data (no empty-state flash — assert on the SSR body), no client `/api/cards/due` request fires on first load, navigation shows skeleton-then-content. Keep timing assertions to generous smoke budgets (e.g. < 5 s), informational before gating.

### Anti-Pattern 5: Testing cache behavior under `next dev`

**What people do:** Run freshness specs against the dev server because it boots faster.
**Why it's wrong:** Dev mode disables/alters Router Cache, prefetching, and static optimization — the exact behaviors under test. This repo already learned this (CLAUDE.md gotcha for RSC first-paint).
**Do this instead:** Pattern 4 — prod-mode webServer for freshness specs; dev-mode escape hatch only for functional specs.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Playwright (`@playwright/test`) | devDependency + `playwright.config.ts`; browsers via `npx playwright install chromium` (chromium-only is enough initially; add webkit later if iOS-Safari-specific bugs appear) | First new dependency in several milestones — call it out explicitly in the plan given the "no new packages" streak |
| SQLite (`file:./e2e.db`) | `webServer.env.DATABASE_URL` override; schema via `prisma db push` — **the Turso DDL gotcha does not apply** to `file:` URLs | Prod/dev DBs untouchable from tests by construction |
| Google Docs / Claude APIs | **Excluded from E2E.** Seed data replaces sync output | Non-deterministic + billable; covered by unit tests + `prompt-eval.mts` |
| Claude Code as test driver | The same harness (`npm run test:e2e`, headed mode, traces) is what lets Claude Code drive the app in a real browser — no extra infra beyond the config | Milestone explicitly wants this |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `FreshnessWatcher` ↔ App Router | `router.refresh()` only | No props, no context; mounted in `app/layout.tsx` next to `ThemeWatcher`/`GlossProvider` |
| RSC pages ↔ client shells | Existing DTO props — **contract unchanged**, but shells gain prop-change adoption | The DTO pattern (RSC-05) is untouched; only the "props read once" assumption changes |
| Study session ↔ refresh timing | Session-complete `router.refresh()` must fire **after** the final background review save settles, else refreshed props can still be pre-write | The one subtle ordering constraint in the whole fix |
| Vitest ↔ Playwright | Disjoint dirs (`tests/` vs `e2e/`); `npm test` must not glob `e2e/**` | Add an explicit Vitest `exclude` — its default include pattern matches `**/*.spec.ts` |
| E2E seed ↔ `lib/` | Seed imports `normalizeFront` (and optionally DTO types) from `lib/` | Same single-source-of-truth discipline the existing scripts follow |

## Suggested Build Order

1. **Playwright infrastructure first** (config, prod-mode webServer, e2e DB reset+seed, auth setup project, one smoke spec: login redirect + all four routes render seeded data). Rationale: the staleness diagnosis *is* a browser-navigation experiment — Playwright is the diagnostic instrument, and the fix needs a red test before it lands.
2. **Freshness diagnosis as failing specs**: encode each suspected stale path as a spec — (a) grade cards → `page.goBack()` → assert due count; (b) grade cards → `<Link>` nav to Home → assert due count (*expected to already pass*, per `staleTimes.dynamic=0` — confirming this narrows the fix); (c) dispatch `visibilitychange` via `page.evaluate` to simulate PWA resume. Whatever fails here is the ground truth that picks which pieces of the fix ship.
3. **Freshness fix**: `FreshnessWatcher` + gated prop-sync in the four shells + session-complete/sync-complete `router.refresh()` calls — turn step 2's reds green.
4. **Broader coverage + perf checks**: study flow, cards CRUD, no-client-refetch-on-first-load invariants, informational timing budgets.

Steps 1–2 and 3 are separable phases; step 2's findings may shrink step 3 (e.g. if `<Link>` navigation proves fresh, only back/forward + resume handling ships).

## Sources

- [Next.js docs — staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes) (v16.2.10 site: `dynamic` default 0s since v15, `static` 5min; explicitly "doesn't change back/forward caching behavior") — first-party, verified
- [Next.js docs — revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) (Route Handlers: next-visit invalidation only; Server Functions: immediate UI update) — first-party, verified
- [Playwright docs — Authentication](https://playwright.dev/docs/auth) (setup project + storageState; API-based login via `APIRequestContext`) — first-party, verified
- [Playwright docs — Web server](https://playwright.dev/docs/test-webserver) (webServer `command`/`url`/`env`/`reuseExistingServer`) — first-party, verified
- [vercel/next.js #69979 — Stale data after navigation (app router)](https://github.com/vercel/next.js/issues/69979); [Next.js App Router caching deep dive](https://pockit.tools/blog/nextjs-app-router-caching-deep-dive/) — corroborating community reports (MEDIUM)
- Codebase (HIGH — read directly): `app/study/page.tsx`, `app/page.tsx`, `components/HomeClient.tsx`, `components/StudyClient.tsx`, `middleware.ts`, `lib/auth.ts`, `package.json`, `next.config.ts`

---
*Architecture research for: v1.6 Freshness, Performance & E2E Testing (Korean Study app)*
*Researched: 2026-07-10*
