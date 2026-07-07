# Phase 21: Card Database Quality Audit - Pattern Map

**Mapped:** 2026-07-06
**Files analyzed:** 3 new files
**Analogs found:** 3 / 3 (plus 2 supporting source files for the superNormalize lift and helper reuse)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `lib/audit-checks.ts` | utility (pure lib module) | transform (rows in → findings out) | `lib/filter-components.ts` | exact (pure exported-function module reusing `card-key`/`sentence-match` helpers) |
| `scripts/audit-cards.mts` | script (operational, local) | batch (read DB → classify → report) | `scripts/retro-filter-cleanup.mts` | exact (dotenv-first + dynamic-import + Prisma singleton + dry-run-style report) |
| `tests/audit-checks.test.ts` | test | request-response (fixtures → assertions) | `tests/filter-components.test.ts` | exact (Vitest, node env, relative import, Korean fixtures) |

Also referenced (source of lifted logic, NOT a structural analog to copy):
- `scripts/find-duplicates.mjs` — `superNormalize` algorithm + report format (uses raw `@libsql/client`; do NOT copy its env/DB wiring)

## Pattern Assignments

### `lib/audit-checks.ts` (utility, transform)

**Analog:** `lib/filter-components.ts` (58 lines, the repo's canonical small pure module)

**File-header contract comment pattern** (`lib/filter-components.ts` lines 1-23) — every pure lib module opens with a JSDoc block stating contract, scope boundary, call sites, and the purity guarantee:
```typescript
/**
 * Pure deck-lookup filter — single source of truth for "does this
 * components[] entry resolve to a real card in the deck?"
 *
 * Contract: keeps a components[] entry only if it resolves to a real card's
 * normalizedFront via direct match or particle-stripped stem match; ...
 *
 * Used by:
 *  - lib/extract-cards.ts  (wired in plan 16-03, the sync write-path filter)
 *
 * No side-effects; safe server AND client.
 */
```

**Imports pattern** (`lib/filter-components.ts` lines 25-26) — pure lib modules import sibling helpers with relative `./` paths (not `@/`), and import NOTHING with side effects (no Prisma, no SDKs, no Node builtins):
```typescript
import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'
```
For audit-checks add `import { sentenceMatch } from './sentence-match'` and `import { filterComponents } from './filter-components'` the same way. **Never import from `lib/extract-cards.ts`** — it pulls in the Anthropic SDK at module top (RESEARCH.md anti-pattern).

**Core pattern — named export, JSDoc @param, pure function over plain data** (`lib/filter-components.ts` lines 28-58):
```typescript
/**
 * Filter raw components[] down to only entries that resolve to a real card
 * in the deck.
 *
 * @param rawComponents        Raw component lemma strings as returned by Claude.
 * @param deckNormalizedFronts Set of every card's normalizedFront in the deck.
 * @returns A new array containing only the entries that resolve to a real
 *          card, in their original order.
 */
export function filterComponents(
  rawComponents: string[],
  deckNormalizedFronts: Set<string>
): string[] {
  return rawComponents.filter((comp) => {
    // Resolution step 1: direct normalizeFront match.
    if (deckNormalizedFronts.has(normalizeFront(comp))) return true
    // Resolution step 2: particle-stem fallback ...
    const { stem } = splitParticle(comp)
    if (stem && stem !== comp && deckNormalizedFronts.has(normalizeFront(stem))) {
      return true
    }
    return false
  })
}
```
Conventions to replicate: named `export function` (no default export in lib), `interface` for shapes, plain-data parameters (arrays/Sets in, arrays/objects out — no Prisma types).

**Helper signatures to call (never reimplement)** — verified in source:
- `sentenceMatch(korean: string, targetForm: string): MatchResult` where `MatchResult = { found: boolean; index: number; safeToBlank: boolean }` (`lib/sentence-match.ts:28`)
- `splitParticle(targetForm: string): { stem: string; particle: string }` (`lib/sentence-match.ts:74`)
- `normalizeFront(front: string): string` (`lib/card-key.ts:25`)
- `filterComponents(rawComponents: string[], deckNormalizedFronts: Set<string>): string[]` (`lib/filter-components.ts:40`)

**Regexes to reuse verbatim** (`lib/card-key.ts` lines 33-34) — the grounded building blocks for the romanization check:
```typescript
const hasHangul = /[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(inner)
const hasAscii = /[A-Za-z0-9]/.test(inner)
```

**superNormalize lift** — copy this local function from `scripts/find-duplicates.mjs` lines 47-62 into `lib/audit-checks.ts` as a named export (the one permitted "lift"; preserve the commented-out slash-removal decision):
```javascript
/** Strip everything to a bare Hangul core for fuzzy comparison. */
function superNormalize(front) {
  return front
    .normalize('NFC')
    // Remove all ~ (grammar markers)
    .replace(/~/g, '')
    // Remove all parenthetical groups (any content in parens, including Hangul)
    .replace(/\([^)]*\)/g, '')
    // Remove slash-alternates like 아/어, ㄹ/을, etc. — keep both sides
    // by just removing the slash so "아/어" becomes "아어"
    // (don't do this — it changes meaning; leave slashes as-is)
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
```

---

### `scripts/audit-cards.mts` (script, batch)

**Analog:** `scripts/retro-filter-cleanup.mts` (the only other `.mts` script that imports typed lib modules; `scripts/local-resync.mts` shares the same preamble)

**File-header pattern** (`retro-filter-cleanup.mts` lines 1-25) — block comment stating purpose, write posture, usage line, idempotency, env reads:
```typescript
/**
 * ...what it does...
 *
 * DRY-RUN BY DEFAULT — reports before/after counts, writes NOTHING.
 * ...
 * Usage:
 *   npx tsx scripts/retro-filter-cleanup.mts            # dry run — reports only, NO writes
 *
 * Reads DATABASE_URL / DATABASE_AUTH_TOKEN from .env / .env.local.
 */
```
For the audit script, the equivalent posture line is `Read-only audit — no writes to the database.`

**Env-first + dynamic-import preamble (copy verbatim, MANDATORY)** (`retro-filter-cleanup.mts` lines 27-41):
```typescript
// Load env BEFORE any lib imports (static imports are hoisted in ESM, so we
// use dynamic imports below to ensure Prisma sees the right env vars) —
// mirrors scripts/local-resync.mts:12-27.
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now that env is loaded, dynamically import libs that read process.env at module init.
const { filterComponents }       = await import('../lib/filter-components.js')
const { prisma }                 = await import('../lib/prisma.js')
```
Note the `.js` extension on dynamic imports of `.ts` lib files — the exact tsx convention. Audit version: `await import('../lib/audit-checks.js')` + `await import('../lib/prisma.js')`. **Never static-import `{ prisma }`** — hoisting breaks env loading (documented gotcha; symptom: audit hits the empty `file:./prisma/dev.db` fallback in `lib/prisma.ts:11`).

**Read-only Prisma load pattern** (`retro-filter-cleanup.mts` lines 68-74; adapt select → include):
```typescript
const allCards = (await prisma.card.findMany({
  select: { id: true, type: true, normalizedFront: true, components: true },
})) as CardRow[]

const deckSet = new Set(allCards.map((c) => c.normalizedFront))
console.log(`Loaded ${allCards.length} cards. Deck set size: ${deckSet.size}.`)
```
Audit query shape per RESEARCH: `prisma.card.findMany({ include: { sentences: { orderBy: { orderIndex: 'asc' } } } })`. The audit script's ONLY Prisma calls are `findMany`/`count` (grep-verifiable read-only guarantee).

**Local row-shape interface pattern** (`retro-filter-cleanup.mts` lines 56-63) — scripts declare a minimal local `interface CardRow { ... }` and cast the query result rather than importing Prisma types:
```typescript
interface CardRow {
  id: string
  type: string
  normalizedFront: string
  components: string | null
}
```

**Malformed-JSON-as-finding pattern** (`retro-filter-cleanup.mts` lines 99-111) — every `JSON.parse` of a nullable JSON column is try/catch'd; malformed rows are counted and reported, never crash:
```typescript
for (const card of allCards) {
  if (!card.components) continue

  let parsed: string[]
  try {
    parsed = JSON.parse(card.components)
    if (!Array.isArray(parsed)) throw new Error('not an array')
  } catch {
    console.warn(`  ⚠ Skipping malformed components JSON on card ${card.id} (${card.normalizedFront})`)
    malformedCount++
    skipCardIds.add(card.id)
    continue
  }
  ...
}
```
Apply the same shape to `card.distractors` (malformed JSON is itself a distractor-anomaly finding).

**Report/console conventions** — mode line up front (`retro-filter-cleanup.mts` line 65), `===` section blocks + `=== Summary ===` with aligned counts (lines 172-192), `process.exit(0)`:
```typescript
console.log(`Mode: ${APPLY ? 'APPLY (will write to production)' : 'DRY RUN (no writes)'}`)
...
console.log('=== Summary ===')
console.log(`  Cards to change:     ${pendingUpdates.size}`)
console.log(`  Malformed skipped:   ${malformedCount}`)
```
And `find-duplicates.mjs` lines 83-99 for the totals + per-cluster block format (fields to echo per finding: `type`, `front`, `back`, `id`):
```javascript
console.log(`Total cards scanned : ${rows.length}`)
console.log(`Unique fuzzy keys   : ${groups.size}`)
console.log(`Potential duplicate groups: ${duplicateGroups.length}`)
...
for (const [key, cards] of duplicateGroups) {
  console.log(`── Fuzzy key: "${key}" (${cards.length} cards) ──`)
  for (const c of cards) {
    console.log(`   [${c.type}] front: "${c.front}"`)
    console.log(`            back:  "${c.back}"`)
    console.log(`            id:    ${c.id}`)
  }
}
```
Cluster sort pattern (`find-duplicates.mjs` lines 79-81): `.filter(([, cards]) => cards.length > 1).sort((a, b) => b[1].length - a[1].length)`.

**New for this phase (no analog exists — first dated report file in repo):** markdown file write. Use `fs.mkdirSync(dir, { recursive: true })` then `fs.writeFileSync` to `.planning/audits/card-audit-${new Date().toISOString().slice(0, 10)}.md` (directory does not exist yet; UTC date is fine for a filename — do NOT use `habitDateStr`).

---

### `tests/audit-checks.test.ts` (test)

**Analog:** `tests/filter-components.test.ts` (entire file is the template)

**Imports pattern** (lines 1-2) — relative `../lib/` import, NO `.js` extension in tests (unlike scripts):
```typescript
import { describe, it, expect } from 'vitest'
import { filterComponents } from '../lib/filter-components'
```

**Test structure pattern** (lines 4-31) — one `describe` per exported function, behavior-sentence `it` names, real Korean fixtures with explanatory comments, requirement ID in the test name where relevant (here use `(AUDIT-02)` instead of `(GRAPH-03)`):
```typescript
describe('filterComponents', () => {
  it('keeps a component on direct normalizeFront match', () => {
    // "먹다" (to eat) is a real deck card front — direct match, no stem needed.
    expect(filterComponents(['먹다'], new Set(['먹다']))).toEqual(['먹다'])
  })

  it('retains an abstract grammar pattern by deck-lookup, not sentence-text containment (GRAPH-03)', () => {
    // "~(으)면" (if/when) is an abstract grammar-pattern notation. ...
    expect(filterComponents(['~(으)면'], new Set(['~(으)면']))).toEqual(['~(으)면'])
  })
})
```

**Scope-boundary test pattern** (lines 33-41) — the repo documents a function's deliberate limits as a test (`'retains a real-but-possibly-unrelated card (documents this filter\'s scope boundary)'`). Use the same idea for e.g. the romanization gloss allowance: assert `~(으)로 (direction particle)` is NOT flagged (Pitfall 3 in RESEARCH.md).

**Run commands:** `npx vitest run tests/audit-checks.test.ts` (targeted), `npm test` (full suite, must stay green — 145 tests as of Phase 20).

## Shared Patterns

### Purity boundary (lib vs script)
**Source:** `lib/filter-components.ts` (pure, no env/DB) vs `scripts/retro-filter-cleanup.mts` (all I/O).
**Apply to:** `lib/audit-checks.ts` takes plain arrays in, returns findings objects — zero Prisma/fs imports. `scripts/audit-cards.mts` owns ALL I/O (Prisma reads, console, file write). This is what makes Vitest-without-DB possible.

### try/catch every JSON column parse
**Source:** `scripts/retro-filter-cleanup.mts:99-111` (excerpt above); precedent also in `lib/gloss.ts`.
**Apply to:** every `JSON.parse` of `card.components` and `card.distractors`, in whichever layer parses them (recommend: script passes raw strings to lib; lib returns a `malformed` finding class).

### Prisma singleton via dynamic import
**Source:** `lib/prisma.ts` (singleton, libSQL adapter, env read at module init) + the `retro-filter-cleanup.mts` preamble.
**Apply to:** `scripts/audit-cards.mts` only. Never in `lib/audit-checks.ts` or tests.

### Named exports + contract JSDoc
**Source:** `lib/filter-components.ts`, `lib/card-key.ts`.
**Apply to:** every function in `lib/audit-checks.ts`.

## No Analog Found

| File / Concern | Role | Reason | Fallback |
|----------------|------|--------|----------|
| Dated markdown report write to `.planning/audits/` | script output | First dated-report-file in the repo (RESEARCH.md A3) | `fs.mkdirSync({ recursive: true })` + `writeFileSync`; filename `card-audit-YYYY-MM-DD.md` per success criterion; content mirrors the console `===` section structure as markdown headings |

## Metadata

**Analog search scope:** `lib/`, `scripts/`, `tests/` (per RESEARCH.md's verified source list — no wider search needed; research already identified exact analogs)
**Files read:** `scripts/retro-filter-cleanup.mts`, `lib/filter-components.ts`, `tests/filter-components.test.ts`, `lib/card-key.ts`, `scripts/find-duplicates.mjs`, `lib/prisma.ts`
**Pattern extraction date:** 2026-07-06
