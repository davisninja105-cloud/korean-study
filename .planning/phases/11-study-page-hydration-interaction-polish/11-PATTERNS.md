# Phase 11: Study Page Hydration & Interaction Polish - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/dto.ts` | utility | transform | `app/cards/page.tsx` (lines 4–60) | exact — same DTO types, just relocating |
| `lib/study-cards.ts` | service | CRUD + transform | `app/api/cards/due/route.ts` | exact — extracts the route body verbatim |
| `app/study/page.tsx` | route (RSC page) | request-response | `app/cards/page.tsx` | exact — same RSC + Promise.all + DTO + client shell pattern |
| `components/StudyClient.tsx` | component | event-driven | `components/CardsClient.tsx` | exact — same `'use client'` shell + initialCards/initialLessons props pattern |
| `components/StudySession.tsx` | component | event-driven | self (modification) | n/a — refactor of existing `submitReview` |

---

## Pattern Assignments

### `lib/dto.ts` (utility, transform)

**Analog:** `app/cards/page.tsx` lines 4–60

**Core pattern — move these types verbatim, add `unknownCount?` to `SentenceDTO`** (`app/cards/page.tsx` lines 8–60):
```typescript
// MOVE from app/cards/page.tsx — all Date fields serialized to ISO strings

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
  nextReview: string        // ISO string, was Date
  lastReview: string | null // ISO string or null, was Date | null
}

export interface SentenceDTO {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string         // ISO string
  updatedAt: string         // ISO string
  unknownCount?: number     // ADD: annotated by study-cards.ts pipeline; absent on cards page path
}

export interface LessonRefDTO {
  title: string
  orderIndex: number
  createdAt: string         // ISO string
}

export interface CardDTO {
  id: string
  createdAt: string
  updatedAt: string
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

// For /api/lessons and LessonRangeFilter
export interface LessonDTO {
  id: string
  orderIndex: number
  title: string
}

// Backward-compat alias so CardsClient.tsx import still works after migration
export type LessonRefItem = LessonDTO
```

**After creating `lib/dto.ts`:** Update `app/cards/page.tsx` to re-export from `@/lib/dto` and remove inline definitions. Update `components/CardsClient.tsx` line 12 from:
```typescript
import type { CardDTO, LessonRefItem } from '@/app/cards/page'
```
to:
```typescript
import type { CardDTO, LessonRefItem } from '@/lib/dto'
```

---

### `lib/study-cards.ts` (service, CRUD + transform)

**Analog:** `app/api/cards/due/route.ts` (entire file — extract the GET handler body)

**Imports pattern** — same dependencies as the route, minus HTTP types:
```typescript
// lib/study-cards.ts — server-only (imports prisma; do NOT import from 'use client' files)
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
import { countUnknownWords } from '@/lib/known-words'
import type { CardDTO } from '@/lib/dto'
```

**Signature:**
```typescript
export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number  // defaults to getSessionSize()
}

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]>
```

**Core pattern — Promise.allSettled parallelization** (`app/api/cards/due/route.ts` lines 47–80):
```typescript
const sessionSize = await getSessionSize()

const [poolResult, knownRowsResult] = await Promise.allSettled([
  prisma.card.findMany({
    where: {
      ...lessonClause,
      review: scope === 'due'
        ? { nextReview: { lte: now } }
        : { nextReview: { gt: now } },
    },
    include: {
      review:    true,
      lesson:    { select: { id: true, orderIndex: true, title: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
    orderBy: { review: { nextReview: 'asc' } },
    take: 1000,
  }),
  prisma.card.findMany({
    where: { review: { state: { gte: 1 } } },
    select: { normalizedFront: true },
  }),
])
```

**Error handling** (`app/api/cards/due/route.ts` lines 82–89):
```typescript
if (poolResult.status === 'rejected') {
  // In lib/study-cards.ts: throw rather than NextResponse — callers handle HTTP
  throw new Error('Database error')
}
const cards = poolResult.value
if (cards.length === 0) return []
```

**Sequential edge fetch + selection + sequencing** (`app/api/cards/due/route.ts` lines 91–121):
```typescript
const ids = cards.map((c) => c.id)
const edges = await prisma.cardDependency.findMany({
  where: { cardId: { in: ids }, prerequisiteId: { in: ids } },
  select: { cardId: true, prerequisiteId: true },
})

const chosen  = selectSessionCards(cards, edges, sessionSize, now)
const ordered = sequenceCards(chosen, edges, now)

const knownLemmas = new Set(
  knownRowsResult.status === 'fulfilled'
    ? knownRowsResult.value.map((r) => r.normalizedFront)
    : []
)

for (const card of ordered) {
  for (const s of card.sentences) {
    (s as typeof s & { unknownCount: number }).unknownCount =
      countUnknownWords(s.korean, s.targetForm, knownLemmas)
  }
}
```

**Date serialization before returning** (`app/cards/page.tsx` lines 79–98):
```typescript
// Serialize Prisma Date objects to ISO strings for the RSC→client boundary
return ordered.map((c) => ({
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
```

---

### `app/study/page.tsx` (RSC page, request-response)

**Analog:** `app/cards/page.tsx` (entire file — the RSC + client shell pattern)

**Imports pattern** (`app/cards/page.tsx` lines 1–3):
```typescript
// No 'use client' — server component
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'
```

**Core pattern — parallel server fetch + DTO + render client shell** (`app/cards/page.tsx` lines 62–101):
```typescript
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

**No `try/catch` at the page level** — Next.js error boundaries handle thrown errors from `getStudyCards`. The API route keeps its own `try/catch` around the `getStudyCards` call and returns `NextResponse.json({ error: ... }, { status: 500 })`.

---

### `components/StudyClient.tsx` (component, event-driven)

**Analog:** `components/CardsClient.tsx` (entire file)

**Client boundary declaration** (`components/CardsClient.tsx` line 1 — must be literal first line):
```typescript
'use client'
```

**Imports pattern** (`components/CardsClient.tsx` lines 2–12):
```typescript
import { useState } from 'react'
// ... other imports ...
import type { CardDTO, LessonRefItem } from '@/lib/dto'   // ← updated import path
```

**Props interface** (`components/CardsClient.tsx` lines 31–34):
```typescript
interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]  // was LessonRefItem in CardsClient; use LessonDTO for StudyClient
}

export default function StudyClient({ initialCards, initialLessons }: Props) {
```

**State initialization from props — no useEffect for initial data** (`components/CardsClient.tsx` lines 37–58):
```typescript
const [cards, setCards] = useState<CardDTO[]>(initialCards)

// Lesson state: initialized from server — no initial-load fetch needed
const [lessons] = useState<LessonDTO[]>(initialLessons)
const [lessonFrom, setLessonFrom] = useState(() =>
  initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
)
const [lessonTo, setLessonTo] = useState(() =>
  initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
)
```

**Phase initialization** — KEY DIFFERENCE from the current `app/study/page.tsx`:
```typescript
// Start in 'select-mode' (not 'loading') because cards arrive as props
const [phase, setPhase] = useState<Phase>('select-mode')
const [isFilterLoading, setIsFilterLoading] = useState(false)
```

**Filter re-fetch pattern — spinner instead of phase='loading'** (new pattern derived from RESEARCH.md):
```typescript
const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
  setIsFilterLoading(true)   // ← replaces setPhase('loading')
  fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
    .then((r) => r.json())
    .then((cards: CardDTO[]) => {
      setStudyCards(cards)
      setScope('due')
      setIsFilterLoading(false)
    })
    .catch(() => {
      setStudyCards([])
      setIsFilterLoading(false)
    })
}, [buildParams])
```

**Spinner in mode-select due-count area** (per RESEARCH.md Code Examples):
```typescript
{isFilterLoading ? (
  <div className="h-16 flex items-center justify-center" role="status" aria-label="Loading cards">
    <Loader2 className="w-5 h-5 animate-spin text-muted" />
  </div>
) : (
  <div className="h-16 flex flex-col items-center justify-center">
    <p className="text-5xl font-bold animate-reveal" style={{ color: 'var(--reward)' }}>
      {studyCards.length}
    </p>
    <p className="text-muted mt-1">card{studyCards.length !== 1 ? 's' : ''} ready</p>
  </div>
)}
```

---

### `components/StudySession.tsx` — `submitReview` refactor (component, event-driven)

**Analog:** self — targeted refactor of lines 396–465

**Current blocking pattern** (`components/StudySession.tsx` lines 396–441 — the jitter root cause):
```typescript
const submitReview = async (rating: number) => {   // async — blocks on fetch
  // ...
  if (current.kind === 'real') {
    const res = await fetch('/api/review', { ... }) // ← BLOCKS HERE 100–200ms
    const updatedReview = await res.json().catch(() => null)
    if (updatedReview?.nextReview) {
      requeue = new Date(updatedReview.nextReview) < nextHabitDayStart(...)
      updatedItem = { kind: 'real', card: { ...current.card, review: updatedReview } }
    }
    undoRef.current = { ... }
    setCanUndo(true)
  }
  // ...
  setQueue(nextQueue)  // ← Only after await
}
```

**Optimistic pattern — import addition** (add to existing imports):
```typescript
import { previewIntervalLabels, reviewCard, type Grade } from '@/lib/fsrs'
```

**Optimistic pattern — refactored `submitReview`** (replace `async` function body):
```typescript
const submitReview = (rating: number) => {   // NO longer async
  const current = queue[0]
  if (!current) return

  // ... haptic, stats, seenCount tracking unchanged ...

  let requeue = false
  let updatedItem: StudyItem = current

  if (current.kind === 'real') {
    const cardId = current.card.id
    const prevState = current.card.review ?? {}

    // 1. Compute FSRS result locally — instant, no network
    const reviewData = current.card.review
    if (reviewData && reviewData.nextReview && reviewData.lastReview) {
      // Convert ISO strings to Date objects (CardReviewFields requires Date, not string)
      const cardReviewFields = {
        state: reviewData.state ?? 0,
        stability: reviewData.stability ?? 0,
        difficulty: reviewData.difficulty ?? 0,
        elapsedDays: reviewData.elapsedDays ?? 0,
        scheduledDays: reviewData.scheduledDays ?? 0,
        reps: reviewData.reps ?? 0,
        lapses: reviewData.lapses ?? 0,
        nextReview: new Date(reviewData.nextReview),
        lastReview: new Date(reviewData.lastReview),
      }
      const localResult = reviewCard(cardReviewFields, rating as Grade)
      // 2. Decide requeue from local result (instant, no network)
      requeue = localResult.nextReview < nextHabitDayStart(dayStartHourRef.current, new Date())
      // 3. Carry updated state into re-queued item
      updatedItem = {
        kind: 'real',
        card: {
          ...current.card,
          review: {
            ...reviewData,
            state: localResult.state,
            stability: localResult.stability,
            difficulty: localResult.difficulty,
            elapsedDays: localResult.elapsedDays,
            scheduledDays: localResult.scheduledDays,
            reps: localResult.reps,
            lapses: localResult.lapses,
            nextReview: localResult.nextReview.toISOString(),
            lastReview: localResult.lastReview?.toISOString() ?? null,
          },
        },
      }
    }

    // Capture undo snapshot BEFORE queue advance (critical ordering)
    undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
    setCanUndo(true)

    // 4. Fire background save — no await, silent failure (D-09)
    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, rating }),
    }).catch(() => {})
  }

  // 5. Advance queue immediately (no await)
  const rest = queue.slice(1)
  // ... rest of queue advance logic unchanged ...
  setQueue(nextQueue)
}
```

**Keyboard handler update** (lines 529–536 — remove `void` since function is no longer async):
```typescript
if (e.key === '1') { e.preventDefault(); submitReview(1) }
// (no `void` needed for synchronous function)
```

---

## Shared Patterns

### RSC → Client Boundary: Date Serialization
**Source:** `app/cards/page.tsx` lines 79–98
**Apply to:** `lib/study-cards.ts` return value
```typescript
// All Prisma DateTime fields must be .toISOString() before crossing the boundary
review: c.review ? {
  ...c.review,
  nextReview: c.review.nextReview.toISOString(),
  lastReview: c.review.lastReview?.toISOString() ?? null,
} : null
```

### `'use client'` First Line Rule
**Source:** `components/CardsClient.tsx` line 1
**Apply to:** `components/StudyClient.tsx`
```typescript
'use client'
// (literal first line — before any imports)
```

### Props Interface Naming
**Source:** `components/CardsClient.tsx` lines 31–34
**Apply to:** `components/StudyClient.tsx`
```typescript
interface Props {   // always named 'Props', not 'StudyClientProps'
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]
}
```

### `@/` Path Alias
**Source:** `components/CardsClient.tsx` lines 6–12
**Apply to:** all new files
```typescript
import type { CardDTO } from '@/lib/dto'    // always @/ not relative
import { prisma } from '@/lib/prisma'
```

### Fire-and-Forget Error Swallowing
**Source:** RESEARCH.md Pattern 3 (D-09)
**Apply to:** `submitReview` background POST
```typescript
fetch('/api/review', { ... }).catch(() => {})  // silent failure per D-09
```

### API Route Error Handling Wrapper
**Source:** `app/api/cards/due/route.ts` lines 7–127
**Apply to:** simplified `app/api/cards/due/route.ts` after extraction
```typescript
export async function GET(req: NextRequest) {
  try {
    // parse + validate params (unchanged)
    const cards = await getStudyCards({ scope, lessonFrom, lessonTo })
    return NextResponse.json(cards)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```

---

## No Analog Found

All files have close analogs. No new patterns required from RESEARCH.md alone.

---

## Metadata

**Analog search scope:** `app/`, `components/`, `lib/`, `app/api/cards/due/`
**Files scanned:** 6 source files read directly
**Pattern extraction date:** 2026-06-30
