---
phase: 17-reviewlog-schema-idempotent-write-path
plan: 03
subsystem: ui
tags: [react, nextjs, abortcontroller, idempotency, fsrs]

# Dependency graph
requires:
  - phase: 17-reviewlog-schema-idempotent-write-path
    provides: "Plan 17-01's ReviewLog model + Plan 17-02's server-side idempotencyKey validation and P2002-as-idempotent-200 write path"
provides:
  - "Client-generated, per-grade idempotencyKey (crypto.randomUUID()) reused unchanged across all retry attempts of postReviewWithRetry"
  - "Undo-triggered AbortController stored on undoRef.current, cancelling the in-flight background retry chain before the undo request fires"
  - "postReviewWithRetry(cardId, rating, idempotencyKey, cancelSignal, onExhausted) — extended signature honoring cancellation at loop-top, in catch, and after each backoff wait"
affects: [18-history-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual AbortSignal forwarding (cancelSignal.addEventListener('abort', ...) into a per-attempt controller) instead of the newer variadic AbortSignal.any() combinator, to compose an outer cancel signal with a per-attempt timeout"

key-files:
  created: []
  modified:
    - components/StudySession.tsx

key-decisions:
  - "idempotencyKey and AbortController are generated exactly once in submitReview's event-handler flow, immediately before the undoRef.current snapshot assignment — never inside postReviewWithRetry (a per-attempt key would defeat server-side dedup) and never lifted into render/useMemo (react-hooks/purity)"
  - "On the undo network-failure re-arm path, the SAME (already-aborted) controller is re-included in the restored undoRef.current snapshot rather than creating a new one — retrying undo does not need to un-abort the review's background save"
  - "Cancellation stays silent — no new UI element; saveError/Toast continues to surface only via onExhausted (retry exhaustion), never on a routine abort"

patterns-established:
  - "Composable AbortSignal cancellation via manual addEventListener('abort', ...) forwarding (not AbortSignal.any()) is now the established pattern in this codebase for combining an outer cancel signal with a per-attempt timeout controller"

requirements-completed: [HIST-01, HIST-02, HIST-03]

coverage:
  - id: D1
    description: "A single idempotency key is generated once per grade action and reused unchanged across all retry attempts of that grade"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "grep -c 'crypto.randomUUID()' components/StudySession.tsx == 1, located in submitReview's real-card branch before the undoRef.current assignment and postReviewWithRetry call; npm run build type-checks the 5-arg signature"
        status: pass
    human_judgment: false
  - id: D2
    description: "Grading a card sends { cardId, rating, idempotencyKey } to POST /api/review, the key stable across the 3-attempt retry chain"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "grep 'idempotencyKey' components/StudySession.tsx shows it in the fetch body JSON.stringify and the postReviewWithRetry signature/call site (4 occurrences)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Triggering undo aborts the in-flight retry chain for that card before the next attempt fires, so a stale retry can never re-apply the undone rating"
    requirement: "HIST-03"
    verification:
      - kind: unit
        ref: "grep 'controller.abort()' components/StudySession.tsx confirms handleUndo calls it before the /api/review/undo fetch; postReviewWithRetry checks cancelSignal.aborted at loop-top, in catch, and after each backoff wait"
        status: pass
    human_judgment: true
    rationale: "Full HIST-03 confirmation (no stale ReviewLog row / CardReview re-flip after undo under throttled network) requires a live browser session with 17-02 deployed and DB inspection over a ~10s window — deferred to end-of-phase human verification per human_verify_mode=end-of-phase, as specified in this plan's <human-check> block."
  - id: D4
    description: "npm run lint stays clean — crypto.randomUUID() and new AbortController() stay in the event-handler flow, never lifted into render (react-hooks/purity)"
    requirement: "HIST-02"
    verification:
      - kind: unit
        ref: "npm run lint — 0 errors, 1 pre-existing unrelated exhaustive-deps warning (cardSentences memo, not touched by this plan)"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-04
status: complete
---

# Phase 17 Plan 3: ReviewLog Schema & Idempotent Write Path Summary

**Threaded a client-generated `crypto.randomUUID()` idempotency key through `postReviewWithRetry`'s 3-attempt loop and added an undo-triggered `AbortController` so `handleUndo` cancels any in-flight background retry before it can re-apply a rating after undo.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-04T06:25:15Z
- **Completed:** 2026-07-04T06:29:00Z
- **Tasks:** 1 completed
- **Files modified:** 1

## Accomplishments
- `postReviewWithRetry` now takes `idempotencyKey: string` and `cancelSignal: AbortSignal` params; checks `cancelSignal.aborted` at loop-top, in the `catch` block, and after each backoff wait, returning silently (never calling `onExhausted`) on a deliberate cancel
- Cancellation composes with the existing per-attempt 8s timeout via manual `cancelSignal.addEventListener('abort', forwardAbort, { once: true })` forwarding into each attempt's own `AbortController` — the listener is cleaned up in the existing `finally` block alongside `clearTimeout`
- `{ cardId, rating, idempotencyKey }` is now sent in the POST /api/review body, satisfying 17-02's server-side validation
- `submitReview` generates one `crypto.randomUUID()` + `new AbortController()` per grade action, entirely inside the event-handler flow (purity-safe — Pitfall 5), immediately before the `undoRef.current` snapshot assignment
- `undoRef.current` gains a `controller: AbortController` field, included in both the initial snapshot and the network-failure re-arm snapshot (reusing the same already-aborted controller, not a fresh one)
- `handleUndo` calls `controller.abort()` immediately after clearing `undoRef.current` and before the `fetch('/api/review/undo', ...)` call — this is the sole mechanism covering HIST-03's dominant multi-second backoff window

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread the idempotency key + undo cancellation through StudySession's review flow** - `34cbfbb` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/StudySession.tsx` - Extended `postReviewWithRetry`'s signature with `idempotencyKey`/`cancelSignal`, added cancellation checks and abort-forwarding; `undoRef` gained a `controller` field; `submitReview` generates the key + controller once per grade; `handleUndo` aborts the controller before firing the undo request

## Decisions Made
- Followed the plan's and 17-PATTERNS.md's exact prescribed target shape for all four edit spots — no discretion calls beyond matching the specified code verbatim
- Confirmed via grep that `AbortSignal.any` does not appear as an actual API call anywhere in the file (it appears only inside an explanatory code comment describing what was deliberately NOT used)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npm run lint` (0 errors — the single pre-existing `cardSentences` exhaustive-deps warning is unrelated to this plan's changes) and `npm run build` (type-checks the new 5-arg `postReviewWithRetry` signature and the `undoRef.controller` field) both passed on the first attempt. All grep-based acceptance checks (`crypto.randomUUID()`, `cancelSignal: AbortSignal`, `controller.abort()`, `idempotencyKey`, `addEventListener('abort'`) confirmed present at the expected counts, and `git diff --stat` confirmed no file other than `components/StudySession.tsx` was touched (in particular, `app/api/review/undo/route.ts` is untouched, preserving HIST-06).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The full client + server idempotent write path (HIST-01/HIST-02/HIST-03) is now code-complete across Plans 17-01, 17-02, and 17-03.
- Deferred to end-of-phase human verification (per `human_verify_mode=end-of-phase`), exercising the full client → server → DB path now that all three plans are live:
  - HIST-03: throttle network, grade a card, immediately tap Undo — confirm no new `ReviewLog` row appears for that card and `CardReview` stays at `prevState` over a ~10s window
  - HIST-02: grade a card normally, then replay the same POST via devtools "Replay XHR" — confirm no second `ReviewLog` row and `CardReview.reps` unchanged
  - HIST-01: grade several cards normally — confirm one `ReviewLog` row per grade with correct rating + FSRS snapshot
  - Regression: normal grade advances instantly; normal-network undo still restores queue/stats
- No blockers. Phase 17 (ReviewLog Schema & Idempotent Write Path) is code-complete pending this end-of-phase human verification pass.

---
*Phase: 17-reviewlog-schema-idempotent-write-path*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: components/StudySession.tsx
- FOUND: commit 34cbfbb
