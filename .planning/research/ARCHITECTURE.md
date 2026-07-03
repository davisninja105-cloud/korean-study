# Architecture Research

**Domain:** Integration architecture for 3 new v1.4 features into an existing Next.js 16 App Router app (Korean Study)
**Researched:** 2026-07-02
**Confidence:** HIGH (codebase-grounded; one external pattern — Vercel Cron auth — is MEDIUM, cross-verified against official docs)

This file supersedes the stale 2026-06-29 ARCHITECTURE.md (that one documented the RSC/client-shell conversion from v1.2 — a different milestone). It is scoped only to the 3 target features: cron-triggered sync, `ReviewLog` history, and a deterministic `components[]` post-extraction filter.

---

## Standard Architecture

### System Overview — where the 3 features attach

```
┌────────────────────────────────────────────────────────────────────────────┐
│ FEATURE 1: Cron-triggered sync                                             │
│                                                                              │
│  Vercel Cron (vercel.json "crons")                                         │
│       │ GET, once/day, Authorization: Bearer $CRON_SECRET  (auto-injected) │
│       ▼                                                                     │
│  middleware.ts  ── NEW: bearer-token branch for /api/cron/*                │
│       │ (bypasses the cookie check; still fails closed if no match)        │
│       ▼                                                                     │
│  app/api/cron/sync/route.ts  (NEW — GET handler)                           │
│       │ reads NEXT_PUBLIC_GOOGLE_DOC_ID server-side (no client body)       │
│       ▼                                                                     │
│  lib/sync.ts :: runSync(documentId)   (NEW — extracted from route body)    │
│       │ same code POST /api/sync already runs                              │
│       ▼                                                                     │
│  lib/google-docs.ts → lib/extract-cards.ts (+ FEATURE 3 filter) → prisma   │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ FEATURE 3: Deterministic components[] filter (runs inside the same path)   │
│                                                                              │
│  lib/extract-cards.ts :: extractCardsFromNotes()                           │
│       │ Claude returns cards with raw components[]                         │
│       ▼                                                                     │
│  lib/filter-components.ts :: filterHallucinatedComponents()  (NEW, pure)   │
│       │ drops components[] entries not attested in this card's own         │
│       │ sentences[].korean / notes text                                    │
│       ▼                                                                     │
│  returned ExtractedCard[] — sync route persists the FILTERED components    │
│  (both POST /api/sync and the new cron path go through the same function, │
│   so no duplication)                                                       │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ FEATURE 2: ReviewLog                                                       │
│                                                                              │
│  components/StudySession.tsx :: submitReview()  (UNCHANGED shape)          │
│       │ optimistic local FSRS compute → setQueue immediately               │
│       │ void postReviewWithRetry(cardId, rating, onExhausted)  (fire-and-  │
│       │ forget, bounded 3-attempt retry — UNCHANGED)                       │
│       ▼                                                                    │
│  app/api/review/route.ts  POST  (MODIFIED — same try/catch, same request)  │
│       │ prisma.$transaction([                                              │
│       │   cardReview.update(...),        ← existing write                 │
│       │   reviewLog.create({ cardId, rating, ...newFsrsFields }),  ← NEW   │
│       │ ])                                                                 │
│       ▼                                                                    │
│  ReviewLog row persisted — immutable, append-only                          │
│                                                                              │
│  app/api/review/undo/route.ts  POST  (UNCHANGED — does NOT touch ReviewLog)│
│       │ reverts CardReview to prevState only, exactly as today             │
│       ▼                                                                    │
│  ReviewLog is a history/audit trail, not a mirror of current FSRS state —  │
│  an undone review still appears in history (documented, not a bug)         │
│                                                                              │
│  app/history/page.tsx (NEW, RSC) → components/HistoryClient.tsx (NEW)      │
│       │ same RSC + DTO pattern as /cards, /study, /, /habits               │
│       ▼                                                                    │
│  lib/dto.ts :: ReviewLogDTO  (NEW — .toISOString() timestamp)              │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | New / Modified | Responsibility |
|-----------|-----------------|-----------------|
| `prisma/schema.prisma` | Modified | Add `ReviewLog` model. Applied to Turso via hand-written DDL (`prisma migrate diff --from-empty --to-schema … --script`, then `executeMultiple()`), **not** `prisma db push` |
| `scripts/apply-reviewlog-ddl.mjs` | New | One-time DDL script, same shape as `apply-graph-ddl.mjs` / `apply-sentence-ddl.mjs` |
| `lib/sync.ts` | New | `runSync(documentId): Promise<SyncResult>` — the entire body currently inline in `app/api/sync/route.ts` (lines 21–283), extracted so both the manual route and the cron route call one function. Follows the existing `lib/study-cards.ts` / `lib/dashboard.ts` "shared pipeline module" convention already established in v1.2 |
| `app/api/sync/route.ts` | Modified | Thin POST handler: parse `documentId` from body → `runSync(documentId)` → return JSON. No behavior change from the user's perspective |
| `app/api/cron/sync/route.ts` | New | GET handler for Vercel Cron. Reads `documentId` from `process.env.NEXT_PUBLIC_GOOGLE_DOC_ID` server-side (no request body — cron requests carry no payload). Calls the same `runSync()`. `maxDuration = 300` (already ineffective on Hobby but keep for consistency/documentation, matches existing sync route comment) |
| `middleware.ts` | Modified | Add a branch: if `pathname.startsWith('/api/cron/')`, check `Authorization === 'Bearer ' + process.env.CRON_SECRET` and allow/401 — independent of the cookie check. Everything else unchanged. Route stays inside the matcher (do **not** add it to the public-path regex — that would let anyone hit it unauthenticated) |
| `vercel.json` | New | `{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 8 * * *" }] }` (or similar once-daily cron expression) |
| `lib/extract-cards.ts` | Modified | After building the normalized `ExtractedCard[]` return value (the existing `.map()` at the bottom), call the new filter on each card's `components` before returning |
| `lib/filter-components.ts` | New | `filterHallucinatedComponents(components: string[], sentences: {korean:string}[], notes: string \| undefined): string[]` — pure function, no Prisma/Anthropic import. Deterministic post-check: keep a component only if it (or a normalized/substring match) is attested in the card's own sentence text or notes. Named/shaped like the project's existing pure single-source-of-truth modules (`lib/sentence-match.ts`, `lib/known-words.ts`, `lib/sequence.ts`) |
| `app/api/review/route.ts` | Modified | Wrap `cardReview.update` + new `reviewLog.create` in `prisma.$transaction([...])` inside the existing try/catch. No new route, no new latency added to the client (already fire-and-forget) |
| `app/api/review/undo/route.ts` | Not modified (decision, see below) | Continues to revert `CardReview` only. `ReviewLog` is treated as an immutable audit trail — an undone review still shows in history. Flag this as an explicit product decision to confirm at roadmap/requirements time, not a gap to silently fix |
| `lib/dto.ts` | Modified | Add `ReviewLogDTO` (timestamp fields as ISO strings, per RSC-05 DTO contract) |
| `app/history/page.tsx` + `components/HistoryClient.tsx` | New | Same RSC + client-shell + DTO pattern as every other main route: thin async server component fetches via a new `lib/review-log.ts:getReviewLog()` helper, renders one client shell |

---

## Architectural Patterns

### Pattern 1: Cron auth via middleware bearer-token branch (not a route-level check)

**What:** Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when `CRON_SECRET` is set as a project env var. Vercel does **not** bypass app-level auth for you — the app must check this header itself. Given `middleware.ts` already gates every path except an explicit allowlist, the correct integration point is `middleware.ts`, not a check duplicated inside `app/api/cron/sync/route.ts`. This keeps the single existing choke point (middleware) as the sole source of auth truth, matching the codebase's existing single-shared-password gate design (`lib/auth.ts` + `middleware.ts`).

**When to use:** Any future cron/webhook route that must run without the shared-password cookie.

**Trade-offs:** A route-level check (inside the handler) would also work and is what most Vercel Cron tutorials show, but this project already centralizes all auth in middleware — adding a second auth mechanism inside individual route handlers would fragment that. Extending middleware keeps one source of truth and makes future cron/webhook routes a one-line addition to the same branch.

**Example (illustrative, not final code):**
```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/cron/')) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${process.env.CRON_SECRET}`) return NextResponse.next()
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... existing cookie check, unchanged
}

export const config = {
  matcher: [
    '/((?!login|api/login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-icon.*\\.png).*)',
  ],
}
```
`/api/cron/sync` stays **inside** the matcher (it is not added to the exclusion regex) — the new branch inside the middleware body is what grants it access, not a matcher exclusion. This is the important distinction: excluding it from the matcher would make it public to anyone, not just Vercel.

**Confidence: MEDIUM** (cross-verified via WebSearch against Vercel's own cron-jobs docs and multiple independent tutorials; not read directly from the primary Vercel docs page in this session).

### Pattern 2: `lib/sync.ts` extraction — reuse the existing "shared pipeline module" convention

**What:** v1.2 already established the exact template needed here: `lib/study-cards.ts:getStudyCards()` and `lib/dashboard.ts:getStats()/getActivityData()` were extracted from inline API-route logic specifically so two different call sites (an RSC page and a legacy API route) share one implementation. The cron route is architecturally identical to that problem — two call sites (`POST /api/sync` and `GET /api/cron/sync`) need the exact same sync logic, differing only in how they obtain `documentId` and how they're authenticated.

**When to use:** Any time a second caller needs logic currently inlined in a single route handler.

**Trade-offs:** None significant — this is a pure refactor extraction, zero behavior change, and it's the path of least resistance given the file already reads cleanly top-to-bottom as one function body.

**Example:**
```typescript
// lib/sync.ts
export async function runSync(documentId: string): Promise<SyncResult> {
  // exact current body of app/api/sync/route.ts's try block
}

// app/api/sync/route.ts
export async function POST(req: NextRequest) {
  const { documentId } = await req.json()
  if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  return NextResponse.json(await runSync(documentId))
}

// app/api/cron/sync/route.ts
export const maxDuration = 300
export async function GET() {
  const documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? ''
  if (!documentId) return NextResponse.json({ error: 'documentId not configured' }, { status: 500 })
  return NextResponse.json(await runSync(documentId))
}
```
Note: middleware already rejects the request before this handler runs if the bearer token is wrong, so the handler itself needs no auth logic — consistent with how every other authenticated route in this app currently works (auth lives entirely in middleware, never duplicated in route bodies).

### Pattern 3: ReviewLog write — same transaction, same request, no new latency

**What:** `POST /api/review` is already fire-and-forget from the client's perspective (`void postReviewWithRetry(...)`, never awaited, UI already advanced optimistically). This means the *server-side* request can safely take a few extra milliseconds for a second insert — that cost is invisible to the user. The only real risk is **not** latency but **atomicity**: if `cardReview.update` succeeds but `reviewLog.create` fails (or vice versa), the client's bounded retry (`postReviewWithRetry`, 3 attempts on network/5xx) would re-run `reviewCard()` against an *already-advanced* `CardReview` row, silently double-applying the FSRS update. Wrapping both writes in `prisma.$transaction([...])` makes the pair atomic — either both land or neither does, so a retry after a transaction failure re-runs cleanly from the pre-update state, matching the existing retry contract's implicit assumption.

**When to use:** Whenever two dependent writes must succeed or fail together, especially under retry semantics.

**Trade-offs:** `$transaction([...])` (the array/batch form, not the interactive callback form) is sufficient here since both operations are simple non-interdependent writes computed *before* the transaction call (the FSRS `updated` object is computed synchronously via `reviewCard()` before any DB write, exactly as today) — no need for the slower interactive `$transaction(async tx => …)` form.

**Note on the retry double-write edge case (flag, not fix):** Even with the transaction, if the transaction *succeeds* server-side but the HTTP response is lost in flight (client times out at 8s and retries), the retry will still re-run `reviewCard()` on the now-already-advanced row and create a *second* legitimate-looking `ReviewLog` row + double-advance FSRS state. This is a pre-existing risk in the FSRS-state sense (present before this milestone) — this feature just makes it visible for the first time as a duplicate history row. Not blocking, but worth a one-line callout in the phase's UAT/verification (e.g., "confirm no visible duplicate rows after simulating a slow-network retry") rather than silently assuming the transaction alone solves it.

**Example:**
```typescript
// app/api/review/route.ts — inside the existing try block
const updated = reviewCard(cardReview, rating)

const [review] = await prisma.$transaction([
  prisma.cardReview.update({ where: { cardId }, data: updated }),
  prisma.reviewLog.create({
    data: {
      cardId,
      rating,
      state: updated.state,
      stability: updated.stability,
      difficulty: updated.difficulty,
      reviewedAt: new Date(),
    },
  }),
])

return NextResponse.json(review)
```

### Pattern 4: Filter as a pure `lib/` module, invoked from `lib/extract-cards.ts` — not inline in the route

**What:** The codebase has a strict, repeatedly-stated convention: pure business logic lives in `lib/`, is unit-testable without Prisma/network, and is the single source of truth reused across call sites (`lib/sentence-match.ts`, `lib/known-words.ts`, `lib/sequence.ts`, `lib/card-key.ts` are the direct precedents). `lib/extract-cards.ts` already has a defensive normalization pass at the very end of `extractCardsFromNotes()` (the `parsed.map((c) => {...})` block, lines 204–240) that cleans `components` (dedup, self-exclusion, empty-string filtering). The new deterministic filter is one more step in that same pipeline — call it from inside that `.map()`, but keep its logic in its own file so it's independently unit-testable and reusable if `scripts/local-resync.mts` or `scripts/relink-dependencies.mjs` ever need the same check.

**When to use:** Any deterministic, non-LLM validation/cleanup step on LLM output.

**Trade-offs:** Putting it inline inside `extract-cards.ts` (rather than a separate file) would also work and would avoid one import, but breaks the project's established "single source of truth, unit-tested pure module" pattern and would be harder to test in isolation (the file already does `Anthropic` API calls at module scope — importing it in a test file triggers `new Anthropic()` construction unless carefully mocked). A separate pure file avoids that entirely.

**Example:**
```typescript
// lib/filter-components.ts — pure, no Prisma/Anthropic imports
export function filterHallucinatedComponents(
  components: string[],
  sentences: { korean: string }[],
  notes: string | undefined,
): string[] {
  const haystack = [...sentences.map((s) => s.korean), notes ?? ''].join(' ')
  return components.filter((c) => haystack.includes(c))
}

// lib/extract-cards.ts — inside the existing return parsed.map(...) block
const rawComponents = /* existing dedup/self-exclusion logic, unchanged */
const components = filterHallucinatedComponents(rawComponents, sentencesForThisCard, c.notes)
```
Exact matching rule (substring vs. normalized/stemmed match) is an open design question for the phase plan — see Gaps below.

---

## Data Flow

### Cron sync flow (Feature 1)

```
Vercel Cron scheduler (daily)
    ↓ GET /api/cron/sync, Authorization: Bearer $CRON_SECRET
middleware.ts (bearer-token branch, NEW)
    ↓ pass
app/api/cron/sync/route.ts (NEW)
    ↓ documentId = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID
lib/sync.ts :: runSync(documentId) (NEW — extracted, shared with POST /api/sync)
    ↓
lib/google-docs.ts → lib/extract-cards.ts (incl. Feature 3 filter) → prisma upserts
    ↓
JSON result (same shape SyncPanel already parses) — no UI consumes this cron response directly;
logged server-side (Vercel function logs) for now. A future "last synced" surface is out of
scope for this milestone unless added as a requirement.
```

### Review + log flow (Feature 2)

```
User taps grade button (StudySession.tsx)
    ↓ synchronous: reviewCard() computed client-side, setQueue() advances immediately (UNCHANGED)
    ↓ void postReviewWithRetry(cardId, rating, onExhausted)  — fire-and-forget (UNCHANGED)
POST /api/review (MODIFIED)
    ↓ validate rating (UNCHANGED) → prisma.$transaction([cardReview.update, reviewLog.create]) (NEW pairing)
    ↓ 200 { ...review } — response shape UNCHANGED, client doesn't need to change
      (client never reads the response body beyond res.ok — verify no future coupling needed)

Later — user taps "Undo"
    ↓ POST /api/review/undo — UNCHANGED, reverts CardReview only
    ↓ ReviewLog row from the undone review remains — immutable history (explicit decision)
```

### Filter flow (Feature 3)

```
POST /api/sync or GET /api/cron/sync (both, via lib/sync.ts)
    ↓ extractCardsFromNotes(lessonText, existingFronts, emphasized)
lib/extract-cards.ts
    ↓ Claude returns raw components[] per card
    ↓ existing normalization (dedup, self-exclusion) — UNCHANGED
    ↓ lib/filter-components.ts :: filterHallucinatedComponents() (NEW)
    ↓ returns ExtractedCard[] with FILTERED components
sync route persists card.components as before — no route-level change needed for this feature;
the filter is fully contained inside extract-cards.ts's existing return pipeline
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Excluding `/api/cron/*` from the middleware matcher

**What people do:** Add `api/cron` to the matcher's negative-lookahead regex (alongside `login`, `api/login`) so the route "just works" without touching the auth logic.
**Why it's wrong:** That makes the sync endpoint public to anyone on the internet who finds the URL — no bearer-token check ever runs. The endpoint would silently accept unauthenticated syncs (burns Claude API budget, could be spammed).
**Instead:** Keep `/api/cron/*` inside the matcher; add an explicit bearer-token branch inside the middleware function body that grants access only on a valid `CRON_SECRET` match, exactly as shown in Pattern 1 above.

### Anti-Pattern 2: Writing `ReviewLog` in a separate, unawaited fire-and-forget call from the route

**What people do:** To "avoid slowing down the request," fire the `reviewLog.create()` off in the background inside the route handler (`.catch(() => {})`, not awaited) rather than including it in the transaction.
**Why it's wrong:** `POST /api/review` is already the background call — there's no user-facing latency to protect at this layer. Detaching the log write from the state-update transaction reopens exactly the atomicity problem the transaction is meant to close: the update could succeed while the log silently fails (or vice versa), with no retry coverage for the failed half.
**Instead:** Same transaction, same request — see Pattern 3.

### Anti-Pattern 3: Making the filter LLM-based (a second Claude call) instead of deterministic

**What people do:** Given the milestone description says "Claude self-verification step" as one of three named approaches (prompt tightening / deterministic filter / Claude self-verification), a naive implementation might add a second Claude round-trip to "double check" the components.
**Why it's wrong:** The question you asked scopes this specifically to "a deterministic post-extraction filter" — a second LLM call would add real latency to a sync path that's already budget-constrained (`MAX_LESSONS_PER_SYNC = 1` exists specifically because Opus + exhaustive extraction is already slow, 60–120s/lesson, against a 60s Hobby hard cap). A second Claude call risks pushing a single-lesson sync over the timeout.
**Instead:** Pure substring/normalized-match filter against the card's own already-returned `sentences[]`/`notes` text — zero extra network calls, sub-millisecond, matches the "deterministic" framing in the milestone goal. (Prompt tightening, if pursued, is a separate/complementary change to the prompt string in `lib/extract-cards.ts` and doesn't touch this filter module.)

### Anti-Pattern 4: Inline `prisma.card.findMany()` re-query inside the filter function

**What people do:** Since `components` is meant to eventually resolve against the deck (via `CardDependency`), a tempting "smarter" filter would query the DB to check if a component matches an *existing card's* `normalizedFront`, not just the current card's own sentence text.
**Why it's wrong:** That conflates two different concerns — "is this component text attested anywhere in the card's own example content" (the deterministic hallucination check) vs. "does this component resolve to a real card" (already handled downstream by the sync route's `keyToId` two-phase linking, which correctly tolerates components that don't yet have their own card — see the `lib/extract-cards.ts` docstring: "Include items even if they don't yet have their own card in the deck"). Making the filter DB-aware would also break the "pure, no Prisma" module convention and require passing a Prisma client into `lib/extract-cards.ts`, which currently has zero DB dependency.
**Instead:** Keep the filter scoped purely to "was this string actually used/mentioned in this card's own sentences/notes" — a text-containment check, nothing more. Prerequisite *resolution* (does the component match a real card) stays exactly where it already lives, in the sync route's `keyToId` map.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Vercel Cron | `vercel.json` `crons` array; GET-only; auto-injects `Authorization: Bearer $CRON_SECRET` when that env var is set on the project | Hobby plan: cron jobs run at most once per day at the *start* of the specified hour (exact minute not guaranteed) — matches this milestone's "once daily" scope exactly. Must set `CRON_SECRET` in Vercel project env vars (same place `APP_PASSWORD`/`AUTH_SECRET`/etc. already live) |
| Turso (libSQL) | Schema change via hand-written DDL, NOT `prisma db push`/`migrate` | `ReviewLog` table creation follows the exact documented process in `CLAUDE.md` § Schema changes: edit `schema.prisma` → `npx prisma generate` → `prisma migrate diff --from-empty --to-schema … --script` → apply only the new `CREATE TABLE` via `@libsql/client executeMultiple()`. This is a **hard prerequisite** — no code that writes to `ReviewLog` can be deployed until this DDL is applied |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| `middleware.ts` ↔ `app/api/cron/sync/route.ts` | Header-based auth check happens entirely in middleware; the route trusts that any request reaching it is already authorized (matches how every other route in this app already assumes middleware has gated access) | New branch, not a new pattern |
| `app/api/sync/route.ts` ↔ `app/api/cron/sync/route.ts` | Both call `lib/sync.ts:runSync()` | Single source of truth, per the v1.2-established "shared pipeline module" convention |
| `app/api/review/route.ts` ↔ `app/api/review/undo/route.ts` | No shared code today (undo re-implements its own field-by-field revert rather than calling a shared helper) and this milestone does **not** need to introduce one — undo intentionally does not touch `ReviewLog` | Explicit non-integration — documented so it isn't "discovered" as a gap during execution |
| `lib/extract-cards.ts` ↔ `lib/filter-components.ts` | Direct function call inside the existing normalization `.map()` | New pure module, no new route/API surface |

---

## Build Order (dependency-ordered, for the roadmapper)

1. **`ReviewLog` schema + DDL** (Feature 2, foundation). Nothing in Feature 2 can be built or tested until the table exists on Turso. This is the same "DDL must land before writes" pattern as `apply-graph-ddl.mjs`/`apply-sentence-ddl.mjs` before it. Do this first, in isolation, and verify with a throwaway insert via `@libsql/client` before touching route code.
2. **Feature 3 (components[] filter)** can be built and shipped fully independently of 1 and 2 — it only touches `lib/extract-cards.ts` and a new pure `lib/filter-components.ts`, with no schema dependency. Good candidate to parallelize with step 1, or sequence first since it's the lowest-risk, most self-contained change (pure function, unit-testable, no DB/auth surface).
3. **Feature 2 write path** (transaction in `POST /api/review` + `ReviewLog` writes) — depends on step 1's DDL being live in both dev (`file:./dev.db`) and Turso prod. Confirm the local SQLite dev DB also has the table (schema.prisma + `prisma generate` covers dev automatically; only Turso needs the manual DDL step).
4. **Feature 2 history page** (`app/history/page.tsx` + `HistoryClient.tsx` + `ReviewLogDTO`) — depends on step 3 (needs real rows to display) but is otherwise a standard, low-risk RSC + client-shell addition following the exact pattern of `/habits` (`app/habits/page.tsx` → `HabitsClient.tsx`).
5. **Feature 1 (cron sync)** — depends on `lib/sync.ts` extraction (a pure refactor, can happen any time, zero behavior change, good to land early/independently) plus the new `middleware.ts` branch and `CRON_SECRET` env var provisioning (Vercel dashboard). Not dependent on Features 2 or 3, but **should land after Feature 3** if the goal is "cron syncs never re-introduce the hallucination bug" — otherwise the first unattended cron run could persist unfiltered `components[]` again.

Suggested phase grouping: (a) Feature 3 filter — standalone, lowest risk; (b) `ReviewLog` DDL + write-path + transaction — schema-gated; (c) History page — depends on (b); (d) Cron sync — depends on (a) for correctness, otherwise independent; middleware/env work can start in parallel with (b)/(c).

---

## Gaps to Address (for roadmap/requirements phase, not resolved here)

- **Exact filter matching rule** (`lib/filter-components.ts`): plain substring containment (`haystack.includes(c)`) will miss inflected forms — e.g. a component `가다` (base form) won't literally appear in a sentence using `가요`/`갔어요`. The codebase already has `splitParticle`/stem-fallback logic in `lib/known-words.ts` for a conceptually similar "is this word attested" problem — worth deciding at requirements time whether the filter reuses/adapts that stemming approach or accepts base-form components as a looser pass (e.g., checking `notes` text too, which often contains the base form even when sentences don't). Recommend flagging this as a specific requirement/acceptance-criteria question rather than an implementation default.
- **Undo/ReviewLog interaction is a product decision, not just an implementation detail** — this research recommends "immutable, undo does not touch it" as the lowest-risk default (avoids a new race condition since `postReviewWithRetry` is fire-and-forget and the log row's id is never returned to the client), but confirm this is acceptable UX for the history page (an undone review will still show in history) before locking it into a phase plan.
- **`GET /api/cron/sync` response consumption** — no UI currently displays "last cron sync" status. If the milestone wants visibility into whether the daily cron actually ran (vs. silently failing), that's an additional small feature (e.g., a `Setting` row updated on each cron run, surfaced in Settings ▸ Advanced next to the existing `SyncPanel`) — not currently in the 3 named features but worth surfacing as a question during requirements.
- **`CRON_SECRET` provisioning** is an infra/env step (Vercel dashboard), not code — make sure the phase plan includes it explicitly as a task, not just assumed. Same category as the existing `.env`/Vercel env var list in `CLAUDE.md`.

---

## Sources

- Primary (HIGH confidence — direct code reads this session): `CLAUDE.md`, `.planning/PROJECT.md`, `middleware.ts`, `app/api/sync/route.ts`, `app/api/review/route.ts`, `app/api/review/undo/route.ts`, `lib/extract-cards.ts`, `prisma/schema.prisma`, `components/StudySession.tsx` (submitReview/postReviewWithRetry/handleUndo), `components/SyncPanel.tsx`, `components/HomeClient.tsx`
- Secondary (MEDIUM confidence — WebSearch, verified against official Vercel docs URL + multiple independent tutorials): Vercel Cron Jobs `CRON_SECRET` / `Authorization: Bearer` auto-injection pattern — https://vercel.com/docs/cron-jobs/manage-cron-jobs

---
*Architecture research for: Korean Study v1.4 (cron sync, ReviewLog, components[] filter)*
*Researched: 2026-07-02*
