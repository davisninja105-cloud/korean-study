---
phase: 13-review-api-hardening-save-reliability
reviewed: 2026-07-02T06:11:41Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/review/route.ts
  - components/StudySession.tsx
  - components/Toast.tsx
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-07-02T06:11:41Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The five REVIEW requirements (rating validation, structured 500 on Prisma failure, P2002→400 collision, bounded retry + toast-on-exhaustion, atomic undo) are implemented and satisfy the letter of the plans. The P2002 catch is correctly scoped (verified against `prisma/schema.prisma`: `Card.normalizedFront` is the only `@unique` reachable from the PUT handler, so the friendly message is never misattributed to a different constraint), the rating guard provably precedes the `reviewCard()` call, and the atomic-undo mount guard is sound.

However, the hardening is **incomplete in three places where the *spirit* of the phase ("no unhandled throws", "no raw error leaks", "save reliability") is violated**, plus two smaller robustness gaps in the new client retry wrapper. None are data-loss-or-security BLOCKERs (the app is single-tenant and the framework still returns *a* 500), but they are real defects in files this phase touched and should be fixed before the phase is considered truly "hardened." No BLOCKER-tier issues found.

Cross-file facts verified against source:
- `lib/fsrs.ts:5` re-exports `Grade` from `ts-fsrs` as `Exclude<Rating, Rating.Manual>` = `1|2|3|4` — the `rating >= 1 && rating <= 4` guard matches the type exactly.
- `prisma/schema.prisma`: `Card.normalizedFront` (`@unique`, line 30) is the only unique constraint reachable from the PUT try-block; `Sentence` has none, `CardReview.cardId` is not touched by PUT. P2002 in the PUT catch is therefore always a front collision — the message is accurate.
- `app/api/review/undo/route.ts` (out of scope, not modified) validates `typeof cardId !== 'string'` — the review route under-review does NOT, an inconsistency flagged below.

## Warnings

### WR-01: `await req.json()` is outside the try/catch — malformed JSON throws unhandled, bypassing REVIEW-01's structured 500

**File:** `app/api/review/route.ts:6`
**Issue:** The hardening try-block opens at line 30, but `const { cardId, rating } = await req.json()` at line 6 runs *before* it. If the request body is malformed JSON (truncated by a flaky mobile connection, a buggy caller, or an attacker probing the endpoint), `req.json()` rejects and the POST handler throws an unhandled error. Next.js then returns a framework-level 500 — not the structured `{ error: 'Failed to record review' }` JSON the client (`postReviewWithRetry`) expects. This is exactly the class of failure REVIEW-01 / threat T-13-04 was meant to eliminate ("failures now return a controlled response"). The sibling PUT handler at `app/api/cards/[id]/route.ts:12-14` correctly places `await req.json()` *inside* its try — the two hardened routes are inconsistent.

The 13-01 plan explicitly scoped the try to "the three lines that can throw — findUnique, reviewCard, update," so this is a plan-level oversight faithfully implemented, not a deviation. But the result is a hardening gap: a non-Prisma throw escapes the structured handler.

**Fix:**
```ts
export async function POST(req: NextRequest) {
  let cardId: unknown, rating: unknown
  try {
    const body = await req.json()
    ;({ cardId, rating } = body ?? {})
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (cardId === undefined || rating === undefined) { ... }
  ...
}
```
(Move the parse inside a try, or fold the whole handler body into the existing try.)

### WR-02: PUT `/api/cards/[id]` 500 leaks raw `e.message` to the client (info disclosure, inconsistent with /api/review)

**File:** `app/api/cards/[id]/route.ts:66-67`
**Issue:** The generic 500 branch returns `e.message` verbatim:
```ts
const message = e instanceof Error ? e.message : 'Unknown error'
return NextResponse.json({ error: message }, { status: 500 })
```
This can surface internal details — e.g. a Prisma connection error (which may include the libSQL/Turso endpoint), or a `TypeError: Cannot read properties of null (reading 'type')` when `data` is `null` (the body is never validated to be an object — `data.type !== undefined` at line 20 throws on `null`). The /api/review route was deliberately hardened the other way (T-13-02: `console.error` server-side, return generic `'Failed to record review'`), making the two write routes inconsistent in their disclosure posture. The 13-01 plan explicitly deferred this as "scope creep beyond REVIEW-03," but it remains a real info-disclosure defect in a route this phase hardened, and the `data === null` path makes it reachable with a trivially-crafted body.

**Fix:**
```ts
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return NextResponse.json(
      { error: 'This front already exists (as a different variant of another card)' },
      { status: 400 },
    )
  }
  console.error('PUT /api/cards/[id] failed:', e)
  return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
}
```
Also guard `data` against `null`/non-object before the spread at line 20.

### WR-03: `prisma.card.update` and the sentence-replacement `$transaction` are not atomic — partial state on mid-flow failure

**File:** `app/api/cards/[id]/route.ts:17-46`
**Issue:** The PUT performs two separate DB operations: `prisma.card.update` (line 17) commits the new `front`/`normalizedFront`, then `prisma.$transaction([deleteMany, ...creates])` (line 42) replaces sentences. These are not wrapped in a common transaction. If the card update succeeds but the sentence transaction fails (DB hiccup, libSQL error), the card is left with the **new front but stale sentences** — a silent data-inconsistency that the 500 response does not signal. A client retry then re-sends the same payload, which may or may not repair it. The inline comment at line 30 only claims the *sentence* replacement is atomic ("array-form transaction — safe with libSQL adapter") — the card-vs-sentences atomicity gap is unaddressed.

Pre-existing (Phase 13 only added the P2002 catch, did not touch this flow), but it is a data-consistency defect in a reviewed file and sits squarely in the phase's "save reliability" theme.

**Fix:** Wrap both the card update and the sentence operations in a single `$transaction`:
```ts
await prisma.$transaction([
  prisma.card.update({ where: { id }, data: { ... } }),
  ...(Array.isArray(data.sentences)
    ? [prisma.sentence.deleteMany({ where: { cardId: id } }),
       ...sentenceData.map((s) => prisma.sentence.create({ data: s }))]
    : []),
])
```
(The libSQL adapter supports array-form transactions per the existing comment.)

### WR-04: `postReviewWithRetry` retries non-transient failures (4xx) and has no per-attempt timeout — misleading toast + a failure mode where the toast *never* appears

**File:** `components/StudySession.tsx:110-132`
**Issue:** Two coupled robustness gaps in the new retry wrapper:

1. **Retries non-transient responses.** An attempt counts as failed whenever `!res.ok`, so a `400` (invalid rating — shouldn't happen from the local caller but is reachable) and a `404` (review record deleted between card-load and grade — a real race if sync/reorg runs mid-session) are retried with 500ms+1500ms backoff, then surface the toast *"Couldn't save your last review — check your connection."* The message is misleading (the connection is fine) and the 2s of pointless retries delays it.

2. **No fetch timeout / AbortController.** If the server accepts the TCP connection but never responds (hung libSQL, paused serverless instance), `await fetch(...)` never resolves *and* never rejects. The `for` loop never advances to the next attempt, so `onExhausted` is **never called** and the toast never appears. This directly defeats REVIEW-04's guarantee ("a toast appears only after every review-save retry is exhausted") under a realistic mobile/flaky-network condition — the user gets neither the save nor the failure signal.

**Fix:**
```ts
async function postReviewWithRetry(cardId: string, rating: number, onExhausted: () => void) {
  const backoffMs = [500, 1500]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      if (res.ok) return
      // 4xx is permanent — don't retry; go straight to exhausted.
      if (res.status >= 400 && res.status < 500) break
    } catch { /* fetch rejected or aborted — counts as a failed attempt */ }
    if (attempt < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs[attempt]))
    }
  }
  onExhausted()
}
```

### WR-05: `/api/review` does not validate `cardId` is a string (input-validation inconsistency with the sibling undo route)

**File:** `app/api/review/route.ts:7`
**Issue:** The guard is `cardId === undefined || rating === undefined`. A non-string `cardId` (`null`, `123`, `{}`, `""`) passes the guard; `""` then yields a misleading 404 (no card with empty id), and a number/object throws inside `findUnique` (caught by the generic 500, but unnecessarily). The sibling `app/api/review/undo/route.ts:8` (same subsystem, same payload shape) validates `!cardId || typeof cardId !== 'string'` — the two review routes are inconsistent in their input contract, and the hardened route is the weaker of the two.

**Fix:**
```ts
if (cardId === undefined || rating === undefined) {
  return NextResponse.json({ error: 'cardId and rating required' }, { status: 400 })
}
if (typeof cardId !== 'string' || cardId === '') {
  return NextResponse.json({ error: 'cardId must be a non-empty string' }, { status: 400 })
}
```

## Info

### IN-01: `rating as Grade` is an unchecked type assertion

**File:** `app/api/review/route.ts:36`
**Issue:** `reviewCard(cardReview, rating as Grade)` uses an `as` cast. It is safe *today* because the guard at lines 14-24 proves `rating ∈ {1,2,3,4}` and `Grade = Exclude<Rating, Rating.Manual>` is exactly `1|2|3|4` (verified in `node_modules/ts-fsrs/dist/index.d.ts:17`). But TypeScript cannot model `Number.isInteger` + range checks, so the cast — not a narrowing predicate — is what bridges the gap. If a future edit relaxes the guard, the cast silently keeps compiling and masks the regression. Prefer a type guard so the compiler enforces the relationship.

**Fix:**
```ts
function isGrade(n: unknown): n is Grade {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4
}
if (!isGrade(rating)) {
  return NextResponse.json({ error: 'rating must be one of 1, 2, 3, 4' }, { status: 400 })
}
// then: reviewCard(cardReview, rating)  // no cast needed
```

### IN-02: `handleUndo` failure path is not mount-guarded, inconsistent with the success path

**File:** `components/StudySession.tsx:580-586`
**Issue:** The success-path restoration is guarded by `if (!isMountedRef.current) return` (line 596) — the whole point of REVIEW-05. But the failure path immediately above it writes `undoRef.current = {...}` and calls `setCanUndo(true)` *without* the same guard:
```ts
} catch {
  undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }
  setCanUndo(true)
  return
}
```
In React 18 this is harmless (setState on an unmounted component is a silent no-op; the ref write is unreachable once unmounted). But it is inconsistent with the atomic-guard pattern established two lines below it in the same function, and a reader cannot tell from the code whether the omission is intentional or an oversight. Either guard it for symmetry or add a comment explaining why the failure path needs no guard.

**Fix:** Wrap for symmetry, or comment:
```ts
} catch {
  if (!isMountedRef.current) return  // session ended mid-undo; no UI to re-arm
  undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }
  setCanUndo(true)
  return
}
```

### IN-03: Toast auto-dismiss timer does not reset when `message` changes (latent, not triggered by current callers)

**File:** `components/Toast.tsx:34-37`
**Issue:** The timer effect depends only on `[duration]`:
```ts
useEffect(() => {
  const timer = setTimeout(() => dismissRef.current(), duration)
  return () => clearTimeout(timer)
}, [duration])
```
The `dismissRef`-held-callback design (so the timer survives parent re-renders) is correct and well-reasoned. But because `message` is not a dep, if the same Toast instance ever received a *new* message while mounted, the dismiss timer would keep ticking from the original mount — a new error would auto-dismiss based on the *old* remaining time. The current sole caller (`StudySession.tsx:666-671`) always passes the same string literal or unmounts the Toast (via `saveError → null`), so this does not manifest today. It is a footgun for any future reuse of the component with varying messages.

**Fix:** Add `message` to the timer effect deps (the `dismissRef` indirection still prevents resetting on unrelated parent re-renders — only a genuine message change resets), or key the Toast by message at the call site (`<Toast key={saveError} ... />`).

---

_Reviewed: 2026-07-02T06:11:41Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
