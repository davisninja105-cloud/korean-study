# Pitfalls Research

**Domain:** Adding cache-freshness fixes + first-time Playwright E2E to an RSC-hydration-optimized Next.js 16 / Prisma / Turso app with cookie auth (v1.6 Freshness, Performance & E2E Testing)
**Researched:** 2026-07-10
**Confidence:** MEDIUM-HIGH (Next.js/Playwright behavior cross-checked against official docs = MEDIUM; architecture-specific pitfalls grounded in this repo's actual code and a real prior incident = HIGH)

**Context that shapes everything below:** v1.2 deliberately moved all four main routes to server-side RSC data fetching with `*Client.tsx` shells fed by props, specifically to kill the blank-loading flash. A **prior attempt to fix staleness regressed exactly this win** — the user's words: "it felt like the hydration aspect was completely forgotten about and now all tabs take forever to load even on the first try." Every freshness pitfall below is really the same meta-pitfall: *fixing staleness by destroying the performance architecture instead of invalidating at mutation boundaries.*

Phase legend used throughout:
- **freshness** — diagnose & fix stale-data-on-revisit across `/`, `/cards`, `/study`, `/habits` without regressing first-load speed
- **e2e-setup** — Playwright infrastructure (webServer, auth, test DB, conventions)
- **e2e-coverage / perf** — flow coverage (sync, study, cards CRUD) + performance regression tests

## Critical Pitfalls — Freshness Fix

### Pitfall 1: Fixing the wrong cache layer (no diagnosis before treatment)

**What goes wrong:**
Next.js has four distinct caches (fetch/data cache, full route cache, client-side Router Cache, browser bfcache). The reported symptom — *fresh on hard reload, stale after navigating back* — points specifically at the **client-side Router Cache**, which restores back/forward navigations from cache **regardless of `staleTimes`** (it deliberately mirrors bfcache). Developers who don't pin down which layer is serving stale data reach for the biggest hammer (`export const dynamic = 'force-dynamic'`, `fetchCache = 'force-no-store'`), which operates on the *server-side* layers, slows every request — and can **still leave back/forward navigation stale**, because the Router Cache is client-side. You pay the full cost and don't even fix the symptom.

**Why it happens:**
The cache layers are invisible and their interactions are the most-complained-about part of the App Router. `force-dynamic` "feels" like the freshness switch. The prior incident here almost certainly followed this path.

**How to avoid:**
Make the first task of the freshness phase a **written diagnosis**, not a fix: (1) run `npm run build` and record each route's rendering mode (`○` static vs `ƒ` dynamic) from the build output; (2) reproduce staleness in a production build (`npm run build && npm start`, never `next dev`); (3) distinguish the three navigation paths — `<Link>`/tab tap, browser back/forward, hard reload — and record which are stale. Only then choose the invalidation point. For this app the expected fix shape is **targeted invalidation at mutation boundaries**: `router.refresh()` fired once when a study session completes and when a sync completes (both moments are already explicit events in `StudySession.tsx` / SyncPanel / pull-to-refresh), not global cache disabling.

**Warning signs:**
- Any diff adding `export const dynamic = 'force-dynamic'`, `fetchCache = 'force-no-store'`, `revalidate = 0`, or `Cache-Control: no-store` to `app/*/page.tsx` or `layout.tsx`
- A "fix" verified only in `next dev` (dev doesn't exercise the production Router Cache behavior — the repo's own CLAUDE.md gotcha)
- Staleness "fixed" for tab-tap navigation but nobody tested browser back/forward specifically

**Phase to address:** freshness — as its *first* plan (diagnosis task gating the fix task).

---

### Pitfall 2: `useState(initialProps)` shells silently ignore refreshed server data

**What goes wrong:**
This is the pitfall most specific to THIS architecture. `CardsClient` initializes `useState<CardDTO[]>(initialCards)`; `HomeClient`, `HabitsClient`, `StudyClient` follow the same props-to-initial-state pattern. React only reads a `useState` initializer on **first mount**. After a correct `router.refresh()`, the RSC re-renders and passes *fresh props* — but the mounted client shell keeps its *stale state*. The freshness fix "doesn't work," the developer concludes `router.refresh()` is broken, and escalates to `force-dynamic` or re-introducing client-side `useEffect` fetching. This escalation chain plausibly explains the prior regression.

**Why it happens:**
The v1.2 pattern (`useState(initialProp)`, no sync effect) was *correct* when props never changed after mount. `router.refresh()` changes that contract: props now update in place on a mounted component.

**How to avoid:**
Decide per shell how refreshed props flow in, and write it down as the pattern:
- **Derive, don't copy:** where the prop is only read (Home/Habits stats, heatmap), render directly from props — delete the state copy entirely.
- **Where local mutation exists** (CardsClient edits/deletes cards locally): either re-mount the shell via a `key` derived from a server-provided token, or reconcile props→state deliberately — mindful that `react-hooks/set-state-in-effect` forbids synchronous `setState` in effect bodies (use the render-time "previous props" comparison pattern from the React docs, or sync inside async callbacks).
- **Never** re-sync `StudyClient` mid-session — see Pitfall 3.

**Warning signs:**
- `router.refresh()` visibly re-runs the server (network tab shows the RSC payload) but the UI doesn't change
- A shell both holds `useState(initialProp)` *and* is expected to receive refreshed props
- New `useEffect(() => setX(prop), [prop])` blocks added hastily without handling in-flight local edits

**Phase to address:** freshness — the props→state reconciliation strategy per shell must be in the PLAN, not improvised.

---

### Pitfall 3: Refreshing at the wrong moment — mid-session, per-grade, or on mount

**What goes wrong:**
`router.refresh()` re-renders the current route's server components. If fired during an active study session it re-runs `getStudyCards()` (a Turso round-trip + selection + sequencing) and pushes a *new* card list at `StudyClient` while the mutable queue, optimistic FSRS state, undo snapshots, and `seenCardIdsRef` are live. Fired per-grade, it also races the fire-and-forget `POST /api/review` (the optimistic write may not have landed yet, so the refreshed server data is *older* than client state — fresh-looking stale data). Fired in a mount effect, it doubles every navigation's server work.

**Why it happens:**
"Refresh after mutation" gets interpreted as "refresh after *every* mutation." In this app a grade is a mutation, but the session is designed to be atomic (PROJECT.md: "study sessions are atomic — no real-time updates").

**How to avoid:**
Refresh only at **session boundaries**: session complete screen, session abandon/navigate-away, sync complete (SyncPanel + pull-to-refresh success). Because review saves are fire-and-forget with bounded retries (~500ms/~1500ms backoff), a session-complete refresh should either await/observe the last pending review POST or explicitly tolerate eventual consistency (the due list is computed from `CardReview.nextReview`, so a lost race shows one already-graded card as still due — decide which is acceptable and document it).

**Warning signs:**
- `router.refresh()` inside `submitReview`/grade handlers
- Cards reappearing or the queue resetting mid-session
- Home hero showing a due count that disagrees with the session just completed (write race)

**Phase to address:** freshness — the write-race tolerance decision belongs in the plan's binding truths.

---

### Pitfall 4: Regressing first-paint by re-introducing client-side fetching or killing prefetch

**What goes wrong:**
Two "freshness" moves directly undo v1.2: (a) moving data fetching back into `useEffect` in the client shells ("always fresh!") — restores the blank-flash and adds a client round-trip on every visit; (b) slapping `prefetch={false}` on the Nav `<Link>`s or forcing dynamic rendering so every tab tap waits on a full Vercel-function + Turso round-trip with no cached RSC payload. The user's report — "all tabs take forever to load **even on the first try**" — is the signature of (b) combined with lost skeleton coverage: each navigation became an uncached serverless invocation against Turso (cold start + DB latency per tap).

**Why it happens:**
Each move genuinely does deliver freshness; the cost is just paid on every navigation instead of once per mutation.

**How to avoid:**
Adopt an explicit invariant for the milestone: **first-load and tab-navigation performance are regression-gated.** Concretely: (1) no `useEffect` initial-data fetching returns to any `*Client.tsx`; (2) Nav `<Link>` prefetch stays default; (3) `loading.tsx` skeletons must still render on tab navigation (if the fix makes navigations slower-but-fresher, the skeleton is the floor of acceptability); (4) an E2E check asserts real content in the first server-rendered paint and skeleton-then-content on tab switch *before* the freshness change lands, so any regression is mechanically visible.

**Warning signs:**
- `fetch('/api/...')` on mount reappearing in client shells
- The empty-state flash returning ("No cards yet" blink)
- Build output flipping previously-fine routes' rendering mode
- Tab switches showing a blank frame instead of the skeleton

**Phase to address:** freshness defines the invariant; e2e-setup encodes it as a regression test. **Strong ordering recommendation: stand up the E2E baseline (or at minimum the first-load/tab-nav test) *before* merging the freshness fix** — this milestone exists because the last attempt shipped without one.

---

### Pitfall 5: Breaking the DTO boundary or the shared-pipeline contract while adding refresh paths

**What goes wrong:**
New refresh paths (a server action calling `revalidatePath`, a new re-fetch endpoint, an RSC returning extra fields) leak raw Prisma `Date` objects across the server→client boundary, violating RSC-05 — which either throws at serialization or silently produces wrong client behavior. Similarly, adding a freshness-specific data path that *bypasses* `lib/study-cards.ts` / `lib/dashboard.ts` forks the single-source-of-truth pipeline that the RSC pages and API routes share — RSC render and client re-fetch start disagreeing about what "the data" is.

**Why it happens:**
Freshness work touches every server→client seam at once; it's the highest-traffic moment for boundary violations since v1.2 itself.

**How to avoid:**
Any new data crossing the boundary goes through `lib/dto.ts` types; any new fetch path calls the existing `lib/study-cards.ts`/`lib/dashboard.ts` functions. If a server action is introduced, its return value is DTO-typed too. Code-review check: grep changed prop interfaces for `Date` types.

**Warning signs:**
- A changed `*Client.tsx` prop interface with a `Date` type
- A new `app/api/*` route duplicating a `lib/` query inline

**Phase to address:** freshness (code-review checklist item).

---

### Pitfall 6: Adopting `unstable_cache` / Cache Components / `staleTimes` tuning as the fix

**What goes wrong:**
Current ecosystem advice gravitates toward Next 16 Cache Components (`"use cache"`, `cacheLife`, `updateTag`) or the experimental `staleTimes` config. For this app: cross-request DB caching was **already evaluated and rejected in v1.2** ("staleness risk outweighed gain for a single-user app" — it's in PROJECT.md Out of Scope), and this milestone's problem is *too much* caching, not too little. Adding a new cache layer to fix staleness inverts the problem. `staleTimes` tuning is also a red herring here because back/forward restoration ignores it.

**Why it happens:**
Searching "Next.js stale data" in 2026 surfaces Cache Components migration content; it looks like The Modern Answer.

**How to avoid:**
Treat the v1.2 Out-of-Scope decision as binding unless the Pitfall-1 diagnosis proves a server-side cache layer is actually the stale source. The fix budget for this milestone is invalidation calls + client-shell prop reconciliation, not new caching architecture.

**Warning signs:** `"use cache"` directives, `unstable_cache` imports, `cacheComponents`/`staleTimes` config changes appearing in the diff.

**Phase to address:** freshness (scope guard in the plan).

---

## Critical Pitfalls — Playwright E2E

### Pitfall 7: E2E runs pointed at production Turso (real deck, real Claude spend)

**What goes wrong:**
`.env` in this repo contains the **production** `libsql://` `DATABASE_URL`. Next.js and Prisma auto-load it. A Playwright `webServer` that starts the app without overriding env will run E2E card-CRUD and sync flows against the live deck — deleting real cards with real FSRS history (violating the standing "never destroy FSRS state" rule), polluting `StudyDay`/`ReviewLog`, and a sync test would hit the real Google Doc + Claude Opus (cost + 60s-scale latency + nondeterminism).

**Why it happens:**
Single-tenant apps have no staging habit; env loading is implicit; the first E2E run "just works" because it found real data — which is exactly the trap.

**How to avoid:**
- Test env is **explicit and local**: `DATABASE_URL=file:./e2e-test.db`. Note: `prisma db push` **works** against `file:` URLs — the Turso DDL gotcha does not apply to the test DB, so schema setup is one command in global setup.
- Reuse the project's own Phase-22 pattern: **print the resolved DB host before the suite runs and hard-fail if it starts with `libsql://`**. A 5-line guard in Playwright global setup.
- Seed deterministic fixture data via a Prisma script (cards + sentences + reviews + dependency edges), not via the UI and never via real sync.
- Sync E2E never calls the real pipeline: seed `Lesson` rows directly and scope sync coverage to route auth + error surfacing with fixtures.

**Warning signs:**
- E2E "passes" with data you recognize from your actual deck
- `ReviewLog`/`StudyDay` rows in production with timestamps matching test runs
- Anthropic API usage spikes during test runs

**Phase to address:** e2e-setup — the very first task (guard exists before any test does).

---

### Pitfall 8: Per-test UI login instead of storageState / direct cookie injection

**What goes wrong:**
Every test navigating to `/login`, typing the password, and submitting adds seconds per test, and makes *every* test fail when the login page has any issue (one bug = 100% red suite, zero signal). Conversely, naive storageState handling commits the state file — which contains the auth cookie, a real secret with **no expiry** in this app's stateless HMAC scheme.

**Why it happens:**
The login flow is the first thing that works, so it becomes the implicit setup for everything.

**How to avoid:**
This app's auth makes this unusually easy — exploit it. `lib/auth.ts` computes a **deterministic HMAC token from `AUTH_SECRET`** (no session table, no expiry). Two good options:
1. **Setup project** (Playwright's documented pattern): one `auth.setup.ts` logs in via `/login` once, saves `storageState` to `playwright/.auth/user.json` (gitignored / under `outputDir`); all test projects declare the dependency and set `storageState`. This also makes the login flow itself covered by exactly one test.
2. **Direct injection** for speed: compute the token with the same `computeAuthToken()` code and `context.addCookies([{ name: 'ks_auth', ... }])` — zero UI dependency.
Either way `APP_PASSWORD`/`AUTH_SECRET` must be set in `webServer.env`, and remember `middleware.ts` guards **API routes too** — any test using Playwright's `request.*` for seeding/assertions needs the cookie on the request context, not just the page.

**Warning signs:**
- Suite runtime dominated by `/login` navigations
- `playwright/.auth/*.json` showing up in `git status`
- API-level calls returning 401 or `/login` redirects

**Phase to address:** e2e-setup.

---

### Pitfall 9: Testing against `next dev` — flaky AND invalid for this milestone

**What goes wrong:**
Two distinct failures. (a) Generic flakiness: dev-mode on-demand compilation makes the *first* navigation to each route take 5–30s (timeout storms), and HMR/overlays interfere with selectors. (b) **Milestone-specific invalidity:** the exact behavior under test — Router Cache, `loading.tsx`, RSC payload reuse — differs between dev and production builds. The repo's own CLAUDE.md already warns: "Test RSC first-paint behavior with `npm run build && npm start`, not `next dev`." An E2E suite that green-lights the freshness fix in dev proves nothing about the production behavior the user actually experiences.

**Why it happens:**
`next dev` is the muscle-memory command, and most Playwright examples show `command: 'npm run dev'`.

**How to avoid:**
`webServer: { command: 'npm run build && npm start -- -p 3100', port: 3100, reuseExistingServer: !process.env.CI, timeout: 180_000, env: { DATABASE_URL: 'file:./e2e-test.db', APP_PASSWORD: ..., AUTH_SECRET: ... } }`. Use a **dedicated port** (3100, not 3000) so `reuseExistingServer` can never silently attach to your dev server running with production env. The ~1–2 min build is a fixed per-suite cost; `reuseExistingServer` on the dedicated port amortizes it during local iteration.

**Warning signs:**
- First-navigation timeouts that vanish on retry (dev compile-on-demand signature)
- Freshness tests passing locally while the user still sees stale data in production
- E2E hitting `localhost:3000` while a dev server is also on 3000

**Phase to address:** e2e-setup (webServer config); all freshness E2E tests inherit it.

---

### Pitfall 10: Parallel workers sharing one SQLite file — cross-test data races

**What goes wrong:**
Playwright's per-test browser-context isolation covers cookies/localStorage — **not the database**. Playwright defaults to N parallel workers; all hit the same `file:./e2e-test.db`. Card-CRUD tests race study tests (a card deleted mid-session), due-count assertions see other tests' reviews, and SQLite file-level write locking adds spurious busy/locked failures. Tests pass alone, fail in the suite, in random combinations.

**Why it happens:**
Parallelism is the default; DB sharing is invisible until two tests touch the same rows.

**How to avoid:**
For this app's scale, **start with `workers: 1` and `fullyParallel: false`** — the suite will be small (single-user app, a handful of flows) and serial execution eliminates the whole class. If parallelism is ever needed, per-worker DB files + server instances via `testInfo.workerIndex` is the documented pattern — but that's over-engineering at v1.6. Also make seeding idempotent and order-independent (reset + reseed in global setup or per test file), so test order never matters.

**Warning signs:**
- Tests green in isolation (`--grep`), red in full runs
- Count assertions (due cards, streaks) off by small amounts
- Intermittent database-locked errors

**Phase to address:** e2e-setup (config default); revisit only if suite runtime becomes a problem.

---

### Pitfall 11: Timing assumptions vs this app's animations and fire-and-forget writes

**What goes wrong:**
Three app-specific flake sources: (a) **animations** — 3D card flip with measured dynamic height, Sheet spring slide-up, confetti, inter-card fades — mid-animation clicks miss or hit the wrong element; (b) **optimistic grading** — the UI advances to the next card *before* `POST /api/review` completes (fire-and-forget with bounded background retries), so any test that grades a card and then asserts server-derived state (due counts after refresh, ReviewLog rows) races a write that may be ~2s behind — or lost; (c) **TTS/audio** — `/api/tts` 503s without a Blob token and `AudioButton` falls back to `speechSynthesis`, so audio behavior is environment-dependent.

**Why it happens:**
Web-first assertions auto-wait for *rendering*, but nothing waits for a fire-and-forget background POST by default.

**How to avoid:**
- Set `reducedMotion: 'reduce'` globally (context option / `use` block) — the app already gates every animation on `prefers-reduced-motion` (a v1.1 invariant), so this simultaneously stabilizes tests and exercises the reduced-motion path. A rare freebie: the app was built for this.
- For grade→server assertions, wait on the network: `page.waitForResponse(r => r.url().includes('/api/review') && r.ok())` before asserting DB-derived UI, or `expect.poll()` an API read. Never `waitForTimeout`.
- Ban `waitForTimeout` in review; rely on web-first `expect(locator)` auto-waiting everywhere else.
- Don't assert audio playback; at most assert the button's state transitions.

**Warning signs:**
- Flakes clustered on tests that grade cards then check counts
- Failures only on slower machines
- Failure screenshots showing mid-flip/mid-slide states

**Phase to address:** e2e-setup establishes the conventions (reducedMotion default, no-waitForTimeout rule); e2e-coverage applies them.

---

### Pitfall 12: Browser-timing "performance regression tests" that flake instead of gate

**What goes wrong:**
Naive perf tests assert absolute wall-clock numbers (`expect(loadTime).toBeLessThan(500)`) measured in a browser on shared hardware. Run-to-run variance (±30–50% with cold starts and CPU contention) makes them either flaky (tight threshold) or useless (loose threshold). The milestone then can't distinguish "the freshness fix regressed navigation" from "the laptop was busy" — and a flaky gate erodes trust in the entire new suite.

**Why it happens:**
The obvious way to test "pages are fast" is to time them once and assert.

**How to avoid:**
Layer measurements by stability:
1. **Most stable — behavioral proxies, not clocks:** assert the *mechanism*, e.g. "the first server-rendered HTML already contains real card text" (no empty-state flash; content visible without any client fetch) and "tab navigation shows the `loading.tsx` skeleton then content." These encode the v1.2 win as boolean facts, immune to hardware variance.
2. **Medium — server-side query timing** in Vitest (not Playwright): time `getStudyCards()`/`getStats()` against the seeded test DB with a generous bound; query cost is far less noisy than browser paint metrics.
3. **Least stable — browser timings** (TTFB/FCP via the Performance API): if kept, use median-of-N, generous thresholds (+50% headroom), and treat as recorded trend data rather than a hard gate initially.

**Warning signs:**
- Perf pass/fail flipping with no code change
- Threshold bumps appearing in commits to "fix CI"

**Phase to address:** perf phase (after e2e-setup). Define which layer each perf requirement uses before writing tests.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `force-dynamic` / disable caching globally | Staleness "fixed" everywhere at once | Every navigation pays serverless+Turso round-trip; the exact prior regression | Never for this app — this is the incident being repaired |
| `useEffect` prop→state sync without guards | Refreshed props flow into shells | Clobbers in-flight local edits (CardsClient); fights `set-state-in-effect` lint | Only with explicit per-shell reconciliation logic |
| `workers: 1` for all E2E | Zero DB-race class | Suite runtime grows linearly with coverage | Fine at v1.6 scale; revisit past ~5 min runtime |
| Seeding test data through the UI | No seed script to write | Slow, brittle, couples every test to the CRUD UI | Only for the one test *covering* the CRUD UI |
| `reuseExistingServer: true` on port 3000 | Fast local iteration | Silently tests against the dev server + prod env | Only with a dedicated E2E port |
| Hard-gating browser perf timings from day one | Feels rigorous | Flaky gate erodes trust in the whole suite | Start as recorded trend; promote to gate once variance is known |
| `retries: 2` to mask flakes | Suite goes green | Real races (Pitfalls 10–11) hide until they bite in prod | Never as the *fix*; acceptable as CI belt-and-braces after root-causing |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Freshness fix × E2E | Landing the fix with no automated regression test (the prior incident), or writing staleness tests before infra exists | e2e-setup (or at least the nav/staleness + first-paint tests) lands first; the fix's UAT is "navigate back after study/sync shows fresh counts" in a **production build** |
| `router.refresh()` × E2E | Asserting fresh UI immediately after the refresh call | Wait for the RSC re-fetch (response/content-based `expect`) — refresh is async |
| Optimistic review POST × freshness refresh | Session-complete refresh racing the last fire-and-forget review write | Await/observe the final `/api/review` response before refreshing, or accept and document one-card eventual consistency |
| middleware auth × Playwright request context | Cookie set on the page context only; `request.*` API calls get 401/redirects | Share `storageState` with the request context, or add the `ks_auth` cookie there too |
| Prisma × test DB | Assuming the Turso DDL gotcha applies to tests | `prisma db push` works against `file:` URLs — one-command schema setup in global setup |
| Cron route (`/api/cron/sync`) × E2E | Letting a test trigger real sync (Google Docs + Opus) | Test auth behavior only (401 without bearer); never the real pipeline |
| Vercel deploy × E2E | Assuming local E2E covers Vercel-specific behavior (cold starts, 60s limit) | E2E covers app logic; keep the existing manual prod smoke habits for platform behavior |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-navigation dynamic render against Turso | Every tab tap waits on serverless + DB RTT; "tabs take forever" | Invalidate at mutation boundaries only; keep prefetch + Router Cache for untouched routes | Immediately — Turso RTT from a Vercel function is per-request |
| `router.refresh()` on every grade | 20+ extra `getStudyCards` runs per session; grade jitter returns (undoing UX-01) | Session-boundary refresh only | First session |
| E2E doing a full `next build` per local iteration | 2+ min fixed overhead each run | `reuseExistingServer` on the dedicated port | Developer patience, day one |
| Seeding a large deck per test | Suite runtime balloons | One global seed + targeted per-test rows | ~20 tests |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing `playwright/.auth/*.json` storageState | Leaks the deterministic `ks_auth` HMAC cookie — a **permanent** auth bypass (stateless HMAC, no expiry, no revocation short of rotating `AUTH_SECRET`) | Write under `outputDir` or gitignore `playwright/.auth/`; never commit |
| Real `AUTH_SECRET`/`APP_PASSWORD` in `playwright.config.ts` | Secrets in source | Test-only values via `webServer.env` from a gitignored `.env.test` |
| E2E env falling through to production `DATABASE_URL` | Test writes destroy real FSRS/ReviewLog history | Fail-fast host guard in global setup (reuse the Phase-22 print-before-write pattern) |
| Loosening `middleware.ts` allowlist "for testability" | Auth bypass shipped to production | Tests authenticate properly (storageState/cookie injection); zero middleware changes for tests |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Freshness via slow navigation | The instant app becomes sluggish everywhere — the reported incident | Mutation-boundary invalidation; skeleton floor for any unavoidably-dynamic path |
| Refresh mid-session | Queue resets, cards repeat, undo breaks | Session-boundary refresh only |
| Refresh visual jank | Content flashes/reflows while the user is looking at the page | `router.refresh()` preserves client state per docs; verify no layout jump on Home after session-complete |
| Stale-but-fresh race | Home shows one more due card than reality right after a session | Await the last review write before refresh, or accept + document |

## "Looks Done But Isn't" Checklist

- [ ] **Freshness fix:** verified in `npm run build && npm start`, not just dev — dev doesn't reproduce production Router Cache behavior
- [ ] **Freshness fix:** browser **back/forward** specifically tested (not just tab taps) — back/forward ignores `staleTimes`
- [ ] **Freshness fix:** first-load HTML still contains real data (RSC-01..04 intact) — view-source or E2E content assertion; no empty-state flash
- [ ] **Freshness fix:** every `*Client.tsx` receiving refreshed props actually *uses* them (Pitfall-2 audit per shell)
- [ ] **E2E:** suite fails fast on a `libsql://` `DATABASE_URL` — prove it once by deliberately running with prod env
- [ ] **E2E:** storageState file gitignored and regenerated per run
- [ ] **E2E:** full suite green **twice consecutively** — catches order/race flakes before they're baked in
- [ ] **E2E:** zero `waitForTimeout`; `reducedMotion: 'reduce'` set globally
- [ ] **Perf tests:** thresholds validated against ≥5 runs' variance before becoming a gate
- [ ] **Sync coverage:** no test path reaches the real Google Doc or Claude API (check Anthropic usage after a suite run)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Freshness fix regresses navigation speed again | LOW if caught by the E2E baseline pre-merge; MEDIUM post-deploy | Revert the caching-mode changes (config-level); re-diagnose per Pitfall 1; the E2E baseline is the tripwire this milestone must install |
| E2E ran against production Turso | HIGH | Turso point-in-time restore / snapshot if available; audit `ReviewLog`/`StudyDay`/`Card` rows by test-run timestamp window; this is why the host guard is task #1 |
| Flaky suite erodes trust | MEDIUM | Quarantine (`test.fixme`), root-cause timing/DB races, then restore; never retry-mask as the fix |
| `useState(initialProps)` desync shipped | LOW | Per-shell fix (derive or reconcile); add the back-nav E2E assertion that would have caught it |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Wrong cache layer / blanket force-dynamic | freshness (diagnosis-first plan) | Written diagnosis artifact; diff contains no `force-dynamic`/`no-store`; build-output rendering modes unchanged |
| 2. `useState(initialProps)` ignores refresh | freshness | Per-shell reconciliation decision in PLAN; E2E: back-nav shows post-mutation data |
| 3. Refresh at wrong moment | freshness | Grep: no `router.refresh` in grade handlers; manual UAT of mid-session stability |
| 4. First-paint regression | freshness (invariant) + e2e-setup (test lands **first**) | E2E asserts server-rendered content on first load + skeleton on tab nav |
| 5. DTO/pipeline boundary breaks | freshness | Code review: no `Date` in changed prop interfaces; new paths call existing `lib/` functions |
| 6. New cache layers as "fix" | freshness (scope guard) | Diff contains no `use cache`/`unstable_cache`/`staleTimes` |
| 7. E2E against production Turso | e2e-setup, first task | Host guard exists and demonstrably fails on `libsql://` |
| 8. Per-test login | e2e-setup | Setup project + storageState in config; suite runtime sane |
| 9. Testing against `next dev` | e2e-setup | `webServer.command` is build+start on a dedicated port |
| 10. Parallel DB races | e2e-setup | `workers: 1` in config; suite green twice consecutively |
| 11. Timing flakes (animations, fire-and-forget writes) | e2e-setup (conventions) + e2e-coverage | `reducedMotion` set; zero `waitForTimeout`; grade tests wait on `/api/review` responses |
| 12. Flaky perf gates | perf phase | Behavioral proxies preferred; browser timings median-of-N with recorded variance |

## Sources

- [Next.js docs — useRouter / router.refresh](https://nextjs.org/docs/app/api-reference/functions/use-router) — refresh semantics, client-state preservation (MEDIUM, official)
- [Next.js docs — Caching guide](https://nextjs.org/docs/app/guides/caching) — four cache layers, force-dynamic ≡ no-store on every fetch (MEDIUM, official)
- [vercel/next.js #69979 — Stale data after navigation with SSR (App Router)](https://github.com/vercel/next.js/issues/69979) (MEDIUM)
- [vercel/next.js discussion #54075 — Deep Dive: Caching and Revalidating](https://github.com/vercel/next.js/discussions/54075) — back/forward restores from Router Cache regardless of staleTimes (MEDIUM)
- [vercel/next.js #43650](https://github.com/vercel/next.js/issues/43650) / [discussion #44056](https://github.com/vercel/next.js/discussions/44056) — router.refresh state-loss edge cases (MEDIUM)
- [joulev.dev — Yes, the Next.js Router Cache is Actually Good](https://joulev.dev/blogs/yes-nextjs-router-cache-is-actually-good) (LOW, community)
- [Playwright docs — Authentication (setup project + storageState)](https://playwright.dev/docs/auth) (MEDIUM, official)
- [Playwright docs — Parallelism / worker isolation](https://playwright.dev/docs/test-parallel) (MEDIUM, official)
- [microsoft/playwright #33699 — isolated tests against a real database](https://github.com/microsoft/playwright/issues/33699) (MEDIUM)
- [Checkly — Measuring page performance with Playwright](https://www.checklyhq.com/docs/learn/playwright/performance/) — noise, medians, threshold margins (MEDIUM)
- Community guides on Next.js+Prisma E2E (dev-vs-build flakiness, DB isolation): Makerkit, dev.to, TestDino (LOW individually, cross-consistent)
- **This repo (HIGH, primary):** `.planning/PROJECT.md` (v1.2 RSC/DTO decisions; Out-of-Scope `unstable_cache` ruling; UX-01 optimistic grading), `CLAUDE.md` (dev-vs-build RSC testing gotcha; fire-and-forget review saves; Turso DDL constraint; middleware/`ks_auth` auth shape; Phase-22 dry-run/host-print pattern), and the user-reported prior staleness-fix regression ("all tabs take forever to load even on the first try")

---
*Pitfalls research for: v1.6 Freshness, Performance & E2E Testing (Korean Study app)*
*Researched: 2026-07-10*
