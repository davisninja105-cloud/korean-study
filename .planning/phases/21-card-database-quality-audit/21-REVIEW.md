---
phase: 21-card-database-quality-audit
reviewed: 2026-07-06T21:01:30Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/audit-checks.ts
  - tests/audit-checks.test.ts
  - scripts/audit-cards.mts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-07-06T21:01:30Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the three Phase 21 artifacts: the pure audit module (`lib/audit-checks.ts`), its Vitest suite (`tests/audit-checks.test.ts`), and the read-only I/O adapter script (`scripts/audit-cards.mts`). Cross-referenced the three delegated production helpers (`lib/sentence-match.ts`, `lib/card-key.ts`, `lib/filter-components.ts`) and the Prisma schema to verify delegation claims, null-handling assumptions, and read-only enforcement.

**No BLOCKERs found.** The read-only guarantee is solid (grep-provable: the only Prisma call in the script is `prisma.card.findMany`; zero write-capable calls in either file). No credential leakage — the renderer interpolates only findings fields and the date. Safe JSON parsing with try/catch on both untrusted columns. The 60 tests pass and cover the six check classes described in `21-VALIDATION.md`. Purity of `lib/audit-checks.ts` holds — no Prisma/fs/Node-builtin imports.

The findings are three WARNINGs (two documentation defects that could mislead maintainers or Phase 22, plus a docstring self-contradiction over array-index vs. orderIndex semantics) and two INFOs (dead interface fields, test coverage gaps for edge cases). None cause incorrect audit classification on expected inputs; all degrade maintainability or create downstream interpretation risk.

## Structural Findings (fallow)

No structural pre-pass was provided for this review.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: `superNormalize` slash comment is self-contradictory

**File:** `lib/audit-checks.ts:329-331`
**Issue:** The comment block describes a transformation that is NOT performed, then immediately reverses itself:

```typescript
// Remove slash-alternates like 아/어, ㄹ/을, etc. — keep both sides
// by just removing the slash so "아/어" becomes "아어"
// (don't do this — it changes meaning; leave slashes as-is)
```

The code correctly preserves slashes (there is no `.replace(/\//g, '')` call — confirmed by the `preserves slashes` test at `tests/audit-checks.test.ts:253-258`). But the first two lines read as an active instruction ("Remove slash-alternates... by just removing the slash"), and only the third parenthetical ("don't do this") reveals the decision was reversed. A maintainer skimming the file could implement the slash-removal based on the first two lines, introducing a behavior change that collapses verb-alternation patterns (`아/어` → `아어`) and silently breaks near-duplicate clustering parity with `find-duplicates.mjs`. The comment was lifted verbatim from `scripts/find-duplicates.mjs:55-57`, but now that this logic lives in a Vitest-covered pure module (the stated rationale for the lift), the contradiction should be resolved rather than preserved as-is.
**Fix:**
```typescript
// Slashes are intentionally preserved — removing them changes meaning
// (e.g. "아/어" is a verb-alternation pattern, not the single string "아어").
// See test "preserves slashes (meaning-bearing — rejected slash-removal decision)".
```

### WR-02: `frontHasRomanization` docstring over-claims — false positive for non-trailing glosses

**File:** `lib/audit-checks.ts:148-160`
**Issue:** The docstring states: "any Latin that survives the production helper IS leakage." This is incorrect for a specific front shape. `normalizeFront` (lib/card-key.ts:30-38) only strips the **last** paren group, and only when it is ASCII-only. Consider a front like `"~는 것 (the fact of) (명사)"`:

1. `normalizeFront` matches the last paren group `(명사)` — it contains Hangul, so it is NOT stripped.
2. The non-trailing English gloss `(the fact of)` survives intact.
3. `LATIN.test(...)` sees the letters in "the fact of" → `frontHasRomanization` returns `true`.
4. The audit reports this card as romanization leakage — a **false positive**, because `(the fact of)` is a legitimate English clarifying gloss.

The audit's behavior is consistent with its stated definition ("Latin that survives `normalizeFront`"), and consistent with how the production write-path treats the front. The defect is the docstring's absolute claim ("IS leakage"), which is too strong, and the absence of any documentation of this false-positive case. The existing "Scope boundary" note (lines 152-156) only documents the opposite case (trailing ASCII parens not flagged); it does not cover non-trailing glosses being flagged. Since the audit report is human-reviewed, the false positive is tolerable in practice, but the over-claim could lead a reader to trust flagged-fronts results without reviewing them.
**Fix:** Soften the docstring and add the missing scope boundary:
```typescript
/**
 * Whether a card front leaks Latin-letter romanization, gloss-safe.
 *
 * Delegates gloss stripping to `normalizeFront(front)` (lib/card-key.ts): the
 * trailing English clarifying gloss is removed first, so Latin outside the
 * trailing gloss is treated as leakage.
 *
 * Scope boundaries (documented limitations):
 *  - A trailing ASCII paren group is never flagged (gloss or romanization —
 *    the heuristic cannot distinguish; RESEARCH Pitfall 3).
 *  - A NON-trailing ASCII paren group IS flagged even when it is a legitimate
 *    English gloss, because normalizeFront only strips the LAST paren group.
 *    False positives for fronts like "~는 것 (the fact of) (명사)" are
 *    tolerable — the audit report is human-reviewed before any fix.
 */
```

### WR-03: `notFoundSentenceIndices` docstring contradicts itself — array indices vs. orderIndex

**File:** `lib/audit-checks.ts:121-129`; `scripts/audit-cards.mts:179, 215`
**Issue:** The `notFoundSentenceIndices` docstring is internally contradictory. The first paragraph says the returned indices exist "so Phase 22 can target them by id+**orderIndex**", implying the values are `orderIndex` column values. The `@returns` line says "Array of indices (**into the input array**) where the target was not found" — which are 0-based array positions, NOT `orderIndex` values. The two claims agree only when `orderIndex` is contiguous `[0, 1, 2]` (so array index === orderIndex). They diverge whenever a sentence was deleted, leaving `orderIndex` gaps (e.g., `[0, 2]`): array index `1` then corresponds to `orderIndex` `2`, but the report prints `1`.

The script renders these as `"not-found sentence indices: ${e.indices.join(', ')}"` and `"flagged sentence indices: ${e.indices.join(', ')}"` — labels that read ambiguously as either array position or `orderIndex`. The same array-index convention applies to `RomanizationFlaggedSentencesEntry.indices` (`lib/audit-checks.ts:423-427`), with the same rendering in the report.

Risk: if Phase 22 reads the report, interprets `1` as `orderIndex=1`, and issues a targeted fix query `where: { cardId, orderIndex: 1 }`, it would target the wrong sentence (or no sentence) on any card with `orderIndex` gaps. The Prisma schema (`prisma/schema.prisma:69`) declares `orderIndex Int @default(0)` with no contiguous constraint, so gaps are physically possible after sentence deletions. The audit is read-only and causes no data damage itself, but the misleading docstring + ambiguous report label create real downstream risk.
**Fix:** Pick one of:
1. **Carry `orderIndex` in the finding entries** (preferred — makes the report directly actionable):
```typescript
// Change notFound entries to carry orderIndex values, not array indices:
export interface BlankSafetyNotFoundEntry {
  card: CardRef
  orderIndices: number[]  // was: indices: number[] (array positions)
}
// In runAuditChecks, map array index → orderIndex before pushing:
const notFoundIdx = notFoundSentenceIndices(card.sentences)
if (notFoundIdx.length > 0) {
  blankSafety.notFound.push({
    card: ref,
    orderIndices: notFoundIdx.map(i => card.sentences[i].orderIndex),
  })
}
```
2. **Or, at minimum, relabel the report lines and fix the docstring** to remove the `orderIndex` claim:
```typescript
// Docstring fix:
* reported as their own blank-safety sub-class so Phase 22 can target them
* by id + array-index-into-the-orderIndex-sorted-sentence-list.

// Report line fix:
L.push(`- [...] — not-found sentence array indices (0-based, into orderIndex-sorted list): ${e.indices.join(', ')}`)
```
Apply the same fix to `RomanizationFlaggedSentencesEntry` / its report line.

## Info

### IN-01: Dead fields `notes` and `lessonId` in `AuditCardInput`

**File:** `lib/audit-checks.ts:59, 67`; `scripts/audit-cards.mts:96, 103`
**Issue:** `AuditCardInput` declares `notes: string | null` (line 59) and `lessonId: string | null` (line 67). The script populates both (`scripts/audit-cards.mts:96` `notes: r.notes`, line 103 `lessonId: r.lessonId`). But no function in `runAuditChecks` ever reads either field — confirmed by grep: zero references to `card.notes` or `card.lessonId` in `lib/audit-checks.ts`. They are dead data flow: declared in the interface, mapped by the script, carried through the loop, and never consumed by any check. A reader of the interface could reasonably infer the audit uses them for some classification.
**Fix:** Either remove both fields from `AuditCardInput` and the script's row mapping, or annotate them as reserved:
```typescript
/** Reserved for future checks — not consumed by Phase 21 audits. */
notes: string | null
/** Reserved for future checks — not consumed by Phase 21 audits. */
lessonId: string | null
```

### IN-02: Test coverage gaps for edge cases

**File:** `tests/audit-checks.test.ts`
**Issue:** The 60 tests cover the six check classes on representative fixtures but leave several documented edge cases untested:
- `countStaleComponents` with non-string entries (e.g., `'[null, "먹다"]'`) — the code filters to strings via `parsed.filter((e): e is string => typeof e === 'string')` and counts non-strings as stale (`parsed.length - kept.length`), but no test verifies this. The inline comment at `lib/audit-checks.ts:407-409` documents the behavior; it should be locked by a test before Phase 22 depends on it.
- `checkDistractors('[]', back)` — empty array should return `['count-mismatch']` (length 0 !== 3); untested.
- `runAuditChecks([])` — empty deck should return all-zero counts and empty arrays; untested (the script must handle this gracefully if it ever hits the empty local fallback DB — see RESEARCH Pitfall 4).
- `classifyBlankSafety` / `notFoundSentenceIndices` with empty-string `targetForm` or `korean` — `sentenceMatch` handles these (`lib/sentence-match.ts:29-31` returns `{found:false, safeToBlank:false}`), but no audit test confirms the audit's behavior on such sentences.
**Fix:** Add a small set of edge-case tests:
```typescript
it('countStaleComponents counts non-string entries as stale', () => {
  expect(countStaleComponents('[null, "먹다"]', new Set(['먹다'])))
    .toEqual({ stale: 1, malformed: false })
})

it('checkDistractors returns ["count-mismatch"] for an empty array', () => {
  expect(checkDistractors('[]', 'back')).toEqual(['count-mismatch'])
})

it('runAuditChecks handles an empty deck', () => {
  const f = runAuditChecks([])
  expect(f.totalCards).toBe(0)
  expect(f.nearDuplicateClusters).toEqual([])
  expect(f.staleComponents.cardsAffected).toBe(0)
})
```

---

_Reviewed: 2026-07-06T21:01:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
