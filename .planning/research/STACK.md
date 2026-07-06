# Stack Research

**Domain:** LLM structured-JSON extraction quality/reliability (Claude API, Next.js/TypeScript, single-tenant hobby app) — v1.5 Extraction Quality & Reliability
**Researched:** 2026-07-05
**Confidence:** HIGH (all API claims from the curated Claude API reference; all version/capability claims verified against the installed `node_modules` and the npm registry)

## Executive Answer

Only **one new dependency is needed: `zod`**. Everything else this milestone needs is already in the installed `@anthropic-ai/sdk@0.80.0` — including native structured outputs (`output_config.format` + `zodOutputFormat` + `parsed_output`), which is the single highest-leverage reliability change available. The current "ask for JSON in a text response, regex it out, salvage on truncation" pipeline in `lib/extract-cards.ts` predates structured outputs going GA; migrating to `output_config.format` eliminates the entire class of parse failures the regex/salvage code defends against (markdown fences, preamble, malformed JSON, wrong field types, invalid `type` enum values) while keeping the existing streaming + `.finalMessage()` shape unchanged.

Three things structured outputs does **not** fix, so the existing deterministic post-processing stays:
1. **Semantic validity** — `targetForm` being a verbatim substring of `korean`, blank-safety, hallucinated `components[]`. The `sentenceMatch()` filter, `filterComponents()` (v1.4), and `normalizeFront` dedup remain load-bearing and unchanged.
2. **Truncation at `max_tokens`** — a schema-constrained response cut off mid-stream is still incomplete JSON. The truncation-salvage parser stays as the fallback path (see Integration Plan §3).
3. **Content quality** — categorization accuracy, sentence naturalness, exhaustiveness. Those are prompt/audit work (the milestone's DB-audit-first plan), not stack work.

## Recommended Stack

### Core Technologies (already installed — no change required)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@anthropic-ai/sdk` | 0.80.0 installed (0.110.0 latest) | Claude API client | **Structured outputs already work on 0.80.0** — verified in `node_modules`: `output_config?: OutputConfig` is typed on both `MessageCreateParams` and `MessageStreamParams`, `messages.parse()` exists, `helpers/zod` ships `zodOutputFormat()`, and `Message` carries `parsed_output`. An upgrade to 0.110.x is optional hygiene, not a prerequisite. |
| `claude-opus-4-8` | current model | Extraction | Already in use with `thinking: { type: 'adaptive' }` — this is the correct current configuration. Structured outputs is supported on Opus 4.8 and is compatible with adaptive thinking and streaming. |

### New Dependency (the only one)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.4.3 (latest; SDK peer range is `^3.25.0 \|\| ^4.0.0`) | Define the card schema once; `zodOutputFormat(schema)` converts it to the API's JSON-schema wire format AND validates the response client-side (the SDK strips API-unsupported constraints like `.length()` from the wire schema and enforces them locally) | Extraction schema in `lib/extract-cards.ts`; optionally reuse to harden the `lib/gloss.ts` response guard later. Server-side `lib/` only — zero client-bundle impact. |

### Installation

```bash
npm install zod
# optional, not required for structured outputs:
npm install @anthropic-ai/sdk@latest
```

## Question-by-Question Findings

### (1) Native structured outputs vs. today's regex/salvage parsing — YES, migrate

**Mechanism (GA, no beta header):** `output_config: { format: zodOutputFormat(schema) }` on the existing `client.messages.stream(...)` call. The API constrains generation to the schema; when a parseable format is provided, the final message includes a typed `parsed_output` property (documented on the stream method in the installed 0.80.0 — streaming and structured outputs compose).

**Why it's strictly more reliable than the current approach:**
- The current pipeline's failure modes — `"No JSON array found in response"`, `"Failed to parse JSON response"`, silently dropped cards from `isValidExtractedCard` rejections (missing `front`/`back`, invalid `type` like `"noun"`) — are all *format* failures. Structured outputs makes them impossible by construction: the `type` enum, required fields, and array shapes are enforced during generation, not repaired after.
- The legacy JSON-forcing alternatives are dead ends: a top-level `output_format` param is deprecated in favor of `output_config.format`, and assistant-message prefill returns a **400 on Opus 4.8** — not an option.
- Forced tool-use (`tool_choice: {type: "tool"}` with a `strict: true` tool) works but is the wrong surface for a pure "return this shape" response — structured outputs is the canonical replacement and needs no tool-loop plumbing (see Alternatives).

**Schema design constraints to respect:**
- Root should be an object, not a bare array — wrap as `z.object({ cards: z.array(CardSchema) })` and read `parsed_output.cards`. Every object level gets `additionalProperties: false` automatically via `zodOutputFormat`.
- Unsupported JSON-schema features on the wire: recursion, numeric `minimum`/`maximum`, string `minLength`/`maxLength`, complex array constraints. The TS SDK handles this by stripping them from the wire schema and validating client-side — so `z.array(z.string()).length(3)` for `distractors` still works; it just validates locally.
- First request with a new schema pays a one-time compilation cost; the compiled schema is cached server-side for 24 h. With daily cron sync using an identical schema, effectively every real request after the first hits the schema cache.
- Incompatible with citations and prefilling — neither is used here. Compatible with streaming, adaptive thinking, and token counting — all three matter here.

**Interaction with the existing truncation-salvage logic (explicit):** structured outputs and salvage are complementary, not conflicting. If `stop_reason === 'max_tokens'`, the schema-constrained output is cut off and `parsed_output` will not be a complete valid result — the docs are explicit that truncated structured output may be incomplete. So the integration is: read `parsed_output` on the happy path; when it's null/absent (truncation, or a refusal), fall back to `parseExtractionResponse()` on the raw text exactly as today. The salvage code's job shrinks from "primary parser" to "truncation recovery only." Because the model generates schema-shaped JSON either way, the salvaged text is *more* regular than today's free-form output — but note one required adjustment: with the `{ cards: [...] }` wrapper object, top-level card objects sit at nesting depth 2 instead of depth 1, so `findLastTopLevelCardBoundary`'s `depth === 1` check needs a one-line update (or detect the wrapper and adjust dynamically). This is the only point where the new approach touches the salvage code.

**Also reduce truncation at the source:** the cheapest reliability win is raising `max_tokens` from 32 000 → 64 000. The call already streams (required above ~16K anyway), Opus 4.8 supports up to 128K output with streaming, and output tokens are billed only as generated — headroom costs nothing on lessons that don't need it. Truncation is the root cause the salvage logic patches; halving its frequency matters more than perfecting the patch.

### (2) SDK features for consistency of a repeated, similarly-shaped prompt

**Prompt caching — worth doing as prompt restructuring, with honest expectations:**
- Mechanics: `cache_control: { type: 'ephemeral' }` on the last stable block; writes cost 1.25× (5-min TTL), reads 0.1×. **Minimum cacheable prefix on Opus 4.8 is 4096 tokens — shorter prefixes silently don't cache** (no error; `cache_creation_input_tokens: 0`).
- The current prompt structure fights caching: the tiny one-sentence system prompt is followed by a user message that interleaves stable rules with per-request content (`emphasizedSection` and the ever-growing `existingList` deck-front list sit *before* the sentence rules). Restructure so all stable instruction text comes first (move the full rule block into `system` with a `cache_control` breakpoint), then volatile content (emphasized terms, deck-front list, lesson notes) after it.
- Honest value assessment for this app: the stable rule block is likely ~2K tokens — **below the 4096 minimum**, so it may silently never cache on Opus 4.8. And the two production cadences (single daily cron sync; user taps minutes apart during backlog drain) mostly exceed or brush the 5-min TTL. Where caching genuinely pays is `scripts/local-resync.mts` bulk runs (back-to-back calls, seconds apart). Recommendation: do the stable-first restructuring anyway (it's free, and it's what makes any future caching possible), add the breakpoint, and verify with `usage.cache_read_input_tokens` — if it stays 0, the prompt is under the minimum and nothing is lost. Do NOT pad the prompt to 4096 tokens just to cache.
- Caching improves cost/latency, not output consistency per se — but the discipline it forces (stable rules first, volatile data last) is itself a mild consistency win and standard prompt-engineering practice.

**Extended thinking budgets — nothing to add; the training prior is stale:**
- `thinking: { type: 'enabled', budget_tokens: N }` is **rejected with a 400 on Opus 4.8**. There is no thinking budget to tune. The current `thinking: { type: 'adaptive' }` is exactly right — keep it.
- The actual depth lever is `output_config: { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' }` (GA, default `high`, the same `OutputConfig` object that carries `format`). For exhaustive extraction, `high` (the implicit current setting) is the right default; `xhigh` is worth one A/B on a dense lesson **only if** the DB audit finds completeness gaps (Opus 4.8 guidance: sweep effort levels rather than reflexively maxing). Not a required change.
- Two adjacent gotchas confirmed non-issues in the current code: no `temperature`/`top_p`/`top_k` are set (they would 400 on Opus 4.8), and `thinking.display` defaulting to `omitted` is fine (nothing reads the thinking text).

### (3) Validation library — zod, and only zod

- **zod ^4.4.3** is the only addition. It is the SDK's own declared peer dependency for the structured-outputs helper (`peerDependencies: { zod: '^3.25.0 || ^4.0.0' }`), so it double-duties: (a) the wire schema for `zodOutputFormat`, and (b) a typed replacement/backstop for the hand-rolled `isValidExtractedCard` guard on the salvage path (`z.array(CardSchema).safeParse(...)` — or per-card `safeParse` to preserve the drop-bad-cards-keep-good-ones GRAPH-02 semantics).
- Keep `parseExtractionResponse` as a pure, unit-testable module (it already is) — zod slots in *inside* it, preserving the existing Vitest coverage pattern and the `react-hooks/purity`-safe server-only placement.
- Derive `ExtractedCard`/`ExtractedSentence` types via `z.infer` so the TS interface and the schema can never drift.
- The `lib/gloss.ts` Haiku gloss shape-check can adopt the same `safeParse` pattern for free later; not required this milestone.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `output_config.format` (structured outputs) | Forced tool-use (`tool_choice: { type: 'tool', name }` + `strict: true` on the tool) | Only if also adopting a multi-tool agentic flow. For a single "return this shape" response, structured outputs is the canonical, simpler surface; `strict: true` exists to validate *tool parameters*, not response format. |
| `zodOutputFormat` + `parsed_output` via `.stream().finalMessage()` | `client.messages.parse()` (non-streaming) | Never here — a 30–60 s Opus extraction must stream to avoid HTTP timeouts under the Vercel 60 s limit. Keep the existing stream shape. |
| zod ^4.4.3 | Valibot / ArkType / TypeBox | Only if client-bundle size mattered — it doesn't (server-only `lib/`), and none are supported inputs to the SDK's `zodOutputFormat`. |
| Keep salvage parser as fallback | Delete salvage after migration | Don't delete — `max_tokens` truncation still produces incomplete JSON under structured outputs; salvage remains the recovery path for dense lessons. |
| Stay on SDK 0.80.0 for this milestone | Bump to 0.110.0 first | Bump only as a separate hygiene commit if desired; every needed capability is verified present in 0.80.0, and mixing an SDK upgrade into the feature diff obscures regressions. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / LlamaIndex / instructor-style wrappers | Heavy abstraction over one API call the app already makes correctly; obscures the streaming + salvage control flow this codebase depends on | Direct `@anthropic-ai/sdk` (already in place) |
| Vector DB / embeddings / RAG layer | Dedup is already solved deterministically (`Card.normalizedFront @unique` + the prompt hint list); semantic similarity adds infra for a problem the DB constraint already closes | Existing `normalizeFront` + DB unique key |
| Queue system (BullMQ, Inngest, Trigger.dev) | Single-tenant, 1-lesson-per-request sync + daily cron already fits the Vercel Hobby 60 s limit by design; bulk runs go through `local-resync.mts` | Existing sync architecture |
| `ajv` / `jsonschema` validators | Redundant once zod is in — and the API itself now enforces the schema during generation | zod |
| `jsonrepair` / JSON5 / dirty-json parsers | Structured outputs eliminates malformed-JSON output; the only residual failure is truncation, which the existing depth-aware salvage scanner handles better than generic repair | Existing `findLastTopLevelCardBoundary` fallback |
| Eval/observability platforms (Braintrust, LangSmith, promptfoo) | The real signal for a 1-user app is the DB audit this milestone already plans, plus Vitest fixtures against the pure `parseExtractionResponse` | Vitest fixture tests with recorded model outputs |
| A second "verifier" LLM pass | Doubles cost/latency per lesson; the failure modes it would catch (bad components, unsafe sentences) are already caught by the deterministic filters | `filterComponents` + `sentenceMatch` + zod |

## Integration Plan (into `lib/extract-cards.ts`)

1. **Define `CardSchema` with zod** mirroring `ExtractedCard`/`ExtractedSentence` (`z.enum(['vocabulary','grammar','phrase'])` for `type`; arrays for `distractors`/`sentences`/`components`; `notes` optional), wrapped as `const ExtractionSchema = z.object({ cards: z.array(CardSchema) })`. Derive TS types via `z.infer`.
2. **Add `output_config: { format: zodOutputFormat(ExtractionSchema) }`** to the existing `anthropic.messages.stream({...})` call. Keep `thinking: { type: 'adaptive' }`, keep `.finalMessage()`. Delete the "Return ONLY a JSON array. No markdown fences..." paragraph and the per-field JSON-shape prose from the prompt (the schema now carries structure — keep the *semantic* rules: blank-safety, components discipline, romanization ban, exhaustiveness).
3. **Read `message.parsed_output` first**; when null/absent (truncation via `stop_reason === 'max_tokens'`, or refusal), fall back to `parseExtractionResponse(text, deckSet)` on the raw text as today — adjusting the boundary scanner's depth check for the `{ cards: [...] }` wrapper (top-level cards now close at depth 2). Log which path ran so the milestone audit can measure how often salvage still fires.
4. **Raise `max_tokens` 32000 → 64000** (already streaming; billed only as generated).
5. **Restructure the prompt stable-first**: rule block → `system` with `cache_control: { type: 'ephemeral' }`; emphasized terms, deck-front list, and lesson notes stay in the user turn after it. Check `usage.cache_read_input_tokens` once in the sync log; accept that the prefix may be under Opus 4.8's 4096-token cache minimum.
6. **Downstream is untouched:** `filterComponents`, the `sentenceMatch` sentence filter, `normalizeFront` dedup, and the sync route's upsert/edge logic all keep operating on the same `ExtractedCard[]` return type. `scripts/local-resync.mts` inherits everything automatically since it calls the same lib function.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@anthropic-ai/sdk@0.80.0` (installed) | Structured outputs (GA) | Verified in `node_modules`: `OutputConfig`/`output_config` on create *and* stream params, `messages.parse()`, `parsed_output`, `helpers/zod` → `zodOutputFormat` |
| `@anthropic-ai/sdk@0.80.0+` | `zod@^3.25.0 \|\| ^4.0.0` | Declared peer range; zod 4.4.3 (latest) satisfies it |
| `output_config.format` | `claude-opus-4-8`, streaming, adaptive thinking | Supported and compatible; incompatible only with citations + assistant prefill (both unused) |
| `output_config.format` | `stop_reason: 'max_tokens'` | Truncated output may be incomplete JSON — keep salvage fallback |
| Prompt caching | Opus 4.8 | 4096-token minimum cacheable prefix; below it, breakpoints silently no-op (`cache_creation_input_tokens: 0`) |
| `thinking: { budget_tokens }` | Opus 4.8 | **400 error** — do not reintroduce; adaptive only, depth via `output_config.effort` |

## Sources

- Curated Claude API reference (claude-api skill, cached 2026-06): structured outputs (`output_config.format`, `messages.parse`, schema limitations, 24 h schema cache, streaming/thinking compatibility, deprecated `output_format`, prefill 400), prompt caching (prefix rule, 4096-token Opus 4.8 minimum, 1.25×/0.1× pricing, 5-min TTL), Opus 4.8 thinking surface (`budget_tokens` → 400, adaptive-only, `effort` levels incl. `xhigh`), streaming `max_tokens` guidance (128K with streaming) — **HIGH** (curated, authoritative over training priors)
- Local verification, `node_modules/@anthropic-ai/sdk` @ 0.80.0: presence of `output_config` on `MessageCreateParams` + `MessageStreamParams`, `parsed_output`, `messages.parse()`, `zodOutputFormat` in `helpers/zod` — **HIGH** (direct source inspection, 2026-07-05)
- npm registry (`npm view`, 2026-07-05): `@anthropic-ai/sdk` latest = 0.110.0; `zod` latest = 4.4.3; SDK peer dep `zod: ^3.25.0 || ^4.0.0` — **HIGH**
- Local source, `lib/extract-cards.ts` + `package.json`: current call shape (`messages.stream` + `finalMessage`, `max_tokens: 32000`, adaptive thinking), salvage logic (`findLastTopLevelCardBoundary` depth-1 assumption), `isValidExtractedCard`, zod absent from deps — **HIGH**

---
*Stack research for: v1.5 Extraction Quality & Reliability (LLM structured-JSON extraction)*
*Researched: 2026-07-05*
