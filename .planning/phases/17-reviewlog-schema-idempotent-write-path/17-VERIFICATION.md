---
phase: 17-reviewlog-schema-idempotent-write-path
verified: 2026-07-05T11:15:00Z
status: gaps_found
score: 7/9 must-haves verified
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "A lost-response retry of the same grade action (duplicate idempotencyKey) returns 200 with unchanged CardReview state, creates no second ReviewLog row, and never double-applies FSRS state (HIST-02)"
    status: failed
    reason: >
      Direct behavioral reproduction against the actual, unmodified `POST` handler exported from
      `app/api/review/route.ts` (imported and invoked twice with a byte-identical body against a
      freshly-seeded local SQLite database — a documented, supported `DATABASE_URL=file:...` mode
      per CLAUDE.md, using the same Prisma 7.6.0 + `@prisma/adapter-libsql` stack the app ships with)
      shows the SECOND (duplicate-idempotencyKey) request returns 500 `{"error":"Failed to record
      review"}`, not the intended idempotent 200. This is a newly-discovered manifestation, distinct
      from the one 17-04 fixed: Prisma classifies the collision as
      `Prisma.PrismaClientKnownRequestError` with `code: 'P2002'`, but `e.meta.target` is `undefined`
      in this shape (only `meta.modelName` and `meta.driverAdapterError` are populated) — so the
      route's existing `(e.meta?.target as string[] | undefined)?.includes('idempotencyKey')`
      sub-condition never matches. `isUniqueConstraintError` (added in 17-04) also misses it: the
      helper only walks `error` → `error.cause` → ... (bounded 5 levels), but the informative message
      in this shape lives at `e.meta.driverAdapterError.cause.originalMessage`
      (`"SQLITE_CONSTRAINT: UNIQUE constraint failed: ReviewLog.idempotencyKey"`) — a path the helper
      never visits because it never descends into `.meta`. Net effect: neither branch of the widened
      OR condition fires, and the request falls through to the generic 500 handler — reproducing the
      exact class of bug HIST-02 (and the Phase 17 UAT Test 6 gap-closure) was meant to eliminate,
      for at least one real, reproducible error-classification shape of the identical underlying
      SQLite UNIQUE-constraint violation. 17-04's own live reproduction (documented in its SUMMARY)
      was run against the real dev Turso (`libsql://`) database and reportedly got 200/200 — so the
      specific raw-unclassified-`DriverAdapterError` shape observed there does appear to be covered.
      But the fix is not comprehensive: it does not generalize to this second, independently
      reproducible shape, which occurs with the identical code against a local SQLite file DB (and
      has no automated regression test protecting against it either way).
    severity: blocker
    artifacts:
      - path: "lib/db-errors.ts"
        issue: "isUniqueConstraintError only walks the error's own .cause chain; it never inspects e.meta.driverAdapterError.cause.originalMessage, which is where Prisma 7 + @prisma/adapter-libsql puts the SQLite constraint detail when it DOES classify the error as P2002 (as opposed to the raw-unclassified shape the debug session diagnosed)."
      - path: "app/api/review/route.ts"
        issue: "The forward-compatibility P2002 sub-condition (`e.meta?.target?.includes('idempotencyKey')`) is dead code for this Prisma version/shape: `e.meta.target` is never populated for a P2002 raised from inside this interactive transaction — only `e.meta.modelName` and `e.meta.driverAdapterError` are set."
    missing:
      - "Extend the detection logic (e.g. isUniqueConstraintError or a sibling helper) to also inspect e.meta?.driverAdapterError?.cause?.originalMessage (and/or e.meta?.modelName === 'ReviewLog' as a corroborating signal) so a classified P2002-without-target collision is also recognized as the idempotent-replay case."
      - "Add a persisted automated regression test (e.g. tests/review-route.test.ts, using a local SQLite file DB and the exported POST handler directly, the same technique used to discover this gap) that asserts a duplicate-idempotencyKey POST returns 200, not 500 — closing the current zero-automated-coverage gap for this entire code path."
      - "Re-run the fix against both the local-file shape (now failing) and the original remote-Turso raw shape (17-04's fixture) to confirm both are covered before considering HIST-02 closed."
---

# Phase 17: ReviewLog Schema & Idempotent Write Path Verification Report

**Phase Goal:** Every review is durably and idempotently recorded as an append-only audit trail, so the history Phase 18 displays is trustworthy even under network retries and undo.
**Verified:** 2026-07-05T11:15:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification (retroactive backfill; no prior VERIFICATION.md existed for this phase)

This is a retroactive/backfill verification (Phase 17 was executed and its 4 plans + gap-closure plan completed on 2026-07-04, but no VERIFICATION.md was generated at the time). All claims below are independently checked against the current codebase and, where possible, against direct behavioral reproduction — not taken from SUMMARY.md or UAT.md narrative.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Grading a card writes exactly one `ReviewLog` row (timestamp, cardId, rating, resulting FSRS state), atomically with the `CardReview` update (HIST-01, Roadmap SC1) | ✓ VERIFIED | Behavioral test: imported the real, unmodified `POST` export from `app/api/review/route.ts`, seeded a local SQLite DB with a `Card` + `CardReview`, invoked it once. Result: 200, `CardReview.reps` 0→1, `CardReview.state` 0→1, and exactly 1 `ReviewLog` row exists for that card afterward with matching `rating`/FSRS fields. Confirms the interactive transaction's `tx.reviewLog.create({ data: { cardId, rating, idempotencyKey, ...updated } })` (route.ts:101) actually persists a correct row in the same commit as the `CardReview` update. |
| 2 | A lost-response retry of the same grade (duplicate idempotencyKey) returns 200 with unchanged `CardReview` state, creates no second `ReviewLog` row, and never double-applies FSRS state (HIST-02, Roadmap SC2 — the core write-path guarantee, and the exact scenario 17-04 was a gap-closure plan for) | ✗ FAILED | See `gaps` above. Direct reproduction using the real, current `POST` handler against a local SQLite DB: first request 200 (1 row), byte-identical second request → **500**, not 200. Root cause is a second, independently-discovered blind spot in the `isUniqueConstraintError`/P2002 OR condition (route.ts:149-154) distinct from the one 17-04 closed. |
| 3 | Client generates a single stable idempotency key once per grade action and reuses it unchanged across every retry attempt (HIST-02, client half) | ✓ VERIFIED | `components/StudySession.tsx:557-558` — `crypto.randomUUID()` + `new AbortController()` are generated exactly once in `submitReview`'s event-handler flow (not render/`useMemo` — purity-safe), immediately before `undoRef.current` is set; `postReviewWithRetry(cardId, rating, idempotencyKey, controller.signal, onExhausted)` (line 568) passes the same key through the whole 3-attempt retry loop (line 112-164) — the key is never regenerated inside the loop. `npm run build` type-checks the 5-arg signature. |
| 4 | Triggering undo cancels the in-flight background retry chain before the next attempt fires, so a stale retry can never re-apply the undone rating (HIST-03, Roadmap SC3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code present and internally consistent: `handleUndo` (StudySession.tsx:617-624) destructures `controller` from `undoRef.current` and calls `controller.abort()` immediately after nulling the ref and before the `/api/review/undo` fetch; `postReviewWithRetry` checks `cancelSignal.aborted` at loop-top (122), in the catch after a deliberate abort (147), and after each backoff wait (160), and only calls `onExhausted` when not aborted (163). This is a cancellation/ordering invariant — no automated test in `tests/` exercises the React component's actual undo-during-retry race (there is no `StudySession` test file). `17-UAT.md` Test 10 recorded a manual "pass" for this exact scenario at the time (2026-07-04), but that is a self-reported UAT result, not a persisted automated regression — routed to human verification below rather than counted as VERIFIED. |
| 5 | A missing/empty/over-100-char/non-string idempotencyKey is rejected with 400 before any DB call | ✓ VERIFIED | Behavioral test: invoked the real `POST` handler with 4 malformed bodies (missing, empty string, 101-char string, numeric `123`) — all four returned 400 before any DB access, matching route.ts:59-64. |
| 6 | The live Turso database has the `ReviewLog` table with a UNIQUE index on `idempotencyKey` and indexes on `cardId`/`createdAt` (schema foundation for HIST-02) | ✓ VERIFIED | `scripts/apply-reviewlog-ddl.mjs` contains exactly one `CREATE TABLE IF NOT EXISTS "ReviewLog"` (correct column set, `FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE`) plus the three documented indexes. This verification did not re-run the DDL against production (a write action outside a read-only verification's scope, and blocked by sandbox policy when attempted). Independent corroboration exists from a different phase's verification: `18-VERIFICATION.md`'s Data-Flow Trace live-curled `/history` and received real `ReviewLog`-sourced rows (`cardFront`, `gradeName`, `mastery`) from production Turso — i.e., the live `ReviewLog` table demonstrably holds and serves real data in production, independently of this phase's own claims. |
| 7 | `model ReviewLog` exists in the schema (unique `idempotencyKey`, non-unique `cardId`, `Card.reviewLogs[]` reverse relation) and the generated Prisma client exposes `prisma.reviewLog` | ✓ VERIFIED | `prisma/schema.prisma:100-120` — exact shape confirmed (idempotencyKey `@unique`, cardId plain `String`, `@@index([cardId])`, `@@index([createdAt])`); `Card.reviewLogs ReviewLog[]` present at line 51. `npm run build` (`prisma generate && next build`) succeeds cleanly, type-checking every `prisma.reviewLog` call site in `app/api/review/route.ts`. |
| 8 | Unrelated write failures (non-idempotencyKey errors) are never blanket-swallowed as a false idempotent-200 success | ✓ VERIFIED | `npx vitest run tests/db-errors.test.ts` — 10/10 passing, including the negative cases (different-column UNIQUE violation, generic error, `SQLITE_BUSY`, null/undefined/non-object/message-less all return `false`). Behavioral test: a request for a genuinely nonexistent `cardId` correctly returned 404 (the pre-existing not-found path), not a false 200 — confirming the widened catch doesn't over-match. |
| 9 | `app/api/review/undo/route.ts` is untouched by this phase and never references `ReviewLog` (undo never mutates the audit trail) | ✓ VERIFIED | `git log --oneline -- app/api/review/undo/route.ts` shows no commits since `4c39c54` (pre-Phase-17). `grep -n "reviewLog" app/api/review/undo/route.ts` returns zero matches. |

**Score:** 7/9 truths verified (1 failed — blocker; 1 present + wired, behavior not exercised)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `model ReviewLog` + `Card.reviewLogs[]` | ✓ VERIFIED | Present exactly as specified by 17-01-PLAN.md |
| `scripts/apply-reviewlog-ddl.mjs` | One-time idempotent Turso DDL script | ✓ VERIFIED | Exactly one `CREATE TABLE`, correct indexes/FK, redacted connection-string logging (IN-01 fix present) |
| `app/api/review/route.ts` | idempotencyKey validation + transactional write + idempotent-200 catch | ⚠️ PARTIAL | Validation, atomic interactive transaction, and CR-01 optimistic-concurrency guard all present and correct. The idempotent-200 catch branch (P2002-target OR `isUniqueConstraintError`) is present and wired, but does not catch every real error shape of the duplicate-key collision — see Truth 2 / Gaps. |
| `components/StudySession.tsx` | client idempotencyKey + AbortController wiring | ✓ VERIFIED | `crypto.randomUUID()`, `AbortController`, cancel-signal forwarding, `controller.abort()` in `handleUndo` all present exactly as planned |
| `lib/db-errors.ts` | Pure `isUniqueConstraintError(error, column)` helper | ⚠️ PARTIAL | Exists, pure, unit-tested (10/10 passing) for the shapes it was designed against; does not cover the `e.meta.driverAdapterError.cause` shape discovered in this verification — see Gaps |
| `tests/db-errors.test.ts` | Unit coverage for the helper | ✓ VERIFIED (as scoped) | 10 cases pass; does not include a case for the classified-P2002-without-target shape (a test-coverage gap, not just an implementation gap) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `submitReview` | `postReviewWithRetry` | `crypto.randomUUID()` generated once, passed as 3rd arg | ✓ WIRED | Confirmed at StudySession.tsx:557-568 |
| `handleUndo` | in-flight retry chain | `controller.abort()` before the undo fetch | ✓ WIRED | Confirmed at StudySession.tsx:622-624 |
| `POST /api/review` catch | idempotent-200 replay | `isUniqueConstraintError(e, 'idempotencyKey')` OR'd with the P2002/target check | ⚠️ PARTIAL | Wired and fires for the specific shapes it recognizes (confirmed via unit test + the original UAT-Test-6 fixture), but does NOT fire for a second, independently reproduced real error shape (classified P2002 with `meta.driverAdapterError` but no `meta.target`) — see Truth 2 |
| `app/api/review/undo/route.ts` | `ReviewLog` table | (absence check) | ✓ CONFIRMED ABSENT | Zero references — append-only guarantee holds structurally |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `ReviewLog` rows (production) | N/A (backend audit table, no direct UI in this phase) | `POST /api/review`'s transaction | Yes — independently confirmed via `18-VERIFICATION.md`'s live curl of `/history`, which returned real production `ReviewLog`-derived rows (`cardFront`, `gradeName`, `mastery`) | ✓ FLOWING (for the first-write path; see Truth 2 for the duplicate-write path, which is broken) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npm test` | 126/126 passing (13 test files) | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx` exhaustive-deps) | ✓ PASS |
| Build | `npm run build` | Succeeds; `/api/review` registered, Prisma client regenerated and type-checks cleanly | ✓ PASS |
| `isUniqueConstraintError` unit tests | `npx vitest run tests/db-errors.test.ts` | 10/10 passing | ✓ PASS |
| First-grade write (HIST-01) | Direct invocation of the real `POST` handler against a seeded local SQLite DB | 200, 1 `ReviewLog` row, `CardReview` advanced correctly | ✓ PASS |
| idempotencyKey validation (4 malformed bodies) | Direct invocation of the real `POST` handler | All 4 → 400 before any DB call | ✓ PASS |
| Unrelated error not swallowed | Direct invocation with a nonexistent `cardId` | 404 (correct — not a false 200) | ✓ PASS |
| **Duplicate idempotencyKey retry (HIST-02 core guarantee)** | Direct invocation of the real `POST` handler twice with a byte-identical body against a seeded local SQLite DB | First: 200. **Second (duplicate): 500** `{"error":"Failed to record review"}` — expected 200 | ✗ **FAIL** |

### Probe Execution

No `scripts/*/tests/probe-*.sh` convention or phase-declared probes found in the PLAN/SUMMARY files for this phase. Step 7c: SKIPPED (no probes declared or discovered).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| HIST-01 | 17-01, 17-02, 17-03 | Every FSRS review writes a `ReviewLog` row (timestamp, cardId, rating, resulting FSRS state) | ✓ SATISFIED | Truth 1, Truth 7, Truth 9 |
| HIST-02 | 17-01, 17-02, 17-03, 17-04 | `ReviewLog` writes are idempotent — a client-generated idempotency key + a single transaction ensures a lost-response retry never produces a duplicate row or double-applies FSRS state | ✗ **BLOCKED** | Truth 2 (core guarantee still reproducibly broken for one real error shape) — client half (Truth 3), validation (Truth 5), and non-swallowing (Truth 8) are all satisfied, but the requirement's central claim is not |
| HIST-03 | 17-03 | In-flight background retries are cancelled when the user triggers undo, preventing a stale retry from silently re-applying a rating after undo | ? NEEDS HUMAN | Truth 4 — present, wired, statically consistent; no automated test exercises the actual race; prior UAT recorded a manual pass |

No orphaned requirements: `.planning/REQUIREMENTS.md`'s Phase-17 mapping (`HIST-01..03 → Phase 17, Complete`) matches exactly the union of `requirements:` fields declared across all four PLAN frontmatters (17-01: HIST-01/02; 17-02: HIST-01/02; 17-03: HIST-01/02/03; 17-04: HIST-02).

### Anti-Patterns Found

None. Scanned all phase-touched files (`prisma/schema.prisma`, `scripts/apply-reviewlog-ddl.mjs`, `app/api/review/route.ts`, `components/StudySession.tsx`, `lib/db-errors.ts`, `tests/db-errors.test.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and placeholder-language patterns — zero matches. No debt markers found.

### Human Verification Required

#### 1. Undo-cancels-in-flight-retry race (HIST-03)

**Test:** Open DevTools → Network → throttle to Slow 3G (or briefly go Offline). Grade a card, then immediately tap Undo. Watch the Network tab and the DB for ~10s: no new `ReviewLog` row should appear for that card after the undo fires, and `CardReview` must stay at its pre-grade state (must NOT flip back to a graded state seconds later).

**Expected:** No stale `ReviewLog` row or FSRS re-application appears after the undo completes.

**Why human:** This is a cancellation/ordering invariant across a real network race (client abort vs. an in-flight server request); grep/static analysis can confirm the code calls `controller.abort()` at the right point and that `postReviewWithRetry` checks `cancelSignal.aborted` at the right checkpoints, but cannot prove the race resolves correctly under real timing. `17-UAT.md` Test 10 recorded a manual pass for this exact scenario on 2026-07-04, but no automated regression protects it going forward.

## Gaps Summary

**One blocking gap: HIST-02's core idempotency guarantee is not fully closed.** Phase 17 already went through one gap-closure round (17-04) for this exact requirement after end-of-phase UAT (Test 6) found that a duplicate-idempotencyKey POST returned 500 instead of an idempotent 200 — root-caused to a raw, unclassified `DriverAdapterError` from `@prisma/adapter-libsql` inside an interactive transaction, and "fixed" by adding `lib/db-errors.ts`'s `isUniqueConstraintError()`, OR'd into the route's existing P2002 catch.

That specific fix is genuinely present in the codebase, is unit-tested for the fixture shape from the original debug session, and (per 17-04's own live reproduction against the real dev Turso database) appears to correctly handle the raw-unclassified-error shape it targeted.

However, independently reproducing the exact same "duplicate idempotencyKey" scenario during this verification — by directly invoking the real, current, unmodified `POST` export from `app/api/review/route.ts` against a freshly-seeded local SQLite database (a documented, supported `DATABASE_URL=file:...` mode) — surfaced a **second, distinct error shape that neither the P2002/`meta.target` check nor `isUniqueConstraintError` recognizes**: Prisma classifies the collision as `PrismaClientKnownRequestError`/P2002, but `e.meta.target` is `undefined` (only `meta.modelName` and `meta.driverAdapterError` are populated — a shape apparently not anticipated by the 17-04 fix), and the informative constraint detail lives at `e.meta.driverAdapterError.cause.originalMessage`, a path `isUniqueConstraintError`'s error-chain walk never visits (it only follows `error.cause`, not `error.meta.*.cause`). The result: the exact production code, run twice with a byte-identical body, returns 500 on the second (duplicate) request — reproducing the class of bug HIST-02 exists to eliminate.

This means the phase's core deliverable — "a lost-response retry never produces a duplicate row or double-applies FSRS state" — is not reliably true across all the error-classification shapes this exact Prisma/adapter version can produce for the identical underlying SQLite UNIQUE-constraint violation, and there is still zero persisted automated regression test covering any of this (both the original UAT-Test-6 scenario and the one found here were verified via ephemeral, uncommitted scripts, not tests that remain in the repo to catch a future regression).

**Recommended next step:** A follow-up gap-closure plan (e.g. 17-05) that (a) extends the detection helper to also inspect `e.meta?.driverAdapterError?.cause?.originalMessage`, and (b) adds a persisted `tests/review-route.test.ts`-style regression test (using a local SQLite DB + the exported route handler, the same technique used to find this gap) so this exact class of bug has automated coverage going forward, closing the "verified only by hand, then it regresses" pattern this phase has now hit twice.

Truths 1, 3, 5, 6, 7, 8, 9 are genuinely and directly verified. Truth 4 (HIST-03) is present and wired but not behaviorally proven by an automated test — routed to human verification, consistent with its prior UAT-passed status. This phase should not be considered closed for milestone-completion purposes until the HIST-02 gap above is resolved.

---

_Verified: 2026-07-05T11:15:00Z_
_Verifier: Claude (gsd-verifier)_
