---
phase: 32-study-load-round-trip-collapse
verified: 2026-08-08T21:55:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 32: Study Load Round-Trip Collapse Verification Report

**Phase Goal:** Cut `/study`'s load cost from four-to-five serial libSQL HTTP round trips to at most two, by batching the independent reads, removing (or proving non-duplicative) the second full-row `card.findMany`, and caching the reads that only ever change on sync — without altering which cards a session picks or the order it presents them in.
**Verified:** 2026-08-08T21:55:00Z
**Status:** passed
**Re-verification:** No — initial verification (this is the first VERIFICATION.md for this phase; a prior 32-REVIEW.md / 32-REVIEW-FIX.md code-review cycle happened first and is folded into this pass per the request)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A `/study` load issues at most two round trips to Turso, demonstrable from query instrumentation (SC1) | ✓ VERIFIED | `tests/study-roundtrips.test.ts` run live: 4/4 pass — warm ≤2, cold ≤3, post-bump-miss ≤3 then back to ≤2, physical count agrees with Prisma's `$on('query')` count. `lib/prisma.ts`'s `STUDY_QUERY_COUNTER === '1'` gate confirmed strict-equality, default path unaffected. |
| 2 | The second full-row `card.findMany` (now raw-SQL Phase B) is kept, not eliminated, and confirmed non-duplicative against Phase A's columns (STUDY-02) | ✓ VERIFIED | Read `lib/study-cards.ts`: Phase A selects only `id`/`nextReview`/`orderIndex`/`version` (3-4 light columns for up to 1000 pool rows); Phase B selects the full row (type/front/back/notes/normalizedFront/components/distractors/lessonId + full review/lesson/sentences) for only the ~sessionSize chosen cards. Disjoint purposes/columns confirmed by direct read, matching `32-03-SUMMARY.md`'s explicit STUDY-02 completion claim. |
| 3 | `CardDependency` edges and the `normalizedFront` lemma set are served from cache and invalidated only on sync (STUDY-03) | ✓ VERIFIED | `lib/study-cache.ts` implements a `globalThis`-held snapshot gated by `studyCacheVersion`; `e2e/study-cache-invalidation.spec.ts` run live: cross-process edge creation (separate `tsx` subprocess) surfaces on the next `/study` load with no restart, and a `POST /api/review` grade does **not** bump the token (D-02 lock) — both assertions passed. |
| 4 | Session composition is byte-for-byte unchanged: prerequisite closure, foundation-first ordering, bare-word-first gate, least-unknown sentence selection all hold (SC4) | ✓ VERIFIED | Full unit suite (`npx vitest run`): 326/326 pass across 30 files, including `tests/sequence.test.ts`, `tests/known-words.test.ts`, `tests/sentence-selection.test.ts`, `tests/study-cards.test.ts`. `e2e/grade-flow.spec.ts` run live against a prod build: passed (full flashcard session: reveal → grade → queue advance → completion). |
| 5 | Mode-select due count and lesson-range settling are well ahead of baseline; `/study` and `/api/cards/due` perf budgets pass at tightened thresholds (SC2) | ✓ VERIFIED | `e2e/perf.spec.ts` run live against a prod build (port 3100): `/study` budget tightened to 200ms (WR-02 fix, 3x headroom) — passed at ~30-59ms samples; `/api/cards/due` budget tightened to 100ms — passed at 3-13ms samples. |
| 6 | CR-01 fix: changing "Session size" in Settings invalidates the warm `/study` cache on the very next load | ✓ VERIFIED (behavioral, not just presence) | Read `lib/settings.ts:setSessionSize()` — calls `bumpStudyCacheVersion()` after the upsert; `app/api/settings/route.ts` PUT handler calls `setSessionSize()` when `hasSize`. **Live behavioral spot-check** (ad-hoc script against a real temp SQLite DB, deleted after use, not committed): warmed cache at `sessionSize=20`, called `setSessionSize(50)`, reloaded — cache served `sessionSize=50` on the very next call. PASS. |
| 7 | CR-02 fix: an empty due/ahead pool reads the real DB-persisted `studyCacheVersion` instead of a synthetic `null`, so a sync/relink landing during an empty-pool window is not permanently missed | ✓ VERIFIED (behavioral, not just presence) | Read `lib/study-cards.ts` lines 188-201 — empty-pool path now runs a fallback `SELECT value FROM Setting WHERE key = 'studyCacheVersion'` query. **Live behavioral spot-check**: forced an empty pool, called `bumpStudyCacheVersion()` (simulating a sync/relink) while pool stayed empty, reloaded — cache version matched the real bumped DB value, not a stale `null`. PASS. |
| 8 | WR-01 fix: the pool-query failure path now logs before rethrowing | ✓ VERIFIED | `lib/study-cards.ts:174`: `console.error('[study-cards] pool query failed', err)` present before `throw new Error('Database error')`. |
| 9 | WR-03 fix: concurrent cold-start refills for the same version are de-duplicated to one physical query | ✓ VERIFIED (behavioral, not just presence) | `lib/study-cache.ts`'s `refreshStudyCache()` wraps `doRefreshStudyCache()` with an in-flight-promise tracker on `globalForStudyCache.studyCacheInFlight`. **Live behavioral spot-check**: fired two concurrent `refreshStudyCache('v1')` calls — measured exactly 1 physical round trip (`STUDY_QUERY_COUNTER` instrumentation) and both callers received the identical object reference. PASS. |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified — every state-transition/invalidation claim, including the two CRITICAL and one WARNING fix from the code-review cycle, was exercised live against a real database rather than accepted on code presence alone).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/query-counter.ts` | Counting Proxy factory + reset/read accessors | ✓ VERIFIED | Present, wired into `lib/prisma.ts`'s env-gated branch. |
| `lib/prisma.ts` | Env-gated instrumentation branch, default path unaffected | ✓ VERIFIED | Strict `=== '1'` check confirmed; default branch identical to pre-phase shape. |
| `scripts/measure-study-roundtrips.mts` | Runnable measurement harness | ✓ VERIFIED (exists) | Present per `32-BASELINE.md`'s recorded output. |
| `.planning/phases/32-study-load-round-trip-collapse/32-BASELINE.md` | Before/after numbers | ✓ VERIFIED | Before: 10-11 physical round trips. After: 2 warm / 3 cold-miss — matches my own live test run of `tests/study-roundtrips.test.ts`. |
| `lib/study-cache.ts` | Module-scope invariant snapshot + version-gated refill | ✓ VERIFIED | Single combined `$queryRaw`, atomic replacement, in-flight dedup (WR-03), all confirmed present and behaviorally correct. |
| `lib/study-cards.ts` | Raw-SQL Phase A (pool+version in one request) + Phase B (full rows) + `StudyCardsResult` | ✓ VERIFIED | Both phases present, columns disjoint (STUDY-02), CR-02 empty-pool fallback present and behaviorally correct. |
| `tests/study-roundtrips.test.ts` | Committed STUDY-01 proof | ✓ VERIFIED | Run live: 4/4 pass. |
| `e2e/study-cache-invalidation.spec.ts` | Cross-process no-redeploy proof | ✓ VERIFIED | Run live against prod build: 2/2 pass. |
| `e2e/perf.spec.ts` | Tightened `/study` and `/api/cards/due` budgets | ✓ VERIFIED | Run live: budgets at 200ms/100ms (WR-02 3x-headroom fix applied), all pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/study/page.tsx` | `lib/study-cards.ts:getStudyCards()` | `await` before reading `lessons`, never `Promise.all` | ✓ WIRED | Confirmed by direct read — sequential await, comment explains the race hazard averted. |
| `app/study/page.tsx` | `export const dynamic = 'force-dynamic'` | still present | ✓ WIRED | Line 9 confirmed present. |
| `app/api/settings/route.ts` PUT | `lib/settings.ts:setSessionSize()` | `hasSize` branch | ✓ WIRED | Confirmed, and `setSessionSize()` itself calls `bumpStudyCacheVersion()` (CR-01 fix) — full chain confirmed live. |
| `lib/study-cards.ts` (empty-pool path) | `Setting` table `studyCacheVersion` | fallback scalar query (CR-02 fix) | ✓ WIRED | Confirmed live — real DB version read matches cache version after the fallback path runs. |
| `GET /api/cards/due` | `getStudyCards()` | bare `CardDTO[]` response shape preserved | ✓ WIRED | Confirmed by reading `app/api/cards/due/route.ts` — destructures `{ cards }`, returns bare array. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| STUDY-01 warm/cold round-trip counts | `npx vitest run tests/study-roundtrips.test.ts` | 4/4 pass (warm ≤2, cold ≤3, physical==prismaEvents) | ✓ PASS |
| Unit regression suite (session composition, cache, cards-due route) | `npx vitest run` | 326/326 pass, 30 files | ✓ PASS |
| Cross-process invalidation + D-02 lock | `npx playwright test study-cache-invalidation.spec.ts` (prod build) | 2/2 pass | ✓ PASS |
| Full flashcard session flow unaffected | `npx playwright test grade-flow.spec.ts` (prod build) | 1/1 pass | ✓ PASS |
| Tightened perf budgets (`/study`, `/api/cards/due`, and siblings) | `npx playwright test perf.spec.ts` (prod build) | 7/7 pass | ✓ PASS |
| CR-01 (session-size cache invalidation) | ad-hoc script against a real temp SQLite DB, not committed | `sessionSize` served stale (20) before, correct (50) after `setSessionSize(50)` + reload | ✓ PASS |
| CR-02 (empty-pool real version read) | ad-hoc script against a real temp SQLite DB, not committed | cache version matched real DB `studyCacheVersion` after a bump during an empty-pool window | ✓ PASS |
| WR-03 (concurrent refill de-dup) | ad-hoc script, `STUDY_QUERY_COUNTER=1`, not committed | 2 concurrent `refreshStudyCache('v1')` calls cost exactly 1 physical round trip, same object returned | ✓ PASS |
| ESLint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx` useMemo dep) | ✓ PASS |
| TypeScript | `npx tsc --noEmit` | Clean, no errors | ✓ PASS |

All ad-hoc spot-check scripts were written to `scripts/_verify-*.mts` for the duration of the check and deleted immediately after (`git status --porcelain` confirmed clean before and after — no phase artifacts modified by verification).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| STUDY-01 | 32-01, 32-03, 32-04 | `/study` issues at most two round trips (down from 4-5) | ✓ SATISFIED | Live test run: warm=2, cold≤3, both proven. |
| STUDY-02 | 32-01 (measurement), 32-03 (implementation) | Second `card.findMany` eliminated or confirmed non-duplicative | ✓ SATISFIED | Code read confirms disjoint column sets between Phase A/B. `32-03-SUMMARY.md` explicitly claims this requirement complete (`requirements-completed: [STUDY-01, STUDY-02]`), even though it is not listed in `32-04-PLAN.md`'s frontmatter — REQUIREMENTS.md's reconciliation commit `c56d389` ("mark STUDY-02 complete... missed by 32-04's narrower requirements scope") is **factually correct against the code**: the requirement was genuinely satisfied by 32-03's work, not merely relabeled. |
| STUDY-03 | 32-02, 32-04 | CardDependency edges + normalizedFront lemmas cached, invalidated only on sync | ✓ SATISFIED | Live e2e cross-process test + my own CR-01/CR-02 spot-checks confirm the invalidation contract holds, including the two post-review-fix edge cases (session-size change, empty-pool window). |

No orphaned requirements — `.planning/REQUIREMENTS.md`'s Phase 32 row lists exactly STUDY-01/02/03, all three claimed across the four plans, all three verified.

### Anti-Patterns Found

None. Scanned all phase-touched files (`lib/study-cache.ts`, `lib/study-cards.ts`, `lib/settings.ts`, `lib/query-counter.ts`, `lib/prisma.ts`, `lib/sync.ts`, `lib/relink-dependencies.ts`, `app/study/page.tsx`, `app/api/cards/due/route.ts`, `app/api/settings/route.ts`, `scripts/measure-study-roundtrips.mts`, `e2e/perf.spec.ts`, `e2e/study-cache-invalidation.spec.ts`, `e2e/helpers/mutate.ts`, `e2e/run-mutate.ts`, `tests/study-cache.test.ts`, `tests/study-cards.test.ts`, `tests/cards-due-route.test.ts`, `tests/study-roundtrips.test.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` and "not yet implemented"-style phrases — zero hits.

### Code-Review Fix Verification (32-REVIEW.md → 32-REVIEW-FIX.md)

The 32-REVIEW-FIX.md report claimed 5 fixes across 5 commits. All 5 were independently re-verified in this pass — not accepted on the fix report's word:

| Finding | Commit | Claimed fix | Independently confirmed | How |
|---------|--------|-------------|--------------------------|------|
| CR-01 (CRITICAL) | `d7511a5` | `setSessionSize()` bumps cache version | ✓ Confirmed, behaviorally | Code read + live spot-check |
| CR-02 (CRITICAL) | `1e9cbd8` | Empty pool reads real DB version, not synthetic `null` | ✓ Confirmed, behaviorally | Code read + live spot-check |
| WR-01 | `e19a915` | Pool-query failure now logged | ✓ Confirmed | Code read |
| WR-02 | `b04275b` | Perf budget headroom widened to 3x | ✓ Confirmed | Code read + live perf.spec.ts run (200ms/100ms budgets pass) |
| WR-03 | `9810883` | Concurrent refills de-duplicated | ✓ Confirmed, behaviorally | Code read + live spot-check |

All 5 commits exist in `git log`, match the claimed file diffs (`git show --stat`), and the resulting code was exercised live rather than only read.

### Human Verification Required

None. Every truth in this phase was either proven by a committed, currently-passing automated test/spec, or by a live ad-hoc behavioral spot-check run against a real (temporary) database during this verification pass.

### Gaps Summary

No gaps found. All 9 must-have truths verified, all 3 requirement IDs (STUDY-01/02/03) satisfied and cross-checked against REQUIREMENTS.md with no orphans, both CRITICAL and all 3 WARNING/lower fixes from the 32-REVIEW.md code-review cycle confirmed present and behaviorally sound (not merely claimed), the full unit suite (326 tests) and the relevant e2e suite (11 tests: grade-flow, cache-invalidation, perf) pass live against a real prod build, lint and typecheck are clean, and the STUDY-02 REQUIREMENTS.md reconciliation (commit `c56d389`) is confirmed factually correct against the actual code, not just procedurally tidy.

---

_Verified: 2026-08-08T21:55:00Z_
_Verifier: Claude (gsd-verifier)_
