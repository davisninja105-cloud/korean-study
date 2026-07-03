# Phase 16: Components[] Filter Fix - Research

**Researched:** 2026-07-02
**Domain:** Pure-function data validation/filtering inside an existing Claude-extraction pipeline (Next.js/Prisma/Turso codebase)
**Confidence:** HIGH

## Summary

This phase has no external technology to research — it is a correctness fix inside code that already exists in this repository, fully readable and already exercising the exact patterns (`normalizeFront` deck-lookup, two-phase resolution, LLM-response structural validation) the phase is asked to reuse. The milestone's own prior research pass (`.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md` Pitfall 4, `.planning/research/ARCHITECTURE.md` Reconciliation #2) already corrected the original todo's mistaken premise (naive substring-containment filtering) and landed on the deck-lookup design that GRAPH-03/04 now formalize. This document's job is to pin down **exact current mechanics** (file:line, function signatures, data shapes) so the planner does not have to re-derive them.

**The core finding, precisely stated:** today, `Card.components` (the JSON string[] persisted on each row) is **never validated against the deck** — `lib/extract-cards.ts:204-240` only dedupes, trims, and drops the card's own headword. Separately, `CardDependency` edge creation in `app/api/sync/route.ts:217-247` *does* do a deck-lookup (`keyToId.get(normalizeFront(comp))`), but that lookup is scoped to a `keyToId` map built only from cards that themselves already have non-null `components` (`app/api/sync/route.ts:81-86`, `where: { components: { not: null } }`) — a narrower and different set than "all real cards in the deck." Two independent problems currently exist, and the phase must address both:
1. **`Card.components` itself is unfiltered** — any string Claude invents (`GRAPH-01`/`GRAPH-03` target this).
2. **The edge-linking `keyToId` map is scoped incorrectly** (`components: { not: null }` instead of "any card") — this is a pre-existing latent bug in the *edge* layer, not explicitly named in the requirements, but the planner should decide whether GRAPH-03's new filter module also needs to expose (or the sync route needs to use) a corrected "resolves to any real card" lookup, since the phase's stated goal ("resolves to an actual card in the deck") is broader than what the current `keyToId` scoping achieves.

**Primary recommendation:** Ship a new pure module `lib/filter-components.ts` exporting a `filterComponents(components: string[], deckNormalizedFronts: Set<string>): string[]` function that mirrors `lib/known-words.ts:countUnknownWords`'s two-phase resolution order (direct `normalizeFront` match, then `splitParticle` stem fallback) — called from `lib/extract-cards.ts`'s existing post-processing `.map()` (around line 204-240), fed the *complete* set of `Card.normalizedFront` values already loaded in `app/api/sync/route.ts` (`existingNormalizedFronts`, line 52-54) plus any cards created earlier in the same batch. Add response-shape validation (GRAPH-02) as a small guard function following `lib/gloss.ts`'s regex-extract → `JSON.parse` → shape-check → `try/catch` convention, applied to the `extractCardsFromNotes` response before the existing salvage/dedup logic runs. Build the dry-run (GRAPH-05) as a new read-only script modeled on `scripts/check-edges.mjs`, grouping by `Card.type` (`'vocabulary' | 'grammar' | 'phrase'`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | Extraction prompt explicitly instructs Claude to only list a component if it's a real prerequisite the card's content actually depends on (prompt tightening) | `lib/extract-cards.ts:110-117` — exact current prompt text for the `components` field is documented verbatim in Code Examples; see the `~(으)ㄴ 후에` real-corpus example showing why this requirement is necessary even alongside GRAPH-03 (deck-lookup alone cannot catch a real-but-unrelated card) |
| GRAPH-02 | Claude's extraction response is structurally validated immediately after receipt (type-checked, malformed/truncated output rejected) — matches the existing `lib/gloss.ts` convention | `lib/gloss.ts:107-144` (`lookupViaLLM`) documented as the exact convention to mirror; `lib/extract-cards.ts:160-201`'s existing array-level truncation-salvage logic documented in full (Pitfall 3) so the new per-card validation layers on top rather than regressing it |
| GRAPH-03 | A `components[]` entry is kept only if it resolves to a real card via `normalizeFront()` deck-lookup — not literal sentence-text containment | `lib/card-key.ts:25-40` (`normalizeFront`) and the two-phase resolution pattern (Pattern 1) fully documented with exact code; Pitfall 1 documents the exact scoping trap (`keyToId`'s `components: { not: null }` filter) to avoid when building the deck-lookup Set |
| GRAPH-04 | The filter is a pure, unit-tested `lib/` module reusing the two-phase resolution pattern already proven in `lib/known-words.ts` | `lib/known-words.ts:34-66` (`countUnknownWords`) documented in full as the exact pattern to mirror; `tests/known-words.test.ts` and `tests/card-key.test.ts` documented as the closest existing test-file models |
| GRAPH-05 | Filter is dry-run validated against the real corpus (no writes) with drop-rate reported separately for `grammar`- vs `vocabulary`-type components, before being wired into the write path | `scripts/check-edges.mjs` documented in full as the closest existing read-only diagnostic-script precedent; `Card.type` confirmed as `'vocabulary' | 'grammar' | 'phrase'` via `prisma/schema.prisma` (Standard Stack / Code Examples) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Claude response structural validation (GRAPH-02) | `lib/` (extraction pipeline) | — | Must happen immediately after `finalMessage()` parsing, before any DB write — same tier as `lib/gloss.ts`'s LLM-response guard |
| `components[]` deck-lookup filtering (GRAPH-03/04) | `lib/` (new pure module) | — | Pure function, no Prisma/Anthropic import — matches `lib/sentence-match.ts`, `lib/sequence.ts`, `lib/known-words.ts` convention; must be callable from both the Next.js server tier (`app/api/sync/route.ts`) and standalone Node scripts (`scripts/local-resync.mts`, dry-run script) |
| Prompt tightening (GRAPH-01) | `lib/extract-cards.ts` (prompt string) | — | Pure prompt-text change; no runtime logic |
| Dry-run corpus report (GRAPH-05) | Operational script (`scripts/`) | Database (Turso, read-only) | Follows `scripts/check-edges.mjs`'s pattern: `@libsql/client` direct connection, read-only, no Prisma client needed |
| Deck lookup data source | Database (Turso) → Prisma → `lib/` | — | The filter itself stays pure (no Prisma import); the caller (`app/api/sync/route.ts`, dry-run script) is responsible for loading `normalizedFront` values and passing them in as a `Set<string>` |

## Standard Stack

No new libraries. This phase is 100% additive/corrective code within the existing stack (TypeScript 5.9.3, Vitest 4.1.9, Prisma 7.6.0 + `@libsql/client` 0.17.2 for the dry-run script). `[VERIFIED: package.json]` — confirmed via direct read of `/Users/main/Documents/claude-test/package.json`; no `zod` or any schema-validation library is present, consistent with STATE.md's "Zero new npm dependencies expected" decision for this milestone.

### Core
No new packages required for the filter module or prompt change.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@libsql/client` | ^0.17.2 (already installed) | Direct Turso connection for the dry-run script | Only if the dry-run script follows the `check-edges.mjs`/`relink-dependencies.mjs` pattern (raw SQL, no Prisma client) — recommended for consistency with existing diagnostic scripts |
| `vitest` | ^4.1.9 (already installed) | Unit tests for the new pure filter module | `npm test` runs `vitest run` (`package.json:10`) — pure functions only, no DB/API, per `vitest.config.ts` (`environment: 'node'`, no other config) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled shape-check (matching `lib/gloss.ts` convention) | `zod` schema validation | Zod is not installed; adding it would be the first schema-validation dependency in the codebase and contradicts the milestone's "zero new npm dependencies" decision (STATE.md Decisions) for a validation need that `lib/gloss.ts` already solves without a library |
| Deck-lookup filtering (`normalizeFront` + `splitParticle` fallback) | Fuzzy string matching (edit distance) against sentence text | Explicitly rejected by prior research (PITFALLS.md Pitfall 4, ARCHITECTURE.md Reconciliation #2) — Korean agglutinative morphology + abstract grammar-pattern notation (`~(으)면`) make substring/fuzzy matching against sentence text structurally wrong; would gut exactly the edges the milestone exists to fix |

**Installation:** None required.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages. `Disposition: N/A`.

## Architecture Patterns

### System Architecture Diagram

```
Google Doc (수업 노트 tab)
        │
        ▼
lib/google-docs.ts  ── fetchGoogleDoc() ──▶ { text, emphasized }[]
        │
        ▼
app/api/sync/route.ts  (POST /api/sync)
   1. Hash lesson text, skip already-synced lessons
   2. Load existingNormalizedFronts = ALL Card.normalizedFront   ◀── (line 52-54)
        │
        ▼
lib/extract-cards.ts  ── extractCardsFromNotes(notes, existingNormalizedFronts, emphasized)
   │
   ├─▶ Anthropic Claude (opus-4-8, adaptive thinking, streamed) — returns raw JSON text
   │
   ├─▶ [NEW — GRAPH-02] Structural validation guard
   │        (mirrors lib/gloss.ts: regex-extract JSON → JSON.parse → shape-check →
   │         reject/salvage malformed or truncated output BEFORE using it)
   │
   ├─▶ Existing tolerant-parse / salvage logic (lines 165-201, UNCHANGED)
   │
   ├─▶ Existing per-card normalize (lines 204-240):
   │        - dedupe components, drop self-reference   (KEEP)
   │        - [NEW — GRAPH-01 via prompt; GRAPH-03/04 via code]
   │          filterComponents(rawComponents, deckNormalizedFronts)
   │             lib/filter-components.ts (NEW, pure module)
   │             mirrors lib/known-words.ts two-phase resolution:
   │               1. normalizeFront(comp) → Set.has() direct match
   │               2. splitParticle(comp).stem → normalizeFront → Set.has() fallback
   │               no match on either → drop the component
   │
   ▼
ExtractedCard[] (components now deck-validated) returned to sync route
        │
        ▼
app/api/sync/route.ts — per-card upsert (lines 131-215, UNCHANGED logic, now receiving
   pre-filtered components) → Card.components column stores ONLY resolvable entries
        │
        ▼
Two-phase dependency linking (lines 217-247) — keyToId lookup + CardDependency upsert
   (existing skip-if-unresolved `continue` logic now rarely triggers, since components[]
    arriving here already passed the deck-lookup filter)
```

### Recommended Project Structure
```
lib/
├── filter-components.ts     # NEW — pure module, GRAPH-03/GRAPH-04
├── extract-cards.ts         # MODIFIED — prompt text (GRAPH-01) + call filterComponents() + validation guard (GRAPH-02)
├── card-key.ts              # UNCHANGED — normalizeFront(), reused by the new filter
├── known-words.ts           # UNCHANGED — the two-phase pattern being mirrored (do not modify)
├── sentence-match.ts        # UNCHANGED — splitParticle(), reused by the new filter
tests/
├── filter-components.test.ts  # NEW — model on tests/known-words.test.ts / tests/card-key.test.ts
scripts/
├── dry-run-filter.mjs       # NEW (name TBD by planner) — GRAPH-05, models on scripts/check-edges.mjs
app/api/sync/route.ts        # MODIFIED — pass full deck normalizedFront set into extraction call chain (see Pitfall 1 below)
```

### Pattern 1: Two-phase resolution (the pattern to mirror)
**What:** Direct `normalizeFront()` match first; if that fails, strip a trailing particle via `splitParticle()` and retry the normalized stem.
**When to use:** Any place that needs to decide "does this raw string correspond to something already known/real in the deck?" — proven correct for `lib/known-words.ts`'s unknown-word counting; the same shape applies to `components[]` resolution.
**Example (existing code, `lib/known-words.ts:44-63`):**
```typescript
for (const token of tokens) {
  if (token === targetForm) continue
  const normalized = normalizeFront(token)
  if (knownLemmas.has(normalized)) continue
  const { stem } = splitParticle(token)
  if (stem && stem !== token) {
    const normalizedStem = normalizeFront(stem)
    if (knownLemmas.has(normalizedStem)) continue
  }
  unknownCount++
}
```
**Adaptation for the new filter** (illustrative — planner/executor owns final shape):
```typescript
// lib/filter-components.ts
import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'

export function filterComponents(
  rawComponents: string[],
  deckNormalizedFronts: Set<string>
): string[] {
  return rawComponents.filter((comp) => {
    const normalized = normalizeFront(comp)
    if (deckNormalizedFronts.has(normalized)) return true
    const { stem } = splitParticle(comp)
    if (stem && stem !== comp) {
      if (deckNormalizedFronts.has(normalizeFront(stem))) return true
    }
    return false
  })
}
```
Note: `lib/extract-cards.ts:204-240` already computes a per-card `components` array via `.filter()`/`.map()`/self-dedup — the new `filterComponents()` call should compose with (not replace) that existing dedup/self-exclusion logic. Order matters: dedupe/self-exclude first (cheap, no Set lookups), then deck-filter (needs the `Set<string>` argument threaded in).

### Pattern 2: LLM response structural validation (the pattern to mirror, GRAPH-02)
**What:** Regex-extract the JSON block from the raw text response, `JSON.parse` it inside a `try/catch`, and validate the parsed shape before use.
**When to use:** Any place a Claude/LLM text response is consumed as structured data.
**Example (existing code, `lib/gloss.ts:107-144`, `lookupViaLLM`):**
```typescript
const content = message.content[0]
if (content.type !== 'text') throw new Error('Unexpected response from Claude')
const text = content.text.trim()
const jsonMatch = text.match(/\{[\s\S]*\}/)
if (!jsonMatch) throw new Error('No JSON object found in gloss response')
return JSON.parse(jsonMatch[0]) as { dictionaryForm: string; gloss: string; partOfSpeech: string }
```
**Important nuance:** `lib/extract-cards.ts` ALREADY has a more elaborate version of this same pattern (lines 160-201) — it does regex-extract (`text.match(/\[[\s\S]*\]/)`), `JSON.parse` in `try/catch`, and a **salvage** step for truncated arrays (trims back to the last complete `},` and re-closes the array). GRAPH-02 is NOT asking to build this from scratch — it already exists for the *array-level* parse. What's missing is **per-card shape validation**: today, `parsed.map((c) => ...)` (line 204) defensively coalesces missing fields with `??` fallbacks (`c.front ?? ''`, `c.back ?? ''`) rather than rejecting a malformed card outright. GRAPH-02's "matches the `lib/gloss.ts` convention" language likely means: add an explicit type-shape check (e.g., a `isValidExtractedCard(c): boolean` guard) so a structurally broken card object (missing required fields, wrong types) is **dropped/rejected**, not silently coerced into an empty-string card that gets persisted as broken data. This is a smaller, additive change layered on top of the existing salvage logic — not a replacement for it.

### Anti-Patterns to Avoid
- **Literal substring containment against sentence/notes text:** Explicitly rejected by prior research (Pitfall 4 below) — grammar-pattern notation (`~(으)면`) never appears verbatim in conjugated sentences (`가면`, `먹으면`), so this would drop nearly all grammar components, the opposite of the milestone's intent.
- **Trusting Claude's `components[]` strings without deck validation:** The current state — `lib/extract-cards.ts:208-215` only dedupes/self-excludes, no deck check at all.
- **Scoping the deck-lookup Set to only "cards that already have components":** This is what `app/api/sync/route.ts:81-86`'s `keyToId` map does today (`where: { components: { not: null } }`) — it excludes leaf-node cards (real cards with no prerequisites of their own) from being resolvable as *someone else's* prerequisite. The new filter's deck-lookup Set must be built from **all** `Card.normalizedFront` values, not this narrower subset. See Pitfall 1.
- **Adding a second Claude call to self-verify extraction output:** Explicitly out of scope per `.planning/REQUIREMENTS.md` Out of Scope table — would add real latency to an already timeout-constrained sync path.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Does this string resolve to a real deck item?" | A new fuzzy-matching or edit-distance resolver | `normalizeFront()` (`lib/card-key.ts`) + `splitParticle()` (`lib/sentence-match.ts`) two-phase lookup | Already proven correct for the identical problem shape in `lib/known-words.ts`; edit-distance is wrong for Korean agglutinative morphology (confirmed by prior research) |
| "Is this Claude response well-formed?" | A new JSON schema library / custom recursive validator | Hand-rolled type-shape guard (regex-extract → `JSON.parse` → field-by-field check), matching `lib/gloss.ts` | No schema library is installed; the codebase convention for LLM response validation is explicit inline checks, not a dependency |
| "How many components did the filter drop, by type?" | A new analytics/reporting module | A one-off read-only script (`scripts/dry-run-filter.mjs`), modeled on `scripts/check-edges.mjs` | Matches the existing "diagnostic script" convention (`check-edges.mjs`, `relink-dependencies.mjs`) — direct `@libsql/client` connection, no Prisma, safe to re-run |

**Key insight:** Every piece of this phase has a direct precedent already in the codebase. The risk is not "what pattern to use" (settled by prior research) but "getting the exact deck-lookup scope right" (see Pitfall 1) and "wiring the filter into the correct call sites" (see Pitfall 2 — three call sites, not one).

## Common Pitfalls

### Pitfall 1: `keyToId`'s existing scope (`components: { not: null }`) is narrower than "the deck"
**What goes wrong:** If the new filter's `deckNormalizedFronts` Set is built the same way `app/api/sync/route.ts:81-86` currently builds `keyToId` (only cards WHERE `components IS NOT NULL`), then a real leaf-node card (e.g., a simple vocab card with no prerequisites of its own — very common) will never be resolvable as a prerequisite for another card, even after the fix. This is a **false negative** — a real, valid component gets dropped because of how the lookup Set was scoped, not because Claude hallucinated it.
**Why it happens:** The existing `keyToId` map (`app/api/sync/route.ts:81-86`) was scoped that way as an optimization/simplification for the *edge-creation* step, with an explicit comment acknowledging the tradeoff (`// Kept scoped to components: { not: null } to preserve existing edge semantics (only cards that have components are resolvable as prerequisites)`) — this was never meant to define "what counts as a real card," but the new filter must not accidentally inherit this scoping if it wants "resolves to an actual card in the deck" (the phase's literal goal wording) to mean *any* card, not just cards-with-their-own-components.
**How to avoid:** Build the new filter's `deckNormalizedFronts: Set<string>` from **all** cards (`prisma.card.findMany({ select: { normalizedFront: true } })`, no `where` clause) — this is exactly what `existingNormalizedFronts` already is in `app/api/sync/route.ts:52-54` (loaded before extraction, passed into `extractCardsFromNotes` as its 2nd argument, currently used only as a "don't re-create this card" dedup hint to the prompt). The planner should decide whether to (a) pass this same list into the new filter call inside `lib/extract-cards.ts` (reusing the parameter already being threaded through), and (b) separately/also fix the `keyToId` scoping in `app/api/sync/route.ts` for the *edge*-creation step to include newly-created same-batch leaf cards too (this second part is not explicitly named as a GRAPH-0x requirement — flag as an open question for the planner/user, since it's a pre-existing bug in the edge layer, not the `components[]` layer this phase is scoped to).
**Warning signs:** Dry-run report (GRAPH-05) shows a high drop rate for common, obviously-real vocabulary lemmas that the researcher/planner can visually confirm exist as cards in the deck.

### Pitfall 2: Three call sites duplicate the sync/link logic — the filter must be usable from all of them
**What goes wrong:** `app/api/sync/route.ts` (live sync), `scripts/local-resync.mts` (bulk local resync), and `scripts/relink-dependencies.mjs` (retroactive edge rebuild) each contain their own near-identical copy of the "resolve component string → card ID via keyToId" loop (`app/api/sync/route.ts:223-247`, `scripts/local-resync.mts:174-201` and `205-231`, `scripts/relink-dependencies.mjs:74-102`). If the new filter is only wired into `lib/extract-cards.ts` (called at extraction time), `scripts/relink-dependencies.mjs` — which operates on **already-persisted** `Card.components` JSON, not fresh extraction output — will NOT benefit from the fix for any card synced before this phase ships, and will keep creating edges from old unfiltered data.
**Why it happens:** `relink-dependencies.mjs` is a standalone `.mjs` script using raw `@libsql/client` SQL (no Prisma, no TypeScript, no import of `lib/extract-cards.ts`) — it re-derives its own copy of `normalizeFront()` inline (lines 55-68) rather than importing `lib/card-key.ts`, because `.mjs` (plain JS) scripts in this codebase don't share TS `lib/` imports the way `.mts` scripts do (only `.mts` scripts like `local-resync.mts` can `await import('../lib/...')`).
**How to avoid:** Scope this phase's success criteria correctly: GRAPH-01/02/03/04 fix the **extraction pipeline** (new cards going forward). Retroactively cleaning already-persisted `Card.components`/`CardDependency` rows for the existing corpus is a **separate, explicit decision** — the planner should either (a) explicitly scope it out (only new syncs benefit, matching the phase's literal wording "a newly-extracted card's components[]…"), or (b) add a corpus-cleanup task using the dry-run script's findings to also re-filter existing `Card.components` rows. Success Criterion 1 in ROADMAP.md says "After a sync, a newly-extracted card's components[] contains only..." — this reads as forward-looking only, which resolves this ambiguity: **retroactive cleanup is likely out of scope**, but the planner should confirm this explicitly rather than assume.
**Warning signs:** UAT/verification checks the wrong thing (e.g., expects historical `CardDependency` edges to have already been cleaned up) when the phase only touches the extraction pipeline.

### Pitfall 3: Structural validation (GRAPH-02) must not break the existing truncation-salvage logic
**What goes wrong:** `lib/extract-cards.ts:165-201` already has deliberate, tested-by-production-use logic to salvage a *truncated* Claude response (common with `max_tokens: 32000` and exhaustive extraction — a dense lesson can hit the token cap mid-array). If GRAPH-02's "reject malformed/truncated output" is implemented as a blanket "if parse fails at all, throw" without preserving the salvage path, this **regresses** existing working behavior (currently: a truncated response still yields the cards that DID complete, rather than losing the whole lesson).
**Why it happens:** "Reject malformed/truncated output" (ROADMAP.md Success Criterion 2) could be read two ways: (a) reject the whole response outright when truncated, or (b) reject only the fields/cards that are individually malformed while keeping the salvage-then-validate-each-card flow. Given the existing salvage logic's clear intent (comment at line 165-167: "so a dense lesson still yields the cards that did complete rather than losing them all"), reading (b) is almost certainly correct — GRAPH-02 should layer **per-card shape validation** on top of the existing array-level salvage, not replace the salvage.
**How to avoid:** Keep the existing `jsonMatch`/salvage logic (lines 165-201) completely intact. Add validation as a new step applied to each *parsed* card object at the point where `parsed.map((c) => ...)` currently runs (line 204) — reject/drop individual cards whose required fields (`front`, `back`, `type`) are missing or wrong-typed, rather than throwing and losing the whole batch. This matches `lib/gloss.ts`'s `lookupViaLLM` pattern only loosely (that function operates on a single object, not an array) — the closer precedent is the array-level salvage already in this exact file.
**Warning signs:** A previously-working dense-lesson sync starts silently returning 0 cards instead of the partial set it used to return.

### Pitfall 4 (inherited from prior research — restated for completeness): Naive substring-containment filtering
**What goes wrong:** Filtering `components[]` by checking whether the raw string appears (via `.includes()` or similar) inside the card's own `sentences[].korean` / `notes` text drops nearly all grammar-pattern components and most conjugated-vocabulary components.
**Why it happens:** `components[]` entries are abstract base-form lemmas/pattern notation (`먹다`, `~(으)면`) per the extraction prompt's own instructions (`lib/extract-cards.ts:110-117`), while `sentences[].korean` is fully conjugated natural Korean (`가면`, not `~(으)면`) and `notes` is free-text explanation. Neither contains the component's literal notation.
**How to avoid:** Already resolved by design — GRAPH-03 explicitly specifies deck-lookup via `normalizeFront()`, not sentence-text containment. This pitfall is restated here only so the planner does not need to re-derive the reasoning (fully documented in `.planning/research/PITFALLS.md` Pitfall 4 and `.planning/research/ARCHITECTURE.md` Reconciliation #2, both already read in full during this research pass and summarized faithfully above).
**Warning signs:** Dry-run report (GRAPH-05) shows drop rate for `grammar`-type components dramatically higher than for `vocabulary`-type — ROADMAP.md Success Criterion 4 explicitly calls this out as the signal to check for.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. No schema changes, no renamed identifiers, no stored-data key changes. `Card.components` column already exists (added by `scripts/apply-graph-ddl.mjs`, already applied) and its JSON shape (`string[]`) does not change — only which strings are allowed to enter it changes.

## Common Pitfalls (concrete example from the actual corpus)

For planner grounding, the exact real-world case that motivated this phase (`.planning/todos/pending/2026-07-02-fix-spurious-components-in-card-extraction.md`, now folded into GRAPH-01..05):

- Card front: `몸에 알이 배겼을 것 같아요` (type: `phrase`, back: "I think my muscles are probably sore")
- This sentence's grammar is `~ㄹ 것 같다` ("I think/seems like"), **not** `~(으)ㄴ 후에` ("after doing")
- Yet Claude's extraction listed `components: ["몸", "알이 배기다", "~(으)ㄴ 후에"]`
- `~(으)ㄴ 후에` happens to exist as its own real grammar card elsewhere in the deck (taught in a different lesson) → at sync time, `keyToId.get(normalizeFront('~(으)ㄴ 후에'))` resolved successfully → a `CardDependency` edge was created linking this phrase card to an unrelated grammar pattern
- **This is the failure mode a pure deck-lookup filter (GRAPH-03) CANNOT fully catch on its own** — `~(으)ㄴ 후에` IS a real card, so it passes deck-lookup. The relationship is real-card-but-wrong-relationship, not hallucinated-nonexistent-string. This is exactly why GRAPH-01 (prompt tightening, "only list a component if it's a real prerequisite the card's content actually depends on") is a separate, necessary requirement alongside GRAPH-03 — the deck-lookup filter's job is narrower: it catches components that don't correspond to ANY real card (complete fabrications), while the prompt fix reduces the rate of Claude picking a real-but-unrelated card as a fake prerequisite in the first place. **The planner should not expect GRAPH-03/04 alone to fully eliminate this exact example** — GRAPH-01's prompt change is load-bearing for this specific failure class, and the dry-run (GRAPH-05) will only surface entries that fail deck resolution, not entries that pass deck resolution but are still semantically wrong. This is an inherent limitation to document in the plan's verification approach, not a gap in the filter's implementation.

## Code Examples

### `lib/card-key.ts:25-40` — `normalizeFront()`, the exact function the filter calls
```typescript
export function normalizeFront(front: string): string {
  let s = front.normalize('NFC').trim().replace(/\s+/g, ' ')
  const match = s.match(/\s*\(([^)]*)\)\s*$/)
  if (match) {
    const inner = match[1]
    const hasHangul = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(inner)
    const hasAscii = /[A-Za-z0-9]/.test(inner)
    if (!hasHangul && hasAscii) {
      s = s.slice(0, s.length - match[0].length).trim()
    }
  }
  return s
}
```

### `lib/sentence-match.ts:74-89` — `splitParticle()`, the exact stem-fallback function
```typescript
export function splitParticle(targetForm: string): { stem: string; particle: string } {
  for (const p of PARTICLES_MULTI) {
    if (targetForm.length > p.length && targetForm.endsWith(p)) {
      return { stem: targetForm.slice(0, -p.length), particle: p }
    }
  }
  if (targetForm.length >= 3) {
    for (const p of PARTICLES_SINGLE) {
      if (targetForm.endsWith(p)) {
        return { stem: targetForm.slice(0, -1), particle: p }
      }
    }
  }
  return { stem: targetForm, particle: '' }
}
```
Note: `PARTICLES_SINGLE` intentionally excludes 도/만/나 (collide with verb endings). This same conservatism applies whether the caller is `known-words.ts` or the new filter — no changes needed to this function, only reuse.

### `lib/extract-cards.ts:204-240` — exact current per-card normalization (where the new filter call is inserted)
```typescript
return parsed.map((c) => {
  const front = c.front ?? ''
  const myKey = normalizeFront(front)

  // Clean components: array of non-empty strings, deduped, self-excluded.
  const rawComponents = Array.isArray(c.components) ? c.components : []
  const components = [...new Set(
    rawComponents
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
      .filter((x) => normalizeFront(x) !== myKey)
  )]
  // ^ INSERTION POINT: filterComponents(components, deckNormalizedFronts) goes here,
  //   after self-dedup, before being assigned into the returned object below.

  return {
    type: (c.type ?? 'vocabulary') as ExtractedCard['type'],
    front,
    back: c.back ?? '',
    notes: c.notes,
    distractors: Array.isArray(c.distractors) ? c.distractors.slice(0, 3) : [],
    sentences: /* ... unchanged ... */,
    components,
  }
})
```
**Signature change implication:** `extractCardsFromNotes(notes, existingNormalizedFronts, emphasized)` (line 30-34) already receives `existingNormalizedFronts: string[]` as its 2nd parameter — currently used only to build the prompt's "don't recreate these" text list (line 35-38). The planner's implementation will need this same list turned into a `Set<string>` and threaded down into the `.map()` closure at line 204, OR passed as a new parameter to a separate `filterComponents` call after `extractCardsFromNotes` returns (inside `app/api/sync/route.ts`, before the upsert loop). **Both are valid architectures — the planner should pick one and document why**, since it affects whether `lib/filter-components.ts` needs zero or one additional integration point.

### `app/api/sync/route.ts:81-86` — the `keyToId` scoping to fix or account for (Pitfall 1)
```typescript
const keyToId = new Map<string, string>()
const seedCards = await prisma.card.findMany({
  select: { id: true, normalizedFront: true },
  where: { components: { not: null } },   // ← narrower than "all cards" — see Pitfall 1
})
for (const c of seedCards) keyToId.set(c.normalizedFront, c.id)
```
Compare to `existingNormalizedFronts` (line 52-54), which already queries **all** cards with no `where` clause:
```typescript
const existingNormalizedFronts = (
  await prisma.card.findMany({ select: { normalizedFront: true } })
).map((c) => c.normalizedFront)
```
This second query is the correct shape for the new filter's deck-lookup Set.

### `tests/known-words.test.ts` — the closest existing test file to model the new filter's tests on
Full file already read; structure is `describe/it` blocks, Vitest, each test includes a Korean-language comment explaining the exact tokens/expected resolution path. `tests/card-key.test.ts` is the second-closest model (tests `normalizeFront()` directly, including idempotency and edge cases like empty string). The new `tests/filter-components.test.ts` should follow this exact structure: one `describe('filterComponents', ...)` block, `it()` cases covering (a) direct match retained, (b) stem-fallback match retained, (c) no-match dropped, (d) empty input, (e) a case mirroring the real `~(으)ㄴ 후에`-style scenario (component IS in the deck via direct match, so it's retained by this filter — documenting that this filter alone does not solve the "real-but-unrelated" class, per the Pitfall 4/example section above).

## State of the Art

Not applicable in the traditional sense (no external ecosystem changes) — the two-phase resolution pattern and LLM-response-validation convention are already the codebase's current, deliberate state of the art (established in earlier v1.2/v1.3 phases per `lib/known-words.ts`'s and `lib/gloss.ts`'s doc comments). This phase extends an existing pattern to a new use site rather than introducing a new one.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The new filter should be threaded through `lib/extract-cards.ts` (called inside its post-processing `.map()`) rather than as a separate post-`extractCardsFromNotes()` step in `app/api/sync/route.ts` | Architecture Patterns / Code Examples | If the planner instead calls the filter from the sync route, `scripts/local-resync.mts` (which also calls `extractCardsFromNotes` directly) would need its own separate call to the filter too — either integration point works, but only one avoids duplicating the call across `app/api/sync/route.ts` AND `scripts/local-resync.mts`. Calling it INSIDE `extractCardsFromNotes` means both call sites get it "for free." This is a design recommendation, not a verified requirement — flagged `[ASSUMED]`. |
| A2 | Retroactive cleanup of already-persisted `Card.components`/`CardDependency` rows is OUT of this phase's scope (only new syncs benefit going forward) | Pitfall 2 | If the user actually wants historical data cleaned up too, the plan needs an additional corpus-cleanup task (re-running filtered extraction data against existing rows, or a new one-off script) — this should be confirmed explicitly at plan/discuss time since ROADMAP.md's wording is ambiguous ("a newly-extracted card's components[]…" reads forward-only but isn't 100% explicit) |
| A3 | GRAPH-02's "structurally validated" requirement means per-card field-shape validation layered on top of the EXISTING array-level truncation-salvage logic, not a replacement of it | Pitfall 3 | If implemented as a blanket "reject the whole response on any malformation," this regresses the existing salvage behavior that currently rescues partial results from a dense/truncated lesson — a real behavior change the user may not want |
| A4 | The `keyToId` scoping bug in `app/api/sync/route.ts` (Pitfall 1 — excludes leaf-node cards from being resolvable as prerequisites) is in scope for this phase to fix, since the phase's stated goal is "resolves to an actual card in the deck" (not "resolves to a card that itself has components") | Pitfall 1 | If out of scope, the new `components[]` filter (GRAPH-03) will be internally consistent (using the correct "any card" Set) but the DOWNSTREAM `CardDependency` edge-creation step will still under-link real leaf-node prerequisites — a partial fix that leaves a related bug unaddressed. Flagged for explicit planner/user decision. |

**If this table is empty:** N/A — see entries above.

## Open Questions

1. **Does the `keyToId` scoping fix (Pitfall 1 / Assumption A4) belong in this phase?**
   - What we know: The phase's literal wording is "resolves to an actual card in the deck," which is broader than the current `keyToId`'s `where: { components: { not: null } }` scoping.
   - What's unclear: None of GRAPH-01..05 explicitly names the `keyToId` map or the edge-creation step as something to change — they're all worded around `components[]` and the extraction pipeline.
   - Recommendation: The planner should decide and document explicitly (not silently fix or silently skip). If skipped, note it as a known follow-up gap (similar to how STATE.md already tracks other deferred items).

2. **Where exactly does the deck-lookup Set get threaded — extraction pipeline or sync route?**
   - What we know: `existingNormalizedFronts` (all cards, no `where` filter) already exists and is already passed into `extractCardsFromNotes()` as an argument (currently used only for the prompt's dedup-hint text).
   - What's unclear: Whether the new filter call should live inside `extractCardsFromNotes` (reusing that same parameter) or as a separate function called from `app/api/sync/route.ts` after extraction returns.
   - Recommendation: Prefer inside `extractCardsFromNotes` (Assumption A1) so `scripts/local-resync.mts` — which calls `extractCardsFromNotes` directly and independently reimplements the sync route's upsert/link logic — automatically benefits without a second integration point. Confirm at plan time.

3. **Does the dry-run script (GRAPH-05) need to be kept as a permanent operational script, or is it a throwaway verification step?**
   - What we know: `scripts/check-edges.mjs` and `scripts/relink-dependencies.mjs` are permanent, documented, re-runnable diagnostic scripts (listed in both `CLAUDE.md` "Scripts" section... actually `check-edges.mjs` is NOT listed in `CLAUDE.md`'s Scripts section despite existing in the repo — a minor doc-drift the planner may want to note, unrelated to this phase's scope).
   - What's unclear: Whether GRAPH-05's dry-run should be added to `CLAUDE.md`'s Scripts table as a new permanent tool, or is purely a one-time verification step for this phase's plan-execution loop.
   - Recommendation: Given the existing precedent (`check-edges.mjs` already exists as a permanent read-only diagnostic and would need to be re-run any time the extraction prompt changes again in the future), recommend making it permanent and documenting it in `CLAUDE.md`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Turso DB connection (`DATABASE_URL`/`DATABASE_AUTH_TOKEN`) | Dry-run script (GRAPH-05), needs the real corpus | Assumed ✓ (existing `.env`/`.env.local`, used by every other script in `scripts/`) | — | None needed — same env vars every other script in this repo already uses |
| `ANTHROPIC_API_KEY` | Only if the dry-run wants to test against FRESH extraction (not needed — dry-run should run against ALREADY-persisted `Card.components` data, matching `check-edges.mjs`'s read-only pattern) | N/A | — | Dry-run reads existing DB rows; no live Claude call needed for GRAPH-05 |
| Vitest 4.1.9 | Unit tests for `lib/filter-components.ts` | ✓ (already installed, `package.json` devDependencies) | 4.1.9 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this phase requires nothing beyond what's already installed and configured.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` (`environment: 'node'`, no other options set) |
| Quick run command | `npm test` (runs `vitest run` — all tests, non-watch) |
| Full suite command | `npm test` (same — this codebase has one flat `tests/` directory, no split unit/integration suites) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | Prompt instructs Claude to only list real prerequisites | manual/prompt-only — not unit-testable (no deterministic assertion on LLM prompt-following behavior); verified qualitatively via the GRAPH-05 dry-run's post-prompt-change drop-rate comparison | N/A (prompt text change; verify via GRAPH-05's corpus dry-run before/after) | N/A |
| GRAPH-02 | Malformed/truncated Claude response rejected on receipt | unit | `npm test -- tests/extract-cards.test.ts` (or wherever the new validation guard's tests land — no existing `tests/extract-cards.test.ts` file today; NEW file needed, since `lib/extract-cards.ts` currently has zero direct unit test coverage — it calls the live Anthropic API, so tests must mock/stub the Claude response and test only the parsing/validation logic in isolation) | ❌ Wave 0 — new file |
| GRAPH-03 | `components[]` entry kept only if it resolves via deck-lookup | unit | `npm test -- tests/filter-components.test.ts` | ❌ Wave 0 — new file |
| GRAPH-04 | Filter is pure, unit-tested, mirrors `lib/known-words.ts` two-phase pattern | unit | Same as GRAPH-03 — the "pure module" requirement is verified structurally (no Prisma/Anthropic import in `lib/filter-components.ts`) plus by the same test file | ❌ Wave 0 — new file |
| GRAPH-05 | Dry run reports drop rate by card type before write-path wiring | manual / scripted (not a Vitest unit test — this is a one-off operational script run against the real Turso corpus, output is a console report, not an assertion) | `node scripts/dry-run-filter.mjs` (or planner's chosen name) — read-only, no automated pass/fail; success is a human-reviewed drop-rate report per ROADMAP.md Success Criterion 4 | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npm test` (fast — pure functions only, no DB/API per `CLAUDE.md`'s existing test philosophy)
- **Per wave merge:** `npm test` (same command — no separate "full suite" distinction in this codebase)
- **Phase gate:** `npm test` green + `npm run lint` clean + GRAPH-05 dry-run executed and reviewed (human-in-the-loop, not automatable) before the filter is wired into the write path (per ROADMAP.md Success Criterion 4's explicit ordering: dry-run BEFORE write-path wiring)

### Wave 0 Gaps
- [ ] `tests/filter-components.test.ts` — covers GRAPH-03/GRAPH-04, model on `tests/known-words.test.ts` structure
- [ ] `tests/extract-cards.test.ts` — covers GRAPH-02's new validation-guard logic in isolation (mock/stub the Claude response text, do not call the live API — no existing test file for `lib/extract-cards.ts` today, this is 100% new coverage)
- [ ] `scripts/dry-run-filter.mjs` (or planner's chosen filename) — covers GRAPH-05, model on `scripts/check-edges.mjs` (raw `@libsql/client`, read-only, `parseEnv()` helper duplicated per-script convention already established)
- [ ] Framework install: none needed — Vitest already configured and working (`tests/*.test.ts` pattern, 8 existing test files)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | This phase touches no auth surface — sync route auth is unchanged (still gated by the existing `middleware.ts` cookie check, out of scope for this phase) |
| V3 Session Management | No | Unchanged |
| V4 Access Control | No | Unchanged |
| V5 Input Validation | **Yes** | The Claude API response IS untrusted input to this pipeline (an external LLM's text output, not user-supplied, but not fully trusted either — it can be malformed, truncated, or contain unexpected content). GRAPH-02's structural validation IS the V5 control here — hand-rolled shape-check (matching `lib/gloss.ts`'s existing convention), not a new library. No SQL/HTML injection surface: extracted strings are written via Prisma parameterized queries (existing `prisma.card.create`/`update` calls, unchanged by this phase) — never raw SQL string interpolation. |
| V6 Cryptography | No | Not applicable — no crypto/secrets touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Malformed/truncated LLM response silently persisted as broken card data | Tampering (data integrity, not adversarial) | GRAPH-02's structural validation guard — reject/drop malformed cards before they reach `prisma.card.create`/`update` |
| Hallucinated relationship data (spurious `CardDependency` edges) silently corrupting the study-sequencing algorithm | Tampering (data integrity) | GRAPH-01 (prompt tightening) + GRAPH-03 (deck-lookup filter) — this phase's entire purpose; note per the "concrete example" section above, this is a **data-quality** mitigation, not a security vulnerability in the traditional sense (no adversarial actor, no user-facing attack surface — Claude is a trusted first-party API call, just imperfect) |
| Raw SQL string interpolation in the new dry-run script | Tampering (SQL injection) | Not applicable — the dry-run script (GRAPH-05) is read-only, reads fixed queries from `DATABASE_URL`/`DATABASE_AUTH_TOKEN` env vars (same pattern as `scripts/check-edges.mjs`), takes no user-controllable input; if the planner parameterizes anything (e.g., a `--type` CLI flag), use `@libsql/client`'s parameterized `args: [...]` form (already the pattern used throughout `scripts/check-edges.mjs` and `scripts/relink-dependencies.mjs`), never string-interpolate into SQL |

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (this session): `lib/extract-cards.ts` (full file), `lib/known-words.ts` (full file), `lib/gloss.ts` (full file), `app/api/sync/route.ts` (full file), `lib/card-key.ts` (full file), `lib/sentence-match.ts` (full file), `scripts/relink-dependencies.mjs` (full file), `scripts/local-resync.mts` (full file), `scripts/check-edges.mjs` (full file), `prisma/schema.prisma` (Card/CardReview/CardDependency models), `lib/dto.ts` (CardDTO shape), `tests/known-words.test.ts`, `tests/card-key.test.ts`, `package.json`, `vitest.config.ts`, `.planning/config.json`
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/ROADMAP.md` — v1.4 milestone scope, Phase 16 goal/success-criteria/traceability
- `.planning/todos/pending/2026-07-02-fix-spurious-components-in-card-extraction.md` — original problem report with the exact `몸에 알이 배겼을 것 같아요` / `~(으)ㄴ 후에` real-corpus example
- `.planning/research/SUMMARY.md` — prior milestone-level research pass; already reconciled the "substring containment" vs "deck-lookup" question (Reconciliation #2) and named the exact recommended module shape

### Secondary (MEDIUM confidence)
None — no external/web sources were needed for this phase; it is entirely internal-codebase research.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; confirmed via direct `package.json` read, zero ambiguity
- Architecture: HIGH - every pattern cited is read directly from the actual source file with line numbers, not inferred or assumed
- Pitfalls: HIGH - Pitfalls 1-3 derived from direct code inspection (not general web patterns); Pitfall 4 restated faithfully from prior research's own HIGH-confidence codebase-derived finding

**Research date:** 2026-07-02
**Valid until:** Stable — this is internal-codebase research, not subject to ecosystem drift. Re-verify only if `lib/extract-cards.ts`, `app/api/sync/route.ts`, `lib/known-words.ts`, or `lib/gloss.ts` change before this phase is planned/executed.
