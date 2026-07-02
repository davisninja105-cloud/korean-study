---
phase: 13-review-api-hardening-save-reliability
verified: 2026-07-02T06:30:00Z
status: human_needed
score: 4/5 must-haves verified
behavior_unverified: 1 # Count of ⚠️ PRESENT_BEHAVIOR_UNVERIFIED truths (present + wired, behavior not exercised); each is detailed in behavior_unverified_items below (and in human_verification when status is human_needed)
overrides_applied: 0
behavior_unverified_items:
  - truth: "After undoing a review, the previous card reappears with the queue, seen-card set, and session stats all restored consistently — an interrupted undo never leaves partially-restored state (REVIEW-05 / SC5)."
    test: "Unmount the StudySession component between the `await fetch('/api/review/undo')` resolving and the restoration block (line 596+). Concretely: trigger an undo, then force-unmount the component (e.g. navigate away / session-key change) before the undo fetch resolves, then re-mount and inspect seenCardIdsRef + queue/stats coherence."
    expected: "No partially-restored state: seenCardIdsRef.current is NOT mutated, no stale setState calls fire, and on re-mount the queue/stats/seen-count are coherent (not half-restored). The `if (!isMountedRef.current) return` guard at line 596 is the structural guarantee."
    why_human: "This is a cancellation/cleanup invariant (behavior-dependent). The Task 3 live checkpoint verified undo-during-flux (consistency after grade→undo), but did NOT exercise the unmount-mid-undo path specifically. The mount guard is structurally present and correctly placed before the seenCardIdsRef write (line 600), but grep cannot prove React's unmount lifecycle reliably sets isMountedRef.current=false before the async callback fires — a runtime check is needed to close the invariant."
human_verification:
  - test: "Verify the save-failure toast appears (or the retry loop terminates) under a HUNG-connection scenario — server accepts the TCP connection but never responds (paused serverless instance / hung libSQL). DevTools → Network → throttle to a hung backend or block response mid-flight, then grade a card."
    expected: "Either (a) the retry loop terminates within a bounded time and the 'Couldn't save your last review' toast appears, OR (b) the developer confirms this edge case is acceptable for a single-tenant app. If neither holds, add an AbortController timeout (~8s per attempt) to postReviewWithRetry so a hung fetch aborts and the loop advances to onExhausted."
    why_human: "postReviewWithRetry (components/StudySession.tsx:110-132) has NO fetch timeout/AbortController. If `await fetch(...)` never resolves AND never rejects (hung server), the for-loop never advances, onExhausted is never called, and the toast NEVER appears — defeating REVIEW-04's guarantee under exactly the flaky-network condition it targets. The Task 3 checkpoint tested the offline=reject path (fetch rejects immediately → loop advances → toast), NOT the hung-fetch path. This is 13-REVIEW.md WR-04 issue 2."
  - test: "Verify unmount-during-undo leaves no partially-restored state (REVIEW-05 cleanup invariant)."
    expected: "seenCardIdsRef.current is not mutated post-unmount; no stale setters fire; queue/stats/seen-count are coherent on re-mount. The `if (!isMountedRef.current) return` guard at components/StudySession.tsx:596 is the structural guarantee."
    why_human: "Cleanup invariant — see behavior_unverified_items above. Task 3 verified undo-during-flux consistency, not the unmount-mid-undo path. The mount guard is structurally sound (present, precedes the ref write at line 600, isMountedRef effect sets false on unmount at lines 212-215), but the specific unmount-mid-undo runtime path was not exercised."
---

# Phase 13: Review API Hardening & Save Reliability Verification Report

**Phase Goal:** Recording a review and editing a card never fail silently or corrupt session state — every failure path returns a clear response, and the client recovers gracefully instead of losing data.
**Verified:** 2026-07-02T06:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A database error during a review returns a structured error response instead of throwing an unhandled 500 (`/api/review` is wrapped in try/catch) — REVIEW-01 | ✓ VERIFIED | `app/api/review/route.ts`: `try {` at line 30 wraps `prisma.cardReview.findUnique` (31), `reviewCard(...)` (36), and `prisma.cardReview.update` (38); `catch (e)` at line 44 `console.error`s server-side and returns `{ error: 'Failed to record review' }` with `status: 500` (46-49). All three throwing Prisma/FSRS calls are inside the catch; the client message is generic (no schema leak). Not a cleanup/ordering invariant — structural proof is sufficient. |
| 2 | Posting a rating outside `[1,2,3,4]` (e.g. 0 or 99) is rejected with a 400 and never reaches `reviewCard()` — REVIEW-02 | ✓ VERIFIED | `app/api/review/route.ts`: rating guard at lines 14-24 (`typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 4` → 400 'rating must be one of 1, 2, 3, 4') runs BEFORE the try block (30), `findUnique` (31), and `reviewCard(...)` (36). `rating=0` → `0 < 1` → 400; `rating=99` → `99 > 4` → 400. Control-flow ordering is grep-verifiable by line number. |
| 3 | Editing a card's front to a value that normalizes to another card's front shows a clear "this front already exists" message (400), not a generic uncaught server error — REVIEW-03 | ✓ VERIFIED | `app/api/cards/[id]/route.ts`: `import { Prisma }` at line 4; catch at line 55 checks `e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'` (60) and returns 400 with `'This front already exists (as a different variant of another card)'` (61-64) BEFORE the retained generic `status: 500` fallback (66-67). P2002 is the only `@unique` reachable from the PUT try-block (`Card.normalizedFront`), so the message is never misattributed (confirmed in 13-REVIEW.md). |
| 4 | When the background `POST /api/review` save fails, it retries silently; a toast appears only after all retries are exhausted — REVIEW-04 | ✓ VERIFIED | `components/StudySession.tsx`: `postReviewWithRetry` (110-132) — bounded `for (let attempt = 0; attempt < 3; ...)` with `backoffMs = [500, 1500]`; `if (res.ok) return` on success (123) WITHOUT calling `onExhausted`; `onExhausted()` called only after the loop (131). Wired via `void postReviewWithRetry(cardId, rating, () => { if (isMountedRef.current) setSaveError(...) })` at line 530; `<Toast>` rendered on `saveError` at 666-671. The ordering invariant (toast only after exhaustion; success → no toast) was live-exercised by the Task 3 human-verify checkpoint (approved): offline grade → single toast on exhaustion then auto-dismiss; subsequent online grade → no toast. (WR-04 hung-fetch gap is a separate robustness concern — see Human Verification.) |
| 5 | After undoing a review, the previous card reappears with the queue, seen-card set, and session stats all restored consistently — an interrupted undo never leaves partially-restored state — REVIEW-05 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `components/StudySession.tsx`: `if (!isMountedRef.current) return` at line 596 guards the ENTIRE restoration block (598-604) including the unconditional `seenCardIdsRef.current = prevSeenCardIds` ref write (600); `isMountedRef` (211) + mount/unmount effect (212-215) sets false on unmount. React 18/19 auto-batches the setState calls. Restoration-consistency clause was live-verified by Task 3 (undo-during-flux → queue/stats consistent, no console errors). HOWEVER, the unmount-mid-undo cleanup invariant (component removed between fetch resolve and restore) is a behavior-dependent cleanup invariant that NO test exercises — Task 3 tested undo-during-flux, not unmount-during-undo. The structural guarantee is strong (guard precedes ref write) but the runtime unmount path is unproven. See behavior_unverified_items + Human Verification. |

**Score:** 4/5 truths verified (1 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `app/api/review/route.ts` | POST handler with rating range guard (400) + try/catch generic 500 (REVIEW-01, REVIEW-02) | ✓ VERIFIED | Exists (51 lines). Substantive: rating guard (14-24), try/catch wrapping all 3 Prisma/FSRS calls (30-50), generic 500 message (47). Wired: route handler invoked by `postReviewWithRetry` in StudySession. |
| `app/api/cards/[id]/route.ts` | PUT handler with P2002 → friendly 400 collision branch (REVIEW-03) | ✓ VERIFIED | Exists (83 lines). Substantive: `import { Prisma }` (4), P2002 instanceof check (60), friendly 400 message (62), retained generic 500 (67). Wired: route handler. |
| `components/StudySession.tsx` | postReviewWithRetry + isMountedRef + atomic undo restoration (REVIEW-04, REVIEW-05) | ✓ VERIFIED | Exists (1036 lines). Substantive: `postReviewWithRetry` (110-132), `isMountedRef` + effect (211-215), `void postReviewWithRetry(...)` wiring (530-534), mount-guarded undo restoration (596-604), `saveError` state + `<Toast>` render (666-671). Wired: imported by the study page; Toast imported and rendered. |
| `components/Toast.tsx` | Minimal self-dismissing status toast (role=status, aria-live=polite, semantic tokens) | ✓ VERIFIED | Exists (56 lines). Substantive: `'use client'` (1), `Props { message, onDismiss, duration? }` (5-9), `role="status"` + `aria-live="polite"` (41-42), `setTimeout` self-dismiss via ref-held callback (34-37), semantic tokens (`bg-surface-1`, `text-foreground`, `shadow-md`, `--sab`), ≥44px dismiss control (46-53). Wired: imported at StudySession:14, rendered at 667. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `/api/review` rating guard | `prisma.cardReview.findUnique` + `reviewCard()` | Source line ordering | ✓ WIRED | Guard at lines 14-24 returns 400 BEFORE `findUnique` (31) and `reviewCard(...)` (36). Invalid rating provably never reaches the DB/FSRS calls. |
| `/api/cards/[id]` P2002 branch | Generic 500 fallback | Catch-block ordering | ✓ WIRED | P2002 check (60) → 400 (63) PRECEDES the generic `status: 500` return (67). Collision is mapped to 400 before the 500 fallback. |
| `submitReview` background save | `postReviewWithRetry` | `void postReviewWithRetry(...)` call | ✓ WIRED | StudySession:530 `void postReviewWithRetry(cardId, rating, () => { if (isMountedRef.current) setSaveError(...) })`. The bare `fetch('/api/review', {...}).catch(() => {})` is GONE (only match is a comment at line 98). |
| `postReviewWithRetry` exhaustion | `<Toast>` | `onExhausted` → `setSaveError` → conditional render | ✓ WIRED | onExhausted (530-534) is the ONLY trigger for `setSaveError`; guarded by `isMountedRef.current` (531). `saveError` state (206) → `{saveError && <Toast .../>}` (666-671). No other code path sets saveError. |
| `handleUndo` restoration | `isMountedRef` mount guard | `if (!isMountedRef.current) return` before restoration | ✓ WIRED | Guard at line 596 precedes the entire restoration block (598-604) including the `seenCardIdsRef.current = prevSeenCardIds` ref write (600). The ref write shares the same all-or-nothing gate as the batched setState calls. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `components/Toast.tsx` | `message` prop | `saveError` state in StudySession, set by `onExhausted` callback (real connection-failure message string) | Yes | ✓ FLOWING |
| `app/api/review/route.ts` | `review` (returned JSON) | `prisma.cardReview.update(...)` (real DB write) | Yes | ✓ FLOWING |
| `app/api/cards/[id]/route.ts` | `card` (returned JSON) | `prisma.card.findUniqueOrThrow(...)` with `include: { review, sentences }` (real DB read) | Yes | ✓ FLOWING |
| `components/StudySession.tsx` retry loop | `cardId`, `rating` args | `submitReview`'s `current.card.id` and the `rating` parameter (real session state) | Yes | ✓ FLOWING |

No hollow props, no static/empty returns, no hardcoded empty data flowing to render.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| ESLint clean (incl. `react-hooks/purity`, `react-hooks/set-state-in-effect`) | `npm run lint` | exit 0, no errors | ✓ PASS |
| `npm run build` (TypeScript typecheck) | NOT RUN — would hit hosted Turso DB at prerender (per 13-01-SUMMARY: `/study` is prerendered `○ (Static)` and queries the hosted DB); structural greps + 13-REVIEW.md confirm typecheck | skipped | ? SKIP (env constraint) |
| Server-side runtime: `POST /api/review` rating=99 → 400; DB failure → structured 500; `PUT /api/cards/[id]` collision → 400 | NOT RUN — requires running server + seeded DB + auth cookie | skipped | ? SKIP (route to human; structural proof strong for SC1-3, not behavior-dependent cleanup invariants) |
| Client-side runtime: offline grade → single toast on exhaustion; undo-during-flux → consistent state | Task 3 human-verify checkpoint (approved 2026-07-02) — operator reply: **approved** | all 5 live checks passed | ✓ PASS (human) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared in PLAN/SUMMARY; this is not a migration/tooling phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REVIEW-01 | 13-01 | `/api/review` wraps Prisma calls in try/catch and returns a proper error response on DB failure | ✓ SATISFIED | try/catch wraps findUnique/reviewCard/update (route.ts:30-50); generic 500 returned. SC1 VERIFIED. REQUIREMENTS.md marks [x] Complete. |
| REVIEW-02 | 13-01 | `/api/review` rejects ratings outside `[1,2,3,4]` with a 400 instead of passing garbage to `reviewCard()` | ✓ SATISFIED | Rating guard (route.ts:14-24) precedes reviewCard (36). SC2 VERIFIED. REQUIREMENTS.md marks [x] Complete. |
| REVIEW-03 | 13-01 | Card-front collision (post-normalization) returns a clear 400 instead of an uncaught 500 | ✓ SATISFIED | P2002 → friendly 400 (cards/[id]/route.ts:60-64); generic 500 retained (67). SC3 VERIFIED. REQUIREMENTS.md marks [x] Complete. |
| REVIEW-04 | 13-02 | Background `POST /api/review` retries silently; toast only if retries exhausted | ✓ SATISFIED | `postReviewWithRetry` bounded 3 attempts + onExhausted-only-on-exhaustion (StudySession:110-132); live-verified by Task 3. SC4 VERIFIED (hung-fetch gap flagged for human review). REQUIREMENTS.md marks [x] Complete. |
| REVIEW-05 | 13-02 | Undo restores queue/session state atomically; interrupted undo can't leave partial state | ⚠️ SATISFIED-STRUCTURALLY (behavior-unverified for unmount path) | Mount guard (StudySession:596) gates entire restoration incl. ref write (600); restoration-consistency live-verified by Task 3 (undo-during-flux). Unmount-mid-undo cleanup invariant NOT runtime-tested → SC5 PRESENT_BEHAVIOR_UNVERIFIED. REQUIREMENTS.md marks [x] Complete. |

**Orphaned requirements:** None. REQUIREMENTS.md traceability table maps REVIEW-01..05 to Phase 13, all marked Complete. All 5 IDs declared in PLAN frontmatter (`13-01: [REVIEW-01, REVIEW-02, REVIEW-03]`, `13-02: [REVIEW-04, REVIEW-05]`) are accounted for.

### Anti-Patterns Found

Sourced from `13-REVIEW.md` (0 critical, 5 warning, 3 info) and re-confirmed against the current source. None rise to BLOCKER (no FAILED truth, no MISSING/STUB artifact, no NOT_WIRED link, no TBD/FIXME/XXX debt markers — verified by grep).

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `app/api/review/route.ts` | 6 | `await req.json()` OUTSIDE the try block (try opens at line 30) — malformed JSON throws unhandled, bypassing REVIEW-01's structured 500 (WR-01) | ⚠️ Warning | Gap against the phase GOAL's "every failure path returns a clear response." NOT a SC1 violation (SC1 is scoped to "database error"), but a real hardening gap: a truncated/buggy body produces a framework 500, not the structured `{ error: 'Failed to record review' }` the client expects. Sibling `/api/cards/[id]/route.ts:14` correctly places `req.json()` inside its try. |
| `app/api/cards/[id]/route.ts` | 66-67 | Generic 500 leaks raw `e.message` to the client (WR-02) | ⚠️ Warning | Info disclosure; inconsistent with `/api/review`'s generic 500 (T-13-02). Reachable with a trivially-crafted `null` body (`data.type !== undefined` at line 20 throws on null). NOT a SC3 violation (SC3 scopes the collision branch, which returns the friendly 400). |
| `app/api/cards/[id]/route.ts` | 17-46 | `prisma.card.update` and the sentence-replacement `$transaction` are NOT wrapped in a common transaction (WR-03) | ⚠️ Warning | Mid-flow failure leaves the card with a new front but stale sentences — silent data inconsistency. PRE-EXISTING (Phase 13 only added the P2002 catch; did not touch this flow). Sits in the phase's "save reliability" theme but was not introduced by it. |
| `components/StudySession.tsx` | 110-132 | `postReviewWithRetry` has NO fetch timeout/AbortController AND retries non-transient 4xx (WR-04) | ⚠️ Warning | (1) A hung fetch (server accepts TCP but never responds) never resolves/rejects → the for-loop never advances → `onExhausted` is NEVER called → toast NEVER appears. This defeats REVIEW-04 under exactly the flaky-network condition it targets. (2) A 400/404 is retried with backoff then surfaces a misleading "check your connection" toast. The hung-fetch sub-issue routes to Human Verification. |
| `app/api/review/route.ts` | 7 | `cardId === undefined` guard does not validate `cardId` is a non-empty string (WR-05) | ⚠️ Warning | Input-validation inconsistency with the sibling `app/api/review/undo/route.ts:8` (`!cardId || typeof cardId !== 'string'`). A non-string `cardId` passes the guard and yields a misleading 404 or throws inside findUnique (caught by the generic 500, but unnecessarily). |
| `app/api/review/route.ts` | 36 | `rating as Grade` unchecked type assertion (IN-01) | ℹ️ Info | Safe today (guard at 14-24 proves rating ∈ {1,2,3,4} = Grade), but a future edit relaxing the guard would silently keep compiling. Prefer a `isGrade` type guard. |
| `components/StudySession.tsx` | 580-586 | `handleUndo` failure path is not mount-guarded, inconsistent with the success path (IN-02) | ℹ️ Info | Harmless in React 18 (setState on unmounted is a silent no-op), but inconsistent with the atomic-guard pattern two lines below. Symmetry/comment opportunity. |
| `components/Toast.tsx` | 34-37 | Toast auto-dismiss timer does not reset when `message` changes (IN-03) | ℹ️ Info | Latent — not triggered by the current sole caller (always passes the same string literal or unmounts). Footgun for future reuse. |

**Debt marker gate:** No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any phase-touched file (grep-confirmed). No blocker anti-patterns.

### Human Verification Required

**1. Hung-fetch path in `postReviewWithRetry` (13-REVIEW.md WR-04 issue 2)**

**Test:** DevTools → Network → simulate a hung backend (server accepts TCP but never responds — e.g. throttle to a hung response or block response mid-flight), then grade a card.
**Expected:** Either (a) the retry loop terminates within a bounded time and the "Couldn't save your last review — check your connection" toast appears, OR (b) the developer confirms this edge case is acceptable for a single-tenant app. If neither holds, add an `AbortController` timeout (~8s per attempt) to `postReviewWithRetry` so a hung fetch aborts and the loop advances to `onExhausted`.
**Why human:** `postReviewWithRetry` (`components/StudySession.tsx:110-132`) has no fetch timeout. A hung `await fetch(...)` never resolves AND never rejects, so the `for` loop never advances, `onExhausted` is never called, and the toast never appears — the user gets neither the save nor the failure signal. The Task 3 checkpoint tested the offline=reject path (fetch rejects immediately → loop advances → toast), NOT the hung-fetch path. This is a real gap against SC4's spirit ("a toast appears only after all retries are exhausted") and the goal's "client recovers gracefully instead of losing data." Grep cannot see whether the fetch will hang.

**2. Unmount-during-undo cleanup invariant (REVIEW-05)**

**Test:** Trigger an undo, then force-unmount the StudySession component (navigate away / session-key change) BEFORE the `await fetch('/api/review/undo')` resolves, then re-mount and inspect `seenCardIdsRef` + queue/stats coherence.
**Expected:** No partially-restored state: `seenCardIdsRef.current` is NOT mutated, no stale setState calls fire, and on re-mount the queue/stats/seen-count are coherent (not half-restored). The `if (!isMountedRef.current) return` guard at `components/StudySession.tsx:596` is the structural guarantee.
**Why human:** This is a cancellation/cleanup invariant (behavior-dependent). The Task 3 live checkpoint verified undo-during-flux (consistency after grade→undo), but did NOT exercise the unmount-mid-undo path specifically. The mount guard is structurally present and correctly placed before the `seenCardIdsRef` write (line 600), but grep cannot prove React's unmount lifecycle reliably sets `isMountedRef.current=false` before the async callback fires — a runtime check is needed to close the invariant.

**Already-verified live behaviors (Task 3 checkpoint, approved 2026-07-02 — recorded, not re-requested):** normal grade → no toast; offline grade → single toast on exhaustion then auto-dismiss; online grade after offline → no toast; undo-during-flux → queue/stats consistent, no console errors; toast legible in Dark mode. These cover SC4's ordering invariant (toast-after-exhaustion) and SC5's restoration-consistency clause.

### Gaps Summary

No must-have truth is FAILED. All four artifacts exist, are substantive, are wired, and have real data flowing. All five key links are WIRED. All five REVIEW requirements are accounted for in REQUIREMENTS.md (marked Complete) and in the PLAN frontmatter. Lint is clean (exit 0).

The phase is **not `passed`** for two reasons that route it to human verification rather than a hard gap:

1. **SC5 (REVIEW-05) is ⚠️ PRESENT_BEHAVIOR_UNVERIFIED.** The atomic-undo mount guard is structurally sound (present, precedes the `seenCardIdsRef` ref write, `isMountedRef` effect sets false on unmount) and the restoration-consistency clause was live-verified by the Task 3 checkpoint. But the unmount-mid-undo cleanup invariant — the specific guarantee in SC5's second clause ("an interrupted undo never leaves partially-restored state") — is a behavior-dependent cleanup invariant that no test exercises (Task 3 tested undo-during-flux, not unmount-during-undo). Per the verification rule, cleanup invariants require a behavioral test or they remain PRESENT_BEHAVIOR_UNVERIFIED.

2. **WR-04 hung-fetch gap (from 13-REVIEW.md).** `postReviewWithRetry` has no `AbortController`/timeout. Under a hung-connection scenario (serverless instance paused, libSQL hung), the fetch never resolves, the retry loop never advances, and the toast never appears — defeating SC4's guarantee under exactly the flaky-network condition REVIEW-04 targets. The Task 3 checkpoint tested the offline=reject path, not the hung-fetch path. This is a real robustness gap against the goal's "client recovers gracefully instead of losing data," surfaced for human decision (accept for single-tenant, or add a timeout).

The five 13-REVIEW.md warnings (WR-01 req.json outside try, WR-02 PUT 500 leaks e.message, WR-03 card+sentences non-atomic, WR-04 no timeout/retries-4xx, WR-05 cardId not string-validated) are real defects in files this phase touched, but none rise to a must-have **letter** violation: each SC is met at the letter (SC1 = DB-error → structured 500 ✓; SC3 = collision → friendly 400 ✓; SC4 = retry+toast-on-exhaustion ✓ for the tested path). The warnings are gaps against the **spirit** of the broader phase goal ("every failure path returns a clear response," "client recovers gracefully"), which is wider than the SC contract. They are recorded as anti-patterns for the developer to address (ideally before Phase 15 restructures StudySession.tsx) but do not block this phase's SC-level completion.

No deferred items: Phase 14 (sync/caching) does not touch these files; Phase 15 (StudySession refactor) shares `components/StudySession.tsx` but its SCs cover sentence-selection memoization + mode sub-components, not retry timeout or undo failure-path guarding — the warnings are not clearly addressed by a later phase's SCs.

---

_Verified: 2026-07-02T06:30:00Z_
_Verifier: the agent (gsd-verifier)_
