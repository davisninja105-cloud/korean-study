# Pitfalls Research: RSC Conversion & Performance Hydration

**Domain:** Converting Next.js 16 / React 19 'use client' pages to RSC + client-shell pattern; adding loading.tsx skeletons; parallelizing Prisma/Turso queries
**Researched:** 2026-06-29
**Confidence:** MEDIUM (cross-checked against official Next.js docs + community verified issues)

---

## Critical Pitfalls

### Pitfall 1: Prisma Date objects passed to client components trigger a serialization warning — and silently corrupt the value

**What goes wrong:**
When a Server Component passes a Prisma query result that contains `Date` fields to a `'use client'` component as a prop, Next.js emits:
> `Warning: Only plain objects can be passed to Client Components from Server Components. Date objects are not supported.`

In development the warning fires but the prop still arrives as a string (because JSON serialization converts `Date` → ISO string). In production the behavior is the same but the warning may be suppressed — so the client component receives a `string` where TypeScript expects a `Date`. Any code that calls `.getTime()`, `.toLocaleDateString()`, or date-math on the prop will throw at runtime.

**Why it happens:**
JSON serialization destroys type information: `JSON.parse(JSON.stringify(new Date()))` returns a `string`, not a `Date`. The RSC wire protocol uses JSON for the server→client boundary. Prisma model fields typed as `DateTime` (e.g., `nextReview: Date`, `createdAt: Date`) cross this boundary as plain strings — TypeScript doesn't catch this because both sides are typed identically.

**How to avoid:**
Define a plain DTO interface for each data shape that crosses the boundary and serialize explicitly before passing as props:
```typescript
// In the RSC (server side), before passing to client shell:
type CardDto = {
  id: string
  front: string
  nextReviewMs: number  // number, not Date
  createdAt: string     // ISO string, not Date
}

function toCardDto(card: Card & { review: CardReview | null }): CardDto {
  return {
    id: card.id,
    front: card.front,
    nextReviewMs: card.review?.nextReview?.getTime() ?? 0,
    createdAt: card.createdAt.toISOString(),
  }
}
```
Never pass a raw Prisma result object as a client component prop. Always map to a DTO first.

**Warning signs:**
- TypeScript errors like `Argument of type 'string' is not assignable to parameter of type 'Date'` in client components that receive server-fetched data
- `new Date(props.someDate).getTime()` returns `NaN` in the browser (the value was already a string)
- Console warning about "Date objects are not supported" during dev

**Phase to address:** Every phase that introduces a new RSC → client component data flow. Establish the DTO pattern in the first RSC conversion phase (PERF-01/02) and enforce it throughout.

---

### Pitfall 2: loading.tsx does NOT show on initial page load — only on client-side navigation

**What goes wrong:**
Developers add `loading.tsx` expecting it to eliminate the blank-screen flash on first page load. It does not. On the initial server render, Next.js streams the full HTML (including the awaited data). `loading.tsx` only triggers as a Suspense fallback during *client-side navigation* between routes, when prefetching is active. In `next dev`, prefetching is disabled, so `loading.tsx` appears to do nothing at all during development testing.

**Why it happens:**
`loading.tsx` is syntactic sugar that wraps `page.tsx` in a `<Suspense>` boundary with the loading component as the fallback. On SSR, React renders right through the Suspense boundary — the fallback is only used when the boundary suspends during a client-side re-render. First load = SSR = no suspension = no fallback.

**How to avoid:**
- Understand the two separate problems: (1) first-load slowness and (2) navigation transition jank. `loading.tsx` solves (2). Solving (1) requires RSC data fetching so the data arrives with the HTML, or Suspense with streaming on the server side.
- Test loading states in production (`next build && next start`), not `next dev`. In dev, prefetching is off and the loading state may not appear during navigation either.
- For first-load skeleton coverage, use inline `<Suspense>` boundaries in the RSC with skeleton fallbacks: individual slow components suspend while the page shell renders immediately.

**Warning signs:**
- `loading.tsx` appears to do nothing when tested locally
- The skeleton flashes briefly but the "blank before content" problem persists on first load
- Confusion between "why is my skeleton not showing on first load?" — because it was never supposed to

**Phase to address:** PERF-01 (Cards skeleton) and PERF-02 (Study skeleton). Document in phase plan that `loading.tsx` covers navigation; RSC streaming covers first-load.

---

### Pitfall 3: Fetching data inside layout.tsx blocks the loading.tsx fallback for all children

**What goes wrong:**
If `app/layout.tsx` or any segment layout contains an `await` for runtime data (e.g., `await prisma.setting.findMany()` for the button color), `loading.tsx` does NOT show a fallback for that layout-level fetch. The entire navigation is blocked until the layout resolves, and the "instant loading state" benefit of `loading.tsx` is lost. The user sees no feedback for the duration of that layout await.

From the official Next.js docs:
> "If the layout accesses uncached or runtime data (e.g. cookies(), headers(), or uncached fetches), loading.js will not show a fallback for it. Without Cache Components: Navigation blocks until the layout finishes rendering."

**Why it happens:**
`loading.tsx` wraps `page.tsx` in a Suspense boundary, but it does NOT wrap `layout.tsx` in the same segment. The layout renders first, blocking rendering of the Suspense shell. This is by design — layouts are supposed to be structural scaffolding, not data loaders.

**How to avoid:**
Keep `app/layout.tsx` structural-only. The current app already fetches `buttonColor` and `rewardColor` from the DB in layout to inject CSS variables — this is safe because those values are unlikely to be slow, but be aware the pattern exists. For any new per-request data need in a layout, either:
1. Move the fetch into `page.tsx` instead
2. Wrap the data-dependent section in its own `<Suspense>` with a fallback

**Warning signs:**
- Navigation feels slow even after adding `loading.tsx`
- The skeleton appears but only after a delay (the delay is the layout await)
- Profiling shows the TTFB includes a full DB round-trip before any content streams

**Phase to address:** PERF-05 (navigation instant feedback). Audit `app/layout.tsx` for any async data access before implementing `loading.tsx`.

---

### Pitfall 4: Promise.all fails atomically — one Turso query failure crashes the entire parallel fetch

**What goes wrong:**
Converting three serial Prisma calls to `Promise.all([q1, q2, q3])` (PERF-06) means a transient Turso network hiccup on any one query rejects the entire `Promise.all`. The route returns a 500 and the client sees an error screen instead of partial data.

The current serial implementation has an implicit benefit: query 2 only runs if query 1 succeeds. With `Promise.all`, all three run simultaneously but all three must succeed.

**Why it happens:**
`Promise.all` rejects with the first rejection. Unlike `Promise.allSettled`, it does not wait for remaining promises.

**How to avoid:**
Use `Promise.allSettled` when partial success is acceptable, or wrap the `Promise.all` in try/catch and return a degraded response:
```typescript
// Preferred for /api/cards/due where all queries are required:
try {
  const [cards, edges, knownLemmas] = await Promise.all([
    prisma.card.findMany(/* ... */),
    prisma.cardDependency.findMany(/* ... */),
    prisma.cardReview.findMany(/* ... */),
  ])
  // proceed
} catch (e) {
  return NextResponse.json({ error: 'Query failed' }, { status: 500 })
}

// For independent queries where partial results are useful, use allSettled:
const results = await Promise.allSettled([statsQuery, activityQuery])
const stats = results[0].status === 'fulfilled' ? results[0].value : null
const activity = results[1].status === 'fulfilled' ? results[1].value : null
```

For Turso specifically: libSQL over HTTP does not use a traditional connection pool — each query is a separate HTTP/2 request. Concurrent queries are safe and will not exhaust connections. The risk is Turso's rate limit on the free plan, not a pool ceiling.

**Warning signs:**
- Sporadic 500 errors on the cards/due endpoint after parallelizing
- Errors that reproduce in production but are hard to reproduce locally (Turso latency variance)
- "PrismaClientKnownRequestError" propagating up from a parallel fetch

**Phase to address:** PERF-06 (`/api/cards/due` parallelization). Wrap the `Promise.all` in try/catch; consider `Promise.allSettled` for the home page stats + activity fetch pair.

---

### Pitfall 5: 'use client' boundary placement too high — entire page tree loses RSC benefits

**What goes wrong:**
When converting a page from `'use client'` to RSC, the temptation is to extract the data-fetching into the RSC wrapper and keep the existing `'use client'` page component as the "client shell." If the client shell's `'use client'` directive is placed too high (e.g., at the top of a file that imports and renders many sub-components), all of those sub-components are pulled into the client bundle, even static ones.

For this app: `StudySession.tsx` is genuinely interactive (state, effects, event handlers) and must stay `'use client'`. But the surrounding shell (the route wrapper that fetches initial cards and passes them as `initialCards` prop) should be an RSC. The mistake is making the entire `app/study/page.tsx` a client component just because `StudySession` is.

**Why it happens:**
`'use client'` is contagious upward — any module that imports a `'use client'` component must itself either be a client component or explicitly import the client component through a client boundary. But it is NOT contagious downward through props. An RSC can import and render a client component; the client component's subtree becomes client-rendered, but the RSC remains server-rendered.

**How to avoid:**
The RSC + client shell pattern:
```typescript
// app/study/page.tsx — RSC (no 'use client')
import StudySession from '@/components/StudySession'  // This is 'use client'

export default async function StudyPage() {
  const initialCards = await fetchDueCards()  // runs on server
  return <StudySession initialCards={toCardDtos(initialCards)} />
}
```
`StudySession` stays `'use client'`. The page is RSC. Data fetching happens server-side. No hydration of the data-fetching logic.

**Warning signs:**
- Bundle size increases after the "RSC conversion" (should decrease or stay flat)
- The Network tab shows the page fetching data client-side after load (defeats the purpose)
- TypeScript complaining that a server-only import (Prisma, `lib/settings.ts`) is being used in a client component

**Phase to address:** All RSC conversion phases (PERF-01, PERF-02, PERF-03, PERF-04).

---

### Pitfall 6: Missing error boundary causes RSC fetch errors to crash the whole page in production

**What goes wrong:**
When a Server Component awaits a Prisma query and the query throws (Turso connection issue, timeout), Next.js propagates the error to the nearest `error.tsx` boundary. If there is no `error.tsx` in the route segment, the error propagates to the root layout's error handler — or worse, it results in an unhandled error that sends a blank 500 response.

In development you see the full error stack. In production you see a generic "An error occurred in the Server Components render" message, stripping sensitive details. Users see a full-page crash from what might be a transient network issue.

**Why it happens:**
RSC errors do not have a React equivalent of try/catch at the component level (you can't catch inside an async RSC and return a fallback from the same component). Error recovery requires `error.tsx` boundaries.

**How to avoid:**
- Add `app/study/error.tsx` and `app/cards/error.tsx` alongside each new RSC page
- For non-critical data (e.g., habit stats on the home page), use a try/catch inside the RSC and return null/empty-state instead of crashing:
```typescript
// Graceful degradation for non-critical data
let stats = null
try {
  stats = await prisma.studyDay.aggregate(/* ... */)
} catch {
  // stats stays null; render empty state
}
```
- For critical data (study session cards), let it throw and rely on `error.tsx` to show a retry UI

**Warning signs:**
- Blank white page in production when Turso has latency spikes
- Console showing "Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details"
- No `error.tsx` files alongside new RSC page files

**Phase to address:** PERF-01 and PERF-02 (first RSC conversions). Establish the error boundary pattern early.

---

### Pitfall 7: React 19 hydration mismatch from time/random values in RSC-to-client data flow

**What goes wrong:**
A hydration mismatch occurs when the server-rendered HTML does not match the client's first render output. In React 19 this produces an error like "Hydration failed because the initial UI does not match what was rendered on the server." React 19 improved the error message to show a diff, but the crash is real.

Common causes in this app's RSC conversion:
1. Rendering `new Date().toLocaleDateString()` in a server component — the server locale may differ from the client locale
2. Using `Date.now()` or `Math.random()` at module scope (banned by `react-hooks/purity` but possible in RSC files outside of hooks)
3. Passing a `Date` from server and re-constructing it client-side with `new Date(props.dateStr)` — if the formatting differs between SSR and client hydration

**Why it happens:**
RSCs render on the server; the HTML is sent to the browser. React then "hydrates" by re-running component rendering on the client and matching the output to the existing DOM. Any difference between server output and client re-render causes a mismatch crash.

**How to avoid:**
- Never render locale-formatted dates in RSCs. Pass the raw ISO string and format client-side inside a `useEffect` or with `suppressHydrationWarning`
- The existing `react-hooks/purity` ESLint rule already catches `Date.now()` in render; verify this rule also applies to RSC files (it should — ESLint applies file-wide)
- For timestamps that are display-only, render them client-side by deferring to a `'use client'` component that formats on mount

**Warning signs:**
- "Hydration failed" errors in the browser console after RSC conversion
- Components that display dates show the wrong date or a brief flicker on first load
- `suppressHydrationWarning` appearing as a "fix" without understanding the root cause

**Phase to address:** PERF-03 (Home RSC) and PERF-04 (Habits RSC), which both display dates and streak counts.

---

### Pitfall 8: Prisma singleton safety with concurrent RSC renders

**What goes wrong:**
Multiple RSC renders can execute simultaneously in a single Node.js process (during SSR of different user requests). If the Prisma singleton is initialized in a way that is not safe for concurrent use, or if a Prisma query is accidentally awaited inside a module-level singleton initializer (blocking the event loop), concurrent requests can queue up.

**Why it happens:**
The existing `lib/prisma.ts` singleton pattern is correct for the libSQL adapter (one `PrismaClient` instance, reused). The libSQL adapter uses HTTP transport (one request per query), so there is no shared connection that could deadlock. However, Prisma's Query Engine (used with traditional SQL databases) is not HTTP-based — it can have connection pool limits. Since this app uses libSQL via `@prisma/adapter-libsql`, concurrent queries are safe.

**How to avoid:**
- Leave `lib/prisma.ts` unchanged. The existing pattern (lazy singleton via `global.__prisma`) is correct and safe for RSC concurrent renders with libSQL.
- Do not initialize a new `PrismaClient` inside individual RSC files. Import from `lib/prisma.ts`.
- Avoid any module-level `await` statements outside of route handlers and RSC `export default` functions.

**Warning signs:**
- "Too many connections" errors (not expected with libSQL/Turso — would indicate wrong adapter)
- Queries completing out of order in ways that corrupt data (not possible with the libSQL HTTP adapter)
- Memory leak from multiple `PrismaClient` instances (caught by the global singleton pattern)

**Phase to address:** All RSC phases. Establish the rule "always import prisma from `@/lib/prisma`" as a convention check in code review.

---

### Pitfall 9: Suspense waterfall — sequential async components inside a single Suspense boundary

**What goes wrong:**
Wrapping an entire page in one `<Suspense>` boundary, where the page component awaits query A, then passes results to a child that awaits query B, creates a waterfall. The Suspense fallback shows until query A AND query B both complete, sequentially. The user waits the sum of both query times, not the maximum.

**Why it happens:**
Sequential `await` calls are sequential. Even inside a Suspense boundary, the async operations resolve in series.

**How to avoid:**
Kick off all queries simultaneously before the first `await`:
```typescript
// WRONG — sequential (waterfall)
export default async function CardsPage() {
  const cards = await prisma.card.findMany(...)
  const lessons = await prisma.lesson.findMany(...)
  return <CardList cards={cards} lessons={lessons} />
}

// CORRECT — parallel
export default async function CardsPage() {
  const [cards, lessons] = await Promise.all([
    prisma.card.findMany(...),
    prisma.lesson.findMany(...),
  ])
  return <CardList cards={cards} lessons={lessons} />
}
```

For independent sections of a page, split into separate async RSC components each wrapped in their own `<Suspense>`:
```typescript
export default function Page() {
  return (
    <>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />  {/* async RSC — fetches stats */}
      </Suspense>
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivitySection />  {/* async RSC — fetches activity */}
      </Suspense>
    </>
  )
}
```

**Warning signs:**
- Network waterfall in the browser's Timing tab (queries starting one after another instead of simultaneously)
- Page takes sum(all_query_times) instead of max(all_query_times) to load
- A single Suspense fallback that stays visible for the full duration of all data loading

**Phase to address:** PERF-03 (Home), PERF-04 (Habits), PERF-06 (cards/due parallelization).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Pass raw Prisma result to client component (no DTO) | No mapping code to write | Runtime type mismatch when Prisma adds a `Date` or `Decimal` field; serialization warning in console; silent bugs | Never — always map to plain DTO |
| `suppressHydrationWarning` without fixing root cause | Silences hydration error | Masks real date/time/locale mismatches; error reappears if the component changes | Only for genuinely unavoidable server/client differences (e.g., user agent display) |
| Skip `error.tsx` alongside new RSC pages | Faster to ship | Transient Turso network errors produce blank white screens in production | Never for pages that await Prisma queries |
| Single `<Suspense>` around entire page | Simple to implement | Blocks all content until all data resolves; no streaming benefit | Only if all data is fast (sub-50ms total) |
| Fetch all data in `layout.tsx` | Centralizes data access | Blocks `loading.tsx` fallback; navigation feels slow; layout re-fetches on every navigation | Never for slow/uncached data |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Prisma + RSC | Passing `card.createdAt` (a `Date`) directly as a prop to a `'use client'` component | Convert to `card.createdAt.toISOString()` before passing; define a DTO type with `string` for all date fields |
| Turso + Promise.all | Assuming connection pool limits constrain concurrency | libSQL uses HTTP transport — each query is a separate HTTP/2 request; no pool ceiling. Worry about Turso free-tier rate limits instead |
| `loading.tsx` + `layout.tsx` | Assuming `loading.tsx` covers layout-level data fetches | It does not. Only `page.tsx` content is wrapped. Move runtime data fetches out of layouts |
| RSC + `'use client'` types | Importing a Prisma model type into a `'use client'` file for prop typing | Define a plain DTO interface in a shared file (no Prisma import); use that for both the RSC and the client component |
| Next.js dev + `loading.tsx` | Testing navigation loading states in `next dev` | Prefetching is disabled in dev; run `next build && next start` to see actual loading behavior |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential awaits in RSC | Slow page load; sum of all query times | Use `Promise.all` for independent queries; split into Suspense-wrapped async child components | Immediately, at any scale |
| Overfetching in RSC (selecting all columns) | Large HTML payloads; slow hydration | Select only columns the client component uses in the Prisma `select` clause | At scale; noticeable with Sentence[] arrays |
| Passing large arrays from RSC to client | JS bundle-like overhead in the RSC payload | Pre-filter and shape data server-side; pass only what renders above the fold | When card/sentence arrays exceed ~100 items |
| Stale RSC cache after card review | User reviews a card; navigates back; sees old due count | Call `router.refresh()` after a successful review POST; or use `revalidatePath('/study')` in a server action | Immediately in production where RSC payloads may be cached |

---

## "Looks Done But Isn't" Checklist

- [ ] **RSC conversion**: Verify the Network tab shows no client-side data fetch for initial load — the data should arrive with the HTML (look for no `fetch()` calls for cards/stats in the console after the page loads)
- [ ] **loading.tsx**: Verify it appears on navigation (test with `next build && next start`, not `next dev`); confirm it does NOT show on hard reload (first load)
- [ ] **Date serialization**: Grep the codebase for any prop that types a `Date` flowing from RSC to client component — all should be `string` or `number` on the client side
- [ ] **Error boundaries**: Confirm `error.tsx` exists alongside each new RSC `page.tsx` in `app/study/`, `app/cards/`, `app/` (home), and `app/habits/`
- [ ] **Promise.all error handling**: Confirm each `Promise.all` is wrapped in try/catch; confirm the fallback behavior matches requirements (full-page error vs. empty state)
- [ ] **Stale data after review**: Navigate to study page → review a card → navigate to home → confirm due count updated (RSC payload may be stale without a `router.refresh()` call)

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Prisma Date serialization | PERF-01 (first RSC conversion — establishes DTO pattern) | TypeScript compiles without `Date` in client prop types; no console warnings in dev |
| loading.tsx triggers only on navigation | PERF-05 (navigation feedback) | Test in `next start`; loading state visible during tab switches; NOT visible on hard reload |
| Layout data blocks loading.tsx | PERF-05 | Navigation instant feedback confirmed; no layout awaits for runtime data |
| Promise.all atomic failure | PERF-06 (parallel DB queries) | Simulate Turso timeout; route returns 500 cleanly, not a crash |
| 'use client' boundary too high | PERF-01/02/03/04 (all RSC conversions) | Bundle analysis before/after; no increase in client bundle size |
| Missing error boundary | PERF-01/02 (first two RSC pages) | Confirm `error.tsx` created alongside each new RSC page |
| React 19 hydration mismatch | PERF-03/04 (Home + Habits with dates) | No "Hydration failed" errors; date display consistent between SSR and client |
| Prisma singleton concurrency | All RSC phases | All RSC files import from `@/lib/prisma`; no local `new PrismaClient()` instantiation |
| Suspense waterfall | PERF-03/04/06 | Network timeline shows queries firing in parallel; page load time ≤ max(query_times) |

---

## Sources

- [Next.js loading.js API Reference](https://nextjs.org/docs/app/api-reference/file-conventions/loading) (HIGH confidence — official docs)
- [Warning: Only plain objects can be passed to Client Components — vercel/next.js Discussion #46137](https://github.com/vercel/next.js/discussions/46137) (MEDIUM confidence — community verified)
- [Client extensions, decimal, serialization and RSC — prisma/prisma Discussion #19983](https://github.com/prisma/prisma/discussions/19983) (MEDIUM confidence — community + Prisma team)
- [6 React Server Component performance pitfalls in Next.js — LogRocket](https://blog.logrocket.com/react-server-components-performance-mistakes) (MEDIUM confidence — community verified)
- [Next.js App Router waits for server response before showing loading.tsx — vercel/next.js Discussion #68763](https://github.com/vercel/next.js/discussions/68763) (MEDIUM confidence — community + maintainer response)
- [React v19 blog post — hydration improvements](https://react.dev/blog/2024/12/05/react-19) (HIGH confidence — official React blog)
- [Next.js hydration error docs](https://nextjs.org/docs/messages/react-hydration-error) (HIGH confidence — official docs)
- [Prisma Date type serialization issue — prisma/prisma Discussion #4428](https://github.com/prisma/prisma/discussions/4428) (MEDIUM confidence — community)
- [Common Next.js App Router mistakes — upsun.com](https://upsun.com/blog/avoid-common-mistakes-with-next-js-app-router/) (MEDIUM confidence — community)
- [Prisma + Turso documentation](https://www.prisma.io/docs/orm/overview/databases/turso) (HIGH confidence — official Prisma docs)

---
*Pitfalls research for: RSC conversion, loading.tsx, Suspense streaming, Prisma/Turso parallelization — Korean Study app v1.2*
*Researched: 2026-06-29*
