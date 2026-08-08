---
phase: 31-cards-list-pagination-virtualization
verified: 2026-08-07T21:30:00Z
status: gaps_found
score: 21/23 must-haves verified
behavior_unverified: 1
overrides_applied: 1
overrides:
  - must_have: "Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group (31-01 must_haves.truths, CARDS-02 accessibility backstop truth)"
    reason: "Formally waived by user decision during 31-UAT (2026-08-07, test 3): known keyboard/screen-reader focus-reachability gap in the virtualized Vocabulary group is accepted as-is for this phase, not scheduled for a fix. Recorded in WINDOWS.md entry #1 (status: waived) with reason, recorded_at, and resolved_at timestamps — a durable, formal project-level record of the same override contract this workflow's `overrides:` frontmatter captures."
    accepted_by: "user (via 31-UAT.md test 3 + gsd-tools windows waive)"
    accepted_at: "2026-08-07T21:12:26.182Z"
re_verification:
  previous_status: human_needed
  previous_score: 20/22
  gaps_closed:
    - "G-31-2: on mobile, the Cards/Reading Practice toggle scrolled out of reach once a user scrolled within the Vocabulary group — closed by 31-05 (components/Nav.tsx --nav-height + components/CardsClient.tsx merged sticky wrapper), proven by a new permanent regression spec (e2e/cards-sticky-header.spec.ts), independently re-run this session and confirmed passing."
    - "All-4-groups auto-load at scale (previously behavior-unverified) — closed via completed human UAT (31-UAT.md test 1: pass), recorded as WINDOWS.md entry #5 (status: fixed)."
    - "Keyboard/screen-reader reachability of the virtualized Vocabulary group (previously a failed must-have) — formally waived by recorded human decision (31-UAT.md test 3, WINDOWS.md entry #1: waived), now carried as an accepted override rather than an open gap."
  gaps_remaining:
    - "No per-card sentence-count signal exists anywhere in the codebase (ROADMAP Success Criterion 4, second clause) — unchanged since the previous verification; not addressed by 31-05 (out of scope for that gap-closure plan) or any other plan in this phase."
  regressions: []
gaps:
  - truth: "A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves (ROADMAP Success Criterion 4, second clause)"
    status: failed
    reason: "No per-card sentence-count signal exists anywhere in the codebase. Re-confirmed by grep this session across lib/cards-list.ts, app/api/cards/route.ts, components/CardsClient.tsx, lib/dto.ts — zero hits for a per-card sentences _count/badge (the only _count usages found are the pre-existing type-level groupCounts aggregate, unrelated). Self-reported in 31-04-SUMMARY.md and tracked as WINDOWS.md entry #6, still status: open. Not scheduled or touched by 31-05 (that plan's scope was explicitly limited to G-31-2's sticky-header defect)."
    artifacts:
      - path: "lib/cards-list.ts"
        issue: "cardSelect (line 18) has no `_count: { select: { sentences: true } }` or equivalent per-card signal; getCardsGroupCounts has no per-card variant"
      - path: "components/CardsClient.tsx"
        issue: "renderCardRow has no sentence-count badge/indicator anywhere in its JSX"
    missing:
      - "A cheap per-card sentence-count signal (e.g. `_count: { select: { sentences: true } }` added to cardSelect) and a small UI badge/indicator in renderCardRow surfacing it, without loading the actual sentence rows"
deferred: []
behavior_unverified_items:
  - truth: "Switching between the Cards tab and the Reading Practice tab preserves each tab's own exact scroll position and loaded-batch state, with no re-fetch or reset, across a full round trip (Cards → Reading Practice → Cards) (31-04 must_haves.truths D-08)"
    test: "On a dev server (or the app in production), scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll it to a different depth, switch back to Cards, and confirm both tabs' scroll positions and already-loaded rows are exactly as left — no jump to top, no re-fetch, no lost rows in either direction."
    expected: "Both Virtuoso instances restore their pre-switch scroll offset via getState()/restoreStateFrom exactly as documented in 31-RESEARCH.md Pattern 4; neither view's loaded-row state resets."
    why_human: "31-05 closed the blocking reachability defect (G-31-2 — the toggle itself scrolling out of reach) with an automated regression spec, but that spec only asserts the toggle is visible/tappable and that a single tap switches the active view (aria-pressed becomes true) — it does not scroll each view to a distinct depth, switch back and forth, and assert the exact scroll offset is restored on return. 31-UAT.md test 2 (the only human attempt to exercise this) resulted in 'issue' (blocked by the now-fixed reachability bug) before the deeper scroll-preservation behavior could be exercised at all. Code inspection confirms getState()/restoreStateFrom are present and wired per the documented react-virtuoso contract (components/CardsClient.tsx lines 296-306, 686-696, 1394, 1424), but no automated or completed human check has yet exercised the actual round-trip restore behavior."
human_verification:
  - test: "Scroll the Cards tab partway down the Vocabulary group, switch to Reading Practice, scroll it to a different depth, switch back to Cards, then switch to Reading Practice again."
    expected: "Both views restore their exact pre-switch scroll offset every time; neither view re-fetches or loses already-loaded rows on any leg of the round trip."
    why_human: "No automated test exercises the full round-trip scroll-position/state preservation; 31-UAT.md test 2 was blocked by the (now-fixed) reachability bug before this could be exercised. See behavior_unverified_items above."
---

# Phase 31: Cards List Pagination & Virtualization Verification Report

**Phase Goal:** Stop `/cards` from querying, serializing, transferring, and hydrating the entire
~1056-card deck plus its ~1616 sentence rows on every visit. Cap the initial query, split the
`sentences` relation out of the list read, window the rendered rows, and move search + lesson
filtering server-side so correctness survives pagination.

**Verified:** 2026-08-07T21:30:00Z
**Status:** gaps_found
**Re-verification:** Yes — fresh re-verification against all 5 plans (31-01 through 31-05), overwriting
the prior `human_needed` report that predated plan 31-05.

## What changed since the previous verification

The previous VERIFICATION.md (`human_needed`, 20/22, dated the same day) was produced before plan
31-05 existed. Since then:

- **31-UAT.md was completed** (3 tests: 1 pass, 1 issue → G-31-2, 1 formally skipped/waived).
- **G-31-2** (mobile sticky-header defect blocking the Cards/Reading-Practice toggle) was diagnosed
  (`.planning/debug/sticky-headers-scroll-away-mobile.md`) and closed by **plan 31-05**, which is now
  complete with a SUMMARY.md.
- **WINDOWS.md** was updated: entry #1 (keyboard/screen-reader reachability) → `waived`; entry #5
  (at-scale auto-load) → `fixed`; entry #6 (per-card sentence-count signal) remains `open`.

This report re-verifies all 5 plans and the current codebase state end-to-end rather than assuming
the prior report's findings still hold.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening `/cards` paints first rows <1s; initial query capped, no `sentences` rows; `e2e/perf.spec.ts` passes at a tightened threshold | ✓ VERIFIED | `lib/cards-list.ts` `cardSelect` (line 18) has no `sentences` field, with an explicit comment "DROPPED from the list select per CARDS-01"; `getCardsPage` uses `take: params.take + 1` overfetch. Ran `npx playwright test e2e/perf.spec.ts --project=chromium` directly this session — 8/8 pass; `/cards` page-load samples 29-65ms (budget: `100`, confirmed via `grep "'/cards'" e2e/perf.spec.ts`, not the original generic `3000`). |
| 2 | Scrolling stays smooth, DOM stays bounded rather than growing with every page loaded | ✓ VERIFIED | `components/CardsClient.tsx` renders through `<Virtuoso>` (react-virtuoso, confirmed real dependency) with composed `rows` and a `rangeChanged` handler driving per-group auto-load — DOM-bounding is inherent to react-virtuoso's windowing (single flat render path, no unbounded fallback). At-scale behavior additionally confirmed by completed human UAT (31-UAT.md test 1: **pass** — "Each group's rows keep appending... independent of the other groups' scroll state... DOM node count stays bounded throughout"), closing what the prior verification left as behavior-unverified. |
| 3 | Typing a search term returns matches from the full deck (not just the loaded page), debounced so intermediate keystrokes don't each hit the server | ✓ VERIFIED | `lib/useDebouncedValue.ts` (300ms debounce) unit-tested; `buildCardsWhere()` in `lib/cards-list.ts` matches `front`/`back`/`notes`/sentence `korean`/`translation` server-side. `npx playwright test e2e/cards-search-clear.spec.ts` re-run directly this session — passes. |
| 4 | Lesson-range filter returns the correct card set across the full deck, and a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves | ⚠️ PARTIAL — first clause ✓ VERIFIED, second clause ✗ FAILED | `lessonFrom`/`lessonTo` wired through `buildCardsWhere()`, validated (`INTEGER_RE` + range check), unit-tested; filter-commit re-issues server queries. **However**, no per-card sentence-count signal exists anywhere — re-confirmed by grep this session across `lib/cards-list.ts`, `lib/dto.ts`, `app/api/cards/route.ts`, `components/CardsClient.tsx`: zero hits for any per-card sentence-count field or UI badge (the only `_count` usages present are the unrelated type-level `groupCounts` aggregate). See Gaps below. |
| 5 | Add/edit/delete/swipe-to-delete/tap-to-gloss/group-collapse/Reading-Practice all still work; existing e2e/unit suites stay green | ✓ VERIFIED | Ran directly this session: `npm test` → 300/300 passing (27/27 files). `npm run lint` → 0 errors (1 pre-existing unrelated warning in `StudySession.tsx`). `npx playwright test e2e/cards-sticky-header.spec.ts` → 2/2 passing. `npx playwright test e2e/cards-search-clear.spec.ts e2e/smoke.spec.ts` → 6/6 passing. `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts` → 19/19 passing. `npx playwright test e2e/perf.spec.ts` → 8/8 passing. `SwipeRow`, `useWordTap`/`GlossProvider`, group-collapse toggle, and Reading Practice's independent `<Virtuoso>` all confirmed present and wired in `components/CardsClient.tsx`. |

**Score:** 21/23 must-haves verified (1 present-but-behavior-unverified; 1 failed — see Gaps)

### Additional Plan-Level Must-Haves (31-01 through 31-05 frontmatter)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Cursor page boundary landing exactly on a group's last row returns `hasMore:false` with no duplicated/skipped row | ✓ VERIFIED | `getCardsPage`'s `take+1` overfetch logic in `lib/cards-list.ts`; unit-tested in `tests/cards-list.test.ts`. |
| 7 | Empty/single-element group edge cases behave correctly | ✓ VERIFIED | Unit-tested in `tests/cards-list.test.ts`. |
| 8 | Deterministic ordering via `[{createdAt:'desc'},{id:'desc'}]` id-tiebreak | ✓ VERIFIED | Present verbatim in `getCardsPage`/`getSentencesPage`; unit-tested. |
| 9 | `Cards (N)` toggle and every group header's count read from `groupCounts`, never a loaded-array length | ✓ VERIFIED | `components/CardsClient.tsx:1360` reads `groupCounts.total`; `e2e/cards-search-clear.spec.ts` re-run this session, still passes (CR-01 fix holds). |
| 10 | A late-resolving stale search/filter response never overwrites a newer one | ✓ VERIFIED | `searchSeqRef`/`filterGenerationRef` guards present; `e2e/freshness-gate.spec.ts`'s `/cards open-sheet boundary refresh` re-run this session, still passes. |
| 11 | Legacy client-side `.filter()` block fully removed | ✓ VERIFIED | `grep -c 'filteredCards = cards.filter'` → 0 in current `components/CardsClient.tsx`. |
| 12 | Three distinct empty-state messages (no cards / zero search matches naming the query / zero filter matches) | ✓ VERIFIED | Literal strings confirmed present in `components/CardsClient.tsx`. |
| 13 | Reading Practice tab fetches independently via `GET /api/cards/sentences`, not derived from Cards-tab state | ✓ VERIFIED | `grep -c "groups.vocabulary.loaded.flatMap"` → 0; `getSentencesPage()` + `app/api/cards/sentences/route.ts` present. |
| 14 | Opening the Edit sheet fetches full sentences on demand via `GET /api/cards/[id]`; front/back/notes editable immediately | ✓ VERIFIED | `GET /api/cards/[id]` present, route-level-tested in `tests/cards-id-route.test.ts` (part of this session's 300/300 unit run). |
| 15 | `FreshnessWatcher`'s `/cards` backstop is upsert-by-id, never a wholesale replace or delete-by-omission | ✓ VERIFIED | `FreshnessWatcher.tsx` line 119: `page && Array.isArray(page.cards)`; `e2e/freshness-fresh-paths.spec.ts` re-run this session, still passes. |
| 16 | `e2e/perf.spec.ts`'s `/cards` budget is a real measured number, not the original generic `3000` | ✓ VERIFIED | `grep "'/cards'" e2e/perf.spec.ts` → `100`; not `3000`. |
| 17 | All four type groups' expand-on-tap fetch and per-group scroll-proximity auto-load behave correctly against a realistically large deck | ✓ VERIFIED (via completed human UAT) | Previously behavior-unverified (8-9 card e2e fixture too small); now closed by 31-UAT.md test 1: **pass**. `WINDOWS.md` entry #5: `status: fixed`. |
| 18 | Switching between Cards and Reading Practice tabs preserves each tab's own scroll position across a full round trip, with no re-fetch or reset (D-08) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The blocking reachability sub-defect (toggle unreachable on mobile) is fixed and proven (see row 21 below). The deeper round-trip scroll-preservation invariant itself (`getState`/`restoreStateFrom`) is present and correctly wired by code inspection, but no automated or completed human test exercises the actual restore behavior. See Human Verification below. |
| 19 | Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group | ✓ PASSED (override) | Formally waived by recorded human decision during 31-UAT (2026-08-07, test 3) — see `overrides:` frontmatter above and `WINDOWS.md` entry #1 (`status: waived`). Re-confirmed by code inspection this session: still no roving-tabindex/scroll-into-view affordance in `renderCardRow`'s Edit control — the underlying limitation is unchanged, but it is now a formally accepted risk rather than an open gap. |
| 20 | A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves | ✗ FAILED | Unchanged since the prior verification. See Gaps below. |
| 21 | On a short/mobile-width viewport, scrolling within the Vocabulary group keeps the Cards/Reading Practice toggle visible and tappable (G-31-2, 31-05) | ✓ VERIFIED | `e2e/cards-sticky-header.spec.ts` re-run directly this session (not taken on SUMMARY's word) — 2/2 pass. `components/CardsClient.tsx` lines 1288-1364 confirm the search bar and toggle are now children of one `sticky` wrapper (`style={{ top: 'var(--nav-height, 68px)' }}`), matching the plan and SUMMARY exactly. |
| 22 | Tapping the toggle while scrolled successfully switches the active view (reachable AND functional) | ✓ VERIFIED | Same spec, `aria-pressed` assertion; passes. |
| 23 | CardsClient's sticky bar docks beneath Nav's real measured height instead of overlapping it, via `--nav-height` | ✓ VERIFIED | `components/Nav.tsx` lines 20, 29-43 confirm `headerRef` + `useLayoutEffect` + `ResizeObserver` publish `--nav-height` on mount and on every resize, with cleanup on unmount — matches SUMMARY exactly. Spec's overlap `boundingBox()` assertion passes. |

**Combined score:** 21/23 (rows 1,2,3,5,6-17,19,21,22,23 verified/passed-override = 21; row 18 behavior-unverified = 1; row 4/20 failed = 1, counted once as the single genuine gap since rows 4 and 20 describe the same underlying gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/cards-list.ts` | `getCardsPage()`, `getCardsGroupCounts()`, `getSentencesPage()`, `buildCardsWhere()` | ✓ VERIFIED | All four present, exported, unit-tested. |
| `lib/dto.ts` | `CardsPageDTO`, `GroupCountsDTO`, `SentencePageDTO` | ✓ VERIFIED | Confirmed via imports in `lib/cards-list.ts` and usage across routes. |
| `app/api/cards/route.ts` | Rewritten `GET` with query-param parsing/clamping/validation | ✓ VERIFIED | `Math.min(...)` take-clamp, `INTEGER_RE` lesson-range validation, try/catch present. |
| `app/api/cards/[id]/route.ts` | `GET` returning full `CardDTO` incl. sentences | ✓ VERIFIED | Present, route-level tested. |
| `app/api/cards/sentences/route.ts` | New route delegating to `getSentencesPage` | ✓ VERIFIED | Present, registered route. |
| `lib/useDebouncedValue.ts` | Pure debounce hook | ✓ VERIFIED | Present, unit-tested. |
| `components/CardsClient.tsx` | Per-group state, composed-row Virtuoso rendering, search/filter wiring, Reading Practice, Edit sheet quick-edit, merged sticky search+toggle unit (31-05) | ✓ VERIFIED | All confirmed present via direct code inspection this session. |
| `components/Nav.tsx` | `--nav-height` CSS custom property publisher (31-05) | ✓ VERIFIED | `headerRef` + `useLayoutEffect` + `ResizeObserver`, confirmed present and correct. |
| `components/FreshnessWatcher.tsx` | `CardsPageDTO`-shaped `/cards` backstop check | ✓ VERIFIED | Confirmed fixed; e2e re-run passes. |
| `e2e/cards-sticky-header.spec.ts` | G-31-2 regression proof (31-05) | ✓ VERIFIED | Present, re-run directly this session, passes (toggle-in-viewport, functional switch, no header overlap). |
| `tests/cards-list.test.ts`, `tests/cards-id-route.test.ts`, `tests/use-debounced-value.test.ts` | Unit/route test coverage | ✓ VERIFIED | All ran directly this session as part of `npm test` (300/300). |
| `e2e/perf.spec.ts`, `e2e/freshness-fresh-paths.spec.ts` | Tightened budget, extended upsert regression | ✓ VERIFIED | Ran directly this session, both pass. |

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
| `components/Nav.tsx` (header ResizeObserver) | `components/CardsClient.tsx` (sticky wrapper) | `document.documentElement` CSS custom property `--nav-height`, consumed via `style={{ top: 'var(--nav-height, 68px)' }}` | ✓ WIRED | Confirmed by direct code read of both files this session; e2e overlap assertion passes. |

### Behavioral Spot-Checks / Direct Test Runs (this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite | `npm test` | 300/300 passing, 27/27 files | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| G-31-2 regression spec | `npx playwright test e2e/cards-sticky-header.spec.ts --project=chromium` | 2/2 passing | ✓ PASS |
| Search-clear / smoke e2e | `npx playwright test e2e/cards-search-clear.spec.ts e2e/smoke.spec.ts --project=chromium` | 6/6 passing | ✓ PASS |
| Perf e2e | `npx playwright test e2e/perf.spec.ts --project=chromium` | 8/8 passing; `/cards` 29-65ms vs. 100ms budget | ✓ PASS |
| Freshness suite | `npx playwright test e2e/freshness-fresh-paths.spec.ts e2e/freshness-gate.spec.ts e2e/freshness-router-cache.spec.ts e2e/freshness-client-shell.spec.ts --project=chromium` | 19/19 passing | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| CARDS-01 | 31-01, 31-03, 31-04 | Capped, sentence-free `/cards` initial query | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase confirms `getCardsPage` capped + sentence-free, `GET /api/cards/[id]`/`GET /api/cards/sentences` provide on-demand sentence access. |
| CARDS-02 | 31-01, 31-02, 31-04, 31-05 | Smooth virtualized scrolling, no unbounded DOM growth | ⚠️ SUBSTANTIALLY MET, REQUIREMENTS.md TRACKING STALE | The literal requirement text (DOM-bounding/smoothness) is met (react-virtuoso in place, at-scale UAT passed). Both blockers that previously kept this Pending are now resolved: the accessibility gap is formally waived (WINDOWS.md #1), and G-31-2 (the mobile toggle-reachability defect, also filed against CARDS-02 in 31-05's frontmatter) is closed with a passing regression test. **`REQUIREMENTS.md` (last touched at the pre-31-05, pre-UAT commit `0a10bed`) still lists CARDS-02 as `Pending`** — this is a documentation-sync gap, not a code gap: the tracking file was not updated after the UAT session or 31-05. One item remains genuinely unresolved and outstanding regardless: D-08's full round-trip scroll-preservation behavior is still unverified (see Human Verification). Recommend updating REQUIREMENTS.md to reflect current WINDOWS.md state as part of closing this phase. |
| CARDS-03 | 31-01, 31-02 | Server-side search/lesson filter, debounced | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase and tests confirm. |

No orphaned requirements — all three phase-31 requirement IDs (CARDS-01/02/03) appear in at least one plan's `requirements` frontmatter (31-05 also declares `[CARDS-02]`) and are individually addressed above.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` debt markers found in the files this phase modified (including 31-05's `components/Nav.tsx`, `components/CardsClient.tsx`, `e2e/cards-sticky-header.spec.ts`). No empty-implementation stubs found. The project's own `WINDOWS.md` ledger transparently tracks the one remaining open gap (#6, sentence-count signal) — this is the correct process artifact for tracking it, not a hidden debt marker. One process/documentation gap noted above: `REQUIREMENTS.md`'s CARDS-02 line is stale relative to `WINDOWS.md`'s current state.

## Gaps Summary

One must-have genuinely fails as shipped, unchanged since the prior verification and untouched by
31-05 (whose scope was deliberately limited to G-31-2):

1. **No per-card sentence-count signal** (ROADMAP Success Criterion 4's second clause). Grep across
   every relevant file confirms zero implementation. Low-effort to close (a
   `_count: { select: { sentences: true } }` addition to `cardSelect` plus a small badge in
   `renderCardRow`) but was never scheduled in any of the five plans that shipped this phase. Tracked
   honestly as `WINDOWS.md` entry #6 (`status: open`).

One item remains present-and-wired but not yet behaviorally proven at full round-trip depth: D-08's
tab-switch scroll-position preservation. The blocking reachability defect (G-31-2) that previously
prevented even attempting this check is now fixed and independently re-verified in this session
(`e2e/cards-sticky-header.spec.ts` passes). What remains unverified is narrower and more specific than
before: does `getState()`/`restoreStateFrom` actually restore the exact scroll offset across a full
Cards → Reading Practice → Cards round trip. No code defect was found by inspection — the wiring
matches react-virtuoso's documented contract — but no automated or completed human test exercises the
actual restore behavior yet.

**What closed since the last verification:**
- G-31-2 (mobile sticky-header toggle unreachable) — closed by 31-05, durable automated regression proof.
- At-scale all-four-groups auto-load — closed via completed human UAT (test 1: pass).
- Keyboard/screen-reader reachability — formally waived by recorded human decision, no longer an open gap.

**Recommendation:** This phase's core engineering goal — capping the query, dropping sentences from
the list read, windowing the render, and moving search/filter server-side — is real, well-tested, and
verified working end-to-end (Success Criteria 1, 2, 3, and 5, plus SC4's first clause, all hold). Two
items remain before this phase can close with zero open items:
1. Schedule a small follow-up (or accept as a formally waived gap) for the per-card sentence-count
   signal — the only genuine, code-level gap remaining.
2. Get a human to do the specific, narrow D-08 round-trip scroll-preservation check now that the
   reachability blocker is gone (should take under a minute given the toggle is now reliably reachable).
3. Update `REQUIREMENTS.md`'s CARDS-02 line to reflect the current `WINDOWS.md` state (documentation
   sync only, no code change needed) once items 1-2 are resolved.

---
*Verified: 2026-08-07T21:30:00Z*
*Verifier: Claude (gsd-verifier)*
