---
phase: 22-findings-driven-prompt-improvement-corpus-fixes
plan: 03
subsystem: database
tags: [prisma, turso, corpus-fix, audit, dry-run-gated-script]

# Dependency graph
requires:
  - phase: 22-findings-driven-prompt-improvement-corpus-fixes (plan 01)
    provides: word-boundary-aware single-char blank-safety predicate — resolved card 다's zero-safe finding by rule change with zero DB write, consumed transitively by this plan's post-fix audit
  - phase: 22-findings-driven-prompt-improvement-corpus-fixes (plan 02)
    provides: revised extraction prompt (PROMPT-01) + validated PASS after-run diff (PROMPT-02), cited as evidence in this plan's fix report
provides:
  - "scripts/fix-corpus-2026-07.mts — dry-run-gated in-place corpus fix script (retro-filter-cleanup.mts convention): 9 front rewrites + 철 sentence creation, collision-re-checked at write time"
  - "9 audit-flagged card fronts rewritten in place by id in the live Turso deck (front + normalizedFront together, zero Card delete/recreate, FSRS/ReviewLog untouched)"
  - "3 new Sentence rows for zero-sentence card 철 (targetForm 철, Exposure/multiple-choice-only per D-04)"
  - ".planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-POST-FIX-AUDIT.md — post-fix audit-cards.mts report proving the targeted findings cleared, by card id"
  - ".planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-FIX-REPORT.md — applied-fixes ledger + no-DB-write resolutions + accepted-residuals register (D-04/D-09/D-10) + post-audit-arrival cards flagged out of scope"
affects: [future-corpus-audits, future-card-editor-work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dry-run-by-default fix script with a write-time collision re-check (not just research-time) before any production write — retro-filter-cleanup.mts convention extended to a second script"
    - "Post-fix audit verification by card id, not raw counts — drift-proof against cron-sync deck growth between audit snapshots"

key-files:
  created:
    - scripts/fix-corpus-2026-07.mts
    - .planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-POST-FIX-AUDIT.md
    - .planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-FIX-REPORT.md
  modified: []

key-decisions:
  - "Applied the dry-run report exactly as approved by the user ('Approved as-is') — no REWRITES/CHEOL_SENTENCES adjustments needed before --apply"
  - "Backed up the Phase 21 evidence file to /tmp before the audit re-run as an extra safety net, even though the UTC date differed (2026-07-10 vs 2026-07-07) and no path collision was expected — confirmed byte-identical after the re-run"
  - "Documented 2 new romanization-flagged cards (거/게) that arrived via cron sync between the Phase 21 snapshot and this post-fix audit as out-of-scope post-audit arrivals in the fix report, rather than silently folding them into this phase's fix count"

requirements-completed: [FIX-01, FIX-02]

coverage:
  - id: D1
    description: "9 romanization-flagged card fronts rewritten in place by id to their locked Hangul-only values (D-06/D-07/D-08), front+normalizedFront updated atomically, zero collisions, zero Card delete/recreate"
    requirement: "FIX-01"
    verification:
      - kind: other
        ref: "npx tsx scripts/fix-corpus-2026-07.mts --apply — apply report: 9 updates, 0 collisions, 0 aborts"
        status: pass
      - kind: other
        ref: "22-POST-FIX-AUDIT.md — all 9 REWRITES ids absent from the Flagged fronts section (awk-scoped grep gate)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Card 철 (zero-sentence finding) fixed with 3 new natural Korean sentences; card no longer zero-sentence, correctly appears as the sole zero-safe residual (accepted, D-04)"
    requirement: "FIX-01"
    verification:
      - kind: other
        ref: "22-POST-FIX-AUDIT.md — Zero-sentence cards: 0; card 철's id present under Zero-safe cards section"
        status: pass
    human_judgment: false
  - id: D3
    description: "Card 다's zero-safe finding resolved with zero DB writes via the plan 22-01 sentenceMatch() rule change alone"
    requirement: "FIX-01"
    verification:
      - kind: other
        ref: "22-POST-FIX-AUDIT.md — card 다's id (cmqlm1w0u014k0gsa6eydclfd) absent everywhere in the post-fix report"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fix script is dry-run by default, --apply-gated, collision-re-checked at execution time (not just research time), and report-printing identically in both modes"
    requirement: "FIX-02"
    verification:
      - kind: other
        ref: "scripts/fix-corpus-2026-07.mts — grep gate: no card.delete/deleteMany/create/createMany; normalizeFront imported; dry-run report matched Task 1's automated verify"
        status: pass
    human_judgment: false
  - id: D5
    description: "All deliberate non-fixes documented as accepted residuals with decision IDs in 22-FIX-REPORT.md: CRT/DST loanwords (D-09, fronts+sentences), both near-duplicate clusters (D-10, reviewed-not-duplicate), 철 as zero-safe (D-04)"
    requirement: "FIX-02"
    verification:
      - kind: other
        ref: "22-FIX-REPORT.md — contains 'reviewed-not-duplicate' register plus D-09/D-04 residual rows"
        status: pass
    human_judgment: false
  - id: D6
    description: "Phase 21 evidence report (.planning/audits/card-audit-2026-07-07.md) survives this phase's audit re-run byte-identical"
    verification:
      - kind: other
        ref: "git diff --quiet HEAD -- .planning/audits/card-audit-2026-07-07.md"
        status: pass
    human_judgment: false
  - id: D7
    description: "Manual spot-check: rewritten fronts render correctly with review history intact; 철's sentences render with targetForm highlighted in CardEditor"
    verification: []
    human_judgment: true
    rationale: "UI rendering verification requires opening the live Cards page and CardEditor in a browser — deferred to phase-level /gsd-verify-work per 22-VALIDATION.md, consistent with plan 22-01's D5 deferral pattern."

# Metrics
duration: ~25min (this session, Task 3 only; Tasks 1-2 completed in prior sessions)
completed: 2026-07-10
status: complete
---

# Phase 22 Plan 03: Corpus fix — apply, re-audit, fix report Summary

**Applied all 9 audit-flagged front rewrites and 3 new 철 sentences in place by id against the live Turso production deck via a dry-run-gated script, proved the findings cleared with a post-fix audit re-run verified by card id, and closed the phase's findings loop with a fix report documenting every accepted residual.**

## Performance

- **Duration:** ~25 min (this session, Task 3 continuation — dry-run script and Task 1 commit were completed in a prior session; Task 2's checkpoint was resolved by the human user between sessions)
- **Started:** 2026-07-10T15:30:00Z (approx., this session)
- **Completed:** 2026-07-10T15:56:00Z
- **Tasks:** 3/3 complete (Task 1 in prior session, Task 2 checkpoint approved by user, Task 3 this session)
- **Files modified/created (this session):** 3 (`scripts/fix-corpus-2026-07.mts` unchanged/reused, `22-POST-FIX-AUDIT.md`, `22-FIX-REPORT.md`, plus a dated audit report `.planning/audits/card-audit-2026-07-10.md`)

## Accomplishments

- Ran `npx tsx scripts/fix-corpus-2026-07.mts --apply` against the live production Turso deck: 9 card fronts rewritten in place by id (front + normalizedFront together, per CLAUDE.md's hard rule), 3 new Sentence rows created for card 철. Zero collisions, zero aborts, zero Card delete/recreate — FSRS/ReviewLog history for every touched card is untouched.
- Re-ran `npx tsx scripts/audit-cards.mts` and captured the post-fix report at `22-POST-FIX-AUDIT.md`. Confirmed by card id (not raw counts, which are drift-sensitive): card 다's id absent everywhere; zero-sentence count is 0; all 9 REWRITES ids gone from the flagged-fronts section; the CRT front id still flagged (accepted D-09); card 철's id now appears under zero-safe (accepted D-04, the card is Exposure/multiple-choice-only by design).
- Verified the Phase 21 evidence report (`.planning/audits/card-audit-2026-07-07.md`) survives byte-identical — backed it up to `/tmp` before the re-run as an extra safety margin, then confirmed via `git diff --quiet` after.
- Identified 2 cards that arrived via cron sync between the Phase 21 snapshot and this post-fix audit (거/게, ids `cmrbwv4h1000504l9tbdf39w0`/`cmrbwv4we000904l99ya3oa8d`) that were not in the original 10 findings — documented them in the fix report as out-of-scope post-audit arrivals rather than silently absorbing them into this phase's fix count.
- Wrote `22-FIX-REPORT.md` with the three required sections: applied DB fixes (9 rewrites + 철 sentences), resolved-without-writes (card 다 via the 22-01 rule change, cross-referenced against 22-02's PROMPT-01/02 PASS evidence), and the accepted-residuals register (CRT/DST loanwords D-09 for both fronts and sentences, both near-duplicate clusters D-10 reviewed-not-duplicate, 철 as zero-safe D-04).
- `npm test` (218/218) and `npm run lint` (0 errors, 1 pre-existing unrelated warning in `StudySession.tsx`) both green.

## Task Commits

1. **Task 1: Write scripts/fix-corpus-2026-07.mts and run the dry-run** - `2ebc66f` (feat) — *prior session*
2. **Task 2: Approve the dry-run report before writing to production** - checkpoint, no commit (human approval: "Approved as-is") — *between sessions*
3. **Task 3: Apply, re-audit, and write the phase fix report** - `63324c3` (feat) — *this session*

**Plan metadata:** pending (this commit, docs: complete plan)

## Files Created/Modified

- `scripts/fix-corpus-2026-07.mts` - Dry-run-gated corpus fix script (written in Task 1, unchanged in Task 3 since the user approved as-is — no REWRITES/CHEOL_SENTENCES edits needed).
- `.planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-POST-FIX-AUDIT.md` - Post-fix `audit-cards.mts` report (copy of `.planning/audits/card-audit-2026-07-10.md`), the "after" side of the phase's findings-cleared evidence.
- `.planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-FIX-REPORT.md` - Applied-fixes ledger, no-DB-write resolutions, accepted-residuals register, and out-of-scope post-audit-arrival flags.
- `.planning/audits/card-audit-2026-07-10.md` - Dated audit output (new UTC date, no collision with the Phase 21 report; left in place per the plan's instruction).

## Decisions Made

- Applied the dry-run report exactly as approved ("Approved as-is") — no adjustments to `REWRITES` or `CHEOL_SENTENCES` were needed before `--apply`.
- Backed up the Phase 21 evidence file to `/tmp` before running the post-fix audit, as an extra safety margin beyond the plan's git-checkout-based preservation guard, even though the UTC date had already advanced past 2026-07-07 and no collision was structurally possible.
- Documented the 2 newly-arrived romanization-flagged cards (거/게) as explicitly out of this phase's bounded fix scope rather than silently treating them as pre-existing findings — keeps the fix report's scope claims accurate against the live, still-growing deck.

## Deviations from Plan

None - plan executed exactly as written. The checkpoint's dry-run report was approved verbatim with no sentence or front adjustments, so Task 3 proceeded directly to `--apply` with the script unchanged from Task 1.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FIX-01 and FIX-02 are both complete: the live corpus is corrected in place, every deliberate non-fix is documented with its decision ID, and the post-fix audit proves the fix by card id in a drift-proof way.
- The phase goal ("prompt improved AND high-confidence existing-card issues corrected in place") is now fully closed across all three plans (22-01 rule change, 22-02 prompt revision + eval, 22-03 corpus fix + report).
- Two new post-audit-arrival cards (거/게) are flagged in `22-FIX-REPORT.md` for a future audit/fix cycle to pick up — not a blocker for this phase, just forward visibility.
- Manual spot-check (rewritten front rendering + review history intact; 철's sentences with highlighted targetForm in CardEditor) is deferred to phase-level `/gsd-verify-work` per `22-VALIDATION.md`, consistent with plan 22-01's UI-check deferral pattern.

## Self-Check: PASSED

- FOUND: scripts/fix-corpus-2026-07.mts
- FOUND: .planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-POST-FIX-AUDIT.md
- FOUND: .planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-FIX-REPORT.md
- FOUND: .planning/audits/card-audit-2026-07-10.md
- FOUND commit: 2ebc66f (Task 1)
- FOUND commit: 63324c3 (Task 3)
- `git diff --quiet HEAD -- .planning/audits/card-audit-2026-07-07.md` confirms Phase 21 evidence unmodified
- `npm test` (218/218 pass), `npm run lint` (0 errors) both green

---
*Phase: 22-findings-driven-prompt-improvement-corpus-fixes*
*Completed: 2026-07-10*
