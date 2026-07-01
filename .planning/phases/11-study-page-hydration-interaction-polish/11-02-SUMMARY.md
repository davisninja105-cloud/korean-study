---
phase: 11-study-page-hydration-interaction-polish
plan: "02"
subsystem: study-page-rsc-conversion
tags: [rsc, client-shell, hydration, ux, filter-spinner]
dependency_graph:
  requires: [lib/dto.ts, lib/study-cards.ts]
  provides: [components/StudyClient.tsx, app/study/page.tsx (RSC)]
  affects: [app/api/cards/due/route.ts]
tech_stack:
  added: []
  patterns: [rsc-client-shell, select-mode-first, filter-spinner, no-initial-fetch]
key_files:
  created:
    - components/StudyClient.tsx
  modified:
    - app/study/page.tsx
    - app/api/cards/due/route.ts
decisions:
  - "StudyClient starts in 'select-mode' (not 'loading') — cards arrive as initialCards props, no initial fetch needed (D-01/D-04)"
  - "Filter re-fetch uses isFilterLoading spinner in select-mode — no blank loading phase visible during range change (D-06)"
  - "lessonsLoaded flag removed — lessons arrive as props so filter trigger renders when lessons.length >= 2 unconditionally"
  - "startAhead retains setPhase('loading') — brief skeleton is acceptable for the ahead fetch per UI-SPEC; 'loading' eliminated only from initial paint path"
  - "No try/catch at RSC page level — Next.js error boundaries handle getStudyCards throws; API route keeps its own catch"
  - "/study now prerendered as static in production build (RSC-02 satisfied)"
metrics:
  duration: 12min
  completed: 2026-06-30
status: complete
---

# Phase 11 Plan 02: RSC + Client Shell Study Page Conversion Summary

Converted the study page from a `'use client'` component that mounted in `phase='loading'` and ran two serial useEffect fetches, to an async RSC that server-fetches cards + lessons and hands them to a new `StudyClient` shell that starts in `'select-mode'` — eliminating the blank loading flash on first load (RSC-02).

## What Was Built

**`app/api/cards/due/route.ts`** (simplified) — Replaced the 80-line inline pipeline (`Promise.allSettled`, pool query, edge query, `selectSessionCards`, `sequenceCards`, `unknownCount` annotation, Date serialization) with a single `getStudyCards()` call. All existing param validation (`INTEGER_RE`, `lessonFrom`/`lessonTo` range check, `scope` validation, outer try/catch → 500) preserved verbatim. External contract unchanged: same JSON array, same 400s, same 500.

**`components/StudyClient.tsx`** (new) — `'use client'` shell that:
- Accepts `{ initialCards: CardDTO[], initialLessons: LessonDTO[] }` as props (interface named `Props` per CLAUDE.md convention)
- Starts in `'select-mode'` (never `'loading'`) because cards arrive as props
- Uses lazy `useState` initializers for `lessonFrom`/`lessonTo` from `initialLessons` (purity-safe, no `Date.now()`/`Math.random()` in render)
- `loadDue` (filter re-fetch): sets `isFilterLoading(true)` instead of `setPhase('loading')` — stays in `'select-mode'` throughout with a `Loader2` spinner (`role="status"`, `aria-label="Loading cards"`) in a fixed-height `h-16` slot (no layout shift)
- `handleModeSelect`: unchanged — no card re-fetch on Start (D-01)
- `startAhead`: unchanged — still uses `setPhase('loading')` for the ahead fetch (brief skeleton acceptable per UI-SPEC)
- Settings + activity `useEffect` retained for complete screen
- `SessionComplete` helper ported intact

**`app/study/page.tsx`** (replaced) — Now an async server component: `Promise.all([getStudyCards(...), prisma.lesson.findMany(...)])` → `<StudyClient initialCards={cardDTOs} initialLessons={lessons} />`. No hooks, no `'use client'`. Production build shows `/study` as `○ (Static)` (prerendered) — confirms RSC-02.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Simplify /api/cards/due to delegate to getStudyCards | d786bbd |
| 2 | Create StudyClient client shell with select-mode-first phase | a6c24bd |
| 3 | Convert app/study/page.tsx to async RSC rendering StudyClient | 7fb639f |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed 'use client' mention from comment to avoid grep false positive**
- **Found during:** Task 3 acceptance criteria check
- **Issue:** `grep -c "'use client'" app/study/page.tsx` returned 1 because the comment `// No 'use client' — server component` contained the string literal. The acceptance criterion requires 0.
- **Fix:** Changed comment to `// Server component — no client directive` which passes the acceptance check without containing the directive string.
- **Files modified:** `app/study/page.tsx`
- **Commit:** 7fb639f

**2. [Rule 2 - Missing] Removed `lessonsLoaded` flag**
- **Found during:** Task 2 implementation
- **Issue:** The old `lessonsLoaded` state controlled whether the filter trigger rendered (was set to true after the lesson-fetch useEffect completed). With lessons arriving as props, there is no async load sequence — the flag is always effectively true.
- **Fix:** Removed `lessonsLoaded` and changed the filter trigger render condition from `{lessonsLoaded && lessons.length >= 2 && ...}` to `{lessons.length >= 2 && ...}`. This is simpler and correct.
- **Files modified:** `components/StudyClient.tsx`
- **Commit:** a6c24bd

## Known Stubs

None. All data flows are wired: `initialCards` → `studyCards` state → `StudySession`; `initialLessons` → `lessons` state → `LessonRangeFilter`.

## Threat Flags

No new security surface introduced. The `getStudyCards` call from the RSC page uses `lessonFrom: null, lessonTo: null` (full span, no user input). All user-supplied params (`lessonFrom`, `lessonTo`, `scope`) still go through the API route's existing `INTEGER_RE` regex validation + 400 guards.

## Verification Results

- `npx tsc --noEmit`: exit 0 (all three tasks)
- `npm run lint`: exit 0 (all three tasks)
- `npm run build`: succeeded — `/study` shown as `○ (Static)` confirming RSC conversion; no Prisma-in-client-bundle error
- `grep -c "Promise.allSettled" app/api/cards/due/route.ts`: 0 (pipeline moved to lib)
- `grep -c "'use client'" app/study/page.tsx`: 0 (no directive)
- `grep -c "useState<Phase>('select-mode')" components/StudyClient.tsx`: 1 (starts in select-mode)
- `grep -c "fetch('/api/lessons')" components/StudyClient.tsx`: 0 (no initial data fetch)

## Self-Check: PASSED

Files exist:
- `components/StudyClient.tsx` — FOUND
- `app/study/page.tsx` — FOUND (rewritten as RSC)
- `app/api/cards/due/route.ts` — FOUND (simplified)

Commits exist:
- d786bbd — FOUND
- a6c24bd — FOUND
- 7fb639f — FOUND
