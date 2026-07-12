# Korean Study — Foundation-First Study

## What This Is

A personal Korean spaced-repetition study app (Next.js + Prisma/Turso, Claude-powered card extraction from a tutor's Google Doc, FSRS scheduling, sentence-centric study, TTS, tap-to-gloss, habit tracking). The app's "foundation-first" promise is real — a learner is never quizzed on a word before its building blocks, and new words are introduced bare before sentence context. The UI has been systematically audited and polished: a warm, encouraging study loop, a three-state home hero, a complete semantic design-system token layer, and full accessibility baseline. The app now also feels instant: every main route shows a content-shaped skeleton on navigation, the cards/study/home/habits pages hydrate with real data on first server-rendered paint (no empty-state flash), `/api/cards/due` runs its queries concurrently, and grading a card during study advances the queue with no perceptible delay. The app is also hardened against failure: the two authenticated write routes never throw unhandled 500s, background review saves retry silently before surfacing a toast, undo restoration is atomic, sync failures name the specific lesson that broke, and `StudySession.tsx` is decomposed into focused, independently-testable mode components with memoized sentence selection. The knowledge graph is now trustworthy — a deterministic deck-lookup filter stops Claude from hallucinating prerequisite edges — and every review is durably, idempotently logged to an append-only `ReviewLog`, browsable on a dedicated `/history` page. The deck also stays fresh on its own: a daily Vercel Cron job triggers an automatic sync with no manual trigger required, behind a fail-closed bearer-token auth check. The extraction pipeline produces well-formed, study-safe cards by construction (native structured outputs + code-enforced blank-safety), the existing deck has been audited and high-confidence issues fixed in place, and two known reliability gaps are closed: silent known-lemmas degradation is now observable in logs, and forward-reference dependency edges relink automatically after every clean sync with new lessons — retiring the manual relink script.

## Core Value

When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context. If everything else fails, this must hold.

## Current State

**Shipped:** v1.5 Extraction Quality & Reliability (2026-07-10)

The app is deployed and fully functional. v1.5 audited the extraction pipeline for card-quality issues, hardened the extraction code path with native structured outputs and code-enforced blank-safety, revised the extraction prompt against audit findings and validated it on real lessons, fixed high-confidence existing-card issues in place (9 front rewrites + 3 zero-sentence fixes), and closed two known reliability bugs: silent known-lemmas query degradation in `lib/study-cards.ts` now emits an observable `[study-cards]`-prefixed log before degrading, and forward-reference `CardDependency` edges now auto-relink inside `runSync` after every clean sync with new lessons — retiring the manual `relink-dependencies.mjs` script and consolidating three duplicated relink loops onto one shared, idempotent helper. v1.4 (shipped 2026-07-05) cleaned up the knowledge graph, made review history durable and browsable, and automated daily sync; v1.3 (shipped 2026-07-03) hardened the two authenticated write routes and refactored `StudySession`; v1.2 (shipped 2026-07-01) eliminated the blank/empty-state flash across every main route; v1.1 (shipped 2026-06-29) completed a systematic UI audit and polish pass — all remain in place underneath this milestone's work.

**Next:** v1.6 in progress — defining requirements and roadmap.

## Current Milestone: v1.6 Freshness, Performance & E2E Testing

**Goal:** Fix the RSC hydration staleness-vs-speed tradeoff (pages don't show fresh data after navigating back post-study/sync) and stand up a performance-aware test suite with real-browser E2E automation.

**Target features:**
- Diagnose & fix stale-data-on-revisit across `/`, `/cards`, `/study`, `/habits` without regressing first-load speed
- Playwright E2E test infrastructure so tests (and Claude Code itself) can drive the dev server in a real browser
- Performance regression tests (query timing / render cost) + broader E2E coverage of key flows (sync, study, cards CRUD)

<details>
<summary>v1.5 Extraction Quality & Reliability (archived 2026-07-10)</summary>

## Current Milestone: v1.5 Extraction Quality & Reliability

**Goal:** Audit the extraction pipeline for card-quality issues, then close two known reliability bugs identified in `.planning/codebase/CONCERNS.md`.

**Target features:**
- Audit existing card DB for quality issues (categorization, sentence quality, components accuracy) — findings-first, then review the `extract-cards.ts` prompt against current card schema/capabilities and the DB audit findings; apply high-confidence fixes found
- Log known-lemmas query failures in `lib/study-cards.ts` (currently degrades silently to an empty Set)
- Auto-relink forward-reference `CardDependency` edges once the sync backlog fully drains (`remaining=0`) — replaces the manual `relink-dependencies.mjs` invocation

Phase 22 closed the findings-driven track: the audit's 10 findings (Phase 21) drove a prompt revision covering 4 error classes (Phase 22-02) plus 9 in-place card-front rewrites and one zero-sentence fix (Phase 22-03), each verified against the live deck by card id rather than raw counts. Phase 23 closed the two reliability bugs: known-lemmas query failure now emits an observable `[study-cards]`-prefixed log (RELIABILITY-01), and forward-reference `CardDependency` edges auto-relink inside `runSync` after every clean sync with new lessons via an idempotent pure resolver-diff + server orchestrator (RELIABILITY-02/03), retiring the manual relink script. v1.5 is now fully complete: all 12 requirements satisfied.

Full details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

## Requirements

### Validated

- ✓ SyncPanel names the specific failed lesson(s) with a safe content excerpt (not 'Lesson 1', no raw error) (SYNC-01) — Phase 14
- ✓ `normalizedFront → cardId` map cached once per sync request; no per-lesson full-deck lookup (PERF-01) — Phase 14
- ✓ Gloss cache preloaded from DB on mount via `GET /api/gloss/preload`; no LLM round-trip for already-looked-up words (PERF-02) — Phase 14
- ✓ Instant skeleton feedback on navigating to cards/study/habits, `bg-surface-2 animate-pulse` tokens only (SKEL-01–04) — v1.2
- ✓ Cards page hydrates from the server — real card list on first paint, no "no cards yet" flash (RSC-01) — v1.2
- ✓ Study page hydrates from the server — lands on mode-select with the correct due count, no blank loading phase (RSC-02) — v1.2
- ✓ Home page hydrates from the server — stats/activity/hero populated on first paint (RSC-03) — v1.2
- ✓ Habits page hydrates from the server — streak/totals/heatmap populated on first paint (RSC-04) — v1.2
- ✓ All server→client prop boundaries use DTO types; no raw Prisma `Date` crosses the boundary (RSC-05) — v1.2
- ✓ `/api/cards/due` runs its Prisma queries concurrently via `Promise.allSettled`, with graceful degradation on partial failure (DB-01) — v1.2
- ✓ Card flip, grade buttons, and audio have no re-fetch/recompute jitter during an active session — optimistic client-side FSRS (UX-01) — v1.2
- ✓ POST /api/review wrapped in try/catch — returns a generic 500 (no schema leak) on DB/FSRS failure (REVIEW-01) — Phase 13
- ✓ Rating validation rejects values outside {1,2,3,4} with a 400 before any DB/FSRS work (REVIEW-02) — Phase 13
- ✓ Card-front collision returns a friendly 400 (not raw 500) on normalizedFront collision (REVIEW-03) — Phase 13
- ✓ Background POST /api/review save retries silently (3 bounded attempts); toast only after retries exhausted (REVIEW-04) — Phase 13
- ✓ Undo restoration is mount-guarded + atomic; an interrupted undo leaves no partially-restored state (REVIEW-05) — Phase 13
- ✓ Sentence-selection logic in a pure, unit-tested module importable without rendering StudySession (REFACTOR-02) — Phase 15
- ✓ Sentence selection memoized — recomputes only on input change, not every render (PERF-03) — Phase 15
- ✓ StudySession split into FlashcardMode/MultipleChoiceMode/FillBlankMode sub-components (REFACTOR-01) — Phase 15
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
- ✓ Deterministic post-extraction `components[]` filter + prompt tightening resolves spurious prerequisite hallucinations (GRAPH-01/02/03) — Phase 16
- ✓ `retro-filter-cleanup.mts` retroactively reconciles existing `CardDependency` edges (GRAPH-04/05) — Phase 16
- ✓ `ReviewLog` table logs every review (timestamp, cardId, rating, resulting FSRS state) via idempotent transaction (HIST-01/02/03) — Phase 17
- ✓ Reverse-chronological, cursor-paginated review history page with per-card filter, RSC + DTO hydration (HIST-04/05/06/07) — Phase 18
- ✓ Vercel Cron daily auto-sync: fail-closed `CRON_SECRET` bearer auth, cron path stays inside the auth matcher, "last auto-synced" timestamp surfaced in Settings ▸ Advanced (SYNC-02/03/04) — Phase 19, deployed + confirmed via `vercel crons run`
- ✓ `extractCardsFromNotes` uses native Anthropic structured outputs (`output_config.format: zodOutputFormat(ExtractionSchema)`) reading `parsed_output` on the happy path, with truncation salvage via a pre-registered `stream.on('text')` accumulator + `AnthropicError` catch (EXTRACT-01) — Phase 20
- ✓ Truncation-salvage logic preserved as a fallback for genuine mid-stream cutoffs, adjusted for the new `{ cards: [...] }` response wrapper shape (EXTRACT-02) — Phase 20
- ✓ `parseExtractionResponse` structurally enforces blank-safety (consults `safeToBlank`, not just `sentenceMatch().found`) and rejects zero-sentence cards by code, not prompt instruction (EXTRACT-03) — Phase 20
- ✓ Read-only audit script produces a dated findings report covering blank-safety, zero-sentence, romanization leakage, distractor anomalies, `normalizedFront` inconsistency, and near-duplicate clusters (AUDIT-01) — Phase 21
- ✓ Audit checks implemented as a pure, unit-tested `lib/audit-checks.ts` (60 tests) reusing production helpers rather than reimplementing them (AUDIT-02) — Phase 21
- ✓ `extract-cards.ts` prompt revised against DB audit findings: no English descriptive labels on grammar fronts, Hangul-only 동사/형용사 disambiguation for bare-marker collisions, Hangul-only Sino-Korean root glosses, explicit loanword/acronym exception (PROMPT-01) — Phase 22
- ✓ Prompt revision validated against real lessons via a non-persisting eval script before being finalized: `frontRomanization` dropped 4→0, zero-safe/zero-sentence held at 0 (PROMPT-02) — Phase 22
- ✓ 9 audit-flagged romanized card fronts rewritten in place by id (front + normalizedFront together, zero collisions, zero Card delete/recreate) and 3 sentences added to the deck's sole zero-sentence card (FIX-01) — Phase 22
- ✓ Corpus fix script follows the dry-run-by-default / `--apply` pattern with a print-before-write DB-host check and a human approval checkpoint before any production write (FIX-02) — Phase 22
- ✓ Known-lemmas query failure in `lib/study-cards.ts` logs a `[study-cards]`-prefixed reason before degrading to an empty Set; the existing `Promise.allSettled` graceful-degradation contract is preserved (RELIABILITY-01) — Phase 23
- ✓ A sync completing with `failed === 0 && newLessons > 0` automatically relinks forward-reference `CardDependency` edges via an idempotent hook inside `runSync`, replacing the manual `relink-dependencies.mjs` invocation (RELIABILITY-02) — Phase 23
- ✓ The auto-relink pass is idempotent at both the pure layer (computeMissingEdges subtracts existing edges) and the DB layer (`@@unique` backstop); no duplicate or incorrect edges (RELIABILITY-03) — Phase 23
- ✓ A throwaway diagnostic script (`scripts/diagnose-freshness.mts`) empirically classifies all 16 route × navigation-path cells on a production build (`next build && next start`), attributing every stale cell to Router Cache reuse or client-shell `useState(initialProps)` non-resync — never left ambiguous (FRESH-01) — Phase 24
- ✓ Playwright (`@playwright/test`) configured with a production-build `webServer`, isolated from Vitest test discovery (E2E-01) — Phase 25
- ✓ Authenticated test runs via a setup-project `storageState` — no per-test login UI interaction (E2E-02) — Phase 25
- ✓ E2E tests run against an isolated, seeded `file:` SQLite test DB, structurally prevented from reaching production Turso (`assertLocalDb` allow-list guard, called at config-load and runtime) (E2E-03) — Phase 25
- ✓ Smoke spec verifies all 4 main routes render real, FIXTURE-traceable content on first paint — never a generic 200/skeleton-absence check (E2E-04) — Phase 25
- ✓ Freshness regression spec encodes the full Phase 24 16-cell diagnosis as three real Playwright spec files (9 genuinely red, 7 genuinely green, no `test.fail()`/`test.fixme()` masking); the throwaway diagnosis script retired once every reusable piece had a permanent home under `e2e/helpers/` (E2E-06) — Phase 25
- ✓ Failed test runs produce an inspectable Playwright trace and parseable line-reporter output, verified against a genuine (not synthetic) failure (E2E-07) — Phase 25

### Active

(All v1.5 requirements validated and shipped — see Validated above. v1.6 in progress: FRESH-01 shipped Phase 24; E2E-01/02/03/04/06/07 shipped Phase 25 — the harness's D-04 CR-01 re-verification found the back-forward cells' root-cause evidence pattern has shifted for 3 of 4 cells since the Phase 24 diagnosis, and `/habits post-mutation-return` is now genuinely fresh — see STATE.md Blockers/Concerns before Phase 26 planning. Remaining v1.6 requirements (E2E-05, PERF-04/05) tracked in REQUIREMENTS.md, next up is Phase 26.)

**Deferred candidates** (raised during v1.2/v1.3/v1.4/v1.5, not committed to any milestone):
- Pagination or virtual scroll for the cards list (RSC conversion already removed first-load cost; only relevant if the deck grows much larger)
- Cross-request `unstable_cache` for DB results (staleness risk outweighed gain for this single-user app at v1.2 scale — revisit only if that tradeoff changes)
- Move `buttonColor`/`rewardColor` fetch out of `app/layout.tsx` (would require re-architecting pre-paint CSS injection)
- `app/api/review/undo/route.ts` missing try/catch — same shape as the routes hardened in Phase 13, but out of scope for REVIEW-01..05 (deferred at Phase 13 close)
- Card retirement/mastery flag — considered for v1.4, deferred again (belongs in a future features milestone)
- HIST-03 (undo-cancels-in-flight-retry) has no persisted automated regression test — currently relies on a manual UAT pass; would benefit from the same route-level test technique introduced in Phase 17-05
- Broaden Nyquist validation coverage — Phases 16-18 are `nyquist_compliant: false` (informational only, not a blocker); Phase 19 is compliant

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
- v1.3 shipped 2026-07-03: 89 commits across 3 phases (6 plans, 15 tasks), 2026-07-01 → 2026-07-02. Source-only diff: 21 files, +1481/-491 lines. Sourced directly from the `.planning/codebase/CONCERNS.md` audit — no research phase. New modules: `lib/sentence-selection.ts` (pure, unit-tested sentence-selection + `hashStr`), `components/FlashcardMode.tsx`/`MultipleChoiceMode.tsx`/`FillBlankMode.tsx` (StudySession mode split), `lib/lesson-excerpt.ts` (sync failure naming), `GET /api/gloss/preload` + `getRecentGlosses` (gloss cache bootstrap).
- v1.4 shipped 2026-07-05: 148 commits across 4 phases (15 plans), 2026-07-02 → 2026-07-05. Diff since v1.3 tag: 158 files, +16292/-5754 lines. New modules: `lib/filter-components.ts` (`filterComponents` deck-lookup filter), `scripts/dry-run-filter.mjs` + `scripts/retro-filter-cleanup.mts` (corpus diagnostics/cleanup), `ReviewLog` Prisma model + `scripts/apply-reviewlog-ddl.mjs`, `lib/db-errors.ts` (`isUniqueConstraintError`, extended twice — see Key Decisions), `lib/review-history.ts` (`getReviewHistory`), `app/history/page.tsx` + `HistoryClient.tsx`, `lib/sync.ts` (`runSync`, extracted from the route), `app/api/cron/sync/route.ts`, `isValidCronAuth` in `lib/auth.ts`. A retroactive milestone-completion audit found and closed a real HIST-02 gap in Phase 17 (see `.planning/milestones/v1.4-MILESTONE-AUDIT.md`) and added the project's first persisted route-level regression test (`tests/review-route.test.ts`).
- v1.5 shipped 2026-07-10: 100 commits across 4 phases (9 plans, 20 tasks), 2026-07-05 → 2026-07-10. Diff since v1.4 tag: 153 files, +13740/-12350 lines. New modules: `lib/audit-checks.ts` (pure 11-export audit module, 60 tests), `scripts/audit-cards.mts` (read-only deck audit → dated report), `scripts/prompt-eval.mts` (non-persisting prompt eval), `lib/relink-dependencies.ts` (`relinkAllDependencies` orchestrator), `tests/link-dependencies.test.ts` + `tests/relink-dependencies.test.ts` (idempotency suites), `tests/study-cards.test.ts` (RELIABILITY-01 regression). Major changes: `lib/extract-cards.ts` (native structured outputs + `normalizeExtractedCards` shared pipeline + code-enforced blank-safety), `lib/sentence-match.ts` (word-boundary-aware single-char blank-safety), `lib/sync.ts` (auto-relink hook inside `runSync`), `lib/link-dependencies.ts` (`computeMissingEdges` pure resolver-diff). Added `zod ^4.3.6` as explicit dependency. Old `scripts/relink-dependencies.mjs` deleted (consolidated onto shared helper). Closeout: override_closeout — 3 verification overrides acknowledged (Phase 20/21 verification gaps; see STATE.md Deferred Items).
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
| Rating guard placed before the try block (pure validation); 404 kept inside try | Invalid rating short-circuits to 400 with zero DB/FSRS work; `findUnique` is a DB call that can throw so the 404 return stays inside the catch (plan prose said "outside" but binding truths required inside) | ✓ Phase 13 (REVIEW-01/02) |
| Generic 500 on `/api/review` (no schema leak); cards 500 left echoing `e.message` | Threat T-13-02: avoid internal-schema disclosure on the review route; REVIEW-03 scopes only the collision branch, so changing the cards 500 behavior would be scope creep | ✓ Phase 13 (REVIEW-03) |
| P2002-catch (not pre-update `findUnique`) for the card-front collision 400 | Matches the codebase's existing catch-based error-handling idiom; avoids an extra query per edit | ✓ Phase 13 (REVIEW-03) |
| `postReviewWithRetry`: 3 bounded attempts (1 initial + 2 retries) with ~500ms/~1500ms backoff, toast only on exhaustion | Hard-bounded so a persistent failure can't spin an unbounded request loop against the app's own API / Vercel quota (threat T-13-05) | ✓ Phase 13 (REVIEW-04) |
- ✓ Mount-guard + React 18/19 auto-batched `setState` for atomic undo (not `useReducer`) | `isMountedRef` gates the whole restoration incl. `seenCardIdsRef` write so it applies all-or-nothing; Phase 15 owns the larger StudySession refactor so this plan minimized churn | ✓ Phase 13 (REVIEW-05) |
| Toast dismiss callback held in a ref (`dismissRef`) | `setTimeout` set up once on mount, survives parent re-renders; `onDismiss` fires inside the timeout (not the effect body) — satisfies `react-hooks/set-state-in-effect` | ✓ Phase 13 |
| `keyToId` map built once per sync request (before the lesson loop), augmented incrementally during upserts — not a per-lesson full-deck `findMany` | Eliminates O(lessons × deck) DB query growth; preserves edge-creation semantics exactly (same `where: { components: { not: null } }` seed, same `cardId_prerequisiteId` compound key, self-edge skip, non-fatal per-edge try/catch) | ✓ Phase 14 (PERF-01) |
| `lessonExcerpt` extracts the first non-empty line (~48 chars, quoted) for sync failure naming; raw extraction/Prisma errors stay in `console.error`/`console.warn` only | Threat T-14-01: the user can find the failed section in their Google Doc without internal error text leaking to the client | ✓ Phase 14 (SYNC-01) |
| Gloss preload: fixed server-side `take: 300`, `gloss:` prefix scoping, per-row `JSON.parse` try/catch | Threats T-14-04/05/06: bounded payload, no app-config settings exposed, corrupt cache rows never crash the preload | ✓ Phase 14 (PERF-02) |
| `lessonExcerpt` extracted to `lib/lesson-excerpt.ts` for unit testability | Pure helper was inline in the route file; Nyquist validation gap filled by extracting + adding 9 unit tests | ✓ Phase 14 (Nyquist) |
| `@source not "../.planning"` in `globals.css` | Tailwind v4 auto-scanned `.planning/` markdown docs, found truncated class names like `pb-[env(...)]`, and generated invalid CSS; excluding the directory fixes the parse error | ✓ Phase 14 UAT |
| `isValidCronAuth` is one boolean conjunction (`typeof cronSecret === 'string' && cronSecret.length > 0 && authHeader === Bearer ${cronSecret}`), never an if/else | Eliminates any code path where a missing/empty `CRON_SECRET` could validate — fail-closed by construction (T-19-01) | ✓ Phase 19 |
| Cron auth branch sits at the very top of `middleware()`, before the cookie check, with early returns for both allow and deny | A cron request carries no `ks_auth` cookie and must get a clean 401, never a `/login` redirect | ✓ Phase 19 |
| `lastAutoSyncedAt` is GET-only on `/api/settings` — omitted from the PUT destructure entirely | Only the cron route can stamp it; a crafted client PUT can't forge a "fresh" timestamp that would mask a silently-failing cron (T-19-05) | ✓ Phase 19 |
| Rate limiting on `/api/cron/sync` explicitly out of scope; ≥16-char random `CRON_SECRET` is the sole mitigation | Single-tenant app, Vercel Hobby timeout already bounds damage — same posture as the existing shared-password auth (T-19-02, accepted) | ✓ Phase 19 |
| `vercel crons run /api/cron/sync` used to verify the deployed cron on-demand rather than waiting for the 10:00 UTC schedule | Exercises the real Vercel-invoked path (including its auto-attached `Authorization: Bearer $CRON_SECRET` header) without waiting a full day for the first real firing | ✓ Verified in Phase 19 UAT |
| `sentenceMatch`'s single-char branch rewritten to word-boundary-aware: an isolated single-char target (string-edge/whitespace/punctuation both sides) is blank-safe; an embedded one (Hangul-adjacent either side) stays unsafe | The old rule treated every single-char target as unsafe, silently dropping genuinely blank-safe cards like 다 in "밥을 다 먹었어요" | ✓ Phase 22-01 (D-01/D-02); signature unchanged, all 3 consumers inherit with zero call-site edits |
| Card 다's audit finding resolved by the `sentenceMatch` rule change alone — zero DB write | Both of 다's existing sentences already have it isolated between spaces; the milestone's "mutate in place, never delete/recreate" discipline is honored trivially when the fix is a shared predicate, not a data edit | ✓ Phase 22-01 (D-03) |
| Grammar-card fronts drop English descriptive labels entirely (present + future); bare-marker collisions disambiguate with a Korean grammar-term prefix (동사/형용사), never English | Prior audit flagged 4 fronts carrying full English labels like "Action verb ~는 + noun (present modifier)"; removing the label without disambiguation would collide two grammar points onto the same literal front string, which `Card.normalizedFront @unique` would reject | ✓ Phase 22-02 (D-06/D-07/D-08) |
| Untranslated English acronyms/loanwords used in authentic Korean speech (CRT, DST, PC방-style) are an explicit romanization exception, not a fix target | These are real Korean usage, not Latin-letter transliteration; treating them as violations would produce unnatural "fixes" and keep re-flagging forever | ✓ Phase 22-02 (D-09) — accepted, documented, expected to keep appearing in future audits |
| Corpus fix script prints the resolved DB host before any query and defaults to dry-run; `--apply` is required to write, gated behind a human-reviewed report | Threat T-22-04: an `--apply` run against the wrong environment (or without review) could irreversibly rewrite production card fronts | ✓ Phase 22-03; user approved the dry-run report as-is before the `--apply` run |
| Corpus fix script's only write paths are `card.update()` (in-place field rewrite) and `sentence.create()` (additive-only); no `card.delete`/`card.create` anywhere in the file | Threat T-22-05: a delete-and-recreate pattern would silently destroy FSRS state and `ReviewLog` history — the milestone's hard rule | ✓ Phase 22-03, verified structurally (no delete/create calls) during Phase 22 security review |
| `[study-cards]`-prefixed logging placed after the pool-rejection throw and before the empty-pool early return — visibility-before-degradation | The log must fire even when the pool is empty (zero cards returned); placing it after the pool-rejection throw and before the `cards.length === 0` early return guarantees the log always precedes the degradation | ✓ Phase 23-01 (RELIABILITY-01) |
| Auto-relink hook lives inside `runSync`, not in the route — gated on `failures.length === 0 && newLessons > 0` | Both `/api/sync` and `/api/cron/sync` call `runSync`, so both inherit auto-relink with zero route changes — cron auto-relinks for free | ✓ Phase 23-02 (RELIABILITY-02) |
| Relink failure is non-fatal: try/catch leaves `failures`/`newLessons`/`newCards` untouched | Cron stamps `lastAutoSyncedAt` only when `failed === 0`; polluting `failed` would falsely mark the sync stale. Next qualifying sync retries the relink naturally | ✓ Phase 23-02 |
| Single-source-of-truth consolidation: old `relink-dependencies.mjs` deleted; `computeMissingEdges` composes `resolveDependencyEdges` (never reimplements resolution) | The old script hand-rolled its own `normalizeFront` copy and built `keyToId` only from cards with non-null components (omitting leaf prerequisites — the CR-02 bug). One resolution implementation remains (IN-02) | ✓ Phase 23-02 |
| Two-layer idempotency: pure `computeMissingEdges` subtracts existing edges (second call returns `[]`); `@@unique([cardId, prerequisiteId])` backstops the DB layer | Pure-layer idempotency prevents redundant computation; DB-layer constraint prevents duplicate edges from read/write races between concurrent syncs | ✓ Phase 23-02 (RELIABILITY-03) |
| Diagnosis: 16-cell matrix split staleness into two distinct root causes — Router Cache reuse (5 cells: all 4 `resume` cells + `/` `back-forward`, zero RSC re-fetch at all) vs. client-shell `useState(initialProps)` non-resync (4 cells: `/study`/`/cards`/`/habits` `back-forward` + `/habits` `post-mutation-return`, RSC re-fetch happens but the mounted shell never adopts it) | The whole point of the spike — Phase 26's fix must address both mechanisms separately, not assume one bug | ✓ Phase 24; full per-cell attribution in `24-DIAGNOSIS.md` |
| The primary D-05 regression scenario (real UI grade session → Home → Study via `<Link>`) came back **Fresh**, not stale, on this build | Whatever caused the original bug report is either already fixed, or specific to back-forward/resume paths rather than plain post-session return — Phase 26 must not "fix" a path that isn't actually broken | ✓ Phase 24; `HomeClient` confirmed to never exhibit non-resync (its back-forward/resume cells are pure Router Cache reuse) — only `/habits`'s D-06 variant stayed stale |
| `back-forward` cell's `about:blank` Chromium/CDP read-time artifact is not papered over with a corrective `page.goto()` | A forced re-navigation always triggers a real fetch, which would silently convert genuine Stale-RouterCache verdicts into false "Fresh" ones — verdicts are computed from fetch-count evidence captured before the artifact appears | ✓ Phase 24; re-verified via a 4th independent full run during UAT — the goto() recovery's own trigger check never fired for any of the 4 affected cells, confirming the verdicts are untampered-with |

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
*Last updated: 2026-07-12 after Phase 25*
