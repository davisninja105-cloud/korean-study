# Phase 15: StudySession Refactor & Sentence-Selection Memoization - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 6 (3 new lib/test, 3 new components, 1 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/sentence-selection.ts` | utility (pure module) | transform | `lib/sentence-match.ts` (and `lib/sequence.ts` for header-doc/JSDoc style) | exact |
| `tests/sentence-selection.test.ts` | test | transform | `tests/sequence.test.ts` | exact |
| `components/FlashcardMode.tsx` | component | request-response (UI event → callback) | `components/ModeSelector.tsx` (props/client shape); StudySession.tsx lines ~980-1061 (action-bar/grade content) | role-match |
| `components/MultipleChoiceMode.tsx` | component | request-response | same as above | role-match |
| `components/FillBlankMode.tsx` | component | request-response | same as above | role-match |
| `components/StudySession.tsx` (MODIFIED) | component (parent/orchestrator) | request-response + event-driven (FSRS submit/undo) | itself (pre-refactor) — preserve Phase 13 pipeline verbatim | n/a — modify in place |

## Pattern Assignments

### `lib/sentence-selection.ts` (utility, transform)

**Analog:** `lib/sentence-match.ts` (header/export style) + `lib/sequence.ts` (JSDoc contract-block convention) + logic source `components/StudySession.tsx` lines 83-94 (`hashStr`) and 399-420 (`chosenIdx` IIFE, already fully captured in RESEARCH.md "Code Examples").

**Header/JSDoc pattern** (mirror `lib/sentence-match.ts` lines 1-11):
```typescript
/**
 * Pure helper — single source of truth for locating a targetForm substring
 * inside a Korean sentence.
 *
 * Used by:
 *  - components/HighlightedSentence.tsx   (render highlighting)
 *  - components/StudySession.tsx          (fill-blank blanking + Recall front)
 *  - components/CardEditor.tsx            (live preview + mismatch warning)
 *
 * No hooks, no side-effects — safe to call anywhere, including render.
 */
```
Apply the same shape to `lib/sentence-selection.ts`: state the algorithm, list every call site (`components/StudySession.tsx` sentence-selection `useMemo`, `components/StudySession.tsx` `mcOptions` for `hashStr` only), and end with a "Pure — no Date.now()/Math.random(); safe in render or useMemo" guarantee line, matching `lib/sequence.ts`'s closing purity sentence (line 26/52 of that file: "Pure — `now` is a parameter so the function has no impure side-effects...").

**Interface + named export style** (mirror `lib/sentence-match.ts` lines 13-28 `MatchResult`):
```typescript
export interface SelectableSentence {
  korean: string
  targetForm: string
  unknownCount?: number
}

export function hashStr(s: string): number {
  // body unchanged from StudySession.tsx lines 87-94 (FNV-1a)
}

export function selectSentence(
  sentences: SelectableSentence[],
  cardId: string,
  reps: number,
  needsBlank: boolean
): number {
  // body = generalized chosenIdx IIFE (RESEARCH.md lines 202-223), using
  // sentenceMatch from lib/sentence-match.ts — do not reimplement blank-safety.
}
```

**Import pattern** — this module imports `sentenceMatch` from a sibling `lib/` file exactly like `lib/known-words.ts` does:
```typescript
// Source: lib/known-words.ts lines 20-21
import { normalizeFront } from './card-key'
import { splitParticle } from './sentence-match'
```
`lib/sentence-selection.ts` should use the same relative-import convention: `import { sentenceMatch } from './sentence-match'`.

**No React import, no `'use client'`** — confirmed absent in all three analogs (`lib/sequence.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`).

**Single-source-of-truth enforcement (Pitfall 2 from RESEARCH.md):** after extraction, `StudySession.tsx`'s `mcOptions` (currently calling a local `hashStr` at line 310) MUST import `hashStr` from `lib/sentence-selection.ts` instead of keeping a local copy — delete the local `hashStr` function (lines 83-94) entirely once both call sites are updated.

---

### `tests/sentence-selection.test.ts` (test, transform)

**Analog:** `tests/sequence.test.ts`

**Import + fixture-helper pattern** (lines 1-14):
```typescript
import { describe, it, expect } from 'vitest'
import { sequenceCards, selectSessionCards, SeqCard, SeqEdge } from '../lib/sequence'

function card(id: string, daysOverdue = 0): SeqCard {
  const now = new Date('2026-06-23T12:00:00Z')
  const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
  // Mirror the real Prisma shape ...
  return { id, review: { nextReview } }
}

const NOW = new Date('2026-06-23T12:00:00Z')
```
For the new test file: `import { selectSentence, hashStr } from '../lib/sentence-selection'`, and write a small `sentence(korean, targetForm, unknownCount?)` fixture helper analogous to `card(...)` above.

**`describe`/`it` nesting pattern** (lines 16-24):
```typescript
describe('sequenceCards', () => {
  it('returns empty array for empty input', () => {
    expect(sequenceCards([], [], NOW)).toEqual([])
  })

  it('returns single card unchanged', () => {
    const c = card('a')
    expect(sequenceCards([c], [], NOW)).toEqual([c])
  })
  // ...
})
```
Use `describe('selectSentence', () => { it(...) ... })`. RESEARCH.md's "Wave 0 Gaps" section (lines 339-345) enumerates the exact 6 test cases to write (lowest-unknownCount tier pick, hash-rotation tie-break across two `reps` values, empty array → -1, blank-safety override to first safe sentence, graceful degrade when no sentence is safe, `needsBlank=false` never invokes the override). Comments referencing requirement IDs (e.g. `// REFACTOR-02`) match this repo's "comment-linked requirement IDs" convention noted in RESEARCH.md Sources.

---

### `components/FlashcardMode.tsx`, `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx` (component, request-response)

**Analog:** `components/ModeSelector.tsx` (client component shape, Props interface, named export-default convention) + the not-yet-extracted logic currently inline in `components/StudySession.tsx` lines ~980-1061 (action-bar/grade buttons per RESEARCH.md Pitfall 3) and the surrounding face-rendering blocks for each mode.

**`'use client'` + import pattern** (mirror `components/StudySession.tsx` lines 1-14, trimmed to what each mode actually needs):
```typescript
'use client'

import HighlightedSentence from './HighlightedSentence'
import { useWordTap } from './GlossProvider'
import AudioButton from './AudioButton'
import { sentenceMatch, blankSentence } from '@/lib/sentence-match'
import { haptic } from '@/lib/haptics'
```
(FlashcardMode additionally needs `previewIntervalLabels`/`reviewCard` types if grade-preview stays local; MultipleChoiceMode needs none of sentence-match; FillBlankMode needs `sentenceMatch`/`blankSentence` + a local `normalizeAnswer` copy or an import if hoisted.)

**Props interface style** (mirror `components/ModeSelector.tsx` lines 8-11 — interface always named `Props`, declared directly above the component, no `ComponentNameProps`):
```typescript
interface Props {
  cardCount: number
  onSelect: (mode: StudyMode, includeAI: boolean, flashcardSubMode: FlashcardSubMode) => void
}

export default function ModeSelector({ cardCount, onSelect }: Props) { /* ... */ }
```
Per Architectural Responsibility Map / Pitfall 4 in RESEARCH.md, each Mode component's `Props` should receive only already-derived values and callbacks from the parent — e.g. `Props` for `FlashcardMode` should look like `{ card, chosenSentence, revealed, showBareFront, displayedSentence, recallBlanked, hints, onReveal, onGrade }` — never `queue`/`stats`/`undoRef` directly (those stay in `StudySession.tsx`, see Pitfall 4).

**Default export convention** (all three files): `export default function FlashcardMode({ ... }: Props) { ... }` — matches `ModeSelector.tsx`'s `export default function ModeSelector`.

**Composition of existing leaf components** — each Mode component composes `HighlightedSentence` and `AudioButton` exactly as `StudySession.tsx` already does; do not modify those leaf components. Example composition reference (`AudioButton.tsx` Props, lines 21-28):
```typescript
interface Props {
  text: string
  voice?: string
  'aria-label': string
  className?: string
  size?: 'sm' | 'md'
}
```
This is the calling contract each Mode component must satisfy verbatim when rendering `<AudioButton text=... aria-label=... />`.

**Action-bar duplication (Pitfall 3 resolution):** per RESEARCH.md's recommendation, each Mode component renders its OWN full `<div className="sticky bottom-...">` wrapper with mode-specific button content (Flashcard: 4 grade buttons calling `onGrade(1|2|3|4)`; MultipleChoice: single "Next →" calling an `onAdvance`/`onGrade(mcRating)` callback; FillBlank: 2 buttons Wrong/Correct calling `onGrade(1)`/`onGrade(3)`) — do not build a shared slot/render-prop abstraction (no precedent exists in this codebase per `.claude/CLAUDE.md` Conventions "no barrel files").

---

### `components/StudySession.tsx` (MODIFIED — parent/orchestrator)

**Analog:** itself, pre-refactor. This is a slimming operation, not a pattern transplant. Preserve verbatim (Pitfall 4 — Phase 13 hardening):
- `queue`, `cursor`, `stats`, `seenCount`/`seenCardIdsRef`, `canUndo`/`undoRef`, `saveError`/`isMountedRef`
- `submitReview` (lines 470-585), `handleUndo`, `postReviewWithRetry` (lines 118+, shown above) — critical-ordering comment at line 542 must not move
- `mcOptions` `useMemo` (lines 305-336) stays in the parent per Architectural Responsibility Map, but its `hashStr` calls now import from `lib/sentence-selection.ts`

**New `useMemo` call site** (replaces the inline IIFE at lines 399-420):
```typescript
// Source: components/StudySession.tsx (post-refactor) — RESEARCH.md "Code Examples"
const chosenIdx = useMemo(
  () => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, needsBlank),
  [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]
)
```
This mirrors the existing `mcOptions` `useMemo` shape already in the same file (line 305: `const mcOptions = useMemo(() => { ... }, [mode, queue, seed, cards])`) — same file, same idiom, just applied to a second derivation.

**Mode dispatch pattern:** after `chosenSentence`/`showBareFront`/`displayedSentence`/`recallBlanked`/`fillSentence` etc. are computed (these stay inline in the parent, per RESEARCH.md "Downstream consumers" list — NOT part of the `lib/` extraction), the JSX body dispatches on `mode` to render exactly one of `<FlashcardMode .../>`, `<MultipleChoiceMode .../>`, `<FillBlankMode .../>`, passing the already-computed values + `onGrade`/`onReveal`/`onUndo` callbacks as props.

---

## Shared Patterns

### Pure-module JSDoc contract header
**Source:** `lib/sequence.ts` lines 1-27, `lib/sentence-match.ts` lines 1-11, `lib/known-words.ts` lines 1-18
**Apply to:** `lib/sentence-selection.ts`
Every pure `lib/` module in this codebase opens with a block comment stating: what the function does, the exact call sites ("Used by: ..."), and a closing purity guarantee sentence. `lib/sentence-selection.ts` must follow this exactly — RESEARCH.md's "Recommended new pure module signature" section already drafts the JSDoc for `selectSentence`; extend it with a "Used by" list naming `components/StudySession.tsx` (both the `useMemo` selection call and the `mcOptions` `hashStr` reuse).

### `'use client'` + Props-named-interface for all client components
**Source:** `components/ModeSelector.tsx` lines 1, 8-11; `components/AudioButton.tsx` lines 1, 21-28
**Apply to:** `FlashcardMode.tsx`, `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`
`'use client'` is always the first line before any import; the props type is always `interface Props { ... }` (never `type`, never suffixed `ComponentNameProps`), declared immediately above the component function; export is always `export default function ComponentName(props: Props)`.

### Single source of truth for hash/match utilities
**Source:** `lib/card-key.ts` (`normalizeFront`), `lib/sentence-match.ts` (`sentenceMatch`)
**Apply to:** `lib/sentence-selection.ts`'s `hashStr`
Every cross-cutting pure utility in this codebase has exactly one implementation. After extraction, verify `grep -n "function hashStr" .` returns exactly one file (`lib/sentence-selection.ts`) — `mcOptions` in `StudySession.tsx` must import it, not redefine it (RESEARCH.md Pitfall 2).

### Vitest fixture-helper + describe/it test style
**Source:** `tests/sequence.test.ts` lines 1-24
**Apply to:** `tests/sentence-selection.test.ts`
Top-of-file named imports from vitest + the module under test, a tiny local fixture-builder function (`card(...)` → analog `sentence(...)`), a module-level `NOW`-style constant if determinism is needed, then flat `describe(fnName, () => { it('does X', () => {...}) })` blocks — one `it` per behavior enumerated in RESEARCH.md's Wave 0 Gaps list.

## No Analog Found

None — all 6 files have a strong existing analog in this codebase (pure-module pair `lib/sequence.ts`+`tests/sequence.test.ts`, and sibling client components `ModeSelector.tsx`/`AudioButton.tsx`/`HighlightedSentence.tsx`).

## Metadata

**Analog search scope:** `lib/`, `tests/`, `components/` (targeted — RESEARCH.md already named the analogs; this pass read each analog in full to extract concrete excerpts, not a fresh directory-wide search)
**Files scanned:** `lib/sequence.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`, `tests/sequence.test.ts`, `components/ModeSelector.tsx`, `components/AudioButton.tsx`, `components/HighlightedSentence.tsx` (partial), `components/StudySession.tsx` (partial, lines 1-140 + RESEARCH.md's full-file inventory)
**Pattern extraction date:** 2026-07-02
