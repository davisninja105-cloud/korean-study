---
phase: 31-cards-list-pagination-virtualization
plan: 01
subsystem: api
tags: [nextjs, prisma, libsql, cursor-pagination, react-virtuoso, react, cards]

# Dependency graph
requires:
  - phase: 30-instant-feedback-cold-start-unblocking
    provides: RSC server-hydration + client-shell + DTO pattern (app/*/page.tsx thin RSC -> *Client.tsx shell), the react-hooks/purity-safe hand-rolled-hook convention, and the re-measurement baseline discipline this plan's PRE-MIGRATION capture follows
provides:
  - getCardsPage()/getCardsGroupCounts() cursor-paginated data layer in lib/cards-list.ts (replaces unbounded getCardsList())
  - CardsPageDTO/GroupCountsDTO types in lib/dto.ts
  - GET /api/cards rewritten to accept type/cursor/search/lessonFrom/lessonTo/take query params
  - GET /api/cards/[id] (full CardDTO incl. sentences) — added ahead of schedule to close a data-loss bug this plan's own changes introduced
  - Vocabulary type-group rendering end-to-end through react-virtuoso (flat Virtuoso + composed header/card rows)
  - PRE-MIGRATION /cards perf baseline (median dcl 45ms against the 8-card e2e fixture) for 31-04's tightened-budget calculation
affects: [31-02-full-cards-view-completion, 31-03-reading-practice-backend, 31-04-reading-practice-ui-and-regression, phase-32-study-load-round-trip-collapse]

# Actuals (#2632)
actuals:
  tokens: 15076
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: ["react-virtuoso ^4.18.11"]
  patterns:
    - "Per-type-group cursor pagination: take+1 overfetch-by-one hasMore detection, [{createdAt:'desc'},{id:'desc'}] id-tiebreak orderBy, shared buildCardsWhere() composed by both the page query and the groupBy count query"
    - "Composed-row flat <Virtuoso> rendering (header rows + card rows in one discriminated-union array) instead of GroupedVirtuoso, per 31-RESEARCH.md Pattern 2"
    - "Per-group client state (Record<GroupKey, {loaded,nextCursor,hasMore,loading}>) replacing a single flat cards array"
    - "On-demand full-card fetch (GET /api/cards/[id]) before a destructive-by-omission editor mounts, race-guarded via a ref synced at the event-handler call site (not a useEffect)"

key-files:
  created:
    - tests/cards-list.test.ts
  modified:
    - lib/cards-list.ts
    - lib/dto.ts
    - app/api/cards/route.ts
    - "app/api/cards/[id]/route.ts"
    - app/cards/page.tsx
    - components/CardsClient.tsx
    - package.json
    - package-lock.json

key-decisions:
  - "Added GET /api/cards/[id] and an on-demand sentence fetch in CardsClient's Edit-sheet flow now, not in 31-03/31-04 as originally scheduled — dropping `sentences` from the list select meant CardEditor's handleSave would unconditionally PUT `sentences: []`, and the PUT handler treats any array (including []) as a full replace, silently deleting every real Sentence row on the first ordinary edit."
  - "All 4 type-group headers (including Vocabulary) read their count from groupCounts, never from a loaded-array length — closes the Pitfall 2 false-positive risk the 8-card e2e fixture can't itself catch."
  - "Kept the pre-existing client-side search/type/lesson-range filter operating on the Vocabulary group's loaded array (per the plan's explicit interim scope) rather than partially wiring server-side search — full CARDS-03 server-side search lands in 31-02."
  - "No toggle-triggered fetch wired for Grammar/Phrase/Other in this plan — tapping a collapsed header just flips the collapse flag with zero rows to show, matching D-02's default without inventing 31-02's expand-with-fetch mechanism early."

patterns-established:
  - "Data-loss-shaped Rule 1 auto-fixes are in scope even when the fixing file isn't in the plan's declared <files> list, when leaving them unfixed risks real production data (see Deviations)."
  - "Group-count invariant: every group header AND the top-level 'Cards (N)' toggle read exclusively from the server-aggregated GroupCountsDTO, never a client-derived array length — carry this forward into 31-02's remaining 3 groups."

requirements-completed: []

coverage:
  - id: D1
    description: "getCardsPage()/getCardsGroupCounts() cursor-paginated, sentence-free data layer with deterministic id-tiebreak ordering, overfetch-by-one hasMore/nextCursor boundary detection, and a shared type/search/lesson-range where-builder"
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "tests/cards-list.test.ts (15 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/cards rewritten to parse/validate/clamp type/cursor/search/lessonFrom/lessonTo/take query params, wrapped in try/catch, bundling groupCounts into the cursor-less (page 1) response only"
    requirement: "CARDS-01"
    verification:
      - kind: e2e
        ref: "e2e/smoke.spec.ts#Cards renders the real seeded total-card count on first load"
        status: pass
      - kind: other
        ref: "npm run build (Turbopack + TypeScript, clean)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Vocabulary type-group renders through react-virtuoso with a bounded DOM node count; Grammar/Phrase/Other render collapsed header-only rows sourced from the real server-aggregated groupCounts, zero rows fetched; keyboard Tab navigation and screen-reader reachability of the virtualized rows"
    requirement: "CARDS-02"
    verification:
      - kind: e2e
        ref: "e2e/smoke.spec.ts#Cards renders the real seeded total-card count on first load"
        status: pass
      - kind: manual_procedural
        ref: "human verification, 2026-08-07 — keyboard Tab-through of the Vocabulary group"
        status: fail
    human_judgment: true
    rationale: "Human-verified 2026-08-07: keyboard Tab navigation does NOT correctly reach card rows/Edit controls inside the virtualized Vocabulary group, contradicting this plan's own must_haves.truths accessibility statement. The human explicitly deferred fixing it ('non-blocker for now, don't spend time trying to fix it') but this is a real, confirmed gap — CARDS-02's keyboard/screen-reader-reachability truth is NOT met by this plan as shipped. Recorded here (human_judgment:true, status:fail) specifically so the phase verifier and later plans see this and do not silently auto-pass it. See 'Known Issue' below and .planning/WINDOWS.md entry #1."
  - id: D4
    description: "Data-layer unit test coverage: capped/sentence-free page, hasMore/nextCursor boundary (including the exact-last-row case), empty/single-element edges, deterministic ordering, and the search/lesson-range/type where-builder including the D-05 sentence-search OR branch"
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "npx vitest run tests/cards-list.test.ts (15/15 passing)"
        status: pass
    human_judgment: false

duration: ~1h (spans an async human-verification checkpoint pause between Task 1 and Task 2 whose wall-clock is not work time; active work ≈50min)
completed: 2026-08-07
status: complete
---

# Phase 31 Plan 01: Cards List Pagination & Virtualization (Tracer) Summary

**Cursor-paginated, sentence-free cards data layer (`getCardsPage`/`getCardsGroupCounts`) with the Vocabulary type-group rendering end-to-end through a real DOM-bounded `react-virtuoso` list — the phase's leading tracer slice, with unit test coverage for the new data layer.**

## Performance

- **Duration:** ~1h wall-clock across two sessions (paused for a human `checkpoint:human-verify` between Task 1 and Task 2); active implementation/verification work ≈50 min
- **Started:** 2026-08-07 (continuation session; Task 1 was resolved in a prior session)
- **Completed:** 2026-08-07T16:41:00Z
- **Tasks:** 3/3 (Task 1: checkpoint, no code; Task 2: tracer; Task 3: unit tests)
- **Files modified:** 8 modified, 1 created (`tests/cards-list.test.ts`)

## Accomplishments

- Replaced the single unbounded `prisma.card.findMany()` (full `sentences` include, no cap) with `getCardsPage()` (cursor-paginated, sentence-free, `take+1` overfetch-by-one `hasMore` detection, `[{createdAt:'desc'},{id:'desc'}]` deterministic tiebreak) and `getCardsGroupCounts()` (full-deck `groupBy` aggregate) in `lib/cards-list.ts`.
- Rewrote `GET /api/cards` to accept and validate `type`/`cursor`/`search`/`lessonFrom`/`lessonTo`/`take`, clamping `take` server-side (DoS guard, `Math.min(take, 100)`), wrapped in try/catch, bundling `groupCounts` into the cursor-less (page-1) response only.
- `app/cards/page.tsx` and `components/CardsClient.tsx` rewritten so the Vocabulary group renders a real capped page through a single flat `<Virtuoso>` (composed header + card rows); Grammar/Phrase/Other render real, server-aggregated collapsed-header counts with zero rows fetched; the "Cards (N)" toggle reads `groupCounts.total`, never a loaded-array length.
- Installed `react-virtuoso` (approved via Task 1's package-legitimacy checkpoint).
- Captured the PRE-MIGRATION `/cards` perf baseline (`npx playwright test e2e/perf.spec.ts -g "cards"`, against the seeded 8-card fixture, run **before** any code in this plan changed) for 31-04's tightened-budget calculation — see below.
- Added `tests/cards-list.test.ts` (15 tests): capped/sentence-free page, `hasMore`/`nextCursor` boundary detection (including the exact-last-row-boundary case), empty/single-element edges, deterministic ordering, and the `type`/`search`/`lesson-range` where-builder (including the D-05 sentence-search OR clause).
- **Deviation fix (see below):** added `GET /api/cards/[id]` and wired the Edit sheet to fetch a card's full data (with real sentences) before `CardEditor` mounts, closing a real data-loss bug this plan's own `sentences`-drop would otherwise have introduced.

## PRE-MIGRATION `/cards` baseline

Captured via `npx playwright test e2e/perf.spec.ts -g "cards"` **before** any code in Task 2 changed the query shape, against the seeded 8-card e2e fixture (not the ~1056-card production deck):

| Metric | Samples (ms) | Median (ms) |
|---|---|---|
| `/cards` ttfb | 184, 22, 25, 15, 17 | 22 |
| `/cards` dcl | 264, 45, 51, 40, 41 | **45** |
| `/cards` load | 332, 45, 51, 40, 41 | 45 |
| `/api/cards/due` round-trip | 19, 9, 12, 6, 5 | 9 |

**Note for 31-04:** this is measured against the small 8-card fixture (per the task's literal instruction), not the real ~1056-card production deck. Record as-is; 31-04's final task computes the real-world tightened budget once the full phase's changes have landed and an on-device measurement against the production-shaped dataset is taken.

## Task Commits

Each task was committed atomically:

1. **Task 1: Approve adding react-virtuoso as a runtime dependency** — no commit (pure checkpoint gate; resolved in a prior session with human response "approved")
2. **Task 2: End-to-end capped, virtualized Vocabulary-group cards list** - `6cedee0` (feat)
3. **Task 3: Unit-test the paginated data layer** - `1b621ce` (test)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `lib/cards-list.ts` - Rewritten: `getCardsPage()`, `getCardsGroupCounts()`, local `buildCardsWhere()` helper; replaces `getCardsList()`
- `lib/dto.ts` - Added `CardsPageDTO`, `GroupCountsDTO`
- `app/api/cards/route.ts` - `GET` rewritten to parse/validate/clamp query params, try/catch added; `POST` unchanged
- `app/api/cards/[id]/route.ts` - Added `GET` (full `CardDTO` incl. sentences) — deviation, see below
- `app/cards/page.tsx` - Calls `getCardsPage`/`getCardsGroupCounts` via `Promise.all`, passes `initialCardsPage`/`initialGroupCounts` to `CardsClient`
- `components/CardsClient.tsx` - Rewritten: per-group cursor state, composed-rows flat `<Virtuoso>` rendering, `groupCounts` state, on-demand Edit-sheet detail fetch
- `package.json` / `package-lock.json` - Added `react-virtuoso ^4.18.11`
- `tests/cards-list.test.ts` - New unit test file (15 tests)

## Decisions Made

- Added `GET /api/cards/[id]` and CardsClient's on-demand sentence fetch now (originally scheduled for 31-03/31-04) — see Deviations. Later plans in this phase will find this endpoint already exists and should adjust their own scope accordingly rather than re-implementing it.
- All 4 group headers (including Vocabulary) read counts from `groupCounts`, never a loaded-array length, closing the Pitfall 2 false-positive risk the small e2e fixture can't itself catch.
- Kept the pre-existing client-side search/type/lesson-range filter operating on the Vocabulary group's loaded array unchanged (per plan scope) — real server-side search/filter (CARDS-03) lands in 31-02.
- No expand-with-fetch wired for Grammar/Phrase/Other — tapping a collapsed header just flips the flag (zero rows to show), matching D-02's default without inventing 31-02's mechanism early.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `GET /api/cards/[id]` + on-demand sentence fetch to prevent silent Sentence-row deletion on card edit**
- **Found during:** Task 2 (End-to-end capped, virtualized Vocabulary-group cards list)
- **Issue:** Dropping `sentences` from the list `select` (CARDS-01) meant every card loaded via `getCardsPage` carried `sentences: []`. `CardEditor`'s `handleSave` unconditionally PUTs whatever `sentences` array it was seeded with, and the existing PUT handler (`app/api/cards/[id]/route.ts`) treats ANY array — including `[]` — as "delete all existing sentences, then recreate from this array." Opening the Edit sheet on any Vocabulary card and saving ANY field (even just fixing a typo in `back`) would have silently, irreversibly deleted every real `Sentence` row for that card in production.
- **Fix:** Added `GET /api/cards/[id]` (full `CardDTO` including real sentences, symmetric with the existing `PUT`'s return shape) and wired `CardsClient`'s Edit-sheet open flow (`openEdit`/`fetchEditingDetail`) to fetch it before `CardEditor` ever mounts — race-guarded via a ref (same pattern as `StudyClient.tsx`'s `phaseRef`) so a stale in-flight fetch for a since-closed/reopened card can never clobber newer state. Added a loading state and an error state with a "Try again" retry link (matching the UI-SPEC's E4 copy) so the editor never mounts against a failed/incomplete fetch.
- **Files modified:** `app/api/cards/[id]/route.ts`, `components/CardsClient.tsx`
- **Verification:** `npm run build` clean; `npx eslint` clean on both files; manual code-path review confirmed `CardEditor`'s `sentences` state is now always seeded from the full, real sentence list before any save can occur.
- **Committed in:** `6cedee0` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 — bug, correctness/data-safety)
**Impact on plan:** Necessary to prevent real, irreversible production data loss. This duplicates a small slice of work the ROADMAP originally scheduled for 31-03 (`GET /api/cards/[id]`) and 31-04 (CardEditor on-demand fetch) — flagging so those plans adjust scope when they reach it; no other scope creep.

## Known Issue (deferred, human-confirmed)

**Keyboard Tab navigation does not correctly reach card rows/Edit controls inside the virtualized Vocabulary group.** During human verification of this plan's tracer slice (2026-08-07), keyboard-only Tab navigation through the Vocabulary group's card rows did not work as intended. The human explicitly confirmed this and instructed: *"tab didnt work but that is a non-blocker. please dont spend time trying to fix it."* No investigation or fix was attempted per that instruction.

This means **this plan's own `must_haves.truths` accessibility statement is NOT fully met as shipped**:
> "Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group — off-screen row virtualization does not silently remove currently-visible rows from the accessibility tree."

CARDS-02 (the phase requirement this statement backstops) is **not** being marked complete in `.planning/REQUIREMENTS.md` by this plan — it remains `Pending`, both because this gap exists and because CARDS-02's full scope (all 4 groups, not just Vocabulary) isn't complete until later plans in this phase land. This is deliberately NOT downgraded or reinterpreted here — it's surfaced plainly for the phase verifier and later plans (31-02/31-04) to see and decide how to address. Recorded in `.planning/WINDOWS.md` (entry #1, kind `deviation`) and in this SUMMARY's `coverage:` block (D3, `human_judgment: true`, `status: fail`) so automated UAT routing does not silently auto-pass it.

## Known Stubs

These are accepted, plan-scoped interim gaps (not bugs) — each is explicitly deferred to a later plan in this phase and recorded in `.planning/WINDOWS.md`:

| Stub | File | Resolved in |
|---|---|---|
| Vocabulary card rows show no "indented sentence previews" (sentences dropped from the list query per CARDS-01; no replacement mechanism planned for the list-row view itself) | `components/CardsClient.tsx` | Not currently scheduled — flagging for review |
| Reading Practice tab always shows its empty state (temporarily sourced from `groups.vocabulary.loaded`, which never carries sentences) | `components/CardsClient.tsx` | 31-04 (D-07 independent fetch) |
| Search box does not match inside example sentences (client-side-only filter over sentence-free cards) | `components/CardsClient.tsx` | 31-02 (server-side D-05 search) |
| `FreshnessWatcher`'s `/cards` backstop is inert — its `Array.isArray(result)` check never matches the new `CardsPageDTO` object shape | `components/FreshnessWatcher.tsx` | 31-04 (upsert-merge fix) |

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-endpoint | `app/api/cards/[id]/route.ts` | New `GET` handler added ahead of this phase's original schedule (see Deviations). Same trust boundary as the existing `PUT`/`DELETE` on this route (auth-gated by `middleware.ts`, no new input surface beyond the existing `id` path param) — no new mitigation required, but flagging since it wasn't in this plan's original `<threat_model>`. |

## Issues Encountered

None beyond the data-loss bug documented above (handled as a Rule 1 deviation) and the human-confirmed keyboard-navigation gap (handled as a documented Known Issue, explicitly not fixed per human instruction).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/cards-list.ts`'s `getCardsPage`/`getCardsGroupCounts`/`buildCardsWhere` foundation is in place and unit-tested — 31-02 can build server-side search/lesson-filter/auto-load directly on top of it without touching the query shape.
- `GET /api/cards/[id]` already exists — 31-03 should adjust its scope to find this done rather than re-implementing it.
- **Blocker/concern for the phase verifier:** CARDS-02's keyboard/screen-reader-reachability truth is not met (see Known Issue above) — this should stay visible through `/gsd-verify-work` and not be silently closed out when the phase's remaining plans land, unless a later plan explicitly investigates and fixes it or the human formally accepts the risk at phase close.
- `.planning/WINDOWS.md` now has 4 open entries from this plan (1 deviation, 3 stubs) — all phase-31-scoped, all naming their resolving plan.

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: `lib/cards-list.ts`
- FOUND: `tests/cards-list.test.ts`
- FOUND: `app/api/cards/[id]/route.ts`
- FOUND: `.planning/WINDOWS.md`
- FOUND: commit `6cedee0`
- FOUND: commit `1b621ce`
