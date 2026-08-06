---
phase: 28-active-recall-study-mode
reviewed: 2026-07-14T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - components/FlashcardMode.tsx
  - components/ModeSelector.tsx
  - components/StudyClient.tsx
  - components/StudySession.tsx
  - e2e/active-flow.spec.ts
  - e2e/freshness-fresh-paths.spec.ts
  - e2e/freshness-gate.spec.ts
  - e2e/grade-flow.spec.ts
  - e2e/helpers/mutate.ts
  - e2e/run-mutate.ts
  - lib/active-prompt.ts
  - tests/active-prompt.test.ts
  - tests/sentence-selection.test.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-07-14
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the retirement of Multiple Choice / Fill-in-the-Blank, the Passive/Active
segmented toggle, and the new Active production mode (`lib/active-prompt.ts`,
`FlashcardMode.tsx`, `StudySession.tsx` wiring). Note: the workflow's supplied
`diff_base` (`c344f2ea…^`) resolved to a commit far earlier than this phase's
actual work; the real phase-28 range is `a607074^..HEAD` (commits `a607074` through
`0086fe4`). This review is scoped to that actual phase-28 diff, not the much
larger incidental diff the wrong `diff_base` would have produced.

The retirement of MC/Fill-blank is clean, and `lib/active-prompt.ts`'s precedence
logic is well-tested for the four documented face rows. However, a genuine
correctness bug was found: the Active mode's "word-production" fallback — used
for AI-generated practice cards — assumes `PracticeCard.back` is a clean English
gloss (mirroring `Card.back`'s semantics), but `lib/generate-practice.ts` actually
generates `PracticeCard.back` as mixed "Korean + English" content and
`PracticeCard.front` as a Korean instruction/prompt (not a bare word). This breaks
the entire "produce Korean from an English prompt, then reveal" premise of Active
mode whenever a session includes AI practice cards — the front literally shows
the Korean answer before the user attempts to produce it. This combination
(Active mode + "Include AI-generated practice questions") is reachable in the UI
today and has no test coverage.

Two accessibility/quality issues in the new hint control round out the findings.

## Critical Issues

### CR-01: Active mode's word-production fallback leaks/breaks content for AI-generated practice cards

**File:** `lib/active-prompt.ts:41` (via `components/FlashcardMode.tsx:104-134,218-236`, `components/StudySession.tsx:343`)

**Issue:** `deriveActiveFace()` special-cases practice cards (`isPractice` — checked *before* the new-card gate) to `{ face: 'word-production', prompt: card.back }`. This design (documented in `28-CONTEXT.md` D-04 / `28-RESEARCH.md` Pitfall 10 as "English gloss → produce the Korean word") assumes `PracticeCard.back` is a pure English gloss and `PracticeCard.front` is a bare Korean word — mirroring the real `Card.front`/`Card.back` shape.

That assumption does not hold. `lib/generate-practice.ts:5-10,30-34` documents (and the LLM prompt actually requests) a completely different shape for `PracticeCard`:
```ts
// lib/generate-practice.ts
export interface PracticeCard {
  type: 'example-sentence' | 'fill-blank' | 'transformation'
  front: string   // "the question/prompt (Korean or instruction)"
  back: string    // "the answer (Korean + English)"
  notes?: string
}
```
So in production:
- The Active **front prompt** (`activeFace.prompt = card.back`, rendered at `FlashcardMode.tsx:112-114` as "Translate this, then reveal") is frequently a mixed Korean+English string, e.g. `"저는 학교에 갔어요 (I went to school)"` — the Korean answer is shown to the learner *before* they attempt to produce it, completely defeating the "produce from English" mechanic and spoiling the exercise.
- The **reveal** (`FlashcardMode.tsx:218-236`, word-production branch) renders `card.front` styled as a single giant bold Hangul word (`text-5xl font-bold`) — but for `fill-blank`/`transformation`/`example-sentence` practice cards, `front` is often a full instruction or a multi-word Korean sentence, not a bare word, producing a broken/oversized/nonsensical reveal.

This is reachable in the shipped UI: the "Include AI-generated practice questions" checkbox (`ModeSelector.tsx`) is fully independent of the Passive/Active toggle (by deliberate design, D-04), and `StudyClient.handleModeSelect` fetches practice cards regardless of the selected mode. There is no e2e or unit coverage that exercises Active mode together with `includeAI` — `e2e/active-flow.spec.ts` never checks the "Include AI-generated practice questions" checkbox, so this regression shipped undetected.

**Fix:** Do not reuse the real-card word-production fallback for practice cards as-is. Either:
1. Route `isPractice` items to `passive-degrade` unconditionally in Active mode (ephemeral practice items have no guaranteed English-only/Korean-only field split, so they cannot safely support the production mechanic), or
2. Change `lib/generate-practice.ts`'s schema/prompt to emit a real `prompt`/`answer` split with guaranteed single-language content (e.g. `promptEn: string; answerKo: string`) and thread that through `deriveActiveFace` instead of overloading `front`/`back`.

Either way, add an e2e test that selects Active mode **and** ticks "Include AI-generated practice questions" together, asserting the front prompt never contains Hangul and the reveal is not an oversized non-word string.

## Warnings

### WR-01: Hint-reveal button loses its accessible name after being tapped

**File:** `components/FlashcardMode.tsx:117-125`

**Issue:**
```tsx
<button type="button" data-testid="hint-toggle" onClick={onToggleHint} className="...">
  <Lightbulb className="w-4 h-4" />
  {!hintRevealed && <span className="text-sm font-semibold">Show hint</span>}
</button>
```
`lucide-react`'s `Icon` component auto-sets `aria-hidden="true"` on the `<svg>` when no a11y prop is supplied (confirmed in `node_modules/lucide-react/dist/esm/Icon.mjs`). Before `hintRevealed`, the button's accessible name comes from the visible "Show hint" text. Once tapped, that `<span>` is removed entirely and only the `aria-hidden` icon remains — the button's accessible name becomes empty while the element stays focusable and present in the DOM (it's a permanent no-op after the first tap, since `onToggleHint` never sets `hintRevealed` back to `false`). Screen-reader users landing on this control post-reveal get an unlabeled, purposeless button.

**Fix:** Keep a persistent `aria-label`, e.g. `aria-label={hintRevealed ? 'Hint shown' : 'Show hint'}`, or hide/disable the button once the hint is revealed instead of just dropping its visible label.

### WR-02: `onToggleHint`/`hint-toggle` naming implies bidirectional toggle behavior it doesn't have

**File:** `components/StudySession.tsx:669`, `components/FlashcardMode.tsx:65,119-121`

**Issue:** The prop is named `onToggleHint` and wired as `onToggleHint={() => setHintRevealed(true)}` — a one-way reveal, never a toggle back to hidden. The `data-testid="hint-toggle"` and button semantics (still clickable, no visual "pressed" state) reinforce the toggle framing even though nothing toggles. This is purely a naming/quality issue but it's a real trap for the next person who touches this code and assumes clicking again hides the hint.

**Fix:** Rename to `onRevealHint` / `hint-reveal-btn` (or add a genuine toggle if hide-again is desired), and disable the button once `hintRevealed` is true so its non-functional state is visibly inert rather than silently inert.

### WR-03: No test coverage for the Active + AI-practice combination that triggers CR-01

**File:** `e2e/active-flow.spec.ts`

**Issue:** The new Active-mode e2e spec drives a full session and asserts both the production and passive-degrade faces are exercised, but never ticks "Include AI-generated practice questions" before starting the session. Since practice cards are the exact code path with the CR-01 defect, and the checkbox + Active toggle are documented (D-04) as deliberately independent/combinable, this is a meaningful coverage gap in the very feature this phase adds.

**Fix:** Add a scenario (or extend the existing one) that checks the AI-practice checkbox, selects Active mode, and asserts the resulting practice-card face doesn't leak Korean text into the un-revealed prompt.

## Info

### IN-01: `deriveActiveFace`'s `card` parameter carries an unused `front` field

**File:** `lib/active-prompt.ts:36`

**Issue:** The function signature is `card: { front: string; back: string }`, but only `card.back` is ever read inside the function body. This is harmless (documents intent / mirrors the `Card` shape) but slightly misleading — a reader might assume `front` participates in the precedence logic.

**Fix:** Either narrow the parameter type to `{ back: string }` or add a one-line comment noting `front` is accepted only for call-site type convenience and isn't read here.

---

_Reviewed: 2026-07-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
