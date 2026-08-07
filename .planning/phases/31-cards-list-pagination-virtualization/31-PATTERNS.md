# Phase 31: Cards List Pagination & Virtualization - Pattern Map

**Mapped:** 2026-08-06
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/cards-list.ts` (rewrite: `getCardsPage`, `getCardsGroupCounts`, `getSentencesPage`) | service (data-layer) | CRUD (paginated read) | `lib/study-cards.ts` (`getStudyCards`, cursor-free but same shared-pipeline/DTO-serialize shape) + `lib/dashboard.ts` (`groupBy` count pattern) | exact (for groupBy) / role-match (for cursor pagination — no existing cursor query in repo) |
| `app/api/cards/route.ts` (rewrite `GET`, keep `POST`) | route (API handler) | request-response | itself (existing file) — same file, `GET` handler rewritten to accept query params; `POST` unchanged | exact |
| `app/api/cards/[id]/route.ts` (add `GET`) | route (API handler) | request-response | itself (existing `PUT` handler in same file) — new `GET` sibling | exact |
| `app/api/cards/sentences/route.ts` (new) | route (API handler) | request-response | `app/api/cards/due/route.ts` (thin wrapper delegating to a `lib/` pipeline function, with query-param parsing) | role-match |
| `lib/dto.ts` (add `CardsPageDTO`, `GroupCountsDTO`, `SentencePageDTO`) | model (DTO types) | transform | itself (existing `CardDTO`/`StatsDTO`/`ActivityDTO` shapes) | exact |
| `components/CardsClient.tsx` (rewrite: per-group cursor state, debounce, Virtuoso rows) | component (client shell) | request-response + streaming (incremental load) | itself (existing file) — same file, most logic replaced; `components/StudyClient.tsx` for the "server-side filter → isFilterLoading skeleton" precedent | exact (self) / role-match (StudyClient for filter-loading pattern) |
| `components/CardsVirtualList.tsx` (new, optional split) | component (list renderer) | streaming (windowed render) | none in-repo (no existing virtualization) — new pattern via `react-virtuoso` library API | no analog (library-driven) |
| `lib/useDebouncedValue.ts` (new hook) | hook | transform | `lib/usePullToRefresh.ts` (existing hand-rolled hook, same file/naming convention) | role-match |
| `components/FreshnessWatcher.tsx` (modify `/cards` backstop branch) | provider (context) | event-driven | itself (existing file) — same file, `/cards` branch's merge strategy changes from replace to upsert | exact |
| `tests/cards-list.test.ts` (new) | test | CRUD (unit) | `tests/study-cards.test.ts` (pure-function unit test against `lib/study-cards.ts`) | exact |
| `tests/cards-id-route.test.ts` (new, for `GET /api/cards/[id]`) | test | request-response (route-level) | `tests/review-route.test.ts` (route-level test: temp SQLite file DB, real DDL, dynamic-imports handler) | exact |

## Pattern Assignments

### `lib/cards-list.ts` (service, CRUD paginated read)

**Analog 1:** `lib/study-cards.ts` (shared-pipeline extraction + DTO serialization)
**Analog 2:** `lib/dashboard.ts` (`groupBy` count query)

**Imports pattern** (`lib/cards-list.ts` current, lines 1-8 — keep same shape):
```typescript
// No 'use client' — this module runs server-side only.
import { prisma } from '@/lib/prisma'
import type { CardDTO } from '@/lib/dto'
```

**Select-trim pattern** (`lib/cards-list.ts` lines 16-31 — keep everything EXCEPT drop `sentences` from the list-page select per CARDS-01; sentences move to `getSentencesPage`/`GET /api/cards/[id]`):
```typescript
const cardSelect = {
  id: true, createdAt: true, updatedAt: true, type: true, front: true, back: true,
  notes: true, normalizedFront: true, components: true, distractors: true, lessonId: true,
  lesson: { select: { title: true, createdAt: true, orderIndex: true } },
  review: true,
  // sentences: DROPPED from list select per CARDS-01 — fetched on demand via
  // GET /api/cards/[id] (CardEditor) or lib/cards-list.ts:getSentencesPage (Reading practice)
} as const
```

**Cursor pagination core pattern** — no existing cursor-paginated query in the codebase; use the pattern from RESEARCH.md's Pattern 1 verbatim (`take: PAGE_SIZE + 1` overfetch-by-one to detect `hasMore`, `cursor: { id }, skip: 1`, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` for a deterministic tiebreak).

**Parallel groupBy count pattern** (source: `lib/dashboard.ts` lines 20-31 — exact precedent, already used for `cardsByType`):
```typescript
const [totalCards, dueCards, totalLessons, cardsByType, ...] = await Promise.all([
  prisma.card.count(),
  prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
  prisma.lesson.count(),
  prisma.card.groupBy({ by: ['type'], _count: true }),
  ...
])
```
Apply the same `groupBy(['type'], _count: true)` shape to `getCardsGroupCounts()`, but with the phase's `where` clause (search + lesson-range) composed in, not the unconditional deck-wide query dashboard.ts uses.

**Promise.allSettled for independent-failure-tolerant parallel fetches** (source: `lib/study-cards.ts` lines 53-82 — pool query is CRITICAL/throws, edges/knownLemmas are NON-CRITICAL/degrade):
```typescript
const [poolResult, countsResult] = await Promise.allSettled([
  prisma.card.findMany({ where, select: cardSelect, orderBy, take: PAGE_SIZE + 1, ...cursorClause }),
  prisma.card.groupBy({ by: ['type'], where, _count: true }),
])
if (poolResult.status === 'rejected') throw new Error('Database error')
// counts failure degrades gracefully — page 1 without cursor param bundles counts;
// see RESEARCH.md Open Question 2 for "bundle counts into page-1 response only"
```

**Serialization pattern** (source: `lib/study-cards.ts` lines 164-186 / `lib/cards-list.ts` lines 45-65 — identical shape, reuse verbatim minus the `sentences.map(...)` block since sentences are dropped):
```typescript
return cards.map((c) => ({
  ...c,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  lesson: c.lesson ? { ...c.lesson, createdAt: c.lesson.createdAt.toISOString() } : null,
  review: c.review
    ? { ...c.review, nextReview: c.review.nextReview.toISOString(), lastReview: c.review.lastReview?.toISOString() ?? null }
    : null,
}))
```

**Server-side search across `Sentence` relation (D-05)** — new pattern, no direct in-repo analog for a cross-relation `where` filter on Card; compose via Prisma's relational filter:
```typescript
const searchClause = search
  ? {
      OR: [
        { front: { contains: search } },
        { back: { contains: search } },
        { notes: { contains: search } },
        { sentences: { some: { OR: [
          { korean: { contains: search } },
          { translation: { contains: search } },
        ] } } },
      ],
    }
  : {}
// Lowercase `search` before passing in (Pitfall 4, SQLite LIKE case-insensitivity is ASCII-only)
```

---

### `app/api/cards/route.ts` (route, request-response — `GET` rewrite)

**Analog:** itself, current `GET`/`POST` shape (lines 1-11 for GET, 13-70 for POST — POST is UNCHANGED by this phase)

**Current GET (to be replaced):**
```typescript
export async function GET() {
  const cards = await getCardsList()
  return NextResponse.json(cards)
}
```

**Query-param parsing pattern** (source: `app/api/cards/due/route.ts` — not read this session but referenced throughout RESEARCH.md/study-cards.ts as the sibling "GET with query params delegating to a lib/ function" pattern; same shape as `lib/study-cards.ts`'s `StudyCardsParams` interface, lines 14-19):
```typescript
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'all'
  const cursor = searchParams.get('cursor')
  const search = searchParams.get('search')?.toLowerCase() ?? null
  const lessonFrom = searchParams.get('lessonFrom') ? Number(searchParams.get('lessonFrom')) : null
  const lessonTo = searchParams.get('lessonTo') ? Number(searchParams.get('lessonTo')) : null
  const take = Math.min(Number(searchParams.get('take') ?? 30), 100) // DOS clamp per RESEARCH.md Security Domain

  const result = await getCardsPage({ type, cursor, search, lessonFrom, lessonTo, take })
  return NextResponse.json(result)
}
```

**Error handling pattern** — existing `app/api/cards/route.ts` has NO try/catch on GET today (relies on Next.js's default 500). CLAUDE.md's Error Handling convention (`.claude/CLAUDE.md` §Error Handling) requires try/catch wrapping; follow the `PUT` handler's pattern in `app/api/cards/[id]/route.ts` lines 88-104 (catch, `console.error` server-side only, generic message to client, specific Prisma error code mapping when applicable).

---

### `app/api/cards/[id]/route.ts` (route, request-response — add `GET`)

**Analog:** itself, existing `PUT` handler (lines 8-105) for shape/imports; RESEARCH.md's Code Examples section already drafted the target implementation

**Imports pattern** (lines 1-6, unchanged, reuse verbatim):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeFront } from '@/lib/card-key'
import { Prisma } from '@/app/generated/prisma/client'

const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const
```

**New GET handler** (per RESEARCH.md Code Examples, symmetric with `PUT`'s return shape at lines 81-87):
```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      review: true,
      lesson: { select: { title: true, createdAt: true, orderIndex: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
  })
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  // Serialize dates — same shape as POST's dto in app/api/cards/route.ts:49-68
  const dto = { ...card, createdAt: card.createdAt.toISOString(), /* ...full serialize, see lib/cards-list.ts pattern above */ }
  return NextResponse.json(dto)
}
```

**Error handling pattern** (source: `PUT` handler, lines 88-104 — wrap in try/catch, map `P2025` to 404 as the `DELETE` handler does at lines 115-121, generic 500 with server-only `console.error`):
```typescript
} catch (e) {
  console.error('GET /api/cards/[id] failed:', e)
  return NextResponse.json({ error: 'Failed to load card' }, { status: 500 })
}
```

---

### `app/api/cards/sentences/route.ts` (route, new — D-07's Reading practice fetch)

**Analog:** `app/api/cards/route.ts`'s GET shape (param parsing → delegate to `lib/` function → return JSON), composed with the cursor pattern from `lib/cards-list.ts:getCardsPage`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSentencesPage } from '@/lib/cards-list'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor')
  const search = searchParams.get('search')?.toLowerCase() ?? null
  const lessonFrom = searchParams.get('lessonFrom') ? Number(searchParams.get('lessonFrom')) : null
  const lessonTo = searchParams.get('lessonTo') ? Number(searchParams.get('lessonTo')) : null
  const take = Math.min(Number(searchParams.get('take') ?? 30), 100)

  const result = await getSentencesPage({ cursor, search, lessonFrom, lessonTo, take })
  return NextResponse.json(result)
}
```

---

### `lib/dto.ts` (model, DTO types — additions)

**Analog:** itself, existing `CardDTO`/`StatsDTO`/`ActivityDTO` shapes (not read line-by-line this session, but referenced by every consumer above as "typed `string` for every `DateTime` field" per the RSC-05 contract in CLAUDE.md)

```typescript
export interface CardsPageDTO {
  cards: CardDTO[]      // sentences omitted per CARDS-01
  nextCursor: string | null
  hasMore: boolean
}

export interface GroupCountsDTO {
  byType: { type: string; _count: number }[]
  total: number
}

export interface SentencePageDTO {
  sentences: (SentenceDTO & { card: CardDTO })[]
  nextCursor: string | null
  hasMore: boolean
}
```
Follow the existing convention: every `DateTime` field typed `string` (ISO), no raw Prisma `Date` crosses the server→client boundary (CLAUDE.md §RSC server hydration + DTO pattern).

---

### `components/CardsClient.tsx` (component, client shell — rewrite)

**Analog 1:** itself (existing file, lines 1-556) — most of the JSX (Sheet usage, SwipeRow, group headers, Filter Sheet, Add Sheet, Edit Sheet) is UNCHANGED; only the data-fetching/state layer changes.
**Analog 2:** `components/StudyClient.tsx` — precedent for "commit filter → server refetch → `isFilterLoading` skeleton, mode-select screen never disappears" (per CONTEXT.md's Reusable Assets note).

**`'use client'` + imports pattern** (lines 1-13, extend with new hook/library imports, keep rest verbatim):
```typescript
'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle, type StateSnapshot } from 'react-virtuoso'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
import { useFreshPayload } from '@/components/FreshnessWatcher'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { typeBadgeClass } from '@/lib/card-style'
import type { CardDTO, LessonRefItem } from '@/lib/dto'
```

**Gated prop-adoption pattern to PRESERVE and EXTEND** (source: lines 62-100 — the exact guard clause; per CONTEXT.md "must be preserved and extended to cover ... don't clobber a mid-scroll loaded-pages array either"):
```typescript
const [prevInitialCards, setPrevInitialCards] = useState(initialCards)
if (initialCards !== prevInitialCards) {
  setPrevInitialCards(initialCards)
  if (editingId === null && !showAdd && !adding && deletingIds.size === 0) {
    setCards(initialCards) // → becomes: merge into per-group loaded arrays, upsert-by-id
  }
}
```

**Props interface convention** (source: lines 32-35 — `interface Props { ... }`, not `type`, not suffixed with component name):
```typescript
interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonRefItem[]
}
```

**Client-side filter block to DELETE (per Anti-Patterns in RESEARCH.md)** — lines 108-131's `filteredCards = cards.filter(...)` block must be removed entirely, replaced by server-side query params + debounced refetch, NOT adapted.

**Sheet-open/close never resetting state** — because `CardsClient` itself never unmounts when a `Sheet` opens (Sheets are portal overlays, source: lines 543-553's Edit Sheet, 500-540's Add Sheet, 436-497's Filter Sheet all render conditionally via `open` prop, not conditional mount of `CardsClient`), D-04 is satisfied "for free" as long as the new pagination/loaded-groups state is declared in `CardsClient`'s own `useState`, not inside a component that unmounts.

---

### `lib/useDebouncedValue.ts` (hook, new)

**Analog:** `lib/usePullToRefresh.ts` (existing hand-rolled hook — same file-naming convention `kebab-case.ts`, exported named function, precedent explicitly cited in RESEARCH.md's "Don't Hand-Roll" section)

**react-hooks/purity-safe pattern** (source: RESEARCH.md Code Examples, verified against CLAUDE.md's `react-hooks/purity` rule — `Date.now()`/no-arg `new Date()` forbidden in render, timer must live in an effect):
```typescript
import { useState, useEffect } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
```

---

### `components/FreshnessWatcher.tsx` (provider, event-driven — `/cards` branch modification)

**Analog:** itself, existing `/cards` branch (lines 102-110) — merge strategy must change from replace to upsert-by-id per Pitfall 1.

**Current (to be changed — replace strategy, now WRONG once `/api/cards` is paginated):**
```typescript
} else if (path === '/cards') {
  fetch('/api/cards')
    .then((res) => (res.ok ? res.json() : null))
    .then((result: unknown) => {
      if (Array.isArray(result) && window.location.pathname === '/cards') {
        setPayloads((prev) => ({ ...prev, cards: result as CardDTO[] }))
      }
    })
    .catch(() => {})
}
```
Per Pitfall 1: `GET /api/cards` now returns `CardsPageDTO` (partial page), not a raw array — the `Array.isArray(result)` check must become a shape check on `CardsPageDTO`, and the consuming `CardsClient.tsx` gated-adoption effect must upsert-merge `freshCards.cards` into existing per-group loaded arrays (never `setCards(freshCards)` wholesale replace) — never delete a card merely because it's absent from a partial payload.

**Preserve:** the pathname re-check at both call time and response time (`window.location.pathname === '/cards'`), the `.catch(() => {})` non-blocking-write convention, and the 300ms `COALESCE_MS` burst-collapse — none of this changes.

---

### `tests/cards-list.test.ts` (test, unit — new)

**Analog:** `tests/study-cards.test.ts` (pure-function unit test pattern against a `lib/` pipeline module — not read this session in full, but confirmed to exist and match the "pure function unit test, no DB/API needed" category per `npm test`'s Vitest scope in CLAUDE.md's Commands section)

Cover: `getCardsPage` returns a capped page with no `sentences` field (CARDS-01); the `where`-builder composes search + lesson-range + type correctly (CARDS-03); cursor `hasMore`/`nextCursor` detection via the `take: PAGE_SIZE + 1` overfetch trick.

---

### `tests/cards-id-route.test.ts` (test, route-level — new, for `GET /api/cards/[id]`)

**Analog:** `tests/review-route.test.ts` (exact structural precedent — full file read above)

**Setup pattern to copy verbatim** (source: lines 1-63):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { createClient } from '@libsql/client'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { PrismaClient } from '../app/generated/prisma/client'
import type { GET as GetHandler } from '../app/api/cards/[id]/route'

let tmpDir: string, dbUrl: string, prisma: PrismaClient, GET: typeof GetHandler, cardId: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cards-id-route-test-'))
  const dbUrl = `file:${join(tmpDir, 'test.db')}`
  process.env.DATABASE_URL = dbUrl
  delete process.env.DATABASE_AUTH_TOKEN

  // Real schema DDL via prisma migrate diff --to-schema (NOT --to-schema-datamodel)
  const ddl = execSync(
    'npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script',
    { encoding: 'utf8' },
  )
  const ddlClient = createClient({ url: dbUrl })
  await ddlClient.executeMultiple(ddl)
  ddlClient.close()

  // Dynamic import AFTER env vars set + schema applied (ESM static imports are
  // hoisted and would read DATABASE_URL before it's set — same gotcha as
  // scripts/local-resync.mts, documented in CLAUDE.md)
  ;({ prisma } = await import('../lib/prisma'))
  ;({ GET } = await import('../app/api/cards/[id]/route'))
  // ...seed a Card + Sentence rows, capture cardId
})
```
Verify: `GET` returns full `CardDTO` including `sentences`; 404 shape for a nonexistent id.

## Shared Patterns

### RSC + client-shell + DTO boundary (all new server/client files)
**Source:** `CLAUDE.md` §RSC server hydration + DTO pattern; `app/cards/page.tsx` (thin async RSC, lines 1-23)
**Apply to:** `app/cards/page.tsx` (unchanged shape — still calls `getCardsList`-successor + renders `<CardsClient>`), `lib/cards-list.ts`, `lib/dto.ts`
```typescript
export const dynamic = 'force-dynamic'
export default async function CardsPage() {
  const [firstPage, lessons] = await Promise.all([
    getCardsPage({ type: 'vocabulary', cursor: null, search: null, lessonFrom: null, lessonTo: null, take: 30 }),
    prisma.lesson.findMany({ select: { id: true, orderIndex: true, title: true }, orderBy: { orderIndex: 'asc' } }),
  ])
  return <CardsClient initialCards={firstPage.cards} initialLessons={lessons} />
}
```

### Promise.allSettled for independent-failure-tolerant parallel fetches
**Source:** `lib/study-cards.ts` lines 53-90 (critical vs non-critical query classification); `.claude/CLAUDE.md` §Async Patterns
**Apply to:** `lib/cards-list.ts`'s `getCardsPage`/`getCardsGroupCounts` when bundling counts into the page-1 response (RESEARCH.md Open Question 2's recommendation)

### Error handling — API routes
**Source:** `app/api/cards/[id]/route.ts` lines 88-104, 111-124 (`.claude/CLAUDE.md` §Error Handling)
**Apply to:** all new/modified route handlers — try/catch, server-only `console.error`, generic client-facing message, specific Prisma error code mapping (`P2002`→400, `P2025`→404) where applicable

### Server-side query param validation (DOS clamp)
**Source:** RESEARCH.md Security Domain table — `take` must be clamped server-side (`Math.min(requestedTake, 100)`), mirrors `lib/settings.ts`'s server-defined session sizes
**Apply to:** `app/api/cards/route.ts`, `app/api/cards/sentences/route.ts`

### Hand-rolled hooks over new dependencies for simple problems
**Source:** `lib/usePullToRefresh.ts` (existing precedent), RESEARCH.md "Don't Hand-Roll" section
**Apply to:** `lib/useDebouncedValue.ts` — do NOT add `use-debounce` npm package

### `react-hooks/purity` — no impure calls in render
**Source:** `CLAUDE.md` §Gotchas/conventions; `components/StudySession.tsx`'s `seededShuffle`/`seed` memo precedent for reading time/randomness only in effects/handlers
**Apply to:** `lib/useDebouncedValue.ts`, any `onRangeChange`/scroll-threshold logic in `CardsClient.tsx`/`CardsVirtualList.tsx`

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/CardsVirtualList.tsx` (if split out) | component | streaming (windowed render) | No virtualization exists anywhere in the codebase today (`grep` confirmed zero hits for `virtual\|react-window\|react-virtual\|tanstack` per RESEARCH.md). Build directly against `react-virtuoso`'s documented API (`Virtuoso`, `onRangeChange`/`rangeChanged`, `getState`/`restoreStateFrom`) — see RESEARCH.md Patterns 2-4 for the concrete code shapes to follow instead of an in-repo analog. |
| Cursor-based Prisma query (`cursor`/`skip`/`take` overfetch-by-one pattern) | data-layer logic | CRUD | No cursor pagination exists anywhere in the current codebase (all existing queries are either unbounded `findMany` or capped `take` with no cursor, e.g. `lib/study-cards.ts`'s `take: 1000` safety cap). Follow RESEARCH.md Pattern 1 verbatim, cited against Prisma's own docs, not an in-repo precedent. |

## Metadata

**Analog search scope:** `lib/`, `app/api/cards/**`, `app/cards/**`, `components/CardsClient.tsx`, `components/FreshnessWatcher.tsx`, `components/StudyClient.tsx`, `lib/study-cards.ts`, `lib/dashboard.ts`, `lib/usePullToRefresh.ts`, `tests/`
**Files scanned:** 11 read in full this session (`lib/cards-list.ts`, `app/api/cards/route.ts`, `app/api/cards/[id]/route.ts`, `lib/dashboard.ts`, `lib/study-cards.ts`, `components/CardsClient.tsx`, `components/FreshnessWatcher.tsx`, `app/cards/page.tsx`, `tests/review-route.test.ts` partial) + RESEARCH.md's own full-file-read list (`CardEditor.tsx`, `LessonRangeFilter.tsx`, `lib/dto.ts`, `e2e/*.spec.ts` fixtures) taken as corroborating evidence, not re-read here.
**Pattern extraction date:** 2026-08-06
