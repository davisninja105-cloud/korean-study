# Phase 17: ReviewLog Schema & Idempotent Write Path - Research

**Researched:** 2026-07-04
**Domain:** Prisma 7 + libSQL/Turso transactional writes, HTTP idempotency-key patterns, client-side retry cancellation (AbortController)
**Confidence:** HIGH (all core mechanisms are either already proven in this exact codebase or standard web-platform APIs; MEDIUM on residual edge cases noted in Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Each `ReviewLog` row stores the **full FSRS snapshot**, mirroring `CardReview`'s fields exactly: `state`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, `nextReview`, `lastReview` — plus `cardId`, `rating`, `createdAt`, and the idempotency key. Chosen over a leaner row so Phase 18 (or any future "why was this card hard" view) never needs a migration to backfill values it didn't originally capture.
- **D-02:** These are the *resulting* (post-update) values — the same object shape written to `CardReview` by `reviewCard()` in that same review. No separate "before" snapshot; no analytics/diff dashboard is in scope.

### Claude's Discretion
- **Duplicate-retry response:** When a retried request hits the idempotency unique-constraint (already applied), follow the existing P2002-catch idiom already used in `app/api/cards/[id]/route.ts` — treat it as an idempotent success and return the current `CardReview` state, not an error. `postReviewWithRetry` already treats any `res.ok` as success, so the route must return 200 (not 409/500) on a detected duplicate.
- **Transaction pattern:** Use `prisma.$transaction([...])` array form (not the callback form) — the only form already proven safe with the libSQL adapter in this codebase.
- **Idempotency key generation:** Client generates the key once per grade action (in `submitReview`'s event-handler flow, not render — purity-safe) and reuses the same key across all retry attempts of that action in `postReviewWithRetry`.
- **Retry cancellation scope:** Cancel only the in-flight retry chain for the specific `cardId` being undone (matches `undoRef`'s single-slot design — only one review is ever undoable at a time), not a blanket cancel-everything.
- **Cancellation UX:** Stays silent, matching the existing `postReviewWithRetry` pattern where the toast (`saveError`) only ever surfaces on retry *exhaustion* (failure), never on a routine cancel.
- **ReviewLog retention:** No pruning/cap — small personal single-tenant app; append-only forever is fine at this scale.
- **`ReviewLog.id`:** `cuid()` default, matching every other model in the schema.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (One todo matched Phase 17 by keyword scan only; its frontmatter says `resolves_phase: 16`, already shipped there — not folded here.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIST-01 | Every FSRS review writes a `ReviewLog` row (timestamp, cardId, rating, resulting FSRS state) | See Standard Stack / Code Examples — `ReviewLog` model mirrors `CardReview` (D-01/D-02); written inside the same `$transaction([...])` as the `CardReview.update` |
| HIST-02 | `ReviewLog` writes are idempotent — a client-generated idempotency key + `prisma.$transaction([...])` ensures a lost-response retry never produces a duplicate row or double-applies FSRS state | See Architecture Patterns (Idempotent Write Path) + Common Pitfalls #1–#3 — unique constraint on `idempotencyKey`, P2002 catch treated as success, atomicity of the array-form transaction rolls back `CardReview.update` when `ReviewLog.create` collides |
| HIST-03 | In-flight background retries are cancelled when the user triggers undo, preventing a stale retry from silently re-applying a rating after undo | See Architecture Patterns (Cancellation) + Common Pitfalls #4 — `AbortController` stored on the same single-slot `undoRef.current` object, aborted from `handleUndo` |
</phase_requirements>

## Summary

This phase adds one new Prisma model (`ReviewLog`) and hardens one existing write path (`POST /api/review`) plus its client caller (`postReviewWithRetry` / `submitReview` / `handleUndo` in `components/StudySession.tsx`). Nothing here requires a new npm dependency — every mechanism (array-form `$transaction`, P2002 catch-as-friendly-response, `AbortController`, `crypto.randomUUID()`) is either already proven elsewhere in this codebase or a standard web-platform API already usable without imports.

The two hard technical questions the user flagged for research were (1) whether libSQL/Turso's array-form transactions reliably roll back atomically when a later statement in the batch fails a unique constraint, and (2) how to compose a "cancel-this-review's-retry-chain" `AbortController` with the existing per-attempt 8-second timeout `AbortController` inside `postReviewWithRetry`. Both are resolved below: (1) the array-form transaction pattern is already running in production in `app/api/cards/[id]/route.ts` (update + deleteMany + creates, 2-4+ statements) and Prisma's documented semantics for array-form transactions are all-or-nothing; there is a documented historical regression (Prisma 6.10.1, `queryCompiler` preview) where a thrown error was misreported alongside a partial commit, but it was scoped to nested relational `create` batches, not distinguishable in this codebase's already-working precedent, and is worth a five-minute manual smoke test rather than a redesign. (2) The composition is solved without any new library by layering a "cancellation" `AbortController` (created once per grade action, aborted by `handleUndo`) with the existing per-attempt timeout `AbortController` via a forwarding `addEventListener('abort', ...)` — no need for `AbortSignal.any()` (a newer API with less certain support), which sidesteps a browser-compatibility question entirely.

**Primary recommendation:** Add `ReviewLog` as a Cascade-on-delete child of `Card` (matching `Sentence`/`CardReview`/`CardDependency`'s existing FK convention) with a single new column, `idempotencyKey String @unique`; apply it to Turso via a new idempotent one-time script (`scripts/apply-reviewlog-ddl.mjs`), following the exact template already used by `scripts/apply-sentence-ddl.mjs`. On the write path, always attempt the `$transaction([cardReview.update(...), reviewLog.create(...)])`; catch P2002 on the array call and, on catch, re-fetch and return the existing `CardReview` (already-idempotent path) instead of erroring. On the client, generate the idempotency key with `crypto.randomUUID()` inside `submitReview` (event-handler flow, purity-safe), store a per-review `AbortController` on the same object already held in `undoRef.current`, and call `.abort()` on it from `handleUndo` before/instead of restoring the queue.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ReviewLog schema + Turso DDL | Database / Storage | — | New persisted table; schema is the source of truth, DDL is a one-time sync mechanism (Turso gotcha) |
| Idempotency-key generation | Browser / Client | — | Must be generated once per grade action in an event handler (purity rule), then threaded unchanged through all retry attempts |
| Idempotent transactional write | API / Backend | Database / Storage | `POST /api/review` owns the transaction + P2002 handling; the DB enforces the actual uniqueness guarantee via the unique index |
| Retry loop + backoff | Browser / Client | — | `postReviewWithRetry` already lives client-side; unchanged responsibility, just gains a cancellation signal |
| Retry cancellation on undo | Browser / Client | — | `handleUndo` is a client event handler; it owns the `AbortController` for the review it's undoing |
| Undo state revert | API / Backend | Database / Storage | `POST /api/review/undo` is unchanged in this phase — reverts `CardReview` only, never touches `ReviewLog` (HIST-06, Phase 18-adjacent but binding now) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` / `prisma` | 7.8.0 (registry current; project pins `^7.6.0`) `[VERIFIED: npm registry]` | ORM, `$transaction([...])` array-form batching, `Prisma.PrismaClientKnownRequestError` P2002 detection | Already the project's ORM; no version bump required for this phase |
| `@prisma/adapter-libsql` | 7.8.0 (registry current; project pins `^7.6.0`) `[VERIFIED: npm registry]` | Driver adapter for Turso/libSQL under Prisma 7's mandatory `queryCompiler` + driver-adapter engine mode | Already in use (`lib/prisma.ts`); no new package needed |
| Web Crypto `crypto.randomUUID()` | Platform built-in (no package) `[CITED: MDN / Web Crypto API]` | Client-generated idempotency key, once per grade action | Zero-dependency, cryptographically-random UUID v4; available in all evergreen browsers and Node ≥ 14.17 (dev tooling only — this call happens client-side in the browser) |
| `AbortController` / `AbortSignal` | Platform built-in | Cancel in-flight/queued retry attempts from `handleUndo` | Already used for the per-attempt 8s timeout in `postReviewWithRetry`; extending its use (rather than introducing a cancellation library) is the path of least surprise |

### Supporting
None — no new supporting libraries needed. This phase is schema + existing-stack write-path hardening only, matching the STATE.md decision: "Zero new npm dependencies expected."

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto.randomUUID()` | `nanoid` / `uuid` npm packages | Adds a dependency for something the platform already provides natively; rejected — zero-dependency wins for a single-tenant app |
| Array-form `$transaction([...])` | Interactive `$transaction(async (tx) => {...})` callback form | Interactive transactions are the more "idiomatic" Prisma pattern for read-then-write logic, but this codebase's only proven-working transaction pattern against the libSQL adapter is array-form (`app/api/cards/[id]/route.ts`); the callback form's compatibility with `@prisma/adapter-libsql` + Turso has not been validated here and carries the STATE.md-flagged "Turso interactive-transaction uncertainty" — array-form is the locked choice per Approach note, not a discretion point |
| Manual `AbortController` composition | `AbortSignal.any([signal1, signal2])` | `AbortSignal.any` (Node 20+/Chrome 116+/Firefox 124+/Safari 17.4+) is cleaner but has a later browser-support floor and isn't already used anywhere in this codebase; manual forwarding via `addEventListener('abort', ...)` works on every browser that already supports `AbortController` (i.e., everything this app already targets) |

**Installation:**
```bash
# No new packages — ReviewLog uses only already-installed dependencies.
```

**Version verification:** `npm view prisma version` → `7.8.0`; `npm view @prisma/adapter-libsql version` → `7.8.0` (both checked 2026-07-04). Project's `^7.6.0` pin resolves within this range; no action needed since no new install occurs in this phase.

## Package Legitimacy Audit

Not applicable — this phase installs zero new packages. Every mechanism used (`crypto.randomUUID`, `AbortController`, `prisma.$transaction`, `Prisma.PrismaClientKnownRequestError`) is either a browser/Node platform built-in or an already-installed, already-imported dependency (`@prisma/client`, generated from `app/generated/prisma/client`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Browser (components/StudySession.tsx)                               │
│                                                                       │
│  submitReview(rating)  [event handler — purity-safe]                │
│    │                                                                 │
│    ├─ key = crypto.randomUUID()          (generated ONCE per grade) │
│    ├─ controller = new AbortController() (ONE per grade action)     │
│    ├─ undoRef.current = { cardId, prevState, ..., controller }      │
│    │                                       (single-slot, unchanged   │
│    │                                        shape + new field)      │
│    ├─ optimistic queue advance (unchanged, instant)                 │
│    └─ void postReviewWithRetry(cardId, rating, key,                 │
│                                  controller.signal, onExhausted)     │
│           │                                                          │
│           │  loop: up to 3 attempts, 500/1500ms backoff             │
│           │  each attempt: per-attempt AbortController (8s timeout) │
│           │  forwarded from controller.signal via addEventListener  │
│           │  if controller.signal.aborted → return silently,        │
│           │  never call onExhausted                                 │
│           ▼                                                          │
│      fetch POST /api/review { cardId, rating, idempotencyKey: key } │
│                                                                       │
│  handleUndo()  [event handler]                                      │
│    ├─ undoRef.current.controller?.abort()   ← HIST-03               │
│    ├─ POST /api/review/undo { cardId, prevState }  (unchanged)      │
│    └─ restore queue/stats snapshot on success                       │
└──────────────────────────────┬────────────────────────────────────┬─┘
                                │ HTTP                               │ HTTP
                                ▼                                    ▼
┌───────────────────────────────────────────┐   ┌─────────────────────────────┐
│ API / Backend (app/api/review/route.ts)   │   │ app/api/review/undo/route.ts│
│                                             │   │ (UNCHANGED this phase)      │
│ 1. Validate cardId, rating, idempotencyKey │   │ Reverts CardReview only —   │
│ 2. Read CardReview (current state)         │   │ never touches ReviewLog     │
│ 3. reviewCard(cardReview, rating) → result │   │ (HIST-06, append-only)      │
│ 4. try:                                    │   └─────────────────────────────┘
│      prisma.$transaction([                 │
│        cardReview.update({...result}),     │
│        reviewLog.create({...result,        │
│          cardId, rating, idempotencyKey}), │
│      ])   ← array form, atomic             │
│    catch P2002 (idempotencyKey collision): │
│      → duplicate retry — re-fetch current  │
│        CardReview, return 200 (not error)  │
│ 5. return 200 + review                     │
└──────────────────────┬──────────────────────┘
                        ▼
┌───────────────────────────────────────────┐
│ Database / Storage (Turso / libSQL)        │
│  CardReview (singleton per card, mutated)  │
│  ReviewLog  (append-only, idempotencyKey   │
│              UNIQUE index enforces         │
│              exactly-once semantics)       │
└───────────────────────────────────────────┘
```

### Recommended Project Structure
```
prisma/schema.prisma          # add `model ReviewLog` (new)
scripts/
└── apply-reviewlog-ddl.mjs   # new — one-time Turso DDL, template = apply-sentence-ddl.mjs
app/api/review/
└── route.ts                  # add idempotencyKey validation + transaction + P2002 catch
components/
└── StudySession.tsx           # postReviewWithRetry gains key + cancel signal params;
                                # submitReview generates key + controller; handleUndo aborts it
```

### Pattern 1: Idempotent transactional write with P2002-as-success
**What:** Attempt the state mutation + audit-row insert as one atomic array-form transaction; treat a unique-constraint violation on the audit row's idempotency key as proof the request already succeeded, and return success instead of an error.
**When to use:** Any write path where a client-side retry might resend an already-processed request.
**Example:**
```typescript
// Source: pattern adapted from app/api/cards/[id]/route.ts (existing P2002 idiom in this repo)
import { Prisma } from '@/app/generated/prisma/client'

try {
  const [, log] = await prisma.$transaction([
    prisma.cardReview.update({ where: { cardId }, data: updated }),
    prisma.reviewLog.create({
      data: { cardId, rating, idempotencyKey, ...updated },
    }),
  ])
  return NextResponse.json({ review: updated, logId: log.id })
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    // Idempotent replay: a ReviewLog with this key already exists, meaning an
    // earlier attempt already committed. The whole array-form transaction rolled
    // back (CardReview.update did NOT re-apply), so it's safe to just report
    // the current, already-correct state as success.
    const current = await prisma.cardReview.findUnique({ where: { cardId } })
    return NextResponse.json({ review: current, duplicate: true })
  }
  console.error('POST /api/review failed:', e)
  return NextResponse.json({ error: 'Failed to record review' }, { status: 500 })
}
```

### Pattern 2: Composable cancellation without `AbortSignal.any`
**What:** Forward an outer "cancel this whole retry chain" signal into each attempt's own per-attempt timeout controller, and use the outer signal's `.aborted` flag to distinguish "cancelled" from "timed out" in the catch block.
**When to use:** Any bounded-retry loop that needs an externally-triggered cancel in addition to its own per-attempt timeout.
**Example:**
```typescript
// Source: extends the existing postReviewWithRetry in components/StudySession.tsx
async function postReviewWithRetry(
  cardId: string,
  rating: number,
  idempotencyKey: string,
  cancelSignal: AbortSignal,
  onExhausted: () => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cancelSignal.aborted) return  // undo already fired — stop before spending an attempt
    const ctrl = new AbortController()
    const forwardAbort = () => ctrl.abort()
    cancelSignal.addEventListener('abort', forwardAbort, { once: true })
    const timeoutId = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating, idempotencyKey }),
        signal: ctrl.signal,
      })
      if (res.ok) return
      if (res.status >= 400 && res.status < 500) break
    } catch {
      if (cancelSignal.aborted) return  // this was a deliberate cancel, not a real failure
      // else: real network error or 8s timeout — fall through to retry
    } finally {
      clearTimeout(timeoutId)
      cancelSignal.removeEventListener('abort', forwardAbort)
    }
    if (attempt < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs[attempt]))
      if (cancelSignal.aborted) return
    }
  }
  if (!cancelSignal.aborted) onExhausted()
}
```

### Anti-Patterns to Avoid
- **Generating the idempotency key inside `postReviewWithRetry` itself:** would produce a *new* key per attempt, defeating the entire purpose (each retry would look like a distinct review to the server). The key must be generated exactly once in `submitReview`, before the retry loop starts, and passed in unchanged.
- **Checking for an existing `ReviewLog` before writing, then writing if absent (check-then-act):** this is a race condition between the check and the write, especially since two attempts of the same retry chain should never race in practice but a defensive design shouldn't rely on that. Always attempt the write and let the unique constraint be the single source of truth (catch P2002, don't pre-check).
- **Treating a P2002 catch as an error the client should see as a failure:** `postReviewWithRetry` treats any non-`res.ok` as a failed attempt and retries; if the route returns 409/500 on duplicate, an already-successful review would trigger a spurious retry loop and possibly the "couldn't save" toast on an actually-fine review. Always return 200 on a detected duplicate.
- **Using `AbortSignal.any()` for the cancellation composition:** works, but is unnecessary complexity/compat-risk here given the codebase has zero existing usage and the manual `addEventListener` forwarding is simpler to reason about and matches the existing per-attempt-controller style already in `postReviewWithRetry`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency key generation | Custom random-string generator, timestamp+counter scheme | `crypto.randomUUID()` | Platform built-in, cryptographically random, zero dependency, zero purity risk when called in an event handler |
| Duplicate-write detection | Manual "check if a log exists, then decide" pre-flight query | Database `@unique` constraint + catch `P2002` | The DB is the single source of truth for uniqueness; app-level check-then-act is inherently racy even if unlikely to be hit here |
| Retry-chain cancellation | A custom cancellation-token class/library | `AbortController` (already used for per-attempt timeouts in this file) | Standard, already in use in this exact function — extending it is strictly less code than introducing a second cancellation primitive |

**Key insight:** Every mechanism this phase needs already has a proven, in-repo precedent (P2002 catch in `app/api/cards/[id]/route.ts`, array-form `$transaction` in the same file, `AbortController` timeouts in `postReviewWithRetry` itself). The work is composition and extension, not new-pattern introduction — which is exactly why zero new dependencies are needed.

## Common Pitfalls

### Pitfall 1: `migrate diff --from-empty` generates DDL for the ENTIRE schema, not just the new table
**What goes wrong:** Running `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` diffs from nothing to the *full* current schema, so the output script contains `CREATE TABLE` statements for `Lesson`, `Card`, `Sentence`, `CardReview`, `CardDependency`, `StudyDay`, `Setting` — not just the new `ReviewLog`. Running the whole generated script against Turso would collide with tables that already exist.
**Why it happens:** `--from-empty` means "diff from an empty database," not "diff from the last migration." There is no migration history to diff from incrementally in this project's manual-DDL workflow.
**How to avoid:** Follow the established pattern in `scripts/apply-sentence-ddl.mjs` / `scripts/apply-graph-ddl.mjs` instead of running the raw generated script: hand-write a small idempotent script (`CREATE TABLE IF NOT EXISTS "ReviewLog" (...); CREATE UNIQUE INDEX IF NOT EXISTS ...; CREATE INDEX IF NOT EXISTS ...;`) using `executeMultiple()`, and use the generated `migrate diff` output only as a reference for exact column/type syntax, not as something to execute verbatim.
**Warning signs:** A DDL script that runs `CREATE TABLE "Card" (...)` etc. against a Turso DB that already has data in it — should error immediately as "table already exists" if you didn't extract just the new pieces (with `IF NOT EXISTS`, it would silently no-op instead of erroring, which can mask the mistake of using the wrong file — extract manually rather than relying on `IF NOT EXISTS` on the whole dump).

### Pitfall 2: Historical Prisma `queryCompiler` regression — array transactions reportedly committing despite a thrown error
**What goes wrong:** Prisma issue #27529 documented a case (v6.10.1, `queryCompiler` preview feature — now mandatory in Prisma 7) where an array-form `$transaction` threw a misleading error while the transaction had, per its debug logs, already committed. If something similar occurred here, a P2002 on `reviewLog.create` might not actually roll back the preceding `cardReview.update`, silently double-applying FSRS state on a retry — the exact bug HIST-02 is designed to prevent.
**Why it happens:** The reported regression was scoped to nested relational `create` operations with connected records inside a batch, and was already a known-tracked issue at the time (not confirmed against Prisma 7.x/`@prisma/adapter-libsql` 7.6+ specifically).
**How to avoid:** This codebase already runs a structurally similar array-form transaction in production (`app/api/cards/[id]/route.ts`: update + deleteMany + N creates) without reported issues, which is the strongest available evidence this pattern is safe on the current stack. Still, because HIST-02's entire guarantee rests on transactional atomicity, the plan should include an explicit manual verification step: force a P2002 (e.g., call `POST /api/review` twice with the same `idempotencyKey` but observe the FSRS fields — `reps`, `nextReview` — did NOT change on the second call) before considering HIST-02 done.
**Warning signs:** `CardReview.reps` incrementing on a duplicate-key retry, or `nextReview` changing between the "real" write and its retry.

### Pitfall 3: A P2002 on the wrong statement in the array being misattributed
**What goes wrong:** Prisma issue #28953 notes `PrismaClientKnownRequestError` P2002 can be missing `meta.target` in some 7.x scenarios, which would matter if there were multiple unique constraints in play and the catch block needed to distinguish which one fired.
**Why it happens:** `meta.target` population depends on driver-specific error surface (documented as flaky across adapters, worse for MySQL specifically per search findings, less clear for libSQL).
**How to avoid:** `ReviewLog` has exactly one meaningful unique constraint (`idempotencyKey`) beyond its `id` primary key, and `cardReview.update` in this same transaction has no unique-constraint risk (it's a keyed update on an already-existing row, not a create). So any P2002 caught from this specific transaction call can be safely assumed to be the `idempotencyKey` collision — no need to inspect `e.meta.target` at all. Don't add an inspection of `meta.target` that the transaction doesn't actually need; it would be dead code that also isn't reliably populated.
**Warning signs:** N/A — this is a "don't add unnecessary complexity" pitfall, not a runtime failure mode.

### Pitfall 4: Idempotency key alone does NOT prevent post-undo re-application — cancellation is a separate, necessary mechanism
**What goes wrong:** It's tempting to assume the idempotency key (HIST-02) alone satisfies HIST-03, since "the key already exists, so a duplicate is a no-op." But the dangerous case is a retry attempt whose *underlying HTTP request never actually reached the server* before undo happened (e.g., the first 1-2 attempts failed with a network error before ever hitting `/api/review`) — the *n*-th retry using the *same, still-unused* idempotency key is a genuinely FIRST successful delivery of that grade action, arriving at the server *after* undo already reverted `CardReview` to `prevState`. That retry will read the now-reverted `CardReview`, recompute `reviewCard()` from it using the original rating, and write a brand-new, valid, non-duplicate `ReviewLog`/`CardReview` update — silently re-applying the undone rating. Idempotency alone cannot catch this because it isn't a duplicate from the server's point of view; it's the first (and only) successful attempt.
**Why it happens:** Idempotency keys deduplicate *repeated deliveries of the same request*; they say nothing about *client-side state changes (like undo) that happened between send attempts*. These are two independent problems, both flagged as separate Success Criteria (#2 and #3) for exactly this reason.
**How to avoid:** This is precisely why HIST-03 requires client-side cancellation (`AbortController`) independent of the server-side idempotency mechanism — aborting the retry chain prevents the stale attempt from ever being sent once undo fires. This is a best-effort guarantee (see Open Questions on already-in-flight requests), but it is the only mechanism available that addresses this specific case; the idempotency key on its own is necessary for HIST-02 but not sufficient for HIST-03.
**Warning signs:** A card's `CardReview` state changing back to a "graded" state seconds after a successful undo, with no user action in between.

### Pitfall 5: `react-hooks/purity` — key/controller generation must stay in the event handler
**What goes wrong:** `crypto.randomUUID()` and `new AbortController()` are each side-effect-free-looking but are still impure/non-deterministic constructs if called during render (a fresh UUID and a fresh object identity on every render would break memoization expectations, and ESLint's `react-hooks/purity` rule is calibrated to flag exactly this class of call).
**Why it happens:** `submitReview` is defined in the component body but *invoked* from event handlers (`onClick`, keydown handler) — the function body itself is fine to call these inside since it's not the render pass, but this must not be refactored into a `useMemo`/render-time computation later.
**How to avoid:** Keep both calls exactly where `submitReview` already runs today — inside the function body that's invoked by click/key handlers, never lifted into `useMemo`, `useState(() => ...)` lazy initializers evaluated on every render, or the component's top-level render flow.
**Warning signs:** ESLint `react-hooks/purity` failing on the new lines; `npm run lint` must stay clean per project convention.

## Code Examples

### `prisma/schema.prisma` — new `ReviewLog` model
```prisma
// Source: mirrors CardReview's field set (D-01/D-02) + FK/index conventions
// already used by Sentence/CardDependency in this schema.
model ReviewLog {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  cardId         String
  card           Card     @relation(fields: [cardId], references: [id], onDelete: Cascade)
  rating         Int      // FSRS grade 1-4 (Again/Hard/Good/Easy)
  idempotencyKey String   @unique
  // Resulting (post-update) FSRS snapshot — same shape as CardReview.
  state          Int
  stability      Float
  difficulty     Float
  elapsedDays    Int
  scheduledDays  Int
  reps           Int
  lapses         Int
  nextReview     DateTime
  lastReview     DateTime?

  @@index([cardId])
  @@index([createdAt])
}
```
Also add the reverse relation on `Card`:
```prisma
model Card {
  // ...existing fields...
  reviewLogs ReviewLog[]
}
```

### `scripts/apply-reviewlog-ddl.mjs` — one-time Turso DDL
```javascript
// Source: template = scripts/apply-sentence-ddl.mjs (identical structure/conventions)
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '..', '.env')
const envVars = {}
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
    if (m) envVars[m[1]] = m[2]
  }
} catch { /* .env may not exist in some envs */ }

const url   = process.env.DATABASE_URL        ?? envVars.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? envVars.DATABASE_AUTH_TOKEN
if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
console.log('Connected to:', url)

try {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "ReviewLog" (
      "id"             TEXT NOT NULL PRIMARY KEY,
      "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "cardId"         TEXT NOT NULL,
      "rating"         INTEGER NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "state"          INTEGER NOT NULL,
      "stability"      REAL NOT NULL,
      "difficulty"     REAL NOT NULL,
      "elapsedDays"    INTEGER NOT NULL,
      "scheduledDays"  INTEGER NOT NULL,
      "reps"           INTEGER NOT NULL,
      "lapses"         INTEGER NOT NULL,
      "nextReview"     DATETIME NOT NULL,
      "lastReview"     DATETIME,
      FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ReviewLog_idempotencyKey_key" ON "ReviewLog"("idempotencyKey");
    CREATE INDEX IF NOT EXISTS "ReviewLog_cardId_idx" ON "ReviewLog"("cardId");
    CREATE INDEX IF NOT EXISTS "ReviewLog_createdAt_idx" ON "ReviewLog"("createdAt");
  `)
  console.log('ReviewLog table + indexes created (or already existed).')
} catch (e) {
  console.error('DDL failed:', e.message)
  process.exit(1)
}

const { rows } = await db.execute(`SELECT count(*) as n FROM "ReviewLog"`)
console.log('ReviewLog row count:', rows[0][0] ?? rows[0].n)
console.log('Done.')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma Rust query engine (binary/library engine) | `queryCompiler` + driver adapter is now the *only* engine mode | Prisma 7 (this project is already on 7.6.0/`prisma-client` generator) | All transactions in this codebase already run through the driver-adapter path; the historical `queryCompiler`-preview regressions (Pitfall 2) are relevant background but this project has no "fallback to Rust engine" option available even if desired |
| `previewFeatures = ["driverAdapters"]` flag | No flag needed — driver adapters are default/required in v7 | Prisma 7 upgrade | Confirms this project's `generator client { provider = "prisma-client" }` (no `previewFeatures` block) is the correct, current v7 shape — nothing to change here |

**Deprecated/outdated:** None directly relevant — no API in this phase's scope has been deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ReviewLog` should have an `onDelete: Cascade` FK relation to `Card` (matching `Sentence`/`CardReview`/`CardDependency`), rather than a loose unrelated `cardId` string | Code Examples (schema) | If wrong, deleting a card would either orphan `ReviewLog` rows (if no FK at all) or unexpectedly wipe review history the user wanted to keep as a permanent audit trail even after card deletion — this specific nuance was not discussed in CONTEXT.md and is a genuine judgment call; flagged for planner/user confirmation |
| A2 | The Prisma `queryCompiler` array-transaction partial-commit regression (issue #27529) does not reproduce on this project's exact versions (Prisma `^7.6.0`, `@prisma/adapter-libsql ^7.6.0`, `@libsql/client ^0.17.2`) for a simple 2-statement update+create batch | Common Pitfalls #2 | If it does reproduce, HIST-02's core atomicity guarantee would be silently broken; mitigated by recommending an explicit manual duplicate-retry verification step before considering the phase done |
| A3 | A P2002 caught on the `$transaction([...])` array call unambiguously means the `idempotencyKey` unique constraint fired (no other unique constraint is reachable in that same call) | Common Pitfalls #3 | Low risk — `cardReview.update` has no unique-constraint surface of its own in this call shape; if wrong, a genuine different error could be mis-swallowed as a "duplicate success" |

## Open Questions

1. **Does client-side `AbortController.abort()` on an already-sent (in-flight, past the point the server started processing) fetch reliably prevent the server request from completing?**
   - What we know: `AbortController.abort()` reliably prevents the client from *waiting on or acting on* the response, and reliably prevents any *future, not-yet-fired* retry attempt (checked via `cancelSignal.aborted` before each attempt and during backoff waits).
   - What's unclear: Whether it can retroactively stop a request whose bytes are already fully sent and being processed server-side at the exact moment `.abort()` is called (browser behavior here varies by network layer timing, not something this research can pin down further without live testing).
   - Recommendation: Accept this as a best-effort guarantee — it is the only client-side mechanism available and matches the phase's discretion note that cancellation UX "stays silent." The residual exposure window is narrow (only during the few hundred milliseconds a fetch is actually in flight, not during the multi-second backoff waits between attempts, which dominate the retry chain's total duration) and acceptable for a personal single-user app. Document this as a known limitation rather than engineering a server-side "has this card been undone since timestamp X" check, which the user's decisions (undo never touches `ReviewLog`) suggest is intentionally out of scope.

2. **Should `ReviewLog` cascade-delete with its `Card`, or persist as a permanent record?**
   - What we know: Every other per-card child table (`Sentence`, `CardReview`, `CardDependency`) cascades on `Card` deletion.
   - What's unclear: Whether "append-only audit trail" framing implies review history should survive card deletion (arguably the more audit-trail-faithful choice) — this exact nuance wasn't raised in the CONTEXT.md discussion.
   - Recommendation: Default to Cascade (schema consistency, simplicity, avoids orphaned rows referencing a deleted card that Phase 18's history view would need to handle specially) unless the user specifically wants review history to outlive card deletion — flag for a quick confirmation at plan-check time, not a blocking question.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `prisma` CLI (`npx prisma generate`, `migrate diff`) | Schema change workflow | ✓ | 7.8.0 (registry; project pins `^7.6.0`) | — |
| `@libsql/client` (for the new DDL script) | `scripts/apply-reviewlog-ddl.mjs` | ✓ | `^0.17.2` (already a dependency) | — |
| Turso DB / `DATABASE_URL` | Applying DDL, all writes | Assumed ✓ (already used by every other phase) | — | Local `file:./prisma/dev.db` for dev-only testing before touching production Turso |
| Browser `crypto.randomUUID()` | Idempotency key generation | ✓ (platform built-in) | — | — |
| Browser `AbortController` | Retry cancellation | ✓ (platform built-in, already used in this file) | — | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — all dependencies already present and proven in this codebase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` (environment: node) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no separate slow/fast split in this project) |

**Important framework-fit note:** Every existing test in this repo (`extract-cards.test.ts`, `sequence.test.ts`, `card-key.test.ts`, `known-words.test.ts`, etc.) targets pure `lib/` functions only — there is no DB/API integration test harness in this project (`npm test` comment in `CLAUDE.md`: "Vitest unit tests — pure lib functions — no DB/API needed"). This phase's core logic (transaction atomicity, P2002 handling, retry/cancellation timing) lives in an API route and a client component with network calls, neither of which fits this project's existing automated-test shape. **Do not introduce a new test harness (mocking Prisma, mocking fetch) as a stealth scope addition** — that would be a meaningful convention change beyond this phase's boundary. Verification for HIST-01/02/03 should be manual/checkpoint-based (see below), consistent with how this codebase has always verified route-level and transactional behavior (per Phase 16's `retro-filter-cleanup.mts` dry-run-then-human-approve pattern).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | Grading a card writes exactly one `ReviewLog` row with correct fields | manual (DB inspection via `turso db shell` or local sqlite) | N/A — no automated harness for this route in this project's conventions | ❌ no gap to fill — out of pattern for this codebase |
| HIST-02 | A duplicate request (same idempotency key) does not create a second row or mutate `CardReview` twice | manual (`curl`/two sequential `POST /api/review` calls with the same body, inspect `reps`/row count before and after) | N/A | ❌ same as above |
| HIST-03 | Triggering undo mid-retry prevents a subsequent attempt from re-applying the rating | manual (throttle network in devtools, grade a card, immediately undo, watch Network tab / DB state for ~10s after) | N/A | ❌ same as above |

### Sampling Rate
- **Per task commit:** `npm run lint` (must stay clean — purity rule on the new key/controller generation) + `npm test` (existing pure-function suite must still pass; nothing new to add there)
- **Per wave merge:** Manual verification pass per the three checkpoints above
- **Phase gate:** All three Success Criteria manually verified against a real (or local dev) Turso DB before `/gsd-verify-work`

### Wave 0 Gaps
- None in the automated-test sense (this project intentionally has no API/DB test harness).
- Recommend the plan include explicit `checkpoint:human-verify` tasks for HIST-01/02/03 manual verification, since no automated test can cover them under this project's established conventions.

*(No lib-level pure-function gap: unlike prior phases, this one has almost no pure-function surface to unit-test — the FSRS computation itself (`reviewCard()`) is unchanged and already covered indirectly by existing usage; the new logic is transaction/P2002/retry-timing behavior that is inherently integration-shaped.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged) | Existing single-shared-password HMAC cookie gate (`middleware.ts`) already covers `/api/review`; no new auth surface introduced |
| V3 Session Management | No (unchanged) | Same as above |
| V4 Access Control | No (unchanged) | Single-tenant app, no per-user resource scoping needed |
| V5 Input Validation | Yes | Validate `idempotencyKey` is present, a non-empty string, and within a sane length bound (e.g., ≤ 100 chars) before it reaches `prisma.reviewLog.create` — matching the existing `WR-05`-style validation idiom already in `app/api/review/route.ts` for `cardId`/`rating`. Reject with 400 before any DB call on malformed input. |
| V11 Business Logic | Yes | The idempotency-key + unique-constraint + transaction pattern IS the business-logic-integrity control this phase implements — no additional library needed (Prisma's DB-level unique constraint is the standard, correct control for this exact problem, not a custom in-memory dedup cache which would not survive serverless cold starts or multiple instances) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Replay of a lost-response retry double-applying a state mutation | Tampering (unintended data corruption, not malicious in this app's threat model but same mechanism) | Idempotency key + DB unique constraint + atomic transaction (this phase's core deliverable) |
| Stale background write re-applying after a user-initiated undo | Tampering | Client-side `AbortController` cancellation scoped to the specific review being undone (this phase's core deliverable) |
| Idempotency key guessing / forgery to suppress a legitimate review write | Denial of Service (low severity here) | Not a meaningful threat in this single-shared-password personal app — the key is generated client-side by the same trusted client that would otherwise send the real request; no attacker model where a third party controls the key without already having full API access behind the auth gate |
| Overly long/malformed `idempotencyKey` causing unbounded storage growth | Denial of Service | V5 input validation (length bound) as noted above |

## Sources

### Primary (HIGH confidence)
- `app/api/cards/[id]/route.ts` (this repo) — proven array-form `$transaction([...])` pattern + P2002 catch-and-friendly-response idiom
- `components/StudySession.tsx` (this repo) — existing `postReviewWithRetry`/`submitReview`/`handleUndo`/`undoRef` implementation being extended
- `scripts/apply-sentence-ddl.mjs`, `scripts/apply-graph-ddl.mjs` (this repo) — established one-time idempotent Turso DDL script template
- `prisma/schema.prisma` (this repo) — exact `CardReview` field set mirrored by `ReviewLog` (D-01)
- `lib/prisma.ts` (this repo) — confirms `PrismaLibSql` adapter usage, no `previewFeatures` flag needed

### Secondary (MEDIUM confidence)
- [Prisma "Upgrade to Prisma ORM 7" guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) — confirms `queryCompiler`/driver-adapters are default/required in v7, matches this project's generator config
- [Prisma issue #27529 — queryCompiler array transaction misreported error + partial commit](https://github.com/prisma/prisma/issues/27529) — historical regression, version 6.10.1, `queryCompiler` preview; informs Common Pitfall #2's manual-verification recommendation
- [Prisma issue #27901 — queryCompiler transaction failures under load](https://github.com/prisma/prisma/issues/27901) — PostgreSQL/`adapter-pg`-specific, concurrent-load scenario; not directly applicable to this project's SQLite/libsql + low-concurrency single-user context, included for completeness
- [Prisma issue #28953 — P2002 missing meta.target in Prisma 7.x](https://github.com/prisma/prisma/issues/28953) — informs Common Pitfall #3 (why this project doesn't need to inspect `meta.target`)

### Tertiary (LOW confidence)
- None — all findings above were either verified directly against this repo's code or cited against official Prisma documentation/issue tracker.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every mechanism has an in-repo precedent
- Architecture: HIGH — the transaction/P2002/cancellation patterns compose directly from code already running in production in this exact codebase
- Pitfalls: MEDIUM-HIGH — the queryCompiler historical regression (Pitfall 2) is real but not confirmed to reproduce on this project's exact versions; mitigated with an explicit manual-verification recommendation rather than treated as a blocking unknown

**Research date:** 2026-07-04
**Valid until:** 30 days (Prisma major-version ecosystem; stable schema/transaction semantics, not a fast-moving dependency for this project)
</content>
