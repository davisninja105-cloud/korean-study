# Stack Research

**Domain:** Self-graded "translate the sentence" production exercise (Active Recall mode) inside an existing Next.js 16 / React 19 study app — v1.7 Active Recall Study Mode
**Researched:** 2026-07-14
**Confidence:** HIGH for the zero-new-dependencies verdict (grounded in direct inspection of the installed codebase — every required primitive already exists and was read at source); LOW–MEDIUM for the ecosystem survey corroboration (web-sourced per the research seam's confidence classifier, but consistent with first-party evidence)

## Executive Answer

**Zero new dependencies. Zero stack changes. This milestone is a pure recomposition of primitives that already exist in the repo.**

The proposed Active mode — English translation shown, Korean fully hidden, tap to reveal Korean sentence + audio, self-grade on the FSRS bar — is structurally *simpler* than the two modes being deleted. It is the classic Anki "Basic (and reversed card)" production-direction pattern: prompt in L1, learner mentally composes the L2 answer, reveal, honest self-grade. An ecosystem survey confirms **no established React library exists for this UI pattern**, and none is wanted: every mainstream implementation (Anki itself, Synapse, Quanta, self-hosted Flashcards apps) builds the reveal-then-grade surface from app-local components on top of a scheduling library — which this app already has (`ts-fsrs` 5.3.1 via `lib/fsrs.ts`). The self-graded-reveal choice also sidesteps the one thing that *would* have required new machinery: typed-answer auto-scoring of free-form sentence translation has no canonical string match (many valid Korean renderings of one English sentence) and would demand fuzzy matching or LLM judging — deliberately out of scope per the milestone definition, and correctly so.

Concretely, a new `ActiveRecallMode.tsx` is a strict subset-plus-rearrangement of the existing `FlashcardMode.tsx` (read at source, 262 lines): the same flip-card container, the same sticky action bar with `Show Answer` → Again/Hard/Good/Easy, the same `HighlightedSentence` + `AudioButton` back face — with the front face swapped from Korean sentence to `sentence.translation` (English) and all Korean/audio withheld until reveal. The net milestone diff is likely **negative** (deleting `MultipleChoiceMode.tsx` (106 lines), `FillBlankMode.tsx` (137 lines), the distractor logic in `StudySession.tsx`, and the 3-mode grid in `ModeSelector.tsx`).

## Recommended Stack

### Core Technologies (all already installed — listed for integration clarity, not installation)

| Technology | Version | Purpose in this milestone | Why it already covers the need |
|------------|---------|---------------------------|-------------------------------|
| `next` | 16.2.1 (installed) | No change — `/study` RSC + `StudyClient` shell unchanged | Mode selection is purely client-side state inside `StudyClient`/`StudySession`; no new routes, no API changes |
| `react` | 19.2.4 (installed) | New `ActiveRecallMode.tsx` presentational component | Same "pure presentation, parent owns state" contract as `FlashcardMode.tsx` (its header comment documents this explicitly: sub-components own no session state, sole hook is `useWordTap()`) |
| `ts-fsrs` | 5.3.1 (installed) | Grading unchanged | Active mode reuses the exact same `onGrade(rating)` → optimistic `reviewCard()` → fire-and-forget `POST /api/review` path. FSRS is direction-agnostic: `Card` stays the review unit regardless of prompt direction |
| Tailwind CSS | 4.2.2 (installed) | Passive/Active toggle styling | The Exposure/Recall sub-toggle in `ModeSelector.tsx` (lines 42–66) is already a two-segment pill built from `bg-surface-3`/`bg-surface-1` tokens — the new Passive/Active toggle is the same component pattern promoted to top level |

### Existing primitives that compose the feature (the real "stack")

| Primitive | File | Role in Active mode |
|-----------|------|---------------------|
| Flip card + dynamic height | `FlashcardMode.tsx` / `StudySession.tsx` (`frontRef`/`backRef` + measuring `useLayoutEffect`) | Reuse as-is — thread the same refs through `ActiveRecallMode` props |
| FSRS grade bar (Again/Hard/Good/Easy + mastery hints) | `FlashcardMode.tsx` lines 202–259 (sticky action bar) | Copy per the established convention — Pitfall 3 from the v1.3 refactor research says each mode owns its full sticky action-bar wrapper, **no shared slot abstraction**. Do not extract a shared GradeBar as part of this milestone |
| Revealed Korean sentence + highlight | `components/HighlightedSentence.tsx` + `lib/sentence-match.ts` | Back face only. Front face must render **no Korean at all** — including no `AudioButton` (audio is an answer leak) |
| Audio on reveal | `components/AudioButton.tsx` | Mount on the back face next to the revealed sentence, exactly as `FlashcardMode`'s back face does today |
| Tap-to-gloss | `useWordTap()` from `GlossProvider.tsx` | Back face only (revealed Korean is tappable; the English prompt is not) |
| Sentence choice + `unknownCount` | `lib/sentence-selection.ts` (pure, memoized in parent) | Reuse the parent's `chosenSentence`/`displayedSentence` memos unchanged; the prompt is `chosenSentence.translation` |
| Optimistic grading + undo + retry | `StudySession.tsx` (`submitReview`, `postReviewWithRetry`, snapshot undo) | Untouched — Active mode calls the same `onGrade` prop |
| Mode selection state | `components/ModeSelector.tsx` (`StudyMode` type, `onSelect` signature) | The change surface: `StudyMode` collapses from `'flashcard' | 'multiple-choice' | 'fill-blank'` to a Passive/Active concept; `FlashcardSubMode` (`'exposure' | 'recall'`) is deleted along with its sub-toggle |

## Installation

```bash
# Nothing. Zero packages added or removed.
# (Deleting MultipleChoiceMode/FillBlankMode removes code, not dependencies —
#  no package exists solely for those modes.)
```

## Alternatives Considered

| Recommended | Alternative | When the alternative would make sense |
|-------------|-------------|----------------------------------------|
| Self-graded reveal (build from existing primitives) | Typed-answer input + auto-scoring (string/fuzzy match) | Only for single-word or cloze answers with one canonical form. Free-form sentence translation has many valid Korean renderings — string match would punish correct answers, and the milestone explicitly chose self-grading. Anki community consensus: honest self-grading is the load-bearing scheduler input; typed input is an optional discipline aid, not a correctness mechanism |
| Self-graded reveal | LLM-judged answer scoring (Claude grades the user's typed Korean) | A plausible *future* milestone (the Claude API + haiku model are already integrated), but it changes the interaction cost per card (typing Korean on mobile), adds latency + per-review API cost, and undermines the optimistic-grading instant-advance UX shipped in v1.2. Not this milestone |
| New `ActiveRecallMode.tsx` sub-component | Adding an `active` branch inside `FlashcardMode.tsx` | The v1.3 refactor (REFACTOR-01) deliberately split modes into focused components; a mode-within-a-mode branch would re-tangle what Phase 15 untangled. Follow the established one-file-per-mode pattern |
| Prompt = `sentence.translation` | Prompt = `card.back` (English gloss of the word alone) | `card.back` is the right **fallback** for cards whose chosen sentence lacks a translation (the `Sentence.translation` field is optional — `FlashcardMode` line 163 guards `displayedSentence?.translation &&`). Sentence-level production is the primary experience; word-level production is the degraded path, not the default |

## What NOT to Use / Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any flashcard/SRS UI npm package | None exists at meaningful adoption for the reveal-then-self-grade React pattern (ecosystem survey, 2026-07: results are full apps — Synapse, Quanta — not composable component libraries). Anything found would be low-download, unmaintained, and style-incompatible with the semantic token system | The existing `FlashcardMode` composition, per this project's proven zero-new-packages pattern (v1.1, v1.2 both shipped entire milestones dependency-free) |
| `react-card-flip` or animation libraries (framer-motion etc.) | The 3D flip with dynamic height already exists in `globals.css` (`card-flip-container`/`card-flip-inner`) + the parent's measuring `useLayoutEffect`, with reduced-motion handling already wired | Reuse the existing flip CSS |
| Fuzzy string matching libs (fastest-levenshtein, fuse.js) | Only needed for typed-answer scoring, which this milestone explicitly excludes | Nothing — self-grading needs no matching |
| Korean NLP/tokenization additions | Out of scope per PROJECT.md standing decision ("Perfect Korean tokenization" is explicitly out of scope; `splitParticle` ambiguity accepted) | Existing `lib/sentence-match.ts` on the back face |
| DB schema changes | `Sentence.translation` already stores the English prompt; `Card.distractors` is deprecated-in-place (write path removed, column kept — same treatment as `clozeSentence`/`clozeAnswer`) | No DDL. This avoids the Turso manual-DDL gotcha entirely |
| A shared `<GradeBar>` extraction | Tempting during the mode consolidation, but the v1.3 refactor explicitly rejected a shared action-bar slot abstraction (documented in `FlashcardMode.tsx`'s header as RESEARCH Pitfall 3) | Each mode owns its full sticky action bar; with only 2 modes remaining the duplication is small and intentional |

## Integration Map (explicit change surface)

1. **`components/ModeSelector.tsx`** — the largest UX change, smallest code change. Replace the 3-mode grid + Exposure/Recall sub-toggle with a Passive/Active segmented control (reuse the existing sub-toggle's pill styling). `StudyMode` type narrows; `FlashcardSubMode` deleted. `onSelect` signature simplifies — every call site is in `StudyClient.tsx`.
2. **`components/StudySession.tsx`** (837 lines today) — delete distractor-selection logic and the `multiple-choice`/`fill-blank` render branches; add the `active` branch rendering `ActiveRecallMode`. The queue, undo snapshots, optimistic `submitReview`, sentence memos, and card-height measurement all stay. **Net deletion.** One decision to surface in planning: whether Active mode keeps the bare-word-first gate (`showBareFront`) — for production practice the equivalent question is "what's the prompt when the sentence has no translation or the card is brand-new?" → fall back to `card.back`.
3. **New `components/ActiveRecallMode.tsx`** — clone of `FlashcardMode.tsx` structure. Front: `sentence.translation` (or `card.back` fallback) in English, "Compose the Korean" helper copy, **no Korean text, no AudioButton, no tap-to-gloss**. Back: identical to FlashcardMode's back face (revealed `HighlightedSentence` + `AudioButton` + `card.front`/`card.back`/notes + "See another example"). Action bar: copied Show Answer → grade bar.
4. **Deletions** — `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`, their tests, the `distractors` write in `lib/extract-cards.ts`'s pipeline (column stays, prompt may stop requesting distractors — flag for the extraction-prompt owner: removing the field from `ExtractionSchema` is safe for zod but check `normalizeExtractedCards`).
5. **`lib/fsrs.ts` / `POST /api/review` / `ReviewLog`** — untouched. Grading direction is invisible to FSRS.
6. **E2E** — `e2e/grade-flow.spec.ts` drives the flashcard mode via `data-testid` (`mode-flashcard`, `reveal-btn`, `grade-*`); the mode-select testids will change with the new toggle. Budget a spec update in the phase plan (keep the same testid names on the new controls where possible to minimize churn).

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| ts-fsrs 5.3.1 | This feature, unchanged | The v1.6 `learningSteps` persistence fix must be preserved — Active mode reviews flow through the same `reviewCard()` path, so no new risk |
| next 16.2.1 / react 19.2.4 | This feature, unchanged | `react-hooks/purity` applies: any prompt-fallback choice logic that reads time/randomness belongs in the existing memoized sentence-selection layer, not in `ActiveRecallMode` render |

## Sources

- Direct source inspection (HIGH confidence — first-party): `components/ModeSelector.tsx`, `components/FlashcardMode.tsx`, `components/StudySession.tsx` (line counts), `.planning/PROJECT.md` (v1.7 milestone definition, v1.1/v1.2 zero-new-packages precedent, REFACTOR-01/Pitfall-3 shared-slot rejection)
- Ecosystem survey via WebSearch (LOW per seam classifier, corroborative only): [awesome-fsrs](https://github.com/open-spaced-repetition/awesome-fsrs), [GitHub spaced-repetition topic](https://github.com/topics/spaced-repetition), [Synapse](https://github.com/Emadab/Synapse) — confirmed no composable React library for self-graded reveal UI; all matches are full applications
- Self-grading vs typed-answer practice (LOW per seam classifier, consistent with training knowledge of Anki's "Basic (and reversed card)" template): [Anki Forums — reverse cards](https://forums.ankiweb.net/t/reverse-cards-in-random-mode/18533), [Anki spaced-repetition method guide](https://18kenglish.com/spaced-repetition-english-vocabulary-anki/)

---
*Stack research for: v1.7 Active Recall Study Mode (self-graded production exercise)*
*Researched: 2026-07-14*
