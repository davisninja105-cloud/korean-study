# Phase 18: Review History Page - Research

**Researched:** 2026-07-04
**Domain:** Prisma cursor pagination (Turso/libSQL) + React IntersectionObserver infinite scroll, inside an established RSC+DTO+client-shell Next.js 16 app
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Each history row shows the grade name plus the resulting mastery-language phrase, e.g. "Good — Memory strengthening → 3d" — not a raw 1-4 integer. Compute this by calling `masteryPhrase(nextReview, createdAt)` from `lib/fsrs.ts`, using the `ReviewLog` row's own `createdAt` as "now" and its `nextReview` as "due". **`masteryPhrase` is currently unexported (module-private) — it must be exported** for this to work; it's the same function `previewIntervalLabels` already uses internally, so no logic duplication. Grade name (Again/Hard/Good/Easy) comes from `ReviewLog.rating` (1-4) via the same mapping the grade buttons use in `StudySession.tsx`/`FlashcardMode.tsx`.
- **D-02:** Rows with weak grades (Again/Hard) get distinct color treatment (existing semantic tokens — no literal `orange-*`/`red-*` utilities per CLAUDE.md's color-system convention) so struggling cards visually stand out in the feed. Good/Easy stay neutral.
- **D-03:** Rows do NOT show the resulting FSRS state (New/Learning/Review/Relearning) as a separate badge — grade + mastery phrase is enough detail; keep rows compact.
- **D-04:** Rows auto-load on scroll via an `IntersectionObserver` sentinel at the end of the list (no existing infinite-scroll precedent in this codebase — this phase establishes the pattern). No explicit "Load more" button.
- **D-05:** New dedicated route `GET /api/reviews?cursor=&cardId=` — cursor is the last-seen row's `id`, ordered `createdAt DESC` with `id DESC` as a tiebreak for stable ordering under same-timestamp writes. Follows the RSC+DTO precedent already used for `/habits`/`/study`: a shared server-only `lib/` function (e.g. `lib/review-history.ts`) backs both the RSC first-page fetch in `app/history/page.tsx` and this route for subsequent-page fetches — mirrors `lib/study-cards.ts:getStudyCards()`.
- **D-06:** The history view is reachable from the **Habits page** (`components/HabitsClient.tsx`), NOT Settings/`/wrapped`/CardEditor.
- **D-07:** A new aggregated-stats section is added to the Habits page showing a **breakdown of cards by FSRS state** (New / Learning / Review / Relearning counts). Backing query: a new `prisma.cardReview.groupBy({ by: ['state'], _count: true })` in `lib/dashboard.ts`, mirroring the existing `cardsByType` groupBy already there in `getStats()`. This extends `StatsDTO` with the state-breakdown counts.
- **D-08:** The entire stats section is one tappable `Link` to `/history` (mirrors the whole-card-wrapped-in-a-`Link` pattern). No per-state filter links.
- **D-09:** `app/history/page.tsx` is a standalone RSC route: thin async server component + `components/HistoryClient.tsx` + a new `ReviewLogDTO` in `lib/dto.ts`, following the same shape as `/habits`. Supports `?cardId=` for deep-linking into a pre-filtered view.
- **D-10:** A "View history" link is added inside `components/CardEditor.tsx` that opens `/history?cardId={card.id}`, pre-filtered to that card. No separate card search/picker UI on the history page itself.
- **D-11:** While filtered to one card, an "All cards" chip/pill is shown near the top of the list with an `×` to clear the filter — matches the existing `LessonRangeFilter` chip convention.

### Claude's Discretion

- Exact visual styling of the color-coded grade rows (D-02) — which semantic tokens map to which grades — is left to implementation, as long as literal Tailwind color utilities are avoided.
- Whether `ReviewLogDTO` needs to embed card front/type/lesson info per row (for display) or the client fetches/looks up card metadata separately — planner/researcher to determine the cheapest join shape given the "~10-25 rows/page" scale.
- Exact page size within the "~20-30 per page" range from Success Criterion 1.

### Deferred Ideas (OUT OF SCOPE)

None beyond the reviewed-but-not-folded todo (`fix-spurious-components-in-card-extraction.md`, already shipped in Phase 16). Per-state filter links from the Habits stats section (tapping "Relearning: 6" → a state-filtered history view) was considered and explicitly rejected in favor of D-08's simpler whole-section link; would need `/history` to support a `state` query param, out of scope for HIST-05 (single-card filter only).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIST-04 | User can view a reverse-chronological, cursor-paginated history of their reviews (~20-30/page), reachable from an existing surface | Prisma compound-cursor pagination pattern (Architecture Patterns → Pattern 1); IntersectionObserver infinite-scroll pattern (Pattern 2); D-06/D-08 entry point via Habits page |
| HIST-05 | User can filter the history view down to a single card | `?cardId=` query param plumbed through `lib/review-history.ts` → `GET /api/reviews?cardId=`; D-10/D-11 UX |
| HIST-06 | Undone reviews remain visible in history, unmarked — `ReviewLog` is append-only and never mutated by undo | Verified: `/api/review/undo/route.ts` and `POST /api/review`'s retry path never touch `ReviewLog` rows after creation; the history query is a pure read with no undo-awareness needed — nothing to build, just don't add any |
| HIST-07 | History page follows the RSC + DTO + client-shell hydration pattern (real data on first paint, no loading flash) | Direct structural clone of `app/habits/page.tsx` + `components/HabitsClient.tsx` (Architecture Patterns → Recommended Project Structure) |
</phase_requirements>

## Summary

This phase is a straightforward structural clone of the existing `/habits` RSC+DTO+client-shell pattern, applied to `ReviewLog` rows, plus two mechanisms genuinely new to this codebase: **cursor-based pagination** and **IntersectionObserver-driven infinite scroll**. Both are well-documented, low-risk patterns with no Turso/libSQL-specific gotchas — the project's existing `lib/dashboard.ts` already runs a `groupBy` against the same Turso-backed Prisma client without incident, and Turso's only documented libSQL limitation is at the **schema/migration** layer (already known and irrelevant here — this phase does zero schema changes).

The one genuine risk is not technical but a **contradiction between two already-authored planning documents**: CONTEXT.md's D-02 explicitly forbids literal `orange-*` utilities ("existing semantic tokens — no literal `orange-*`/`red-*` utilities"), but UI-SPEC.md's Color section then prescribes literal `orange-50`/`orange-600` classes for the "Hard" grade row, and its own justification ("reuses the exact literal tokens `FlashcardMode.tsx` already established for its grade buttons") is **factually wrong** — `FlashcardMode.tsx`'s actual "Hard" button is neutral (`bg-surface-3 text-muted`), not orange, and no orange token or literal exists anywhere in the codebase today. This is flagged in detail below (Common Pitfalls #1) with a recommended resolution using the codebase's actual existing amber-warning precedent (`CardEditor.tsx`) instead of inventing a new color.

**Primary recommendation:** Build `lib/review-history.ts:getReviewHistory({ cardId, cursor, take })` mirroring `getStudyCards()`'s shape exactly — a Prisma query with `cursor: { id }`, `skip: 1` (when a cursor is present), `take`, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`, and `include: { card: { select: { id, front, type } } }` for the join — backing both `app/history/page.tsx` (first page, no cursor) and `GET /api/reviews` (subsequent pages). Use `Rating[log.rating]` and `State[groupRow.state]` (both already-exported numeric TS enums from `lib/fsrs.ts`/`ts-fsrs`) instead of hand-rolled label lookup tables.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| First-page review history fetch (SSR) | API / Backend (`lib/review-history.ts` via Prisma) | Frontend Server (SSR) — `app/history/page.tsx` calls it directly | Same RSC-hydration pattern as `/habits`; data must be present in the initial HTML, so the query runs server-side inside the RSC page, not via a client fetch |
| Subsequent-page fetch (infinite scroll) | API / Backend (`GET /api/reviews`) | Browser / Client — `HistoryClient.tsx` triggers via `fetch()` | Client-side pagination after mount requires an HTTP endpoint; reuses the same `lib/review-history.ts` function server-side inside the route handler |
| Cursor/orderBy/tiebreak logic | Database / Storage (Prisma query shape) | — | Pure Prisma query construction; no business logic beyond query params |
| FSRS-state breakdown aggregation | API / Backend (`lib/dashboard.ts` groupBy) | — | Same tier as the existing `cardsByType` groupBy it mirrors |
| Mastery-phrase / grade-name formatting | API / Backend (`lib/fsrs.ts`, pure function) | Browser / Client (rendered in `HistoryClient.tsx`) | `masteryPhrase`/`Rating[]` are pure and side-effect-free — safe to call from either tier; per existing convention (`lib/fsrs.ts` has no `'use client'` restriction), call it server-side when building the DTO so the client receives a ready-to-render string, avoiding a duplicate formatting pass on hydration |
| IntersectionObserver sentinel + scroll trigger | Browser / Client (`HistoryClient.tsx`) | — | DOM-only API; must run in a `'use client'` component inside `useEffect` |
| "View history" entry links (Habits card, CardEditor) | Browser / Client | — | Plain `<Link>` navigation, no new logic |

## Standard Stack

### Core

No new libraries needed. This phase is 100% built on already-installed dependencies:

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 7.6.0 (7.8.0 latest on npm, verified via `npm view`) [VERIFIED: npm registry] | Cursor-based `findMany` query for `ReviewLog` + `groupBy` for FSRS-state breakdown | Already the project's sole ORM; cursor pagination and `groupBy` are core Prisma Client APIs, not an add-on |
| `ts-fsrs` | 5.3.1 [VERIFIED: npm registry, already in package.json] | `Rating`/`State` numeric enums for label lookup (`Rating[n]` → `'Again'`/etc.) | Already imported via `lib/fsrs.ts`; using the enum's reverse-mapping avoids a hand-rolled label table |
| Browser `IntersectionObserver` API | native (no package) | Infinite-scroll trigger for the history feed | Standard web platform API, no dependency; React ecosystem convention for scroll-triggered pagination (see Architecture Patterns → Pattern 2) |

### Supporting

None — no new supporting libraries required.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `IntersectionObserver` | `react-intersection-observer` (npm package) | Adds a dependency for what's a ~15-line native API call; project has zero new-dependency expectation for this milestone (per STATE.md: "Zero new npm dependencies expected") — use native |
| Prisma `cursor`+`skip` pagination | Offset pagination (`skip: page * take`) | Offset pagination degrades (O(n) scan cost, and skipped/duplicated rows under concurrent writes) as history grows; cursor pagination is O(1) per page and stable — correct choice for an append-only, ever-growing log, matches D-05's explicit instruction |
| `Rating[n]`/`State[n]` enum reverse-lookup | A hand-written `const GRADE_NAMES = ['', 'Again', 'Hard', 'Good', 'Easy']` array | The enum reverse-lookup already exists as exported code (`lib/fsrs.ts` re-exports `Rating`, `State`) — reusing it is strictly less code and can't drift out of sync with the FSRS library's own definitions |

**Installation:** None required — no `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase introduces **zero new npm packages**. All functionality is built on `@prisma/client`, `ts-fsrs`, and native browser APIs already present in `package.json` (verified: `npm view @prisma/client version` → `7.8.0` latest, installed `7.6.0`; `ts-fsrs` `^5.3.1` already a direct dependency).

## Architecture Patterns

### System Architecture Diagram

```
Habits page (RSC)                      History page (RSC)
app/habits/page.tsx                    app/history/page.tsx
      │                                       │
      ▼                                       ▼
getStats() ── (+ new state groupBy) ──▶ getReviewHistory({ cardId: url param, cursor: null, take: N })
      │                                       │  lib/review-history.ts (shared fn)
      ▼                                       ▼
HabitsClient.tsx                       HistoryClient.tsx ('use client')
  "Card progress" section                 ├─ renders rows from initial (server) page
  (New/Learning/Review/Relearning tiles)   ├─ IntersectionObserver sentinel at list end
  wrapped in <Link href="/history">        │     │ (fires when scrolled into view)
      │                                    │     ▼
      │                                    │  fetch(`/api/reviews?cursor=<lastId>&cardId=`)
      └───────────────▶ click ────────────▶│     │
                                            │     ▼
                                       app/api/reviews/route.ts (GET)
                                            │     │  parses+validates cursor/cardId
                                            │     ▼
                                            │  getReviewHistory({ cardId, cursor, take }) [same lib fn]
                                            │     │
                                            │     ▼
                                            │  prisma.reviewLog.findMany({ cursor, skip:1,
                                            │    orderBy:[{createdAt:'desc'},{id:'desc'}],
                                            │    include:{ card:{select:{front,type}} } })
                                            │     │
                                            └─◀── JSON [ReviewLogDTO...] appended to list state

CardEditor.tsx ──▶ <Link href={`/history?cardId=${card.id}`}> ──▶ History page pre-filtered
```

### Recommended Project Structure

```
app/
├── history/
│   ├── page.tsx          # thin async RSC — reads ?cardId=, calls getReviewHistory(), renders HistoryClient
│   └── loading.tsx       # static skeleton (bg-surface-3 animate-pulse), Next.js client-nav fallback only
├── api/
│   └── reviews/
│       └── route.ts      # GET ?cursor=&cardId= — validates params, delegates to lib/review-history.ts
components/
├── HistoryClient.tsx     # 'use client' — owns list state, IntersectionObserver, "All cards" chip
lib/
├── review-history.ts     # getReviewHistory({ cardId, cursor, take }): Promise<ReviewLogDTO[]> — shared fn
├── dto.ts                # + ReviewLogDTO
├── dashboard.ts          # getStats() gains cardReviewByState groupBy (extends StatsDTO)
```

### Pattern 1: Compound-cursor Prisma pagination (createdAt DESC, id DESC tiebreak)

**What:** Cursor pagination where the sort key (`createdAt`) is not itself unique (multiple `ReviewLog` rows can share a timestamp), so a secondary unique field (`id`) is added to `orderBy` purely as a tiebreaker. The `cursor` object still only needs to reference the single unique field (`id`) — Prisma resolves the cursor row's full sort-key tuple internally and continues from there.
**When to use:** Any reverse-chronological feed where `createdAt` collisions are possible (concurrent writes, same-millisecond timestamps) and pagination must not skip or duplicate rows.
**Example:**
```typescript
// Source: [CITED: github.com/prisma/prisma/discussions/4888 — cross-checked against
// Prisma's documented cursor pagination semantics]
// lib/review-history.ts
export async function getReviewHistory(params: {
  cardId?: string | null
  cursor?: string | null   // last-seen ReviewLog.id from the previous page
  take: number
}): Promise<ReviewLogDTO[]> {
  const { cardId, cursor, take } = params

  const logs = await prisma.reviewLog.findMany({
    where: cardId ? { cardId } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // skip:1 excludes the cursor row itself
    include: { card: { select: { id: true, front: true, type: true } } },
  })

  return logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    cardId: l.cardId,
    cardFront: l.card.front,
    cardType: l.card.type,
    rating: l.rating,
    gradeName: Rating[l.rating],                       // 'Again' | 'Hard' | 'Good' | 'Easy'
    mastery: masteryPhrase(l.nextReview, l.createdAt),  // "Memory strengthening → 3d"
  }))
}
```
**Why `skip: 1` matters:** Prisma's `cursor` option is *inclusive* by default — without `skip: 1` the cursor row itself would be re-returned as the first item of the next page, producing a visible duplicate row on every scroll-load after the first.
**Index note:** `ReviewLog` already has `@@index([createdAt])` and `@@index([cardId])` (confirmed in `prisma/schema.prisma` line 118-119) — both needed indexes already exist from Phase 17; no new migration required for this phase.

### Pattern 2: IntersectionObserver infinite-scroll sentinel (ESLint-purity-safe)

**What:** A zero-height `<div>` at the end of the list, observed via `IntersectionObserver`, that triggers the next page fetch when it scrolls into view.
**When to use:** D-04's explicit requirement — auto-load on scroll, no "Load more" button.
**Example:**
```typescript
// Source: [CITED: general React IntersectionObserver pattern, cross-checked across
// multiple community sources — no official React docs page covers this API directly
// since it's a browser platform API, not a React-specific one]
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

// Inside HistoryClient.tsx:
const [rows, setRows] = useState<ReviewLogDTO[]>(initialRows)
const [loadingMore, setLoadingMore] = useState(false)
const [hasMore, setHasMore] = useState(initialRows.length === PAGE_SIZE)
const sentinelRef = useRef<HTMLDivElement>(null)
const loadingRef = useRef(false) // synchronous guard — state updates are async and can't
                                   // prevent a second overlapping IntersectionObserver
                                   // callback from firing before setLoadingMore(true) commits

const loadMore = useCallback(async () => {
  if (loadingRef.current || !hasMore) return
  loadingRef.current = true
  setLoadingMore(true)
  try {
    const last = rows[rows.length - 1]
    const qs = new URLSearchParams({ cursor: last.id, ...(cardId ? { cardId } : {}) })
    const res = await fetch(`/api/reviews?${qs}`)
    if (!res.ok) throw new Error(`reviews ${res.status}`)
    const next: ReviewLogDTO[] = await res.json()
    setRows((prev) => [...prev, ...next])
    setHasMore(next.length === PAGE_SIZE)
  } catch {
    // leave hasMore as-is so the sentinel stays mounted and a future
    // intersection (or a manual retry affordance) can try again
  } finally {
    loadingRef.current = false
    setLoadingMore(false)
  }
}, [rows, hasMore, cardId])

useEffect(() => {
  const el = sentinelRef.current
  if (!el || !hasMore) return
  const observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '200px' } // prefetch before the sentinel is fully in view
  )
  observer.observe(el)
  return () => observer.disconnect() // REQUIRED cleanup — avoids leaking observers
                                       // across re-renders/unmounts
}, [loadMore, hasMore])
```
**ESLint-purity compliance:** Nothing impure runs during render — `IntersectionObserver` construction and `fetch()` both happen inside `useEffect`/an event-driven callback (`loadMore`), never in the component body. `setRows`/`setLoadingMore` calls only happen inside the async `loadMore` callback (post-`await`), never synchronously inside the `useEffect` body itself — satisfies `react-hooks/set-state-in-effect`.
**Race-condition guard:** `loadingRef` (a `useRef`, not `useState`) is required in addition to `loadingMore` state because state updates are asynchronous/batched — a second `IntersectionObserver` callback firing before the first `setLoadingMore(true)` has committed would otherwise pass the `if (loadingMore) return` guard and fire a duplicate fetch for the same next page. This mirrors the same "duplicate concurrent request" risk documented across multiple infinite-scroll implementations.

### Anti-Patterns to Avoid

- **Using `useState` alone as the in-flight guard for the observer callback:** as noted above, state-only guards are vulnerable to a race where two intersection events fire before the first state update commits, producing duplicate page-2 fetches. Use a `useRef` boolean alongside (or instead of) the state flag for the actual guard condition.
- **Omitting `skip: 1` with a cursor:** produces a visibly duplicated row (the cursor row reappears) on every page after the first.
- **Re-deriving grade names or FSRS state labels by hand:** `Rating`/`State` are already exported numeric TS enums from `lib/fsrs.ts` — `Rating[n]`/`State[n]` gives the exact string name (`'Again'`, `'New'`, etc.) with zero new code and no risk of drifting from the FSRS library's own naming.
- **Computing `masteryPhrase`/grade name/etc. inside the client's render body from raw numbers passed down:** since these are pure functions with no browser-only dependency, compute them server-side while building the DTO (see Pattern 1) so the client only ever renders ready-made strings — consistent with the project's existing DTO philosophy (`CardDTO`/`StatsDTO` already ship pre-formatted/pre-serialized values, not raw numbers for the client to reformat).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Grade name lookup (1→"Again", etc.) | A new `GRADE_NAMES` array/object | `Rating[n]` (numeric TS enum reverse-mapping, already exported from `lib/fsrs.ts`) | Zero new code; can't drift from FSRS library's own enum if it's ever extended |
| FSRS-state name lookup (0→"New", etc.) | A new `STATE_NAMES` array/object | `State[n]` (same mechanism, same export) | Same reasoning |
| Mastery-language phrase computation | A new "Good — X" string formatter | `masteryPhrase(due, now)` from `lib/fsrs.ts` (currently unexported — must add `export`, per D-01) | Exact function `previewIntervalLabels` already uses; avoids maintaining two copies of the mastery-language logic |
| Stable pagination cursor | A custom base64-encoded composite cursor | Prisma's native `cursor: { id }` + `orderBy: [{createdAt:'desc'},{id:'desc'}]` + `skip: 1` | Prisma already resolves the compound sort-key tuple from a single unique-field cursor — no need to encode/decode a custom cursor token |
| Infinite-scroll trigger | A scroll-position/`onScroll` pixel-threshold listener | Native `IntersectionObserver` on a sentinel element | `IntersectionObserver` is more performant (no scroll-event throttling needed) and is the current platform-standard approach; avoids reflow-triggering scroll math |

**Key insight:** Every "new" mechanism this phase needs (grade names, state names, mastery phrases, cursor semantics) already has an exact, already-tested implementation living either in `ts-fsrs`'s own type exports or in `lib/fsrs.ts`. The only genuinely new code is the Prisma query shape and the IntersectionObserver wiring — both are thin, well-documented platform/library idioms, not domain logic worth abstracting further.

## Common Pitfalls

### Pitfall 1: UI-SPEC's "Hard" row color contradicts D-02 and misattributes precedent to FlashcardMode.tsx

**What goes wrong:** `18-UI-SPEC.md`'s Color section prescribes `bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400` for the "Hard" grade row, and claims this "reus[es] the exact literal tokens `FlashcardMode.tsx` already established for its grade buttons." **This is factually incorrect** — `FlashcardMode.tsx`'s actual "Hard" button (`onGrade(2)`) uses `bg-surface-3 text-muted` (a **neutral semantic token**, not orange). [VERIFIED: codebase grep, `components/FlashcardMode.tsx` line 229] Confirmed via `grep -rln "animate-spin\|orange-" components/*.tsx` that **no `orange-*` Tailwind literal exists anywhere in this codebase today** — it would be a brand-new color introduced by this phase, not a reuse of an established pattern. This also directly contradicts CONTEXT.md's own D-02 text: "distinct color treatment (**existing semantic tokens — no literal `orange-*`/`red-*` utilities**...)".
**Why it happens:** The UI-SPEC was likely written assuming grade-button colors follow a Again=red/Hard=orange/Good=green/Easy=blue convention common in other apps, without re-verifying against this specific codebase's actual (neutral-Hard) button styling.
**How to avoid:** Two compliant options for the planner to choose between (both keep D-02's "weak grades stand out, no literal orange/red" instruction satisfied for Hard):
  1. **Recommended — reuse the codebase's actual existing amber-warning precedent:** `CardEditor.tsx` (lines 166, 177-181) already uses literal `amber-400`/`amber-500`/`text-amber-500 dark:text-amber-400` for a warning state (`warnUnsafe`). This is a genuine, already-established literal-color exception in this codebase (unlike orange), and amber reads as "caution" rather than "error" — an apt semantic fit for "Hard" (struggling, but not as severe as "Again"). Style Hard rows as `bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400` (mirroring the Again row's exact class shape, swapping the hue).
  2. **Alternative — keep Hard neutral like `FlashcardMode.tsx` actually does:** `bg-surface-2 text-foreground` (same as Good/Easy), with only Again getting red treatment. This is simpler but arguably under-serves D-02's plural "weak grades" (Again/Hard) — flag as an open question if the user prefers this over introducing amber.
  Either way, do NOT introduce `orange-*` literals — it is both a new color with no existing precedent and a direct contradiction of D-02's own text.
**Warning signs:** If the implemented Hard-row class contains `orange`, this pitfall was missed — check against this note before the plan-checker/UI-checker signs off.

### Pitfall 2: Forgetting `skip: 1` with a Prisma cursor causes a duplicated row on every scroll-load after the first

**What goes wrong:** Prisma's `cursor` option is inclusive — omitting `skip: 1` re-returns the last row of the previous page as the first row of the next page, which will visibly appear as a duplicate entry in the feed (and, worse, silently double-count that row if any client-side aggregation is ever added later).
**Why it happens:** Easy to miss since Prisma's own basic docs example (single-field `orderBy: id asc`) doesn't call out `skip` at all in the simplest form shown in official docs.
**How to avoid:** Always pass `skip: 1` whenever `cursor` is present (i.e., on every page after the first); the very first page (no cursor) should omit both `cursor` and `skip`.
**Warning signs:** A UAT check that scrolls through 2+ pages and looks for the exact same `ReviewLog.id` appearing twice in the rendered list.

### Pitfall 3: A `useState`-only in-flight guard is not race-safe for overlapping IntersectionObserver callbacks

**What goes wrong:** Rapid scrolling (or a fast trackpad flick) can fire the IntersectionObserver callback again before React has committed the `setLoadingMore(true)` state update from the first callback, so a naive `if (loadingMore) return` guard reads stale (`false`) state and lets a second concurrent fetch through — resulting in duplicate/out-of-order page-2 data or a wasted request.
**Why it happens:** React state updates are asynchronous/batched; a synchronous DOM-event-driven callback (like an IntersectionObserver entry) can re-fire before the previous render/commit cycle finishes.
**How to avoid:** Use a `useRef` boolean (not `useState`) as the actual synchronous guard inside the callback (see Pattern 2's `loadingRef`), and reserve `useState` purely for driving the UI spinner.
**Warning signs:** Duplicate rows appearing in the history feed specifically after fast/aggressive scrolling (not present under slow, deliberate scrolling) — a signature symptom of this exact race.

### Pitfall 4: Reusing `SyncPanel.tsx` as a "spinner primitive" per the UI-SPEC's suggestion — it has no spinner

**What goes wrong:** The UI-SPEC's sentinel/loading-row note says to "reuse whatever spinner primitive already exists, e.g. the one in `SyncPanel.tsx`, rather than inventing a new one." [VERIFIED: codebase grep] `SyncPanel.tsx` has **no spinner** at all — it only swaps button text to `"Syncing…"` while `disabled`. The actual reusable spinner idiom in this codebase lives in `components/AudioButton.tsx` (line 112): a plain `<span className="inline-block border-2 border-button border-t-transparent rounded-full animate-spin ...">`.
**Why it happens:** Same class of error as Pitfall 1 — a plausible-sounding but unverified cross-reference in the UI-SPEC.
**How to avoid:** Use `AudioButton.tsx`'s exact spinner idiom (a bordered circle with `animate-spin` and a transparent top border) for the sentinel loading row, not anything from `SyncPanel.tsx`.
**Warning signs:** N/A — this is a documentation-accuracy issue the planner should just route around, not a runtime bug.

### Pitfall 5: `include: { card: {...} }` on a paginated `findMany` looks like an N+1 risk but isn't

**What goes wrong:** A cursory read of "join card data per review row" might prompt an instinct to batch-fetch cards separately to "avoid N+1 queries."
**Why it happens:** N+1 fear is a reasonable general instinct, but doesn't apply to Prisma's `include` on a single `findMany` call.
**How to avoid:** Prisma's `include` on a top-level `findMany` generates a single batched query (or a single JOIN, depending on the underlying driver/relation strategy) — it is not per-row N+1 the way a manual loop-and-fetch would be. At ~20-30 rows/page this is trivially cheap regardless. No special batching logic needed.
**Warning signs:** None expected; noted here only to pre-empt an unnecessary "optimization" during planning/implementation.

## Code Examples

### Grade name + mastery phrase (server-side, building the DTO)

```typescript
// Source: derived from lib/fsrs.ts (existing exports) + D-01's exact instruction
import { Rating, masteryPhrase } from '@/lib/fsrs' // masteryPhrase needs `export` added

const gradeName = Rating[reviewLog.rating] // 'Again' | 'Hard' | 'Good' | 'Easy'
const mastery = masteryPhrase(reviewLog.nextReview, reviewLog.createdAt)
// Render as: `${gradeName} — ${mastery}` → "Good — Memory strengthening → 3d"
```

### FSRS-state breakdown groupBy (mirrors existing `cardsByType` pattern exactly)

```typescript
// Source: [VERIFIED: codebase, lib/dashboard.ts existing cardsByType pattern, same file/tier]
// lib/dashboard.ts — inside getStats()'s existing Promise.all array:
const cardsByState = await prisma.cardReview.groupBy({ by: ['state'], _count: true })
// Map to labels for the DTO: cardsByState.map(r => ({ state: State[r.state], count: r._count }))
```

### `GET /api/reviews/route.ts` — mirrors the existing `app/api/cards/due/route.ts` validation shape

```typescript
// Source: [VERIFIED: codebase, app/api/cards/due/route.ts — same INTEGER_RE-style validation idiom,
// same try/catch/500 shape as app/api/stats/route.ts]
import { NextRequest, NextResponse } from 'next/server'
import { getReviewHistory } from '@/lib/review-history'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const cursor = searchParams.get('cursor') // opaque cuid string or null
    const cardId = searchParams.get('cardId')
    const logs = await getReviewHistory({ cardId, cursor, take: PAGE_SIZE })
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```
Note: unlike `lessonFrom`/`lessonTo` in `/api/cards/due`, `cursor` is an opaque `cuid()` string (not an integer) — no `INTEGER_RE` validation applies. A minimal shape check (non-empty string, reasonable max length) is sufficient; Prisma's `cursor: { id: cursor }` will simply match zero rows (and effectively return an empty/first-page-like result) if a garbage cursor is passed, which is a safe failure mode (no error, just no rows found — matches the graceful-degradation convention elsewhere in this codebase). Malformed `cardId` similarly degrades to "no rows for that card" rather than a crash.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Offset-based (`skip: page * take`) pagination | Cursor-based (`cursor` + `skip: 1`) pagination | Long-standing Prisma best practice, not a recent change | Correct choice for this phase per D-05's explicit instruction; avoids the "skipped/duplicated row under concurrent insert" and "O(n) scan cost as offset grows" problems that plague offset pagination on an append-only, ever-growing table |

**Deprecated/outdated:** None specific to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The general IntersectionObserver infinite-scroll pattern (sentinel div, `observer.disconnect()` cleanup, in-flight guard) reflects current React community best practice | Architecture Patterns → Pattern 2 | LOW — this is a stable, multi-year-old platform API pattern with no version-specific behavior to go stale; cross-checked against multiple independent community sources, but no single official React docs page authoritatively covers it (it's a browser API, not React-specific) |

**If this table is empty:** N/A — one low-risk assumption noted above; all other claims in this research were verified directly against the codebase (`grep`/`Read`) or corroborated via a specific, named source (GitHub Prisma discussion, `npm view`).

## Open Questions

1. **Should the "Hard" grade row use amber (recommended) or stay neutral, given the UI-SPEC/CONTEXT.md contradiction on this exact point?**
   - What we know: CONTEXT.md D-02 forbids literal `orange`/`red`; UI-SPEC prescribes literal `orange` for Hard and cites a non-existent codebase precedent for it; the codebase's actual only precedent for a "caution, not error" literal color is `amber` (used in `CardEditor.tsx`'s warning state).
   - What's unclear: Whether the user, if asked, would prefer amber (distinct treatment, matches D-02's plural "weak grades") or neutral-Hard (simpler, exactly matches `FlashcardMode.tsx`'s own precedent).
   - Recommendation: Default to amber (Pitfall 1, option 1) since it satisfies D-02's "distinct treatment for weak grades" instruction most literally while using a genuine existing precedent; flag to the user/UI-checker during plan-check if they'd rather keep Hard neutral.

2. **Exact `PAGE_SIZE` constant value.**
   - What we know: Success Criterion 1 specifies "~20-30 per page"; UI-SPEC repeats "~20-30 rows/page" without pinning an exact number.
   - What's unclear: No specific number was locked by the user.
   - Recommendation: Use `25` (middle of the stated range) as a single shared constant (e.g. exported from `lib/review-history.ts`) referenced by both the RSC page's first fetch and the API route's default `take`, so the two never drift out of sync.

## Environment Availability

Skipped — this phase has no external service/tool dependencies beyond the already-provisioned Turso database and already-installed npm packages, both already verified working by the existing, shipped `/habits`, `/study`, and `/api/review` code paths this phase directly extends.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (installed; `npm test` → `vitest run`) |
| Config file | `vitest.config.ts` (environment: `'node'`) |
| Quick run command | `npx vitest run tests/review-history.test.ts` |
| Full suite command | `npm test` |

The project's existing test suite (`tests/*.test.ts`) covers only pure `lib/` functions (no DB/API integration tests — confirmed via `tests/sequence.test.ts`'s pattern of hand-constructed fixture objects, no Prisma client mocking or live DB calls). This phase should follow the same convention: unit-test the **pure, extractable** pieces of `lib/review-history.ts`'s output shaping (e.g., a pure helper that maps a raw `ReviewLog` + `Card` row → `ReviewLogDTO`, if such a helper is factored out) rather than the Prisma-calling function itself, which is untestable without a live DB in this project's current test setup.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-04 | Grade name + mastery phrase formatting for a review log row | unit | `npx vitest run tests/review-history.test.ts -t "gradeName"` | ❌ Wave 0 |
| HIST-04 | Cursor/orderBy query shape produces stable, non-duplicated pagination | manual-only (no live-DB test harness exists in this project) | N/A — verify via manual scroll-through UAT against a seeded local `dev.db` | ❌ Wave 0 (manual UAT script/checklist) |
| HIST-05 | `cardId` filter narrows results to one card | manual-only (requires live Prisma query) — OR unit-testable if the `where` clause construction is factored into a small pure helper (`buildReviewWhereClause(cardId)`) | `npx vitest run tests/review-history.test.ts -t "where clause"` (if factored out) | ❌ Wave 0 |
| HIST-06 | Undo never mutates/deletes `ReviewLog` rows | **already verified by Phase 17's existing code** — `app/api/review/undo/route.ts` has no `reviewLog` reference at all (confirmed no write-path exists to mutate it); no new test needed for this phase, only a "no regression" check that this phase's new query doesn't add any undo-awareness/filtering | code inspection, not a runtime test | N/A |
| HIST-07 | History page shows real data on first paint (no loading flash) | manual-only, matching how `/habits`'s equivalent RSC-05 guarantee was verified (`npm run build && npm start`, not `next dev`, per CLAUDE.md's own noted gotcha) | `npm run build && npm start` then manually load `/history` and inspect for a loading flash | N/A (structural guarantee via the RSC pattern, not a unit-testable behavior) |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/review-history.test.ts` (fast, pure-function tests only)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + a manual scroll-through UAT (per HIST-04/07's manual-only rows above) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/review-history.test.ts` — covers HIST-04 (grade name + mastery phrase mapping) and, if `where`-clause construction is factored into a pure helper, HIST-05
- [ ] No framework install needed — Vitest already configured and working

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (new behavior) | Already covered — `/api/reviews` sits behind the existing `middleware.ts` session-cookie gate like every other API route in this app; no new auth surface introduced |
| V3 Session Management | no | Unchanged — reuses the existing HMAC cookie session, no new session state |
| V4 Access Control | no | Single-tenant app, no per-user row ownership to enforce (matches every other route in this codebase) |
| V5 Input Validation | yes | `cursor` and `cardId` query params must be validated as non-empty strings within a reasonable length bound before being passed to Prisma (mirrors the existing `INTEGER_RE`-based validation idiom in `/api/cards/due/route.ts`, adapted for opaque `cuid()` strings rather than integers) |
| V6 Cryptography | no | Not applicable — no new cryptographic operations |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded `take` value from a malicious/malformed client request (e.g. `?cursor=x&take=999999`) | Denial of Service | This phase's route does NOT expose `take` as a client-controlled param at all (per the Standard Stack recommendation) — `take` is a server-side constant (`PAGE_SIZE = 25`), never read from `searchParams`. If a future change does expose it, clamp with `Math.min(MAX, Math.max(MIN, n))` matching the existing `getSessionSize()`/`setSessionSize()` clamping idiom in `lib/settings.ts` |
| Cursor/cardId injection via malformed query strings | Tampering | Prisma's parameterized query builder (not raw SQL) already prevents SQL injection by construction; a garbage `cursor`/`cardId` string simply matches zero rows (safe no-op), not an error — no extra sanitization needed beyond a basic type/length check |
| Leaking another card's data via a crafted `cardId` for a card that doesn't exist | Information Disclosure | Not applicable — single-tenant app, no per-user card ownership; a non-existent `cardId` just yields an empty result set, no different in kind from any other not-found lookup already handled the same way elsewhere in this codebase (e.g. `GET /api/cards/[id]`) |

## Sources

### Primary (HIGH confidence)
- Codebase (`Read`/`Bash grep`) — `prisma/schema.prisma`, `lib/fsrs.ts`, `lib/study-cards.ts`, `lib/dashboard.ts`, `app/habits/page.tsx`, `components/HabitsClient.tsx`, `components/HabitTracker.tsx`, `components/LessonRangeFilter.tsx`, `components/CardEditor.tsx`, `components/FlashcardMode.tsx`, `components/AudioButton.tsx`, `components/SyncPanel.tsx`, `app/api/cards/due/route.ts`, `app/api/review/route.ts`, `app/api/stats/route.ts`, `app/api/lessons/route.ts`, `lib/dto.ts`, `lib/settings.ts`, `node_modules/ts-fsrs/dist/index.d.ts` — all read directly this session
- `npm view @prisma/client version` — confirmed 7.8.0 latest (installed: 7.6.0) [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- [github.com/prisma/prisma/discussions/4888](https://github.com/prisma/prisma/discussions/4888) — Prisma cursor pagination with compound `orderBy`, cross-checked against a second independent WebSearch query returning the same tuple-cursor explanation

### Tertiary (LOW confidence)
- General WebSearch results on React IntersectionObserver infinite-scroll patterns (multiple community dev.to/Medium articles, no single official React docs page) — the underlying pattern (sentinel + `disconnect()` cleanup + in-flight guard) is uncontroversial and stable, but individually each source is a community tutorial, not an authoritative spec
- WebSearch on Turso/libSQL + Prisma groupBy/cursor limitations — returned no specific documented issue; treated as a negative result (absence of a known problem), corroborated by this project's own `lib/dashboard.ts` already running `groupBy` successfully against the same Turso-backed client

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, entirely built on already-verified, already-installed, already-working project code
- Architecture: HIGH — direct structural clone of the already-shipped `/habits` RSC+DTO+client-shell pattern; the two novel mechanisms (cursor pagination, IntersectionObserver) are both cross-checked against multiple independent sources with no conflicting information found
- Pitfalls: HIGH — Pitfalls 1 and 4 are backed by direct `grep`/`Read` verification against actual source files (not speculation), catching two concrete inaccuracies in the already-authored UI-SPEC.md before they reach planning

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (30 days — stable domain, no fast-moving dependencies; re-verify if Prisma major-version-bumps before then)
