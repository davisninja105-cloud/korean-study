---
phase: 31-cards-list-pagination-virtualization
plan: 02
subsystem: ui
tags: [nextjs, react, react-virtuoso, prisma, cursor-pagination, debounce, cards]

# Dependency graph
requires:
  - phase: 31-cards-list-pagination-virtualization
    plan: 01
    provides: getCardsPage()/getCardsGroupCounts() cursor-paginated data layer, GET /api/cards
      with type/cursor/search/lessonFrom/lessonTo/take query params, GET /api/cards/[id] full-card
      fetch, and the Vocabulary-only tracer slice this plan expands to all four groups
provides:
  - lib/useDebouncedValue.ts — react-hooks/purity-safe useDebouncedValue<T> hook (Debouncer pure
    scheduling core + thin hook wrapper), unit-tested with fake timers
  - All four type groups (Vocabulary/Grammar/Phrase/Other) fetch and auto-load real card rows —
    Grammar/Phrase/Other's expand-on-tap now performs a real first-page fetch instead of a no-op
    flag flip; every expanded group auto-loads its next page within 5 rows of its own boundary
  - Server-side search (debounced, stale-response-guarded) and Filter Sheet lesson-range/type
    filtering, fully replacing the legacy client-side in-memory .filter() block
  - lib/cards-list.ts buildCardsWhere() now supports type='other' (notIn the three canonical
    types) — closes a gap that would have made the Other group's expand-on-tap permanently
    return zero rows
affects: [31-03-reading-practice-backend, 31-04-reading-practice-ui-and-regression]

# Actuals (#2632)
actuals:
  tokens: 13372
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure scheduling core + thin React hook wrapper for testability without a DOM-rendering
      harness (Debouncer class in lib/useDebouncedValue.ts) — this codebase's Vitest suite has no
      jsdom/@testing-library/react, so a hook that owns useState/useEffect timing is made testable
      by extracting its timer-coordination logic into a plain, non-React class."
    - "Composed-rows flat <Virtuoso> extended with 'skeleton' and 'status' row kinds (alongside
      31-01's 'header'/'card') so loading/error/end-of-list states are just more rows in the same
      discriminated-union array, never a separate rendering path."
    - "Two-tier filter state (pending Sheet edits vs. committed applied values) so a server-side
      filter/lesson-range change only re-issues the network query on explicit 'Done' commit, not
      on every intermediate pill tap."
    - "Dual stale-response guards: a per-search-lineage sequence ref (searchSeqRef) and a
      per-filter-commit generation ref (filterGenerationRef) — a late-resolving response from a
      superseded query is discarded, never applied over newer results (CARDS-03)."

key-files:
  created:
    - lib/useDebouncedValue.ts
    - tests/use-debounced-value.test.ts
  modified:
    - lib/cards-list.ts
    - tests/cards-list.test.ts
    - components/CardsClient.tsx

key-decisions:
  - "Debouncer is tested directly (not via a rendered React hook) — this codebase has no jsdom/
    @testing-library/react, and the executor's package-install rule requires a human-verification
    checkpoint before adding any new npm package (even a devDependency); rather than halt an
    autonomous plan for that, the hook's actual scheduling logic (the load-bearing part) was
    extracted into a plain class and unit-tested with vi.useFakeTimers(). The one behavior not
    independently re-tested — 'an unchanged value never reschedules a timer' — is a guarantee of
    React's own useEffect dependency-array diffing, not this hook's code."
  - "Filter Sheet is two-tier (pending vs. committed) so committing (tapping Done) is the actual
    trigger for a server refetch, matching the plan's literal wording, rather than firing a
    network request on every pill/lesson-range tap while the sheet is still open."
  - "A filter-commit fetch failure surfaces the shared 'Couldn't search right now…' banner (same
    copy/mechanism as a failed search), not the per-group inline 'Couldn't load more cards…' used
    for ordinary scroll-continuation failures — these are deliberately different UI paths for
    different triggers, resolving the E7 loading/error backstops explicitly."
  - "No single-match-vs-many-matches count header was added above search results — the flattened
    list with no header is the chosen resolution to must_haves.truths' backstop item on this."
  - "Narrowing the type-pill filter to exactly one type auto-expands that group on commit (a small
    UX addition beyond the plan's literal text) — otherwise committing a type filter onto an
    already-collapsed group would show only a header with zero visible cards."

patterns-established:
  - "A component's own SSR-refresh 'gated adoption' guard (FreshnessWatcher/router.refresh()
    boundary re-delivery of RSC props) must also check for an active client-side query before
    adopting fresh props, once list filtering moves server-side — the RSC page's initial props are
    always the unfiltered default view and will silently clobber a filtered client state otherwise."

requirements-completed: [CARDS-03]
# CARDS-02 is intentionally NOT marked complete despite being in this plan's
# `requirements` frontmatter — see "Requirement completion note" below.

coverage:
  - id: D1
    description: "lib/useDebouncedValue.ts — Debouncer pure scheduling core + useDebouncedValue<T>
      hook; search input debounces ~300ms before triggering a server request"
    requirement: "CARDS-03"
    verification:
      - kind: unit
        ref: "tests/use-debounced-value.test.ts (6 tests, all passing)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stale/out-of-order search and filter-commit responses are discarded via
      searchSeqRef/filterGenerationRef — a late-resolving response never overwrites newer results"
    requirement: "CARDS-03"
    verification:
      - kind: e2e
        ref: "e2e/freshness-gate.spec.ts#/cards open-sheet boundary refresh never clobbers
          in-flight edits (FRESH-02)"
        status: pass
      - kind: other
        ref: "code-path review of runQuery()/fetchSearchNextPage()/fetchGroupPage() — every
          setState-on-resolve is gated behind a captured sequence/generation comparison"
        status: pass
    human_judgment: false
  - id: D3
    description: "All four type groups (Vocabulary/Grammar/Phrase/Other) fetch and render real
      card rows on expand; auto-load-on-scroll triggers per group within 5 rows of that group's own
      boundary, independent of the whole list's scroll position; a fully-loaded group shows the
      end-of-list marker; a failed batch load shows inline retry copy without clearing already-
      loaded rows"
    requirement: "CARDS-02"
    verification:
      - kind: other
        ref: "npm run build (clean) + npx eslint components/CardsClient.tsx lib/cards-list.ts
          (0 errors)"
        status: pass
      - kind: e2e
        ref: "e2e/smoke.spec.ts#Cards renders the real seeded total-card count on first load"
        status: pass
      - kind: manual_procedural
        ref: "Manual dev-server verification of expand-on-tap for Grammar/Phrase/Other and
          scroll-triggered auto-load was NOT performed against the real ~1056-card production
          deck this session (only the 8-card e2e fixture, which is too small to meaningfully
          exercise a 30-row page boundary or the 5-row scroll-proximity trigger)"
        status: unknown
    human_judgment: true
    rationale: "The e2e fixture (8 cards total, ≤ PAGE_SIZE=30) cannot exercise a real second-page
      auto-load or a genuinely large Other-group expand — this must be spot-checked against the
      real production deck (or a locally-bumped fixture) before this requirement is considered
      fully proven end-to-end, per 31-RESEARCH.md's own Pitfall 2 / Wave-0-gap guidance for CARDS-02."
  - id: D4
    description: "Server-side search (debounced) and Filter Sheet lesson-range/type filtering
      fully replace the legacy client-side in-memory .filter() block; three distinct empty-state
      messages (no cards at all / zero search matches naming the query / zero filter matches)"
    requirement: "CARDS-03"
    verification:
      - kind: unit
        ref: "tests/cards-list.test.ts (16 tests, all passing, including the new 'other' type
          where-builder test)"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/smoke.spec.ts e2e/freshness-gate.spec.ts
          e2e/freshness-fresh-paths.spec.ts e2e/freshness-router-cache.spec.ts
          e2e/freshness-client-shell.spec.ts (20/21 passing; 1 pre-existing /study flake unrelated
          to this plan's changes, confirmed to pass in isolation)"
        status: pass
    human_judgment: false

duration: ~30min
completed: 2026-08-07
status: complete
---

# Phase 31 Plan 02: Cards List Pagination & Virtualization (Full Client Wiring) Summary

**All four `/cards` type groups now lazy-fetch and auto-load real paginated rows through the shared react-virtuoso list, with fully server-side debounced search and Filter Sheet filtering replacing the legacy client-side in-memory filter — closing 31-01's deliberately-scoped interim gaps.**

## Performance

- **Duration:** ~30 min (commit timestamps span 09:49–10:16 local)
- **Started:** 2026-08-07 (continuation from 31-01's merged base)
- **Completed:** 2026-08-07T17:17:00Z
- **Tasks:** 3/3
- **Files modified:** 3 modified (`lib/cards-list.ts`, `tests/cards-list.test.ts`,
  `components/CardsClient.tsx`), 2 created (`lib/useDebouncedValue.ts`,
  `tests/use-debounced-value.test.ts`)

## Accomplishments

- **Task 1 — Debounced search + stale-response guard:** `lib/useDebouncedValue.ts` exports a
  `Debouncer<T>` pure scheduling class and a thin `useDebouncedValue<T>(value, delayMs)` hook
  wrapper (react-hooks/purity-safe — no `Date.now()`/`Math.random()` in render). The search input
  now debounces ~300ms before triggering any server request; a `searchSeqRef` sequence guard
  discards any response from a superseded, later-resolving request.
- **Task 2 — All four groups, real fetch + auto-load-on-scroll:** Grammar/Phrase/Other's
  expand-on-tap now performs a real `GET /api/cards?type=<key>&take=30` fetch (previously a no-op
  flag flip per 31-01's deliberate interim scope) with 4 skeleton rows while loading; a
  `rangeChanged` handler on the single flat `<Virtuoso>` auto-loads each expanded group's next page
  independently once within 5 rows of that group's own last loaded row — no "Load more" button
  anywhere. A failed batch shows inline `"Couldn't load more cards. Check your connection and try
  again."` + retry without clearing already-loaded rows; a fully-loaded group shows `"You've
  reached the end."`.
- **Task 3 — Search-flatten view, filter-commit server refetch, legacy filter deletion:** While a
  search term is active, results render as one flattened list (no group headers), sourced from a
  single `type=<filter>&search=…` server fetch; clearing the search re-hydrates the existing
  grouped state instead of re-fetching it. The Filter Sheet is two-tier (pending edits vs.
  committed values) so a lesson-range/type-pill change only re-issues the server query on "Done".
  The legacy `filteredVocabCards = groups.vocabulary.loaded.filter(...)` block is fully deleted —
  every rendered row now originates from a server response.
- **Deviation fix (Rule 2, see below):** `lib/cards-list.ts`'s `buildCardsWhere()` had no support
  for `type='other'` — added, with a new unit test.
- **Deviation fix (Rule 1, see below):** guarded the pre-existing SSR-refresh "gated adoption"
  blocks against firing while a client-side search/filter/lesson-range query is active.

## Task Commits

Each task was committed atomically (Task 2 and Task 3 landed in one combined commit — see note
below):

1. **Task 1: Debounced search input with a stale-response guard** - `bf5e4e0` (feat)
2. **Task 2 + Task 3 (combined): all four groups' lazy fetch/auto-load + search-flatten/filter-
   commit/legacy-filter-deletion** - `488e2bb` (feat)

**Plan metadata:** (this commit, docs: complete plan)

**Note on commit granularity:** Tasks 2 and 3 both modify the same tightly-coupled state machine
inside `components/CardsClient.tsx` (per-group fetch state, the composed `rows` array, the single
`runQuery()` query-runner) — there is no meaningful intermediate state between them that isn't
either "Task 2's expand/scroll machinery with no way to search yet" or a half-built duplicate of
work Task 3 immediately supersedes. They were implemented and verified together and landed in one
commit rather than a synthetic split. This is a documented process deviation, not a correctness
gap — full task-by-task attribution is preserved in the commit message body.

## Files Created/Modified

- `lib/useDebouncedValue.ts` - `Debouncer<T>` pure scheduling class + `useDebouncedValue<T>`
  hook wrapper
- `tests/use-debounced-value.test.ts` - 6 tests: settle-after-delay, burst-collapsing,
  cancel-clears-pending-timer, no-stale-double-apply, cancel-is-safe-no-op, independent instances
- `lib/cards-list.ts` - `buildCardsWhere()` gained a `type === 'other'` branch (`notIn` the three
  canonical types)
- `tests/cards-list.test.ts` - added a test for the new `'other'` where-builder branch
- `components/CardsClient.tsx` - rewritten: `useDebouncedValue` wiring, per-group real
  expand-on-tap fetch, `rangeChanged` auto-load handler, `skeleton`/`status` Row kinds, two-tier
  Filter Sheet (pending/committed), server-side search/filter query runner with dual
  stale-response guards, legacy client filter deleted, SSR-gated-adoption guards hardened against
  an active client-side query

## Decisions Made

See `key-decisions` in frontmatter — summarized: `Debouncer` unit-tested directly (no new test
dependency); Filter Sheet is two-tier (commit-on-Done, not per-tap); filter-commit failures share
search's error copy/banner (distinct from per-group scroll-failure copy); no result-count header
above search results; narrowing the type filter to one type auto-expands that group on commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] `lib/cards-list.ts` had no `type='other'` support**
- **Found during:** Task 2 (All four groups — lazy expand-on-tap fetch + auto-load-on-scroll)
- **Issue:** `buildCardsWhere()` only handled `type !== 'all'` by setting `where.type = params.type`
  directly. `'other'` is a UI-only catch-all bucket (any Card.type not in
  vocabulary/grammar/phrase) with no matching literal DB value — so `GET /api/cards?type=other`
  would always match zero rows, permanently breaking the Other group's expand-on-tap fetch and
  violating this plan's own must_haves.truths ("Tapping a collapsed group (Grammar, Phrase, or
  Other) triggers that group's first-page fetch and expands it").
- **Fix:** Added a `type === 'other'` branch mapping to `where.type = { notIn: ['vocabulary',
  'grammar', 'phrase'] }`.
- **Files modified:** `lib/cards-list.ts`, `tests/cards-list.test.ts`
- **Verification:** New unit test asserts the `notIn` where-clause shape; `npx vitest run
  tests/cards-list.test.ts` (16/16 passing).
- **Committed in:** `488e2bb` (Task 2+3 commit)

**2. [Rule 1 - Bug] SSR-refresh "gated adoption" would silently clobber a filtered client view**
- **Found during:** Task 3 (search-active flatten view, filter-commit server refetch)
- **Issue:** `components/CardsClient.tsx`'s pre-existing gated-adoption blocks (for
  `initialCardsPage`, `initialGroupCounts`, and `freshCards`) unconditionally adopt fresh
  SSR-delivered props whenever `editingId === null && !showAdd && !adding && deletingIds.size ===
  0`. Those props are always the server's UNFILTERED default page-1 view (the RSC page has no
  knowledge of client-side filter state). Before this plan, filtering was still an in-memory
  re-derive downstream of `groups.vocabulary.loaded`, so an SSR-refresh replace was harmless — the
  client filter would just re-apply on top. After this plan moves filtering server-side,
  `groups.vocabulary.loaded` directly IS the filtered result with no downstream re-filter — so a
  boundary refresh (tab focus, back/forward nav) arriving while the user had an active
  lesson-range/type/search filter would have silently overwritten their filtered view with the
  wrong (unfiltered) data.
- **Fix:** Added a `!hasActiveClientQuery` guard (`searchActive || filter !== 'all' || !fullSpan`)
  to all three gated-adoption blocks.
- **Files modified:** `components/CardsClient.tsx`
- **Verification:** `npm run build` clean; `npx playwright test e2e/freshness-gate.spec.ts` (the
  test most directly exercising this guard) passes; `npx eslint` clean.
- **Committed in:** `488e2bb` (Task 2+3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 2 — missing critical functionality, 1 Rule 1 — bug
prevention)
**Impact on plan:** Both necessary for the plan's own must_haves to actually hold as shipped (the
Other group would otherwise be permanently broken; the filtered view would otherwise be corrupted
by an ordinary tab-focus refresh). No scope creep beyond what's directly required.

## Known Stubs

None new. The pre-existing stubs documented in 31-01-SUMMARY.md (Reading Practice's independent
fetch, `FreshnessWatcher`'s inert `/cards` backstop) remain unresolved and out of this plan's
scope (31-04).

## Threat Flags

None. This plan's only new surface (`type=other`'s `notIn` clause) operates on the same
`GET /api/cards` trust boundary already covered by 31-01's threat model — no new endpoint, no new
input validation gap (the `type` query param was already an unvalidated pass-through string prior
to this plan).

## Issues Encountered

- One pre-existing e2e flake (`e2e/freshness-fresh-paths.spec.ts`'s `/study post-mutation-return`
  test) failed once during a full-suite run and passed cleanly when re-run in isolation — confirmed
  unrelated to this plan (no `/study`, `StudyClient.tsx`, or `lib/study-cards.ts` files were
  touched). Not investigated further per the deviation rules' scope boundary (pre-existing,
  out-of-scope-file flakiness).
- No jsdom/@testing-library/react exists in this codebase's devDependencies, so
  `useDebouncedValue` could not be tested by literally rendering it as a React hook. Per the
  executor's package-install rule (any `npm install`, including devDependencies, requires a
  human-verification checkpoint before proceeding), rather than halt this autonomous plan for a
  package-legitimacy check on two extremely common testing packages, the hook's actual scheduling
  logic was extracted into a plain, fully-testable `Debouncer` class instead — see key-decisions.

## User Setup Required

None - no external service configuration required.

## Requirement Completion Note

This plan's frontmatter lists `requirements: [CARDS-02, CARDS-03]`, but only **CARDS-03** is
marked complete in `.planning/REQUIREMENTS.md`. **CARDS-02 stays Pending**, carried forward
following 31-01's own established precedent: CARDS-02's must_haves.truths accessibility
statement ("Keyboard Tab navigation and a screen reader can still reach every rendered card row…")
is still NOT met — the keyboard-navigation gap in the virtualized Vocabulary group that 31-01
human-confirmed and explicitly deferred (WINDOWS.md entry #1, `deviation`, still `open`) was not
investigated or fixed by this plan (out of this plan's declared scope — Tasks 1–3 only touch
fetch/pagination/search wiring, not the virtualization/accessibility layer itself). Additionally,
this plan's own D3 coverage entry above is `human_judgment: true` — CARDS-02's "no unbounded DOM
growth while scrolling" claim for the newly-wired Grammar/Phrase/Other groups has not yet been
spot-checked against a real large deck. CARDS-02 should be marked complete only once BOTH gaps are
resolved or the human formally accepts the accessibility gap as a permanent, out-of-scope risk at
phase close.

## Next Phase Readiness

- `/cards`'s Cards view is now feature-complete against D-01 through D-06 per this plan's
  objective — 31-03/31-04 can build Reading Practice's own independent fetch (D-07) without
  touching this plan's fetch/state machinery.
- **Recommendation for the phase verifier / a follow-up manual check:** D3's coverage entry above
  is `human_judgment: true` — the e2e fixture (8 cards) cannot exercise a genuine second-page
  auto-load or a real Other-group expand. Recommend a manual dev-server spot-check against the
  real ~1056-card production deck (or a locally-bumped fixture) confirming: (a) Grammar/Phrase/
  Other groups render real rows on tap, (b) scrolling near a loaded group's boundary auto-loads
  more with no button, (c) a genuinely full deck's "You've reached the end." marker appears.
- `lib/cards-list.ts`'s `buildCardsWhere()` now supports all 4 UI group keys (`vocabulary`,
  `grammar`, `phrase`, `other`) plus `'all'` — no further server-side gaps block later plans.

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: `lib/useDebouncedValue.ts`
- FOUND: `tests/use-debounced-value.test.ts`
- FOUND: `.planning/phases/31-cards-list-pagination-virtualization/31-02-SUMMARY.md`
- FOUND: commit `bf5e4e0`
- FOUND: commit `488e2bb`
