---
phase: 22-findings-driven-prompt-improvement-corpus-fixes
plan: 01
subsystem: testing
tags: [vitest, tdd, korean, sentence-match, blank-safety, word-boundary]

# Dependency graph
requires:
  - phase: 21-card-database-quality-audit
    provides: "the one zero-safe finding (card 다, id cmqlm1w0u014k0gsa6eydclfd) whose two sentences are isolated-token — motivated the rule change"
provides:
  - "word-boundary-aware single-char blank-safety predicate in sentenceMatch() (D-01/D-02) — isolated single-char tokens are now blank-safe; embedded ones stay unsafe"
  - "MatchResult.safeToBlank JSDoc describing the isolated-vs-embedded contract for single-char targetForms"
  - "seven D-02 test cases covering isolated-at-string-edge, isolated-mid-sentence (real corpus D-03), punctuation-bounded, embedded-left, embedded-right, isolated-multi-occurrence, and first-occurrence-embedded semantics"
affects:
  - "22-02 (prompt-eval baseline): classifyBlankSafety delegates to sentenceMatch().safeToBlank, so the before/after audit-check counts use this new rule"
  - "22-03 (post-fix audit re-run): runAuditChecks → classifyBlankSafety → sentenceMatch inherits the fix automatically; card 다 flips from zero-safe to blank-safe with zero DB mutation (FIX-01 resolved by rule change)"
  - "components/HighlightedSentence.tsx, components/StudySession.tsx, components/CardEditor.tsx: inherit the fix with zero call-site edits (signature unchanged)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Word-boundary inspection via a module-level Hangul character-class regex (same ranges as normalizeFront in lib/card-key.ts) — single source of truth for the Hangul class across the codebase"

key-files:
  created: []
  modified:
    - "lib/sentence-match.ts"
    - "tests/sentence-match.test.ts"

key-decisions:
  - "D-02 implemented as an additive change to the targetForm.length <= 1 branch only: Hangul-adjacent on either side → unsafe (embedded); both sides isolated → fall through to the existing multi-occurrence check (so a repeated isolated single-char stays unsafe). No signature change, no new params — all three consumers inherit automatically."
  - "Reused the exact Hangul character class from normalizeFront (가-힣 + Jamo + compat Jamo + extended blocks) so the predicate and the dedup-key normalizer agree on what counts as Hangul."
  - "First-occurrence semantics preserved: the predicate evaluates the FIRST indexOf hit. If that occurrence is embedded (e.g. 다 inside 왔다 in '왔다 그리고 좋아요'), the target is unsafe even if a later occurrence would be isolated — matches how the consumer actually blanks (first occurrence)."
  - "REFACTOR gate skipped (optional per tdd.md): the GREEN implementation is already minimal and clean — no cleanup pass needed."

patterns-established:
  - "TDD discipline for shared-predicate changes: RED encodes all seven behavior cases (including the real-corpus D-03 sentence) before any implementation; the embedded/multi-occurrence cases that already pass against the old rule are kept in the same RED commit to lock the contract before GREEN."
  - "Pitfall 3 discipline (RESEARCH.md): when changing a shared classification predicate, re-verify every existing test fixture that asserts the old behavior before touching code. The extract-cards.test.ts line-486 fixture ('물을 사다' / target 물) was confirmed to stay embedded/unsafe under the new rule, so it needed zero edits."

requirements-completed: [FIX-01]

coverage:
  - id: D1
    description: "sentenceMatch returns safeToBlank=true for an isolated single-char targetForm (string-edge / whitespace / punctuation on both sides) occurring exactly once"
    requirement: "FIX-01"
    verification:
      - kind: unit
        ref: "tests/sentence-match.test.ts#single-char target isolated by spaces/string-edge is blank-safe"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#isolated single-char mid-sentence is blank-safe (real corpus card 다, D-03)"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#isolated single-char followed by punctuation is blank-safe"
        status: pass
    human_judgment: false
  - id: D2
    description: "sentenceMatch returns safeToBlank=false for an embedded single-char targetForm (Hangul-adjacent on either side), including first-occurrence-embedded and isolated-but-multi-occurrence cases"
    requirement: "FIX-01"
    verification:
      - kind: unit
        ref: "tests/sentence-match.test.ts#embedded single-char with Hangul on the left is unsafe"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#embedded single-char with Hangul on the right is unsafe"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#isolated single-char occurring twice is unsafe (multi-occurrence wins)"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#first-occurrence semantics: embedded first occurrence is unsafe even if a later one is isolated"
        status: pass
    human_judgment: false
  - id: D3
    description: "All existing 2+-char targetForm behavior is unchanged (existing multi-char / not-found / empty-input / blankSentence / splitParticle tests pass without modification)"
    verification:
      - kind: unit
        ref: "tests/sentence-match.test.ts#finds a multi-char target that appears once"
        status: pass
      - kind: unit
        ref: "tests/sentence-match.test.ts#returns safeToBlank=false when target appears more than once"
        status: pass
      - kind: unit
        ref: "npm test (full 218-test suite, 15 files, all green — including audit-checks.test.ts which transitively exercises sentenceMatch via classifyBlankSafety)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Card 다 (id cmqlm1w0u014k0gsa6eydclfd) classifies as blank-safe under the new predicate with zero DB changes (D-03) — both real sentences proven safe via a direct sentenceMatch call"
    requirement: "FIX-01"
    verification:
      - kind: unit
        ref: "tests/sentence-match.test.ts#isolated single-char mid-sentence is blank-safe (real corpus card 다, D-03) — proves '밥을 다 먹었어요.'"
        status: pass
      - kind: other
        ref: "node --input-type-module inline check: sentenceMatch('지난 모든 시즌을 다 봤어요.', '다').safeToBlank === true (the second real sentence)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual ripple check — Study flow fill-blank and CardEditor preview behave correctly for one newly-safe isolated single-char case and one still-unsafe embedded case"
    verification: []
    human_judgment: true
    rationale: "Deferred to phase-level /gsd-verify-work per 22-VALIDATION.md — UI behavior verification requires a human to interact with the study flow and CardEditor preview. No automated test asserts rendered fill-blank / preview behavior for the newly-safe class."

# Metrics
duration: 3 min
completed: 2026-07-08
status: complete
---

# Phase 22 Plan 01: Word-Boundary-Aware Single-Char Blank-Safety Summary

**TDD-driven rewrite of the `sentenceMatch()` single-char branch: isolated 1-char targetForms (string-edge/whitespace/punctuation on both sides) are now blank-safe; embedded ones (Hangul-adjacent) stay unsafe — resolving the audit's one zero-safe finding (card 다) by rule change with zero DB mutation.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-08T00:49:39Z
- **Completed:** 2026-07-08T00:53:11Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `sentenceMatch()` now distinguishes isolated vs embedded single-character targetForms: an isolated 1-char token (string-edge / whitespace / punctuation on both sides) becomes `safeToBlank: true`; an embedded one (Hangul-adjacent on either side) stays `false`. The multi-occurrence rule still wins for an isolated single-char that repeats.
- Card 다 (id `cmqlm1w0u014k0gsa6eydclfd`) — the audit's one zero-safe finding (FIX-01) — is now blank-safe under both its existing real sentences ("지난 모든 시즌을 다 봤어요." and "밥을 다 먹었어요.") with **zero DB changes** (D-03). Resolved by rule change, not by DB mutation — the milestone's hard rule (mutate in place by `id`, never delete+recreate) is honored trivially since no mutation is needed at all.
- Embedded single-char targets (물 in 물을, 다 in 왔다, 철 in 철은) remain unsafe — Phase 20's code-enforced blank-safety (EXTRACT-03) keeps rejecting genuinely ambiguous sentences. The `tests/extract-cards.test.ts` line-486 fixture ('물을 사다' / target 물) still drops the card as expected (Pitfall 3 resolved: no edit needed to that file).
- 2+-char behavior is byte-for-byte identical — the change is strictly additive to the `targetForm.length <= 1` branch; all existing multi-char / not-found / empty-input / blankSentence / splitParticle tests pass without modification.
- Signature unchanged `(korean: string, targetForm: string) => MatchResult` — all three consumers (`components/HighlightedSentence.tsx`, `components/StudySession.tsx`, `components/CardEditor.tsx`) inherit the fix with zero call-site edits.

## Task Commits

Each task was committed atomically (TDD plan: RED → GREEN):

1. **Task 1: Encode the D-02 isolated/embedded rule as failing tests (RED)** — `72b44b9` (test)
2. **Task 2: Implement the word-boundary predicate and go green (GREEN)** — `ae5db89` (feat)

**Plan metadata:** pending (docs: complete plan)

_Note: TDD plan — RED gate (`test(22-01)`) and GREEN gate (`feat(22-01)`) both present in order. REFACTOR gate skipped (optional; implementation already minimal)._

## Files Created/Modified
- `tests/sentence-match.test.ts` — Replaced the old single-char-always-unsafe assertion (lines 11-15) with seven D-02 behavior cases: isolated-at-string-edge (replaces old), isolated-mid-sentence (real corpus D-03), punctuation-bounded, embedded-left, embedded-right, isolated-multi-occurrence, first-occurrence-embedded.
- `lib/sentence-match.ts` — Rewrote the `targetForm.length <= 1` branch to inspect the characters immediately before/after the first occurrence using a module-level `HANGUL_CHAR` regex (same ranges as `normalizeFront` in `lib/card-key.ts`); Hangul-adjacent on either side → unsafe (embedded); both sides isolated → fall through to the existing multi-occurrence check. Updated `MatchResult.safeToBlank` JSDoc to describe the new contract.

## Decisions Made
- **Reuse the exact Hangul character class from `normalizeFront`** (가-힣 + Jamo + compat Jamo + extended blocks) for the new `HANGUL_CHAR` regex — single source of truth for "what counts as Hangul" across the dedup-key normalizer and the blank-safety predicate, so they can never drift apart.
- **Fall through to the multi-occurrence check when both sides are isolated** rather than returning `safeToBlank: true` immediately — this preserves the existing "isolated single-char occurring twice is unsafe" rule with zero extra code (the multi-occurrence check already exists below the single-char branch).
- **Preserve first-occurrence semantics**: the predicate evaluates the FIRST `indexOf` hit. If that occurrence is embedded (e.g. 다 inside 왔다 in '왔다 그리고 좋아요'), the target is unsafe even if a later occurrence would be isolated — this matches how the consumer (`blankSentence`) actually blanks (first occurrence), and is locked by an explicit test case.
- **Skip the REFACTOR gate** (optional per `tdd.md`): the GREEN implementation is already minimal — a single module-level regex + a 4-line branch body — with no obvious cleanup to extract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## TDD Gate Compliance

- **RED gate:** `test(22-01): encode isolated-vs-embedded single-char blank-safety rule (RED)` — commit `72b44b9` exists. Suite was red against the unmodified predicate: 3 failing (the isolated→true cases), 14 passing (including the embedded/multi-occurrence/first-occurrence cases that already pass against the old always-unsafe rule, matching the plan's RED acceptance criterion).
- **GREEN gate:** `feat(22-01): word-boundary-aware single-char blank-safety in sentenceMatch (D-01/D-02)` — commit `ae5db89` exists after RED. Full suite green (218 tests / 15 files), lint clean (0 errors).
- **REFACTOR gate:** Skipped (optional). Implementation is already minimal; no cleanup pass needed.

All gates satisfied. No violations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `sentenceMatch()` word-boundary fix is live — unblocks every downstream Phase 22 deliverable:
  - **22-02 (prompt-eval baseline):** `classifyBlankSafety` in `lib/audit-checks.ts` delegates to `sentenceMatch().safeToBlank`, so the before/after audit-check counts in `scripts/prompt-eval.mts` will use this new rule. The baseline must be captured against this predicate so the before/after diff is meaningful.
  - **22-03 (post-fix audit re-run):** `runAuditChecks` → `classifyBlankSafety` → `sentenceMatch` inherits the fix automatically. Card 다 will flip from zero-safe to blank-safe in the re-run audit report with zero DB mutation (FIX-01 closed by rule change).
- The manual ripple check (Study flow fill-blank + CardEditor preview for one newly-safe isolated case and one still-unsafe embedded case) is deferred to phase-level `/gsd-verify-work` per `22-VALIDATION.md` — no blocker, just a documented human-judgment gate.

## Self-Check: PASSED

- `lib/sentence-match.ts` exists on disk ✓
- `tests/sentence-match.test.ts` exists on disk ✓
- RED gate commit `72b44b9` found in `git log` ✓
- GREEN gate commit `ae5db89` found in `git log` ✓
- `npm test` passes (218 tests / 15 files) ✓
- `npm run lint` reports 0 errors ✓
- git diff for the plan touches exactly two files (`lib/sentence-match.ts`, `tests/sentence-match.test.ts`) ✓
- `tests/extract-cards.test.ts` unmodified ✓
- No `components/` call-site edits ✓
- `sentenceMatch` exported signature unchanged ✓

---
*Phase: 22-findings-driven-prompt-improvement-corpus-fixes*
*Completed: 2026-07-08*
