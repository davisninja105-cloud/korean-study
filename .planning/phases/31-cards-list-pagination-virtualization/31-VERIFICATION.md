---
phase: 31-cards-list-pagination-virtualization
verified: 2026-08-08T01:00:00Z
status: gaps_found
score: 20/24 must-haves verified
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group (31-01 must_haves.truths, CARDS-02 accessibility backstop truth)"
    reason: "Formally waived by user decision during 31-UAT (2026-08-07, test 3): known keyboard/screen-reader focus-reachability gap in the virtualized Vocabulary group is accepted as-is for this phase, not scheduled for a fix. Recorded in WINDOWS.md entry #1 (status: waived) with reason, recorded_at, and resolved_at timestamps."
    accepted_by: "user (via 31-UAT.md test 3 + gsd-tools windows waive)"
    accepted_at: "2026-08-07T21:12:26.182Z"
re_verification:
  previous_status: gaps_found
  previous_score: 21/23
  gaps_closed:
    - "SC4 second clause (per-card sentence-count signal): closed by 31-06 — `lib/cards-list.ts` `cardSelect` now requests `_count: { select: { sentences: true } }`, mapped to `CardDTO.sentenceCount` in both `getCardsPage` and `getSentencesPage`; `renderCardRow` shows an unconditional 'N sentence(s)' badge. Confirmed by direct code read this session (lib/cards-list.ts:32,156,256; lib/dto.ts:75) and by `tests/cards-list.test.ts`'s 3 new assertions (part of this session's 303/303 `npm test` run)."
    - "D-08 tab-switch scroll/state preservation (previously behavior-unverified): closed by 31-06's new `e2e/cards-tab-switch-scroll.spec.ts`. Re-ran directly this session (not taken on SUMMARY's word) — 2/2 passing."
  gaps_remaining: []
  regressions:
    - "Three NEW Critical defects (CR-01, CR-02, CR-03), all in the card-edit save flow, found by a fresh code review (31-REVIEW.md, committed after 31-06) and independently confirmed against the current codebase this session. None existed as open gaps in the previous VERIFICATION.md — they were latent in `handleSave`/`merge()` (and, for CR-03, directly introduced by 31-06's own new `sentenceCount` field) and were not caught by the previous verification pass because that pass checked for presence/wiring of the edit flow, not its behavioral correctness on these three specific paths. See Gaps below and the dedicated Code Review Cross-Reference section."
gaps:
  - truth: "Add, edit, delete, swipe-to-delete, tap-to-gloss, group collapse, and the Reading practice view all still behave correctly against the paginated list (ROADMAP Success Criterion 5, edit sub-clause)"
    status: failed
    reason: "Editing a card is broken in three independent, reproducible ways. CR-01: PUT /api/cards/[id] replaces all sentences via deleteMany+create on every save (app/api/cards/[id]/route.ts:116-134), regenerating every Sentence.id; CardsClient's Reading Practice patch (components/CardsClient.tsx:928-945) matches the updated card's sentences back to already-loaded Reading Practice rows by the OLD sentence id, so the id-based lookup (`updatedSentencesById.get(row.id)`) always misses and the sentence text (korean/targetForm/translation) shown in an already-loaded Reading Practice row never updates after an edit. CR-02: handleSave's setGroups update (components/CardsClient.tsx:892-917) patches a card in place inside whatever GROUP_KEYS bucket it was already found in — changing a card's type never removes it from the old bucket or adds it to the new one, and bumpGroupCount is never called (contrast handleAdd at line ~961-969, which does both correctly), so an edited card keeps rendering under the wrong type-group header with a stale badge color and unchanged group counts. CR-03: handleSave's merge() (components/CardsClient.tsx:892-908) spreads the pre-edit card (`...c`) and never re-derives `sentenceCount`; since `renderCardRow`'s `card.sentenceCount ?? card.sentences.length` (line 1106) prefers the cached (now-stale) sentenceCount whenever it is a defined number, adding/removing a sentence and saving leaves the displayed 'N sentences' badge showing the pre-edit count indefinitely — a direct regression against 31-06's own new feature."
    artifacts:
      - path: "app/api/cards/[id]/route.ts"
        issue: "PUT handler's sentence replace-all (deleteMany + create per entry, lines 116-134) regenerates every Sentence.id on every save, breaking any client-side id-based patch of already-loaded state (CR-01 root cause)"
      - path: "components/CardsClient.tsx"
        issue: "handleSave's setGroups block (892-917) never relocates a card between type-group buckets on type change and never calls bumpGroupCount (CR-02); handleSave's merge() (892-908) never recomputes sentenceCount from the saved sentences array (CR-03); the Reading Practice patch (928-945) matches by pre-edit sentence id, which CR-01 makes permanently non-matching"
    missing:
      - "Stable sentence ids across a PUT save (upsert-by-id instead of blanket delete+recreate in app/api/cards/[id]/route.ts), OR a full re-fetch fallback in the Reading Practice patch instead of a silent id-based no-op (CR-01)"
      - "handleSave must remove the card from its old GROUP_KEYS bucket and insert it into groupKeyForType(updated.type)'s bucket when the type changed, plus call bumpGroupCount for both the old and new type (CR-02)"
      - "handleSave's merge() must set sentenceCount: (updated.sentences ?? []).length instead of carrying forward the stale ...c spread value (CR-03)"
      - "MANDATORY, non-optional: a single new e2e regression spec that edits an existing card's sentences AND type in one CardEditor save, then asserts against all three previously-broken surfaces in the same test — the Reading Practice row's updated sentence text (CR-01), the card's new type-group bucket placement and both old/new group counts (CR-02), and the 'N sentences' badge value (CR-03). This is not optional test coverage: the prior fix for this exact code path (WR-03, commit 2ffeedb, 31-REVIEW-FIX.md) was marked 'all_fixed' on the strength of unit tests + lint + build alone, with no test exercising the actual edit-then-check-result behavior — and shipped broken anyway (that is CR-01). The gap-closure plan MUST NOT repeat this: no fix for CR-01/02/03 may be considered done, and this gap may not be marked closed on re-verification, without this end-to-end spec passing against the real code (and, per this suite's established fail-first discipline, having been confirmed to fail against the pre-fix code first)."
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 31: Cards List Pagination & Virtualization Verification Report

**Phase Goal:** Stop `/cards` from querying, serializing, transferring, and hydrating the entire
~1056-card deck plus its ~1616 sentence rows on every visit. Cap the initial query, split the
`sentences` relation out of the list read, window the rendered rows, and move search + lesson
filtering server-side so correctness survives pagination.

**Verified:** 2026-08-08T01:00:00Z
**Status:** gaps_found
**Re-verification:** Yes — fresh re-verification against all 6 plans (31-01 through 31-06), incorporating
`31-REVIEW.md` (a fresh code review committed this session, after 31-06 and after the prior
`gaps_found` VERIFICATION.md), superseding both the pre-31-06 verification and its own optimistic
"SC5 ✓ VERIFIED" call.

## What changed since the previous verification

The previous VERIFICATION.md (`gaps_found`, 21/23, dated before 31-06 existed) left one open gap
(no per-card sentence-count signal) and one behavior-unverified item (D-08 tab-switch round-trip).
Since then:

- **Plan 31-06 shipped**, closing both: a real `_count`-sourced `sentenceCount` field end-to-end, and
  a new `e2e/cards-tab-switch-scroll.spec.ts` proving the D-08 round-trip. `.planning/REQUIREMENTS.md`
  was updated to mark CARDS-01/02/03 `Complete`.
- **A fresh, full code review (`31-REVIEW.md`) was then run against the post-31-06 codebase** and found
  3 Critical defects, all in the card-edit save flow (`components/CardsClient.tsx` `handleSave`/`merge()`
  interacting with `PUT /api/cards/[id]`). This verification independently re-derived and confirmed
  all three defects by direct code reading (not by trusting the review's prose) — see the Code Review
  Cross-Reference section below.

**Net effect: two gaps closed, three new gaps opened.** The phase does not close clean this round.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening `/cards` paints first rows <1s; initial query capped, no `sentences` rows; `e2e/perf.spec.ts` passes at a tightened threshold | ✓ VERIFIED | `lib/cards-list.ts` `cardSelect` (line 32) requests `_count` but no `sentences` field ("DROPPED from the list select per CARDS-01"). Ran `npx playwright test e2e/perf.spec.ts --project=chromium` directly this session — 8/8 pass; `/api/stats` and `/api/activity` samples in the single-digit ms range, `/cards` budget tightened to 100ms per prior verification (`grep "'/cards'" e2e/perf.spec.ts` → `100`, not the original generic `3000`). |
| 2 | Scrolling stays smooth, DOM stays bounded rather than growing with every page loaded | ✓ VERIFIED | `components/CardsClient.tsx` renders through `<Virtuoso>` with composed `rows` and a `rangeChanged`-driven per-group auto-load. At-scale behavior confirmed by completed human UAT (31-UAT.md test 1: pass) and `WINDOWS.md` entry #5 (`status: fixed`). No regression found this session (code path unchanged since prior verification). |
| 3 | Typing a search term returns matches from the full deck, debounced so intermediate keystrokes don't each hit the server | ✓ VERIFIED | `lib/useDebouncedValue.ts` (300ms) unit-tested; `buildCardsWhere()` matches `front`/`back`/`notes`/sentence `korean`/`translation` server-side. Part of this session's 303/303 `npm test` run; unrelated to the new defects (no `runQuery`/search-state changes since the prior verification). |
| 4 | Lesson-range filter returns the correct card set across the full deck, and a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves | ✓ VERIFIED | Both clauses now hold. `lessonFrom`/`lessonTo` wired through `buildCardsWhere()`, validated, unit-tested. **Sentence-count clause, closed by 31-06:** `cardSelect._count: { select: { sentences: true } }` (lib/cards-list.ts:32) → mapped to `CardDTO.sentenceCount` in `getCardsPage` (line 156) and `getSentencesPage`'s nested card (line 256) → rendered in `renderCardRow` (components/CardsClient.tsx:1106,1125) — confirmed present and wired by direct code read this session. Note: the *initial-load* display of this count is correct; see Gap below for what happens to it *after an edit* (CR-03). |
| 5 | Add, edit, delete, swipe-to-delete, tap-to-gloss, group collapse, and the Reading practice view all still behave correctly against the paginated list; the existing e2e and unit suites stay green | ✗ FAILED | **Suites do stay green** — `npm test` (303/303, re-run this session), `npm run lint` (0 errors, 1 pre-existing unrelated warning), all targeted e2e specs re-run this session pass. **But "behave correctly" does not hold for edit.** Three independently-confirmed Critical defects (CR-01, CR-02, CR-03 — see Code Review Cross-Reference below) make ordinary card edits produce silently-wrong displayed state with no error surfaced, and none of them are caught by the passing test suites because no test exercises these specific scenarios (type change, sentence add/remove + already-loaded Reading Practice row, sentence add/remove + sentence-count badge). Add, delete, swipe-to-delete, tap-to-gloss, and group-collapse-toggle-itself are unaffected and remain verified working (delete correctly prunes Reading Practice rows and calls bumpGroupCount, per components/CardsClient.tsx:870-881; handleAdd correctly resolves the new type's group and bumps its count, lines 961-969). |

**Score:** 4/5 ROADMAP Success Criteria fully verified; SC5 fails on its edit sub-clause.

### Code Review Cross-Reference (required per task instructions)

`31-REVIEW.md` (committed this session, post-31-06) found 3 Critical defects, all in
`components/CardsClient.tsx` `handleSave`/`merge()` interacting with `PUT /api/cards/[id]`. Each was
independently re-derived from the current codebase this session (not taken on the review's word):

| Finding | Confirmed? | Root cause (verified by direct code read) | Bearing on SC5 |
|---|---|---|---|
| **CR-01** — editing sentences never updates already-loaded Reading Practice rows | ✓ Confirmed | `app/api/cards/[id]/route.ts:116-134`: `sentenceOps` is unconditionally `[deleteMany, ...create(...)]` whenever `data.sentences` is an array — every `Sentence.id` is regenerated on every save. `components/CardsClient.tsx:928-945`'s Reading Practice patch does `updatedSentencesById.get(row.id)` where `row.id` is the pre-edit id — this lookup is provably always `undefined` after any sentence-bearing save, so the sentence-text patch is a permanent silent no-op (the parent card fields still patch correctly via `merge(row.card)`). The WR-03 comment directly above this code (added in an earlier fix pass) claims the id-based match works "since sentences may be reordered/added/removed" — it does not, because ids are never stable across a save in the first place. | Directly falsifies "the Reading practice view... behave[s] correctly" for the edit path. |
| **CR-02** — editing a card's type does not relocate it between type-group buckets or update `groupCounts` | ✓ Confirmed | `components/CardsClient.tsx:892-917`: the `setGroups` update iterates `GROUP_KEYS` and patches the card **only inside whichever bucket it's already found in** (`next[key].loaded.map(...)`) — it never filters the card out of its old bucket or pushes it into `groupKeyForType(updated.type)`'s bucket, and `bumpGroupCount` (defined at line 509, correctly used by `handleAdd` at lines 961/969 and `handleDelete` at line 875) is never called anywhere in `handleSave`. Reproduction confirmed by code trace: change a `vocabulary` card to `grammar` and save — the card stays under the "Vocabulary" header with a `grammar`-colored badge (`typeBadgeClass(card.type)` reads the *new* type), and both group headers' counts are wrong until a reload. | Directly falsifies "group collapse... and... edit... behave correctly" — group membership visibly desyncs from the data. |
| **CR-03** — editing a card's sentences does not refresh the cached `sentenceCount` badge | ✓ Confirmed | `components/CardsClient.tsx:1106`: `renderCardRow` computes `sentenceCount = card.sentenceCount ?? card.sentences.length` — a nullish-coalescing fallback that only yields to `sentences.length` when `sentenceCount` is `null`/`undefined`. `handleSave`'s `merge()` (lines 892-908) spreads `...c` (the stale pre-edit card, whose `sentenceCount` is always a defined number from the original list fetch) and never re-derives it, even though it *does* correctly rebuild the fresh `sentences` array. The stale cached count therefore always wins. Reproduction confirmed by code trace: a card showing "2 sentences", add a third, save — badge still reads "2 sentences" until a full reload. | This is a direct interaction with 31-06's own new field — a regression introduced by this phase's own gap-closure work, not a pre-existing/out-of-scope issue. |

**Disposition: goal-blocking, not pre-existing/out-of-scope.** All three findings sit squarely inside
Success Criterion 5's explicit text ("Add, edit, delete... and the Reading practice view all still
behave correctly"). CR-03 is a direct regression against 31-06's own new sentence-count feature
(itself part of this phase). CR-01 breaks the id-based Reading Practice patch that was *added in this
phase* (31-04's WR-03 fix) — the patch mechanism exists and is wired, but its precondition (stable
sentence ids across a save) was never true, so it has silently never worked since it was introduced.
CR-02 is a gap in `handleSave`'s group-bucket bookkeeping that has existed since the grouped/paginated
rendering model itself was introduced in 31-01/31-02 — the bug is old, but the *user-facing behavior
it breaks* ("group collapse... behave correctly") is a Phase-31-authored success criterion being
verified for the first time at real depth in this pass, not a criterion inherited from before Phase
31 existed (pre-31, there was no type-group bucket concept to desync). None of the three can be waved
off as "outside this phase's scope."

**Why the prior verification missed these:** the previous `31-VERIFICATION.md` (pre-31-06) marked SC5
`✓ VERIFIED` on the strength of test-suite-green + presence/wiring checks ("SwipeRow, useWordTap/
GlossProvider, group-collapse toggle... all confirmed present and wired"). That is necessary but not
sufficient — none of CR-01/02/03 are visible to a presence check or to the existing test suite, because
no existing test exercises "edit a card's type," "edit a card's sentences with an already-loaded
Reading Practice row for it," or "edit a card's sentence count." This pass corrects that gap by tracing
the actual data flow through `handleSave`/`merge()` rather than relying on suite-green + grep.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/cards-list.ts` | `getCardsPage()`, `getCardsGroupCounts()`, `getSentencesPage()`, `buildCardsWhere()`, `cardSelect._count` | ✓ VERIFIED | All present, exported, unit-tested; `_count` aggregate confirmed at line 32. |
| `lib/dto.ts` | `CardsPageDTO`, `GroupCountsDTO`, `SentencePageDTO`, `CardDTO.sentenceCount?` | ✓ VERIFIED | `sentenceCount?: number` confirmed at line 75. |
| `app/api/cards/route.ts` | Rewritten `GET` with query-param parsing/clamping/validation | ✓ VERIFIED | Unchanged since prior verification, no regression found. |
| `app/api/cards/[id]/route.ts` | `GET`/`PUT`/`DELETE` full-card CRUD | ⚠️ ORPHANED DEFECT | `GET`/`DELETE` correct. `PUT`'s sentence replace-all (lines 116-134) is the CR-01 root cause — present, wired, but produces incorrect downstream behavior. |
| `app/api/cards/sentences/route.ts` | New route delegating to `getSentencesPage` | ✓ VERIFIED | Present, registered, unchanged. |
| `lib/useDebouncedValue.ts` | Pure debounce hook | ✓ VERIFIED | Present, unit-tested. |
| `components/CardsClient.tsx` | Per-group state, composed-row Virtuoso rendering, search/filter wiring, Reading Practice, Edit sheet, sticky search+toggle unit, sentence-count badge | ⚠️ PARTIAL | Everything except `handleSave`'s three sub-behaviors (CR-01/02/03) confirmed correct. |
| `components/Nav.tsx` | `--nav-height` CSS custom property publisher | ✓ VERIFIED | Unchanged since prior verification. |
| `e2e/cards-tab-switch-scroll.spec.ts` | D-08 round-trip regression proof (31-06) | ✓ VERIFIED | Present, re-run directly this session — 2/2 passing. |
| `tests/cards-list.test.ts` | Unit coverage incl. `_count`/sentenceCount mapping | ✓ VERIFIED | Ran directly this session as part of `npm test` (303/303). |
| `e2e/perf.spec.ts` | Tightened `/cards` budget | ✓ VERIFIED | Ran directly this session, 8/8 pass. |
| `.planning/REQUIREMENTS.md` | CARDS-01/02/03 status synced to codebase state | ✓ VERIFIED (at the requirement-description level) | Confirmed `Complete` for all three; the individual requirement descriptions (capped query, virtualized scroll, server-side search/filter) are narrowly worded and genuinely satisfied — SC5's edit-flow defects are a broader, cross-cutting ROADMAP success criterion not captured by any single CARDS-0x requirement string, so this is not itself a documentation-accuracy gap. See Gaps for the actual blocking issue. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/cards/page.tsx` | `lib/cards-list.ts` | `getCardsPage`/`getCardsGroupCounts` via `Promise.all` | ✓ WIRED | Unchanged. |
| `components/CardsClient.tsx` | `react-virtuoso` | Flat `<Virtuoso>` renders composed rows | ✓ WIRED | Confirmed, two instances. |
| `components/CardsClient.tsx` (Edit sheet save) | `app/api/cards/[id]/route.ts` (PUT) | `fetch` → `handleSave(updated)` → `setGroups`/`setSearchResults`/`setReadingPractice` merge | ⚠️ WIRED BUT INCORRECT | The link exists and fires, but its merge logic is wrong on 3 sub-paths (CR-01/02/03) — see Gaps. |
| `components/CardsClient.tsx` (Reading Practice row) | `updated.sentences[].id` (PUT response) | Id-based lookup in `handleSave`'s Reading Practice patch | ✗ NOT EFFECTIVELY WIRED | Lookup key (`row.id`) never matches the response's regenerated ids (CR-01) — always misses. |
| `lib/cards-list.ts` `cardSelect._count` | `components/CardsClient.tsx` `renderCardRow`'s badge | `CardDTO.sentenceCount` (initial load) | ✓ WIRED | Correct on initial load; goes stale after an edit (CR-03) because `handleSave`'s `merge()` never re-derives it. |

### Behavioral Spot-Checks / Direct Test Runs (this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite | `npm test` | 303/303 passing, 27/27 files | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| Perf e2e | `npx playwright test e2e/perf.spec.ts --project=chromium` | 8/8 passing | ✓ PASS |
| D-08 tab-switch e2e | `npx playwright test e2e/cards-tab-switch-scroll.spec.ts --project=chromium` | 2/2 passing | ✓ PASS |
| CR-01 root cause (PUT sentence replace-all) | Direct code read: `app/api/cards/[id]/route.ts:116-134` | Confirmed: unconditional `deleteMany` + `create` per entry, no id preservation | ✗ DEFECT CONFIRMED |
| CR-02 root cause (no bucket relocation / bumpGroupCount) | Direct code read: `components/CardsClient.tsx:892-917`, cf. `961-969` | Confirmed: `handleSave` never calls `bumpGroupCount`; `setGroups` never removes/re-adds across `GROUP_KEYS` | ✗ DEFECT CONFIRMED |
| CR-03 root cause (stale sentenceCount) | Direct code read: `components/CardsClient.tsx:892-908`, `1106` | Confirmed: `merge()`'s `...c` spread carries forward the stale `sentenceCount`; no re-derivation line present | ✗ DEFECT CONFIRMED |

No test in the repo exercises any of the three CR-0x scenarios (confirmed via `grep -rn "handleSave" tests/ e2e/` → no matches); they are real, unguarded gaps in test coverage as well as in behavior.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| CARDS-01 | 31-01, 31-03, 31-04, 31-06 | Capped, sentence-free `/cards` initial query | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase confirms — this requirement's literal text does not cover post-edit behavior. |
| CARDS-02 | 31-01, 31-02, 31-04, 31-05, 31-06 | Smooth virtualized scrolling, no unbounded DOM growth | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase and UAT confirm — this requirement's literal text does not cover post-edit behavior either. |
| CARDS-03 | 31-01, 31-02, 31-06 | Server-side search/lesson filter, debounced | ✓ SATISFIED | REQUIREMENTS.md marks Complete; codebase and tests confirm. |

No orphaned requirements — all three phase-31 requirement IDs appear in at least one plan's
`requirements` frontmatter and are individually addressed above. **Note:** none of CARDS-01/02/03's
requirement-level descriptions in REQUIREMENTS.md mention edit-flow correctness, so their "Complete"
status is not itself inaccurate — but ROADMAP Success Criterion 5 (a broader, requirement-ID-agnostic
phase-level truth) is not satisfied, which is why this phase's overall status is `gaps_found` despite
all three named requirements reading `Complete`. Requirement-level tracking and ROADMAP-level goal
achievement are not the same measurement, and this is exactly the case where they diverge.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER` debt markers found in the files this phase modified. No
empty-implementation stubs found. `WINDOWS.md` entry #6 (per-card sentence-count signal) is stale:
its `status` still reads `open` even though 31-06 closed the underlying gap (confirmed by code and
tests this session) — 31-06-PLAN.md explicitly deferred closing the ledger entry itself to "the
standard post-execution verification workflow," i.e., this step. **This report does not itself edit
WINDOWS.md** (out of this agent's stated deliverables — VERIFICATION.md only) but flags both actions
for whoever closes out this phase: (1) mark WINDOWS.md entry #6 `fixed`, and (2) file 3 new WINDOWS.md
entries for CR-01/CR-02/CR-03 so they are tracked in the project's standard defect ledger rather than
living only in `31-REVIEW.md`.

## Gaps Summary

**One must-have genuinely fails as shipped:** ROADMAP Success Criterion 5's edit sub-clause. Three
independently-confirmed Critical defects (CR-01, CR-02, CR-03), all in
`components/CardsClient.tsx`'s `handleSave`/`merge()` and the `PUT /api/cards/[id]` route it calls,
mean an ordinary "edit a card" action can silently show wrong data to the user:

1. **CR-01:** an already-loaded Reading Practice row's sentence text never updates after editing that
   card's sentences (id-based patch permanently misses because the PUT route regenerates every
   sentence id on every save).
2. **CR-02:** changing a card's type never moves it to the correct type-group section or updates
   either group's header count.
3. **CR-03:** adding/removing a sentence and saving leaves the "N sentences" badge showing the
   stale pre-edit count — a direct regression against 31-06's own new feature shipped in this same
   phase.

None of these are caught by the passing 303/303 unit suite or the passing e2e specs, because no
existing test exercises any of these three specific scenarios — this is a genuine, unguarded gap in
both behavior and test coverage, not a false alarm from an overly strict review.

**What closed since the last verification:**
- Per-card sentence-count signal on initial load (ROADMAP SC4's second clause) — closed by 31-06,
  confirmed present/wired/tested this session.
- D-08 tab-switch round-trip scroll/state preservation — closed by 31-06's new e2e spec, re-run and
  confirmed passing this session.

**What's newly broken:** the three CR-0x defects above. None were flagged as open gaps in the prior
verification pass, because that pass verified presence/wiring and suite-green status for the edit
flow rather than tracing `handleSave`'s actual data flow.

**Recommendation:** This phase's core engineering goal — capping the query, dropping sentences from
the list read, windowing the render, moving search/filter server-side, and now also surfacing a
per-card sentence count without loading sentences — is real, well-tested, and verified working
end-to-end (Success Criteria 1-4 all hold). The phase cannot close clean until CR-01/CR-02/CR-03 are
fixed (a small, well-scoped patch to `handleSave`'s `merge()`/`setGroups` block and, for CR-01, either
an id-stable PUT sentence upsert or a full-refetch fallback in the Reading Practice patch — the
review's own suggested fixes are directly actionable). Recommend a `31-07` gap-closure plan targeting
exactly these three findings, followed by a re-verification pass that includes at least one automated
regression test per defect (type-change relocation, sentence-count-after-edit, and Reading-Practice-
row-refresh-after-edit) so this class of defect cannot silently reappear.

---
*Verified: 2026-08-08T01:00:00Z*
*Verifier: Claude (gsd-verifier)*
