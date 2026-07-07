# Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes - Research

**Researched:** 2026-07-07
**Domain:** LLM extraction prompt engineering + in-place SQLite/Turso data correction (dry-run script pattern)
**Confidence:** HIGH

## Summary

This phase has no new-library surface — it is 100% work inside the existing codebase: editing the prompt string in `lib/extract-cards.ts`, adding a word-boundary case to `lib/sentence-match.ts`'s `sentenceMatch()`, writing one new non-persisting script (`scripts/prompt-eval.mts`), and correcting ~17 existing card rows (10 romanization fronts + 3 romanization sentences already counted among those + 1 zero-safe + 1 zero-sentence + 2 duplicate-cluster review-only entries) via `CardEditor` or a small dry-run/`--apply` script. Every fix target's exact current DB row, front text, and source lesson has been located in this session (see tables below) — the planner does not need to re-derive any of it.

The CONTEXT.md (D-01 through D-12) has already made every product decision. What was missing for planning — and is now filled in below — is: (1) the verbatim current prompt text and its section boundaries in `lib/extract-cards.ts`, so plan tasks can reference exact insertion points; (2) the verbatim current `sentenceMatch()` implementation, so the word-boundary addition can be scoped precisely; (3) confirmation that `scripts/prompt-eval.mts` does not yet exist (greenfield script, no prior art to preserve); (4) which real lessons map to which flagged cards, resolving D-11's "identify by finding the lesson(s) that produced the flagged cards' source content" — done via a live DB query in this session; (5) a live-DB collision check confirming all four proposed D-06/D-07/D-08 front rewrites are collision-free against the current 1039-card deck; (6) the existing test file that will need new/updated cases once `sentenceMatch()` changes (`tests/sentence-match.test.ts` and `tests/extract-cards.test.ts`, the latter having an existing test that asserts today's single-char-always-unsafe behavior and will need a companion case, not a rewrite).

**Primary recommendation:** Do the `sentenceMatch()` word-boundary fix first (self-contained, testable in isolation, unblocks the 다/철 no-DB-change-needed outcomes), then the prompt edits (annotated per error class), then a `prompt-eval.mts` run against the 3-lesson targeted sample (orderIndex 4, 12, 17 — every target error class is present in this trio), then the corpus fixes (front rewrites via CardEditor, no scripts needed for the 12 flagged-front/duplicate-review items since it's under 15 records total).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Extraction prompt revision | Backend (server-only lib) | — | `lib/extract-cards.ts` runs only inside `/api/sync` and `local-resync.mts`; never imported client-side (pulls Anthropic SDK) |
| `sentenceMatch()` word-boundary fix | Shared/Isomorphic pure lib | Browser (3 client components), Backend (extract-cards salvage path, audit-checks) | One pure function consumed by both server extraction logic and 3 client components — must stay side-effect-free and correct for both call sites simultaneously |
| `scripts/prompt-eval.mts` | Dev tooling (local script, not deployed) | — | Non-persisting, run manually via `npx tsx`; never called from `/api/sync` or any request path (same posture as `retro-filter-cleanup.mts`) |
| Corpus fixes (front rewrites, sentence regeneration) | Database/Storage (direct Prisma writes) | Browser (CardEditor UI for one-offs) | FIX-02 mandates dry-run scripts OR CardEditor — both write through the same `Card.update` path; CardEditor additionally routes through `PUT /api/cards/[id]` (Backend tier) which already recomputes `normalizedFront` |
| Audit-check reuse (`lib/audit-checks.ts`) | Shared/Isomorphic pure lib | — | No Prisma/fs/Node builtins; called by both the Wave 2 audit script and (per PROMPT-02) the new `prompt-eval.mts` diff step |

## Package Legitimacy Audit

No external packages are added or upgraded in this phase. Every dependency used (`@anthropic-ai/sdk`, `zod`, `dotenv`, `@prisma/client`/`@libsql/client` via `lib/prisma.ts`) is already installed and verified in prior phases (Phase 20/21). `scripts/prompt-eval.mts` will reuse `extractCardsFromNotes` (already imports `@anthropic-ai/sdk`) and `lib/audit-checks.ts` (zero new imports needed).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Current State — Exact Fix Targets (verified live against Turso, 2026-07-07)

### Blank-safety / zero-sentence (D-01–D-05)

| Card | id | Lesson (orderIndex) | Current state | Fix |
|------|----|--------------------|--------------------------------|-----|
| 다 (all, completely) | `cmqlm1w0u014k0gsa6eydclfd` | 9 | 2 existing sentences ("지난 모든 시즌을 다 봤어요.", "밥을 다 먹었어요.") — both have 다 isolated between spaces, occurring once | **No DB change.** Becomes blank-safe automatically once `sentenceMatch()` D-02 lands (verified: 다 sits between a space and either 봤 or 먹 — both non-Hangul... wait, both are Hangul-adjacent on one side. See "Verification note" below — re-confirm with the actual isolated-token predicate chosen.) |
| 철 (iron / 鐵) | `cmqlmqdoa02430gsax79l6oza` | 14 | 0 sentences, `hasLegacyCloze: false` | Write new natural sentences (e.g. 철은/철로 forms per D-04) via CardEditor — accept Exposure/MC-only, no Recall |

**Verification note (important gap in D-03's own text):** D-03 states 다 "sits isolated between spaces with no other occurrence." Re-checked the exact two sentences:
- "지난 모든 시즌을 다 봤어요." — 다 is preceded by a space (모든 시즌을·다) and followed by a space (다·봤어요) — genuinely isolated on both sides.
- "밥을 다 먹었어요." — 다 is preceded by a space (밥을·다) and followed by a space (다·먹었어요) — also isolated on both sides.
Both confirmed space-bounded. **However**, the exact predicate for "isolated" must be defined precisely before implementation: Korean sentences from this corpus use plain ASCII spaces as word separators (confirmed by inspecting these two strings — no non-breaking spaces or other separators found). D-02's rule ("non-Hangul — space/punctuation/string-edge — on both sides") is satisfied by both sentences as literal space characters count as non-Hangul. This one is genuinely a no-DB-change case, contingent only on landing the `sentenceMatch()` fix as specified.

### Romanization — flagged fronts (D-06, D-07/D-08, D-09)

| Front (current) | id | Lesson | Fix per decision | New front (verified collision-free) |
|---|---|---|---|---|
| "소 (작을 소, small)" | `cmqln565802oc0gsat0vy110z` | 17 | D-06 | `소 (작을 소)` |
| "고 (높을 고, high)" | `cmqln56i902of0gsajqgbyk9a` | 17 | D-06 | `고 (높을 고)` |
| "식 (알 식, knowledge)" | `cmqln56tv02oi0gsa7lmwtm4p` | 17 | D-06 | `식 (알 식)` |
| "용 (~용, for use)" | `cmqlngfdh036t0gsaguju6n2h` | 19 | D-06 | `용 (~용)` |
| "료 (~료, fee/fare)" | `cmr42yyvi000gwhsa3uw44l4v` | 25 | D-06 | `료 (~료)` |
| "Action verb ~는 + noun (present modifier)" | `cmqllei7z009i0gsanauns8au` | 4 | D-07 | `동사 ~는` |
| "Action verb ~(으)ㄴ + noun (past modifier)" | `cmqlleits009n0gsaym0ytmh0` | 4 | D-07/D-08 | `동사 ~(으)ㄴ` |
| "Action verb ~(으)ㄹ + noun (future modifier)" | `cmqllejjt009s0gsavynqplsf` | 4 | D-07 | `동사 ~(으)ㄹ` |
| "Descriptive verb ~(으)ㄴ + noun (modifier)" | `cmqllejxv009x0gsa14saekdl` | 4 | D-07/D-08 | `형용사 ~(으)ㄴ` |
| "CRT 렌즈" | `cmqlmj2il01up0gsarwkragfi` | 12 | D-09 — no change | `CRT 렌즈` (unchanged) |

**Collision check performed against the live 1039-card deck (all 9 rewrite targets — CRT excluded, unchanged):** `normalizeFront()` of every proposed new front (소 (작을 소), 고 (높을 고), 식 (알 식), 용 (~용), 료 (~료), 동사 ~는, 동사 ~(으)ㄴ, 동사 ~(으)ㄹ, 형용사 ~(으)ㄴ) was checked via `prisma.card.findUnique({ where: { normalizedFront } })` — **zero collisions found** against any existing card, including against each other. D-08's disambiguation (동사 vs 형용사 prefix) is confirmed necessary and sufficient — without it, the two `~(으)ㄴ` fronts would collide with each other (both would normalize to the literal string `~(으)ㄴ`).

**Why these are safe to normalizeFront correctly:** `normalizeFront()` (lib/card-key.ts) only strips a *trailing* paren group when it contains ASCII but **no Hangul**. `"소 (작을 소)"` — the paren group is `작을 소`, pure Hangul, so the "is this an English gloss?" guard (`!hasHangul && hasAscii`) is false → the paren is preserved, and since no ASCII survives anywhere in the string, `frontHasRomanization()` (LATIN.test on the normalized string) returns `false`. Confirmed by manual trace, not just assertion.

### Romanization — flagged sentences (D-09, loanword exception)

| Card front | id | Lesson | Sentence (flagged idx 0) | Disposition |
|---|---|---|---|---|
| 시작되다 | `cmqlmifek01p60gsa8beoh1vv` | 12 | "주말에 DST가 시작됐어요." | No DB change — DST accepted loanword |
| 싫어하다 | `cmqlmifny01p90gsad93kzt4w` | 12 | "사람들이 DST를 싫어해요."/"네, 엄청 싫어해요." | No DB change — DST accepted loanword |
| CRT 렌즈 | `cmqlmj2il01up0gsarwkragfi` | 12 | "저는 밤에 CRT 렌즈를 껴요." | No DB change — CRT accepted loanword |

All three sentences (and the CRT front) trace to the **same lesson, orderIndex 12** — confirms D-11's guidance that this single lesson is the natural loanword/acronym sample member.

### Near-duplicate clusters (D-10, no action — review-only)

| Cluster key | Members | Lesson(s) |
|---|---|---|
| "보다" | `cmqlkqxht004204l8wrmk6ybr` (보다, lesson 1) / `cmqllyt7101120gsa5s23lf3z` (~보다 (더), lesson 8) | 1, 8 |
| "고" | `cmqllemlx00aj0gsa8upznpxe` (~고 and/listing, lesson 4) / `cmqln56i902of0gsajqgbyk9a` (고 높을 고, lesson 17 — also a D-06 rewrite target) | 4, 17 |

No DB action for either cluster — mark reviewed-not-duplicate in the Phase 22 fix report per D-10. Note the second cluster's 고 (높을 고) member is ALSO a D-06 front-rewrite target — the planner should sequence the rewrite before or independent of the duplicate-review note (they don't conflict; the rewrite doesn't touch `superNormalize`'s output shape enough to merge/split the cluster — `superNormalize` strips ALL paren groups, so both "고 (높을 고, high)" and the rewritten "고 (높을 고)" reduce to the same fuzzy key "고" either way).

## PROMPT-02 Targeted Sample — Resolved (D-11)

Live query of `Lesson.rawContent.length` and existing card counts for the candidate lessons:

| Lesson orderIndex | id (first 8) | Chars | Existing cards | Covers |
|---|---|---|---|---|
| 4 | `cmqlle2u...` | 2274 | 42 | All 4 modifier-pattern grammar cards (D-07/D-08 target) + the "~고" listing-connector duplicate-cluster member |
| 12 | `cmqlmid8...` | 2061 | 72 | CRT/DST loanword front + both DST sentence cards (D-09 target) |
| 17 | `cmqln4ns...` | 1382 | 63 | 3 of 5 Sino-Korean root vocab cards (소/고/식 — D-06 target) |
| 19 | `cmqlng14...` | 1858 | 46 | 1 more root vocab card (용) |
| 25 | `cmr42ys9...` | 803 | 14 | 1 more root vocab card (료) |
| 9 | `cmqlm1ub...` | — | — | 다 card — NOT a prompt-target lesson (D-01/D-02 is a `sentenceMatch()` fix, not a prompt change; excluding from prompt-eval sample is correct) |
| 14 | `cmqlmq56...` | 1280 | 39 | 철 card — same reasoning, exclude from prompt-eval sample |

**Recommended minimal `prompt-eval.mts` sample: lessons 4, 12, 17** — this trio alone exercises all three prompt-targeted error classes (modifier-pattern grammar collision risk, loanword/acronym exception, Sino-Korean root gloss format) with real content, matching D-11's "a handful of lessons, not the full ~1039-card deck." Lessons 19 and 25 are optional additions if the planner wants redundancy on the root-vocab class, but 17 alone already has 3 examples of that pattern.

All 5 candidate lessons are small (803–2274 chars) — well within a single non-batched Claude call's comfortable input size, and each already has 14–72 existing cards in the deck, meaning the `existingNormalizedFronts` dedup-skip list passed to `extractCardsFromNotes` will cause the re-extraction to legitimately skip most/all of those existing fronts (since the deck already contains them) — **the eval script must NOT pass the lesson's own existing fronts as "already in the deck"** or the re-extraction will trivially produce near-zero cards. See "Pitfall 1" below.

## `scripts/prompt-eval.mts` — Does Not Exist Yet

Confirmed via `ls scripts/` — no `prompt-eval.mts`, `prompt-eval.mjs`, or similarly-named script exists. This is a **new script**, not a rename/extension of prior art. The closest prior art is `scripts/reextract-lesson.mjs`, but that script is legacy (pre-Phase-20: uses `claude-sonnet-4-6`, a hand-rolled non-structured-output prompt, and — critically — **persists to the DB**, which is the opposite of what PROMPT-02 requires ("non-persisting")). Do not use it as a template for persistence behavior; only its env-loading and lesson-lookup-by-`orderIndex` pattern are reusable.

### Architecture Patterns

### System Architecture Diagram — prompt-eval.mts data flow

```
scripts/prompt-eval.mts (local, npx tsx, non-persisting)
│
├─ 1. Load env (.env then .env.local override) — BEFORE any lib import
│
├─ 2. Dynamic import: lib/extract-cards.js, lib/audit-checks.js, lib/prisma.js
│
├─ 3. Read target lessons (orderIndex 4, 12, 17) from Turso via prisma.lesson.findMany
│      — read-only, same query shape as scripts/audit-cards.mts
│
├─ 4. For each target lesson:
│      a. Load a BASELINE existingNormalizedFronts set that EXCLUDES this lesson's
│         own cards (see Pitfall 1) — otherwise extraction trivially no-ops
│      b. Call extractCardsFromNotes(lesson.rawContent, baselineFronts, emphasized=[])
│         — a REAL Anthropic API call (claude-opus-4-8), same as production sync
│      c. Run the returned ExtractedCard[] through lib/audit-checks.ts functions
│         (frontHasRomanization, sentenceHasRomanization, classifyBlankSafety)
│         — NOT runAuditChecks (that expects AuditCardInput shaped like DB rows
│         with `id`/`normalizedFront` columns; adapt the extracted cards to a
│         minimal shape or call the individual check functions directly)
│      d. Tally per-lesson: romanization-flagged-front count, romanization-
│         flagged-sentence count, zero-safe count, zero-sentence count
│
├─ 5. Compare against a SAVED BASELINE (JSON file, e.g.
│      .planning/phases/22-.../prompt-eval-baseline.json, committed once
│      BEFORE the prompt edit, then diffed against AFTER re-running the script)
│
└─ 6. Print before/after diff table + PASS/FAIL per D-12's bar
       ("must improve, not necessarily hit zero")
```

**No writes to Prisma anywhere in this script** — `extractCardsFromNotes` itself has no DB calls (confirmed: only imports `sentence-match`, `card-key`, `filter-components`, and the Anthropic SDK — zero Prisma imports). The only Prisma use in `prompt-eval.mts` is the read-only lesson lookup, matching `audit-cards.mts`'s read-only posture.

### Recommended Project Structure (net-new)
```
scripts/
├── prompt-eval.mts                          # new — PROMPT-02, non-persisting eval
.planning/phases/22-.../
├── prompt-eval-baseline.json                # new — saved BEFORE counts (or embed inline in the script as a const, mirroring retro-filter-cleanup.mts's BASELINE object pattern)
```

### Pattern 1: Env-first dynamic-import preamble (established, reuse verbatim)
**What:** `dotenv.config()` for `.env` then `.env.local` with `override: true`, BEFORE any dynamic `import()` of `lib/` modules that read `process.env` at module init.
**When to use:** Every new `.mts` script that touches Prisma or the Anthropic SDK.
**Example:**
```typescript
// Source: scripts/retro-filter-cleanup.mts:27-41 / scripts/audit-cards.mts:30-49
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

const { extractCardsFromNotes } = await import('../lib/extract-cards.js')
const { prisma } = await import('../lib/prisma.js')
```

### Pattern 2: Dry-run-by-default fix script (established, FIX-02 requirement)
**What:** `const APPLY = process.argv.includes('--apply')`; always print the full report; writes only inside `if (APPLY)`, chunked via `$transaction` arrays of ≤50.
**When to use:** Any new script under Phase 22 that mutates `Card` rows (if the planner chooses a script over CardEditor for the front rewrites).
**Example:**
```typescript
// Source: scripts/retro-filter-cleanup.mts:43, 194-249
const APPLY = process.argv.includes('--apply')
// ... build pendingUpdates map ...
if (!APPLY) {
  console.log('DRY RUN — no changes written. Re-run with --apply to persist.')
  process.exit(0)
}
const CHUNK = 50
for (let i = 0; i < updateEntries.length; i += CHUNK) {
  const chunk = updateEntries.slice(i, i + CHUNK)
  await prisma.$transaction(
    chunk.map(([id, value]) => prisma.card.update({ where: { id }, data: { components: value } }))
  )
}
```

### Pattern 3: Front rewrite must update BOTH `front` and `normalizedFront` atomically
**What:** Per CLAUDE.md's explicit rule and confirmed in `app/api/cards/[id]/route.ts:51-54` — whenever `front` changes, `normalizedFront` must be recomputed in the SAME write.
**When to use:** Any of the 9 front rewrites (D-06/D-07/D-08).
**Example (CardEditor path — recommended for these 9, per canonical_refs):**
```typescript
// Source: app/api/cards/[id]/route.ts:51-54 — already does this automatically
// when front is included in the PUT payload. CardEditor's handleSave (line 79-87)
// always sends `front` in the payload, so simply typing the new front string
// into the CardEditor UI and saving is sufficient — no script needed.
...(data.front !== undefined && {
  front:           data.front,
  normalizedFront: normalizeFront(data.front),
}),
```
**Example (script path, if the planner prefers batch-scripting the 9 rewrites instead of 9 manual CardEditor saves):**
```typescript
// Not existing prior art — would be new, following Pattern 2's shape:
const REWRITES: Record<string, string> = {
  cmqln565802oc0gsat0vy110z: '소 (작을 소)',
  cmqln56i902of0gsajqgbyk9a: '고 (높을 고)',
  cmqln56tv02oi0gsa7lmwtm4p: '식 (알 식)',
  cmqlngfdh036t0gsaguju6n2h: '용 (~용)',
  cmr42yyvi000gwhsa3uw44l4v: '료 (~료)',
  cmqllei7z009i0gsanauns8au: '동사 ~는',
  cmqlleits009n0gsaym0ytmh0: '동사 ~(으)ㄴ',
  cmqllejjt009s0gsavynqplsf: '동사 ~(으)ㄹ',
  cmqllejxv009x0gsa14saekdl: '형용사 ~(으)ㄴ',
}
// for each: prisma.card.update({ where: { id }, data: { front: newFront, normalizedFront: normalizeFront(newFront) } })
```
Given only 9 rows, either approach satisfies FIX-01 ("mutating cards in place by id... or CardEditor for one-offs"). A script gives an auditable dry-run diff for all 9 at once; CardEditor is zero-code but requires 9 manual UI saves. **Recommendation: script**, because it can assert the pre-checked collision-free guarantee programmatically at execution time (re-verify no collision exists at write time, not just at research time — the deck could have grown between now and execution) and produces a single, reviewable batch report matching the `retro-filter-cleanup.mts` convention FIX-02 explicitly calls out.

### Anti-Patterns to Avoid
- **Reimplementing blank-safety/romanization checks inside `prompt-eval.mts`:** Must import and reuse `frontHasRomanization`, `sentenceHasRomanization`, `classifyBlankSafety` from `lib/audit-checks.ts` — PROMPT-02's requirement text and the canonical_refs both explicitly call this out. `classifyBlankSafety` expects `AuditSentence[]` (`{ korean, targetForm, orderIndex }`) — extracted cards' sentences need an `orderIndex` synthesized (0, 1, 2...) before passing through, since `ExtractedSentence` doesn't carry one natively.
- **Persisting prompt-eval extraction output:** PROMPT-02 explicitly requires non-persisting. Do not call any `prisma.card.create`/`upsert` in this script.
- **Passing the lesson's own existing cards' fronts as the dedup list unchanged (Pitfall 1 below).**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Romanization detection in prompt-eval | A new Latin-character regex | `frontHasRomanization`/`sentenceHasRomanization` (lib/audit-checks.ts) | PROMPT-02 requires the SAME checks the audit used, not a reimplementation that could silently diverge |
| Blank-safety classification | A new "is this sentence blankable" check | `classifyBlankSafety` (lib/audit-checks.ts), which itself delegates to `sentenceMatch().safeToBlank` | One source of truth from extraction → audit → eval; divergence would make the before/after diff meaningless |
| Env loading for the new script | Custom `readFileSync`+regex `.env` parser (like the legacy `reextract-lesson.mjs` does) | `dotenv.config()` + dynamic import (Pattern 1 above) | The regex-parser approach in `reextract-lesson.mjs` is legacy/pre-Phase-20 and doesn't handle `.env.local` override semantics or quoted values as robustly |
| CardDependency edge maintenance after front rewrites | New edge-reconciliation logic | None needed — front rewrites don't touch `Card.components` or `CardDependency` rows at all; only `front`/`normalizedFront` change. Confirm this explicitly in the plan so no unnecessary edge work is scheduled. |

**Key insight:** Every check this phase needs (romanization, blank-safety) already exists as a pure, tested function in `lib/audit-checks.ts`. The entire PROMPT-02 script is data plumbing (call extraction → reshape sentences → call existing checks → diff two counts) with zero new classification logic to invent.

## Common Pitfalls

### Pitfall 1: Passing the lesson's own current cards as "already in deck" defeats the eval
**What goes wrong:** `extractCardsFromNotes(notes, existingNormalizedFronts, emphasized)`'s prompt explicitly instructs Claude to SKIP any card whose front matches something in `existingNormalizedFronts`. If `prompt-eval.mts` naively passes the full live `existingNormalizedFronts` (which already contains all 42/72/63 of these lessons' own current cards, extracted under the OLD prompt), the re-extraction will legitimately return zero or near-zero cards — because Claude is told to skip everything already in the deck, and everything from this lesson already is.
**Why it happens:** The production `existingNormalizedFronts` list is deck-wide and lesson-agnostic; it wasn't designed to support "extract this lesson as if none of its own cards existed yet."
**How to avoid:** Build the dedup list for each target lesson by excluding that lesson's own card fronts: `deckFronts.filter(f => !thisLessonsFronts.has(f))`, OR pass an empty/minimal dedup list scoped to just cross-lesson component-resolution needs. The simplest correct approach: for the eval script, use the deck-wide existingNormalizedFronts MINUS the specific lesson's own `normalizedFront` values (query `prisma.card.findMany({ where: { lessonId } })` for that lesson, then compute the set difference before calling `extractCardsFromNotes`).
**Warning signs:** If the eval script's "after" tally shows 0 or 1 card extracted per lesson, this is almost certainly the cause, not prompt regression.

### Pitfall 2: `extractCardsFromNotes` calls the REAL Anthropic API — cost and non-determinism
**What goes wrong:** Each `prompt-eval.mts` run against 3 lessons is 3 real `claude-opus-4-8` calls with adaptive thinking (same cost profile as a production sync). Running it repeatedly during iterative prompt tuning adds up, and LLM output is not perfectly deterministic run-to-run (D-12 already accounts for this at the product-decision level — "must improve, not necessarily hit zero" — but the planner should still budget for a small number of eval runs, not dozens).
**Why it happens:** There is no mocked/cheaper extraction path; `extractCardsFromNotes` has no dry-run mode of its own (its "non-persisting" nature refers to DB writes, not to the API call itself).
**How to avoid:** Treat each `prompt-eval.mts` invocation as a real, budgeted action — run once to establish the BEFORE baseline (save it to a file/const), make prompt edits, run once for AFTER, iterate only if the diff doesn't show improvement.
**Warning signs:** Repeated eval runs in a tight edit-test loop will be slow (real API latency per lesson, likely 10-60s each based on the sync route's own comment about 30-90s per lesson at similar model/thinking config) and will burn API budget.

### Pitfall 3: `sentenceMatch()` word-boundary change touches a function with an EXISTING test asserting the old single-char-always-unsafe behavior
**What goes wrong:** `tests/sentence-match.test.ts` line 11-15 currently asserts `sentenceMatch('나는 가', '가').safeToBlank === false` for a single-char target — this specific case (가 preceded by space, followed by string-end) is EXACTLY the "isolated token" case D-02 wants to become `safeToBlank: true`. Landing D-02 without updating this test will break a currently-passing test (not silently — `npm test` will fail it), which is expected and correct, but the planner must schedule updating this assertion, not just adding new ones.
**Why it happens:** The existing test predates the D-01/D-02 decision and encodes the OLD rule as ground truth.
**How to avoid:** Update `tests/sentence-match.test.ts`'s existing "single-char target" test to reflect the new isolated-vs-embedded split (e.g. rename/split into "isolated single-char → safeToBlank true" and "embedded single-char (e.g. inside 왔다) → safeToBlank false"). Also check `tests/extract-cards.test.ts:486` ("drops a card whose only sentence has a single-character targetForm (found-but-unsafe)") — this test's fixture sentence must be re-examined: if its single-char target happens to be isolated under the new rule, the test's premise (that it gets dropped) breaks; if it's embedded, the test still passes unchanged. Read the actual fixture at that line before touching the rule.
**Warning signs:** `npm test` regressions in exactly these two files after landing D-01/D-02 — expected, not a sign of a bug, but must be resolved before the phase is done (lint/tests must stay green per CLAUDE.md).

### Pitfall 4: `filterComponents`'s `splitParticle` reuse — front rewrites must not accidentally change a card's role as a `components[]` resolution target
**What goes wrong:** Cards like 고 (높을 고, high) → 고 (높을 고) or 소 (작을 소, small) → 소 (작을 소) are potential `components[]` entries for OTHER cards (e.g. some future card might list "소" as a prerequisite). `filterComponents` resolves a raw component string to a deck card via `normalizeFront(comp)` direct match OR `splitParticle(comp)` stem match. Since the REWRITE only changes what's inside the trailing paren group (not the leading Hangul character before the space), and `normalizeFront` doesn't strip Hangul-only parens, the `normalizedFront` value changes shape too (e.g. `"소 (작을 소, small)"` → `"소 (작을 소)"`) — a DIFFERENT string than a bare `"소"` component reference would resolve to unless a component-resolution path already handles the paren-suffix. Checked: `filterComponents` resolution requires an EXACT `normalizeFront(comp) === deckSet member` match (or stem match) — a raw component `"소"` would NOT match either the old or new normalizedFront (`"소 (작을 소, small)"` nor `"소 (작을 소)"`) since neither equals bare `"소"`. This is a PRE-EXISTING gap unrelated to the rewrite (Claude would need to reference the component using the exact deck front string, which for a Sino-Korean root already includes the parenthetical) — the rewrite does not make this worse or better. No action needed, but worth the planner confirming this isn't a NEW breakage before/after comparison in `prompt-eval.mts`'s dependency-resolution checks (there are none — PROMPT-02's scope is romanization/blank-safety counts only, not components/dependency resolution).
**Why it happens:** Parenthetical-suffixed fronts are inherently exact-match-only for component resolution; this predates Phase 22.
**How to avoid:** No action required — documented here only so the planner doesn't scope-creep into "fix component resolution for parenthetical fronts," which is out of this phase's bounded scope.

## Code Examples

### Current `sentenceMatch()` (the function D-01/D-02 modifies)
```typescript
// Source: lib/sentence-match.ts:28-50 (verbatim, current state)
export function sentenceMatch(korean: string, targetForm: string): MatchResult {
  if (!targetForm || !korean) {
    return { found: false, index: -1, safeToBlank: false }
  }

  const firstIndex = korean.indexOf(targetForm)
  if (firstIndex === -1) {
    return { found: false, index: -1, safeToBlank: false }
  }

  // Single Korean syllable / character — matches too broadly (particles, inside words).
  if (targetForm.length <= 1) {
    return { found: true, index: firstIndex, safeToBlank: false }
  }

  // Multiple occurrences — can't reliably choose which to blank.
  const secondIndex = korean.indexOf(targetForm, firstIndex + 1)
  if (secondIndex !== -1) {
    return { found: true, index: firstIndex, safeToBlank: false }
  }

  return { found: true, index: firstIndex, safeToBlank: true }
}
```
The D-02 fix must replace the unconditional `targetForm.length <= 1 → safeToBlank: false` branch with a check that ALSO looks at the characters immediately before/after `firstIndex`/`firstIndex + 1` in `korean`, treating space/punctuation/string-edge as "isolated" (safe, pending the existing multi-occurrence check still applying) and any Hangul character as "embedded" (still unsafe). Both `firstIndex` (already computed) and `korean` are already in scope — no new parameters needed on the function signature, keeping all 3 call sites (`HighlightedSentence.tsx`, `StudySession.tsx`, `CardEditor.tsx`) untouched, exactly as D-02 promises.

### Current prompt SENTENCE RULES section (D-06/D-07/D-08/D-09 edit target)
```typescript
// Source: lib/extract-cards.ts:154-157 (the "front" field instruction — D-06/D-07/D-08 target)
- "front": Korean (Hangul). NEVER include romanization (Latin-letter transliteration such as
  "(kkujunhada)"). You MAY include a short ENGLISH clarifying gloss in parentheses where it
  genuinely helps disambiguation — e.g. "~(으)로 (direction particle)" or
  "Action verb ~는 + noun (present modifier)". Hangul-in-parens (e.g. "~(으)면") is fine.
```
This is the exact sentence that must be rewritten per D-07 ("Remove English descriptive labels from grammar-card fronts entirely, present and future") — note it currently uses `"Action verb ~는 + noun (present modifier)"` as its OWN EXAMPLE, meaning the prompt is actively teaching Claude the pattern that produced 4 of the 10 flagged fronts. This example string must be replaced, not just the general instruction.

```typescript
// Source: lib/extract-cards.ts:210-211 (general rules section — also references English-labeled fronts)
- Card "front" is the abstract pattern for grammar (e.g. "~(으)면"), Korean word for vocab,
  full Korean phrase for phrases.
```
This line does NOT currently mention English descriptive labels and is compatible with D-07 as-is — no change needed here, only the "front" field bullet above needs editing.

There is currently **no prompt instruction at all** about Sino-Korean root vocabulary format (D-06) or about loanword/acronym exceptions (D-09) — both are NET-NEW additions to the prompt, not edits to existing text. The planner should add:
- A new bullet or amendment to the "front" field instructions: for Sino-Korean root vocabulary cards, the clarifying gloss in parentheses should stay Hangul-only (root reading, e.g. "작을 소") and never mix in an English word — English meaning belongs in `back` only.
- A new bullet (likely near "NEVER include romanization" in the General rules section, lib/extract-cards.ts:214-215) documenting the loanword/acronym exception: untranslated English acronyms/loanwords in authentic Korean usage (CRT, DST, PC방-style borrowings) are not romanization and may appear inline in both fronts and sentences.

### Current `filterComponents`/`normalizeFront` interaction (context for why D-06 fixes clear the flag)
```typescript
// Source: lib/card-key.ts:25-40 (verbatim)
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
Confirms: only a PURE-ASCII trailing paren gets stripped. A mixed Hangul+ASCII paren (today's "작을 소, small") survives untouched into `normalizedFront`, which is exactly why `frontHasRomanization()` flags it — the "small" residue is never removed. After D-06's rewrite to pure-Hangul paren content, there's no ASCII left anywhere in the string, so the flag clears without needing any change to `normalizeFront` itself.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `scripts/reextract-lesson.mjs` (sonnet-4-6, hand-rolled JSON prompt, persists to DB) | `lib/extract-cards.ts` (opus-4-8, native structured outputs via `zodOutputFormat`, non-persisting when called standalone) | Phase 20 (EXTRACT-01) | The legacy script is now stale prior art — do not use its prompt text or persistence behavior as a template for `prompt-eval.mts`; only its env-loading and by-`orderIndex` lesson lookup are still valid patterns |
| Ad-hoc/no dry-run corpus fix scripts | Dry-run-by-default + `--apply` (`retro-filter-cleanup.mts`) | Established prior to Phase 21, reaffirmed as the STATE.md v1.5 hard rule | Every new fix script in Phase 22 must follow this exactly (FIX-02) |

**Deprecated/outdated:**
- `scripts/reextract-lesson.mjs`'s prompt text: superseded by the Phase 20 exhaustive-extraction prompt; do not copy any of its instructional language into new prompt edits.
- `clozeSentence`/`clozeAnswer`/`clozeTranslation` columns: deprecated, kept only as a `hasLegacyCloze` flag source for the zero-sentence audit finding; confirmed 철's `hasLegacyCloze: false`, so there is no legacy cloze data to recover for that card — sentences must be written fresh.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "동사"/"형용사" are the correct, learner-appropriate Korean grammar terms for "verb"/"descriptive verb (adjective)" respectively, matching D-08's intent | Romanization — flagged fronts table | Low — these are standard, widely-used Korean linguistics terms (동사=verb, 형용사=adjective/descriptive verb) consistent with how Korean grammar is taught; D-08 already named 동사/형용사 explicitly as the example, so this is confirming the user's own stated example, not introducing a new claim |
| A2 | `prompt-eval.mts`'s real-API-call cost/latency (10-90s per lesson) is acceptable for a "handful of runs" iterative workflow | Pitfall 2 | Low-Medium — if the planner budgets many iterative prompt-tuning rounds, this could be slower/costlier than expected; recommend capping to 1 before + 1 after run per prompt revision pass, escalating only if D-12's bar isn't met |

**If this table is empty:** N/A — two low-risk assumptions logged above; both are directly traceable to the user's own decision text (D-08) or standard engineering practice (API cost awareness), not free-floating guesses.

## Open Questions

1. **Exact wording for the new "no English on grammar fronts" and "Sino-Korean root format" and "loanword exception" prompt bullets**
   - What we know: WHAT each bullet must accomplish (D-06/D-07/D-08/D-09), and WHERE in the prompt they should live (the "front" field bullet, lib/extract-cards.ts:154-157, and the General rules section, lines 210-215)
   - What's unclear: The planner/executor has discretion over exact prose (not locked by CONTEXT.md — D-07/D-08/D-09 specify the RULE, not the sentence)
   - Recommendation: Draft the 3 new/edited bullets directly during plan-writing or execution, annotate each with an inline comment referencing which error class it addresses (PROMPT-01's own success criterion), and verify via `prompt-eval.mts` rather than treating prose wording as a locked decision

2. **Whether to script the 9 front rewrites or do them via CardEditor UI**
   - What we know: Both satisfy FIX-01/FIX-02; canonical_refs suggests CardEditor for "the dozen or so one-off legacy-card fixes... rather than writing throwaway one-shot scripts for each"
   - What's unclear: 9 rewrites is borderline between "clearly do it in the UI" and "clearly worth a reusable script"
   - Recommendation: This research recommends a script (see Pattern 3 above) for its live collision re-check + single reviewable batch report; the planner has final discretion per CONTEXT.md's "Claude's Discretion" note ("Whether to phase the sentenceMatch() word-boundary logic as one self-contained diff or split further — left to the planner/executor" — implicitly extends to script-vs-UI choice for these small fixes too, since it's not explicitly locked either way)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ANTHROPIC_API_KEY` | `prompt-eval.mts` real extraction calls | ✓ | — (confirmed present in `.env`) | none — required, no fallback; script must fail fast with a clear message if absent |
| `DATABASE_URL` / `DATABASE_AUTH_TOKEN` | Read-only lesson lookup in `prompt-eval.mts`, live collision checks, corpus fix writes | ✓ | Live Turso (`korean-study`), confirmed 1039 cards readable this session | none needed — already the only supported DB target per CLAUDE.md |
| `npx tsx` | Running any new `.mts` script | ✓ | Used throughout this research session without issue | none needed |

No missing dependencies. This phase requires no new environment setup.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 |
| Config file | none found at repo root (Vitest defaults; `npm test` = `vitest run`) |
| Quick run command | `npx vitest run tests/sentence-match.test.ts tests/extract-cards.test.ts tests/audit-checks.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMPT-01 | Prompt text edits are annotated per error class | manual-only (prose review) — no automated test can assert prompt wording quality; PROMPT-02's eval script is the real verification | n/a | n/a |
| PROMPT-02 | `prompt-eval.mts` diffs audit-check counts before/after on the targeted sample | integration (real API calls, manual trigger — not part of `npm test`) | `npx tsx scripts/prompt-eval.mts` | ❌ Wave 0 — new script |
| FIX-01 | Corpus fixes mutate in place by id, never delete+recreate | unit (existing pattern coverage) + manual DB verification | `npx tsx scripts/<fix-script>.mts` (dry-run) then `--apply`; verify via a follow-up `npx tsx scripts/audit-cards.mts` re-run showing the specific finding cleared | ❌ Wave 0 if scripted; N/A if via CardEditor |
| FIX-02 | Fix scripts default to dry-run, require `--apply` | unit (can assert `process.argv` gating logic in isolation, but the existing `retro-filter-cleanup.mts` has no dedicated test file — the convention is verified by code review + manual dry-run inspection, not vitest) | manual: run without `--apply`, confirm zero writes/"DRY RUN" message; run with `--apply`, confirm writes | ❌ Wave 0 if a new script needs this pattern |
| `sentenceMatch()` word-boundary fix (D-01/D-02, unlisted req but load-bearing) | Isolated 1-char target → safeToBlank true; embedded 1-char target → safeToBlank false | unit | `npx vitest run tests/sentence-match.test.ts` | ✅ exists, needs new + updated cases (Pitfall 3) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/sentence-match.test.ts tests/extract-cards.test.ts` (the two files touched by the `sentenceMatch()` change)
- **Per wave merge:** `npm test` (full suite — catches any unexpected ripple into `tests/audit-checks.test.ts` since it also imports `sentence-match.ts` transitively, and `tests/known-words.test.ts`/`tests/sequence.test.ts` which may indirectly touch particle-splitting via `filterComponents`)
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS a manual `prompt-eval.mts` run showing the before/after diff meets D-12's bar, PLUS a follow-up `audit-cards.mts` re-run confirming the specific corpus-fix findings (romanization fronts, zero-safe, zero-sentence) have cleared for the fixed card ids.

### Wave 0 Gaps
- [ ] `scripts/prompt-eval.mts` — does not exist; must be created (PROMPT-02)
- [ ] `tests/sentence-match.test.ts` — needs an updated assertion for the existing single-char test (line 11-15, currently asserts old behavior) plus new cases for isolated-vs-embedded 1-char targets (D-01/D-02)
- [ ] `tests/extract-cards.test.ts:486` fixture — must be reviewed once `sentenceMatch()` changes; may or may not need updating depending on whether its specific fixture sentence is isolated or embedded (read the fixture before assuming either way)
- [ ] A saved BEFORE baseline for `prompt-eval.mts`'s diff (either a checked-in JSON snapshot or an inline const, mirroring `retro-filter-cleanup.mts`'s `BASELINE` object pattern at lines 49-54) — must be produced by running the eval script against the OLD prompt before any prompt edits land, then reused as the comparison point after

*(No gap in `lib/audit-checks.ts` itself — every check function PROMPT-02 needs already exists and is unit-tested per `tests/audit-checks.test.ts`'s 63 existing test cases.)*

## Security Domain

This phase's security surface is minimal: no new user-facing input paths, no auth changes, no new external packages. All work is either (a) a prompt string sent to an already-authenticated Anthropic API call using an existing SDK integration, (b) a pure-function change to already-audited logic, or (c) direct-by-id DB writes executed locally by the developer (never exposed via any API route).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface touched |
| V3 Session Management | No | No session surface touched |
| V4 Access Control | No | Fix scripts run locally by the developer only, same posture as `retro-filter-cleanup.mts` (never called from any API route or unattended context) |
| V5 Input Validation | Yes (narrow) | The one new script (`prompt-eval.mts`) reads lesson content already trusted (it's the developer's own Google Doc content, already validated at sync time) and a hardcoded set of lesson orderIndex values chosen by the developer — no untrusted external input enters this script. The `PUT /api/cards/[id]` route (used if the planner chooses CardEditor for fixes) already validates `front`/`back`/`type`/`sentences` shapes (confirmed at lines 24-42 of that route) — no new validation gaps introduced by editing 9 cards' front strings through the existing UI. |
| V6 Cryptography | No | No new secrets/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A fix script run with `--apply` against the wrong environment (e.g. accidentally pointed at a different DATABASE_URL) | Tampering | Already mitigated by the existing convention: env is loaded from `.env`/`.env.local` only, no CLI flag to override the target DB, and every script prints its target/mode before writing — the planner should ensure any new fix script follows this same "print before write" convention |
| Prompt injection via lesson content fed into the extraction prompt | Tampering (of LLM output) | Out of scope for this phase — this is a pre-existing characteristic of `extractCardsFromNotes` accepted since Phase 20 (lesson notes are the developer's own trusted tutor content, not third-party/adversarial input); no new mitigation needed or introduced here |

## Sources

### Primary (HIGH confidence — direct code/DB inspection this session)
- `lib/extract-cards.ts` (read in full) — current prompt text, exact line numbers for PROMPT-01 edit targets
- `lib/sentence-match.ts` (read in full) — current `sentenceMatch`/`splitParticle`/`blankSentence` implementation
- `lib/card-key.ts` (read in full) — `normalizeFront` gloss-stripping rule, verified against D-06 rewrite proposals
- `lib/audit-checks.ts` (read in full) — every exported check function PROMPT-02 must reuse
- `lib/filter-components.ts` (read in full) — component-resolution logic referenced in Pitfall 4
- `app/api/cards/[id]/route.ts` (read in full) — confirms `normalizedFront` is auto-recomputed on `front` edit via CardEditor
- `components/CardEditor.tsx` (read in full) — confirms the one-off fix UI path and its existing mismatch-warning UX
- `.planning/audits/card-audit-2026-07-07.md` (read in full) — the complete, dated finding list with every card id
- `scripts/retro-filter-cleanup.mts`, `scripts/audit-cards.mts` (read in full) — the dry-run/env-loading/reporting template conventions
- `scripts/reextract-lesson.mjs` (read in full) — confirmed as legacy/stale prior art, not a template for persistence behavior
- `prisma/schema.prisma` (read in full) — `Card`/`Sentence`/`CardReview`/`ReviewLog`/`CardDependency` shapes, confirming cascade-delete relationships that make "never delete+recreate" load-bearing
- Live Turso DB queries (this session, via `npx tsx` scripts against `.env`/`.env.local`): resolved lessonId/orderIndex for all 17 flagged card ids; confirmed zero normalizedFront collisions for all 9 proposed front rewrites; confirmed lesson content lengths (803-2274 chars) for the PROMPT-02 sample candidates
- `tests/sentence-match.test.ts` (read in full) — identified the existing test that encodes the OLD single-char rule and will need updating
- `tests/extract-cards.test.ts` (grep'd test names) — identified the specific test (line 486) that may be affected by the `sentenceMatch()` change

### Secondary (MEDIUM confidence)
- `.planning/phases/22-findings-driven-prompt-improvement-corpus-fixes/22-CONTEXT.md` — the authoritative locked-decision source (D-01 through D-12); treated as ground truth per this agent's role (not re-litigated)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — requirement text and milestone-level hard rules (mutate-in-place, dry-run convention)

### Tertiary (LOW confidence)
- None — this phase required no external web research; every claim is grounded in direct codebase/DB inspection or the user's own locked CONTEXT.md decisions.

## Metadata

**Confidence breakdown:**
- Fix targets (exact card ids, current state, lesson mapping): HIGH — verified live against the production Turso DB this session, not inferred from the audit report alone
- Prompt edit locations: HIGH — verbatim current prompt text quoted from `lib/extract-cards.ts`
- `sentenceMatch()` fix scope: HIGH — verbatim current implementation quoted; exact behavior change boundary identified
- `prompt-eval.mts` design: MEDIUM — no prior art exists for this exact script; the design here is a reasoned composition of existing patterns (audit-checks reuse, env-loading convention, non-persisting extraction), not a verified-against-existing-code template
- Front-rewrite collision safety: HIGH — verified via live `normalizeFront()` + DB uniqueness check against the full current deck, not just reasoned from the code

**Research date:** 2026-07-07
**Valid until:** Card ids/lesson mappings are point-in-time (valid as of this session's live DB state — if the corpus changes materially before execution, e.g. via another sync, the specific ids/collision-check results should be re-verified, though the fix STRATEGY and prompt edits remain valid regardless). Prompt/code patterns: 30 days (stable internal conventions, no external dependency drift risk).
