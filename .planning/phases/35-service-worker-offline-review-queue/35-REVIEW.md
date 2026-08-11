---
phase: 35-service-worker-offline-review-queue
reviewed: 2026-08-11T00:00:00Z
depth: standard
files_reviewed: 28
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
  - e2e/offline-review-queue-recovery.spec.ts
  - e2e/offline-review-queue.spec.ts
  - e2e/run-mutate.ts
  - e2e/sw-navigate-session-expiry.spec.ts
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
  - tests/gen-sw.test.ts
  - tests/local-cache.test.ts
  - tests/offline-queue.test.ts
  - tests/sw-runtime.test.ts
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 35: Code Review Report (Re-Review)

**Reviewed:** 2026-08-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 28 (config list) — 4 of these (`tests/*.test.ts`) are unit-test files skimmed for corroboration only, per the "no findings in test files" rule; 2 (`components/CardsClient.tsx`, `components/SettingsClient.tsx`) carry no Phase 35 changes at all (confirmed via `git log`/`grep` — no import of `lib/offline-queue.ts` or `lib/service-worker.ts` anywhere in either file) and are noted here for completeness rather than re-litigated.
**Status:** issues_found (0 Critical / 4 Warning / 2 Info — all four Warnings and the first Info item are carried forward, unfixed, from the prior `35-REVIEW.md`)

## Summary

This is a re-review of Phase 35 after gap-closure plan 35-04 landed fixes for the three Critical findings (CR-01/CR-02/CR-03) from the prior `35-REVIEW.md` / `35-VERIFICATION.md`. All three fixes were independently re-derived from source (not merely trusted from the SUMMARY) and are **sound** — see the verification section below. No new Critical or data-loss-class bug was introduced by the gap-closure diff itself.

However, four of the five Warning/Info items the prior review found (`WR-01`–`WR-04`) remain **unpatched in the current source**, confirmed by direct inspection of every file each finding cites. `35-VERIFICATION.md` explicitly deferred these as non-blocking for phase closure ("not blocking this phase's goal and can be deferred"), so their continued presence is an accepted, on-the-record trade-off rather than an oversight — but they are re-surfaced here in full per this review's adversarial mandate, since "previously deferred" is not the same as "fixed." One new, narrow, low-probability Info-level race is noted from fresh analysis of the CR-03 wiring.

`npx vitest run` (81/81 across the four Phase-35 test files), `npx tsc --noEmit`, and `npx eslint` (0 errors; 1 pre-existing, explicitly-documented-as-expected warning in `StudySession.tsx`, unrelated to this phase's changes) all pass clean as of this review.

## Re-Review: CR-01 / CR-02 / CR-03 Verification

### CR-01 — navigation cache-poisoning guard (FIXED, sound)

`scripts/sw-runtime.mjs` now exports `shouldCacheNavigationResponse(responseOk, responseUrl, key)`, a single pure predicate (fails closed on a non-ok response, an unparseable URL, or an empty string) consumed by **both** call sites that write a navigation document into the shell cache: the install-time `warmNavigationRoute()` and the runtime `fetch` handler's `navigate` branch (`scripts/sw-template.js:34` and `:95`). This closes the exact divergence the prior review flagged (`warmNavigationRoute` had the check; the runtime branch didn't). Verified:
- `tests/sw-runtime.test.ts` — 8 new cases covering ok/non-ok, matching/mismatched pathname, trailing-slash, prefix-collision, empty string, and unparseable-URL inputs — all pass.
- `e2e/sw-navigate-session-expiry.spec.ts` — a real online navigation with cookies cleared (middleware redirects `/study`→`/login`, 200 OK) is followed by reading the shell-cache entry directly and confirming it still contains the real `/study` document, then a genuine offline cold navigation to `/study` still serves the app (not the login form).
- Worth noting for future readers (documented candidly in `35-04-SUMMARY.md`'s own "Deviations" and independently plausible from the Service Worker spec): a `fetch` event's `request` for a `navigate`-mode request is forced to `redirect: 'manual'` by the platform, so the literal redirect-following exploit this finding originally described does not reproduce in real browsers today — `fetch(event.request)` for such a request resolves to an `opaqueredirect` (`ok: false`) response, which the pre-existing bare `if (response.ok)` check already rejected. This does **not** make the fix pointless: `warmNavigationRoute`'s plain (non-event-intercepted) `fetch(route)` call *does* follow redirects by default and genuinely needed this exact guard, and the shared predicate is correct defense-in-depth against any future code path that reconstructs the request with an explicit `redirect: 'follow'`. No action needed; noted for context only.

### CR-02 — 409 misclassification in `flushQueue` (FIXED, sound)

`lib/offline-queue.ts:226-229` now checks `result.status === 409` **before** the general `4xx` branch and treats it identically to the `5xx`/thrown-error path: `stoppedAt = i; break` — never deletes, never counts `dropped` or `flushed`, preserving enqueue order for the still-queued entry. Verified:
- `tests/offline-queue.test.ts` — 5 new cases: 409 on the first of three (stop immediately, all three remain, transport called once), 409 on the second of three (first flushes, second+third remain), a later flush with the same idempotencyKey lands the retried entry exactly once, `400`/`404` keep the pre-existing drop behavior unchanged, and a bare non-vacuity check that 409 never increments `dropped`.
- `e2e/offline-review-queue-recovery.spec.ts` — a real page-level `fetch` override returns 409 for the replayed POST; the entry stays queued (`readQueueCount` stays 1), `ReviewLog` count stays at baseline, the "couldn't be saved" Toast is confirmed absent (correct — a 409 is not a permanent loss), and a subsequent flush with the real transport restored lands it exactly once.

### CR-03 — undo doesn't cancel a queued offline review (FIXED, sound with one narrow residual noted below)

`removeQueuedReviewByKey(idempotencyKey)` (`lib/offline-queue.ts:146-159`) deletes every queue entry whose `idempotencyKey` is `===`-equal to the argument (intentionally not `startsWith`/prefix/cardId matching — verified by the "strict prefix removes nothing" and "case-differing key removes nothing" unit tests). `idempotencyKey` is now threaded through `undoRef.current` (grade-time assignment at `StudySession.tsx:471`/`483`, destructured at `:556`, re-armed unchanged on the undo-failure path at `:587-596`) and `handleUndo` calls it **twice**: immediately after `controller.abort()` and before the undo POST fires (`:569`, the only outcome achievable while genuinely offline), and again after the undo POST resolves `ok` (`:608`, covering the narrow window between the abort call and the response). Verified:
- `tests/offline-queue.test.ts` — exact-key removal leaves siblings untouched and in order, a no-match call is a safe no-op, a subsequent `flushQueue` never calls the transport for a removed entry.
- `e2e/offline-review-queue-recovery.spec.ts` — a review graded offline is confirmed durably queued, then undone while still offline (queue count polls to 0 immediately — proving the cancel-path call, not the success-path one, since the undo POST cannot succeed offline), reconnect + two separate flush triggers both leave `ReviewLog` at baseline.

**One narrow residual noted (see IN-02 below, not a blocker):** the fix's own design already double-covers the realistic race window (the cancel-path call plus, when the undo POST round-trips successfully, a second call after that round trip) — but a pathological timing coincidence where `enqueueReview`'s IndexedDB write commits *after* both `removeQueuedReviewByKey` calls have already run (and the undo POST itself also fails, e.g. still offline) can theoretically still leave a stale entry in the queue. This requires the user's Undo tap to land within the same handful of milliseconds as the automatic retry-exhaustion→enqueue callback — not achievable by normal human interaction, and not observed or reproduced; documented for completeness only.

## Warnings

All four items below are carried forward from `35-REVIEW.md`, confirmed **still present** in the current source by direct re-inspection (not merely copied from the prior report) and independently corroborated by `35-VERIFICATION.md`'s Anti-Patterns table.

### WR-01: `cache-first` strategy caches non-`ok` responses (4xx/5xx), unlike the `navigate` branch a few lines above it

**File:** `scripts/sw-template.js:114-124`
**Issue:** The `cache-first` branch (every same-origin, non-navigate, non-`/api/*` request — i.e. every hashed static asset, icon, font, and manifest file) writes whatever `fetch(request)` returns into the cache with no `response.ok` check:
```js
event.respondWith(
  caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      return response
    })
  })
)
```
A transient `500`, or a `404` for a hashed asset the current build no longer serves (e.g. a race during a rolling deploy), gets permanently cached for the entire lifetime of that build's `CACHE_NAME` (which only busts on the *next* deploy's new `buildId`) — one bad response poisons that asset for every subsequent request until the next deploy. The `navigate` branch immediately above already demonstrates the correct pattern via `shouldCacheNavigationResponse`'s `responseOk` check.
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

### WR-02: `flushQueue`'s reentrancy guard is per-tab, not cross-tab, even though the queue's IndexedDB store is shared across every open tab

**File:** `lib/offline-queue.ts:175-207`
**Issue:** `let flushing = false` is module-level JS-heap state, scoped to a single tab's execution context. `QUEUE_DB_NAME = 'ks-offline-queue'` is a fixed, non-buildId-namespaced, origin-scoped IndexedDB database — genuinely shared across every open tab. Two tabs that both receive an `online` event around the same moment (realistic: `useForegroundResume` fires on `online` in every mounted tab) can each independently pass their own `flushing` check, both `readQueue()` before either has deleted anything, and both POST the same batch. Correctness is only saved by the server's idempotency-key `ReviewLog` UNIQUE constraint (the second tab's POSTs come back as idempotent successes), so no double-apply occurs, but outbound `/api/review` traffic doubles on every multi-tab reconnect. No test exercises multiple concurrent `flushQueue` "module instances" simulating separate tabs.
**Fix:** Not necessarily required, but worth either an explicit code comment documenting the accepted trade-off, or a `BroadcastChannel`/`navigator.locks` mutex so only one tab flushes at a time.

### WR-03: `fetchCacheContextOrLastKnown()`'s `stale` marker is honored by only 1 of ~9 revalidation call sites

**File:** `components/HomeClient.tsx:173-266`, `components/CardsClient.tsx:566-616`, `components/HabitsClient.tsx:143-162`, `components/StudyClient.tsx:220-286`
**Issue:** `lib/local-cache.ts`'s `fetchCacheContextOrLastKnown()` marks a fallback context (genuinely offline, no live `/api/version` reachable) with `stale: true` specifically so callers can skip a doomed network revalidation. Confirmed by grep: the **only** call site anywhere in the codebase that reads `ctx.stale` is the new Home-mount study-pool warm block this same phase added (`HomeClient.tsx:201`, `if (!ctx.stale) { fetch('/api/cards/due?scope=due')... }`). Every pre-existing revalidation branch in all four `*Client.tsx` files' mount effects and boundary-event effects (`if (!cached || cached.dataVersion !== version) { await revalidate(...) }`) still fires unconditionally on a genuine offline cold launch, briefly flashing the "Updating…" pill each time before the fetch fails silently. This is a missed-consistency bug in the same diff that introduced the `stale` flag's one correct usage — the other four/eight call sites were not updated to match.
**Fix:** Gate each revalidation branch on `!ctx.stale` as well, e.g. in `HomeClient.tsx`:
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
The `controllerchange` listener is registered unconditionally, before the async `getRegistration()` call confirms a `waiting` worker actually exists. If `registration.waiting` is `null` by the time this resolves (e.g. superseded by a newer install, or already auto-activated), no `SKIP_WAITING` message is posted, but the listener stays armed (`{ once: true }` only means it fires once, it does not self-remove if never triggered by *this* invocation's own action) and will fire — reloading the page unexpectedly — on whatever unrelated future `controllerchange` event eventually occurs (e.g. a later, entirely separate deploy's activation).
**Fix:**
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

**File:** `components/OfflineQueueFlusher.tsx:55-60`, `components/Toast.tsx:29` (`duration = 4000` default)
**Issue:** `OfflineQueueFlusher` reuses the shared `Toast` component at its default 4-second auto-dismiss. Unlike a transient "sync failed, tap to retry" message, this toast reports that reviews were **permanently and irrecoverably dropped** ("your progress wasn't recorded"), and can fire on an unattended foreground-resume (app reopened via `useForegroundResume`'s mount + resume triggers) before the user is necessarily looking at the screen. Post-CR-02, this now correctly excludes the 409 case (good), but still fires identically for a genuine permanent `4xx` (e.g. a card deleted on another device while this one was offline).
**Fix:** e.g. `<Toast message={message} duration={10000} onDismiss={...} />`, or require explicit dismiss for this specific call site.

### IN-02 (new): Theoretical residual race between `enqueueReview`'s async IndexedDB write and `handleUndo`'s two `removeQueuedReviewByKey` calls

**File:** `components/StudySession.tsx:497-522` (`postReviewWithRetry`'s `onExhausted` callback → `enqueueReview`), `components/StudySession.tsx:554-609` (`handleUndo`)
**Issue:** Documented in the CR-03 verification section above. `enqueueReview(...)` is called fire-and-forget from the retry-exhaustion callback; its IndexedDB write is not guaranteed to have committed by the time a near-simultaneous `handleUndo` invocation runs its cancel-path `removeQueuedReviewByKey` call. The design already closes this window in the overwhelmingly common case via the second (post-undo-POST) removal call, and the gap requires a user interaction faster than is humanly achievable (the retry chain takes multiple seconds to exhaust; a human tapping Undo in response to seeing the card advance cannot land inside a sub-millisecond IndexedDB-write window). Not reproduced, not covered by any test, and not scored as a blocker — documented for completeness since the code's own comments claim exhaustive coverage of "the narrow window between abort and response," which is accurate for the online-undo-succeeds case but not for the still-offline-undo-fails case examined here.
**Fix:** Not necessary given the practical unreachability, but if ever hardened: have `postReviewWithRetry`'s `onExhausted` callback `await` the `enqueueReview` call (currently `void`-fired) before returning, which would make the ordering relative to any synchronously-following `handleUndo` call deterministic rather than a race.

---

_Reviewed: 2026-08-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
