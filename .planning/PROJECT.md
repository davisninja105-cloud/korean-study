# Korean Study — Foundation-First Study

## What This Is

A personal Korean spaced-repetition study app (Next.js + Prisma/Turso, Claude-powered card extraction from a tutor's Google Doc, FSRS scheduling, sentence-centric study, TTS, tap-to-gloss, habit tracking). The app's "foundation-first" promise is now real: a learner is never quizzed on a word before its building blocks, and a brand-new word is introduced on its own before being wrapped in a sentence.

## Core Value

When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context. If everything else fails, this must hold.

## Requirements

### Validated

- ✓ Claude-powered exhaustive card extraction from the tutor's Google Doc, deduped by `normalizedFront` — existing
- ✓ FSRS spaced-repetition scheduling with three study modes (flashcard, multiple-choice, fill-blank) — existing
- ✓ Knowledge graph: `Card.components` resolved to `CardDependency` edges at sync time — existing
- ✓ Foundation-first *reordering* of the in-session card set via `sequenceCards()` (blended depth + urgency score) — existing
- ✓ Sentence-centric cards (1–3 example sentences per card; rotation across reviews) with highlighted target form — existing
- ✓ TTS audio, tap-to-gloss, habit/streak tracking, CEFR proficiency, theming — existing
- ✓ Sessions are prerequisite-coherent: `selectSessionCards()` drags still-due, in-pool prerequisites into the session (downward-closed under the prerequisite relation), not just reshuffles — v1.0
- ✓ Session selection honors `sessionSize` *during* selection (whole-pool fetch → select → sequence; bounded overshoot) — v1.0
- ✓ Brand-new words are introduced bare (word-front first in Exposure mode); the example sentence becomes back-of-card context — v1.0
- ✓ When a sentence is shown, the one with fewest unknown (not-yet-learned) words is preferred (least-unknown ranking via `countUnknownWords`) — v1.0
- ✓ Pure helpers (`selectSessionCards`, `countUnknownWords`) are unit-tested; behavior confirmed in a real dev study session — v1.0

### Active

(None — ready for next milestone.)

### Out of Scope

- Reworking the FSRS algorithm or what counts as a review unit — `Card` stays the review unit; sentences remain presentation-only
- Perfect Korean tokenization — known-word counting is a *ranking* signal only, never correctness-critical (the `splitParticle` ambiguity is accepted)
- Pulling in prerequisites that fall outside an active lesson-range filter — accepted; the user scoped to those lessons
- Changes to Recall / fill-blank flows beyond benefiting from least-unknown sentence pick — bare-word-first applies to the flashcard Exposure path only

## Context

- Deployed at https://korean-study-five.vercel.app. Codebase map in `.planning/codebase/`; conventions in `CLAUDE.md`.
- v1.0 shipped 2026-06-26: ~431 lines added across `lib/sequence.ts`, `lib/known-words.ts`, `tests/sequence.test.ts`, `tests/known-words.test.ts`, `app/api/cards/due/route.ts`, `components/StudySession.tsx`, `CLAUDE.md`.
- Key fix discovered during Phase 1: `card.nextReview` was `undefined` for real cards because the route uses `include: { review: true }` — due-date lived at `card.review.nextReview`. Added `nextReviewMs()` helper; tests now use the real Prisma shape.
- Known-word threshold is state ≥ 1 (seen at least once), not ≥ 2. One prior review unlocks in-context presentation.

## Constraints

- **Tech stack**: Next.js 16 / React 19 / Prisma 7 + libSQL (Turso) — must fit existing architecture and conventions in `CLAUDE.md`
- **Lint**: `react-hooks/purity` — all new sentence/maturity logic must stay pure in render; lint must stay clean
- **Deploy**: Vercel Hobby 60s function limit — selection/annotation work stays cheap (bounded pool query, ≤ sessionSize × 3 sentence scans)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Selection: pull prerequisites into the session (keep most-due seeds, drag still-due prereqs in) | Makes sessions prerequisite-coherent without abandoning urgency ordering | ✓ Shipped in Phase 1 (`selectSessionCards`); seed sort corrected to use `card.review.nextReview` (CR-01) |
| Presentation: bare word first for new cards + prefer least-unknown sentences | Matches the lived problem — isolate the new word, then give readable context | ✓ Shipped in Phase 2 (`showBareFront` gate + `chosenIdx` ranking) |
| Known threshold = state ≥ 1, not ≥ 2 | One encounter is enough for a word to function as readable context | ✓ Shipped in Phase 2 (post-checkpoint revision) |
| showBareFront requires unknownCount > 0 on the chosen sentence | If context is already readable, show the sentence immediately even for a new card | ✓ Shipped in Phase 2 (post-checkpoint revision) |
| Selection and ordering stay as two separate pure functions | `selectSessionCards` chooses; `sequenceCards` orders. Composed in the route. Independently testable. | ✓ Pattern established in Phase 1 |
| take: 1000 safety bound on the pool query | Widening from `take: sessionSize` needed a DoS bound; 1000 covers realistic decks | ✓ Shipped in Phase 1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-26 after v1.0 milestone (Foundation-First Study)*
