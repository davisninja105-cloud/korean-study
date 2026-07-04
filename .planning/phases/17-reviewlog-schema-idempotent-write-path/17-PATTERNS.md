# Phase 17: ReviewLog Schema & Idempotent Write Path - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 4 (1 new script, 1 schema addition, 1 modified route, 1 modified client component)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `prisma/schema.prisma` (add `model ReviewLog` + `Card.reviewLogs[]`) | model | CRUD (append-only insert) | `model CardReview` (same file, lines 70-83) | exact — field-for-field mirror per D-01 |
| `scripts/apply-reviewlog-ddl.mjs` (new) | migration/utility | file-I/O (one-time DDL) | `scripts/apply-sentence-ddl.mjs` | exact — identical structure/template |
| `app/api/review/route.ts` (modify `POST`) | controller (API route) | request-response (idempotent transactional write) | `app/api/cards/[id]/route.ts` `PUT` handler (lines 8-105) | exact — same array-form `$transaction` + P2002-catch idiom, same file's own current shape is the "before" state |
| `components/StudySession.tsx` (modify `postReviewWithRetry`, `submitReview`, `handleUndo`, `undoRef`) | hook/utility (client retry + cancellation logic) | event-driven (retry loop + abort-on-undo) | same file, current `postReviewWithRetry` (lines 106-140), `submitReview` (lines 441-559), `handleUndo` (lines 566-589+) | exact — in-place extension, not a new analog needed |

## Pattern Assignments

### `prisma/schema.prisma` (model, CRUD)

**Analog:** `model CardReview` (lines 70-83) + `model CardDependency` (lines 88+, for FK/index-comment conventions)

**Core pattern to mirror** (`CardReview`, lines 70-83):
```prisma
model CardReview {
  id            String    @id @default(cuid())
  cardId        String    @unique
  card          Card      @relation(fields: [cardId], references: [id], onDelete: Cascade)
  state         Int       @default(0)    // 0=New, 1=Learning, 2=Review, 3=Relearning
  stability     Float     @default(0)
  difficulty    Float     @default(0)
  elapsedDays   Int       @default(0)
  scheduledDays Int       @default(0)
  reps          Int       @default(0)
  lapses        Int       @default(0)
  nextReview    DateTime  @default(now())
  lastReview    DateTime?
}
```

**Target shape** (from RESEARCH.md Code Examples, already vetted against D-01/D-02 and this codebase's FK/index conventions):
```prisma
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
Add reverse relation to `model Card`: `reviewLogs ReviewLog[]`

**Notes:** Unlike `CardReview` (one row per card, `cardId @unique`), `ReviewLog` is append-only (`cardId` NOT unique — many rows per card), uniqueness instead enforced on `idempotencyKey`. Cascade-on-delete FK matches every other per-card child table (`Sentence`, `CardReview`, `CardDependency`) — confirmed convention, no deviation needed (RESEARCH.md Open Question #2 resolved in favor of consistency).

---

### `scripts/apply-reviewlog-ddl.mjs` (migration, file-I/O)

**Analog:** `scripts/apply-sentence-ddl.mjs` (full file, 61 lines) — copy verbatim structure, swap table name/columns.

**Full template to copy** (env loading, connect, `executeMultiple`, verify-count, done):
```javascript
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// Load .env manually (no dotenv dep needed)
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

**Header comment convention** (from `apply-sentence-ddl.mjs` lines 1-9) — mirror it:
```javascript
/**
 * One-time DDL: creates the ReviewLog table in Turso.
 * Run ONCE after editing prisma/schema.prisma and running `npx prisma generate`.
 *
 * Usage:
 *   node scripts/apply-reviewlog-ddl.mjs
 *
 * DO NOT re-run — it is idempotent (skips on "already exists") but unnecessary.
 */
```

---

### `app/api/review/route.ts` (controller, request-response)

**Analog:** `app/api/cards/[id]/route.ts` `PUT` handler (lines 8-105) for the transaction + P2002 idiom; this file's own current `POST` (lines 1-73) for everything else (must stay unchanged in shape).

**Current file in full** (this is the "before" — every existing validation/error-shape convention below MUST be preserved):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reviewCard, type Grade } from '@/lib/fsrs'

function isGrade(n: unknown): n is Grade {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4
}

export async function POST(req: NextRequest) {
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { cardId, rating } = body ?? {}

  if (cardId === undefined || rating === undefined) {
    return NextResponse.json({ error: 'cardId and rating required' }, { status: 400 })
  }
  if (typeof cardId !== 'string' || cardId === '') {
    return NextResponse.json({ error: 'cardId must be a non-empty string' }, { status: 400 })
  }
  if (!isGrade(rating)) {
    return NextResponse.json({ error: 'rating must be one of 1, 2, 3, 4' }, { status: 400 })
  }

  try {
    const cardReview = await prisma.cardReview.findUnique({ where: { cardId } })
    if (!cardReview) {
      return NextResponse.json({ error: 'Card review not found' }, { status: 404 })
    }
    const updated = reviewCard(cardReview, rating)
    const review = await prisma.cardReview.update({ where: { cardId }, data: updated })
    return NextResponse.json(review)
  } catch (e) {
    console.error('POST /api/review failed:', e)
    return NextResponse.json({ error: 'Failed to record review' }, { status: 500 })
  }
}
```

**Import to add** (matches `app/api/cards/[id]/route.ts` line 4):
```typescript
import { Prisma } from '@/app/generated/prisma/client'
```

**New validation to add** (V5, matching the existing `WR-05`-style idiom at lines 34-36 of this same file):
```typescript
if (typeof idempotencyKey !== 'string' || idempotencyKey === '' || idempotencyKey.length > 100) {
  return NextResponse.json({ error: 'idempotencyKey must be a non-empty string (max 100 chars)' }, { status: 400 })
}
```

**Transaction + P2002-as-success pattern to replace the current update call with** (adapted from `app/api/cards/[id]/route.ts` lines 78-79 array-transaction usage + lines 93-98 P2002 catch idiom):
```typescript
try {
  const [review] = await prisma.$transaction([
    prisma.cardReview.update({ where: { cardId }, data: updated }),
    prisma.reviewLog.create({
      data: { cardId, rating, idempotencyKey, ...updated },
    }),
  ])
  return NextResponse.json(review)
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    // Idempotent replay: a ReviewLog with this key already exists — the whole
    // array-form transaction rolled back (CardReview.update did NOT re-apply),
    // so report the current, already-correct state as success (not an error).
    const current = await prisma.cardReview.findUnique({ where: { cardId } })
    return NextResponse.json(current)
  }
  console.error('POST /api/review failed:', e)
  return NextResponse.json({ error: 'Failed to record review' }, { status: 500 })
}
```

**Error handling pattern (unchanged convention):** 400 for bad input before any DB call, generic 500 with server-only `console.error`, never leak raw error to client (T-13-02 disclosure posture, same as `app/api/cards/[id]/route.ts` lines 99-101).

---

### `components/StudySession.tsx` (hook/utility, event-driven)

**Analog:** itself — this is an in-place extension of existing functions, not a new-file analog lookup.

**Current `postReviewWithRetry`** (lines 106-140) — signature and loop body to extend with `idempotencyKey` param + `cancelSignal` param:
```typescript
async function postReviewWithRetry(
  cardId: string,
  rating: number,
  onExhausted: () => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 8000)
    try {
      const res = await fetch(REVIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, rating }),
        signal: ctrl.signal,
      })
      if (res.ok) return
      if (res.status >= 400 && res.status < 500) break
    } catch {
      // fetch rejected or aborted (timeout)
    } finally {
      clearTimeout(timeoutId)
    }
    if (attempt < 2) {
      await new Promise<void>((resolve) => setTimeout(resolve, backoffMs[attempt]))
    }
  }
  onExhausted()
}
```

**Target shape** (from RESEARCH.md Architecture Pattern 2 — composable cancellation via manual `addEventListener('abort', …)` forwarding, no `AbortSignal.any`):
```typescript
async function postReviewWithRetry(
  cardId: string,
  rating: number,
  idempotencyKey: string,
  cancelSignal: AbortSignal,
  onExhausted: () => void,
): Promise<void> {
  const backoffMs = [500, 1500]
  for (let attempt = 0; attempt < 3; attempt++) {
    if (cancelSignal.aborted) return
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
      if (cancelSignal.aborted) return
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

**Current `undoRef` shape** (lines 194-201) — extend with a `controller` field:
```typescript
const undoRef = useRef<{
  cardId: string
  prevState: object
  prevQueue: StudyItem[]
  prevStats: { reviewed: number; correct: number; incorrect: number }
  prevSeenCount: number
  prevSeenCardIds: Set<string>
} | null>(null)
```
Add: `controller: AbortController` to this interface.

**Current `submitReview` call site** (lines 516-528) — where key + controller must be generated (event-handler flow, purity-safe per Pitfall 5):
```typescript
// Capture undo snapshot BEFORE queue advance (Pitfall 4 — critical ordering).
undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
setCanUndo(true)

void postReviewWithRetry(cardId, rating, () => {
  if (isMountedRef.current) {
    setSaveError("Couldn't save your last review — check your connection.")
  }
})
```
**Target:** generate `const idempotencyKey = crypto.randomUUID()` and `const controller = new AbortController()` right before the `undoRef.current = {...}` assignment; include `controller` in the stored object; pass `idempotencyKey, controller.signal` into `postReviewWithRetry(...)`.

**Current `handleUndo`** (lines 566-589+) — where `.abort()` must be called (HIST-03, before the fetch to `/api/review/undo`):
```typescript
const handleUndo = async () => {
  if (!undoRef.current) return
  const { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds } = undoRef.current
  undoRef.current = null
  setCanUndo(false)

  try {
    const res = await fetch('/api/review/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, prevState }),
    })
    if (!res.ok) throw new Error(`Undo failed: ${res.status}`)
  } catch {
    if (!isMountedRef.current) return
    undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }
    setCanUndo(true)
    return
  }
  // ... (restore queue/stats on success, unchanged)
}
```
**Target:** destructure `controller` too, call `controller.abort()` immediately after `undoRef.current = null` (or right before), before the `fetch('/api/review/undo', ...)` call. On the failure re-arm path (lines 583-588), re-include `controller` in the restored object (do not create a new one — it's already aborted, which is correct: retrying undo does not need to un-abort).

**Error handling / cancellation UX convention:** stays silent — no toast on cancel, matching the existing pattern where `saveError` only surfaces via `onExhausted` (retry exhaustion), never on a routine abort. Confirmed no new UI element needed.

---

## Shared Patterns

### Array-form Prisma transaction + P2002-as-idempotent-success
**Source:** `app/api/cards/[id]/route.ts` lines 78-79 (`await prisma.$transaction([cardUpdate, ...sentenceOps])`) and lines 88-98 (P2002 catch → friendly response instead of 500)
**Apply to:** `app/api/review/route.ts` — this is the ONLY other place in the codebase using array-form `$transaction`; it is the proven-safe pattern against the libSQL adapter and must be reused verbatim in structure (not the callback `$transaction(async tx => ...)` form, which is unproven here).

### Error disclosure posture (T-13-02)
**Source:** `app/api/review/route.ts` lines 66-71 and `app/api/cards/[id]/route.ts` lines 99-103
**Apply to:** All API route error handling in this phase — log full error server-side via `console.error`, return a generic `{ error: '...' }` message to the client, never leak Prisma/schema internals.

### Purity-safe event-handler-only impure calls
**Source:** `components/StudySession.tsx` existing `seed` `useMemo` comment (lines 155-167) establishing the render-purity convention, and the file's header comment on `postReviewWithRetry` (lines 104-105: "Runs from an event-handler flow ... never during render, so the setTimeout usage is purity-safe")
**Apply to:** `crypto.randomUUID()` and `new AbortController()` calls in `submitReview` — must stay inside the function body invoked by click/key handlers, never lifted into `useMemo` or render-time computation (Pitfall 5 in RESEARCH.md).

### One-time idempotent Turso DDL script template
**Source:** `scripts/apply-sentence-ddl.mjs` (full file) and `scripts/apply-graph-ddl.mjs` (same template, second precedent)
**Apply to:** `scripts/apply-reviewlog-ddl.mjs` — env-loading boilerplate, `executeMultiple` with `CREATE TABLE IF NOT EXISTS`, verify row count, `Done.` log line.

## No Analog Found

None — every file in this phase has a strong (exact-match) analog already identified above.

## Metadata

**Analog search scope:** `app/api/review/`, `app/api/cards/[id]/`, `components/StudySession.tsx`, `scripts/`, `prisma/schema.prisma` — all read directly (no broad Glob/Grep sweep needed; RESEARCH.md and CONTEXT.md already named every relevant file and line range).
**Files scanned:** 5 (`app/api/review/route.ts`, `app/api/cards/[id]/route.ts`, `components/StudySession.tsx`, `scripts/apply-sentence-ddl.mjs`, `prisma/schema.prisma`)
**Pattern extraction date:** 2026-07-04
