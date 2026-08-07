# Phase 31: Cards List Pagination & Virtualization - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Stop `/cards` from querying, serializing, transferring, and hydrating the entire ~1056-card deck plus its ~1616 sentence rows on every visit:

1. **Cap the initial query** — the RSC page (`app/cards/page.tsx` via `lib/cards-list.ts:getCardsList()`) currently does one unbounded `prisma.card.findMany()` with a full `sentences` relation include. This phase caps it to a page and drops `sentences` from the list read entirely (replaced by a count, per Success Criterion 4).
2. **Window the rendered rows** so the DOM stays bounded as more pages load — not just append-and-grow.
3. **Move search + lesson filtering server-side** so correctness survives pagination (a search/filter must be able to find a match anywhere in the full deck, not just the currently-loaded page).
4. **Everything else on the page still works**: add, edit, delete, swipe-to-delete, tap-to-gloss, group collapse, and the Reading practice view, against the new paginated data source.

**Not in scope:** `/study`'s round-trip collapse (Phase 32), the freshness-backstop double-fetch (Phase 33), IndexedDB caching (Phase 34), the service worker (Phase 35).

**Pre-work flagged, not part of this phase's build:** `.planning/STATE.md` §Operator Next Steps calls for re-measuring the ROADMAP.md baseline table now that Phase 30 has landed, *before* Phase 31 begins — this hasn't happened yet as of context-gathering. Flagging for whoever runs `/gsd-plan-phase 31` or executes: confirm this re-measurement has happened (or do it) so Success Criterion 1's "tightened threshold" has a real number to tighten against.

</domain>

<decisions>
## Implementation Decisions

### Card browsing layout
- **D-01: Keep the grouped-by-type sections (Vocabulary/Grammar/Phrase/Other), not a flat list.** — **Reversibility:** costly — **rationale:** the pagination query shape differs materially between "one global cursor across the whole deck" and "independent pagination per group." Grouped mode was chosen up front specifically so research/planning picks the per-group-aware approach (e.g. a library with native grouped-virtualization support, see Code Context below) rather than building a flat cursor first and retrofitting groups later.
- **D-02: Only the Vocabulary group starts expanded on page load; Grammar/Phrase/Other start collapsed.** This is a deliberate change from today's "all groups start expanded" behavior — chosen specifically to lighten the first paint (a collapsed group's cards don't need to be fetched until the user taps it open). Collapsed group headers still show their true full-deck count (server-aggregated, not "how many are loaded").
- **Group total counts and the "Cards (N)" tab-toggle count must reflect the full filtered deck, not what's loaded so far** — this was implicit in the roadmap's Success Criterion 4 ("a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves") and confirmed by extension to the per-group and page-total counts. `e2e/smoke.spec.ts` already asserts `Cards (${FIXTURE.totalCards})` on first load — this assertion must keep passing, so the total count is a real full-deck number even though only a first page of rows is loaded.

### Scroll-loading feel
- **D-03: Auto-load the next batch as you approach the bottom of a group's loaded rows — no "Load more" button, no tap required.** (Current 2024–25 UX research actually leans toward "Load more" buttons for exactly the reason virtualized lists complicate — losing scroll position — but the user's explicit preference is auto-load; the scroll-position-preservation decision below (D-04) is what makes auto-load safe here.)
- **D-04: Opening and closing the Edit sheet (or the swipe-to-delete action) must never reset scroll position or discard already-loaded batches.** Whatever was loaded and wherever you'd scrolled to must be exactly as you left it once the Sheet closes. This constrains the pagination state to live above/outside whatever unmounts when the Sheet opens (i.e., not re-derived from a fresh fetch on Sheet close).

### Search scope
- **D-05: Server-side search still matches inside example sentences (Korean + English), not just the card's front/back/notes.** Preserves today's behavior — a query that only appears inside an example sentence must still surface its card. The server query joins/filters across the `Sentence` relation, not just `Card` columns.
- **D-06: While a search term is active, results flatten out of the Vocabulary/Grammar/Phrase/Other grouping into one combined list** (explicitly against the research-recommended "stay grouped" default — the user's stated preference). Clearing the search term returns to the grouped view from D-01/D-02.
- **Debounce: ~300ms**, informed by 2024-25 UX research consensus (200ms feels instant but over-fetches; 500ms+ starts feeling laggy) — not discussed as a user preference, treated as an implementation default. See Claude's Discretion.

### Reading practice view
- **D-07: The Reading practice tab gets its own independent paginated/windowed fetch** (same lesson-range + type + search filters as the Cards tab), rather than reusing whatever cards happen to be loaded in the Cards tab or staying unbounded. — **Reversibility:** costly — **rationale:** this establishes a second server-side query/endpoint distinct from the Cards list endpoint (sentences are the row unit here, not cards); consolidating it later into the Cards endpoint or reworking its shape means migrating whatever the executor builds against it.
- **D-08: Each tab (Cards / Reading practice) keeps its own scroll position and loaded-batch state independently when you switch between them** — switching tabs never re-fetches or resets either view. Symmetric with D-04's "Edit sheet never resets state" decision, applied to tab-switching as the other place state could otherwise be lost.

### Claude's Discretion
- **Pagination mechanism (cursor vs offset), page/batch size, and the exact virtualization library.** Not discussed as a user-facing preference — this is architecture research's call. Flagging from research (see Code Context): **React Virtuoso** has a native "grouped mode" with sticky headers that maps directly onto D-01's decision to keep grouped sections — worth strong consideration over a more manual approach (e.g. TanStack Virtual) given D-01 is locked. No virtualization library exists in `package.json` today (`grep` confirmed zero hits for `virtual|react-window|react-virtual|tanstack`) — adding one is very likely necessary to satisfy Success Criterion 2 ("rendered DOM staying bounded"); this breaks the "no new npm packages" pattern celebrated in v1.1/v1.2 (see PROJECT.md Key Decisions), but that pattern applied to those specific milestones' scope, not as a standing project-wide rule, and true DOM-bounded windowing is difficult to hand-roll correctly.
- **New API endpoint(s) needed:** editing a card (`CardEditor`) currently reads `sentences` straight off the already-in-memory `CardDTO` from the full list. Once the list query drops `sentences` (D-01's premise / roadmap Success Criterion 4), opening the Edit sheet needs a fetch for that one card's full sentences — there is currently no `GET /api/cards/[id]` route (only `PUT`/`DELETE`). Research should confirm whether to add one, or fold a sentences-fetch into the existing edit flow some other way.
- **`FreshnessWatcher` / `useFreshPayload` integration is a correctness-critical seam, not discussed with the user because it's pure technical integration:** `components/FreshnessWatcher.tsx` currently does its own `fetch('/api/cards')` (today: full deck, no params) as the JSON backstop, and `CardsClient.tsx`'s gated-adoption logic (`prevFreshCards`/`prevInitialCards`) compares that against `initialCards` assuming both are "the same shape of full list." Once `GET /api/cards` becomes paginated/filtered, `FreshnessWatcher`'s backstop fetch and `CardsClient`'s gated-adoption comparison must be updated in lockstep (e.g. the backstop should re-fetch only the current first page/filter state, not silently keep assuming a full-deck array) — research must resolve this explicitly, it is not optional cleanup.
- Exact widths/positions of any loading-state skeleton rows (this phase has `UI hint: yes` — visual detail belongs to `/gsd-ui-phase 31`, not this discussion).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` §Cards List Performance (P3.2) — CARDS-01, CARDS-02, CARDS-03 full requirement text
- `.planning/ROADMAP.md` §Phase 31 — Goal, 5 Success Criteria, `Depends on: Phase 30`, `UI hint: yes`
- `.planning/ROADMAP.md` §Progress — on-device baseline table (`/cards` Tab: 6.4s→<1.0s target) and the explicit instruction: "Re-measure the baseline table after Phase 30 before starting Phase 31"

### State / accumulated decisions
- `.planning/STATE.md` §Accumulated Context → Decisions — v1.8 roadmap shaping rationale (why P3.2 is its own phase)
- `.planning/STATE.md` §Operator Next Steps — re-measurement pre-work flagged above in `<domain>`
- `.planning/STATE.md` §Blockers/Concerns — do NOT delete `FreshnessWatcher`; it works around a real unfixed Next.js 16.2.1 bug

### Project conventions
- `CLAUDE.md` §RSC server hydration + DTO pattern (2026-07 v1.2) — the `app/*/page.tsx` thin-RSC / `*Client.tsx` shell / DTO-boundary pattern this phase must continue following
- `CLAUDE.md` §Cards page — iOS-native (2026-06 P2) — the existing Sheet/SwipeRow/filter-icon UI this phase extends, not replaces
- `CLAUDE.md` §Gotchas/conventions — `react-hooks/purity` (no `Date.now()`/`Math.random()` in render — relevant for any debounce-timer or virtualization-measurement code)
- `.claude/CLAUDE.md` §Async Patterns — `Promise.allSettled()` usage precedent for independent-failure-tolerant parallel fetches (relevant if the new list query and a new count/group-totals query run in parallel)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/cards-list.ts` — the exact function this phase rewrites. `getCardsList()` is currently one unbounded `prisma.card.findMany()` with a `select` (not `include`) that pulls full `sentences` per card; shared by both `app/cards/page.tsx` (RSC) and `GET /api/cards` (client re-fetch / `FreshnessWatcher` backstop), mirroring the `lib/study-cards.ts` / `lib/dashboard.ts` extraction pattern already established in the codebase. **Note:** this file is not yet listed in `CLAUDE.md`'s Key Files — worth adding when `CLAUDE.md` is refreshed at milestone close.
- `components/LessonRangeFilter.tsx` + the Study page's server-side lesson-filter pattern (`GET /api/cards/due?lessonFrom=&lessonTo=`, gated by `isFilterLoading`) — `/study` already proves the "commit filter → server refetch → skeleton while loading" pattern this phase needs for `/cards`' lesson range and type filter.
- `--skeleton-bg` / `bg-skeleton` token (shipped Phase 30) — use for any loading-state placeholders this phase introduces, per the established dark-mode-visible-skeleton pattern.

### Established Patterns
- RSC + client-shell + DTO pattern: `app/cards/page.tsx` (thin async RSC) → `components/CardsClient.tsx` (`'use client'`, owns all state/interactivity). This phase's new pagination/search/filter state belongs in `CardsClient.tsx`, not the page.
- Gated prop adoption (`prevInitialCards`/`prevFreshCards` in `CardsClient.tsx`, lines ~77–100): never adopt a freshly-delivered payload while `editingId !== null || showAdd || adding || deletingIds.size > 0` — this guard must be preserved and extended to cover whatever new in-flight pagination/search state this phase introduces (e.g. don't clobber a mid-scroll loaded-pages array either).
- `CardEditor.tsx` currently receives the full `CardDTO` (including `sentences`) via `editingCard = cards.find(c => c.id === editingId)` — a purely client-side lookup into already-loaded data. This breaks once `sentences` is dropped from the list query (see Claude's Discretion above re: new endpoint).

### Integration Points
- `GET /api/cards` (`app/api/cards/route.ts`) — currently returns the full array from `getCardsList()` with no params; both the RSC page and `FreshnessWatcher`'s backstop consume it. Becomes the paginated/filtered/searched endpoint.
- `POST /api/cards` (same file) — card creation; unaffected by pagination, but its response (a single created card, prepended client-side via `setCards(prev => [created, ...prev])`) must still make sense against a paginated/grouped list.
- `app/api/cards/[id]/route.ts` — has `PUT`/`DELETE` only, no `GET`. Needed if research resolves the "fetch full sentences on Edit" question toward a new endpoint (see Claude's Discretion).
- `e2e/smoke.spec.ts` (`Cards renders the real seeded total-card count on first load`) and `e2e/perf.spec.ts` (`/cards` page-load budget, currently 3000ms per Phase 30's D-06) — both must stay green; the perf budget is explicitly named in Success Criterion 1 as needing a "tightened threshold" once this phase lands.
- No `e2e/cards-*.spec.ts` CRUD flow currently exists (E2E-08 is deferred to v2 per `CLAUDE.md`/`STATE.md`) — so this phase's "existing e2e suites stay green" (Success Criterion 5) does not include a dedicated Cards CRUD regression spec; the freshness/smoke/perf specs above are the actual existing coverage touching `/cards`.

</code_context>

<specifics>
## Specific Ideas

No additional specific references beyond the decisions above — discussion covered all 4 gray areas the user selected (card browsing layout, scroll-loading feel, search scope, reading practice view). The manifest-locked success criteria (initial-page-under-1s, smooth scroll with bounded DOM, correct full-deck search/filter, add/edit/delete/swipe/tap-to-gloss/collapse/reading-practice all still working, existing suites green) were treated as locked requirements, not discussable gray areas.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions arose.

</deferred>

---

*Phase: 31-cards-list-pagination-virtualization*
*Context gathered: 2026-08-06*
