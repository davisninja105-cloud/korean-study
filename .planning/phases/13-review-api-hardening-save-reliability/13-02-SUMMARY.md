---
phase: 13-review-api-hardening-save-reliability
plan: 02
subsystem: ui
tags: [react, toast, retry, undo, react-hooks, study-session, nextjs]

# Dependency graph
requires:
  - phase: 13-review-api-hardening-save-reliability
    provides: "Plan 13-01 hardened POST /api/review server-side (rating validation + generic 500); this plan's client retry wrapper re-posts against that hardened endpoint"
provides:
  - "Bounded silent-retry wrapper (postReviewWithRetry) for the background POST /api/review save — up to 3 attempts with backoff, toast only after exhaustion (REVIEW-04)"
  - "Hand-rolled, token-styled, self-dismissing Toast component (role=status, aria-live=polite) — no new npm dependency"
  - "Mount-guarded atomic undo restoration in handleUndo — queue/stats/seen-card set/seen-count/cursor/revealed/intervalHints apply as one all-or-nothing unit or are fully skipped on unmount (REVIEW-05)"
affects: [15-studysession-refactor]

# Tech tracking
tech-stack:
  added: []  # no new packages — Toast is hand-rolled with existing React + Tailwind semantic tokens
  patterns:
    - "Mount-guard pattern: isMountedRef + mount/unmount effect gates async callbacks (retry exhaustion, undo restoration) so setState/ref-writes fired after unmount are skipped"
    - "Bounded silent retry with exhaustion callback: postReviewWithRetry as the template for fire-and-forget client saves that retry silently then surface a single user-visible failure"
    - "Self-dismissing toast via ref-held callback: setTimeout in a cleaned-up effect with the callback held in a ref so the timer survives parent re-renders and onDismiss fires inside the timeout (not in the effect body) — satisfies react-hooks/set-state-in-effect"

key-files:
  created:
    - components/Toast.tsx
  modified:
    - components/StudySession.tsx

key-decisions:
  - "Held the Toast dismiss callback in a ref (dismissRef) so the auto-dismiss setTimeout is set up once on mount and is NOT reset by unrelated parent re-renders (study session advancing cards while a save-failure toast is visible) — keeps the timer stable across re-renders while still invoking the latest onDismiss."
  - "Scoped the toast to the background-save failure path only; did NOT wire it to handleUndo's existing fetch (that path has its own re-arm/return handling) — per plan instruction."
  - "Chose the mount-guard + React 18/19 auto-batched setState block approach for atomic undo (not the heavier useReducer alternative) — Phase 15 owns the larger StudySession structural refactor; this plan minimizes churn while locking behavior."
  - "3 total attempts (1 initial + 2 retries) with ~500ms / ~1500ms backoff — hard-bounded so a persistent failure can't spin an unbounded request loop (threat T-13-05)."
  - "Toast uses semantic tokens only (bg-surface-1, text-foreground, shadow-md, the --sab safe-area var) — no literal bg-orange/text-blue utilities, no new npm dependency."

patterns-established:
  - "Mount-guard pattern: isMountedRef gates async callbacks so a setState fired after unmount is skipped — reusable for any async event-handler flow in StudySession."
  - "Bounded silent retry with exhaustion callback: postReviewWithRetry is the template for any fire-and-forget client save that should retry silently then surface a single user-visible failure."
  - "Self-dismissing toast via ref-held callback: setTimeout in a cleaned-up effect with the callback in a ref so the timer survives parent re-renders and onDismiss is called inside the timeout (not the effect body)."

requirements-completed: [REVIEW-04, REVIEW-05]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Background POST /api/review retries silently within a bounded budget (3 attempts, ~500ms/~1500ms backoff); a single toast appears only after all retries are exhausted, never when a save eventually succeeds (REVIEW-04)"
    requirement: REVIEW-04
    verification:
      - kind: other
        ref: "source grep: postReviewWithRetry at components/StudySession.tsx:110 (for attempt<3 loop with backoffMs=[500,1500]); called via `void postReviewWithRetry(...)` at line 530 with onExhausted guarded by isMountedRef at line 531; bare fetch('/api/review',{...}).catch gone (0 matches)"
        status: pass
      - kind: other
        ref: "source grep: components/Toast.tsx — 'use client', Props{message,onDismiss,duration?}, role=status, aria-live=polite, setTimeout self-dismiss in cleaned-up effect, --sab safe-area, no literal color utilities"
        status: pass
      - kind: other
        ref: "npm run build + npm run lint clean (verified by previous executor during Task 1/2; react-hooks/purity + react-hooks/set-state-in-effect respected)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 human-verify checkpoint — offline grade advances optimistically then shows exactly one toast after retries exhaust; subsequent online grade shows no toast; toast auto-dismisses"
        status: pass
    human_judgment: true
    rationale: "The retry budget and single-toast-only-on-exhaustion behavior depend on live network conditions (offline simulation, retry-timing) that automated build/lint/source greps cannot exercise — API/UI test coverage is explicitly out of scope for this milestone. The Task 3 human-verify checkpoint (operator reply: approved) confirmed the runtime behavior across offline-grade and online-grade paths."
  - id: D2
    description: "handleUndo's success-path restoration is a single atomic unit guarded by isMountedRef — queue, stats, seen-card set (seenCardIdsRef), seen-count, cursor, revealed, and intervalHints apply together or not at all; an unmounted undo leaves no partially-restored state (REVIEW-05)"
    requirement: REVIEW-05
    verification:
      - kind: other
        ref: "source grep: components/StudySession.tsx:596 `if (!isMountedRef.current) return` precedes the restoration block (setStats/setQueue/seenCardIdsRef.current=setSeenCount/setCursor/setRevealed/setIntervalHints at lines 598-604); isMountedRef mount/unmount effect at lines 211-215"
        status: pass
      - kind: other
        ref: "npm run build + npm run lint clean (verified by previous executor during Task 2)"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 human-verify checkpoint — undo tapped immediately after grading leaves queue/stats consistent with no console errors; undo restores previous card with 'Card N of N' counter and stats intact (not double-counted, not reset)"
        status: pass
    human_judgment: true
    rationale: "Atomicity-under-unmount and the consistent-restoration behavior are runtime/session-state dependent (component unmounts between awaited fetch resolving and restore; queue/stats/seen-count coherence across an undo-during-flux sequence). No automated test asserts this — API/UI test coverage is out of scope for this milestone. The Task 3 human-verify checkpoint (operator reply: approved) confirmed the live behavior."

# Metrics
duration: ~10 min active (plus a live-verify checkpoint pause)
completed: 2026-07-02
status: complete
---

# Phase 13 Plan 02: Client Save Retry + Atomic Undo Summary

**Bounded silent-retry wrapper for the background POST /api/review with a hand-rolled token-styled toast only on exhaustion, plus a mount-guarded atomic undo restoration — live-verified across offline-grade, undo-during-flux, and dark-mode checks.**

## Performance

- **Duration:** ~10 min active (plus a live-verify checkpoint pause)
- **Started:** 2026-07-02 (previous executor session; Task 1 committed 2026-07-01T22:43:39 local, Task 2 at 22:44:32 local)
- **Completed:** 2026-07-02T05:58Z (continuation agent finalized after checkpoint approval)
- **Tasks:** 3 (2 source tasks shipped + 1 human-verify checkpoint approved)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- The background `POST /api/review` save in `submitReview` now goes through `postReviewWithRetry` — up to 3 total attempts (1 initial + 2 retries) with ~500ms / ~1500ms backoff, silent throughout; a toast surfaces only after the final attempt fails, and never when a save eventually succeeds (REVIEW-04). The bare `fetch('/api/review', {...}).catch(() => {})` is gone.
- Added a minimal, hand-rolled `components/Toast.tsx`: `'use client'`, `role="status"` + `aria-live="polite"`, self-dismissing via a cleaned-up `setTimeout` (callback held in a ref so the timer survives parent re-renders), styled with semantic tokens only (`bg-surface-1`, `text-foreground`, `shadow-md`, the `--sab` safe-area var) and a ≥44px dismiss control. No new npm dependency.
- `handleUndo`'s success-path restoration is now a single atomic unit: a leading `if (!isMountedRef.current) return` gates the entire block (`setStats`, `setQueue`, `seenCardIdsRef.current = prevSeenCardIds`, `setSeenCount`, `setCursor`, `setRevealed`, `setIntervalHints`) so React 18/19 auto-batched setState plus the ref write apply all-or-nothing — an unmounted undo can no longer leave the ref mutated while setters silently no-op (REVIEW-05).
- A shared `isMountedRef` + mount/unmount effect gates both async callbacks (retry exhaustion in `submitReview`, and the undo restoration), establishing a reusable mount-guard pattern for StudySession.
- Live verification (Task 3 human-verify checkpoint) passed all five checks: normal grade shows no toast, offline grade shows exactly one toast on exhaustion then auto-dismisses, online grade after offline shows no toast, undo-during-flux leaves queue/stats consistent with no console errors, and the toast is legible in Dark mode. Operator reply: **approved**.
- Build and lint stay clean (TypeScript finished, no errors; `eslint` exit 0 — `react-hooks/purity` and `react-hooks/set-state-in-effect` respected).

## Task Commits

Each source task was committed atomically; Task 3 was a verification gate (no source changes):

1. **Task 1: Create minimal Toast component + bounded silent-retry review save (REVIEW-04)** - `0e9b909` (feat)
2. **Task 2: Make undo state restoration atomic (REVIEW-05)** - `f26181f` (fix)
3. **Task 3: Live verification of retry/toast + atomic undo** - checkpoint:human-verify — **approved** (no commit; no source changes)

**Plan metadata:** committed after STATE/ROADMAP/REQUIREMENTS update (docs).

## Files Created/Modified
- `components/Toast.tsx` — NEW `'use client'` presentational toast: `Props { message, onDismiss, duration? }`, `role="status"` / `aria-live="polite"`, self-dismissing via a ref-held-callback `setTimeout` in a cleaned-up effect, semantic-token styling + `--sab` safe-area, ≥44px dismiss control. No new dependency.
- `components/StudySession.tsx` — added module-level `postReviewWithRetry(cardId, rating, onExhausted)` (bounded 3-attempt retry with backoff); added `saveError` state + `isMountedRef` ref + mount/unmount effect; switched `submitReview`'s background save from bare `fetch().catch(()=>{})` to `postReviewWithRetry` with an `isMountedRef`-guarded `onExhausted` that sets the toast message; guarded `handleUndo`'s success-path restoration with `if (!isMountedRef.current) return` so the restoration (including the `seenCardIdsRef` write) is atomic; renders `<Toast>` conditionally on `saveError`.

## Decisions Made
- Held the Toast dismiss callback in a `dismissRef` so the auto-dismiss `setTimeout` is set up once on mount and is NOT reset by unrelated parent re-renders (the study session advancing cards while a save-failure toast is visible) — keeps the timer stable while still invoking the latest `onDismiss`. `onDismiss` is invoked inside the `setTimeout` callback, never synchronously in the effect body, so it does not violate `react-hooks/set-state-in-effect`.
- Scoped the toast to the background-save failure path only; did NOT wire it to `handleUndo`'s existing fetch (that path has its own re-arm/`return` handling) — per plan instruction.
- Chose the mount-guard + React 18/19 auto-batched `setState` block approach for atomic undo (not the heavier `useReducer` alternative the plan offered) — Phase 15 owns the larger `StudySession` structural refactor; this plan minimizes churn while locking behavior.
- 3 total attempts (1 initial + 2 retries) with ~500ms / ~1500ms backoff — hard-bounded so a persistent failure can't spin an unbounded request loop against the app's own API / Vercel quota (threat T-13-05).
- Toast uses semantic tokens only (`bg-surface-1`, `text-foreground`, `shadow-md`, the `--sab` safe-area var) — no literal `bg-orange`/`text-blue` utilities, and no new npm dependency (threat T-13-SC accepted).

## Deviations from Plan

None — plan executed exactly as written. Task 3 was a `checkpoint:human-verify` gate (no source changes by design); the operator replied **approved**, resolving the checkpoint. No auto-fixes (Rules 1–3) and no architectural decisions (Rule 4) were required.

## Issues Encountered

None — the previous executor reported no transient build/network failures for this plan (unlike Plan 13-01's Turso `ECONNRESET`), and the live verification passed all five checks on the first run.

## User Setup Required

None — no external service configuration required. The Toast is hand-rolled with existing React + Tailwind semantic tokens; no package install was needed. The `postReviewWithRetry` wrapper posts to the already-hardened `POST /api/review` endpoint (Plan 13-01) over the existing shared-password cookie.

## Known Stubs

None — `postReviewWithRetry` is fully wired into `submitReview`'s background save; `Toast` is fully wired to `saveError` state; `handleUndo`'s atomic guard is fully wired. No placeholder/empty/mock data introduced.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes were introduced beyond what the plan's `<threat_model>` already covers (T-13-05 mitigated by the hard-bounded retry; T-13-06 mitigated by the mount-guarded atomic restore; T-13-07 accepted — generic toast copy; T-13-SC accepted — no package-manager installs).

## Next Phase Readiness
- REVIEW-04 and REVIEW-05 satisfied: bounded silent retry + toast-on-exhaustion verified live, and atomic undo restoration verified live. Build + lint clean. Phase 13 is now complete (Plan 13-01 + Plan 13-02 both shipped; all five REVIEW requirements satisfied).
- Phase 15 (`StudySession` refactor) can proceed when scheduled — it shares `components/StudySession.tsx` and must preserve the `postReviewWithRetry` wiring, the `isMountedRef` mount-guard, the `saveError`/`<Toast>` plumbing, and the atomic `handleUndo` restoration established here. The sequencing note (13 before 15) holds: the refactor will restructure already-verified behavior rather than reworking it.
- Phase 14 (sync visibility + caching) has no code dependency on this plan and can run independently per the roadmap.
- No blockers.

## Self-Check: PASSED

- Files exist: `components/Toast.tsx` ✓ (created), `components/StudySession.tsx` ✓ (modified), `13-02-SUMMARY.md` ✓
- Commits exist: `0e9b909` ✓ (feat, Task 1 — REVIEW-04), `f26181f` ✓ (fix, Task 2 — REVIEW-05)
- Plan-level source greps re-run (read-only, no source changes in Task 3):
  - Toast.tsx: `'use client'` first line ✓; `Props{message,onDismiss,duration?}` ✓; `role="status"` ✓; `aria-live="polite"` ✓; `setTimeout` self-dismiss ✓; no literal `bg-orange`/`bg-blue` utilities ✓; uses `--sab` ✓
  - StudySession.tsx: `postReviewWithRetry` present ✓ (line 110); `isMountedRef` present ✓ (lines 211–215, 531, 596); bare `fetch('/api/review', {` count = 0 ✓; `import Toast` ✓; `saveError` state ✓; `<Toast>` rendered ✓; `if (!isMountedRef.current) return` guards handleUndo restoration (line 596) ✓
- Task 3 checkpoint: operator reply **approved** — all five live checks passed (normal grade no toast, offline grade single toast on exhaustion, undo-during-flux consistent, dark-mode toast legible, no regression).

---
*Phase: 13-review-api-hardening-save-reliability*
*Completed: 2026-07-02*
