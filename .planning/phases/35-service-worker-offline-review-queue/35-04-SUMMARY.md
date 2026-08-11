---
phase: 35-service-worker-offline-review-queue
plan: 04
subsystem: offline
tags: [service-worker, indexeddb, offline-queue, fsrs, playwright, vitest]

requires:
  - phase: 35-service-worker-offline-review-queue (plans 01-03)
    provides: versioned service worker shell precache + offline review queue (OFFLINE-01/02/03 base implementation)
provides:
  - Shared pathname-equality predicate (shouldCacheNavigationResponse) gating every SW navigation cache write
  - 409-as-retryable flush classification in flushQueue (stops the walk like 5xx, never drops)
  - removeQueuedReviewByKey — exact-idempotencyKey queue cancellation, wired into StudySession's undo flow
  - Three new regression specs (1 Vitest describe block, 2 Playwright specs) closing 35-VERIFICATION.md's two coverage gaps
affects: [offline-queue, service-worker, study-session-undo]

actuals:
  tokens: 9342
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single shared predicate (scripts/sw-runtime.mjs) consumed by both an install-time warm and a runtime fetch-handler branch, inlined into the generated worker by scripts/gen-sw.mjs — eliminates the two-call-site divergence class of bug."
    - "409 (optimistic-concurrency conflict) classified identically to 5xx in a client-side offline retry queue — a specific status code carries its own retry semantics distinct from the generic 4xx-drop bucket."
    - "Exact-string-equality-only deletion selector (idempotencyKey) for a durable client queue — no prefix/cardId/index/recency matching, to prevent cross-entry cancellation."

key-files:
  created:
    - e2e/sw-navigate-session-expiry.spec.ts
    - e2e/offline-review-queue-recovery.spec.ts
  modified:
    - scripts/sw-runtime.mjs
    - scripts/sw-template.js
    - tests/sw-runtime.test.ts
    - lib/offline-queue.ts
    - components/StudySession.tsx
    - tests/offline-queue.test.ts

key-decisions:
  - "Implemented the shared predicate and wired both sw-template.js call sites exactly as specified, even after discovering the runtime navigate branch's described CR-01 redirect exploit does not reproduce in real browsers (see Deviations) — the consolidation is still correct engineering and closes a real divergence-risk threat (T-35-15)."
  - "409 checked before the general 4xx branch in flushQueue, using the identical stop-the-walk mechanics as the existing 5xx branch, so enqueue ordering is preserved with zero new state machine."
  - "removeQueuedReviewByKey deletes ALL exact matches (not just the first) — an idempotencyKey is logically unique per grade, so a surviving duplicate would itself be the silent-replay bug CR-03 exists to prevent."
  - "CR-03 cancellation wired into handleUndo at both the abort/cancel point (covers the offline-undo case, the only outcome achievable while offline) and the undo-success point (covers the narrow abort-to-response window) — matches the plan's explicit choice to make the cancel-path call mandatory rather than optional."

patterns-established:
  - "For a Service Worker's runtime fetch handler intercepting a navigation-mode request, `fetch(event.request)` always uses redirect:'manual' per spec — a 3xx response resolves as an opaqueredirect Response (ok:false, status:0), and the browser auto-navigates to the redirect target as a SEPARATE fetch event. Any future code that reconstructs the request with an explicit `redirect:'follow'` would reintroduce a real cache-poisoning risk that shouldCacheNavigationResponse's pathname check now guards against."

requirements-completed: [OFFLINE-01, OFFLINE-03]

coverage:
  - id: D1
    description: "Shared pathname-equality predicate (shouldCacheNavigationResponse) gates both the install-time route warm and the runtime navigate branch — closes CR-01's divergence risk"
    requirement: "OFFLINE-01"
    verification:
      - kind: unit
        ref: "tests/sw-runtime.test.ts#shouldCacheNavigationResponse"
        status: pass
      - kind: e2e
        ref: "e2e/sw-navigate-session-expiry.spec.ts#a live expired-session navigation cannot poison the /study cache entry (OFFLINE-01, CR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A 409 mid-flush stops the walk without dropping or losing the entry, and it lands on a later flush once the conflict clears"
    requirement: "OFFLINE-03"
    verification:
      - kind: unit
        ref: "tests/offline-queue.test.ts#flushQueue — 409 is retryable, not a drop"
        status: pass
      - kind: e2e
        ref: "e2e/offline-review-queue-recovery.spec.ts#a 409 mid-flush leaves the review queued rather than dropped, and it lands on the next flush (OFFLINE-03, CR-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "An undone review is removed from the durable IndexedDB queue by its exact idempotency key and can never be replayed by a later flush"
    requirement: "OFFLINE-03"
    verification:
      - kind: unit
        ref: "tests/offline-queue.test.ts#removeQueuedReviewByKey"
        status: pass
      - kind: e2e
        ref: "e2e/offline-review-queue-recovery.spec.ts#a review graded offline and then undone is never replayed by a later flush (OFFLINE-03, CR-03)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-11
status: complete
---

# Phase 35 Plan 04: Gap Closure — CR-01/CR-02/CR-03 Summary

**Closed all three Critical bugs 35-REVIEW.md/35-VERIFICATION.md flagged as unfixed (a shared navigation cache-write guard, a 409-as-retryable flush classification, and exact-key undo cancellation), with new Vitest and Playwright regression coverage for each — while discovering and documenting that the literal CR-01 exploit mechanism (a session-expiry redirect poisoning the SW's runtime cache branch) cannot occur in real browsers, since intercepted navigation-mode fetch requests are forced to `redirect:'manual'` by the Service Worker spec.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-11
- **Tasks:** 3/3 completed
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- `shouldCacheNavigationResponse(responseOk, responseUrl, key)` added to `scripts/sw-runtime.mjs` as the single exported, unit-tested predicate for "may this response be cached under this route key?" — wired into both `warmNavigationRoute` (install-time warm) and the runtime `navigate` fetch-handler branch in `scripts/sw-template.js`. Fails closed on an unparseable/empty `response.url`.
- `lib/offline-queue.ts`'s `flushQueue` now treats a 409 (the server's own `StaleReviewError` optimistic-concurrency signal) identically to a 5xx: stops the walk, never deletes, never counts `dropped` or `flushed`. Every other 4xx keeps today's delete+drop+continue behavior unchanged.
- `removeQueuedReviewByKey(idempotencyKey)` added to `lib/offline-queue.ts` — deletes every queue entry whose `idempotencyKey` strictly equals the argument (never prefix/cardId/index/recency matching), silent no-op on failure or no match. Wired into `components/StudySession.tsx`'s `handleUndo` at both the abort/cancel point and the undo-success point, with `idempotencyKey` threaded through the `undoRef` snapshot (grade-time assignment, destructure, failure-path re-arm).
- Three new regression artifacts: a `describe('shouldCacheNavigationResponse', ...)` Vitest block (8 cases), `e2e/sw-navigate-session-expiry.spec.ts` (1 test), and `e2e/offline-review-queue-recovery.spec.ts` (2 tests) — closing both coverage gaps 35-VERIFICATION.md identified.

## Task Commits

1. **Task 1: Shared navigation cache-write guard (CR-01)** - `bb3999e` (feat)
2. **Task 2: 409 becomes retryable + undo cancels its queued review by exact key (CR-02, CR-03)** - `1c0a119` (feat, TDD)
3. **Task 3: E2E regression proofs for 409-stays-queued and grade-offline-then-undo-then-reconnect** - `9b555a4` (test)

_Task 2 was TDD: the 10 new Vitest cases (4 in the "409 is retryable" block, 6 in `removeQueuedReviewByKey`) were written and run against the pre-fix `lib/offline-queue.ts` first, observed genuinely red, then the implementation was added and all 20 tests in `tests/offline-queue.test.ts` (10 pre-existing + 10 new) passed. Task 3's two e2e tests were similarly observed red against the pre-Task-2 source before Task 2's commit — see "Deviations" below for the exact method and failing assertions, since `git stash` is prohibited in worktree mode._

## Files Created/Modified

- `scripts/sw-runtime.mjs` — Added `shouldCacheNavigationResponse` export.
- `scripts/sw-template.js` — Both cache-write call sites now call the shared predicate instead of duplicated/absent inline checks.
- `tests/sw-runtime.test.ts` — New `describe('shouldCacheNavigationResponse', ...)` block, 8 cases.
- `e2e/sw-navigate-session-expiry.spec.ts` — New spec proving a session-expiry redirect can't poison the `/study` shell-cache entry, and offline navigation still serves the real app afterward.
- `lib/offline-queue.ts` — 409 classification branch in `flushQueue`; new `removeQueuedReviewByKey` export.
- `components/StudySession.tsx` — `idempotencyKey` threaded through the undo snapshot; `removeQueuedReviewByKey` wired into `handleUndo` at two points.
- `tests/offline-queue.test.ts` — New `describe` blocks for the 409 classification and `removeQueuedReviewByKey`, 10 cases.
- `e2e/offline-review-queue-recovery.spec.ts` — New spec: 409-mid-flush-stays-queued-then-lands, and grade-offline-then-undo-then-reconnect-never-replays.

## Decisions Made

See `key-decisions` in frontmatter. Additionally: the fix for CR-01 was implemented exactly as the plan specified (both call sites gated by the shared predicate) despite the empirical finding described below — the consolidation is correct regardless of whether the specific redirect vector is currently exploitable, and it closes the T-35-15 divergence-risk threat (the two call sites carrying separately-maintained checks that could drift apart again).

## Deviations from Plan

### 1. [Finding, not a bug — documented per Rule 1 spirit] CR-01's described runtime-branch exploit does not reproduce in real browsers

**Found during:** Task 1, while writing `e2e/sw-navigate-session-expiry.spec.ts` and observing it pass even against the **unpatched** `scripts/sw-template.js`.

**Investigation:** 35-REVIEW.md's CR-01 finding states "`fetch(request)` follows redirects by default" for the runtime `navigate` branch, and expects a live session-expiry navigation to silently overwrite the `/study` shell-cache entry with the login page's HTML before this task's fix. I instrumented the unpatched template with a temporary `console.log` of `response.type/status/ok/url` inside the navigate branch, captured it via Playwright's `Worker.on('console')`, and ran a real `page.goto('/study')` with cookies cleared:

```
DEBUG-NAV /study opaqueredirect 0 false http://localhost:3100/study false
DEBUG-NAV /login basic 200 true http://localhost:3100/login false
```

This confirms: per the Service Worker spec, a navigation-mode request intercepted by a `fetch` event handler always has `redirect: 'manual'` — `fetch(event.request)` for such a request never follows a 3xx and instead resolves to an `opaqueredirect` Response (`ok: false`, `status: 0`). The pre-existing `if (response.ok)` gate in the unpatched code **already** rejected this response, so no poisoning occurred even before this task. The browser then auto-navigates to `/login` as a genuinely separate `fetch` event (`key: '/login'`), which is cached under its own key — harmless. Separately, `warmNavigationRoute`'s inline pathname check was already present since Phase 35-01 (`git log` confirms commit `3a7b038`), so that call site was also already safe.

**Resolution:** The shared-predicate fix was implemented in full exactly as the plan specifies — it is still correct, valuable engineering (single source of truth, unit-tested, closes T-35-15's divergence-risk threat, and is defense-in-depth against a future code change that might construct the fetch with an explicit `redirect: 'follow'`). The e2e spec was kept as a genuine regression test proving the true end-to-end invariant (a session-expiry redirect can't poison the cache; offline navigation still serves the real app) — this holds both before and after the fix, for different reasons, so it cannot honestly be reported as "observed red against the unpatched source" for the redirect-trigger mechanism specifically. The genuinely red-before-green artifact for CR-01 is the Vitest suite: `shouldCacheNavigationResponse` did not exist prior to Task 1, so any test importing it would fail to even compile/import — a real failure state, now green.

**Files affected:** `scripts/sw-template.js`, `e2e/sw-navigate-session-expiry.spec.ts` (both delivered per spec; no code left unfixed).
**Commit:** `bb3999e`

### 2. [Minor — plan verification-script inaccuracy] Task 2's `grep -c "removeQueuedReviewByKey("` acceptance criterion

**Found during:** Task 2 final verification.

**Issue:** The plan's acceptance criteria expect `grep -c "removeQueuedReviewByKey(" components/StudySession.tsx` to output exactly 3 ("the import plus the two call sites"). The actual output is 2, because a bare named import (`import { enqueueReview, removeQueuedReviewByKey } from '@/lib/offline-queue'`) has no trailing `(` character, so the literal grep pattern (which requires a trailing paren) does not match the import line — only the two real call sites in `handleUndo` do.

**Verification:** Confirmed via `grep -n "removeQueuedReviewByKey"` (no trailing paren) that the import is present, and via `grep -n "idempotencyKey"` that all 4 required wiring points exist (undoRef type literal, grade-time assignment, handleUndo destructure, failure-path re-arm) plus the 2 call sites — the actual behavior fully satisfies the plan's intent; only the exact count in one grep-based acceptance criterion differs from what was predicted.

**Files affected:** None — no code change; documentation only.
**Commit:** `1c0a119`

### 3. [Minor — plan verification-script inaccuracy] Phase-level verification's pre-existing-spec test counts

**Found during:** Task 3 final phase-level verification (step 5).

**Issue:** The plan's `<verification>` section expects `npx playwright test e2e/sw-shell-offline.spec.ts e2e/sw-offline-study-session.spec.ts e2e/offline-review-queue.spec.ts` to report 6/6, 2/2, 2/2 (10 tests total). These three files were not touched by this plan; their actual test counts are 5, 1, 1 (7 tests total) — confirmed by reading each file directly and by the actual Playwright run output. All 7 pass with zero regressions.

**Files affected:** None — pre-existing files, unmodified by this plan.

### Environment setup (not a deviation, noted for completeness)

This worktree had no installed `node_modules` at plan start (only cache directories). A symlink to the main repo's `node_modules` was tried first but rejected by Turbopack ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"), so a real `npm install` was run instead (completed in ~9s via the local npm cache; `package.json`/`package-lock.json` are byte-identical to the main repo's). No source files were affected; `node_modules` is gitignored.

---

**Total deviations:** 1 finding (CR-01 exploit mechanism), 2 minor plan-accuracy notes (grep count, pre-existing test counts). No scope creep, no code left unfixed — all three tasks' specified artifacts were delivered exactly as the plan requires.
**Impact on plan:** None of the three tasks' deliverables, acceptance criteria for grep/export counts, or done-criteria were skipped. The CR-01 finding does not change what was built — the specified fix landed in full — it only corrects the plan's assumed exploit mechanism, which the e2e spec's header comment and this SUMMARY now document accurately for future readers.

## Issues Encountered

None beyond the deviations documented above. The TDD RED phase for Task 2 was straightforward (10/10 new cases failed as expected, with clear error messages: `TypeError: removeQueuedReviewByKey is not a function` and wrong `dropped`/`remaining` counts for the 409 cases). Task 3's red-before-green proof used `git checkout <task-1-commit> -- <files>` / `git checkout HEAD -- <files>` to temporarily revert and restore the three Task-2-affected files (never `git stash`, which is prohibited in worktree mode per this project's destructive-git-operations rule) — both new e2e tests failed with the expected assertions against the pre-Task-2 source:
- 409 test: `expect(await readQueueCount(page)).toBe(1)` — received `0` (the entry was dropped, not kept).
- Undo test: `expect.poll(() => readQueueCount(page)).toBe(0)` timed out at 15s, still `1` (no cancellation API existed).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

OFFLINE-01 and OFFLINE-03 are ready to flip from Pending to Complete in REQUIREMENTS.md on re-verification (per this plan's success criteria). No changes to 35-02's territory, no new packages, no schema change, no new UI surface. `npx vitest run` (415/415), `npm run lint` (0 errors, 2 pre-existing unrelated warnings), and `npm run build` (regenerates `public/sw.js` containing the predicate, confirmed by `grep`) all pass clean. This was the final plan (04) of Phase 35 — the phase is ready for verification/closeout.

---
*Phase: 35-service-worker-offline-review-queue*
*Completed: 2026-08-11*
