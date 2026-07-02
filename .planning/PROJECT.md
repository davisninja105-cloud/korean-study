# Korean Study — Foundation-First Study

## What This Is

A personal Korean spaced-repetition study app (Next.js + Prisma/Turso, Claude-powered card extraction from a tutor's Google Doc, FSRS scheduling, sentence-centric study, TTS, tap-to-gloss, habit tracking). The app's "foundation-first" promise is real — a learner is never quizzed on a word before its building blocks, and new words are introduced bare before sentence context. The UI has been systematically audited and polished: a warm, encouraging study loop, a three-state home hero, a complete semantic design-system token layer, and full accessibility baseline. The app now also feels instant: every main route shows a content-shaped skeleton on navigation, the cards/study/home/habits pages hydrate with real data on first server-rendered paint (no empty-state flash), `/api/cards/due` runs its queries concurrently, and grading a card during study advances the queue with no perceptible delay.

## Core Value

When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context. If everything else fails, this must hold.

## Current State

**Shipped:** v1.2 Performance & Snappiness (2026-07-01)

The app is deployed and fully functional. v1.2 eliminated the blank/empty-state flash across every main route: skeleton loading screens on navigation (Phase 9), RSC + DTO server-side hydration for cards, study, home, and habits pages (Phases 10–12), concurrent Prisma queries in `/api/cards/due` (Phase 10), and an optimistic client-side FSRS flow that removes grade-button jitter during study (Phase 11). v1.1 (shipped 2026-06-29) completed a systematic UI audit and polish pass — design-system tokens, warm study-loop copy, and accessibility baseline remain in place underneath this milestone's work.

**Next:** Planning next milestone (run `/gsd-new-milestone`)

## Requirements

### Validated

- ✓ Instant skeleton feedback on navigating to cards/study/habits, `bg-surface-2 animate-pulse` tokens only (SKEL-01–04) — v1.2
- ✓ Cards page hydrates from the server — real card list on first paint, no "no cards yet" flash (RSC-01) — v1.2
- ✓ Study page hydrates from the server — lands on mode-select with the correct due count, no blank loading phase (RSC-02) — v1.2
- ✓ Home page hydrates from the server — stats/activity/hero populated on first paint (RSC-03) — v1.2
- ✓ Habits page hydrates from the server — streak/totals/heatmap populated on first paint (RSC-04) — v1.2
- ✓ All server→client prop boundaries use DTO types; no raw Prisma `Date` crosses the boundary (RSC-05) — v1.2
- ✓ `/api/cards/due` runs its Prisma queries concurrently via `Promise.allSettled`, with graceful degradation on partial failure (DB-01) — v1.2
- ✓ Card flip, grade buttons, and audio have no re-fetch/recompute jitter during an active session — optimistic client-side FSRS (UX-01) — v1.2
- ✓ Full UI/UX audit: 27 findings across 7 screens × 6 dimensions, P0/P1/P2 classified — v1.1
- ✓ Complete design-system token sweep: `--muted`, `--border`, fixed dark highlight; zero gray-* utilities — v1.1
- ✓ Study session polish: "Card N of Total" counter, warm haptic grade differentiation, Korean line-height 1.7, smooth inter-card fade — v1.1
- ✓ Home dashboard three-state hero (due / goal-met / caught-up), elevated greeting — v1.1
- ✓ iOS safe-area fix via frozen `--sab` variable + 44px touch targets across nav and secondary screens — v1.1
- ✓ Full accessibility baseline: aria-labels, reduced-motion gates, global tap-highlight suppression — v1.1
- ✓ Cards, Habits, Settings, and navigation refinement — Phase 07 (safe-area fix, 44px touch targets, typography hierarchy, active press states)
- ✓ Home dashboard visual polish — Phase 06 (three-state hero, elevated greeting, F-07 active states)
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

(None yet — run `/gsd-new-milestone` to define the next milestone's requirements)

**Deferred performance candidates** (raised during v1.2, not committed to any milestone):
- Pagination or virtual scroll for the cards list (RSC conversion already removed first-load cost; only relevant if the deck grows much larger)
- Cross-request `unstable_cache` for DB results (staleness risk outweighed gain for this single-user app at v1.2 scale — revisit only if that tradeoff changes)
- Move `buttonColor`/`rewardColor` fetch out of `app/layout.tsx` (would require re-architecting pre-paint CSS injection)

### Out of Scope

- Reworking the FSRS algorithm or what counts as a review unit — `Card` stays the review unit; sentences remain presentation-only
- Perfect Korean tokenization — known-word counting is a *ranking* signal only, never correctness-critical (the `splitParticle` ambiguity is accepted)
- Pulling in prerequisites that fall outside an active lesson-range filter — accepted; the user scoped to those lessons
- Changes to Recall / fill-blank flows beyond benefiting from least-unknown sentence pick — bare-word-first applies to the flashcard Exposure path only
- Cross-request caching (`unstable_cache`) for DB results — staleness risk outweighs gain for a single-user app — v1.2
- Real-time updates / WebSockets — no requirement for live data; study sessions are atomic — v1.2

## Context

- Deployed at https://korean-study-five.vercel.app. Codebase map in `.planning/codebase/`; conventions in `CLAUDE.md`.
- v1.0 shipped 2026-06-26: ~431 lines added across `lib/sequence.ts`, `lib/known-words.ts`, `tests/sequence.test.ts`, `tests/known-words.test.ts`, `app/api/cards/due/route.ts`, `components/StudySession.tsx`, `CLAUDE.md`.
- v1.1 shipped 2026-06-29: 20 commits across 7 phases. Major files touched: `app/globals.css`, `components/StudySession.tsx`, `components/Nav.tsx`, `app/layout.tsx`, `app/page.tsx`, `components/Sheet.tsx`, `components/GlossProvider.tsx`, `components/AudioButton.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx`, `app/settings/page.tsx`.
- v1.2 shipped 2026-07-01: 50 commits across 4 phases (9 plans), 2026-06-29 → 2026-07-01. Source-only diff: 24 files, +2143/-1689 lines. Established the RSC + client-shell + DTO pattern (`app/*/page.tsx` async server components → `*Client.tsx` shells) reused across cards, study, home, and habits. New shared modules: `lib/dto.ts` (CardDTO/SentenceDTO/ReviewDTO/LessonDTO/StatsDTO/ActivityDTO), `lib/study-cards.ts` (`getStudyCards`), `lib/dashboard.ts` (`getStats`/`getActivityData`) — all single sources of truth reused by both the RSC pages and the legacy API routes they used to power exclusively.
- Key fix discovered during Phase 1 (v1.0): `card.nextReview` was `undefined` for real cards because the route uses `include: { review: true }` — due-date lived at `card.review.nextReview`. Added `nextReviewMs()` helper.
- Known-word threshold is state ≥ 1 (seen at least once), not ≥ 2. One prior review unlocks in-context presentation.
- Design-system token pattern established in v1.1: every new token must appear in 3 globals.css blocks; validate with grep == 3 hits.

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
| Hero state derived from parallel activity + stats fetch | heroState = derived state (not fetched state); avoids double-render jitter; `Promise.resolve().then()` satisfies react-hooks/set-state-in-effect | ✓ Shipped in Phase 06 |
| loadActivity is mount-only (not called after sync) | Activity data doesn't change during sync; calling it was a RESEARCH-identified pitfall | ✓ Confirmed in Phase 06 code review |
| iOS safe-area: freeze `env()` into `--sab` CSS variable at mount, consume everywhere via `var(--sab,0px)` | `env(safe-area-inset-bottom)` resets to 0px after Next.js `<Link>` navigation; a JS-written CSS variable on `<html>` survives route transitions | ✓ Phase 07 — Nav.tsx useEffect + pre-paint `<script>` in layout.tsx |
| 44px touch target rule does not apply to compact toggle switches | Forcing min-h-[44px] on `<button role="switch">` elongated the toggle visually; the natural h-7 proportion is correct; rule applied to nav tabs, view toggles, swipe-delete only | ✓ Phase 07 UAT finding — reverted and excluded from docs |
| No new npm packages for entire v1.1 milestone | Tailwind v4 CSS keyframes + existing tokens covered all polish needs; zero bundle cost | ✓ Delivered — entire v1.1 done with CSS only |
| `aria-label` preferred over `title` on icon buttons | `title` attribute not reliably read by screen readers (WCAG F-12) | ✓ Phase 08 — Undo and all icon buttons use aria-label |
| Every new CSS animation must have a `prefers-reduced-motion` counterpart in the same commit | Motion should never surprise users who have opted out; caught at audit (A11Y-02) | ✓ Phase 08 — established as invariant for future work |
| Strict severity discipline: only P0/P1 fixed in v1.1; P2 and structural findings deferred | Prevents scope creep; keeps milestone focused on what users feel | ✓ Shipped — P2/structural items in backlog |
| DTO pattern: every server→client prop boundary types Dates as ISO strings/numbers, never raw Prisma `Date` | Next.js RSC serialization throws or silently breaks on non-plain objects crossing the boundary | ✓ Shipped in Phase 10, enforced as the standing pattern in Phases 11–12 (`lib/dto.ts`) |
| `/api/cards/due` parallelizes via `Promise.allSettled` (not `Promise.all`) | Pool-query failure should still 500 cleanly, but known-lemmas failure (a non-critical ranking signal) should degrade to an empty Set rather than crash the whole request | ✓ Shipped in Phase 10; noted as an improvement over the requirement's literal `Promise.all` wording |
| `submitReview` made synchronous/optimistic — FSRS computed client-side via `reviewCard()`, save is fire-and-forget | Eliminates the 100–200ms grade-button jitter; the server write can safely lag the UI since FSRS state is deterministic | ✓ Shipped in Phase 11; undo restores the pre-grade snapshot including `revealed=false` (fixed post-UAT, commit `2bdbe67`) |
| RSC pages start client shells in their "ready" state (`select-mode`, populated hero, etc.) instead of a `loading` phase, fed by props | Removes the blank/loading flash entirely — the server render already has the data, so there's nothing to wait for on mount | ✓ Shipped across Phases 10–12 (`CardsClient`, `StudyClient`, `HomeClient`, `HabitsClient`) |
| No new npm packages for entire v1.2 milestone | Every pattern (RSC, `loading.tsx`, `Promise.allSettled`, DTO serialization) is built into Next.js 16 + React 19 | ✓ Delivered — entire v1.2 done with zero new dependencies |

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
5. **Refresh reference docs** — update root `CLAUDE.md` and `.planning/codebase/*.md` (ARCHITECTURE, STRUCTURE, CONVENTIONS, STACK, TESTING, CONCERNS, INTEGRATIONS) so they describe the codebase as it exists after this milestone, not before. Verify claims against actual source (grep/read the real files) rather than assuming prior doc content is still true — the v1.2 close found `.planning/codebase/` had drifted since 2026-06-23, including claims that predated even that milestone (e.g. "zero test coverage" when 58 Vitest tests existed). Prefer `/gsd-docs-update` scoped to these existing files over its default `docs/` scaffold, which doesn't match this project's doc layout.

---
*Last updated: 2026-07-01 — after v1.2 Performance & Snappiness milestone*
