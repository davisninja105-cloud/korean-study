# Feature Research

**Domain:** Next.js App Router performance UX — PWA spaced-repetition study app
**Researched:** 2026-06-29
**Confidence:** MEDIUM (Next.js docs are authoritative; skeleton UX claims are community-sourced)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that define "the app feels fast." Missing any of these = the current 2-3s blank-screen experience.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Route-level skeleton via `loading.tsx`** | Navigation should show instant visual feedback; blank white = broken | LOW | One file per route in `app/{route}/loading.tsx`; Next.js auto-wraps `page.tsx` in `<Suspense>`. Prefetched so navigation appears instant. No logic — pure static JSX. |
| **Cards page skeleton** | 400+ card list fetches from `/api/cards`; currently shows "no cards" flash while loading | LOW | Static skeleton: search bar placeholder + filter icon + N card row stubs (type-badge rectangle + two text lines). Must match SwipeRow height so no layout shift. |
| **Study page skeleton** | `phase='loading'` gap before due cards arrive; user sees blank then the mode selector | LOW | Static skeleton: progress ring placeholder + "N cards due" number stub + mode selector placeholder. The mode selector itself is interactive pre-data — it can render immediately. |
| **Home page RSC data hydration** | Stats (due count, mastered, lessons) and activity data should arrive with the HTML; currently both fetch via `useEffect` causing empty hero flash | MEDIUM | Convert `app/page.tsx` from `'use client'` to RSC. The hero's `dueCards` count, `masteredCount`, and `activityData` come from Prisma directly; no `/api/stats` or `/api/activity` round-trip. Pull-to-refresh requires client island — extract `<PullToRefreshWrapper>` as a client component receiving data as props. |
| **Habits page RSC data hydration** | Activity + mastered count fetch via `useEffect`; all data is static per-render and available server-side | MEDIUM | Convert `app/habits/page.tsx` to RSC. `prisma.studyDay.findMany()` + `prisma.card.count()` + `getHabitSettings()` called directly. All pure computation helpers (`computeStreaks`, `computeHabitStats`) run on server before render. |
| **Parallel DB queries in `/api/cards/due`** | 3 serial awaits (card pool, edges, knownLemmas) where pool and knownLemmas have no dependency on each other | LOW | Wrap `getSessionSize()`, the card pool query, and knownLemmas query in `Promise.all()`. Edges query runs after pool resolves (needs card IDs). Expected: shaves 200-400ms on a Turso round-trip. |
| **No empty-state flash on navigation** | Users navigating to Cards while cards load should never see "No cards yet" text momentarily | LOW | Achieved automatically once `loading.tsx` skeleton is in place — Suspense boundary prevents the empty branch from rendering until data arrives. |

### Differentiators (Competitive Advantage)

Features that make "fast" feel polished rather than merely adequate.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Shimmer animation on skeletons** | Wave animation (left-to-right shimmer) makes wait feel shorter than pulse/fade; matches iOS native feel | LOW | Pure CSS `@keyframes shimmer` + `background: linear-gradient(90deg, ...)` — no new packages. Project already has `ringFill` keyframe in `globals.css` as a model. Must add `prefers-reduced-motion` counterpart in same commit (established project invariant). |
| **Cards page RSC+Client split** | Cards list arrives with the HTML; client state hydrated from props; eliminates the initial fetch round-trip entirely | HIGH | Tricky: cards page has heavy client interactivity (search, filter, swipe-delete, edit sheet). Pattern: RSC `app/cards/page.tsx` fetches `cards` + `lessons`, passes as props to `'use client'` `<CardsClient>` component. Client handles all mutations against local state. |
| **Study page progressive reveal** | Show mode selector immediately (it is interactive and needs no data), stream in the "N due" count and progress ring separately | MEDIUM | Page chrome (mode selector, filter button) renders instantly. Due-count section wrapped in `<Suspense>` streams from server. Requires splitting study page into RSC shell + client islands. |
| **`useLinkStatus` nav indicator** | Show subtle loading pulse on the Nav tab being navigated to while the route skeleton renders | LOW | Next.js 16 ships `useLinkStatus` hook — returns `pending` during navigation. Wire into `Nav.tsx` to show a `bg-button/20` pulse on the active tab. Zero data dependency. Nav is already a client component. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Granular per-card Suspense boundaries** | "Stream each card as it loads" | Each card resolves at the same time (one query); individual boundaries create visual pop-in of 400+ elements simultaneously with no benefit | One `<Suspense>` around the whole cards list — show full skeleton until all cards arrive |
| **SWR / React Query for initial data** | Cache invalidation, background refresh | Adds ~18KB bundle; RSC + server data already handles initial load; mutations are too infrequent to need polling | RSC for initial load; client `fetch` for mutations (add/delete/edit) using the existing pattern |
| **`loading.tsx` on the layout level** | "Cover everything including the Nav during navigation" | Next.js `loading.tsx` does NOT wrap `layout.js` in the same segment — the Nav stays visible during transitions (correct behavior). Attempting to create a layout-level skeleton would break the Nav UX. | Keep Nav in layout, let `loading.tsx` cover only the page content area below the Nav |
| **Optimistic UI for card deletion** | "Remove card immediately on swipe" | If DELETE fails, card silently disappears; confusing for the user | Keep the existing confirm-then-delete pattern; perceived delay is in the initial list fetch, not the delete interaction |
| **Skeleton for sub-300ms pages** | "Show skeleton on every route" | At sub-300ms, a skeleton flash is worse than a brief blank — the flicker is jarring | Only add `loading.tsx` to routes with measured latency: Cards, Study, Home, Habits. Skip `/settings` and `/wrapped` if their loads are already fast |

## Feature Dependencies

```
loading.tsx (any route)
    └──requires──> page.tsx fetches its own data (not layout.tsx)
                   (layout.tsx uncached data access blocks loading.tsx from firing)

RSC Home Page
    └──requires──> PullToRefreshWrapper extracted as client island
                       └──uses──> usePullToRefresh hook (already client-side)
                   └──requires──> Band-up detection moved to client island
                                      (reads localStorage — client only)
                   └──requires──> Greeting moved to client island
                                      (uses Date.now() — impure, client only)

RSC Habits Page
    └──requires──> No client hooks remaining in habits/page.tsx
                   (useMemo, useState must move to child client components)

Cards Page RSC+Client Split
    └──requires──> CardsClient component receives initialCards + initialLessons as props
                       └──requires──> Props interface typed for server-to-client boundary

Parallel DB queries (/api/cards/due)
    └──requires──> knownLemmas query separated from edges query
                   (knownLemmas is independent of pool; edges needs pool IDs first)

Shimmer animation
    └──requires──> prefers-reduced-motion counterpart in same commit (project invariant)

useLinkStatus nav indicator
    └──requires──> Nav.tsx as client component (already is — uses haptic())
```

### Dependency Notes

- **RSC Home requires client islands:** Three behaviors are client-only and must be extracted: (1) `usePullToRefresh` touch hook, (2) `localStorage` band-up detection + confetti, (3) greeting string from `Date.now()`. The RSC page fetches data; a `<HomeClient stats={...} activityData={...}>` component handles all three.
- **layout.tsx constraint check:** The app's `layout.tsx` injects CSS variables from DB settings. This runs server-side at render time. As long as it does not call `cookies()`, `headers()`, or make uncached `fetch()` calls, `loading.tsx` will fire correctly. Confirm before adding any `loading.tsx` file.
- **Parallel DB queries are safe:** `getSessionSize()`, the card pool query (`prisma.card.findMany`), and the knownLemmas query (`prisma.card.findMany({ where: { review: { state: { gte: 1 } } } })`) all have zero inter-dependency. The edges query depends on pool card IDs, so it runs after `Promise.all` resolves.

## MVP Definition

### Ship in v1.2 (current milestone — the performance milestone)

- [ ] `loading.tsx` for `/cards` — Eliminates empty-state flash; highest user-facing impact; lowest complexity
- [ ] `loading.tsx` for `/study` — Eliminates blank loading phase before mode selector
- [ ] `loading.tsx` for `/` (home) — Covers the hero empty state while stats load
- [ ] `loading.tsx` for `/habits` — Consistent navigation feel across all 4 main routes
- [ ] Parallel DB queries in `/api/cards/due` — Server-side speed; single-file change; no user-facing complexity
- [ ] RSC home page — Eliminates 2-pass render (mount → fetch → render data); highest perceived impact
- [ ] RSC habits page — Same pattern as home; habits data is fully server-renderable

### Add After v1.2 (v1.3 or opportunistic)

- [ ] Cards page RSC+Client split — Higher complexity; requires `<CardsClient>` extraction; do after simpler RSC conversions are proven
- [ ] Shimmer animation on skeletons — Pure CSS polish; add once skeletons ship and UX is validated
- [ ] `useLinkStatus` nav indicator — Low complexity but lowest priority; navigation already feels instant with skeletons

### Future Consideration (v2+)

- [ ] Study page progressive reveal — Streaming mode selector + due count separately; only worthwhile if simple `loading.tsx` approach does not feel fast enough
- [ ] Service worker caching for static assets — PWA offline support; separate milestone concern

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `loading.tsx` for all 4 routes | HIGH | LOW | P1 |
| Parallel DB queries in `/api/cards/due` | HIGH | LOW | P1 |
| RSC home page | HIGH | MEDIUM | P1 |
| RSC habits page | HIGH | MEDIUM | P1 |
| Cards page RSC+Client split | MEDIUM | HIGH | P2 |
| Shimmer animation | MEDIUM | LOW | P2 |
| `useLinkStatus` nav indicator | LOW | LOW | P3 |
| Study page progressive reveal | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Ships in v1.2 — directly eliminates the blank-state problem described in PROJECT.md
- P2: Ships when P1 is stable — UX polish on top of working skeleton layer
- P3: Nice to have; revisit in v1.3

## Implementation Notes by Route

### /cards (Cards page)

**Current:** `'use client'`, `useEffect -> fetch('/api/cards')`, renders empty list on mount.

**Skeleton shape for `app/cards/loading.tsx`:**
- Search bar: `h-10 w-full rounded-xl bg-surface-2 animate-pulse`
- Filter row: `h-8 w-24 rounded-full bg-surface-2 animate-pulse`
- Card rows (8-10 items): `h-16 w-full rounded-lg bg-surface-2 animate-pulse` — height must match SwipeRow to avoid layout shift on reveal

**v1.2 approach:** Page stays `'use client'`. `loading.tsx` alone eliminates the empty-state flash — skeleton shows until client component hydrates and `useEffect` data arrives. Simplest migration path that satisfies PERF-01.

**v1.3 approach (RSC split):** RSC `app/cards/page.tsx` fetches `cards` + `lessons` server-side, passes to `'use client'` `<CardsClient initialCards={cards} initialLessons={lessons}>`. Client handles search/filter/delete/edit against local state seeded from props.

### /study (Study page)

**Current:** `'use client'`, `phase='loading'` blank state, then mode selector appears.

**Skeleton shape for `app/study/loading.tsx`:**
- Progress ring placeholder: `h-16 w-16 rounded-full bg-surface-2 animate-pulse`
- "N cards due" stub: `h-8 w-20 rounded bg-surface-2 animate-pulse`
- Mode selector placeholder: 3 pill buttons in muted/disabled appearance

**v1.2 approach:** `loading.tsx` only — page stays `'use client'`. The session itself (card flip, grading) is already instant client-side; PERF-07 is about confirming the grade buttons do not wait for API response before updating queue (they should not). Study page RSC conversion is deferred — the interactivity surface is too large.

### / (Home page)

**Current:** `'use client'`, two separate `useEffect` fetches for `/api/stats` and `/api/activity`.

**RSC conversion pattern:**
```tsx
// app/page.tsx — becomes async RSC
export default async function Home() {
  const [statsResult, activityResult] = await Promise.all([
    prisma.card.aggregate({ ... }),     // replaces GET /api/stats
    prisma.studyDay.findMany({ ... })   // replaces GET /api/activity
  ])
  return <HomeClient stats={statsResult} activityData={activityResult} />
}
```

**Client islands required:**
- `<HomeClient>` — owns usePullToRefresh, band-up detection (localStorage), confetti, greeting (Date.now())
- Greeting string: compute in `useEffect` on mount (already done this way to satisfy react-hooks/purity)

### /habits (Habits page)

**Current:** `'use client'`, `useEffect` fetches `/api/activity` and a mastered count.

**RSC conversion:** Simpler than Home — fewer client interactions. Page becomes async RSC. All computation (`computeStreaks`, `computeHabitStats`, `computeHabitInsight`) runs on server before render. Pass computed values as props to any thin client component needed for interactivity (none identified beyond links and the ProficiencyArc, which is a pure render component).

### /api/cards/due (DB query parallelization — PERF-06)

**Current serial execution:**
1. `await getSessionSize()` — DB
2. `await prisma.card.findMany(...)` — card pool
3. `await prisma.cardDependency.findMany(...)` — edges (depends on pool IDs)
4. `await prisma.card.findMany(...)` — knownLemmas (independent)

**Parallelized restructure:**
```ts
// Step 1: run all independent queries concurrently
const [sessionSize, cards, knownRows] = await Promise.all([
  getSessionSize(),
  prisma.card.findMany({ where: { ...lessonClause, review: ... }, include: { ... }, take: 1000 }),
  prisma.card.findMany({ where: { review: { state: { gte: 1 } } }, select: { normalizedFront: true } })
])

// Step 2: edges depend on card IDs (must run after pool)
const ids = cards.map((c) => c.id)
const edges = await prisma.cardDependency.findMany({ where: { cardId: { in: ids }, prerequisiteId: { in: ids } }, select: { cardId: true, prerequisiteId: true } })
```

This eliminates one full DB round-trip from the study session startup path.

## Sources

- [Next.js loading.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — MEDIUM confidence (official docs, version 16.2.9, fetched 2026-06-29)
- [Next.js Fetching Data guide](https://nextjs.org/docs/app/getting-started/fetching-data) — MEDIUM confidence (official docs, fetched 2026-06-29)
- [NN/G Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — MEDIUM confidence (authoritative UX research)
- [React Suspense documentation](https://react.dev/reference/react/Suspense) — MEDIUM confidence (official)
- [DEV.to: Complete Next.js Streaming Guide](https://dev.to/boopykiki/a-complete-nextjs-streaming-guide-loadingtsx-suspense-and-performance-9g9) — LOW confidence (community)
- [LogRocket: Skeleton loading screen design](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/) — LOW confidence (community)

---
*Feature research for: Next.js App Router performance UX (Korean SRS app)*
*Researched: 2026-06-29*
