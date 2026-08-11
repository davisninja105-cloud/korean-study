---
phase: 35-service-worker-offline-review-queue
verified: 2026-08-11T00:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "A versioned service worker precaches the app shell with a clear invalidation path (CR-01 — navigate branch cache-poisoning via session-expiry redirect)"
    - "Each review taken offline lands exactly once and is never silently lost (CR-02 — 409 misclassified as permanent drop; CR-03 — undo doesn't cancel a queued review)"
  gaps_remaining: []
  regressions: []
---

# Phase 35: Service Worker & Offline Review Queue Verification Report

**Phase Goal:** Turn "fast" into "works without a network." Precache the app shell, bundles, fonts, and icons behind a versioned service worker with a clear invalidation path, and persist the review queue to IndexedDB so a session studied in airplane mode lands exactly once when the app next comes to the foreground online.

**Verified:** 2026-08-11
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 35-04)

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | A versioned service worker precaches the app shell, JS/CSS bundles, `public/fonts/`, and the icon set; static assets serve cache-first and `/api/*` serves network-first; a new build replaces the cached shell instead of serving stale JS — with a **clear invalidation path** (no route cache entry can be silently poisoned by a stray response) | ✓ VERIFIED | Core precache/versioning mechanism unchanged from prior pass and still tested. CR-01 gap closed: `scripts/sw-runtime.mjs` now exports `shouldCacheNavigationResponse(responseOk, responseUrl, key)` — a single, fail-closed, exact-pathname-equality predicate — consumed by BOTH `warmNavigationRoute` (install-time) and the runtime `navigate` fetch-handler branch (`scripts/sw-template.js:34`, `:95`). Read directly from source (not from SUMMARY) and confirmed identical to what 35-REVIEW.md's re-review independently derived. `tests/sw-runtime.test.ts`'s new `describe('shouldCacheNavigationResponse', …)` block (8 cases: ok/non-ok, exact match, `/login` vs `/study` mismatch, trailing-slash mismatch, prefix-collision mismatch, empty url, unparseable url, query-string-with-matching-pathname) passes. `e2e/sw-navigate-session-expiry.spec.ts` independently re-run in this verification pass (not just SUMMARY-trusted) — 1/1 pass, proving a live expired-session navigation to `/study` cannot poison the cached `/study` document, and a subsequent genuinely offline navigation still serves the real app. |
| 2 | In airplane mode, tapping the home-screen icon launches the app and runs a full study session on cached cards | ✓ VERIFIED | Unchanged from prior pass — `lib/local-cache.ts` + `HomeClient.tsx` mount warm wired and tested. `e2e/sw-offline-study-session.spec.ts` independently re-run in this verification pass — 1/1 pass. |
| 3 | Reviews taken offline survive a force-quit: restoring the network and reopening the app flushes them, and each review lands exactly once — verified against `ReviewLog`/the review counter, reusing the existing `postReviewWithRetry` idempotency-key discipline | ✓ VERIFIED | Happy-path mechanics unchanged and still tested (`e2e/offline-review-queue.spec.ts`, independently re-run — 1/1 pass). CR-02 gap closed: `lib/offline-queue.ts:226-229` — `flushQueue`'s per-entry classification now checks `result.status === 409` **before** the general 4xx branch and treats it identically to 5xx (`stoppedAt = i; break` — never deletes, never counts `dropped`/`flushed`), confirmed by direct source read. `tests/offline-queue.test.ts`'s `describe('flushQueue — 409 is retryable, not a drop', …)` block passes (409 on entry 1 of 3 → all 3 remain, transport called once; 409 on entry 2 of 3 → entry 1 flushes, 2+3 remain in order; later 200 flush lands the retried entry with its original idempotencyKey; 400/404 unchanged). CR-03 gap closed: `removeQueuedReviewByKey(idempotencyKey)` (`lib/offline-queue.ts:146-159`) added, deletes every entry whose `idempotencyKey` is strictly `===`-equal (never prefix/cardId/index matching, confirmed via the "strict prefix removes nothing" and "case-differing key removes nothing" unit cases). Wired into `components/StudySession.tsx`'s `handleUndo` at two call sites read directly from source: line 569 (cancel path, immediately after `controller.abort()`, before the undo POST — the only outcome achievable while genuinely offline) and line 608 (success path, after the undo POST resolves `ok`), with `idempotencyKey` threaded through the `undoRef` snapshot (grade-time assignment line 483, destructure line 556, failure-path re-arm line 595). `e2e/offline-review-queue-recovery.spec.ts` independently re-run in this verification pass (not SUMMARY-trusted) — 2/2 pass: (a) a 409 mid-flush leaves the review queued (not dropped), the permanent-failure Toast does not fire, and it lands exactly once after the real transport is restored; (b) a review graded offline and then undone while still offline is confirmed removed from the durable queue, and two separate reconnect/flush triggers both leave `ReviewLog` at baseline (never replayed). |
| 4 | The flush is triggered by the `online` event and by the app returning to the foreground, with no registration of or reliance on the Background Sync API | ✓ VERIFIED | Unchanged from prior pass. `components/OfflineQueueFlusher.tsx` calls `flushQueue()` on mount and via `useForegroundResume`. No `sync`/`periodicSync` listener registration found anywhere in the worker template or generated `public/sw.js`. |

**Score:** 4/4 truths verified. Both truths that failed the prior verification pass (#1's invalidation-path guarantee and #3's "lands exactly once, never lost" guarantee) now hold under direct source inspection AND independently re-executed automated proof — this verification did not rely on 35-04-SUMMARY.md's or 35-REVIEW.md's claims alone.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `scripts/sw-runtime.mjs` | Pure routing/invalidation helpers, now including `shouldCacheNavigationResponse` | ✓ VERIFIED | Present, exported once (`grep -c "export function shouldCacheNavigationResponse"` = 1), imported/inlined into `sw-template.js`, JSDoc names CR-01 explicitly |
| `scripts/sw-template.js` | install/activate/fetch/message handlers, both navigation cache-write sites gated by the shared predicate | ✓ VERIFIED | `warmNavigationRoute` (line 34) and the runtime `navigate` branch (line 95) both call `shouldCacheNavigationResponse` — confirmed by direct read, not grep-only |
| `scripts/gen-sw.mjs` | Build-time generator | ✓ VERIFIED | Unchanged from prior pass; independently confirmed via a real `npm run build` invocation during this verification's e2e run, which regenerated `public/sw.js` with 42 precache entries and cache name `ks-shell-local-dev` |
| `lib/offline-queue.ts` | Durable IndexedDB queue, sequential flush, 409-retryable classification, exact-key cancellation | ✓ VERIFIED | Present; `flushQueue`'s 409 branch and `removeQueuedReviewByKey` both read directly from source and match the plan/review's description exactly; `QUEUE_DB_NAME`/`QUEUE_STORE`/`enqueueReview`/`readQueue`/`flushQueue`/`removeQueuedReviewByKey` all exported |
| `components/StudySession.tsx` | `idempotencyKey` threaded into undo snapshot, `removeQueuedReviewByKey` wired into `handleUndo` at both cancel and success paths | ✓ VERIFIED | Confirmed by direct read: undoRef type literal, grade-time assignment, handleUndo destructure, failure-path re-arm, and both `void removeQueuedReviewByKey(idempotencyKey)` call sites all present |
| `tests/sw-runtime.test.ts` | New `describe('shouldCacheNavigationResponse', …)` block | ✓ VERIFIED | Present; part of the 81/81 passing suite re-run in this verification |
| `tests/offline-queue.test.ts` | New 409 classification + `removeQueuedReviewByKey` describe blocks | ✓ VERIFIED | Present; part of the 81/81 passing suite re-run in this verification |
| `e2e/sw-navigate-session-expiry.spec.ts` | Regression proof for CR-01 | ✓ VERIFIED | Independently re-executed in this verification pass — 1/1 pass |
| `e2e/offline-review-queue-recovery.spec.ts` | Regression proofs for CR-02 and CR-03 | ✓ VERIFIED | Independently re-executed in this verification pass — 2/2 pass |
| `e2e/sw-shell-offline.spec.ts`, `e2e/sw-offline-study-session.spec.ts`, `e2e/offline-review-queue.spec.ts` | Prior phase's existing e2e proofs, no regression | ✓ VERIFIED | Independently re-executed in this verification pass — 5/5, 1/1, 1/1 pass (test counts differ from 35-01/35-03-VERIFICATION's originally-cited 6/6, 2/2, 2/2, which 35-04-SUMMARY.md documents as a pre-existing plan-verification-script inaccuracy, not a regression — confirmed here by actually running them) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scripts/sw-runtime.mjs` `shouldCacheNavigationResponse` | `scripts/sw-template.js` `warmNavigationRoute` (install) AND runtime `navigate` branch | Same predicate, both call sites | ✓ WIRED | Confirmed by direct source read at both call sites |
| `components/StudySession.tsx` `handleUndo` | `lib/offline-queue.ts` `removeQueuedReviewByKey` | Two call sites (cancel path + success path) | ✓ WIRED | Previously the prior verification's headline "NOT WIRED" finding — now confirmed wired at lines 569 and 608 |
| `lib/offline-queue.ts` `flushQueue` | `app/api/review/route.ts` | Replayed POST honoring the 409 `StaleReviewError` branch | ✓ WIRED | 409 now stops-and-keeps rather than drops, confirmed by source and by the e2e's fetch-stub proof |
| `package.json` build script | `scripts/gen-sw.mjs` | `node scripts/gen-sw.mjs` chained after `next build` | ✓ WIRED | Confirmed via a real build run in this verification pass |
| `app/layout.tsx` | `components/ServiceWorkerProvider.tsx` / `components/OfflineQueueFlusher.tsx` | Mount-once render | ✓ WIRED | Unchanged from prior pass |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| OFFLINE-01 | 35-01-PLAN.md, closed by 35-04-PLAN.md | Versioned SW precaches shell/bundles/fonts/icons; cache-first static, network-first `/api/*`; clear invalidation path | ✓ SATISFIED | CR-01 fixed and independently confirmed (source + re-executed e2e). REQUIREMENTS.md now lists this `[x]` Complete, consistent with this finding. |
| OFFLINE-02 | 35-02-PLAN.md | Study session runs on cached cards in airplane mode | ✓ SATISFIED | Unchanged from prior `passed` finding. REQUIREMENTS.md lists `[x]` Complete. |
| OFFLINE-03 | 35-03-PLAN.md, closed by 35-04-PLAN.md | Reviews queued in IndexedDB, flush exactly once, no Background Sync | ✓ SATISFIED | CR-02 and CR-03 fixed and independently confirmed (source + re-executed e2e). REQUIREMENTS.md now lists this `[x]` Complete. |

No orphaned requirements — all three IDs mapped to this phase in REQUIREMENTS.md are claimed by plans within this phase (35-01/35-04 for OFFLINE-01, 35-02 for OFFLINE-02, 35-03/35-04 for OFFLINE-03).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `scripts/sw-template.js` navigate cache write | cached route HTML | Live `fetch(request)` response, gated by `shouldCacheNavigationResponse` | Correct — a mismatched-pathname response (e.g. login redirect) is never written under the route's key | ✓ FLOWING (previously ⚠️ HOLLOW under CR-01) |
| `lib/offline-queue.ts` `flushQueue` | `ReviewLog` row | `POST /api/review` replay | Correct for 2xx/404/5xx AND now 409 (stopped, retried later, never dropped) | ✓ FLOWING (previously ⚠️ HOLLOW for the 409 branch) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| sw-runtime/gen-sw/local-cache/offline-queue unit suites | `npx vitest run tests/offline-queue.test.ts tests/sw-runtime.test.ts tests/gen-sw.test.ts tests/local-cache.test.ts` | 4 files, 81/81 tests passed | ✓ PASS |
| Debt-marker scan on phase files (including 35-04's new/modified files) | `grep -n "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all phase-created/modified core files | No matches | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 2 pre-existing unrelated warnings (`CardsClient.tsx`, `StudySession.tsx` — both `exhaustive-deps`, both pre-dating this phase's changes) | ✓ PASS |
| Full e2e suite for this phase — **independently re-executed in this verification pass**, not relied on SUMMARY claims | `env -u DATABASE_URL -u DATABASE_AUTH_TOKEN npx playwright test e2e/sw-navigate-session-expiry.spec.ts e2e/offline-review-queue-recovery.spec.ts e2e/sw-shell-offline.spec.ts e2e/sw-offline-study-session.spec.ts e2e/offline-review-queue.spec.ts` | 11/11 passed (51.6s) — includes the CR-01 regression spec, both CR-02/CR-03 regression tests, and all three pre-existing specs with zero regression | ✓ PASS |

Unlike the prior verification pass (which relied on line-level source inspection alone because "full playwright e2e re-execution was not performed"), this re-verification pass ran the full isolated Playwright harness end-to-end (prod build + seeded SQLite DB + browser on port 3100) and observed all 11 tests pass directly — the strongest available evidence that CR-01/CR-02/CR-03 are genuinely fixed, not merely claimed fixed.

### Anti-Patterns Found

None. No debt markers found in any phase file (original 01-03 files or the 04 gap-closure files). The three Critical findings from the original 35-REVIEW.md are confirmed fixed by direct source inspection, unit test execution, and independent e2e re-execution.

The re-review (`35-REVIEW.md`, dated 2026-08-11, "Re-Review") also independently re-derived all three fixes from source (its own words: "not merely trusted from the SUMMARY") and found them sound with zero new Critical issues. This verification pass corroborates that finding through its own independent read of the same source files plus a fresh e2e execution — it does not simply defer to the re-review's conclusion.

Four Warning/Info items remain, all explicitly deferred as non-blocking by the prior verification pass and carried forward unchanged (not newly introduced, not scored against this phase's goal):

| File | Line(s) | Pattern | Severity | Impact |
|---|---|---|---|---|
| `scripts/sw-template.js` | 114-124 | `cache-first` branch caches on any response with no `response.ok` check (WR-01) | ⚠️ Warning | A transient bad response can poison a static asset for the deploy's lifetime. Deferred by the original verification's Gaps Summary; not part of this phase's stated must-haves. |
| `lib/offline-queue.ts` | 175-207 | `flushing` reentrancy guard is per-tab, not cross-tab (WR-02) | ⚠️ Warning | Doubled outbound traffic on multi-tab reconnect; correctness preserved by the server's idempotency-key UNIQUE constraint. Deferred, out of this phase's scope per 35-04-PLAN.md's explicit scope boundary. |
| `components/HomeClient.tsx` + 3 other `*Client.tsx` files | various | `stale` marker honored by only 1 of ~9 revalidation call sites (WR-03) | ⚠️ Warning | Cosmetic "Updating…" flash on cold offline launch; does not affect correctness of the study-session or invalidation guarantees. Deferred, out of scope. |
| `lib/service-worker.ts` | 58-64 | `activateWaitingWorker` arms an unconditional `controllerchange` listener before confirming a waiting worker exists (WR-04) | ⚠️ Warning | Low-probability dangling side effect. Deferred, out of scope. |

These four items were explicitly named out-of-scope in 35-04-PLAN.md's own scope boundary ("WR-01/WR-02/WR-03/WR-04/IN-01 from 35-REVIEW.md are explicitly out of scope per 35-VERIFICATION.md's Gaps Summary") and were not must-haves for either the original phase or the gap-closure plan. They do not block phase goal achievement.

### Human Verification Required

None. All findings in this re-verification pass are deterministic code-path checks (source inspection, unit test execution, and independent e2e execution), consistent with the prior verification's assessment that this phase's correctness properties do not require human/manual judgment to confirm.

### Gaps Summary

No gaps remain. Both truths that failed the initial verification pass — "a versioned service worker precaches the app shell with a clear invalidation path" (CR-01) and "each review taken offline lands exactly once and is never silently lost" (CR-02 + CR-03) — are now verified true, with:

1. **CR-01** fixed via a single shared, unit-tested, fail-closed predicate (`shouldCacheNavigationResponse`) consumed by both the install-time warm and the runtime navigate branch, eliminating the divergence-risk class of bug. Interesting finding surfaced during gap closure (documented candidly in 35-04-SUMMARY.md and independently corroborated by the re-review): the literal redirect-following exploit CR-01 originally described does not reproduce in real browsers today, because a Service Worker's intercepted navigation-mode `fetch()` is forced to `redirect: 'manual'` by the platform spec — but the fix is still correct, valuable defense-in-depth (the install-time warm's plain, non-intercepted `fetch()` call genuinely does follow redirects and needed exactly this guard), and closes a real code-divergence threat regardless.
2. **CR-02** fixed — a 409 now stops the flush walk and stays durably queued, exactly like a 5xx, rather than being deleted and counted as a permanent drop.
3. **CR-03** fixed — `removeQueuedReviewByKey` cancels a queued review by its exact idempotency key, wired into `handleUndo` at both the offline-cancel path and the online-success path.

All three fixes were verified in this pass through direct source inspection (not SUMMARY-trust) AND independent re-execution of the full relevant e2e suite (11/11 passing, including the two new regression specs this gap-closure plan added), which is a stronger evidentiary bar than the prior verification pass was able to apply (which explicitly noted it could not re-run the e2e suite). REQUIREMENTS.md's OFFLINE-01/02/03 markers are all `[x]` Complete, consistent with this finding.

Four Warning/Info-tier findings remain from the original code review, all explicitly and deliberately deferred out of scope by both the original verification and the 35-04 gap-closure plan. They do not block phase goal achievement and are not re-litigated as gaps here.

---

_Verified: 2026-08-11_
_Verifier: Claude (gsd-verifier)_
