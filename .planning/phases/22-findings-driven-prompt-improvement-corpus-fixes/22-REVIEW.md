---
phase: 22-findings-driven-prompt-improvement-corpus-fixes
reviewed: 2026-07-10T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - lib/sentence-match.ts
  - tests/sentence-match.test.ts
  - scripts/prompt-eval.mts
  - lib/extract-cards.ts
  - scripts/fix-corpus-2026-07.mts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-07-10
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the five Phase 22 source files (word-boundary blank-safety fix, its tests, the
non-persisting prompt-eval harness, the exhaustive-extraction pipeline, and the one-time
corpus-fix script) at standard depth, and cross-checked call sites in `lib/sync.ts` and
`lib/audit-checks.ts` plus this phase's own planning artifacts (`22-RESEARCH.md`,
`22-FIX-REPORT.md`, `22-POST-FIX-AUDIT.md`) wherever a finding's severity depended on
downstream behavior or prior team decisions.

No security vulnerabilities, hardcoded secrets, or crash-on-null defects were found. Two
candidate BLOCKER-level issues from the first pass turned out, on cross-file verification, to
already be mitigated or consciously accepted elsewhere in the codebase (see notes on the
`철` card and on cross-batch front dedup below) — they are reported at reduced severity with
that context rather than omitted, since the underlying gaps are real even though the acute
risk is closed today. The remaining findings are genuine robustness/correctness gaps: a
data-quality regression risk in the corpus-fix script's hardcoded example sentences, a
components-graph edge that can silently dangle, a brittle salvage-path assumption, and two
script-robustness gaps (missing intra-batch collision check, thin baseline validation).

## Warnings

### WR-01: `철` fix sentences leave the card with zero blank-safe sentences, and a safe alternative was available

**File:** `scripts/fix-corpus-2026-07.mts:68-73`
**Issue:** The three hardcoded `CHEOL_SENTENCES` rows all glue a particle directly onto `철`
with no separating space (`철은`, `철로`, `지하철을`). Running every sentence through the very
predicate this phase just hardened (`lib/sentence-match.ts:sentenceMatch`) confirms none of
them are blank-safe:
- `"철은 아주 단단한 금속이에요."` → `철` at index 0, followed immediately by `은` (Hangul) →
  `afterHangul = true` → `safeToBlank: false`.
- `"이 다리는 철로 만들어졌어요."` → `철` followed by `로` (Hangul) → `safeToBlank: false`.
- `"지하철을 타고 회사에 가요."` → `철` embedded inside `지하철` (Hangul on both sides) →
  `safeToBlank: false`.

So after this script's `--apply` run, card `철` (the one card this fix set out to repair, per
D-04) still has **zero** blank-safe sentences — it moved from the "zero-sentences" audit bucket
to the "zero-safe" bucket, which is a different-looking but equally broken state for
Recall/fill-in-the-blank study modes. `22-FIX-REPORT.md` documents this as an *accepted*
trade-off ("the alternative would be unnatural Korean"), but that premise doesn't hold: this
same codebase's own test suite already validates that an isolated single-syllable word
followed directly by punctuation is blank-safe (`tests/sentence-match.test.ts:31-35`, `'정답은
다!'`). A structurally identical answer-style sentence for 철 — e.g. `"이건 뭘로 만들었어요?
철!"` or `"재료는 철, 나무, 유리예요."` (comma right after 철, isolating it) — would have been
blank-safe by the exact same rule and closed the finding for real, instead of leaving Recall/
fill-blank permanently disabled for this card. Nothing in the script itself validates the
written data against `sentenceMatch`/blank-safety before persisting (unlike the production
extraction path, `normalizeExtractedCards`, which code-enforces this by construction) — a
one-line guard here would have caught the gap before it reached production.
**Fix:**
```ts
// Before persisting, verify at least one sentence is blank-safe — mirrors the
// guarantee normalizeExtractedCards() enforces on the extraction write-path.
import { sentenceMatch } from '../lib/sentence-match.js'

const anySafe = CHEOL_SENTENCES.some(
  (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
)
if (!anySafe) {
  console.error('FATAL: none of the CHEOL_SENTENCES are blank-safe — rewrite before applying.')
  process.exit(1)
}
```
And replace sentence 0 with an isolated-answer form, e.g.
`{ korean: '이건 뭘로 만들었어요? 철!', targetForm: '철', ... }`, which is blank-safe under the
existing rule.

### WR-02: Components resolved against same-batch siblings that are later dropped can dangle

**File:** `lib/extract-cards.ts:342-343, 365-368`
**Issue:** `batchFronts` (and therefore `effectiveDeckSet`) is built from **every** structurally
valid card (`validCards`, post `isValidExtractedCard` only) before the per-card sentence
blank-safety filter runs later in the same `flatMap` (lines 381-400). A card's `components`
entry that names a same-lesson sibling will resolve successfully via `filterComponents`
against `effectiveDeckSet` even if that sibling is subsequently rejected for having zero
blank-safe sentences (line 393-400, `return []`). The surviving card is then returned with a
component lemma that points at a card which will never be persisted this sync. Downstream,
`lib/sync.ts`'s dependency-linking step resolves components purely from `keyToId` (persisted
cards only), so the reference silently fails to produce a `CardDependency` edge — and, per the
`UPDATE` branch's "refresh only if previously missing" rule, a future sync that finally does
create the missing sibling will not automatically re-link this card's edge, since its
`components` column is already non-null.
**Fix:** Compute `batchFronts` only from cards that will actually be returned — e.g. run the
sentence/blank-safety filtering first (producing the final card list), then derive
`batchFronts`/`effectiveDeckSet` from that survivor set, then run component filtering as a
second pass over the survivors. This requires restructuring the single `flatMap` into two
passes but removes the dangling-reference window.

### WR-03: Truncation-salvage path depends on an unverified SDK-behavior assumption

**File:** `lib/extract-cards.ts:250-281`
**Issue:** The salvage branch is only reachable when the caught error `instanceof
AnthropicError` (line 268). This is a deliberate bet — documented in the surrounding
comments — that a truncated/invalid `parsed_output` always makes `stream.finalMessage()`
*reject* with an `AnthropicError`, never *resolve* with `parsed_output: null`. If a future SDK
version (or an edge case not covered by the cited research) resolves instead of rejecting on
truncation, execution falls into the `if (message.parsed_output)` `false` branch and throws a
plain `Error('No text response from Claude...')` (line 262) — which is **not**
`instanceof AnthropicError`, so the salvage branch never runs even though `rawText` may hold a
perfectly recoverable partial JSON payload. The failure mode is "lesson sync fails and must be
retried" rather than data corruption, but it silently defeats the entire purpose of the
salvage path for that scenario.
**Fix:** Broaden the salvage trigger to not solely gate on error type — e.g. attempt salvage
whenever `rawText.trim().length > 0` and the happy path didn't return, regardless of the
specific error class, falling back to today's behavior only if salvage itself throws:
```ts
} catch (err) {
  if (rawText.trim().length > 0) {
    try {
      return parseExtractionResponse(rawText, deckSet)
    } catch (salvageErr) {
      void salvageErr
      throw err
    }
  }
  throw err
}
```

### WR-04: No intra-batch collision check among `REWRITES` target values

**File:** `scripts/fix-corpus-2026-07.mts:134-152`
**Issue:** The collision check (`prisma.card.findFirst({ where: { normalizedFront:
newNormalizedFront, id: { not: id } } })`) only compares each planned new front against
currently-stored DB rows. It never checks whether two entries within the same `REWRITES` map
would produce the same `newNormalizedFront` as each other. With today's 9 hardcoded values this
doesn't trigger (all distinct), but there is no code-level protection if this script is ever
reused/extended with a colliding pair — the `$transaction` (an array of independent
`prisma.card.update()` promises, lines 198-220) has no surrounding `try/catch`, so a P2002
unique-constraint violation on the second matching update would surface as an unhandled
rejection rather than the script's own clear abort-with-report pattern used everywhere else in
this file.
**Fix:**
```ts
const targetCounts = new Map<string, string[]>()
for (const p of plans) {
  const ids = targetCounts.get(p.newNormalizedFront) ?? []
  ids.push(p.id)
  targetCounts.set(p.newNormalizedFront, ids)
}
const batchCollisions = [...targetCounts.entries()].filter(([, ids]) => ids.length > 1)
if (batchCollisions.length > 0) {
  console.error('FATAL: two or more REWRITES entries target the same normalizedFront:', batchCollisions)
  process.exit(1)
}
```
Also wrap the `$transaction` call in `try/catch` to produce a clear abort message instead of an
unhandled rejection.

### WR-05: Baseline-shape validation only checks one of four `totals` fields

**File:** `scripts/prompt-eval.mts:494-510`
**Issue:** Before diffing, the script validates `Array.isArray(before.perLesson)` and
`typeof before.totals.frontRomanization === 'number'`, then proceeds. It does not check
`sentenceRomanization`, `zeroSafe`, `zeroSentence`, `cardsExtracted`, or that each `perLesson`
entry has the right shape. A partially-malformed or hand-edited baseline JSON (e.g. missing
`zeroSafe`) passes this guard and then flows into `computeDiff` (lines 363-413), where
`before.zeroSafe` would be `undefined`, producing `after.zeroSafe - undefined = NaN` and a
`pass` comparison (`after.zeroSafe === 0`) that is unaffected by the corruption but silently
prints `NaN` in the delta column — a misleading report rather than the intended fail-closed
`FATAL: baseline file ... is malformed` error this section is clearly trying to guarantee.
**Fix:** Extend the guard to check all four `totals` fields and spot-check `perLesson[0]`'s
shape (or validate with a small zod schema), consistent with the fail-closed intent already
expressed by the surrounding code.

## Info

### IN-01: `sentenceMatch` computed twice per surviving sentence

**File:** `lib/extract-cards.ts:381-388`
**Issue:** `sentenceMatch(s.korean, s.targetForm)` runs once inside the `.filter()` predicate
and again inside the immediately following `.map()` for every sentence that passes the filter.
Harmless (pure, cheap function) but redundant.
**Fix:** Compute the match once per sentence up front, e.g. `map` to `{ s, match }` first, then
`filter` on `match.found`, removing the duplicate call.

### IN-02: `prompt-eval.mts` doesn't enforce the env var its own header documents as required

**File:** `scripts/prompt-eval.mts:50-52, 78-79`
**Issue:** The file's header comment lists `DATABASE_AUTH_TOKEN` alongside `ANTHROPIC_API_KEY`
and `DATABASE_URL` as required env vars, but only the latter two are passed through
`requireEnv()`. Running against a Turso `libsql://` URL without a token would fail later, inside
Prisma's connection attempt, with a less clear error than the fail-fast message this section is
designed to provide.
**Fix:** Either add `requireEnv('DATABASE_AUTH_TOKEN')` guarded by a `DATABASE_URL.startsWith('libsql://')` check, or correct the header comment if a local `file:` DB is the intended common case.

### IN-03: `sentenceMatch`'s isolation doc comment is narrower than the implemented rule

**File:** `lib/sentence-match.ts:18-25, 60-62`
**Issue:** The JSDoc (lines 18-25) describes an isolated single-char target as having "space,
whitespace or punctuation on both sides." The actual predicate (lines 60-62) treats *any*
non-Hangul adjacent character as isolated — digits and Latin letters included — which matches
`22-01-PLAN.md`'s explicit design intent ("space, punctuation, digit, Latin all count as
isolated") but is not what the JSDoc communicates. Not a functional bug — behavior is correct
and intentional — but a future maintainer reading only the doc comment could reasonably assume
digit/Latin adjacency is unsafe when it isn't.
**Fix:** Update the doc comment to say "any character that is not Hangul (space, punctuation,
digit, Latin letter, or string edge)" to match the implementation exactly.

---

_Reviewed: 2026-07-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
