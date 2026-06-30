---
phase: 10-cards-hydration-api-parallelization
plan: "01"
subsystem: ui
tags: [react-server-components, rsc, dto, nextjs, prisma, hydration]

# Dependency graph
requires:
  - phase: 09-skeleton-loading-screens
    provides: loading.tsx skeleton for /cards route (navigation fallback during RSC hydration)
provides:
  - "app/cards/page.tsx as async RSC — server-fetches cards+lessons, serializes all DateTime fields to ISO strings, renders CardsClient"
  - "components/CardsClient.tsx — client shell owning all cards interactivity (search, filter, edit, delete, add, swipe-delete, tap-to-gloss, group collapse)"
  - "CardDTO, SentenceDTO, ReviewDTO, LessonRefDTO, LessonRefItem inline DTO types in app/cards/page.tsx"
  - "RSC + client-shell + DTO serialization pattern established for Phases 11 and 12 to reuse"
affects:
  - "Phase 11 (Study Page Hydration) — reuses RSC+DTO pattern and CardsClient as structural template"
  - "Phase 12 (Home & Habits Hydration) — reuses RSC+DTO pattern"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC page → client shell via prop-initialized useState (no initial-load useEffect)"
    - "DTO serialization: all Prisma DateTime fields converted to ISO strings before server→client boundary"
    - "Lazy useState initializers for lessonFrom/lessonTo derived from prop-passed lesson list"
    - "loadCards() fetch('/api/cards') retained as post-mutation refresh path — JSON dates already strings, compatible with CardDTO"

key-files:
  created:
    - components/CardsClient.tsx
  modified:
    - app/cards/page.tsx

key-decisions:
  - "DTO types (CardDTO, SentenceDTO, ReviewDTO, LessonRefDTO, LessonRefItem) defined inline in app/cards/page.tsx — extraction to lib/dto.ts deferred to Phase 11 per RESEARCH.md Open Question 1"
  - "No new npm packages — RSC and prop-initialized state are built into Next.js 16 + React 19"
  - "loadCards() post-mutation refetch of /api/cards preserved in CardsClient — JSON dates from API are already strings, compatible with CardDTO shape"
  - "CardEditorShape local type used in CardsClient for structural compatibility with CardEditor's Card contract (avoids circular import from app/ into components/)"

patterns-established:
  - "Pattern RSC-01: async server component fetches via prisma directly, serializes via DTO, passes as props to 'use client' child"
  - "Pattern RSC-05: every Prisma DateTime field (createdAt, updatedAt, nextReview, lastReview) converted to string via .toISOString() before the boundary — 7 calls in app/cards/page.tsx"
  - "Pattern CLIENT-SHELL: client component initializes all state from props using useState(initialProp) and lazy initializers — zero initial-load useEffect"

requirements-completed:
  - RSC-01
  - RSC-05

coverage:
  - id: D1
    description: "Cards page first-paint shows real card list with no 'No cards yet' empty-state flash"
    requirement: RSC-01
    verification:
      - kind: manual_procedural
        ref: "npm run build && npm run start → http://localhost:3000/cards hard-reload, human verified"
        status: pass
    human_judgment: true
    rationale: "RSC hydration vs. useEffect timing requires visual inspection in a production build — automated tests cannot distinguish first-paint flash from subsequent render"
  - id: D2
    description: "No raw Prisma Date object crosses the server→client boundary — all 7 DateTime fields serialized to ISO strings"
    requirement: RSC-05
    verification:
      - kind: manual_procedural
        ref: "Browser devtools console checked for 'Only plain objects' / 'Date objects are not supported' serialization errors — none found"
        status: pass
    human_judgment: true
    rationale: "Next.js serialization errors surface at runtime in browser console, not at compile time — required human verification in production build"
  - id: D3
    description: "All cards-page interactions preserved: search, type filter, lesson range, view toggle, edit, delete, swipe-delete, add, tap-to-gloss, group collapse"
    verification:
      - kind: manual_procedural
        ref: "Human checkpoint Task 3 — all 10+ interaction types exercised and approved"
        status: pass
    human_judgment: true
    rationale: "Interaction preservation requires hands-on UI testing across multiple interaction modalities (swipe, tap, type, sheet open/close)"

# Metrics
duration: ~45min
completed: "2026-06-30"
status: complete
---

# Phase 10 Plan 01: Cards Hydration + DTO Serialization Summary

**Cards page converted from useEffect-fetch client component to async RSC + CardsClient shell: real card list now arrives in the initial HTML with no empty-state flash, and all 7 Prisma DateTime fields are serialized to ISO strings before the server→client boundary**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-30T00:56:22Z
- **Completed:** 2026-06-30T01:00:00Z
- **Tasks:** 2 auto + 1 human checkpoint (all 3 complete)
- **Files modified:** 2

## Accomplishments

- Converted `app/cards/page.tsx` from a `'use client'` component with mount-effect data fetch to an `async` server component that fetches cards and lessons directly from Prisma at render time — eliminating the "No cards yet" empty-state flash on first load (RSC-01)
- Defined five DTO interfaces (CardDTO, SentenceDTO, ReviewDTO, LessonRefDTO, LessonRefItem) inline in the server component; every Prisma DateTime field (7 total) serialized to an ISO string via `.toISOString()` before crossing the server→client boundary (RSC-05)
- Created `components/CardsClient.tsx` — a new `'use client'` component that initializes all state from props (`useState(initialCards)`, lazy initializers for `lessonFrom`/`lessonTo`) with zero initial-load useEffect; preserves every interaction from the original page unchanged
- Human-verified in a production build: real card list paints on first load with no empty-state flash, no browser console serialization errors, and all interactions (search, filter, lesson range, view toggle, edit, delete, swipe-delete, add, tap-to-gloss, group collapse) work correctly
- Established the RSC + client-shell + DTO pattern that Phases 11 and 12 reuse for Study and Home/Habits hydration

## Task Commits

Each task was committed atomically:

1. **Task 1: Define DTO types and convert app/cards/page.tsx to async RSC** - `804e4a6` (feat)
2. **Task 2: Extract interactivity into components/CardsClient.tsx with prop-initialized state** - `4451e85` (feat)
3. **Task 3: Human verification checkpoint** - APPROVED (no code commit — verification only)

## Files Created/Modified

- `app/cards/page.tsx` — Converted to `async` server component; removed `'use client'`; added inline DTO types; fetches via Prisma `Promise.all`; serializes all DateTime fields; renders `<CardsClient initialCards={...} initialLessons={...} />`
- `components/CardsClient.tsx` — New `'use client'` component; owns all cards interactivity; state initialized from props with no initial-load useEffect; preserves loadCards() as post-mutation refetch path

## Decisions Made

- DTO types remain inline in `app/cards/page.tsx` for Phase 10 (per RESEARCH.md Open Question 1); extraction to `lib/dto.ts` is deferred to Phase 11 when the second RSC page conversion provides a natural consolidation point
- No new npm packages — RSC and prop-initialized state are native to Next.js 16 + React 19
- `loadCards()` retained in CardsClient for post-mutation refresh: the `/api/cards` JSON response already returns dates as strings, making it structurally compatible with CardDTO at runtime
- `CardEditorShape` local type introduced in CardsClient to satisfy CardEditor's `onSave: (updated: Card) => void` contract via structural compatibility, avoiding a circular import from `components/` back into `app/`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch: handleSave CardDTO vs CardEditor Card**
- **Found during:** Task 2 (CardsClient extraction)
- **Issue:** `CardEditor.onSave` signature expects its local `Card` interface (narrow: id/type/front/back/notes/sentences); passing `(updated: CardDTO)` caused TS2322 error
- **Fix:** Introduced `CardEditorShape` local interface structurally compatible with `CardEditor.Card`; used `as CardDTO` cast in `setCards` spread since `c` (CardDTO) dominates the merge shape
- **Files modified:** `components/CardsClient.tsx`
- **Committed in:** 4451e85

**2. [Rule 1 - Bug] useEffect in comment body matched grep acceptance check**
- **Found during:** Task 2 acceptance check
- **Issue:** Comment contained the word "useEffect" and would fail the `grep -v '^//'` acceptance check since indented lines were not excluded by that pattern
- **Fix:** Reworded comment to avoid the word "useEffect"
- **Files modified:** `components/CardsClient.tsx`
- **Committed in:** 4451e85

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 — Bug)
**Impact on plan:** Both fixes necessary for TypeScript correctness and acceptance criteria compliance. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above. TypeScript compiled clean, lint passed with zero errors, production build succeeded, and human verification passed on first attempt.

## Threat Flags

None. This plan introduces no new network endpoints, auth paths, file access patterns, or schema changes. Threat register T-10-01 (DTO boundary info disclosure) is mitigated: CardDTO mirrors the exact fields previously returned by `/api/cards` — no new sensitive columns exposed.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- RSC + DTO pattern established: Phase 11 (Study Page Hydration) and Phase 12 (Home & Habits Hydration) can reuse the same approach
- `components/CardsClient.tsx` serves as a structural template for future client shells
- Phase 10 Plan 02 (Parallelize /api/cards/due via Promise.allSettled) is independent of this plan and can proceed immediately
- No blockers

## Self-Check: PASSED

- [x] `app/cards/page.tsx` exists as server component (no 'use client')
- [x] `components/CardsClient.tsx` exists with 'use client' line 1
- [x] Commit 804e4a6 exists (Task 1)
- [x] Commit 4451e85 exists (Task 2)
- [x] Human verification Task 3 — APPROVED

---
*Phase: 10-cards-hydration-api-parallelization*
*Completed: 2026-06-30*
