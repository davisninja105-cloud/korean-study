# Phase 11: Study Page Hydration & Interaction Polish - Research

**Researched:** 2026-06-30
**Domain:** Next.js 16 RSC conversion, React optimistic UI, FSRS client-side computation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**RSC Architecture — Initial Load (RSC-02)**

- D-01: Full card set fetched server-side. The RSC page fetches the full initial card set (not just due count) plus lessons — same data as `/api/cards/due` today. Mode-select appears instantly with the correct due count, and tapping Start is also instant (cards already loaded, no further fetch needed).
- D-02: Shared logic extracted to `lib/study-cards.ts`. The pool-fetch + edge-fetch + knownLemmas + `selectSessionCards` + `sequenceCards` + annotation pipeline currently in `app/api/cards/due/route.ts` must be extracted into a server-only function in `lib/study-cards.ts`. Both the RSC page AND the API route call this shared function.
- D-03: Default scope is full span (all lessons). Server fetches cards across the full lesson span on first load.
- D-04: `StudyClient` starts in `'select-mode'` when `initialCards` is provided. The phase state machine initializes as `'select-mode'` (not `'loading'`) when `initialCards` is non-empty. Tapping a mode immediately enters `'studying'` — no re-fetch on session start.
- D-05: DTO types extracted to `lib/dto.ts`. Phase 10 kept DTO types inline in `app/cards/page.tsx`. Now that the study page is a second RSC consumer, extract shared DTO types (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`) to `lib/dto.ts`. Both `app/cards/page.tsx` and `app/study/page.tsx` import from there.

**Lesson Filter Re-fetch Behavior**

- D-06: Mode-select stays visible with a spinner in the due-count area during filter re-fetch. When the user changes the lesson range filter, the mode-select screen stays visible. The large due-count number is replaced by a small spinner while the new card count/set loads. On resolve, the count updates in place.
- D-07: Full span is the default initial lesson range. No per-user preference needed — first/last lesson orderIndex from server defines the initial range.

**Interaction Polish (UX-01) — Optimistic Grade**

- D-08: Optimistic grade advance — queue moves immediately, API saves in background. Fix: call `reviewCard(card.review, rating)` from `lib/fsrs.ts` client-side immediately, compute `requeue` decision locally, advance the queue (`setQueue`) right away, then fire `POST /api/review` in the background (no await).
- D-09: Silent failure for background save. If the background `POST /api/review` fails, the session continues uninterrupted. No toast or error surface.
- D-10: Undo remains functional. Undo snapshot is captured before the optimistic queue advance (same as today). Undo restores the pre-grade visual state.
- D-11: Audio loading state is acceptable — no prefetch. UX-01 is fully covered by the grade-button optimistic fix. No audio prefetch work in this phase.
- D-12: Card flip is already instant — no work needed. The 3D flip is pure CSS animation (no fetch).

**Claude's Discretion**

- Structure of `StudyClient` component (name, file location): follow the `CardsClient` pattern from Phase 10 — `'use client'`, accepts `initialCards` / `initialLessons` props, all interactivity inside.
- Spinner implementation for the filter re-fetch: use a simple inline SVG or Tailwind `animate-spin` on a Lucide icon; match the design system.

### Deferred Ideas (OUT OF SCOPE)

- Audio prefetch — Prefetching TTS audio for the current card while it's being shown. Not needed; audio loading state is acceptable. Consider for a future polish phase if users request it.
- Stale card freshness on session start — Re-fetching cards when the page has been open for a while (cards may become due while idle). Out of scope for Phase 11; accepted trade-off of the pre-loaded approach.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSC-02 | Study page receives initial card set from the server — no blank loading phase on first load | RSC conversion of `app/study/page.tsx` to async server component; `lib/study-cards.ts` extracts the due-card pipeline; `StudyClient` initializes in `'select-mode'` from `initialCards` prop |
| UX-01 | Card flip, grade buttons, and audio button during an active study session have no re-fetch or recompute jitter | Optimistic `submitReview` refactor: call `reviewCard()` locally, advance queue immediately, fire `POST /api/review` as fire-and-forget |
</phase_requirements>

---

## Summary

Phase 11 has two independent workstreams that both polish the study experience without adding new capabilities.

**Workstream A (RSC-02):** Convert `app/study/page.tsx` from a `'use client'` component with serial `useEffect` fetches to an async server component that pre-fetches the full card set and lesson list server-side, then renders a `StudyClient` client shell. The current page shows a blank loading skeleton because `phase` initializes as `'loading'` and two sequential `useEffect` fetches (lessons → cards/due) run before mode-select appears. After conversion, the mode-select screen renders on first paint with the correct due count. A new `lib/study-cards.ts` extracts the pipeline currently in `app/api/cards/due/route.ts` so both the RSC page and the API route share the same logic without duplication. The shared DTO types (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`) move from `app/cards/page.tsx` into a new `lib/dto.ts` consumed by both RSC pages.

**Workstream B (UX-01):** The grade buttons in `StudySession.tsx` currently `await fetch('/api/review')` before advancing the card queue, causing 100–200ms of visible jitter between button tap and card advance. The fix is to call `reviewCard()` from `lib/fsrs.ts` client-side immediately, compute the requeue decision locally, advance the queue (`setQueue`) right away, then fire `POST /api/review` as a fire-and-forget in the background. This requires converting `submitReview` from `async` to synchronous. One type mismatch requires attention: `reviewCard` takes `CardReviewFields` with `nextReview: Date` and `lastReview: Date | null` (actual Date objects), while `StudySession.tsx`'s `Card.review` type stores these as `string | null` (ISO strings from the API). The implementation must convert these strings to Date objects before calling `reviewCard`.

**Primary recommendation:** Extract `lib/study-cards.ts` first, then convert the study page to RSC, then extract `lib/dto.ts`, then refactor `submitReview` for optimistic grade advance.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Initial card set fetch (first load) | API / Backend (RSC) | — | Data fetching at render time belongs in the server component; eliminates client waterfall |
| Lesson list fetch (first load) | API / Backend (RSC) | — | Fetched alongside cards at server render |
| Card pipeline (pool + edge + knownLemmas + sequence + annotate) | API / Backend | — | Lives in `lib/study-cards.ts`; called by RSC page AND API route |
| Mode selection, filter, session state | Browser / Client | — | Stateful, interactive — must stay in `'use client'` StudyClient |
| FSRS grade computation (optimistic) | Browser / Client | API / Backend | Pure computation — runs client-side for instant feedback; API persists result |
| Background review persistence | API / Backend | — | `POST /api/review` fires after local state update; not awaited |
| Undo restore | Browser / Client | API / Backend | Client restores visual snapshot; `POST /api/review/undo` fires to DB |
| DTO type definitions | API / Backend (RSC) | Browser / Client | Types shared across boundary — defined in `lib/dto.ts`, used by both tiers |
| Filter re-fetch spinner | Browser / Client | — | `isFilterLoading` state in `StudyClient`; replaces due-count number with spinner |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| Next.js | 16.2.1 | App Router RSC, async page components | Already in use |
| React | 19.2.4 | Server Components, client components | Already in use |
| Prisma | 7.6.0 | ORM; called from `lib/study-cards.ts` | Already in use |
| TypeScript | 5.9.3 | DTO type definitions, strict mode | Already in use |
| ts-fsrs | 5.3.1 | FSRS algorithm; `reviewCard()` called client-side for optimistic grade | Already in use |
| lucide-react | 1.17.0 | `Loader2` icon for filter re-fetch spinner | Already in use |

**No installation needed.** All patterns are built into the existing stack.

---

## Package Legitimacy Audit

> SKIPPED — No new packages installed in this phase. All patterns use the existing Next.js 16 + React 19 + ts-fsrs stack. Legitimacy gate is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
First load (RSC path):
  Browser → GET /study
    → app/study/page.tsx (Server Component, async)
      → lib/study-cards.ts({scope:'due', lessonFrom:null, lessonTo:null})
          → Promise.allSettled([pool query, knownLemmas query])
          → edge query (sequential — depends on pool IDs)
          → selectSessionCards + sequenceCards + annotate unknownCount
          → return CardDTO[] (dates serialized to ISO strings)
      → prisma.lesson.findMany (parallel with study-cards.ts via Promise.all)
      → render <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
    → HTML stream → browser paints mode-select screen immediately

Navigation (loading.tsx path):
  Browser clicks Nav → /study
    → app/study/loading.tsx (skeleton) renders immediately
    → RSC page.tsx executes in background
    → content replaces skeleton

Filter re-fetch (client path):
  User changes lesson range
    → StudyClient.loadDue(from, to, maxOrder)
      → setIsFilterLoading(true) → spinner replaces due-count number
      → fetch('/api/cards/due?lessonFrom=N&lessonTo=M')
        → lib/study-cards.ts (server, same pipeline)
      → setStudyCards(cards), setIsFilterLoading(false)
      → due-count number fades in with animate-reveal

Study-ahead re-fetch (client path):
  User taps "Study N more →"
    → StudyClient.startAhead()
      → setPhase('loading') (brief skeleton during fetch)
      → fetch('/api/cards/due?scope=ahead&...')
      → setStudyCards(cards), setPhase('studying')

Optimistic grade (UX-01 fix):
  User taps grade button (Again/Hard/Good/Easy)
    → submitReview(rating) [now synchronous]
      1. reviewCard(card.review, rating) → localResult [client-side FSRS, instant]
      2. Compute requeue from localResult.nextReview
      3. setQueue(nextQueue) → card advances immediately
      4. fetch('/api/review', { method: 'POST', ... }).catch(() => {}) [background]
```

### Recommended Project Structure

```
app/
├── study/
│   ├── loading.tsx          # Phase 9 skeleton (unchanged)
│   └── page.tsx             # Converted: async RSC, calls lib/study-cards.ts, renders StudyClient
components/
│   ├── StudyClient.tsx      # NEW: 'use client' shell; all study interactivity
│   └── StudySession.tsx     # Refactored: submitReview now synchronous + optimistic
lib/
│   ├── study-cards.ts       # NEW: server-only pipeline (pool + edge + knownLemmas + sequence)
│   └── dto.ts               # NEW: shared DTO types extracted from app/cards/page.tsx
app/api/
│   └── cards/due/route.ts   # Simplified: delegates to lib/study-cards.ts
```

### Pattern 1: RSC Page with Client Shell (reuse of Phase 10 pattern)

**What:** The page component is an async server component. It calls `lib/study-cards.ts` directly (no `fetch('/api/cards/due')`), serializes results via DTO types, then renders a `'use client'` component that owns all interactivity.

**When to use:** Any page where initial data must arrive with the HTML and interactivity must be preserved.

**Example:**
```typescript
// app/study/page.tsx — SERVER COMPONENT (no 'use client')
// [VERIFIED: codebase — mirrors app/cards/page.tsx RSC pattern from Phase 10]
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

export default async function StudyPage() {
  // Parallel fetch: cards pipeline + lesson list
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

### Pattern 2: Extracting `lib/study-cards.ts`

**What:** A server-only module that encapsulates the entire card selection pipeline. Called by both the RSC page (server render) and the API route (client re-fetches).

**Key signature:**
```typescript
// lib/study-cards.ts — server-only (imports prisma)
// [VERIFIED: codebase — derived from app/api/cards/due/route.ts]
import type { CardDTO } from '@/lib/dto'

export interface StudyCardsParams {
  scope: 'due' | 'ahead'
  lessonFrom: number | null
  lessonTo: number | null
  sessionSize?: number  // defaults to getSessionSize() from lib/settings.ts
}

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]>
```

The function body is identical to the current `app/api/cards/due/route.ts` GET handler minus the HTTP parsing (no `NextRequest`, no `NextResponse`) — it returns `CardDTO[]` directly.

The API route then becomes:
```typescript
// app/api/cards/due/route.ts (simplified)
// [VERIFIED: codebase — current route logic extracted verbatim]
export async function GET(req: NextRequest) {
  try {
    // ... parse + validate params (unchanged) ...
    const cards = await getStudyCards({ scope, lessonFrom, lessonTo })
    return NextResponse.json(cards)
  } catch {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
```

### Pattern 3: Optimistic Grade Advance

**What:** `submitReview` in `StudySession.tsx` becomes synchronous. It calls `reviewCard()` locally for instant requeue decision, advances the queue immediately, then fires `POST /api/review` in the background.

**Critical type conversion:** `reviewCard` takes `CardReviewFields` with `nextReview: Date` and `lastReview: Date | null`. But `StudySession.tsx`'s `Card.review` stores these as `string | null` (ISO strings). Must convert before calling `reviewCard`.

```typescript
// components/StudySession.tsx — submitReview refactor
// [VERIFIED: codebase — lib/fsrs.ts:reviewCard signature; components/StudySession.tsx:submitReview]
import { reviewCard, type Grade } from '@/lib/fsrs'

// submitReview is now NOT async
const submitReview = (rating: number) => {
  const current = queue[0]
  if (!current) return

  haptic(rating >= 3 ? 'success' : 'selection')
  reviewBuffer.current += 1
  const isCorrect = rating >= 3
  const prevStats = stats
  setStats((s) => ({
    reviewed: s.reviewed + 1,
    correct: s.correct + (isCorrect ? 1 : 0),
    incorrect: s.incorrect + (isCorrect ? 0 : 1),
  }))

  // Seen-count tracking (unchanged)
  const isFirstSeen = current.kind === 'practice' || !seenCardIdsRef.current.has(current.card.id)
  const prevSeenCount = seenCount
  const prevSeenCardIds = new Set(seenCardIdsRef.current)
  if (isFirstSeen) {
    if (current.kind === 'real') seenCardIdsRef.current.add(current.card.id)
    setSeenCount((c) => c + 1)
  }

  let requeue = false
  let updatedItem: StudyItem = current

  if (current.kind === 'real') {
    const cardId = current.card.id
    const prevState = current.card.review ?? {}

    // 1. Compute FSRS result locally — instant, no network
    const reviewData = current.card.review
    if (reviewData && reviewData.lastReview) {
      // Convert ISO strings to Date objects for reviewCard (CardReviewFields requires Date)
      const cardReviewFields = {
        state: reviewData.state ?? 0,
        stability: reviewData.stability ?? 0,
        difficulty: reviewData.difficulty ?? 0,
        elapsedDays: reviewData.elapsedDays ?? 0,
        scheduledDays: reviewData.scheduledDays ?? 0,
        reps: reviewData.reps ?? 0,
        lapses: reviewData.lapses ?? 0,
        nextReview: new Date(reviewData.nextReview!),
        lastReview: new Date(reviewData.lastReview),
      }
      const localResult = reviewCard(cardReviewFields, rating as Grade)
      // 2. Decide requeue from local result (instant)
      requeue = localResult.nextReview < nextHabitDayStart(dayStartHourRef.current, new Date())
      // 3. Update item with new review state (carry into re-queued card)
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

    // Capture undo snapshot before queue advance
    undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }
    setCanUndo(true)

    // 4. Fire background save — no await
    fetch('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, rating }),
    }).catch(() => {})
  }

  // 5. Advance queue immediately
  const rest = queue.slice(1)
  const gap = Math.min(REQUEUE_GAP, rest.length)
  const nextQueue = requeue
    ? [...rest.slice(0, gap), updatedItem, ...rest.slice(gap)]
    : rest

  if (nextQueue.length === 0) {
    const finalStats = {
      reviewed: prevStats.reviewed + 1,
      correct: prevStats.correct + (isCorrect ? 1 : 0),
      incorrect: prevStats.incorrect + (isCorrect ? 0 : 1),
    }
    onComplete(finalStats)
    return
  }

  setQueue(nextQueue)
  setCursor((c) => c + 1)
  setRevealed(false)
  setFillInput('')
  setMcSelected(null)
  setExampleOffset(0)
  setIntervalHints(null)
}
```

### Pattern 4: `lib/dto.ts` — Extracted DTO Types

**What:** Move DTO types from `app/cards/page.tsx` to `lib/dto.ts`. Update `app/cards/page.tsx` to import from there. Add `StudyCardDTO` if the study page needs different fields (but it doesn't — it can reuse `CardDTO`).

**Key consideration:** `CardDTO` from `app/cards/page.tsx` currently includes `createdAt` and `updatedAt` (not needed by `StudyClient`), and `LessonRefDTO` with `createdAt`. The study card DTO returned by `lib/study-cards.ts` needs `unknownCount` on each sentence. The planner must decide: extend `SentenceDTO` with an optional `unknownCount?: number` field, or define a separate `StudySentenceDTO`.

**Recommendation:** Add `unknownCount?: number` to `SentenceDTO` in `lib/dto.ts`. This field is already present on the sentence shape returned by `/api/cards/due` (annotated server-side in the pipeline). This keeps a single DTO type for sentences across both the cards page and study page.

```typescript
// lib/dto.ts
// [VERIFIED: codebase — current DTO types from app/cards/page.tsx lines 8-60]

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
  nextReview: string       // ISO string
  lastReview: string | null // ISO string or null
}

export interface SentenceDTO {
  id: string
  cardId: string
  korean: string
  targetForm: string
  translation: string
  orderIndex: number
  createdAt: string        // ISO string (cards page uses this; study page can ignore)
  updatedAt: string        // ISO string
  unknownCount?: number    // Annotated by study-cards.ts pipeline; absent on cards page path
}

export interface LessonRefDTO {
  title: string
  orderIndex: number
  createdAt: string        // ISO string
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
```

### Pattern 5: `StudyClient` Phase State Machine

**What:** `StudyClient` replaces the current `'use client'` `StudyPage`. Key behavior differences:
- Initialized with `initialCards` + `initialLessons` props (never starts in `'loading'`)
- `phase` initializes as `'select-mode'` (never `'loading'`) — the `'loading'` state is preserved only for `startAhead` (brief skeleton while fetching ahead cards)
- `isFilterLoading` boolean replaces the `setPhase('loading')` call in `handleRangeChange`

```typescript
// components/StudyClient.tsx
// [VERIFIED: codebase — derived from app/study/page.tsx phase state machine]
'use client'

import { useState, useCallback } from 'react'
import type { CardDTO, LessonDTO } from '@/lib/dto'

// Phase no longer includes 'loading' as the initial state
type Phase = 'select-mode' | 'loading-practice' | 'studying' | 'complete' | 'loading'
// 'loading' still used by startAhead; eliminated from initial paint path

interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]
}

export default function StudyClient({ initialCards, initialLessons }: Props) {
  const [studyCards, setStudyCards] = useState<CardDTO[]>(initialCards)
  // Phase initializes as 'select-mode' — no loading needed
  const [phase, setPhase] = useState<Phase>('select-mode')
  const [isFilterLoading, setIsFilterLoading] = useState(false)

  // Lessons: initialized from server — no initial useEffect fetch needed
  const [lessons] = useState<LessonDTO[]>(initialLessons)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [lessonTo, setLessonTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )

  // Filter re-fetch: stays in select-mode, shows spinner instead of going to 'loading'
  const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
    setIsFilterLoading(true)
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
  // ... rest of StudyClient
}
```

### Anti-Patterns to Avoid

- **Starting `StudyClient` in `'loading'` phase:** The whole point of D-04 is that `StudyClient` starts in `'select-mode'` because cards arrive as props. If you initialize `phase` as `'loading'`, you re-introduce the blank loading flash.
- **Re-fetching cards on session start (`handleModeSelect`):** Once cards are pre-loaded as `initialCards`, tapping "Start studying →" must go directly to `'studying'` — no `fetch('/api/cards/due')` in `handleModeSelect`.
- **Calling `reviewCard` with string dates:** `reviewCard` requires `CardReviewFields` with `nextReview: Date` (not string). Call `new Date(reviewData.nextReview)` before passing to `reviewCard`. `previewIntervalLabels` uses a different `PartialReview` type that accepts strings — do not confuse the two.
- **Making `submitReview` async after the refactor:** The refactored `submitReview` must be synchronous (no `async`). The `void submitReview(1)` call sites in event handlers remain valid. The keyboard handler `e.key === '1' => void submitReview(1)` becomes `e.key === '1' => submitReview(1)` (no need for `void`).
- **`useEffect` for initial data in `StudyClient`:** No `useEffect` for fetching lessons or cards on mount. Both arrive as props. Only `useEffect` that survives: settings fetch for `dayStartHour` (activity tracking), activity tracker interval, `advanceTimer` cleanup.
- **Passing `Date` objects across the RSC→client boundary:** The `lib/study-cards.ts` return type must be `CardDTO[]` (ISO string dates), not raw Prisma objects. The `nextReview: Date` in Prisma results must be serialized via `.toISOString()` before returning.
- **Calling `prisma` from `StudyClient`:** `StudyClient` is `'use client'`; Prisma imports Node.js internals and will fail in the browser. Only `lib/study-cards.ts` (server-only) calls Prisma.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FSRS scheduling (client-side) | Custom interval computation | `reviewCard()` from `lib/fsrs.ts` | Already implements FSRS via `ts-fsrs`; call from client for optimistic grade |
| Date serialization | Custom date formatter | `.toISOString()` / `new Date(str)` | Standard JS; ISO 8601 round-trips correctly |
| Optimistic UI framework | Custom sync queue | Direct `setState` + `.catch(() => {})` | No new packages; trivial for single fire-and-forget |
| Spinner animation | Custom CSS keyframe | `animate-spin` from Tailwind + `Loader2` from lucide-react | Already in dependency set; zero-cost to reuse |
| Card pipeline duplication | Copy-paste route logic into RSC | `lib/study-cards.ts` shared module | Single source of truth; route and RSC both call it |

---

## Common Pitfalls

### Pitfall 1: `reviewCard` Type Mismatch — String vs. Date

**What goes wrong:** `reviewCard` is called with `current.card.review.nextReview` (type `string | null` from the DTO) but `CardReviewFields` requires `nextReview: Date`. TypeScript strict mode catches this — `Type 'string' is not assignable to type 'Date'`.

**Why it happens:** The API/DTO pipeline serializes dates to ISO strings for the RSC boundary. `reviewCard` was originally designed for server-side use where Prisma returns actual `Date` objects.

**How to avoid:** Before calling `reviewCard`, construct a `cardReviewFields` object with explicit `new Date(str)` conversions. Guard with `if (reviewData && reviewData.lastReview)` — for new cards without a last review, skip the local computation and treat `requeue = false` (safe: new cards always go back into the queue via REQUEUE_GAP anyway, or call `createEmptyCard` path).

**Warning signs:** TypeScript error `Type 'string | null' is not assignable to type 'Date | null'` on the `reviewCard` call.

### Pitfall 2: `handleModeSelect` Re-fetches Cards

**What goes wrong:** The current `handleModeSelect` in `app/study/page.tsx` does NOT fetch cards (it was already using the loaded `studyCards`). But if a developer reads the old code and misses this, they might accidentally add a re-fetch. Tapping "Start studying →" should be instant — no fetch.

**Why it happens:** The `loadDue` call is triggered only by `useEffect` on mount (pre-RSC) or by the filter `handleRangeChange`. The mode-select → studying transition is local state only.

**How to avoid:** `handleModeSelect` sets `setPhase('studying')` (and optionally `setPhase('loading-practice')` for AI mode). No `fetch` call. The card set is already in `studyCards` state (either from `initialCards` prop or a previous `loadDue` call).

### Pitfall 3: `isFilterLoading` and Phase State Conflict

**What goes wrong:** Two loading signals exist: `phase === 'loading'` (used by `startAhead`) and `isFilterLoading === true` (new, for filter re-fetch). If code checks only one, the wrong screen renders.

**Why it happens:** The filter re-fetch deliberately stays in `'select-mode'` while `isFilterLoading` is true (D-06). But `startAhead` still needs `phase === 'loading'` to show the full skeleton.

**How to avoid:** The render for `phase === 'select-mode'` checks `isFilterLoading` to decide whether to show the spinner or the real count. The render for `phase === 'loading'` is unchanged (only triggered by `startAhead`). These are orthogonal states.

### Pitfall 4: Undo Snapshot Timing After Optimistic Refactor

**What goes wrong:** In the current code, `undoRef.current` is set AFTER `await fetch('/api/review')` — meaning the undo snapshot includes the server-confirmed review state. After the refactor, the snapshot must be captured BEFORE the optimistic queue advance.

**Why it happens:** The refactor changes the ordering: compute → snapshot → advance → background-fire. Previously: advance was gated behind the await.

**How to avoid:** Capture `undoRef.current = { cardId, prevState, prevQueue: queue, prevStats, prevSeenCount, prevSeenCardIds }` BEFORE `setQueue(nextQueue)`. The `prevState` is `current.card.review ?? {}` (the pre-grade review state). If the background POST already succeeded before undo is triggered, the DB is already updated — undo via `POST /api/review/undo` will correctly restore the DB (the undo route accepts the prevState object, per existing `app/api/review/undo/route.ts`).

### Pitfall 5: `lib/study-cards.ts` Import in a Client Component

**What goes wrong:** `lib/study-cards.ts` imports `prisma` (a Node.js singleton). If any client component directly imports `study-cards.ts`, the build fails with a webpack error about server-only imports.

**Why it happens:** Next.js detects Prisma client imports in the browser bundle and throws.

**How to avoid:** `lib/study-cards.ts` must NOT be imported from any `'use client'` file. The client re-fetches via `/api/cards/due` (HTTP). Only `app/study/page.tsx` (server component) and `app/api/cards/due/route.ts` (route handler) import it directly.

### Pitfall 6: DTO Import Cycle After `lib/dto.ts` Extraction

**What goes wrong:** `app/cards/page.tsx` currently exports its DTO types (e.g., `import type { CardDTO } from '@/app/cards/page'` in `components/CardsClient.tsx`). After `lib/dto.ts` is created, `CardsClient.tsx` must be updated to import from `@/lib/dto` instead of `@/app/cards/page`.

**Why it happens:** Phase 10 plan explicitly deferred `lib/dto.ts` to Phase 11. The current codebase imports DTO types from the page file.

**How to avoid:** Update `components/CardsClient.tsx` line 12 (`import type { CardDTO, LessonRefItem } from '@/app/cards/page'`) to import from `@/lib/dto` when `lib/dto.ts` is created. Also update `app/cards/page.tsx` to re-export from `lib/dto.ts` or change its own imports. Check all files for `from '@/app/cards/page'` type imports.

---

## Code Examples

### Current `submitReview` — the blocking pattern (jitter root cause)
```typescript
// Source: components/StudySession.tsx lines 396–467 [VERIFIED: codebase]
const submitReview = async (rating: number) => {
  // ...
  const res = await fetch('/api/review', {  // ← BLOCKS HERE (100–200ms)
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardId, rating }),
  })
  const updatedReview = await res.json().catch(() => null) as Card['review']
  if (updatedReview?.nextReview) {
    requeue = new Date(updatedReview.nextReview) < nextHabitDayStart(...)
    // ...
  }
  // ...
  setQueue(nextQueue)  // ← Only advances AFTER the await resolves
}
```

### `reviewCard` — client-safe FSRS computation
```typescript
// Source: lib/fsrs.ts lines 90–139 [VERIFIED: codebase]
export function reviewCard(review: CardReviewFields, rating: Grade) {
  // Pure: takes CardReviewFields (Date objects required), returns next state
  // Returns: { state, stability, difficulty, elapsedDays, scheduledDays,
  //            reps, lapses, nextReview: Date, lastReview: Date }
  const result = fsrs.next(card, now, rating)
  return { ...result.card fields mapped to our schema }
}
```

### DTO Import Migration Pattern
```typescript
// Before (Phase 10 — CardsClient.tsx line 12):
import type { CardDTO, LessonRefItem } from '@/app/cards/page'

// After (Phase 11 — import from shared lib):
import type { CardDTO, LessonDTO } from '@/lib/dto'
// Note: LessonRefItem → LessonDTO (rename for consistency)
```

### Filter Spinner Replacement
```typescript
// Source: app/study/page.tsx lines 261–267 + UI-SPEC [VERIFIED: codebase + CONTEXT.md]
// Before (always shows number):
<p className="text-5xl font-bold" style={{ color: 'var(--reward)' }}>
  {studyCards.length}
</p>

// After (spinner during filter re-fetch):
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

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `useEffect` fetch chain (lessons → cards) on mount | RSC data fetch → client shell with `initialCards` props | Eliminates blank loading flash on first paint |
| `async submitReview` + `await fetch('/api/review')` blocks queue | Synchronous `submitReview` + fire-and-forget | Grade buttons respond instantly (~150ms faster) |
| DTO types inline in `app/cards/page.tsx` | Shared `lib/dto.ts` used by both RSC pages | Single source of truth; no drift between pages |
| Serial study page fetches | `lib/study-cards.ts` shared pipeline | No duplication between RSC and API route |

**Deprecated/outdated in this phase context:**
- Initial `'loading'` phase on `StudyPage` mount — replaced by `'select-mode'` initial state in `StudyClient`
- `async submitReview` — replaced by synchronous version with fire-and-forget background save
- DTO types inline in `app/cards/page.tsx` — moved to `lib/dto.ts`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `reviewCard` can safely be called client-side in `StudyClient` (a browser environment) — `ts-fsrs` has no Node.js-only dependencies | Architecture Patterns, Pattern 3 | Medium — if ts-fsrs uses Node internals, client-side call fails at runtime. Mitigation: `lib/fsrs.ts` already imports from `ts-fsrs`; if it were Node-only it would have failed in the existing `previewIntervalLabels` call (which runs client-side in `handleReveal`). Risk is LOW. |
| A2 | `new Date(isoString)` is reliable for converting DTO date strings back to Date objects in all target browsers (modern iOS Safari, Chrome, Firefox) | Code Examples, Pattern 3 | Low — ISO 8601 string parsing is standardized; all modern browsers support it |
| A3 | The background `POST /api/review` failure rate is low enough that silent failure is acceptable (D-09) | CONTEXT.md (locked) | Low — this is a user decision, not a technical assumption |
| A4 | Cards fetched server-side at page render time are not stale enough to cause incorrect study sessions (D-deferred for stale freshness) | CONTEXT.md (deferred) | Low — user decision per deferred ideas |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **`LessonRefItem` vs `LessonDTO` naming**
   - What we know: `app/cards/page.tsx` exports `LessonRefItem` (used by `CardsClient`). The Context says to use `LessonDTO` in `lib/dto.ts`.
   - What's unclear: Whether `CardsClient.tsx` should be updated to use `LessonDTO` or whether `LessonRefItem` should stay as an alias in `lib/dto.ts`.
   - Recommendation: Export both as aliases in `lib/dto.ts` (`export type LessonRefItem = LessonDTO`) to avoid breaking `CardsClient.tsx` import without a second file edit. Or rename cleanly to `LessonDTO` everywhere — fewer symbols is cleaner.

2. **`unknownCount` on `SentenceDTO`**
   - What we know: The study pipeline annotates sentences with `unknownCount`. The cards page does NOT need this field.
   - What's unclear: Whether to add `unknownCount?: number` to `SentenceDTO` in `lib/dto.ts`, or define a separate `StudySentenceDTO`.
   - Recommendation: Add `unknownCount?: number` to `SentenceDTO` — optional field causes no harm on the cards page path and avoids a parallel type hierarchy.

---

## Environment Availability

Step 2.6: SKIPPED — no new external dependencies. All patterns use the existing Next.js 16, React 19, ts-fsrs, Prisma 7 stack already installed and running on the developer's machine.

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per project configuration.

---

## Project Constraints (from CLAUDE.md)

- **No new npm packages** — All patterns (RSC, optimistic UI, DTO) use existing Next.js 16 + React 19 + ts-fsrs stack
- **ESLint strict:** `react-hooks/purity` forbids `Date.now()` / `Math.random()` in render; `react-hooks/set-state-in-effect` forbids synchronous `setState` in effect bodies. The `new Date()` calls inside `submitReview` are in an event handler — safe.
- **`'use client'` always first line** — `StudyClient.tsx` must have `'use client'` as the literal first line, before imports
- **No `useEffect` for initial data** — `StudyClient` initializes state from props (lazy initializers for derived values)
- **Semantic tokens only** — spinner uses `text-muted`, `border-button`; due count uses `var(--reward)` inline style
- **Dark mode mirror rule** — if any new CSS variable values are added, mirror in both `@media (prefers-color-scheme: dark)` `:root` AND `:root[data-theme="dark"]` blocks
- **Lint must stay clean** — `npm run lint` must pass with zero errors after all changes
- **Turso schema unchanged** — no DDL changes, no `prisma db push`
- **`interface Props` naming** — not `StudyClientProps`
- **No barrel index.ts files** — import each file directly via `@/` path alias

---

## Security Domain

`security_enforcement: true` in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing `middleware.ts` auth unchanged |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Single-tenant; auth cookie gate unchanged |
| V5 Input Validation | no | No new user inputs; existing lesson/scope params in API route unchanged |
| V6 Cryptography | no | No crypto changes |

**No new security surface.** The RSC page fetches Prisma data server-side and serializes it — no new input vectors. The optimistic grade fix changes client-side timing only — the server-side `POST /api/review` handler is unchanged and still validates `cardId` + `rating`. No new API endpoints.

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RSC → client boundary data exposure | Information Disclosure | `lib/study-cards.ts` returns only fields the client already received via `/api/cards/due` JSON — no new sensitive columns |
| Background POST tamper | Tampering | `POST /api/review` validates `cardId` string and `rating` number; protected by existing auth middleware |

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `app/study/page.tsx` (full 436-line file), `app/api/cards/due/route.ts`, `components/StudySession.tsx` (full 917-line file), `lib/fsrs.ts`, `app/api/review/route.ts`, `app/api/review/undo/route.ts`, `components/CardsClient.tsx`, `app/cards/page.tsx`, `app/study/loading.tsx` [VERIFIED: codebase read]
- `.planning/phases/11-study-page-hydration-interaction-polish/11-CONTEXT.md` — all locked decisions [VERIFIED: file read]
- `.planning/phases/11-study-page-hydration-interaction-polish/11-UI-SPEC.md` — interaction contract, spinner spec [VERIFIED: file read]
- `.planning/phases/10-cards-hydration-api-parallelization/10-RESEARCH.md` — RSC + client shell + DTO pattern documentation [VERIFIED: file read]
- `.planning/phases/10-cards-hydration-api-parallelization/10-01-PLAN.md` — concrete Phase 10 plan (structural pattern to replicate) [VERIFIED: file read]

### Secondary (MEDIUM confidence)
- Next.js App Router RSC serialization constraint ("Only plain objects can be passed to Client Components") [ASSUMED: training knowledge, consistent with codebase behavior]
- Fire-and-forget `fetch(...).catch(() => {})` pattern for optimistic UI [ASSUMED: standard JavaScript pattern]
- `ts-fsrs` browser compatibility (no Node.js-only dependencies) [ASSUMED: inferred from existing client-side use of `previewIntervalLabels` which calls the same library]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no research uncertainty
- Architecture: HIGH — RSC + client shell pattern is demonstrated by Phase 10's `CardsClient` (already in codebase); pipeline extraction is a direct refactor of an existing route
- Pitfalls: HIGH — Date type mismatch verified by reading `lib/fsrs.ts:CardReviewFields` vs `StudySession.tsx:Card.review`; import cycle verified by reading `CardsClient.tsx` line 12; others are structural
- Optimistic grade: HIGH — `reviewCard` signature and return type verified from source; fire-and-forget pattern is standard JS

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable stack; Next.js 16 + React 19 + ts-fsrs APIs are stable)
