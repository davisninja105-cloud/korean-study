# Stack Research: Performance Optimization (v1.2)

**Project:** Korean Study — v1.2 Performance & Snappiness
**Researched:** 2026-06-29
**Confidence:** MEDIUM (Next.js 16 official docs via WebFetch) / LOW (ecosystem comparisons via WebSearch)

---

## Verdict: No New npm Packages Required

Every performance target in v1.2 is achievable with the existing stack. The capabilities needed — RSC async page components, `loading.tsx`, `React.cache`, `Promise.all`, and `<Suspense>` — are all built into Next.js 16, React 19, and the existing Prisma 7 + libSQL adapter. Zero new dependencies.

---

## Core Technologies Already in Place

| Technology | Version | Performance Role | Status |
|------------|---------|-----------------|--------|
| Next.js App Router | 16.2.1 | `loading.tsx` skeleton convention, RSC async pages, streaming Suspense | Already installed — just not used for data fetching yet |
| React | 19.2.4 | `React.cache()` for per-request deduplication, `<Suspense>` boundary primitive, `use()` API for promise streaming | Already installed |
| Prisma | 7.6.0 | Direct ORM calls in async server components — replaces `fetch('/api/...')` round-trips; `Promise.all()` for parallel queries | Already installed |
| `@prisma/adapter-libsql` | 7.6.0 | libSQL adapter — each Prisma query is an independent HTTP call to Turso; parallel via `Promise.all()` works correctly outside transactions | Already installed |
| TypeScript | 5.9.3 | Async page type signatures (`async function Page()` returns `Promise<JSX.Element>`) | No changes needed |

---

## Pattern Catalog: What to Use and Why

### 1. RSC + Client Shell Pattern (PERF-01, PERF-02, PERF-03, PERF-04)

**The problem:** Current pages have `'use client'` at the top and fetch data via `useEffect(() => fetch('/api/...'))`. This causes a blank-page flash because the page mounts empty, then fetches, then renders.

**The fix:** Remove `'use client'` from the page file. Make it an `async` Server Component that calls Prisma directly. Pass serializable data as props to a renamed client shell component that retains all hooks and event handlers.

**Pattern:**

```typescript
// app/cards/page.tsx — now a Server Component (no 'use client')
import { CardsShell } from '@/components/CardsShell'
import { prisma } from '@/lib/prisma'

export default async function CardsPage() {
  const cards = await prisma.card.findMany({
    include: { sentences: true, review: true },
    orderBy: { createdAt: 'desc' },
  })
  return <CardsShell initialCards={cards} />
}
```

```typescript
// components/CardsShell.tsx — client component with all interactivity
'use client'
// ... all useState, useEffect, event handlers live here
export function CardsShell({ initialCards }: { initialCards: Card[] }) { ... }
```

**Why this works:** The RSC payload carries the serialized `cards` array with the initial HTML. The client hydrates with data already present — no round-trip, no flash. The `'use client'` boundary is at the shell component, not the page.

**Props constraint:** Props from Server → Client Components must be serializable (JSON-safe). Prisma result objects with scalar fields, arrays, strings, numbers, booleans, and `Date` (serialized as ISO string) are serializable. Functions, class instances, and Symbols are not.

**Prisma + libSQL compatibility:** Calling Prisma directly in a Server Component is the recommended pattern per Prisma docs. The `@prisma/adapter-libsql` singleton in `lib/prisma.ts` is already scoped to the server — no changes needed to the Prisma setup.

---

### 2. `loading.tsx` Skeleton Screens (PERF-05)

**The problem:** Navigating between routes shows a blank screen while the new page's data fetches.

**The fix:** Add a `loading.tsx` file in each route folder. Next.js automatically wraps `page.tsx` in a `<Suspense>` boundary using the loading component as the fallback. The skeleton is prefetched and shown instantly on navigation.

**Pattern:**

```
app/
  cards/
    loading.tsx    ← skeleton for cards page
    page.tsx       ← async server component
  study/
    loading.tsx    ← skeleton for study page
    page.tsx
  (home)/
    loading.tsx
    page.tsx
  habits/
    loading.tsx
    page.tsx
```

```typescript
// app/cards/loading.tsx
export default function CardsLoading() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-10 bg-surface-2 rounded-lg" />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-16 bg-surface-2 rounded-lg" />
      ))}
    </div>
  )
}
```

**Key behavior facts (from official docs):**
- `loading.tsx` wraps `page.tsx` and nested layouts below it in `<Suspense>`, but does NOT wrap the `layout.tsx` in the same segment
- The fallback UI is prefetched for instant display on client-side navigation
- Navigation is interruptible — changing routes mid-load works correctly
- If `layout.tsx` accesses uncached data (cookies, headers, uncached fetches), `loading.tsx` will not cover it and navigation will block on the layout. Fix: move any uncached data fetching from `layout.tsx` into `page.tsx`
- `app/layout.tsx` in this project does not fetch data (it handles theme, auth token injection, GlossProvider, ThemeWatcher) — no risk here

**Skeleton design rule:** Match skeleton dimensions to the real content to avoid Cumulative Layout Shift (CLS) when the real content streams in. Use `bg-surface-2` (the recessed token, not a raw gray) to match the design system.

---

### 3. `React.cache()` for Per-Request Deduplication

**The problem:** If multiple server components on the same page call the same Prisma query, each call hits the database separately. Unlike `fetch()`, Prisma is not auto-memoized by Next.js.

**The fix:** Wrap shared data-fetching functions with `React.cache()`. This memoizes the result for the duration of a single server render — if two components call `getCards()`, the second call returns the memoized result without hitting the DB again.

**Pattern:**

```typescript
// lib/data.ts (new server-only data layer)
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

export const getCards = cache(async () => {
  return prisma.card.findMany({ include: { sentences: true, review: true } })
})
```

**When to use:** Only when the same query would be called by multiple server components in the same render tree. For this project's pages (each page has one top-level data fetch), `React.cache()` is not strictly required for the initial refactor — it is an optional optimization if sub-components later need the same data.

**Scope:** `React.cache()` is request-scoped. Each request gets its own memoization scope with no sharing between requests. It does not persist data across requests (that is `unstable_cache` / `use cache` territory).

---

### 4. `Promise.all()` for Parallel Prisma Queries (PERF-06)

**The problem:** `/api/cards/due` has 3 serial Prisma calls, each blocked on the previous. Total time = sum of all three query latencies.

**The fix:** Initiate all independent queries simultaneously, then await the settled results together. Total time = max of the three latencies (not sum).

**Pattern:**

```typescript
// Before (serial — each blocks the next):
const cards = await prisma.card.findMany(...)
const edges = await prisma.cardDependency.findMany(...)
const knownCards = await prisma.card.findMany({ where: { review: { state: ... } } })

// After (parallel — all fire simultaneously):
const [cards, edges, knownCards] = await Promise.all([
  prisma.card.findMany(...),
  prisma.cardDependency.findMany(...),
  prisma.card.findMany({ where: { review: { state: ... } } }),
])
```

**Turso/libSQL compatibility:** Each Prisma query via the `@prisma/adapter-libsql` adapter becomes an independent HTTP request to Turso. `Promise.all()` fires them concurrently — this is correct and well-supported. The GitHub issue about sequential execution only applies to Prisma interactive transactions (where all queries share one connection); outside transactions, parallelism works as expected.

**Use `Promise.allSettled()` when:** Individual query failures should not abort the whole batch (the project already uses this pattern in `app/api/sync/route.ts`). For `/api/cards/due`, `Promise.all()` is appropriate since all three results are required.

---

### 5. `<Suspense>` for Granular Streaming (Advanced)

**The problem:** `loading.tsx` covers the entire page. If part of a page is fast (e.g. the study controls) and part is slow (e.g. the card list), the whole page waits for the slow part.

**When to use:** For sub-page streaming where different sections have different data latency. For this project's pages (each page has one main data fetch that everything depends on), `loading.tsx` is sufficient and simpler. Inline `<Suspense>` boundaries are an option if a specific page needs it.

**Pattern (for reference):**

```typescript
// app/page.tsx — Home page with parallel streaming sections
import { Suspense } from 'react'

export default function HomePage() {
  return (
    <main>
      <HeroSkeleton />  {/* static shell — shows immediately */}
      <Suspense fallback={<HabitSkeleton />}>
        <HabitSection />   {/* streams in when habit data resolves */}
      </Suspense>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />   {/* streams in independently */}
      </Suspense>
    </main>
  )
}
```

**For v1.2 recommendation:** Start with `loading.tsx` + async page components (simpler, covers PERF-01 through PERF-05). Add inline `<Suspense>` only if a specific page benefits from progressive reveal within the page body.

---

## What NOT to Add

| Do Not Add | Why Not | What to Do Instead |
|------------|---------|-------------------|
| **`unstable_cache`** | Replaced by `use cache` in Next.js 16; adds complexity; not needed — the win is eliminating the client round-trip entirely, not caching DB results between requests | Move Prisma calls to async server components; use `React.cache()` for within-request deduplication |
| **`use cache` directive** | Next.js 16's new caching primitive. Valuable for shared multi-user apps where the same data is fetched repeatedly. For this single-user personal app where card data changes on sync, caching between requests adds staleness risk without meaningful benefit | Use `React.cache()` for per-request dedup only |
| **SWR / React Query** | Client-side data-fetching libraries. Useful for real-time updates and optimistic mutations. The problem being solved (blank page flash) is a server-side data delivery problem, not a client-side caching problem | Use RSC async pages — data arrives with the HTML |
| **`server-only` package** | Optional guard against accidentally importing Prisma into client components. Useful in large teams. In this single-developer project, the `'use client'` boundary is explicit and `CLAUDE.md` documents the server/client split clearly | Keep using `// No 'use client' — server-side only` comments in `lib/` modules |
| **`@tanstack/query`** | 47kb+ bundle for optimistic updates, background refresh, cache invalidation. None of these are needed for this app's use case | |
| **New DB layer / Drizzle / Kysely** | The existing Prisma 7 + `@prisma/adapter-libsql` setup works correctly with RSC async components and `Promise.all()` parallelism | |

---

## Integration Constraints

### Serializable Props Requirement

Prisma 7 result objects returned from async server components and passed as props to client shell components must be serializable. Key constraints:

- Scalar fields (string, number, boolean) — serializable
- `Date` objects — Next.js serializes as ISO string; client receives a string, not a `Date`. If client code calls `.toISOString()` on a prop, it will fail. Either: (a) convert dates to ISO strings server-side before passing, or (b) use `Date` only in server-only code
- `BigInt` — not serializable; avoid in props
- Class instances with methods — not serializable; destructure to plain objects if needed
- The `CardReview` nested object from Prisma include — safe (all scalars); the `nextReview: Date` field should be converted to a number (`.getTime()`) before passing as a prop

### ESLint Purity Rules

RSC pages are `async function Page()` — no hooks, no `Date.now()` in render. Client shells retain all hooks. The purity rules apply to client components only; server components run once during render with no hook constraints.

### Vercel Function Timeout (60s)

RSC page data fetching replaces client-side API calls; the Prisma queries now run in the page-render serverless function, not in `/api/*` route functions. The same 60s limit applies. The existing queries for cards/study/home are fast (indexed lookups); this is not a concern. Sync operations (`/api/sync`) remain API routes and remain unaffected.

### `lib/prisma.ts` Singleton

The existing Prisma singleton (`export const prisma = new PrismaClient(...)` with the libSQL adapter) is the correct import for server components. No changes needed. It is server-only; client components must never import it directly.

---

## Migration Path for Each Page

| Page | Current Pattern | RSC Pattern | Shell Component |
|------|----------------|-------------|-----------------|
| `app/cards/page.tsx` | `'use client'` + `useEffect(fetch('/api/cards'))` | `async Page()` → `prisma.card.findMany()` → `<CardsShell initialCards={...} />` | `components/CardsShell.tsx` |
| `app/study/page.tsx` | `'use client'` + `useEffect(fetch('/api/cards/due'))` | `async Page()` → existing `/api/cards/due` query logic inlined → `<StudyShell initialCards={...} />` | `components/StudyShell.tsx` (thin wrapper around existing `StudySession`) |
| `app/page.tsx` (Home) | `'use client'` + parallel `fetch` for activity + stats | `async Page()` → `Promise.all([prisma activity, prisma stats])` → `<HomeShell />` | `components/HomeShell.tsx` |
| `app/habits/page.tsx` | `'use client'` + `useEffect(fetch('/api/activity'))` | `async Page()` → `prisma.studyDay.findMany()` → `<HabitsShell initialDays={...} />` | `components/HabitsShell.tsx` |

Note: The study page is the most complex — `StudySession.tsx` is a large client component that consumes card data. The shell pattern here is: async page fetches initial due cards, passes them as `initialCards` prop to a thin `StudyShell` that mounts `StudySession`. Subsequent interactions (grading, refetching after session ends) remain client-driven API calls.

---

## Sources

- [Next.js 16 Fetching Data docs](https://nextjs.org/docs/app/getting-started/fetching-data) — MEDIUM confidence (official docs, version 16.2.9, fetched 2026-06-29)
- [Next.js loading.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — MEDIUM confidence (official docs, version 16.2.9, fetched 2026-06-29)
- [Next.js Streaming guide](https://nextjs.org/docs/app/guides/streaming) — MEDIUM confidence (official docs, version 16.2.9, fetched 2026-06-29)
- [Next.js Server and Client Components guide](https://nextjs.org/docs/app/getting-started/server-and-client-components) — MEDIUM confidence (official docs, version 16.2.9, fetched 2026-06-29)
- [Next.js unstable_cache API reference](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) — MEDIUM confidence (official docs, deprecation status confirmed)
- [Prisma Turso documentation](https://www.prisma.io/docs/orm/v6/overview/databases/turso) — MEDIUM confidence (official Prisma docs)
- [Prisma parallel queries GitHub issue #13134](https://github.com/prisma/prisma/issues/13134) — LOW confidence (community issue, confirms sequential behavior only within transactions)
- [Next.js 16.2 unstable_cache vs use cache](https://www.buildwithmatija.com/blog/nextjs-16-2-caching-unstable-cache-vs-use-cache) — LOW confidence (community blog)

---

*Stack research for: Next.js 16 App Router performance optimization — RSC hydration, loading.tsx, Suspense streaming, Prisma parallel queries*
*Researched: 2026-06-29*
