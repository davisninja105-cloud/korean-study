# Korean Study — Foundation-First Study

## What This Is

A personal Korean spaced-repetition study app (Next.js + Prisma/Turso, Claude-powered card extraction from a tutor's Google Doc, FSRS scheduling, sentence-centric study, TTS, tap-to-gloss, habit tracking). This milestone makes the app's existing "foundation-first" promise real: a learner should never be quizzed on a word before its building blocks, and a brand-new word should be introduced on its own before being wrapped in a sentence.

## Core Value

When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context. If everything else fails, this must hold.

## Requirements

### Validated

<!-- Already shipped and relied upon (existing app). -->

- ✓ Claude-powered exhaustive card extraction from the tutor's Google Doc, deduped by `normalizedFront` — existing
- ✓ FSRS spaced-repetition scheduling with three study modes (flashcard, multiple-choice, fill-blank) — existing
- ✓ Knowledge graph: `Card.components` resolved to `CardDependency` edges at sync time — existing
- ✓ Foundation-first *reordering* of the in-session card set via `sequenceCards()` (blended depth + urgency score) — existing
- ✓ Sentence-centric cards (1–3 example sentences per card; rotation across reviews) with highlighted target form — existing
- ✓ TTS audio, tap-to-gloss, habit/streak tracking, CEFR proficiency, theming — existing
- ✓ Sessions are prerequisite-coherent: `selectSessionCards()` drags still-due, in-pool prerequisites into the session (downward-closed under the prerequisite relation), not just reshuffles — **validated in Phase 1**
- ✓ Session selection honors `sessionSize` *during* selection (whole-pool fetch → select → sequence; bounded overshoot) — **validated in Phase 1**

### Active

<!-- This milestone. Building toward these. -->

- [ ] Brand-new words are introduced bare (word-front first); the example sentence becomes back-of-card context
- [ ] When a sentence is shown, prefer the one whose other words are already known (least-unknown ranking)
- [ ] Pure helpers (`selectSessionCards`, `countUnknownWords`) are unit-tested; behavior is verifiable in a real dev study session

### Out of Scope

- Reworking the FSRS algorithm or what counts as a review unit — `Card` stays the review unit; sentences remain presentation-only
- Perfect Korean tokenization — known-word counting is a *ranking* signal only, never correctness-critical (the `splitParticle` ambiguity is accepted)
- Pulling in prerequisites that fall outside an active lesson-range filter — accepted; the user scoped to those lessons
- Changes to Recall / fill-blank flows beyond benefiting from least-unknown sentence pick — bare-word-first applies to the flashcard Exposure path only

## Context

- Brownfield: mature, deployed app (https://korean-study-five.vercel.app). Codebase map in `.planning/codebase/`; conventions in `CLAUDE.md`.
- The driving problem was felt in real study: new words buried in sentences full of unknown words, dependents quizzed before prerequisites, and example sentences too hard for the word being learned.
- Today's gaps: `app/api/cards/due/route.ts` caps selection to the most-due `sessionSize` *before* sequencing and fetches prereq edges only among the capped IDs; `components/StudySession.tsx` shows a sentence on the front whenever one exists, chosen by pure rotation with no maturity or known-word awareness.
- A detailed implementation plan already exists at repo root: `foundation-first-plan.md`.

## Constraints

- **Tech stack**: Next.js 16 / React 19 / Prisma 7 + libSQL (Turso) — must fit existing architecture and conventions in `CLAUDE.md`
- **Lint**: `react-hooks/purity` — all new sentence/maturity logic must stay pure in render (no `Date.now()`/`Math.random()` during render); lint must stay clean
- **Deploy**: Vercel Hobby 60s function limit — selection/annotation work must stay cheap (bounded pool query, ≤ sessionSize × 3 sentence scans)
- **Compatibility**: `sequenceCards()` already ignores out-of-session edges, so passing whole-pool edges is safe; preserve existing blank-safety rules

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Selection: pull prerequisites into the session (keep most-due seeds, drag still-due prereqs in) | Makes sessions prerequisite-coherent without abandoning urgency ordering | ✓ Shipped in Phase 1 (`selectSessionCards`); seed/urgency due-date read corrected to use the `review` relation (CR-01) |
| Presentation: bare word first for new cards + prefer known-word sentences | Matches the lived problem — isolate the new word, then give readable context | — Pending |
| Scope: the plan + small obvious follow-ons surfaced during implementation | User wants room for adjacent fixes without a separate cycle | — Pending |
| Success measured by real-study feel (tests + manual walkthrough as support) | It's a personal learning tool; the felt experience is the real bar | — Pending |

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
*Last updated: 2026-06-26 after Phase 1 (Foundation-Aware Session Selection) completion*
