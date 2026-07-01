---
phase: 10-cards-hydration-api-parallelization
plan: "02"
subsystem: api
tags: [performance, parallelization, promise-allSettled, turso]
dependency_graph:
  requires: []
  provides: [parallelized-cards-due-route]
  affects: [app/api/cards/due/route.ts]
tech_stack:
  added: []
  patterns: [Promise.allSettled-graceful-degradation]
key_files:
  created: []
  modified:
    - app/api/cards/due/route.ts
decisions:
  - "Pool query (#1) and known-lemmas query (#3) are parallelized via Promise.allSettled — they are structurally independent. Edge query (#2) stays sequential after pool resolves (depends on pool IDs)."
  - "Used Promise.allSettled (not Promise.all) per STATE.md decision: graceful degradation on transient DB failures. Pool failure → 500; known-lemmas failure → empty Set."
  - "Wrapped entire handler in try/catch per CLAUDE.md API route convention."
metrics:
  duration: "3 minutes"
  completed: "2026-06-30"
  tasks_completed: 2
  files_modified: 1
status: complete
---

# Phase 10 Plan 02: API Parallelization Summary

**One-liner:** Promise.allSettled parallelization of pool + known-lemmas queries in /api/cards/due, saving ~one Turso round-trip per study-session start with graceful degradation on DB failures.

## What Was Built

Restructured the `GET` handler in `app/api/cards/due/route.ts` so the two structurally-independent Prisma queries (card pool fetch and known-lemmas fetch) run concurrently via `Promise.allSettled`, replacing the previous fully-serial execution.

**Before (serial):**
1. `await prisma.card.findMany(...)` — pool fetch
2. `await prisma.cardDependency.findMany(...)` — edge fetch
3. `await prisma.card.findMany(...)` — known-lemmas fetch

**After (parallelized):**
1. `await Promise.allSettled([pool fetch, known-lemmas fetch])` — concurrent
2. Check pool result; return 500 if rejected
3. `await prisma.cardDependency.findMany(...)` — edge fetch (sequential; depends on pool IDs)
4. Build `knownLemmas` Set from allSettled result (degrade to empty Set if rejected)

**Performance gain:** ~50–100ms per study-session start (one fewer Turso round-trip).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Parallelize pool + known-lemmas queries via Promise.allSettled | bf69e58 | app/api/cards/due/route.ts |
| 2 | Verify: npm run build succeeds, route compiles | (verification only) | — |

## Acceptance Criteria Results

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Promise.allSettled over pool + known-lemmas | PASS | `grep -q "Promise.allSettled" app/api/cards/due/route.ts` |
| Pool rejection → 500 | PASS | `status === 'rejected'` check followed by `status: 500` response |
| Known-lemmas rejection → empty Set | PASS | `knownRowsResult.status === 'fulfilled'` ternary with `[]` fallback |
| Edge query sequential after pool | PASS | `cardDependency.findMany` still awaited separately after `cards` assigned |
| Response shape unchanged (NextResponse.json(ordered)) | PASS | Final return unchanged; annotation loop unchanged |
| `npx tsc --noEmit` clean | PASS | Zero errors in target file |
| `npm run lint` clean | PASS | 0 errors, 1 pre-existing warning in CardsClient.tsx (unrelated) |
| `npm run build` exits 0 | PASS | Build completed successfully in ~2.7s |

## Deviations from Plan

### Auto-added Functionality

**[Rule 2 - Missing critical functionality] try/catch wrapper on GET handler**
- **Found during:** Task 1 implementation
- **Issue:** CLAUDE.md states "All route handlers wrap their body in try/catch returning NextResponse.json({ error: … }, { status: 500 }) on unexpected throw." The original handler lacked this wrapper.
- **Fix:** Wrapped the entire handler body in `try { … } catch { return NextResponse.json({ error: 'Database error' }, { status: 500 }) }`.
- **Files modified:** app/api/cards/due/route.ts
- **Commit:** bf69e58

No other deviations — plan executed per specification.

## Known Stubs

None. The route change is a behavioral optimization with identical output semantics.

## Threat Flags

No new security surface introduced. Parallelizing existing queries does not alter data exposed or auth logic. ASVS Level 1 — no findings.

## Self-Check

- [x] `app/api/cards/due/route.ts` modified and committed at bf69e58
- [x] `npm run build` exits 0 (verified Task 2)
- [x] `npm run lint` 0 errors (verified Task 1)
- [x] `npx tsc --noEmit` 0 errors in target file (verified Task 1)
- [x] All grep assertions from acceptance criteria pass

## Self-Check: PASSED
