# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- ✅ **v1.3 Reliability & Hardening** — Phases 13–15 (shipped 2026-07-03)
- ✅ **v1.4 Knowledge Graph Quality & History** — Phases 16–19 (shipped 2026-07-05)
- ✅ **v1.5 Extraction Quality & Reliability** — Phases 20–23 (shipped 2026-07-10)
- ✅ **v1.6 Freshness, Performance & E2E Testing** — Phases 24–27 (shipped 2026-07-14)
- ⚠️ **v1.7 Active Recall Study Mode** — Phase 28 shipped, Phase 29 archived unexecuted (2026-08-05)
- 🚧 **v1.8 Perceived & Real Performance** — Phases 30–35 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 UI/UX Polish (Phases 3–8 + 8.1) — SHIPPED 2026-06-29</summary>

- [x] Phase 3: UI/UX Audit (1/1 plans) — completed 2026-06-27
- [x] Phase 4: Design System Tokens & Sweep (3/3 plans) — completed 2026-06-27
- [x] Phase 5: Study Session Polish (2/2 plans) — completed 2026-06-28
- [x] Phase 6: Home Dashboard Polish (1/1 plan) — completed 2026-06-28
- [x] Phase 7: Secondary Screens & Navigation (2/2 plans) — completed 2026-06-29
- [x] Phase 8: Accessibility & PWA Baseline (2/2 plans) — completed 2026-06-29
- [x] Phase 8.1: Close gap NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (1/1 inline fix) — completed 2026-06-29

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Performance & Snappiness (Phases 9–12) — SHIPPED 2026-07-01</summary>

- [x] Phase 9: Skeleton Loading Screens (1/1 plans) — completed 2026-06-29
- [x] Phase 10: Cards Hydration + API Parallelization (2/2 plans) — completed 2026-06-30
- [x] Phase 11: Study Page Hydration & Interaction Polish (3/3 plans) — completed 2026-06-30
- [x] Phase 12: Home & Habits Hydration (3/3 plans) — completed 2026-07-01

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Reliability & Hardening (Phases 13–15) — SHIPPED 2026-07-03</summary>

- [x] Phase 13: Review API Hardening & Save Reliability (2/2 plans) — completed 2026-07-02
- [x] Phase 14: Sync Failure Visibility & Caching Performance (2/2 plans) — completed 2026-07-02
- [x] Phase 15: StudySession Refactor & Sentence-Selection Memoization (2/2 plans) — completed 2026-07-03

See `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.4 Knowledge Graph Quality & History (Phases 16–19) — SHIPPED 2026-07-05</summary>

- [x] Phase 16: Components[] Filter Fix (4/4 plans) — completed 2026-07-03
- [x] Phase 17: ReviewLog Schema & Idempotent Write Path (5/5 plans) — completed 2026-07-05
- [x] Phase 18: Review History Page (3/3 plans) — completed 2026-07-04
- [x] Phase 19: Vercel Cron Auto-Sync (3/3 plans) — completed 2026-07-05

See `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.5 Extraction Quality & Reliability (Phases 20–23) — SHIPPED 2026-07-10</summary>

- [x] Phase 20: Extraction Pipeline Hardening (2/2 plans) — completed 2026-07-06
- [x] Phase 21: Card Database Quality Audit (2/2 plans) — completed 2026-07-07
- [x] Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes (3/3 plans) — completed 2026-07-10
- [x] Phase 23: Reliability Bug Fixes (2/2 plans) — completed 2026-07-10

See `.planning/milestones/v1.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.6 Freshness, Performance & E2E Testing (Phases 24–27) — SHIPPED 2026-07-14</summary>

- [x] Phase 24: Freshness Diagnosis Spike (2/2 plans) — completed 2026-07-11
- [x] Phase 25: E2E Test Infrastructure & Baselines (3/3 plans) — completed 2026-07-12
- [x] Phase 26: Freshness Fix (6/6 plans) — completed 2026-07-13
- [x] Phase 27: E2E Coverage & Performance Validation (3/3 plans) — completed 2026-07-13

See `.planning/milestones/v1.6-ROADMAP.md` for full phase details.

</details>

<details>
<summary>⚠️ v1.7 Active Recall Study Mode (Phases 28–29) — Phase 28 SHIPPED 2026-07-24, Phase 29 archived unexecuted 2026-08-05</summary>

- [x] Phase 28: Active Recall Study Mode (2/2 plans) — completed 2026-07-24
- [ ] Phase 29: Distractor Write-Side Retirement — discussed, never planned or executed; archived under `.planning/milestones/v1.7-phases/` when v1.8 started. CLEANUP-03 remains open and unscheduled (see PROJECT.md ▸ Requirements ▸ Active).

</details>

### 🚧 v1.8 Perceived & Real Performance (In Progress)

**Milestone Goal:** Make every tap paint something within 100ms and settle within 1s — fix the feedback illusion first (invisible skeletons, white launch flash, dishonest spinner), then the three real bottlenecks (`/cards` unpaginated, `/study`'s 4–5 sequential Turso round trips, a doubled freshness-backstop payload), then pin the Vercel region, then make the shell local-first (IndexedDB stale-while-revalidate) with a service worker + offline review queue.

**Source:** Adapted from `lag_remediation_plan.md` ("P3 — Performance"), tiers P3.0–P3.7. P3.8 (TTS prefetch) is out of scope for this milestone.

**Measured baseline (on-device, 60fps screen recording, tap → first paint of real content):**

| Path | Baseline | Target |
|------|----------|--------|
| Cold launch → `/` | 2.5s | < 1.0s |
| Tab → `/study` | 2.9s | < 0.8s |
| Lesson filter Apply | 4.7s | < 1.0s |
| Tab → `/cards` | 6.4s | < 1.0s |
| Tab → `/habits` | 1.8s | < 0.8s |
| Any repeat visit | — | < 0.1s |

**Feedback budget, independent of the table:** every tap paints *something* — skeleton, cached content, or state change — within 100ms. Phase 30 satisfies this for all routes and no later phase may regress it.

**Milestone-wide constraints (carry into every phase):**

- Tailwind v4 tokens live in `app/globals.css` (`:root` + `@theme inline`) — there is no `tailwind.config`, and every dark value must be mirrored in BOTH the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block.
- `react-hooks/purity` is strict: no `Date.now()` / `new Date()` / `Math.random()` in render. Cache reads and timing instrumentation belong in effects or event handlers. `npm run lint` must stay green.
- No `prisma/schema.prisma` changes are needed through Phase 35. The version counter lives in the `Setting` table; the local cache is client-side only.
- iOS/WebKit standalone PWA is the only target. Home-screen-installed storage survives ITP, but there is **no Background Sync API** — any deferred flush must fire on the `online` event or on app foreground, never in the background.
- Do **not** delete the `FreshnessWatcher` backstop. It works around a real, unfixed Next.js 16.2.1 Suspense/Segment-Cache bug. Narrow it only.

**Phase checklist:**

- [x] **Phase 30: Instant Feedback & Cold-Start Unblocking** - Visible dark-mode skeletons, no white PWA launch flash, honest lesson-filter skeleton, synchronous root layout, Vercel region pinned to Turso (completed 2026-08-06)
- [ ] **Phase 31: Cards List Pagination & Virtualization** - `/cards` loads a capped page without sentences, windows its scroll, and searches/filters server-side across the full deck
- [ ] **Phase 32: Study Load Round-Trip Collapse** - `/study` drops from 4–5 sequential Turso round trips to at most two, with sync-invalidated caching of invariant reads
- [ ] **Phase 33: Version-Gated Freshness Backstop** - `/api/version` monotonic counter lets the freshness backstop re-fetch payloads only when something actually changed
- [ ] **Phase 34: Local-First Shell** - IndexedDB stale-while-revalidate cache makes every repeat visit paint instantly and the app usable with the network off
- [ ] **Phase 35: Service Worker & Offline Review Queue** - Precached app shell plus a persisted review queue that flushes exactly once when the app comes back online

## Phase Details

### Phase 30: Instant Feedback & Cold-Start Unblocking

**Goal**: Make waiting visible everywhere and strip the two avoidable costs from the cold path — a blocking DB read in `RootLayout` and a possible cross-region hop to Turso. This is the cheapest work in the milestone and the largest single improvement in felt speed; it also establishes the re-measurement baseline every later phase is judged against.
**Depends on**: Nothing (first phase of v1.8)
**Requirements**: PERCEPT-01, PERCEPT-02, PERCEPT-03, LAYOUT-01, REGION-01
**Success Criteria** (what must be TRUE):

  1. In dark mode on a throttled connection, tapping through to `/study`, `/cards`, `/habits`, and `/history` shows clearly visible pulsing skeleton shapes within ~100ms of the tap — never an empty void or outline-only frame — and every existing `bg-surface-3` consumer (including `Nav.tsx` hover states) still looks intentional.
  2. Cold-launching the installed PWA from the home-screen icon shows no white frame at any point; the manifest's `background_color` and `theme_color` match the dark theme already declared in `app/layout.tsx`.
  3. Applying a lesson range on `/study` shows a content-shaped skeleton in the final content's shape instead of a bare centred spinner, and nothing shifts position when the real data lands.
  4. `RootLayout` is no longer `async` and awaits no DB read — the first HTML byte ships without waiting on Turso — while a saved settings change (button/reward color, reading text scale, reading aid) still applies on the next navigation with no colour flash.
  5. The deployed Vercel function region matches the Turso primary region, and `/habits` (the cleanest pure-round-trip signal) lands faster than its 1.8s baseline; its `e2e/perf.spec.ts` page-load budget passes at a tightened threshold.

**Plans**: 4/4 plans executed

- [x] 30-01-PLAN.md
- [x] 30-02-PLAN.md
- [x] 30-03-PLAN.md
- [x] 30-04-PLAN.md — gap closure: fix `/settings` production server error (G-30-2)

**UI hint**: yes

### Phase 31: Cards List Pagination & Virtualization

**Goal**: Stop `/cards` from querying, serializing, transferring, and hydrating the entire ~1056-card deck plus its ~1616 sentence rows on every visit. Cap the initial query, split the `sentences` relation out of the list read, window the rendered rows, and move search + lesson filtering server-side so correctness survives pagination.
**Depends on**: Phase 30
**Requirements**: CARDS-01, CARDS-02, CARDS-03
**Success Criteria** (what must be TRUE):

  1. Opening `/cards` paints its first rows in under a second on a normal connection — the initial query returns a capped page and carries no `sentences` rows — and its `e2e/perf.spec.ts` page-load budget passes at a tightened threshold.
  2. Scrolling from the top of the deck to the last card stays smooth, with the rendered DOM staying bounded rather than growing with every page loaded.
  3. Typing a search term returns matching cards from anywhere in the full deck, not just the loaded page, with input debounced so intermediate keystrokes don't each hit the server.
  4. Applying a lesson range on `/cards` returns the correct card set across the full deck, and a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves.
  5. Add, edit, delete, swipe-to-delete, tap-to-gloss, group collapse, and the Reading practice view all still behave correctly against the paginated list; the existing e2e and unit suites stay green.

**Plans**: 4/5 plans executed

Plans:
**Wave 1**

- [x] 31-01-PLAN.md — Backend cursor pagination (getCardsPage/getCardsGroupCounts) + react-virtuoso install + tracer: capped virtualized Vocabulary-group render + data-layer tests

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 31-02-PLAN.md — Full Cards-view completion: all 4 groups, auto-load-on-scroll, debounced server-side search, lesson filter, search-flatten view
- [x] 31-03-PLAN.md — Backend: Reading Practice pagination endpoint (getSentencesPage) + single-card fetch endpoint (GET /api/cards/[id]) + tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 31-04-PLAN.md — Reading Practice UI wiring + CardEditor on-demand fetch + FreshnessWatcher upsert-merge fix + baseline re-measurement/perf budget tightening + full regression

**Gap closure**

- [ ] 31-05-PLAN.md — gap closure: sticky Cards/Reading Practice toggle + Nav-header offset on mobile (G-31-2)

**UI hint**: yes

### Phase 32: Study Load Round-Trip Collapse

**Goal**: Cut `/study`'s load cost from four-to-five serial libSQL HTTP round trips to at most two, by batching the independent reads, removing (or proving non-duplicative) the second full-row `card.findMany`, and caching the reads that only ever change on sync — without altering which cards a session picks or the order it presents them in.
**Depends on**: Phase 31
**Requirements**: STUDY-01, STUDY-02, STUDY-03
**Success Criteria** (what must be TRUE):

  1. A `/study` load issues at most two round trips to Turso, demonstrable from query instrumentation rather than asserted by inspection.
  2. The mode-select screen shows its real due count well ahead of the 2.9s baseline, and applying a lesson range settles well ahead of the 4.7s baseline; the `/study` and `/api/cards/due` budgets in `e2e/perf.spec.ts` pass at tightened thresholds.
  3. `CardDependency` edges and the `normalizedFront` lemma set are served from cache on repeat loads and are invalidated when a sync completes — cards from a freshly synced lesson sequence correctly with no redeploy and no stale-prerequisite behavior.
  4. Session composition is byte-for-byte unchanged in behavior: prerequisite closure, foundation-first ordering, the bare-word-first gate, and least-unknown sentence selection all still hold, with the unit suites and the e2e grade-flow spec green.

**Plans**: TBD

### Phase 33: Version-Gated Freshness Backstop

**Goal**: Stop the freshness backstop from delivering the same payload twice on every resume. Add a cheap monotonic version counter the client can poll, and re-fetch route payloads only when it has actually moved — narrowing the backstop without removing it, since it still guards a real unfixed Next.js 16.2.1 bug.
**Depends on**: Phase 32
**Requirements**: VERS-01, VERS-02
**Success Criteria** (what must be TRUE):

  1. `GET /api/version` returns a monotonic counter that advances when a sync completes and when a review is written, and stays put otherwise — with no `prisma/schema.prisma` change (the counter lives in the `Setting` table).
  2. Resuming the app or navigating back with no server-side changes issues one small version request instead of a full payload re-fetch — the common case costs a fraction of what it did.
  3. When the counter has moved (for example after the daily cron sync), the same resume path re-fetches and the route shows the new data; the existing `e2e/freshness-*` resume and back-forward specs stay green.
  4. `FreshnessWatcher` still exists and still applies its JSON re-fetch backstop when the version has changed, carrying a `TODO` that records the Next.js version last tested for the underlying Suspense/Segment-Cache flake.

**Plans**: TBD

### Phase 34: Local-First Shell

**Goal**: Stop first paint from depending on the network at all. Cache each route's DTO payload in IndexedDB, render the last-known data immediately on mount, revalidate in the background, and keep the cache honest with build-ID keying, version checks (never TTLs), write-through on device-originated writes, and a pull-to-refresh escape hatch.
**Depends on**: Phase 33 (needs `/api/version`), Phase 30
**Requirements**: LOCAL-01, LOCAL-02, LOCAL-03, LOCAL-04, LOCAL-05
**Success Criteria** (what must be TRUE):

  1. Second and subsequent visits to Home, Study, Cards, and Habits paint real content immediately from the local cache — before the network request resolves — showing a subtle "updating" affordance rather than a blocking skeleton when cached data exists.
  2. With the network fully disabled, opening the app shows the last-known home stats, card list, and habit data rather than an error or a blank screen.
  3. Grading a card, editing a card, or changing a setting updates the cache in the same code path as the optimistic UI update — reopening that route never shows the pre-write value, even offline.
  4. After the daily cron sync runs, reopening the app shows the new lessons and cards on the next launch with no hard reload; entries are discarded when `/api/version` moves or the build ID changes, and never merely because time has passed.
  5. Pull-to-refresh bypasses both the cache and the version check entirely and repopulates from the server, so any cache problem is recoverable from the phone.

**Plans**: TBD
**UI hint**: yes

### Phase 35: Service Worker & Offline Review Queue

**Goal**: Turn "fast" into "works without a network." Precache the app shell, bundles, fonts, and icons behind a versioned service worker with a clear invalidation path, and persist the review queue to IndexedDB so a session studied in airplane mode lands exactly once when the app next comes to the foreground online.
**Depends on**: Phase 34
**Requirements**: OFFLINE-01, OFFLINE-02, OFFLINE-03
**Success Criteria** (what must be TRUE):

  1. A versioned service worker precaches the app shell, JS/CSS bundles, `public/fonts/`, and the icon set; static assets serve cache-first and `/api/*` serves network-first, and deploying a new build replaces the cached shell instead of serving stale JS.
  2. In airplane mode, tapping the home-screen icon launches the app and runs a full study session on cached cards.
  3. Reviews taken offline survive a force-quit: restoring the network and reopening the app flushes them, and each review lands exactly once — verified against `ReviewLog` / the review counter, not the UI — reusing the existing `postReviewWithRetry` idempotency-key discipline.
  4. The flush is triggered by the `online` event and by the app returning to the foreground, with no registration of or reliance on the Background Sync API (which never fires on iOS).

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → ... → 28 (complete) → 29 (archived unexecuted) → 30 → 31 → 32 → 33 → 34 → 35.

Phases 30 → 31 → 32 → 33 are each independently shippable in that order. Phases 34 → 35 are structural and depend on Phase 30 having landed; Phase 34 additionally depends on Phase 33's `/api/version` endpoint, and Phase 35 depends on Phase 34's IndexedDB layer.

Re-measure the baseline table after Phase 30 before starting Phase 31 — the numbers move less than the experience does, and that is the point.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8.1. Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete | 2026-06-29 |
| 9. Skeleton Loading Screens | v1.2 | 1/1 | Complete | 2026-06-29 |
| 10. Cards Hydration + API Parallelization | v1.2 | 2/2 | Complete | 2026-06-30 |
| 11. Study Page Hydration & Interaction Polish | v1.2 | 3/3 | Complete | 2026-06-30 |
| 12. Home & Habits Hydration | v1.2 | 3/3 | Complete | 2026-07-01 |
| 13. Review API Hardening & Save Reliability | v1.3 | 2/2 | Complete | 2026-07-02 |
| 14. Sync Failure Visibility & Caching Performance | v1.3 | 2/2 | Complete | 2026-07-02 |
| 15. StudySession Refactor & Sentence-Selection Memoization | v1.3 | 2/2 | Complete | 2026-07-03 |
| 16. Components[] Filter Fix | v1.4 | 4/4 | Complete | 2026-07-03 |
| 17. ReviewLog Schema & Idempotent Write Path | v1.4 | 5/5 | Complete | 2026-07-05 |
| 18. Review History Page | v1.4 | 3/3 | Complete | 2026-07-04 |
| 19. Vercel Cron Auto-Sync | v1.4 | 3/3 | Complete | 2026-07-05 |
| 20. Extraction Pipeline Hardening | v1.5 | 2/2 | Complete | 2026-07-06 |
| 21. Card Database Quality Audit | v1.5 | 2/2 | Complete | 2026-07-07 |
| 22. Findings-Driven Prompt Improvement & Corpus Fixes | v1.5 | 3/3 | Complete | 2026-07-10 |
| 23. Reliability Bug Fixes | v1.5 | 2/2 | Complete | 2026-07-10 |
| 24. Freshness Diagnosis Spike | v1.6 | 2/2 | Complete | 2026-07-11 |
| 25. E2E Test Infrastructure & Baselines | v1.6 | 3/3 | Complete | 2026-07-12 |
| 26. Freshness Fix | v1.6 | 6/6 | Complete | 2026-07-13 |
| 27. E2E Coverage & Performance Validation | v1.6 | 3/3 | Complete | 2026-07-13 |
| 28. Active Recall Study Mode | v1.7 | 2/2 | Complete | 2026-07-24 |
| 29. Distractor Write-Side Retirement | v1.7 | 0/0 | Deferred (archived unexecuted — CLEANUP-03 open, unscheduled) | - |
| 30. Instant Feedback & Cold-Start Unblocking | v1.8 | 4/4 | Complete    | 2026-08-06 |
| 31. Cards List Pagination & Virtualization | v1.8 | 4/4 | In Progress|  |
| 32. Study Load Round-Trip Collapse | v1.8 | 0/TBD | Not started | - |
| 33. Version-Gated Freshness Backstop | v1.8 | 0/TBD | Not started | - |
| 34. Local-First Shell | v1.8 | 0/TBD | Not started | - |
| 35. Service Worker & Offline Review Queue | v1.8 | 0/TBD | Not started | - |

---
*Last updated: 2026-08-05 — v1.8 Perceived & Real Performance roadmap created (Phases 30–35, coarse granularity, 21/21 requirements mapped).*
