---
phase: 35
slug: service-worker-offline-review-queue
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-10
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (pure `lib/` + `scripts/` logic, `fake-indexeddb` for IndexedDB) + `@playwright/test` 1.61.1 (offline/service-worker e2e) |
| **Config file** | `vitest.config.ts` (node environment, `@/*` alias, `e2e/**` excluded) · `playwright.config.ts` (prod build on port 3100, isolated `file:` test DB, `workers: 1`, `retries: 0`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Estimated runtime** | Vitest: **~4.4 s wall** (measured this session — 32 files / 355 tests). Playwright: dominated by the production build the harness runs before the first spec (`webServer.timeout` is 180 s), then seconds per spec. |

**Why the service-worker specs must run against the production harness:** registration is gated on `NODE_ENV === 'production'` (Turbopack dev rewrites chunk contents behind stable URLs, so a cache-first worker in dev masks live edits). `playwright.config.ts` already runs `npm run build && npm run start`, and plan 35-01 chains `node scripts/gen-sw.mjs` into that build — so `public/sw.js` exists for every e2e run with no extra harness wiring.

---

## Sampling Rate

- **After every task commit:** Run `npm test` (~4.4 s, no browser, no DB).
- **After every plan wave:** Run `npm run test:e2e` (service-worker behaviour only exists in the production harness).
- **Before `/gsd-verify-work`:** Full suite green, including a genuine cold-navigation-while-offline spec (not an already-mounted-page variant).
- **Max feedback latency:** 5 s for the unit loop; one production build for the e2e loop.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | OFFLINE-01 | T-35-01 | `/sw.js` and `/fonts/*` return the real asset for an expired session instead of a `/login` redirect | e2e | `npm run lint && npx playwright test e2e/sw-shell-offline.spec.ts` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | OFFLINE-01 | T-35-02 | an install-time route warm stores a response only when its final URL pathname still equals the requested route (no login HTML cached under a route key) | unit | `npx vitest run tests/sw-runtime.test.ts tests/gen-sw.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-03 | 01 | 1 | OFFLINE-01 | T-35-03 | activation happens only via the same-origin, user-tapped message path; the worker never self-activates on install | e2e | `npm run lint && npx vitest run tests/sw-runtime.test.ts tests/gen-sw.test.ts && npx playwright test e2e/sw-shell-offline.spec.ts` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 2 | OFFLINE-02 | T-35-06 | a stored cache context is adopted only after shape validation, so a corrupted value never names an IndexedDB database | unit | `npm run lint && npx vitest run tests/local-cache.test.ts` | ✅ (extend) | ⬜ pending |
| 35-02-02 | 02 | 2 | OFFLINE-02 | T-35-08 | the warm calls only the existing authenticated same-origin due-cards endpoint; no new route, no new auth surface | unit | `npm run lint && npx vitest run` | ✅ | ⬜ pending |
| 35-02-03 | 02 | 2 | OFFLINE-02 | T-35-09 | offline render is served from client cache under the accepted single-tenant posture; no new data class is exposed | e2e | `npx playwright test e2e/sw-offline-study-session.spec.ts` | ❌ W0 | ⬜ pending |
| 35-03-01 | 03 | 2 | OFFLINE-03 | T-35-10 | the grade-time idempotency key is reused unchanged on every flush attempt; a reentrancy guard prevents interleaved flushes | unit | `npm run lint && npx vitest run tests/offline-queue.test.ts` | ❌ W0 | ⬜ pending |
| 35-03-02 | 03 | 2 | OFFLINE-03 | T-35-13 | a 4xx entry is deleted and surfaced rather than retried on every foreground boundary forever | unit | `npm run lint && npx vitest run` | ✅ | ⬜ pending |
| 35-03-03 | 03 | 2 | OFFLINE-03 | T-35-11 | the replayed payload passes through the unmodified server-side validation; exactly-once asserted against `ReviewLog`, not the UI | e2e | `npx playwright test e2e/offline-review-queue.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Each task authors its own test file as part of the task and then runs it — there is no separate Wave 0 plan. The files below do not exist yet and are created by the task that verifies against them:

- [ ] `tests/sw-runtime.test.ts` — routing-strategy exhaustiveness + stale-shell-key selection (OFFLINE-01), created by 35-01-02
- [ ] `tests/gen-sw.test.ts` — precache-list collection, determinism, empty-tree failure, rendered-worker shape (OFFLINE-01), created by 35-01-02
- [ ] `e2e/sw-shell-offline.spec.ts` — offline navigation, single versioned shell cache, cache-first static, network-only `/api` (OFFLINE-01), created by 35-01-01 and extended by 35-01-03
- [ ] `e2e/sw-offline-study-session.spec.ts` — genuine cold `page.goto` while offline, distinct from `e2e/local-cache-offline.spec.ts`'s already-mounted-page shape (OFFLINE-02), created by 35-02-03
- [ ] `tests/offline-queue.test.ts` — enqueue, FIFO, sequential flush, 4xx/5xx/throw classification, reentrancy, key reuse (OFFLINE-03), created by 35-03-01
- [ ] `e2e/offline-review-queue.spec.ts` + a review-log counter op in `e2e/helpers/mutate.ts` / `e2e/run-mutate.ts` (OFFLINE-03), created by 35-03-03
- [ ] Framework install: **none** — Vitest, Playwright, and `fake-indexeddb` are all already installed and configured.

Extended (already exists): `tests/local-cache.test.ts` gains a describe block for the last-known cache context (35-02-01).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tapping the installed home-screen icon in airplane mode launches the app to a usable mode-select screen and grades a full session | OFFLINE-02 (ROADMAP SC2) | Chromium under Playwright cannot exercise iOS/WebKit standalone-PWA storage or the home-screen launch path, and iOS standalone is this milestone's only stated target | 1. Install the app to the iPhone home screen and open it online at least once so the worker installs and Home warms the pool. 2. Enable airplane mode. 3. Tap the home-screen icon. 4. Confirm the app launches (no Safari error page), navigate to Study, and grade several cards to completion. |
| A new deploy surfaces as a tappable update prompt on a backgrounded standalone session, and never force-reloads mid-session | OFFLINE-01 (D-07/D-08/D-09) | Requires two real Vercel deploys and a genuinely backgrounded standalone PWA session; the resume boundary and worker-waiting state cannot be faithfully simulated in the harness | 1. Open the installed app and start a study session. 2. Push a new build to `main` and wait for the Vercel deploy. 3. Background the app, then reopen it. 4. Confirm the update prompt appears, the session was never reloaded unprompted, and tapping the prompt refreshes into the new build. 5. Repeat, dismissing the prompt instead, then fully close and relaunch — confirm the new build is now active. |
| Reviews graded in airplane mode land exactly once after a real force-quit on device | OFFLINE-03 (ROADMAP SC3) | The e2e proof closes a page within one browser context; a genuine iOS app-switcher force-quit exercises WebKit's own storage-eviction behaviour, which the harness cannot reproduce | 1. In airplane mode, grade 3+ cards. 2. Force-quit from the app switcher. 3. Disable airplane mode, reopen the app, wait a few seconds. 4. Confirm the review history / counter shows exactly 3 new reviews, no more and no fewer. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 9/9 tasks carry an `<automated>` command
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — every new test file is authored by the task that verifies against it
- [x] No watch-mode flags — all commands use `vitest run` / `playwright test`
- [x] Feedback latency < 5 s for the unit loop (measured 4.4 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
