---
phase: 19-vercel-cron-auto-sync
plan: 02
subsystem: settings
tags: [nextjs, prisma, settings, cron-visibility]

requires: []
provides:
  - "lib/settings.ts exporting getLastAutoSyncedAt() / setLastAutoSyncedAt(iso) — writer for Plan 03's cron route"
  - "GET /api/settings response includes lastAutoSyncedAt (read-only)"
  - "Settings > Advanced disclosure renders the last-auto-synced status line"
affects: [19-03]

tech-stack:
  added: []
  patterns:
    - "Key/value Setting-table getter/setter pair, same shape as getDailyGoalSeconds/setDailyGoalSeconds — no schema change"
    - "Read-only field: present in GET, deliberately absent from PUT destructure/validation/setter path"

key-files:
  created: []
  modified:
    - lib/settings.ts
    - app/api/settings/route.ts
    - app/settings/page.tsx

key-decisions:
  - "setLastAutoSyncedAt returns void (unlike every other setter in the file, which echoes the clamped/validated value) — its only caller (Plan 03's cron route) already holds the ISO string it wrote and never round-trips it."
  - "lastAutoSyncedAt is GET-only: omitted entirely from the PUT handler's destructure/has-flag/setter-call chain so a client PUT can never overwrite it (T-19-05 mitigation, defense in depth beyond the UI simply not exposing a control)."
  - "Formatted at render time via new Date(isoString) (argument-bearing constructor, purity-safe) rather than storing a formatted string — matches lib/dto.ts convention of raw ISO strings crossing the network boundary."

requirements-completed: [SYNC-04]

coverage:
  - id: D1
    description: "Timestamp persists via the existing generic Setting table (no schema change), is exposed read-only via GET /api/settings, and is visible in Settings > Advanced."
    requirement: "SYNC-04"
    verification:
      - kind: unit
        ref: "npm run build (typecheck across all 3 files)"
        status: pass
      - kind: unit
        ref: "npm run lint"
        status: pass
      - kind: integration
        ref: "npm start + curl: GET /api/settings returns lastAutoSyncedAt:null before any cron run; PUT with lastAutoSyncedAt in the body is a no-op for that field (verified GET unchanged after the PUT)"
        status: pass
    human_judgment: false
    rationale: "Verified end-to-end via a live local server (npm start) and curl against the authenticated session cookie — both the GET-only exposure and the PUT-cannot-overwrite behavior were directly observed, not just inferred from source."

duration: 18min
completed: 2026-07-05
status: complete
---

# Phase 19 Plan 02: Last-auto-synced timestamp Summary

**Persisted a `lastAutoSyncedAt` ISO-string setting (no schema change), exposed it read-only via GET /api/settings, and rendered it as a passive status line in Settings > Advanced next to SyncPanel.**

## Performance

- **Duration:** 18 min
- **Tasks:** 3 completed
- **Files modified:** 3

## Accomplishments
- `lib/settings.ts`: added `LAST_AUTO_SYNCED_KEY` constant plus `getLastAutoSyncedAt()` (returns the stored ISO string or `null` when the key row is absent) and `setLastAutoSyncedAt(iso)` (upserts, returns `void`) — no numeric clamping, no schema change, `prisma/schema.prisma` untouched.
- `app/api/settings/route.ts`: `GET` now resolves `getLastAutoSyncedAt()` alongside the other settings and includes `lastAutoSyncedAt` in its JSON response. The `PUT` handler was left completely unchanged — no destructure, no `has*` flag, no setter call — so a client PUT can never overwrite the timestamp (verified live: a PUT carrying `lastAutoSyncedAt` in its body left the stored value unchanged on a subsequent GET).
- `app/settings/page.tsx`: new `lastAutoSyncedAt` client state populated from the existing `/api/settings` fetch effect (no new network request). Settings ▸ Advanced now shows a muted `text-xs` caption — "Last auto-synced: <formatted>" or "Never" — directly above `SyncPanel`, formatted at render time via `new Date(isoString).toLocaleString()` (an argument-bearing `Date` constructor, which is purity-safe; no no-arg `new Date()`/`Date.now()`/`Math.random()` introduced).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getLastAutoSyncedAt / setLastAutoSyncedAt to lib/settings.ts** - `8f07f29` (feat)
2. **Task 2: Surface lastAutoSyncedAt read-only in GET /api/settings** - `b51380f` (feat)
3. **Task 3: Display the timestamp in Settings > Advanced** - `6877f02` (feat)

## Files Created/Modified
- `lib/settings.ts` - Added `LAST_AUTO_SYNCED_KEY`, `getLastAutoSyncedAt()`, `setLastAutoSyncedAt(iso)`.
- `app/api/settings/route.ts` - `GET` includes `lastAutoSyncedAt`; `PUT` unchanged (read-only field).
- `app/settings/page.tsx` - New state + status line inside the Advanced `<details>` disclosure.

## Decisions Made
- `setLastAutoSyncedAt` returns `void`, breaking the file's usual "setter echoes the validated value" convention, because its only caller (the Plan 03 cron route) already has the string it just wrote.
- `lastAutoSyncedAt` participates in `GET` only — deliberately excluded from every step of the `PUT` pipeline (destructure, `has*` validation, setter dispatch) to close T-19-05 (client tampering that could mask a silently-failing cron) via defense in depth.
- Kept the display as a passive caption inside the existing Advanced disclosure (no new `bg-surface-1` card) per the pattern map's "back-office plumbing kept off the home screen" guidance.

## Deviations from Plan

None - plan executed exactly as written. One incidental hardening step beyond the plan's own automated verify: ran a live `npm start` + `curl` round-trip (login, GET, PUT-with-forbidden-field, GET-again) to directly observe the read-only behavior rather than relying solely on source inspection — this satisfies the plan's own `<human-check>` verification note for Task 2 (a "curl GET/PUT" check the plan explicitly called out) without requiring the user to run it manually.

## Issues Encountered

None of substance. One local hiccup during verification: a stale `next start` process from an earlier build held port 3000, making the first curl round hit an old bundle missing the new field. Killed the stale process and re-verified against a fresh build — not a code issue, purely a local verification-environment artifact.

## User Setup Required

None - no external service configuration required. The field will read `null`/"Never" until Plan 03's cron route calls `setLastAutoSyncedAt()` for the first time.

## Next Phase Readiness
Plan 03 (the Vercel Cron route) now has a concrete, verified place to write: `setLastAutoSyncedAt(new Date().toISOString())` after a successful `runSync()` call, per the pattern map's `app/api/cron/sync/route.ts` example. No blockers.

---
*Phase: 19-vercel-cron-auto-sync*
*Completed: 2026-07-05*

## Self-Check: PASSED

All modified/created files exist on disk (lib/settings.ts, app/api/settings/route.ts, app/settings/page.tsx, this SUMMARY.md) and all three task commit hashes (8f07f29, b51380f, 6877f02) verified present in git log.
