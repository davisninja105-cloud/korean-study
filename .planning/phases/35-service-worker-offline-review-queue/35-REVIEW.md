---
phase: 35-service-worker-offline-review-queue
reviewed: 2026-08-10T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - .gitignore
  - app/layout.tsx
  - components/CardsClient.tsx
  - components/HabitsClient.tsx
  - components/HomeClient.tsx
  - components/OfflineQueueFlusher.tsx
  - components/ServiceWorkerProvider.tsx
  - components/SettingsClient.tsx
  - components/StudyClient.tsx
  - components/StudySession.tsx
  - e2e/helpers/mutate.ts
  - e2e/offline-review-queue.spec.ts
  - e2e/run-mutate.ts
  - e2e/sw-offline-study-session.spec.ts
  - e2e/sw-shell-offline.spec.ts
  - eslint.config.mjs
  - lib/local-cache.ts
  - lib/offline-queue.ts
  - lib/service-worker.ts
  - lib/useForegroundResume.ts
  - middleware.ts
  - package.json
  - scripts/gen-sw.mjs
  - scripts/sw-runtime.mjs
  - scripts/sw-template.js
findings:
  critical: 3
  warning: 4
  info: 1
  total: 8
status: issues_found
---

# Phase 35: Code Review Report

**Reviewed:** 2026-08-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 25 (+4 test files skimmed for corroboration: tests/gen-sw.test.ts, tests/local-cache.test.ts, tests/offline-queue.test.ts, tests/sw-runtime.test.ts)
**Status:** issues_found

## Summary

This phase adds a versioned service worker (app-shell precache + navigate/cache-first/network-only routing), a `localStorage`-backed cache-context fallback for genuine cold offline launches, a Home-mount study-pool warm, and a durable IndexedDB offline review queue with sequential, idempotency-key-safe flushing. The unit-test coverage for the new pure helpers (`sw-runtime.mjs`, `gen-sw.mjs`, `offline-queue.ts`, `local-cache.ts`'s new fallback) is genuinely good and each of those modules' *documented* contracts is correctly implemented and tested.

The problems found below are all in the parts of the system that sit *between* well-tested pure units — the actual service-worker runtime script (`scripts/sw-template.js`, which is not unit-tested; only its pure `sw-runtime.mjs` half is), and the interaction between the new offline queue and the pre-existing undo/retry flow in `StudySession.tsx`. Three of them are correctness/data-integrity bugs that directly undermine this phase's own stated goals ("offline shell never serves the wrong page", "a graded review is durably queued instead of lost"), and none of them are covered by the new e2e specs, which only exercise the happy paths.

## Critical Issues

### CR-01: Service worker's `navigate` fetch handler caches a session-expiry login-page redirect under the real route's key

**File:** `scripts/sw-template.js:81-98`
**Issue:** The `install` handler's `warmNavigationRoute()` (lines 23-37 of the same file) explicitly guards against exactly this failure mode: *"an expired session redirects to /login, and without this check the login HTML would be cached under an app route's key and served as that route offline"* — and checks `new URL(response.url).pathname === route` before writing to cache. The runtime `fetch` event's `navigate` branch does **not** apply the same check:

```js
if (strategy === 'navigate') {
  const key = url.pathname
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(key, copy))   // <-- no response.url check
        }
        return response
      })
      .catch(() => caches.match(key))
  )
  return
}
```

`fetch(request)` follows redirects by default. `middleware.ts` redirects any unauthenticated page request to `/login`, which itself renders a normal `200 OK`. So a live navigation to e.g. `/study` while the session cookie has expired (auth cookie is a 1-year cookie, but users can clear cookies, use another device, or the shared password can be rotated) will: (1) render the login page correctly for the user online — no visible symptom — but (2) silently overwrite the good, previously-warmed `/study` cache entry with the login page's HTML, keyed under `/study`. The next time the user is genuinely offline and navigates to `/study`, the service worker serves the cached login page instead of the app, even though the user is authenticated and was working fine moments before. This directly defeats OFFLINE-01/OFFLINE-02's core promise and is untested by `e2e/sw-shell-offline.spec.ts` / `e2e/sw-offline-study-session.spec.ts` (neither simulates an expired-cookie navigation while online).
**Fix:**
```js
if (strategy === 'navigate') {
  const key = url.pathname
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(response.url).pathname === key) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(key, copy))
        }
        return response
      })
      .catch(() => caches.match(key))
  )
  return
}
```

### CR-02: `flushQueue` treats a `409` (explicitly retryable) response identically to a permanent `4xx`, silently discarding a recoverable offline review

**File:** `lib/offline-queue.ts:181-186`
**Issue:** `app/api/review/route.ts`'s optimistic-concurrency check returns `409` with the message `"Card review was updated concurrently; please retry"` when the `CardReview` row moved between read and write (e.g. a concurrent write from another open tab, or another device under this app's shared-password, multi-device usage model — see `CLAUDE.md`'s "single shared password" / no per-user model). `flushQueue`'s classification only distinguishes `2xx` / `4xx` / `5xx`:

```js
if (result.status >= 400 && result.status < 500) {
  await deleteEntry(entry.id!)
  dropped++
  continue
}
```

A `409` falls into this bucket and is treated exactly like a genuinely permanent failure (e.g. `404` for a deleted card): the entry is deleted from the durable queue and the user is shown *"…couldn't be saved — your progress wasn't recorded"* (`OfflineQueueFlusher.tsx:56-58`) with no further retry. This is precisely backwards for `409` — the server's own error message says the opposite ("please retry"), and this module's entire premise (its header comment: *"durably queued instead of lost"*) is violated for this status code. `lib/offline-queue.ts`'s own header comment and `35-RESEARCH.md`'s Pitfall 4 discuss `409` only in the context of avoiding out-of-order flushes; the "what should happen to a queued entry that itself gets a 409" question is never addressed, and the current behavior is a real data-loss path, not a documented trade-off.
**Fix:** Treat `409` the same as the "stop, keep queued, retry later" branch used for `5xx`/thrown errors, not the "drop" branch:
```js
if (result.status === 409) {
  // Concurrent modification — explicitly retryable per the server's own
  // contract. Stop the walk (same as 5xx) rather than dropping.
  stoppedAt = i
  break
}
if (result.status >= 400 && result.status < 500) {
  await deleteEntry(entry.id!)
  dropped++
  continue
}
```

### CR-03: Undoing a review never removes/cancels the corresponding entry from the offline queue — a successful undo can be silently reverted by a later automatic flush

**File:** `components/StudySession.tsx:541-569` (`handleUndo`), `lib/offline-queue.ts` (no removal API exists at all)
**Issue:** When the background save exhausts and is classified `network`, the review is durably enqueued (`StudySession.tsx:500`, `enqueueReview(...)`) *before* the user has necessarily decided whether to undo. `handleUndo` (lines 541-569) only calls `controller.abort()` (which prevents `onExhausted`/`enqueueReview` from firing **if it hasn't already fired**) and `POST /api/review/undo`. It has zero awareness of `lib/offline-queue.ts`, which exports no `cardId`/`idempotencyKey`-scoped removal function at all (only `enqueueReview`, `readQueue`, `flushQueue`).

Concretely:
1. User grades a card while offline. The background save's bounded retry (`postReviewWithRetry`, ~500ms–1500ms backoff between attempts, often exhausting in a few seconds while genuinely offline) exhausts and calls `enqueueReview(...)` — the review is now durably queued but not yet sent.
2. User taps **Undo** shortly after (a very ordinary user action — `canUndo` is available immediately on grade, independent of whether the background save has settled). `controller.abort()` is a no-op at this point since the retry chain already finished. `POST /api/review/undo` either fails (still offline — caught, `canUndo` re-armed, no state restore, no queue cleanup) or later succeeds (once reconnected — `CardReview` is reverted server-side to `prevState`).
3. Independently, some later foreground-resume/`online` event (`OfflineQueueFlusher`'s mount-once + `useForegroundResume` triggers) fires `flushQueue()`, which still contains the original queued entry from step 1 and POSTs it to `/api/review` — reapplying the **exact grade the user undid**, since nothing ever removed it.

The user is left believing the undo worked (or retried it and it appeared to succeed), while the FSRS state is silently corrupted again by the stale queued entry at some later, unrelated moment. This is untested — `e2e/offline-review-queue.spec.ts` never exercises undo, and no unit test in `tests/offline-queue.test.ts` covers cancellation/removal because no such API exists.
**Fix:** Give `lib/offline-queue.ts` a way to invalidate a queued entry by `idempotencyKey` (the value already threaded through `undoRef.current`/`onReviewCommitted` would need to also be threaded into the undo snapshot), and call it from `handleUndo`'s success path (and ideally also its abort path, before `onExhausted` can fire):
```ts
// lib/offline-queue.ts
export async function removeQueuedReviewByKey(idempotencyKey: string): Promise<void> {
  try {
    const db = await getDb()
    const all = (await db.getAll(QUEUE_STORE)) as QueuedReview[]
    const match = all.find((e) => e.idempotencyKey === idempotencyKey)
    if (match?.id !== undefined) await db.delete(QUEUE_STORE, match.id)
  } catch {
    // Silent no-op — matches this module's established convention.
  }
}
```
and call `void removeQueuedReviewByKey(idempotencyKey)` from `handleUndo` once the undo request itself succeeds (and store `idempotencyKey` in `undoRef.current` so it's available there).

## Warnings

### WR-01: Cache-first strategy caches non-`ok` responses (4xx/5xx), unlike the `navigate` branch

**File:** `scripts/sw-template.js:108-118`
**Issue:** The `cache-first` branch (used for every same-origin, non-navigate, non-`/api/` request — i.e. all static/hashed assets) writes whatever `fetch(request)` returns into the cache with no `response.ok` check, unlike the `navigate` branch a few lines above it which does check. A transient `500` (or a stale reference to an asset the current deploy no longer serves, yielding `404`) gets permanently cached for the life of that `CACHE_NAME` (which only busts on the next deploy's new `buildId`), so a single bad response can poison an asset for an entire deployment's lifetime.
**Fix:**
```js
return fetch(request).then((response) => {
  if (response.ok) {
    const copy = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
  }
  return response
})
```

### WR-02: `flushQueue`'s reentrancy guard is per-tab, not cross-tab, even though the queue's IndexedDB store is shared across tabs by design

**File:** `lib/offline-queue.ts:142-166`
**Issue:** The module-level `let flushing = false` guard (explicitly documented as "never per-call state" to protect against two triggers firing in the same tab) only exists in that tab's JS heap. `QUEUE_DB_NAME = 'ks-offline-queue'` is a fixed, non-buildId-namespaced, origin-scoped IndexedDB database, so it is genuinely shared across every open tab of the app. Two tabs that both receive an `online` event around the same time (a realistic scenario — `useForegroundResume` fires on `online` in every tab) can each independently pass their own `flushing` check and both call `readQueue()` before either has deleted anything, then both POST the same batch of entries. Correctness is saved only by the server's idempotency-key `ReviewLog` UNIQUE constraint (the second tab's POSTs come back as idempotent `200`s), so no double-apply occurs, but this doubles outbound `/api/review` traffic on every multi-tab reconnect and is not covered by any test (`tests/offline-queue.test.ts`'s reentrancy test only exercises a single module instance).
**Fix:** Not necessarily required to fix, but worth either documenting as an accepted trade-off or coordinating via a `BroadcastChannel`/`navigator.locks` mutex so only one tab flushes at a time.

### WR-03: `fetchCacheContextOrLastKnown()`'s `stale` marker is read by only one of its ~9 call sites, so a genuine offline cold launch still attempts (and silently fails) a revalidation fetch in every `*Client.tsx`

**File:** `components/HomeClient.tsx:173-266`, `components/CardsClient.tsx:566-616`, `components/HabitsClient.tsx:143-162`, `components/StudyClient.tsx` (mount + boundary-event effects)
**Issue:** `lib/local-cache.ts`'s `fetchCacheContextOrLastKnown()` was extended this phase specifically to mark a fallback (offline, no live `/api/version` reachable) context with `stale: true` so callers can distinguish "we have a build id, but only because we're offline" from a genuinely live one. `HomeClient.tsx`'s new study-pool warm correctly checks `if (!ctx.stale) { … }` (line ~201) before attempting a network fetch — but every *pre-existing* revalidation branch in all four `*Client.tsx` files (the mount effect's `if (!cached || cached.dataVersion !== version) { await revalidate(...) }`, and the boundary-event effect's equivalent) was not updated to also check `ctx.stale`, even though they were touched in this diff only to rename `fetchCacheContext` → `fetchCacheContextOrLastKnown`. On a genuine offline cold launch, this means every one of the four routes still attempts a doomed network revalidation on mount and on every subsequent `visibilitychange`/`popstate`/`pageshow`, briefly flashing the "Updating…" pill (`isRevalidating`) each time before the fetch fails silently.
**Fix:** Gate each of those revalidation branches on `!ctx.stale` as well, e.g. in `HomeClient.tsx`:
```ts
if (!ctx.stale && (!cached || cached.dataVersion !== version)) {
  setIsRevalidating(true)
  ...
```

### WR-04: `activateWaitingWorker()` arms a one-shot reload listener even when there is no waiting worker to activate

**File:** `lib/service-worker.ts:58-64`
**Issue:**
```ts
export function activateWaitingWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
  navigator.serviceWorker.getRegistration().then((registration) => {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }, () => {})
}
```
The `controllerchange` listener is registered unconditionally, before the async `getRegistration()` call even confirms a `waiting` worker exists. If `registration.waiting` has become `null` by the time this resolves (e.g. the waiting worker was superseded by a newer install, or already auto-activated), no `SKIP_WAITING` message is posted, but the listener remains armed (`{ once: true }` only means it fires once, not that it self-removes if never triggered by *this* action) and will fire — reloading the page unexpectedly — on whatever unrelated future `controllerchange` event eventually occurs (e.g. the next deploy's activation on a later app relaunch). Low probability but a real dangling side-effect.
**Fix:** Only attach the listener once a `waiting` worker is confirmed present:
```ts
export function activateWaitingWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration?.waiting) return
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
  }, () => {})
}
```

## Info

### IN-01: Offline-queue "couldn't be saved" toast auto-dismisses after 4s like every other `Toast`, for an unrecoverable-data-loss message

**File:** `components/OfflineQueueFlusher.tsx:53-60`, `components/Toast.tsx:41`
**Issue:** `OfflineQueueFlusher` reuses the shared `Toast` component, which self-dismisses after a default `duration = 4000`ms. Unlike a transient "sync failed, tap to retry" message, this toast reports that specific reviews were **permanently and irrecoverably dropped** ("your progress wasn't recorded"), and can fire on an unattended foreground-resume (app reopened, `useForegroundResume`'s mount-once + resume triggers) when the user may not be looking at the screen yet. Given CR-02 above, this message will also now fire in the fixed 409 case's *old* behavior even after that fix, since it also covers genuine `4xx`s like a deleted card. Consider a longer duration or a persistent/dismiss-only pattern for this specific toast, distinguishing it from the app's other transient status toasts.
**Fix:** e.g. `<Toast message={message} duration={10000} onDismiss={...} />`, or omit `duration` handling entirely for this call site (require explicit dismiss).

---

_Reviewed: 2026-08-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
