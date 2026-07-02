---
status: testing
phase: 13-review-api-hardening-save-reliability
source: [13-VERIFICATION.md]
started: 2026-07-02T06:30:00Z
updated: 2026-07-02T06:30:00Z
---

## Current Test

number: 1
name: Hung-fetch path in postReviewWithRetry (REVIEW-04 robustness)
expected: |
  Either (a) the retry loop terminates within a bounded time and the "Couldn't save your last review" toast appears, OR (b) the developer confirms this edge case is acceptable for a single-tenant app. If neither holds, add an AbortController timeout (~8s per attempt) to postReviewWithRetry so a hung fetch aborts and the loop advances to onExhausted.
awaiting: user response

## Tests

### 1. Hung-fetch path in postReviewWithRetry (REVIEW-04 robustness)

expected: |
  Verify the save-failure toast appears (or the retry loop terminates) under a HUNG-connection scenario — server accepts the TCP connection but never responds (paused serverless instance / hung libSQL). DevTools → Network → throttle to a hung backend or block response mid-flight, then grade a card.

  Either (a) the retry loop terminates within a bounded time and the "Couldn't save your last review" toast appears, OR (b) the developer confirms this edge case is acceptable for a single-tenant app. If neither holds, add an AbortController timeout (~8s per attempt) to postReviewWithRetry (components/StudySession.tsx:110-132) so a hung fetch aborts and the loop advances to onExhausted.

  Background: postReviewWithRetry has NO fetch timeout/AbortController. If `await fetch(...)` never resolves AND never rejects (hung server), the for-loop never advances, onExhausted is never called, and the toast NEVER appears — defeating REVIEW-04's guarantee under exactly the flaky-network condition it targets. The Task 3 checkpoint tested the offline=reject path (fetch rejects immediately → loop advances → toast), NOT the hung-fetch path. This is 13-REVIEW.md WR-04 issue 2.
result: [pending]

### 2. Unmount-during-undo cleanup invariant (REVIEW-05)

expected: |
  Verify unmount-during-undo leaves no partially-restored state (REVIEW-05 cleanup invariant).

  seenCardIdsRef.current is not mutated post-unmount; no stale setters fire; queue/stats/seen-count are coherent on re-mount. The `if (!isMountedRef.current) return` guard at components/StudySession.tsx:596 is the structural guarantee.

  Concretely: trigger an undo, then force-unmount the component (e.g. navigate away / session-key change) before the undo fetch resolves, then re-mount and inspect seenCardIdsRef + queue/stats coherence.

  Background: Cleanup invariant — Task 3 verified undo-during-flux (consistency after grade→undo), but did NOT exercise the unmount-mid-undo path specifically. The mount guard is structurally present and correctly placed before the seenCardIdsRef write (line 600), but grep cannot prove React's unmount lifecycle reliably sets isMountedRef.current=false before the async callback fires — a runtime check is needed to close the invariant.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
