---
phase: 14-sync-failure-visibility-caching-performance
plan: 01
subsystem: api
tags: [prisma, nextjs-api-route, sync, performance, error-handling]

# Dependency graph
requires:
  - phase: 13-review-api-hardening-save-reliability
    provides: "established the server-side-only raw-error-logging + safe-client-response pattern (T-13-02) that this plan mirrors for /api/sync (T-14-01)"
provides:
  - "lessonExcerpt(text) pure helper in app/api/sync/route.ts — first non-empty line, collapsed/truncated ~48 chars, fallback (untitled lesson)"
  - "Request-scoped keyToId Map (normalizedFront → cardId) built once before the per-lesson sync loop and augmented incrementally during upserts"
  - "Per-lesson linkTargets collector feeding the CardDependency linking step (no per-lesson full-deck findMany)"
  - "Sanitized sync failures[] entries: quoted lesson excerpt + safe category only; raw msg/dbMsg confined to server-side console calls"
affects: [14-02, 15, sync-reliability, gloss-cache-preload]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hoist a request-scoped lookup Map out of a per-iteration loop and augment it incrementally as rows are upserted (avoids N full-deck queries)"
    - "Sanitize error text at the trust boundary: raw internal error logged server-side via console.error, only a safe category + the user's own content excerpt returned to the client (mirrors Phase 13 T-13-02)"

key-files:
  created: []
  modified:
    - app/api/sync/route.ts

key-decisions:
  - "Kept the where:{components:{not:null}} filter on the seed findMany (not broadened to all cards) to preserve existing edge-creation semantics exactly — only cards that have components are resolvable as prerequisites."
  - "Dropped `components` from the seed findMany select and read component strings from the in-memory extraction result (card.components) instead of JSON.parse-ing a DB re-read — eliminates the parse-error path entirely and removes a DB column read."
  - "linkTargets is declared inside the per-lesson try block (resets each lesson) and is in scope for both the Promise.all callback (push) and the post-await linking loop (iterate) — forward references within a lesson resolve because keyToId is fully populated by link time."
  - "lessonExcerpt returns the user's OWN doc content (first non-empty line) — intentionally surfaced back to the sole authenticated owner (T-14-02 accepted); raw msg/dbMsg never crosses the trust boundary (T-14-01 mitigated)."
  - "Response shape (failed/failures/remaining/newLessons/newCards/synced) left unchanged so components/SyncPanel.tsx renders the new excerpt strings with zero client-side edit."

patterns-established:
  - "Trust-boundary sanitization for sync failures: console.error keeps the raw error, failures[] gets only excerpt + safe category."
  - "Request-scoped Map hoist + incremental augmentation as the pattern for eliminating per-iteration full-table lookups in API routes."

requirements-completed: [SYNC-01, PERF-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The normalizedFront → cardId map is built once per sync request (before the per-lesson loop) and augmented incrementally during upserts; the per-lesson full-deck prisma.card.findMany is gone. CardDependency edges for the common case are unchanged (compound key cardId_prerequisiteId, self-edge skip, non-fatal per-edge try/catch)."
    requirement: PERF-01
    verification:
      - kind: other
        ref: "npm run build (route typechecks clean); npm run lint (zero errors); grep asserts keyToId/linkTargets/cardDependency.upsert present; line-number assertion: seed findMany (line 81) precedes for-loop header (line 87); no prisma.card.findMany inside the loop body"
        status: pass
    human_judgment: true
    rationale: "Automated build/lint/grep prove the structural refactor but not the runtime behavior. Behavioral proof (a real multi-card sync still creates the same CardDependency edges) requires the tutor's live Google Doc + auth + running server — out of scope for an autonomous executor and deferred to end-of-phase UAT."
  - id: D2
    description: "Each sync failures[] entry names the specific failed lesson by a content excerpt (lessonExcerpt of batch[i].text) plus a safe category (extraction failed / no cards extracted / failed to save). Raw msg/dbMsg appears only in server-side console.error/console.warn, never in failures[]. SyncPanel renders the new strings unchanged."
    requirement: SYNC-01
    verification:
      - kind: other
        ref: "npm run build (clean); npm run lint (zero errors); grep asserts lessonExcerpt defined + called with batch[i].text; three failures.push lines lead with quoted excerpt + safe category; msg/dbMsg appear only in console.error calls; response keys (failed/failures/remaining/newLessons/newCards) unchanged"
        status: pass
    human_judgment: true
    rationale: "Source greps prove the sanitization + excerpt wiring, but proving a failing lesson actually surfaces its excerpt in the SyncPanel UI requires a live sync against a lesson that fails extraction / yields 0 cards / fails the DB write — needs the tutor's Google Doc + running server + auth. Deferred to end-of-phase UAT."

# Metrics
duration: 8min
completed: 2026-07-02
status: complete
---

# Phase 14 Plan 01: Sync Failure Visibility & Caching Performance Summary

**Hoisted the sync dependency-resolution map to once-per-request and named failed lessons by a content excerpt with raw error text confined to server-side logs.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-02T18:32:00Z
- **Completed:** 2026-07-02T18:40:00Z
- **Tasks:** 2
- **Files modified:** 1 (`app/api/sync/route.ts`)

## Accomplishments
- PERF-01: The full-deck `normalizedFront → cardId` lookup now runs exactly once per sync request (a single `prisma.card.findMany` before the per-lesson loop) instead of once per lesson; the map is augmented in-place as each card is upserted, so forward references within a lesson still resolve at link time. The per-lesson `findMany` + `upsertedSet` bookkeeping is gone.
- SYNC-01: A sync failure now names the specific lesson by a searchable content excerpt (its first non-empty line, collapsed/truncated to ~48 chars) plus a safe category — not `Lesson N` and not the raw extraction/Prisma error. `components/SyncPanel.tsx` renders the new strings with no edit (response shape unchanged).
- T-14-01 mitigated: raw `msg`/`dbMsg` are confined to server-side `console.error`/`console.warn`; the client-facing `failures[]` carries only the user's own doc excerpt + a safe category.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the normalizedFront → cardId map once per request for dependency linking (PERF-01)** — `2a14c47` (perf)
2. **Task 2: Name the specific failed lesson via a content excerpt and sanitize error text (SYNC-01)** — `279ef71` (fix)

_Plan metadata commit follows in the final docs commit._

## Files Created/Modified
- `app/api/sync/route.ts` — added module-level `lessonExcerpt()` helper; hoisted `keyToId` Map to once-per-request (single seed `findMany` before the loop); added per-lesson `linkTargets` collector populated in both CREATE/UPDATE upsert branches (gated on `card.components.length > 0`); replaced the per-lesson linking block with a `linkTargets` iteration over the shared `keyToId`; rewrote the three `failures.push` strings to lead with the quoted excerpt + a safe category, dropping `${msg}`/`${dbMsg}` from the client-facing strings (raw errors kept in the `console` calls only). Response shape unchanged.

## Decisions Made
- **Kept `where:{components:{not:null}}` on the seed findMany** (did NOT broaden to all cards) — preserves the existing edge-creation semantics exactly; broadening would change which CardDependency edges are created and is out of scope for a performance-preserving refactor.
- **Dropped `components` from the seed `select`** — component strings now come from the in-memory extraction result (`card.components`), not a DB re-read; this also eliminates the old `try { JSON.parse(dbCard.components) } catch` parse-error path entirely (the in-memory array is already typed `string[]`).
- **`linkTargets` declared in the per-lesson try block** (resets each lesson) rather than outside the loop — keeps the collector scoped to one lesson and in scope for both the `Promise.all` callback (push) and the post-await linking loop (iterate).
- **`lessonExcerpt` returns the user's OWN doc content** (first non-empty line) — this is the intended feature (lets the user find the failed section in their Google Doc); threat T-14-02 accepted. Only raw `msg`/`dbMsg` is withheld from the client (T-14-01).
- **Response shape left unchanged** (`failed`/`failures`/`remaining`/`newLessons`/`newCards`/`synced`) so `components/SyncPanel.tsx` needs no edit — it already renders `data.failures` verbatim.

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed their `<action>` blocks verbatim; no Rule 1-4 deviations were triggered. Build and lint stayed clean after each task; no auto-fixes were needed.

## Issues Encountered

None. The AGENTS.md `nextjs-agent-rules` directive ("This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing Next.js code") was honored: the Next.js 16 `route.md` Route Handler reference was read before editing. It confirmed the `export async function POST(req: NextRequest)` + `NextResponse.json` pattern is unchanged in this version — and this plan's edits are purely internal handler logic (Prisma calls, error strings, a pure helper), touching no Next.js API surface, so no deprecation/breaking-change concern applied.

## User Setup Required

None — no external service configuration, no new env vars, no new dependencies. Pure source-only refactor of an existing route.

## Next Phase Readiness
- Plan 14-02 (PERF-02: preload tap-to-gloss cache from the DB `Setting` table on mount) is unblocked — it touches `components/GlossProvider.tsx` / `lib/gloss.ts`, which this plan does not modify. No conflict.
- Phase 15 (StudySession refactor) is unblocked — this plan did not touch `components/StudySession.tsx`.
- End-of-phase UAT (optional, per plan `<verification>`): a live sync against the tutor's Google Doc with a deliberately-failing/zero-card lesson would confirm the SyncPanel shows the excerpt (not `Lesson 1`, no raw error) and that CardDependency edges are still created for a normal lesson. `human_verify_mode: end-of-phase` in config — deferred to the phase verifier.

---
*Phase: 14-sync-failure-visibility-caching-performance*
*Completed: 2026-07-02*

## Self-Check: PASSED

- `app/api/sync/route.ts` — FOUND (modified file present on disk)
- `.planning/phases/14-sync-failure-visibility-caching-performance/14-01-SUMMARY.md` — FOUND
- Commit `2a14c47` (Task 1, PERF-01) — FOUND in git log
- Commit `279ef71` (Task 2, SYNC-01) — FOUND in git log
- Source symbols `keyToId` / `linkTargets` / `cardDependency.upsert` / `lessonExcerpt` — all present (13 matches)
