# Phase 35: Service Worker & Offline Review Queue - Research

**Researched:** 2026-08-10
**Domain:** PWA service workers (Next.js 16 App Router + Turbopack), precache manifest generation, IndexedDB durable queues, offline-first sync
**Confidence:** MEDIUM-HIGH — architecture is well-grounded in verified in-repo code and a verified production build; the two genuinely open technical calls (navigation-request caching strategy, precache scope) are flagged as Open Questions rather than asserted as fact.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-00 (non-negotiable, carried in):** The offline review queue's IndexedDB storage must NOT live inside the buildId-namespaced `ks-cache-<buildId>` database `lib/local-cache.ts` (Phase 34) already opens. That database is deliberately opened fresh (old buildId's database is simply never reopened again) on every new buildId — Phase 34's own D-00 rule 4. That is exactly the trigger a review queue must survive: a deploy landing while a device is offline with unflushed reviews must not silently orphan them in a database keyed to a buildId the app will never open again. The queue needs its own database (or at minimum its own non-buildId-keyed store), opened independently of the version-check/build-ID cache-invalidation logic that governs the route-DTO cache. — **Reversibility:** one-way.
- **D-01:** Phase 35 adds new proactive prefetch logic for the offline study pool — it does not rely solely on whatever Phase 34's existing per-route cache already captured from the last `/study` visit. — Reversible.
- **D-02:** The warm runs on every `HomeClient.tsx` mount, not tied to sync completion.
- **D-03:** The warm fetches exactly the due session — the same `getStudyCards()` call `/study` already makes (`scope='due'`, capped at `sessionSize`, default 20) — not a bigger "due + ahead" buffer.
- **D-04:** The warm always fetches the plain, unfiltered "everything" due pool — it does not read or respect a lesson-range filter the user may have set on `/study`.
- **D-05:** TTS and tap-to-gloss keep their existing behavior unchanged. `AudioButton.tsx`'s `speechSynthesis` fallback is untouched. `GlossProvider.tsx`'s existing generic "Couldn't find a gloss for X" message is accepted as-is; no offline-specific copy is added.
- **D-06:** The `GlossProvider.tsx` "Add as card?" false-positive is explicitly out of scope. Not fixed, not queued in this phase.
- **D-07:** A new-deploy-ready state surfaces via a `Toast` ("Update available — tap to refresh"), reusing `components/Toast.tsx`. Tapping it calls `skipWaiting()` + reload. The service worker must never force-reload the page unprompted, especially mid-study-session.
- **D-08:** Dismissing the toast without tapping does not pin the device to the old version. The waiting service worker still takes over the next time the app is fully closed and relaunched, regardless of dismiss. — Reversible.
- **D-09:** The service worker update check is explicitly triggered (`registration.update()`) on the same foreground-boundary events `components/FreshnessWatcher.tsx` already listens for (`visibilitychange`/`pageshow`/`online`) — not left to the browser's default per-navigation check alone.
- **D-10:** Queued-but-not-yet-flushed offline reviews get no new UI. The existing "Offline" pill (`Nav.tsx`, shipped Phase 34) is the only signal a user gets; reviews queue and flush invisibly on reconnect. — Reversible.
- **D-11:** If a queued review ultimately fails to flush permanently (a 4xx after reconnecting — e.g. the card was deleted while the device was offline), that surfaces via a `Toast`, consistent with REVIEW-04's existing "toast only after retries exhausted" precedent.

### Claude's Discretion

- **Service worker implementation approach** (hand-rolled `Cache`/`fetch` event handling vs. a library like Workbox/Serwist) — no such dependency exists in `package.json` today. Research's call, weighed against Next.js 16's Turbopack build (verify library Turbopack-compatibility before committing) and this project's general-but-not-absolute preference for fewer new dependencies. **Resolved by this research: hand-roll — see Summary and Standard Stack.**
- **Exact file/location for the SW registration + update-check + update-toast wiring** (a new `lib/service-worker.ts` + a small mount component/provider, vs. folding into `Nav.tsx` or `FreshnessWatcher.tsx` directly) — architecture call, not a product decision. **Addressed by this research: `lib/service-worker.ts` + `components/ServiceWorkerProvider.tsx`, see Recommended Project Structure.**
- **The service worker's own cache-versioning scheme** — whether it keys its `CACHE_NAME` off the same `buildId` `GET /api/version` already exposes (Phase 34), or maintains its own separate version token. **Resolved by this research: reuse `/api/version`'s `buildId` — see Architecture Pattern 1's "two distinct build IDs" note.**
- **Exact offline-queue flush ordering** (strictly sequential vs. parallel-with-per-card-locking) — not discussed as a user preference; ordering-within-a-card is an implementation detail. **Resolved by this research: sequential, enqueue-order — see Alternatives Considered and Pitfall 4.**

### Deferred Ideas (OUT OF SCOPE)

- `GlossProvider.tsx`'s "Add as card?" false-positive (always shows "Added" even when the underlying `POST /api/cards` silently fails, e.g. offline) — explicitly declined for this phase (D-06).
- Offline-specific copy in the tap-to-gloss popover ("Unavailable offline" vs. the existing generic "Couldn't find a gloss") — considered and declined (D-05).
- A live "N pending sync" queued-review indicator — considered and declined in favor of full silence (D-10).
- Proactively warming a bigger "due + ahead" buffer (beyond the single due session, D-03) — considered and declined as unnecessary scope for a first offline pass.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| OFFLINE-01 | A versioned service worker precaches the app shell, JS/CSS bundles, fonts (`public/fonts/`), and icon set; static assets are cache-first, `/api/*` is network-first | Architecture Patterns 1–3 (precache manifest generation, skipWaiting/clients.claim sequencing, navigation fallback fetch handler); Common Pitfalls 1, 3, 5; Validation Architecture rows 1–2 |
| OFFLINE-02 | A study session runs on cached cards in airplane mode | Architecture Patterns 3, 5 (navigation offline fallback + the `localStorage` buildId-fallback fix that makes Phase 34's IndexedDB cache reachable offline); Common Pitfalls 1, 2; Validation Architecture row 3 |
| OFFLINE-03 | Reviews taken offline are queued in IndexedDB (reusing the existing idempotency-key discipline from `postReviewWithRetry`) and flush exactly once when the app returns online or is reopened in the foreground — no reliance on the Background Sync API | Architecture Pattern 4 (offline queue schema + sequential flush); Don't Hand-Roll (idempotency reuse); Common Pitfall 4; Validation Architecture rows 4–5 |
</phase_requirements>

## Summary

Phase 35 has two halves that are more tightly coupled than the CONTEXT.md success criteria suggest at first read. Half one (OFFLINE-01/02) is a versioned service worker that precaches the app shell; half two (OFFLINE-03) is an IndexedDB-durable review queue. The coupling: **Phase 34's own e2e suite already proves, empirically, that a genuine offline cold launch fails today** — `e2e/local-cache-offline.spec.ts`'s header comment states that with `context.setOffline(true)`, any full document navigation (`page.goto`, `page.reload`, even a `<Link>` soft-nav that falls through to a real request) currently fails hard with `net::ERR_INTERNET_DISCONNECTED`, because there is no static HTML shell and no service worker yet — that gap is explicitly named as "Phase 35's scope, OFFLINE-01 precaching." This means the SW's job is not just "make JS/CSS/fonts/icons available offline" — it must also serve a cached **navigation** (HTML/RSC) response, or SC2 ("tapping the home-screen icon launches the app... in airplane mode") cannot pass, full stop. This is the single most important finding of this research and is elaborated in Pitfall 1 and Architecture Pattern 3 below.

The second load-bearing finding, also verified directly in the four `*Client.tsx` shells (`StudyClient.tsx:224`, `CardsClient.tsx:570`, `HabitsClient.tsx:147`, `HomeClient.tsx:177`): every one of Phase 34's cache-read-on-mount effects contains the identical guard `if (cancelledRef.current || !ctx) return // offline cold path — RSC-provided initialCards already rendered`. `ctx` comes from `fetchCacheContext()`, which itself does a live `fetch('/api/version')` to learn the `buildId` needed to open the right `ks-cache-<buildId>` IndexedDB database. **When that fetch fails (because the device is offline), Phase 34's own IndexedDB cache — the thing OFFLINE-02 wants to serve "cached cards" from — is never read.** Nothing in this codebase persists `buildId` anywhere synchronous (`localStorage` is not used anywhere client-side today — confirmed via repo-wide grep). Phase 35 needs to close this gap (Pitfall 2) for OFFLINE-02 to be genuinely satisfied on a true cold launch, not just "already-open tab loses network mid-session" (which Phase 34 already handles and already has e2e coverage for).

On the "hand-roll vs. library" question: this research found a genuinely maintained, Turbopack-native option (`@serwist/turbopack`, confirmed shipped and working with both `next dev --turbo` and `next build` as of a backport that closed [serwist/serwist#54](https://github.com/serwist/serwist/issues/54) in December 2025) — so "no library exists that isn't webpack-only" is **not** true in 2026 the way it might have been in 2025. That said, this project's own asset footprint, verified via an actual local production build (`npm run build`), is small and simple: `.next/static/` totals **1.1MB across 23 JS chunks + 1 CSS file + a `media/` directory of hashed woff2/ico files**, all content-hashed by filename, all discoverable by a plain recursive directory walk with zero manifest-format knowledge required. That is exactly the class of problem Workbox/Serwist's manifest-injection machinery exists to solve for *complex, multi-manifest, non-hashed-filename* build outputs — and it is not the class of problem this app actually has. `@serwist/turbopack`'s own architecture (a Route-Handler-served, esbuild-compiled SW, two new peer deps `esbuild`/`esbuild-wasm`, disabled in dev, a distinct package from the more battle-tested `@serwist/next`) is also a materially different, newer, less-proven mechanism than a static `public/sw.js`. **Primary recommendation: hand-roll**, using a small post-build Node script (no new dependency — `fs.readdirSync(..., { recursive: true })` is native in this project's Node version) that walks `.next/static/` and writes the precache list directly into a generated `public/sw.js`, reusing the already-installed `idb` package for the offline queue's own database. This mirrors the two prior "hand-rolled beat the library" outcomes in Phase 34 (`local-cache.ts`, `SwipeRow.tsx`-style custom logic vs. heavier alternatives) — see Architecture Pattern 1 for the concrete script and Alternatives Considered for the Serwist path documented honestly for the planner to weigh.

**Primary recommendation:** Hand-roll a versioned `public/sw.js` (generated by a post-`next build` Node script that globs `.next/static/`), reusing `idb` (already installed) for a **separate**, non-buildId-namespaced `ks-offline-queue` database; extend the existing `fetchCacheContext()` / `readCache` call sites with a `localStorage`-persisted last-known `{version, buildId}` fallback so OFFLINE-02's cold-launch path can actually reach IndexedDB; and add a `service-worker.ts` + `offline-queue.ts` pair of small owning modules, following the codebase's established one-file-per-concern convention.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App-shell precaching (JS/CSS/fonts/icons) | Browser / Client (Service Worker) | CDN / Static (`_next/static/*`, `public/*`) | The SW is a client-installed cache layer sitting in front of the CDN-served static assets; it owns the caching decision, the CDN owns origin delivery |
| Navigation (HTML/RSC) offline fallback | Browser / Client (Service Worker) | Frontend Server (SSR) | SSR produces the real response when online; the SW's cache is a fallback layer only reachable client-side |
| `/api/*` network-first policy | Browser / Client (Service Worker) | API / Backend | The SW intercepts the fetch before it leaves the browser; the API itself is unaware of and unmodified by this phase |
| Offline study-pool warm fetch (D-01–D-04) | Frontend Server (SSR via existing `getStudyCards()`) | Browser / Client (`HomeClient.tsx` mount effect) | Reuses the existing server-side query function; only the *trigger* (Home mount) is client-side |
| Offline review queue storage | Browser / Client (IndexedDB via `idb`) | — | Purely a client-side durability concern; server (`/api/review`) is unaware a queue exists — it just sees another `POST` with an idempotency key |
| Review queue flush | Browser / Client (queue reader) | API / Backend (`POST /api/review`, unmodified) | Flush logic lives entirely client-side; it replays the exact same request shape `postReviewWithRetry` already sends — **no server-side changes needed for OFFLINE-03** (verified by reading `app/api/review/route.ts` in full — its idempotency-key handling is already correct for a delayed/replayed request) |
| SW update detection + user-gated activation | Browser / Client (Service Worker + a small provider component) | — | `registration.update()`, `skipWaiting()` messaging, and the `Toast` UI are all client-side; no new API route needed |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `idb` | ^8.0.3 (already in `package.json`, verified) | Thin Promise wrapper over IndexedDB — reused for the offline queue's own database, same style as `lib/local-cache.ts` | Already the project's chosen IndexedDB abstraction (Phase 34); adding a second `idb`-based module for the queue is zero new dependency surface |
| — (no new npm package) | — | Precache manifest generation via a post-build Node script (`fs.readdirSync(dir, { recursive: true })`) | Node 20+ supports the `recursive` option natively (this project's dev Node is 25.8.2, verified `.claude/CLAUDE.md`); no `glob` package needed for a flat, already content-hashed asset directory |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fake-indexeddb` | ^6.2.5 (already a devDependency, verified `package.json`) | Vitest polyfill for testing the offline-queue module's pure logic (enqueue/dequeue/flush ordering) without a browser | Already used for `lib/local-cache.ts` tests per `34-PATTERNS.md`; reuse verbatim for `lib/offline-queue.ts` tests |
| `@playwright/test` | ^1.61.1 (already a devDependency) | e2e proof of SC2 (cold offline launch) and SC3 (exactly-once flush after force-quit) via `context.setOffline(true)` / `browserContext` restart | Already this project's e2e tool; `playwright.config.ts` already runs the harness against a **production build** (`npm run build && npm run start`, verified by reading the file), which is required — SW behavior must not be tested against `next dev` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `public/sw.js` + post-build glob script | `@serwist/turbopack` (npm, `serwist` core + `@serwist/turbopack`, both `9.5.12` as of this research — confirmed via `npm view`) | **Genuinely Turbopack-native as of Dec 2025** (resolves [serwist/serwist#54](https://github.com/serwist/serwist/issues/54)) — no `--webpack` flag needed for dev *or* build, unlike the older `@serwist/next` package which still requires `next build --webpack`. But: (1) architecturally different — the SW is served through a Next.js **Route Handler** (`app/serwist/[path]/route.ts`) compiled on-demand via `esbuild`/`esbuild-wasm` peer deps, not a static file, a materially newer and less battle-tested mechanism; (2) this project's actual precache-manifest problem (23 hashed JS files + 1 CSS + a media dir, verified via a real local build) is exactly the "trivial directory walk" case that doesn't need Workbox/Serwist's manifest-injection machinery — that machinery earns its complexity when asset filenames *aren't* content-hashed or origins are multi-manifest, neither of which is true here; (3) `@serwist/turbopack`'s own default `runtimeCaching` presets and `reloadOnOnline`/`cacheOnNavigation` flags are opinionated in ways that would need to be overridden anyway to satisfy D-07/D-08/D-09's exact toast-gated `skipWaiting()` sequencing — so the "less code to write" argument is weaker than it first appears. **Recommendation: hand-roll**, but this alternative is real and maintained enough that the planner/user may reasonably choose it instead — see Package Legitimacy Audit below. |
| Sequential per-entry flush (recommended) | Parallel flush with per-card locking | `app/api/review/route.ts`'s optimistic-concurrency check (`updateMany({ where: { cardId, reps: cardReview.reps, lastReview: cardReview.lastReview } })`, verified by reading the file in full) reads *current server state* fresh on every request — it does not depend on client-supplied fingerprints. This means two queued reviews of the *same* card, if flushed out of enqueue order, would still both succeed individually but would apply the FSRS grades in the wrong chronological order, silently producing a different final `CardReview` state than the user actually experienced. Sequential, enqueue-order flush avoids this entirely and is simpler to reason about; parallel-with-locking buys nothing here since the queue is rarely more than a handful of entries (one offline study session) and the correctness risk isn't worth the added complexity. |

**Installation:** No new dependency required for the primary recommendation. `idb` is already installed.

**Version verification:** `idb` confirmed installed at `^8.0.3` via `package.json` read directly (not searched). `serwist`/`@serwist/turbopack` confirmed at `9.5.12` via `npm view serwist version` / `npm view @serwist/turbopack version`, run this session.

## Package Legitimacy Audit

No new package is required for the primary (hand-rolled) recommendation — `idb` is already installed and was audited in Phase 34's own research. The two Serwist packages below were investigated as the "Alternatives Considered" library option and are documented here for completeness, in case the planner or user prefers that path.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `idb` | npm | published 2025-05-07 (this major version) | 23.2M/wk | github.com/jakearchibald/idb | OK | Already installed (Phase 34) — no action |
| `serwist` | npm | latest version published 2026-07-22 | 558K/wk | github.com/serwist/serwist | SUS (`too-new`) | Not adopted for primary path — see note below |
| `@serwist/turbopack` | npm | latest version published 2026-07-22 | 82K/wk | github.com/serwist/serwist | SUS (`too-new`) | Not adopted for primary path — see note below |

**Note on the `SUS`/`too-new` verdict:** the automated legitimacy check flags both `serwist` packages as "too-new" because their *most recent published version* landed 2026-07-22 (this repo's clock is 2026-08-10, so that's ~3 weeks old for the latest patch release). This is a signal about **release recency, not package trustworthiness** — the underlying project (`serwist`, the maintained successor to `next-pwa`) has 558K weekly downloads, a real GitHub org, no deprecation flag, and no suspicious `postinstall` script (confirmed via `npm view serwist scripts.postinstall`, which returned nothing). `@serwist/turbopack` specifically is a newer sub-package (the Turbopack-native integration, backported into the 9.x line in December 2025 rather than gated behind an unreleased Serwist 10) — genuinely less battle-tested *as a Turbopack integration* than the core package's webpack-based history, which is the real caveat, not registry-legitimacy. **Packages discovered via WebSearch and cross-referenced against the npm registry this session; the package *names* were sourced from official documentation (`serwist.pages.dev/docs/next/turbo`) and a closed GitHub issue, not training-data guesswork — tagged `[CITED: serwist.pages.dev]` accordingly, not `[ASSUMED]`.** If the planner chooses this alternative over the hand-rolled path, add a `checkpoint:human-verify` task before installing, per this project's package-legitimacy protocol for `SUS`-flagged packages.

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `serwist`, `@serwist/turbopack` — only relevant if the planner selects the library alternative over the hand-rolled primary recommendation.

## Architecture Patterns

### System Architecture Diagram

```text
                         ┌─────────────────────────────┐
                         │   Browser (installed PWA)    │
                         └───────────────┬───────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     │   fetch event intercepted by public/sw.js │
                     └────────────────────┬────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
    request.mode === 'navigate'   /_next/static/* , /fonts/* ,   /api/*
    (HTML/RSC document)            icon-*.png, apple-icon.png   (data)
              │                           │                           │
       NETWORK-FIRST                CACHE-FIRST                NETWORK-FIRST
       (cache fallback)          (serve from precache,        (no offline fallback —
              │                   revalidate in bg)             /api/* failures are
      ┌───────┴────────┐                 │                     handled by existing
      │                │                 │                     postReviewWithRetry /
   ONLINE:          OFFLINE:        cache hit? →                Phase 34 IndexedDB
   fetch → cache     serve last      serve immediately           route cache, NOT
   → serve fresh     cached HTML     miss → network → cache      by the SW)
                      (from a prior                                     │
                      online visit)                                     │
                                                                          ▼
                                                            ┌─────────────────────────┐
                                                            │  StudySession.tsx        │
                                                            │  submitReview()           │
                                                            └──────────┬────────────────┘
                                                                       │
                                                    navigator.onLine === false
                                                    OR postReviewWithRetry exhausts
                                                    with reason:'network'
                                                                       │
                                                                       ▼
                                                     ┌─────────────────────────────┐
                                                     │ lib/offline-queue.ts         │
                                                     │ idb: ks-offline-queue DB      │
                                                     │ (own DB — NOT buildId-keyed,  │
                                                     │  per locked constraint D-00)  │
                                                     └──────────────┬───────────────┘
                                                                    │
                                       flush triggered by: 'online' event, OR
                                       visibilitychange (hidden→visible), OR
                                       pageshow (bfcache persisted:true)
                                                                    │
                                                                    ▼
                                          sequential, enqueue-order loop:
                                          POST /api/review {cardId, rating, idempotencyKey}
                                          (same idempotencyKey generated at enqueue time —
                                           server's ReviewLog UNIQUE constraint makes a
                                           re-flush of an already-applied entry a safe no-op)
                                                                    │
                                       200 → delete queue entry, continue
                                       4xx → delete queue entry, show Toast (D-11)
                                       network error → STOP, leave remaining entries queued,
                                                        retry on next flush trigger
```

### Recommended Project Structure

```
lib/
├── service-worker.ts       # register(), update-check (registration.update()),
│                            # postMessage-based skipWaiting trigger — owns
│                            # nothing about WHEN to check (that's the shared
│                            # foreground-resume hook below), only HOW
├── offline-queue.ts         # idb-based ks-offline-queue DB: enqueueReview(),
│                            # flushQueue(), schema — mirrors lib/local-cache.ts's
│                            # style (lazy DB open, try/catch-to-undefined)
├── useForegroundResume.ts   # OPTIONAL shared hook extracting the coalesced
│                            # visibilitychange/pageshow/online listener pattern
│                            # FreshnessWatcher already owns for router.refresh() —
│                            # new consumers (SW update check, queue flush) reuse
│                            # the EVENT SET without duplicating raw listener code
│                            # or touching FreshnessWatcher itself (do-not-delete)
components/
├── ServiceWorkerProvider.tsx # small mount component (registers SW, owns the
│                              # update-available Toast state) — placed in
│                              # app/layout.tsx alongside FreshnessWatcher/
│                              # ThemeWatcher/GlossProvider
scripts/
├── gen-sw.mjs                # post-`next build` script: walks .next/static/,
│                              # writes the precache list + CACHE_NAME (from
│                              # buildId) directly into public/sw.js
public/
├── sw.js                     # generated file (add to .gitignore — regenerated
│                              # every build, matches the existing convention
│                              # of NOT committing generated PNGs from
│                              # gen-icons.mjs... actually gen-icons.mjs output
│                              # IS committed per CLAUDE.md ("commit the PNGs") —
│                              # planner should decide gitignore vs. commit;
│                              # gitignore is more consistent with this file
│                              # changing on every single deploy, unlike icons
```

### Pattern 1: Precache manifest generation (post-build glob, no library)

**What:** After `next build` completes, walk `.next/static/` recursively and generate the exact list of `/_next/static/...` URLs to precache, plus the fixed list of `public/fonts/*` and icon files. Write the whole thing into a generated `public/sw.js`.

**Verified build output this session** (`npm run build`, Next.js 16.3.0, Turbopack — confirmed the default bundler for both `next dev` and `next build` in this Next version, no `--webpack` flag present anywhere in `package.json`):
```
.next/static/
├── <NEXT_BUILD_ID>/          # Next's OWN internal build id (e.g. 72UDLR3hTxEMi-VolHNx7)
│   ├── _buildManifest.js     # needed for client-side soft-navigation route→chunk lookup
│   ├── _ssgManifest.js
│   └── _clientMiddlewareManifest.js
├── chunks/                   # 23 content-hashed .js files, verified count this session
│   └── *.js
├── chunks/*.css               # 1 file, verified this session
└── media/                    # self-hosted next/font woff2 subsets + favicon.ico,
                                # content-hashed filenames, verified this session
    └── *.woff2, favicon.*.ico
```
Total size verified this session: **1.1MB**. Small enough to precache wholesale without a size budget concern.

**IMPORTANT — two distinct "build IDs" exist in this codebase, do not conflate them:**
1. **Next's own internal `.next/BUILD_ID`** (e.g. `72UDLR3hTxEMi-VolHNx7`, verified by reading `.next/BUILD_ID` this session) — embeds into the `_next/static/<this>/...` URL path for the three manifest files above. Changes on every build unless `generateBuildId` is set in `next.config.ts` (confirmed NOT set — file read in full this session, contains only a placeholder comment).
2. **The app's own `buildId`** exposed by `GET /api/version` (sourced from `VERCEL_GIT_COMMIT_SHA` ?? `VERCEL_DEPLOYMENT_ID` ?? `'local-dev'`, verified by reading `app/api/version/route.ts`) — used by `lib/local-cache.ts` for `ks-cache-<buildId>` IndexedDB namespacing.

These two happen to change together on every real deploy (a deploy = one new build = both change), so it is safe and consistent for the SW's own `CACHE_NAME` to reuse `/api/version`'s `buildId` (this resolves Claude's Discretion item 3 — no separate version token needed). But the **precache URL list itself** must come from walking `.next/static/` directly (a recursive glob), never by constructing paths that assume a fixed buildId segment — Next's internal build ID is not knowable ahead of time and the top-level `chunks/`/`media/` files aren't nested under it anyway.

**Example script (`scripts/gen-sw.mjs`):**
```javascript
// Source: derived from verified .next/static/ structure this session — no
// external doc dependency, this is a plain filesystem walk.
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { recursive: true })) {
    const full = join(dir, entry)
    if (statSync(full).isFile()) out.push(full)
  }
  return out
}

const staticFiles = walk('.next/static').map(
  (f) => '/_next/static/' + relative('.next/static', f).split('\\').join('/'),
)

const shellAssets = [
  '/fonts/PretendardVariable.woff2', // verified: app/globals.css:15 @font-face src
  '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-icon.png', // verified: app/manifest.ts + app/layout.tsx metadata.icons
]

const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? 'local-dev'
const precacheList = [...staticFiles, ...shellAssets]

const template = readFileSync('scripts/sw-template.js', 'utf8')
writeFileSync(
  'public/sw.js',
  template
    .replace('__CACHE_NAME__', JSON.stringify(`ks-shell-${buildId}`))
    .replace('__PRECACHE_LIST__', JSON.stringify(precacheList)),
)
```
Wired into `package.json`'s `build` script: `"build": "prisma generate && next build && node scripts/gen-sw.mjs"` — **this must run automatically as part of the deploy build**, unlike `gen-icons.mjs`'s documented manual-run-then-commit convention, because the precache list and `CACHE_NAME` both change on every single deploy (not just icon edits).

### Pattern 2: skipWaiting / clients.claim / update-toast sequencing (D-07/D-08/D-09)

**What:** The SW must never force-reload an open tab mid-study-session. Standard pattern: the new SW installs and caches its own versioned `CACHE_NAME`, then **waits** — it does not call `self.skipWaiting()` automatically. The client detects a waiting worker via `registration.waiting` (checked after `registration.update()`, itself triggered on the same foreground-boundary events `FreshnessWatcher` already uses) and shows the `Toast` (D-07). Only a user tap sends a `postMessage({ type: 'SKIP_WAITING' })`, which the SW's `message` listener turns into `self.skipWaiting()`.

```javascript
// public/sw.js — the generated file's fixed (non-templated) logic
const CACHE_NAME = __CACHE_NAME__
const PRECACHE = __PRECACHE_LIST__

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  )
  // No self.skipWaiting() here — D-08: staying on the old version until the
  // user taps the toast OR the tab is fully closed/relaunched is intentional.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('ks-shell-') && k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
```

```typescript
// lib/service-worker.ts — client side
export function registerServiceWorker(onUpdateAvailable: () => void) {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').then((registration) => {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      installing?.addEventListener('statechange', () => {
        // A new worker reached 'installed' while an existing controller is
        // already active — this IS the update case (D-07), not first-install.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          onUpdateAvailable()
        }
      })
    })
    // D-08: a waiting worker still takes over on the NEXT full close+relaunch
    // even if the toast was dismissed — this is the browser's own default
    // behavior (a fresh navigation with no open tab holding the old
    // controller lets `activate` proceed), no extra code needed for this half.
  })
}

export function activateWaitingWorker() {
  navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  })
  // 'controllerchange' fires once the new SW takes control — reload there,
  // not immediately after postMessage (the old SW is still serving until
  // that event fires).
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
}
```

**D-09's exact trigger set** (`registration.update()` on `visibilitychange`/`pageshow`/`online`) — reuse the SAME event names `FreshnessWatcher.tsx` already listens to (verified by reading the file: `visibilitychange` gated on `document.visibilityState === 'visible'`, `pageshow` gated on `e.persisted`, plus a new `online` listener FreshnessWatcher does NOT currently have). Do not literally add code inside `FreshnessWatcher.tsx` itself unless the planner deliberately chooses to (CONTEXT.md's canonical refs call it "do-not-delete," not "do-not-modify," but its own header comment frames its scope narrowly as "the RSC-refresh half" — extending it to also own SW-update-check and queue-flush would broaden a component whose doc comment explicitly enumerates what it does and does not do). The lower-risk option is a small shared hook (`lib/useForegroundResume.ts`) extracting the coalesced-listener pattern, consumed independently by the new `ServiceWorkerProvider` and the queue-flush trigger — same event set, no duplicated raw `addEventListener` code, `FreshnessWatcher` itself untouched.

### Pattern 3: Navigation (HTML/RSC) offline fallback — the gap `e2e/local-cache-offline.spec.ts` documents

**What:** SC1's literal text only specifies two categories — "static assets serve cache-first" and "`/api/*` serves network-first" — but says nothing about page **navigation** requests (the actual document fetch for `/`, `/study`, `/cards`, `/habits`). Verified empirically (not just architecturally) by this repo's own `e2e/local-cache-offline.spec.ts` header comment: "there is no static HTML shell and no service worker in this phase... so ANY full document navigation while `context.setOffline(true)` fails hard with `net::ERR_INTERNET_DISCONNECTED`." Every route in this app is `force-dynamic` (auth + live Prisma reads) — there is no prerendered HTML to fall back to unless the SW itself caches a **previous real response**.

**The fix:** add a third fetch-handler branch for `request.mode === 'navigate'` requests — network-first (so an online user always gets the freshest server-rendered shell + whatever the RSC payload embeds as initial props), falling back to the most recently cached response for that URL when the network fetch fails.

```javascript
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request)) // network-first, no offline fallback —
    return                             // Phase 34's IndexedDB cache + postReviewWithRetry
  }                                     // already own the offline data story for /api/*

  // static assets — cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      return response
    })),
  )
})
```

**Why this composes correctly with Phase 34, not against it:** the SW-cached navigation response only guarantees the page's HTML/JS/React tree can mount at all when offline — it does NOT need to carry fresh data, because Phase 34's client shells already re-read from IndexedDB on mount (once Pitfall 2 below is fixed). The stale RSC props baked into a SW-cached HTML response are a first-paint fallback only; the *actual* "cached cards" OFFLINE-02 asks for come from `lib/local-cache.ts`'s `study` entry, kept fresher by every review (`patchStudyCard` write-through, already shipped) and by the new Home-mount warm-fetch (D-01–D-04, this phase).

### Pattern 4: Offline queue schema and durable write-then-flush-then-delete

**What:** A separate `idb` database (per the locked D-00 constraint — verified from `lib/local-cache.ts`'s own header comment, which documents exactly why a buildId-namespaced DB is the wrong place for this), keyed by an auto-incrementing integer for guaranteed FIFO iteration order (simpler and more robust than sorting by a stored timestamp).

```typescript
// lib/offline-queue.ts
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'ks-offline-queue' // deliberately NOT ks-cache-<buildId> — D-00
const STORE = 'reviews'

export interface QueuedReview {
  id?: number          // autoIncrement key — guarantees FIFO cursor order
  cardId: string
  rating: number        // 1-4, same Grade the server validates
  idempotencyKey: string // generated ONCE at enqueue time (crypto.randomUUID()),
                          // reused unchanged on every flush attempt — mirrors
                          // postReviewWithRetry's existing discipline exactly
  queuedAt: string       // ISO, display/debug only
}

let dbPromise: Promise<IDBPDatabase> | null = null
function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      },
    })
  }
  return dbPromise
}

export async function enqueueReview(entry: Omit<QueuedReview, 'id'>): Promise<void> {
  try {
    const db = await getDb()
    await db.add(STORE, entry)
  } catch {
    // Silent no-op — matches lib/local-cache.ts's established safe-fallback
    // convention. A queue write that can't durably land means the review
    // will fall back to a lost background save, same as today's behavior
    // for a permanent postReviewWithRetry exhaustion with no queue at all.
  }
}

// Sequential flush — see Alternatives Considered for why NOT parallel.
export async function flushQueue(): Promise<void> {
  const db = await getDb()
  let cursor = await db.transaction(STORE).store.openCursor()
  const entries: QueuedReview[] = []
  while (cursor) {
    entries.push(cursor.value)
    cursor = await cursor.continue()
  }
  for (const entry of entries) {
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: entry.cardId, rating: entry.rating, idempotencyKey: entry.idempotencyKey }),
      })
      if (res.ok) {
        await db.delete(STORE, entry.id!)
        continue
      }
      if (res.status >= 400 && res.status < 500) {
        // D-11: permanent failure (e.g. card deleted while offline) — drop
        // the entry and surface a Toast; do not retry forever.
        await db.delete(STORE, entry.id!)
        // caller shows Toast here
        continue
      }
      // 5xx — stop the loop, leave this and all later entries queued.
      break
    } catch {
      // Network error mid-flush — stop, leave remaining entries queued for
      // the next trigger. Do NOT delete; do NOT continue to the next entry
      // (would violate FIFO ordering guarantees for same-card re-grades).
      break
    }
  }
}
```

### Pattern 5: Closing the offline-cold-launch IndexedDB gap (Pitfall 2 fix)

**What:** Persist the last-known `{version, buildId}` to `localStorage` (synchronous, readable with zero network) every time `fetchCacheContext()` succeeds; fall back to it when the live fetch fails.

```typescript
// lib/local-cache.ts addition (or a thin wrapper each *Client.tsx calls instead)
const LAST_CONTEXT_KEY = 'ks-last-cache-context'

export async function fetchCacheContextOrLastKnown(): Promise<CacheContext | null> {
  const live = await fetchCacheContext()
  if (live) {
    try { localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify(live)) } catch {}
    return live
  }
  try {
    const raw = localStorage.getItem(LAST_CONTEXT_KEY)
    return raw ? (JSON.parse(raw) as CacheContext) : null
  } catch {
    return null
  }
}
```
Every `*Client.tsx` mount effect's `if (!ctx) return` guard becomes reachable-with-real-data instead of a dead end when this replaces the bare `fetchCacheContext()` call at each of the four verified call sites (`StudyClient.tsx:223`, `CardsClient.tsx` two call sites, `HabitsClient.tsx:147`, `HomeClient.tsx:176`). **This is the single change that makes OFFLINE-02 literally true for a cold launch** — without it, the SW's cached HTML shell loads, but the study session it renders is whatever was baked into that stale HTML (possibly quite old), not the fresher IndexedDB-cached due pool the Home-mount warm-fetch (D-01–D-04) keeps current.

### Anti-Patterns to Avoid
- **Registering `sync`/`periodicsync` (Background Sync API):** locked out by CONTEXT.md and this project's own `.planning/STATE.md` Blockers list — "iOS/WebKit has no Background Sync API... registering `sync`/`periodicsync` will silently never fire." Do not add this even as defense-in-depth; it adds a false sense of coverage with zero actual iOS behavior.
- **Calling `self.skipWaiting()` unconditionally in the `install` handler:** the single most common hand-rolled-SW mistake — it force-activates the new worker (and, combined with `clients.claim()`, force-reloads open tabs) the instant install finishes, exactly what D-07/D-08 forbid.
- **Precaching by hardcoding `_next/static/<buildId>/...` paths:** Next's own internal `.next/BUILD_ID` is not knowable ahead of a build and is unrelated to the app's `VERCEL_GIT_COMMIT_SHA`-derived `buildId` — always derive the precache list from a build-time directory walk, never from a template string assuming a fixed segment.
- **Enabling the SW during `next dev`:** since Turbopack dev mode hot-reloads chunk content without changing filenames in the same way a production build does, a SW active during `next dev` will serve stale HMR chunks and cause confusing "why isn't my change showing up" bugs. Gate registration on `process.env.NODE_ENV === 'production'` (this is also what `@serwist/next`'s `disable: process.env.NODE_ENV === 'development'` flag does by convention, confirmed via the LogRocket walkthrough fetched this session — same reasoning applies to the hand-rolled path).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB transaction/cursor boilerplate | Raw `indexedDB.open()` callback-style API | `idb` (already installed) | Already the project's chosen abstraction; a second hand-rolled raw-IndexedDB module for the queue would be an inconsistent pattern within the same codebase for no benefit |
| Idempotent replay-safety for the flushed review POST | A new dedup mechanism on the client | The **existing** `idempotencyKey` + server-side `ReviewLog` UNIQUE constraint (verified in `app/api/review/route.ts`) | The server already treats a duplicate `idempotencyKey` as an idempotent 200, not an error — re-flushing an already-applied queue entry (e.g. after a force-quit mid-flush) is already safe with zero new server code |
| Retry/backoff for the flush's individual POSTs | A new retry wrapper | The existing `postReviewWithRetry` shape/backoff constants (`[500, 1500]` ms, 3 attempts, `SaveFailureReason` classification) — factor out its retry core if reuse across both call sites is worth it, but don't invent a second retry policy | Two different backoff/retry policies for the "same logical operation" (`POST /api/review`) sitting in the same codebase would be a maintenance trap |

**Key insight:** almost nothing in this phase's server-side surface needs new code — `POST /api/review`'s idempotency handling was already built correctly for exactly this delayed-replay scenario (verified this session by reading the full route handler, including its P2002/`isUniqueConstraintError` fallback path for a duplicate `idempotencyKey`). The genuine net-new work is entirely client-side: the SW itself, the queue's own storage, and closing the `buildId`-unavailable-offline gap in Phase 34's existing cache-read effects.

## Common Pitfalls

### Pitfall 1: Navigation requests are not covered by SC1's "static vs. `/api/*`" framing
**What goes wrong:** implementing exactly what SC1's text says — cache-first for static assets, network-first for `/api/*` — leaves page navigation requests (`/`, `/study`, `/cards`, `/habits`) completely unhandled by the SW, so they fall through to the browser's default network fetch. Offline, that fetch fails at the network layer before any JS runs.
**Why it happens:** SC1's two-category framing is natural to read as exhaustive, but a Next.js App Router document request isn't a "static asset" (it's dynamically rendered) and isn't `/api/*` either.
**How to avoid:** add the third `request.mode === 'navigate'` branch (Pattern 3 above) — this is the change that actually makes SC2 pass.
**Warning signs:** an e2e test that does `context.setOffline(true)` followed by `page.goto('/study')` (a genuine cold navigation, not an already-mounted page) still errors with `net::ERR_INTERNET_DISCONNECTED` — this is exactly what `e2e/local-cache-offline.spec.ts`'s own header comment describes as the CURRENT (pre-Phase-35) behavior; the Phase 35 test suite must prove this now succeeds.

### Pitfall 2: `fetchCacheContext()` failing offline silently strands the IndexedDB cache
**What goes wrong:** all four `*Client.tsx` shells' mount effects return early with a comment literally naming this as "offline cold path" when `/api/version` can't be reached — meaning Phase 34's `readCache()` is never called, and the component just shows whatever `initialCards`/`initialStats` RSC gave it (which, offline, comes from the SW's cached — possibly stale — navigation response).
**Why it happens:** `buildId` (needed to open the right `ks-cache-<buildId>` database) is currently only obtainable via a live network fetch — there was no reason to solve this in Phase 34, since Phase 34's own scope only covered "already-open tab loses network mid-session," which is exactly why `e2e/local-cache-offline.spec.ts` never tests a cold `page.goto()` offline.
**How to avoid:** Pattern 5 above — persist the last-known `{version, buildId}` to `localStorage` on every successful fetch, fall back to it when offline.
**Warning signs:** a study session started from a genuine cold offline launch shows fewer/older due cards than the same session would show if the tab had simply been backgrounded-then-reopened offline (the latter path already works via existing in-memory React state, not a fresh mount).

### Pitfall 3: `middleware.ts`'s auth matcher does not exclude `/sw.js`
**What goes wrong:** verified by reading `middleware.ts` in full — its `matcher` regex excludes `login`, `api/login`, `_next/static`, `_next/image`, `favicon.ico`, `manifest.webmanifest`, `icon-*.png`, `apple-icon*.png`, but **not** `sw.js` and **not** `/fonts/*`. A `registration.update()` background fetch of `/sw.js`, or a service-worker-initiated `fetch()` of `/fonts/PretendardVariable.woff2` during install-time precaching, will hit the auth gate. If the session cookie has expired (e.g. a phone left in airplane mode for days past the login TTL, or a logged-out state), the response is a `307`/`302` redirect to `/login` — which is fatal for a service-worker script fetch (browsers require the SW script response to be same-origin with no redirect and a JS MIME type; a redirected HTML response fails registration/update outright) and would poison the precache with an HTML login page cached under a JS asset's cache key.
**Why it happens:** the matcher was written for Phase 30-era needs (manifest + icons only) before a SW existed.
**How to avoid:** add `sw\\.js` (and, if fonts should be reachable while logged out, `fonts/.*`) to the middleware matcher's negative-lookahead exclusion list.
**Warning signs:** SW registration silently fails (or worse, "succeeds" with corrupted cached content) specifically for a logged-out/expired-session browser state — easy to miss in manual testing since developers are usually logged in.

### Pitfall 4: Same card graded twice offline, flushed out of order
**What goes wrong:** if the flush loop processes queued entries in anything other than strict enqueue order (e.g., `Promise.all` over all entries), two grades of the same card can apply to the server in the wrong sequence, silently producing a different final FSRS state (stability/difficulty/interval) than what the user actually experienced during the offline session.
**Why it happens:** `POST /api/review`'s optimistic-concurrency check (verified in `app/api/review/route.ts`) reads *current* server state fresh on every request rather than validating against a client-supplied expected-prior-state — so an out-of-order flush doesn't fail loudly (no 409), it just applies correctly-individually-but-wrongly-ordered updates.
**How to avoid:** sequential, enqueue-order flush (Pattern 4) — never `Promise.all`/parallel for entries touching the same `cardId`, and simplest-correct is to make the whole queue's flush sequential regardless of `cardId` (the queue is small — one offline session's worth of reviews — so throughput isn't a real concern).
**Warning signs:** a card's FSRS interval/stability doesn't match what a manual walk-through of the offline session's grades would predict, specifically only for cards graded more than once in one offline session.

### Pitfall 5: Enabling the SW's own cache during `next dev`
**What goes wrong:** Turbopack's dev-mode HMR serves chunk content that can change without the URL changing in the same way a production build's content-hashed filenames do; an active SW cache-first-serving those URLs in dev will mask code changes behind stale cached responses, producing "my edit isn't showing up" confusion that looks like an HMR bug but is actually the SW.
**Why it happens:** a service worker registered unconditionally (no environment gate) is active in both `next dev` and production.
**How to avoid:** gate registration (`lib/service-worker.ts`'s `registerServiceWorker()` call site) behind `process.env.NODE_ENV === 'production'`, matching the convention `@serwist/next`'s `disable` flag already establishes for this exact reason (confirmed via the LogRocket walkthrough this session).
**Warning signs:** a developer reports a fix "not working" in `next dev` that works fine after a hard refresh with devtools' "Update on reload" / "Bypass for network" SW option enabled.

## Code Examples

See Architecture Patterns 1–5 above for the full, in-context code for: precache manifest generation (Pattern 1), skipWaiting/clients.claim sequencing (Pattern 2), the navigation-fallback fetch handler (Pattern 3), the offline queue schema + sequential flush (Pattern 4), and the `localStorage` buildId-fallback fix (Pattern 5). All five are the load-bearing code for this phase; there is no additional "common operation" beyond what those patterns already cover.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `next-pwa` (webpack-only, unmaintained for Turbopack) | `serwist`/`@serwist/next` (still webpack-only for `next build`) or `@serwist/turbopack` (genuinely Turbopack-native) | `@serwist/turbopack`'s Turbopack support backported into the 9.x line, closing [serwist/serwist#54](https://github.com/serwist/serwist/issues/54) in December 2025 | The "no maintained SW library works with Turbopack" premise this phase's Claude's-Discretion question assumed is **no longer true** as of this research — though this research still recommends hand-rolling for this project's specific (small, simple) asset footprint |
| Webpack-based `next.config.js` build manifests (`.next/build-manifest.json`) | Turbopack production builds still emit to `.next/static/` with the same URL-serving contract (`/_next/static/...`), verified this session via a real local `next build` | Next.js 16 made Turbopack the default bundler for both `next dev` and `next build` (confirmed: this project's `next build` ran Turbopack with zero `--webpack` flag anywhere in `package.json`) | Any precache-manifest approach that assumes webpack-specific manifest JSON files (`build-manifest.json`'s exact schema) is bundler-coupled and fragile; a directory walk of `.next/static/` is bundler-agnostic and verified to work under Turbopack |
| `middleware.ts` file convention | Next.js 16.3 flags this as deprecated in favor of `proxy.ts` (a build-time warning observed this session: "The 'middleware' file convention is deprecated. Please use 'proxy' instead") | Observed in this project's own `next build` output this session | Not in scope for this phase (no migration requested), but the middleware matcher change needed for Pitfall 3 will land in a soon-to-be-deprecated file — worth a one-line note in the plan, not a blocker |

**Deprecated/outdated:**
- `next-pwa` (the original `shadowwalker/next-pwa` package): effectively superseded by the Serwist project for any Next.js 13+ App Router use; not evaluated further since it's strictly webpack-only with no Turbopack path at all.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Navigation requests should use network-first-with-cache-fallback (not cache-first) for freshness parity with SC1's `/api/*` treatment | Architecture Pattern 3 | If cache-first is preferred instead (serve stale-but-instant, revalidate in background), the fetch handler's navigate branch needs to swap strategy — a straightforward code change, not an architecture change, but affects perceived freshness on every online page load |
| A2 | The full `.next/static/` tree (23 JS + 1 CSS + media/) should be precached wholesale rather than scoped to only the shell/most-common-route chunks | Architecture Pattern 1 | Verified total is small (1.1MB) so this is low-risk, but if the app grows substantially, an unscoped precache-everything approach could start meaningfully slowing first-install; revisit if `.next/static/` size grows past a few MB |
| A3 | `public/sw.js` (generated) should be `.gitignore`d rather than committed, unlike `gen-icons.mjs`'s committed-PNG convention | Recommended Project Structure | If the planner instead wants it committed for build-diff visibility, that's a straightforward convention choice, not a functional risk either way — flagged only because it diverges from an existing project convention (`gen-icons.mjs`) without an explicit CONTEXT.md decision either way |
| A4 | `middleware.ts`'s matcher should be updated to exclude `sw.js` (Pitfall 3) — this specific file/line change wasn't discussed in CONTEXT.md | Common Pitfalls | If not fixed, SW registration/update-check silently fails or corrupts precache specifically for logged-out/expired-session browser states — a real but narrow-window bug; confirmed via direct code read, not speculation, but the *fix* itself wasn't a CONTEXT.md-locked decision |

## Open Questions

1. **Cache-first vs. network-first for navigation requests (ties to A1)**
   - What we know: SC1 only specifies static-vs-`/api/*`; navigation isn't named. Network-first matches the spirit of "prefer fresh, fall back to cache" that `/api/*`'s network-first policy already expresses.
   - What's unclear: whether the user/planner would prefer cache-first-with-background-revalidation for navigation instead, trading a flash-of-stale-content on every online load for a faster perceived launch.
   - Recommendation: default to network-first-with-cache-fallback (Pattern 3) since it requires zero new UI (no stale-content flash to explain) and matches SC1's existing `/api/*` philosophy; revisit only if perceived launch speed on navigation specifically becomes a complaint (that's arguably Phase 30/34's territory already, not this phase's).

2. **Should `public/fonts/*` and icon precaching go through the SW's install-time `cache.addAll()`, or rely on the generic cache-first runtime branch catching them on first request?**
   - What we know: both work functionally; install-time precaching guarantees they're available even on a device that installs the PWA and goes offline before ever triggering a font/icon request naturally (unlikely in practice, since the app shell references them immediately on first paint).
   - What's unclear: whether there's a measurable install-time cost to bundling ~10 small font/icon files into the same `cache.addAll()` call as the 23 JS chunks.
   - Recommendation: include them in the same install-time precache list (Pattern 1's `shellAssets` array) — the total payload stays well under 2MB, so the simplicity of "one list, one `cache.addAll()`" outweighs any marginal install-time difference.

## Environment Availability

Skipped — this phase introduces zero new external tool/service dependencies. The Service Worker API and IndexedDB are browser runtime features (already relied upon by Phase 34 for IndexedDB), not developer-environment tooling that needs probing.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 (pure `lib/` logic) + `@playwright/test` ^1.61.1 (e2e, offline behavior) — both confirmed installed via `package.json` |
| Config file | `vitest` config inline in `package.json`'s `test` script (`vitest run`); `playwright.config.ts` (existing, confirmed runs against a **production build** via `npm run build && npm run start`) |
| Quick run command | `npm test` (Vitest, pure functions only — no DB/browser needed) |
| Full suite command | `npm run test:e2e` (Playwright, production build required for SW to be active) |

### Phase Requirement → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| OFFLINE-01 | New deploy replaces cached shell, not stale JS | e2e | `npx playwright test e2e/sw-cache-versioning.spec.ts` | ❌ Wave 0 — new file |
| OFFLINE-01 | Static assets cache-first, `/api/*` network-first | unit (fetch-handler logic extracted to a pure function where possible) + e2e | `npm test` + `npx playwright test e2e/sw-precache.spec.ts` | ❌ Wave 0 — new file(s) |
| OFFLINE-02 | Cold launch in airplane mode reaches a usable mode-select screen | e2e | `npx playwright test e2e/sw-offline-cold-launch.spec.ts` — must use a genuine `page.goto()`/new-context navigation while `context.setOffline(true)`, NOT an already-mounted-page check (the existing `e2e/local-cache-offline.spec.ts` pattern is explicitly the WRONG shape for this requirement per that file's own header comment) | ❌ Wave 0 — new file, distinct from `local-cache-offline.spec.ts` |
| OFFLINE-03 | Offline reviews queue, survive force-quit, flush exactly once | unit (`lib/offline-queue.ts` with `fake-indexeddb`) + e2e | `npm test` + `npx playwright test e2e/offline-review-queue.spec.ts` — verify against `ReviewLog`/review counter via a direct DB read helper (mirrors `e2e/seed.ts`'s existing DB-assertion style), NOT the UI, per SC3's explicit instruction | ❌ Wave 0 — new files |
| OFFLINE-03 | Flush ordering correctness for same-card double-grade | unit | `npm test` — a pure test of `flushQueue()`'s sequential-await behavior against a mocked `fetch` | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npm test` (fast, no browser/DB)
- **Per wave merge:** `npm run test:e2e` (requires the production-build harness; SW behavior only exists there)
- **Phase gate:** Full e2e suite green before `/gsd-verify-work`, including a genuine offline-cold-launch test (not an already-mounted-page variant)

### Wave 0 Gaps
- [ ] `lib/offline-queue.ts` + `tests/offline-queue.test.ts` (Vitest + `fake-indexeddb`, mirrors `tests/local-cache.test.ts`'s existing setup per `34-PATTERNS.md`)
- [ ] `e2e/sw-offline-cold-launch.spec.ts` — the new, distinct-from-Phase-34, genuine-navigation-while-offline test
- [ ] `e2e/offline-review-queue.spec.ts` — force-quit simulation (new browser context) + DB-level `ReviewLog`/review-counter assertion helper
- [ ] `e2e/sw-cache-versioning.spec.ts` — deploy-simulation test (two sequential builds with different `buildId`, confirm the second's SW replaces the first's cache)
- [ ] Framework install: none — Vitest and Playwright are both already installed and configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (indirectly) | Existing HMAC cookie auth (`lib/auth.ts`, unmodified this phase) — Pitfall 3's middleware-matcher fix must not weaken the auth gate for any route beyond the specific static SW/font assets being added to the exclusion list |
| V3 Session Management | No new surface | Session cookie mechanism unmodified |
| V4 Access Control | Yes (narrowly) | `middleware.ts`'s matcher exclusion list is itself an access-control boundary — adding `sw.js`/`fonts/*` must be scoped as narrowly as the existing `icon-.*\\.png`/`apple-icon.*\\.png` entries, not a broad wildcard that accidentally exposes an unrelated route |
| V5 Input Validation | Yes | Queued review entries (`cardId`, `rating`, `idempotencyKey`) are replayed through the SAME `POST /api/review` validation already in place (`isGrade()`, non-empty-string `cardId`, `idempotencyKey` length bound — all verified in `app/api/review/route.ts`) — the queue introduces no new validation surface since it's a client-side buffer, not a new trust boundary |
| V6 Cryptography | No new surface | No new crypto — `idempotencyKey` continues to use `crypto.randomUUID()`, matching existing usage |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Service worker cache poisoning (a compromised/MITM'd response gets cached indefinitely under a versioned key) | Tampering | HTTPS-only origin (Vercel enforces this already); the SW only ever fetches same-origin URLs (no third-party/cross-origin caching in this design) — verified the fetch handler design above never targets an external origin |
| Stale cached authenticated content served offline to a device whose session has since been revoked/expired | Information Disclosure | Accepted, pre-existing risk inherited from Phase 34's own threat model (this is a single-user, single-shared-password app with no PII beyond personal Korean study data — verified via `.claude/CLAUDE.md`'s explicit "Single-tenant: No user model" architectural constraint) — not a new risk this phase introduces, since Phase 34's IndexedDB cache already persists the same class of data unencrypted client-side |
| A malicious `postMessage` from an untrusted context triggering `SKIP_WAITING` prematurely | Tampering | `postMessage` to a service worker can only originate from a same-origin page (browsers enforce this at the `serviceWorker.postMessage` API boundary) — no additional origin check needed beyond what the platform already guarantees |

## Sources

### Primary (HIGH confidence — verified this session via direct tool use)
- `middleware.ts` (full read) — auth matcher gap (Pitfall 3)
- `app/api/review/route.ts` (full read) — idempotency-key handling, optimistic-concurrency mechanics (Don't Hand-Roll, Pitfall 4)
- `lib/local-cache.ts` (full read) — D-00 rationale, existing IndexedDB conventions
- `components/StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx`, `HomeClient.tsx` (grep + targeted reads) — the `!ctx` offline-cold-path gap (Pitfall 2)
- `components/StudySession.tsx` (targeted read) — `postReviewWithRetry` full implementation, `submitReview` integration point
- `components/FreshnessWatcher.tsx`, `components/Toast.tsx`, `app/layout.tsx`, `app/manifest.ts` (full reads) — reusable patterns for D-07/D-08/D-09
- `e2e/local-cache-offline.spec.ts` (full read) — empirical proof of the pre-Phase-35 offline-navigation failure
- `playwright.config.ts` (targeted read) — confirmed e2e harness runs against a production build
- `npm run build` (executed this session) — confirmed Turbopack is the default `next build` bundler in this project's Next 16.3.0, confirmed `.next/static/` structure (23 JS, 1 CSS, media dir, 1.1MB total), confirmed `.next/BUILD_ID` vs. app `buildId` distinction
- `npm view serwist version`, `npm view @serwist/turbopack version`, `npm view @serwist/turbopack peerDependencies`, `npm view serwist scripts.postinstall` (executed this session) — version/peer-dep/postinstall verification
- `gsd-tools query package-legitimacy check` (executed this session) — `serwist`/`@serwist/turbopack`/`idb` verdicts

### Secondary (MEDIUM confidence — WebFetch of official/cited docs, cross-referenced against the verified npm registry data above)
- [serwist.pages.dev/docs/next/turbo](https://serwist.pages.dev/docs/next/turbo) — `@serwist/turbopack` setup steps, `app/serwist/[path]/route.ts` route-handler architecture, `esbuild`/`esbuild-wasm` peer deps
- [github.com/serwist/serwist/issues/54](https://github.com/serwist/serwist/issues/54) — Turbopack support resolution, backported into the 9.x line December 2025
- [blog.logrocket.com/nextjs-16-pwa-offline-support](https://blog.logrocket.com/nextjs-16-pwa-offline-support/) — `@serwist/next` webpack-required-for-build caveat, `disable: process.env.NODE_ENV === 'development'` convention

### Tertiary (LOW confidence)
- None relied upon for load-bearing claims — every architectural recommendation in this document traces to either a direct code read, an executed command this session, or a cited official-docs source above.

## Metadata

**Confidence breakdown:**
- Standard stack (hand-roll vs. library decision): HIGH — grounded in an actual verified local build plus current registry data for the library alternative, not training-data assumption
- Architecture (navigation caching, buildId gap, queue schema): HIGH — the two most load-bearing findings (Pitfall 1, Pitfall 2) are verified directly from existing code/tests, not inferred
- Pitfalls: HIGH for Pitfalls 1–4 (code-verified); MEDIUM for Pitfall 5 (standard PWA dev-mode knowledge, not project-specific verification since this project has no SW yet to test against)
- Security domain: MEDIUM — ASVS category applicability reasoned from this app's existing (verified) single-tenant threat model, not a fresh threat-model exercise

**Research date:** 2026-08-10
**Valid until:** 2026-09-09 (30 days — the Serwist/Turbopack compatibility landscape is fast-moving; re-verify `@serwist/turbopack`'s status if this phase is replanned after that window, since this exact space changed materially just 2 months before this research was written)
