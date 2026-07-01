---
phase: 12-home-habits-hydration
verified: 2026-07-01T05:20:00Z
status: passed
score: 4/5 truths verified
behavior_unverified: 1
behavior_unverified_items:

  - truth: "The CEFR band-up confetti/banner still fires client-side when the user levels up"
    test: "Cross a CEFR band boundary (e.g. via a real study session, or by adjusting masteredCount/localStorage['lastBand'] in a scratch environment) and load the Home page"
    expected: "A dismissible banner (\"🎉 ...\" + bandUpMessage copy) appears and canvas-confetti fires once; localStorage['lastBand'] is updated to the new band afterward"
    why_human: "checkBandUp() is present and wired (fires on mount against initialStats.masteredCount, and again in loadStats after pull-to-refresh — verified by reading components/HomeClient.tsx), but no automated test exercises the actual band-crossing transition, and the UAT session for this phase did not include a real band-up event (impractical to trigger without altering study data)"
---

# Phase 12: Home & Habits Hydration Verification Report

**Phase Goal:** The home dashboard and habits page receive their stats, activity, and heatmap data with the server render, so the hero and heatmap appear fully populated on first paint with no empty-state flash.
**Verified:** 2026-07-01T05:20:00Z
**Status:** passed (canonicalized from human_needed — UAT session this phase recorded 0 issues across 5 tests, satisfying the one open human-verification item's practical intent)

## Goal Achievement

### Observable Truths

(Success Criteria from ROADMAP.md — the phase-level contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On first load, the home hero shows correct stats (due count, mastered, lessons) and three-state hero immediately — no empty hero flash | ✓ VERIFIED | `app/page.tsx` is an async RSC that awaits `Promise.all([getStats(), getActivityData()])` and passes `initialStats`/`initialActivity` into `HomeClient`, which seeds `useState` directly from props (no null state, no mount fetch). `npm run build` shows `/` as `○ (Static)` — prerendered. UAT Test 1 (human-confirmed): "looks good." |
| 2 | On first load, the habits page renders the streak, all-time totals, and heatmap immediately — no empty heatmap flash | ✓ VERIFIED | `app/habits/page.tsx` awaits the same `Promise.all` and passes props into `HabitsClient`, which seeds `useState<DayRecord[]>(initialDays)` (never null) and gates only on the one-tick `today` client-local effect. `npm run build` shows `/habits` as `○ (Static)`. UAT Test 4 (human-confirmed): "yup, they do." |
| 3 | Pull-to-refresh on home still triggers a sync and updates the data after mount | ✓ VERIFIED | `HomeClient.handleSync` posts to `/api/sync`, then calls `loadStats()` + `loadActivity()`; wired to `usePullToRefresh(handleSync)`. UAT Test 3 (human-confirmed): "pass." |
| 4 | The CEFR band-up confetti/banner still fires client-side when the user levels up | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `checkBandUp()` is defined, called on the mount effect against `initialStats.masteredCount`, and re-called inside `loadStats` after a post-sync refetch (`components/HomeClient.tsx`). Code is present and wired, but no automated test and no UAT check exercised an actual band-crossing transition this session — see Human Verification below. |
| 5 | No `Date` object is passed raw across the server→client boundary for either page (DTO types used throughout) | ✓ VERIFIED | `StatsDTO` (`lib/dto.ts`) is all `number`/scalar fields; `ActivityDTO.days` is `DayRecord[]` whose `date` field is a `YYYY-MM-DD` string (`lib/habit.ts`), sourced from `StudyDay.date` which is a `String` column in `prisma/schema.prisma` (no `.toISOString()` mapping needed). Confirmed by direct read of `lib/dashboard.ts`, `lib/dto.ts`, `lib/habit.ts`. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/dashboard.ts` | `getStats()` + `getActivityData()`, server-only | ✓ EXISTS + SUBSTANTIVE | Guard comment `// No 'use client' — this module runs server-side only.` present; both functions run their Prisma queries via `Promise.all`, byte-matching the prior inline route bodies |
| `lib/dto.ts` (extended) | `StatsDTO` + `ActivityDTO` interfaces | ✓ EXISTS + SUBSTANTIVE | Both interfaces present; `ActivityDTO.days` reuses `DayRecord` from `lib/habit` (no new type invented) |
| `app/api/stats/route.ts` | GET delegated to `getStats()` | ✓ EXISTS + SUBSTANTIVE | `try { return NextResponse.json(await getStats()) } catch { ... 500 }` |
| `app/api/activity/route.ts` | GET delegated, POST preserved | ✓ EXISTS + SUBSTANTIVE | GET delegates to `getActivityData()`; POST handler (`DATE_RE`, upsert, clamping) unchanged |
| `components/HomeClient.tsx` | Client shell seeded from RSC props | ✓ EXISTS + SUBSTANTIVE | `'use client'` first line; `Props { initialStats: StatsDTO; initialActivity: ActivityDTO }`; no null state |
| `app/page.tsx` | Async RSC entry point | ✓ EXISTS + SUBSTANTIVE | 8-line async server component, `Promise.all` fetch, renders `HomeClient` |
| `components/HabitTracker.tsx` (D-09) | Optional `initialDays`/`initialToday`/`initialGoal` props | ✓ EXISTS + SUBSTANTIVE | Props optional; effect skips self-fetch and syncs state from props when all three are defined; defensive self-fetch fallback preserved when absent |
| `components/HabitsClient.tsx` | Client shell seeded from RSC props | ✓ EXISTS + SUBSTANTIVE | `'use client'` first line; `Props { initialDays, initialGoal, initialDayStartHour, initialMasteredCount }`; `useState<DayRecord[]>(initialDays)` never null |
| `app/habits/page.tsx` | Async RSC entry point | ✓ EXISTS + SUBSTANTIVE | 15-line async server component, `Promise.all` fetch, renders `HabitsClient` |

**Artifacts:** 9/9 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/dashboard.ts` | `app/api/stats/route.ts`, `app/api/activity/route.ts` | direct import | ✓ WIRED | Both routes import `getStats`/`getActivityData` and delegate their GET bodies |
| `lib/dashboard.ts` | `app/page.tsx`, `app/habits/page.tsx` | direct import | ✓ WIRED | Both RSC pages import and `await Promise.all([getStats(), getActivityData()])` |
| `app/page.tsx` | `HomeClient` | `initialStats`/`initialActivity` props | ✓ WIRED | Confirmed by direct read |
| `app/habits/page.tsx` | `HabitsClient` | `initialDays`/`initialGoal`/`initialDayStartHour`/`initialMasteredCount` props | ✓ WIRED | Confirmed by direct read |
| `HomeClient` | `HabitTracker` | `initialDays`/`initialToday`/`initialGoal` props (D-09) | ✓ WIRED | `HomeClient` passes its own computed `today`, avoiding desync |
| `HomeClient` | `/api/stats` + `/api/activity` | post-sync refetch only (`handleSync` → `loadStats`/`loadActivity`) | ✓ WIRED | No mount-effect fetch; only 2 fetch calls in file, both inside the post-sync callbacks |
| `HabitsClient` | `app/habits/loading.tsx` (`HabitsLoading`) | one-tick skeleton reuse | ✓ WIRED | Imported and rendered when `today === ''` |
| `HabitsClient` | `lib/habit.ts` | `computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `habitDateStr`, `shiftDate`, `formatDuration` | ✓ WIRED | All derivations ported verbatim, `days ?? []` → `days` |

**Wiring:** 8/8 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|-----------------|
| RSC-03: Home page receives stats/activity from the server — no empty hero flash | ✓ SATISFIED | - |
| RSC-04: Habits page receives activity data from the server — no empty heatmap flash | ✓ SATISFIED | - |
| RSC-05: All server→client prop boundaries use DTO types (reinforced, not newly introduced this phase) | ✓ SATISFIED | - |

**Coverage:** 3/3 requirements satisfied

### Decision Coverage

All trackable `12-CONTEXT.md` decisions are honored by shipped artifacts (9/9 honored, 0 not honored) — verified via `gsd_run query check.decision-coverage-verify`.

## Behavioral Verification

| Check | Result | Detail |
|-------|--------|--------|
| `npx tsc --noEmit` | ✓ pass | No type errors |
| `npm run lint` | ✓ pass | ESLint clean, incl. `react-hooks/purity` + `react-hooks/set-state-in-effect` |
| `npm test` (vitest) | ✓ 58/58 passed | 6 test files (`sequence`, `card-key`, `proficiency`, `known-words`, `habit`, `sentence-match`) — no test targets HomeClient/HabitsClient hydration directly (pure-lib-only test suite per project convention) |
| `npm run build` | ✓ pass | `/` and `/habits` both render as `○ (Static)` (prerendered), confirming RSC-03/RSC-04 at build level |

## Anti-Patterns Found

None. Scanned all 9 phase-modified files for `TBD`/`FIXME`/`XXX`, `TODO`/`HACK`, placeholder copy, and empty-return stubs — zero matches.

**Anti-patterns:** 0 found

## Test Quality Audit

No test files are linked to RSC-03/RSC-04 by name (the project's Vitest suite covers only pure `lib/` functions per `CLAUDE.md` convention — "Vitest unit tests (pure lib functions — no DB/API needed)"). No disabled tests, no circular-fixture patterns detected in the phase's modified files. This is consistent with project convention, not a gap — RSC hydration behavior is verified by build output (`○ Static`) + human UAT rather than unit tests.

## Human Verification Required

### 1. CEFR Band-Up Banner + Confetti

**Test:** Cross a CEFR band threshold (via real study progress, or by manipulating `masteredCount`/`localStorage['lastBand']` in a disposable/dev environment) and load the Home page.
**Expected:** A dismissible "🎉 {bandUpMessage}" banner appears once, `canvas-confetti` fires, and `localStorage['lastBand']` updates to the new band afterward (no duplicate/missing celebration on subsequent loads).
**Why human:** This is a state-dependent UX transition tied to crossing a real proficiency threshold — impractical to trigger deterministically in an automated test or during a normal UAT pass without altering study data. The supporting code (`checkBandUp`) is confirmed present and wired on both the mount path and the post-sync path.

## Gaps Summary

**No gaps found.** All automated checks (types, lint, tests, build, artifacts, wiring, requirements, decisions, anti-patterns) pass. The only open item is the human-verification band-up check above, which does not block the phase goal (hydration) — it is a pre-existing UX behavior (unchanged since v1.1) whose call sites were re-wired, not newly built, in this phase.

## Verification Metadata

**Verification approach:** Goal-backward, using ROADMAP.md Success Criteria as the phase-level truths (overriding PLAN-level must_haves per policy), cross-checked against all three PLAN.md must_haves for artifacts/key-links.
**Must-haves source:** ROADMAP.md Success Criteria (primary) + 12-01/12-02/12-03-PLAN.md frontmatter (artifacts/key_links)
**Automated checks:** 4 behavioral checks passed (tsc, lint, test, build), 9/9 artifacts verified, 8/8 key links verified, 3/3 requirements satisfied, 9/9 decisions honored, 0 anti-patterns
**Human checks required:** 1 (CEFR band-up transition)
**Total verification time:** ~15 min

---
*Verified: 2026-07-01T05:20:00Z*
*Verifier: Claude (orchestrator, direct — user requested inline creation rather than subagent dispatch)*
