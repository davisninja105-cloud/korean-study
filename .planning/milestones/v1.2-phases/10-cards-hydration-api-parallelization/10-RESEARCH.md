# Phase 10: Cards Hydration + API Parallelization - Research

**Researched:** 2026-06-29
**Domain:** Next.js 16 App Router RSC conversion, React 19 server components, DTO serialization, Prisma concurrent queries
**Confidence:** HIGH

---

## Project Constraints (from CLAUDE.md)

- **No new npm packages** — All patterns (RSC, Promise.all, DTO) use existing Next.js 16 + React 19 stack
- **ESLint strict:** `react-hooks/purity` forbids `Date.now()` / `Math.random()` in render; `react-hooks/set-state-in-effect` forbids synchronous `setState` in effect bodies
- **Vercel Hobby 60s timeout** — no concern for this phase (no long-running Claude/LLM calls; queries are sub-second)
- **Turso/libSQL:** Schema unchanged — no DDL, no `prisma db push`
- **Dark mode:** When adding CSS, mirror values in both `@media (prefers-color-scheme: dark)` `:root` and `:root[data-theme="dark"]`
- **Semantic tokens only:** Never use `bg-orange-*`, `bg-blue-*`, etc. — use design-system tokens (`bg-surface-1`, `text-muted`, etc.)
- **Color system:** blue reserved for actions (buttons/links); vocabulary=indigo, grammar=violet, phrase=teal
- **`'use client'` always first line** — before any imports
- **No barrel index.ts files** — import each file directly via `@/` path alias
- **`interface Props`** naming convention — not `ComponentNameProps`
- **All API routes:** wrap in `try/catch`, validation errors → 400, unexpected errors → 500

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSC-01 | Cards page receives initial card list from the server — no "no cards stored yet" flash on first load | RSC conversion: `app/cards/page.tsx` becomes async server component; fetches via `prisma.card.findMany` at render time; passes serialized cards as props to an interactive `CardsClient` component |
| RSC-05 | All server-to-client prop boundaries use DTO types (Dates serialized as ISO strings or numbers — no raw Prisma Date objects passed to client components) | DTO layer: define `CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO` types; serialize all `DateTime` fields to ISO strings before passing across the boundary |
| DB-01 | `/api/cards/due` runs its three Prisma queries concurrently via `Promise.all` — saves one full Turso round-trip per study session start | Three independent queries identified: (1) pool fetch, (2) edge fetch, (3) knownLemmas fetch — but (2) depends on pool IDs from (1); only (1) and (3) are truly parallel; wrap in `Promise.allSettled` for graceful degradation |
</phase_requirements>

---

## Summary

Phase 10 has two independent workstreams that share a common pattern: eliminate client-side data waterfalls by moving fetches to the server boundary.

**Workstream A (RSC-01, RSC-05):** Convert `app/cards/page.tsx` from a `'use client'` component that fetches data in `useEffect` to a server component that fetches data at render time and passes it to a client shell. The cards page currently shows an empty state flash because React hydrates before the `useEffect` fetch resolves. Making the page an RSC means the card list arrives with the initial HTML — the `loading.tsx` skeleton (Phase 9) provides navigation coverage, and the hydrated content replaces it immediately without an empty-state flash. The interactive behaviors (search, filter, edit, delete, add) must be preserved in a `CardsClient` component with `'use client'`.

**Workstream B (DB-01):** The `/api/cards/due` route currently runs three Prisma queries serially. Two of them are truly independent — the card pool fetch and the known-lemmas fetch — and can be parallelized with `Promise.allSettled`. The edge fetch depends on the pool IDs, so it cannot be parallelized with the pool fetch itself, but the known-lemmas query (query #3) can be parallelized with query #2. This saves approximately one Turso round-trip (50–100ms) per study session start.

**Primary recommendation:** Split `app/cards/page.tsx` into a server page (data fetch + DTO serialization) and a `CardsClient` component (all interactivity). Parallelize the known-lemmas query with the edge query in `/api/cards/due`, wrapped in `Promise.allSettled` for graceful degradation.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Initial card list fetch | API / Backend (RSC) | — | Data fetching at render time belongs in the server component; eliminates client waterfall |
| Card search / filter | Browser / Client | — | Stateful, interactive — must stay in `'use client'` component |
| Card edit / delete | Browser / Client | API / Backend | State mutations triggered client-side, executed via API routes |
| Add card | Browser / Client | API / Backend | User-initiated form; same pattern as existing |
| Lesson range fetch | API / Backend (RSC) | — | Fetched alongside cards at server render; no separate `useEffect` needed |
| DTO type definitions | API / Backend (RSC) | Browser / Client | Types shared at boundary — defined once, used by both sides |
| Query parallelization | API / Backend | — | Promise.allSettled in the route handler; no client impact |
| Error handling (parallel queries) | API / Backend | — | Route-level try/catch with graceful degradation response |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Next.js | 16.2.1 | App Router RSC, `loading.tsx`, async page components | Already in use |
| React | 19.2.4 | Server Components, client components with `'use client'` | Already in use |
| Prisma | 7.6.0 | ORM; `prisma.card.findMany` called directly from RSC | Already in use |
| TypeScript | 5.9.3 | DTO type definitions, strict mode | Already in use |

**No installation needed.** All patterns are built into the existing stack.

---

## Architecture Patterns

### System Architecture Diagram

```
First load (RSC path):
  Browser → GET /cards
    → app/cards/page.tsx (Server Component, async)
      → prisma.card.findMany + prisma.lesson.findMany (parallel)
      → serialize to CardDTO[] (ISO string dates)
      → render HTML with hydrated card list
      → <CardsClient initialCards={...} initialLessons={...} />
    → HTML stream → browser paints real cards immediately

Navigation (loading.tsx path — Phase 9):
  Browser clicks Nav link → /cards
    → loading.tsx (CardsLoading skeleton) renders immediately
    → RSC page.tsx executes in background
    → content replaces skeleton

Study session start (parallelized /api/cards/due):
  Browser → GET /api/cards/due
    → [pool query] → cards[]
    → [edge query || knownLemmas query] (Promise.allSettled — concurrent)
    → selectSessionCards + sequenceCards + annotate
    → JSON response
```

### Recommended Project Structure

```
app/
├── cards/
│   ├── loading.tsx          # Phase 9 skeleton (unchanged)
│   ├── page.tsx             # RSC: async, fetches data, renders CardsClient
│   └── (no layout.tsx)
components/
│   └── CardsClient.tsx      # 'use client': all existing CardsPage interactivity
lib/
│   └── dto.ts               # DTO type definitions (optional — could be inline in page.tsx)
app/api/
│   └── cards/due/route.ts   # Parallelized queries (Promise.allSettled)
```

### Pattern 1: RSC Page with Client Shell

**What:** The page component is an async server component. It fetches data from Prisma directly (no `fetch('/api/cards')`), serializes to DTO types, then renders a single `'use client'` component that owns all interactivity.

**When to use:** Any page where initial data must arrive with the HTML and interactivity must be preserved.

**Example:**
```typescript
// app/cards/page.tsx — SERVER COMPONENT (no 'use client')
import { prisma } from '@/lib/prisma'
import CardsClient from '@/components/CardsClient'
import type { CardDTO } from '@/lib/dto'  // or inline

export default async function CardsPage() {
  const [cards, lessons] = await Promise.all([
    prisma.card.findMany({
      include: {
        review: true,
        lesson: { select: { title: true, createdAt: true, orderIndex: true } },
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])

  // Serialize: convert all Date objects to ISO strings before the boundary
  const cardDTOs: CardDTO[] = cards.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lesson: c.lesson
      ? { ...c.lesson, createdAt: c.lesson.createdAt.toISOString() }
      : null,
    review: c.review
      ? {
          ...c.review,
          nextReview: c.review.nextReview.toISOString(),
          lastReview: c.review.lastReview?.toISOString() ?? null,
        }
      : null,
    sentences: c.sentences.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
  }))

  return <CardsClient initialCards={cardDTOs} initialLessons={lessons} />
}
```

### Pattern 2: DTO Type Definitions

**What:** Explicit TypeScript interfaces for the server→client boundary. All `DateTime` Prisma fields become `string` (ISO 8601). These types replace ad-hoc inline `interface` blocks inside client components.

**When to use:** Any RSC → client component prop boundary that includes Prisma model data.

**Key insight:** The `CardReview` model has `nextReview: DateTime` and `lastReview: DateTime?`. The `Card` model has `createdAt: DateTime` and `updatedAt: DateTime`. The `Lesson` has `createdAt: DateTime`. The `Sentence` has `createdAt` and `updatedAt`. ALL of these must be serialized.

**Important finding:** `StudySession.tsx` already defines its internal `review` type with `nextReview?: string | null` and `lastReview?: string | null` — dates are already treated as strings in the study session flow. The DTO pattern formalizes this contract.

```typescript
// Can live in app/cards/page.tsx or lib/dto.ts
// (lib/dto.ts if shared with future RSC pages)

export interface ReviewDTO {
  id: string
  cardId: string
  state: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  nextReview: string      // ISO string, was Date
  lastReview: string | null // ISO string, was Date | null
}

export interface SentenceDTO {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string       // ISO string
  updatedAt: string       // ISO string
}

export interface LessonRefDTO {
  title: string
  orderIndex: number
  createdAt: string       // ISO string (from /api/cards include)
}

export interface CardDTO {
  id: string
  createdAt: string       // ISO string
  updatedAt: string       // ISO string
  type: string
  front: string
  back: string
  notes: string | null
  normalizedFront: string
  components: string | null
  distractors: string | null
  lessonId: string | null
  lesson: LessonRefDTO | null
  review: ReviewDTO | null
  sentences: SentenceDTO[]
}

// For /api/lessons (LessonRangeFilter)
export interface LessonDTO {
  id: string
  orderIndex: number
  title: string
  // Note: createdAt not needed by CardsClient for lesson filtering
}
```

### Pattern 3: CardsClient — Preserving Interactivity

**What:** Extract all `useState`, `useEffect`, handlers, and JSX from the current `CardsPage` into a new `'use client'` component called `CardsClient`. Accept `initialCards` and `initialLessons` props to hydrate state without a client-side fetch.

**Critical details:**
- `useState` is initialized from `initialCards` / `initialLessons` props — no `useEffect` needed for initial data
- The `loadCards()` function (called after add/edit/delete mutations) still calls `/api/cards` — this is intentional; it refreshes after mutations
- The `useEffect` that fetched lessons is removed (lessons come from server)
- The initial lesson range (`lessonFrom`/`lessonTo`) is derived from `initialLessons` in the initial `useState` call

**Lint note:** `useState` lazy initializer is the correct pattern for deriving initial state from props:
```typescript
const [lessonFrom, setLessonFrom] = useState(() =>
  initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
)
const [lessonTo, setLessonTo] = useState(() =>
  initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
)
```

### Pattern 4: Promise.allSettled for Parallel Queries

**What:** The three queries in `/api/cards/due` are currently serial. The dependency chain is:
1. Pool fetch (cards matching scope/lesson filter) — INDEPENDENT
2. Edge fetch (prerequisite edges for pool IDs) — DEPENDS ON #1 (needs `ids` from pool)
3. Known-lemmas fetch (cards with state >= 1) — INDEPENDENT

Only queries #1 and #3 can be parallelized with each other. After #1 resolves, #2 and #3 can run concurrently (but #2 was already running after #1 in the original code). The real optimization: run #1 and #3 concurrently, wait for both, then run #2.

**Revised parallelization strategy:**
```typescript
// Parallel: pool fetch + knownLemmas fetch (both independent of each other)
const [poolResult, knownRowsResult] = await Promise.allSettled([
  prisma.card.findMany({ where: poolWhere, include: poolInclude, ... }),
  prisma.card.findMany({ where: { review: { state: { gte: 1 } } }, select: { normalizedFront: true } }),
])

if (poolResult.status === 'rejected') {
  return NextResponse.json({ error: 'Database error' }, { status: 500 })
}
const cards = poolResult.value
if (cards.length === 0) return NextResponse.json([])

// Now run edge fetch (depends on pool IDs from above)
const ids = cards.map((c) => c.id)
const edges = await prisma.cardDependency.findMany({
  where: { cardId: { in: ids }, prerequisiteId: { in: ids } },
  select: { cardId: true, prerequisiteId: true },
})

const knownLemmas = new Set(
  knownRowsResult.status === 'fulfilled'
    ? knownRowsResult.value.map((r) => r.normalizedFront)
    : []  // Graceful degradation: if knownLemmas query fails, no unknownCount annotation
)
```

**Why `Promise.allSettled` over `Promise.all`:** Per STATE.md decision: "wrap in try/catch for graceful degradation." `Promise.allSettled` never rejects — each result has `status: 'fulfilled' | 'rejected'`. This satisfies success criterion #5 (transient DB failure returns graceful error, not crash). The known-lemmas query is non-critical (only affects `unknownCount` annotation) — a failure here should degrade gracefully, not fail the whole request.

**Turso parallel query behavior:** The STATE.md notes "Turso parallel-query rate-limit behavior unconfirmed." From the existing codebase, `app/layout.tsx`, `app/api/settings/route.ts`, `app/api/activity/route.ts`, and `app/api/stats/route.ts` ALL already use `Promise.all` against Turso with 3–7 concurrent queries. No rate-limit issues have been observed. The existing pattern is `Promise.all` (not `Promise.allSettled`) — using `Promise.allSettled` here is a conservative choice that adds graceful degradation without risk. [ASSUMED — no official Turso rate-limit documentation found, but multiple existing parallel queries in the codebase are functioning correctly]

### Anti-Patterns to Avoid

- **Passing raw Prisma Date objects as props:** Next.js App Router will throw a serialization error at runtime ("Only plain objects, and a few built-ins, can be passed to Client Components from Server Components"). Convert EVERY `DateTime` field before the boundary.
- **Fetching in useEffect for initial data:** After RSC conversion, the client component's initial data comes from props. Removing the `useEffect` fetch for initial load is the whole point — keep the `loadCards()` re-fetch only for post-mutation refresh.
- **Calling `prisma` from a `'use client'` component:** The Prisma client imports Node.js internals and will fail in the browser. The server component (no `'use client'`) is the only place to call Prisma.
- **Using `fetch('/api/cards')` in the RSC:** Direct Prisma is the correct pattern for RSC data fetching — it avoids an unnecessary HTTP round-trip during SSR. The API route stays for client-side post-mutation refreshes.
- **`Promise.all` without error handling:** If either query in `Promise.all` rejects, the whole `Promise.all` rejects and the route returns a 500 without a useful message. Use `Promise.allSettled` and check each result status.
- **Leaving the `useEffect` lesson fetch in CardsClient:** Once lessons are server-fetched and passed as `initialLessons`, the `useEffect` fetch is redundant and creates a double-fetch. Remove it entirely.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date serialization | Custom date formatter | `.toISOString()` | Standard JS method; ISO 8601 is what `new Date(str)` parses back |
| Concurrent fetches | Custom queue / throttle | `Promise.allSettled` | Built into JS; handles rejection per-item |
| RSC data fetching | Custom caching layer | Direct Prisma call | Next.js RSC already deduplicates fetch calls per request; Prisma is already the ORM |
| Client state hydration | SWR / React Query | `useState(initialData)` | No new packages; simple prop-initialized state is sufficient for this use case |

---

## Common Pitfalls

### Pitfall 1: Date Serialization — "Only plain objects can be passed"

**What goes wrong:** The RSC page passes a Prisma result object directly to a client component. Next.js throws `Error: Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Date objects are not supported.`

**Why it happens:** Prisma `DateTime` fields return JavaScript `Date` objects. `Date` is not serializable as a plain JSON value.

**How to avoid:** Map every card through a DTO serializer before rendering the client component. Use `.toISOString()` for `DateTime` and `?.toISOString() ?? null` for optional `DateTime?`. Check EVERY model field: `Card.createdAt`, `Card.updatedAt`, `Lesson.createdAt`, `CardReview.nextReview`, `CardReview.lastReview`, `Sentence.createdAt`, `Sentence.updatedAt`.

**Warning signs:** TypeScript won't catch this at compile time if you use `as unknown as CardDTO`. Test with a real production build (`next build && next start`) — the error only surfaces at runtime in RSC mode.

### Pitfall 2: Missing Fields in DTO — TypeScript Widening

**What goes wrong:** The DTO type is narrower than what CardsClient actually uses. CardsClient references a field (e.g., `card.review.reps`) that was omitted from the DTO definition and the serialization mapping. In production, the value is `undefined`; the component silently shows nothing.

**Why it happens:** The existing `interface Card` in `app/cards/page.tsx` was written to match the API response. The DTO must match what Prisma actually returns, which is a superset.

**How to avoid:** Derive the DTO serializer from the Prisma query's `include`/`select` shape. Every field in the Prisma result that is used anywhere in CardsClient must appear in the DTO type and the serializer.

### Pitfall 3: useEffect Double-Fetch After Conversion

**What goes wrong:** The converted `CardsClient` still has the `useEffect(() => { loadCards(); loadLessons() }, [])` from the original component. On mount, it re-fetches data that the server already provided, causing a flicker as the client overwrites the server-provided list.

**Why it happens:** Forgetting to remove the initial-load `useEffect` during the extraction.

**How to avoid:** In `CardsClient`, initialize state from props: `useState(initialCards)` and `useState(initialLessons)`. Remove the `useEffect` that fetched initial data. Keep the `loadCards()` function (called after `handleAdd`, `handleSave`, `handleDelete`) since post-mutation refreshes still need a client-side re-fetch.

### Pitfall 4: Promise.allSettled — Forgotten Check

**What goes wrong:** Code uses `Promise.allSettled` but unconditionally accesses `.value` on each result without checking `.status === 'fulfilled'` first. If a query rejects, `.value` is `undefined` and downstream code throws.

**How to avoid:** Always check `result.status === 'fulfilled'` before accessing `result.value`. For the known-lemmas query (non-critical), degrade gracefully: use an empty Set if status is `'rejected'`, log the error, and continue.

### Pitfall 5: CardsClient Not Receiving Correct Lesson Initial State

**What goes wrong:** `lessonFrom` and `lessonTo` are initialized to `1` (the fallback), not to the actual first/last lesson orderIndex, because the `useState` lazy initializer is not used.

**Why it happens:** A naive conversion copies `useState(1)` from the original and adds an effect to update it — but `setLessonFrom` in an effect fires after hydration, causing a brief filter mis-state.

**How to avoid:** Use `useState(() => initialLessons[0]?.orderIndex ?? 1)` and `useState(() => initialLessons[initialLessons.length - 1]?.orderIndex ?? 1)` so the correct values are available on first render.

---

## Code Examples

### Verified Pattern: RSC data fetch + immediate client render

The existing `app/layout.tsx` demonstrates the pattern (server fetch → client-consumed styles):

```typescript
// Source: app/layout.tsx (existing codebase)
export default async function RootLayout({ children }) {
  const [buttonColor, rewardColor, readingScale, readingAid] = await Promise.all([
    getButtonColor(), getRewardColor(), getReadingTextScale(), getReadingAid(),
  ])
  // ...data used directly in JSX without client boundary
}
```

### Verified Pattern: Promise.allSettled for graceful degradation

```typescript
// Source: app/api/sync/route.ts (existing codebase)
const extractResults = await Promise.allSettled(
  lessonsToProcess.map((lesson) => extractCards(...))
)
```

### Verified Pattern: Parallel Promise.all for independent settings

```typescript
// Source: app/api/stats/route.ts (existing codebase)
const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
  prisma.card.count(),
  prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
  prisma.lesson.count(),
  prisma.card.groupBy({ by: ['type'], _count: true }),
  prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
])
```

### Date Serialization Pattern

```typescript
// For CardReview DateTime fields
review: c.review ? {
  ...c.review,
  nextReview: c.review.nextReview.toISOString(),
  lastReview: c.review.lastReview?.toISOString() ?? null,
} : null,
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `useEffect` fetch in client components | RSC data fetch → client shell with `initialData` props | Eliminates empty-state flash on first load; hydrated HTML |
| Serial Prisma queries (await A; await B; await C) | `Promise.allSettled([A, C])` then `await B` | Saves one Turso round-trip (~50–100ms) per study session start |
| Ad-hoc `interface Card` in each component | Shared DTO types at server→client boundary | Type safety across the boundary; prevents Date serialization bugs |

**Deprecated/outdated in this phase context:**
- Initial `useEffect` fetch in `CardsPage` — replaced by RSC server fetch + `initialData` props
- `loadCards()` called at mount — only needed for post-mutation refreshes now

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Turso does not rate-limit concurrent queries — based on observation that existing `Promise.all` with 5-7 queries works in layout.tsx, stats, and settings routes | Pitfalls, Pattern 4 | Low — if rate-limited, fallback to sequential with a comment; no user impact beyond the latency win not materializing |
| A2 | The known-lemmas query (#3) and the pool query (#1) are the two truly independent queries; the edge query (#2) necessarily depends on pool IDs | Pattern 4 | Low — dependency is structural (edges filter by `cardId: { in: ids }`); verified by reading route code |

---

## Open Questions

1. **Should DTO types live in `lib/dto.ts` or inline in `app/cards/page.tsx`?**
   - What we know: Phase 11 will add RSC conversion for the study page; Phase 12 adds Home/Habits. The same DTO types will be reused.
   - What's unclear: Whether early extraction to `lib/dto.ts` is worth the overhead in Phase 10 vs. Phase 11.
   - Recommendation: Define DTOs in `app/cards/page.tsx` for Phase 10; extract to `lib/dto.ts` during Phase 11 when the second RSC page needs them. This minimizes scope creep.

2. **Does `loadCards()` (post-mutation re-fetch) need to be updated to deserialize dates?**
   - What we know: `loadCards()` calls `fetch('/api/cards')` which returns JSON — JSON dates are already strings, not `Date` objects.
   - What's unclear: Whether the existing `interface Card` in `CardsClient` needs updating.
   - Recommendation: The fetch-based refresh path already returns strings; `CardsClient` types should align with `CardDTO` (strings for dates). The existing `interface Card` in `app/cards/page.tsx` can be replaced entirely by `CardDTO`.

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all patterns use existing Next.js 16, React 19, Prisma 7 stack already installed and running)

---

## Validation Architecture

> `nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per project configuration.

---

## Security Domain

**`security_enforcement` is enabled (not explicitly false in config).**

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing `middleware.ts` auth unchanged |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Single-tenant; auth cookie gate unchanged |
| V5 Input Validation | no | No new user inputs in this phase; existing lesson/scope params unchanged |
| V6 Cryptography | no | No crypto changes |

**No new security surface.** The RSC page fetches Prisma data server-side and serializes it — no new input vectors. The parallelized query route does not change its input validation logic. No new API endpoints. Auth middleware unchanged.

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RSC → client boundary data exposure | Information Disclosure | Only serialize fields the client already received via the API; DTO must not include fields not in the original `interface Card` |

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `app/cards/page.tsx`, `app/api/cards/route.ts`, `app/api/cards/due/route.ts`, `app/layout.tsx`, `app/api/stats/route.ts`, `app/api/sync/route.ts`, `components/StudySession.tsx`, `lib/sequence.ts`, `prisma/schema.prisma` [VERIFIED: codebase grep]
- `.planning/REQUIREMENTS.md` — RSC-01, RSC-05, DB-01 requirement text [VERIFIED: file read]
- `.planning/STATE.md` — Architectural decisions, Turso parallel note, DTO gate decision [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- Next.js App Router RSC serialization constraint ("Only plain objects can be passed to Client Components") [ASSUMED: training knowledge, but consistent with observed pattern in codebase]
- `Promise.allSettled` graceful degradation pattern [ASSUMED: well-established JavaScript pattern]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no research uncertainty
- Architecture: HIGH — RSC + client shell pattern is clearly demonstrated by `app/layout.tsx` and `app/api/stats/route.ts` in the existing codebase
- Pitfalls: HIGH — Date serialization pitfall is structural (Next.js constraint); others verified from codebase reading
- Query parallelization: HIGH — dependency chain verified by reading route code; existing `Promise.all` usage in 4+ routes confirmed safe

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stable stack — Next.js 16, Prisma 7 APIs are stable)
