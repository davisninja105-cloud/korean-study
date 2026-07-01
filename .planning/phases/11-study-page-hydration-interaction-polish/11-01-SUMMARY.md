---
phase: 11-study-page-hydration-interaction-polish
plan: "01"
subsystem: shared-lib
tags: [dto, server-pipeline, refactor, rsc]
dependency_graph:
  requires: []
  provides: [lib/dto.ts, lib/study-cards.ts]
  affects: [app/cards/page.tsx, components/CardsClient.tsx]
tech_stack:
  added: []
  patterns: [shared-dto-module, server-only-pipeline, date-serialization]
key_files:
  created:
    - lib/dto.ts
    - lib/study-cards.ts
  modified:
    - app/cards/page.tsx
    - components/CardsClient.tsx
decisions:
  - lesson select in study-cards.ts includes createdAt to satisfy LessonRefDTO.createdAt field (route omitted it, cards page included it)
  - LessonRefItem exported as backward-compat alias for LessonDTO so CardsClient import works without rename
  - app/cards/page.tsx re-exports all DTO types from @/lib/dto for any future page-level consumers
metrics:
  duration: 2min
  completed: 2026-06-30
status: complete
---

# Phase 11 Plan 01: Shared DTO Types and Study-Card Pipeline Summary

Extracted shared DTO types into `lib/dto.ts` and the due-card selection pipeline into `lib/study-cards.ts` — the two shared modules that both the cards page and the forthcoming study RSC page rely on.

## What Was Built

**`lib/dto.ts`** — Pure type module (no `'use client'`, no Prisma imports). Exports `ReviewDTO`, `SentenceDTO` (with new optional `unknownCount?` field), `LessonRefDTO`, `CardDTO`, `LessonDTO`, and `LessonRefItem` (backward-compat alias for `LessonDTO`). Single source of truth for all server→client DTO types across RSC pages.

**`lib/study-cards.ts`** — Server-only module. Exports `StudyCardsParams` interface and `getStudyCards(params): Promise<CardDTO[]>`. Replicates the entire pipeline from `app/api/cards/due/route.ts` minus HTTP concerns: `Promise.allSettled` for concurrent pool + knownLemmas queries, sequential edge query, `selectSessionCards`, `sequenceCards`, `unknownCount` annotation per sentence, and full `Date → ISO string` serialization before return. Pool failure throws `Error('Database error')`; knownLemmas failure degrades to empty Set.

**`app/cards/page.tsx`** — Removed inline DTO interface definitions. Imports `CardDTO` from `@/lib/dto`. Re-exports all DTO types from `@/lib/dto` for any consumers that previously imported from the page.

**`components/CardsClient.tsx`** — Repointed line 12 import from `@/app/cards/page` to `@/lib/dto`. No behavioral change.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Extract shared DTO types into lib/dto.ts | f62c241 |
| 2 | Extract due-card pipeline into lib/study-cards.ts | 3387445 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `createdAt` to lesson select in `lib/study-cards.ts`**
- **Found during:** Task 2 TypeScript check
- **Issue:** The route's lesson select was `{ id: true, orderIndex: true, title: true }` — missing `createdAt`. The `LessonRefDTO` interface (and the serialization map) requires `createdAt`. TypeScript caught this: `Property 'createdAt' does not exist on type '{ id: string; orderIndex: number; title: string; }'`
- **Fix:** Added `createdAt: true` to the lesson select in `lib/study-cards.ts` to match the `cards/page.tsx` pattern (which correctly included it)
- **Files modified:** `lib/study-cards.ts`
- **Commit:** 3387445

## Verification Results

- `npx tsc --noEmit`: exit 0
- `npm run lint`: exit 0 (zero errors)
- `npm test`: 58 tests passed (pure-lib Vitest suite — sequence/known-words unaffected)
- No `'use client'` file imports `@/lib/study-cards`
- No file imports DTO types from `@/app/cards/page` (all repointed to `@/lib/dto`)

## Self-Check: PASSED

Files exist:
- `lib/dto.ts` — FOUND
- `lib/study-cards.ts` — FOUND

Commits exist:
- f62c241 — FOUND
- 3387445 — FOUND

Acceptance criteria:
- `lib/dto.ts` contains all 6 required exports — PASSED
- `lib/dto.ts` SentenceDTO has `unknownCount?: number` — PASSED
- `lib/dto.ts` has no `'use client'` directive and does not import `@/lib/prisma` — PASSED
- `grep -n "from '@/app/cards/page'" components/CardsClient.tsx` returns no match — PASSED
- `lib/study-cards.ts` contains `export async function getStudyCards(` and `export interface StudyCardsParams` — PASSED
- `lib/study-cards.ts` return type is `Promise<CardDTO[]>` — PASSED
- `lib/study-cards.ts` contains `Promise.allSettled(` — PASSED
- `lib/study-cards.ts` throws on pool rejection — PASSED
- `lib/study-cards.ts` has 7 `.toISOString()` calls (≥ 6 required) — PASSED
- Not imported by any `'use client'` file — PASSED
