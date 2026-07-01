---
phase: 01-foundation-aware-session-selection
plan: 01
subsystem: api
tags: [fsrs, prisma, sequencing, prerequisite-graph, vitest, pure-functions]

# Dependency graph
requires:
  - phase: (none)
    provides: existing sequenceCards() foundation-first sequencer + CardDependency edges
provides:
  - "selectSessionCards<T extends SeqCard>(pool, edges, sessionSize, now?) — pure, downward-closed session selector"
  - "GET /api/cards/due now selects over the whole eligible pool (take: 1000) before the size cap"
  - "Five selectSessionCards unit cases (pool<=size, prereq pull-in, downward-closed+cap, cycle-safe, bounded overshoot)"
affects: [phase-2-presentation, study-session, cards-due-route]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selection (selectSessionCards) and ordering (sequenceCards) are separate pure functions composed in the route"
    - "DFS closure with visiting (recursion-stack) + added (dedup) guards for cycle-safe downward-closed selection"
    - "Pure selectors take `now` as a parameter (purity-safe; lint-clean) even when unused, for parity with sequenceCards"

key-files:
  created: []
  modified:
    - "lib/sequence.ts — added exported selectSessionCards selector"
    - "tests/sequence.test.ts — added describe('selectSessionCards') with 5 cases"
    - "app/api/cards/due/route.ts — take:1000 pool + whole-pool edges + selectSessionCards→sequenceCards"

key-decisions:
  - "Kept selection and ordering as two functions: selectSessionCards chooses the downward-closed set, sequenceCards orders it (separation of concerns, D-01)"
  - "Bounded overshoot to one closure via break-before-seed + final slice(0, sessionSize); prefix stays downward-closed because prereqs always precede dependents"
  - "take: 1000 as a DoS safety bound on the widened pool query (T-01-01), keeping the route well under the Vercel 60s limit"

patterns-established:
  - "Pattern: pure session selector composed before the pure sequencer in the route handler"
  - "Pattern: cycle-safe DFS using a visiting recursion-stack set + an added dedup set"

requirements-completed: [SEL-01, SEL-02, SEL-03, SEL-04, SEL-05, QUAL-01]

coverage:
  - id: D1
    description: "A due dependent whose prerequisite is also due but less overdue is pulled into the selected set, with the prerequisite ordered before it (due date read from the review relation — CR-01 fix)"
    requirement: SEL-01
    verification:
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > pulls a less-due prerequisite into the session with its dependent"
        status: pass
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > prioritizes the most-due card as seed, reading nextReview from the review relation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Selected set is downward-closed under the prerequisite relation: no returned card has an in-pool prerequisite bumped out by the size cap"
    requirement: SEL-02
    verification:
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > output is downward-closed and capped at sessionSize"
        status: pass
    human_judgment: false
  - id: D3
    description: "selectSessionCards honors sessionSize during selection; overshoot bounded to one prerequisite closure and the final slice never orphans a prerequisite"
    requirement: SEL-03
    verification:
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > overshoot is bounded by at most one prerequisite closure"
        status: pass
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > output is downward-closed and capped at sessionSize"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dependency cycles never cause infinite recursion or duplicate cards in the selected set"
    requirement: SEL-04
    verification:
      - kind: unit
        ref: "tests/sequence.test.ts#selectSessionCards > handles 2-node cycle without infinite loop or duplicate cards"
        status: pass
    human_judgment: false
  - id: D5
    description: "GET /api/cards/due fetches the whole eligible pool (take: 1000) and whole-pool edges, then runs selectSessionCards before sequenceCards; response shape, empty-result return, lesson-range clause, and scope validation unchanged"
    requirement: SEL-05
    verification:
      - kind: other
        ref: "npm run build (route /api/cards/due compiles); static trace: findMany take:1000 → whole-pool edge findMany → selectSessionCards(cards,edges,sessionSize,now) → sequenceCards(chosen,edges,now) → NextResponse.json(ordered)"
        status: pass
    human_judgment: false
  - id: D6
    description: "selectSessionCards is pure (now is a parameter; no Date.now()/new Date()/Math.random() in the body) — react-hooks/purity stays clean"
    requirement: QUAL-01
    verification:
      - kind: other
        ref: "npm run lint (exit 0, react-hooks/purity not tripped)"
        status: pass
    human_judgment: false

# Metrics
duration: ~3min
completed: 2026-06-25
status: complete
---

# Phase 1 / Plan 01: Foundation-Aware Session Selection Summary

**Pure `selectSessionCards` selector — a cycle-safe, downward-closed DFS closure that pulls each chosen card's still-due in-pool prerequisites into the session and caps at `sessionSize` during selection — wired into `GET /api/cards/due` over the whole eligible pool.**

## Performance

- **Duration:** ~3 min (task commits 19:00:55 → 19:04:00 PDT)
- **Started:** 2026-06-25T19:00:55-07:00 (RED commit)
- **Completed:** 2026-06-25T19:04:00-07:00 (rewire commit)
- **Tasks:** 3
- **Files modified:** 3

> Closeout note: plan execution was interrupted by a provider quota limit after the three task commits landed but before SUMMARY.md/tracking were written. This SUMMARY was authored during a safe-resume closeout — all three task commits were verified present and the full verification suite (test/lint/build) was re-run green before writing.

## Accomplishments
- **`selectSessionCards` selector** (`lib/sequence.ts`): given the whole pool, prerequisite edges, a `sessionSize`, and `now`, returns a downward-closed subset — every returned card has all of its in-pool prerequisites present, ordered before it. Early-exits when `pool.length <= sessionSize`. (SEL-01, SEL-02)
- **Bounded, cycle-safe selection:** DFS `addClosure` guarded by a `visiting` recursion-stack set (cycle back-edges ignored) and an `added` dedup set; seeds iterated most-due-first with `break` before starting a seed once at capacity, then a final `slice(0, sessionSize)`. Overshoot is bounded to one closure; the slice never orphans a prerequisite because prereqs always precede dependents. (SEL-03, SEL-04)
- **Whole-pool route rewire** (`app/api/cards/due/route.ts`): pool query widened from `take: sessionSize` to `take: 1000`; edges fetched across the whole pool; selection now `selectSessionCards(cards, edges, sessionSize, now)` followed by `sequenceCards(chosen, edges, now)`. Validation, lesson-range clause, empty-result early return, and JSON response shape are byte-identical to before. (SEL-05)
- **Five new unit cases** in `tests/sequence.test.ts` covering pool≤size, less-due-prereq pull-in (with ordering), downward-closed+cap, 2-node cycle (no dup/no hang), and bounded overshoot. (QUAL-01)
- **Purity preserved:** `now` is a parameter; no `Date.now()`/`new Date()`/`Math.random()` in the selector body — `react-hooks/purity` stays clean.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: Add failing selectSessionCards unit tests (RED)** — `494d044` (test)
2. **Task 2: Implement pure selectSessionCards (GREEN)** — `57af011` (feat)
3. **Task 3: Rewire GET /api/cards/due to whole-pool selection** — `60890a3` (feat)
4. **Post-review fix: read nextReview from the review relation (CR-01)** — `b354d0c` (fix)

_Note: TDD plan — Task 1 lands the RED test, Task 2 turns it GREEN. Commit 4 is a
post-code-review correction (see Deviations)._

## Files Created/Modified
- `lib/sequence.ts` — added exported `selectSessionCards<T extends SeqCard>(pool, edges, sessionSize, now?)`; reuses existing `SeqCard`/`SeqEdge` types and the in-pool adjacency + cycle-guard patterns established by `sequenceCards`.
- `tests/sequence.test.ts` — extended import to include `selectSessionCards`; added a `describe('selectSessionCards')` block with five deterministic cases (existing `card()`/`NOW` fixtures and `sequenceCards` tests untouched).
- `app/api/cards/due/route.ts` — `take: 1000` pool cap, whole-pool edge fetch, and the two-line `selectSessionCards` → `sequenceCards` composition; comments updated to reflect selection-during-fetch.

## Decisions Made
- **Selection vs. ordering stay separate** — `selectSessionCards` chooses the downward-closed set; `sequenceCards` orders it. The route composes them. Keeps each function single-purpose and independently testable (D-01).
- **Overshoot bounded by break-before-seed + final slice** — rather than counting closure sizes ahead of time, the loop stops starting new seeds at capacity and the final `slice(0, sessionSize)` trims; safe because prerequisites always precede their dependent in `result`, so any prefix is still downward-closed.
- **`take: 1000` safety bound** — widening the pool query drops the `take: sessionSize` cap, so a `take: 1000` bound caps worst-case per-request cost (DoS mitigation T-01-01) while comfortably covering realistic decks.

## Deviations from Plan

### Post-review correction (CR-01) — `b354d0c`

The three planned tasks executed exactly as written. However, the end-of-phase code review
(`01-REVIEW.md`) surfaced a **critical field-shape bug** the plan and tests both missed:

- **Found during:** code-review gate (post-Task-3).
- **Issue:** `selectSessionCards` and `sequenceCards` read `card.nextReview`, but the route
  fetches cards with `include: { review: true }` and `nextReview` is a `CardReview` column
  (`prisma/schema.prisma:81`) — so the due date lives at `card.review.nextReview` and
  `card.nextReview` is `undefined` for every real card. The most-due seed sort collapsed to
  lesson/id order and `urgencyBoost` was always 0, so SEL-01's "less-overdue prerequisite"
  behavior never fired in production. The five tests passed only because the `card()` fixture
  flattened `nextReview` onto the card — a shape the route never produces (WR-01).
- **Fix:** added a pure `nextReviewMs(card)` helper reading `card.review?.nextReview ??
  card.nextReview` (relation-first, flat fallback; single source of truth), used in the seed
  sort, urgency boost, and tiebreak. Updated the test fixture to the real Prisma shape and
  added a discriminating seed-priority test that fails under the bug. The route is unchanged,
  so the JSON response shape is still byte-identical (this is why the relation-read approach
  was chosen over flattening at the route boundary, which would have duplicated the field into
  the response).
- **Verification:** `npm test` 53 pass · `npm run lint` clean · `npm run build` clean.
- **Files modified:** `lib/sequence.ts`, `tests/sequence.test.ts`.

Non-blocking review findings (WR-02, WR-03, WR-04, IN-01, IN-02, IN-03) were dispositioned in
`01-REVIEW.md` — IN-02 was incidentally resolved by the helper; the rest are accepted
(theoretical/scale for a single-user app) or cosmetic and left for surgical-scope reasons.

**Impact on plan:** the fix is essential for the phase to actually deliver SEL-01/SEL-05 against
real data. No scope creep — confined to the phase's own two lib/test files.

## Issues Encountered
Execution was interrupted by a provider quota limit after the three task commits but before the SUMMARY and tracking updates. Resolved via safe-resume closeout: verified all three task commits were present and clean (no dirty plan files), re-ran the full verification suite green, then authored this SUMMARY and updated tracking. No code re-execution was needed.

## Verification Results
- `npm test` (vitest) — **52 passed** (5 files), including the five new `selectSessionCards` cases and the unchanged `sequenceCards` cases. (QUAL-01)
- `npm run lint` — **clean (exit 0)**; `react-hooks/purity` not tripped.
- `npm run build` — **clean (exit 0)**; `/api/cards/due` compiled.
- Manual trace: `findMany` (`take: 1000`, full `where`/`include`/`orderBy`) → whole-pool edge `findMany` → `selectSessionCards(cards, edges, sessionSize, now)` → `sequenceCards(chosen, edges, now)` → `NextResponse.json(ordered)`; empty-result early return and response shape unchanged.

## User Setup Required
None — no external service configuration required. No schema/Prisma migration, no new dependency.

## Next Phase Readiness
- Selection layer is now prerequisite-coherent end-to-end (pool → select → sequence → JSON), satisfying the Phase 1 goal and all six requirements (SEL-01..05, QUAL-01).
- Phase 2 (Maturity- & Known-Word-Aware Presentation) can build on a session set that is guaranteed downward-closed — `lib/known-words.ts`, `unknownCount` annotation, and the `StudySession.tsx` bare-word-first change are the next slice (explicitly deferred out of this phase).
- No blockers.

---
*Phase: 01-foundation-aware-session-selection*
*Completed: 2026-06-25*
