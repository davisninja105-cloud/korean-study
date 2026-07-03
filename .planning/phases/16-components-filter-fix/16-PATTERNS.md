# Phase 16: Components[] Filter Fix - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/filter-components.ts` | utility (pure `lib/` module) | transform | `lib/known-words.ts` | exact |
| `tests/filter-components.test.ts` | test | transform | `tests/known-words.test.ts` (+ `tests/card-key.test.ts`) | exact |
| `tests/extract-cards.test.ts` | test | transform (LLM-response validation) | `lib/gloss.ts` (`lookupViaLLM`, as the code-under-test-style precedent) — no existing test file for `lib/extract-cards.ts` today | role-match (new coverage, no direct test analog) |
| `scripts/dry-run-filter.mjs` | utility (read-only diagnostic script) | batch / request-response (DB read) | `scripts/check-edges.mjs` | exact |
| `lib/extract-cards.ts` (modified) | service (LLM extraction pipeline) | transform | itself (existing file, in-place modification) — pattern source is `lib/gloss.ts` for the validation guard | role-match |
| `app/api/sync/route.ts` (modified) | route/controller | request-response | itself (existing file, in-place modification) — pattern source is its own `existingNormalizedFronts` query (lines 52-54) | exact (self-consistent fix) |

## Pattern Assignments

### `lib/filter-components.ts` (utility, transform)

**Analog:** `lib/known-words.ts` (`countUnknownWords`, lines 34-66)

**Imports pattern** (mirror `lib/known-words.ts` top-of-file imports):
```typescript
import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'
```
No Prisma, no Anthropic SDK import — this must stay a pure module (verified structurally per GRAPH-04), consistent with `lib/sentence-match.ts`, `lib/sequence.ts`, `lib/known-words.ts`.

**Core two-phase resolution pattern** (`lib/known-words.ts:44-63`, the exact pattern to mirror):
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

**Adaptation for the new filter** (illustrative shape — from RESEARCH.md, executor owns final code):
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

**Function signatures being reused** (do not modify, just import):
- `normalizeFront()` — `lib/card-key.ts:25-40`
- `splitParticle()` — `lib/sentence-match.ts:74-89` — note `PARTICLES_SINGLE` intentionally excludes 도/만/나 (collides with verb endings); do not touch this function, only reuse.

**Documentation convention:** Per `lib/sequence.ts`/`lib/card-key.ts` convention, give `filterComponents` a leading JSDoc block stating its contract ("keeps a `components[]` entry only if it resolves to a real card's `normalizedFront` via direct match or particle-stripped stem match; drops everything else"), single-source-of-truth callers, and "No side-effects" guarantee.

**Insertion point in the caller** (`lib/extract-cards.ts:204-240`, exact current code):
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

  return { /* ... unchanged ... */, components }
})
```
Order matters: dedupe/self-exclude first (cheap, no Set lookups), then deck-filter (needs the `Set<string>` argument threaded in).

---

### `tests/filter-components.test.ts` (test, transform)

**Analog:** `tests/known-words.test.ts` (full file, structure below) + `tests/card-key.test.ts` (idempotency/edge-case style)

**Structure to mirror exactly** (`tests/known-words.test.ts:1-48`):
```typescript
import { describe, it, expect } from 'vitest'
import { countUnknownWords } from '../lib/known-words'

describe('countUnknownWords', () => {
  it('counts tokens not in knownLemmas', () => {
    // Sentence: "나는 사과 먹어요" (I eat an apple)
    // ... Korean-language comment explaining exact tokens/expected resolution path ...
    const knownLemmas = new Set(['나는'])
    expect(countUnknownWords('나는 사과 먹어요', '사과', knownLemmas)).toBe(1)
  })
  // ... one it() per case, each with an explanatory Korean-example comment ...
})
```

**Required cases for `filterComponents`** (per RESEARCH.md guidance):
1. Direct match retained (component's `normalizeFront()` is in the deck set)
2. Stem-fallback match retained (component + particle, stem resolves via `splitParticle`)
3. No-match dropped (fabricated string not in deck)
4. Empty input array → empty output
5. A case mirroring the real `~(으)ㄴ 후에` corpus example — component IS in the deck via direct match, so it IS retained by this filter alone (documents that this filter does not solve the "real-but-unrelated" class — see Pitfall in RESEARCH.md)

Import path convention: `import { filterComponents } from '../lib/filter-components'` (relative `../`, matching `tests/known-words.test.ts:2` — the `tests/` directory does not use the `@/` alias for its own imports of sibling `lib/` modules).

---

### `tests/extract-cards.test.ts` (test, transform — new coverage)

**Analog:** No existing test file for `lib/extract-cards.ts`. Use `tests/known-words.test.ts`'s `describe/it` + Vitest structure for file shape, and mirror `lib/gloss.ts`'s validation convention (below) for what is under test.

**What is under test** — per RESEARCH.md Pattern 2, the validation guard mirrors `lib/gloss.ts:107-144` (`lookupViaLLM`):
```typescript
const content = message.content[0]
if (content.type !== 'text') throw new Error('Unexpected response from Claude')
const text = content.text.trim()
const jsonMatch = text.match(/\{[\s\S]*\}/)
if (!jsonMatch) throw new Error('No JSON object found in gloss response')
return JSON.parse(jsonMatch[0]) as { dictionaryForm: string; gloss: string; partOfSpeech: string }
```

**Critical constraint (do not regress):** `lib/extract-cards.ts:165-201` already has array-level truncation-salvage logic (trims back to last complete `},`, re-closes the array) — tests must confirm the NEW per-card shape-validation guard composes with this salvage step (a dense/truncated response still yields the cards that DID complete), not replace it. Structure tests as: (a) well-formed response → all cards pass; (b) response with one structurally-malformed card object (missing `front`/`back`/`type`) → that card is dropped, others kept; (c) truncated array (salvage-testable case) → salvage still runs, then validation still applies per-card.

**Mocking approach:** Since `lib/extract-cards.ts` calls the live Anthropic API, tests must mock/stub the Claude response text and test only the parsing/validation logic in isolation — no live API calls in `npm test` (consistent with `CLAUDE.md`'s "Vitest unit tests — pure lib functions — no DB/API needed").

---

### `scripts/dry-run-filter.mjs` (utility, read-only diagnostic script)

**Analog:** `scripts/check-edges.mjs` (full file)

**Header comment + usage convention** (`scripts/check-edges.mjs:1-8`):
```javascript
/**
 * Read-only diagnostic: show CardDependency counts and recent edges.
 * Safe to run anytime — does NOT modify data.
 *
 * Usage:
 *   node scripts/check-edges.mjs            # summary + 10 most-recent edges
 *   node scripts/check-edges.mjs --recent 5  # show 5 most-recent edges
 */
```

**Env-loading pattern** (`scripts/check-edges.mjs:9-33`, exact code to reuse verbatim):
```javascript
import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv(filename) {
  const vars = {}
  try {
    for (const line of readFileSync(resolve(__dir, '..', filename), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/)
      if (m) vars[m[1]] = m[2]
    }
  } catch { /* file may not exist */ }
  return vars
}

const env   = { ...parseEnv('.env'), ...parseEnv('.env.local') }
const url   = process.env.DATABASE_URL        ?? env.DATABASE_URL
const token = process.env.DATABASE_AUTH_TOKEN ?? env.DATABASE_AUTH_TOKEN

if (!url) { console.error('DATABASE_URL not set'); process.exit(1) }

const db = createClient({ url, authToken: token ?? undefined })
```
Note: this `.mjs` script re-derives `normalizeFront()`/`splitParticle()` logic inline (cannot `import` TS `lib/` modules from plain `.mjs` — only `.mts` scripts like `local-resync.mts` can `await import('../lib/...')`). Follow `scripts/relink-dependencies.mjs`'s precedent of an inline re-derived `normalizeFront()` (lines 55-68 there) if the dry-run needs deck-lookup logic duplicated in JS.

**Query + report pattern** (`scripts/check-edges.mjs:35-84`, adapt the counts/grouping style):
```javascript
const { rows: totalRows } = await db.execute(`SELECT count(*) as n FROM "Card"`)
const n = (r) => r[0].n ?? r[0][0]

console.log('=== Filter Dry-Run Report ===')
console.log(`Total Cards: ${n(totalRows)}`)
// ... group by Card.type ('vocabulary' | 'grammar' | 'phrase'), report drop rate per group ...
```
Fetch all cards' `components` + `type` + `normalizedFront`, build the full deck-lookup Set (no `WHERE` filter — see Pitfall 1 in RESEARCH.md), run each card's stored `components[]` through the same two-phase resolution logic (re-derived inline, matching `filterComponents`'s behavior), and print per-type (`grammar` vs `vocabulary` vs `phrase`) drop-rate counts — GRAPH-05 explicitly requires grammar vs vocabulary reported separately, since the corpus example shows grammar components are the higher-risk class.

**Parameterized queries convention** (if a `--type` CLI flag is added): use `@libsql/client`'s `args: [...]` form as shown in `scripts/check-edges.mjs:55-68`, never string-interpolate into SQL.

---

### `lib/extract-cards.ts` (modified — service, transform)

**Analog:** self (existing file) for the salvage logic to preserve; `lib/gloss.ts:107-144` for the validation-guard shape to add.

**Existing salvage logic to keep fully intact** (`lib/extract-cards.ts:165-201`) — do not replace, only layer a per-card shape guard on top at the `.map()` step (line 204+, see insertion point above).

**Signature/parameter note:** `extractCardsFromNotes(notes, existingNormalizedFronts, emphasized)` (lines 30-34) already receives `existingNormalizedFronts: string[]` as its 2nd parameter (currently used only for the prompt's "don't recreate these" dedup-hint text, lines 35-38). Per RESEARCH.md's Assumption A1/Open Question 2 recommendation, thread this same list (turned into a `Set<string>`) into the `filterComponents()` call inside the `.map()` closure, rather than adding a second call site in `app/api/sync/route.ts`. This means `scripts/local-resync.mts` (which calls `extractCardsFromNotes` directly) automatically benefits without a separate integration point.

**Prompt tightening (GRAPH-01):** Locate the exact `components` field instructions at `lib/extract-cards.ts:110-117` and add explicit language: only list a component if it's a real prerequisite the card's content actually depends on. This is pure prompt-text; no runtime logic change.

---

### `app/api/sync/route.ts` (modified — route/controller, request-response)

**Analog:** self — compare the two existing queries in the same file.

**Correct deck-lookup Set source** (`app/api/sync/route.ts:52-54`, already the right shape — reuse, do not narrow):
```typescript
const existingNormalizedFronts = (
  await prisma.card.findMany({ select: { normalizedFront: true } })
).map((c) => c.normalizedFront)
```

**Scoping bug to avoid replicating in the new filter's Set** (`app/api/sync/route.ts:81-86`, the `keyToId` map — narrower, edge-creation-only):
```typescript
const keyToId = new Map<string, string>()
const seedCards = await prisma.card.findMany({
  select: { id: true, normalizedFront: true },
  where: { components: { not: null } },   // ← narrower than "all cards" — Pitfall 1
})
for (const c of seedCards) keyToId.set(c.normalizedFront, c.id)
```
Flag (do not silently fix or silently skip, per RESEARCH.md Open Question 1): whether this same scoping bug in the edge-creation step (lines 217-247) should also be corrected in this phase so leaf-node cards (real cards with no `components` of their own) become resolvable as *someone else's* prerequisite. This is a planner-level decision, not a pattern-extraction concern — noted here for visibility.

## Shared Patterns

### Two-phase deck/known-lemma resolution
**Source:** `lib/known-words.ts:34-66` (`countUnknownWords`)
**Apply to:** `lib/filter-components.ts` (new), and inline re-derivation in `scripts/dry-run-filter.mjs`
```typescript
const normalized = normalizeFront(token)
if (deckSet.has(normalized)) return true
const { stem } = splitParticle(token)
if (stem && stem !== token && deckSet.has(normalizeFront(stem))) return true
return false
```

### LLM response structural validation
**Source:** `lib/gloss.ts:107-144` (`lookupViaLLM`)
**Apply to:** `lib/extract-cards.ts`'s new per-card validation guard (GRAPH-02), tested by `tests/extract-cards.test.ts`
```typescript
const jsonMatch = text.match(/\{[\s\S]*\}/)
if (!jsonMatch) throw new Error('No JSON object found in gloss response')
return JSON.parse(jsonMatch[0]) as ExpectedShape
```

### Read-only diagnostic script skeleton
**Source:** `scripts/check-edges.mjs` (full file, `parseEnv` + `createClient` + grouped console report)
**Apply to:** `scripts/dry-run-filter.mjs`
Reuse verbatim: `parseEnv()` helper, `.env`/`.env.local` merge, `DATABASE_URL`/`DATABASE_AUTH_TOKEN` env resolution, `createClient({ url, authToken })`, `n = (r) => r[0].n ?? r[0][0]` row-unwrap helper.

### Vitest test-file structure
**Source:** `tests/known-words.test.ts` (full file)
**Apply to:** `tests/filter-components.test.ts`, `tests/extract-cards.test.ts`
`describe('functionName', () => { it('behavior description', () => { /* Korean-example comment */ expect(...).toBe(...) }) })` — one `describe` per exported function, one `it` per case, comments document the exact Korean tokens/expected resolution path for any test involving Korean text.

## No Analog Found

None — every file in this phase has a direct, exact-match precedent already in the codebase (per RESEARCH.md's own "Every piece of this phase has a direct precedent already in the codebase" finding). `tests/extract-cards.test.ts` has no prior test-file analog for the *file under test* (no existing `lib/extract-cards.ts` tests), but the validation logic it tests has an exact precedent (`lib/gloss.ts`) and the test-file shape has an exact precedent (`tests/known-words.test.ts`) — recorded above as role-match, not classified as "no analog."

## Metadata

**Analog search scope:** `lib/`, `tests/`, `scripts/`, `app/api/sync/` — fully covered by RESEARCH.md's direct codebase reads (already cites file:line for every pattern; no additional Glob/Grep search was needed beyond confirming two files: `tests/known-words.test.ts` and `scripts/check-edges.mjs`, read in full above).
**Files scanned:** 6 target files + 5 analog source files (`lib/known-words.ts`, `lib/gloss.ts`, `lib/card-key.ts`, `lib/sentence-match.ts`, `scripts/check-edges.mjs`, `tests/known-words.test.ts`) — all already fully read during research; confirmed via direct reads in this pass.
**Pattern extraction date:** 2026-07-02
