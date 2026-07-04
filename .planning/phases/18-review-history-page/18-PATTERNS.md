# Phase 18: Review History Page - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 9 (5 new, 4 modified)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|---------------|
| `lib/review-history.ts` | service | CRUD (paginated read) | `lib/study-cards.ts` | exact |
| `app/history/page.tsx` | route (RSC page) | request-response | `app/habits/page.tsx` | exact |
| `app/history/loading.tsx` | component (skeleton) | — | `app/habits/loading.tsx` | exact |
| `app/api/reviews/route.ts` | route (API) | request-response | `app/api/cards/due/route.ts` | exact |
| `components/HistoryClient.tsx` | component (client shell) | request-response + event-driven (infinite scroll) | `components/HabitsClient.tsx` | role-match |
| `lib/dto.ts` (+ReviewLogDTO) | model/type | transform | existing `ReviewDTO`/`CardDTO` in same file | exact |
| `lib/dashboard.ts` (+cardsByState) | service | CRUD (aggregate) | existing `cardsByType` groupBy in same file | exact |
| `lib/fsrs.ts` (export masteryPhrase) | utility | transform | existing `masteryPhrase`/`previewIntervalLabels` in same file | exact |
| `components/HabitsClient.tsx` (+Card progress section) | component | request-response | own "My Korean summary" Link section + `HabitTracker.tsx` Link pattern | exact |
| `components/CardEditor.tsx` (+View history link) | component | request-response | own existing action-row links | exact |

## Pattern Assignments

### `lib/review-history.ts` (service, CRUD/paginated read)

**Analog:** `lib/study-cards.ts`

**Imports pattern** (lib/study-cards.ts lines 1-11):
```typescript
// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'
```
For `lib/review-history.ts`, mirror exactly:
```typescript
// lib/review-history.ts — server-only review-history pipeline
// No 'use client' — this module runs server-side only.
import { prisma } from '@/lib/prisma'
import { Rating, masteryPhrase } from '@/lib/fsrs'
import type { ReviewLogDTO } from '@/lib/dto'

export const PAGE_SIZE = 25
```

**Core pattern — params interface + shared function signature** (lib/study-cards.ts lines 13-20):
```typescript
export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number
}

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> {
```
Mirror as:
```typescript
export interface ReviewHistoryParams {
  cardId?: string | null
  cursor?: string | null   // last-seen ReviewLog.id from previous page
  take?: number            // defaults to PAGE_SIZE
}

export async function getReviewHistory(params: ReviewHistoryParams): Promise<ReviewLogDTO[]> {
  const { cardId, cursor, take = PAGE_SIZE } = params

  const logs = await prisma.reviewLog.findMany({
    where: cardId ? { cardId } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), // skip:1 excludes cursor row itself
    include: { card: { select: { id: true, front: true, type: true } } },
  })

  // Serialize: convert all Prisma Date objects to ISO strings before returning (RSC-05).
  return logs.map((l) => ({
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    cardId: l.cardId,
    cardFront: l.card.front,
    cardType: l.card.type,
    rating: l.rating,
    gradeName: Rating[l.rating],
    mastery: masteryPhrase(l.nextReview, l.createdAt),
  }))
}
```

**Error handling pattern** (lib/study-cards.ts lines 67-69): library functions throw on unexpected input/DB error; caller (API route or RSC page) wraps in try/catch. Do NOT wrap the Prisma call in try/catch inside the lib function itself — this matches the project convention (`lib/` throws, `app/api/*/route.ts` catches).

---

### `app/history/page.tsx` (route/RSC page, request-response)

**Analog:** `app/habits/page.tsx`

**Full pattern to mirror** (app/habits/page.tsx, entire file, 20 lines):
```typescript
// Server component — no client directive
import { getStats, getActivityData } from '@/lib/dashboard'
import HabitsClient from '@/components/HabitsClient'

export const dynamic = 'force-dynamic'

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
For `app/history/page.tsx`, read `?cardId=` from `searchParams` (Next.js 16 App Router: `page.tsx` receives `searchParams: Promise<{ cardId?: string }>` — await it), call `getReviewHistory({ cardId, cursor: null })`, and pass `initialLogs`/`cardId` to `HistoryClient`. Keep `export const dynamic = 'force-dynamic'` (same reasoning: live DB data, not a static prerender).

---

### `app/history/loading.tsx` (skeleton component)

**Analog:** `app/habits/loading.tsx`

**Full pattern** (app/habits/loading.tsx): static server component, no `'use client'`, no hooks, `bg-surface-3 animate-pulse` blocks shaped like the real content (header row, then N row placeholders). For history, shape as:
```typescript
export default function HistoryLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-surface-3 animate-pulse" />
        <div className="h-5 w-24 rounded bg-surface-3 animate-pulse" />
      </div>
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 w-full rounded-xl bg-surface-3 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
```
Note: per CLAUDE.md, `loading.tsx` only covers client-side nav transitions, not first load (RSC hydration handles first load).

---

### `app/api/reviews/route.ts` (API route, request-response)

**Analog:** `app/api/cards/due/route.ts`

**Full pattern to mirror** (app/api/cards/due/route.ts, entire file):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getStudyCards } from '@/lib/study-cards'

const INTEGER_RE = /^[1-9]\d*$/

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    // ... param extraction + validation ...
    const cards = await getStudyCards({ scope, lessonFrom, lessonTo })
    return NextResponse.json(cards)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```
For `/api/reviews`, adapt (per RESEARCH.md's exact code example):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getReviewHistory, PAGE_SIZE } from '@/lib/review-history'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const cursor = searchParams.get('cursor')
    const cardId = searchParams.get('cardId')
    const logs = await getReviewHistory({ cardId, cursor, take: PAGE_SIZE })
    return NextResponse.json(logs)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```
`cursor`/`cardId` are opaque `cuid()` strings, not integers — no `INTEGER_RE`-style validation needed (a garbage value just matches zero rows, a safe no-op per RESEARCH.md Security Domain).

---

### `components/HistoryClient.tsx` ('use client' shell, request-response + event-driven)

**Analog:** `components/HabitsClient.tsx` (RSC shell shape) + IntersectionObserver pattern from RESEARCH.md (no in-repo precedent)

**Shell/props pattern** (components/HabitsClient.tsx lines 1-46):
```typescript
'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import HabitsLoading from '@/app/habits/loading'
// ...

interface Props {
  initialDays: DayRecord[]
  initialGoal: number
  // ...
}

export default function HabitsClient({ initialDays, initialGoal, ... }: Props) {
  const [days] = useState<DayRecord[]>(initialDays)
  // ...
}
```
For `HistoryClient.tsx`:
```typescript
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import type { ReviewLogDTO } from '@/lib/dto'

interface Props {
  initialLogs: ReviewLogDTO[]
  cardId: string | null
  cardFront: string | null   // for the "All cards ×" chip label, if filtered
  pageSize: number
}

export default function HistoryClient({ initialLogs, cardId, cardFront, pageSize }: Props) {
  const [rows, setRows] = useState<ReviewLogDTO[]>(initialLogs)
  const [hasMore, setHasMore] = useState(initialLogs.length === pageSize)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // ... loadMore + IntersectionObserver effect (see RESEARCH.md Pattern 2 verbatim) ...
}
```

**IntersectionObserver infinite-scroll pattern** — copy verbatim from RESEARCH.md Pattern 2 (already vetted for `react-hooks/purity` and `set-state-in-effect` compliance):
```typescript
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
    setHasMore(next.length === pageSize)
  } catch {
    // leave hasMore as-is; sentinel stays mounted for a future intersection
  } finally {
    loadingRef.current = false
    setLoadingMore(false)
  }
}, [rows, hasMore, cardId, pageSize])

useEffect(() => {
  const el = sentinelRef.current
  if (!el || !hasMore) return
  const observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { rootMargin: '200px' }
  )
  observer.observe(el)
  return () => observer.disconnect()
}, [loadMore, hasMore])
```

**Row rendering — rating pill + grade color mapping** (per UI-SPEC.md, uses `ReviewLogDTO.gradeName`):
```typescript
const gradeRowClass: Record<string, string> = {
  Again: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
  Hard:  'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
  Good:  'bg-surface-2 text-foreground',
  Easy:  'bg-surface-2 text-foreground',
}
```

**Sentinel loading spinner idiom** — copy from `components/AudioButton.tsx` line 112:
```typescript
<span className="inline-block border-2 border-button border-t-transparent rounded-full animate-spin h-4 w-4" />
```
(NOT `SyncPanel.tsx` — it has no spinner, only "Syncing…" text; see RESEARCH.md Pitfall 4.)

**"All cards ×" clear-filter chip** — mirror `components/LessonRangeFilter.tsx`'s reset-button style (line 70-73):
```typescript
<button
  onClick={() => router.push('/history')}
  className="text-xs text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft"
>
  {cardFront} ×
</button>
```

**Page shell + header** — mirror `HabitsClient.tsx` lines 108-115 exactly (container, header, back-link):
```typescript
<main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-bold text-foreground">History</h1>
    <Link href="/habits" className="text-sm text-muted hover:text-muted-foreground underline underline-offset-2">
      ← Habits
    </Link>
  </div>
  {/* ...cardId chip, row list, sentinel... */}
</main>
```

---

### `lib/dto.ts` (+ReviewLogDTO)

**Analog:** existing `ReviewDTO`/`SentenceDTO` shapes in same file (lines 8-32)

**Pattern — every DateTime field is ISO string**:
```typescript
export interface ReviewLogDTO {
  id: string
  createdAt: string     // ISO string, was Date
  cardId: string
  cardFront: string
  cardType: string
  rating: number
  gradeName: string      // 'Again' | 'Hard' | 'Good' | 'Easy'
  mastery: string         // e.g. "Memory strengthening → 3d"
}
```
Also extend `StatsDTO` (lines 71-79) with the FSRS-state breakdown, mirroring the existing `cardsByType` field shape exactly:
```typescript
export interface StatsDTO {
  // ...existing fields...
  cardsByState: { state: number; stateLabel: string; _count: number }[]
}
```

---

### `lib/dashboard.ts` (+cardsByState groupBy)

**Analog:** existing `cardsByType` groupBy in `getStats()` (lines 17-28)

**Exact pattern to mirror**:
```typescript
// existing:
prisma.card.groupBy({ by: ['type'], _count: true }),
```
Add alongside it in the same `Promise.all` array:
```typescript
export async function getStats(): Promise<StatsDTO> {
  const now = new Date()
  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount, cardsByStateRaw] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
    prisma.cardReview.groupBy({ by: ['state'], _count: true }),
  ])
  const cardsByState = cardsByStateRaw.map((r) => ({
    state: r.state,
    stateLabel: State[r.state],   // import { State } from '@/lib/fsrs'
    _count: r._count,
  }))
  return { totalCards, dueCards, totalLessons, cardsByType, masteredCount, cardsByState }
}
```
Note: groupBy is on `prisma.cardReview` (the FSRS state lives on `CardReview`, not `Card`) — same table `getStats()` already queries for `dueCards`/`masteredCount`.

---

### `lib/fsrs.ts` (export masteryPhrase)

**Analog:** the function itself, currently module-private at line 39

**Change required** (single-line diff):
```typescript
// current (line 39):
function masteryPhrase(due: Date, now: Date): string {
// change to:
export function masteryPhrase(due: Date, now: Date): string {
```
No other change — `previewIntervalLabels` (line 52) already calls it internally and is unaffected by adding `export`.

---

### `components/HabitsClient.tsx` (+Card progress section)

**Analog:** own "My Korean summary" Link section (lines 259-269) for the whole-card-Link pattern; own "All-time totals" 4-tile grid (lines 144-165) for the tile layout; `StatsDTO.cardsByState` (new) for data.

**Whole-section-as-Link pattern to mirror** (lines 259-269):
```typescript
<Link
  href="/wrapped"
  className="flex items-center justify-between bg-surface-1 rounded-2xl shadow-md px-5 py-4 hover:shadow-lg active:shadow-sm active:bg-surface-2 transition-colors"
>
  <div>
    <p className="text-sm font-semibold text-foreground">My Korean summary</p>
    <p className="text-xs text-muted">All-time stats &amp; shareable progress card</p>
  </div>
  <span className="text-muted text-lg" aria-hidden="true">→</span>
</Link>
```
Per UI-SPEC.md D-08, the new "Card progress" section instead wraps the full 4-tile grid (mirroring the "All-time totals" tile pattern, lines 145-165) inside one `<Link href="/history">`:
```typescript
<Link href="/history" className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-3 hover:shadow-lg transition-shadow">
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold text-foreground">Card progress</h2>
    <span className="text-xs text-button">View history →</span>
  </div>
  <div className="grid grid-cols-2 gap-3">
    {stateTiles.map(({ label, count }) => (
      <div key={label} className="bg-surface-2 rounded-xl p-4">
        <p className="text-2xl font-bold text-foreground">{count}</p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    ))}
  </div>
</Link>
```
Requires a new `initialCardsByState` prop on `HabitsClient` (passed from `app/habits/page.tsx`'s `stats.cardsByState`), following the same `initialX` naming convention as existing props (`initialDays`, `initialGoal`, `initialMasteredCount`).

---

### `components/CardEditor.tsx` (+View history link)

**Analog:** own existing amber-warning styling precedent (lines 138-181) for literal-color usage convention; general action-row link pattern per UI-SPEC.md D-10.

**Link styling per UI-SPEC.md** (plain text link, not a button):
```typescript
<Link
  href={`/history?cardId=${card.id}`}
  className="text-sm text-button hover:text-button-hover"
>
  View history →
</Link>
```
Place near other card-level actions in the existing action row within `CardEditor.tsx` (planner to pick exact location — "a sensible existing action-row location", per UI-SPEC.md).

---

## Shared Patterns

### RSC + DTO + client-shell hydration (RSC-05 contract)
**Source:** `app/habits/page.tsx` + `components/HabitsClient.tsx` + `lib/dto.ts`
**Apply to:** `app/history/page.tsx`, `components/HistoryClient.tsx`, `lib/dto.ts`
- Thin async RSC page: no `'use client'`, no hooks, fetch via `lib/` function(s), render exactly one `*Client.tsx` with data as props.
- Every `DateTime` field converted to `.toISOString()` before crossing the RSC→client prop boundary — no raw Prisma `Date` object may ever be passed as a prop.
- `export const dynamic = 'force-dynamic'` on the RSC page (live DB data, not static).

### Shared lib/ function backing both RSC page and GET API route
**Source:** `lib/study-cards.ts:getStudyCards()` used by both `app/study/page.tsx` and `GET /api/cards/due`
**Apply to:** `lib/review-history.ts:getReviewHistory()` used by both `app/history/page.tsx` and `GET /api/reviews`
- Library function throws on DB error; callers (API route) catch and return `{ error }, { status: 500 }`.
- No business logic duplicated between the RSC page and the route handler — both call the same function with different params (page 1 has no cursor; the API route always has one).

### API route try/catch/500 shape
**Source:** `app/api/cards/due/route.ts` (and `app/api/stats/route.ts`)
**Apply to:** `app/api/reviews/route.ts`
```typescript
export async function GET(req: NextRequest) {
  try {
    // ...
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```

### Semantic color tokens — never literal orange, amber is the vetted exception
**Source:** `app/globals.css` tokens + `components/CardEditor.tsx`'s `warnUnsafe` amber precedent
**Apply to:** `components/HistoryClient.tsx` grade-row styling
- Again: `bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400` (reuses `FlashcardMode.tsx`'s existing Again-button red literal).
- Hard: `bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400` (reuses `CardEditor.tsx`'s `warnUnsafe` amber literal — confirmed with user per UI-SPEC.md, NOT orange).
- Good/Easy: `bg-surface-2 text-foreground` (neutral, semantic tokens).
- Accent (`text-button`) reserved for "View history →" link text and the active "All cards ×" chip — never for row backgrounds/badges.

### Whole-card/whole-section wrapped in a single `<Link>`
**Source:** `components/HabitTracker.tsx` (freeze/comeback + ring pattern) and `components/HabitsClient.tsx`'s "My Korean summary" link (lines 259-269)
**Apply to:** `components/HabitsClient.tsx`'s new "Card progress" section (D-08) — entire tile grid + heading wrapped in one `<Link href="/history">`, `hover:shadow-lg transition-shadow`, no per-tile hover states.

### Spinner idiom
**Source:** `components/AudioButton.tsx` line 112
**Apply to:** `HistoryClient.tsx`'s IntersectionObserver sentinel loading state
```typescript
<span className="inline-block border-2 border-button border-t-transparent rounded-full animate-spin h-4 w-4" />
```
Do NOT use `SyncPanel.tsx` as a spinner reference — it has none (text-only "Syncing…" state).

### Filter chip / clear-filter convention
**Source:** `components/LessonRangeFilter.tsx` reset button (lines 70-73)
**Apply to:** `HistoryClient.tsx`'s "All cards ×" chip (D-11)
```typescript
className="text-xs text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft"
```

## No Analog Found

None — all 9 files/modifications have a strong, directly-applicable analog already in the codebase (the only genuinely novel mechanism, IntersectionObserver infinite scroll, has no in-repo precedent but is fully specified as verified code in RESEARCH.md's Pattern 2, itself treated as the analog).

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `prisma/schema.prisma`
**Files scanned:** `app/habits/page.tsx`, `app/habits/loading.tsx`, `components/HabitsClient.tsx`, `components/HabitTracker.tsx`, `components/LessonRangeFilter.tsx`, `components/AudioButton.tsx`, `components/CardEditor.tsx`, `lib/study-cards.ts`, `lib/dashboard.ts`, `lib/dto.ts`, `lib/fsrs.ts`, `app/api/cards/due/route.ts`, `prisma/schema.prisma` (ReviewLog model)
**Pattern extraction date:** 2026-07-04
