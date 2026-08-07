# Requirements: Korean Study — v1.8 Perceived & Real Performance

**Defined:** 2026-08-05
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

**Source:** Adapted from `/Users/main/Documents/travel-fun/lag_remediation_plan.md` ("P3 — Performance"), tiers P3.0–P3.7. P3.8 (TTS prefetch) explicitly excluded — see Out of Scope.

## v1 Requirements

### Perceived Loading (P3.0)

- [x] **PERCEPT-01**: Dark-mode skeleton screens (`/study`, `/cards`, `/habits`, `/history`) are visibly distinct from the background, not the same color as `--background`
- [x] **PERCEPT-02**: PWA cold launch shows no white flash — `app/manifest.ts` `background_color`/`theme_color` match the dark theme
- [x] **PERCEPT-03**: Applying a lesson-range filter on `/study` shows a content-shaped skeleton instead of a bare spinner, with no layout shift when data lands

### Root Layout (P3.1)

- [x] **LAYOUT-01**: `RootLayout` renders synchronously — no `await` DB read blocks the initial HTML response; settings changes still apply on next navigation

### Cards List Performance (P3.2)

- [x] **CARDS-01**: `/cards` initial load queries a capped page of cards (not the full ~1056-card deck), with `sentences` excluded from the list query
- [ ] **CARDS-02**: Scrolling `/cards` to the end of the full deck stays smooth — windowed/virtualized rendering, no unbounded DOM growth
- [x] **CARDS-03**: Search and lesson filter on `/cards` return correct results across the full deck, not just the loaded page (server-side query, debounced input)

### Study Session Load Performance (P3.3)

- [ ] **STUDY-01**: `/study` issues at most two round trips to Turso per load (down from 4–5)
- [ ] **STUDY-02**: The redundant second `card.findMany` re-fetch is eliminated or confirmed non-duplicative against the first query's columns
- [ ] **STUDY-03**: Invariant reads (`CardDependency` edges, `normalizedFront` lemmas) are cached and invalidated only on sync

### Freshness Backstop Narrowing (P3.4)

- [ ] **VERS-01**: `/api/version` returns a monotonic counter bumped by sync completion and review writes
- [ ] **VERS-02**: The `FreshnessWatcher` JSON backstop re-fetches full payloads only when the version counter has changed since the cache was built — the backstop itself is not removed (works around a real Next 16.2.1 flake)

### Region Pinning (P3.5)

- [x] **REGION-01**: Vercel function region matches the Turso primary region

### Local-First Shell (P3.6)

- [ ] **LOCAL-01**: Home/Study/Cards/Habits render last-known cached data immediately on mount from IndexedDB, before the network request resolves
- [ ] **LOCAL-02**: Cache entries are version-checked against `/api/version` (never TTL-based) and keyed by build ID
- [ ] **LOCAL-03**: Device-originated writes (reviews, card edits, settings) update the cache in the same code path as the optimistic UI update — never trailing behind a stale read
- [ ] **LOCAL-04**: A pull-to-refresh (or equivalent) escape hatch bypasses the cache and version check entirely
- [ ] **LOCAL-05**: With the network fully disabled, opening the app shows last-known home stats, card list, and habit data instead of an error or a blank screen

### Offline Support (P3.7)

- [ ] **OFFLINE-01**: A versioned service worker precaches the app shell, JS/CSS bundles, fonts (`public/fonts/`), and icon set; static assets are cache-first, `/api/*` is network-first
- [ ] **OFFLINE-02**: A study session runs on cached cards in airplane mode
- [ ] **OFFLINE-03**: Reviews taken offline are queued in IndexedDB (reusing the existing idempotency-key discipline from `postReviewWithRetry`) and flush exactly once when the app returns online or is reopened in the foreground — no reliance on the Background Sync API

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Audio Performance

- **AUDIO-01** (P3.8): Prefetch TTS audio for the first N cards of a study session, plus card *n+1* while card *n* is displayed; cache blobs in memory for the session

## Out of Scope

| Feature | Reason |
|---------|--------|
| P3.8 TTS prefetch | Explicitly optional in the source plan; deferred to v2 (AUDIO-01) |
| Native iOS shell (Capacitor/WebView/React Native) | Same round trips over the same network, same numbers — P3.6's local-first shell gets the real win at a fraction of the cost without abandoning existing components |
| Schema changes | Nothing in P3.0–P3.7 needs `prisma/schema.prisma` changes; P3.4's version counter and P3.6's cache both stay outside the DB (Setting table / client-side only) |
| `CLEANUP-03` (distractor write-side retirement) | Carried over from v1.7 Phase 29, never planned/executed. Deliberately excluded here — distinct subsystem (extraction pipeline, not performance). Tracked as an open item in PROJECT.md ▸ Requirements ▸ Active and STATE.md ▸ Deferred Items, unscheduled |

## Traceability

All 21 v1 requirements map to exactly one phase. No orphans, no duplicates.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERCEPT-01 | Phase 30 | Complete |
| PERCEPT-02 | Phase 30 | Complete |
| PERCEPT-03 | Phase 30 | Complete |
| LAYOUT-01 | Phase 30 | Complete |
| CARDS-01 | Phase 31 | Complete |
| CARDS-02 | Phase 31 | Pending |
| CARDS-03 | Phase 31 | Complete |
| STUDY-01 | Phase 32 | Pending |
| STUDY-02 | Phase 32 | Pending |
| STUDY-03 | Phase 32 | Pending |
| VERS-01 | Phase 33 | Pending |
| VERS-02 | Phase 33 | Pending |
| REGION-01 | Phase 30 | Complete |
| LOCAL-01 | Phase 34 | Pending |
| LOCAL-02 | Phase 34 | Pending |
| LOCAL-03 | Phase 34 | Pending |
| LOCAL-04 | Phase 34 | Pending |
| LOCAL-05 | Phase 34 | Pending |
| OFFLINE-01 | Phase 35 | Pending |
| OFFLINE-02 | Phase 35 | Pending |
| OFFLINE-03 | Phase 35 | Pending |

**Phase groupings:**

| Phase | Source tier(s) | Requirements | Count |
|-------|----------------|--------------|-------|
| Phase 30 — Instant Feedback & Cold-Start Unblocking | P3.0, P3.1, P3.5 | PERCEPT-01, PERCEPT-02, PERCEPT-03, LAYOUT-01, REGION-01 | 5 |
| Phase 31 — Cards List Pagination & Virtualization | P3.2 | CARDS-01, CARDS-02, CARDS-03 | 3 |
| Phase 32 — Study Load Round-Trip Collapse | P3.3 | STUDY-01, STUDY-02, STUDY-03 | 3 |
| Phase 33 — Version-Gated Freshness Backstop | P3.4 | VERS-01, VERS-02 | 2 |
| Phase 34 — Local-First Shell | P3.6 | LOCAL-01, LOCAL-02, LOCAL-03, LOCAL-04, LOCAL-05 | 5 |
| Phase 35 — Service Worker & Offline Review Queue | P3.7 | OFFLINE-01, OFFLINE-02, OFFLINE-03 | 3 |

**Coverage:**

- v1 requirements: 21 total
- Mapped to phases: 21 ✓
- Unmapped: 0

---
*Requirements defined: 2026-08-05*
*Last updated: 2026-08-05 after roadmap creation (Phases 30-35, 21/21 mapped)*
