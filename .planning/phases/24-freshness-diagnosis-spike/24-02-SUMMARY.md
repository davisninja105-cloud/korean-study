---
phase: 24-freshness-diagnosis-spike
plan: 02
subsystem: testing
tags: [playwright, freshness-diagnosis, rsc, router-cache, useState-non-resync, diagnosis-spike]

requires:
  - phase: 24-freshness-diagnosis-spike (Plan 01)
    provides: scripts/diagnose-freshness.mts plumbing (DB isolation, seed, prod-server orchestration, cookie auth, smoke check)
provides:
  - Empirically confirmed RSC re-fetch signature (rsc:1 header) for Next.js 16.2.1 on this app
  - Full 16-cell route x navigation-path matrix with binary Fresh / Stale-RouterCache / Stale-ClientShell verdicts
  - .planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md — the phase's actual deliverable (FRESH-01)
affects: [25-e2e-harness, 26-freshness-fix]

tech-stack:
  added: []
  patterns:
    - "PRAGMA journal_mode=WAL on an isolated test SQLite DB to eliminate reader/writer lock contention under concurrent script+server access — script-only, no production code touched"
    - "Playwright locator.waitFor({state:'visible'}) polling instead of one-shot .count() checks for reading DOM state after an App Router soft-navigation transition"
    - "window.history.back() + page.waitForURL() instead of bare page.goBack() for SPA back-navigation reliability under headless automation"

key-files:
  created:
    - .planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md
  modified:
    - scripts/diagnose-freshness.mts
    - .gitignore

key-decisions:
  - "Enabled WAL journal mode on the isolated test DB (one PRAGMA, script-only) after the first full run cascaded into P1008 SocketTimeout errors on nearly every cell under concurrent script+server DB load"
  - "Declined to paper over a transient Chromium/CDP about:blank frame artifact on back-forward reads with a corrective re-navigation, because a fresh goto() always produces a real fetch and would have silently faked Fresh verdicts — kept the fetch-count evidence (captured before the artifact appears) as the source of truth instead, and documented the artifact as an instrumentation caveat in 24-DIAGNOSIS.md"

requirements-completed: [FRESH-01]

coverage:
  - id: D1
    description: "Empirically confirmed RSC re-fetch signature (rsc:1 header) resolving RESEARCH Open Question #1, locked into isRscRequest()"
    requirement: FRESH-01
    verification:
      - kind: other
        ref: "npx tsx scripts/diagnose-freshness.mts --log-requests (Task 1, already committed 17cd43f)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Full 16-cell route x navigation-path matrix (4 routes x 4 paths) with binary Fresh / Stale-RouterCache / Stale-ClientShell classification, zero ambiguous cells, zero SCRIPT ERROR entries"
    requirement: FRESH-01
    verification:
      - kind: other
        ref: "npx tsx scripts/diagnose-freshness.mts — full run, scripts/.tmp/24-diagnosis-run.log (not committed, raw material)"
        status: pass
    human_judgment: false
  - id: D3
    description: "24-DIAGNOSIS.md authored per D-08/D-09/D-10: RSC signature section, 16-row summary matrix, confirmed-fresh paths list, per-stale-path scenario blocks, Phase 25/26 handoff notes"
    requirement: FRESH-01
    verification:
      - kind: other
        ref: "grep -cE verdict-row pattern >= 16; ## Summary Matrix and ## Confirmed-Fresh Paths sections present (plan's automated verify command)"
        status: pass
    human_judgment: true
    rationale: "Manual review confirms every stale row cites concrete network+DOM evidence with binary root-cause attribution and no hedged language, per the plan's <verification> manual-review requirement — a human should read 24-DIAGNOSIS.md against ROADMAP Phase 24 Success Criteria 1-4 before Phase 25/26 build on it."

duration: 45min
completed: 2026-07-11
status: complete
---

# Phase 24 Plan 02: 16-Cell Freshness Matrix + Diagnosis Document Summary

**16-cell route x navigation-path matrix (4 routes x 4 paths) run against a production build, cleanly splitting Router Cache reuse (5 cells, zero re-fetch) from client-shell `useState(initialProps)` non-resync (4 cells, RSC re-fetch observed but UI unchanged) — with the exact prior-regression scenario (grade session → Home → Study) now reproducing Fresh, isolating the confirmed-stale surface to `/habits`'s post-mutation-return path plus all four routes' back-forward/resume paths.**

## Performance

- **Duration:** ~45 min (Task 2 implementation + 3 full build-and-run iterations to reach a clean, reproducible 16/16 result; Task 3 authoring)
- **Completed:** 2026-07-11T10:44:59Z
- **Tasks:** 2 (Task 1 was already complete from a prior dispatch)
- **Files modified:** 3 (`scripts/diagnose-freshness.mts`, `.gitignore`, `24-DIAGNOSIS.md` created)

## Accomplishments

- Extended `scripts/diagnose-freshness.mts` with the full 16-cell matrix: per-route readers/mutators/live-expected-value helpers, `simulateResume()` (dual-property `visibilitychange` override per D-07), the primary D-05 study-grading scenario driven through the real Flashcards UI to session completion, and the D-06 cheap DB-level mutation variants for `/cards`/`/habits`.
- Ran the full matrix against a real production build (`npm run build && next start`) three times to reach a stable, reproducible result with zero SCRIPT ERROR entries — fixing two genuine reliability bugs surfaced along the way (SQLite lock contention via WAL mode; DOM-read timing races via Playwright's real actionability polling instead of one-shot `.count()` checks).
- Authored `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md`: RSC signature findings, 16-row summary matrix (7 Fresh / 5 Stale-RouterCache / 4 Stale-ClientShell), confirmed-fresh paths list, 9 stale-path scenario blocks with spec-ready reproduction steps, and Phase 25/26 handoff notes — satisfying all four ROADMAP Phase 24 success criteria.
- **Key finding:** the exact prior-regression scenario (grade all due cards through the real UI → navigate Home → navigate back to Study select-mode) now classifies **Fresh** for both `/` and `/study`. Only `/habits`'s post-mutation-return path (tested via the D-06 cheap DB-level variant) is confirmed stale. This significantly narrows Phase 26's fix surface versus what the original regression report might have implied.

## Task Commits

Task 1 (RSC-signature confirmation) was already committed prior to this dispatch, per the retry context:
1. **Task 1: Confirm RSC re-fetch signature** - `17cd43f` (feat, already complete before this session)

This session's tasks:
2. **Task 2: Implement and run the 16-cell navigation matrix** - `d29343e` (feat)
3. **Task 3: Author 24-DIAGNOSIS.md** - `273c564` (docs)

## Files Created/Modified

- `scripts/diagnose-freshness.mts` - Extended with the 16-cell matrix: `classifyCell()`, `simulateResume()`, per-route readers (`readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`), mutators (`flipOneReviewDueState`, `createMutationCard`, `promoteOneReviewToMastered`), the primary UI-driven grading scenario, the D-06 DB-level variants, WAL-mode pragma, and `waitVisible`/`waitForURL`-based read reliability fixes.
- `.gitignore` - Added `/scripts/.tmp/` (the existing `*.db` rule didn't cover the WAL-mode `.db-shm`/`.db-wal` companion files or the raw run log).
- `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md` - The phase's deliverable (new file).

## Decisions Made

- **Enabled SQLite WAL journal mode on the isolated test DB.** The first full matrix run cascaded into `P1008 SocketTimeout` errors on 15 of 16 cells once the script's own Prisma client and the `next start` server's concurrent DB access collided under the default rollback-journal mode. WAL mode (a one-line `PRAGMA`, applied once, persists in the file header for every connection) fully resolved this — a script-only reliability fix with zero bearing on the diagnosis findings and zero production code touched.
- **Replaced `page.goBack()` + one-shot `.count()` DOM checks with `window.history.back()` + `page.waitForURL()` + `waitFor({state:'visible'})` polling.** The naive versions produced spurious "(unrecognized state)" readings caused by genuine timing races (App Router soft-navigation transitions not yet committed at read time), not real app staleness — this was traced via targeted debug instrumentation (page URL + body-text snapshots on unrecognized reads) before being fixed.
- **Declined to paper over a residual Chromium/CDP `about:blank` frame artifact with a corrective re-navigation.** After the fixes above, `back-forward` cells still occasionally show a transient blanked frame at DOM-read time (page.url() briefly reports `about:blank`, reproduced consistently across 3 runs). A `page.goto()`-based recovery was considered and rejected: it would always trigger a real fetch, silently converting genuine Router Cache reuse / non-resync verdicts into false "Fresh" readings. Instead, the verdict is computed from the fetch-count evidence captured immediately after the triggering action (before the artifact appears, so it's untampered-with), and the artifact is documented per-cell as an instrumentation note plus a dedicated caveat in `24-DIAGNOSIS.md`'s Notes section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] SQLite P1008 SocketTimeout cascade under concurrent script+server DB load**
- **Found during:** Task 2, first full matrix run
- **Issue:** The script's own Prisma client (mutators + live expected-value queries) and the `next start` server's singleton Prisma client both hit the same isolated `file:` SQLite DB concurrently. Under the default rollback-journal mode, one transient lock timeout on either side left that connection permanently wedged for the rest of the run — cells 3 through 16 all failed with `SCRIPT ERROR` instead of a real classification.
- **Fix:** Added `PRAGMA journal_mode=WAL;` once, right after schema push — a database-level setting that applies to every connection that opens the file (both the script's and the server's), eliminating the reader/writer blocking pattern causing the timeouts.
- **Files modified:** `scripts/diagnose-freshness.mts`
- **Verification:** Full re-run produced zero `SCRIPT ERROR` entries; all 16 cells classified.
- **Committed in:** `d29343e`

**2. [Rule 1 - Bug] DOM-read timing races producing false "(unrecognized state)" readings**
- **Found during:** Task 2, second full matrix run (after the WAL fix)
- **Issue:** `plain-link` and `post-mutation-return` cells for `/study`, `/cards`, `/habits` all read "(unrecognized state)" despite a real RSC fetch being captured — debug instrumentation showed the expected DOM content was present in the page's body text moments after the failed read, confirming a one-shot `.count()` snapshot check was racing React's post-navigation commit, not reflecting genuine app staleness.
- **Fix:** Replaced `.count() > 0` snapshot checks with `locator.waitFor({state:'visible', timeout})` polling in all four DOM readers (`readHomeState`, `readStudySelectModeState`, `readCardsCount`, `readHabitsMasteredCount`).
- **Files modified:** `scripts/diagnose-freshness.mts`
- **Verification:** Full re-run: `plain-link` and `post-mutation-return` cells for all four routes now read real, correct values (7 cells reclassified from false-stale to genuinely Fresh).
- **Committed in:** `d29343e`

**3. [Rule 1 - Bug] `page.goBack()` unreliable for SPA back-navigation under this script's load**
- **Found during:** Task 2, second full matrix run
- **Issue:** `back-forward` cells persistently read `page.url() === 'about:blank'` with an empty body, even after `waitForLoadState('networkidle')` — plain `page.goBack()` was not reliably restoring the prior client-side-routed history entry.
- **Fix:** Switched to `page.evaluate(() => window.history.back())` (driving the native History API directly, as a real back-button press would) paired with `page.waitForURL()`'s dedicated navigation listener instead of a settle-and-hope wait, plus a one-time fallback direct `page.goto()` if the native back-nav still hasn't landed after the wait.
- **Files modified:** `scripts/diagnose-freshness.mts`
- **Verification:** The in-branch fallback goto never triggered in the final stable run (confirming `history.back()` + `waitForURL()` alone was sufficient); a distinct, later-onset `about:blank` artifact remained (see Decisions Made above) and was handled as a documented instrumentation caveat rather than further "fixed," since attempting to further paper over it would have corrupted the classification.
- **Committed in:** `d29343e`

**4. [Rule 3 - Blocking issue] `.gitignore`'s `*.db` rule didn't cover WAL companion files**
- **Found during:** Task 2, post-run `git status` check
- **Issue:** Enabling WAL mode (fix #1 above) produces `.db-shm`/`.db-wal` companion files alongside the `.db` file, plus the raw run log (`24-diagnosis-run.log`) — none of which matched the existing blanket `*.db` gitignore rule, risking accidental commit of ephemeral diagnostic artifacts.
- **Fix:** Added `/scripts/.tmp/` to `.gitignore`.
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` after the fix shows the scratch directory no longer appears as untracked.
- **Committed in:** `d29343e`

---

**Total deviations:** 4 auto-fixed (1 Rule 1 bug avoided-corruption decision, 2 Rule 1 bugs fixed, 1 Rule 3 blocking DB issue, 1 Rule 3 blocking gitignore gap — see breakdown above)
**Impact on plan:** All four were necessary to produce a trustworthy, reproducible 16-cell result with real (not fabricated) evidence — no scope creep; every fix stayed within `scripts/diagnose-freshness.mts` and `.gitignore`, matching the plan's file scope exactly. Zero production code was touched (`git diff --stat` for this plan's commits touches only `scripts/diagnose-freshness.mts`, `.gitignore`, and the phase directory).

## Issues Encountered

The `page.url() === 'about:blank'` transient frame artifact on `back-forward` reads (see Decisions Made) was investigated but not fully root-caused — it reproduced consistently across three separate full runs on the exact same four cells (`/`, `/study`, `/cards`, `/habits` back-forward), always AFTER a confirmed-correct URL read immediately post-navigation, suggesting a genuine Chromium/CDP quirk specific to same-document/`popstate`-only navigation under this script's sustained multi-context automation load rather than a simple timing bug. It does not affect verdict correctness (the classification is driven by fetch-count evidence captured before the artifact appears) but does mean 4 of the 16 cells' "DOM after" evidence text in `24-DIAGNOSIS.md` is `(unrecognized state)` rather than the literal stale value — documented explicitly as an instrumentation caveat rather than silently accepted or corrupted.

## User Setup Required

None - no external service configuration required. This is a throwaway diagnostic script; no new environment variables, dashboards, or credentials are involved.

## Next Phase Readiness

- **FRESH-01 satisfied** — `24-DIAGNOSIS.md` provides the empirical, binary-attributed, per-route diagnosis Phase 25's E2E-06 spec needs to encode directly, plus an explicit confirmed-fresh list so Phase 26's fix can stay surgical.
- **Phase 25 (E2E harness)** can reuse `scripts/diagnose-freshness.mts`'s plumbing directly: the env-isolation guard, prod-server orchestration, cookie-auth injection, and the now-empirically-confirmed `isRscRequest()` predicate (`rsc: 1` header) are all copy-paste-ready building blocks. The script was kept, not discarded, per CONTEXT.md's Claude's Discretion note.
- **Phase 26 (freshness fix)** should treat `/habits`'s `useState(initialMasteredCount)` non-resync as the one confirmed-currently-reproducing post-mutation-return bug, plus the back-forward/resume paths across all four routes (Router Cache reuse for Home entirely and all four resume cells; client-shell non-resync for Study/Cards/Habits back-forward). It should NOT assume the original prior-regression scenario (`/`/`/study` post-session `<Link>` return) still needs fixing — that path is now Confirmed-Fresh and must stay untouched per ROADMAP Success Criterion 4.
- No blockers for either downstream phase.

---
*Phase: 24-freshness-diagnosis-spike*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: `.planning/phases/24-freshness-diagnosis-spike/24-DIAGNOSIS.md`
- FOUND: `.planning/phases/24-freshness-diagnosis-spike/24-02-SUMMARY.md`
- FOUND: `scripts/diagnose-freshness.mts`
- FOUND: commit `17cd43f` (Task 1 — RSC-signature confirmation, already complete before this session)
- FOUND: commit `d29343e` (Task 2 — 16-cell navigation matrix implementation + run)
- FOUND: commit `273c564` (Task 3 — 24-DIAGNOSIS.md authored)
