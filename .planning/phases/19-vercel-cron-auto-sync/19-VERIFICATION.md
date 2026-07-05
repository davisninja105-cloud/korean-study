---
phase: 19-vercel-cron-auto-sync
verified: 2026-07-05T08:50:02Z
status: passed
score: 12/13 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:

  - test: "Complete .planning/phases/19-vercel-cron-auto-sync/19-03-USER-SETUP.md: generate CRON_SECRET, set it as a Production env var in the Vercel Dashboard, deploy (git push origin main) so vercel.json's cron registers, then check Vercel Dashboard → Cron Jobs for the scheduled job and its first invocation log (expect 200, not 401) after 10:00 UTC."
    expected: "The cron job appears under Vercel's Cron Jobs page, its first invocation returns 200, and Settings ▸ Advanced subsequently shows a fresh 'Last auto-synced' timestamp without any manual sync tap."
    why_human: "Vercel Cron scheduling cannot be exercised via next dev/next start (RESEARCH Pitfall 2, confirmed in 19-03-PLAN.md) — it only fires against a deployed Production environment with CRON_SECRET provisioned. This is the actual delivery of Roadmap Success Criterion 1 ('automated sync ... with no manual trigger') and is currently unexercised: 19-03-USER-SETUP.md is still marked 'Status: Incomplete'."

  - test: "Manual regression: Settings ▸ Advanced ▸ 'Sync now' — trigger a real sync and visually confirm the response/UI shape is unchanged, and separately confirm the 'Last auto-synced' status line renders as expected in the browser."
    expected: "Manual sync behaves identically to pre-refactor (same shape, ≤1 lesson/tap); the Advanced disclosure shows 'Last auto-synced: Never' before any cron run and a formatted local date/time after one."
    why_human: "19-01-SUMMARY.md and 19-02-SUMMARY.md's own coverage explicitly flag the live-browser/live-Claude-call portions of these checks as human_judgment: true — not exercised by the automated Vitest/build suite. Code inspection shows the refactor is a verbatim body-move (diff-verified) and the display wiring is correct, but no browser screenshot or live UI confirmation exists in this session."
---

# Phase 19: Vercel Cron Auto-Sync Verification Report

**Phase Goal:** The deck stays fresh on its own — a daily automated sync ingests new lessons without the user opening the app, and the user can confirm at a glance that it's still running.
**Verified:** 2026-07-05T08:50:02Z
**Status:** human_needed
**Re-verification:** No — initial verification (a prior attempt was interrupted mid-response with no output produced; this is a fresh run, not a continuation)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A daily Vercel Cron job automatically syncs exactly one lesson via MAX_LESSONS_PER_SYNC=1, with no manual trigger (Roadmap SC1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `vercel.json` declares one daily cron at `/api/cron/sync` (`0 10 * * *`); route calls `runSync()` bounded to `MAX_LESSONS_PER_SYNC=1`. Code is present, wired, and builds/registers (`npm run build` shows `/api/cron/sync` in the route table). But the actual scheduled trigger can only run once deployed with `CRON_SECRET` provisioned — `19-03-USER-SETUP.md` is still `Status: Incomplete`, so this has never actually fired unattended yet. |
| 2 | Cron requests authenticate via a `CRON_SECRET` bearer token checked inside `middleware.ts`, failing closed if the secret is unset — the endpoint stays inside the auth matcher (Roadmap SC2 / SYNC-03) | ✓ VERIFIED | `lib/auth.ts:30-33` — `isValidCronAuth` is a single boolean conjunction (`typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === 'Bearer ${cronSecret}'`); no fall-through path exists for a missing/empty secret. `tests/auth.test.ts` (6/6 passing, re-run live) explicitly asserts the `undefined`/`''` fail-closed cases. `middleware.ts:11-17` branches on `CRON_SYNC_PATH` before the cookie check and returns early (401 or next()). `config.matcher` (lines 42-44) confirmed unchanged — `/api/cron/sync` is not excluded from the negative-lookahead, so the path stays inside the protected surface. |
| 3 | Settings ▸ Advanced shows a "last auto-synced" timestamp so a silently-failing daily cron is noticeable (Roadmap SC3 / SYNC-04) | ✓ VERIFIED | `lib/settings.ts:99-110` — `getLastAutoSyncedAt`/`setLastAutoSyncedAt` persist via the existing `Setting` table (no schema diff — confirmed `prisma/schema.prisma` untouched across the whole phase's commit range). `app/api/settings/route.ts` GET includes `lastAutoSyncedAt`; PUT never destructures/validates/writes it (read-only, confirmed by source read). `app/settings/page.tsx:29,50,468` renders "Last auto-synced: {formatted or 'Never'}" from the same GET payload (no extra fetch). Critically, `app/api/cron/sync/route.ts:23-32` — the previously-found CR-01 blocker (timestamp stamped even on partial failure) is fixed: `setLastAutoSyncedAt` is now gated on `result.failed === 0`, with a `console.warn` on the failure path — confirmed present in the current file and matching commit `c84a6df`. |
| 4 | Manual sync path is behaviorally unchanged after the `runSync()` extraction (PLAN 19-01 must-have) | ✓ VERIFIED (code-level); not yet confirmed live | `app/api/sync/route.ts` is a thin wrapper: same 400/500 messages, same `maxDuration=300`, delegates to `runSync()`. `lib/sync.ts` contains the full extraction pipeline verified line-by-line against the original route body (content-hash filter, bounded batch, `Promise.allSettled`, per-lesson persist, dedup, two-phase dependency linking) — a verbatim move, not a rewrite. Full Vitest suite (126/126) and `npm run build`/`npm run lint` all green. Live browser regression not performed this session — see Human Verification. |
| 5 | `MAX_LESSONS_PER_SYNC=1` unchanged | ✓ VERIFIED | `lib/sync.ts:19` — `const MAX_LESSONS_PER_SYNC = 1`. |
| 6 | Both manual and cron routes share one `runSync()` | ✓ VERIFIED | `app/api/sync/route.ts:2` and `app/api/cron/sync/route.ts:2` both `import { runSync } from '@/lib/sync'`. |
| 7 | Timestamp persists via existing generic `Setting` table, no schema change | ✓ VERIFIED | `git diff` across the phase's full commit range shows zero changes to `prisma/schema.prisma`. `setLastAutoSyncedAt` uses `prisma.setting.upsert` (same pattern as `dailyGoalSeconds` etc). |
| 8 | Timestamp is read-only from the client's perspective | ✓ VERIFIED | `app/api/settings/route.ts` PUT handler (lines 27-63) never destructures, validates, or writes `lastAutoSyncedAt` — confirmed by direct read; matches 19-02-SUMMARY's own live curl round-trip claim. |
| 9 | `isValidCronAuth` fails closed | ✓ VERIFIED | Same evidence as Truth 2; `tests/auth.test.ts` re-run live: 6/6 pass, including explicit `undefined`/`''` secret cases. |
| 10 | Cron path authenticated inside `middleware.ts`, matcher never carved out | ✓ VERIFIED | Same evidence as Truth 2. |
| 11 | `GET /api/cron/sync` triggers `runSync()` once and writes the timestamp only after non-throwing completion | ✓ VERIFIED (exceeds must-have) | `app/api/cron/sync/route.ts:23-32` — timestamp write is now gated on `result.failed === 0` (stronger than "did not throw," per the CR-01 fix), confirmed present in commit `c84a6df` and the current file on disk. |
| 12 | `vercel.json` declares exactly one daily cron at `/api/cron/sync` | ✓ VERIFIED | `vercel.json` — single `crons` entry, `path: "/api/cron/sync"` (matches `CRON_SYNC_PATH` in `middleware.ts` exactly), `schedule: "0 10 * * *"`. Valid JSON (parsed without error). |
| 13 | The actual unattended, deployed cron run (the literal phrase "without the user opening the app") | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Same item as Truth 1 — code is ready, deploy + secret provisioning + first scheduled invocation are the only remaining, human-only steps (`19-03-USER-SETUP.md`, `Status: Incomplete`). |

**Score:** 12/13 truths verified (1 present + wired, behavior/deployment not yet exercised)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/sync.ts` | Exports `runSync(documentId)` + `SyncResult`, no NextRequest/NextResponse imports | ✓ VERIFIED | Confirmed by read; 325 lines, full pipeline, plain-object returns only. |
| `app/api/sync/route.ts` | Thin POST wrapper | ✓ VERIFIED | 25 lines, delegates to `runSync`, preserves error messages/`maxDuration`. |
| `lib/settings.ts` (getter/setter) | `getLastAutoSyncedAt`/`setLastAutoSyncedAt` | ✓ VERIFIED | Present, follows existing key-constant convention, no schema change. |
| `app/api/settings/route.ts` | GET includes `lastAutoSyncedAt`; PUT excludes it | ✓ VERIFIED | Confirmed by read. |
| `app/settings/page.tsx` | Displays the timestamp in Advanced | ✓ VERIFIED | Lines 29, 50, 468 — state, population, render. |
| `lib/auth.ts` (`isValidCronAuth`) | Pure, fail-closed bearer predicate | ✓ VERIFIED | Single boolean conjunction, no fall-through. |
| `tests/auth.test.ts` | Covers valid + fail-closed cases | ✓ VERIFIED | 6/6 tests, re-run live, all passing. |
| `middleware.ts` | Cron bearer branch, matcher unchanged | ✓ VERIFIED | Branch at top of function, early return; matcher line byte-identical to pre-phase. |
| `app/api/cron/sync/route.ts` | GET handler | ✓ VERIFIED | Present; imports `runSync` + `setLastAutoSyncedAt`; CR-01 fix confirmed live in file. |
| `vercel.json` | Single daily cron entry | ✓ VERIFIED | Valid JSON, one `crons` entry, path matches. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/sync/route.ts` | `lib/sync.ts` | `import { runSync } from '@/lib/sync'` | ✓ WIRED | Line 2. |
| `app/api/cron/sync/route.ts` | `lib/sync.ts` | `import { runSync } from '@/lib/sync'` | ✓ WIRED | Line 2. |
| `app/api/cron/sync/route.ts` | `lib/settings.ts` | `import { setLastAutoSyncedAt } from '@/lib/settings'` | ✓ WIRED | Line 3; call gated on `result.failed === 0` (line 28). |
| `middleware.ts` | `lib/auth.ts` | `import { isValidCronAuth } from '@/lib/auth'`, called with `process.env.CRON_SECRET` | ✓ WIRED | Lines 2, 13. |
| `vercel.json` `crons[0].path` | `middleware.ts` `CRON_SYNC_PATH` | String match | ✓ WIRED | Both `/api/cron/sync`. |
| `app/api/settings/route.ts` GET | `lib/settings.ts` `getLastAutoSyncedAt` | `Promise.all` inclusion | ✓ WIRED | Line 22 (in the array), line 14 (destructure), line 24 (returned). |
| `app/settings/page.tsx` | `app/api/settings/route.ts` GET | existing `/api/settings` fetch effect | ✓ WIRED | Line 50, no new fetch introduced. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `app/settings/page.tsx` "Last auto-synced" line | `lastAutoSyncedAt` state | `GET /api/settings` → `getLastAutoSyncedAt()` → `prisma.setting.findUnique` | Yes (real DB read, `null` fallback until first successful cron run) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `isValidCronAuth` fail-closed + valid cases | `npx vitest run tests/auth.test.ts` | 6/6 passed | ✓ PASS |
| Full regression suite | `npm test` | 126/126 passed | ✓ PASS |
| Build/typecheck, route registration | `npm run build` | Compiled clean; `/api/cron/sync` listed in route table | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| `vercel.json` valid JSON | Read + manual parse check | Valid, single cron entry, path matches `CRON_SYNC_PATH` | ✓ PASS |
| Vercel Cron actually firing on schedule | N/A — cannot be tested via `next dev`/`next start` | Not run | ? SKIP (routed to human verification) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventional probes found for this phase; no probes declared in PLAN/SUMMARY files. Skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SYNC-02 | 19-01, 19-03 | Daily Vercel Cron job triggers exactly 1 lesson via `MAX_LESSONS_PER_SYNC=1` | ✓ SATISFIED (code); deployment pending | `runSync` extraction + `vercel.json` + cron route all present and correct; actual daily firing needs deploy (see Truth 1/13). |
| SYNC-03 | 19-03 | Cron requests authenticate via fail-closed `CRON_SECRET` bearer inside `middleware.ts`, matcher never excludes the path | ✓ SATISFIED | Fully verified at code level via passing unit tests + source inspection; this requirement does not depend on deployment. |
| SYNC-04 | 19-02, 19-03 | Settings ▸ Advanced shows "last auto-synced" timestamp, cron-failure-masking prevented | ✓ SATISFIED | Fully verified; CR-01 blocker (failure-masking) confirmed fixed in the current file. |

**Orphaned requirements check:** `.planning/REQUIREMENTS.md` maps only SYNC-02, SYNC-03, SYNC-04 to Phase 19 — all three appear in plan frontmatter (`19-01: [SYNC-02]`, `19-02: [SYNC-04]`, `19-03: [SYNC-02, SYNC-03]`). No orphaned requirements.

### Anti-Patterns Found

None. Scanned all 10 phase-modified files (`lib/sync.ts`, `app/api/cron/sync/route.ts`, `lib/auth.ts`, `middleware.ts`, `lib/settings.ts`, `app/api/settings/route.ts`, `app/settings/page.tsx`, `vercel.json`, `tests/auth.test.ts`, `app/api/sync/route.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-implementation patterns — zero matches.

**Deferred (non-blocking, per 19-REVIEW.md, already disposed):**

- WR-01 (`lib/auth.ts:32`): non-constant-time string comparison of the bearer secret — a timing side-channel in theory. Explicitly deferred by the code review as an accepted risk given `CRON_SECRET` is high-entropy, HTTPS-only, and fixing it would require either breaking Edge-middleware compatibility (Node `crypto.timingSafeEqual`) or a hand-rolled loop. Not a blocker for this phase's goal.
- WR-02 (`lib/sync.ts` new-lesson check): no mutual exclusion between a cron-triggered and a manual sync running concurrently — a pre-existing non-atomic check-then-act race, now reachable by two independent triggers instead of one. Explicitly deferred as a design question for a future phase, not a drive-by fix.
- IN-02 (`lib/settings.ts:104`): `setLastAutoSyncedAt` has no input validation, explicitly and deliberately by design (opaque ISO string, single trusted call site) — not a defect.

### Process Anomaly (flagged, not a code gap)

The 19-03 executor subagent independently checked the phase-level ROADMAP.md checkbox and updated `.planning/STATE.md`/`.planning/REQUIREMENTS.md` as complete in commit `e59b305`, before this verification ran. Confirmed via `git show e59b305`: the edits (Phase 19 checkbox, 3/3 plans, requirement rows) are factually accurate — but marking a phase complete before verification passes is normally the orchestrator's responsibility, not the executor's. This is a process/scope-boundary anomaly worth noting for future runs; it does not itself indicate any code defect and did not bias this independent verification (all findings above were derived from direct code/test inspection, not from trusting that commit).

### Human Verification Required

1. **Complete the deployment + secret provisioning in `19-03-USER-SETUP.md`**
   **Test:** Generate `CRON_SECRET` (≥16 chars), set it as a Production env var in the Vercel Dashboard, `git push origin main` to deploy (registers `vercel.json`'s cron), then check Vercel Dashboard → Cron Jobs after the scheduled 10:00 UTC run.
   **Expected:** The job appears under Cron Jobs; its first invocation log shows `200` (not `401`); `Settings ▸ Advanced` subsequently shows a fresh "Last auto-synced" timestamp with no manual tap involved.
   **Why human:** This is the literal delivery of the phase goal ("without the user opening the app") and Roadmap Success Criterion 1. It requires human access to the Vercel Dashboard/CLI and cannot be exercised via `next dev`/`next start` (confirmed in RESEARCH as Pitfall 2, and explicitly still `Status: Incomplete` in `19-03-USER-SETUP.md`).

2. **Live UI regression: manual "Sync now" + "Last auto-synced" display**
   **Test:** `npm run build && npm start`, open Settings ▸ Advanced, trigger "Sync now," and visually confirm the response/behavior is unchanged (≤1 lesson/tap) and that the "Last auto-synced" caption renders "Never" before any cron run / a formatted local date-time after one.
   **Expected:** Identical manual-sync behavior to pre-refactor; correct fallback/formatted display in both states.
   **Why human:** Both 19-01-SUMMARY.md and 19-02-SUMMARY.md explicitly flag the live-browser portions of these checks as `human_judgment: true`, not exercised by the automated suite in this session (though 19-02's executor did perform a live curl-based API round-trip, which is a partial but not visual confirmation).

### Gaps Summary

No code-level gaps. All 13 must-have truths resolve to VERIFIED except one (the actual unattended, deployed daily cron firing), which is present, wired, unit-tested where testable, and correctly blocked only on human-only deployment steps that are already fully documented in `19-03-USER-SETUP.md`. The previously-found code-review blocker (CR-01 — timestamp stamped even when the sync accomplished nothing) is confirmed fixed and present in the current codebase at commit `c84a6df`. Two review warnings (timing-safe comparison, cron/manual race) were explicitly and reasonably deferred by the review itself and do not block phase goal achievement.

---

_Verified: 2026-07-05T08:50:02Z_
_Verifier: Claude (gsd-verifier)_
