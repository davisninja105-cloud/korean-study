# Project Research Summary: Korean Study v1.2 Performance & Snappiness

**Project:** Korean Study — v1.2 Performance & Snappiness  
**Domain:** Next.js App Router performance UX optimization for PWA spaced-repetition study app  
**Researched:** 2026-06-29  
**Confidence:** HIGH

---

## Executive Summary

Version 1.2 solves the "blank page flash" problem (currently 2–3 second wait for data on navigation) through a combination of Server-Side Rendering (RSC), skeleton loading screens, and database query parallelization. No new npm packages required — all capabilities (RSC, `loading.txt`, `React.cache`, `Promise.all`, Suspense streaming) are built into Next.js 16 and React 19 already.

The recommended approach: (1) convert the four main pages (`/cards`, `/study`, `/habits`, `/`) from `'use client'` + `useEffect` fetch to async Server Components that call Prisma directly, passing data as props to renamed client shell components; (2) add skeleton `loading.txt` files to eliminate blank-screen flashes during navigation; (3) parallelize the three independent Prisma queries in `/api/cards/due` to shave 200–400ms off study-session startup.

The core risk is proper Date/DateTime serialization across the RSC→client boundary — Prisma returns `Date` objects which JSON-serialize to strings, causing silent type mismatches in client code. Prevention: define plain DTO interfaces for cross-boundary props and explicitly convert all Date fields to ISO strings or epoch milliseconds before passing to client components.

---

## Key Findings

### Recommended Stack

**No new packages needed.** Every performance pattern in v1.2 is achievable with the existing tech stack:

- **Next.js 16 App Router**: Async server components, `loading.txt` skeleton convention, implicit `<Suspense>` page wrapping, streaming SSR
- **React 19**: `React.cache()` for per-request deduplication, `<Suspense>` boundary primitive, `use()` API for promise streaming
- **Prisma 7 + `@prisma/adapter-libsql`**: Direct ORM calls in async server components (replaces client-side `fetch('/api/...')` round-trips); `Promise.all()` for parallel queries works correctly outside transactions with libSQL's HTTP transport
- **TypeScript 5.9.3**: Async page type signatures (`async function Page()` returns `Promise<JSX.Element>`) compile without modification

The existing Prisma singleton in `lib/prisma.ts` and libSQL adapter are already optimized for concurrent RSC renders (libSQL uses HTTP/2 transport, not a shared connection pool).

### Expected Features (v1.2 MVP)

**Must have (eliminates blank-page problem):**
- `loading.txt` skeletons for `/cards`, `/study`, `/`, `/habits` — instant visual feedback on navigation
- RSC hydration for Home page — stats (due count, mastered, lessons) + activity arrive with HTML, eliminate 2-pass render
- RSC hydration for Habits page — all computation runs server-side, no loading flash
- Parallel DB queries in `/api/cards/due` — independent queries run concurrently, shave 200–400ms

**Should have (UX polish):**
- Cards page RSC+Client split — higher complexity; deferred to v1.3 after simpler conversions prove the pattern
- Shimmer animation on skeletons — pure CSS; nice-to-have after basic skeletons ship
- `useLinkStatus` nav indicator — low priority; navigation already feels instant with skeletons

**Defer (v2+):**
- Study page progressive reveal (streaming mode selector separately)
- Service worker caching for offline PWA support

### Architecture Approach

The solution follows the **RSC + Client Shell pattern**: async Server Components fetch from Prisma and pass serialized data as props to renamed client shell components (`'use client'`). Each page route gets a skeleton `loading.txt` that Next.js automatically uses as a Suspense fallback during client-side navigation. Data arrives with the initial HTML; no client-side fetch on mount. Mutations (add/edit/delete card) still flow through existing API routes and trigger client-side refetches to update local state.

**Major components:**
1. **Async Page Server Components** (`app/X/page.tsx`) — fetch Prisma data in parallel, pass as props to shell
2. **Client Shell Components** (`components/XPageClient.tsx`) — receive initial data as props, manage all interactive state
3. **Skeleton Fallbacks** (`app/X/loading.txt`) — static skeleton JSX shown during server component render + navigation
4. **Data Transfer Objects (DTOs)** — plain JavaScript objects with all Date fields converted to ISO strings or epoch ms; prevent serialization mismatches
5. **Error Boundaries** (`app/X/error.tsx`) — recovery UI for transient Turso/Prisma failures

### Critical Pitfalls

1. **Prisma Date objects fail silently when passed to client components.** `Date` objects serialize to ISO strings across the RSC boundary; TypeScript doesn't catch this. Client code calling `.getTime()` or `.toLocaleDateString()` on what it thinks is a `Date` receives a `string` instead. Prevention: define DTO interfaces with `date: string` (ISO) or `dateMs: number` (epoch) for all cross-boundary props. Convert in the server component before passing.

2. **`loading.txt` only shows on client-side navigation, not first load.** Developers expect skeletons to cover initial page load; they don't. `loading.txt` is a Suspense fallback that only triggers on client-side route transitions. First-load slowness is solved by RSC hydration (data with HTML). In `next dev` prefetching is disabled, so the skeleton may not appear at all during testing. Prevention: test in production build (`next build && next start`); understand the two problems separately (first-load speed via RSC, navigation jank via `loading.txt`).

3. **Data fetches in `layout.tsx` block `loading.txt` fallback.** If the root or segment layout awaits runtime data (e.g., `await prisma.setting.findMany()` for button colors), the entire navigation blocks until that layout resolves — the skeleton never shows. Prevention: keep `layout.tsx` structural-only. Move runtime data fetches to `page.tsx`. For essential layout data, wrap it in its own `<Suspense>` boundary with a minimal fallback.

4. **`Promise.all` fails atomically — one Turso timeout crashes the entire parallel fetch.** Converting three serial queries to `Promise.all([q1, q2, q3])` means any transient Turso latency on one query rejects the whole batch. The route returns 500; user sees an error screen. Prevention: wrap `Promise.all` in try/catch and return a degraded response (e.g., `{ error: 'Query failed' }` with status 500). Consider `Promise.allSettled` for independent queries where partial success is acceptable.

5. **`'use client'` boundary placed too high pulls entire component tree into client bundle.** Placing `'use client'` on an RSC page wrapper defeats the purpose — everything gets bundled client-side. Prevention: keep `'use client'` only on the shell component. The page route stays RSC. Data fetching happens server-side. Sub-components like `StudySession` (genuinely interactive) stay `'use client'` but are passed data as props from the RSC.

---

## Implications for Roadmap

Research suggests a **5-phase structure** (all in v1.2):

### Phase 1: Cards Page — Establish RSC + Client Shell Pattern
**Rationale:** Simplest conversion; static initial data, pure client-side filtering, no phase state machine. Establishes the pattern for more complex pages.  
**Delivers:** Skeleton-less blank flash on Cards page navigation; initial card list hydrated from server; search/filter work client-side.  
**Implements:** `app/cards/page.tsx` (RSC, Prisma fetch) + `components/CardsPageClient.tsx` (client shell) + `app/cards/loading.txt` (skeleton).  
**Addresses:** PERF-01 (eliminates empty-state flash).  
**Avoids:** Pitfall #1 (Date serialization — establish DTO pattern here), Pitfall #5 (`'use client'` boundary at shell level, not page).  
**Validation gates:** No client `useEffect` fetch on initial load; skeleton shows on navigation in production build; search/filter/mutations work.

### Phase 2: Habits Page — Validate Computed State from Props
**Rationale:** Simpler than Home/Study; pure read, no re-fetch, all computation (`useMemo` calls) runs server-side. Validates that derived state works correctly on first render.  
**Delivers:** Habit stats (streak, heatmap, mastered count) render instantly with no loading flash.  
**Implements:** `app/habits/page.tsx` (RSC, parallel Prisma queries) + `components/HabitsPageClient.tsx` (client shell) + `app/habits/loading.txt`.  
**Addresses:** PERF-04 (eliminates blank habit stats on navigation).  
**Avoids:** Pitfall #3 (no runtime data fetches in layout); Pitfall #2 (understand that skeleton covers navigation, not first load).  
**Validation gates:** Streak + heatmap render correctly on first paint; `today` derived correctly from `dayStartHour` prop.

### Phase 3: Home Page — Parallel Stats + Activity, Optional Data Props
**Rationale:** Introduces parallel data-fetching pattern (`Promise.all` for stats + activity); requires modifying `HabitTracker` to accept optional data props; first RSC that has client islands (`<HomeClient>` owns pull-to-refresh, band-up detection, greeting logic).  
**Delivers:** Hero stats arrive with HTML; pull-to-refresh still works; band-up confetti/banner on CEFR level-up detected client-side.  
**Implements:** `app/page.tsx` (RSC, `Promise.all` parallel queries) + `components/HomeClient.tsx` (client islands) + `app/loading.txt` + modify `HabitTracker.tsx` to skip internal fetch when `initialData` provided.  
**Addresses:** PERF-02 (Home data hydration), PERF-05 (avoid layout data blocks loading.txt — this audit happens here).  
**Avoids:** Pitfall #3 (validate layout.tsx has no runtime data fetches); Pitfall #7 (React 19 hydration mismatch from `Date.now()` — greeting is in `useEffect`, acceptable).  
**Validation gates:** Hero state (A/B/C) correct on first render; `greeting` appears after mount (impure, acceptable); `HabitTracker` no redundant fetch; pull-to-refresh works.

### Phase 4: Study Page — Phase State Machine Sync
**Rationale:** Most complex RSC — preserves phase state machine, lesson-range re-fetch remains client-side. Only removes the initial `phase='loading'` transition; subsequent state changes unaffected.  
**Delivers:** Study page arrives at mode-select phase immediately with correct due card count; no loading phase on first load; lesson-range filter re-fetch still transitions through `phase='loading'`.  
**Implements:** `app/study/page.tsx` (RSC, pass initialCards to skip phase='loading') + `components/StudyPageClient.tsx` (client shell) + `app/study/loading.txt`.  
**Addresses:** PERF-03 (Study page hydration — most complex).  
**Avoids:** Pitfall #5 (`StudySession` stays `'use client'` as a prop; page is RSC); Pitfall #1 (DTO mapping for Card + CardReview data).  
**Validation gates:** Page at `select-mode` on first load; lesson range re-fetch still works; `StudySession` receives cards; complete screen works; study-ahead flow works.

### Phase 5: API Parallelization — `/api/cards/due` Query Optimization
**Rationale:** Server-side speed win; single-file change; no user-facing complexity. Moves three serial `await` calls to `Promise.all`, reducing study-session startup latency by max(query_times) − 200–400ms (typical Turso round-trip).  
**Delivers:** 200–400ms faster study session startup on repeating users.  
**Implements:** Restructure `/api/cards/due` route: `Promise.all([getSessionSize, card pool, knownLemmas])` then `await edges` (depends on pool IDs). Wrap in try/catch.  
**Addresses:** PERF-06 (parallel DB queries).  
**Avoids:** Pitfall #4 (`Promise.all` atomic failure — wrap in try/catch; return 500 gracefully).  
**Validation gates:** Network timeline shows queries firing concurrently; page load time ≤ max(query_times); simulate Turso timeout to confirm error handling.

### Phase Ordering Rationale

1. **Cards → Habits → Home → Study** progression: Each phase builds complexity and confidence. Cards establishes the pattern. Habits validates computed state. Home introduces parallel fetches. Study is most complex (phase state machine).
2. **API parallelization last**: Can be done any time after Home (doesn't depend on page conversions); grouped at the end for focus.
3. **Error boundaries and Pitfall #1 (DTO pattern) must be established in Phase 1** and enforced throughout.
4. **DTO pattern prevents 80% of runtime bugs** — make this the first code-review gate in Phase 1.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (API parallelization):** Turso free-tier rate limits and concurrent-query behavior — if parallelization causes rate-limit errors, may need fallback to serial queries or caching strategy.

Phases with standard, well-documented patterns (can skip research-phase):
- **Phase 1–4 (RSC conversions):** Patterns are stable and well-documented in Next.js 13+ / React 18+ ecosystem. Official Next.js docs cover all required patterns. No niche integrations.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | **HIGH** | Official Next.js 16 docs + existing codebase proof (layout.tsx already RSC + Prisma). No ecosystem comparison needed — the tech stack is fixed. |
| **Features** | **HIGH** | NN/G skeleton UX research authoritative; Next.js loading API reference official; feature table is well-researched and prioritized. |
| **Architecture** | **HIGH** | RSC + client shell is the official Next.js recommended pattern (stable since Next.js 13). Existing `layout.tsx` in this codebase already proves the pattern works with Prisma + libSQL. |
| **Pitfalls** | **MEDIUM-HIGH** | Cross-checked against official Next.js docs + multiple community sources (LogRocket, GitHub issues with maintainer responses). Pitfall #1 (Date serialization) is community-verified issue; Pitfall #2 (loading behavior) confirmed in official docs; others are architectural gotchas from ecosystem experience. |

**Overall confidence: HIGH** — This is a well-understood performance optimization pattern in the Next.js ecosystem, with official documentation backing the approach and an existing proof of concept in the codebase.

### Gaps to Address

1. **Turso rate-limit behavior under parallel queries (Phase 5):** Research found that libSQL HTTP transport handles concurrency correctly, but Turso free-tier rate limits are not well-documented. During Phase 5 planning, confirm: (a) are Turso rate limits per-connection or per-account? (b) does parallelizing 3 queries increase the risk of hitting limits? (c) if so, should Phase 5 include a fallback to `Promise.allSettled` with graceful degradation?

2. **HabitTracker optional prop backward compatibility (Phase 3):** The modification to `HabitTracker` to skip internal fetch when `initialData` is provided is straightforward, but need to verify no other pages currently use `HabitTracker` and rely on its self-fetch behavior. Check: `/study`, `/wrapped`, and any other pages that render the component.

3. **Skeleton layout shift validation (all phases):** Each skeleton must match the real content's height to avoid Cumulative Layout Shift (CLS). During implementation, measure actual component heights and hard-code skeleton dimensions. No automation here — manual audit required.

---

## Sources

### Primary (HIGH confidence)
- [Next.js 16.2 Fetching Data docs](https://nextjs.org/docs/app/getting-started/fetching-data) — RSC patterns, async page components, server-client boundaries
- [Next.js 16.2 loading.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/loading) — Suspense wrapping behavior, navigation-only activation
- [Next.js 16.2 Streaming guide](https://nextjs.org/docs/app/guides/streaming) — Suspense boundaries, streaming SSR
- [Existing codebase CLAUDE.md](https://example.com) — Proof of concept: layout.tsx already an async RSC calling lib/settings.ts Prisma functions; pattern works in production on Turso/libSQL
- [Prisma Turso documentation](https://www.prisma.io/docs/orm/v6/overview/databases/turso) — libSQL adapter, HTTP transport, concurrent query safety
- [React 19 Suspense documentation](https://react.dev/reference/react/Suspense) — Suspense API, fallback behavior

### Secondary (MEDIUM confidence)
- [Nielsen Norman Group: Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — UX research on skeleton loading patterns
- [GitHub vercel/next.js #46137](https://github.com/vercel/next.js/discussions/46137) — "Only plain objects can be passed to Client Components" Date serialization warning (community-verified)
- [GitHub prisma/prisma #19983](https://github.com/prisma/prisma/discussions/19983) — Date/Decimal serialization in RSC (Prisma team response)
- [GitHub vercel/next.js #68763](https://github.com/vercel/next.js/discussions/68763) — loading behavior on initial vs. navigation loads (maintainer clarification)
- [LogRocket: 6 React Server Component performance pitfalls in Next.js](https://blog.logrocket.com/react-server-components-performance-mistakes) — Waterfalls, serialization, Date handling
- [DEV.to: Complete Next.js Streaming Guide](https://dev.to/boopykiki/a-complete-nextjs-streaming-guide-loadingtsx-suspense-and-performance-9g9) — Community guide to patterns

### Tertiary (LOW confidence)
- [Community blog: Next.js 16.2 unstable_cache vs use cache](https://www.buildwithmatija.com/blog/nextjs-16-2-caching-unstable-cache-vs-use-cache) — Why not to add caching (inferred that RSC solves the problem better)
- [LogRocket: Skeleton loading screen design](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/) — Skeleton UX best practices (general, not Next.js-specific)

---

## What NOT to Build

Research identifies several commonly-requested features that should be deferred or rejected:

| What | Why Not | Alternative |
|------|---------|-------------|
| `unstable_cache` / `use cache` | Replaced/complex; the RSC hydration pattern solves the initial-load problem; per-request caching via `React.cache()` only; cross-request caching adds staleness risk for a personal app | RSC hydration for first load; `React.cache()` for within-request dedup if sub-components need same data |
| SWR / React Query | Client-side data fetching; RSC already eliminates the blank-page problem | RSC async pages + client `fetch` for mutations only |
| `server-only` package | Optional guard; in this single-dev project, boundaries are explicit in CLAUDE.md | Continue using `// No 'use client' — server-side only` comment convention |
| New DB layer (Drizzle/Kysely) | Existing Prisma 7 + libSQL works correctly with RSC + Promise.all parallelism | Keep existing setup |

---

*Research completed: 2026-06-29*  
*Ready for roadmap: yes*
