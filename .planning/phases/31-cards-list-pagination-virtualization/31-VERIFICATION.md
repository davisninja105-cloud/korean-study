---
phase: 31-cards-list-pagination-virtualization
verified: 2026-08-08T06:45:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "Keyboard Tab navigation and a screen reader can still reach every rendered card row and its Edit control inside the virtualized Vocabulary group (31-01 must_haves.truths, CARDS-02 accessibility backstop truth)"
    reason: "Formally waived by user decision during 31-UAT (2026-08-07, test 3): known keyboard/screen-reader focus-reachability gap in the virtualized Vocabulary group is accepted as-is for this phase, not scheduled for a fix. Recorded in WINDOWS.md entry #1 (status: waived) with reason, recorded_at, and resolved_at timestamps. Carried forward unchanged from the previous VERIFICATION.md — nothing in this round's CR-01/02/03 fixes or the subsequent code-review fix pass touches Virtuoso rendering, focus order, or ARIA attributes (confirmed via `git diff` scoping to `handleSave`/`handleAdd`/`merge()`/PUT-route logic only)."
    accepted_by: "user (via 31-UAT.md test 3 + gsd-tools windows waive)"
    accepted_at: "2026-08-07T21:12:26.182Z"
re_verification:
  previous_status: gaps_found
  previous_score: 4/5 (SC5 failed)
  gaps_closed:
    - "ROADMAP Success Criterion 5's edit sub-clause: CR-01 (stale Reading Practice text after a sentence edit), CR-02 (a type-changing edit never relocates the card between group buckets or updates group-header counts), and CR-03 (stale 'N sentences' badge after a sentence add/remove) — all three closed by plan 31-07, independently re-verified this session by direct code read AND by re-running the mandatory e2e regression spec myself (not taking the SUMMARY's word)."
  gaps_remaining: []
  regressions:
    - "A subsequent code review (31-REVIEW.md, run after 31-07 closed) found 2 additional BLOCKER-level defects and 6 WARNING-level defects in the broader Phase-31 codebase, not scoped to 31-07's own must_haves: CR-01(review) — CardEditor swallowed every save failure with no user-visible error; CR-02(review) — handleAdd/handleSave could insert a card into a never-fetched type-group bucket, permanently hiding that group's other real cards until a full reload (a 'phantom populated group' bug, distinct from 31-07's own CR-02 naming). Both are now fixed (31-REVIEW-FIX.md, commits ac6d83c/3f86c60) with dedicated new regression coverage (a second e2e test added to e2e/cards-edit-regression.spec.ts, confirmed RED against the pre-fix code before being confirmed GREEN), independently re-run and confirmed passing this session — not merely accepted on the review-fix report's word."
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 31: Cards List Pagination & Virtualization Verification Report

**Phase Goal:** Stop `/cards` from querying, serializing, transferring, and hydrating the entire
~1056-card deck plus its ~1616 sentence rows on every visit. Cap the initial query, split the
`sentences` relation out of the list read, window the rendered rows, and move search + lesson
filtering server-side so correctness survives pagination.

**Verified:** 2026-08-08T06:45:00Z
**Status:** passed
**Re-verification:** Yes — third pass on this phase. Previous VERIFICATION.md (`gaps_found`, 4/5,
SC5 failing on 3 Critical edit-flow defects CR-01/CR-02/CR-03) is superseded. Since then: plan
`31-07` closed those three defects with a mandatory fail-first-then-green e2e spec (independently
re-run this session), and a subsequent code-review + code-review-fix cycle (`31-REVIEW.md` /
`31-REVIEW-FIX.md`) found and fixed 2 further BLOCKER-level defects plus 6 WARNING-level defects
in the same edit-flow area — all independently re-verified against the current codebase this
session, not accepted on SUMMARY/REVIEW-FIX prose alone.

## What changed since the previous verification

- **Plan 31-07 shipped** (commits `1f2311c`, `376663d`, `a6a32a6`): `PUT /api/cards/[id]` now
  upserts `Sentence` rows by id (scoped `deleteMany`/`update`/`create`, compound `id`+`cardId`
  `where` for IDOR defense-in-depth) instead of blanket delete+recreate, fixing CR-01's root
  cause; `CardEditor.tsx`'s save payload round-trips each sentence's existing `id`; `CardsClient.tsx`'s
  `handleSave` now relocates a type-changed card between `GROUP_KEYS` buckets with correct
  `bumpGroupCount` bookkeeping (CR-02) and its shared `merge()` recomputes `sentenceCount` from the
  freshly-saved sentences array on every save (CR-03). A new mandatory spec,
  `e2e/cards-edit-regression.spec.ts`, exercises all three in one CardEditor save; the SUMMARY
  documents a RED baseline, a partial-fix run, and a full GREEN run — all three independently
  plausible and consistent with the diff.
- **A fresh code review ran after 31-07** (`31-REVIEW.md`, `c536fa6`) covering the whole phase's
  edit-flow area and found 2 Critical + 6 Warning + 3 Info findings. Of particular note per this
  task's instructions: **the review's own "CR-02"** (distinct from 31-07's CR-02) is a **phantom-group-population
  bug** — `handleAdd`/`handleSave` could splice a card into a type-group bucket that had never been
  fetched this session, leaving `hasMore: false` with a non-empty `loaded` array and permanently
  hiding that group's other real cards until a full page reload. This is real and reproducible: the
  review correctly diagnosed that 31-07's own new e2e spec structurally could not have caught it
  (its fixture has zero pre-existing Grammar cards, so an empty-vs-phantom-populated bucket looks
  identical).
- **A code-review-fix pass then landed** (`31-REVIEW-FIX.md`, 9 commits `ac6d83c`…`8242059`): all 8
  in-scope findings (2 Critical + 6 Warning; the 3 Info findings were explicitly left out of scope)
  fixed, each with its own commit. Critically, a **second e2e test** was added to
  `e2e/cards-edit-regression.spec.ts` specifically targeting the phantom-group bug, built through
  the real UI (reload to reset client state, then add a second same-type card behind an
  already-populated-server-side, never-fetched-client-side bucket) — confirmed RED against the
  pre-fix code, then GREEN.

**Net effect: the phase's single remaining gap (SC5's edit sub-clause) is closed, and two further
BLOCKER-level defects discovered by an independent review pass are also closed with real regression
coverage.** Nothing new is open.

## Independent verification performed this session

I did not take any of the above on the SUMMARY/REVIEW-FIX documents' word. Directly this session:

1. **Read the actual diffs** for `app/api/cards/[id]/route.ts` (PUT handler), `components/CardEditor.tsx`
   (`handleSave`), and `components/CardsClient.tsx` (`handleSave`, `merge()`, `handleAdd`) and confirmed
   the described fixes are the code that is actually there — upsert-by-id sentence ops with a compound
   `id`+`cardId` where clause; `sentenceCount: (updated.sentences ?? []).length` in `merge()`;
   `oldKeyEntry`/`newKey` relocation logic with conditional `bumpGroupCount` calls in `handleSave`; a
   `newGroupNeedsRealFetch` guard (`groups[newKey].loaded.length === 0 && !groups[newKey].loading`) in
   both `handleSave` and `handleAdd` that triggers a real `fetchGroupPage` instead of an optimistic
   splice into a never-fetched bucket.
2. **Ran `npm test` myself**: 310/310 passing, 27/27 files — matches the SUMMARY's claim exactly.
3. **Ran `npm run lint` myself**: 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) —
   matches.
4. **Ran the full targeted e2e battery myself**:
   `npx playwright test e2e/cards-edit-regression.spec.ts e2e/cards-search-clear.spec.ts
   e2e/cards-sticky-header.spec.ts e2e/cards-tab-switch-scroll.spec.ts e2e/perf.spec.ts
   e2e/smoke.spec.ts --project=chromium` → **17/17 passed**, including both tests in
   `cards-edit-regression.spec.ts` (the CR-01/02/03 combined regression AND the phantom-group CR-02
   regression) — matches the REVIEW-FIX report's claim exactly.
5. **Ran `npx vitest run tests/cards-id-route.test.ts` myself**: 9/9 passing (2 pre-existing GET
   tests + 5 from 31-07's PUT upsert coverage + 2 from the review-fix's WR-01/WR-03 coverage).
6. **Confirmed the `/cards` perf budget is still tightened**: `grep "'/cards'" e2e/perf.spec.ts` →
   `100` (ms), and the perf run above shows real samples in the 18–54ms range, well under budget.
7. **Confirmed all referenced commits exist** in `git log` (`1f2311c`, `376663d`, `a6a32a6`, `c536fa6`,
   `ac6d83c`, `3f86c60`, `7258698`, `5092b54`, `7478566`, `def5b9e`, `4cd2779`, `bae8c85`, `1e1599c`,
   `8242059`) and that `git status --short` shows no uncommitted changes to any Phase-31 source file
   (only `.planning/config.json`, unrelated).
8. **Confirmed WINDOWS.md's ledger**: `open_count: 0`, `waived_count: 1`, `fixed_count: 8`,
   `total_count: 9` — entries 6/7/8/9 (sentence-count signal, CR-01/02/03) all `status: fixed` with
   non-null `resolved_at`; entry 1 (accessibility gap) remains `waived`.
9. **Confirmed `.planning/REQUIREMENTS.md` was genuinely left untouched** by plan 31-07 (as its
   frontmatter promised) — `git log --oneline -- .planning/REQUIREMENTS.md` shows the last change to
   that file is the pre-31-07 revert commit (`7453503`); CARDS-01/02/03 still read `Gaps Found`,
   correctly deferred to this verification pass to adjudicate.
10. **Confirmed no debt markers** (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) were introduced
    in any of the 7 files this round's fixes touched.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opening `/cards` paints first rows <1s; initial query capped, no `sentences` rows; `e2e/perf.spec.ts` passes at a tightened threshold | ✓ VERIFIED | Unchanged since the prior verification (`lib/cards-list.ts` not touched by 31-07 or the review-fix pass, confirmed via `git diff --stat`). Re-ran `e2e/perf.spec.ts` myself this session — 8/8 pass, `/cards` samples 18–54ms against a 100ms budget (`e2e/perf.spec.ts:56`). |
| 2 | Scrolling stays smooth, DOM stays bounded rather than growing with every page loaded | ✓ VERIFIED | `components/CardsClient.tsx` still renders through a flat `<Virtuoso>` over composed rows — this round's changes are confined to `handleSave`/`handleAdd`/`merge()` state bookkeeping and do not touch the Virtuoso wiring, row composition, or virtualization mechanics (confirmed via `git diff` scoping). Previously confirmed working at real scale via completed human UAT (31-UAT.md test 1: pass). |
| 3 | Typing a search term returns matches from the full deck, debounced so intermediate keystrokes don't each hit the server | ✓ VERIFIED | `lib/useDebouncedValue.ts` and `buildCardsWhere()` untouched this round (confirmed via `git diff --stat`); re-ran `npm test` myself (310/310, includes debounce + where-builder unit tests) and `e2e/cards-search-clear.spec.ts` myself (passing). |
| 4 | Lesson-range filter returns the correct card set across the full deck, and a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves | ✓ VERIFIED | `lessonFrom`/`lessonTo` wiring and `cardSelect._count`→`sentenceCount` mapping untouched by this round (`lib/cards-list.ts`, `lib/dto.ts` both absent from this round's `git diff --stat`). The *post-edit* freshness of that badge (CR-03) is now also correct — see SC5. |
| 5 | Add, edit, delete, swipe-to-delete, tap-to-gloss, group collapse, and the Reading practice view all still behave correctly against the paginated list; the existing e2e and unit suites stay green | ✓ VERIFIED | **The previous blocker is closed.** CR-01 (stale Reading Practice text): fixed via upsert-by-id `Sentence` mutations in `PUT /api/cards/[id]` (`app/api/cards/[id]/route.ts:145-222`) + `CardEditor.tsx` round-tripping each sentence's `id`; proven by `e2e/cards-edit-regression.spec.ts`'s first test, re-run and confirmed passing this session. CR-02 (no bucket relocation/count bookkeeping): fixed via `oldKeyEntry`/`newKey` relocation + conditional `bumpGroupCount` in `handleSave` (`components/CardsClient.tsx:946-982`); same spec, same passing run. CR-03 (stale sentence-count badge): fixed via `sentenceCount: (updated.sentences ?? []).length` in the shared `merge()` (`components/CardsClient.tsx:944`); same spec. **Additionally closed since the last verification pass:** the phantom-group-population bug found by the follow-up code review (inserting a card into a never-fetched type-group bucket permanently hides that group's other real cards) — fixed in both `handleAdd` and `handleSave` via a `newGroupNeedsRealFetch`/`loaded.length === 0 && !loading` guard that triggers a real `fetchGroupPage` instead of an optimistic splice (`components/CardsClient.tsx:962-975,1034-1041`); proven by a second, dedicated e2e test in the same spec file, independently re-run and confirmed passing this session. CardEditor now surfaces save failures via a `saveError` banner instead of swallowing them silently (`components/CardEditor.tsx:39,91-95,101`). Delete failures now surface a `deleteError` banner (`components/CardsClient.tsx:322,908,1454-1456`). Suites stay green: `npm test` 310/310 (re-run myself), `npm run lint` 0 errors (re-run myself), the 5 named `/cards`-touching e2e specs plus the 2-test edit-regression spec — 17/17 (re-run myself). Swipe-to-delete, tap-to-gloss, and group-collapse-toggle-itself are unaffected by this round's changes and remain wired (`SwipeRow`/`useWordTap` imports and usages unchanged; confirmed present at `components/CardsClient.tsx:10-11,1185,1174`). |

**Score:** 5/5 ROADMAP Success Criteria verified.

### Cross-Reference: Task Notes' Specific Concerns

Per the explicit instructions for this re-verification pass:

- **CR-01/CR-02/CR-03 from plan 31-07 (stale Reading Practice text, group-bucket relocation, stale
  sentenceCount badge):** all three confirmed fixed by direct code read AND by independently
  re-running `e2e/cards-edit-regression.spec.ts`'s first test myself this session (not taken on the
  SUMMARY's word) — pass.
- **The review's "CR-02" (phantom-group-population bug in `handleAdd`/`handleSave`) — distinct from
  31-07's own CR-02 naming:** confirmed fixed. The guard (`groups[key].loaded.length === 0 &&
  !groups[key].loading` → real `fetchGroupPage` instead of an optimistic splice) is present in both
  `handleAdd` (`components/CardsClient.tsx:1034`) and `handleSave`'s relocation branch
  (`components/CardsClient.tsx:962-963,974-975`). Real regression coverage exists — a second,
  dedicated e2e test (`e2e/cards-edit-regression.spec.ts:265`, titled "adding a Grammar card into a
  never-fetched-this-session bucket does not hide a real pre-existing Grammar card (CR-02)") was
  independently re-run this session and passes. This is not a claimed fix taken on faith: the test
  builds the actual bug precondition through the real UI (add one Grammar card, `page.reload()` to
  reset client-side group state while the server genuinely holds 1 Grammar card, add a second Grammar
  card) and asserts both cards remain visible — exactly the scenario the review described as
  unreachable by the first spec's fixture.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/cards/[id]/route.ts` | `GET`/`PUT`/`DELETE`; PUT upserts sentences by id, maps P2025→404, validates nested sentence field types, runs the sentence-ownership read inside the same interactive transaction as the writes | ✓ VERIFIED | Confirmed present at lines 145-257: interactive `$transaction(async (tx) => {...})`, upsert-by-id sentence ops (164-214), P2002/`isUniqueConstraintError` OR-ed catch (237-245), P2025→404 (249-251), nested-sentence field-type validation (105-120). |
| `components/CardEditor.tsx` | `handleSave` round-trips each sentence's `id`; surfaces a `saveError` banner on failure | ✓ VERIFIED | Confirmed at lines 39 (`saveError` state), 74-105 (`handleSave` reads `body?.error` on `!res.ok`, sets `saveError`), 88 (payload includes `id`). |
| `components/CardsClient.tsx` | `handleSave` relocates group buckets + recomputes `sentenceCount`; both `handleSave` and `handleAdd` guard against inserting into a never-fetched bucket; `deleteError` banner on delete failure; sentence-preview dead-code block removed | ✓ VERIFIED | Confirmed at lines 914-1012 (`handleSave`), 944 (`sentenceCount` recompute), 950-982 (relocation + guarded `bumpGroupCount`), 1014-1054 (`handleAdd`, same guard at 1034), 322/908/1454-1456 (`deleteError`), 1223 (WR-05 removal comment, no dead preview block remaining). |
| `tests/cards-id-route.test.ts` | GET tests + PUT upsert/create/delete/empty-array/cross-card-id tests + P2025-404 + P2002-under-interactive-transaction tests | ✓ VERIFIED | Ran directly this session: 9/9 passing. |
| `e2e/cards-edit-regression.spec.ts` | One combined CR-01/02/03 spec + one phantom-group-population spec | ✓ VERIFIED | Ran directly this session: 2/2 passing, 327 lines, both test titles confirmed. |
| `.planning/WINDOWS.md` | `open_count: 0` | ✓ VERIFIED | Confirmed via direct read: `open_count: 0`, `waived_count: 1`, `fixed_count: 8`, `total_count: 9`. |
| `lib/cards-list.ts`, `lib/dto.ts`, `lib/useDebouncedValue.ts`, `app/api/cards/sentences/route.ts` | Unchanged since prior verification (SC1-4 already verified) | ✓ VERIFIED | Confirmed via `git diff --stat` since the prior verification's baseline commit — none of these 4 files appear in the diff. |
| `.planning/REQUIREMENTS.md` | CARDS-01/02/03 status cells adjudicated by this verification pass | ✓ ADJUDICATED (see Requirements Coverage) | Confirmed genuinely untouched by 31-07 or the review-fix pass (`git log -- .planning/REQUIREMENTS.md` last change is the pre-31-07 revert). This pass updates them to `Complete` below its own authority, per its explicit charge. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `components/CardEditor.tsx` (Edit sheet save) | `app/api/cards/[id]/route.ts` (PUT) | `fetch` with each sentence's `id` round-tripped | ✓ WIRED, CORRECT | Confirmed: payload includes `id`; server upserts by id; response's sentence ids are stable for unchanged rows. |
| `components/CardsClient.tsx` (Reading Practice row) | `updated.sentences[].id` (PUT response) | Id-based lookup in `handleSave`'s Reading Practice patch | ✓ WIRED, CORRECT | Ids are now stable across a save (CR-01 fix), so `updatedSentencesById.get(row.id)` actually matches — confirmed behaviorally by the e2e spec's Reading Practice re-read assertion, re-run this session. |
| `components/CardsClient.tsx` `handleSave`/`handleAdd` | `groups[key]` state | Bucket relocation / phantom-group guard | ✓ WIRED, CORRECT | `newGroupNeedsRealFetch` guard confirmed present in both call sites; behaviorally proven by the phantom-group e2e test, re-run this session. |
| `lib/cards-list.ts` `cardSelect._count` | `components/CardsClient.tsx` `renderCardRow`'s badge | `CardDTO.sentenceCount`, refreshed on every save via `merge()` | ✓ WIRED, CORRECT | Correct on initial load (unchanged) AND after an edit (CR-03 fix) — confirmed behaviorally by the e2e spec's badge-text assertion, re-run this session. |

### Behavioral Spot-Checks / Direct Test Runs (this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit test suite | `npm test` | 310/310 passing, 27/27 files | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning | ✓ PASS |
| Cards-touching e2e battery (6 spec files, 17 tests) | `npx playwright test e2e/cards-edit-regression.spec.ts e2e/cards-search-clear.spec.ts e2e/cards-sticky-header.spec.ts e2e/cards-tab-switch-scroll.spec.ts e2e/perf.spec.ts e2e/smoke.spec.ts --project=chromium` | 17/17 passing | ✓ PASS |
| CR-01/02/03 combined regression (in isolation) | `npx playwright test e2e/cards-edit-regression.spec.ts --project=chromium` | 3/3 passing (setup + both regression tests) | ✓ PASS |
| PUT-route unit coverage | `npx vitest run tests/cards-id-route.test.ts` | 9/9 passing | ✓ PASS |
| `/cards` perf budget | `grep "'/cards'" e2e/perf.spec.ts` + perf run samples | Budget 100ms; observed samples 18-54ms | ✓ PASS |
| WINDOWS.md ledger | Direct read | `open_count: 0` | ✓ PASS |
| Debt-marker scan on all 7 touched files | `grep -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` | No matches in any touched file | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| CARDS-01 | 31-01, 31-03, 31-04, 31-06, 31-07 | Capped, sentence-free `/cards` initial query | ✓ SATISFIED | Query cap/sentence-exclusion unchanged and previously verified; edit-flow correctness for cards loaded via this query (CR-01/CR-03) is now also fixed. |
| CARDS-02 | 31-01, 31-02, 31-04, 31-05, 31-06, 31-07 | Smooth virtualized scrolling, no unbounded DOM growth | ✓ SATISFIED | Virtualization mechanics unchanged and previously verified; group-bucket integrity under edit/add (CR-02, phantom-group bug) is now also fixed, so virtualized group state stays consistent with the server. |
| CARDS-03 | 31-01, 31-02, 31-06, 31-07 | Server-side search/lesson filter, debounced | ✓ SATISFIED | Query-building/debounce unchanged and previously verified; search-result rows now also receive the CR-03 sentence-count fix via the shared `merge()` (`setSearchResults` consumes the same fix). |

No orphaned requirements — all three phase-31 requirement IDs appear in every relevant plan's
`requirements` frontmatter, including 31-07, and are individually addressed above.

**Requirements.md status update (this pass's adjudication):** `.planning/REQUIREMENTS.md` currently
reads `Gaps Found` for all three rows, correctly left untouched by 31-07 pending this verification.
With ROADMAP Success Criterion 5 now fully verified (the only previously-failing criterion) and no
other gap open, this verification updates the requirement-tracking table's status cells for
CARDS-01/CARDS-02/CARDS-03 from `Gaps Found` to `Complete` as part of this report's bundle — see
note below on scope of that edit.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers found in any of the 7 files this
round's fixes touched. No empty-implementation stubs found. The one previously-flagged stale ledger
issue (WINDOWS.md entry #6 reading `open` after its underlying gap was already closed) has been
resolved — confirmed `fixed` with a non-null `resolved_at`.

## Gaps Summary

**None.** The previous verification's single blocking gap (ROADMAP Success Criterion 5's edit
sub-clause, three Critical defects CR-01/CR-02/CR-03) is closed and independently re-confirmed this
session — not by re-reading the SUMMARY, but by re-running the mandatory e2e spec, the full unit
suite, the lint check, and the targeted `/cards` e2e battery myself, and by directly reading the
diffs against the exact line numbers the prior verification cited as broken.

A subsequent code review, run after 31-07 closed, found two further BLOCKER-level defects (CardEditor
silently swallowing save failures; a phantom-group-population bug distinct from 31-07's own CR-02)
plus six Warning-level defects, all in the same edit-flow area. All eight were fixed in a follow-up
review-fix pass, each with its own commit, and — critically for the phantom-group bug, which the
review correctly noted the existing spec structurally could not catch — a new, dedicated e2e test was
added and independently re-run this session, confirmed passing. Nothing from either review round
remains open; `WINDOWS.md` reads `open_count: 0`.

**Recommendation:** Phase 31 is complete. All 5 ROADMAP Success Criteria hold, verified this session
by direct code inspection and by independently re-running every automated check referenced (unit
suite, lint, and the full targeted e2e battery including both edit-regression tests) rather than by
trusting SUMMARY/REVIEW-FIX prose. Ready to proceed.

---
*Verified: 2026-08-08T06:45:00Z*
*Verifier: Claude (gsd-verifier)*
