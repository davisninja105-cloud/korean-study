---
phase: 31-cards-list-pagination-virtualization
verified: 2026-08-07T20:13:34Z
status: human_needed
score: 20/22 must-haves verified
behavior_unverified: 2
overrides_applied: 0
gaps:
  - truth: "A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves (ROADMAP Success Criterion 4, second clause)"
    status: failed
    reason: "No per-card sentence-count signal exists anywhere in the codebase. CARDS-01's removal of `sentences` from the list `select` (correctly, per CARDS-01) removed the only prior signal (full indented sentence previews) and no replacement — not even a numeric `_count` — was scheduled or built in any of 31-01 through 31-04. Confirmed by grep across lib/cards-list.ts, app/api/cards/route.ts, components/CardsClient.tsx, lib/dto.ts: zero hits for sentenceCount/_count-on-sentences/any count badge. This is self-reported in 31-04-SUMMARY.md (Broken-Windows Ledger 'New (id 6)') and WINDOWS.md entry #6 (status: open)."
    artifacts:
      - path: "lib/cards-list.ts"
        issue: "getCardsPage's cardSelect has no `_count: { select: { sentences: true } }` or equivalent; getCardsGroupCounts has no per-card variant"
      - path: "components/CardsClient.tsx"
        issue: "renderCardRow has no sentence-count badge/indicator anywhere in its JSX"
    missing:
      - "A cheap per-card sentence-count signal (e.g. `_count: { select: { sentences: true } }` added to cardSelect) and a small UI badge/indicator in renderCardRow surfacing it, without loading the actual sentence rows"
  - truth: "Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group (31-01 must_haves.truths, CARDS-02 accessibility prohibition)"
    status: failed
    reason: "Human-verified during 31-01 execution (2026-08-07): keyboard-only Tab navigation does not correctly reach card rows/Edit controls inside the virtualized Vocabulary group — off-screen row virtualization removes rows from the DOM/accessibility tree between scroll positions, and Tab alone does not trigger react-virtuoso to scroll a not-yet-rendered row into view. The human explicitly said 'tab didnt work but that is a non-blocker... dont spend time trying to fix it' and no investigation or fix was attempted in 31-02/31-03/31-04. Confirmed still true by code inspection: renderCardRow's Edit control (components/CardsClient.tsx:1127-1132) is a plain native `<button>` inside Virtuoso-rendered rows with no supplementary keyboard-navigation affordance (no roving tabindex, no 'scroll focused item into view' wiring) added anywhere in the current codebase. This is honestly self-reported and NOT silently closed: REQUIREMENTS.md still lists CARDS-02 as Pending (not Complete), and WINDOWS.md entry #1 is still status: open."
    artifacts:
      - path: "components/CardsClient.tsx"
        issue: "No keyboard-accessible fallback for virtualized off-screen rows (no roving tabindex / focus-triggered scroll-into-view / skip-link pattern)"
    missing:
      - "Either a react-virtuoso-compatible keyboard navigation pattern (e.g. scrollToIndex on focus-intent, or a non-virtualized fallback under reduced-motion/AT detection) or a formal, recorded human acceptance of this as a permanent risk"
deferred: []
behavior_unverified_items:
  - truth: "All four type groups' expand-on-tap fetch and per-group scroll-proximity auto-load (rangeChanged, within 5 rows of a group's own loaded boundary) behave correctly against a realistically large deck"
    test: "On a dev server seeded with a large (~1000-card) deck, tap to expand Grammar/Phrase/Other and scroll each group near its loaded boundary; confirm each group's next page fetches automatically with no 'Load more' button, independent of the other groups' scroll state."
    expected: "Each group's rows keep appending as its own boundary is approached; a fully-loaded group shows 'You've reached the end.'; DOM node count stays bounded throughout."
    why_human: "The only fixture available in this repo's e2e suite is 8-9 cards (≤ PAGE_SIZE=30), which cannot exercise a second-page fetch or a genuinely large Other-group expand. 31-02-SUMMARY.md's own coverage entry (D3) marks this human_judgment:true / status:unknown for exactly this reason, and WINDOWS.md entry #5 (open) requests this same manual check. No code defect was found by inspection (rangeChanged handler, per-group hasMore/nextCursor state, and the where-builder are all present and unit-tested) — only the at-scale runtime behavior is unproven."
  - truth: "Switching between the Cards tab and the Reading Practice tab preserves each tab's own scroll position with no re-fetch or reset (D-08)"
    test: "Scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll it, switch back to Cards, and confirm both tabs' scroll positions and loaded rows are exactly as left (no jump to top, no re-fetch)."
    expected: "Both Virtuoso instances restore their pre-switch scroll offset via restoreStateFrom, and neither view's loaded-row state resets."
    why_human: "31-04-SUMMARY.md's own coverage entry (D2) explicitly states this manual dev-server verification 'was NOT performed this session' and marks it human_judgment:true / status:unknown — the e2e fixture's 8-9 cards make scroll-position preservation an unreliable signal even with an automated test. Code inspection confirms the getState()/restoreStateFrom wiring and switchView() wrapper exist and follow react-virtuoso's documented contract exactly, but no automated or manual check has exercised the actual visual behavior yet."
human_verification:
  - test: "On a dev server seeded with a large (~1000-card) deck, tap to expand Grammar/Phrase/Other and scroll each group near its loaded boundary."
    expected: "Each group auto-loads its next page independently with no 'Load more' button; a fully-loaded group shows the end-of-list marker; DOM stays bounded."
    why_human: "8-9 card e2e fixture cannot exercise a real second-page boundary or a meaningfully large Other-group expand (WINDOWS.md #5, open)."
  - test: "Scroll Cards partway down, switch to Reading Practice, scroll it, switch back to Cards."
    expected: "Both views restore exact scroll position; neither view re-fetches or loses already-loaded rows."
    why_human: "No automated test exercises tab-switch scroll preservation; 31-04-SUMMARY.md explicitly flags this as not manually verified this session."
  - test: "Tab through the rendered Vocabulary group with keyboard only, including scrolling past the initially-rendered rows."
    expected: "Every card row's Edit control should receive visible focus in order; a screen reader should announce each row as focused; off-screen rows should not become permanently unreachable dead focus stops."
    why_human: "Already human-verified to FAIL during 31-01 execution (2026-08-07) and explicitly deferred as non-blocking by the human at that time — surfacing again here so phase close makes an explicit, recorded decision (fix, formally waive, or accept as permanent risk) rather than this staying silently unresolved. See gaps section above; this same item is also listed there as a failed must-have, not purely a human-verification backstop."
---

# Phase 31: Cards List Pagination & Virtualization Verification Report

**Phase Goal:** Stop `/cards` from querying, serializing, transferring, and hydrating the entire
~1056-card deck plus its ~1616 sentence rows on every visit. Cap the initial query, split the
`sentences` relation out of the list read, window the rendered rows, and move search + lesson
filtering server-side so correctness survives pagination.

**Verified:** 2026-08-07T20:13:34Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening `/cards` paints first rows <1s; initial query capped, no `sentences` rows; `e2e/perf.spec.ts` passes at a tightened threshold | ✓ VERIFIED | `lib/cards-list.ts:getCardsPage` selects `cardSelect` (no `sentences` field) with `take: params.take + 1`; `app/cards/page.tsx` calls it with `take: 30`. `e2e/perf.spec.ts`'s `/cards` budget is `100` (was generic `3000`), computed as `ceil(46ms measured median * 1.5 / 100) * 100` per 31-04-SUMMARY.md, with the 45ms PRE-MIGRATION baseline cited alongside it. Ran `npx playwright test e2e/perf.spec.ts --project=chromium` directly — passes, `/cards` samples 21-38ms, well under the 100ms budget. |
| 2 | Scrolling stays smooth, DOM stays bounded rather than growing with every page loaded | ✓ VERIFIED (literal ROADMAP wording) | `components/CardsClient.tsx` renders through `<Virtuoso>` (react-virtuoso, confirmed real dependency in `package.json`) with composed `rows`; a `rangeChanged` handler drives per-group auto-load. DOM-bounding is inherent to react-virtuoso's windowing, confirmed by code inspection of the single flat `<Virtuoso data={rows} itemContent={...}>` render path — no fallback path renders the full unbounded array. See also the keyboard-accessibility gap noted separately below (not part of this literal SC wording, but part of the plan's own added must-have). |
| 3 | Typing a search term returns matches from the full deck (not just the loaded page), debounced so intermediate keystrokes don't each hit the server | ✓ VERIFIED | `lib/useDebouncedValue.ts` (`Debouncer` class + hook, 300ms) confirmed unit-tested (`tests/use-debounced-value.test.ts`, 6/6 passing). `buildCardsWhere()` in `lib/cards-list.ts` matches `front`/`back`/`notes`/sentence `korean`/`translation` server-side. `e2e/cards-search-clear.spec.ts` (new, added in the code-review-fix pass) exercises a real search → clear cycle against the seeded fixture and passes; ran directly — confirms non-vacuous ("Cards (N)" label genuinely changes mid-search and correctly resets on clear, closing CR-01). |
| 4 | Lesson-range filter returns the correct card set across the full deck; a collapsed row still shows its reading-practice/sentence count without loading the sentences | ⚠️ PARTIAL — first clause ✓ VERIFIED, second clause ✗ FAILED | `lessonFrom`/`lessonTo` wired through `buildCardsWhere()`, validated (`INTEGER_RE` + range check, added in review-fix WR-01), unit-tested. Filter Sheet commit re-issues server queries (`components/CardsClient.tsx` filter-commit `runQuery()` path). **However**, no per-card sentence-count signal exists anywhere — confirmed by grep across `lib/cards-list.ts`, `lib/dto.ts`, `app/api/cards/route.ts`, `components/CardsClient.tsx`: zero hits for any sentence-count field or UI badge. Self-reported as a genuine, unscheduled gap in 31-04-SUMMARY.md and `WINDOWS.md` entry #6 (open). See Gaps below. |
| 5 | Add/edit/delete/swipe-to-delete/tap-to-gloss/group-collapse/Reading-Practice all still work; existing e2e/unit suites stay green | ✓ VERIFIED | Ran directly: `npm test` → 300/300 passing (27/27 files). `npm run build` → clean (Turbopack, TypeScript, all 23 routes generated). `npx playwright test e2e/smoke.spec.ts e2e/perf.spec.ts e2e/cards-search-clear.spec.ts` → 13/13 passing. `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts` → 19/19 passing (includes the extended upsert-not-replace assertion, empirically confirmed non-vacuous per 31-04-SUMMARY.md). `npx playwright test e2e/grade-flow.spec.ts e2e/active-flow.spec.ts e2e/study-filter-skeleton.spec.ts e2e/settings-flash.spec.ts` → 8/8 passing. `SwipeRow`, `useWordTap`/`GlossProvider`, group-collapse toggle, and Reading Practice's independent `<Virtuoso>` all confirmed present and wired in `components/CardsClient.tsx`. |

**Score:** 20/22 must-haves verified (2 present-but-behavior-unverified; 2 failed — see Gaps)

### Additional Plan-Level Must-Haves (31-01 through 31-04 frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Cursor page boundary landing exactly on a group's last row returns `hasMore:false` with no duplicated/skipped row | ✓ VERIFIED | `getCardsPage`'s `take+1` overfetch-by-one logic in `lib/cards-list.ts`; `tests/cards-list.test.ts` (35 total tests across the 3 relevant files, all passing when run directly) explicitly covers the exact-last-row boundary case. |
| 7 | Empty/single-element group edge cases behave correctly | ✓ VERIFIED | Unit-tested in `tests/cards-list.test.ts`, confirmed passing. |
| 8 | Deterministic ordering via `[{createdAt:'desc'},{id:'desc'}]` id-tiebreak | ✓ VERIFIED | Present verbatim in `getCardsPage`/`getSentencesPage`; unit-tested. |
| 9 | `Cards (N)` toggle and every group header's count read from `groupCounts`, never a loaded-array length | ✓ VERIFIED | `components/CardsClient.tsx:1355` reads `groupCounts.total`; CR-01's review-fix (`wasSearchActiveRef`/`searchJustCleared`, confirmed present at lines 506, 716-717) closes the search-clear staleness bug; `e2e/cards-search-clear.spec.ts` proves it non-vacuously. |
| 10 | A late-resolving stale search/filter response never overwrites a newer one | ✓ VERIFIED | `searchSeqRef`/`filterGenerationRef` guards present in `components/CardsClient.tsx`; `e2e/freshness-gate.spec.ts`'s "/cards open-sheet boundary refresh never clobbers in-flight edits" passes. |
| 11 | Legacy client-side `.filter()` block fully removed | ✓ VERIFIED | `grep -c 'filteredCards = cards.filter'` → 0 in current `components/CardsClient.tsx`. |
| 12 | Three distinct empty-state messages (no cards / zero search matches naming the query / zero filter matches) | ✓ VERIFIED | Literal strings confirmed present: `noResultsFor()`, `'No cards match this filter.'`, `"Couldn't search right now. Try again."`. |
| 13 | Reading Practice tab fetches independently via `GET /api/cards/sentences`, not derived from Cards-tab state | ✓ VERIFIED | `grep -c "groups.vocabulary.loaded.flatMap"` → 0; `getSentencesPage()` + `app/api/cards/sentences/route.ts` present, unit- and build-verified. |
| 14 | Opening the Edit sheet fetches full sentences on demand via `GET /api/cards/[id]`; front/back/notes editable immediately | ✓ VERIFIED | `GET /api/cards/[id]` present (added in 31-01, verified line-by-line in 31-03, route-level-tested in `tests/cards-id-route.test.ts`, both tests passing when run directly). `editingDraft`/`findLoadedCardSummary` quick-edit pattern confirmed in `components/CardsClient.tsx`. |
| 15 | `FreshnessWatcher`'s `/cards` backstop is upsert-by-id, never a wholesale replace or delete-by-omission | ✓ VERIFIED | `FreshnessWatcher.tsx` line 119: `page && Array.isArray(page.cards)` (was `Array.isArray(result)`, always false). `e2e/freshness-fresh-paths.spec.ts`'s extended assertion passed when run directly, and 31-04-SUMMARY.md documents it was empirically confirmed non-vacuous (fails on a reverted fix). |
| 16 | `e2e/perf.spec.ts`'s `/cards` budget is a real measured number, not the original generic `3000` | ✓ VERIFIED | `grep "'/cards'" e2e/perf.spec.ts` → `100`; not `3000`. |
| 17-18 | (Behavior-unverified — see below) All-4-groups auto-load at scale; D-08 tab-switch scroll preservation | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | See `behavior_unverified_items` above. |
| 19-20 | Keyboard/screen-reader reachability of virtualized rows; per-card sentence-count badge | ✗ FAILED | See Gaps below. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/cards-list.ts` | `getCardsPage()`, `getCardsGroupCounts()`, `getSentencesPage()`, `buildCardsWhere()` | ✓ VERIFIED | All four present, exported, unit-tested. |
| `lib/dto.ts` | `CardsPageDTO`, `GroupCountsDTO`, `SentencePageDTO` | ✓ VERIFIED | Confirmed via import statements in `lib/cards-list.ts` and usage across routes. |
| `app/api/cards/route.ts` | Rewritten `GET` with query-param parsing/clamping/validation | ✓ VERIFIED | `Math.min(...)` take-clamp, `INTEGER_RE` lesson-range validation, try/catch, present and correct. `POST` also hardened (WR-02 fix) beyond original plan scope. |
| `app/api/cards/[id]/route.ts` | `GET` returning full `CardDTO` incl. sentences | ✓ VERIFIED | Present (added ahead of schedule in 31-01 as a data-loss-prevention fix), route-level tested against a real temp SQLite DB. |
| `app/api/cards/sentences/route.ts` | New route delegating to `getSentencesPage` | ✓ VERIFIED | Present, registered as a route in `npm run build` output. |
| `lib/useDebouncedValue.ts` | Pure debounce hook | ✓ VERIFIED | Present, unit-tested (6/6 passing). |
| `components/CardsClient.tsx` | Per-group state, composed-row Virtuoso rendering, search/filter wiring, Reading Practice, Edit sheet quick-edit | ✓ VERIFIED | All confirmed present via direct code inspection (Virtuoso import/usage, `rangeChanged`, `getState`/`restoreStateFrom`, `readingPractice` state, `editingDraft`). |
| `components/FreshnessWatcher.tsx` | `CardsPageDTO`-shaped `/cards` backstop check | ✓ VERIFIED | Confirmed fixed. |
| `tests/cards-list.test.ts`, `tests/cards-id-route.test.ts`, `tests/use-debounced-value.test.ts` | Unit/route test coverage | ✓ VERIFIED | All ran directly: 35 tests across these 3 files, all passing. |
| `e2e/perf.spec.ts`, `e2e/freshness-fresh-paths.spec.ts` | Tightened budget, extended upsert regression | ✓ VERIFIED | Ran directly, both pass with the documented changes present. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/cards/page.tsx` | `lib/cards-list.ts` | `getCardsPage`/`getCardsGroupCounts` via `Promise.all` | ✓ WIRED | Confirmed by code inspection. |
| `app/api/cards/route.ts` | `lib/cards-list.ts` | `GET` delegates to `getCardsPage`/`getCardsGroupCounts` | ✓ WIRED | Confirmed. |
| `components/CardsClient.tsx` | `react-virtuoso` | Flat `<Virtuoso>` renders composed rows | ✓ WIRED | Confirmed, two instances (Cards + Reading Practice). |
| `components/CardsClient.tsx` | `app/api/cards/route.ts` | Debounced search/filter fetches `fetch('/api/cards?...')` | ✓ WIRED | Confirmed. |
| `app/api/cards/sentences/route.ts` | `lib/cards-list.ts` | `GET` delegates to `getSentencesPage` | ✓ WIRED | Confirmed. |
| `components/CardsClient.tsx` (Edit sheet) | `app/api/cards/[id]/route.ts` | `fetch(\`/api/cards/${id}\`)` on sheet open | ✓ WIRED | Confirmed. |
| `components/FreshnessWatcher.tsx` | `components/CardsClient.tsx` | `useFreshPayload()` → upsert-by-id merge | ✓ WIRED | Confirmed and e2e-proven non-vacuous. |

### Behavioral Spot-Checks / Direct Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite | `npm test` | 300/300 passing, 27/27 files | ✓ PASS |
| Cards/id-route/debounce unit tests | `npx vitest run tests/cards-list.test.ts tests/cards-id-route.test.ts tests/use-debounced-value.test.ts` | 35/35 passing | ✓ PASS |
| Production build | `npm run build` | Clean (Turbopack + TypeScript), 23 routes generated incl. `/api/cards/sentences` and `/api/cards/[id]` | ✓ PASS |
| Smoke/perf/search-clear e2e | `npx playwright test e2e/smoke.spec.ts e2e/perf.spec.ts e2e/cards-search-clear.spec.ts --project=chromium` | 13/13 passing; `/cards` perf samples 21-38ms (budget 100ms) | ✓ PASS |
| Freshness suite | `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --project=chromium` | 19/19 passing | ✓ PASS |
| Grade/active/filter-skeleton/settings e2e | `npx playwright test e2e/grade-flow.spec.ts e2e/active-flow.spec.ts e2e/study-filter-skeleton.spec.ts e2e/settings-flash.spec.ts --project=chromium` | 8/8 passing | ✓ PASS |

### Code Review Fix Spot-Check (31-REVIEW.md → 31-REVIEW-FIX.md)

All 5 in-scope findings (1 critical, 4 warning) were spot-checked directly against the current codebase, not taken on the fix report's word:

| Finding | Claimed Fix | Verified in Codebase |
|---------|-------------|----------------------|
| CR-01 (search-clear stale groupCounts) | `wasSearchActiveRef`/`searchJustCleared` guard | ✓ Present at `components/CardsClient.tsx:506,716-717`; `e2e/cards-search-clear.spec.ts` passes directly |
| WR-01 (unvalidated `lessonFrom`/`lessonTo`) | `INTEGER_RE` + range validation, 400 on invalid | ✓ Present verbatim in `app/api/cards/route.ts` (confirmed via direct file read) |
| WR-02 (`POST /api/cards` no try/catch/validation) | try/catch + field validation + P2002 mapping | ✓ Present verbatim in `app/api/cards/route.ts` (confirmed via direct file read) |
| WR-03 (edit/delete not syncing Reading Practice) | `readingPractice.loaded` pruned/patched in `handleDelete`/`handleSave` | ✓ Present, confirmed via direct file read at lines 866-874 and 922-940 |
| WR-04 (`handleSave` malformed `SentenceDTO` via unchecked cast) | Explicit field reconstruction, no `as CardDTO` | ✓ Present — `merge()` explicitly reconstructs `cardId`/`orderIndex`/`createdAt`/`updatedAt`, no `as CardDTO` cast remains |

All 5 commits referenced in 31-REVIEW-FIX.md (`b8bbfdd`, `3c3990f`, `4e8d636`, `2ffeedb`, `882dd4e`) confirmed present in `git log`.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| CARDS-01 | 31-01, 31-03, 31-04 | Capped, sentence-free `/cards` initial query | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase confirms `getCardsPage` capped + sentence-free, `GET /api/cards/[id]`/`GET /api/cards/sentences` provide on-demand sentence access. |
| CARDS-02 | 31-01, 31-02, 31-04 | Smooth virtualized scrolling, no unbounded DOM growth | ⚠️ PARTIAL / NEEDS HUMAN | REQUIREMENTS.md correctly (honestly) leaves this **Pending** — the literal DOM-bounding/smoothness requirement is met (react-virtuoso in place), but the plan's own added accessibility must-have (keyboard/screen-reader reachability) is confirmed failing, and the at-scale auto-load behavior is unverified against a realistic deck size. See Gaps and Human Verification. |
| CARDS-03 | 31-01, 31-02 | Server-side search/lesson filter, debounced | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase and tests confirm. |

No orphaned requirements — all three phase-31 requirement IDs (CARDS-01/02/03) appear in at least one plan's `requirements` frontmatter and are individually addressed above.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` debt markers found in the files this phase modified. No empty-implementation stubs (`return null`/`return {}`/`=> {}`) found in the reviewed data-layer or client files. The codebase's own `WINDOWS.md` ledger (a project-level broken-windows tracker, not an ad-hoc code comment) already transparently records the two open gaps surfaced in this report (#1 and #6) plus one open at-scale-verification item (#5) — this is the correct process artifact for tracking these, not a hidden debt marker.

## Gaps Summary

Two must-haves genuinely fail as shipped, both already honestly self-reported by the executing
plans and tracked in `.planning/WINDOWS.md` and `.planning/REQUIREMENTS.md` (CARDS-02 correctly
left Pending) rather than silently glossed over:

1. **No per-card sentence-count signal** (ROADMAP Success Criterion 4's second clause). This is a
   real, unambiguous gap — grep across every relevant file confirms zero implementation. It is
   low-effort to close (a `_count: { select: { sentences: true } }` addition to `cardSelect` plus a
   small badge in `renderCardRow`) but was never scheduled in any of the four plans that shipped
   this phase.

2. **Keyboard/screen-reader accessibility of the virtualized Vocabulary group** (a must-have the
   plan authors themselves added on top of the literal CARDS-02 requirement text, given that
   virtualization is a well-known common accessibility regression). This was human-verified to fail
   during 31-01's own execution, and the human explicitly said not to spend time fixing it in that
   session — but that was a real-time, informal call during execution, not a formally recorded
   override or waiver at phase close. Given `WINDOWS.md` entry #1 is still `status: open` (not
   `waived`) and `REQUIREMENTS.md` still lists CARDS-02 as Pending, this phase's own artifacts
   correctly reflect that this decision has not yet been formally closed out. Surfacing it here
   again, with full context, is the deliberate mechanism for making sure that formal decision
   actually happens rather than the gap quietly aging out of visibility.

Two additional items are present-and-wired but not yet behaviorally proven at realistic scale (both
already self-flagged by their originating plans as human_judgment/status:unknown, both tracked in
`WINDOWS.md`): all-four-groups auto-load against a large deck, and D-08 tab-switch scroll
preservation. Neither shows any code-level defect on inspection — they need a human dev-server
spot-check against a realistically-sized dataset (the 8-9 card e2e fixture is fundamentally too
small to exercise either).

**Recommendation:** This phase's core engineering goal — capping the query, dropping sentences from
the list read, windowing the render, and moving search/filter server-side — is real, well-tested,
and verified working end-to-end (Success Criteria 1, 3, and 5, plus SC4's first clause, plus SC2's
literal DOM-bounding wording, all hold). The two failed items and two unverified-at-scale items
should be explicitly triaged by the developer before shipping: either scheduled as a small follow-up
plan, or formally waived via `gsd-tools windows waive` with a recorded reason, so the phase can close
cleanly rather than carrying silent, undecided risk forward into Phase 32.

---
*Verified: 2026-08-07T20:13:34Z*
*Verifier: Claude (gsd-verifier)*
