# Phase 15: StudySession Refactor & Sentence-Selection Memoization - Research

**Researched:** 2026-07-02
**Domain:** React 19 component decomposition, `useMemo` performance optimization, pure-function extraction (internal refactor — no new libraries)
**Confidence:** HIGH

## Summary

This phase has no external-library research surface — it is a pure internal refactor of one file, `components/StudySession.tsx` (1065 lines), using only React 19 built-ins already in the dependency tree (`useMemo`) and the project's own established pure-module + Vitest conventions (`lib/sequence.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`, `tests/*.test.ts`). No `npm install` is needed and no Package Legitimacy Audit applies.

The real research value here is **precise code inventory**: exactly which lines constitute "sentence selection," every value it produces, every place those values are consumed, which state/handlers are truly mode-specific vs. shared across all three study modes, and what Phase 13's already-verified behavior (`postReviewWithRetry`, `isMountedRef`, `saveError`/`Toast`, atomic `handleUndo`) must NOT be disturbed. All of this is documented below with exact line references from the current file (read in full during this research pass).

**Primary recommendation:** Extract the inline `chosenIdx` IIFE (lines 399–420) plus its `hashStr` dependency (lines 83–94) into a new pure module `lib/sentence-selection.ts`, following the `lib/sequence.ts` header-comment/named-export style, with a companion `tests/sentence-selection.test.ts`. Wrap the call site in `useMemo` with dependency array `[cardSentences, realCard?.id, reps, needsBlank]` — **not** the roadmap's illustrative `[cardSentences, reps]**, which is insufficient (see Pitfall 1). Do the extraction+memoization first (REFACTOR-02 + PERF-03), commit, THEN split into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` (REFACTOR-01), per the already-locked sequencing note in ROADMAP.md.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REFACTOR-02 | Sentence-selection logic is extracted into a pure, independently-testable module | See "Exact current sentence-selection logic" (Code Examples), "Recommended new pure module signature," and the full test-case list in Validation Architecture → Wave 0 Gaps |
| PERF-03 | `StudySession`'s sentence-selection calculation is memoized instead of recomputing every render | See Pattern 2 (`useMemo`), Pitfall 1 (correct dependency array), "Recommended `useMemo` call site" in Code Examples |
| REFACTOR-01 | `StudySession.tsx` is split into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` sub-components | See System Architecture Diagram, Architectural Responsibility Map (state ownership split), Pitfall 3 (action-bar boundary), Pitfall 4 (what must stay in the parent) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sentence-selection algorithm (least-unknown tier + hash tie-break + blank-safety override) | `lib/` pure module (business logic) | — | Currently inline in a client component render body; REFACTOR-02 explicitly requires it be "importable and testable without rendering StudySession" — it has no DOM/React dependency today (only uses `sentenceMatch` from `lib/sentence-match.ts`, both pure) |
| Memoization of the selection result | Client Component (React render tier) | — | `useMemo` is a render-tier concern; the pure module itself stays memoization-agnostic (a plain function), the *caller* memoizes it |
| Per-mode UI rendering (Flashcard/MultipleChoice/FillBlank) | Client Component | — | Existing pattern: `components/*.tsx` client components own JSX + mode-local state (mirrors `ModeSelector.tsx`, `HighlightedSentence.tsx` as sibling client components already composed by `StudySession`) |
| FSRS review submission, undo, background-save retry | Client Component (`StudySession`, shared/parent tier) | API tier (`/api/review`, `/api/review/undo`) | Phase 13 locked this behavior; must stay in the parent so all three modes share one submission/undo pipeline — do not fork per mode |
| Multiple-choice option generation (`mcOptions`) | Client Component | — | Already memoized (`useMemo`, line 305) and reads `cards`/`seed` (session-wide), not mode-owned card-selection state — stays parent-level unless moved wholesale into `MultipleChoiceMode` |

## Standard Stack

### Core
No new packages. Everything needed already ships in `package.json`:

| Library | Version (verified installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.2.4 (repo) / 19.2.7 latest on npm [VERIFIED: npm registry] | `useMemo` for the memoized selection | Built-in hook, zero new dependency |
| `vitest` | 4.1.9 (repo, matches latest on npm) [VERIFIED: npm registry] | Unit tests for the new pure module | Already the project's sole test runner (`tests/*.test.ts`, `vitest.config.ts`) |

### Supporting
None required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useMemo` | `useCallback` + manual ref cache | Unneeded complexity; `useMemo` is the idiomatic, already-used-elsewhere-in-file tool (see `mcOptions`, line 305, and `seed`, line 173) for exactly this "derive from render-scoped values" shape |
| Extracting selection logic only | Also extracting `mcOptions` / `showBareFront` into the pure module | Out of scope — REFACTOR-02 names "sentence-selection logic" specifically; `mcOptions` is a separate concern (multiple-choice distractor shuffling) already memoized and not mentioned in the phase's success criteria |

**Installation:** None — no `npm install` needed for this phase.

**Version verification:** `react@19.2.4` (project) vs `19.2.7` (npm latest) [VERIFIED: npm registry] — patch-level drift only, no breaking changes to `useMemo` semantics between these versions. `vitest@4.1.9` matches the npm-published latest at time of research [VERIFIED: npm registry].

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages — it is a structural refactor of existing first-party code using only already-installed `react` and `vitest`. No table required.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────┐
                         │   StudySession (parent)     │
                         │  owns: queue, cursor, stats, │
                         │  revealed, canUndo, saveError│
                         │  submitReview / handleUndo   │
                         │  postReviewWithRetry (P13)   │
                         └──────────────┬───────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │ item = queue[0]         │ chosenIdx/chosenSentence │
              │ (current card)          │ = useMemo(selectSentence)│  ← NEW: lib/sentence-selection.ts
              ▼                         ▼                         │
   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │  FlashcardMode      │   │ MultipleChoiceMode │   │  FillBlankMode     │   ← NEW sub-components (REFACTOR-01)
   │  - revealed flip    │   │  - mcOptions        │   │  - fillInput       │
   │  - showBareFront    │   │  - mcSelected       │   │  - fillCorrect     │
   │  - recallBlanked    │   │  - advanceTimer/MC  │   │  - Wrong/Correct   │
   │  - exampleOffset    │   │    auto-advance     │   │    grade buttons   │
   │  - 4 grade buttons  │   │  - Next button      │   │                    │
   └─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘
             │                        │                        │
             └────────────┬───────────┴───────────┬────────────┘
                          ▼                        ▼
              onReveal() / onGrade(rating) callbacks up to StudySession
              (submitReview / handleReveal stay in parent — shared FSRS pipeline)
                          │
                          ▼
              components/HighlightedSentence.tsx, AudioButton.tsx, GlossProvider (useWordTap)
              (already-shared leaf components — unchanged, composed by whichever mode needs them)
```

A reader should trace: `queue[0]` (parent) → memoized sentence selection (new pure module) → the active mode sub-component reads `chosenSentence`/`displayedSentence`/`fillSentence` as props → user grades → mode calls `onGrade(rating)` prop → parent's unchanged `submitReview` runs the Phase-13-hardened FSRS/save/undo pipeline → queue advances → new `item` flows back down.

### Recommended Project Structure
```
lib/
├── sentence-selection.ts     # NEW — pure: selectSentence(), hashStr() (moved from StudySession.tsx)
components/
├── StudySession.tsx           # Slimmed: queue/stats/undo/save-retry + useMemo call + mode dispatch
├── FlashcardMode.tsx           # NEW — flip card, Exposure/Recall front, 4-button grade bar
├── MultipleChoiceMode.tsx      # NEW — options grid, MC auto-advance, Next button
├── FillBlankMode.tsx           # NEW — input, Wrong/Correct grade bar
tests/
├── sentence-selection.test.ts # NEW — mirrors tests/sequence.test.ts / sentence-match.test.ts style
```

### Pattern 1: Pure-module extraction (matches `lib/sequence.ts` / `lib/sentence-match.ts` house style)
**What:** A `.ts` file (no `'use client'`, no React import) exporting typed pure functions with a leading JSDoc block documenting the algorithm, call sites, and purity guarantee.
**When to use:** Any render-body logic with zero DOM/hook dependency, per this codebase's established convention (`lib/card-key.ts`, `lib/sequence.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`, `lib/habit.ts` all follow this shape).
**Example (house style, from `lib/sentence-match.ts`, lines 1–26):**
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
export interface MatchResult { found: boolean; index: number; safeToBlank: boolean }
export function sentenceMatch(korean: string, targetForm: string): MatchResult { /* ... */ }
```
**New module should mirror this exactly** — see the recommended signature in Pitfall/Code Examples below.

### Pattern 2: `useMemo` for render-derived pure computation (matches existing `mcOptions`, line 305, and `seed`, line 173, in the SAME file)
**What:** Wrap an expensive-but-pure derivation in `useMemo(() => ..., [deps])` so it recomputes only when its real inputs change, not on every unrelated re-render (typing in the fill-blank input, MC selection, `exampleOffset` bump, `cardHeight` measurement all currently trigger a full re-render of `StudySession` and, today, a full re-run of the `chosenIdx` IIFE).
**When to use:** Exactly this case — the phase's whole PERF-03 requirement.
**Example (existing precedent in the same file, `mcOptions`):**
```typescript
// Source: components/StudySession.tsx lines 305-336 (current file)
const mcOptions = useMemo(() => {
  if (mode !== 'multiple-choice' || queue.length === 0) return []
  const item = queue[0]
  // ...
  return seededShuffle([...distractors, current.back], seed + cardSeed * 31)
}, [mode, queue, seed, cards])
```

### Anti-Patterns to Avoid
- **Memoizing on the `?? []` fallback array as the sole dependency:** `cardSentences = realCard?.sentences ?? []` creates a *new* empty-array reference on every render when `realCard` is null (practice cards) or has no sentences. This is harmless for correctness (the memoized function returns `-1`/`null` instantly either way) but means the memo does zero work-saving for that path — not a bug, just note it in the plan so nobody "fixes" it into a false problem.
- **Splitting `revealed` state per mode:** `revealed` is read by both Flashcard and Fill-Blank (not Multiple Choice, which uses `mcSelected` instead) and drives the shared `handleKeyDown` keyboard-shortcut dispatch (lines 648–685) and the shared `handleReveal` (which also calls `previewIntervalLabels`). Do not duplicate `revealed` into each mode component's local state — it must stay a single parent-owned value passed down as a prop, or keyboard shortcuts and the reveal-triggered `intervalHints` computation silently desync from what's displayed.
- **Re-implementing `hashStr` inside the new pure module AND leaving a second copy inside `StudySession.tsx` for `mcOptions`:** `mcOptions` (line 310) calls `hashStr(item.card.id)` / `hashStr(item.card.front)` independently of the sentence-selection tie-break's `hashStr(realCard!.id)` (line 408). If `hashStr` is extracted, both call sites must import it from the new module — a duplicated second `hashStr` would drift and violate "single source of truth" conventions used everywhere else in this codebase (`normalizeFront`, `sentenceMatch`, etc. each have exactly one implementation).

## Don't Hand-Roll

Not applicable — there is no "problem" here with an off-the-shelf library solution (memoization of a mode-select-and-highlight algorithm over ≤3 sentences is intentionally simple/hand-written, matching the rest of `lib/`). No library replaces this domain-specific logic.

## Runtime State Inventory

> Triggered nominally by "any... refactor" but does not apply substantively here — this is a structural code decomposition (splitting a component, extracting a pure function, adding a memo), not an identifier/string rename that could leave stale references in external systems.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB schema, key names, or stored identifiers change | None |
| Live service config | None — no n8n/Datadog/external service config involved | None |
| OS-registered state | None — no OS-level task/process registration involved | None |
| Secrets/env vars | None — no env var names change | None |
| Build artifacts | None — component/module rename is internal to the repo; no installed package or egg-info references `StudySession.tsx`'s internal structure | None |

**Nothing found in any category** — verified by inspecting the phase scope (component decomposition + one new `lib/` file) and confirming no identifiers referenced by Prisma schema, Setting-table keys, env vars, or OS state are touched.

## Common Pitfalls

### Pitfall 1: The roadmap's illustrative `[cardSentences, reps]` dependency array is incomplete
**What goes wrong:** If the planner copies `[cardSentences, reps]` literally, the memo will return a **stale** selection when the SAME sentences array happens to be reused across two different cards (not actually possible today since each card has its own `sentences` array — but `reps` alone, without card identity, cannot disambiguate "did the card change" from "did reps change on the same card"), or — more subtly — will fail to recompute `needsBlank`-driven behavior if a future change makes `flashcardSubMode`/`mode` able to change within a mounted session (they currently cannot, per `Props`, but a memo dependency list should still name every value read inside the memoized function for correctness, not just the ones that happen to vary today).
**Why it happens:** The roadmap prose says "e.g." (illustrative), not a binding spec; ROADMAP.md phase description is intentionally non-prescriptive about exact deps and defers detail to research/planning.
**How to avoid:** Use `[cardSentences, realCard?.id, reps, needsBlank]` — every free variable the current `chosenIdx` IIFE (lines 399–420) actually reads (`cardSentences`, `realCard!.id` via `hashStr`, `reps` via `realCard!.review?.reps`, and `needsBlank` which gates the blank-safety branch). `sentenceMatch`/`cardSentences[tierIdx].korean`/`.targetForm` are derived from `cardSentences` itself, not independent inputs.
**Warning signs:** A live UAT session where switching Flashcard Exposure↔Recall (which flips `needsBlank`) mid-session doesn't change which sentence is picked — but this specific case can't actually surface today since `flashcardSubMode` is a fixed prop (not toggleable mid-session per current `Props`/`ModeSelector` flow) — still, name it as a dependency for correctness/future-proofing, not because it's reachable today.

### Pitfall 2: Losing the "single source of truth" for `hashStr` during extraction
**What goes wrong:** `hashStr` (module-level function, lines 83–94) is called from TWO independent spots: the sentence-selection tie-break (line 408) and `mcOptions`' distractor seeding (line 310, twice). If REFACTOR-02 moves the sentence-selection IIFE into `lib/sentence-selection.ts` but leaves a duplicate `hashStr` behind in `StudySession.tsx` for `mcOptions` to keep using, the codebase now has two hash implementations that must be kept in sync forever — directly contradicting this repo's stated pattern (`lib/card-key.ts`'s `normalizeFront` docstring: "single source of truth").
**Why it happens:** `hashStr` is a small, self-contained utility that's easy to overlook as "shared" because its two call sites look unrelated (sentence tie-break vs. MC option shuffling).
**How to avoid:** Export `hashStr` from the new `lib/sentence-selection.ts` module (or a smaller shared `lib/hash.ts` if the planner prefers a more generic home) and have `StudySession.tsx`'s `mcOptions` import it from there instead of keeping a local copy.
**Warning signs:** `grep -n "function hashStr" .` returning more than one file after the refactor.

### Pitfall 3: Treating the sticky action-bar JSX as "shared" when its contents are 100% mode-specific
**What goes wrong:** The outer wrapper `<div className="sticky bottom-[...] ...">` (line 980) is visually identical across modes, tempting a "keep it in the parent, pass buttons as children" design — but the *actual* button content, grading semantics, and count differ completely per mode (Flashcard: 4 buttons Again/Hard/Good/Easy calling `submitReview(1..4)`; MultipleChoice: a single conditional "Next →" calling `advanceMc(mcRating)`; FillBlank: 2 buttons Wrong/Correct calling `submitReview(1)`/`submitReview(3)`). A naive split that moves only the "card face" into sub-components but leaves ALL action-bar branches (lines 981–1061) in the parent recreates the exact same giant conditional block REFACTOR-01 is meant to eliminate.
**Why it happens:** The wrapper `<div>` markup literally is shared (same Tailwind classes), inviting confusion between "shared markup" and "shared logic."
**How to avoid:** Decide explicitly (flagged in Open Questions below, since no CONTEXT.md locks this) whether each Mode component renders its OWN full wrapper `<div>` (small ~5-line markup duplication ×3, but each mode is then fully self-contained per REFACTOR-01's success criterion 3) — this is the RECOMMENDED approach, since duplicated static Tailwind wrapper markup is cheaper to maintain than a leaky shared-slot abstraction with no existing precedent in this codebase (no render-prop/children-slot pattern exists elsewhere in `components/`).
**Warning signs:** A `FlashcardMode` component that still needs a `mode === 'multiple-choice'` branch inside it — a sign the split boundary was drawn in the wrong place.

### Pitfall 4: Breaking Phase 13's undo-snapshot ordering by moving state ownership
**What goes wrong:** `submitReview` (lines 470–585) captures `undoRef.current = { cardId, prevState, prevQueue, prevStats, prevSeenCount, prevSeenCardIds }` **before** advancing the queue (a comment at line 542 calls this out as "critical ordering"). If REFACTOR-01 moves any of `stats`, `seenCount`, `seenCardIdsRef`, or `queue` ownership into a mode sub-component (they must not — see Architectural Responsibility Map), this ordering guarantee silently breaks and `handleUndo`'s atomic restoration (REVIEW-05, Phase 13) regresses.
**Why it happens:** A mechanical "split by mode" pass can accidentally scope shared session state to whichever mode component happens to read it first.
**How to avoid:** `queue`, `cursor`, `stats`, `seenCount`/`seenCardIdsRef`, `canUndo`/`undoRef`, `saveError`/`isMountedRef`, `submitReview`, `handleUndo`, `postReviewWithRetry` all stay in `StudySession.tsx` (the parent) exactly as-is; only pass already-computed, already-derived values (current card, `chosenSentence`, `revealed`, `hints`, callbacks) down as props.
**Warning signs:** Any new `useState`/`useRef` inside `FlashcardMode.tsx`/`MultipleChoiceMode.tsx`/`FillBlankMode.tsx` that duplicates a name already in the parent's state list.

## Code Examples

### Exact current sentence-selection logic (to be extracted verbatim, then generalized into a pure function)
```typescript
// Source: components/StudySession.tsx lines 399-420 (current file, read in full for this research)
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
```

**Real inputs (free variables read inside):** `cardSentences: Sentence[]` (each `{ id, korean, targetForm, translation, unknownCount? }`), `realCard!.id: string`, `realCard!.review?.reps: number | null | undefined`, `needsBlank: boolean`. **Depends on:** `sentenceMatch` (`lib/sentence-match.ts`, already pure) and `hashStr` (module-level in `StudySession.tsx` today, lines 83–94).

**Downstream consumers of `chosenIdx`/`chosenSentence` (all currently inline in `StudySession.tsx`, NOT part of the extraction — these stay in the component, just re-derived from the extracted function's output):**
- `chosenSentence = chosenIdx >= 0 ? cardSentences[chosenIdx] : null` (line 423)
- `showBareFront` (lines 429–434) — Flashcard-Exposure-only, reads `chosenSentence?.unknownCount`
- `displayedSentence` (lines 437–439) — Flashcard back face, further offset by `exampleOffset` (cycling, NOT part of selection — keep separate)
- `chosenMatch`/`useChosenForFill` (lines 442–445) — Fill-blank gate
- `recallBlanked` (lines 448–450) — Flashcard-Recall front
- `fillSentence`/`fillTranslation`/`fillAnswer`/`fillCorrect` (lines 453–462) — Fill-blank mode

### Recommended new pure module signature
```typescript
// Source: NEW FILE lib/sentence-selection.ts (author from research findings above)
// Mirrors lib/sequence.ts header-comment convention.

export interface SelectableSentence {
  korean: string
  targetForm: string
  unknownCount?: number
}

/** FNV-1a hash — moved here from components/StudySession.tsx (single source of truth,
 *  used by both the tie-break below and StudySession's mcOptions distractor seeding). */
export function hashStr(s: string): number { /* body unchanged from current lines 87-94 */ }

/**
 * Picks which sentence to show for a card: least-unknown-word tier, tie-broken
 * by a per-card hash rotation that varies with review count (reps), with an
 * optional blank-safety override for modes that must highlight/blank a single
 * unambiguous span. Pure — no Date.now()/Math.random(); safe to call in render
 * or memoize with useMemo.
 */
export function selectSentence(
  sentences: SelectableSentence[],
  cardId: string,
  reps: number,
  needsBlank: boolean
): number /* index, or -1 if no sentences */ {
  // body = current chosenIdx IIFE, generalized to take params instead of closure reads
}
```

### Recommended `useMemo` call site (StudySession.tsx, post-extraction)
```typescript
// Source: components/StudySession.tsx (post-refactor)
const chosenIdx = useMemo(
  () => selectSentence(cardSentences, realCard?.id ?? '', realCard?.review?.reps ?? 0, needsBlank),
  [cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]
)
```
Note: `realCard?.review?.reps` is included directly (not the pre-extracted `reps` local) so the dependency list is self-documenting about the real source field — matches the style of `mcOptions`' dependency array (line 336) naming the actual props/state read.

## State of the Art

Not applicable — no external framework/library version drift is relevant to this phase. React 19's `useMemo` semantics used here are unchanged from the version already running in production.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `flashcardSubMode`/`mode` cannot change within a single mounted `StudySession` instance (only set once via `ModeSelector` before the session starts) | Pitfall 1, Architecture Patterns | If a future change makes these live-toggleable mid-session without remounting, `needsBlank` must be re-verified as a genuinely necessary memo dependency (it already is included in the recommendation, so risk is low — this only affects whether the dependency was "necessary" or "defensive") |
| A2 | The `sticky` action-bar wrapper `<div>` should be duplicated per mode component rather than kept as a shared parent slot (no render-prop/slot pattern exists elsewhere in this codebase) | Pitfall 3, Recommended Project Structure | If the planner instead introduces a new shared-slot abstraction, it should be treated as a deliberate new pattern requiring its own justification, not treated as "no decision needed" |

*A1 and A2 are both **not** blocking — resolved in this document based on established codebase precedent (Props shape and lack of any slot/render-prop pattern elsewhere), not user confirmation. No CONTEXT.md exists for this phase per orchestrator instructions (discuss-phase skipped), so these two calls are made from code inspection and flagged here for the planner/plan-checker to double-check against the live file rather than silently accepted.*

## Open Questions

1. **Where does the sticky action-bar markup live after REFACTOR-01?**
   - What we know: the outer `<div className="sticky bottom-...">` wrapper (line 980) is visually identical across modes; the button content inside is 100% mode-specific (see Pitfall 3).
   - What's unclear: whether the planner wants each Mode component to render its own full wrapper (duplicated ~5 lines of Tailwind classes ×3) or introduce a new shared "action bar slot" pattern not currently used anywhere in this codebase.
   - Recommendation: duplicate the wrapper per mode component (Pitfall 3) — lowest risk, no new abstraction, matches "no barrel files / no render-prop precedent" conventions already in `.claude/CLAUDE.md` Conventions.

2. **Does `hashStr` move to `lib/sentence-selection.ts` or a smaller dedicated `lib/hash.ts`?**
   - What we know: it's currently used by both sentence-selection (line 408) and `mcOptions` (line 310) — a cross-cutting utility, not sentence-selection-specific in nature (it's a generic string hash).
   - What's unclear: whether "sentence-selection" is a semantically odd home for a generic hash utility that `mcOptions` (a Multiple-Choice concern, not sentence-selection) also needs.
   - Recommendation: either is fine functionally; placing it in `lib/sentence-selection.ts` (co-located with its primary caller) is the lower-ceremony choice and avoids a one-function file — the planner may choose to split it out if it prefers stricter single-responsibility naming.

3. **Does the new pure module need a `Card`/full `Sentence` type import, or a minimal structural type?**
   - What we know: `StudySession.tsx` defines local `Sentence`/`Card` interfaces (lines 16–43) that are NOT exported from any shared `lib/dto.ts` type (per `CLAUDE.md`, `CardDTO`/`SentenceDTO` exist in `lib/dto.ts` for the RSC boundary, but `StudySession`'s own local interfaces are looser/component-specific, e.g. no `id` requirement on `Sentence` beyond what's used).
   - What's unclear: whether the new module should import `SentenceDTO` from `lib/dto.ts` (tighter coupling to the DTO contract) or define its own minimal structural interface (`{ korean, targetForm, unknownCount? }`) as shown in Code Examples above.
   - Recommendation: minimal structural interface (as drafted above) — matches `lib/sequence.ts`'s own pattern of defining a narrow `SeqCard`/`SeqEdge` interface rather than importing the full Prisma-adjacent DTO, keeping the pure module decoupled from the DTO layer's evolution.

## Environment Availability

Skipped — no external tool/service/runtime dependency is introduced or required by this phase (pure in-repo TypeScript/React refactor; existing `vitest`/`node`/`npm` toolchain already verified present via `package.json` and prior phases).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (`vitest.config.ts`, `environment: 'node'`) |
| Config file | `/Users/main/Documents/claude-test/vitest.config.ts` |
| Quick run command | `npx vitest run tests/sentence-selection.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REFACTOR-02 | `selectSentence()` picks the least-unknown tier, tie-breaks by `(hashStr(id)+reps) % candidates.length`, and overrides to the first blank-safe sentence when `needsBlank` | unit | `npx vitest run tests/sentence-selection.test.ts` | ❌ Wave 0 — new file |
| PERF-03 | Sentence selection recomputes only when `[cardSentences, realCard?.id, reps, needsBlank]` change, not on every render | manual (no component-test infra exists) | N/A — see note below | N/A |
| REFACTOR-01 | `StudySession` renders each mode through a dedicated sub-component; live behavior (flip/grade/undo/toggle/switch) unchanged | manual (UAT) | N/A — see note below | N/A |

**Note on PERF-03/REFACTOR-01 being manual-only:** `vitest.config.ts` runs with `environment: 'node'` and the project has **no** `@testing-library/react`/`jsdom` dependency installed [VERIFIED: `package.json` inspection] — there is no component-rendering test infrastructure in this codebase today, and `REQUIREMENTS.md`'s "Out of Scope" table explicitly excludes "UI component test coverage" as a separate future initiative. This is consistent with the phase's own Success Criterion 5, which only names "the new sentence-selection tests" as an automated-test requirement — memoization and mode-split behavior are verified via live UAT (flip/grade/undo/toggle/mode-switch) and code review (confirming `useMemo` + correct dependency array), not a new automated test harness. Adding `@testing-library/react` to close this gap would itself be new scope beyond this phase's requirements.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/sentence-selection.test.ts`
- **Per wave merge:** `npm test` (full suite — `sequence.test.ts`, `card-key.test.ts`, `proficiency.test.ts`, `known-words.test.ts`, `habit.test.ts`, `lesson-excerpt.test.ts`, `sentence-match.test.ts`, plus the new `sentence-selection.test.ts`)
- **Phase gate:** Full suite green + `npm run lint` clean, before `/gsd-verify-work` (live UAT of flip/grade/undo/toggle/mode-switch per Success Criterion 4)

### Wave 0 Gaps
- [ ] `tests/sentence-selection.test.ts` — covers REFACTOR-02 (new file; no existing coverage of this logic since it currently lives inline in a component render body, untestable in isolation today)

*Test cases this new file should include (derived from the exact algorithm above, mirroring `tests/sequence.test.ts`'s fixture-helper + `describe`/`it` style):*
- Picks the sentence with the lowest `unknownCount` when tiers differ
- Among tied-lowest-`unknownCount` sentences, rotates by `(hashStr(id) + reps) % candidates.length` (assert two different `reps` values can select two different candidates when there are ≥2 tied candidates)
- Returns `-1` for an empty sentence array
- When `needsBlank=true` and the tier pick is NOT blank-safe (single-char or repeated `targetForm`), falls back to the first blank-safe sentence in the array
- When `needsBlank=true` and NO sentence is blank-safe, gracefully degrades back to the tier pick (does not throw, does not return `-1`)
- When `needsBlank=false`, never invokes the blank-safety override path (tier pick returned even if unsafe)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Unchanged — no auth surface touched by this refactor |
| V3 Session Management | No | Unchanged |
| V4 Access Control | No | Unchanged |
| V5 Input Validation | No (unchanged) | `fillInput` comparison (`normalizeAnswer`) is untouched by this refactor — moves verbatim into `FillBlankMode`, no new validation surface introduced |
| V6 Cryptography | No | Not applicable |

### Known Threat Patterns for this stack
None newly applicable — this phase introduces no new API route, no new user input path, and no new external data ingestion. All data flowing through the new pure module and sub-components originates from the same already-trusted server-fetched `CardDTO`/`SentenceDTO` shapes the current code already renders. `security_enforcement: true` / ASVS L1 is satisfied by "no new attack surface" — no threat table entries are generated for a pure structural refactor.

## Sources

### Primary (HIGH confidence)
- `components/StudySession.tsx` (read in full, 1065 lines) — exact current sentence-selection logic, mode-specific vs. shared state, Phase 13 hardening (`postReviewWithRetry`, `isMountedRef`, `saveError`/`Toast`, atomic `handleUndo`) [VERIFIED: codebase read]
- `lib/sequence.ts`, `lib/sentence-match.ts`, `lib/known-words.ts` — pure-module JSDoc header + named-export conventions [VERIFIED: codebase read]
- `tests/sequence.test.ts`, `tests/sentence-match.test.ts` — Vitest test-file conventions (fixture helpers, `describe`/`it` nesting, comment-linked requirement IDs) [VERIFIED: codebase read]
- `components/ModeSelector.tsx`, `components/HighlightedSentence.tsx`, `components/AudioButton.tsx` — existing sibling client-component composition patterns [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — phase scope, sequencing note, Out-of-Scope table (UI test coverage exclusion), Phase 13/14 decision log [VERIFIED: codebase read]
- `package.json`, `vitest.config.ts` — confirms no `@testing-library/react`/jsdom, `environment: 'node'` [VERIFIED: codebase read]
- `npm view react version`, `npm view vitest version` — 19.2.7 / 4.1.9 latest, matches installed [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- [react.dev — eslint-plugin-react-hooks purity lint](https://react.dev/reference/eslint-plugin-react-hooks/lints/purity) — confirms `react-hooks/purity` flags `Math.random()`/`Date.now()`/`new Date()` in render, allows impure calls in event handlers/effects/one-time `useState` initializers [CITED: react.dev]

### Tertiary (LOW confidence)
None — no unverified web-search-only claims used in this document.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; installed versions verified directly against npm registry
- Architecture: HIGH — based on direct, full read of the target file plus three existing analogous pure-module/test-file pairs already in this exact codebase
- Pitfalls: HIGH — derived from tracing every free variable/call-site of the target logic in the actual source, not general React folklore

**Research date:** 2026-07-02
**Valid until:** No expiry driver (internal refactor, no external API/version dependency) — re-verify only if `components/StudySession.tsx` changes again before this phase executes (e.g., an unplanned hotfix landing between research and planning)
