---
phase: 22-findings-driven-prompt-improvement-corpus-fixes
verified: 2026-07-10T09:20:00Z
status: human_needed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Read the revised prompt bullets in lib/extract-cards.ts (front-field rewrite, loanword exception, blank-safety clause b, annotation ledger) for prose quality"
    expected: "Each edit reads naturally and is clearly annotated to its error class (D-06/D-07/D-08/D-09) — not just grep-detectable, but genuinely comprehensible to a future editor"
    why_human: "No automated test can assert prompt prose quality; 22-VALIDATION.md explicitly marks this manual-only"
  - test: "Exercise Study flow (flashcard fill-blank/Recall) for one newly-safe isolated single-char card (다) and one still-unsafe embedded case (e.g. 물, 철), plus open CardEditor for 다 and for a rewritten front (e.g. 동사 ~는)"
    expected: "다 now blanks correctly in Recall mode; embedded single-char cards still fall back to Exposure; rewritten fronts render correctly in Cards list and CardEditor with review history (FSRS state) intact"
    why_human: "Visual/interaction correctness in HighlightedSentence/StudySession/CardEditor isn't captured by unit tests; both 22-01-PLAN.md and 22-03-PLAN.md explicitly defer this to phase-level /gsd-verify-work"
  - test: "Open card 철 in CardEditor and confirm its 3 new sentences render with 철 (correctly) shown un-blankable, and that the card studies in Exposure/multiple-choice modes without error"
    expected: "Sentences display naturally (철은/철로/지하철); Recall/fill-blank mode is unavailable for this card (accepted per D-04) without a rendering error"
    why_human: "UI rendering verification requires a live browser session; 22-03-SUMMARY.md D7 defers this explicitly"
---

# Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes Verification Report

**Phase Goal:** The audit findings are acted on end-to-end — the extraction prompt is revised against the evidence and validated on real lessons (before it is trusted), then high-confidence existing-card issues are corrected in place.
**Verified:** 2026-07-10T09:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Sourced from ROADMAP.md Phase 22 Success Criteria (4) plus PLAN frontmatter must-haves (22-01, 22-02, 22-03), deduplicated.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `extract-cards.ts` prompt is revised against the current card schema and the audit report, each edit annotated to its error class | VERIFIED | `lib/extract-cards.ts` lines 77-79 (annotation ledger naming D-06/D-07/D-08/D-09); English-labeled grammar examples ("Action verb", "direction particle") confirmed absent (`grep -c` = 0); 동사/형용사/작을 소/CRT/DST all present. Commit `9317a02`. |
| 2 | A non-persisting `scripts/prompt-eval.mts` re-runs extraction on a real-lesson sample and diffs audit-check counts against a saved baseline, without a full-corpus re-run | VERIFIED | Script exists (532 lines), zero Prisma write calls (verified by reading the file — only `findMany`/`findUnique`/`findFirst` reads), reuses `frontHasRomanization`/`sentenceHasRomanization`/`classifyBlankSafety` from `lib/audit-checks.ts` (dynamic import, never reimplemented), samples lessons orderIndex 4/12/17 with runtime `ANCHOR_CARDS` verification. Committed baseline `prompt-eval-baseline.json` (capturedAt 2026-07-08T01:14:54Z, before any prompt edit — confirmed by commit order: `7bc2545` precedes `9317a02`). |
| 3 | The after-run diff shows the targeted error classes improve per the D-12 bar (must improve, not necessarily hit zero) | VERIFIED | `22-02-SUMMARY.md` records a real live after-run (commit `521fe65`, run in the main checkout with real credentials): frontRomanization 4→0 (PASS), zeroSafe/zeroSentence held at 0 (PASS), sentenceRomanization 0→3 correctly marked non-gating per the plan's own D-09 rule (commit `95c6219` fixed the verdict-computation bug that had wrongly gated on this). Exit code 0, explicit "Verdict: PASS" printed. Not independently re-run in this verification pass to respect the plan's own hard budget of "maximum 2 after-runs total" (both already consumed) and to avoid unnecessary real Anthropic API cost — verified instead via git commit order, code inspection of the verdict logic, and cross-consistency between the baseline JSON, the prompt diff, and the SUMMARY's printed table. |
| 4 | High-confidence quality issues are corrected in the database by mutating cards in place by id — never delete-and-recreate, preserving FSRS state and ReviewLog history | VERIFIED (live re-check) | Re-ran `npx tsx scripts/audit-cards.mts` against the live production Turso DB during this verification (read-only). Output is byte-identical to the committed `22-POST-FIX-AUDIT.md`: card 다's id absent everywhere; zero-sentence count = 0; all 9 REWRITES ids absent from flagged fronts; CRT front still flagged (accepted D-09); card 철 present under zero-safe (accepted D-04). `scripts/fix-corpus-2026-07.mts` contains no `card.delete`/`card.create` calls (grep-verified) — only `prisma.card.update()` by id and additive `prisma.sentence.create()`. |
| 5 | Every fix script defaults to dry-run and requires an explicit `--apply` flag to write, matching the `retro-filter-cleanup.mts` pattern | VERIFIED | `scripts/fix-corpus-2026-07.mts`: `const APPLY = process.argv.includes('--apply')`; prints DB host + mode before any query; writes gated behind `if (!APPLY) { ...; process.exit(0) }` before the transaction block. |
| 6 | Card 다's zero-safe finding is resolved with zero DB writes via the word-boundary `sentenceMatch()` rule change (D-01/D-02/D-03) | VERIFIED | `lib/sentence-match.ts` implements the isolated-vs-embedded Hangul-adjacency rule exactly as specified; `tests/sentence-match.test.ts` encodes all 7 behavior cases from the plan and all pass (`npx vitest run` → 50/50 passed). Live audit re-run confirms 다's card id no longer appears anywhere in the flagged report. |
| 7 | Card 철 gets natural example sentences and is no longer zero-sentence (Recall/fill-blank ineligibility explicitly accepted per D-04) | VERIFIED | Live audit re-run: zero-sentence count = 0; card 철's id appears under zero-safe (expected — its sentences glue particles directly per natural Korean, same functional outcome as before the rule change, exactly as D-04 anticipated during planning, not an after-the-fact rationalization — confirmed in `22-CONTEXT.md` line 28, written before execution). Code review (`22-REVIEW.md` WR-01) notes a better-alternative sentence wording existed that would have made 철 also blank-safe — a legitimate quality suggestion, not a contradiction of the accepted must-have. |
| 8 | 2+-character `sentenceMatch` behavior is byte-for-byte unchanged; full Vitest suite passes | VERIFIED | `npm test` → 218/218 tests passed (15 files) including `tests/extract-cards.test.ts` (unmodified per plan, fixture at the single-char case 물/을 still embedded/unsafe as predicted) and `tests/audit-checks.test.ts` (transitively exercises the new rule via `classifyBlankSafety`). `npm run lint` → 0 errors (1 pre-existing unrelated warning in `StudySession.tsx`, not touched by this phase). |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/sentence-match.ts` | Word-boundary-aware single-char blank-safety predicate | VERIFIED | Hangul-adjacency check inside `targetForm.length <= 1` branch; no signature change; docstring updated. |
| `tests/sentence-match.test.ts` | Isolated vs embedded single-char test cases | VERIFIED | 7 new/updated cases including the real-corpus D-03 sentence "밥을 다 먹었어요"; all pass. |
| `scripts/prompt-eval.mts` | Non-persisting PROMPT-02 eval: real extraction + audit-check diff vs baseline | VERIFIED | Contains `frontHasRomanization` import/use; zero Prisma writes; CLI contract (`--save-baseline` / diff) matches plan exactly. |
| `.planning/phases/22.../prompt-eval-baseline.json` | Pre-edit tally | VERIFIED | Parses; `perLesson` entries for 4/12/17 + `totals`; captured before the prompt-edit commit. |
| `lib/extract-cards.ts` | Revised prompt with per-error-class annotation ledger | VERIFIED | Contains 형용사, 동사, 작을 소, CRT/DST, D-06 through D-09, annotation ledger block comment. |
| `scripts/fix-corpus-2026-07.mts` | Dry-run-gated in-place corpus fix: 9 front rewrites + 철 sentence creation | VERIFIED | `REWRITES` const (9 entries) present; no delete/create Card calls; `normalizeFront` imported and used in the same update call as `front`. |
| `.planning/phases/22.../22-POST-FIX-AUDIT.md` | Post-fix audit report proving findings cleared | VERIFIED | Confirmed byte-identical to a fresh live re-run of `audit-cards.mts` performed during this verification. |
| `.planning/phases/22.../22-FIX-REPORT.md` | Applied-fixes ledger + accepted residuals | VERIFIED | Contains `reviewed-not-duplicate`, D-09/D-04/D-10 residual rows, post-audit-arrival flags (거/게). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `tests/sentence-match.test.ts` | `lib/sentence-match.ts` | direct import | WIRED | `import { sentenceMatch, blankSentence, splitParticle } from '../lib/sentence-match'` |
| `lib/audit-checks.ts` | `lib/sentence-match.ts` | `classifyBlankSafety` delegates to `sentenceMatch().safeToBlank` | WIRED | Existing wiring; inherits the new rule automatically — confirmed via `npm test` (`tests/audit-checks.test.ts` green with the new predicate live). |
| `scripts/prompt-eval.mts` | `lib/audit-checks.ts` | dynamic import of `frontHasRomanization`/`sentenceHasRomanization`/`classifyBlankSafety` | WIRED | Line 85-86: `await import('../lib/audit-checks.js')`. |
| `scripts/prompt-eval.mts` | `lib/extract-cards.ts` | dynamic import of `extractCardsFromNotes` (real API call) | WIRED | Line 84. |
| `scripts/prompt-eval.mts` | `prompt-eval-baseline.json` | `--save-baseline` writes; default mode reads | WIRED | Confirmed via `fs.writeFileSync`/`fs.readFileSync` at `BASELINE_PATH`. |
| `scripts/fix-corpus-2026-07.mts` | `lib/card-key.ts` | dynamic import of `normalizeFront` | WIRED | Line 45; used in the write-time collision re-check and the atomic front/normalizedFront update. |
| `scripts/fix-corpus-2026-07.mts` | production `Card` rows | `prisma.card.update({ where: { id } })` | WIRED | Live-verified: current DB state matches the committed post-fix audit exactly. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROMPT-01 | 22-02 | Prompt reviewed/revised against schema + audit findings | SATISFIED (codebase) / gap in REQUIREMENTS.md tracking (see below) | `lib/extract-cards.ts` diff, commit `9317a02` |
| PROMPT-02 | 22-02 | Prompt changes validated against real-lesson sample before being final | SATISFIED | Baseline + after-run PASS, commits `7bc2545`/`521fe65` |
| FIX-01 | 22-01, 22-03 | High-confidence issues corrected in place by id | SATISFIED | Live audit re-run + `scripts/fix-corpus-2026-07.mts` |
| FIX-02 | 22-03 | Fix scripts dry-run-by-default / `--apply` pattern | SATISFIED | Code inspection of `scripts/fix-corpus-2026-07.mts` |

**Tracking gap found:** `.planning/REQUIREMENTS.md` still shows `PROMPT-01` as `[ ]` Pending in both the checklist and the traceability table, even though the codebase evidence above shows the requirement is genuinely satisfied. This appears to be a bookkeeping oversight — commit `521fe65` updated PROMPT-02's checkbox but not PROMPT-01's alongside it, and no later commit corrected it. This is a documentation-only gap (does not affect the phase-goal verdict) but should be fixed before milestone close so REQUIREMENTS.md stays trustworthy. Recommend: flip `PROMPT-01` to `[x]` / `Complete` in `.planning/REQUIREMENTS.md`.

No orphaned requirements — all 4 IDs mapped to Phase 22 in REQUIREMENTS.md are claimed by at least one plan's frontmatter (`requirements:` field), and vice versa.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/fix-corpus-2026-07.mts` | 68-73 | `CHEOL_SENTENCES` hardcoded values are all Hangul-embedded (none blank-safe under the very rule this phase hardened) | ℹ️ Info (already surfaced in `22-REVIEW.md` WR-01, and the outcome is explicitly accepted per D-04, decided during planning before execution — not a phase-goal gap, but a real "could have been better" finding worth a follow-up) | Card 철 remains permanently Recall/fill-blank-ineligible; a differently-worded sentence would have closed the finding for real per the reviewer's own test evidence |
| `lib/extract-cards.ts` | 342-368 | Components resolved against same-batch siblings that can later be dropped by the blank-safety filter, leaving a dangling `components` reference | ⚠️ Warning (pre-existing code path, not newly introduced by this phase's prompt-text-only edits; already documented in `22-REVIEW.md` WR-02) | Downstream `CardDependency` edge silently fails to form for the dropped sibling and won't self-heal on a later sync |
| `scripts/prompt-eval.mts` | 494-510 | Baseline-shape validation checks only 1 of 4 `totals` fields | ℹ️ Info (`22-REVIEW.md` WR-05) — cosmetic robustness gap in a manually-triggered, budget-capped eval script | A hand-corrupted baseline JSON could silently print `NaN` instead of failing closed |

No debt markers (`TBD`/`FIXME`/`XXX`) found in any of the 5 phase-touched files. No blocker-level anti-patterns found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Word-boundary blank-safety rule (7 cases) | `npx vitest run tests/sentence-match.test.ts tests/extract-cards.test.ts` | 50/50 passed | PASS |
| Full regression suite | `npm test` | 218/218 passed (15 files) | PASS |
| Lint clean | `npm run lint` | 0 errors, 1 pre-existing unrelated warning | PASS |
| Live corpus state matches committed fix evidence | `npx tsx scripts/audit-cards.mts` (read-only, run live against production Turso during this verification) | Output byte-identical to committed `22-POST-FIX-AUDIT.md`; card 다 and all 9 rewrite ids absent from flagged sections; card 철 resolved from zero-sentence | PASS |
| Prompt text edits present and old flagged examples removed | `grep -c` gates on `lib/extract-cards.ts` | "Action verb"=0, "direction particle"=0, 동사/형용사/작을 소/CRT/DST/D-06..D-09 all present | PASS |
| PROMPT-02 live after-run (real Anthropic API calls) | `npx tsx scripts/prompt-eval.mts` | SKIP — not re-run in this pass | ? SKIP (respects the plan's own 2-run budget cap, already exhausted; verified instead via commit history + code inspection, see Truth #3) |

### Requirements Coverage

(see table above)

### Human Verification Required

### 1. Prompt wording quality per error class

**Test:** Read the revised bullets in `lib/extract-cards.ts` (front-field rewrite, loanword exception, blank-safety clause (b), annotation ledger) end-to-end.
**Expected:** Each edit reads naturally as instructional prompt text and is clearly traceable to its error class (D-06/D-07/D-08/D-09) — not just present via grep, but genuinely well-written.
**Why human:** `22-VALIDATION.md` explicitly marks prompt prose quality as manual-only; no automated test can assess this.

### 2. Study-flow and CardEditor UI ripple check

**Test:** In the running app, exercise Study flow (flashcard fill-blank/Recall mode) for card 다 (now newly blank-safe) and for one still-embedded single-char case (e.g. 물, 철); open CardEditor for a rewritten front (e.g. 동사 ~는) and confirm it renders correctly with review history intact.
**Expected:** 다 blanks correctly in Recall mode; embedded cases correctly stay Exposure-only; rewritten fronts display correctly in the Cards list/CardEditor and their FSRS review history is unaffected by the front rewrite.
**Why human:** Visual/interaction correctness in `HighlightedSentence.tsx`/`StudySession.tsx`/`CardEditor.tsx` is not covered by unit tests; both `22-01-PLAN.md` and `22-03-PLAN.md` explicitly deferred this to phase-level `/gsd-verify-work`.

### 3. Card 철 rendering in CardEditor

**Test:** Open card 철 (id `cmqlmqdoa02430gsax79l6oza`) in CardEditor and confirm the 3 new sentences render naturally with 철 highlighted (un-blankable), and that the card studies correctly in Exposure/multiple-choice modes.
**Expected:** Sentences render without error; Recall/fill-blank mode is unavailable for this card by design (D-04) with no broken UI state.
**Why human:** UI rendering verification requires a live browser session; `22-03-SUMMARY.md` (coverage D7) explicitly defers this.

### Gaps Summary

No blocking gaps found. All 4 requirement IDs (PROMPT-01, PROMPT-02, FIX-01, FIX-02) are genuinely satisfied in the codebase, independently confirmed via: (a) direct code/grep inspection of `lib/extract-cards.ts` and both new scripts, (b) the full Vitest suite (218/218) and lint (0 errors), (c) a fresh, live, read-only re-run of `scripts/audit-cards.mts` against the production Turso database performed during this verification pass — its output is byte-identical to the committed `22-POST-FIX-AUDIT.md`, independently confirming the 9 front rewrites and the 철 sentence fix are genuinely persisted and stable in production (not just claimed in SUMMARY.md), and (d) git commit-order evidence that the PROMPT-02 baseline was captured strictly before the prompt edit landed.

One documentation-only gap: `.planning/REQUIREMENTS.md` still marks `PROMPT-01` as Pending despite the requirement being satisfied — a checkbox bookkeeping oversight, not a code gap. Recommend fixing before milestone close.

Three items require human sign-off before this phase can be called fully closed: prompt prose-quality review, a live Study-flow/CardEditor UI ripple check, and a CardEditor rendering check for card 철 — all three were explicitly and deliberately deferred by the plans themselves to phase-level `/gsd-verify-work` (not omissions discovered during this verification), consistent with the project's `workflow.human_verify_mode = end-of-phase` convention.

---

_Verified: 2026-07-10T09:20:00Z_
_Verifier: Claude (gsd-verifier)_
