---
phase: 26-freshness-fix
plan: 04
subsystem: testing
tags: [playwright, e2e, freshness, react, nextjs]

requires:
  - phase: 26-freshness-fix (26-03)
    provides: "StudyClient/CardsClient gated adoption of fresh initialCards (FRESH-02 gate conditions)"
provides:
  - "Two automated Playwright cells proving FRESH-02's clobber-prevention gates never adopt a boundary-refreshed payload mid-interaction"
  - "26-VERIFICATION.md's behavior_unverified_items entry for FRESH-02 is now covered by automated e2e, no longer requiring human verification"
affects: [26-06]

tech-stack:
  added: []
  patterns:
    - "dispatchEvent('click') workaround for buttons nested inside SwipeRow's pointer-capture wrapper, when a real click/mouse gesture would be retargeted away from the button"

key-files:
  created:
    - e2e/freshness-gate.spec.ts
  modified:
    - .planning/phases/26-freshness-fix/deferred-items.md

key-decisions:
  - "Used locator.dispatchEvent('click') instead of .click() for the Edit button on /cards — SwipeRow's setPointerCapture(pointerdown) retargets the resulting click event to the row wrapper div, not the button, for a zero-movement tap; logged as an out-of-scope discovery rather than patched (SwipeRow.tsx is not in this plan's file list)"

requirements-completed: [FRESH-02]

coverage:
  - id: D1
    description: "A mid-session boundary refresh (simulated tab/PWA resume) on /study never resets/reorders the active StudySession queue or its revealed state"
    requirement: "FRESH-02"
    verification:
      - kind: e2e
        ref: "e2e/freshness-gate.spec.ts#/study mid-session boundary refresh never clobbers the active session (FRESH-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A boundary refresh fired while the CardEditor sheet is open on /cards never overwrites the in-progress edit or the optimistic post-save card list with the stale/mutated payload"
    requirement: "FRESH-02"
    verification:
      - kind: e2e
        ref: "e2e/freshness-gate.spec.ts#/cards open-sheet boundary refresh never clobbers in-flight edits (FRESH-02)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-07-12
status: complete
---

# Phase 26 Plan 04: FRESH-02 E2E Gate Cells Summary

**Two new Playwright cells (`e2e/freshness-gate.spec.ts`) that drive a real mid-session boundary refresh and a real open-sheet boundary refresh, proving StudyClient's and CardsClient's adoption gates discard the delivered payload while an in-flight interaction is protected — closing 26-VERIFICATION.md's only `behavior_unverified` gap for FRESH-02.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-12T18:00:35-07:00 (first task commit)
- **Completed:** 2026-07-12T18:21:51-07:00
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `/study mid-session` cell: starts a real flashcard session, reveals the card, mutates the DB mid-session, fires a simulated resume boundary event, awaits the RSC/JSON fetch response as delivery evidence, then asserts the grade bar is still visible, the card face and progress label are unchanged, and select-mode never returned.
- `/cards open-sheet` cell: opens the CardEditor sheet, types an in-progress edit, mutates the DB (adds a card) while the sheet is open, fires the same boundary event, asserts the sheet/edit/count are all unchanged while gated, then saves and confirms the edit survived and the count still reflects the pre-mutation fixture value (no deferred late-adoption after the gate reopens).
- Both cells create the `waitForRscFetch` promise *before* the trigger and await it before asserting non-change, so the negative assertions are proven against a delivery that provably occurred — not a vacuous "nothing happened because nothing was sent" result.
- Discovered and documented (not fixed — out of this plan's scope) a real `SwipeRow` pointer-capture bug that silently drops `click` events on nested buttons for zero-movement clicks; worked around in the test file via `dispatchEvent('click')`.

## Task Commits

Each task was committed atomically:

1. **Task 1: /study mid-session boundary non-clobber cell (FRESH-02)** - `4fff12c` (test)
2. **Task 2: /cards open-sheet boundary non-clobber cell (FRESH-02)** - `29a1e67` (test)

**Plan metadata:** commit intentionally omitted per worktree mode (orchestrator handles docs commit after merge)

_Note: no TDD tasks in this plan — both are direct e2e test-authoring tasks._

## Files Created/Modified
- `e2e/freshness-gate.spec.ts` - New spec, 2 test cells (mid-session on /study, open-sheet on /cards) proving FRESH-02's non-clobber contract
- `.planning/phases/26-freshness-fix/deferred-items.md` - Appended one new out-of-scope discovery entry (SwipeRow pointer-capture click bug)

## Decisions Made
- `dispatchEvent('click')` for the Edit button click, not `.click()` — see Deviations below. This is scoped entirely inside the new spec file; no production code was touched.
- 800ms settle window after `await rscFetch` (vs. the sibling specs' 300ms) — deliberately wider so both cells stay green whether or not Plan 26-05's JSON re-fetch backstop has landed yet, per the plan's own design note.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking: missing local dev dependencies] Worktree missing `node_modules` and generated Prisma client**
- **Found during:** Task 1 verification (first `npx playwright test` run)
- **Issue:** This git worktree had no `node_modules` (gitignored, never installed for this worktree) and no generated `app/generated/prisma/` client, so the Playwright webServer's `next build` failed immediately with `Cannot find module '@/app/generated/prisma/client'`.
- **Fix:** Ran `npx prisma generate` (regenerates the gitignored client from the committed schema — no schema change) and created a symlink `node_modules -> /Users/main/Documents/claude-test/node_modules` (the main repo's install; `node_modules` is gitignored in this worktree, so the symlink touches no tracked files and doesn't affect `git status`/`git diff`).
- **Files modified:** None tracked (symlink + generated client are both gitignored).
- **Verification:** `npx playwright test` ran successfully afterward.
- **Committed in:** N/A (nothing to commit — both artifacts are gitignored).

**2. [Rule 1 - Bug, logged not fixed — out of scope] `SwipeRow` pointer capture drops `click` on nested buttons**
- **Found during:** Task 2 (writing the `/cards open-sheet` cell — the "Edit" button click never opened the CardEditor sheet)
- **Issue:** `SwipeRow.onPointerDown` unconditionally calls `setPointerCapture` on every pointerdown, which retargets the resulting `click` event to the row wrapper `<div>` instead of the nested `<button>Edit</button>` for a zero-movement click — confirmed via a throwaway instrumented event-trace spec (pointerdown targets BUTTON; pointerup/mouseup/click all retarget to DIV). `components/SwipeRow.tsx` is not in this plan's file list, so per the executor scope-boundary rule this was **not patched** — logged in `deferred-items.md` instead.
- **Fix (workaround, test-file-only):** `e2e/freshness-gate.spec.ts` uses `locator.dispatchEvent('click')` for the Edit button, which fires the click event directly rather than replaying a synthetic down/up gesture sequence, bypassing the pointer-capture redirection entirely.
- **Files modified:** `e2e/freshness-gate.spec.ts` (the workaround), `.planning/phases/26-freshness-fix/deferred-items.md` (the discovery record).
- **Verification:** `/cards open-sheet` cell passes reliably (2 consecutive full-file runs, 3/3 both times).
- **Committed in:** `29a1e67`

---

**Total deviations:** 2 (1 environment setup — untracked/gitignored, 1 logged-not-fixed out-of-scope bug with an in-file test workaround)
**Impact on plan:** No scope creep — no production component was modified. The SwipeRow finding is a legitimate discovery worth a dedicated future fix (see deferred-items.md), but is unrelated to this plan's own file list.

## Issues Encountered
- Playwright's `webServer` (production `next build && next start`) intermittently left a zombie `next-server` process bound to port 3100 after a killed/interrupted run, causing `EADDRINUSE` on the next invocation despite `reuseExistingServer: true`. Resolved each time by `pkill -9 -f next-server` before re-running; no code or config change needed (transient to this interactive debugging session, not a recurring risk for a normal single CI-style run).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

FRESH-02's both `26-VERIFICATION.md` `human_verification` items now have automated coverage in `e2e/freshness-gate.spec.ts`, 2/2 passing against the current (pre-26-05) shipped code, per the plan's acceptance bar. Plan 26-06's combined acceptance sweep can include this file alongside the other freshness specs. No blockers for 26-05 or 26-06.

---
*Phase: 26-freshness-fix*
*Completed: 2026-07-12*
