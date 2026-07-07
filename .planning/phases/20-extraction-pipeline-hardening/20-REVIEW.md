---
phase: 20-extraction-pipeline-hardening
reviewed: 2026-07-06T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - lib/extract-cards.ts
  - tests/extract-cards.test.ts
  - package.json
  - package-lock.json
  - CLAUDE.md
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-07-06T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the structured-outputs migration of `lib/extract-cards.ts` (native `output_config.format` via `zodOutputFormat`, the truncation-salvage fallback path, and the shared `normalizeExtractedCards`/`parseExtractionResponse` pipeline), its test suite, and the dependency/doc changes that accompanied it.

Verified against the installed `@anthropic-ai/sdk@0.80.0` source (`lib/parser.js`, `lib/MessageStream.js`) that the core design claims in the code comments hold up: `zodOutputFormat(...).parse()` does throw an `AnthropicError` synchronously inside the `message_stop` handler on a schema violation or truncated JSON, that exception is funneled through `_emit('error', ...)`, and `finalMessage()` rejects with the same `AnthropicError` instance — so the `err instanceof AnthropicError` salvage branch and the "register `.on('text')` before awaiting `finalMessage()`" ordering are both correct and necessary, not cargo-culted. The bracket-depth truncation scanner (`findLastTopLevelCardBoundary`) was traced by hand against the wrapper-shape depth arithmetic (wrapper `{`=1, `cards` array `[`=2, card object `{`=3) and is correct, including string/escape handling. `npx tsc --noEmit`, `npx eslint`, and `npx vitest run tests/extract-cards.test.ts` (29/29) all pass clean.

No Critical/Blocker-level defects were found (no crash, data-loss, or security issue). Three Warnings and one Info item were found, mostly around data-fidelity edge cases and test-coverage gaps in the newly-added control flow.

## Warnings

### WR-01: Card `front`/`back` are persisted without trimming, unlike the DB dedup key

**File:** `lib/extract-cards.ts:316-317, 372-373`
**Issue:** `isValidExtractedCard` validates non-emptiness using `candidate.front.trim().length === 0` / same for `back`, but the value actually assigned into the returned card (`front = c.front ?? ''`, `back: c.back ?? ''`) is the raw, un-trimmed string. A card whose model-returned `front` is e.g. `" 가다 "` (non-empty after trim, so it passes validation) will pass through with the surrounding whitespace intact into the persisted `Card.front`. Meanwhile `normalizeFront()` (used to compute `Card.normalizedFront`, the actual DB dedup key) *does* trim — so the dedup key and the displayed front can silently diverge in whitespace, and the UI will show a padded/awkward front string. This is inconsistent with the file's own "IN-01" coercion pattern already applied to `notes`/`distractors`.
**Fix:**
```ts
return [{
  type:       (c.type ?? 'vocabulary') as ExtractedCard['type'],
  front:      front.trim(),
  back:       (c.back ?? '').trim(),
  ...
}]
```
(and update `myKey`/`front` local accordingly, e.g. compute `front` trimmed once at the top of the flatMap callback).

### WR-02: `ExtractedCard`/`ExtractedSentence` interfaces are hand-duplicated alongside the new zod schemas

**File:** `lib/extract-cards.ts:22-61`
**Issue:** `ExtractedCardSchema`/`ExtractedSentenceSchema` (zod, lines 22-36) and the exported `ExtractedCard`/`ExtractedSentence` interfaces (lines 40-61) describe the same shape but are two independent hand-written definitions — the interfaces are not derived via `z.infer<typeof ExtractionSchema>`. This was a deliberate choice per the commit history ("interfaces kept byte-identical, zod schemas are additive"), but it means every future field addition/removal must be updated in two places by hand; a drift (e.g. someone adds a field to the zod schema but forgets the interface, or vice versa) will not be caught by the type checker because `unknown[]`/`Partial<ExtractedCard>` casts in `normalizeExtractedCards` and `isValidExtractedCard` erase the connection between the two.
**Fix:** Prefer deriving the public type from the schema to keep a single source of truth:
```ts
export type ExtractedCard = z.infer<typeof ExtractedCardSchema>
export type ExtractedSentence = z.infer<typeof ExtractedSentenceSchema>
```
If the hand-written JSDoc on the interface fields is important to preserve, keep the interface but add a compile-time equality assertion (e.g. a `const _check: ExtractedCard = {} as z.infer<typeof ExtractedCardSchema>` guard, or a shared `satisfies`) so a future schema change that breaks the shape fails the build instead of silently drifting.

### WR-03: `extractCardsFromNotes` — the function containing all the new streaming/salvage control flow — has zero test coverage

**File:** `lib/extract-cards.ts:63-248`, `tests/extract-cards.test.ts` (whole file)
**Issue:** All 29 tests in `tests/extract-cards.test.ts` exercise only the pure helpers (`normalizeExtractedCards`, `parseExtractionResponse`, and the `ExtractionSchema`/`zodOutputFormat` shape). `extractCardsFromNotes` itself — which contains the actual `anthropic.messages.stream(...)` call, the "register `.on('text')` before awaiting" ordering, the happy-path `parsed_output` branch, the "zero text blocks" throw, and the `err instanceof AnthropicError && rawText.trim().length > 0` salvage-vs-rethrow branch — is never imported or invoked by the test file, and is not covered by any other test in the repo (`grep -rn "extractCardsFromNotes" tests/` finds nothing). This is understandably hard to unit test without mocking the Anthropic SDK's streaming client, but it means the most novel and highest-risk logic added in this phase (the EXTRACT-01 migration itself) is verified only by manual/production observation, not by the test suite.
**Fix:** Add a test that mocks `Anthropic.prototype.messages.stream` (or injects a stream-like fake with `.on('text', ...)` and `.finalMessage()`) to cover at minimum: (a) happy path with a non-null `parsed_output`, (b) truncation salvage (`finalMessage()` rejects with an `AnthropicError`, `rawText` non-empty, salvage succeeds), (c) salvage-fails-so-rethrow-original (`salvageErr` path), and (d) zero-text-blocks throw.

## Info

### IN-01: `distractors` count is not validated/enforced in this file

**File:** `lib/extract-cards.ts:33, 379-381`
**Issue:** The zod schema (`distractors: z.array(z.string())`) and the normalization step (`.slice(0, 3)`) both deliberately allow any number of distractors (0–N), per the documented "no `.min()`/`.max()` anywhere" design rationale. The prompt asks for "EXACTLY 3", but nothing in `extract-cards.ts` warns or logs when Claude returns fewer than 3. This is currently masked because `components/StudySession.tsx` pads short distractor lists from other cards' `back` values at study time — so it's not a functional bug today, but it does mean a systematic prompt regression (e.g. Claude starts returning 1 distractor) would go unnoticed at the extraction layer and only surface as degraded multiple-choice quality in the study UI.
**Fix:** Optional — add a `console.warn` when `distractors.length < 3` after filtering, mirroring the existing blank-safety warning, purely for sync-log observability (no behavior change needed since the UI already compensates).

---

_Reviewed: 2026-07-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
