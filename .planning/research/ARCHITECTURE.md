# Architecture Research

**Domain:** RSC + client shell pattern for Next.js 16 App Router — converting useEffect-fetched pages to server-hydrated pages with interactive client shells
**Researched:** 2026-06-29
**Confidence:** HIGH

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js 16 App Router — Page Route                                  │
│                                                                       │
│  app/cards/page.tsx (Server Component — async, no 'use client')      │
│       │  calls prisma directly, passes data as props                 │
│       ↓                                                              │
│  <CardsPageClient initialCards={cards} initialLessons={lessons} />   │
│  (components/CardsPageClient.tsx — 'use client' at top)             │
│       │  manages search/filter/edit state                            │
│       ↓                                                              │
│  <CardEditor /> <SwipeRow /> <Sheet />  (already 'use client')      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  app/cards/loading.tsx (Suspense skeleton)                           │
│  — rendered by Next.js while the server component awaits Prisma      │
│  — Next.js wraps the page in an implicit <Suspense> boundary         │
│  — no manual Suspense wrappers needed in page.tsx                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | How Built |
|-----------|----------------|-----------|
| `app/X/page.tsx` | Fetch DB data, pass as props | `async function`, no `'use client'`, calls `prisma` directly |
| `components/XPageClient.tsx` | Own all interactive state, receive initial data as props | `'use client'` at top, `useState` seeded from props |
| `app/X/loading.tsx` | Suspense skeleton shown while server component awaits | Thin skeleton JSX, no state, no hooks |
| Existing interactive components | Unchanged — `StudySession`, `CardEditor`, `SwipeRow`, etc. | Already `'use client'`; receive props from the client shell |

---

## Core Pattern: RSC + Client Shell

### How Server Data Reaches a Client Component

The server component fetches from Prisma and passes the result as a plain serializable prop to a `'use client'` child. The client component seeds its `useState` from that prop using a lazy initializer. Props passed across the RSC/client boundary must be JSON-serializable — no `Date` objects, no `undefined` (use `null` or ISO strings).

```typescript
// app/cards/page.tsx  — Server Component (no 'use client')
import { prisma } from '@/lib/prisma'
import CardsPageClient from '@/components/CardsPageClient'

export default async function CardsPage() {
  const [cards, lessons] = await Promise.all([
    prisma.card.findMany({
      include: {
        review: true,
        lesson: { select: { title: true, orderIndex: true } },
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lesson.findMany({
      orderBy: { orderIndex: 'asc' },
      select: { id: true, title: true, orderIndex: true },
    }),
  ])
  return <CardsPageClient initialCards={cards} initialLessons={lessons} />
}
```

```typescript
// components/CardsPageClient.tsx  — Client Shell
'use client'

import { useState } from 'react'
// ...same imports as current app/cards/page.tsx...

interface Props {
  initialCards: Card[]
  initialLessons: LessonItem[]
}

export default function CardsPageClient({ initialCards, initialLessons }: Props) {
  // Seed state from server-provided initial data.
  // Lazy initializer: only runs once at mount, clarifies intent.
  const [cards, setCards] = useState<Card[]>(() => initialCards)
  const [lessons, setLessons] = useState<LessonItem[]>(() => initialLessons)
  // ...rest of the current page component body, unchanged...
}
```

The `loadCards` callback (currently defined in `app/cards/page.tsx`) stays in the client shell — it is called after mutations (add/delete/edit) to refresh client state via `fetch('/api/cards')`. The initial load no longer needs it.

---

## Data Flow Diagrams

### Data Flow: Cards Page

```
Navigation to /cards
    ↓
app/cards/loading.tsx shown immediately (Suspense boundary auto-created by Next.js)
    ↓
app/cards/page.tsx (server) runs:
    prisma.card.findMany()    ─┐
    prisma.lesson.findMany()   ┘  parallel via Promise.all
    ↓
<CardsPageClient initialCards={...} initialLessons={...} /> rendered with data
    ↓
Client hydrates: useState seeded, no useEffect fetch needed for initial cards
    ↓
User searches / filters  →  client state (search, filter, lessonFrom, lessonTo)
User edits / deletes     →  POST /api/cards → loadCards() refetch updates state
```

No `useEffect` fetch on initial load. Mutations still go through the existing API routes.

### Data Flow: Study Page

The study page has a multi-phase state machine. Server hydration only removes the initial `phase='loading'` phase; all other state transitions remain client-side.

```
Navigation to /study
    ↓
app/study/loading.tsx shown immediately
    ↓
app/study/page.tsx (server) runs:
    prisma.card.findMany(where: { review: { nextReview: { lte: now } } })  ─┐
    prisma.lesson.findMany()                                                  ┤  parallel
    getSessionSize() + getDailyGoalSeconds() + getDayStartHour()             ┤  via Promise.all
    prisma.studyDay.findMany(take: 400)                                      ┘
    ↓
<StudyPageClient initialCards={...} initialLessons={...}
                 sessionSize={...} initialActivity={...} /> rendered
    ↓
Client hydrates: phase initialized to 'select-mode' (not 'loading'),
                 cards already present, no useEffect fetch on mount
    ↓
User changes lesson range  →  loadDue() fetch  →  /api/cards/due?lessonFrom=&lessonTo=
    (server hydration only removes the *first* loading phase;
     lesson-range re-fetches remain client-side as before)
    ↓
StudySession receives studyCards as prop, manages mutable queue state internally
```

The `StudySession` component already owns queue state internally — it receives `cards` once as an initial prop and manages from there. No change to `StudySession` is needed; only the source of the initial `cards` array changes (prop from server rather than state set from fetch).

### Data Flow: Home Page

```
Navigation to /
    ↓
app/loading.tsx shown immediately
    ↓
app/page.tsx (server) runs:
    prisma.card.count()
    prisma.cardReview.count(where: { nextReview: { lte: now } })
    prisma.lesson.count()
    prisma.cardReview.count(where: { state: 2, scheduledDays: { gte: 21 } })
    prisma.studyDay.findMany(take: 400)
    getDailyGoalSeconds() + getDayStartHour()
    all parallel via Promise.all
    ↓
<HomeClient initialStats={...} initialActivity={...} /> rendered
    ↓
Client hydrates: heroState can be derived on first render from props
                 greeting computed in useEffect from Date (impure — unchanged)
    ↓
Pull-to-refresh  →  POST /api/sync  →  loadStats() + loadActivity() refetches (unchanged)
```

The `greeting` stays in a `useEffect` because `new Date().getHours()` is impure under `react-hooks/purity`. One cosmetic render without the greeting is acceptable.

`HabitTracker` is used on this page and currently self-fetches `/api/activity`. Since the server component already fetches this data, `HabitTracker` should accept an optional `initialData` prop and skip its internal fetch when provided. See the Modified Files section.

### Data Flow: Habits Page

```
Navigation to /habits
    ↓
app/habits/loading.tsx shown immediately
    ↓
app/habits/page.tsx (server) runs:
    prisma.studyDay.findMany(take: 400)
    prisma.cardReview.count(where: { state: 2, scheduledDays: { gte: 21 } })
    getDailyGoalSeconds() + getDayStartHour()
    all parallel via Promise.all
    ↓
<HabitsPageClient initialDays={...} initialGoal={...}
                  initialDayStartHour={...} masteredCount={...} /> rendered
    ↓
Client hydrates: all useMemo stats computed synchronously from prop-seeded state
                 no loading state, no flash
```

---

## How `loading.tsx` Interacts with Suspense

Next.js App Router wraps each page's server component in an implicit `<Suspense>` boundary. `loading.tsx` is the fallback for that boundary. The sequence is:

1. User navigates to `/cards`.
2. Next.js **immediately** streams the fallback from `app/cards/loading.tsx` to the browser.
3. The server component (`app/cards/page.tsx`) awaits Prisma queries concurrently.
4. Once data is ready, Next.js streams the full page HTML with initial data serialized into the RSC payload.
5. React hydration runs: the `'use client'` shell picks up the serialized props, `useState` is seeded, the component becomes interactive with no additional network fetch.

`loading.tsx` is only shown during the server-side data-fetch phase (point 2 through 4 above). Once the page is hydrated, subsequent client-side interactions (lesson filter change, etc.) manage loading via the component's own internal state — not `loading.tsx` again. `loading.tsx` only fires on navigation to that route.

No `<Suspense>` wrappers need to be added manually inside `page.tsx`. The implicit page-level boundary is sufficient.

---

## Auth in RSC: Why No Action Is Needed

`middleware.ts` runs at the Edge before the server component executes. By the time `app/cards/page.tsx` runs, the request has already been validated — the user is authenticated. Server components do not need to re-check the cookie.

The `matcher` in `middleware.ts` covers all non-login routes:
```
'/((?!login|api/login|_next/static|_next/image|favicon.ico|...).*)'
```

This means RSC pages (`/`, `/cards`, `/study`, `/habits`) are protected identically to API routes.

Server components do not have access to `req.cookies` the way API routes do. If a server component needed to read the cookie directly, it would use `import { cookies } from 'next/headers'`. For this single-tenant app, this is never needed. The middleware guard is sufficient.

---

## Project Structure: New vs. Modified Files

### New Files

| File | What It Is | Notes |
|------|-----------|-------|
| `app/loading.tsx` | Home page skeleton | Root route Suspense fallback |
| `app/cards/loading.tsx` | Cards page skeleton | Search bar outline + card row stubs |
| `app/study/loading.tsx` | Study page skeleton | Card count area + start button stub |
| `app/habits/loading.tsx` | Habits skeleton | Streak hero + heatmap grid outline |
| `components/HomeClient.tsx` | Extracted home page client | Cut from `app/page.tsx`; accepts `initialStats`, `initialActivity` |
| `components/CardsPageClient.tsx` | Extracted cards page client | Cut from `app/cards/page.tsx`; accepts `initialCards`, `initialLessons` |
| `components/StudyPageClient.tsx` | Extracted study page client | Cut from `app/study/page.tsx`; accepts `initialCards`, `initialLessons`, `sessionSize`, `initialActivity` |
| `components/HabitsPageClient.tsx` | Extracted habits page client | Cut from `app/habits/page.tsx`; accepts `initialDays`, `initialGoal`, `initialDayStartHour`, `masteredCount` |

### Modified Files

| File | Change | Why |
|------|--------|-----|
| `app/page.tsx` | Remove `'use client'`, make `async`, call `prisma` + `lib/settings`, render `<HomeClient />` | Convert to server component |
| `app/cards/page.tsx` | Same pattern | Convert to server component |
| `app/study/page.tsx` | Same pattern | Convert to server component |
| `app/habits/page.tsx` | Same pattern | Convert to server component |
| `components/HabitTracker.tsx` | Add optional `initialData?: ActivityData` prop; skip internal `useEffect` fetch when provided | Home server already fetches activity; avoids redundant network call |

### Unchanged Files

Everything in `components/StudySession.tsx`, `components/CardEditor.tsx`, `components/SwipeRow.tsx`, `components/Sheet.tsx`, all `lib/*` modules, and all `app/api/*` routes stays unchanged. The conversion is purely at the page boundary.

---

## Architectural Patterns

### Pattern 1: Props-as-Initial-State with Lazy Initializer

**What:** Server-fetched data arrives as a prop; client state is seeded using the `useState` lazy initializer form.

**When to use:** Any data that arrives from the server and will be mutated or re-fetched by user actions.

**Trade-offs:** Simple and idiomatic. The prop/state diverge after mount — if the server re-renders (navigation away and back), React re-mounts and re-seeds from fresh server data, which is correct behavior.

```typescript
// Correct: lazy initializer — only runs once at mount
const [cards, setCards] = useState<Card[]>(() => initialCards)

// Also correct but less explicit about intent:
const [cards, setCards] = useState<Card[]>(initialCards)

// Both are equivalent for the initial mount case.
// The lazy form is preferred when initialCards is a large array
// (avoids creating a new array reference on every render before state settles).
```

### Pattern 2: Derived Initial Phase Eliminates the Loading Phase

**What:** The study page starts in `phase='loading'` and transitions to `phase='select-mode'` after the fetch resolves. With server hydration, `initialCards` arrives already fetched, so the initial phase should be `'select-mode'`.

**When to use:** Any page that has a loading phase gated on data that now arrives from the server.

```typescript
// In StudyPageClient — initialCards always present from server
const [phase, setPhase] = useState<Phase>('select-mode')
// The 'loading' phase is still used for lesson-range filter re-fetches.
// It is no longer the initial state.
```

### Pattern 3: Parallel Prisma Queries in Server Components

**What:** Use `Promise.all` to run independent Prisma queries concurrently.

**When to use:** Every server component that needs data from multiple tables.

```typescript
// Correct: parallel queries — total time = max(query times)
const [cards, lessons] = await Promise.all([
  prisma.card.findMany({ ... }),
  prisma.lesson.findMany({ ... }),
])

// Wrong: serial — total time = sum(query times)
const cards = await prisma.card.findMany({ ... })
const lessons = await prisma.lesson.findMany({ ... })
```

This same principle applies to the existing `/api/cards/due` route (PERF-06): the route currently has serial `await` calls for `getSessionSize()` and the card queries; these should become a `Promise.all`.

### Pattern 4: Skeleton-Only `loading.tsx`

**What:** `loading.tsx` contains only static skeleton markup — no hooks, no state, no data fetching.

**When to use:** Every route with a server component that fetches data.

```typescript
// app/cards/loading.tsx
export default function CardsLoading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-11 bg-surface-3 rounded-xl w-full" />
      <div className="h-8 bg-surface-3 rounded-lg w-32" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 bg-surface-3 rounded-xl w-full" />
      ))}
    </div>
  )
}
```

The skeleton approximates the real layout so the transition to real content is smooth. Uses `bg-surface-3` (deep well token) consistent with the existing pulse skeletons already in `app/study/page.tsx`.

### Pattern 5: Optional `initialData` Prop for Self-Fetching Components

**What:** A component that currently self-fetches via `useEffect` accepts an optional prop. When the prop is provided, the internal fetch is skipped. When absent, the component falls back to self-fetching (preserving backward compatibility for other use sites).

**When to use:** Any shared component used both on pages where the server can pre-fetch the data and on pages where it cannot.

```typescript
// components/HabitTracker.tsx (modified)
interface Props {
  initialData?: {
    days: DayRecord[]
    dailyGoalSeconds: number
    dayStartHour: number
  }
}

export default function HabitTracker({ initialData }: Props) {
  const [days, setDays] = useState<DayRecord[] | null>(() => initialData?.days ?? null)
  const [goal, setGoal] = useState(() => initialData?.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
  // ...

  useEffect(() => {
    // Skip if initialData was provided by the server
    if (initialData) {
      const hour = initialData.dayStartHour
      setToday(habitDateStr(hour))
      return
    }
    // Fall back to self-fetch for pages that don't provide server data
    fetch('/api/activity')
      .then((r) => r.json())
      .then((d) => { ... })
  }, []) // empty deps — mount-only, same as today
}
```

---

## Build Order

The conversion should be done in this order. Each phase establishes the pattern before the next and has a clear validation gate.

### Step 1: Cards Page (establish the pattern, lowest complexity)

The cards page is the simplest conversion — static initial data, pure client-side filtering, mutations trigger refetch. No phase state machine. Establishing the pattern here first gives confidence before more complex pages.

**Files:**
- Create `components/CardsPageClient.tsx` (extracted from `app/cards/page.tsx`)
- Convert `app/cards/page.tsx` to async server component
- Add `app/cards/loading.tsx`

**Validation gate:**
- No `useEffect` fetch fires on initial page load (confirm in network tab)
- Search/filter still works client-side
- Add/edit/delete card still works (API mutation + refetch)
- Skeleton appears on hard-reload before cards load

### Step 2: Habits Page (pure read, no re-fetch, validates useMemo from props)

The habits page is all computed state — `useMemo` calls over `DayRecord[]`. Validates that `useMemo` computations from prop-seeded state work correctly on first render without a loading flash.

**Files:**
- Create `components/HabitsPageClient.tsx`
- Convert `app/habits/page.tsx`
- Add `app/habits/loading.tsx`

**Validation gate:**
- Streak, heatmap, and all-time stats render correctly on first paint
- `today` string is derived correctly from `dayStartHour` prop (via `habitDateStr` in `useEffect`)
- No blank state between skeleton and data

### Step 3: Home Page (shared data with HabitTracker; band-up detection)

Home requires modifying `HabitTracker` (add optional prop). The server component passes data to both `HomeClient` and through it to `HabitTracker`.

**Files:**
- Modify `components/HabitTracker.tsx` to accept optional `initialData` prop
- Create `components/HomeClient.tsx`
- Convert `app/page.tsx`
- Add `app/loading.tsx`

**Validation gate:**
- Hero state (A/B/C) is correct on first render (no loading flash in hero area)
- `greeting` appears after one paint (acceptable — it's impure)
- `HabitTracker` does not make a redundant `/api/activity` fetch when `initialData` is provided (confirm in network tab)
- Pull-to-refresh still triggers sync and updates stats
- Band-up detection (localStorage comparison) still works

### Step 4: Study Page (most complex — phase machine, lesson range re-fetch)

The study page has the most state. Server hydration only removes the initial `phase='loading'` transition; all other state transitions remain client-side.

**Files:**
- Create `components/StudyPageClient.tsx`
- Convert `app/study/page.tsx`
- Add `app/study/loading.tsx`

**Validation gate:**
- Page arrives at `select-mode` immediately with correct card count (no loading phase on first load)
- Lesson range filter re-fetch still transitions through `phase='loading'` correctly
- `StudySession` receives cards and starts correctly
- Complete screen (streak ring, stats) works
- "Study ahead" flow works

---

## Anti-Patterns

### Anti-Pattern 1: Calling `prisma` from a 'use client' component

**What people do:** Import `prisma` directly in a `'use client'` component.

**Why it's wrong:** Next.js will attempt to bundle the Prisma client and `@libsql/client` into the browser bundle, causing a build error. Prisma is Node-only.

**Do this instead:** Only call `prisma` from `async` server components (no `'use client'` directive) or from API route handlers.

### Anti-Pattern 2: Passing non-serializable props across the RSC boundary

**What people do:** Pass a `Date` object or `undefined` as a prop from server to client component.

**Why it's wrong:** RSC serialization only supports JSON-compatible values. `Date` objects become strings in transit; `undefined` is silently dropped, causing TypeScript types to lie about what the client receives.

**Do this instead:** Pass `Date` values as ISO strings. Use `null` instead of `undefined` for absent optional values. The app's Prisma setup already returns `DateTime` fields as strings when serialized — the same care applies to RSC props.

### Anti-Pattern 3: Keeping the `useEffect` fetch for data that now arrives from the server

**What people do:** Copy the original component into the client shell without removing the `useEffect` fetch, so the initial data is fetched twice — once server-side (passed as prop, used to seed state) and once client-side (redundant).

**Why it's wrong:** Defeats the purpose. The initial blank flash is gone, but the redundant network round-trip remains and will overwrite the server-provided state with identical data.

**Do this instead:** Seed `useState` from the `initialX` prop. Remove the `useEffect` that was fetching initial data. Keep only the fetch callbacks triggered by user mutations.

### Anti-Pattern 4: Adding data-fetch logic to `loading.tsx`

**What people do:** Add a `useEffect` to `loading.tsx` to start loading data "early" while the skeleton is showing.

**Why it's wrong:** `loading.tsx` is a Suspense fallback — it can be unmounted before any effect fires. The server component already fetches concurrently while the skeleton is being streamed. There is nothing to pre-fetch.

**Do this instead:** Keep `loading.tsx` as pure static skeleton markup. No hooks, no `'use client'`.

### Anti-Pattern 5: Using a separate `app/X/client.tsx` file for the client shell

**What people do:** Put the client shell at `app/cards/client.tsx` to keep it co-located with the route.

**Why it's not idiomatic:** Next.js App Router reserves `app/` for routing files (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`). Placing arbitrary component files in `app/` is technically valid but confusing. The convention in this codebase — and in the Next.js ecosystem — is to put React components in `components/`.

**Do this instead:** Put client shells in `components/` alongside other interactive components: `components/CardsPageClient.tsx`.

---

## Scaling Considerations

This is a single-tenant personal app. These notes apply at the scale of one user.

| Concern | Before RSC conversion | After RSC conversion |
|---------|----------------------|----------------------|
| Time to first content | 2–3s blank wait (useEffect fetch) | ~200–500ms (skeleton immediate, data with HTML) |
| DB queries per navigation | 1 server render + 1 client API fetch (sequential) | 1 server render with parallel queries (no client fetch on initial load) |
| Vercel cold start | Adds to API route fetch latency | Adds to server component render — same runtime, same impact |
| Cache behavior | No caching — always fresh | Same — RSC is `dynamic` by default when `new Date()` is used in the server component; always fetches fresh data |
| Vercel 60s function limit | Affects `/api/sync` only | Lightweight Prisma queries; does not approach the limit |

The Vercel Hobby 60s function timeout is not a concern for page server components. The timeout only matters for `/api/sync` (Claude API calls). Prisma queries complete in single-digit milliseconds.

---

## Sources

- Next.js App Router documentation: server components, loading UI, Suspense — stable patterns established in Next.js 13, unchanged through Next.js 16.
- Existing codebase proof of concept: `app/layout.tsx` is already an `async` server component that calls `prisma` via `lib/settings.ts` (lines 50–58). This is the exact same pattern, already proven to work in this codebase with Turso/libSQL.
- Auth analysis: `middleware.ts` reviewed directly — the matcher covers all page routes; no additional auth needed in server components.

---

*Architecture research for: RSC + client shell pattern in Next.js 16 App Router*
*Researched: 2026-06-29*
