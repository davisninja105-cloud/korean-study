# Architecture Research

**Domain:** Card-quality audit + extraction-prompt review architecture for v1.5 "Extraction Quality & Reliability" (existing Next.js 16 / Prisma 7 + libSQL Korean-study app, ~511-card deck)
**Researched:** 2026-07-05
**Confidence:** HIGH (codebase-grounded; every integration point verified against the actual files: `scripts/retro-filter-cleanup.mts`, `scripts/find-duplicates.mjs`, `scripts/dry-run-filter.mjs`, `scripts/local-resync.mts`, `scripts/reextract-lesson.mjs`, `lib/extract-cards.ts`, `lib/filter-components.ts`, `lib/card-key.ts`, `lib/sentence-match.ts`, `lib/link-dependencies.ts`, `prisma/schema.prisma`)

This file supersedes the 2026-07-02 ARCHITECTURE.md (v1.4 milestone — cron sync, ReviewLog, components filter; all shipped). It is scoped to the v1.5 audit-first pipeline: **DB audit → prompt review → validated fixes**.

---

## Standard Architecture

### System Overview — the three-stage pipeline

```
STAGE 1 — DB AUDIT (read-only, deterministic, no LLM calls)
┌──────────────────────────────────────────────────────────────────────────┐
│  scripts/audit-cards.mts  (NEW — thin driver, tsx, dotenv-first preamble)│
│      │ one bulk load: prisma.card.findMany({ include: sentences,        │
│      │ lesson: {orderIndex} }) + prisma.cardDependency.findMany()       │
│      ▼                                                                   │
│  lib/audit-checks.ts  (NEW — pure check registry, no Prisma, unit-      │
│      │ testable; imports the SAME production helpers the write path     │
│      │ uses: sentenceMatch/splitParticle (lib/sentence-match.ts),       │
│      │ normalizeFront (lib/card-key.ts), filterComponents               │
│      │ (lib/filter-components.ts))                                      │
│      ▼                                                                   │
│  Finding[] → console summary (always)                                   │
│            → .planning/audits/card-audit-<date>.md (report artifact)    │
│            → --json flag for machine-diffable baseline                  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │  report = the input artifact
                                    ▼
STAGE 2 — PROMPT REVIEW (human + Claude, informed by Stage 1 examples)
┌──────────────────────────────────────────────────────────────────────────┐
│  lib/extract-cards.ts  (MODIFIED — prompt text only; parser +           │
│      │ parseExtractionResponse() untouched unless a check demands it)   │
│      ▼                                                                   │
│  scripts/prompt-eval.mts  (NEW — non-persisting sample harness)         │
│      reads N Lesson.rawContent rows from DB → extractCardsFromNotes()   │
│      → runs the SAME lib/audit-checks.ts on the in-memory               │
│      ExtractedCard[] → per-check counts, diffed old-prompt vs new       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │  only after prompt validated
                                    ▼
STAGE 3 — TARGETED FIXES (dry-run-by-default, --apply gated)
┌──────────────────────────────────────────────────────────────────────────┐
│  scripts/fix-*.mts  (NEW, one per mechanically-fixable finding class,   │
│      │ cloned from the retro-filter-cleanup.mts skeleton: dry-run       │
│      │ default, --apply flag, idempotent, chunked $transaction writes)  │
│      OR manual edits via the existing CardEditor for small counts       │
│      ▼                                                                   │
│  re-run scripts/audit-cards.mts → finding counts drop to zero/accepted  │
└──────────────────────────────────────────────────────────────────────────┘
```

The load-bearing architectural decision is the **shared check module**: audit checks live in a pure `lib/audit-checks.ts` that operates on a minimal card shape both `Card`-rows-from-DB and fresh `ExtractedCard[]` satisfy. That single decision makes Stage 1 (audit persisted data) and Stage 2 (validate a prompt change) the *same code path*, so "did the prompt change fix the failure class?" is answerable by diffing check counts — no eyeballing.

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `lib/audit-checks.ts` | **NEW** | Pure check registry: `runAuditChecks(cards: AuditableCard[], ctx): Finding[]`. No Prisma, no side effects — mirrors the `lib/sequence.ts` / `lib/sentence-selection.ts` convention (pure logic in `lib/`, driver elsewhere). |
| `scripts/audit-cards.mts` | **NEW** | Thin driver: env preamble → bulk Prisma load → map rows to `AuditableCard` → run checks → print console summary → write markdown report. Read-only; no `--apply` flag needed at all. |
| `scripts/prompt-eval.mts` | **NEW** | Prompt-change validation harness: selects sample lessons, calls `extractCardsFromNotes()` (real Opus call), runs the same checks on the un-persisted output, prints/diffs counts. Never writes to `Card`. |
| `scripts/fix-<class>.mts` | **NEW** (as needed, per finding class) | Deterministic corpus repair following the `retro-filter-cleanup.mts` contract: dry-run default, `--apply`, idempotent, chunked writes, developer-run only. |
| `tests/audit-checks.test.ts` | **NEW** | Vitest unit tests for each check (pure functions — no DB needed, same as `tests/sequence.test.ts`). |
| `lib/extract-cards.ts` | **MODIFIED** (prompt only) | The exhaustive-extraction prompt (`claude-opus-4-8`, `thinking: {type:'adaptive'}`, `.stream(...).finalMessage()`). Stage 2 edits the prompt template string; the salvage parser, `isValidExtractedCard`, CR-01 batch-fronts union, and `filterComponents` wiring stay as-is. |
| `lib/filter-components.ts`, `lib/card-key.ts`, `lib/sentence-match.ts`, `lib/link-dependencies.ts` | **UNCHANGED — reused** | The audit imports these directly so audit semantics can never drift from production semantics. |
| `scripts/find-duplicates.mjs` | **UNCHANGED** | Its `superNormalize()` fuzzy-key logic is *absorbed* into `lib/audit-checks.ts` as the near-dup cluster check; the standalone script keeps working but becomes redundant. Do not modify it — do copy its level-2 key rules. |
| `scripts/retro-filter-cleanup.mts` | **UNCHANGED — pattern template** | The canonical dry-run/--apply/idempotent skeleton (env preamble lines 27–41, reporting-always structure, chunked `$transaction` writes). Every Stage 3 fix script clones this shape. |
| `scripts/local-resync.mts` | **UNCHANGED** | Explicitly **not** the validation vehicle (see Anti-Pattern 3). Stays as the bulk-ingest tool for genuinely new lessons. |
| `scripts/reextract-lesson.mjs` | **FLAG FOR RETIREMENT** | Stale drift hazard: still uses `claude-sonnet-4-6`, the pre-v1.0 "be selective" prompt, the old `lastIndexOf('},')` salvage, and raw SQL inserts that omit `normalizedFront` and `components` entirely. Running it today would create cards invisible to dedup and the knowledge graph. The audit milestone should delete it or stamp a do-not-use header. |

---

## Recommended Project Structure

```
lib/
├── audit-checks.ts          # NEW — pure: AuditableCard, Finding, CHECKS registry, runAuditChecks()
├── extract-cards.ts         # MODIFIED — prompt template only
├── filter-components.ts     # unchanged (imported by audit-checks)
├── card-key.ts              # unchanged (imported by audit-checks)
├── sentence-match.ts        # unchanged (imported by audit-checks)
scripts/
├── audit-cards.mts          # NEW — read-only driver (tsx)
├── prompt-eval.mts          # NEW — non-persisting extraction eval (tsx)
├── fix-card-types.mts       # NEW (example) — dry-run-default fix script, only if audit justifies it
├── retro-filter-cleanup.mts # unchanged — the skeleton fix scripts clone
├── find-duplicates.mjs      # unchanged — logic absorbed, script kept
tests/
├── audit-checks.test.ts     # NEW — pure unit tests, `npm test`
.planning/audits/
├── card-audit-2026-07-XX.md # generated report artifact (input to prompt review)
├── prompt-eval-baseline.json# generated — old-prompt check counts for diffing
```

### Structure Rationale

- **Checks in `lib/`, driver in `scripts/`:** the project already learned this lesson twice — `lesson-excerpt.ts` was extracted from a route "for unit testability" (Phase 14 Nyquist fix), and `sentence-selection.ts` from `StudySession` (REFACTOR-02). Pure check functions get Vitest coverage for free (`npm test` runs pure lib functions, no DB).
- **`.mts` + dotenv-first dynamic-import preamble, not `.mjs`:** `dry-run-filter.mjs` had to *re-derive* `normalizeFront()` because plain `.mjs` can't import the TS modules — and its WR-04 comment records that the replica **actually diverged** (missing Hangul Jamo ranges) before being caught. `retro-filter-cleanup.mts` fixed this pattern: `config()` from dotenv first, then `await import('../lib/*.js')`. The audit script must do the same; a checker that re-implements the rules it checks is a false-negative machine.
- **Report artifact under `.planning/audits/`:** `.planning/` is already the artifacts home, already excluded from Tailwind's source scan (`@source not "../.planning"` in `globals.css`, Phase 14), and already what the roadmap/plan phases read. A dated filename gives before/after audit runs a natural diff trail.

---

## Architectural Patterns

### Pattern 1: Pure check registry over a shared card shape

**What:** A minimal structural interface both persisted rows and fresh extractions satisfy, plus a flat list of check functions.

**Why:** the same checks score the DB (Stage 1) and the prompt (Stage 2). This is what makes "validate a prompt change without re-running the corpus" cheap.

```typescript
// lib/audit-checks.ts — pure; no Prisma, no 'use client'
import { sentenceMatch, splitParticle } from './sentence-match'
import { normalizeFront } from './card-key'

export interface AuditableSentence { korean: string; targetForm: string; translation: string; orderIndex: number }
export interface AuditableCard {
  id: string                    // Card.id, or `batch-${i}` for un-persisted ExtractedCards
  type: string
  front: string
  back: string
  notes: string | null
  distractors: string[]         // pre-parsed from JSON by the driver
  components: string[]          // pre-parsed; [] when null
  componentsMalformed: boolean  // JSON.parse failed (driver sets; mirrors retro-filter-cleanup WR-03)
  sentences: AuditableSentence[]
  lessonOrderIndex: number | null  // provenance for the report; null for un-persisted
  createdAt: string | null         // ISO; used to segment pre/post-prompt-era rows
}

export type Severity = 'critical' | 'warn' | 'info'
export interface Finding {
  checkId: string; severity: Severity
  cardId: string; front: string; lessonOrderIndex: number | null
  detail: string
}

export interface AuditContext {
  deckNormalizedFronts: Set<string>          // for component resolution checks
  edges: { cardId: string; prerequisiteId: string }[]  // for graph checks; [] in prompt-eval mode
}

type Check = (card: AuditableCard, ctx: AuditContext) => Finding[]
const CHECKS: Record<string, Check> = { /* see check catalog below */ }

export function runAuditChecks(cards: AuditableCard[], ctx: AuditContext): Finding[] {
  return cards.flatMap((c) => Object.values(CHECKS).flatMap((check) => check(c, ctx)))
}
// plus corpus-level checks that need the whole set (dup clusters, dependency cycles):
export function runCorpusChecks(cards: AuditableCard[], ctx: AuditContext): Finding[] { /* ... */ }
```

**Check catalog** (all deterministic; each maps to a concrete prompt clause or data-fix path):

| checkId | Severity | Rule (uses production helper) | Why it matters / prompt clause it tests |
|---|---|---|---|
| `SENT-NONE` | critical | `sentences.length === 0` | Card unusable in sentence-centric modes |
| `SENT-TARGET-MISSING` | critical | `!sentenceMatch(s.korean, s.targetForm).found` | Extraction filters these at write time, so any hit is a legacy/edited row — un-highlightable, wrong fill-blank answer |
| `SENT-FIRST-NOT-BLANK-SAFE` | critical | `!sentenceMatch(sentences[0].korean, sentences[0].targetForm).safeToBlank` | The prompt's BLANK-SAFETY GUARANTEE; violations silently disable Recall + fill-blank |
| `SENT-EMPTY-TRANSLATION` | warn | `s.translation.trim() === ''` | Prompt requires non-empty translation |
| `SENT-DUP-TARGETFORM` (grammar) | warn | grammar card where 2+ sentences share a `targetForm` | Prompt requires different targetForms per grammar sentence |
| `DIST-COUNT` | warn | `distractors.length !== 3` | Multiple-choice degrades |
| `DIST-COLLIDES-BACK` | warn | any distractor `===` back (case-folded) | Trivial/broken multiple-choice |
| `TYPE-GRAMMAR-SHAPED` | warn | `type !== 'grammar'` but front matches `/^~|\(으\)|아\/어|은\/는|\/를|~\s*$/`-style pattern markers | Miscategorization heuristic — badge color, distractor register, particle-tint rendering all key off type |
| `TYPE-PHRASE-SHAPED` | info | `type === 'vocabulary'` and front has 2+ space-separated Hangul words | Likely phrase mislabeled vocabulary |
| `FRONT-ROMANIZATION` | critical | Latin letters in front *outside* a trailing paren gloss (reuse `normalizeFront`'s own gloss regex to except the allowed case) | Standing "no romanization" invariant |
| `NOTES-THIN-GRAMMAR` | info | `type === 'grammar'` and (`notes` null or `< ~20` chars) | Grammar cards carry conjugation/usage load in notes; thin notes = weak card. Info-only — notes are optional by schema |
| `COMP-UNRESOLVED` | warn | any component where `filterComponents([comp], deckSet).length === 0` | Should be **zero** post-v1.4 retro cleanup; any hit means drift since the cleanup (e.g. a prerequisite card was deleted) |
| `COMP-STEM-ONLY-RESOLVED` | info | component resolves only via the `splitParticle` fallback, not direct match | Higher false-positive class (the documented 기다리는-style mis-split ambiguity) — human-review list, not auto-fix |
| `COMP-SELF` | warn | `normalizeFront(comp) === normalizeFront(front)` | Should be impossible (write path self-excludes); a hit = legacy row |
| `COMP-MALFORMED-JSON` | warn | `componentsMalformed` | Mirrors retro-filter-cleanup's WR-03 skip set |
| `DUP-CLUSTER` (corpus-level) | warn | groups sharing `superNormalize` level-2 key (copied verbatim from `find-duplicates.mjs`: strip `~`, strip all paren groups, collapse whitespace) | Near-duplicate concepts split across cards fragment FSRS history |
| `EDGE-CYCLE` (corpus-level) | info | DFS cycle detection over `ctx.edges` | `sequenceCards()` is cycle-safe so nothing breaks, but a cycle is always bad data worth listing |
| `EDGE-NO-SOURCE` (corpus-level) | warn | a `CardDependency` edge whose prerequisite's `normalizedFront` no longer appears in the card's `components[]` | Edge/components drift since last reconcile |

**Trade-off:** heuristic checks (`TYPE-*`, `NOTES-THIN-*`, `DUP-CLUSTER`) will have false positives. That is fine **because the audit only reports** — severity `warn`/`info` findings are human-review queues, never auto-fix inputs (see Anti-Pattern 5).

### Pattern 2: Report artifact as the prompt-review handoff (findings-first)

**What:** `scripts/audit-cards.mts` always prints a console summary table (counts per checkId) and writes a full markdown report to `.planning/audits/card-audit-<YYYY-MM-DD>.md` with, per check: count, severity, and up to ~15 concrete examples (card front, back, lesson `orderIndex`, offending detail). An optional `--json <path>` emits machine-readable counts for later diffing.

**Where findings surface — decision:** console + markdown file. **Not** an admin view.

| Option | Verdict | Why |
|---|---|---|
| Console only | Insufficient alone | The milestone's next phase (prompt review) needs to *read* concrete failure examples; scrollback is not an artifact. Precedent: every existing script reports to console, but none of their output feeds a downstream phase. |
| **Console + markdown report (chosen)** | ✅ | The report *is* the deliverable of the audit phase and the input to the prompt-review phase — same role RESEARCH/dry-run baselines played in Phase 16 (`retro-filter-cleanup.mts` hard-codes the human-approved 16-01 dry-run numbers as its `BASELINE`). Dated files give a before/after trail once fixes land. |
| Lightweight admin view | ❌ Defer | No admin UI exists; single-tenant; the audit is developer-run and episodic. Building a route + RSC + client shell for a one-time report is scope creep — and would push audit logic into request paths where the 60s Vercel Hobby limit lives. If a recurring need appears later, the JSON output is the seam a future `/audit` page would read. |

**Report section anatomy** (one per check):

```markdown
## SENT-FIRST-NOT-BLANK-SAFE — 14 cards (critical)
First sentence's targetForm is 1 char or appears more than once → Recall/fill-blank silently degrade.
| Lesson | Front | targetForm | Sentence |
|---|---|---|---|
| 7 | ~에 | 에 | 학교에 가요 |
...
**Era split:** 11/14 created before 2026-06-XX (pre-exhaustive-prompt); 3/14 current-prompt era.
```

The **era split line is load-bearing**: `Card.createdAt` segments failures into "old rows from an earlier prompt" (→ data fix, no prompt change needed) vs "the current prompt still produces this" (→ prompt clause needs work). Without it, the prompt review will chase already-fixed ghosts — the deck contains rows from at least three prompt generations (the `reextract-lesson.mjs` "be selective" era, the pre-v1.4 unfiltered-components era, and the current exhaustive+filtered era).

### Pattern 3: Non-persisting prompt-eval harness (validate without corpus re-run)

**What:** `scripts/prompt-eval.mts` — the Stage 2 validation loop:

1. Select sample lessons by `orderIndex` (CLI args, e.g. `npx tsx scripts/prompt-eval.mts 3 7 12 18 24`), stratified as: lessons that produced current-era findings + 1–2 clean lessons as regression guards. Read `Lesson.rawContent` straight from the DB — no Google Docs fetch needed.
2. Call the real `extractCardsFromNotes(rawContent, existingNormalizedFronts, [])` — the actual production function, actual `claude-opus-4-8` + adaptive thinking + streaming path, actual deck-fronts dedup hint.
3. Map the returned `ExtractedCard[]` to `AuditableCard[]` (`componentsMalformed: false`, `lessonOrderIndex` from the arg, `createdAt: null`) and run `runAuditChecks()` with `edges: []`.
4. Print per-check counts; with `--baseline <path>` compare against a saved JSON from the pre-change run and print deltas.

**Workflow:** run once on the old prompt → save baseline JSON → edit the prompt in `lib/extract-cards.ts` → run again on the *same lessons* → counts must drop for the targeted checks and not rise elsewhere. Two runs × ~5 lessons ≈ 10 Opus extraction calls — dollars, not tens of dollars, vs. an unbounded full-corpus resync.

**Why not `local-resync.mts` on a sample:** it can't. `local-resync.mts` filters to lessons whose `contentHash` has no `Lesson` row (lines 39–51) — every already-synced lesson is a **no-op**. "Re-run local-resync to validate" would require wiping lessons first (`wipe-card-data.mjs` nukes the whole deck including `CardReview` state) — the nuclear option. The eval harness exists precisely to avoid that.

**Nondeterminism caveat:** LLM output varies run-to-run, so treat count deltas directionally, not as exact assertions. For a targeted check (e.g. blank-safety) expect a clear signal (e.g. 6 → 0/1), not noise-level movement. If a delta is ambiguous, re-run the same lessons once more before concluding.

### Pattern 4: Fix scripts clone the `retro-filter-cleanup.mts` contract exactly

For any finding class that is mechanically fixable *and* large enough to script (likely candidate: `TYPE-*` recategorization after human review of the flagged list), the fix script copies the established contract verbatim:

- Header comment: DRY-RUN BY DEFAULT / mutates only with `--apply` / never in a request path / idempotent (re-run after `--apply` reports 0 changes).
- Same env preamble (dotenv `config()` → dynamic `await import('../lib/*.js')`).
- Reporting section runs in **both** modes; `if (!APPLY) process.exit(0)` before any write.
- Writes are chunked `prisma.$transaction` **updates by `id`** (CHUNK = 50, same as retro-filter-cleanup lines 202–212).
- Input is an explicit **human-approved allowlist** (e.g. a reviewed JSON/CSV of `cardId → newType` exported from the audit report), not the raw heuristic — the heuristic proposes, the human disposes, the script applies.

For small counts (< ~20 cards), skip the script: the existing `CardEditor` sheet + `PUT /api/cards/[id]` (which already re-computes `normalizedFront` on front edits) is the safer path.

---

## Data Flow

### Stage 1 — audit run

```
npx tsx scripts/audit-cards.mts [--json out.json]
    ↓
dotenv preamble → dynamic import lib modules (Prisma sees Turso env)
    ↓
prisma.card.findMany({ include: { sentences: {orderBy: orderIndex},
                                  lesson: {select: {orderIndex}} } })   // ~511 rows, one query
prisma.cardDependency.findMany({ select: {cardId, prerequisiteId} })
    ↓
rows → AuditableCard[] (JSON.parse distractors/components in try/catch → componentsMalformed)
deckSet = Set(normalizedFront)   // same construction as retro-filter-cleanup Phase A
    ↓
runAuditChecks() + runCorpusChecks()
    ↓
console: counts table   +   .planning/audits/card-audit-<date>.md   +   optional JSON
```

Read-only end to end — there is deliberately **no** `--apply` mode on the audit script; repair is a separate script per class (single-responsibility, mirrors the v1.4 split of `dry-run-filter.mjs` (diagnose) from `retro-filter-cleanup.mts` (repair)).

### Stage 2 — prompt review loop

```
card-audit report (era-split, current-prompt failures only)
    ↓ concrete failure examples per prompt clause
edit lib/extract-cards.ts prompt template
    ↓
npx tsx scripts/prompt-eval.mts 3 7 12 --baseline .planning/audits/prompt-eval-baseline.json
    ↓ per-check deltas on identical lessons
accept (commit prompt change)  /  iterate
```

### Stage 3 — corpus repair

```
audit report warn/info queues → human review → approved fix list
    ↓
npx tsx scripts/fix-<class>.mts            # dry run, prints would-change set
npx tsx scripts/fix-<class>.mts --apply    # chunked updates by id
    ↓
npx tsx scripts/audit-cards.mts            # finding count for that class → 0 (or accepted residue)
```

---

## Scaling Considerations

| Scale | Notes |
|-------|-------|
| ~511 cards / ~1.5k sentences (today) | One `findMany` with includes, everything in memory. Whole audit is O(cards × checks) + O(cards) dup-grouping + O(V+E) cycle DFS — sub-second after the network round-trip. |
| ~5k cards | Still fine in one load. Sentence include is the only payload that grows meaningfully; select only `{korean, targetForm, translation, orderIndex}`. |
| Beyond | Irrelevant for a single-tenant personal deck. If it ever mattered: paginate by `createdAt` cursor, stream findings to the report file incrementally. Do not build for this now. |

None of this touches Vercel — audit, eval, and fix scripts are all local (`npx tsx`), so the 60s Hobby function limit never applies. That constraint only binds if someone tries to move the audit into an API route (don't — see Integration Points).

---

## Anti-Patterns

### Anti-Pattern 1: Re-deriving lib helpers inside a `.mjs` script

**What people do:** copy `normalizeFront`/`sentenceMatch` into the script "because .mjs can't import TS."
**Why it's wrong:** this codebase has a documented divergence scar — `dry-run-filter.mjs` WR-04 records that its `normalizeFront` replica missed three Hangul Jamo ranges and disagreed with production. `reextract-lesson.mjs` replicates `sentenceMatch` too, and is now stale in four other ways. An audit built on drifted replicas reports wrong findings with full confidence.
**Do this instead:** `.mts` + the `retro-filter-cleanup.mts` preamble (dotenv `config()` first, then `await import('../lib/sentence-match.js')` etc.). One source of truth for every rule being audited.

### Anti-Pattern 2: LLM-judge per card for the audit

**What people do:** loop 511 cards through Claude asking "is this card good?"
**Why it's wrong:** ~511 Opus calls per audit run (cost + minutes of wall time), nondeterministic verdicts (an audit you can't re-run to the same result can't gate a fix), and it answers a vaguer question than the deterministic checks already answer precisely. The question directive for this milestone explicitly requires cheap/deterministic.
**Do this instead:** deterministic checks for everything mechanically checkable (all 18 in the catalog are). Reserve LLM spend for Stage 2's eval harness — ~10 extraction calls on a handful of lessons, where the LLM *is* the system under test.

### Anti-Pattern 3: Using `local-resync.mts` as the prompt-validation loop

**What people do:** "change the prompt, re-run local-resync on a few lessons, diff the cards."
**Why it's wrong:** two independent failures. (a) `local-resync.mts` skips every lesson whose `contentHash` already has a `Lesson` row — for synced lessons it is a guaranteed no-op; nothing gets re-extracted. (b) Even if forced (deleting Lesson rows), the card upsert path *persists* the new output over live data mid-experiment — the experiment mutates production.
**Do this instead:** `scripts/prompt-eval.mts` — reads `Lesson.rawContent`, extracts in memory, audits the output, writes nothing (Pattern 3).

### Anti-Pattern 4: Delete + recreate cards to "fix" them

**What people do:** for a miscategorized/duplicate card, delete it and let a re-extraction recreate it.
**Why it's wrong:** `Sentence`, `CardReview`, **and `ReviewLog`** are all `onDelete: Cascade` off `Card` (schema lines 65, 76, 104). Delete destroys the FSRS state and the append-only review history v1.4 just made durable. The recreated card starts from state 0.
**Do this instead:** fix scripts issue `prisma.card.update({ where: { id } })` only. For true near-duplicates where one card must die, merging is a *manual, per-card* decision (the `find-duplicates.mjs` footer already says exactly this) — and if the surviving card should absorb history, that's out of scope for scripted fixes.

### Anti-Pattern 5: Auto-applying heuristic findings

**What people do:** pipe `TYPE-GRAMMAR-SHAPED` findings straight into an `--apply` update.
**Why it's wrong:** the type heuristics are regex shape-guesses; Korean fronts like set phrases containing particles will false-positive. The v1.4 precedent is instructive: the components filter was only wired into the write path *after* a human reviewed the dry-run drop rates per type (the Success Criterion 4 gate in `dry-run-filter.mjs`'s header).
**Do this instead:** heuristic checks emit `warn`/`info` review queues in the report; a human approves a concrete list; the fix script's input is that approved list, not the heuristic.

### Anti-Pattern 6: Building an admin audit UI in this milestone

**What people do:** "surface findings in the app" → new route, RSC page, client shell, DTOs.
**Why it's wrong:** the audit is developer-run, episodic, and its consumer is the prompt-review phase, not the app user. Every prior surface in this app earned its RSC+DTO plumbing by being part of the daily study loop; a report viewer is not. It also drags corpus-scan work toward request paths governed by the 60s limit.
**Do this instead:** markdown report artifact + optional JSON. The JSON output is the future seam if a UI is ever actually wanted.

---

## Integration Points

### External Services

| Service | Used by | Notes |
|---------|---------|-------|
| Turso (libSQL) via `lib/prisma.ts` | audit, eval, fix scripts | Same env preamble as `retro-filter-cleanup.mts` — dotenv before dynamic import, or Prisma initializes against the wrong `DATABASE_URL` (documented ESM-hoisting gotcha). |
| Claude API (`claude-opus-4-8`, adaptive thinking, streaming) | `prompt-eval.mts` only, via the unmodified `extractCardsFromNotes()` | Stage 1 and Stage 3 make **zero** LLM calls. Keep model/params untouched during prompt review — one variable at a time; the milestone is about prompt content, not model choice. |
| Google Docs API | **not used** by any v1.5 script | Eval reads `Lesson.rawContent` from the DB; no doc fetch, no `GOOGLE_SERVICE_ACCOUNT_KEY` needed for the audit path. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `scripts/audit-cards.mts` ↔ `lib/audit-checks.ts` | direct import (dynamic, post-dotenv) | Driver owns all I/O (Prisma, fs, console); checks own all judgment. Same split as `local-resync.mts` ↔ `lib/link-dependencies.ts` (IN-02). |
| `scripts/prompt-eval.mts` ↔ `lib/extract-cards.ts` | calls `extractCardsFromNotes()` verbatim | Must be the real function — evaluating a copy of the prompt evaluates nothing. `existingNormalizedFronts` should be the real deck fronts so the dedup-hint behavior is realistic. |
| `lib/audit-checks.ts` ↔ `lib/sentence-match.ts` / `card-key.ts` / `filter-components.ts` | static imports (all pure) | Legal because every import is itself pure/no-Prisma — `audit-checks.ts` stays a "safe server AND client" module by the project's own convention, though nothing client-side needs it today. |
| Audit report ↔ prompt review phase | file artifact `.planning/audits/card-audit-<date>.md` | The findings-first contract from the milestone definition; the prompt-review plan should cite specific checkIds + example cards from this file. |
| Fix scripts ↔ `CardDependency` | reuse `resolveDependencyEdges()` from `lib/link-dependencies.ts` if any fix touches `components` | Never hand-roll edge reconciliation — `retro-filter-cleanup.mts` Phase C is the reference implementation (including the WR-03 malformed-row skip set). |

---

## Suggested Build Order

Matches the milestone's already-decided sequencing (audit → prompt review → fixes):

1. **`lib/audit-checks.ts` + `tests/audit-checks.test.ts`** — pure module first; each check unit-tested with hand-built `AuditableCard` fixtures (including a known-bad legacy shape per check). No DB required to develop.
2. **`scripts/audit-cards.mts`** — driver; run against production (read-only, so safe immediately); produce `card-audit-<date>.md` with the era-split lines. Retire/flag `scripts/reextract-lesson.mjs` in the same commit.
3. **Prompt review of `lib/extract-cards.ts`** — driven by the report's *current-era* findings only; each prompt edit annotated with the checkId it targets.
4. **`scripts/prompt-eval.mts`** — capture old-prompt baseline JSON *before* committing prompt changes if feasible (or from git stash/checkout of the old prompt), then validate: targeted check counts drop on identical sample lessons, no regressions elsewhere.
5. **Stage 3 fixes** — per approved class: `scripts/fix-<class>.mts` (retro-filter-cleanup clone, dry-run default) for scriptable volume, `CardEditor` for handfuls. Re-run the audit; the new report is the milestone's closing evidence.

Step 4's harness is deliberately built *after* step 3 starts, not before — the audit report tells you which lessons to sample; building the harness first would be guessing at the sample set.

---

## Sources

- `scripts/retro-filter-cleanup.mts` — dry-run/--apply contract, env preamble, chunked writes, WR-03 malformed-JSON skip set, baseline-comparison reporting (HIGH — read in full)
- `scripts/find-duplicates.mjs` — `superNormalize` level-2 fuzzy key, standalone report format (HIGH)
- `scripts/dry-run-filter.mjs` — WR-04 helper-replica drift scar; diagnose-vs-repair script split precedent (HIGH)
- `scripts/local-resync.mts` — contentHash skip behavior (why it can't validate prompt changes); upsert semantics (HIGH)
- `scripts/reextract-lesson.mjs` — stale prompt/model/schema drift hazard (HIGH)
- `lib/extract-cards.ts` — current prompt clauses each check maps to; salvage parser; CR-01 batch-fronts union; `filterComponents` wiring (HIGH)
- `lib/filter-components.ts`, `lib/card-key.ts`, `lib/sentence-match.ts` (`sentenceMatch`/`splitParticle`/`MatchResult`), `lib/link-dependencies.ts` (`resolveDependencyEdges`) — the production helpers the audit must import, not replicate (HIGH)
- `prisma/schema.prisma` — cascade topology (`Sentence`/`CardReview`/`ReviewLog` all cascade off `Card`), `normalizedFront @unique`, `ReviewLog` append-only note (HIGH)
- `.planning/PROJECT.md` — v1.5 goal ("findings-first"), v1.4 outcomes (511-card retro clean, Phase 16 filter), key decisions log (HIGH)

---
*Architecture research for: v1.5 Extraction Quality & Reliability — card-DB audit + prompt-review pipeline*
*Researched: 2026-07-05*
