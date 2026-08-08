---
phase: 32-study-load-round-trip-collapse
plan: 02
subsystem: database
tags: [prisma, caching, invalidation, globalThis, turso, sqlite, vitest]

requires:
  - phase: 32-study-load-round-trip-collapse
    provides: "32-01's measured baseline (10-11 physical round trips) and the permanent scripts/measure-study-roundtrips.mts harness this plan's cache is expected to close the gap against, in Plan 03"
provides:
  - "lib/study-cache.ts: StudyInvariants snapshot + getStudyCache()/refreshStudyCache(version)/resetStudyCacheForTests() — a globalThis-held, version-gated, per-field-degrading invariant cache for CardDependency edges, normalizedFront lemmas, sessionSize, and the lessons list"
  - "lib/settings.ts: SETTING_KEYS.studyCacheVersion + bumpStudyCacheVersion() — the single writer of the cross-process invalidation token, and getAllSettings() switched to an explicit 8-key array so the new key never leaks into GET /api/settings"
  - "Unconditional invalidation wiring in lib/relink-dependencies.ts:relinkAllDependencies() (the one function all three real mutating writers call) and lib/sync.ts:runSync() (covers per-lesson inline edge/card creation even when the auto-relink gate is off)"
  - "tests/study-cache.test.ts: mocked hit/miss/stamp/partial-failure coverage plus a real-temp-SQLite-DB cross-process invalidation proof (STUDY-03 success criterion #3) and a locked D-02 regression (review writes do NOT invalidate)"
affects: [32-03-study-load-round-trip-collapse, 32-04-study-load-round-trip-collapse]

actuals:
  tokens: 7973
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "globalThis-held invariant snapshot mirrors lib/prisma.ts's globalForPrisma holder pattern, but assigns unconditionally in every NODE_ENV (mutable cache state must survive Next.js dev hot-reload, unlike the Prisma singleton)"
    - "Cross-process invalidation channel: a DB-persisted Setting row (studyCacheVersion) is the only state visible to both the long-running Next.js server process and the standalone scripts/local-resync.mts / scripts/relink-dependencies.mts tsx processes, which each have their own empty globalThis"
    - "Refill degrades per-field via Promise.allSettled (never $transaction — verified from adapter source in 32-RESEARCH.md to serialize round trips); a version stamp is only ever applied by the caller, never re-read inside the refill, and a partially-degraded refill is returned to its one caller but never stored"
    - "vi.doUnmock() + vi.resetModules() (the non-hoisted counterparts of vi.mock/vi.unmock) let a single test file mix a hoisted vi.mock('@/lib/prisma', ...) block with a later real-temp-SQLite-DB block without the two interfering — vi.unmock is itself hoisted and would otherwise retroactively cancel the mock for the whole file"

key-files:
  created:
    - lib/study-cache.ts
    - tests/study-cache.test.ts
  modified:
    - lib/settings.ts
    - lib/sync.ts
    - lib/relink-dependencies.ts

key-decisions:
  - "bumpStudyCacheVersion() writes an opaque `${Date.now()}-${randomUUID().slice(0,8)}` token via a plain upsert (not read-modify-write increment), so two concurrent bumps (e.g. a sync's per-lesson bump racing its own end-of-function relink bump) can never lose an update to a race — deliberately NOT the monotonic counter Phase 33's VERS-01 will introduce"
  - "getAllSettings() switched from Object.values(SETTING_KEYS) to an explicit 8-key array specifically so adding studyCacheVersion to SETTING_KEYS could not silently widen GET /api/settings's response shape"
  - "relinkAllDependencies()'s bump sits OUTSIDE the `if (missing.length > 0)` guard — a relink that creates zero new edges may still follow a sync that created cards/lemmas, and the cache must still invalidate"
  - "runSync() bumps a SECOND time, independent of the `failures.length === 0 && newLessons > 0` auto-relink gate — the per-lesson inline edge/card creation persists changes even on runs where that gate is off; the resulting double-bump when the gate IS on is inert (token compared only for inequality)"
  - "Both bump call sites are non-fatal try/catch (console.warn only) — a failed bump must never turn a successful sync or relink into a thrown error, matching the existing non-fatal-log style already used for the auto-relink hook itself"

patterns-established:
  - "A snapshot module's only invalidation trigger is a caller-supplied version parameter compared for inequality against what's already stored — never re-derived by re-reading the DB inside the refill itself, so a version bump landing mid-refill self-corrects on the NEXT request rather than being silently absorbed"

requirements-completed: []

coverage:
  - id: D1
    description: "lib/study-cache.ts holds edges/lemmas/sessionSize/lessons behind getStudyCache()/refreshStudyCache(version), replacing atomically (never field-by-field), degrading per-field on partial failure, and never caching a partially-failed refill"
    requirement: "STUDY-03"
    verification:
      - kind: unit
        ref: "tests/study-cache.test.ts > study-cache — pure hit/miss/stamp/partial-failure (mocked prisma)"
        status: pass
    human_judgment: false
  - id: D2
    description: "bumpStudyCacheVersion() in lib/settings.ts is the single writer of the studyCacheVersion Setting row; GET /api/settings's response shape is unchanged (explicit 8-key array, no new field leak)"
    requirement: "STUDY-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (app/api/settings/route.ts against getAllSettings()'s narrowed return type)"
        status: pass
    human_judgment: false
  - id: D3
    description: "relinkAllDependencies() and runSync() both bump the token unconditionally, non-fatally, on every real mutating writer path (the /api/sync route, scripts/local-resync.mts, scripts/relink-dependencies.mts all funnel through relinkAllDependencies())"
    requirement: "STUDY-03"
    verification:
      - kind: unit
        ref: "tests/relink-dependencies.test.ts (double-run idempotency unaffected by the new write)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cross-process invalidation is proven against a real temp SQLite DB, not just asserted from the call graph: an edge created by relinkAllDependencies() changes the stored token, and the next refreshStudyCache() picks up the edge with no process restart"
    requirement: "STUDY-03"
    verification:
      - kind: integration
        ref: "tests/study-cache.test.ts > study-cache — cross-process invalidation proof (real temp SQLite DB) > STUDY-03 / success-criterion #3 proof"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-02 is locked by a regression test: a CardReview write with state 1 does NOT change the stored studyCacheVersion token"
    verification:
      - kind: integration
        ref: "tests/study-cache.test.ts > study-cache — cross-process invalidation proof (real temp SQLite DB) > D-02 (locked)"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-08
status: complete
---

# Phase 32 Plan 02: Study-Cache Invariant Snapshot & Cross-Process Invalidation Summary

**Built `lib/study-cache.ts` — a `globalThis`-held, version-gated snapshot of `/study`'s four constant invariant reads (`CardDependency` edges, `normalizedFront` lemmas, `sessionSize`, lessons) — plus the `studyCacheVersion` `Setting`-table change token that invalidates it, wired unconditionally into both `relinkAllDependencies()` and `runSync()` so the two standalone-process writers (`scripts/local-resync.mts`, `scripts/relink-dependencies.mts`) reach the same channel a running server can observe on its very next `/study` load.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-08-08T17:12:00Z (approx., continuing from Plan 01's completion)
- **Completed:** 2026-08-08T18:02:00Z
- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Built `lib/study-cache.ts`: a `StudyInvariants` snapshot (`version`, `edges`, `lemmas`, `sessionSize`, `lessons`) held on a `globalThis` holder (mirroring `lib/prisma.ts`'s pattern but assigning unconditionally in every `NODE_ENV`, since this is mutable state, not a singleton client). `refreshStudyCache(version)` runs all four reads concurrently via `Promise.allSettled` (never `$transaction`, per 32-RESEARCH.md's adapter-source finding that it serializes round trips on this stack), degrades each field independently exactly as `lib/study-cards.ts` does today (including preserving the RELIABILITY-01 `[study-cards]`-prefixed lemmas-failure log byte-for-byte), stamps the snapshot with the caller-supplied version only (never a fresh re-read), and replaces the holder atomically in one statement — a partially-failed refill is returned to its one caller but never stored, so the next request retries instead of pinning a degraded snapshot behind a version stamp that would otherwise look current.
- Added `SETTING_KEYS.studyCacheVersion` and `bumpStudyCacheVersion()` to `lib/settings.ts` — an opaque `${Date.now()}-${randomUUID}` change token written via plain `upsert` (deliberately not a read-modify-write increment, so two concurrent bumps can't lose an update). `getAllSettings()` was switched from `Object.values(SETTING_KEYS)` to an explicit 8-key array specifically so the new internal key can never leak into `GET /api/settings`'s response shape.
- Wired the bump unconditionally into `lib/relink-dependencies.ts:relinkAllDependencies()` (outside the `missing.length > 0` guard, as the final step before `return`) and `lib/sync.ts:runSync()` (a second, independent bump after the conditional auto-relink block, firing regardless of `failures.length`/`newLessons`) — both in non-fatal try/catch, matching the existing auto-relink hook's warn-and-continue style. Since `relinkAllDependencies()` is the one function all three real mutating writers (`/api/sync` via `runSync()`, `scripts/local-resync.mts`, `scripts/relink-dependencies.mts`) call unconditionally, the standalone-process writers reach the same invalidation channel a running server observes.
- Proved the cross-process claim against a real temp SQLite DB (not just asserted from the call graph): seeded a forward-reference pair of cards, refilled the cache showing zero edges, ran `relinkAllDependencies()`, confirmed the stored `studyCacheVersion` token changed, and confirmed a fresh `refreshStudyCache()` with the new token now contains the linked edge — the literal STUDY-03 success-criterion-#3 scenario. Also locked D-02 with a regression test: writing a `CardReview` row with `state: 1` (simulating `POST /api/review`) does NOT change the stored token.
- Solved a real Vitest technical obstacle along the way (see Deviations): combining a hoisted `vi.mock('@/lib/prisma', ...)` block with a later real-DB block in the same test file required `vi.doUnmock()` + `vi.resetModules()` (the non-hoisted counterparts) — the hoisted `vi.unmock()` would have retroactively cancelled the mock for the whole file, including the first describe block.

## Task Commits

1. **Task 1: The invariant snapshot module and its Setting-backed change token** - `0a05e62` (feat)
2. **Task 2: Wire the unconditional bump into both writer paths** - `4aac691` (feat)
3. **Task 3: Cross-process invalidation coverage against a real DB** - `7525a3b` (test)

**Plan metadata:** committed separately by the orchestrator (this plan runs in a git worktree; STATE.md/ROADMAP.md updates are the orchestrator's responsibility per the wave protocol).

## Files Created/Modified

- `lib/study-cache.ts` (created) - `StudyInvariants` interface, `getStudyCache()`, `refreshStudyCache(version)`, `resetStudyCacheForTests()`. Server-only (`// No 'use client'` marker).
- `lib/settings.ts` (modified) - `STUDY_CACHE_VERSION_KEY` const, `SETTING_KEYS.studyCacheVersion` entry, `bumpStudyCacheVersion()`, and `getAllSettings()`'s `Object.values(SETTING_KEYS)` spread replaced with an explicit 8-key array.
- `lib/relink-dependencies.ts` (modified) - Unconditional `bumpStudyCacheVersion()` call (non-fatal try/catch) as the final step of `relinkAllDependencies()`, before `return`. Header JSDoc updated (2 reads + at most 2 writes; documented as the phase-32 cache-invalidation point for all three writers).
- `lib/sync.ts` (modified) - A second unconditional `bumpStudyCacheVersion()` call (non-fatal try/catch) after the conditional auto-relink block, independent of `failures.length`/`newLessons`.
- `tests/study-cache.test.ts` (created) - Two describe blocks: mocked hit/miss/stamp/partial-failure cases (Task 1), and a real-temp-SQLite-DB cross-process invalidation proof + D-02 regression lock (Task 3).

## Decisions Made

- **Opaque change token, plain upsert** — `bumpStudyCacheVersion()` deliberately does not implement a monotonic counter (that's Phase 33's VERS-01); a plain upsert avoids a read-modify-write race between two concurrent bumps.
- **`getAllSettings()`'s explicit 8-key array** — protects `GET /api/settings`'s response shape from ever silently growing when a new internal-only key is added to `SETTING_KEYS`.
- **Bump placement** — `relinkAllDependencies()`'s bump is unconditional (outside the edge-creation guard) because a zero-new-edge relink can still follow a sync that created cards/lemmas; `runSync()`'s second bump is independent of the auto-relink gate because per-lesson inline edge/card creation persists even when that gate is off.
- **`vi.doUnmock()` + `vi.resetModules()`** for the single-file dual-block test structure — the hoisted `vi.unmock()` alternative would have cancelled the mock for the whole file (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `vi.unmock()`'s hoisting would have silently cancelled the mocked block's coverage entirely**
- **Found during:** Task 3, first run of the combined test file
- **Issue:** The plan's structure (a top-level `vi.mock('@/lib/prisma', ...)` for block 1, then unmocking for block 2's real-DB imports) initially used `vi.unmock()` inside block 2's `beforeAll`. Vitest hoists `vi.unmock()` calls to the top of the file just like `vi.mock()` (with an explicit runtime warning confirming this), so both ended up executing before ANY test ran — the mock was registered, then immediately cancelled, and block 1's tests ran against the real (unmocked) `prisma` module instead of the intended stubs, throwing `prisma.cardDependency.findMany.mockReset is not a function`.
- **Fix:** Switched to `vi.doUnmock()` (the non-hoisted counterpart, which executes exactly where it's called) combined with `vi.resetModules()`, placed inside block 2's `beforeAll` — this correctly deferred the unmock to run only after block 1's tests had already completed against the real mock.
- **Files modified:** `tests/study-cache.test.ts`
- **Verification:** `npx vitest run tests/study-cache.test.ts` went from 10/13 failing to 13/13 (later 10/10 once split across the Task 1/Task 3 commit boundary) passing.
- **Committed in:** `7525a3b` (Task 3's commit; the fix landed before block 2 was ever committed, since Task 1's commit contains only block 1)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a genuine Vitest hoisting-semantics bug in the test file itself, not the production code)
**Impact on plan:** Necessary for Task 3's real-DB block to actually run against a real database instead of silently reusing the mocked stubs (which would have made the "cross-process" proof vacuous — it would have passed even if the invalidation wiring were broken, since `prisma2.card.create` etc. don't exist on the mock). No scope creep — purely a test-harness correctness fix.

## Issues Encountered

None beyond the Vitest hoisting issue documented above (which is tracked as a deviation, not a separate issue, since it was auto-fixed within Task 3's own scope).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 03:** `refreshStudyCache(version: string | null): Promise<StudyInvariants>` and `getStudyCache(): StudyInvariants | undefined` are the exact exported signatures Plan 03's `lib/study-cards.ts` integration must call against. `StudyInvariants` exposes `{ version, edges, lemmas, sessionSize, lessons }` — the `lessons` field in particular is what lets `app/study/page.tsx`'s separate `prisma.lesson.findMany()` call be folded into the shared cache (per 32-CONTEXT.md's Pitfall 4 warning: that fold must be sequenced `await getStudyCards()` THEN read the now-populated cache, never `Promise.all`, or the lessons read can race the cache population).

**Not yet done (by design — later plans in this phase):** `lib/study-cards.ts` is confirmed byte-for-byte untouched by this plan (verified via `git diff` against the wave-start commit) — no consumer reads this cache yet, so `/study` behavior and round-trip count are completely unchanged. `requirements-completed` is deliberately left empty in this SUMMARY's frontmatter, matching Plan 01's precedent: STUDY-03's literal text ("Invariant reads... are cached") requires the actual `/study` read path to be served from this cache, which is Plan 03's job, not this plan's. Do not mark STUDY-03 complete in REQUIREMENTS.md based on this plan alone.

**No blockers.** `npx tsc --noEmit`, `npm run lint` (0 errors, 1 pre-existing unrelated warning in `components/StudySession.tsx`), and `npm test` (320/320, up from 310/310 in Plan 01) are all clean on top of this plan's changes.

---
*Phase: 32-study-load-round-trip-collapse*
*Completed: 2026-08-08*

## Self-Check: PASSED

All created/modified files exist on disk; all three task commit hashes (`0a05e62`, `4aac691`, `7525a3b`) are present in git history; `git diff` against the wave-start commit confirms `lib/study-cards.ts` is unmodified.
