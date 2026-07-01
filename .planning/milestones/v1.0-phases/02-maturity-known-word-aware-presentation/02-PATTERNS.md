# Phase 2: Maturity- & Known-Word-Aware Presentation — Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/known-words.ts` | utility (pure lib) | transform | `lib/sequence.ts` + `lib/card-key.ts` | role-match |
| `tests/known-words.test.ts` | test | — | `tests/sequence.test.ts` | exact |
| `app/api/cards/due/route.ts` | API route handler | request-response | self (modify) | — |
| `components/StudySession.tsx` | client component | event-driven | self (modify) | — |

---

## Pattern Assignments

### `lib/known-words.ts` (NEW — pure utility, transform)

**Primary analog:** `lib/sequence.ts` (leading JSDoc contract block, named exports, no `'use client'`, pure)
**Secondary analogs:** `lib/card-key.ts` (`normalizeFront` — must be imported and called), `lib/sentence-match.ts` (`splitParticle` — must be imported and called)

**Module header pattern** — copy from `lib/sequence.ts` lines 1–53 (block comment style):
```typescript
/**
 * Pure helper — single source of truth for counting unknown words in a
 * Korean sentence relative to a known-lemma set.
 *
 * Used by:
 *  - app/api/cards/due/route.ts  (annotate each sentence with unknownCount)
 *
 * Resolution order per whitespace token:
 *  1. normalizeFront(token)  → if in knownLemmas → known
 *  2. splitParticle(token).stem → if in knownLemmas → known
 *  3. Neither matched → unknown (count +1)
 *  Skip tokens that belong to targetForm (the card's own word is not counted).
 *
 * Tokenization is imperfect for Korean; this is a ranking signal only.
 *
 * Pure — no Date.now(), Math.random(), or side effects.
 * Safe to call in server AND client contexts.
 */
```

**Imports pattern** — copy structure from `lib/sentence-match.ts` lines 1–11 (no `'use client'`, named imports from sibling lib files using `@/` alias):
```typescript
import { normalizeFront } from '@/lib/card-key'
import { splitParticle } from '@/lib/sentence-match'
```

**Export pattern** — copy from `lib/card-key.ts` line 25 (named export function, no default):
```typescript
export function countUnknownWords(
  korean: string,
  targetForm: string,
  knownLemmas: Set<string>
): number { ... }
```

**Function signature reuse note:** `normalizeFront(front: string): string` is at `lib/card-key.ts:25`. `splitParticle(targetForm: string): { stem: string; particle: string }` is at `lib/sentence-match.ts:74`. Both are named exports imported with `@/lib/card-key` and `@/lib/sentence-match`.

**Algorithm (from CONTEXT.md §Specific Ideas):**
```typescript
// Tokenize on whitespace; for each token:
//   1. skip if token overlaps targetForm
//   2. resolve via normalizeFront(token)
//   3. fallback to splitParticle(token).stem
//   4. if neither in knownLemmas → count += 1
```

---

### `tests/known-words.test.ts` (NEW — Vitest unit tests)

**Analog:** `tests/sequence.test.ts` — exact match (same runner `npm test` → `vitest run`, same import pattern)

**Import/describe/it structure** — copy from `tests/sequence.test.ts` lines 1–14:
```typescript
import { describe, it, expect } from 'vitest'
import { countUnknownWords } from '@/lib/known-words'
```

**Test factory pattern** — copy style from `tests/sequence.test.ts` lines 4–13 (local helper function, fixed test date/data, no impure calls):
```typescript
// No helper function needed for known-words; use inline string literals.
// All knownLemmas sets constructed inline as new Set([...]).
```

**describe/it block pattern** — copy from `tests/sequence.test.ts` lines 16–65:
```typescript
describe('countUnknownWords', () => {
  it('counts tokens not in knownLemmas', () => { ... })
  it('excludes the targetForm token', () => { ... })
  it('resolves particle stems via splitParticle', () => { ... })
  it('returns 0 when all tokens are known', () => { ... })
  it('handles empty sentence', () => { ... })
})
```

**Required QUAL-02 cases** (from CONTEXT.md): counts unknown tokens, excludes target form, resolves particle stems, respects known set, all-known → 0.

---

### `app/api/cards/due/route.ts` (MODIFY — API route)

**Current file:** `app/api/cards/due/route.ts` (self-reference; 79 lines total)

**Insertion point:** After line 75 (`const ordered = sequenceCards(chosen, edges, now)`) and before line 77 (`return NextResponse.json(ordered)`).

**Existing import block** (lines 1–4) — add `countUnknownWords` import here:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
// ADD: import { countUnknownWords } from '@/lib/known-words'
```

**Existing Prisma query pattern** (lines 42–56) — copy this shape for the known-lemmas query. The new query runs once after line 75:
```typescript
// EXISTING pattern to copy:
const cards = await prisma.card.findMany({
  where: { ... },
  include: { ... },
  orderBy: { review: { nextReview: 'asc' } },
  take: 1000,
})

// NEW query (add after line 75 `const ordered = ...`):
const knownRows = await prisma.card.findMany({
  where: { review: { state: { gte: 2 } } },
  select: { normalizedFront: true },
})
const knownLemmas = new Set(knownRows.map((r) => r.normalizedFront))
```

**Annotation loop** — add after knownLemmas Set construction, before `return NextResponse.json(ordered)`:
```typescript
// Annotate each sentence with unknownCount (pure ranking signal).
for (const card of ordered) {
  for (const s of card.sentences) {
    (s as typeof s & { unknownCount: number }).unknownCount =
      countUnknownWords(s.korean, s.targetForm, knownLemmas)
  }
}
```

**Error handling pattern** — `app/api/cards/due/route.ts` has no explicit try/catch (it's a thin route). The new Prisma query follows the same unguarded pattern; if it throws, Next.js will return a 500 automatically (consistent with the existing file).

---

### `components/StudySession.tsx` (MODIFY — client component, two changes)

**'use client' directive:** line 1 — do not remove or move.

**Client `Sentence` type** (lines 15–20) — add `unknownCount?: number` field:
```typescript
// CURRENT (lines 15-20):
interface Sentence {
  id: string
  korean: string
  targetForm: string
  translation: string
}
// MODIFY to add:
  unknownCount?: number
```

**`Card` type** (lines 22–41) — already has `review?: { state?: number | null, reps?: number | null, ... } | null`. No change needed; `isNewCard` reads `review.state` from here.

**`hashStr` utility** (lines 85–92) — already present; reuse it in the least-unknown tier selection. Do not redefine.

---

#### Change 1: Replace `chosenIdx` rotation (lines 301–319) with least-unknown pick

**Current block** (lines 301–322 — full replacement target):
```typescript
// Rotation base — decorrelated by card id, varies across reviews as reps grows.
const rotationIdx = cardSentences.length > 0
  ? (hashStr(realCard!.id) + (realCard!.review?.reps ?? 0)) % cardSentences.length
  : -1

// When a blank is needed and rotation lands on an unsafe sentence, use the first
// blank-safe sentence instead (the prompt guarantees index 0 is blank-safe).
// Exposure always uses rotationIdx for contextual variety across sessions.
const chosenIdx = (() => {
  if (rotationIdx < 0) return -1
  if (!needsBlank) return rotationIdx
  if (sentenceMatch(cardSentences[rotationIdx].korean, cardSentences[rotationIdx].targetForm).safeToBlank) {
    return rotationIdx
  }
  const safeIdx = cardSentences.findIndex(
    (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
  )
  return safeIdx >= 0 ? safeIdx : rotationIdx  // preserve graceful degrade if none safe
})()

// chosenSentence = selected for this review; used for fill-blank answer / Recall front
const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null
```

**Replacement pattern** (pure, no `Date.now()`/`Math.random()`, reuses `hashStr` already in scope):
```typescript
// Least-unknown sentence selection — replaces bare rotation.
// Step 1: find the minimum unknownCount tier among all sentences.
// Step 2: collect candidate indices at that tier.
// Step 3: pick within the tier by the existing hashStr rotation (variety once words are known).
// Step 4: when a blank is needed, override with the first blank-safe index.
const chosenIdx = (() => {
  if (cardSentences.length === 0) return -1
  const reps = realCard!.review?.reps ?? 0

  // Least-unknown tier pick (Exposure and non-blank modes).
  const minUnknown = Math.min(...cardSentences.map((s) => s.unknownCount ?? Infinity))
  const candidates = cardSentences
    .map((_, i) => i)
    .filter((i) => (cardSentences[i].unknownCount ?? Infinity) === minUnknown)
  const tierIdx = candidates[(hashStr(realCard!.id) + reps) % candidates.length]

  if (!needsBlank) return tierIdx

  // Blank-safe override: if the tier pick is unsafe, find first safe sentence.
  if (sentenceMatch(cardSentences[tierIdx].korean, cardSentences[tierIdx].targetForm).safeToBlank) {
    return tierIdx
  }
  const safeIdx = cardSentences.findIndex(
    (s) => sentenceMatch(s.korean, s.targetForm).safeToBlank
  )
  return safeIdx >= 0 ? safeIdx : tierIdx  // graceful degrade: no safe sentence
})()

const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null
```

**Purity note:** `Math.min(...array)` is a pure function call — allowed in render. No `Date.now()` or `Math.random()`. `hashStr` is already defined at lines 85–92 as a pure function. This block is inside the render path but is entirely pure.

---

#### Change 2: Add `showBareFront` gate at front-face condition (line 546)

**`isNewCard` / `showBareFront` derivation** — add near line 290 (inside the `// ── Sentence logic ───` block, after `const cardSentences = ...`):
```typescript
// Bare-word-first gate: new/learning cards (state 0 or 1) show bare word on front.
// State 2 (Review) and state 3 (Relearning) keep sentence-on-front.
// Pure — reads stored review.state; no Date.now().
const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1
const showBareFront =
  mode === 'flashcard' &&
  flashcardSubMode === 'exposure' &&
  isNewCard &&
  cardSentences.length > 0
```

**Current front-face condition** (line 546 — replacement target):
```typescript
{chosenSentence ? (
  flashcardSubMode === 'recall' && recallBlanked ? (
    // ... Recall blanked branch
  ) : (
    // ... Exposure sentence branch (lines 555–572)
  )
) : (
  // ... bare-word block (lines 573–582)
)}
```

**Existing bare-word block** (lines 573–582 — reuse unchanged, just re-route to it):
```typescript
<div className="flex items-center justify-center gap-2">
  <p className="hangul text-5xl font-bold text-gray-800 dark:text-gray-100 text-center">{currentCard.front}</p>
  <AudioButton
    text={currentCard.front}
    aria-label={`Play: ${currentCard.front}`}
    size="sm"
  />
</div>
```

**New front-face condition** — replace line 546's `{chosenSentence ? (` with:
```typescript
{showBareFront ? (
  // New card: show bare word on front (sentence stays on back).
  // The existing bare-word block is reused here verbatim; add hint text below it.
  <>
    <div className="flex items-center justify-center gap-2">
      <p className="hangul text-5xl font-bold text-gray-800 dark:text-gray-100 text-center">{currentCard.front}</p>
      <AudioButton text={currentCard.front} aria-label={`Play: ${currentCard.front}`} size="sm" />
    </div>
    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Recall the meaning</p>
  </>
) : chosenSentence ? (
  // Matured card or Recall mode: existing sentence-on-front logic unchanged.
  flashcardSubMode === 'recall' && recallBlanked ? (
    // ... existing Recall branch (lines 548–553) — unchanged
  ) : (
    // ... existing Exposure sentence branch (lines 554–572) — unchanged
  )
) : (
  // No sentences at all: existing bare-word block (lines 573–582) — unchanged
)}
```

**Hint text style pattern** — copy from line 552 (existing Recall hint):
```typescript
<p className="text-xs text-gray-500 dark:text-gray-400 text-center">Recall the missing word</p>
// Use same class, different text: "Recall the meaning"
```

---

## Shared Patterns

### Pure module header (apply to `lib/known-words.ts`)
**Source:** `lib/sequence.ts` lines 1–27 and `lib/card-key.ts` lines 1–24
Leading `/** ... */` block comment listing: purpose, callers, rules, purity guarantee ("Pure — no Date.now(), Math.random(), or side effects. Safe to call in server AND client contexts.").

### Named exports only (apply to `lib/known-words.ts`)
**Source:** `lib/card-key.ts` line 25, `lib/sequence.ts` lines 90 and 155
No default export. All public API via `export function`.

### `@/` path alias for intra-project imports (apply everywhere)
**Source:** `tests/sequence.test.ts` line 2, `components/StudySession.tsx` line 9
```typescript
import { ... } from '@/lib/known-words'   // not '../lib/known-words'
```

### react-hooks/purity (apply to `components/StudySession.tsx` changes)
**Source:** `components/StudySession.tsx` lines 63–92 (`seededShuffle`, `hashStr` docs)
All new render-path code must be pure: no `Date.now()`, no `Math.random()`. `Math.min`, `Array.filter`, `Array.map` are pure. `hashStr` (already in scope) provides deterministic variety.

---

## No Analog Found

None — all four files have close analogs in the codebase.

---

## Metadata

**Analog search scope:** `lib/`, `tests/`, `app/api/cards/due/`, `components/`
**Files scanned:** 6 (sequence.ts, card-key.ts, sentence-match.ts, sequence.test.ts, cards/due/route.ts, StudySession.tsx)
**Pattern extraction date:** 2026-06-26
