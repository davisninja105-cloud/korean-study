---
phase: 17-reviewlog-schema-idempotent-write-path
plan: 01
subsystem: database
tags: [prisma, sqlite, turso, libsql, schema, ddl]

# Dependency graph
requires:
  - phase: 16-components-filter-fix
    provides: clean CardDependency graph and stable sync pipeline the ReviewLog write path will sit alongside
provides:
  - Prisma model ReviewLog (append-only, idempotencyKey @unique, cardId non-unique, indexed on cardId + createdAt)
  - Card.reviewLogs reverse relation
  - Generated Prisma client exposing prisma.reviewLog
  - scripts/apply-reviewlog-ddl.mjs (idempotent one-time Turso DDL script)
  - Live Turso ReviewLog table + ReviewLog_idempotencyKey_key (UNIQUE), ReviewLog_cardId_idx, ReviewLog_createdAt_idx
affects: [17-02-write-path, 17-03-history-page, 18-history-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual Turso DDL script (scripts/apply-*-ddl.mjs) as the only way to apply schema changes to libsql:// — prisma db push/migrate fail with P1013"

key-files:
  created:
    - scripts/apply-reviewlog-ddl.mjs
  modified:
    - prisma/schema.prisma

key-decisions:
  - "ReviewLog mirrors CardReview's full FSRS field set (D-01) so Phase 18 never needs a backfill migration"
  - "cardId is NOT unique on ReviewLog (append-only, many rows per card) — only idempotencyKey is @unique"
  - "DDL script targets whatever DB .env points to; this run applied it to production Turso directly per the project's standard manual-DDL workflow"

patterns-established:
  - "New per-card child tables follow: schema model -> npx prisma generate -> scripts/apply-<name>-ddl.mjs -> run against Turso, never prisma db push/migrate"

requirements-completed: [HIST-01, HIST-02]

coverage:
  - id: D1
    description: "Prisma model ReviewLog exists with unique idempotencyKey, non-unique cardId, and Card.reviewLogs reverse relation; prisma generate exposes prisma.reviewLog"
    requirement: "HIST-01"
    verification:
      - kind: unit
        ref: "grep -c 'model ReviewLog' prisma/schema.prisma (>=1); grep 'idempotencyKey' shows @unique; grep 'reviewLogs' shows Card reverse relation; app/generated/prisma/models/ReviewLog.ts exists"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live Turso database has the ReviewLog table with UNIQUE index on idempotencyKey and indexes on cardId + createdAt, enabling HIST-02's dedup guarantee"
    requirement: "HIST-02"
    verification:
      - kind: integration
        ref: "node scripts/apply-reviewlog-ddl.mjs against production Turso — output: 'ReviewLog table + indexes created (or already existed).' + 'ReviewLog row count: 0'; re-run confirmed idempotent no-op"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-04
status: complete
---

# Phase 17 Plan 1: ReviewLog Schema & Idempotent Write Path Summary

**Added the append-only `ReviewLog` Prisma model with a UNIQUE `idempotencyKey` index, regenerated the Prisma client, and applied the new table live to production Turso via a one-time manual DDL script.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-04T06:04:00Z
- **Completed:** 2026-07-04T06:16:22Z
- **Tasks:** 3 completed
- **Files modified:** 2 (1 modified, 1 created)

## Accomplishments
- `model ReviewLog` added to `prisma/schema.prisma`, mirroring `CardReview`'s full FSRS snapshot field set (D-01) plus `rating` and a `@unique idempotencyKey`, with `cardId` intentionally NOT unique (append-only — many rows per card)
- `Card.reviewLogs ReviewLog[]` reverse relation added alongside the existing `sentences`/`review`/`dependencies`/`requiredBy` relations
- `npx prisma generate` run successfully; the generated client now exposes a `reviewLog` delegate (`app/generated/prisma/models/ReviewLog.ts`)
- New `scripts/apply-reviewlog-ddl.mjs` created, mirroring `scripts/apply-sentence-ddl.mjs`'s structure exactly (manual `.env` parse, `@libsql/client` `executeMultiple`, verify-count, `Done.` log)
- DDL script run against the live Turso database: `ReviewLog` table + `ReviewLog_idempotencyKey_key` (UNIQUE), `ReviewLog_cardId_idx`, `ReviewLog_createdAt_idx` all created; row count confirmed at 0; re-run confirmed idempotent (clean no-op)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ReviewLog model to schema and regenerate the Prisma client** - `d6caf01` (feat)
2. **Task 2: Create the one-time Turso DDL script scripts/apply-reviewlog-ddl.mjs** - `d03c424` (feat)
3. **Task 3: [BLOCKING] Apply the ReviewLog DDL to the live Turso database** - no code commit (live DB operation only; script unchanged from Task 2's commit `d03c424`)

**Plan metadata:** (this commit)

## Files Created/Modified
- `prisma/schema.prisma` - Added `model ReviewLog` (append-only audit table with full FSRS snapshot, unique idempotencyKey, indexes on cardId/createdAt) and `Card.reviewLogs` reverse relation
- `scripts/apply-reviewlog-ddl.mjs` - New one-time idempotent Turso DDL script that creates the ReviewLog table and its three indexes

## Decisions Made
- Followed the plan's D-01 discretion exactly: `ReviewLog.id` uses `@default(cuid())`, matching the codebase-wide convention
- No deviations to the FK/index conventions — cascade-on-delete matches every other per-card child table (`Sentence`, `CardReview`, `CardDependency`)
- Task 3 was run directly against the DB pointed to by the local `.env` (production Turso, `libsql://korean-study-jasond28...`), per the project's standard manual-DDL workflow documented in `CLAUDE.md`; this is non-destructive (`CREATE TABLE/INDEX IF NOT EXISTS` on a net-new table) and was re-run once to confirm idempotency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx prisma generate`, `node --check`, and the live DDL application all succeeded on the first attempt. `npm run lint` was run as an extra safety check (per CLAUDE.md's "lint must stay clean" convention) and showed 0 errors — the single pre-existing warning in `components/StudySession.tsx` is unrelated to this plan's changes.

## User Setup Required

None - no external service configuration required. The DDL was applied directly to the existing Turso database using credentials already present in `.env`.

## Next Phase Readiness

- `prisma.reviewLog` is available and typed for 17-02's write path (`app/api/review/route.ts` transaction + P2002-catch idempotency logic)
- The live `ReviewLog_idempotencyKey_key` UNIQUE index exists in the target DB, so 17-02's P2002 catch branch will actually fire on a duplicate `idempotencyKey` — the core mechanism HIST-02 depends on
- No blockers for 17-02

---
*Phase: 17-reviewlog-schema-idempotent-write-path*
*Completed: 2026-07-04*

## Self-Check: PASSED

- FOUND: prisma/schema.prisma
- FOUND: scripts/apply-reviewlog-ddl.mjs
- FOUND: commit d6caf01
- FOUND: commit d03c424
