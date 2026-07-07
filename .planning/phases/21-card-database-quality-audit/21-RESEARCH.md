# Phase 21: Card Database Quality Audit - Research

**Researched:** 2026-07-06
**Domain:** Read-only data-quality audit of an existing SQLite/Turso card corpus (pure TypeScript checks + local script + markdown report)
**Confidence:** HIGH — every claim below is grounded in direct reads of this repo's source files; no external packages or APIs are involved.

## Summary

This phase is entirely self-contained: a pure `lib/audit-checks.ts` module (Vitest-covered) plus a local `npx tsx` script that reads the live deck via the existing Prisma singleton and writes a dated markdown report to `.planning/audits/card-audit-<date>.md`. No LLM calls, no new dependencies, no schema changes. All six audit checks map cleanly onto existing production helpers whose exact signatures are documented below — the audit must *call* these helpers, never reimplement their rules, so the audit's definition of "violation" is by construction identical to what the production code enforces.

The critical framing fact: Phase 20 (just shipped, 2026-07-06) made blank-safety **code-enforced going forward** — `normalizeExtractedCards` drops any card whose sentences contain zero blank-safe entries and reorders survivors safe-first. But the existing ~511-card deck `[ASSUMED: ROADMAP.md figure — verify with a live count in the report itself]` was extracted *before* this hardening, so blank-safety violations, zero-sentence cards, and short-distractor cards are all expected to exist in stored data. The audit checks the DB rows against the same predicates Phase 20 now enforces at extraction time (`sentenceMatch(...).safeToBlank`, distractor count 3, etc.).

**Primary recommendation:** Model the script on `scripts/retro-filter-cleanup.mts` (dotenv-first + dynamic `await import('../lib/*.js')` + Prisma singleton, run via `npx tsx`), put every check as a pure function over plain data in `lib/audit-checks.ts` (tested like `tests/filter-components.test.ts`), and lift `find-duplicates.mjs`'s `superNormalize` into the module as the near-duplicate clustering key.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit check predicates (all 6 classes) | Pure library (`lib/audit-checks.ts`) | — | Success criterion 3 mandates pure, Vitest-covered, helper-reusing module; matches existing `lib/` pure-module convention |
| DB read (cards + sentences) | Local script (`scripts/*.mts` via `npx tsx`) | — | Runs on dev machine against Turso like all other operational scripts; no Vercel involvement, no API route |
| Report generation + file write | Local script | — | Writes markdown to `.planning/audits/`; filesystem write only, DB is read-only |
| Test coverage | Vitest (`tests/audit-checks.test.ts`) | — | `npm test` = `vitest run`, node environment, no DB needed for pure functions |

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** all file changes go through GSD commands (this phase is being planned through `/gsd-plan-phase`).
- **Tech stack fixed:** Next.js 16 / React 19 / TypeScript 5.9 strict / Prisma 7 + libSQL. No new frameworks.
- **Lint must stay clean** (`npm run lint`, eslint-config-next 16, strict). `react-hooks/purity` applies to components — not directly relevant to a script/lib module, but `lib/audit-checks.ts` must be side-effect-free anyway per success criterion 3.
- **`prisma db push`/`migrate` don't work against Turso** — irrelevant here (no schema change), but reinforces: no DDL in this phase.
- **Vercel 60s timeout** — irrelevant: the audit runs locally via `npx tsx`, never in a request path (same posture as `retro-filter-cleanup.mts`'s "developer-run locally, NEVER in the /api/sync request path").
- **Pure `lib/` module convention:** modules shared across environments must have no Prisma/Node-builtin imports; server-only modules carry a `// No 'use client'` comment. `lib/audit-checks.ts` should be pure (importable by both the script and Vitest).
- **Naming:** kebab-case files; named exports for library functions; tests in `tests/<module>.test.ts`.
- **v1.5 milestone hard rule (STATE.md):** all corpus fixes mutate cards in place by `id` — never delete+recreate (cascades wipe FSRS state + ReviewLog). This phase is read-only, but the report should present card `id`s so Phase 22 fixes can target rows in place.
- **Keep CLAUDE.md / `.planning/codebase/*.md` current** after milestone close — a new script and lib module should eventually be listed there (Phase 22/milestone-close concern, worth a plan note).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUDIT-01 | A read-only script audits the existing card database (blank-safety violations, zero-sentence cards, romanization leakage, distractor-count anomalies, `normalizedFront` inconsistency, near-duplicate clusters) and produces a dated findings report | §Standard Stack (script conventions), §Concrete Definitions of the Six Check Classes, §Read-Only Guarantees, §Report Output Conventions |
| AUDIT-02 | Audit checks are implemented as a pure, unit-tested module that reuses production helpers (`sentenceMatch`, `splitParticle`, `normalizeFront`, `filterComponents`) rather than reimplementing them | §Exact Helper Signatures (verified from source), §Vitest Conventions, §Don't Hand-Roll |
</phase_requirements>

## Standard Stack

### Core (all already installed — zero new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma (`lib/prisma.ts` singleton) | 7.6.0 | Read cards/sentences from Turso | `[VERIFIED: lib/prisma.ts]` — same client every script/route uses; `PrismaLibSql` adapter reads `DATABASE_URL`/`DATABASE_AUTH_TOKEN` at module init |
| tsx (via `npx tsx`) | on-demand | Run the `.mts` audit script | `[VERIFIED: scripts/retro-filter-cleanup.mts usage + CLAUDE.md]` — not in node_modules; `npx` fetches it, exactly how `local-resync.mts` and `retro-filter-cleanup.mts` already run |
| Vitest | ^4.1.9 | Unit tests for `lib/audit-checks.ts` | `[VERIFIED: package.json + node_modules/.bin/vitest]` — `npm test` = `vitest run`; config in `vitest.config.ts` (node env, `@` alias) |
| dotenv | 17.3.1 | Load `.env`/`.env.local` before lib imports | `[VERIFIED: scripts/retro-filter-cleanup.mts:30-36]` |
| Node `fs`/`path` | built-in | Write the dated report file | Standard |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Prisma singleton (`.mts` + dynamic import) | Raw `@libsql/client` + hand-rolled env parser (the `find-duplicates.mjs` pattern) | Raw client can't reuse `lib/` TypeScript helpers without a build step; `.mts` + dynamic import gives typed helper reuse for free. Use the `.mts` pattern. |
| Local script | API route | Vercel 60s limit + writing files to `.planning/` is impossible on Vercel. Local script is the only correct choice. |

**Installation:** none required.

## Package Legitimacy Audit

No new packages are installed in this phase. All tooling (Prisma 7.6.0, Vitest 4.1.9, dotenv 17.3.1, tsx via npx) is already present in `package.json`/existing script conventions.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Exact Helper Signatures (verified from source)

These are the four helpers success criterion 3 mandates reusing. Signatures below are copied from the actual source files, not from CLAUDE.md prose.

### `sentenceMatch` — `lib/sentence-match.ts:28` `[VERIFIED: source read]`

```typescript
export interface MatchResult {
  found: boolean        // targetForm found verbatim in korean
  index: number         // index of first occurrence; -1 if not found
  safeToBlank: boolean  // false when: length <= 1, occurs >1 time, or not found
}
export function sentenceMatch(korean: string, targetForm: string): MatchResult
```

There is **no separate `safeToBlank` helper** — blank-safety is the `safeToBlank` field of `MatchResult`. This is the exact predicate `normalizeExtractedCards` uses (`lib/extract-cards.ts:366-371`). Also co-located and available if useful: `blankSentence(korean: string, targetForm: string): string` (`lib/sentence-match.ts:95`).

### `splitParticle` — `lib/sentence-match.ts:74` `[VERIFIED: source read]`

```typescript
export function splitParticle(targetForm: string): { stem: string; particle: string }
```

Conservative: multi-char particles (에서/부터/으로/…, longest-first) split off even a 1-syllable stem; single-char case markers (은/는/이/가/…) require `targetForm.length >= 3`; 도/만/나 excluded. Returns `{ stem: targetForm, particle: '' }` when no split.

### `normalizeFront` — `lib/card-key.ts:25` `[VERIFIED: source read]`

```typescript
export function normalizeFront(front: string): string
```

NFC-normalize → trim → collapse whitespace → strip the **last** trailing paren group only when it contains ASCII letters/digits and **no Hangul** (Hangul test regex: `/[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/`; ASCII test: `/[A-Za-z0-9]/`). These two regexes are the grounded, already-in-repo building blocks for the romanization-leakage heuristic (see below).

### `filterComponents` — `lib/filter-components.ts:40` `[VERIFIED: source read]`

```typescript
export function filterComponents(
  rawComponents: string[],
  deckNormalizedFronts: Set<string>
): string[]
```

Keeps an entry iff it resolves to a real deck card: direct `normalizeFront(comp)` set-hit, else `splitParticle(comp).stem` set-hit. Pure, order-preserving, no re-dedupe (caller dedupes). **Note:** it lives in its own file `lib/filter-components.ts` (not inside `lib/extract-cards.ts` as CLAUDE.md prose might suggest) and is already exported — no export change needed. It can power an optional "stale/spurious components" finding (entries in stored `Card.components` that no longer pass the filter), the same computation `retro-filter-cleanup.mts` does in dry-run mode.

### Also relevant (exported, reusable)

- `normalizeExtractedCards(rawCards: unknown[], deckSet?: Set<string>): ExtractedCard[]` — `lib/extract-cards.ts:307` — the post-Phase-20 write-path invariant enforcer. The audit does NOT call this (it operates on stored DB rows, not raw extraction output), but its predicates define what "violation" means (see next section). **Caution:** `lib/extract-cards.ts` imports the Anthropic SDK at module top — do not import it from `lib/audit-checks.ts`; reuse the four pure helpers directly instead.
- `superNormalize(front)` — currently a **local function inside `scripts/find-duplicates.mjs:48`** (not exported, not in `lib/`). To satisfy criterion 3's "pure, Vitest-covered" requirement, its logic should be **moved into `lib/audit-checks.ts`** (it's 6 lines: NFC → strip `~` → strip all paren groups → collapse whitespace → trim → lowercase). This is the one permitted "lift", not a reimplementation — the script it comes from is untested prior art, and the phase explicitly centralizes checks in the new module.

## Current Schema Shape (verified from prisma/schema.prisma)

Fields the audit reads `[VERIFIED: prisma/schema.prisma]`:

```prisma
model Card {
  id               String   @id
  type             String   // "vocabulary" | "grammar" | "phrase"
  front            String
  back             String
  notes            String?
  normalizedFront  String   @unique
  components       String?  // JSON string[] of prerequisite lemmas
  distractors      String?  // JSON array of 3 wrong English meanings
  clozeSentence    String?  // DEPRECATED
  clozeAnswer      String?  // DEPRECATED
  clozeTranslation String?  // DEPRECATED
  lessonId         String?
  sentences        Sentence[]
}
model Sentence {
  id          String @id
  cardId      String  // Card relation, onDelete: Cascade
  korean      String  // full sentence, NO blank
  targetForm  String  // exact surface form to highlight/blank
  translation String
  orderIndex  Int @default(0)  // 0-based order within card
}
```

Key facts:
- `distractors` and `components` are **nullable JSON-string columns** — every parse must be `try/catch`-wrapped (repo convention, and `retro-filter-cleanup.mts` found real malformed `components` rows: it has an explicit malformed-JSON skip path with a `malformedCount`).
- `normalizedFront` is `@unique` at the DB level, so *duplicate* normalizedFront rows can't exist — the "inconsistency" check is a different thing (see below).
- Sentence order is `orderIndex` (0-based); "first sentence" = `orderIndex: 0` (query with `orderBy: { orderIndex: 'asc' }`).
- Query shape for the whole audit: `prisma.card.findMany({ include: { sentences: { orderBy: { orderIndex: 'asc' } } } })` — one query, ~511 cards, trivially within local-machine budget.

## Concrete Definitions of the Six Check Classes

Grounded in what production code enforces NOW (post-Phase 20) — stored rows predate that enforcement, so hits are expected.

1. **Blank-safety violations** `[VERIFIED: lib/extract-cards.ts:361-379 + lib/sentence-match.ts]` — Phase 20's invariant: every persisted card's `sentences[0]` must have `sentenceMatch(korean, targetForm).safeToBlank === true`. Audit check per card: (a) any sentence with `.found === false` (renders un-highlighted, wrong fill-blank answer — production drops these at extraction now); (b) first sentence (`orderIndex 0`) not `safeToBlank`; (c) card has sentences but **zero** blank-safe ones (the class Phase 20 now rejects whole). Report all three sub-classes distinctly — Phase 22's fix strategy differs (reorder vs regenerate).
2. **Zero-sentence cards** — `card.sentences.length === 0`. Legacy cards may also carry deprecated `clozeSentence` data; worth reporting whether a zero-sentence card has legacy cloze fields (a possible fix source for Phase 22).
3. **Romanization leakage** `[VERIFIED: lib/extract-cards.ts prompt rules + lib/card-key.ts regexes]` — the prompt bans Latin-letter romanization in `front` and in sentence `korean`, but **allows** a short English clarifying gloss in trailing parens on `front` (e.g. `~(으)로 (direction particle)`). Grounded heuristic: a `front` leaks romanization iff `normalizeFront(front)` (gloss already stripped) still matches `/[A-Za-z]/`. A sentence `korean` leaks iff it matches `/[A-Za-z]/` at all (no gloss allowance there). `back`/`translation`/`notes` are English by design — no Latin check; but `back`/`translation` could optionally be flagged if they contain **no** ASCII and **only** Hangul (inverted-field anomaly) — mark this sub-check optional/discretionary. Hangul detection regex to reuse verbatim: `/[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/` from `normalizeFront`.
4. **Distractor-count anomalies** `[VERIFIED: lib/extract-cards.ts:397-411 + components/StudySession.tsx:322-342]` — prompt demands EXACTLY 3; Phase 20 added a `console.warn` when `< 3` but persists anyway; the study UI parses the JSON (`try/catch` → `[]` on malformed) and pads shortfalls from other cards' `back` values. Anomaly classes: `distractors` null; malformed JSON; parsed length ≠ 3; non-string entries; a distractor strictly equal to `back`; duplicate distractors. (`> 3` is possible in legacy rows — Phase 20 slices to 3 at extraction, UI also slices.)
5. **`normalizedFront` inconsistency** — stored `card.normalizedFront !== normalizeFront(card.front)` (recompute with the current helper). Can happen if `front` was edited through a path that didn't re-derive the key, or if `normalizeFront`'s rules changed after the row was written. Also worth flagging: `front !== front.trim()` (Phase 20's WR-01 trims at extraction now, legacy rows may not be trimmed).
6. **Near-duplicate clusters** `[VERIFIED: scripts/find-duplicates.mjs]` — group cards by `superNormalize(normalizedFront || front)`; any group with ≥ 2 members is a cluster. `superNormalize` = NFC → remove all `~` → remove all `(...)` groups (including Hangul ones like `(으)`) → collapse whitespace → trim → lowercase. Slashes are intentionally left as-is (a commented-out earlier attempt at slash removal was rejected because it changes meaning — preserve that decision). Report clusters sorted by member count descending, showing `type`, `front`, `back`, `id` per member (same fields the existing script prints).

Optional 7th finding the helpers make nearly free (Claude's discretion): **stale components** — per card, `filterComponents(JSON.parse(components), deckSet)` vs stored, counting drops; mirrors `retro-filter-cleanup.mts` Phase B dry-run. Note it duplicates that script's report — include only as a summary count if at all.

## Architecture Patterns

### System Architecture Diagram

```
.env / .env.local ──(dotenv, loaded FIRST)──┐
                                            ▼
scripts/audit-cards.mts  (npx tsx, local machine)
  │  dynamic await import('../lib/prisma.js')          ← env must precede this
  │  dynamic await import('../lib/audit-checks.js')
  │
  ├─► prisma.card.findMany({ include: { sentences: orderBy orderIndex } })  [READ ONLY]
  │        │
  │        ▼  plain rows (no Dates needed — audit uses strings only)
  ├─► lib/audit-checks.ts   (pure — the ONLY place check logic lives)
  │        ├── uses sentenceMatch / splitParticle  (lib/sentence-match.ts)
  │        ├── uses normalizeFront                 (lib/card-key.ts)
  │        ├── uses filterComponents               (lib/filter-components.ts)
  │        └── returns structured findings objects (per-class arrays + counts)
  │
  └─► render markdown ──► fs.writeFileSync('.planning/audits/card-audit-YYYY-MM-DD.md')
                                            ▲
tests/audit-checks.test.ts ── vitest run ───┘ (tests pure module only; no DB)
```

### Recommended placement (follows existing conventions exactly)

```
lib/audit-checks.ts          # pure module: check functions + superNormalize + report-data types
scripts/audit-cards.mts      # .mts (needs typed lib imports) — env-first + dynamic imports
tests/audit-checks.test.ts   # vitest, node env, relative '../lib/audit-checks' import
.planning/audits/            # NEW directory (does not exist yet — script must mkdir -p)
```

### Pattern 1: env-first + dynamic import (MANDATORY for the script)

`[VERIFIED: scripts/retro-filter-cleanup.mts:26-41 and scripts/local-resync.mts:12-28]` — static imports are hoisted in ESM, so `lib/prisma.ts` would read `process.env.DATABASE_URL` before dotenv runs. Replicate exactly:

```typescript
// Load env BEFORE any lib imports (static imports are hoisted in ESM).
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Now dynamically import libs that read process.env at module init.
const { runAuditChecks } = await import('../lib/audit-checks.js')  // note .js extension
const { prisma }         = await import('../lib/prisma.js')
```

Note the `.js` extensions on dynamic imports of `.ts` lib files — that is the existing scripts' exact convention under tsx.

### Pattern 2: pure-module test structure

`[VERIFIED: tests/filter-components.test.ts]`:

```typescript
import { describe, it, expect } from 'vitest'
import { filterComponents } from '../lib/filter-components'   // relative, no .js ext in tests

describe('filterComponents', () => {
  it('keeps a component on direct normalizeFront match', () => { ... })
})
```

- Tests live flat in `tests/`, named `<module>.test.ts`, relative `../lib/` imports, node environment, real Korean fixtures with explanatory comments, requirement IDs referenced in test names where relevant (e.g. `(GRAPH-03)` → here use `(AUDIT-02)`).
- Run: `npm test` (full, `vitest run`) or `npx vitest run tests/audit-checks.test.ts` (targeted).

### Pattern 3: report/reporting conventions from prior art

`[VERIFIED: scripts/retro-filter-cleanup.mts + scripts/find-duplicates.mjs]`
- Both scripts print a header, per-section `===` blocks, a `=== Summary ===` with counts, and exit 0.
- `retro-filter-cleanup.mts` prints `Mode: DRY RUN (no writes)` up front. The audit is *always* read-only, so an equivalent one-liner (`Read-only audit — no writes to the database.`) keeps the convention.
- New for this phase: findings also go to a **markdown file** `.planning/audits/card-audit-<date>.md`. Date: `new Date().toISOString().slice(0, 10)` (UTC calendar date is fine for a report filename; `habitDateStr` is for activity logging only per CLAUDE.md — do not use it here). `[ASSUMED: no existing dated-report-file convention exists in the repo — this is the first; naming comes from the success criterion verbatim]`
- Report should echo totals (`Total cards scanned : N`) like `find-duplicates.mjs`, and include card `id`s for every finding so Phase 22 can fix in place by `id` (STATE.md hard rule).

### Anti-Patterns to Avoid

- **Importing `lib/extract-cards.ts` from the audit module** — it imports the Anthropic SDK at top level; pulls SDK init into a no-LLM audit. Import the four helpers from their own files instead.
- **Reimplementing any predicate** (blank-safety, gloss-stripping, particle rules) — the whole point of AUDIT-02 is that audit truth ≡ production truth. If the audit needs a rule that exists in production, import it.
- **Static `import { prisma }` in the script** — hoisting breaks env loading (documented gotcha).
- **Putting Prisma calls inside `lib/audit-checks.ts`** — kills purity and Vitest-without-DB; the module takes plain arrays in.
- **`delete`/`update`/`upsert` anywhere** — read-only is a hard success criterion (see next section).

## Read-Only Guarantees (success criterion 4)

How to make "mutates no data" *verifiable*, cheapest-first:

1. **Structural:** the script's only Prisma calls are `findMany`/`count`; `lib/audit-checks.ts` imports no Prisma at all. Verifiable by grep: `grep -E 'prisma\.\w+\.(create|update|upsert|delete|executeRaw)' scripts/audit-cards.mts lib/audit-checks.ts` → zero hits. This is the primary, always-available verification and should be a stated verification step in the plan.
2. **Test-level:** unit tests prove the check functions are pure (same input → same output, no I/O possible — module has no DB import to mock).
3. **Optional belt-and-braces (Claude's discretion):** run the script with a **read-only Turso token** (`turso db tokens create korean-study --read-only` `[ASSUMED: turso CLI supports --read-only tokens — verify with turso db tokens create --help before relying on it]`) set as `DATABASE_AUTH_TOKEN` for the run — any accidental write would then fail at the DB layer. Nice-to-have, not required; the structural guarantee suffices for the criterion.

Also note: writing the report file into `.planning/audits/` is a *filesystem* write, not a DB write — that does not violate criterion 4 (the criterion says "no writes to the DB").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blank-safety predicate | substring/count logic | `sentenceMatch(korean, targetForm).safeToBlank` | Single source of truth; 1-char and multi-occurrence rules already encoded |
| Particle stem splitting | particle list | `splitParticle(targetForm)` | Conservative rules (multi vs single char, 도/만/나 exclusion) took a full phase to tune |
| Dedup key | gloss-paren regex | `normalizeFront(front)` | Hangul-vs-ASCII paren heuristic is subtle (Unicode ranges) and already exact |
| Component resolution | deck lookup loop | `filterComponents(raw, deckSet)` | Two-phase (direct + stem) resolution, order-preserving |
| Near-duplicate key | new fuzzy algorithm | `superNormalize` logic from `find-duplicates.mjs` (lifted into `lib/audit-checks.ts`) | Already validated against this exact corpus; keeps findings comparable to past manual runs |
| DB access / env loading | new client wiring | `lib/prisma.ts` singleton + `retro-filter-cleanup.mts` env preamble | Proven against Turso; handles local-file fallback |

**Key insight:** every "check" in this phase is a thin adapter from a DB row shape onto an existing pure predicate. The only genuinely new logic is (a) the romanization regex checks (grounded in `normalizeFront`'s own regexes), (b) distractor JSON-shape checks (grounded in `StudySession.tsx`'s parse/pad behavior), and (c) markdown rendering.

## Common Pitfalls

### Pitfall 1: Trusting JSON columns to parse
**What goes wrong:** `JSON.parse(card.components)` or `JSON.parse(card.distractors)` throws on real rows.
**Why:** `retro-filter-cleanup.mts` already encountered malformed `components` JSON in production (it has a dedicated `malformedCount`/`skipCardIds` path).
**How to avoid:** wrap every parse in `try/catch`; malformed JSON is itself a *finding* (report it under distractor-anomalies / a data-integrity section), not a crash.
**Warning signs:** script dies mid-run with `SyntaxError: Unexpected token`.

### Pitfall 2: Auditing against pre-Phase-20 semantics
**What goes wrong:** treating "first sentence not blank-safe but a later one is" the same as "no blank-safe sentence at all".
**Why:** Phase 20 established distinct handling — safe-first *reordering* (fixable in place by swapping `orderIndex`) vs whole-card rejection (needs regeneration). Phase 22's fixes differ per sub-class.
**How to avoid:** report the three blank-safety sub-classes separately (not-found sentences / unsafe-first-but-safe-exists / zero-safe).

### Pitfall 3: False-positive romanization on legitimate English glosses
**What goes wrong:** flagging `~(으)로 (direction particle)` as romanization leakage because it contains Latin letters.
**Why:** the No-romanization rule explicitly permits trailing English glosses in `front`.
**How to avoid:** run the Latin check on `normalizeFront(front)` (gloss already stripped), not raw `front`. Sentences' `korean` gets the raw check (no gloss allowance there).

### Pitfall 4: Static lib imports in the `.mts` script
**What goes wrong:** Prisma connects to the wrong `DATABASE_URL` (or `file:./prisma/dev.db` fallback) because env wasn't loaded yet.
**How to avoid:** copy the `retro-filter-cleanup.mts` preamble verbatim (dotenv → then `await import('../lib/*.js')`).
**Warning signs:** audit reports ~0 cards (hit the empty local fallback DB instead of Turso).

### Pitfall 5: `.planning/audits/` doesn't exist
**What goes wrong:** `fs.writeFileSync` throws ENOENT.
**How to avoid:** `fs.mkdirSync(dir, { recursive: true })` before writing. `[VERIFIED: ls .planning/audits → "no audits dir"]`

### Pitfall 6: `distractors > 3` and duplicates in legacy rows
**What goes wrong:** assuming anomalies are only `< 3`.
**Why:** Phase 20's slice-to-3 and the UI's pad/slice only apply going forward / at render; stored legacy rows can hold any shape.
**How to avoid:** check length ≠ 3 (both directions), duplicates, and distractor === back.

## Code Examples

### Blank-safety classification per card (adapter over production predicate)

```typescript
// lib/audit-checks.ts — pure; sentences must arrive pre-sorted by orderIndex asc
import { sentenceMatch } from './sentence-match'

export interface AuditSentence { korean: string; targetForm: string; orderIndex: number }

export function classifyBlankSafety(sentences: AuditSentence[]):
  'zero-sentences' | 'zero-safe' | 'unsafe-first' | 'ok' {
  if (sentences.length === 0) return 'zero-sentences'
  const results = sentences.map((s) => sentenceMatch(s.korean, s.targetForm))
  if (!results.some((r) => r.safeToBlank)) return 'zero-safe'
  if (!results[0].safeToBlank) return 'unsafe-first'
  return 'ok'
}
```
(Source predicate: `lib/sentence-match.ts:28`; mirrors `lib/extract-cards.ts:361-379` enforcement.)

### Romanization leakage (grounded in normalizeFront's own regexes)

```typescript
import { normalizeFront } from './card-key'
const LATIN = /[A-Za-z]/   // same alphabet class normalizeFront uses for gloss detection

export function frontHasRomanization(front: string): boolean {
  return LATIN.test(normalizeFront(front))  // gloss already stripped → surviving Latin is leakage
}
export function sentenceHasRomanization(korean: string): boolean {
  return LATIN.test(korean)                 // no gloss allowance inside sentences
}
```

### Near-duplicate key (lifted from scripts/find-duplicates.mjs:48-62, now testable)

```typescript
/** Strip to a bare Hangul core for fuzzy comparison (lifted from scripts/find-duplicates.mjs). */
export function superNormalize(front: string): string {
  return front
    .normalize('NFC')
    .replace(/~/g, '')          // grammar markers
    .replace(/\([^)]*\)/g, '')  // ALL paren groups, Hangul variants included
    .replace(/\s+/g, ' ')       // collapse whitespace  (leave slashes as-is — meaning-bearing)
    .trim()
    .toLowerCase()
}
```

### normalizedFront inconsistency

```typescript
export function normalizedFrontMismatch(front: string, storedNormalizedFront: string): boolean {
  return normalizeFront(front) !== storedNormalizedFront
}
```

## State of the Art (repo-local)

| Old Approach | Current Approach | When Changed | Impact on audit |
|--------------|------------------|--------------|-----------------|
| Prompt-only blank-safety ("first sentence MUST be blank-safe") | Code-enforced in `normalizeExtractedCards` (safe-first partition; zero-safe cards dropped whole; ≤3 sentences; front/back trimmed) | Phase 20, 2026-07-06 | Stored pre-Phase-20 rows are the expected violation population; the audit measures the legacy debt the new code prevents |
| Bare-JSON-array extraction + regex salvage | Structured outputs (`output_config.format` + `zodOutputFormat`), `{ cards: [...] }` wrapper, depth-2 salvage | Phase 20 | Irrelevant to reading stored rows, but confirms no extraction-side code changes belong in this phase |
| `distractors` unchecked | `< 3` warned at extraction (persisted anyway); UI pads/slices | Phase 20 (IN-01) | Audit quantifies how widespread the legacy shortfall is |
| Unfiltered `components` | `filterComponents` at write time + `retro-filter-cleanup.mts` retroactive pass | Phase 16 | Optional stale-components count only; primary cleanup tool already exists |
| deprecated `clozeSentence/Answer/Translation` | `Sentence` rows | Sentence refactor | Zero-sentence cards may still carry legacy cloze data worth surfacing |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Deck size is ~511 cards (ROADMAP figure; not verified against live DB during research to avoid touching production) | Summary | None — the script reports the real count; only affects expectations |
| A2 | `turso db tokens create --read-only` exists for the belt-and-braces read-only token option | Read-Only Guarantees | None — optional hardening; structural grep verification stands alone |
| A3 | `.planning/audits/card-audit-<date>.md` date format is `YYYY-MM-DD` (criterion says `<date>` without specifying) | Report conventions | Trivial — any ISO date satisfies the criterion |
| A4 | `npx tsx` will fetch tsx on demand (not in node_modules) exactly as it does for the two existing `.mts` scripts | Environment Availability | Low — if offline, `npm i -D tsx` is a one-line fallback |

## Open Questions

1. **Should the report include the optional stale-components count (finding #7)?**
   - What we know: `filterComponents` is in the mandated reuse list, but the six named classes don't include components; `retro-filter-cleanup.mts` already reports this in dry-run mode.
   - What's unclear: whether "reuses `filterComponents`" implies a components check or just permits one.
   - Recommendation: include it as a one-line summary count (satisfies the helper-reuse mandate literally and cheaply) and cross-reference `retro-filter-cleanup.mts` for the detailed view. Planner's call; user prunes optional extras at execution per their profile.
2. **Console output vs file-only?**
   - Recommendation: both — print the summary to stdout (matches script conventions) AND write the full markdown report (satisfies the criterion). No conflict.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | script + tests | ✓ | v25.8.2 | — |
| Vitest | tests | ✓ (node_modules/.bin) | 4.1.9 | — |
| tsx | running `.mts` script | ✗ locally, ✓ via `npx` on demand | — | `npm i -D tsx` if npx fetch fails |
| `.env` / `.env.local` (DATABASE_URL, DATABASE_AUTH_TOKEN) | live-deck read | ✓ (both files exist) | — | — |
| Turso reachability | live-deck read | assumed ✓ (all prior scripts use it) | — | point `DATABASE_URL` at a local `file:` snapshot |
| `.planning/audits/` dir | report write | ✗ (does not exist) | — | script `mkdirSync recursive` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** tsx (npx fetch), audits dir (mkdir in script).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` (node environment, `@` → repo root alias) |
| Quick run command | `npx vitest run tests/audit-checks.test.ts` |
| Full suite command | `npm test` (= `vitest run`; 145 tests green as of Phase 20 close) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-02 | Blank-safety classification (4 outcomes: zero-sentences / zero-safe / unsafe-first / ok) matches `sentenceMatch` semantics | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ Wave 0 |
| AUDIT-02 | Romanization checks: gloss-paren fronts NOT flagged; Latin-in-korean flagged | unit | same | ❌ Wave 0 |
| AUDIT-02 | Distractor anomaly detection: null / malformed JSON / count≠3 / dup / equals-back | unit | same | ❌ Wave 0 |
| AUDIT-02 | `normalizedFront` mismatch recompute | unit | same | ❌ Wave 0 |
| AUDIT-02 | `superNormalize` clustering (parity fixtures with `find-duplicates.mjs` behavior: `~(으)면` vs `(으)면` cluster together) | unit | same | ❌ Wave 0 |
| AUDIT-01 | Script runs end-to-end against live deck, writes dated report, DB untouched | manual + grep | `npx tsx scripts/audit-cards.mts` + grep for write calls (zero hits) | manual (needs Turso creds) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/audit-checks.test.ts`
- **Per wave merge:** `npm test` (full 145+ suite must stay green)
- **Phase gate:** full suite green + one live script run producing the report before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/audit-checks.test.ts` — covers AUDIT-02 (all pure check functions)
- Framework install: none — Vitest already configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local dev-machine script; no auth surface (Turso token from `.env`) |
| V3 Session Management | no | — |
| V4 Access Control | no | Single-tenant, developer-run |
| V5 Input Validation | yes | Treat DB JSON columns as untrusted: every `JSON.parse` in `try/catch`; malformed rows become findings, never crashes (repo convention, `lib/gloss.ts`/`retro-filter-cleanup.mts` precedent) |
| V6 Cryptography | no | — |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secrets leaking into the committed report | Information Disclosure | Report contains only card data + counts; never echo `process.env` / connection strings into the markdown (report is committed to git via `.planning/`) |
| Accidental production write | Tampering | Structural read-only guarantee (no write-capable Prisma calls; grep-verified) + optional read-only token (A2) |
| Malformed stored JSON crashing the run | DoS (self) | try/catch per parse; count + report instead of throw |

## Sources

### Primary (HIGH confidence — direct source reads this session)
- `prisma/schema.prisma` — Card/Sentence/CardDependency field shapes
- `lib/sentence-match.ts` — `sentenceMatch`/`splitParticle`/`blankSentence` signatures + rules
- `lib/card-key.ts` — `normalizeFront` signature + Hangul/ASCII regexes
- `lib/filter-components.ts` — `filterComponents` signature + resolution contract
- `lib/extract-cards.ts` — post-Phase-20 `normalizeExtractedCards`/`parseExtractionResponse`/`ExtractionSchema`; blank-safety + distractor enforcement points
- `scripts/find-duplicates.mjs` — `superNormalize` algorithm + report format (raw `@libsql/client` pattern, NOT the one to copy for lib reuse)
- `scripts/retro-filter-cleanup.mts` — dotenv-first + dynamic-import pattern, dry-run reporting conventions, malformed-JSON precedent
- `scripts/local-resync.mts` — same env/dynamic-import pattern (original source of the gotcha)
- `lib/prisma.ts` — singleton + libSQL adapter env reads
- `vitest.config.ts`, `tests/filter-components.test.ts`, `package.json` — test framework, structure, commands
- `.planning/phases/20-extraction-pipeline-hardening/20-01-SUMMARY.md`, `20-02-SUMMARY.md` — post-Phase-20 code shape confirmation
- `.planning/REQUIREMENTS.md` (AUDIT-01/02 verbatim), `.planning/STATE.md` (v1.5 decisions incl. fix-in-place-by-id rule), `.planning/config.json`
- `components/StudySession.tsx` (grep) — distractor parse/pad/slice behavior

### Secondary / Tertiary
- None needed — no external research performed; phase is fully repo-internal.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything verified installed/in use in this repo
- Architecture: HIGH — direct replication of two existing, working script patterns
- Pitfalls: HIGH — each grounded in an observed code path or documented prior incident (malformed JSON, ESM hoisting)
- Six check definitions: HIGH for blank-safety/zero-sentence/normalizedFront/duplicates (production predicates exist); MEDIUM for romanization/distractor sub-class boundaries (heuristics are grounded but the exact sub-checks to include are planner/user judgment)

**Research date:** 2026-07-06
**Valid until:** ~2026-08-05 (repo-internal facts; invalidated earlier only if Phase 22 lands first and changes helpers — it won't, Phase 21 precedes it)
