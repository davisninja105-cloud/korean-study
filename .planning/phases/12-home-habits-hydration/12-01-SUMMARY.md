---
phase: 12-home-habits-hydration
plan: "01"
subsystem: server-data-layer
status: complete
tags: [dto, server-pipeline, rsc, shared-lib, refactor]
completed: 2026-07-01
duration: 4m

dependency_graph:
  requires: []
  provides:
    - lib/dashboard.ts (getStats, getActivityData)
    - lib/dto.ts (StatsDTO, ActivityDTO)
  affects:
    - app/api/stats/route.ts
    - app/api/activity/route.ts
    - app/page.tsx (Wave 2 RSC consumer)
    - app/habits/page.tsx (Wave 2 RSC consumer)

tech_stack:
  added: []
  patterns:
    - Server-only module guard comment (matches lib/study-cards.ts precedent)
    - Promise.all parallelization for all dashboard queries
    - try/catch delegation in API routes returning 500 on failure
    - DayRecord reuse from lib/habit (no new ActivityDayDTO invented)

key_files:
  created:
    - lib/dashboard.ts
  modified:
    - lib/dto.ts
    - app/api/stats/route.ts
    - app/api/activity/route.ts

decisions:
  - "StatsDTO.cardsByType typed as { type: string; _count: number }[] — Prisma 7 groupBy with _count: true (boolean) returns scalar number per GetCardGroupByPayload generic (verified in app/generated/prisma/models/Card.ts line 229)"
  - "DayRecord reused from lib/habit as ActivityDTO.days element type — no new ActivityDayDTO invented per plan constraint"
  - "prisma, getDailyGoalSeconds, getDayStartHour imports removed from app/api/activity/route.ts — POST handler uses only prisma.studyDay.upsert; prisma import kept in activity route for POST"

metrics:
  duration: 4m
  tasks_completed: 2
  files_changed: 4
---

# Phase 12 Plan 01: DTO + Dashboard Data Layer Summary

lib/dashboard.ts server-only module with getStats() + getActivityData() extracted from inline API route bodies; StatsDTO + ActivityDTO added to lib/dto.ts.

## What Was Built

### Task 1: lib/dto.ts extended with StatsDTO + ActivityDTO

Added two new exported interfaces alongside the existing CardDTO / SentenceDTO / ReviewDTO / LessonDTO family:

- `StatsDTO` — totalCards, dueCards, totalLessons, cardsByType, masteredCount (all number fields)
- `ActivityDTO` — days: DayRecord[], dailyGoalSeconds: number, dayStartHour: number
- `import type { DayRecord } from '@/lib/habit'` added as first import (reuses the existing type rather than inventing a new ActivityDayDTO)

**Key type decision:** `cardsByType: { type: string; _count: number }[]` — when Prisma 7 `groupBy({ by: ['type'], _count: true })` receives a boolean `true` for `_count`, the `GetCardGroupByPayload` generic maps it to a scalar `number` (not `{ _all: number }`). Confirmed in `app/generated/prisma/models/Card.ts` line 229: `T[P] extends boolean ? number : ...`.

### Task 2: lib/dashboard.ts created + both API GET routes delegated

**lib/dashboard.ts (NEW):**
- Server-only guard comment using exact phrasing: `// No 'use client — this module runs server-side only.`
- `getStats(): Promise<StatsDTO>` — 5 queries via Promise.all (card.count, cardReview.count due, lesson.count, card.groupBy type, cardReview.count mastered ≥21d). Byte-identical to former /api/stats GET body.
- `getActivityData(): Promise<ActivityDTO>` — 3 queries via Promise.all (studyDay.findMany take:400 desc, getDailyGoalSeconds, getDayStartHour). Byte-identical to former /api/activity GET body. No .toISOString() mapping needed (StudyDay.date is String @unique in schema).

**app/api/stats/route.ts:** Thinned to `try { return NextResponse.json(await getStats()) } catch { return NextResponse.json({ error: 'Database error' }, { status: 500 }) }`. Removed prisma import (now only in dashboard.ts).

**app/api/activity/route.ts:** GET handler delegated to `getActivityData()` via same try/catch pattern. POST handler preserved verbatim — DATE_RE constant, NextRequest import, `export async function POST` all unchanged. prisma import retained (still used by POST's studyDay.upsert). getDailyGoalSeconds / getDayStartHour imports removed (now inside getActivityData).

## Verification

- `npx tsc --noEmit` exits 0 (both tasks)
- `npm run lint` exits 0 (both tasks)
- `npm run build` succeeds — lib/dashboard.ts confirmed server-only (no client bundle pull-in)
- POST /api/activity: DATE_RE + NextRequest + upsert handler all preserved

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all DTO fields are wired to real Prisma query results.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Both DTOs expose the same fields that the prior inline GET routes already returned.

## Self-Check

- [x] lib/dashboard.ts exists at /Users/main/Documents/claude-test/lib/dashboard.ts
- [x] lib/dto.ts exports StatsDTO and ActivityDTO
- [x] app/api/stats/route.ts delegates to getStats()
- [x] app/api/activity/route.ts delegates to getActivityData(); POST preserved
- [x] Task 1 commit: a65f657
- [x] Task 2 commit: 6d27574
- [x] Build succeeds

## Self-Check: PASSED
