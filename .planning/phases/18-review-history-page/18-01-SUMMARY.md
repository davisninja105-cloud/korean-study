---
phase: 18-review-history-page
plan: 01
subsystem: api
tags: [prisma, cursor-pagination, fsrs, vitest, dto]

# Dependency graph
requires:
  - phase: 17-review-log-idempotency
    provides: ReviewLog model (append-only FSRS snapshot rows) + idempotent write path
provides:
  - "getReviewHistory(params) — shared cursor-paginated, cardId-filterable, newest-first review-log query in lib/review-history.ts"
  - "masteryPhrase exported from lib/fsrs.ts (was module-private)"
  - "ReviewLogDTO type + StatsDTO.cardsByState field in lib/dto.ts"
  - "GET /api/reviews?cursor=&cardId= route backing client-side infinite scroll"
affects: [18-02-card-progress-tiles, 18-03-history-page-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared lib/ function backing both RSC page and API route (mirrors lib/study-cards.ts:getStudyCards())"
    - "Pure, exported helpers (buildReviewWhere, mapReviewLogToDTO) factored out of the Prisma call for Wave-0 unit testing without a live DB"

key-files:
  created:
    - lib/review-history.ts
    - tests/review-history.test.ts
    - app/api/reviews/route.ts
  modified:
    - lib/fsrs.ts
    - lib/dto.ts
    - vitest.config.ts

key-decisions:
  - "masteryPhrase gained `export` only — no logic change; previewIntervalLabels' internal call is unaffected"
  - "getReviewHistory does not wrap the Prisma call in try/catch — lib throws, route catches (matches lib/study-cards.ts convention)"
  - "GET /api/reviews never reads a client-controlled take/limit param — take is always the server-side PAGE_SIZE (25) constant, closing the DoS row in the plan's threat model (T-18-01)"

patterns-established:
  - "Pattern: vitest.config.ts now resolves the project's `@/*` import alias (mirrors tsconfig paths), so any lib/ module under test can use the standard `@/lib/...` import convention instead of relative paths"

requirements-completed: [HIST-04, HIST-05, HIST-06]

coverage:
  - id: D1
    description: "getReviewHistory returns ReviewLog rows newest-first with pre-formatted gradeName + mastery phrase (D-01)"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "tests/review-history.test.ts#mapReviewLogToDTO — gradeName"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cursor pagination (skip:1 + compound orderBy) returns the next page with no duplicate/skipped rows"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "tests/review-history.test.ts#buildReviewWhere — where clause (structural guard; full pagination behavior verified by grep on skip:1 + orderBy tuple, no live DB in Wave 0)"
        status: pass
    human_judgment: true
    rationale: "Wave 0 unit tests cover the pure helpers only; actual cursor-pagination correctness against a live ReviewLog table (no duplicate/no skipped row across pages) requires an integration check against real data, deferred to 18-03's UAT pass once the UI consumes multiple pages."
  - id: D3
    description: "cardId narrows results to one card (HIST-05); omitting it returns all cards"
    requirement: HIST-05
    verification:
      - kind: unit
        ref: "tests/review-history.test.ts#buildReviewWhere — where clause"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/reviews validates cursor/cardId as bounded opaque strings before Prisma and returns ReviewLogDTO[] JSON"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (route typechecks); grep-based acceptance criteria for MAX_ID_LEN/400/500/take:PAGE_SIZE all pass"
        status: pass
    human_judgment: false
  - id: D5
    description: "The query has zero undo-awareness — undone reviews return like any other row (HIST-06)"
    requirement: HIST-06
    verification: []
    human_judgment: true
    rationale: "No undo-marking logic exists anywhere in getReviewHistory/mapReviewLogToDTO by construction (grep confirms no undo/cancelled field is read or written), but proving 'never adds undo-awareness' is an absence claim best confirmed by code review, not a unit test assertion."

duration: ~12min
completed: 2026-07-04
status: complete
---

# Phase 18 Plan 01: Review History Data Pipeline Summary

**Shared `getReviewHistory()` cursor-paginated query (Prisma `skip:1` + compound `orderBy`) plus `GET /api/reviews` route and DTO/type plumbing, mirroring the existing `lib/study-cards.ts` shared-function pattern.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-04
- **Tasks:** 3 (Task 2 was TDD: RED → GREEN)
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `masteryPhrase` exported from `lib/fsrs.ts` so review-history rows reuse the exact mastery-language copy the flashcard grade bar already uses
- `lib/review-history.ts`: `getReviewHistory()` — newest-first, cursor-paginated (`skip:1` + `[{createdAt:desc},{id:desc}]` compound tiebreak), optionally `cardId`-filtered, backed by two pure exported helpers (`buildReviewWhere`, `mapReviewLogToDTO`) that are unit-tested without touching a live DB
- `GET /api/reviews?cursor=&cardId=` route: validates both opaque-id params (≤64 chars, non-empty) before they reach Prisma, and never accepts a client-controlled page-size param — always uses the server-side `PAGE_SIZE=25` constant
- `ReviewLogDTO` type and `StatsDTO.cardsByState` field added to `lib/dto.ts` for 18-02/18-03 to consume

## Task Commits

Each task was committed atomically:

1. **Task 1: Export masteryPhrase + add ReviewLogDTO and StatsDTO.cardsByState** - `4f97ddb` (feat)
2. **Task 2: lib/review-history.ts pipeline + Wave 0 unit tests** - RED `fce047e` (test), GREEN `ef1f6be` (feat)
3. **Task 3: GET /api/reviews route with V5 input validation** - `21d2e5a` (feat)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

_Note: Task 2 is a TDD task — test commit (RED) precedes the implementation commit (GREEN); no REFACTOR commit was needed._

## Files Created/Modified
- `lib/fsrs.ts` - Added `export` to the existing `masteryPhrase` declaration (no logic change)
- `lib/dto.ts` - Added `ReviewLogDTO` interface; extended `StatsDTO` with `cardsByState` field
- `lib/review-history.ts` - New: `PAGE_SIZE`, `ReviewHistoryParams`, `buildReviewWhere`, `mapReviewLogToDTO`, `getReviewHistory`
- `tests/review-history.test.ts` - New: Wave 0 unit tests for grade-name/mastery mapping and the where-clause helper
- `app/api/reviews/route.ts` - New: `GET` handler delegating to `getReviewHistory`, with V5 input validation
- `vitest.config.ts` - Added `@/*` path alias resolution (see Deviations)

## Decisions Made
- `getReviewHistory` intentionally has no try/catch — matches the `lib/study-cards.ts` convention where the library throws and the caller (route) catches
- `take` is hardcoded to the server-side `PAGE_SIZE` constant in the route; no `?take=` param is ever read from the client, closing the DoS threat (T-18-01) called out in the plan's threat model
- `MAX_ID_LEN = 64` chosen as a generous bound for cuid-shaped ids — the guard exists to reject grossly malformed input, not to validate exact cuid format (garbage that passes the length check simply matches zero Prisma rows)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@/*` alias resolution to `vitest.config.ts`**
- **Found during:** Task 2 (writing/running `tests/review-history.test.ts`)
- **Issue:** `lib/review-history.ts` imports `prisma`/`Rating`/`masteryPhrase` via the project's standard `@/lib/...` alias (per CLAUDE.md convention and the plan's own PATTERNS.md exemplar). Vitest had no `resolve.alias` configured for `@`, so importing the new module under test failed with `Cannot find package '@/lib/prisma'`, blocking the TDD GREEN step entirely.
- **Fix:** Added a `resolve.alias` block to `vitest.config.ts` mapping `@` → the project root, mirroring the existing `tsconfig.json` `paths` entry (`"@/*": ["./*"]`).
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run tests/review-history.test.ts` passes (10/10); `npm test` full suite still passes (116/116, no regression)
- **Committed in:** `ef1f6be` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock the TDD task as written (the plan explicitly directs `@/lib/...` imports in `lib/review-history.ts`, matching the codebase-wide convention). No scope creep — the fix is a one-line config addition, not a code change.

## Issues Encountered

- `npx tsc --noEmit` across the whole project reports one error, in `lib/dashboard.ts`, because `StatsDTO.cardsByState` (added in this plan, Task 1) is a new required field that `getStats()` does not yet populate. This is expected and by design: `18-02-PLAN.md` (`files_modified: lib/dashboard.ts, app/habits/page.tsx, components/HabitsClient.tsx`) is the plan responsible for implementing the `cardsByState` groupBy in `getStats()`. Per this plan's own acceptance criteria ("no new errors originating in `lib/fsrs.ts` or `lib/dto.ts`") and verification scope (the five files this plan touches), this is not a regression to fix here — confirmed via `npx tsc --noEmit 2>&1 | grep -E "lib/fsrs|lib/dto|lib/review-history|tests/review-history|app/api/reviews"` returning no matches.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getReviewHistory`, `ReviewLogDTO`, and `masteryPhrase` are all ready for 18-03 (`app/history/page.tsx` + `components/HistoryClient.tsx`) to consume directly, matching the artifact contract in this plan's frontmatter.
- `StatsDTO.cardsByState` type exists; 18-02 must implement the corresponding `cardsByState` groupBy in `lib/dashboard.ts:getStats()` before the whole project typechecks clean again (expected, tracked above under Issues Encountered — not a blocker for 18-01's own completion).
- No blockers for 18-02 or 18-03.

---
*Phase: 18-review-history-page*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files found on disk; all task commit hashes (4f97ddb, fce047e, ef1f6be, 21d2e5a) verified present in git log.
