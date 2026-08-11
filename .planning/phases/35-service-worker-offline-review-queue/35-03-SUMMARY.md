---
phase: 35-service-worker-offline-review-queue
plan: 03
subsystem: offline-review-queue
tags: [offline, indexeddb, idempotency, playwright, vitest, fsrs]
dependency-graph:
  requires:
    - "lib/useForegroundResume.ts (Phase 35 Plan 01) — shared visibilitychange/pageshow/online hook"
  provides:
    - "lib/offline-queue.ts — QUEUE_DB_NAME, QUEUE_STORE, enqueueReview, readQueue, flushQueue"
    - "components/OfflineQueueFlusher.tsx — mount-once flush trigger + permanent-failure Toast"
  affects:
    - "components/StudySession.tsx (network-classified save exhaustion now enqueues instead of only toasting)"
    - "app/layout.tsx (OfflineQueueFlusher mounted alongside the other watchers)"
    - "e2e/helpers/mutate.ts + e2e/run-mutate.ts (reviewLogCount DB-level counter)"
tech-stack:
  added: []
  patterns:
    - "own fixed-name IndexedDB database (ks-offline-queue), deliberately independent of the buildId-namespaced route cache (D-00)"
    - "module-level reentrancy guard set synchronously before the first await, so a concurrent trigger short-circuits with a zeroed outcome"
    - "sequential, enqueue-order flush with injectable transport (post) for full branch coverage under Vitest without stubbing global fetch"
key-files:
  created:
    - lib/offline-queue.ts
    - tests/offline-queue.test.ts
    - components/OfflineQueueFlusher.tsx
    - e2e/offline-review-queue.spec.ts
  modified:
    - components/StudySession.tsx
    - app/layout.tsx
    - e2e/helpers/mutate.ts
    - e2e/run-mutate.ts
decisions:
  - "flushQueue's remaining count is computed as entries.length - stoppedAt (an index sentinel defaulting to entries.length), rather than incrementally counted — a single arithmetic expression covers both the all-flushed (stoppedAt === length) and stopped-partway (stoppedAt === failing index) cases with no separate branch"
  - "OfflineQueueFlusher's runFlush is a stable useCallback consumed both by the mount effect and useForegroundResume — matches ServiceWorkerProvider's existing pattern for the same hook, keeps the two trigger sites from diverging in behavior"
metrics:
  duration: "~40 minutes"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 7845
  tasks: 3
  commits: 3
---

# Phase 35 Plan 3: Offline Review Queue Summary

Reviews graded in airplane mode are now written to a durable, non-buildId-namespaced IndexedDB queue the moment the existing background-save retry chain exhausts on a network failure, and flushed exactly once — sequentially, in enqueue order, reentrancy-guarded — when the app comes back online or returns to the foreground, reusing `POST /api/review`'s existing idempotency-key discipline with zero server-side changes.

## What Was Built

**Task 1 — the durable queue (`lib/offline-queue.ts` + `tests/offline-queue.test.ts`):**
- A fixed-name `ks-offline-queue` IndexedDB database (constant `QUEUE_DB_NAME`), deliberately never importing `CACHE_DB_PREFIX` or any build-ID constant from `lib/local-cache.ts` — a deploy landing while a device is offline with unflushed grades cannot orphan them (D-00).
- `enqueueReview`/`readQueue`/`flushQueue` mirror `lib/local-cache.ts`'s established shape: lazy `getDb()` (never at module scope), every operation wrapped try/catch-to-silent-fallback.
- `flushQueue(post)` takes an injectable transport (default: a real `POST /api/review` sending exactly `cardId`/`rating`/`idempotencyKey`), walks the queue strictly sequentially with an `await` between each entry, and classifies: 2xx → delete + count `flushed`; 4xx → delete + count `dropped`; 5xx or thrown → stop the walk immediately, leaving that entry and every later one queued (never skips ahead, preserving per-card chronological ordering). A module-level `flushing` boolean, set synchronously before the first `await`, makes a concurrent second call return `{flushed:0, dropped:0, remaining:0}` without touching the store.
- 9 Vitest tests under `fake-indexeddb`: round-trip + enqueue-order readback, all-2xx empties the store, 4xx-then-2xx (dropped + later entries still flush), 5xx stops the walk with the correct `remaining`, a thrown error behaves identically to 5xx, the transport is proven never-concurrent via start/end event ordering, idempotency-key reuse across a re-flush of an already-applied entry, and the reentrancy guard under a gated in-flight first call.

**Task 2 — enqueue on failure, flush on reconnect/resume (`components/StudySession.tsx`, `components/OfflineQueueFlusher.tsx`, `app/layout.tsx`):**
- `StudySession.tsx`'s `postReviewWithRetry` exhaustion callback: the permanent (4xx) branch is untouched; the network-classified branch now calls `enqueueReview` with the same `cardId`/`rating`/`idempotencyKey` already in scope plus a `new Date().toISOString()` read inside the callback (never during render), and shows the existing "check your connection" toast only when `navigator.onLine` is true at that moment — offline, nothing renders (D-10).
- `components/OfflineQueueFlusher.tsx`: mount-once, no children, mirrors `ServiceWorkerProvider.tsx`'s shape. Calls `flushQueue()` once on mount (covers a force-quit relaunch) and again on every `useForegroundResume` boundary (`visibilitychange`/`pageshow`/`online`) — no background-sync/periodic-sync registration anywhere. Renders nothing when a flush reports zero dropped entries; renders the existing `Toast` naming how many could not be saved when a flush reports a non-zero dropped count (D-11), accumulating across triggers until dismissed.
- Mounted in `app/layout.tsx` immediately after `ServiceWorkerProvider`, leaving the rest of the tree's nesting untouched.

**Task 3 — Playwright exactly-once proof (`e2e/helpers/mutate.ts`, `e2e/run-mutate.ts`, `e2e/offline-review-queue.spec.ts`):**
- `reviewLogCountDirect`/`reviewLogCount` added to the e2e mutation harness following its established two-layer split (a `tsx`-subprocess-only direct Prisma function, a public wrapper that spawns it and parses the result).
- `e2e/offline-review-queue.spec.ts`: warms `/study`, confirms the service worker is active, reloads so the page is worker-controlled, starts a Passive flashcard session, records the pre-grade `ReviewLog` count, goes offline, grades two cards, polls the queue's own IndexedDB (opened directly via `QUEUE_DB_NAME`/`QUEUE_STORE`, the same constants the production module exports) until it holds 2 entries, asserts the `ReviewLog` count is unchanged (nothing reached the server offline), closes the page while keeping the browser context alive (simulating a force-quit), reconnects, opens a fresh page, polls until the queue is empty, asserts the count is baseline+2, then triggers a second flush via the existing `simulateResume` helper and asserts the count still reads baseline+2 (exactly-once, not at-least-once). Collects `pageerror` events on both pages and asserts none fired.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

## Environment Note (not a plan deviation)

This worktree had no `node_modules` at session start (git worktrees don't get their own install) and no generated Prisma client — the same one-time environment gap Plan 35-01 documented. Ran `npx prisma generate` then `npm ci` to enable a genuine `npm run lint` / `npx vitest run` / `npx playwright test` pass; this is local environment setup, not a plan or production build-pipeline change.

## Verification Performed

- `npm run lint` — 0 errors, 2 pre-existing unrelated warnings (`CardsClient.tsx`, `StudySession.tsx`), 0 new warnings.
- `npx vitest run tests/offline-queue.test.ts` — 9/9 passed.
- `npx vitest run` (full suite) — 388/388 passed across 35 files (was 379/34 files after Plan 35-01), no regressions.
- `npx playwright test e2e/offline-review-queue.spec.ts` — 2/2 passed (setup + the offline-queue spec) on the first run, against a genuine production build with a seeded isolated test DB.

## Self-Check: PASSED

- `lib/offline-queue.ts`, `tests/offline-queue.test.ts`, `components/OfflineQueueFlusher.tsx`, `e2e/offline-review-queue.spec.ts` — all FOUND on disk.
- Commits `eefdd7f`, `5f5cb7e`, `ddc1876` — all FOUND in `git log`.
