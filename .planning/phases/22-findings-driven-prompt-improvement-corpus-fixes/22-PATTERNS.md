# Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 6 (2 modified pure-lib, 1 modified prompt lib, 1 new script, 2 modified test files; corpus-fix script is optional/discretionary)
**Analogs found:** 6 / 6 (RESEARCH.md already located verbatim excerpts for every file — this map consolidates them into planner-ready assignments)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/sentence-match.ts` (`sentenceMatch()` edit) | utility (pure fn) | transform | itself (prior version) — no external analog needed, change is additive to existing predicate | exact (self-modification) |
| `lib/extract-cards.ts` (prompt string edit) | service (LLM prompt builder) | request-response | itself (prior version) — edits are text-only within the existing prompt template | exact (self-modification) |
| `scripts/prompt-eval.mts` (new) | utility / dev-tooling script | batch (read lessons → real API call → diff counts, non-persisting) | `scripts/audit-cards.mts` (read-only report shape) + `scripts/retro-filter-cleanup.mts` (env/dry-run conventions) | role-match (composite of two analogs) |
| `scripts/fix-corpus-2026-07.mts` (new, optional — discretionary per Open Question 2) | utility / dev-tooling script | batch (dry-run/--apply DB writes) | `scripts/retro-filter-cleanup.mts` | exact |
| `tests/sentence-match.test.ts` (modified) | test | transform | itself (existing suite, update assertions) | exact |
| `tests/extract-cards.test.ts` (modified, conditional) | test | transform | itself (existing suite, review fixture at line 486) | exact |

Note: `components/CardEditor.tsx` is a **consumption path**, not a file to create/modify — it already supports the 9 front-rewrite fixes as-is (no code change needed) per RESEARCH.md's confirmation that `PUT /api/cards/[id]` auto-recomputes `normalizedFront`.

## Pattern Assignments

### `lib/sentence-match.ts` (utility, transform)

**Analog:** itself — verbatim current implementation (RESEARCH.md, lines 268-291)

**Current pattern to modify:**
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

**Required change (D-01/D-02):** Replace the unconditional `targetForm.length <= 1 → safeToBlank: false` branch with an "isolated token" check: look at the characters immediately before `firstIndex` and after `firstIndex + targetForm.length` in `korean`; treat string-edge, whitespace, or punctuation (non-Hangul) on **both** sides as isolated → fall through to the existing multi-occurrence check → `safeToBlank: true`; any Hangul-adjacent side → still `safeToBlank: false`. No new params — `firstIndex` and `korean` are already in scope, so all 3 call sites (`components/HighlightedSentence.tsx`, `components/StudySession.tsx`, `components/CardEditor.tsx`) need zero changes.

**Existing 2+ char logic is unchanged** — this is strictly additive to the `length <= 1` branch.

---

### `lib/extract-cards.ts` (service, request-response — LLM prompt builder)

**Analog:** itself — verbatim current prompt sections (RESEARCH.md, lines 296-313)

**Edit target 1 — "front" field bullet** (lines 154-157, must be rewritten, not just amended — its own example string is what produced 4 of the 10 flagged fronts):
```typescript
// Source: lib/extract-cards.ts:154-157 (current — contains the offending example)
- "front": Korean (Hangul). NEVER include romanization (Latin-letter transliteration such as
  "(kkujunhada)"). You MAY include a short ENGLISH clarifying gloss in parentheses where it
  genuinely helps disambiguation — e.g. "~(으)로 (direction particle)" or
  "Action verb ~는 + noun (present modifier)". Hangul-in-parens (e.g. "~(으)면") is fine.
```
Per D-06/D-07/D-08, rewrite to: (a) drop the "Action verb ~는 + noun (present modifier)" example entirely — grammar fronts must never carry English descriptive labels, ever; (b) add Sino-Korean root vocabulary guidance — clarifying gloss stays Hangul-only (e.g. "작을 소"), never mixed with English; (c) add the 동사/형용사 Hangul-tag disambiguation convention for grammar points that would otherwise collide on the same bare marker.

**Edit target 2 — General rules section, no change needed** (lines 210-211, confirmed compatible as-is):
```typescript
// Source: lib/extract-cards.ts:210-211 (verbatim — leave untouched)
- Card "front" is the abstract pattern for grammar (e.g. "~(으)면"), Korean word for vocab,
  full Korean phrase for phrases.
```

**Net-new bullet needed (D-09, loanword exception)** — add near the "NEVER include romanization" line (lib/extract-cards.ts:214-215 area): document that untranslated English acronyms/loanwords used in authentic Korean speech (CRT, DST, PC방-style borrowings) are not romanization and may appear inline in both `front` and sentence text.

**Annotation requirement (PROMPT-01):** each edited/added bullet must carry an inline comment naming the error class it addresses (e.g. `// D-07: no English descriptive labels on grammar fronts`), per the phase's own success criterion.

---

### `scripts/prompt-eval.mts` (new — utility/dev-tooling, batch)

**Analogs:** `scripts/audit-cards.mts` (read-only lesson/report shape) + `scripts/retro-filter-cleanup.mts` (env preamble + dry-run reporting habit, even though this script never writes)

**Env-loading preamble** (copy verbatim pattern):
```typescript
// Source: scripts/audit-cards.mts:30-49 / scripts/retro-filter-cleanup.mts:27-41
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

// Dynamic import AFTER env is loaded — static imports are hoisted in ESM and
// would see stale env (breaks Prisma's DATABASE_URL resolution).
const { extractCardsFromNotes } = await import('../lib/extract-cards.js')
const { frontHasRomanization, sentenceHasRomanization, classifyBlankSafety } =
  await import('../lib/audit-checks.js')
const { prisma } = await import('../lib/prisma.js')
```

**Core pattern — targeted-lesson read, real extraction call, reuse existing checks:**
```typescript
// Composite pattern: read-only lesson lookup (audit-cards.mts style) +
// existingNormalizedFronts exclusion (Pitfall 1) + audit-checks reuse
const TARGET_ORDER_INDEXES = [4, 12, 17]

const lessons = await prisma.lesson.findMany({
  where: { orderIndex: { in: TARGET_ORDER_INDEXES } },
})

const allDeckFronts = new Set(
  (await prisma.card.findMany({ select: { normalizedFront: true } })).map(c => c.normalizedFront)
)

for (const lesson of lessons) {
  const ownCardFronts = new Set(
    (await prisma.card.findMany({
      where: { lessonId: lesson.id },
      select: { normalizedFront: true },
    })).map(c => c.normalizedFront)
  )
  // Pitfall 1: exclude this lesson's own cards from the dedup list, or
  // extraction trivially skips everything and returns ~0 cards.
  const baselineFronts = [...allDeckFronts].filter(f => !ownCardFronts.has(f))

  const { cards } = await extractCardsFromNotes(lesson.rawContent, baselineFronts, [])

  // Reuse lib/audit-checks.ts functions directly — do NOT reimplement.
  // classifyBlankSafety expects AuditSentence[] ({ korean, targetForm, orderIndex });
  // ExtractedSentence lacks orderIndex — synthesize it (0, 1, 2...) before passing through.
  for (const card of cards) {
    const frontFlag = frontHasRomanization(card.front)
    const sentenceFlags = card.sentences.map(s => sentenceHasRomanization(s.korean))
    const safety = classifyBlankSafety(
      card.sentences.map((s, i) => ({ korean: s.korean, targetForm: s.targetForm, orderIndex: i }))
    )
    // tally frontFlag / sentenceFlags / safety === 'zero-sentences' | 'zero-safe' per lesson
  }
}
```

**No-writes guarantee:** never call `prisma.card.create`/`upsert` anywhere in this script — `extractCardsFromNotes` itself makes zero Prisma calls (confirmed in RESEARCH.md), so the only Prisma use here is the read-only lesson/card lookups above.

**Baseline diff + PASS/FAIL reporting** (mirror `retro-filter-cleanup.mts`'s always-print-report habit, D-12's bar is "must improve, not necessarily hit zero"):
```typescript
// Save BEFORE run's tally to a committed JSON/const once, before any prompt edit lands;
// re-run AFTER the prompt edit and diff against the saved baseline.
// Source pattern: scripts/retro-filter-cleanup.mts's BASELINE object convention (lines 49-54)
console.log(APPLY ? 'n/a — this script never writes' : 'READ-ONLY EVAL — no DB writes performed')
```

---

### `scripts/fix-corpus-2026-07.mts` (new, optional — discretionary, dry-run/--apply script)

**Analog:** `scripts/retro-filter-cleanup.mts` (established FIX-02 template)

**Dry-run-by-default pattern:**
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

**Front-rewrite atomicity pattern (D-06/D-07/D-08's 9 cards) — must update `front` + `normalizedFront` together:**
```typescript
// Not existing prior art for this exact shape — follows Pattern 2's structure.
// front + normalizedFront must be written in the SAME update call — never one without the other
// (CLAUDE.md hard rule, confirmed at app/api/cards/[id]/route.ts:51-54).
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
// Re-verify collision-free at WRITE time (not just research time — deck may have grown):
for (const [id, newFront] of Object.entries(REWRITES)) {
  const nf = normalizeFront(newFront)
  const collision = await prisma.card.findFirst({ where: { normalizedFront: nf, id: { not: id } } })
  if (collision) throw new Error(`Collision: ${newFront} → ${nf} already used by ${collision.id}`)
}
// for each: prisma.card.update({ where: { id }, data: { front: newFront, normalizedFront: nf } })
```

**Card 철 (id `cmqlmqdoa02430gsax79l6oza`)** needs brand-new `Sentence` rows written (not a front rewrite) — use natural 철은/철이/철로 forms per D-04; this card intentionally stays Recall/fill-blank-ineligible (accept Exposure/MC-only per decision).

**Card 다 (id `cmqlm1w0u014k0gsa6eydclfd`)** needs **no DB change at all** — becomes blank-safe automatically once the `sentenceMatch()` fix lands (both existing sentences already have 다 isolated between spaces).

**Near-duplicate clusters (D-10)** — no DB action; only a note in the phase's fix report marking both clusters reviewed-not-duplicate (no code pattern needed, this is documentation only).

**Alternative (if planner chooses CardEditor UI instead of a script for the 9 rewrites):** no new code at all — `components/CardEditor.tsx`'s existing `handleSave` already sends `front` in its `PUT /api/cards/[id]` payload, and that route already recomputes `normalizedFront`:
```typescript
// Source: app/api/cards/[id]/route.ts:51-54 — already does this automatically
...(data.front !== undefined && {
  front:           data.front,
  normalizedFront: normalizeFront(data.front),
}),
```

---

### `tests/sentence-match.test.ts` (test, transform)

**Analog:** itself — existing suite, specific assertion to update

**Required change (Pitfall 3):** lines 11-15 currently assert `sentenceMatch('나는 가', '가').safeToBlank === false` for a single-char, space-isolated target — this is EXACTLY the case D-02 flips to `true`. Update this assertion and add a companion case for the still-unsafe embedded scenario:
```typescript
// Pattern: split the existing single-char test into two cases
// 1. Isolated single-char → safeToBlank: true (was false — now the D-02 fix target)
expect(sentenceMatch('나는 가', '가').safeToBlank).toBe(true)
// 2. Embedded single-char (inside a longer word, e.g. 왔다 contains 다) → still safeToBlank: false
expect(sentenceMatch('학교에 왔다', '다').safeToBlank).toBe(false)
```

---

### `tests/extract-cards.test.ts` (test, transform — conditional)

**Analog:** itself — existing test at line 486

**Required action:** read the fixture sentence at line 486 ("drops a card whose only sentence has a single-character targetForm (found-but-unsafe)") before touching anything. If that fixture's single-char target is isolated (space/edge-bounded) under the new rule, the test's premise breaks and must be updated to an embedded fixture instead; if it's already embedded, no change needed. This must be verified, not assumed, per RESEARCH.md's explicit warning.

---

## Shared Patterns

### Env-first dynamic-import preamble (applies to `scripts/prompt-eval.mts` and any corpus-fix script)
**Source:** `scripts/retro-filter-cleanup.mts:27-41`, `scripts/audit-cards.mts:30-49`
**Apply to:** Every new `.mts` script that touches Prisma or the Anthropic SDK.
```typescript
import { config } from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dir = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.resolve(__dir, '..', '.env') })
config({ path: path.resolve(__dir, '..', '.env.local'), override: true })

const { extractCardsFromNotes } = await import('../lib/extract-cards.js')
const { prisma } = await import('../lib/prisma.js')
```
**Why:** Static imports are hoisted in ESM and read `process.env` before `dotenv.config()` runs, causing Prisma to silently connect to the wrong (or empty local fallback) DB.

### Dry-run-by-default fix script (FIX-02 hard rule)
**Source:** `scripts/retro-filter-cleanup.mts:43, 194-249`
**Apply to:** Any script that mutates `Card` rows this phase.
```typescript
const APPLY = process.argv.includes('--apply')
if (!APPLY) {
  console.log('DRY RUN — no changes written. Re-run with --apply to persist.')
  process.exit(0)
}
const CHUNK = 50
for (let i = 0; i < updateEntries.length; i += CHUNK) {
  const chunk = updateEntries.slice(i, i + CHUNK)
  await prisma.$transaction(chunk.map(([id, value]) => prisma.card.update({ where: { id }, data: value })))
}
```

### Front + normalizedFront atomic write (CLAUDE.md hard rule)
**Source:** `app/api/cards/[id]/route.ts:51-54`, `lib/card-key.ts:25-40` (`normalizeFront`)
**Apply to:** Every one of the 9 front rewrites (D-06/D-07/D-08), whether done via script or `CardEditor`.
```typescript
...(data.front !== undefined && {
  front:           data.front,
  normalizedFront: normalizeFront(data.front),
}),
```
**Why:** `normalizeFront()` only strips a *trailing* paren group when it contains ASCII but no Hangul — a Hangul-only paren (post-rewrite) survives, so the two fields must be recomputed together or the DB unique index and the romanization flag fall out of sync.

### Reuse existing audit-check functions — never reimplement
**Source:** `lib/audit-checks.ts` exports: `frontHasRomanization`, `sentenceHasRomanization`, `classifyBlankSafety`, `clusterNearDuplicates`, `runAuditChecks`, plus supporting types (`AuditSentence`, `AuditCardInput`, `BlankSafetyClass`, etc.)
**Apply to:** `scripts/prompt-eval.mts` exclusively — PROMPT-02 explicitly requires reusing these same functions so the before/after diff stays meaningful (a reimplementation could silently diverge from what the audit measured).
```typescript
const { frontHasRomanization, sentenceHasRomanization, classifyBlankSafety } =
  await import('../lib/audit-checks.js')
```
Note: `classifyBlankSafety` expects `AuditSentence[]` (`{ korean, targetForm, orderIndex }`); `ExtractedCard`'s sentences lack `orderIndex` natively — synthesize `0, 1, 2...` before passing through. Use the individual functions directly, not `runAuditChecks` (which expects full `AuditCardInput` DB-row shape with `id`/`normalizedFront`).

## No Analog Found

None — every file in this phase's scope either modifies an existing file (self-analog) or has a clear composite analog from `scripts/audit-cards.mts` + `scripts/retro-filter-cleanup.mts`.

## Metadata

**Analog search scope:** `lib/`, `scripts/`, `tests/`, `components/CardEditor.tsx`, `app/api/cards/[id]/route.ts` — all already directly identified and read verbatim by RESEARCH.md this session; no additional Glob/Grep search was needed since RESEARCH.md's own investigation already located and quoted every relevant excerpt with exact line numbers.
**Files scanned:** 0 new (reused RESEARCH.md's exhaustive prior reads) + 2 confirmatory reads this pass (`scripts/audit-cards.mts` header/preamble, `lib/audit-checks.ts` export list)
**Pattern extraction date:** 2026-07-07
