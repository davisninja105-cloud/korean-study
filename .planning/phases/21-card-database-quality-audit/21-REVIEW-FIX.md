---
phase: 21-card-database-quality-audit
fixed_at: 2026-07-07T07:47:06Z
review_path: .planning/phases/21-card-database-quality-audit/21-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-07-07T07:47:06Z
**Source review:** .planning/phases/21-card-database-quality-audit/21-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

All five in-scope findings (3 Warnings + 2 Info) were fixed and committed atomically.
The full Vitest suite was run after every fix; the final state has 63 tests passing
(60 original + 3 added by IN-02), and `tsc --noEmit` reports zero errors in the three
modified files.

## Fixed Issues

### WR-01: `superNormalize` slash comment is self-contradictory

**Files modified:** `lib/audit-checks.ts`
**Commit:** ae26f84
**Applied fix:** Replaced the self-contradictory 3-line slash comment in
`superNormalize` (lines 329-331) with a clear 3-line version stating that slashes
are intentionally preserved because removing them changes meaning, with a pointer to
the `preserves slashes` test. The code was already correct (no slash-removal call);
only the misleading comment was fixed.

### WR-02: `frontHasRomanization` docstring over-claims — false positive for non-trailing glosses

**Files modified:** `lib/audit-checks.ts`
**Commit:** 390bb59
**Applied fix:** Softened the `frontHasRomanization` docstring to replace the absolute
"IS leakage" claim with "Latin outside the trailing gloss is treated as leakage", and
expanded the single "Scope boundary" note into a "Scope boundaries" list documenting
BOTH limitations: (1) a trailing ASCII paren group is never flagged, and (2) a
non-trailing ASCII paren group IS flagged even when it is a legitimate English gloss
(false positives like `"~는 것 (the fact of) (명사)"` are tolerable because the report
is human-reviewed). The `@param`/`@returns` tags were preserved.

### WR-03: `notFoundSentenceIndices` docstring contradicts itself — array indices vs. orderIndex

**Files modified:** `lib/audit-checks.ts`, `scripts/audit-cards.mts`, `tests/audit-checks.test.ts`
**Commit:** 78eff8b
**Applied fix:** Applied the review's preferred option — carry `orderIndex` column
values in the finding entries instead of array positions:
- Renamed `BlankSafetyNotFoundEntry.indices` → `orderIndices` and
  `RomanizationFlaggedSentencesEntry.indices` → `orderIndices`, with clarifying
  comments that the values are orderIndex column values (NOT array positions).
- In `runAuditChecks`, both push sites now map array indices to orderIndex values via
  `notFoundIdx.map((i) => card.sentences[i].orderIndex)` and
  `romanIdx.map((i) => card.sentences[i].orderIndex)`, so the reported field is
  directly actionable by Phase 22 (`where: { cardId, orderIndex }`).
- Added a bridging NOTE to the `notFoundSentenceIndices` docstring explaining that the
  helper returns array positions which `runAuditChecks` maps to orderIndex before
  storing — resolving the original contradiction.
- Updated the report rendering in `scripts/audit-cards.mts` to use `e.orderIndices`
  with clearer labels ("not-found sentence orderIndex values" / "flagged sentence
  orderIndex values").
- Updated the two test assertions referencing `.indices` to use `.orderIndices`
  (the fixtures use `orderIndex: 0`, so the expected `[0]` value is unchanged).
- Verified with the full Vitest suite (63 tests pass) and `tsc --noEmit` (zero errors
  in modified files).

### IN-01: Dead fields `notes` and `lessonId` in `AuditCardInput`

**Files modified:** `lib/audit-checks.ts`
**Commit:** 6586d33
**Applied fix:** Annotated both dead fields with
`/** Reserved for future checks — not consumed by Phase 21 audits. */` rather than
removing them. They are part of the data contract with the script
(`scripts/audit-cards.mts` populates both from the Prisma row), so removal would
break the script's row mapping; the annotation clarifies they are intentionally
carried but not yet consumed by any check.

### IN-02: Test coverage gaps for edge cases

**Files modified:** `tests/audit-checks.test.ts`
**Commit:** 7aaff83
**Applied fix:** Added the three edge-case tests suggested in the review:
- `countStaleComponents counts non-string entries as stale` — verifies that
  `'[null, "먹다"]'` yields `{ stale: 1, malformed: false }` (the defensive string
  filter drops `null`, so `null` counts as stale), locking the behavior documented
  in `lib/audit-checks.ts` before Phase 22 depends on it.
- `checkDistractors returns ["count-mismatch"] for an empty array` — verifies that
  `'[]'` yields `['count-mismatch']` (length 0 !== 3, the only applicable anomaly).
- `runAuditChecks handles an empty deck` — verifies that `runAuditChecks([])` does
  not throw and returns `totalCards: 0`, empty `nearDuplicateClusters`, and
  `staleComponents.cardsAffected: 0` (the script must handle this gracefully if it
  hits the empty local fallback DB).
All three new tests pass (suite grew from 60 to 63 tests).

---

_Fixed: 2026-07-07T07:47:06Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
