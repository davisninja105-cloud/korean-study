---
phase: 19-vercel-cron-auto-sync
plan: 01
subsystem: api
tags: [nextjs, prisma, sync]

requires: []
provides:
  - "lib/sync.ts exporting runSync(documentId) + SyncResult, the single shared sync core"
  - "app/api/sync/route.ts reduced to a thin POST wrapper delegating to runSync()"
affects: [19-03]

tech-stack:
  added: []
  patterns:
    - "Shared server-only lib/ core called by both a manual API route and (in Plan 03) a cron route — mirrors lib/study-cards.ts / lib/dashboard.ts"

key-files:
  created: [lib/sync.ts]
  modified: [app/api/sync/route.ts]

key-decisions:
  - "runSync() lets errors propagate (no internal try/catch) — the thin route caller owns the try/catch and 500 response, mirroring getStudyCards()."
  - "MAX_LESSONS_PER_SYNC constant moved into lib/sync.ts; maxDuration route-segment export stays in app/api/sync/route.ts (Next.js requires it at the route file)."

patterns-established:
  - "Pure body-move refactor: business logic in lib/, thin try/catch + NextResponse wrapper in the route file."

requirements-completed: [SYNC-02]

coverage:
  - id: D1
    description: "lib/sync.ts exports runSync(documentId) and SyncResult; manual sync path behaviorally unchanged (same response shape, MAX_LESSONS_PER_SYNC=1, per-lesson failure reporting, remaining count)"
    requirement: "SYNC-02"
    verification:
      - kind: unit
        ref: "npm run build (typecheck across lib/sync.ts + app/api/sync/route.ts)"
        status: pass
      - kind: unit
        ref: "npm test (full Vitest suite, 120 tests)"
        status: pass
    human_judgment: true
    rationale: "Manual 'Sync now' regression (identical response shape + 1-lesson-per-tap behavior) requires a live Google Doc + Claude call and is specified as a human-check in the plan; not exercised by the automated suite."

duration: 53min
completed: 2026-07-05
status: complete
---

# Phase 19 Plan 01: Extract runSync() shared sync core Summary

**Moved the entire POST /api/sync handler body into lib/sync.ts:runSync(), leaving app/api/sync/route.ts as a thin wrapper — no behavior change.**

## Performance

- **Duration:** 53 min
- **Started:** 2026-07-04T23:40:00-07:00
- **Completed:** 2026-07-05T00:33:00-07:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `lib/sync.ts` created: exports `runSync(documentId): Promise<SyncResult>` and the `SyncResult` interface, containing the full extraction pipeline (content-hash dedup, bounded batch slice, `Promise.allSettled` extraction, per-lesson persist with `keyToId` seeding, dedup-by-`normalizeFront`, create/update card branches, two-phase `resolveDependencyEdges` linking, failures bookkeeping) copied verbatim from the route.
- `app/api/sync/route.ts` reduced to a thin `POST` wrapper: parses `documentId`, calls `runSync()`, wraps in try/catch, preserves the exact 400/500 error messages and `maxDuration = 300` route-segment export.
- Manual sync path is behaviorally unchanged — same response shape, same `MAX_LESSONS_PER_SYNC = 1` bound.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/sync.ts with runSync() + SyncResult** - `8d0a7a1` (feat)
2. **Task 2: Reduce app/api/sync/route.ts to a thin POST wrapper** - `cdebbdd` (feat)

_Note: no separate plan-metadata commit — both task commits carry full context._

## Files Created/Modified
- `lib/sync.ts` - New: exports `runSync(documentId)` + `SyncResult`; the shared sync pipeline.
- `app/api/sync/route.ts` - Thin `POST` wrapper delegating to `runSync()`; imports and `MAX_LESSONS_PER_SYNC` constant removed (now live in lib/sync.ts).

## Decisions Made
- Errors are NOT caught inside `runSync()` — they propagate to the route's existing try/catch, consistent with the `getStudyCards()` precedent (RESEARCH Pattern 1).
- `export const maxDuration = 300` intentionally stays in `app/api/sync/route.ts`, not `lib/sync.ts`, since Next.js route-segment config must live in the route file.

## Deviations from Plan

None in code shape — both files match the plan's task specifications exactly (verified by reading `lib/sync.ts` and `app/api/sync/route.ts` against the acceptance criteria).

**Process deviation:** The original executor agent run committed Task 1 (`8d0a7a1`) but did not commit Task 2's edit or write this SUMMARY.md before its session ended (its final returned message was a malformed non-sequitur, "Not logged in · Please run /login" — an anomalous agent-runtime artifact, not a real auth issue). The orchestrator recovered per the `safe_resume_gate` "close out manually" path: inspected `app/api/sync/route.ts` (already fully and correctly edited on disk, uncommitted), ran `npm run build && npm run lint && npm test` to confirm correctness (build clean, lint clean — one pre-existing unrelated warning in `components/StudySession.tsx`, 120/120 tests pass), committed Task 2 as `cdebbdd`, and wrote this SUMMARY.md.

**Total deviations:** 1 process deviation (orchestrator-recovered commit), 0 code deviations.
**Impact on plan:** None — the code delivered matches the plan exactly; only the commit/summary bookkeeping needed manual completion.

## Issues Encountered
Executor subagent session ended without committing its final task or writing SUMMARY.md (see Deviations above). Resolved by orchestrator verification + manual close-out; no code rework was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
`runSync(documentId)` is now the single shared sync core that Plan 03's `GET /api/cron/sync` route will call directly. No blockers for Plan 03 (wave 2).

---
*Phase: 19-vercel-cron-auto-sync*
*Completed: 2026-07-05*
