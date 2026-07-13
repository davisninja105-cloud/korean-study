---
phase: 26-freshness-fix
verified: 2026-07-12T23:59:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "Resuming the app after it was backgrounded refreshes stale data (FRESH-05) — was FAILED (/study resume 0/7), now VERIFIED"
    - "Browser back/forward shows fresh data (FRESH-04) — was PARTIAL (/study back-forward flaky under combined-suite load), now VERIFIED"
    - "Prop re-sync never clobbers an in-flight interaction (FRESH-02) — was PRESENT_BEHAVIOR_UNVERIFIED (zero automated coverage), now VERIFIED via e2e/freshness-gate.spec.ts"
  gaps_remaining: []
  regressions: []
---

# Phase 26: Freshness Fix Verification Report (Re-Verification)

**Phase Goal:** Client shells re-sync to fresh server props at real resume/mutation boundaries (via `router.refresh()` + gated render-phase prop-sync + a `FreshnessWatcher`), turning Phase 25's red freshness-regression spec green while keeping first-load speed and the no-flash guarantee intact.
**Verified:** 2026-07-12T23:59:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plans 26-04, 26-05, 26-06)

## Goal Achievement

### Observable Truths

| # | Truth | Prior Status | Status Now | Evidence |
|---|-------|--------------|------------|----------|
| 1 | Returning to Home/Habits/Cards after a study session shows updated stats/due-count/cards immediately (FRESH-03) | ✓ VERIFIED | ✓ VERIFIED | Unchanged. `post-mutation-return` cells (fresh-paths.spec.ts + client-shell.spec.ts) passed in both of this session's live combined-sweep re-runs (19/19 both times) |
| 2 | Browser back/forward shows fresh data, not stale cached RSC (FRESH-04) | ⚠ PARTIAL (gap) | ✓ VERIFIED | `/study back-forward` — the specific cell that failed under combined-suite load in the original verification — passed 5/5 in this session's isolated re-runs AND in both 19/19 combined sweeps. `/`, `/cards`, `/habits` back-forward remained reliable throughout |
| 3 | Resume after backgrounding refreshes stale data, incl. overnight cron-sync case (FRESH-05) | ✗ FAILED (was 0/7 for /study) | ✓ VERIFIED | `/study resume` — 5/5 in this session's independent isolated re-runs (baseline was 0/7). `/habits resume` — 5/5 (baseline was ~50%). Both also green in 2× combined 19/19 sweeps run independently in this session |
| 4 | Prop re-sync never clobbers an in-flight interaction — active session/open sheet preserved (FRESH-02) | ⚠ PRESENT_BEHAVIOR_UNVERIFIED | ✓ VERIFIED | `e2e/freshness-gate.spec.ts`'s two cells (mid-session non-clobber, open-sheet non-clobber) passed in both of this session's live combined-sweep runs (4/4 executions total: 2 runs × 2 cells) |
| 5 | First-load speed unchanged, no loading-flash reintroduced on any of the 4 routes (FRESH-06) | ✓ VERIFIED | ✓ VERIFIED | Unchanged. `smoke.spec.ts` 5/5 in this session's live run; `freshness-fresh-paths.spec.ts` plain-Link exact-one-fetch cells green in both combined sweeps |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified, 0 failed/partial)

### Independent Live Re-Test Evidence (executed directly by this verifier in this session — not read from SUMMARY.md)

All commands below were run fresh against a rebuilt post-merge production server (`lsof -ti:3100 | xargs kill -9` before the first run), independently of the 26-05/26-06 executor's own runs.

| Behavior | Command | Result | 26-VERIFICATION.md Baseline |
|----------|---------|--------|------------------------------|
| Combined 4-file sweep, run 1 | `npx playwright test e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts --reporter=line` | **19/19 passed** (1.2m) | Run 1 was 14/17 (no gate cells existed then) |
| Combined 4-file sweep, run 2 | same | **19/19 passed** (1.1m) | Run 2 was 16/17 |
| `/study resume` ×5 isolated | `npx playwright test e2e/freshness-router-cache.spec.ts --grep "/study resume serves"` | **5/5 passed** | 0/7 (7 independent executions all failed) |
| `/study back-forward` ×5 isolated | `npx playwright test e2e/freshness-client-shell.spec.ts --grep "/study back-forward serves"` | **5/5 passed** | Reliable in isolation (2/2) but failed under combined-suite load |
| `/habits resume` ×5 isolated | `npx playwright test e2e/freshness-router-cache.spec.ts --grep "/habits resume serves"` | **5/5 passed** | 1/2 (~50%) |
| `smoke.spec.ts` (FRESH-06 guard) | `npx playwright test e2e/smoke.spec.ts --reporter=line` | **5/5 passed** | 5/5 (unchanged) |
| `npm run lint` | — | **0 errors** (1 pre-existing unrelated `StudySession.tsx` warning) | 0 errors (unchanged) |
| `npx tsc --noEmit` (filtered) | — | **0 errors** | 0 errors (unchanged) |
| `npm test` (Vitest) | — | **241/241 passed** | 241/241 (unchanged) |
| Debt-marker scan on all files this wave touched | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` on `FreshnessWatcher.tsx`, `app/layout.tsx`, `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx`, `freshness-gate.spec.ts` | **0 matches** | 0 matches |

**Interpretation:** Every previously-flaky cell (`/study resume`, `/study back-forward`, `/habits resume`) was independently re-run in this session — a total of 15 isolated executions plus 4 combined-sweep appearances (19 executions/run × 2 runs, of which these three cells each appear once per run) — and every single execution passed. This is not a re-statement of the executor's own SUMMARY claims; it is a fresh, independently-executed reproduction against the current `main` code, and it matches 26-05-SUMMARY.md's and 26-06-SUMMARY.md's reported numbers exactly (5/5, 5/5, 5/5, 19/19 twice). The delivery-reliability gap that blocked the original verification is closed.

### Required Artifacts (current state, re-confirmed by direct file read)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/FreshnessWatcher.tsx` | Now a context provider: `router.refresh()` + route-scoped JSON backstop fetch, exposed via `useFreshPayload()` | ✓ VERIFIED (exists, substantive, wired) | 185 lines; exports default `FreshnessWatcher({ children })`, `useFreshPayload`, `FreshPayloads`, `HabitsFreshPayload`; `fetchBackstop()` dispatches `/api/cards/due` (`/study`), `/api/cards` (`/cards`), `/api/activity`+`/api/stats` (`/habits`); pathname re-checked before every `setPayloads`; all 3 original listeners + 300ms coalesce guard preserved verbatim |
| `app/layout.tsx` | `<FreshnessWatcher>` wraps the GlossProvider/Nav/main subtree (not a self-closing sibling) | ✓ VERIFIED | `<FreshnessWatcher>` opens at line 82, `</FreshnessWatcher>` closes after the subtree |
| `components/StudyClient.tsx` | `prevFreshStudy` gated backstop-adoption block, gate identical to `prevInitialCards` | ✓ VERIFIED (exists, substantive, wired) | Lines 155-168; `useFreshPayload()` destructured; adopts via `setStudyCards(freshStudy)` + `setScope('due')` only when `freshStudy !== null && phase === 'select-mode' && !isFilterLoading && isFullSpan(...)` — character-identical gate to the existing `prevInitialCards` block plus the null check |
| `components/CardsClient.tsx` | `prevFreshCards` gated backstop-adoption block, gate identical to `prevInitialCards` | ✓ VERIFIED (exists, substantive, wired) | Lines 93-100; adopts via `setCards(freshCards)` only when `freshCards !== null && editingId === null && !showAdd && !adding && deletingIds.size === 0` |
| `components/HabitsClient.tsx` | `freshOverride` derived-read layer; props win over backstop when fresher RSC props arrive | ✓ VERIFIED (exists, substantive, wired) | Lines 77-119; `days`/`goal`/`masteredCount`/`dayStartHour`/`cardsByState` all derive `freshOverride ? freshOverride.X : initialX`; `prevInitialDays` block clears the override when fresher RSC props land; today-effect (CR-01 fix) dependency array is `[dayStartHour, days, masteredCount]` |
| `e2e/freshness-gate.spec.ts` | 2 automated FRESH-02 cells (mid-session, open-sheet non-clobber) | ✓ VERIFIED (exists, substantive, wired, passing) | 2 test cells present; both passed in this session's 2 independent combined-sweep runs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `app/layout.tsx` | `components/FreshnessWatcher.tsx` | JSX wrap around GlossProvider/Nav/main | ✓ WIRED | Confirmed by direct read |
| `components/FreshnessWatcher.tsx` | `/api/cards/due`, `/api/cards`, `/api/activity`+`/api/stats` | Route-dispatched `fetch()` inside the coalesced boundary handler | ✓ WIRED | Confirmed; response validated (`Array.isArray`/truthiness) before entering state; pathname re-checked at response time |
| `components/StudyClient.tsx` | `components/FreshnessWatcher.tsx` | `useFreshPayload().study` consumed via `prevFreshStudy` gate | ✓ WIRED | Confirmed; live e2e (`freshness-router-cache.spec.ts`, `freshness-gate.spec.ts`) exercises this path and passes |
| `components/CardsClient.tsx` | `components/FreshnessWatcher.tsx` | `useFreshPayload().cards` consumed via `prevFreshCards` gate | ✓ WIRED | Confirmed; live e2e exercises this path and passes |
| `components/HabitsClient.tsx` | `components/FreshnessWatcher.tsx` | `useFreshPayload().habits` → `freshOverride` | ✓ WIRED | Confirmed; live e2e exercises this path and passes |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| FRESH-02 | 26-03 (impl), 26-04 (e2e proof) | Gated client-shell re-sync, never clobbers in-flight interaction | ✓ SATISFIED | Was `PRESENT_BEHAVIOR_UNVERIFIED`; now proven by 2 automated e2e cells, independently re-run twice in this session (4/4 pass) |
| FRESH-03 | 26-01, 26-03 | Post-study-session return shows updated stats/due-count/cards | ✓ SATISFIED | Unchanged from original pass; `post-mutation-return` cells green in this session's re-runs |
| FRESH-04 | 26-01, 26-02, 26-03, 26-05 (fix) | Back/forward shows fresh data | ✓ SATISFIED | Was `PARTIAL`; the JSON backstop closes the `/study back-forward` gap — 5/5 isolated + reliable across 2 combined 19/19 sweeps, independently confirmed |
| FRESH-05 | 26-01, 26-02, 26-03, 26-05 (fix) | Resume after backgrounding refreshes stale data | ✓ SATISFIED | Was `FAILED` (0/7 for `/study`); the JSON backstop closes the gap — `/study resume` 5/5, `/habits resume` 5/5, independently confirmed |
| FRESH-06 | 26-01, 26-02, 26-03 | No first-load regression, no flash | ✓ SATISFIED | Unchanged; smoke 5/5, fresh-paths green in this session's re-runs |

**REQUIREMENTS.md checkbox discrepancy — investigated, not a regression.** FRESH-03 and FRESH-06 checkboxes remain unchecked (`[ ]`) in `.planning/REQUIREMENTS.md` while FRESH-02/04/05 are checked (`[x]`). Traced via `git log -p -- .planning/REQUIREMENTS.md`: commit `56e9bb8` ("docs(26-06): mark FRESH-02/04/05 complete") only flipped the three IDs its own gap-closure plans' `requirements:` frontmatter declared (26-04 → FRESH-02; 26-05/26-06 → FRESH-04, FRESH-05) — it did not touch FRESH-03/06 because neither gap-closure plan claimed them. FRESH-03/06 were already unchecked *before* that commit and were never flipped during the original 26-01/02/03 execution either (that phase never reached ship-time bookkeeping because it landed in `gaps_found`). This is deferred checkbox bookkeeping, not a code regression — both FRESH-03 and FRESH-06 are independently re-confirmed passing in this verification's live evidence above (post-mutation-return cells and smoke/fresh-paths cells respectively). Recommend flipping both checkboxes at ship time alongside this verification's pass.

No orphaned requirements — all 5 phase requirement IDs (FRESH-02..06) appear across at least one plan's frontmatter `requirements:` field (26-01: FRESH-03/04/05/06; 26-02: FRESH-04/05/06; 26-03: FRESH-02/03/04/05/06; 26-04: FRESH-02; 26-05: FRESH-04/05; 26-06: FRESH-02/04/05).

### Anti-Patterns Found

None. Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) across all 6 files this wave touched (`FreshnessWatcher.tsx`, `app/layout.tsx`, `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx`, `freshness-gate.spec.ts`) returned zero matches, confirmed independently in this session.

### WR-01 Race Condition Assessment (26-REVIEW.md) — Judged Non-Blocking, Tracked as Residual Risk

**Finding (confirmed present by direct code read):** `fetchBackstop()` re-checks `window.location.pathname` before every `setPayloads` call, correctly preventing cross-route contamination, but has no request-sequencing guard. Two narrow race windows exist:
1. Two boundary events for the same route, both past the 300ms coalesce window, whose backstop responses arrive out of network order — the older response can overwrite the newer one.
2. A slow backstop fetch outlives a quick navigate-away-and-back-to-the-same-route cycle; the stale response lands after a fresh `StudyClient`/`CardsClient`/`HabitsClient` instance mounts, and if that instance's gate happens to be open (very plausible immediately post-navigation), the stale data is adopted, overwriting the just-mounted shell's genuinely fresher server-rendered props.

**Assessment:** This is a real, credible gap in the implementation — confirmed present by reading `components/FreshnessWatcher.tsx` directly (no `useRef` sequence counter or generation tag exists anywhere in the file). It is judged a **non-blocking residual risk (WARNING)**, not a phase-blocking gap, for four reasons: (a) it requires a specific, narrow timing window — two boundary events on the identical route close enough to be independently in-flight but far enough apart to escape the 300ms coalesce guard, or a fast-round-trip re-navigation racing a slow fetch; (b) the impact is bounded — no data loss, client-state only, and self-heals at the very next real boundary event (visibilitychange/popstate/pageshow all fire again on ordinary use); (c) it did not reproduce in any of the 44 independent e2e executions run in this verification session (2×19 combined-sweep executions + 15 isolated re-runs of the exact previously-flaky cells), nor in the executor's own 34 recorded executions across 26-04/05/06; (d) the review itself (26-REVIEW.md) rates it Warning, not Critical, and supplies a concrete, low-risk fix (a monotonic sequence ref per slice) suitable for a fast follow-up rather than a phase re-open. This does not falsify FRESH-04 or FRESH-05 as currently, observably true — it identifies a plausible future failure mode of the very mechanism that makes them true today.

**Recommendation:** File WR-01's sequence-number fix as tracked follow-up work (alongside the carried-forward WR-02 `lessons`-state staleness and WR-03 shared-coalesce-window findings, neither of which is new to this wave and neither of which was fixed or worsened by Plans 26-04/05/06). None of the three warnings are treated as gaps in this verification.

## Gaps Summary

**No gaps remain.** All three items that blocked the original verification are closed and independently re-confirmed in this session:

- **FRESH-05** (was FAILED, `/study resume` 0/7): Plan 26-05's JSON re-fetch backstop bypasses the Next.js 16.2.1 Suspense/Segment-Cache delivery path entirely. Independently re-tested in this session: `/study resume` 5/5, `/habits resume` 5/5.
- **FRESH-04** (was PARTIAL, `/study back-forward` flaky under combined load): Same backstop mechanism. Independently re-tested: `/study back-forward` 5/5, plus reliable across 2 independently-run 19/19 combined sweeps.
- **FRESH-02** (was PRESENT_BEHAVIOR_UNVERIFIED): Plan 26-04's `e2e/freshness-gate.spec.ts` adds automated coverage for both named human-verification scenarios. Independently re-tested: both cells passed in 2 independent combined-sweep runs.

FRESH-03 and FRESH-06, already verified in the original pass, remain verified — re-confirmed by live re-test in this session, unaffected by the Wave 4/5 changes. Their unchecked REQUIREMENTS.md checkboxes are deferred bookkeeping (traced via git log, not a regression — see Requirements Coverage above); recommend flipping them at ship time.

The one credible residual-risk finding from code review (WR-01, a narrow same-route response-ordering race in the new JSON backstop) is judged non-blocking given its bounded, self-healing impact and its failure to reproduce across 44 independent live executions in this session — tracked as recommended follow-up work, not a phase gap.

**Phase goal achieved.** The freshness-regression spec suite is reliably green — independently reproduced twice in full and 15 additional times in isolation in this verification session, not merely reported green by the executor.

---

_Verified: 2026-07-12T23:59:00Z_
_Verifier: Claude (gsd-verifier) — re-verification pass_
