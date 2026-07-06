# Phase 20: Extraction Pipeline Hardening - Research

**Researched:** 2026-07-06
**Domain:** Anthropic SDK structured outputs (`output_config.format` + `zodOutputFormat`) migration of `lib/extract-cards.ts`; truncation-salvage adaptation; code-enforced blank-safety
**Confidence:** HIGH (all critical claims verified directly against installed `@anthropic-ai/sdk@0.80.0` and `zod@4.3.6` source, plus empirical schema-generation runs)

## User Constraints

No CONTEXT.md exists for this phase (discuss-phase was not run). There are no locked user decisions beyond REQUIREMENTS.md (EXTRACT-01/02/03) and the ROADMAP phase goal. Project-level constraints from CLAUDE.md apply (see Project Constraints section).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXTRACT-01 | Extraction uses native structured outputs (zod schema + `output_config.format`/`zodOutputFormat`) instead of asking for JSON in a text response and regex/salvage-parsing it | §Recommended Zod Schema, §Happy-Path/Fallback Branching, §SDK Behavior Findings — exact schema, exact request shape, verified SDK semantics for `.stream().finalMessage()` + `parsed_output` |
| EXTRACT-02 | Truncation-salvage logic is preserved as a fallback for genuine mid-stream cutoffs, adjusted for the new `{ cards: [...] }` response wrapper shape | §Salvage Parser Adaptation — corrected depth arithmetic (`depth === 2`), re-close string `']}'`, and the critical finding that truncation surfaces as a **rejected** `finalMessage()`, requiring an `on('text')` accumulator |
| EXTRACT-03 | `parseExtractionResponse` structurally enforces blank-safety (consults `safeToBlank`, not just `sentenceMatch().found`) and rejects zero-sentence cards, rather than relying on prompt instruction alone | §Blank-Safety Enforcement Design — found-filter → stable-partition safe-first → reject card when zero blank-safe sentences remain; grounded in `lib/sentence-selection.ts` and `StudySession.tsx` behavior |
</phase_requirements>

## Summary

The migration is feasible exactly as scoped, with the installed SDK (`@anthropic-ai/sdk@0.80.0` — no upgrade needed) and the already-resolved transitive `zod@4.3.6` (must be promoted to an explicit dependency). `output_config.format` + `zodOutputFormat()` is GA, works with the existing `messages.stream({... thinking: adaptive ...}).finalMessage()` pattern, and the raw text remains a regular `TextBlock` so salvage stays possible.

**One critical finding overrides the naive plan shape:** with `zodOutputFormat` passed to `.stream()`, a truncated/invalid response does **not** produce a resolved message with `parsed_output: null` — the SDK's parser **throws `AnthropicError`** inside the `message_stop` handler, so `finalMessage()` **rejects** and no message object is available. Verified against `lib/parser.js` (`parseOutputFormat` throws), `lib/MessageStream.js` (`_run`'s rejection handler → `#handleError` → `done()`/`finalMessage()` rejection). Consequence: the fallback branch must be a `try/catch` around `finalMessage()`, with the raw text captured via a `stream.on('text', ...)` accumulator registered **before** awaiting. `parsed_output` is `null` on a *resolved* message only when the response contains zero text blocks (e.g. a pre-output refusal / empty content) — that case should throw a descriptive error, as today's "No text response from Claude" does.

A second important finding constrains the zod schema design: the SDK's `transformJSONSchema` (applied inside `zodOutputFormat`) whitelists only a few keywords for the server-side schema — everything else (**including `enum`, `maxItems`, `minLength`**) is demoted into the `description` string as a soft hint, while zod's client-side `safeParse` still enforces everything **and throws for the whole response** on any single violation. Therefore the schema must stay deliberately permissive on per-card-droppable constraints (no `.max(3)`, no `.min(1)` on strings); only `minItems: 1` on `sentences` survives as a real server-enforced constraint (verified: `minItems` of 0 or 1 is whitelisted). "EXACTLY 3 distractors" stays prompt-side + post-hoc `.slice(0,3)`.

**Primary recommendation:** Keep `extractCardsFromNotes` thin (stream + `on('text')` accumulator + try/catch branching); extract the existing per-card normalization block into a shared pure `normalizeExtractedCards(rawCards, deckSet)` used by both the `parsed_output` happy path and the text-salvage path; rewrite `parseExtractionResponse` for the `{cards:[...]}` wrapper (full `JSON.parse` → salvage scanner at `depth === 2` → throw); add blank-safety partition + zero-safe card rejection inside the shared normalization.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Structured-output extraction call | API / Backend (`lib/extract-cards.ts`, server-only) | — | Anthropic SDK call; secrets; already server-side |
| Salvage parsing + card normalization | API / Backend (pure `lib/` functions) | — | Pure, unit-testable; no Prisma, no client use |
| Blank-safety enforcement (write-time) | API / Backend (`parseExtractionResponse` / normalization) | — | DB invariant "sentences[0] is blank-safe" must be enforced before persistence |
| Blank-safety consumption (study-time) | Browser / Client (`lib/sentence-selection.ts`, `StudySession.tsx`) | — | Unchanged this phase; relies on the invariant this phase hardens |
| Persistence (upsert by `normalizedFront`, `CardDependency` linking) | API / Backend (`lib/sync.ts`, `scripts/local-resync.mts`) | — | Unchanged; consumes `ExtractedCard[]` regardless of parse source |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.110.0 latest on npm; **0.80.0 installed — keep, no upgrade needed** | Claude API client; `zodOutputFormat`, `ParsedMessage`, `AnthropicError` | Structured outputs GA in installed version; `messages.d.ts` documents the exact `.stream()` + `output_config.format` + `.finalMessage().parsed_output` pattern `[VERIFIED: node_modules source]` |
| `zod` | 4.3.6 resolved transitively (latest 4.4.3); **add `"zod": "^4.3.6"` to `dependencies`** | Schema definition for `zodOutputFormat`; client-side validation | The SDK's zod helper is built on `zod/v4`'s `z.toJSONSchema`; peer range `^3.25.0 \|\| ^4.0.0` satisfied `[VERIFIED: npm registry]` |
| `vitest` | existing devDep | Unit tests for `parseExtractionResponse` / normalization / schema shape | Already the project test runner (`npm test` → `vitest run`) `[VERIFIED: package.json + vitest.config.ts]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AnthropicError` (from `@anthropic-ai/sdk`) | 0.80.0 | Typed catch for structured-output parse failure | Exported from the package root (`index.d.ts` line 6). Note: `APIError` **extends** `AnthropicError` in this SDK — an `instanceof AnthropicError` check also matches API errors `[VERIFIED: node_modules source]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `messages.stream()` + `zodOutputFormat` + try/catch | `client.messages.parse()` | `.parse()` is **non-streaming only** (`create().then(parseMessage)` — verified in `resources/messages/messages.js:62`); at `max_tokens: 32000` + adaptive thinking it risks HTTP timeouts. Do not switch. |
| Passing `zodOutputFormat(schema)` whole | Passing `{type, schema}` only (strip `parse`) so `finalMessage()` never throws on bad content, then zod-validate manually | Simpler control flow, but `parsed_output` would always be `null` — violates success criterion #1's "reading `parsed_output` on the happy path". Rejected. |
| `stream.on('text')` accumulator for salvage text | `stream.messages.at(-1)` (the raw snapshot is pushed via `_addMessageParam` *before* the parse throws) | Works (verified in `MessageStream.js` `message_stop` case ordering) but relies on internal call ordering; `on('text')` is the public event API. Use `on('text')`. |

**Installation:**
```bash
npm install zod@^4.3.6
```

**Version verification (performed 2026-07-06):**
```bash
npm view zod version            # → 4.4.3 (published within ^4.3.6 range; repo colinhacks/zod)
npm view @anthropic-ai/sdk version  # → 0.110.0 (installed 0.80.0 has everything needed — do NOT upgrade in this phase)
node -e "console.log(require('zod/package.json').version)"  # → 4.3.6 (currently resolved)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| zod | npm | years (last publish 2026-05-04) | ~211.6M/wk | github.com/colinhacks/zod | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

`gsd-tools query package-legitimacy check --ecosystem npm zod` → `OK` (exists, 211,601,986 weekly downloads, no postinstall script, not deprecated) `[VERIFIED: npm registry + legitimacy seam]`. `zod` was already mandated by the ROADMAP/orchestrator (not discovered via search), and is the SDK's own peer dependency.

## SDK Behavior Findings (all verified against installed source)

These are the load-bearing facts the plan must be built on. All `[VERIFIED: node_modules @anthropic-ai/sdk@0.80.0 source]` unless noted.

1. **`zodOutputFormat(schema)`** (`helpers/zod.js`) returns `{ type: 'json_schema', schema: transformJSONSchema(z.toJSONSchema(schema, { reused: 'ref' })), parse(content) }`. Its `parse()`:
   - `JSON.parse(content)` — throws `AnthropicError("Failed to parse structured output as JSON: ...")` on truncated/invalid JSON.
   - `zodObject.safeParse(parsed)` — throws `AnthropicError("Failed to parse structured output: ...")` listing zod issues on any schema violation **anywhere in the response**.
   - On success returns `output.data` — zod v4 objects **strip unknown keys** (empirically confirmed: an extra property in a card is silently removed).

2. **Stream path parse timing:** on the `message_stop` event, `MessageStream` calls `_addMessageParam(rawSnapshot)` then `_addMessage(maybeParseMessage(snapshot, params))` (`MessageStream.js:407-410`). `maybeParseMessage` calls `parseMessage` **only when the format object has a `parse` method**; `parseMessage` → `parseOutputFormat` → `format.parse(block.text)` for each text block, and **any throw propagates**: the run loop's executor rejects → `#handleError` wraps/emits `'error'` → `done()` and therefore **`finalMessage()` reject with `AnthropicError`**.
   - **Consequence:** on a genuine `max_tokens` truncation (or a mid-stream refusal leaving partial text), there is **no resolved message and no `parsed_output: null`** — the await throws. The salvage path must therefore be a `catch` block, and the raw text must be captured independently via `stream.on('text', cb)` **registered before** `await stream.finalMessage()`.
   - `parsed_output === null` on a **resolved** message happens only when the content has zero text blocks (e.g. pre-output `stop_reason: 'refusal'`, which is HTTP-200 with empty content). Handle by throwing a descriptive error (equivalent of today's `'No text response from Claude'`), including `message.stop_reason` for diagnosability.

3. **`transformJSONSchema` keyword whitelist** (`lib/transform-json-schema.js`): survives into the wire schema — `type`, `description`, `title`, `properties`, `required` (passed through as-is), `items`, `anyOf`/`oneOf`(→`anyOf`)/`allOf`, `$ref`/`$defs`, string `format` (10-format whitelist), and array `minItems` **only when 0 or 1**. Every object gets `additionalProperties: false` forced. **Everything else — `enum`, `const`, `maxItems`, `minItems ≥ 2`, `minLength`/`maxLength`, numeric bounds — is popped and appended to the `description` as a JSON-ish hint** (e.g. `"description": "{enum: [\"vocabulary\",\"grammar\",\"phrase\"]}"`, empirically confirmed). So those constraints are *not* server-enforced by this SDK version; they are prompt-visible hints plus client-side zod checks.

4. **`.optional()` works** — the generated schema simply omits the field from `required` (empirically confirmed for `notes`), and the SDK transform passes `required` through without forcing all keys. No `.nullable()` workaround needed. `[VERIFIED: empirical schema generation]`

5. **`minItems: 1` on `sentences` IS server-enforced** (whitelisted). Structured outputs are constrained decoding, so the model *cannot* emit a card with an empty `sentences` array on the happy path — "well-formed by construction," exactly the phase goal. (Post-filter zero-sentence is still possible in our code — see EXTRACT-03 design.)

6. **`stop_reason` is unaffected by structured outputs**: truncation still reports `max_tokens`; on the zodOutputFormat path you never see it on a resolved message for truncations (see #2), so no explicit `stop_reason === 'max_tokens'` branch is needed — the catch covers it.

7. **Structured outputs compatibility:** works with streaming and extended/adaptive thinking; incompatible with citations and prefilling (neither used here). `thinking: {type: 'adaptive'}` and `output_config` are independent top-level fields — no conflict. `[CITED: claude-api skill, platform.claude.com/docs/en/build-with-claude/structured-outputs.md]`

8. **Schema compilation latency:** a new schema incurs a one-time server-side compilation cost; subsequent requests hit a 24-hour schema cache. Negligible against the existing 30–90s extraction call, but worth knowing when the first post-deploy sync feels slower. `[CITED: claude-api skill structured-outputs notes]`

## Recommended Zod Schema (Question A)

```typescript
// lib/extract-cards.ts
import { z } from 'zod'   // zod v4 root export — same runtime module the SDK uses via 'zod/v4'

const ExtractedSentenceSchema = z.object({
  korean:      z.string(),
  targetForm:  z.string(),
  translation: z.string(),
})

const ExtractedCardSchema = z.object({
  type:        z.enum(['vocabulary', 'grammar', 'phrase']),
  front:       z.string(),
  back:        z.string(),
  notes:       z.string().optional(),
  distractors: z.array(z.string()),
  sentences:   z.array(ExtractedSentenceSchema).min(1),   // minItems:1 — server-enforced
  components:  z.array(z.string()),
})

const ExtractionSchema = z.object({ cards: z.array(ExtractedCardSchema) })
```

Empirically generated wire schema (via `zodOutputFormat(ExtractionSchema).schema` against installed packages): sentence object becomes a `$defs.__schema0` ref; every object carries `additionalProperties: false`; `notes` omitted from `required`; `sentences` keeps `minItems: 1`; `type` becomes `{"type":"string","description":"{enum:[...]}"}`. `[VERIFIED: empirical run against node_modules]`

**Design rules (each grounded in the SDK findings above):**
- **Do NOT add** `.max(3)` / `.length(3)` on `distractors` or `sentences`, or `.min(1)` on any string. None are server-enforceable (demoted to description), but zod *would* enforce them client-side — turning one over-long array or one empty string anywhere in an otherwise-perfect response into a whole-response `AnthropicError` that degrades everything to the salvage path. Keep "EXACTLY 3 distractors" and "1–3 sentences" as prompt instructions plus the existing post-hoc `.slice(0, 3)` in normalization.
- **`z.enum` for `type` is fine to keep** — it documents intent, emits a description hint the model sees, and the worst case (model emits `"noun"`) degrades gracefully: client parse throws → catch → salvage re-parses the (valid) JSON without zod → `isValidExtractedCard` drops just that card. Alternatively `z.string()` avoids even that degradation; the enum is recommended for the hint value.
- **Wrapper object `{ cards: [...] }` is required** — structured outputs need an object root (top-level schema is an object; a bare array root is not a supported response shape here), which is why the ROADMAP mandates it.
- **Keep the existing exported `ExtractedCard`/`ExtractedSentence` interfaces** as the public contract (used by `lib/sync.ts`, tests, downstream). The zod-inferred type is structurally compatible input to the shared normalization pipeline, which returns `ExtractedCard[]` as today. (Optionally add a one-line `const _check: z.infer<typeof ExtractedCardSchema> extends ... ` compile assertion; not required.)
- **Prompt changes:** delete the now-false "Return ONLY a JSON array. No markdown fences..." instruction (the format parameter guarantees shape). All field-semantics prose (blank-safety rules, exhaustiveness, component rules, distractor count) **stays in the prompt** — the schema enforces shape, not semantics.

## Happy-Path / Fallback Branching (Question E)

```typescript
export async function extractCardsFromNotes(
  notes: string,
  existingNormalizedFronts: string[] = [],
  emphasized: string[] = []
): Promise<ExtractedCard[]> {
  const anthropic = new Anthropic()
  const deckSet = new Set(existingNormalizedFronts)

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ExtractionSchema) },
    system: ...,      // unchanged
    messages: [...],  // prompt minus the "Return ONLY a JSON array" instruction
  })

  // MUST be registered before awaiting — on truncation finalMessage() REJECTS
  // and the raw text is otherwise unrecoverable (the parsed message is never added).
  let rawText = ''
  stream.on('text', (delta) => { rawText += delta })

  try {
    const message = await stream.finalMessage()
    if (message.parsed_output) {
      // Happy path: server-constrained, zod-validated shape. Business rules
      // (blank-safety, zero-sentence rejection, dedup, filterComponents) still
      // run — zod enforces JSON shape only.
      return normalizeExtractedCards(message.parsed_output.cards, deckSet)
    }
    // Resolved message with zero text blocks: pre-output refusal / empty content.
    throw new Error(`No text response from Claude (stop_reason: ${message.stop_reason})`)
  } catch (err) {
    // Truncation (stop_reason max_tokens), mid-stream refusal partials, or a
    // mid-stream connection drop all surface here as AnthropicError with
    // partial accumulated text. Salvage the completed cards.
    if (err instanceof AnthropicError && rawText.trim().length > 0) {
      return parseExtractionResponse(rawText, deckSet)
    }
    throw err
  }
}
```

**Edge cases, resolved:**
- **Truncation (`max_tokens`)** → parse throws inside SDK → catch → salvage from `rawText`. This is the EXTRACT-02 path.
- **Pre-output refusal** (`stop_reason: 'refusal'`, empty content — possible on Opus 4.8, effectively never for this benign task) → resolved message, `parsed_output === null`, `rawText` empty → descriptive throw (matches today's behavior of throwing on no-text). Do not attempt salvage.
- **Mid-stream refusal** → partial text → SDK parse throws → salvage attempt; likely yields whatever cards completed. Acceptable.
- **API/network error mid-stream** → `APIError extends AnthropicError`, so the broad `instanceof AnthropicError` check will also salvage partial cards from a dropped connection — same spirit as truncation salvage, and strictly better than losing them. An *early* API error (no text yet) rethrows because `rawText` is empty. If the planner prefers parse-failures-only, narrow with `!(err instanceof APIError)` — but the broad version is recommended.
- **Salvage itself fails** (e.g. cut mid-first-card) → `parseExtractionResponse` throws (`'No JSON …'`) — callers (`lib/sync.ts` per-lesson `Promise.allSettled`, `local-resync.mts`) already treat a per-lesson throw as a reported failure. Note: if the salvage throw should preserve the *original* error, wrap in try/catch and rethrow `err`; minor planner choice.
- **Do not check `stop_reason` on the happy path** — a resolved message with non-null `parsed_output` is by construction a complete, schema-valid response.

**Caller compatibility:** signature is unchanged (`(notes, existingNormalizedFronts, emphasized) → Promise<ExtractedCard[]>`); `lib/sync.ts:65` and `scripts/local-resync.mts:79` need no changes. `[VERIFIED: grep of call sites]`

## Salvage Parser Adaptation (Question B)

New response shape (guaranteed by constrained decoding — no markdown fences, no preamble, text begins with `{`):

```
{ "cards": [ {card}, {card}, ... ] }
  ↑depth 1   ↑depth 2  ↑card opens at depth 3
```

**Depth arithmetic:** wrapper `{` → 1, `"cards": [` → 2, each card `{` → 3 (its nested `sentences` array → 4, sentence objects → 5). A `}` that returns depth to **2** closes a top-level card. The old rule was `depth === 1` (bare array). The string-literal/escape skipping in `findLastTopLevelCardBoundary` is unchanged and still necessary (braces inside Korean/English sentence text).

**Recommended rewrite of `parseExtractionResponse`:**

```typescript
export function parseExtractionResponse(
  text: string,
  deckNormalizedFronts: Set<string> = new Set()
): ExtractedCard[] {
  let rawCards: unknown[] = []
  // 1. Full parse of the wrapper object (replaces the old /\[[\s\S]*\]/ regex —
  //    unnecessary now that the format parameter guarantees bare JSON).
  try {
    const full = JSON.parse(text.trim()) as { cards?: unknown }
    if (full && Array.isArray(full.cards)) rawCards = full.cards
  } catch {
    // 2. Truncated mid-stream: find the last COMPLETE top-level card and re-close
    //    BOTH the cards array and the wrapper object.
    const lastBrace = findLastTopLevelCardBoundary(text)   // now: depth === 2
    if (lastBrace !== -1) {
      try {
        const salvaged = text.slice(0, lastBrace + 1) + ']}'   // was: + ']'
        const start = salvaged.indexOf('{')                    // was: indexOf('[')
        if (start !== -1) {
          const full = JSON.parse(salvaged.slice(start)) as { cards?: unknown }
          if (full && Array.isArray(full.cards)) rawCards = full.cards
        }
      } catch (salvageErr) { console.warn('JSON salvage failed:', salvageErr) }
    }
  }
  if (rawCards.length === 0) throw new Error('No cards found in extraction response')
  return normalizeExtractedCards(rawCards, deckNormalizedFronts)
}
```

- **Prefer the depth-2 rule over "find `"cards":[` and reuse the old array scanner"** — the substring approach needs its own quote-aware search for the key and offset bookkeeping; changing one comparison (`depth === 1` → `depth === 2`) plus the re-close string is strictly simpler, and the scanner already handles strings/escapes.
- Slicing at `lastBrace + 1` discards any trailing partial content, including a dangling `,` or a truncated next card — appending `']}'` always yields balanced JSON when the boundary was genuine.
- Edge: truncation *after* the cards array closed but before the wrapper `}` (text ends `...}]`) — full parse fails, scanner finds the last card's `}` (the `]` after it drops depth to 1, never triggering the depth-2 rule again), slice cuts before the stray `]`, re-close succeeds. Handled.
- Edge: cut mid-first-card → boundary `-1` → throw (same as today).
- The two salvage blocks in the current code (no-bracket path + parse-failure path) collapse into one, because the wrapper's full parse either succeeds or we scan the original full text — the old "regex matched but JSON.parse failed / regex matched wrong `]`" pathology disappears along with the regex.
- **Test fixture migration:** all 14 existing `parseExtractionResponse` tests pass bare arrays — update fixtures mechanically to `JSON.stringify({cards: [...]})`. Do not keep bare-array acceptance; a single contract is cleaner and criterion #2 specifies the wrapper.

## Blank-Safety Enforcement Design (Question C — EXTRACT-03)

**Recommended design — refined variant of option (a):** keep the `.found` filter, then stable-partition safe-first, then reject the card if no blank-safe sentence exists.

Per card, inside `normalizeExtractedCards`:
1. Filter sentences to `sentenceMatch(s.korean, s.targetForm).found` (unchanged — a non-found sentence renders un-highlighted and produces a wrong fill-blank answer everywhere; always drop).
2. Stable-partition the survivors: sentences with `sentenceMatch(...).safeToBlank === true` first (preserving relative order), then the non-safe survivors (preserving relative order). Cap at 3 (`.slice(0, 3)`).
3. If the partition produced **zero blank-safe sentences** (which includes the zero-sentences-at-all case), **drop the entire card** — omit it from the returned array, with a `console.warn` naming `front` for sync-log observability.

**Why keep (not drop) non-blank-safe supplementary sentences:** the design intent — encoded in the extraction prompt ("The FIRST sentence for every card MUST be blank-safe... authentic lesson sentences can follow") and in study-time behavior — is that only the *blank* modes need a safe sentence. `lib/sentence-selection.ts` step 3 explicitly implements: "when `needsBlank` and the tier pick is NOT safe to blank, fall back to the **first blank-safe sentence in the array**; if none is safe, gracefully degrade." `StudySession.tsx` uses `chosenMatch.safeToBlank` per-sentence (`useChosenForFill`, `recallBlanked`) and Exposure mode rotates freely across all sentences for context variety. Dropping every non-safe sentence would shrink Exposure variety (especially grammar cards' 2–3 different-verb examples, where a second example can legitimately repeat a substring) with zero benefit — the selection layer already never blanks an unsafe sentence. A literal reading of EXTRACT-03's "drops sentences that fail safeToBlank" would regress this; the requirement's *intent* ("no card reaches the DB without a code-verified blank-safe first sentence", criterion #3) is fully satisfied by partition + rejection. `[VERIFIED: lib/sentence-selection.ts doc comment + StudySession.tsx lines 381–450]`
   - Partition (vs. minimal "promote first safe to index 0") is preferred: one-line implementation, deterministic, and it makes `sentences[0]` safe *and* front-loads additional safe sentences for the selection fallback. Order beyond index 0 has no functional weight (selection is by `unknownCount` + hash rotation, not index).
4. **"Rejects zero-sentence cards" = omit that card from the `ExtractedCard[]` return value.** Grounded in the function contract: `parseExtractionResponse(text, deckSet): ExtractedCard[]` returns the persistable card list — `lib/sync.ts` upserts exactly what is returned, so omission means never persisted. It does **not** mean rejecting the lesson's whole response (the other cards are unaffected), and there is no per-card error channel to the caller. Rule 3 subsumes the pure zero-sentence case (0 sentences ⇒ 0 safe ⇒ rejected).
5. Layering with the schema: `sentences: z.array(...).min(1)` means the model *cannot emit* a zero-sentence card on the happy path (constrained decoding), but post-filter zero (all sentences failed `.found`) and zero-safe (all survivors unsafe) remain possible — the code-level rejection is required regardless. Both layers together are the "by construction + code-enforced" story the phase goal describes.

## Regression Safety for Criterion #4 (Question D)

**Confirmed: dedup and `filterComponents` are completely source-agnostic and can remain byte-identical.** The current normalization block (`lib/extract-cards.ts:325–384`) — `isValidExtractedCard` filter → `batchFronts`/`effectiveDeckSet` union (CR-01) → per-card components dedup/self-exclude → `filterComponents(deduped, effectiveDeckSet)` (GRAPH-03) → field coercion — operates on a parsed card array with no knowledge of how it was obtained. Refactor plan: lift lines 325–384 verbatim into `normalizeExtractedCards(rawCards: unknown[], deckSet: Set<string>): ExtractedCard[]` (exported for tests); `parseExtractionResponse` becomes "obtain rawCards from text" + call it; the happy path calls it directly on `parsed_output.cards`. Add the EXTRACT-03 partition/rejection inside it (replacing the current sentence `.filter(...).slice(0,3)` step). DB-level dedup (`Card.normalizedFront @unique` + upsert in `lib/sync.ts`) is untouched.

**`isValidExtractedCard` — still necessary on BOTH paths, nothing becomes redundant:**
- **Salvage path:** plain `JSON.parse` output, zero schema validation — the full guard (front/back non-empty strings, type-enum check) remains load-bearing exactly as today.
- **Happy path:** zod guarantees *shape* but `z.string()` admits `""` (and `minLength` is not server-enforceable — see SDK finding #3), so the non-empty-front/back guard still catches a real class of bad cards with a per-card drop instead of nothing. The type-enum check is client-guaranteed by zod on this path (harmlessly redundant), but since the same pipeline serves the salvage path, keep the single uniform guard — cheap, and one pipeline = one test surface.

## Architecture Patterns

### Data flow (after refactor)

```
lesson notes ──► extractCardsFromNotes (lib/extract-cards.ts, server-only)
                   │  anthropic.messages.stream({... output_config.format: zodOutputFormat(ExtractionSchema)})
                   │  stream.on('text') → rawText accumulator
                   ▼
        try: await stream.finalMessage()
                   │
        ┌──────────┴─────────────────────────┐
        │ resolves                            │ rejects (AnthropicError:
        │                                     │ truncation / partial / schema violation)
        ▼                                     ▼
  parsed_output non-null?              rawText non-empty?
   yes │        no → throw              yes │       no → rethrow
       ▼        (refusal/empty)             ▼
 parsed_output.cards            parseExtractionResponse(rawText, deckSet)
       │                          │ JSON.parse wrapper → OR depth-2 salvage scan
       │                          ▼
       └────────────► normalizeExtractedCards(rawCards, deckSet)   ◄─── shared, pure
                        │ isValidExtractedCard (per-card drop)
                        │ CR-01 batchFronts union
                        │ components dedup/self-exclude → filterComponents (GRAPH-03)
                        │ sentences: .found filter → safe-first partition → slice(0,3)
                        │ EXTRACT-03: zero-blank-safe ⇒ drop card (warn)
                        ▼
                  ExtractedCard[] ──► lib/sync.ts upsert by normalizedFront (unchanged)
                                  ──► scripts/local-resync.mts (unchanged)
```

### Anti-Patterns to Avoid
- **Awaiting `finalMessage()` without a pre-registered `on('text')` accumulator** — on truncation the reject leaves no message object and the completed cards are unrecoverable.
- **Encoding per-card-droppable rules in zod** (array max/length, string min) — client-side zod failure is all-or-nothing for the response; one bad card must not degrade fifty good ones to salvage quality. Schema = shape; code = business rules.
- **Switching to `client.messages.parse()`** — non-streaming; will time out at this output size.
- **`JSON.parse` inside render or shared client code** — not applicable here (all server-side), but keep `normalizeExtractedCards`/`parseExtractionResponse` free of Prisma/SDK imports so they stay pure and unit-testable (they currently import only `sentence-match`, `card-key`, `filter-components` — preserve that).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| zod → JSON Schema conversion + Anthropic subset compliance | Hand-written JSON schema or custom converter | `zodOutputFormat()` (SDK helper) | It applies `transformJSONSchema` which knows the exact server whitelist (`additionalProperties:false` forcing, keyword demotion) — hand-rolled schemas risk 400s on unsupported keywords |
| Response validation on the happy path | Manual field checks against `parsed_output` | The SDK's built-in zod `safeParse` (inside `zodOutputFormat.parse`) | Already runs before `parsed_output` is populated; typed result |
| Blank-safety predicate | New "is safe" logic in extract-cards | `sentenceMatch(korean, targetForm).safeToBlank` (`lib/sentence-match.ts`) | Single source of truth already shared with StudySession/CardEditor/sentence-selection; AUDIT-02 (Phase 21) also mandates reusing it |
| Dedup key | Any new normalization | `normalizeFront` (`lib/card-key.ts`) | DB unique key contract |
| Component resolution | Containment/string checks | `filterComponents` (`lib/filter-components.ts`) | Locked GRAPH-03 behavior; criterion #4 |

**Key insight:** every helper this phase needs already exists and is unit-tested; the phase is wiring + one new pure function boundary, not new algorithms.

## Common Pitfalls

### Pitfall 1: Expecting `parsed_output: null` on truncation
**What goes wrong:** Code written as `if (message.parsed_output) {...} else { salvage }` never reaches the else on truncation — `finalMessage()` rejects first.
**Why:** `maybeParseMessage` runs the throwing `format.parse()` inside the `message_stop` handler (verified, SDK 0.80.0).
**How to avoid:** try/catch around `finalMessage()`; `on('text')` accumulator registered first.
**Warning signs:** "salvage path" unit-unreachable; sync failures reporting `AnthropicError: Failed to parse structured output as JSON` with no cards saved.

### Pitfall 2: Over-constraining the zod schema
**What goes wrong:** `.max(3)` / `.length(3)` / `z.string().min(1)` are silently dropped from the server schema (demoted to description) but enforced client-side — a single violating card throws for the entire response.
**How to avoid:** Only `minItems: 0|1` survives server-side; keep everything else prompt-side + post-hoc normalization.
**Warning signs:** intermittent whole-lesson salvage-path hits on responses that look fine.

### Pitfall 3: Assuming `enum` is server-enforced
**What goes wrong:** Trusting `type` to always be one of three values on the happy path and deleting `isValidExtractedCard`.
**Why:** SDK 0.80.0's transform demotes `enum` to a description hint (empirically confirmed); only client-side zod enforces it — via a whole-response throw.
**How to avoid:** keep `isValidExtractedCard` in the shared pipeline (also needed for empty-string guards and the salvage path).

### Pitfall 4: Forgetting the prompt still owns semantics
**What goes wrong:** Trimming the prompt aggressively because "the schema handles it" — blank-safety rules, exhaustiveness, component semantics, distractor quality are all invisible to the schema.
**How to avoid:** remove only the "Return ONLY a JSON array / no fences" formatting instruction; keep all field-semantics sections. Field descriptions could also move into `.describe()` calls, but do not duplicate them in both places.

### Pitfall 5: Test fixtures left on the bare-array contract
**What goes wrong:** 14 existing tests in `tests/extract-cards.test.ts` pass `JSON.stringify([...])`; after the rewrite they must pass `JSON.stringify({cards: [...]})` or they all fail.
**How to avoid:** mechanical fixture update in the same plan that changes the parser; add wrapper-truncation fixtures.

### Pitfall 6: SDK upgrade drift
**What goes wrong:** npm latest is 0.110.0; an incidental `npm update` could change `transformJSONSchema`/parse semantics this phase's design depends on (e.g. a future version might keep `enum` server-side or stop throwing).
**How to avoid:** do not upgrade `@anthropic-ai/sdk` in this phase; a schema-shape snapshot test (Wave 0) turns any future drift into a visible test failure.

### Pitfall 7: `react-hooks/purity` false alarm
Not applicable — all new code is server-side `lib/` (no render paths), but keep the new functions pure (no `Date.now()`, no I/O) so they remain client-safe by convention and trivially testable. Lint must stay clean (`npm run lint`).

## Code Examples

### Verified `zodOutputFormat` request/response pattern
```typescript
// Source: node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts (doc example on .stream())
// + helpers/zod.d.ts; adapted to this codebase's existing call shape.
import Anthropic, { AnthropicError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

const stream = anthropic.messages.stream({
  model: 'claude-opus-4-8',
  max_tokens: 32000,
  thinking: { type: 'adaptive' },
  output_config: { format: zodOutputFormat(ExtractionSchema) },
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userPrompt }],
})
let rawText = ''
stream.on('text', (t) => { rawText += t })
const message = await stream.finalMessage()   // ParsedMessage<{cards: ...[]}>
message.parsed_output  // typed {cards: [...]} | null  (null ⇔ zero text blocks)
```

### Salvage boundary scanner (one-comparison change)
```typescript
// Existing findLastTopLevelCardBoundary, with the boundary rule updated for the
// {cards:[...]} wrapper: a card now closes when '}' returns depth to 2 (was 1).
} else if (ch === ']' || ch === '}') {
  depth--
  if (ch === '}' && depth === 2) {   // ← was: depth === 1
    lastBoundary = i
  }
}
// Re-close: text.slice(0, lastBrace + 1) + ']}'   // ← was: + ']'
// Parse from: salvaged.indexOf('{')               // ← was: indexOf('[')
```

### EXTRACT-03 sentence pipeline (inside normalizeExtractedCards)
```typescript
const found = rawSentences.filter((s): s is ExtractedSentence =>
  /* existing shape checks */ && sentenceMatch(s.korean, s.targetForm).found)
const safe   = found.filter((s) => sentenceMatch(s.korean, s.targetForm).safeToBlank)
const unsafe = found.filter((s) => !sentenceMatch(s.korean, s.targetForm).safeToBlank)
if (safe.length === 0) {
  console.warn(`Dropping card without a blank-safe sentence: ${front}`)
  return null   // filtered out of the returned array (e.g. via .flatMap or .filter(Boolean))
}
const sentences = [...safe, ...unsafe].slice(0, 3)  // sentences[0] guaranteed blank-safe
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Return ONLY a JSON array" prompt + regex extraction + tolerant parse | `output_config.format` constrained decoding (GA, no beta header) | GA in SDK line well before 0.80.0 | Response is schema-valid by construction except truncation/refusal; regex extraction obsolete |
| Top-level `output_format` param | `output_config: { format: ... }` | API-wide deprecation | Use only `output_config.format` |
| `budget_tokens` thinking | `thinking: { type: 'adaptive' }` | Opus 4.6+ | Already adopted in this codebase; unchanged |

**Deprecated/outdated:** `output_format` top-level parameter (replaced by `output_config.format`); assistant prefill for JSON forcing (400s on Opus 4.8 — structured outputs is its replacement).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Anthropic's server accepts objects whose `required` omits optional properties (i.e. optional fields supported in structured outputs) `[ASSUMED — strongly supported: the SDK's own transform emits exactly this shape by design, and the empirical schema for `notes` omits it from `required`; not confirmed by a live API call this session]` | Recommended Zod Schema | A 400 on the first live call; trivially fixed by `notes: z.string().nullable()` + coercing null→undefined in normalization. Verify on first live extraction (see Validation) |
| A2 | Structured-output text is always fence-free bare JSON starting at `{` `[CITED: structured outputs docs — constrained decoding]` | Salvage Parser | Salvage scanner tolerates leading junk anyway (`indexOf('{')`); full-parse path uses `.trim()`. Low impact |
| A3 | A mid-stream `stop_reason: 'refusal'` is effectively unreachable for Korean-lesson extraction `[ASSUMED]` | Branching | Handled anyway by the catch/salvage path; zero design impact |

No other assumptions — all load-bearing claims were verified against installed package source or empirical runs this session.

## Open Questions

1. **Should the salvage-path throw preserve the original `AnthropicError`?**
   - What we know: if salvage also fails, `parseExtractionResponse` throws its own generic error, losing the SDK error detail.
   - Recommendation: wrap the salvage call and rethrow the original error on salvage failure (one try/catch); planner's discretion — either is acceptable.
2. **Partial-extraction + contentHash interaction (pre-existing, out of scope):** when salvage returns partial cards, `lib/sync.ts` still records the lesson as synced by contentHash, permanently skipping the truncated tail. This is today's behavior, unchanged by this phase — flag for a future milestone rather than expanding scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/tests | ✓ | 25.8.2 | — |
| npm | `npm install zod` | ✓ | 11.11.1 | — |
| `@anthropic-ai/sdk` | structured outputs | ✓ (installed) | 0.80.0 | — (do not upgrade) |
| `zod` | schema | ✓ (transitive; promote to direct dep) | 4.3.6 | — |
| vitest | unit tests | ✓ | devDep | — |
| `ANTHROPIC_API_KEY` (.env) | live verification only (`local-resync.mts` single-lesson run) | ✓ (per CLAUDE.md env list) | — | Unit tests need no key |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project devDep; node environment) |
| Config file | `vitest.config.ts` (alias `@` → root) |
| Quick run command | `npx vitest run tests/extract-cards.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXTRACT-01 | `zodOutputFormat(ExtractionSchema).schema` shape: `additionalProperties:false` on all objects, `sentences.minItems===1`, `notes` optional, wrapper root object | unit (schema snapshot — no API call) | `npx vitest run tests/extract-cards.test.ts` | ❌ Wave 0 (new describe block) |
| EXTRACT-01 | `zodOutputFormat(...).parse` throws `AnthropicError` on truncated text and on schema-violating JSON (guards SDK-upgrade drift the branching depends on) | unit | same | ❌ Wave 0 |
| EXTRACT-01 | Happy path consumes a raw `{cards:[...]}` object via `normalizeExtractedCards` with identical output to the text path | unit (pure function, object input) | same | ❌ Wave 0 |
| EXTRACT-02 | Well-formed `{cards:[...]}` text parses fully; truncation mid-card-2 salvages card 1; truncation inside a nested `sentences` object doesn't produce a false boundary; cut mid-first-card throws | unit against `parseExtractionResponse` with crafted strings | same | ❌ Wave 0 (extend existing file; migrate 14 existing fixtures to wrapper shape) |
| EXTRACT-03 | Card whose sentences all fail `.found` → rejected; card with found-but-unsafe-only sentences → rejected; unsafe supplementary sentence retained *after* a safe one; safe sentence promoted to index 0 | unit | same | ❌ Wave 0 |
| EXTRACT-04 regression (criterion #4) | Existing dedup/self-exclude/`filterComponents`/CR-01 tests still pass unmodified in logic (fixtures re-wrapped only) | unit (existing 14 tests) | same | ✅ `tests/extract-cards.test.ts` |
| Criterion #4 live check | One-lesson extraction via `npx tsx scripts/local-resync.mts` produces cards with populated `components`, no duplicate `normalizedFront`, sentences[0] blank-safe | manual-only (requires ANTHROPIC_API_KEY + Turso; also verifies assumption A1) | human-verify at phase end | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/extract-cards.test.ts`
- **Per wave merge:** `npm test && npm run lint`
- **Phase gate:** full suite green + one live single-lesson extraction (manual) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/extract-cards.test.ts` — migrate 14 fixtures to `{cards:[...]}`; add truncation-salvage, blank-safety-partition, zero-safe-rejection, schema-shape, and SDK-parse-throw cases (covers EXTRACT-01/02/03)
- [ ] `package.json` — `zod` added to `dependencies` (`^4.3.6`)
- [ ] No new framework/config needed — vitest infrastructure already covers this phase

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged — middleware gate covers /api/sync) | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | LLM output is untrusted input: zod schema (shape) + `isValidExtractedCard` + field coercion (business rules) before any Prisma write — this phase *strengthens* the existing V5 posture |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via Google Doc lesson content steering card fields | Tampering | Unchanged risk surface; structured outputs narrows it (response cannot carry non-schema payloads); per-card validation drops malformed items; single-tenant app limits blast radius |
| Malformed LLM JSON causing unbounded work / crash in parser | DoS | Salvage scanner is a single O(n) pass; `JSON.parse` on bounded (32K-token) text; per-lesson `Promise.allSettled` isolation in `lib/sync.ts` |
| Secrets exposure | Information disclosure | `ANTHROPIC_API_KEY` stays server-side in `lib/` (no `'use client'`); no new env vars |

## Project Constraints (from CLAUDE.md)

- **Model/pattern lock:** extraction uses `claude-opus-4-8`, `thinking: {type:'adaptive'}`, `.stream(...).finalMessage()`, `max_tokens 32000` — preserve all (the structured-outputs param is additive).
- **Vercel Hobby 60s hard limit; `MAX_LESSONS_PER_SYNC = 1`** — no change to per-request work; bulk verification runs via `npx tsx scripts/local-resync.mts` locally.
- **ESLint strict (`react-hooks/purity`, `set-state-in-effect`); lint must stay clean** — new code is server-side pure functions; no render-path impurity possible, but run `npm run lint` per wave.
- **LLM response validation convention:** "LLM responses are validated immediately after receipt" — this phase is that convention's hardening.
- **Module conventions:** server-only lib modules carry the `// No 'use client'` comment; pure shared modules must avoid Prisma/Node builtins (`parseExtractionResponse`/`normalizeExtractedCards` qualify); named exports for lib functions; `@/` import alias.
- **Error-handling convention:** JSON parse calls wrapped in try/catch; API route already wraps `runSync` — unchanged.
- **Deploy:** `git push origin main` auto-deploys; schema unchanged (no Prisma/Turso DDL this phase).
- **Keep CLAUDE.md current:** the "Exhaustive extraction & dedup" section describes the text-JSON contract ("Return ONLY a JSON array") — update it after this phase lands.
- **GSD workflow enforcement:** file changes go through `/gsd-execute-phase` (this research feeds `/gsd-plan-phase 20`).

## Sources

### Primary (HIGH confidence)
- `node_modules/@anthropic-ai/sdk@0.80.0` source — `helpers/zod.js`, `lib/parser.js`, `lib/transform-json-schema.js`, `lib/MessageStream.js`, `resources/messages/messages.js`, `index.d.ts` (throw semantics, parse timing, keyword whitelist, exports)
- Empirical schema-generation + parse-behavior runs against installed `zod@4.3.6` + SDK helper (schema output, enum demotion, minItems retention, optional handling, unknown-key stripping, truncation/violation throws)
- Project source: `lib/extract-cards.ts`, `lib/sentence-match.ts`, `lib/sentence-selection.ts`, `lib/filter-components.ts`, `lib/card-key.ts`, `lib/sync.ts`, `components/StudySession.tsx`, `scripts/local-resync.mts`, `tests/extract-cards.test.ts`, `vitest.config.ts`
- claude-api skill (curated, 2026-06 cache): structured outputs supported/unsupported JSON-schema subset, streaming compatibility, schema-compilation cache, `output_config.format` canonical form
- npm registry + `gsd-tools query package-legitimacy` (zod verdict OK)

### Secondary (MEDIUM confidence)
- `platform.claude.com/docs/en/build-with-claude/structured-outputs.md` (via skill citation — subset restrictions, citations incompatibility)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read from installed packages and npm registry
- SDK behavior (throw-on-truncation, parse timing, schema transform): HIGH — read from installed source and empirically executed
- Architecture/branching design: HIGH — grounded in verified SDK semantics + existing call sites
- Blank-safety design: HIGH — grounded in `lib/sentence-selection.ts`/`StudySession.tsx` actual behavior
- Optional-field server acceptance (A1): MEDIUM — SDK-design-implied, not live-verified this session

**Research date:** 2026-07-06
**Valid until:** ~2026-08-05 (stable while `@anthropic-ai/sdk` stays pinned at 0.80.0; re-verify transform/parse semantics on any SDK upgrade)
