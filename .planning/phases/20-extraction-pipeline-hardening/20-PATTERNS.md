# Phase 20: Extraction Pipeline Hardening - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 3 (modified) + 1 dependency change
**Analogs found:** 3 / 3 (all files being modified are their own primary analogs; supporting conventions drawn from `lib/gloss.ts` and existing `tests/*.test.ts`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/extract-cards.ts` (rewrite) | service (server-only LLM pipeline) | request-response + transform | itself (current version) + `lib/gloss.ts` (LLM shape-check convention) | exact |
| `tests/extract-cards.test.ts` (extend + migrate fixtures) | test | batch/transform | itself + `tests/filter-components.test.ts`, `tests/sentence-match.test.ts` | exact |
| `package.json` (add `zod`) | config | — | itself | exact |

No zod usage exists anywhere in the repo yet (`zod` resolved only transitively via `@anthropic-ai/sdk`) — the zod schema in RESEARCH.md §Recommended Zod Schema is the pattern source; there is no in-repo analog.

## Pattern Assignments

### `lib/extract-cards.ts` (service, LLM request-response → pure transform)

**Analog:** the file itself — this is a surgical rewrite, not a new file. Most of the file survives verbatim.

**Imports pattern** (current lines 1-4) — extend, keep relative-style `./` imports used within `lib/`:
```typescript
import Anthropic from '@anthropic-ai/sdk'
import { sentenceMatch } from './sentence-match'
import { normalizeFront } from './card-key'
import { filterComponents } from './filter-components'
```
New imports per RESEARCH.md §Code Examples (verified against installed SDK 0.80.0):
```typescript
import Anthropic, { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
```

**Public contract to preserve** (lines 6-27): keep exported `ExtractedSentence` / `ExtractedCard` interfaces byte-identical — they are the contract consumed by `lib/sync.ts:65`, `scripts/local-resync.mts:79`, and the tests. Zod schemas are additive, not replacements.

**Streaming call pattern** (current lines 51-165): the existing `anthropic.messages.stream({ model: 'claude-opus-4-8', max_tokens: 32000, thinking: { type: 'adaptive' }, system, messages }).finalMessage()` call shape is the locked pattern. Change: add `output_config: { format: zodOutputFormat(ExtractionSchema) }`, split the chained `.finalMessage()` so a `stream.on('text', ...)` accumulator can be registered before awaiting (RESEARCH.md §Happy-Path/Fallback Branching has the complete verified branching code — copy it), and delete only the prompt line 159 (`Return ONLY a JSON array. No markdown fences...`). All other prompt prose (lines 60-158) stays.

**Post-response guard pattern** (current lines 167-173) — today's no-text throw:
```typescript
const content = message.content.find((b) => b.type === 'text')
if (!content || content.type !== 'text') throw new Error('No text response from Claude')
```
Replaced by the `parsed_output === null` check throwing `` `No text response from Claude (stop_reason: ${message.stop_reason})` `` — same convention, same message stem.

**Per-card structural guard** (lines 176-197, `isValidExtractedCard`): keep verbatim on both paths. Its doc comment already cites the convention source: "mirrors lib/gloss.ts's LLM-response shape-check convention". Its guard shape (typeof-object check → non-empty string checks → enum membership, reject-never-coerce) is the pattern for any new guard code.

**Depth-scanner pattern** (lines 234-267, `findLastTopLevelCardBoundary`): keep the string-literal/escape skipping (lines 243-255) unchanged; the only edits are line 260 `depth === 1` → `depth === 2`, plus in the caller: re-close `']'` → `']}'` (lines 284/310) and `indexOf('[')` → `indexOf('{')` (lines 285/311). The `/\[[\s\S]*\]/` regex path (line 277) is deleted entirely — the two salvage blocks collapse into one (RESEARCH.md §Salvage Parser Adaptation has the full rewritten `parseExtractionResponse`).

**Salvage warn pattern** (lines 289-290, 306, 315-317): `console.warn('JSON salvage failed:', err)` — keep this warn-and-continue style for both salvage failure and the new EXTRACT-03 card-drop warn (`console.warn(\`Dropping card without a blank-safe sentence: ${front}\`)`).

**Normalization block to extract** (lines 323-384): lift verbatim into a new exported pure function `normalizeExtractedCards(rawCards: unknown[], deckSet: Set<string>): ExtractedCard[]` — the `isValidExtractedCard` filter (325), CR-01 `batchFronts`/`effectiveDeckSet` union (334-335), components dedup/self-exclude (343-349), `filterComponents` call (353), and field coercion (355-383). The only logic change inside it is the sentence pipeline (lines 367-381): keep the `.found` filter, then add the safe-first stable partition + zero-safe rejection per RESEARCH.md §EXTRACT-03 code example. `sentenceMatch(korean, targetForm)` returns `{ found, index, safeToBlank }` (`lib/sentence-match.ts:13-28`) — `safeToBlank` is the existing single-source predicate; do not write new safety logic.

**Comment style** (lines 178-184, 199-233): substantive block comments naming the requirement ID (GRAPH-02, WR-01, CR-01, IN-01) and explaining *why*. New code should tag EXTRACT-01/02/03 the same way.

---

### `tests/extract-cards.test.ts` (test, pure-function unit tests)

**Analog:** the file itself (14 existing tests) — extend in place; migrate fixtures.

**Test file structure pattern** (lines 1-4):
```typescript
import { describe, it, expect } from 'vitest'
import { parseExtractionResponse } from '../lib/extract-cards'

describe('parseExtractionResponse', () => {
```
Note: tests import via relative `../lib/...`, not the `@/` alias (consistent across `tests/`). New imports for this phase: `normalizeExtractedCards` (new export), plus `zodOutputFormat` + the exported schema for the schema-shape/parse-throw tests, and `AnthropicError` from `@anthropic-ai/sdk`.

**Fixture pattern** (lines 10-32): plain object literals + `JSON.stringify([...])`. **Mechanical migration:** every `JSON.stringify([cardA, cardB])` → `JSON.stringify({ cards: [cardA, cardB] })` (14 call sites: lines 32, 54, 72, 88, 109, 129, 183, 198, 213, 227, 254, 272). Assertion bodies unchanged.

**Truncation fixture pattern** (lines 135-170): raw template-literal strings mimicking a cut stream, with a comment explaining exactly which boundary the scanner must find. Copy this style for the new wrapper-shaped truncation cases — e.g. lines 161-164 becomes the same three cards inside `{"cards":[` ... with the cut in the same place. Add: cut-mid-first-card → expect throw; cut after `]` but before wrapper `}`.

**Nested describe for a concern group** (line 172): `describe('deckNormalizedFronts filtering (GRAPH-03 write-path wiring)', ...)` — use the same shape for new groups: `describe('blank-safety enforcement (EXTRACT-03)')`, `describe('schema shape (EXTRACT-01)')`.

**Descriptive it() names citing requirement IDs** (e.g. line 152 "…(WR-01)", line 232 "…(CR-01)"): follow this naming.

**Run commands** (from `vitest.config.ts` — node env, `@` alias): `npx vitest run tests/extract-cards.test.ts`; full suite `npm test`.

---

### `package.json` (config)

**Analog:** itself. `dependencies` block is alphabetized with caret ranges (`"@anthropic-ai/sdk": "^0.80.0"`, ..., `"ts-fsrs": "^5.3.1"`). Add `"zod": "^4.3.6"` in alphabetical position (after `ts-fsrs`). Install via `npm install zod@^4.3.6` (note: `postinstall` runs `prisma generate` — expected). Do **not** bump `@anthropic-ai/sdk` (RESEARCH.md Pitfall 6).

## Shared Patterns

### LLM-response validation convention
**Source:** `lib/gloss.ts:133-143` (`lookupViaLLM`) and `lib/extract-cards.ts:185-197` (`isValidExtractedCard`)
**Apply to:** all new response-handling code in `extract-cards.ts`
```typescript
// gloss.ts: validate immediately after receipt, throw descriptive errors
const content = message.content[0]
if (content.type !== 'text') throw new Error('Unexpected response from Claude')
```
Shape-check first, JSON.parse inside try/catch, per-item drop with `console.warn` rather than whole-batch failure.

### Server-only module marker
**Source:** `lib/gloss.ts:1-10` header comment
**Apply to:** keep/extend the `extract-cards.ts` header
```typescript
 * No `'use client'` — this module runs server-side only.
```
`parseExtractionResponse` / `normalizeExtractedCards` must stay free of Prisma/SDK imports (currently import only `sentence-match`, `card-key`, `filter-components`) so they remain pure and unit-testable.

### Single-source-of-truth helpers (Don't Hand-Roll)
**Apply to:** normalization pipeline
- Blank-safety: `sentenceMatch(korean, targetForm).safeToBlank` (`lib/sentence-match.ts`)
- Dedup key: `normalizeFront` (`lib/card-key.ts`)
- Component resolution: `filterComponents` (`lib/filter-components.ts`)

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| zod schema definitions | validation schema | — | No zod usage exists in the repo; use RESEARCH.md §Recommended Zod Schema verbatim (verified against installed zod@4.3.6 + SDK 0.80.0). Keep it permissive: only `sentences: .min(1)` as a real constraint; no `.max()`/string `.min(1)` (whole-response client-side throw risk). |
| `stream.on('text')` accumulator + try/catch `finalMessage()` branching | LLM streaming fallback | streaming | Existing code chains `.finalMessage()` directly; the accumulator-before-await pattern comes from RESEARCH.md §Happy-Path/Fallback Branching (SDK-source-verified) — copy that code, not any in-repo file. |

## Metadata

**Analog search scope:** `lib/`, `tests/`, `package.json`, `vitest.config.ts`; repo-wide grep for zod usage
**Files scanned:** ~20 (read in full: `lib/extract-cards.ts`, `tests/extract-cards.test.ts`, `lib/gloss.ts`; targeted: `lib/sentence-match.ts`, `package.json`, `vitest.config.ts`)
**Pattern extraction date:** 2026-07-06
