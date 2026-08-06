# Phase 28: Active Recall Study Mode - Pattern Map

**Mapped:** 2026-07-13
**Files analyzed:** 11 new/modified + 2 deleted
**Analogs found:** 11 / 11 (deleted files need no analog)

> Line numbers below are valid only until Plan 1's type-narrowing/deletion pass executes (per 28-RESEARCH.md). Plans should cite symbols for anything executed after that commit.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/active-prompt.ts` (NEW) | utility (pure lib) | transform | `lib/sentence-selection.ts` | exact (same conventions, same call site) |
| `components/ModeSelector.tsx` (MOD) | component | request-response (UI selection) | itself — Exposure/Recall sub-toggle at :42–66 | exact (self-analog) |
| `components/StudySession.tsx` (MOD) | component (stateful parent) | event-driven | itself — `revealed` state + derived-value pattern | exact (self-analog) |
| `components/FlashcardMode.tsx` (MOD) | component (presentational) | request-response | itself — existing front-face branching :83–127 | exact (self-analog, extend in place per RESEARCH Pattern 2) |
| `components/StudyClient.tsx` (MOD) | component (client shell) | event-driven | itself — `handleModeSelect` threading | exact (self-analog; FreshnessWatcher blocks byte-identical, D-16) |
| `components/MultipleChoiceMode.tsx` (DEL) | component | — | — | n/a (delete) |
| `components/FillBlankMode.tsx` (DEL) | component | — | — | n/a (delete) |
| `tests/active-prompt.test.ts` (NEW) | test (unit) | — | `tests/sentence-selection.test.ts` | exact |
| `tests/sentence-selection.test.ts` (MOD) | test (unit) | — | itself — existing `sentence()` fixture builder :7–9 | exact |
| `e2e/active-flow.spec.ts` (NEW) | test (e2e) | request-response | `e2e/grade-flow.spec.ts` | exact |
| `e2e/grade-flow.spec.ts` (MOD) | test (e2e) | — | itself | exact |
| `e2e/helpers/mutate.ts` (MOD) | test helper | CRUD (DB mutation) | itself — `promoteOneReviewToMasteredDirect` + subprocess-delegation pair | exact |

## Pattern Assignments

### `lib/active-prompt.ts` (utility, pure transform)

**Analog:** `lib/sentence-selection.ts` (whole file, 92 lines — read fully)

**Module header + purity contract pattern** (lines 1–27): a JSDoc block that states the algorithm step-by-step, lists call sites under "Used by:", and ends with the purity guarantee:
```typescript
/**
 * Pure helper — single source of truth for selecting which example sentence to
 * show for a card during study.
 * ...
 * Used by:
 *  - components/StudySession.tsx          (the sentence-selection `useMemo`)
 * ...
 * Pure — no `Date.now()`/`Math.random()`/no-arg `new Date()`; safe to call
 * anywhere, including render or inside a `useMemo`.
 */
```

**Minimal structural input types** (lines 31–40) — deliberately narrower than the DTO layer:
```typescript
/**
 * Minimal structural type the algorithm reads. Kept deliberately narrower than
 * the full `SentenceDTO` so this pure module stays decoupled from the DTO
 * layer's evolution — mirrors `lib/sequence.ts`'s `SeqCard` convention.
 */
export interface SelectableSentence {
  korean: string
  targetForm: string
  unknownCount?: number
}
```
For `active-prompt.ts`: take `{ front: string; back: string }` and `{ translation: string } | null` structural params, NOT `CardDTO`. Named exports only, no default export, no `'use client'`, no Prisma/Node imports.

**Core function shape** (lines 60–91): exported pure function with early-return guard (`if (sentences.length === 0) return -1`) and explicit precedence ordering. RESEARCH's draft (28-RESEARCH.md Code Examples §"Active prompt derivation") is the target implementation — a discriminated-union return type (`ActiveFace`) with precedence: practice → new-card degrade → null-sentence → sentence-production. The discriminated-union return mirrors how `sentence-match.ts` returns structured results rather than booleans.

---

### `components/ModeSelector.tsx` (component, rewrite in place)

**Analog:** itself — the Exposure/Recall sub-toggle it currently contains is the exact visual/structural template for the new Passive/Active segmented control (28-UI-SPEC.md §Component Notes 1 confirms).

**Type exports to narrow** (lines 5–6) — this is Plan 1's first edit (D-14):
```typescript
export type StudyMode = 'flashcard' | 'multiple-choice' | 'fill-blank'  // → 'passive' | 'active'
export type FlashcardSubMode = 'exposure' | 'recall'                    // → DELETE
```

**Segmented-toggle pattern to copy** (lines 42–65) — neutral selected-pill convention, NOT accent fill (UI-SPEC color contract):
```tsx
<div className="flex gap-1 mt-2 bg-surface-3 rounded-lg p-1">
  <button
    onClick={() => setFlashcardSubMode('exposure')}
    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
      flashcardSubMode === 'exposure'
        ? 'bg-surface-1 text-foreground shadow-sm'
        : 'text-muted hover:text-muted-foreground'
    }`}
  >
    Exposure
    <span className="block text-[10px] font-normal opacity-70">word shown in sentence</span>
  </button>
  ...
```
Scale up per UI-SPEC: shell `flex gap-2 bg-surface-3 rounded-lg p-1`, segments `flex-1 py-3 px-4 rounded-md`, Label 14px/600 + Caption 12px/400 descriptors ("recognize & review" / "produce from English").

**Default-state pattern** (line 21): `useState<FlashcardSubMode>('exposure')` → `useState<StudyMode>('passive')` (MODE-02, no unselected flash).

**AI checkbox** (lines 71–79): keep byte-identical, below the toggle, both modes (D-04).

**`onSelect` signature** (line 10): `onSelect: (mode: StudyMode, includeAI: boolean, flashcardSubMode: FlashcardSubMode) => void` — drops the third param; the change ripples through `StudyClient.handleModeSelect` → `StudySession` Props via tsc (D-14 removal sequence).

---

### `components/StudySession.tsx` (stateful parent, modify in place)

**Analog:** itself. Three self-patterns to copy, one to extend, plus a deletion inventory.

**Pattern A — parent-owned reveal state** (line 211) is the template for the new `hintRevealed`:
```typescript
const [revealed, setRevealed] = useState(false)
// NEW, alongside: const [hintRevealed, setHintRevealed] = useState(false)
```

**Pattern B — reset points.** `submitReview` advance block (lines 608–614; `setFillInput`/`setMcSelected` are being deleted here — `setHintRevealed(false)` slots in their place):
```typescript
setQueue(nextQueue)
setCursor((c) => c + 1)
setRevealed(false)
setFillInput('')        // DELETE
setMcSelected(null)     // DELETE  → replace both with setHintRevealed(false)
setExampleOffset(0)
setIntervalHints(null)
```
And `handleUndo` restore (lines 662–668), same additions alongside `setRevealed(false)`:
```typescript
setStats(prevStats)
setQueue(prevQueue)
...
setCursor((c) => c + 1)
setRevealed(false)      // add setHintRevealed(false) here too
setIntervalHints(null)
```

**Pattern C — derived-per-render values from `queue[0]`** (lines 381–433) is the template for `activePrompt` derivation (Pitfall N-3: never snapshot; requeued cards must re-derive their face):
```typescript
const item = queue[0]
const realCard = item?.kind === 'real' ? item.card : null
const cardSentences = realCard?.sentences ?? []
...
const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1
const chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null
const showBareFront =
  mode === 'flashcard' &&
  flashcardSubMode === 'exposure' &&   // sub-mode clause dies with narrowing
  isNewCard &&
  cardSentences.length > 0 &&
  (chosenSentence?.unknownCount ?? 0) > 0
```
New line, same style: `const activeFace = deriveActiveFace(currentCard, chosenSentence, isNewCard, isPractice)` — plain render-scope derivation (it's cheap and pure; memo not required, but if memoized follow the `chosenIdx` memo shape at :395–398).

**Pattern D — `needsBlank` collapse** (lines 386–388): after narrowing, the expression collapses; pass literal `false` at the `selectSentence` call (D-13; keep the lib param this milestone):
```typescript
const chosenIdx = useMemo(
  () => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, false),
  [cardSentences, realCard?.id, realCard?.review?.reps]
)
```

**Pattern E — keyboard handler** (lines 712–718): the `if (mode === 'flashcard')` guard on 1–4 grading becomes unconditional (both modes grade via 1–4); MC/fill branches (:701–711, :719–726) delete.

**Deletion inventory (verified in RESEARCH, symbols not lines):** `MC_ADVANCE_MS`, `normalizeAnswer`, `seededShuffle`, `seed` memo, `fillInput`/`mcSelected` state, `advanceTimer`, `mcOptions`, `mcRating`, `handleMcSelect`, `advanceMc`, `chosenMatch`, `recallBlanked`, fill derivations (`useChosenForFill`/`fillSentence`/`fillTranslation`/`fillAnswer`/`fillCorrect`), imports of `hashStr`, `sentenceMatch`/`blankSentence`, `MultipleChoiceMode`, `FillBlankMode`, `FlashcardSubMode`; `distractors` field on the local `Card` interface (:31). Mode-dispatch ternary (:786–834) collapses to a single unconditional `<FlashcardMode …/>` with new props `studyMode={mode}`, `activeFace`, `hintRevealed`, `onToggleHint`.

---

### `components/FlashcardMode.tsx` (presentational, extend in place)

**Analog:** itself — RESEARCH Pattern 2 resolved extend-in-place (~80% reuse).

**Header contract to preserve** (lines 3–21): "Pure presentation — owns NO session state… The only hook called here is `useWordTap()`." Update the header prose (it names Exposure/Recall); keep the contract. Refs threading (`frontRef`/`backRef`/`againBtnRef`, lines 32–35) and the `key={cursor}` inner div (line 75) are load-bearing — parent's `useLayoutEffect` measurement and reveal-focus depend on them; do not restructure.

**Props pattern** (lines 28–47): inline `interface Props`. Delete `flashcardSubMode`, `recallBlanked`; add:
```typescript
studyMode: StudyMode                 // 'passive' | 'active'
activeFace: ActiveFace               // from lib/active-prompt.ts
hintRevealed: boolean
onToggleHint: () => void
```

**Front-face branch structure to extend** (lines 83–127) — Active branches slot in as new arms of this existing conditional; the `showBareFront` and no-sentence arms are reused verbatim as the D-10 degrade target:
```tsx
{showBareFront ? (
  <div className="flex items-center justify-center gap-2">
    <p className="hangul text-5xl font-bold text-foreground text-center">{card.front}</p>
    <AudioButton text={card.front} aria-label={`Play: ${card.front}`} size="sm" />
  </div>
) : chosenSentence ? (
  /* recall branch DELETED; sentence-front branch stays */
  <>
    <div className="flex items-start justify-center gap-1">
      <HighlightedSentence korean={chosenSentence.korean} targetForm={chosenSentence.targetForm}
        cardType={card.type} className="font-medium text-center text-2xl text-foreground" onWordTap={onWordTap} />
      <AudioButton text={chosenSentence.korean} aria-label={`Play sentence: ${chosenSentence.korean}`} size="sm" />
    </div>
    <p className="text-xs text-muted text-center">Recall the meaning of the highlighted part</p>
  </>
) : ( /* bare-word no-sentence block */ )}
```
New Active front branch shape: see 28-RESEARCH.md Code Examples §"FlashcardMode Active front branch" (English prompt `text-2xl font-medium`, NO `hangul-sentence` class, `Lightbulb` hint pill `py-2 px-3` for 44px target, "Translate this, then reveal" caption). Copy exact copy strings from 28-UI-SPEC.md §Copywriting Contract.

**Back-face pattern** (lines 135–179): Active back pins `chosenSentence` (not `displayedSentence`), hides the cycle button (D-02 — branch on `studyMode` around lines 171–178), keeps the `card-front-word` word/gloss block (:154–162, RESEARCH Open Q2 recommendation — testid is e2e-load-bearing), drops the redundant translation line, adds the grade-anchoring caption ("Grade yourself on the highlighted expression — wording or word order can differ.", Caption 12px/400 muted).

**Action bar** (lines 202–259): byte-identical both modes — `reveal-btn`, `grade-again/hard/good/easy` testids, `againBtnRef`, interval hints. Do not touch.

---

### `components/StudyClient.tsx` (client shell, prop threading only)

**Analog:** itself. Changes are mechanical, driven by tsc after the type narrowing: `FlashcardSubMode` import/state/threading dies (RESEARCH cites references at :5, :35, :177, :180, :366); `handleModeSelect` signature loses the third param; `mode` state type narrows. **Constraint (D-16):** the `prevInitialCards` block (:135–142) and `prevFreshStudy` block (:155–168) stay byte-identical — they gate on `phase === 'select-mode'`, never on mode. Sheet title "Study options" (:323) and ModeSelector heading are a light copy call (RESEARCH Open Q3).

---

### `tests/active-prompt.test.ts` (unit test, NEW)

**Analog:** `tests/sentence-selection.test.ts` (full file read)

**File structure pattern** (lines 1–11):
```typescript
import { describe, it, expect } from 'vitest'
import { selectSentence, hashStr, type SelectableSentence } from '../lib/sentence-selection'

// Fixture helper — mirrors tests/sequence.test.ts's `card(...)` builder.
function sentence(korean: string, targetForm: string, unknownCount?: number): SelectableSentence {
  return { korean, targetForm, unknownCount }
}

describe('selectSentence', () => {
  // REFACTOR-02   ← requirement-ID comment above each `it`
  it('picks the sentence with the lowest unknownCount when tiers differ', () => { ... })
```
Copy: relative `../lib/` import (no `@/` alias in tests), tiny fixture-builder function, requirement-ID comment tags (`// ACTIVE-05`, `// D-15`) above each `it`, behavior-sentence test names, edge cases as dedicated tests (cf. the `returns -1 for an empty sentence array` test at :42–44). Required cases per D-15/Pattern 3: all four precedence rows + explicit practice-precedes-new-card ordering + null-sentence input.

---

### `tests/sentence-selection.test.ts` (MOD — add D-13 parity case)

**Analog:** itself; the new test drops into the existing `describe('selectSentence')` block using the existing `sentence()` builder (:7–9). RESEARCH's draft (Code Examples §"Sentence-pick parity test") is copy-ready — asserts Passive and Active (`needsBlank=false` both) pick the same index when the least-unknown sentence is blank-unsafe, and that it is NOT the blank-safe override pick. Model the blank-unsafe fixture on the existing `('가나다라마바사', '가', 0)` style (:52–57) or a twice-occurring targetForm.

---

### `e2e/active-flow.spec.ts` (e2e test, NEW)

**Analog:** `e2e/grade-flow.spec.ts` (full file read, 91 lines)

**Header + self-reset convention** (lines 1–35) — copy the doc-comment style (bounded-loop rationale, ordering safeguard) and the `beforeAll` reset:
```typescript
import { test, expect } from '@playwright/test'
import { resetToBaseline } from './seed'
import { FIXTURE } from './fixture'

test.beforeAll(async () => {
  await resetToBaseline()
  // NEW for active-flow: then promote one seeded due card to state 2 via the
  // new mutate helper (Pitfall N-1) — mutation AFTER reset, in this order.
})
```

**Bounded loop-until-complete pattern** (lines 46–68) — never fixed grade counts:
```typescript
const MAX_GRADES = 25
let grades = 0
while (grades < MAX_GRADES) {
  const revealOrComplete = page.getByTestId('reveal-btn').or(page.getByTestId('session-complete-heading'))
  await revealOrComplete.first().waitFor({ state: 'visible' })
  if (await page.getByTestId('session-complete-heading').isVisible()) break
  await page.getByTestId('reveal-btn').click()
  await expect(page.getByTestId('grade-good')).toBeVisible()
  ...
  await page.getByTestId('grade-good').click()
  grades++
}
```

**Session-entry pattern** (lines 38–40): `goto('/study')` → `start-studying-btn` → mode selection. In the new spec, tap the Active segment (new testid needed on the toggle; also a `hint-toggle` testid per RESEARCH validation map).

**Content-anchored assertions** (lines 63–64, 81): `card-front-word` textContent capture into a `Set`, later compared to `FIXTURE.cards.due` fronts. For Active: assert an English-text front on the promoted state-2 card and the exposure face (Korean) on unmutated state-1 cards (D-03 degrade).

**DB backstop poll pattern** (line 89): `await expect.poll(() => seededDueReviewsPersisted(), { timeout: 15_000 }).toBe('all-persisted')` — reuse if the spec grades cards.

---

### `e2e/grade-flow.spec.ts` (MOD)

**Analog:** itself. Single change site: line 40, `await page.getByTestId('mode-flashcard').click()` → explicit Passive-segment interaction with the new toggle testid. Travels in the same plan/commit as the ModeSelector rewrite. Also assert Passive-is-default (MODE-02) before tapping. Everything else (bounded loop, backstop) unchanged — CLEANUP-04.

---

### `e2e/helpers/mutate.ts` (MOD — add state-promotion helper)

**Analog:** itself — the `promoteOneReviewToMasteredDirect` / subprocess pair is the closest existing function; copy its two-layer shape exactly.

**`*Direct` layer pattern** (lines 122–135):
```typescript
export async function promoteOneReviewToMasteredDirect(): Promise<void> {
  const prisma = await getTestPrisma()
  const candidate = await prisma.cardReview.findFirst({
    where: { NOT: { state: 2, scheduledDays: { gte: 21 } } },
  })
  if (candidate) {
    await prisma.cardReview.update({ where: { id: candidate.id }, data: { state: 2, scheduledDays: 30 } })
  }
  ...
}
```
New helper (e.g. `promoteOneDueCardToProductionDirect`): find one due review (`nextReview: { lte: new Date() }`), set `state: 2` while KEEPING `nextReview` in the past (unlike the mastered promoter, which is deliberately never-due). Do NOT touch `FIXTURE.dueCards = 3` — smoke/freshness specs derive from it (Pitfall N-1).

**Subprocess-delegating public wrapper pattern** (lines 199–213):
```typescript
export async function promoteOneReviewToMastered(): Promise<void> {
  runMutateOp('promoteOneReviewToMastered')
}
```
Plus register the new op in `e2e/run-mutate.ts`'s `OPS` map (lines 32–41) — CRITICAL: Playwright workers cannot call `*Direct` functions in-process (`import.meta` ESM error, documented in the module header :8–23); the tsx-subprocess delegation is mandatory, not optional.

## Shared Patterns

### Purity contract (react-hooks/purity)
**Source:** `lib/sentence-selection.ts` header (:25–27) + `lib/fsrs.ts` `previewIntervalLabels` (event-handler-only, called at StudySession.tsx:685)
**Apply to:** `lib/active-prompt.ts`, all StudySession derivations
No `Date.now()`/`Math.random()`/no-arg `new Date()` in render. `previewIntervalLabels` stays inside `handleReveal` only.

### Presentational-mode-component contract (REFACTOR-01)
**Source:** `components/FlashcardMode.tsx` header comment (:3–21)
**Apply to:** FlashcardMode changes, hint state placement
Mode components own no state; only `useWordTap()` is permitted as a hook; parent threads refs (`frontRef`/`backRef`/`againBtnRef`) and all handlers as props. `hintRevealed` therefore lives in StudySession (FlashcardMode is NOT remounted per card — only the inner `key={cursor}` div is; local state would leak across cards).

### Neutral segmented-toggle styling
**Source:** `components/ModeSelector.tsx:42–65` (Exposure/Recall sub-toggle)
**Apply to:** new Passive/Active toggle
`bg-surface-3 rounded-lg p-1` shell; selected `bg-surface-1 text-foreground shadow-sm`; unselected `text-muted hover:text-muted-foreground`. Accent (`--button`) reserved for the reveal CTA and hint-pill icon/label only.

### Component conventions (project-wide)
**Source:** every component read
`'use client'` first line; `interface Props`; default-export components; `@/` imports in app/lib code, relative imports in tests/e2e; kebab-case lib filenames.

### E2E conventions
**Source:** `e2e/grade-flow.spec.ts` + `e2e/helpers/mutate.ts`
`resetToBaseline()` in `beforeAll` before any own mutation; data-testid locators exclusively; bounded loop-until-complete (never exact grade counts); tsx-subprocess delegation for all Prisma access from spec files; `FIXTURE` constants never edited by a spec.

## No Analog Found

None — every file has an exact or self-analog. This phase is a subtractive refactor plus one new pure lib module whose conventions are fully established by `lib/sentence-selection.ts`.

## Metadata

**Analog search scope:** `components/`, `lib/`, `tests/`, `e2e/`, `e2e/helpers/`
**Files scanned:** 9 read directly (ModeSelector, FlashcardMode, StudySession ×4 targeted ranges, sentence-selection.ts, sentence-selection.test.ts, grade-flow.spec.ts, mutate.ts, run-mutate.ts) + 3 planning inputs (CONTEXT, RESEARCH, UI-SPEC)
**Pattern extraction date:** 2026-07-13
