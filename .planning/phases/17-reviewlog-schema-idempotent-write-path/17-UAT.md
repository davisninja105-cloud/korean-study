---
status: diagnosed
phase: 17-reviewlog-schema-idempotent-write-path
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md]
started: 2026-07-04T15:35:45Z
updated: 2026-07-04T15:52:00Z
---

## Current Test

[testing complete]

## Tests

### 1. ReviewLog table exists with the right shape
expected: Prisma model ReviewLog exists with unique idempotencyKey, non-unique cardId, and a Card.reviewLogs reverse relation; prisma generate exposes prisma.reviewLog
result: pass
source: automated
coverage_id: D1

### 2. Live Turso database has the ReviewLog table
expected: Live Turso database has the ReviewLog table with a UNIQUE index on idempotencyKey and indexes on cardId + createdAt
result: pass
source: automated
coverage_id: D2

### 3. POST /api/review validates idempotencyKey
expected: POST /api/review rejects a missing/empty/wrong-type/over-100-char idempotencyKey with a 400 before touching the database
result: pass
source: automated
coverage_id: D1

### 4. Review write is atomic
expected: CardReview.update and ReviewLog.create happen inside one atomic transaction — either both land or neither does
result: pass
source: automated
coverage_id: D2

### 5. Undo route unaffected
expected: app/api/review/undo/route.ts is untouched; existing error shapes and validations on the review route are preserved
result: pass
source: automated
coverage_id: D4

### 6. Duplicate Review Submission Is Idempotent
expected: |
  Grade cards normally in a Study session. Even if a grade request gets
  retried in the background (flaky connection, double-tap), the card's
  schedule only advances once — no duplicate history row, no double-applied
  FSRS state, nothing looks "skipped ahead" or out of sync.
result: issue
reported: "Automated curl replay (same cardId/rating/idempotencyKey sent twice against POST /api/review, real dev server + production Turso DB): first request returned 200 and created 1 ReviewLog row as expected. Second (duplicate) request returned 500 {\"error\":\"Failed to record review\"} instead of the expected idempotent 200 replay. Server log: `SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: ReviewLog.idempotencyKey` thrown as `DriverAdapterError`, not `Prisma.PrismaClientKnownRequestError` with code P2002 — so the P2002 catch branch in app/api/review/route.ts never matches and the request falls through to the generic 500 handler. Test card's CardReview/ReviewLog state was verified before/after and restored to original (reps:0, state:0, stability:0, difficulty:0, lastReview:null) via /api/review/undo + direct cleanup."
severity: blocker

### 7. One idempotency key per grade, reused across retries
expected: A single idempotency key is generated once per grade action and reused unchanged across all retry attempts of that grade
result: pass
source: automated
coverage_id: D1

### 8. Idempotency key sent to the server
expected: Grading a card sends { cardId, rating, idempotencyKey } to POST /api/review, with the same key across the retry chain
result: pass
source: automated
coverage_id: D2

### 9. Lint stays clean
expected: npm run lint has 0 new errors after threading the idempotency key + AbortController through the review flow
result: pass
source: automated
coverage_id: D4

### 10. Undo Cancels In-Flight Retry
expected: |
  Grade a card, then immediately tap Undo. The card goes back to how it was
  before grading and STAYS that way — it should not silently re-apply the
  grade a few seconds later (e.g. jump ahead in the queue or change its due
  date after you already undid it).
result: pass

## Summary

total: 10
passed: 9
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "A duplicate idempotencyKey collision (P2002) is caught and returned as 200 with current CardReview state, with no re-applied FSRS state and no second ReviewLog row"
  status: failed
  reason: "User reported: Automated curl replay against POST /api/review with an identical idempotencyKey returned 500 {\"error\":\"Failed to record review\"} on the duplicate request instead of an idempotent 200. Server log shows the underlying SQLite UNIQUE-constraint violation surfaces as a `DriverAdapterError` (from @prisma/adapter-libsql), not `Prisma.PrismaClientKnownRequestError` with code P2002, so the catch branch in app/api/review/route.ts that's supposed to treat this as an idempotent replay never matches."
  severity: blocker
  test: 6
  root_cause: "app/api/review/route.ts uses an INTERACTIVE prisma.$transaction(async (tx) => {...}) callback (needed for its optimistic-concurrency read-then-conditional-write logic), not the array-form prisma.$transaction([...]) that was originally planned (per STATE.md decision log) and that the sibling route app/api/cards/[id]/route.ts uses successfully (comment: 'Array-form transaction — safe with the libSQL adapter'). With Prisma 7 + @prisma/adapter-libsql, a SQLite UNIQUE-constraint violation thrown inside an interactive transaction's callback surfaces as a raw, unclassified DriverAdapterError (cause.kind: 'sqlite'), not a Prisma.PrismaClientKnownRequestError/P2002 — so the route's existing P2002 instanceof check never matches, and every duplicate idempotencyKey collision falls through to the generic 500 handler."
  artifacts:
    - path: "app/api/review/route.ts"
      issue: "Catch block only checks `e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'`, which never matches because the interactive transaction form causes the libsql UNIQUE-constraint error to surface as a raw, unclassified DriverAdapterError instead."
  missing:
    - "Widen the catch block to also recognize the raw DriverAdapterError shape for the idempotencyKey UNIQUE-constraint case (keep the existing P2002 check too, for forward-compatibility), OR restructure the write path to avoid the interactive-transaction error-classification gap — recommend the former (lower risk, preserves the CR-01 optimistic-concurrency logic)."
    - "Re-verify Test 6 (duplicate request → idempotent 200, exactly one ReviewLog row, no re-applied FSRS state) end-to-end after the fix."
  debug_session: ".planning/debug/reviewlog-p2002-catch-never-fires.md"
