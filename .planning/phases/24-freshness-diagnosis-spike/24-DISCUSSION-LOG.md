# Phase 24: Freshness Diagnosis Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 24-Freshness Diagnosis Spike
**Areas discussed:** Diagnosis methodology, Mutation scenarios to test, Tab/PWA resume simulation, Diagnosis output format

---

## Diagnosis Methodology

| Option | Description | Selected |
|--------|-------------|----------|
| Script it (throwaway Playwright) | Install `playwright` as a temp/dev tool (not the Phase 25 harness) and write a one-off script driving Chromium against `npm run build && npm start`, capturing whether the RSC payload actually refetches per path. | ✓ |
| I'll drive it manually | User navigates in their own browser with DevTools Network tab open, following step-by-step instructions per path. | |
| Hybrid | Script the mechanical/headless-friendly cases; user manually confirms tab/PWA-resume on a real device. | |

**User's choice:** Script it (throwaway Playwright) — for everything, including tab/PWA-resume (resolved via `visibilitychange` dispatch, see below).
**Notes:** No auth-UI scripting needed — reuse `lib/auth.ts:computeAuthToken()` cookie injection. Never point the throwaway script at the production `libsql://` DB; use local `file:` SQLite with `prisma db push`.

---

## Mutation Scenarios to Test

| Option | Description | Selected |
|--------|-------------|----------|
| Study session → Home/Study | Finish grading cards, navigate to Home or back to Study select-mode — does due-count/stats refresh? (the actual prior-regression scenario) | ✓ (primary) |
| Sync → Home/Cards | Trigger/simulate a sync, navigate to Home or Cards — do new cards/stats show up? | ✓ (lower-priority) |
| Card edit/delete → Cards list | Edit or delete a card, navigate away and back — does the list reflect the change? | ✓ (lower-priority) |
| Review undo → Study | Undo a graded review, navigate away and back — does due count reflect the undo? | ✓ (lower-priority) |

**User's choice:** Study session → Home/Study is the primary, must-test scenario. The other three are included as lower-priority checks — script them only if the harness makes it cheap to add; do not let them block finishing the primary diagnosis.
**Notes:** Initial single-select response only checked the primary scenario; a follow-up question clarified the other three should not be excluded outright, just deprioritized.

---

## Tab/PWA Resume Simulation

| Option | Description | Selected |
|--------|-------------|----------|
| Dispatch visibilitychange | `page.evaluate()` dispatches document `hidden`→`visible` `visibilitychange` events — standard Playwright technique, exercises the actual resume-detection code path. | ✓ |
| Real backgrounding via new browser context | Close/reopen tab or fresh browser context — closer to real OS behavior but doesn't exercise the visibilitychange listener directly. | |

**User's choice:** Dispatch visibilitychange (recommended option).
**Notes:** Consistent with the user's choice to fully script the diagnosis rather than involve manual real-device testing.

---

## Diagnosis Output Format

| Option | Description | Selected |
|--------|-------------|----------|
| Matrix + scenario blocks | Summary table (route × path × stale/fresh × root cause) followed by one detailed scenario block per stale path (steps + expected-vs-actual + evidence). | ✓ |
| Narrative scenario blocks only | Skip the summary table; one detailed block per path tested. | |

**User's choice:** Matrix + scenario blocks (recommended option).
**Notes:** File name/location left to Claude's discretion (`24-DIAGNOSIS.md` in the phase directory).

---

## Claude's Discretion

- Diagnosis file name/location — no strong user preference expressed; `24-DIAGNOSIS.md` in the phase directory chosen as the natural GSD convention.
- Whether the throwaway Playwright script itself gets committed/retained vs. run-and-discard — left to the planner/executor to decide.

## Deferred Ideas

- Full cross-browser or real-device PWA backgrounding test — out of scope for this spike; `visibilitychange` dispatch is the accepted proxy.
- Diagnosing sync/card-edit/undo mutation scenarios in full depth if the throwaway harness makes them expensive — deferred to whenever Phase 26 touches those specific shells.
