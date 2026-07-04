---
phase: 17-reviewlog-schema-idempotent-write-path
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/api/review/route.ts
  - components/StudySession.tsx
  - prisma/schema.prisma
  - scripts/apply-reviewlog-ddl.mjs
findings:
  critical: 1
  warning: 5
  info: 1
  total: 7
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-07-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the ReviewLog schema + idempotent-write-path implementation: the `POST /api/review` handler, the client-side optimistic grading + retry pipeline in `StudySession.tsx`, the `ReviewLog`/`Card` Prisma schema, and the one-time DDL script that creates the `ReviewLog` table on Turso.

The idempotency mechanism itself (unique `idempotencyKey`, transactional CardReview+ReviewLog write, P2002-as-success fallback) is well designed for the case it was built for — a single logical review being retried after a lost response. However, the read-then-write sequence that computes the FSRS transform is **not atomic with the read**, which creates a real (if narrow) lost-update race for two *distinct* reviews of the same card overlapping in flight — exactly the kind of correctness gap this phase's ReviewLog/idempotency work was meant to close. There are also several robustness gaps around error handling (overly broad P2002 handling, misleading toast copy for permanent failures) and one schema/intent mismatch (an "append-only audit log" that cascade-deletes with its parent Card).

## Critical Issues

### CR-01: Non-atomic read-modify-write in `POST /api/review` allows a lost FSRS update between two distinct reviews of the same card

**File:** `app/api/review/route.ts:64-79`
**Issue:**
```ts
const cardReview = await prisma.cardReview.findUnique({ where: { cardId } })
...
const updated = reviewCard(cardReview, rating)

const [review] = await prisma.$transaction([
  prisma.cardReview.update({ where: { cardId }, data: updated }),
  prisma.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } }),
])
```
The `idempotencyKey` mechanism only protects **retries of the same logical submission** (same key). It does nothing for two *different* legitimate reviews of the same card whose requests overlap in flight — which is a real scenario in this codebase: `StudySession.tsx` requeues a card only `REQUEUE_GAP` (4) cards later, and the background save for a review can take several seconds to tens of seconds when it needs to retry (`postReviewWithRetry`: up to 3 attempts, each with an 8s timeout plus 500ms/1500ms backoff — up to ~20s+ total). On a flaky connection, a user can plausibly grade the same card a second time (new, distinct `idempotencyKey`) before the first grade's background POST has finished retrying.

In that case:
1. Request A reads `cardReview` (state S0), computes `updatedA = reviewCard(S0, ratingA)`.
2. Request B (later, same card, different key) reads `cardReview` — if A hasn't committed yet, B also reads S0 and computes `updatedB = reviewCard(S0, ratingB)` from the **same stale base**, not from A's result.
3. Whichever transaction commits last silently **overwrites** the other's `CardReview` row with an FSRS state that was computed as if the other review never happened — `reps`, `lapses`, `stability`, `difficulty`, and `nextReview` can all regress or double-apply incorrectly, with no error surfaced to either request (both return 200).

This directly undermines the purpose of this phase (a correct, durable review history) — the audit log (`ReviewLog`) will contain both reviews with correct rating values, but the authoritative `CardReview.nextReview`/scheduling state can end up wrong and never self-heals, since nothing re-derives it from `ReviewLog` afterward.

**Fix:** Make the read part of the same atomic unit as the write (interactive transaction), and/or add optimistic concurrency so a stale write is detected and rejected rather than silently applied:
```ts
try {
  const review = await prisma.$transaction(async (tx) => {
    const cardReview = await tx.cardReview.findUnique({ where: { cardId } })
    if (!cardReview) throw new NotFoundError()
    const updated = reviewCard(cardReview, rating)

    // Optimistic lock: only apply if the row hasn't moved since we read it.
    const { count } = await tx.cardReview.updateMany({
      where: { cardId, reps: cardReview.reps, lastReview: cardReview.lastReview },
      data: updated,
    })
    if (count === 0) throw new StaleReviewError() // surface as 409, client can decide to no-op

    await tx.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } })
    return tx.cardReview.findUniqueOrThrow({ where: { cardId } })
  })
  return NextResponse.json(review)
} catch (e) {
  if (e instanceof NotFoundError) return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
  if (e instanceof StaleReviewError) return NextResponse.json({ error: 'stale review, already updated' }, { status: 409 })
  ...
}
```

## Warnings

### WR-01: P2002 catch treats *any* unique-constraint violation as an idempotency-key retry

**File:** `app/api/review/route.ts:89-92`
**Issue:** `e.code === 'P2002'` is checked but `e.meta?.target` is never inspected to confirm the violated constraint is actually `idempotencyKey`. Today `ReviewLog.idempotencyKey` is the only unique field involved in the transaction, so this happens to be correct, but the handler will silently swallow *any* future P2002 (e.g. a new unique constraint added to `CardReview` or `ReviewLog`) and report success with whatever the current DB state happens to be, rather than surfacing the real error.
**Fix:**
```ts
if (
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2002' &&
  (e.meta?.target as string[] | undefined)?.includes('idempotencyKey')
) {
  const current = await prisma.cardReview.findUnique({ where: { cardId } })
  return NextResponse.json(current)
}
```

### WR-02: Idempotent-success branch can return `null` with a 200 status

**File:** `app/api/review/route.ts:90-91`
**Issue:** `const current = await prisma.cardReview.findUnique({ where: { cardId } })` can return `null` if the `CardReview` row was deleted concurrently (e.g. the card itself was deleted) between the original failed transaction and this re-read. The code returns `NextResponse.json(current)` — i.e. a `200` response with a `null` body — instead of the `404` used for the identical "not found" condition earlier in the same handler (line 66). This is an inconsistent API contract for the same underlying condition.
**Fix:** Guard the re-read the same way as the initial lookup:
```ts
const current = await prisma.cardReview.findUnique({ where: { cardId } })
if (!current) return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
return NextResponse.json(current)
```

### WR-03: Save-failure toast blames "your connection" even for permanent (4xx) failures

**File:** `components/StudySession.tsx:131-133`, `components/StudySession.tsx:547-551`
**Issue:** `postReviewWithRetry` correctly distinguishes 4xx (permanent) from network/5xx (retryable) failures for retry purposes, but both paths funnel into the same `onExhausted` callback, which always shows: `"Couldn't save your last review — check your connection."` A 4xx here (e.g. 404 "Card review not found" if the card was deleted server-side, or a 400 from a future validation change) has nothing to do with connectivity, and telling the user to "check your connection" is actively misleading — they may retry a doomed action or blame their network for a data-integrity problem.
**Fix:** Thread the failure reason through to `onExhausted` (e.g. `onExhausted(reason: 'network' | 'permanent')`) and vary the toast copy accordingly, or at minimum use connection-neutral copy such as "Couldn't save your last review. Your progress may not be recorded."

### WR-04: `ReviewLog` cascade-deletes with its parent `Card`, contradicting its documented "append-only audit log" intent

**File:** `prisma/schema.prisma:87-96`
**Issue:** The model's own header comment describes `ReviewLog` as an "Append-only audit log of every individual review (HIST-01)" whose purpose is to make review history durable and retry-safe. But the relation is declared `onDelete: Cascade`:
```prisma
card Card @relation(fields: [cardId], references: [id], onDelete: Cascade)
```
Deleting a `Card` (via `DELETE /api/cards/[id]`, or any future cleanup script) silently erases the entire audit trail for that card, which is the opposite of an append-only/immutable history. If the intent is genuinely "never lose review history," `cardId` should not cascade (e.g. keep the log rows with a nullable/orphaned reference, or move deletion to a separate explicit purge script), and if cascading really is intended, the "append-only audit log" framing in the comment is misleading and should be corrected.
**Fix:** Either drop `onDelete: Cascade` on `ReviewLog.card` (make `cardId` nullable, or restrict delete) if history must survive card deletion, or update the doc comment to state explicitly that history is scoped to the card's lifetime.

### WR-05: Defensive guard in `submitReview` silently no-ops instead of surfacing an error when review data is missing

**File:** `components/StudySession.tsx:493-529`
**Issue:**
```ts
const reviewData = current.card.review
if (reviewData && reviewData.nextReview) {
  ... // compute localResult, set requeue + updatedItem
}
```
If `reviewData` is falsy or missing `nextReview` — a state the surrounding comments explicitly say "should never happen" for a card in the due-card pool — `requeue` stays `false` and `updatedItem` stays the unmodified `current` item. The practical effect: the card is treated as fully graduated and permanently leaves the session queue **regardless of what rating the user gave it** (including "Again"), with no console warning, no toast, and no distinguishing signal from a legitimately-mastered card. If this invariant is ever violated by a future change elsewhere in the pipeline (e.g. `getStudyCards()` starts returning a card with a null `review`), this bug would be silent and hard to diagnose.
**Fix:** Add a defensive log (and ideally still fire the background save, which it does) so the failure mode is visible:
```ts
if (reviewData && reviewData.nextReview) {
  ...
} else {
  console.error('submitReview: card missing review.nextReview, cannot compute local FSRS state', cardId)
}
```

## Info

### IN-01: `apply-reviewlog-ddl.mjs` logs the raw `DATABASE_URL` to stdout

**File:** `scripts/apply-reviewlog-ddl.mjs:33`
**Issue:** `console.log('Connected to:', url)` prints the full Turso connection URL to the console/CI logs. The auth token is stored separately (`DATABASE_AUTH_TOKEN`) so this isn't a direct credential leak, but it does expose the internal database hostname/identifier in logs unnecessarily.
**Fix:** Log a redacted form, e.g. `console.log('Connected to:', url.replace(/\/\/.*@/, '//***@'))` or simply omit the URL and log a static "Connected." message.

---

_Reviewed: 2026-07-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
