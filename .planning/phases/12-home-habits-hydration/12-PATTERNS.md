# Phase 12: Home & Habits Hydration - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 9 (3 new, 6 modified/converted)
**Analogs found:** 9 / 9

> **AGENTS.md directive honored:** "This is NOT the Next.js you know — read the relevant guide in `node_modules/next/dist/docs/` before writing any code." The RSC + client-shell + DTO pattern mapped below was verified against `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (§"Passing data from Server to Client Components" + "Props passed to Client Components need to be serializable by React") and `06-fetching-data.md` (§"With an ORM or database" + §"Parallel data fetching"). No deprecation notices in the read sections affect this phase. The pattern is already shipped in Phases 10 (`app/cards/page.tsx`) and 11 (`app/study/page.tsx`) on the same Next.js 16.2.1 + React 19.2.4 stack — Phase 12 is a direct replication, no version drift.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/dashboard.ts` (NEW) | service | request-response (server-side Prisma) | `lib/study-cards.ts` | exact |
| `lib/dto.ts` (MODIFY — add `StatsDTO` + `ActivityDTO`) | config (types) | n/a (pure type defs) | `lib/dto.ts` itself (extend in place — Phase 11 D-05 precedent) | exact (self) |
| `app/page.tsx` (CONVERT `'use client' → async RSC) | route (RSC page) | request-response | `app/study/page.tsx` + `app/cards/page.tsx` | exact |
| `app/habits/page.tsx` (CONVERT `'use client' → async RSC) | route (RSC page) | request-response | `app/study/page.tsx` + `app/cards/page.tsx` | exact |
| `components/HomeClient.tsx` (NEW — client shell) | component | request-response (initial props) + client interactivity | `components/StudyClient.tsx` (shell shape) + `app/page.tsx` (logic being ported) | role-match |
| `components/HabitsClient.tsx` (NEW — client shell) | component | request-response (initial props) + `useMemo` derivations | `components/StudyClient.tsx` (shell shape) + `app/habits/page.tsx` (logic being ported) | role-match |
| `components/HabitTracker.tsx` (MODIFY — D-09 optional `initialActivity` props) | component | request-response (self-fetch fallback path) | `components/HabitTracker.tsx` itself + `components/StudyClient.tsx` (skip-fetch-when-initial-data-present) | exact (self) |
| `app/api/stats/route.ts` (MODIFY — GET delegates to `lib/dashboard.ts`) | route (API) | request-response | `app/api/cards/due/route.ts` (Phase 11 delegation precedent) + self | role-match (exact self) |
| `app/api/activity/route.ts` (MODIFY — GET delegates to `lib/dashboard.ts`; POST untouched) | route (API) | request-response | `app/api/cards/due/route.ts` + self | role-match (exact self) |

---

## Pattern Assignments

### `lib/dashboard.ts` (service, request-response — NEW)

**Analog:** `lib/study-cards.ts` (Phase 11 D-02 precedent — exact shape to replicate)

**Why this analog:** Phase 11 extracted `getStudyCards()` into a server-only module so both the RSC study page (`app/study/page.tsx`) and the API route (`app/api/cards/due/route.ts`) call one shared, DRY function. Phase 12 D-05 replicates this exact extraction shape for `getStats()` and `getActivityData()`, shared by the home/habits RSC pages and the `/api/stats` + `/api/activity` GET routes.

**Module header pattern** (`lib/study-cards.ts` lines 1-5):
```typescript
// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
// Extracts the pool-fetch + edge-fetch + knownLemmas + selectSessionCards +
// sequenceCards + annotation pipeline from app/api/cards/due/route.ts so
// both the RSC study page and the API route call one shared, DRY function.
```
**Apply to `lib/dashboard.ts`:** Same header comment shape — `// lib/dashboard.ts — server-only dashboard data layer`, `// No 'use client — this module runs server-side only.`, and a one-line explanation that it extracts the stats + activity queries from `/api/stats` + `/api/activity` so both the RSC pages and the GET API routes call one shared, DRY function. **Do NOT install the `server-only` package** — the comment is the established codebase precedent (RESEARCH.md "Alternatives Considered", row 4).

**Imports pattern** (`lib/study-cards.ts` lines 7-11):
```typescript
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'
```
**Apply to `lib/dashboard.ts`:**
```typescript
import { prisma } from '@/lib/prisma'
import { getDailyGoalSeconds, getDayStartHour } from '@/lib/settings'
import type { StatsDTO, ActivityDTO } from '@/lib/dto'
```

**Core pattern — `Promise.all` over Prisma + return DTO** (`lib/study-cards.ts` lines 20, 39-65, 72, 108-127):
```typescript
export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> {
  const { scope, lessonFrom, lessonTo } = params
  const now = new Date()
  // ... build clause ...
  const [poolResult, knownRowsResult] = await Promise.allSettled([
    prisma.card.findMany({ /* ... */ }),
    prisma.card.findMany({ /* ... */ }),
  ])
  // ... throw on critical rejection, degrade on non-critical ...
  // Serialize: convert all Prisma Date objects to ISO strings before returning.
  return ordered.map((c) => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
    // ... more Date → ISO string mappings ...
  }))
}
```
**Apply to `lib/dashboard.ts`:** Use `Promise.all` (NOT `Promise.allSettled`) — every query in `getStats()` and `getActivityData()` is critical (RESEARCH.md Pattern 6 + "Alternatives Considered" row 2). The query shapes are byte-identical to the existing routes:

```typescript
// getStats() — same 5 queries as app/api/stats/route.ts GET (lines 5-14)
export async function getStats(): Promise<StatsDTO> {
  const now = new Date()
  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])
  return { totalCards, dueCards, totalLessons, cardsByType, masteredCount }
}

// getActivityData() — same 3 queries as app/api/activity/route.ts GET (lines 26-36)
export async function getActivityData(): Promise<ActivityDTO> {
  const [days, dailyGoalSeconds, dayStartHour] = await Promise.all([
    prisma.studyDay.findMany({
      orderBy: { date: 'desc' },
      take: 400,
      select: { date: true, seconds: true, reviews: true },
    }),
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return { days, dailyGoalSeconds, dayStartHour }
}
```

**Key simplification vs. the analog:** `lib/study-cards.ts` has heavy `.toISOString()` serialization (lines 108-127) because Prisma `DateTime` fields can't cross the RSC boundary. **`lib/dashboard.ts` does NOT need this** — the stats payload is all `number` + a `groupBy` result, and `StudyDay.date` is a `String` column (`"YYYY-MM-DD"`), not `DateTime` (RESEARCH.md A2 — verified by reading `lib/habit.ts:DayRecord` interface lines 8-12 and `app/api/activity/route.ts` GET handler which returns `days` directly with no date mapping). Return the values directly. Planner should verify the `StudyDay.date` column type in `prisma/schema.prisma` at implementation time (RESEARCH.md Open Question A2 — low risk).

**Error handling pattern:** Library module — no `try/catch`. Throws propagate to the RSC page's Next.js error boundary (STATE.md convention: "No try/catch at RSC page level") and to the API route's own try/catch (see API route pattern below). Same as `lib/study-cards.ts` (no try/catch around the Prisma calls themselves — it throws via `throw new Error('Database error')` only on `poolResult.status === 'rejected'`, but `Promise.all` rejection is automatic).

---

### `lib/dto.ts` (config/types — MODIFY: add `StatsDTO` + `ActivityDTO`)

**Analog:** `lib/dto.ts` itself (extend in place — Phase 11 D-05 precedent set this file up as the single DTO home)

**Existing file header + DTO shape pattern** (`lib/dto.ts` lines 1-4, 6-18):
```typescript
// lib/dto.ts — shared server→client DTO types
// No 'use client' — this module runs server-side and client-side (pure type definitions).
// All Prisma DateTime fields are serialized to ISO strings before crossing the
// RSC → client component boundary (Next.js serialization constraint).

export interface ReviewDTO {
  id: string
  cardId: string
  // ...
  nextReview: string        // ISO string, was Date
  lastReview: string | null // ISO string or null, was Date | null
}
```
**Apply to new `StatsDTO` + `ActivityDTO`:** Append to the existing file, following the same `export interface XxxDTO` shape. Both DTOs are thin (the payloads are already primitives — RESEARCH.md Pattern 3):

```typescript
import type { DayRecord } from '@/lib/habit'   // ADD this import at top of lib/dto.ts

export interface StatsDTO {
  totalCards: number
  dueCards: number
  totalLessons: number
  // Prisma 7 groupBy({ by: ['type'], _count: true }) return shape.
  // Planner should verify at implementation time (RESEARCH.md A1) — low risk:
  // home/habits don't consume cardsByType (only /wrapped does).
  cardsByType: { type: string; _count: number }[]
  masteredCount: number
}

export interface ActivityDTO {
  // DayRecord.date is "YYYY-MM-DD" (string), seconds is number, reviews is optional number.
  // No Date objects — already serializable. Reuse DayRecord (don't invent ActivityDayDTO).
  days: DayRecord[]
  dailyGoalSeconds: number
  dayStartHour: number
}
```

**Type reuse pattern:** Note the existing `LessonRefItem` alias at `lib/dto.ts` line 63 — the codebase prefers reusing an existing type over inventing a parallel one. Apply the same principle: **reuse `DayRecord` from `lib/habit.ts`** as `ActivityDTO.days[]` element type rather than creating a new `ActivityDayDTO` (RESEARCH.md "Don't Hand-Roll" table, last row).

**`DayRecord` shape confirmed** (`lib/habit.ts` lines 8-12):
```typescript
export interface DayRecord {
  date: string // "YYYY-MM-DD" (user-local calendar day)
  seconds: number
  reviews?: number
}
```
Already serializable — no `Date` → ISO string mapping needed.

---

### `app/page.tsx` (route/RSC page, request-response — CONVERT `'use client'` → async RSC)

**Analog:** `app/study/page.tsx` (Phase 11, 15-line RSC reference) + `app/cards/page.tsx` (Phase 10, 47-line RSC with explicit serialization)

**Why these analogs:** `app/study/page.tsx` is the closest structural match — it's the most recent (Phase 11) and the simplest (fetches via a `lib/` module that was extracted for DRY reasons, exactly like `lib/dashboard.ts`). `app/cards/page.tsx` is the secondary reference for the inline serialization step (which Phase 12's home page does NOT need because the stats/activity payloads are already primitives).

**RSC page pattern** (`app/study/page.tsx` lines 1-15 — the entire file):
```typescript
// Server component — no client directive
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

export default async function StudyPage() {
  const [cardDTOs, lessons] = await Promise.all([
    getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])
  return <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
}
```
**Apply to `app/page.tsx`:**
```typescript
// Server component — no client directive (REMOVE the existing 'use client' on line 1)
import { getStats, getActivityData } from '@/lib/dashboard'
import HomeClient from '@/components/HomeClient'

export default async function Home() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return <HomeClient initialStats={stats} initialActivity={activity} />
}
```

**Critical directive handling (Pitfall 8):** The current `app/page.tsx` line 1 is `'use client'`. After conversion, the page file must have **NO** `'use client'` (it becomes an async server component). The `'use client'` directive moves with the client logic into the new `components/HomeClient.tsx` (where it must be the literal first line, before any imports).

**Serialization pattern (reference only — NOT needed for home):** `app/cards/page.tsx` lines 24-44 shows the explicit `.toISOString()` mapping when Prisma `DateTime` fields are involved. **Phase 12's home page does NOT need this** — `StatsDTO` and `ActivityDTO` are already primitives (RESEARCH.md Pattern 3, A2). Pass the return values of `getStats()` / `getActivityData()` directly as props.

**All current client logic in `app/page.tsx` (252 lines) moves to `components/HomeClient.tsx`** — see the HomeClient pattern assignment below.

---

### `app/habits/page.tsx` (route/RSC page, request-response — CONVERT `'use client'` → async RSC)

**Analog:** `app/study/page.tsx` + `app/cards/page.tsx` (same as home — exact match)

**RSC page pattern — same as home, with field selection:** Apply the `app/study/page.tsx` shape. The habits page only consumes `masteredCount` from `getStats()` and `days`/`dailyGoalSeconds`/`dayStartHour` from `getActivityData()`, but per D-05 + RESEARCH.md "Deferred Ideas" row 3, call both getters untrimmed (one DRY function shared with the API route; minor over-fetch is acceptable for a single-user app):

```typescript
// Server component — no client directive (REMOVE the existing 'use client' on line 1)
import { getStats, getActivityData } from '@/lib/dashboard'
import HabitsClient from '@/components/HabitsClient'

export default async function HabitsPage() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return (
    <HabitsClient
      initialDays={activity.days}
      initialGoal={activity.dailyGoalSeconds}
      initialDayStartHour={activity.dayStartHour}
      initialMasteredCount={stats.masteredCount}
    />
  )
}
```

**Critical directive handling (Pitfall 8):** Same as home — current `app/habits/page.tsx` line 1 is `'use client'`; remove it. The `'use client'` directive moves to `components/HabitsClient.tsx`.

**All current client logic in `app/habits/page.tsx` (281 lines) moves to `components/HabitsClient.tsx`** — see the HabitsClient pattern assignment below.

---

### `components/HomeClient.tsx` (component, request-response + client interactivity — NEW)

**Primary analog:** `components/StudyClient.tsx` (Phase 11 — `'use client'` shell shape, `interface Props { initial... }`, `useState(initialXxx)` pattern)

**Secondary analog:** `app/page.tsx` (the current 252-line client page — its logic is being ported into the new shell, with the `loadStats`/`loadActivity` mount-effect call removed per Pitfall 1)

**Shell header + Props pattern** (`components/StudyClient.tsx` lines 1-3, 13, 25-30):
```typescript
'use client'

import { useEffect, useState, useCallback } from 'react'
// ... other imports ...
import type { CardDTO, LessonDTO } from '@/lib/dto'

interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]
}

export default function StudyClient({ initialCards, initialLessons }: Props) {
  const [studyCards, setStudyCards] = useState<CardDTO[]>(initialCards)
  // ... rest of state ...
  const [lessons] = useState<LessonDTO[]>(initialLessons)
```
**Apply to `components/HomeClient.tsx`:**
```typescript
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
// ... port all imports from current app/page.tsx lines 3-13 ...
import type { StatsDTO, ActivityDTO } from '@/lib/dto'
import HabitTracker from '@/components/HabitTracker'

interface Props {
  initialStats: StatsDTO
  initialActivity: ActivityDTO
}

export default function HomeClient({ initialStats, initialActivity }: Props) {
  // Initialize from RSC props — NO null state, NO initial-load useEffect fetch.
  const [stats, setStats] = useState<StatsDTO>(initialStats)
  const [activityData, setActivityData] = useState<ActivityDTO>(initialActivity)
  // ... port the rest of app/page.tsx state: heroState, greeting, syncMsg, bandUpMsg ...
```

**Pitfall 1 avoidance (double-fetch on mount — `components/StudyClient.tsx` lines 96-112 shows the WRONG pattern for HomeClient):** `StudyClient` keeps a `useEffect(() => { fetch('/api/settings'); fetch('/api/activity') }, [])` because it needs secondary data not provided by RSC props. **HomeClient must NOT do this** for stats/activity — both arrive via `initialStats`/`initialActivity` props. Port `loadStats`/`loadActivity` as `useCallback`s (current `app/page.tsx` lines 44-74) but call them **only** from `handleSync` (post-pull-to-refresh refetch path), never from a mount effect (D-08, Pitfall 1).

**Purity-gated time reads pattern** (`app/page.tsx` lines 76-103 — port verbatim into HomeClient, with `stats`/`activityData` now initialized from props):
```typescript
useEffect(() => {
  // loadStats()  ← REMOVE (was the mount-effect fetch; props now provide initial data)
  // loadActivity()  ← REMOVE
  // Time-aware greeting — read the hour in the effect (never during render,
  // per react-hooks/purity); set state on a microtask to satisfy
  // react-hooks/set-state-in-effect.
  const h = new Date().getHours()
  const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  Promise.resolve().then(() => setGreeting(g))
}, [])  // ← deps change: no longer depends on loadStats/loadActivity

// Derive heroState — the `if (!stats || !activityData) return` guard can be
// REMOVED (props are non-null by construction — RESEARCH.md A3). Runs on mount
// with prop values AND re-runs after a pull-to-refresh refetch updates state.
useEffect(() => {
  // if (!stats || !activityData) return  ← REMOVE this guard (props always non-null)
  const todayStr = habitDateStr(activityData.dayStartHour)
  const todaySeconds = activityData.days.find((d) => d.date === todayStr)?.seconds ?? 0
  const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
  if (stats.dueCards > 0) {
    Promise.resolve().then(() => setHeroState('A'))
  } else if (goalMet) {
    Promise.resolve().then(() => setHeroState('B'))
  } else {
    Promise.resolve().then(() => setHeroState('C'))
  }
}, [stats, activityData])
```

**Pitfall 5 avoidance (band-up check on first render):** The current `app/page.tsx` lines 50-64 runs the band-up check inside `loadStats` (compares `computeProficiency(data.masteredCount).band` to `localStorage['lastBand']`, fires confetti on mismatch). After conversion, `loadStats` is called only from `handleSync` — so the band-up check would be lost on first load. **Fix:** extract the band-up check into a `useCallback` that takes `masteredCount`, and call it both (a) from a mount `useEffect` with `initialStats.masteredCount`, AND (b) from inside `loadStats` after the refetch resolves. RESEARCH.md Pitfall 5 + Open Question 3 confirm running it on the first mount effect is safe (independent of `heroState`/`today`, no visual race).

**Pull-to-refresh + sync pattern** (`app/page.tsx` lines 106-133 — port verbatim, the only path that calls `loadStats`/`loadActivity`):
```typescript
const handleSync = useCallback(async () => {
  // ... port verbatim: POST /api/sync, setSyncMsg, then loadStats() + loadActivity() ...
}, [loadStats, loadActivity])

const { pullDistance, refreshing } = usePullToRefresh(handleSync)
```

**HabitTracker wiring (D-09):** Replace the current `<HabitTracker />` (line 232, no props) with:
```tsx
<HabitTracker
  initialDays={initialActivity.days}
  initialToday={today /* HomeClient's own client-local today — computed in the heroState effect */}
  initialGoal={initialActivity.dailyGoalSeconds}
/>
```
Note: `HomeClient` needs to expose its `today` string for this. Compute `today` once in the heroState effect (above) and store it in state, then pass it down. This avoids `HabitTracker` recomputing `habitDateStr` and guarantees the two agree on `today` (Pitfall 6).

**Render block pattern** (`app/page.tsx` lines 137-251 — port verbatim, the JSX is unchanged). The only render-side change: `heroState === 'loading'` (`app/page.tsx` lines 173-175) now shows for only one tick (D-02 — the intentional pulse, NOT an empty-state flash) instead of until the fetch resolves.

---

### `components/HabitsClient.tsx` (component, request-response + `useMemo` derivations — NEW)

**Primary analog:** `components/StudyClient.tsx` (Phase 11 — `'use client'` shell shape)

**Secondary analog:** `app/habits/page.tsx` (the current 281-line client page — its `useMemo` derivations and render block are being ported in)

**Shell header + Props pattern** (apply the `components/StudyClient.tsx` lines 1-3, 25-30 shape):
```typescript
'use client'

import { useEffect, useState, useMemo } from 'react'
// ... port all imports from current app/habits/page.tsx lines 3-19 ...
import type { DayRecord } from '@/lib/habit'
import HabitsLoading from '@/app/habits/loading'   // REUSE Phase 9 skeleton (D-02 discretion)

interface Props {
  initialDays: DayRecord[]
  initialGoal: number
  initialDayStartHour: number
  initialMasteredCount: number
}

export default function HabitsClient({ initialDays, initialGoal, initialDayStartHour, initialMasteredCount }: Props) {
  // Initialize from RSC props — NO null state, NO initial-load useEffect fetch (D-04).
  const [days] = useState<DayRecord[]>(initialDays)   // was useState<DayRecord[] | null>(null)
  const [goal] = useState(initialGoal)
  const [masteredCount] = useState(initialMasteredCount)
  const [today, setToday] = useState('')   // D-02: empty until client-local clock resolves
```

**One-tick skeleton swap pattern (D-02 — the cleaner of the two shell variants):** Replace the current `app/habits/page.tsx` lines 43-58 (which self-fetches `/api/activity` + `/api/stats` in a mount effect) with a `today`-only effect:
```typescript
useEffect(() => {
  // D-02: compute today in an effect (purity-gated — habitDateStr calls new Date() internally).
  // Promise.resolve().then(...) satisfies react-hooks/set-state-in-effect.
  Promise.resolve().then(() => setToday(habitDateStr(initialDayStartHour)))
}, [initialDayStartHour])
```

**Skeleton gate pattern** (`app/habits/page.tsx` line 108 — repurpose for the one-tick `today` resolution):
```typescript
// Was: if (days === null) return <HabitsLoading />  (the empty-state flash)
// Now: gate on `today` instead of `days` — `days` is always present from RSC props.
if (today === '') return <HabitsLoading />
```
This is the **intentional one-tick loading state** (D-02), NOT an empty-state flash. RESEARCH.md Pattern 4 confirms this satisfies the "no empty heatmap flash" success criteria #2.

**Pitfall 2 + 3 avoidance (purity + set-state-in-effect):** Do NOT compute `today` inline in render or in a `useState` initializer — `habitDateStr()` calls `new Date()` internally → impure → `react-hooks/purity` fails. Always use the `useEffect` + `Promise.resolve().then(() => setToday(...))` microtask pattern above. (RESEARCH.md Pitfalls 2 + 3.)

**All `useMemo` derivations port verbatim** (`app/habits/page.tsx` lines 60-106 — `computeStreaks`, `computeHabitStats`, `secByDate`, `trendDays`, `maxTrendSecs`, `heatmapWeeks`, `insight`). The only change: replace `days ?? []` with `days` (no longer nullable — initialized from `initialDays` props). All pure habit functions from `lib/habit.ts` are reused unchanged (RESEARCH.md "Reusable Assets").

**Render block pattern** (`app/habits/page.tsx` lines 110-280 — port verbatim, the JSX is unchanged).

---

### `components/HabitTracker.tsx` (component, request-response — MODIFY: D-09 optional `initialActivity` props)

**Analog:** `components/HabitTracker.tsx` itself (the file being modified) + `components/StudyClient.tsx` (the skip-fetch-when-initial-data-present pattern from Phase 11)

**D-09 safety verified:** `HabitTracker` is used in exactly ONE place — `app/page.tsx` line 6 (import) + line 232 (usage). Confirmed via grep: not on `/study`, `/cards`, `/wrapped`, `/settings`, or `/habits`. The contract change has no other call sites to update. (RESEARCH.md A4 — verified.)

**Current Props (no props)** (`components/HabitTracker.tsx` line 22):
```typescript
export default function HabitTracker() {
```
**Apply D-09 — add optional `initialActivity` props:**
```typescript
interface Props {
  initialDays?: DayRecord[]
  initialToday?: string
  initialGoal?: number
}

export default function HabitTracker({ initialDays, initialToday, initialGoal }: Props) {
```

**Current state initializers** (`components/HabitTracker.tsx` lines 23-25):
```typescript
const [days, setDays] = useState<DayRecord[] | null>(null)
const [today, setToday] = useState('')
const [goal, setGoal] = useState(DEFAULT_GOAL_SECONDS)
```
**Apply D-09 — seed from props when present:**
```typescript
const [days, setDays] = useState<DayRecord[] | null>(initialDays ?? null)
const [today, setToday] = useState(initialToday ?? '')
const [goal, setGoal] = useState(initialGoal ?? DEFAULT_GOAL_SECONDS)
```

**Current self-fetch effect** (`components/HabitTracker.tsx` lines 30-40):
```typescript
useEffect(() => {
  fetch('/api/activity')
    .then((r) => r.json())
    .then((d) => {
      const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
      setToday(habitDateStr(hour))
      setDays(d.days ?? [])
      setGoal(d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
    })
    .catch(() => { setToday(habitDateStr(DEFAULT_DAY_START_HOUR)); setDays([]) })
}, [])
```
**Apply D-09 — skip self-fetch when all three initialActivity props are present:**
```typescript
useEffect(() => {
  // D-09: if all three initialActivity props are present, skip the self-fetch entirely.
  if (initialDays !== undefined && initialToday !== undefined && initialGoal !== undefined) return
  fetch('/api/activity')
    .then((r) => r.json())
    .then((d) => {
      const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
      setToday(habitDateStr(hour))
      setDays(d.days ?? [])
      setGoal(d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
    })
    .catch(() => { setToday(habitDateStr(DEFAULT_DAY_START_HOUR)); setDays([]) })
}, [initialDays, initialToday, initialGoal])
```
The defensive fallback path stays — `HabitTracker` remains usable in isolation (no props → self-fetches as today).

**Pitfall 6 avoidance (today desync):** When `HomeClient` passes `initialToday` (its own already-computed `today` string, derived from `initialActivity.dayStartHour`), `HabitTracker` uses that same string for its derivations. Both components agree on whether today's goal is met. (RESEARCH.md Open Question 2 — pass `today` directly, don't have `HabitTracker` recompute.)

**Rest of `HabitTracker` unchanged** (lines 42-204 — `secByDate`, `streakInfo`, milestone detection, haptic on ring close, comeback/at-risk messages, 7-day week strip, render block). Per RESEARCH.md "Reusable Assets": milestone + haptic + comeback/at-risk logic proceeds exactly as today once state is seeded.

---

### `app/api/stats/route.ts` (route/API, request-response — MODIFY: GET delegates to `lib/dashboard.ts`)

**Analog:** `app/api/cards/due/route.ts` (Phase 11 delegation precedent — `getStudyCards` extracted to `lib/study-cards.ts`, API route becomes a thin handler) + `app/api/stats/route.ts` itself (the queries literally move out)

**Current GET handler** (`app/api/stats/route.ts` lines 1-17 — the entire file):
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const now = new Date()

  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])

  return NextResponse.json({ totalCards, dueCards, totalLessons, cardsByType, masteredCount })
}
```

**Delegation pattern** (`app/api/cards/due/route.ts` lines 1-2, 10-11, 38-42 — Phase 11 reference):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getStudyCards } from '@/lib/study-cards'
// ...
export async function GET(req: NextRequest) {
  try {
    // ... validation ...
    const cards = await getStudyCards({ scope: scope as 'due' | 'ahead', lessonFrom, lessonTo })
    return NextResponse.json(cards)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```
**Apply to `app/api/stats/route.ts`:**
```typescript
import { NextResponse } from 'next/server'
import { getStats } from '@/lib/dashboard'

export async function GET() {
  try {
    return NextResponse.json(await getStats())
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```

**Try/catch wrapper rationale:** `app/api/cards/due/route.ts` wraps the delegated call in `try/catch` returning 500 on unexpected failure — this is the codebase API route convention (RESEARCH.md "Project Constraints": validation errors → 400, unexpected → 500). `lib/dashboard.ts` is a library module that throws on Prisma failure; the API route catches and formats. (The RSC page does NOT try/catch — the throw propagates to the Next.js error boundary, per STATE.md.)

**Pitfall 4 caution (`cardsByType` shape):** `/wrapped` reads the `/api/stats` JSON response, so the route's response shape must stay byte-identical after delegation. `NextResponse.json(await getStats())` preserves the shape exactly — `getStats()` returns the same object literal the route used to build inline. Verify by loading `/wrapped` after conversion. (RESEARCH.md A1, Pitfall 4.)

---

### `app/api/activity/route.ts` (route/API, request-response — MODIFY: GET delegates to `lib/dashboard.ts`; POST untouched)

**Analog:** `app/api/cards/due/route.ts` (Phase 11 delegation precedent) + `app/api/activity/route.ts` itself

**Current GET handler** (`app/api/activity/route.ts` lines 26-37):
```typescript
export async function GET() {
  const [days, dailyGoalSeconds, dayStartHour] = await Promise.all([
    prisma.studyDay.findMany({
      orderBy: { date: 'desc' },
      take: 400,
      select: { date: true, seconds: true, reviews: true },
    }),
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return NextResponse.json({ days, dailyGoalSeconds, dayStartHour })
}
```

**Apply the delegation pattern** (same shape as `/api/stats` above):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getActivityData } from '@/lib/dashboard'
// ... keep the existing DATE_RE constant and POST handler ...

export async function GET() {
  try {
    return NextResponse.json(await getActivityData())
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```

**POST handler untouched (D-08):** `app/api/activity/route.ts` lines 8-23 (study-time logging — `prisma.studyDay.upsert`) stays verbatim. Only the GET handler body changes. Do NOT remove the `DATE_RE` constant or the `NextRequest` import (POST still needs them). The `prisma` and `getDailyGoalSeconds`/`getDayStartHour` imports can be removed from this file (they're now only used inside `lib/dashboard.ts`) — but verify no other reference remains before deleting.

---

## Shared Patterns

### RSC Page → Client Shell Composition (applies to `app/page.tsx` + `app/habits/page.tsx`)
**Source:** `app/study/page.tsx` (15 lines) + `app/cards/page.tsx` (47 lines)
**Apply to:** Both RSC page conversions
```typescript
// Server component — no client directive
import { getXxx, getYyy } from '@/lib/dashboard'
import XxxClient from '@/components/XxxClient'

export default async function XxxPage() {
  const [xxx, yyy] = await Promise.all([getXxx(), getYyy()])
  return <XxxClient initialXxx={xxx} initialYyy={yyy} />
}
```
**Next.js 16 docs confirmation:** `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` §"Passing data from Server to Client Components" + `06-fetching-data.md` §"With an ORM or database" + §"Parallel data fetching".

### Server-Only `lib/` Module Header (applies to `lib/dashboard.ts`)
**Source:** `lib/study-cards.ts` lines 1-2 + `lib/settings.ts` (same convention)
**Apply to:** `lib/dashboard.ts`
```typescript
// lib/dashboard.ts — server-only dashboard data layer
// No 'use client — this module runs server-side only.
```
**Rationale:** The `server-only` package is NOT installed (no new packages constraint — RESEARCH.md "Alternatives Considered" row 4). The comment is the established codebase precedent. The module also imports `prisma` (Node-only), which would fail at build time if accidentally imported client-side — defense in depth.

### DTO Type Pattern (applies to `lib/dto.ts` additions)
**Source:** `lib/dto.ts` lines 1-4, 6-18 (existing DTO home — Phase 11 D-05)
**Apply to:** `StatsDTO` + `ActivityDTO` additions
- File header comment: `// No 'use client — this module runs server-side and client-side (pure type definitions).`
- All `Date` fields documented as `// ISO string, was Date` — **not needed for `StatsDTO`/`ActivityDTO`** (no Date fields; both payloads are already primitives — RESEARCH.md Pattern 3, A2).
- Reuse existing types where possible: `DayRecord` from `lib/habit.ts` for `ActivityDTO.days[]` (precedent: `LessonRefItem` alias at `lib/dto.ts` line 63).

### `'use client'` Shell Pattern (applies to `components/HomeClient.tsx` + `components/HabitsClient.tsx`)
**Source:** `components/StudyClient.tsx` lines 1-3, 25-30 + `components/CardsClient.tsx` lines 1-3, 31-37
**Apply to:** Both new client shells
```typescript
'use client'   // ← literal first line, before any imports

import { useEffect, useState, useCallback } from 'react'
// ... other imports ...
import type { XxxDTO } from '@/lib/dto'

interface Props {
  initialXxx: XxxDTO
}

export default function XxxClient({ initialXxx }: Props) {
  const [xxx, setXxx] = useState<XxxDTO>(initialXxx)   // ← seed from props, NO null state
```
**Critical (Pitfall 8):** The `'use client'` directive MUST be the literal first line of the new shell files, before any imports. The corresponding page files (`app/page.tsx`, `app/habits/page.tsx`) must have NO `'use client'` after conversion.

### Purity-Gated Client-Local Time Reads (applies to `components/HomeClient.tsx` + `components/HabitsClient.tsx`)
**Source:** `app/page.tsx` lines 76-103 (the established `Promise.resolve().then(() => setState(...))` pattern)
**Apply to:** Both new client shells (D-01, D-02)
```typescript
useEffect(() => {
  // habitDateStr() / new Date() / new Date().getHours() call new Date() internally → impure.
  // react-hooks/purity forbids these in render. Call them in an effect only.
  // Promise.resolve().then(...) defers the setState to a microtask, satisfying
  // react-hooks/set-state-in-effect.
  const todayStr = habitDateStr(dayStartHour)
  Promise.resolve().then(() => setToday(todayStr))
}, [dayStartHour])
```
**Why client-side (D-01):** The Vercel server runs UTC; the habit-day "today" (which can roll at 2am local per `dayStartHour`) and the time-aware greeting both depend on the user's local clock. A server approximation would be wrong for every non-UTC timezone. Correctness wins over a fully-instant server render; the one-tick skeleton/pulse is the intentional, desired loading state (not an empty-state flash).

### API Route Delegation to `lib/` (applies to `app/api/stats/route.ts` + `app/api/activity/route.ts` GET)
**Source:** `app/api/cards/due/route.ts` lines 1-2, 10-11, 38-42 (Phase 11 precedent)
**Apply to:** Both API route GET handlers (D-08)
```typescript
import { NextResponse } from 'next/server'
import { getXxx } from '@/lib/dashboard'

export async function GET() {
  try {
    return NextResponse.json(await getXxx())
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```
**Rationale (D-08):** The GET routes stay (NOT removed) — they serve the home page's client-side post-sync refetch after pull-to-refresh (success criteria #3). They delegate to `lib/dashboard.ts` so the query logic is DRY (one source of truth shared with the RSC pages). The POST `/api/activity` handler (study-time logging) is untouched.

### Non-Blocking Client Saves / Refetches (applies to `components/HomeClient.tsx` post-sync refetch)
**Source:** `app/page.tsx` lines 44-74, 126-127 (`.then()`/`.catch(() => {})` chains)
**Apply to:** `HomeClient`'s `loadStats`/`loadActivity` callbacks (preserved verbatim from current `app/page.tsx`)
```typescript
const loadStats = useCallback(() => {
  fetch('/api/stats')
    .then((r) => r.json())
    .then((data: StatsDTO) => { /* setStats + band-up check */ })
    .catch(() => {})   // ← non-blocking; codebase convention
}, [])
```
**Apply to:** `components/StudyClient.tsx` lines 96-112 uses the same `.catch(() => {})` pattern for `/api/settings` and `/api/activity` (the existing convention).

### Lazy `canvas-confetti` Import (applies to `components/HomeClient.tsx` band-up path)
**Source:** `app/page.tsx` lines 56-60 (current home band-up) + `components/StudyClient.tsx` lines 363-368 (Phase 11 session-complete)
**Apply to:** `HomeClient` band-up check (preserved verbatim — success criteria #4)
```typescript
import('canvas-confetti').then((m) => {
  if (!isMountedRef.current) return
  const confetti = m.default
  confetti({ particleCount: 80, spread: 60, origin: { y: 0.4 } })
}).catch(() => {})
```
**Rationale:** Lazy import keeps the confetti library out of the initial client bundle. Already the established pattern — preserved unchanged.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every file in this phase has a strong analog. The phase is a direct replication of the Phase 10/11 RSC + client-shell + DTO pattern, applied to the two remaining dashboard routes. All analogs are verified in the codebase. |

**For files with no analog, the planner should fall back to:** RESEARCH.md patterns (especially Pattern 1 — RSC page + client shell, and Pattern 4 — one-tick skeleton/pulse swap) and the Next.js 16 docs in `node_modules/next/dist/docs/`.

---

## Metadata

**Analog search scope:**
- `lib/` — `lib/study-cards.ts` (primary), `lib/dto.ts`, `lib/habit.ts`, `lib/settings.ts`
- `app/` — `app/study/page.tsx` (primary RSC analog), `app/cards/page.tsx` (secondary RSC analog with serialization), `app/page.tsx` (current home — source of ported logic), `app/habits/page.tsx` (current habits — source of ported logic), `app/habits/loading.tsx` (skeleton reuse)
- `components/` — `components/StudyClient.tsx` (primary client-shell analog), `components/CardsClient.tsx` (secondary client-shell analog), `components/HabitTracker.tsx` (self-modifying), `components/StatsBar.tsx` (server-compatibility check — no `'use client'`, confirmed)
- `app/api/` — `app/api/cards/due/route.ts` (Phase 11 API delegation precedent), `app/api/stats/route.ts` (self-modifying), `app/api/activity/route.ts` (self-modifying)

**Files scanned:** 13 source files + 2 planning docs (CONTEXT.md, RESEARCH.md) + AGENTS.md
**Pattern extraction date:** 2026-06-30
**Pattern confidence:** HIGH — all analogs are verified in the codebase; the RSC + client-shell + DTO pattern is already shipped in Phases 10/11 on the same Next.js 16.2.1 + React 19.2.4 + Prisma 7.6.0 stack; Phase 12 is a direct replication with no version drift.
