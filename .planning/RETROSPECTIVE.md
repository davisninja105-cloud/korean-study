# Retrospective: Korean Study

## Milestone: v1.0 — Foundation-First Study

**Shipped:** 2026-06-26
**Phases:** 2 | **Plans:** 3

### What Was Built

- `selectSessionCards()` — cycle-safe, downward-closed DFS session selector; wired into `GET /api/cards/due` over the whole eligible pool (`take: 1000`). Prerequisites now always enter the session alongside their dependents, ordered before them.
- `countUnknownWords()` — pure tokenizer-based ranking signal; annotates each sentence with how many non-target words the learner hasn't seen yet.
- `showBareFront` gate in `StudySession.tsx` — new cards show bare Korean word when context isn't yet readable; sentence shown immediately once context is learnable.
- Least-unknown sentence selection (`chosenIdx`) — replaces pure rotation; picks the sentence with fewest unknown words, ties broken by `hashStr(id) + reps`.

### What Worked

- **TDD discipline:** RED commit → GREEN commit → integration made each plan's scope unambiguous and verification fast. Both plans closed in minutes after their GREEN commits.
- **Phase separation:** Phase 1 (selection) before Phase 2 (presentation) was the right order — Phase 2 could assume a coherent session set.
- **Pure functions everywhere:** keeping `selectSessionCards` and `countUnknownWords` as pure functions (no side effects, `now` as a parameter) meant lint stayed clean and tests were trivial to write.
- **Post-checkpoint revision loop:** the human verify step in Plan 02-02 caught an important UX refinement before ship (bare-word-only-when-context-unreadable vs. bare-word-always), and the fix was a small, targeted change.

### What Was Inefficient

- **Field shape bug (CR-01):** the planned tests used a flat `card.nextReview` fixture that doesn't match the actual Prisma response shape (`card.review.nextReview`). The bug — which would have silently broken due-date ordering in production — was only caught during the post-execution code review, not the plan's test design. Tests should match the real data shape.
- **REQUIREMENTS.md not ticked off:** the checkboxes in REQUIREMENTS.md for PRES-01..05 and QUAL-03/04 were never updated after Phase 2 shipped. Left a tracking gap that required an override_closeout.
- **Phase 2 `phase_complete` not updated in tracking:** verification step was skipped (no VERIFICATION.md authored), so `init.manager` reported Phase 2 incomplete even though all work was done.

### Patterns Established

- **Session-snapshot annotation:** annotate `unknownCount` server-side once at request time; client reads the value, never recomputes. Stable for the session lifetime.
- **`nextReviewMs(card)` helper:** relation-first (`card.review?.nextReview`) with flat fallback (`card.nextReview`) — single source of truth for reading a card's due date regardless of fetch shape.
- **Selection + ordering as two pure functions composed in the route:** `selectSessionCards` → `sequenceCards` → `NextResponse.json`. Each is independently testable; the route just wires them together.

### Key Lessons

1. Test fixtures must match the real Prisma response shape — flat fixtures hide field-shape bugs that only surface in production.
2. Tick off REQUIREMENTS.md as soon as each requirement ships, not at milestone close.
3. Write a brief VERIFICATION.md after each phase (or at least mark `phase_complete` in STATE.md) to keep `init.manager` accurate.
4. The post-checkpoint human-verify step is worth it — caught a meaningful UX distinction (bare-only-when-unreadable vs. bare-always) before the code was locked.

### Cost Observations

- Model mix: Sonnet (main session model for all execution)
- Sessions: ~3 coding sessions across 2026-06-25 and 2026-06-26
- Notable: Phase 1 was interrupted by a provider quota limit mid-execution; safe-resume closeout recovered cleanly from the committed task states without re-executing any code.

---

---

## Milestone: v1.1 — UI/UX Polish

**Shipped:** 2026-06-29
**Phases:** 7 (Phases 3–8 + 8.1) | **Plans:** 12 | **Commits:** 20

### What Was Built

- Code-only UI/UX audit producing 27 findings (F-01..F-27) across 7 screens × 6 dimensions; P0 gate section confirmed before downstream phases began
- Design-system token foundation: `--muted`, `--border`, dark-mode highlight fix; zero gray-* utilities remaining across 20+ files
- Study session: "Card N of Total" counter, warm haptic grade split, Korean line-height 1.7, smooth inter-card fade
- Home dashboard three-state hero derived from parallel `/api/activity` + stats fetch; elevated greeting; active press states
- iOS safe-area: `--sab` CSS variable frozen at mount, extended to Nav, layout, Sheet, StudySession; 44px touch targets across secondary screens
- Full accessibility baseline: aria-labels, reduced-motion counterparts, global tap-highlight suppression, 14-screen dark-mode regression approval

### What Worked

- **Dependency-driven phase order:** Audit → Tokens → Study → Home → Nav → A11y worked cleanly. Each phase had clear inputs from the previous one. No phase needed to be redone because a dependency shipped incomplete.
- **Code-only audit:** Reading source files directly (no screenshots or live browser) produced concrete, grep-verifiable findings. Every finding could be confirmed with a shell command. Eliminated ambiguity about whether an issue was "fixed" or not.
- **Wave parallelization:** Phases 7 and 8 each had two fully independent plans with zero file overlap. Running them as waves doubled throughput at the cost of zero coordination.
- **Inline code review cycle:** The post-execution code review step (finding WR-x/CR-x items) caught real bugs (double setState, color debounce race, res.ok checks) that automated lint wouldn't. Worth the extra pass.
- **--sab pattern discovery:** The iOS `env()` reset-on-navigation bug was a non-obvious platform quirk. The frozen CSS variable pattern is now documented and extended to all affected components.

### What Was Inefficient

- **Audit gap in Phase 8.1:** The NAV-01 gap (Sheet/StudySession using live `env()`) was caught at audit time, not during Phase 7 execution. The Phase 7 scope was "Nav + layout" but should have done a corpus-wide grep for all `env(safe-area-inset-bottom)` usages before planning. Added a full-corpus grep step as a pre-planning habit.
- **No VERIFICATION.md for Phases 3 and 4:** Both phases closed correctly but left the audit tool reporting "no VERIFICATION.md." A 5-minute retroactive verification pass would have avoided the `gaps_found` audit status. The evidence existed (SUMMARY grep tables); it just wasn't consolidated.
- **44px toggle regression:** Phase 7 applied `min-h-[44px]` to the reading-aid toggle switch, which elongated the visual. Required a revert commit. Better pre-planning: 44px applies to tap targets (links, buttons with discrete actions), not state toggles with a visual switch metaphor.

### Patterns Established

- **3-block CSS token rule:** every new token must appear in all 3 globals.css blocks (light `:root`, `@media dark`, `[data-theme="dark"]`); validate with `grep -c` == 3 before committing.
- **Reduced-motion gate in same commit:** every new `@keyframes` animation ships with its `prefers-reduced-motion: reduce` counterpart in the same diff. Never split these.
- **Corpus-wide grep before scoping a fix:** when fixing a pattern (like `env()` usage), grep all source files for the pattern first, not just the planned scope. Prevents leaving stragglers.
- **`aria-label` over `title` on icon buttons:** `title` is not reliably announced by screen readers (WCAG F-12). Always use `aria-label`.

### Key Lessons

1. Scope fixes corpus-wide: grep for the broken pattern across all files before writing the plan, not just in the target components.
2. Write VERIFICATION.md even for doc-only phases — a 5-minute pass eliminates false "no verification" audit flags.
3. Touch targets (44px) apply to discrete tap/click affordances (links, action buttons), not continuous-value widgets (toggle switches, sliders). Document this distinction explicitly in the plan.
4. The code review step (post-execution WR/CR pass) consistently catches bugs that lint misses — keep it in the workflow.

### Cost Observations

- Model mix: Sonnet (main session model throughout)
- Sessions: ~4 coding sessions across 2026-06-27 to 2026-06-29
- Notable: wave parallelization in Phases 7 and 8 was effective — independent plans ran back-to-back with zero coordination overhead. The per-plan code review added ~15% time but caught multiple real bugs.

---

## Milestone: v1.2 — Performance & Snappiness

**Shipped:** 2026-07-01
**Phases:** 4 (Phases 9–12) | **Plans:** 9 | **Commits:** 50

### What Was Built

- Three static `loading.tsx` route-segment skeletons (`/cards`, `/study`, `/habits`) using `bg-surface-2 animate-pulse` exclusively — instant feedback on client-side navigation
- Cards, study, home, and habits pages all converted from `'use client'` mount-effect fetches to async RSC + client-shell + DTO pattern — real data arrives in the initial HTML, no empty-state/blank-loading flash on first paint
- `/api/cards/due` parallelizes its pool + known-lemmas Prisma queries via `Promise.allSettled`, with graceful per-query degradation on partial failure
- Optimistic, synchronous `submitReview` — FSRS computed client-side via `reviewCard()`, save is fire-and-forget — eliminates the prior 100–200ms grade-button jitter
- Shared `lib/dto.ts`, `lib/study-cards.ts`, `lib/dashboard.ts` modules extracted as single sources of truth, reused by both the new RSC pages and the API routes that used to own that logic exclusively

### What Worked

- **Pattern-once, reuse-everywhere:** establishing the RSC + client-shell + DTO pattern in Phase 10 (45min for the pattern-establishing plan) let Phases 11 and 12 move fast — plan durations dropped to single-digit minutes once the pattern existed to copy.
- **`Promise.allSettled` over the literally-specified `Promise.all`:** the requirement said `Promise.all`, but the executor recognized that a pool-query failure and a known-lemmas-query failure have different correct behaviors (500 vs. graceful empty-Set degradation) and used `allSettled` instead. Correctly judged as an improvement, not a deviation.
- **Wave parallelization on zero-file-overlap plans:** Phase 11 (11-01 + 11-03) and Phase 12 (12-02 + 12-03) both ran independent plans concurrently with no coordination cost — same pattern that worked in v1.1 Phases 7/8.
- **Live UAT catching what static verification can't:** Phase 11's UAT session found a real bug (undo showed the card's back face, not front) that no amount of grep/TypeScript/lint checking would have caught — it's a runtime state-transition bug, only observable by actually using the app.

### What Was Inefficient

- **RSC paint-timing and jitter claims are fundamentally unverifiable by static analysis, and only 2 of 4 phases got a live check.** Phases 10 and 11 both scored `human_needed` in VERIFICATION.md because "no blank flash" / "no perceptible jitter" are runtime, human-observable properties — but only Phase 11 (and Phase 12) actually got a live UAT pass to close that gap. Phase 10's RSC-01/RSC-05 claims and Phase 9's entire VERIFICATION.md remained unexercised in a browser through milestone close. Budget a live UAT pass for every phase that makes a paint-timing or interaction-feel claim, not just some of them.
- **UAT status field left stale after the fix landed.** Phase 11's UAT found and diagnosed the undo bug, and the fix was committed (`2bdbe67`) — but `11-UAT.md`'s `status` frontmatter field was never bumped off `diagnosed`. Milestone close had to manually cross-reference git log against the UAT file to confirm the fix actually shipped.
- **REQUIREMENTS.md checkboxes left unticked again.** SKEL-01–04 shipped with 4/4 automated checks passing in Phase 9's SUMMARY, but the REQUIREMENTS.md checkboxes stayed `[ ]` until milestone close caught it. This is the same failure mode called out in the v1.0 retrospective (PRES-01..05) — it recurred a full milestone later, meaning the "tick off immediately" lesson didn't stick as a habit.

### Patterns Established

- **RSC page → client shell via prop-initialized `useState`, no initial-load `useEffect`:** the standard shape for every page needing server-hydrated data (`CardsClient`, `StudyClient`, `HomeClient`, `HabitsClient`).
- **DTO serialization boundary:** every Prisma `DateTime` field is `.toISOString()`'d before crossing the server→client prop boundary; typed as `string` in the DTO interface. No raw `Date` objects ever cross.
- **Shared `lib/` pipeline modules as single sources of truth:** extract the data-fetching logic once (`getStudyCards`, `getStats`, `getActivityData`) and have both the RSC page and the legacy API route call the same function — avoids logic drift between the two callers.
- **`Promise.allSettled` + per-query fallback as the standard resilience pattern:** critical-path query failures propagate (500); non-critical ranking/annotation query failures degrade gracefully (empty result) instead of crashing the request.

### Key Lessons

1. When a phase's success criteria include paint-timing or "feels instant" claims, plan for a live UAT/browser pass explicitly in that phase — don't let verification stop at `human_needed` and move on. Two of four phases here didn't get one.
2. When a UAT run diagnoses and fixes a bug, update the UAT file's `status` field in the same commit as the fix. Treat it like updating a test's expected result — the tracking doc should never lag the code.
3. This is the second milestone in a row (v1.0, now v1.2) where shipped requirements sat unticked in REQUIREMENTS.md until close. The habit of ticking off checkboxes immediately after a phase's SUMMARY confirms them still hasn't stuck — worth turning into an automated post-SUMMARY step rather than relying on manual discipline.
4. Investing in the shared pattern early (Phase 10) measurably paid down phase duration in Phases 11–12 — when a milestone's phases are structurally similar (four page conversions to the same target shape), front-load the pattern-establishing work even if it makes the first phase slower.

### Cost Observations

- Model mix: Sonnet (main session model throughout)
- Sessions: spanning 2026-06-29 to 2026-07-01 (~3 days)
- Notable: wave parallelization on zero-overlap plans continued to pay off (Phase 11, Phase 12); the pattern-reuse effect was the dominant efficiency factor — plan durations went from 45min (pattern-establishing) to single-digit minutes (pattern-reusing).

---

## Milestone: v1.3 — Reliability & Hardening

**Shipped:** 2026-07-03
**Phases:** 3 (Phases 13–15) | **Plans:** 6 | **Tasks:** 15

### What Was Built

- `/api/review` hardened: rating range guard (400, zero DB/FSRS work) + try/catch generic 500 on DB/FSRS failure; `PUT /api/cards/[id]` maps Prisma P2002 collisions to a friendly 400
- Bounded silent-retry wrapper (`postReviewWithRetry`, 3 attempts, ~500ms/~1500ms backoff) for the background review save, with a hand-rolled token-styled `Toast` shown only on exhaustion
- Mount-guarded atomic undo restoration — queue/stats/seen-card set/cursor/revealed apply as one all-or-nothing unit
- Sync failures name the specific failed lesson via a content excerpt (`lessonExcerpt`, extracted to `lib/lesson-excerpt.ts` for testability); raw errors confined to server-side logs
- Request-scoped `keyToId` map (`normalizedFront → cardId`) built once per sync request instead of a per-lesson full-deck `findMany`
- Bounded `getRecentGlosses` + `GET /api/gloss/preload` — mount-time DB→ref cache preload in `GlossProvider`, keyed by `normalizeFront` to match the server's DB key
- Pure, unit-tested `lib/sentence-selection.ts` (`selectSentence` + single-source `hashStr`, 8 Vitest cases) memoized via `useMemo` in `StudySession`
- `StudySession.tsx`'s 300-line per-mode conditional split into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` presentational components

### What Worked

- **Audit-sourced milestone, zero research phase:** every fix approach was already specified in `.planning/codebase/CONCERNS.md` (written at v1.2 close), so v1.3 skipped straight to planning. This was the fastest milestone yet (~89 commits across 2 days, 3 phases) precisely because there was no ambiguity to research.
- **Risk-ordered phase sequencing:** server-side correctness first (Phase 13), then sync visibility/caching (Phase 14), then the StudySession structural refactor last (Phase 15) — sequencing the refactor after the behavior-changing fixes meant Phase 15 only had to *preserve* already-verified behavior (retry wrapper, atomic undo) instead of reworking it mid-refactor.
- **Extract-then-split ordering within Phase 15:** pulling `lib/sentence-selection.ts` out and memoizing it (REFACTOR-02 + PERF-03) *before* splitting into mode sub-components (REFACTOR-01) avoided restructuring the selection logic twice — the mode split just imported the already-stable module.
- **Live UAT on the structural refactor:** Phase 15's human UAT (flip/grade/undo/mode-switch across all 3 modes) was the load-bearing check for "behavior preserved exactly" — no static check (TypeScript, lint, unit tests) can confirm a big-bang component split didn't change runtime behavior.
- **UAT was clean across all 3 phases:** 2/2, 3/3, 4/4 passed with 0 issues found — the first milestone where every phase's UAT passed on the first pass with no diagnosed bugs to fix before close.

### What Was Inefficient

- **`app/api/review/undo/route.ts` deferred, not fixed:** it has the identical missing-try/catch shape that Phase 13 hardened in `/api/review` and `/api/cards/[id]`, but was explicitly out of scope for REVIEW-01..05. A corpus-wide grep for "routes missing try/catch" at Phase 13 planning time (the same lesson from v1.1's NAV-01 straggler) would have caught this sibling route before it became a carried-forward deferred item.
- **A pending todo surfaced mid-milestone stayed open through close:** Phase 14 UAT surfaced spurious `components` in Claude's card extraction (unrelated grammar patterns attached to sentences, creating wrong `CardDependency` edges) — correctly filed as a todo rather than scope-crept into Phase 14, but it sat as an open item the pre-close audit had to surface and the operator had to explicitly acknowledge rather than being triaged into or out of v1.3 scope at the time it was found.

### Patterns Established

- **Validate before try, fail generically inside it:** untrusted numeric/body-field validation happens as pure guards before any `try` block (zero DB/engine work on bad input); once inside the try, DB/engine failures return a generic message (raw error `console.error`'d server-side only) — established across `/api/review` and reused verbatim by the sync route's error handling.
- **P2002-catch over pre-write existence check:** unique-constraint collisions are handled by catching Prisma's `P2002` in the write's own try/catch, not a separate `findUnique` pre-check — matches the codebase's existing catch-based idiom and avoids an extra query per write.
- **Ref-only mount-time cache preload:** bulk-preloading a cache into a `useRef` Map inside a `useEffect(..., [])` with no `setState` in the effect body is the standard shape for warming a client cache from the DB on mount (`react-hooks/set-state-in-effect` safe, StrictMode-safe via idempotent `Map.set`) — used by the gloss preload, reusable for any future mount-time cache warm.
- **Extract-and-memoize before decomposing:** when a component needs both a pure-module extraction and a structural split, do the extraction + memoization first as its own plan, then decompose using the now-stable extracted module — avoids touching the same logic twice.

### Key Lessons

1. When hardening a route for a specific requirement (REVIEW-01..05), grep for structurally identical sibling routes (same missing try/catch, same validation gap) at planning time and either fold them in or explicitly log them as a deferred item immediately — don't let them surface as a surprise at a later phase's UAT or at milestone close.
2. A bug-fix/hardening milestone sourced directly from a prior milestone's audit doc (`CONCERNS.md`) can skip the research phase entirely and still ship cleanly — the audit already did the research. This is a repeatable milestone shape worth reusing whenever a `CONCERNS.md`-style audit exists.
3. Sequencing a structural refactor (Phase 15) after the behavior-changing fixes that touch the same file (Phase 13) — rather than interleaving them — meant the refactor's only job was "preserve," not "preserve and also change." This is a generalizable rule for any milestone that both fixes behavior and restructures code in the same file.
4. Todos filed mid-milestone from UAT findings (like the spurious-components extraction bug) need an explicit triage decision (fold in / new milestone / backlog) at the time they're filed, not just at the next milestone-close audit — reduces the "acknowledge and defer" ceremony at close.

### Cost Observations

- Model mix: Sonnet (main session model throughout)
- Sessions: spanning 2026-07-01 to 2026-07-02 (~2 days, fastest milestone to date)
- Notable: zero research phase (audit-sourced), all 6 plans totaled ~53 minutes of measured execution time — the lowest total-time milestone so far, consistent with "fix approaches already specified" removing design/research overhead entirely.

---

## Milestone: v1.4 — Knowledge Graph Quality & History

**Shipped:** 2026-07-05
**Phases:** 4 (Phases 16–19) | **Plans:** 15 | **Tasks:** 35

### What Was Built

- `lib/filter-components.ts`'s `filterComponents()` — a pure, two-phase deck-lookup filter (`normalizeFront` direct match, then `splitParticle` stem fallback) that drops any Claude-claimed prerequisite that doesn't resolve to a real card, replacing the prior "trust whatever Claude returns" behavior
- `scripts/retro-filter-cleanup.mts` — dry-run-by-default retroactive corpus cleanup; production run rewrote 511 cards, pruned 2 stale `CardDependency` edges, added 4 newly-valid ones
- `ReviewLog` Prisma model (append-only, `idempotencyKey` UNIQUE) written inside the same atomic transaction as the `CardReview` update, with client-generated idempotency keys threaded through the retry loop and an `AbortController` that cancels in-flight retries on undo
- `/history` — reverse-chronological, cursor-paginated, per-card-filterable review history page (RSC + DTO + client-shell hydration, matching the established v1.2 pattern) plus a Habits-page FSRS-state breakdown
- Daily Vercel Cron auto-sync: fail-closed `CRON_SECRET` bearer check (`isValidCronAuth`), a cron-specific branch in `middleware.ts` ahead of the cookie gate, `GET /api/cron/sync`, and a passive "Last auto-synced" status line in Settings
- `lib/db-errors.ts`'s `isUniqueConstraintError()` — extended twice in the same milestone to recognize two distinct real error-classification shapes for the identical underlying SQLite UNIQUE-constraint violation (see What Was Inefficient)
- `tests/review-route.test.ts` — the project's first persisted route-level regression test, invoking the real `POST /api/review` handler against a local SQLite file DB

### What Worked

- **Dependency-driven phase order held up under audit:** Phase 16 (filter fix) before Phase 19 (cron) meant an unattended cron-triggered sync could never re-persist hallucinated components; the integration checker independently confirmed this wiring end-to-end during the milestone audit with zero gaps.
- **`vercel crons run <path>` for on-demand cron verification:** rather than waiting for the real 10:00 UTC schedule, the CLI's on-demand trigger exercises the identical Vercel-invoked path (including its auto-attached `Authorization: Bearer $CRON_SECRET` header) — closed Phase 19's human-verification UAT items in minutes instead of up to a day.
- **The milestone audit's retroactive-verification path caught a real, live bug:** Phase 17 had shipped and closed on 2026-07-04 with no `VERIFICATION.md` ever generated. Backfilling it during the `/gsd-audit-milestone` pass — rather than rubber-stamping a "phase complete" status — surfaced a genuinely reproducible 500 in the exact code path (`POST /api/review` idempotency) the phase existed to harden. This is the audit doing its actual job, not a formality.
- **Independent re-verification, not trusting the fixer's own SUMMARY:** after the gap-closure plan (17-05) executed, re-verification used a freshly-written reproduction script (not the persisted test the same execution had just written) plus a byte-diff confirming the route file was untouched — this is what made the "passed" status trustworthy rather than circular.

### What Was Inefficient

- **The same idempotency bug had to be found and fixed twice.** UAT Test 6 (2026-07-04) found the first shape (raw unclassified `DriverAdapterError`) and Plan 17-04 fixed it — but with zero persisted regression test, so the fix's coverage was never protected going forward. The milestone-completion audit (2026-07-05) then found a second, distinct shape (classified P2002 with `meta.target` undefined) that the first fix's `.cause`-only traversal never visited. Only after the second fix (17-05) did a real regression test (`tests/review-route.test.ts`) finally exist for this path. **Root cause:** both discoveries were made via ad hoc, throwaway reproduction (a manual curl replay, then a debug-session script), and neither one turned itself into a persisted test at the time it was found — so the underlying detection gap kept re-manifesting until a plan was explicitly scoped to add the test, not just the fix.
- **A phase can silently ship without its own VERIFICATION.md.** Phase 17's 4 original plans + UAT completed and the phase was marked complete in ROADMAP.md/STATE.md without the verification step ever producing an artifact — this went unnoticed until the milestone-audit's phase-verification read found the file simply missing. Nothing in the day-to-day phase-completion flow flagged this at the time.
- **Nyquist validation coverage is partial:** 3 of 4 phases (16, 17, 18) are `nyquist_compliant: false` in their own VALIDATION.md — informational only this milestone (not a blocker), but a recurring gap worth closing before it accumulates further.

### Patterns Established

- **Deck-lookup, never sentence-text containment, for resolving claimed prerequisites:** abstract grammar-pattern notation (e.g. `~(으)면`) never appears verbatim in a conjugated sentence, so any future "does this component actually apply here" check must resolve via `normalizeFront`/`splitParticle` deck lookup, not substring matching against example text.
- **Idempotency-key detection logic belongs in one pure helper, generalized as new error shapes are found — not re-solved per shape at the route level.** Both fixes this milestone extended the same `lib/db-errors.ts` function rather than adding parallel special-case branches in `app/api/review/route.ts`; the route needed zero changes for either fix.
- **When a route-level bug is found via ad hoc reproduction (curl replay, debug script), the very next step is to persist that reproduction as a real test file** — not just fix the code and move on. This milestone's second fix only broke the "found by hand, then regresses" cycle once the test became a checked-in artifact.
- **Retroactive/backfill verification should independently re-derive evidence, never just re-read the fixer's own SUMMARY.md** — a fresh reproduction script plus a byte-diff of the "should be unchanged" files is what makes a post-gap-closure "passed" status actually mean something.

### Key Lessons

1. A phase closing without a `VERIFICATION.md` is a silent failure mode of the phase-completion flow, not a soft warning — it should be treated as blocking at milestone-audit time (as it now has been), and ideally caught earlier, at the phase-transition step itself.
2. A bug found via a one-off reproduction script or curl replay is not "fixed" until a persisted regression test exists for it — the fix and the test are two separate deliverables of the same gap-closure plan, not one.
3. `/gsd-audit-milestone`'s retroactive-verification path is not a formality when a phase artifact is missing — it should actually re-derive the phase's claims from scratch (as it did here), because "the phase's plans and UAT all passed" is not the same guarantee as "the phase's VERIFICATION.md passed."
4. Vercel-specific on-demand tooling (`vercel crons run <path>`) is worth reaching for before defaulting to "wait for the real schedule" — it collapsed a would-be multi-hour UAT wait into an immediate check.

### Cost Observations

- Model mix: Sonnet (main session), Opus (planner for the gap-closure plan), Haiku (checker, codebase mappers)
- Sessions: spanning 2026-07-02 to 2026-07-05 (~3 days)
- Notable: the single largest cost driver this milestone was NOT the 4 originally-planned phases — it was the retroactive Phase 17 re-verification + gap-closure round (diagnose → plan → check → execute → re-verify) triggered by the milestone-completion audit, which took roughly as long as executing a small phase from scratch. Catching the missing-VERIFICATION.md gap earlier (at Phase 17's own close) would have amortized this cost across the milestone instead of concentrating it all at the very end.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Key Pattern | Main Pitfall |
|-----------|--------|-------|-------------|--------------|
| v1.0 Foundation-First Study | 2 | 3 | Pure functions + TDD RED→GREEN | Fixture shape mismatch hid a field-shape bug |
| v1.1 UI/UX Polish | 7 | 12 | Dependency-driven phase order + code-only audit | Scope didn't grep corpus-wide first (NAV-01 straggler) |
| v1.2 Performance & Snappiness | 4 | 9 | RSC + client-shell + DTO pattern, established once and reused | Paint-timing/jitter claims left unverified in a browser for 2 of 4 phases; REQUIREMENTS.md checkboxes unticked again |
| v1.3 Reliability & Hardening | 3 | 6 | Audit-sourced milestone (zero research phase) + risk-ordered phasing (behavior fixes before structural refactor) | Sibling route with the identical gap (`api/review/undo`) not grepped-for and deferred instead of fixed — same "scope corpus-wide" pitfall as v1.1's NAV-01 |
| v1.4 Knowledge Graph Quality & History | 4 | 15 | Independent re-verification (fresh reproduction, not the fixer's own test) turns a "passed" status into a real guarantee | A phase (17) shipped and closed with no VERIFICATION.md ever generated — silently unnoticed until the milestone audit's retroactive pass found it and, in fixing it, uncovered a real production bug |
