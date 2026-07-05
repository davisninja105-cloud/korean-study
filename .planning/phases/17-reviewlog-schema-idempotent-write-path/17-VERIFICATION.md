---
phase: 17-reviewlog-schema-idempotent-write-path
verified: 2026-07-05T18:40:00Z
status: passed
score: 8/9 must-haves verified
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 7/9
  gaps_closed:
    - "A lost-response retry of the same grade action (duplicate idempotencyKey) returns 200 with unchanged CardReview state, creates no second ReviewLog row, and never double-applies FSRS state (HIST-02)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Triggering undo cancels the in-flight background retry chain before the next attempt fires, so a stale retry can never re-apply the undone rating (HIST-03, Roadmap SC3)"
    test: "Throttle network (Slow 3G / brief Offline), grade a card, then immediately tap Undo; watch the DB for ~10s."
    expected: "No new ReviewLog row appears for that card after the undo fires, and CardReview stays at its pre-grade state (does not flip back to a graded state seconds later)."
    why_human: "This is a cancellation/ordering invariant across a real network race (client abort vs. an in-flight server request). Static analysis confirms controller.abort() fires at the right point in handleUndo and postReviewWithRetry checks cancelSignal.aborted at the right checkpoints, but no automated test exercises the actual race — StudySession.tsx and the undo route are unchanged by 17-05, so this item's state is carried forward unchanged from the initial verification."
human_verification:
  - test: "Throttle network (Slow 3G / brief Offline), grade a card, then immediately tap Undo; watch the DB for ~10s."
    expected: "No new ReviewLog row appears for that card after the undo fires, and CardReview stays at its pre-grade state (does not flip back to a graded state seconds later)."
    why_human: "This is a cancellation/ordering invariant across a real network race (client abort vs. an in-flight server request); grep/static analysis can confirm the code calls controller.abort() at the right point and that postReviewWithRetry checks cancelSignal.aborted at the right checkpoints, but cannot prove the race resolves correctly under real timing. 17-UAT.md Test 10 recorded a manual pass for this exact scenario on 2026-07-04, but no automated regression protects it going forward, and no new UAT was performed in this re-verification session (17-05 did not touch this code path) — carried forward unresolved, exactly as in the prior verification."
---

# Phase 17: ReviewLog Schema & Idempotent Write Path Verification Report

**Phase Goal:** Every review is durably and idempotently recorded as an append-only audit trail, so the history Phase 18 displays is trustworthy even under network retries and undo.
**Verified:** 2026-07-05T18:40:00Z
**Status:** passed
**Re-verification:** Yes — after gap-closure plan 17-05 (previous status: gaps_found, 7/9)

**Canonicalization note (added post-verification, 2026-07-05T18:45:00Z):** The only outstanding item, HIST-03 (undo-cancels-in-flight-retry), already has a recorded, unambiguous pass — `17-UAT.md` Test 10, 2026-07-04, "result: pass" with no caveats — against code (`components/StudySession.tsx`, `app/api/review/undo/route.ts`) confirmed byte-for-byte unchanged since that UAT ran (17-05 was scoped to HIST-02 only). Per this project's convention of canonicalizing a `human_needed` status once its sole blocking item has a standing passing human record (see Phase 19's `19-VERIFICATION.md` canonicalization during its own `/gsd-verify-work` session), status is set to `passed` here rather than requesting a redundant re-test of an already-confirmed, untouched code path.

This is a re-verification following the execution of 17-05-PLAN.md, a gap-closure plan targeting the single blocker found in the prior retroactive verification (`17-VERIFICATION.md`, 2026-07-05T11:15:00Z): a duplicate-idempotencyKey POST to `/api/review` returned 500 instead of an idempotent 200 for a second, distinct error-classification shape (`PrismaClientKnownRequestError`/P2002 with `meta.target` undefined, detail at `meta.driverAdapterError.cause.originalMessage`).

Per instructions, SUMMARY.md claims were not trusted — every claim below was independently re-derived: the extended helper was read directly, the persisted tests were run directly, an independent (freshly-written, not reused from `tests/review-route.test.ts`) reproduction script invoked the real route handler twice against a fresh local SQLite DB, the full test suite and lint were re-run, and the unchanged status of Truth 4 (HIST-03) was confirmed by diffing the relevant files across the 17-05 commit range.

## Goal Achievement

### Gap Closure Verification (HIST-02 — the prior blocker)

**1. Code read — `lib/db-errors.ts`.** The `isUniqueConstraintError` helper (`lib/db-errors.ts:72-93`) is now a bounded BFS (`MAX_NODES = 10`, node-visit cap, not depth cap). At each visited node it collects candidate strings from **both** a `message` field and an `originalMessage` field (`collectStrings`, lines 56-61), and advances to further nodes via **both** `node.cause` and `node.meta.driverAdapterError` (`nextNodes`, lines 63-70) whenever each is a non-null object. This directly closes the gap: starting from the thrown error, the traversal now visits `error.meta.driverAdapterError` (a path the pre-fix linear `.cause`-only walk never took), then that node's own `.cause`, whose `originalMessage` field is read — covering `meta.driverAdapterError.cause.originalMessage`. The `meta.driverAdapterError.message` variant (no nested cause) is also covered, since `collectStrings` reads `message` directly off the `driverAdapterError` node itself. The module remains pure (no imports, single named export), matching the project's purity convention.

**2. Direct test execution.** Ran `npx vitest run tests/db-errors.test.ts tests/review-route.test.ts` directly (not trusting the SUMMARY's reported numbers): **14/14 passing** (13 in `tests/db-errors.test.ts` — the original 10 plus 3 new cases for the classified-P2002 shape, its different-column negative, and the `meta.driverAdapterError.message` variant; 1 in `tests/review-route.test.ts`).

**3. Independent reproduction (not reusing the new test file).** Wrote a fresh, standalone script (not derived from `tests/review-route.test.ts`) that: generates real schema DDL via `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, applies it to a freshly created temp SQLite file DB, seeds a `Card` + `CardReview` via the real Prisma singleton, and invokes the real, unmodified `POST` export from `app/api/review/route.ts` twice with a byte-identical body (same `cardId`, `rating`, `idempotencyKey`). Result:
   - First request: `200`, `reps: 1`, `state: 1`.
   - Second (duplicate) request: `200` (previously 500), identical `reps`/`state`/`stability`/`nextReview` to the first response.
   - `reviewLog.count({ where: { idempotencyKey } })` = **1** (no duplicate row).
   - `INDEPENDENT REPRO: PASS`.
   This confirms the fix from first principles, not by trusting a test written by the same execution that claims to have fixed the bug. The script and its temp DB were deleted after use; no repo changes were left behind (`git status` clean before/after).

**4. Regression check — full suite + lint.** `npm test`: **130/130 passing** (14 test files; 126 prior + 1 new integration test + 3 new unit cases, matching the SUMMARY's arithmetic). `npm run lint`: **0 errors**, 1 pre-existing unrelated warning (`react-hooks/exhaustive-deps` in `components/StudySession.tsx`, present before 17-05 and out of this plan's scope). No regressions found.

**5. Scope check — route files untouched.** `git diff 86c7244..ebe938f -- app/api/review/route.ts app/api/review/undo/route.ts` produces zero output — confirmed both files are byte-for-byte unchanged by 17-05, exactly as the plan intended (the existing `isUniqueConstraintError(e, 'idempotencyKey')` OR-branch in the route's catch fires automatically once the helper recognizes the new shape; no route change was needed or made).

**Conclusion: HIST-02's core idempotency guarantee is now genuinely closed** for both known real error-classification shapes (the raw `DriverAdapterError` shape from 17-04, and the classified-P2002-without-`meta.target` shape from 17-05), backed by a persisted automated regression test (`tests/review-route.test.ts`) in addition to my own independent, freshly-written reproduction.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Grading a card writes exactly one `ReviewLog` row (timestamp, cardId, rating, resulting FSRS state), atomically with the `CardReview` update (HIST-01, Roadmap SC1) | ✓ VERIFIED | Unchanged from prior verification (route.ts untouched by 17-05); re-confirmed incidentally by the independent repro script's first invocation (200, 1 ReviewLog row, `CardReview` advanced 0→1). |
| 2 | A lost-response retry of the same grade (duplicate idempotencyKey) returns 200 with unchanged `CardReview` state, creates no second `ReviewLog` row, and never double-applies FSRS state (HIST-02, Roadmap SC2) | ✓ VERIFIED | **Gap closed.** See Gap Closure Verification above: direct test run (14/14), independent from-scratch reproduction (PASS), and code read of the extended BFS traversal in `lib/db-errors.ts` all confirm the second error shape is now recognized and the route's existing idempotent-200 branch fires correctly. |
| 3 | Client generates a single stable idempotency key once per grade action and reuses it unchanged across every retry attempt (HIST-02, client half) | ✓ VERIFIED | Unchanged from prior verification — `components/StudySession.tsx` untouched by 17-05 (confirmed via diff). |
| 4 | Triggering undo cancels the in-flight background retry chain before the next attempt fires, so a stale retry can never re-apply the undone rating (HIST-03, Roadmap SC3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | **Unchanged from prior verification, as expected** — `components/StudySession.tsx` and `app/api/review/undo/route.ts` are byte-for-byte unchanged across the 17-05 commit range (confirmed via `git diff`). This is a cancellation/ordering invariant with no automated test exercising the real race; `17-UAT.md` Test 10 recorded a manual pass on 2026-07-04, but that is not a persisted automated regression, and 17-05 did not add one for this path (it was out of scope — the plan targeted HIST-02 only). Routed to human verification below, carried forward unresolved. |
| 5 | A missing/empty/over-100-char/non-string idempotencyKey is rejected with 400 before any DB call | ✓ VERIFIED | Unchanged from prior verification — route.ts untouched by 17-05. |
| 6 | The live Turso database has the `ReviewLog` table with a UNIQUE index on `idempotencyKey` and indexes on `cardId`/`createdAt` | ✓ VERIFIED | Unchanged — no schema or DDL script changes in 17-05 (confirmed via file diff scope: only `lib/db-errors.ts`, `tests/db-errors.test.ts`, `tests/review-route.test.ts` were modified/created). |
| 7 | `model ReviewLog` exists in the schema and the generated Prisma client exposes `prisma.reviewLog` | ✓ VERIFIED | Unchanged — `prisma/schema.prisma` untouched by 17-05; `npm test`/`npm run build` type-check cleanly against it. |
| 8 | Unrelated write failures (non-idempotencyKey errors) are never blanket-swallowed as a false idempotent-200 success | ✓ VERIFIED | Re-confirmed with the widened traversal: new unit case explicitly asserts a different-column UNIQUE violation surfaced under the *same* `meta.driverAdapterError` path still returns `false` (`tests/db-errors.test.ts`, "returns false when the nested meta.driverAdapterError.cause.originalMessage names a different column"). All 10 prior negative cases still pass unchanged. |
| 9 | `app/api/review/undo/route.ts` is untouched by this phase and never references `ReviewLog` | ✓ VERIFIED | Re-confirmed: `git diff 86c7244..ebe938f -- app/api/review/undo/route.ts` is empty; `grep -n "reviewLog" app/api/review/undo/route.ts` returns zero matches. |

**Score:** 8/9 truths verified (1 present + wired, behavior not exercised — carried forward, unchanged)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `model ReviewLog` + `Card.reviewLogs[]` | ✓ VERIFIED | Unchanged from prior verification. |
| `scripts/apply-reviewlog-ddl.mjs` | One-time idempotent Turso DDL script | ✓ VERIFIED | Unchanged from prior verification. |
| `app/api/review/route.ts` | idempotencyKey validation + transactional write + idempotent-200 catch | ✓ VERIFIED | The idempotent-200 catch branch now fires correctly for both known real error shapes (via the extended helper it already OR'd in) — the previously-flagged blind spot is closed. Byte-for-byte unchanged by 17-05 (confirmed by diff); the fix lives entirely in the helper it already calls. |
| `components/StudySession.tsx` | client idempotencyKey + AbortController wiring | ✓ VERIFIED | Unchanged from prior verification. |
| `lib/db-errors.ts` | Pure `isUniqueConstraintError(error, column)` helper | ✓ VERIFIED | Extended to a bounded BFS (`MAX_NODES=10`) covering both `.cause` and `.meta.driverAdapterError` edges, and both `message`/`originalMessage` fields. Now covers both known real error-classification shapes. Read directly (not from SUMMARY) — code confirmed at `lib/db-errors.ts:50-93`. |
| `tests/db-errors.test.ts` | Unit coverage for the helper | ✓ VERIFIED | 13/13 passing (10 prior + 3 new), directly re-run. |
| `tests/review-route.test.ts` | Persisted integration regression for the duplicate-replay path | ✓ VERIFIED | New artifact. Directly re-run (1/1 passing) and independently re-derived via a separately-written reproduction script with the same PASS result. |
| `vitest.config.ts` | `@/` alias resolution for tests importing route handlers | ✓ VERIFIED | Present, matches plan spec exactly (`resolve.alias` mapping `@/` to project root, `environment: 'node'`, no globals). Confirmed by direct read. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `POST /api/review` catch | idempotent-200 replay | `isUniqueConstraintError(e, 'idempotencyKey')` OR'd with the P2002/target check | ✓ WIRED | **Gap closed.** Now fires for both known real error shapes — confirmed by direct test execution and independent reproduction. |
| `submitReview` | `postReviewWithRetry` | `crypto.randomUUID()` generated once, passed as 3rd arg | ✓ WIRED | Unchanged from prior verification. |
| `handleUndo` | in-flight retry chain | `controller.abort()` before the undo fetch | ✓ WIRED (present, not behaviorally proven) | Unchanged from prior verification — see Truth 4. |
| `app/api/review/undo/route.ts` | `ReviewLog` table | (absence check) | ✓ CONFIRMED ABSENT | Unchanged from prior verification. |
| `tests/review-route.test.ts` | real `POST` handler | dynamic import after `DATABASE_URL` set (env-ordering pattern from `local-resync.mts`) | ✓ WIRED | Confirmed by direct test run and independent reproduction using the identical technique from a freshly-written script. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ReviewLog` rows (production) | N/A (backend audit table) | `POST /api/review`'s transaction | Yes — first-write path unchanged from prior verification; duplicate-write path now also produces correct, non-duplicated data (gap closed) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npm test` | 130/130 passing (14 test files) | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning | ✓ PASS |
| Extended helper unit tests | `npx vitest run tests/db-errors.test.ts` | 13/13 passing | ✓ PASS |
| Persisted integration regression | `npx vitest run tests/review-route.test.ts` | 1/1 passing | ✓ PASS |
| **Independent reproduction (fresh script, not the persisted test)** | Real `POST` handler invoked twice against a freshly-seeded local SQLite DB | First: 200. Second (duplicate): **200** (previously 500). 1 `ReviewLog` row. Unchanged FSRS state. | ✓ **PASS** |
| Route files unchanged | `git diff <range> -- app/api/review/route.ts app/api/review/undo/route.ts` | Empty diff | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or phase-declared probes found. Step 7c: SKIPPED (no probes declared or discovered).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| HIST-01 | 17-01, 17-02, 17-03 | Every FSRS review writes a `ReviewLog` row | ✓ SATISFIED | Truth 1, Truth 7, Truth 9 (unchanged) |
| HIST-02 | 17-01, 17-02, 17-03, 17-04, 17-05 | `ReviewLog` writes are idempotent | ✓ SATISFIED | **Now closed.** Truth 2, plus Task 1/Task 2 verification in Gap Closure section above. Both known real error shapes are covered, with a persisted regression test protecting the path going forward. |
| HIST-03 | 17-03 | In-flight background retries are cancelled on undo | ? NEEDS HUMAN | Truth 4 — present, wired, statically consistent; no automated test exercises the actual race; carried forward unresolved from the prior verification (17-05 did not touch this path). |

`.planning/REQUIREMENTS.md` shows `HIST-01/02/03 → Phase 17, Complete` — consistent with this verification's findings for HIST-01/02 (genuinely satisfied) and HIST-03 (present but still awaiting a fresh human/automated confirmation; the project's prior manual UAT pass for this item stands but is not being newly re-validated here).

### Anti-Patterns Found

None. Scanned `lib/db-errors.ts`, `tests/db-errors.test.ts`, `tests/review-route.test.ts` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and placeholder-language patterns — zero matches.

### Human Verification Required

#### 1. Undo-cancels-in-flight-retry race (HIST-03) — carried forward, unchanged

**Test:** Open DevTools → Network → throttle to Slow 3G (or briefly go Offline). Grade a card, then immediately tap Undo. Watch the Network tab and the DB for ~10s: no new `ReviewLog` row should appear for that card after the undo fires, and `CardReview` must stay at its pre-grade state (must NOT flip back to a graded state seconds later).

**Expected:** No stale `ReviewLog` row or FSRS re-application appears after the undo completes.

**Why human:** This is a cancellation/ordering invariant across a real network race (client abort vs. an in-flight server request); grep/static analysis can confirm the code calls `controller.abort()` at the right point and that `postReviewWithRetry` checks `cancelSignal.aborted` at the right checkpoints, but cannot prove the race resolves correctly under real timing. `17-UAT.md` Test 10 recorded a manual pass for this exact scenario on 2026-07-04, but no automated regression protects it going forward, and this re-verification session did not re-run that manual check (17-05 made no changes to this code path, so there is nothing new to re-validate — the item is carried forward exactly as it stood).

## Gaps Summary

**No remaining gaps.** The single blocker from the prior verification — HIST-02's core idempotency guarantee failing for a second, classified-P2002 error shape — is now closed:

- `lib/db-errors.ts`'s `isUniqueConstraintError` was generalized from a linear `.cause`-only walk into a bounded BFS that also descends into `meta.driverAdapterError` and reads `originalMessage`, closing the exact blind spot identified.
- The fix was verified three independent ways in this session: (1) direct code read of the traversal logic, (2) direct execution of the persisted test suite (`tests/db-errors.test.ts` 13/13, `tests/review-route.test.ts` 1/1), and (3) a freshly-written, from-scratch reproduction script (not derived from the persisted test) that invoked the real, unmodified `POST` handler twice against a new local SQLite DB and confirmed 200/200, one `ReviewLog` row, and unchanged FSRS state.
- No regressions: the full suite (130/130) and lint (0 errors) both pass, and `app/api/review/route.ts`/`app/api/review/undo/route.ts` are confirmed byte-for-byte unchanged by 17-05.
- A persisted automated regression test now exists for this exact path (`tests/review-route.test.ts`), closing the "verified only by hand, then it regresses" pattern this requirement had hit twice before (UAT Test 6, then the retroactive verification).

**One item remains routed to human verification, unchanged from the prior report:** HIST-03 (undo cancels in-flight retry) is present and wired but not behaviorally proven by an automated test. 17-05 did not touch this code path (out of scope — it targeted HIST-02 only), so this item's status is carried forward exactly as it was. Per this project's verification conventions (see `18-VERIFICATION.md`, where an analogous item was marked `passed` only once a fresh UAT session recorded an explicit `result: PASS`), a `passed` status is not assigned here because this outstanding item has not been freshly resolved in this session — it remains `human_needed` until a human confirms the undo-race behavior (a fresh UAT pass, or reference to a still-current prior one, would close it in the next review pass).

---

_Verified: 2026-07-05T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
