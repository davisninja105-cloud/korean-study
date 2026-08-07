---
phase: 31-cards-list-pagination-virtualization
plan: 03
subsystem: api
tags: [nextjs, prisma, libsql, cursor-pagination, reading-practice, cards]

# Dependency graph
requires:
  - phase: 31-cards-list-pagination-virtualization
    plan: "01"
    provides: getCardsPage()/getCardsGroupCounts() cursor-paginated data layer + sentence-free cardSelect shape in lib/cards-list.ts, CardsPageDTO/GroupCountsDTO in lib/dto.ts, and GET /api/cards/[id] (already implemented ahead of schedule as a Rule-1 deviation fix)
provides:
  - getSentencesPage() in lib/cards-list.ts — D-07's independently-paginated Reading Practice query (Sentence, not Card, is the row unit)
  - SentencePageDTO type in lib/dto.ts
  - GET /api/cards/sentences — new route delegating to getSentencesPage, server-side take clamp (T-31-06)
  - Route-level test coverage for GET /api/cards/[id] against a real temp SQLite DB with real schema DDL
  - Unit coverage for getSentencesPage's boundary/where-builder behavior
affects: [31-04-reading-practice-ui-and-regression]

# Actuals (#2632)
actuals:
  tokens: 4693
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentence-as-row-unit pagination: getSentencesPage() mirrors getCardsPage's overfetch-by-one hasMore/nextCursor + [{createdAt:'desc'},{id:'desc'}] tiebreak, but queries prisma.sentence.findMany with include: { card: { select: cardSelect } } instead of prisma.card.findMany — establishes Reading Practice as an independent server-side query per D-07"
    - "take clamping lives in the route (app/api/cards/sentences/route.ts), never in the lib function — getSentencesPage accepts whatever take it's given, same separation of concerns as getCardsPage/GET /api/cards"

key-files:
  created:
    - tests/cards-id-route.test.ts
  modified:
    - lib/cards-list.ts
    - lib/dto.ts
    - app/api/cards/sentences/route.ts (new file)
    - tests/cards-list.test.ts

key-decisions:
  - "Task 2 (GET /api/cards/[id]) required zero code changes — 31-01 already implemented it in full as a Rule-1 data-loss-prevention deviation, and its shape matches this plan's spec exactly (findUnique + null-check 404, same serialization shape as PUT, try/catch with a generic 500). Verified by direct comparison against the plan's <action> text rather than re-implementing."
  - "getSentencesPage's card include reuses the exact same cardSelect object getCardsPage uses (already sentence-free by construction) rather than duplicating the field list — the plan's 'same fields getCardsPage's cardSelect uses, minus sentences' requirement is satisfied by literal object reuse, not a hand-copied second list that could drift out of sync."

patterns-established:
  - "When a prior plan in the same phase already delivered a task ahead of schedule (documented in its own SUMMARY's 'Decisions Made' section), verify the delivered code against the current plan's <action>/<acceptance_criteria> line by line before deciding no work is needed — do not blindly trust the prior plan's self-report without checking the actual file."

requirements-completed: []

coverage:
  - id: D1
    description: "getSentencesPage() — cursor-paginated, D-07-independent Reading Practice query over Sentence rows, with parent card data attached, overfetch-by-one hasMore/nextCursor detection, and a search/lesson-range where-builder scoped to the sentence's own text"
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "tests/cards-list.test.ts — getSentencesPage describe block (12 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/cards/sentences delegates to getSentencesPage with the same DoS take-clamp pattern as GET /api/cards (T-31-06)"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "npm run build (Turbopack + TypeScript, clean; /api/cards/sentences listed as a registered route)"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/cards/[id] returns the full CardDTO (with real sentences) for an existing card and a clean 404 for a nonexistent one — verified against a real temp SQLite DB with real schema DDL, not a mock"
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "tests/cards-id-route.test.ts (2 tests, both passing)"
        status: pass
    human_judgment: false

duration: ~25min active work
completed: 2026-08-07
status: complete
---

# Phase 31 Plan 03: Reading Practice Backend Summary

**`getSentencesPage()` + `GET /api/cards/sentences` — D-07's independently-paginated Reading Practice endpoint (Sentence as the row unit) — plus route-level test coverage for the already-existing `GET /api/cards/[id]` full-card fetch.**

## Performance

- **Duration:** ~25 min active work (Task 2 required zero implementation — pre-verified already-complete from 31-01)
- **Started:** 2026-08-07T09:54:00-07:00 (approx, first Read call)
- **Completed:** 2026-08-07T09:57:06-07:00
- **Tasks:** 3/3 (Task 1: implemented; Task 2: verified already-complete, no changes; Task 3: implemented)
- **Files modified:** 4 modified, 1 created

## Accomplishments

- Added `getSentencesPage()` to `lib/cards-list.ts`: cursor-paginated read of `Sentence` rows (not `Card` rows) across the whole deck, with the parent card's sentence-free `cardSelect` shape attached via `include`. Mirrors `getCardsPage`'s overfetch-by-one (`take + 1`) `hasMore`/`nextCursor` detection and `[{createdAt:'desc'},{id:'desc'}]` deterministic id-tiebreak ordering. `search` matches the sentence's own `korean`/`translation` text; `lessonFrom`/`lessonTo` filters via the nested `card.lesson.orderIndex` relation. `take` is intentionally NOT clamped inside the function — clamping is the caller's job (matches the existing `getCardsPage`/`GET /api/cards` separation of concerns).
- Added `SentencePageDTO` to `lib/dto.ts`.
- Created `app/api/cards/sentences/route.ts`: `GET` parses `cursor`/`search`/`lessonFrom`/`lessonTo`/`take`, clamps `take` server-side (`Math.min(requestedTake, 100)`, same DoS guard pattern as `GET /api/cards`'s T-31-01), delegates to `getSentencesPage`, wrapped in try/catch with a generic 500.
- Verified `GET /api/cards/[id]` (Task 2) was already fully implemented in 31-01 as a Rule-1 data-loss-prevention deviation — compared line-by-line against this plan's `<action>` spec (signature, `findUnique` + null-check 404 — not `findUniqueOrThrow` — same serialization shape as `PUT`, generic 500 in catch) and confirmed an exact match. No code changes required.
- Added `tests/cards-id-route.test.ts`: route-level test against a real temp SQLite DB with real schema DDL (same pattern as `tests/review-route.test.ts`) — a seeded card with a real `Sentence` row returns 200 with that sentence's `korean`/`translation` intact; a nonexistent id returns a clean 404 with a JSON error body.
- Extended `tests/cards-list.test.ts` with a `getSentencesPage` describe block (12 tests): capped page with parent `card` attached (and the nested card's own `sentences` array empty, confirming the list-select shape), overfetch-by-one boundary detection (including the exact-last-row case), cursor/skip pass-through, deterministic ordering, unclamped `take` (asserting the function itself does no clamping), and the search/lesson-range where-builder (including the one-sided range cases and the "neither set" omission case).

## Task Commits

Each task was committed atomically:

1. **Task 1: getSentencesPage() — D-07's independent Reading Practice pagination** — `82cd025` (feat)
2. **Task 2: GET /api/cards/[id] — full CardDTO for the Edit sheet's on-demand fetch** — no commit; already fully implemented in 31-01 (commit `6cedee0` in that plan), verified against this plan's spec with zero code changes needed
3. **Task 3: Route-level test for GET /api/cards/[id] + getSentencesPage unit coverage** — `16c3ccd` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `lib/cards-list.ts` — Added `getSentencesPage()` + `SentencesPageParams` interface
- `lib/dto.ts` — Added `SentencePageDTO`
- `app/api/cards/sentences/route.ts` — New file: `GET` delegates to `getSentencesPage`, take clamped server-side
- `tests/cards-id-route.test.ts` — New route-level test file (2 tests)
- `tests/cards-list.test.ts` — Extended with `getSentencesPage` coverage (12 new tests)

## Decisions Made

- Task 2 required zero code changes. 31-01's own SUMMARY documented adding `GET /api/cards/[id]` ahead of schedule as a Rule-1 fix (dropping `sentences` from the list select would otherwise have let `CardEditor`'s `handleSave` silently delete every real `Sentence` row on the first edit). Rather than trusting that self-report blindly, the existing `app/api/cards/[id]/route.ts` was read and compared line-by-line against this plan's `<action>`/`<acceptance_criteria>` text — signature, `findUnique` + null-check (not `findUniqueOrThrow`), identical serialization shape to `PUT`, generic-500 catch — and confirmed an exact match. No re-implementation, no redundant commit.
- `getSentencesPage`'s card `include` reuses the literal `cardSelect` object `getCardsPage` already defines (already sentence-free by construction), rather than hand-copying a second field list that could silently drift out of sync with the original.

## Deviations from Plan

None — plan executed exactly as written, with Task 2 resolved via verification-not-reimplementation (see Decisions Made above; not a deviation from plan intent, since the plan's own `<action>` describes exactly what already existed).

## Known Stubs

None introduced by this plan. `app/api/cards/sentences` is a pure backend addition with no client wiring yet — that's 31-04's explicit scope per the phase's plan sequencing, not a stub or gap in this plan's own deliverable.

## Threat Flags

None beyond the threat model's own pre-declared T-31-05/T-31-06/T-31-07 entries, all of which this plan's implementation satisfies as specified (T-31-06's `take` clamp is implemented in the route; T-31-05/T-31-07 apply to `GET /api/cards/[id]`, already covered by 31-01's implementation and re-verified here via the new route-level test).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getSentencesPage()` and `GET /api/cards/sentences` are in place and tested — 31-04 can wire the Reading Practice tab's client-side infinite-scroll consumer directly against this endpoint without touching the query shape.
- `GET /api/cards/[id]` now has persisted route-level regression coverage (previously only covered by 31-01's manual code-path review) — a future change to its serialization shape will be caught by `tests/cards-id-route.test.ts`.
- No new stubs, deviations, or threat flags for `.planning/WINDOWS.md` from this plan.
- **CARDS-01 intentionally left unmarked in `.planning/REQUIREMENTS.md`** (`requirements-completed: []` above), following 31-01's own precedent — 31-01 built the actual `/cards` initial-load behavior CARDS-01 literally describes and still deferred marking it complete, since the phase's remaining plans (31-02's server-side search, 31-04's Reading Practice UI wiring) are part of the same requirement's full delivery. This plan's contribution is backend-only (a different consumer's data layer); closing CARDS-01 here would risk marking it done before the phase's UI-facing pieces land. Leave this decision to phase close / `/gsd-verify-work`.

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: `lib/cards-list.ts` contains `export async function getSentencesPage(`
- FOUND: `app/api/cards/sentences/route.ts`
- FOUND: `tests/cards-id-route.test.ts`
- FOUND: commit `82cd025`
- FOUND: commit `16c3ccd`
