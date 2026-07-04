---
status: investigating
trigger: "UAT Test 6 (phase 17): duplicate POST /api/review with the same idempotencyKey returned 500 instead of an idempotent 200"
created: 2026-07-04T15:55:00Z
updated: 2026-07-04T16:10:00Z
---

## Current Focus

hypothesis: confirmed — see Resolution
test: n/a — root cause verified via live reproduction + source inspection
expecting: n/a
next_action: hand off to gsd-planner (gap_closure mode) for a fix plan
reasoning_checkpoint: null
tdd_checkpoint: null

## Symptoms

expected: A second POST /api/review with the exact same {cardId, rating, idempotencyKey} as a prior successful request returns 200 with the current (unchanged) CardReview state — no second ReviewLog row, no re-applied FSRS state.
actual: First request → 200, 1 ReviewLog row created. Byte-identical second request → 500 {"error":"Failed to record review"}.
errors: |
  POST /api/review failed: Error [DriverAdapterError]: SQLITE_CONSTRAINT: SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: ReviewLog.idempotencyKey
    [cause]: { originalCode: undefined, originalMessage: 'SQLITE_CONSTRAINT: ...', kind: 'sqlite', extendedCode: 1, message: '...' }
reproduction: |
  1. npm run dev; POST /api/login to get ks_auth cookie
  2. Pick a real cardId with a CardReview row
  3. POST /api/review {cardId, rating:3, idempotencyKey:"<uuid>"} → 200
  4. POST /api/review again with the SAME body → expected 200, actual 500
started: Present since Plan 17-02 (app/api/review/route.ts) was written; caught during phase 17 end-of-phase UAT, 2026-07-04

## Eliminated

- hypothesis: The P2002 `instanceof` check itself is written wrong (wrong import, wrong code string, wrong meta.target key)
  evidence: Code inspection of app/api/review/route.ts:131-135 shows the check is written correctly per Prisma's documented PrismaClientKnownRequestError contract — it's just never reached because `e` is never actually a PrismaClientKnownRequestError in this path.
  timestamp: 2026-07-04T16:00:00Z
- hypothesis: This is unrelated to transaction form (interactive vs array) — some other bug entirely.
  evidence: app/api/cards/[id]/route.ts's PUT handler catches the structurally identical `Prisma.PrismaClientKnownRequestError && e.code === 'P2002'` pattern successfully, and is explicitly commented "Array-form transaction — safe with the libSQL adapter" (line 78). That route uses `prisma.$transaction([cardUpdate, ...sentenceOps])` (array form). The review route uses `prisma.$transaction(async (tx) => {...})` (interactive/callback form). This is the one structural difference between the working and broken P2002 catch sites in this codebase.
  timestamp: 2026-07-04T16:05:00Z

## Evidence

- timestamp: 2026-07-04T15:50:00Z
  checked: Live reproduction against dev server + production Turso DB (real cardId, real duplicate request)
  found: First request 200 (1 ReviewLog row); duplicate request 500, server log shows raw `DriverAdapterError` wrapping a SQLite `UNIQUE constraint failed: ReviewLog.idempotencyKey`, NOT a `PrismaClientKnownRequestError`
  implication: The catch branch's `instanceof Prisma.PrismaClientKnownRequestError` check cannot match this error shape — confirmed root symptom
- timestamp: 2026-07-04T16:02:00Z
  checked: app/api/review/route.ts:79-103 (the transaction body)
  found: Uses the INTERACTIVE/callback form `prisma.$transaction(async (tx) => { const cardReview = await tx.cardReview.findUnique(...); ...; await tx.reviewLog.create(...); return tx.cardReview.findUniqueOrThrow(...) })`
  implication: Contradicts Plan 17-02's own SUMMARY.md, which describes this as "array-form prisma.$transaction([cardReview.update, reviewLog.create])" — the SUMMARY's description does not match the shipped code. The shipped code is the interactive form.
- timestamp: 2026-07-04T16:04:00Z
  checked: app/api/cards/[id]/route.ts:78-79 (the working, sibling P2002-as-friendly-response pattern)
  found: Uses array-form `prisma.$transaction([cardUpdate, ...sentenceOps])`, explicitly commented "Array-form transaction — safe with the libSQL adapter" — and its P2002 catch (line 93) works as intended (confirmed by this being an established, already-shipped pattern with no open bug reports).
  implication: Array-form transactions correctly surface constraint violations as `PrismaClientKnownRequestError`/P2002 with this driver adapter; interactive-form transactions do not.
- timestamp: 2026-07-04T16:07:00Z
  checked: node_modules/@prisma/adapter-libsql/dist/index-node.js (`convertDriverError`/`mapDriverError`) and node_modules/@prisma/driver-adapter-utils/dist/index.d.ts (`DriverAdapterError` class shape)
  found: The adapter DOES classify SQLite UNIQUE-constraint failures into a structured `{ kind: 'UniqueConstraintViolation', constraint: { fields } }` shape when `isDriverError(error)` recognizes the thrown error — this structured shape is what Prisma's core would normally translate into `PrismaClientKnownRequestError`/P2002/`meta.target`. But the error actually caught in the interactive-transaction path had `cause.kind: 'sqlite'` (an unclassified raw libsql-client error), not `kind: 'UniqueConstraintViolation'` — meaning the classification step was bypassed for this code path, so no downstream translation to PrismaClientKnownRequestError could happen.
  implication: This is a real Prisma 7 + `@prisma/adapter-libsql` + interactive-transaction interaction, not a coding typo. The fix must not rely solely on `PrismaClientKnownRequestError`/P2002 for this specific route's transaction shape.
- timestamp: 2026-07-04T16:08:00Z
  checked: .planning/STATE.md decision log for phase 17
  found: The plan's original decision explicitly specified array-form `prisma.$transaction([cardReview.update, reviewLog.create])` for this exact write path — the interactive form was a silent implementation deviation from Plan 17-02, undetected because unit-verification only grep'd for `prisma.$transaction` and `reviewLog.create` (both present regardless of form) rather than checking the transaction's literal shape.
  implication: Restoring the originally-planned array form is the more faithful fix, but note (see below) it conflicts with the route's optimistic-concurrency (CR-01) conditional-abort logic, which needs the interactive form's ability to read-then-conditionally-write. A pure array-form transaction cannot express "abort the whole transaction if updateMany's count is 0" — the fix plan needs to reconcile this rather than blindly restoring array-form.
- timestamp: 2026-07-04T16:09:00Z
  checked: Whether app/api/cards/[id]/route.ts's PUT handler (the "two-instance pattern" cited by Plan 17-02's SUMMARY) is at risk of the same bug
  found: It uses array-form exclusively (no interactive transaction), so it is NOT affected by this specific interactive-transaction error-classification gap.
  implication: No fix needed there; scope this fix to app/api/review/route.ts only.

## Resolution

root_cause: |
  app/api/review/route.ts's write path uses an INTERACTIVE `prisma.$transaction(async (tx) => {...})`
  callback (needed for its optimistic-concurrency read-then-conditional-write logic), not the
  array-form `prisma.$transaction([...])` that was originally planned and that the sibling route
  (app/api/cards/[id]/route.ts) uses successfully. With Prisma 7 + `@prisma/adapter-libsql`, a SQLite
  UNIQUE-constraint violation thrown *inside* an interactive transaction's callback surfaces to the
  catch block as a raw, unclassified `DriverAdapterError` (cause.kind: 'sqlite') rather than being
  translated into a `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'`. The array-form
  pattern does not have this problem — the adapter classifies the same underlying SQLite error into
  a structured `UniqueConstraintViolation` there, which Prisma's core then correctly turns into
  P2002. The route's catch block only checks for `instanceof Prisma.PrismaClientKnownRequestError`,
  so it never matches in the interactive-transaction path, and every duplicate idempotencyKey
  collision falls through to the generic 500 handler — defeating HIST-02, the core guarantee this
  phase exists to deliver.
fix: |
  Not applied by this debug session (find_root_cause_only). Two viable directions for the fix plan
  to choose between:
  (a) Widen the catch block to ALSO recognize the raw unclassified error shape for this specific
      constraint (e.g. detect `e` is a `DriverAdapterError`/has a `.cause` whose message contains
      "UNIQUE constraint failed" and "idempotencyKey", in addition to keeping the existing P2002
      check for forward-compatibility) — minimal blast radius, keeps the interactive transaction and
      its optimistic-concurrency logic intact.
  (b) Restructure to avoid the interactive-transaction error-classification gap entirely by moving
      the stale-read check earlier and using an array-form transaction for the actual write — harder
      to do without losing the atomic all-or-nothing guarantee between the conditional abort and the
      writes, needs careful design.
  Recommend (a) as the lower-risk fix; note (b) as an alternative if the planner judges the
  interactive-transaction dependency on raw driver errors too fragile long-term.
verification: pending — to be verified by the fix plan's own execution + a repeat of this UAT test
files_changed: []
