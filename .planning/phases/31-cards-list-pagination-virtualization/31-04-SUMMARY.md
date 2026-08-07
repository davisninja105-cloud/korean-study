---
phase: 31-cards-list-pagination-virtualization
plan: 04
subsystem: ui
tags: [nextjs, react, react-virtuoso, prisma, freshness, cards, reading-practice]

# Dependency graph
requires:
  - phase: 31-cards-list-pagination-virtualization
    plan: "02"
    provides: Full Cards-view client wiring (per-group fetch, debounced search, Filter Sheet,
      useDebouncedValue) this plan's Reading Practice fetch mirrors and shares state with
  - phase: 31-cards-list-pagination-virtualization
    plan: "03"
    provides: getSentencesPage() + GET /api/cards/sentences — the backend endpoint this plan's
      Reading Practice tab wires up client-side for the first time
provides:
  - Reading Practice tab's own independent fetch pipeline (readingPractice state, fetchSentencesPage,
    its own <Virtuoso> instance) against GET /api/cards/sentences, replacing 31-01's
    groups.vocabulary.loaded.flatMap interim
  - D-08 tab-switch scroll/loaded-batch preservation via react-virtuoso getState()/restoreStateFrom
    snapshot pairs for both the Cards and Reading Practice <Virtuoso> instances (switchView() wrapper)
  - Edit sheet quick-edit (editingDraft state + findLoadedCardSummary): front/back/notes/type render
    editable immediately from already-in-memory data while only the sentence-editor section waits on
    GET /api/cards/[id], with a skeleton placeholder and a retry-on-error path
  - FreshnessWatcher's /cards backstop fixed from an inert Array.isArray(result) check (always false
    against the new CardsPageDTO object) to a real CardsPageDTO shape check, paired with an
    upsert-by-id merge in CardsClient (never a wholesale replace, never a delete-by-omission)
  - e2e/perf.spec.ts's '/cards' budget tightened to 100ms from a real measured POST-MIGRATION median
    (46ms), cited alongside the PRE-MIGRATION baseline (45ms) — with the honest "not meaningfully
    improved at this fixture's tiny scale" result documented rather than smoothed over
  - e2e/freshness-fresh-paths.spec.ts's '/cards post-mutation-return' test extended with an
    empirically-verified upsert-not-replace regression assertion
affects: [phase-32-study-load-round-trip-collapse]

# Actuals (#2632)
actuals:
  tokens: 10625
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-view react-virtuoso getState()/restoreStateFrom snapshot pair (31-RESEARCH.md Pattern 4)
      for preserving scroll position across a conditional-render unmount/remount — used for both the
      Cards <-> Reading Practice tab toggle here, generalizable to any future tabbed-Virtuoso UI in
      this codebase."
    - "Quick-edit local draft state (editingDraft) seeded from an already-in-memory list-row summary,
      rendered ahead of an on-demand detail fetch's resolution, then merged into the full editor
      component's props once the fetch resolves — lets a sheet/modal's 'fast' fields stay interactive
      immediately while only its 'slow' (fetched) section shows a loading placeholder, without
      changing the downstream component's own props interface."
    - "Backstop-payload upsert-by-id merge (never a wholesale replace, never delete-by-omission) for
      a partial/paginated background-refresh payload landing on top of client-paginated list state —
      applicable anywhere else in this codebase a JSON backstop delivers a single page against an
      already-multi-page-loaded client list."

key-files:
  created: []
  modified:
    - components/CardsClient.tsx
    - components/FreshnessWatcher.tsx
    - e2e/perf.spec.ts
    - e2e/freshness-fresh-paths.spec.ts

key-decisions:
  - "Tasks 1 and 2 landed in one combined commit (not two) — both modify the same tightly-coupled
    CardsClient.tsx state machine (view toggle, Edit sheet open/close, freshCards adoption) with no
    meaningful intermediate state between them, matching 31-02's own documented precedent for the
    same situation."
  - "Reading Practice's tab-toggle button shows no count at all (not 'Reading practice (N)') — there
    is no groupCounts-equivalent aggregate for the independent sentence stream, and showing 'loaded so
    far' would repeat the exact loaded-array-length false-total mistake CARDS-01's groupCounts
    invariant exists to prevent (31-RESEARCH.md Pitfall 2). Resolves the plan's own backstop item on
    this question."
  - "CARDS-01 marked complete in REQUIREMENTS.md — per 31-03-SUMMARY.md's own stated reasoning
    ('closing CARDS-01 here would risk marking it done before the phase's UI-facing pieces land'),
    this plan is that closing piece (Reading Practice + Edit sheet, the last two CARDS-01 consumers)."
  - "CARDS-02 stays Pending in REQUIREMENTS.md — the human-confirmed keyboard-Tab-navigation gap in
    the virtualized Vocabulary group (31-01, WINDOWS.md #1, still open) is untouched by this plan's
    task list (Reading Practice/Edit sheet/FreshnessWatcher/perf), and 31-02-SUMMARY.md explicitly
    left the decision of whether to accept it as a permanent risk to phase close, not to an
    individual plan."
  - "The freshness-fresh-paths.spec.ts upsert-not-replace test also delays router.refresh()'s own RSC
    re-fetch of /cards (matched by the rsc:1 header, not the URL — Next appends its own _rsc=<hash>
    cache-busting query param) so that legitimate real-data refresh can't mask a wholesale-replace
    regression in the backstop path. Verified empirically both directions: fails with loadedAfter=0
    when the fix is reverted to a wholesale replace and this delay is in place; passes with the real
    upsert fix."

patterns-established:
  - "When a component conditionally mounts/unmounts a <Virtuoso> instance across a tab toggle (not a
    display:none hide), always pair it with a getState()/restoreStateFrom snapshot captured
    immediately before the toggle — never rely on Virtuoso's own remount behavior to preserve scroll."
  - "A partial/paginated backstop payload merging into an already-paginated client list must always be
    upsert-by-id: update an already-loaded row in place, silently ignore a row not already loaded
    (never adopt it as if the partial payload were authoritative for 'what else exists'), and never
    remove a row absent from the payload."

requirements-completed: [CARDS-01]
# CARDS-02 is intentionally NOT marked complete despite being in this plan's
# `requirements` frontmatter — see key-decisions and "Requirement Completion Note" below.

coverage:
  - id: D1
    description: "Reading Practice tab fetches from GET /api/cards/sentences independently of the
      Cards tab's Vocabulary group, covering the full deck (D-07) — replaces the 31-01
      groups.vocabulary.loaded.flatMap interim entirely"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "npm run build (Turbopack + TypeScript, clean); grep -c
          'groups.vocabulary.loaded.flatMap' components/CardsClient.tsx returns 0; grep for
          '/api/cards/sentences' fetch call present"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/smoke.spec.ts e2e/freshness-*.spec.ts (full suite green,
          including Cards route tests exercising CardsClient with this change applied)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Switching between the Cards tab and Reading Practice tab preserves each tab's own
      scroll position and loaded-batch state via react-virtuoso getState()/restoreStateFrom (D-08) —
      switching never re-fetches or resets either view (readingPracticeVisitedRef gates the fetch to
      exactly once)"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "npm run build clean; code-path review of switchView()'s getState()/restoreStateFrom
          wiring and readingPracticeVisitedRef's one-shot fetch gate"
        status: pass
      - kind: manual_procedural
        ref: "Manual dev-server verification of the tab-switch scroll-preservation UX (scrolling
          partway down Cards, switching to Reading Practice and back, confirming scroll position
          survives) was NOT performed this session"
        status: unknown
    human_judgment: true
    rationale: "No existing e2e spec exercises scroll-position preservation across a tab toggle
      (the e2e fixture's 8-9 cards fit in one short page, making scroll position an unreliable signal
      even if a test were added). The underlying react-virtuoso API contract (getState captures
      scroll offset + measured sizes; restoreStateFrom replays it on remount) is used exactly per its
      documented pattern (31-RESEARCH.md Pattern 4), but genuine visual confirmation of the UX this
      code implements needs a human spot-check against a realistically-sized deck."
  - id: D3
    description: "Reading Practice shows two distinct empty-state messages (no sentences synced yet /
      filtered to zero) and the same bg-skeleton/animate-pulse loading pattern as the Cards list on
      its own initial load"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "grep for COPY.noSentencesYet / COPY.noSentencesFilterMatch string literals and the
          shared bg-skeleton rendering path in composeReadingRows()/renderReadingRow()"
        status: pass
    human_judgment: false
  - id: D4
    description: "Opening the Edit sheet fetches a card's full sentences on demand via
      GET /api/cards/[id]; front/back/notes fields (already in memory via editingDraft) remain
      editable while the sentence editor section shows a loading placeholder, then the real sentence
      editor once the fetch resolves"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "npm run build clean; code-path review of openEdit()/findLoadedCardSummary()/
          editingDraft's quick-edit render branch vs. the full CardEditor render branch"
        status: pass
    human_judgment: false
  - id: D5
    description: "A failed on-demand sentence fetch in the Edit sheet shows \"Couldn't load this
      card's sentences. Try again.\" with a retry link, while front/back/notes stay editable"
    requirement: "CARDS-01"
    verification:
      - kind: other
        ref: "grep for COPY.editSentencesLoadError string literal rendered inside the
          editingDetailError branch, which sits alongside (not instead of) the still-editable
          front/back/notes quick-edit fields"
        status: pass
    human_judgment: false
  - id: D6
    description: "FreshnessWatcher's /cards backstop delivery is upsert-by-id into the existing
      per-group loaded arrays — it never wholesale-replaces the cards state, and never removes a card
      merely because it is absent from a partial backstop payload (T-31-08, CARDS-01 prohibition)"
    requirement: "CARDS-01"
    verification:
      - kind: e2e
        ref: "e2e/freshness-fresh-paths.spec.ts#/cards post-mutation-return stays fresh (extended
          upsert-not-replace assertion) — empirically verified to fail (loadedAfter=0) when the fix is
          reverted to a wholesale replace, confirming the test is load-bearing, not vacuous"
        status: pass
    human_judgment: false
  - id: D7
    description: "e2e/perf.spec.ts's '/cards' budget in PAGE_BUDGETS_MS is set from a real, measured
      post-migration median DCL reading (with headroom), with the PRE-MIGRATION baseline from
      31-01-SUMMARY.md cited alongside it"
    requirement: "CARDS-01"
    verification:
      - kind: e2e
        ref: "npx playwright test e2e/perf.spec.ts -g cards (median dcl 46ms measured, budget set to
          100ms = ceil(46*1.5/100)*100; test passes)"
        status: pass
    human_judgment: false
  - id: D8
    description: "npm test and the smoke/freshness/perf/grade-flow/active-flow/study-filter-skeleton/
      settings-flash e2e suites all pass with the full phase's changes applied together"
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "npm test (300/300 passing)"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/smoke.spec.ts e2e/perf.spec.ts e2e/freshness-*.spec.ts
          e2e/grade-flow.spec.ts e2e/active-flow.spec.ts e2e/study-filter-skeleton.spec.ts
          e2e/settings-flash.spec.ts (37/37 passing)"
        status: pass
    human_judgment: false

duration: ~2h active work (includes iterative empirical verification of the freshness test's
  regression-catching validity, which required 3 rounds of debugging a route-interception timing gap)
completed: 2026-08-07
status: complete
---

# Phase 31 Plan 04: Reading Practice UI Wiring & Regression Summary

**Reading Practice tab now fetches from `GET /api/cards/sentences` independently with react-virtuoso tab-switch scroll preservation, the Edit sheet's front/back/notes render editable immediately while sentences load on demand, `FreshnessWatcher`'s `/cards` backstop is fixed from inert to a real upsert-by-id merge, and `e2e/perf.spec.ts`'s `/cards` budget is tightened to 100ms from a genuine measured median — closing all three of Phase 31's deliberately-deferred integration gaps.**

## Performance

- **Duration:** ~2h active work (includes iterative empirical verification of the freshness test's regression-catching validity)
- **Started:** 2026-08-07 (fresh worktree, no prior partial state — see retry note)
- **Completed:** 2026-08-07
- **Tasks:** 3/3
- **Files modified:** 4 (`components/CardsClient.tsx`, `components/FreshnessWatcher.tsx`, `e2e/perf.spec.ts`, `e2e/freshness-fresh-paths.spec.ts`)

## Accomplishments

- **Task 1 — Reading Practice independent fetch + D-08 tab-state preservation:** Replaced 31-01's `groups.vocabulary.loaded.flatMap(...)` interim with a full independent pipeline: `readingPractice` state (`loaded`/`nextCursor`/`hasMore`/`loading`/`error`), `fetchSentencesPage()` calling `GET /api/cards/sentences`, its own debounced-search/lesson-range wiring (deliberately ignoring the type-pill filter — a flat sentence stream, not type-grouped), lazy first-fetch on first tab visit (`readingPracticeVisitedRef`), and its own `<Virtuoso>` instance with scroll-triggered auto-load. D-08 tab-switch preservation implemented via react-virtuoso's `getState()`/`restoreStateFrom` snapshot pair (31-RESEARCH.md Pattern 4) for both the Cards and Reading Practice `<Virtuoso>` instances, routed through a new `switchView()` wrapper that captures the outgoing view's snapshot before toggling. Two distinct empty-state messages ("No example sentences yet…" / "No example sentences match your filter.") plus the shared `bg-skeleton`/`animate-pulse` loading pattern.
- **Task 2 — Edit sheet quick-edit + FreshnessWatcher upsert fix:** Opening the Edit sheet now seeds a new `editingDraft` state (front/back/notes/type) from whichever loaded row was tapped (`findLoadedCardSummary`, searching across `groups`/`searchResults`/`readingPractice`), rendering those fields editable immediately while only the sentence-editor section shows a skeleton placeholder (or retry-on-error) until `GET /api/cards/[id]` resolves; the full `CardEditor` then mounts pre-seeded with the draft's live values so in-progress edits are never lost. `FreshnessWatcher`'s `/cards` backstop switched from `Array.isArray(result)` (always false against the new `CardsPageDTO` object shape — previously silently inert) to a real shape check; `CardsClient`'s `freshCards`-adoption effect changed from a de-facto wholesale replace to a genuine upsert-by-id merge into each card's own per-type group.
- **Task 3 — Real perf measurement + freshness regression extension + full suite:** Measured the real POST-MIGRATION `/cards` median DCL (46ms, vs. the 45ms PRE-MIGRATION baseline recorded in 31-01-SUMMARY.md) and set `PAGE_BUDGETS_MS['/cards']` to `100` (`Math.ceil(46 * 1.5 / 100) * 100`), replacing the generic `3000`. The result — post-migration essentially unchanged from pre-migration at this fixture's tiny (8-9 card) scale — is documented plainly rather than smoothed over, since the real win targets the ~1056-card production deck this fixture can't exercise. Extended `e2e/freshness-fresh-paths.spec.ts`'s existing `/cards post-mutation-return` test with an upsert-not-replace assertion, intercepting the backstop's own exact no-query `GET /api/cards` call to force a synthetic empty partial page while separately delaying `router.refresh()`'s own RSC re-fetch (which would otherwise mask the regression). Ran the full regression pass: `npm test` (300/300) and `npx playwright test e2e/smoke.spec.ts e2e/perf.spec.ts e2e/freshness-*.spec.ts e2e/grade-flow.spec.ts e2e/active-flow.spec.ts e2e/study-filter-skeleton.spec.ts e2e/settings-flash.spec.ts` (37/37).

## Task Commits

Each task was committed atomically, with Tasks 1 and 2 combined per the same rationale 31-02 documented for its own Tasks 2+3:

1. **Task 1 + Task 2 (combined): Reading Practice independent fetch + Edit sheet quick-edit + FreshnessWatcher upsert fix** - `23f2cae` (feat)
2. **Task 3: Real post-migration baseline, perf budget tightening, freshness regression extension, full suite** - `07ea50a` (test)

**Plan metadata:** (this commit, docs: complete plan)

**Note on commit granularity:** Tasks 1 and 2 both modify the same tightly-coupled `CardsClient.tsx` state machine (the `activeView` toggle, the Edit sheet open/close flow, the `freshCards`-adoption effect) with no meaningful intermediate state between them — implemented and verified together and landed in one commit, matching 31-02's own documented precedent for the identical situation. Full task-by-task attribution is preserved in the commit message body.

## Files Created/Modified

- `components/CardsClient.tsx` — Added `readingPractice` state + `fetchSentencesPage`/`fetchReadingPracticePage`/`fetchReadingPracticeNextPage`/`retryReadingPracticeFetch`; `cardsVirtuosoRef`/`cardsSnapshot` + `readingVirtuosoRef`/`readingSnapshot` + `switchView()` for D-08; `ReadingRow` composed-row type + `composeReadingRows()`/`renderReadingRow()`; `editingDraft` state + `findLoadedCardSummary()` for the Edit sheet quick-edit UI; `freshCards`-adoption effect rewritten to an upsert-by-id merge
- `components/FreshnessWatcher.tsx` — `/cards` backstop branch: `Array.isArray(result)` → `page && Array.isArray(page.cards)`; `FreshPayloads.cards` type changed from `CardDTO[] | null` to `CardsPageDTO | null`
- `e2e/perf.spec.ts` — `PAGE_BUDGETS_MS['/cards']` changed from `3000` to `100`, with the pre/post-migration measurement comment block documenting the honest "not meaningfully improved at this scale" result
- `e2e/freshness-fresh-paths.spec.ts` — Extended the `/cards post-mutation-return stays fresh` test with an upsert-not-replace regression assertion (route interception + `simulateResume`)

## Decisions Made

See `key-decisions` in frontmatter — summarized: Tasks 1+2 combined into one commit (tightly-coupled state machine, matching 31-02 precedent); Reading Practice's tab label shows no count (no authoritative total exists, avoiding the exact false-total mistake CARDS-01's `groupCounts` invariant prevents); CARDS-01 marked complete now (this plan is 31-03's own stated "closing piece"); CARDS-02 stays Pending (unresolved, human-deferred keyboard-accessibility gap outside this plan's scope); the freshness test's RSC-refresh delay matches on the `rsc: 1` header rather than a bare pathname, since Next appends its own `_rsc=<hash>` cache-busting query param.

## Deviations from Plan

None — all three tasks executed within their declared scope. The extensive empirical verification work on the freshness test (documented under Issues Encountered) was investigation needed to correctly implement Task 3's literal instruction to "demonstrate the upsert-not-replace behavior," not a deviation from the plan's intent.

## Issues Encountered

- **The freshness test's first two implementation attempts silently failed to exercise the regression they were meant to catch.** Route-interception matching `**/api/cards` (no trailing wildcard) correctly isolated the backstop's own parameterless call, but the companion attempt to delay `router.refresh()`'s own RSC re-fetch of `/cards` (needed so that legitimate real data delivered by that unrelated, correct code path couldn't mask a wholesale-replace bug in the backstop path) initially matched on `url.search === ''`, which never matched — Next.js's `router.refresh()` appends its own `_rsc=<hash>` cache-busting query parameter to the RSC re-fetch request. This meant the "regression" test passed even when a deliberately-reintroduced wholesale-replace bug was active in `CardsClient.tsx`, because the real (correct) `router.refresh()` data silently overwrote the backstop's buggy empty state before the assertion ran. Diagnosed via targeted `console.log` instrumentation (both browser-side, forwarded through Playwright's `page.on('console')`, and Node-side inside the route handlers) tracing the exact sequence of network calls and state updates. Fixed by matching the RSC-refresh delay on pathname alone (`url.pathname === '/cards'`) combined with the `rsc: 1` header check, independent of query string. Re-verified empirically in both directions afterward: reverting the real fix back to a wholesale replace makes the assertion fail (`loadedAfter === 0`) with this corrected test; the real fix passes. All debug instrumentation was removed before the final commit.
- One transient issue unrelated to code correctness: two stale `next-server` processes were still listening on port 3100 from earlier interactive test runs, causing Playwright's `webServer.reuseExistingServer` option to reuse an old build that didn't reflect an in-progress code edit during the debugging above. Resolved by killing those processes before each build-sensitive verification run.

## User Setup Required

None - no external service configuration required.

## Requirement Completion Note

This plan's frontmatter lists `requirements: [CARDS-01, CARDS-02, CARDS-03]`. **CARDS-01 is now marked complete** in `.planning/REQUIREMENTS.md` — 31-03-SUMMARY.md explicitly deferred closing it, reasoning that "the phase's remaining plans (31-02's server-side search, 31-04's Reading Practice UI wiring) are part of the same requirement's full delivery"; this plan is that stated closing piece (Reading Practice's independent fetch and the Edit sheet's on-demand fetch, CARDS-01's last two unresolved consumers, both land here). **CARDS-02 stays Pending**, unchanged from 31-01/31-02's own precedent: the human-confirmed keyboard-Tab-navigation gap in the virtualized Vocabulary group (WINDOWS.md #1, still `open`) is untouched by this plan's task list (Reading Practice fetch / Edit sheet / FreshnessWatcher / perf budget — none of which touch the virtualization/accessibility layer), and 31-02-SUMMARY.md explicitly reserved the decision of whether to accept that gap as a permanent, out-of-scope risk for phase close, not for an individual plan to decide unilaterally. **CARDS-03** was already marked complete by 31-02.

## Broken-Windows Ledger Updates

- **Fixed (id 2):** "Reading Practice tab always shows empty state — temporarily sourced from `groups.vocabulary.loaded`…" — resolved by this plan's D-07 independent fetch.
- **Fixed (id 4):** "`FreshnessWatcher`'s `/cards` backstop is inert — its `Array.isArray(result)` check never matches the new `CardsPageDTO` object shape…" — resolved by this plan's shape-check fix.
- **New (id 6, stub, still open):** ROADMAP Phase 31 Success Criterion 4 ("a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves") is not implemented anywhere across the phase — card rows carry no per-card sentence-count badge, and no plan in 31-01 through 31-04 scheduled one. Flagging plainly for the phase verifier; not fixed here since it wasn't in this plan's declared task list or `must_haves`, and adding a new per-card aggregate query is architecture-adjacent (Rule 4 territory) rather than a same-scope fix.
- **Still open (id 1):** CARDS-02 keyboard-Tab-navigation gap (human-deferred, 31-01) — untouched by this plan, see Requirement Completion Note above.
- **Still open (id 5):** CARDS-02 all-4-groups behavior not manually spot-checked against the real ~1056-card production deck (31-02) — untouched by this plan; still a recommended manual follow-up.

## Next Phase Readiness

- All three of Phase 31's deliberately-deferred integration gaps (D-07 Reading Practice fetch, Edit sheet on-demand fetch UX, FreshnessWatcher upsert-merge) are now closed. `components/CardsClient.tsx` and `components/FreshnessWatcher.tsx` are feature-complete against this plan's `must_haves`.
- `e2e/perf.spec.ts`'s `/cards` budget (100ms) is now a real, defensible number tied to a documented measurement methodology — a future phase re-measuring against a more realistic fixture size should follow the same PRE/POST-MIGRATION comment pattern established here.
- **Two items remain genuinely open going into Phase 32 / phase close** (both pre-existing from 31-01/31-02, neither touched by this plan, both recorded in `.planning/WINDOWS.md`): (1) CARDS-02's keyboard-Tab-navigation gap in the virtualized Vocabulary group, human-deferred but not formally accepted as permanent; (2) the newly-flagged per-card sentence-count badge gap (ROADMAP Success Criterion 4) that no plan in this phase scheduled. Both should be explicitly triaged at phase close (accept, waive, or schedule a follow-up plan) rather than silently carried forward.
- Phase 32 (Study Load Round-Trip Collapse) depends on Phase 31 completing, not on any specific unresolved item here — the `/cards` pagination/virtualization foundation this plan finishes is independent of `/study`'s round-trip work.

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-07*

## Self-Check: PASSED

- FOUND: `components/CardsClient.tsx`
- FOUND: `components/FreshnessWatcher.tsx`
- FOUND: `e2e/perf.spec.ts`
- FOUND: `e2e/freshness-fresh-paths.spec.ts`
- FOUND: `.planning/phases/31-cards-list-pagination-virtualization/31-04-SUMMARY.md`
- FOUND: commit `23f2cae`
- FOUND: commit `07ea50a`
