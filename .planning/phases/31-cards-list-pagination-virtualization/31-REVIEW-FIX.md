---
phase: 31
fixed_at: 2026-08-07T20:02:10Z
review_path: .planning/phases/31-cards-list-pagination-virtualization/31-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-08-07T20:02:10Z
**Source review:** .planning/phases/31-cards-list-pagination-virtualization/31-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 5
- Skipped: 0

Fix scope was `critical_warning` (CR-01, WR-01, WR-02, WR-03, WR-04). IN-01/IN-02/IN-03
were out of scope for automatic fixing, except IN-03, which the task instructions
explicitly called out as a follow-up to CR-01 — a regression test was added for it (see
"Additional test coverage" below); it is not counted in the findings_in_scope/fixed
totals above since Info findings are outside `critical_warning` scope.

**Verification environment:** all work happened in an isolated git worktree
(`/tmp/sv-31-reviewfix-XXXXXX`, branch `gsd-reviewfix/31-<pid>`), fast-forwarded into
`main` on cleanup. `npm test` (vitest) and `npm run lint` ran unmodified. `npm run build`
normally uses Turbopack, which panics in this specific worktree setup only because
`node_modules` is a symlink pointing outside the worktree's filesystem root (a
consequence of this sandboxed worktree, not a code defect — confirmed by running
`npx next build --webpack` instead, which succeeded cleanly with identical source). The
new e2e test was run via `npx playwright test e2e/cards-search-clear.spec.ts
--project=chromium`, temporarily pointing the Playwright webServer command at
`next build --webpack` for this same symlink reason; that config change was never
committed (reverted before finishing). Results are reproducible from a normal checkout,
where `npm run build`/`npm run test:e2e` use Turbopack/webServer unmodified.

## Fixed Issues

### CR-01: Clearing the search box leaves group counts permanently stale

**Files modified:** `components/CardsClient.tsx`
**Commit:** `b8bbfdd`
**Applied fix:** Added `wasSearchActiveRef` to track whether the previous `runQuery()`
call was in search mode. `runQuery()` now computes `searchJustCleared =
wasSearchActiveRef.current && !searchActive` before branching, and the grouped-mode
"unchanged" skip-check now also requires `!searchJustCleared` — so clearing the search
box always forces a grouped refetch (which refreshes `groupCounts`) even when
`{filter, lessonFrom, lessonTo}` never changed. Matches the review's suggested fix
exactly.

### WR-01: `lessonFrom`/`lessonTo` are not validated before reaching Prisma

**Files modified:** `app/api/cards/route.ts`, `app/api/cards/sentences/route.ts`
**Commit:** `3c3990f`
**Applied fix:** Mirrored `GET /api/cards/due`'s `INTEGER_RE` + range-validation
pattern in both routes. Malformed or out-of-range `lessonFrom`/`lessonTo` values now
return a clean `{ error: 'invalid lesson range' }` 400 instead of flowing through as
`NaN` into Prisma and surfacing as a generic 500.

### WR-02: `POST /api/cards` has no error handling or input validation

**Files modified:** `app/api/cards/route.ts`
**Commit:** `4e8d636`
**Applied fix:** Wrapped the whole handler body in `try/catch`, added field-shape
validation for `front`/`type`/`back`/`notes`/`sentences` (mirroring the `PUT` handler
in `app/api/cards/[id]/route.ts`), and mapped a `normalizedFront` unique-constraint
collision (Prisma `P2002`) to a friendly 400. A non-string `front` no longer throws
uncaught inside `normalizeFront()`.

### WR-03: Editing or deleting a card doesn't update an already-loaded Reading Practice row

**Files modified:** `components/CardsClient.tsx`
**Commit:** `2ffeedb`
**Applied fix:** `handleDelete` now also prunes any `readingPractice.loaded` row(s)
whose `card.id` matches the deleted card. `handleSave` now also patches any matching
`readingPractice.loaded` row(s) — updating the row's `card` fields always, and its
`korean`/`targetForm`/`translation` when the edited sentence (matched by the sentence's
own `id`, not array index — more robust than the review's literal suggestion since
sentences can be reordered/added/removed in the editor) still exists in the saved card.

### WR-04: `handleSave`'s merge silently produces malformed `SentenceDTO` entries

**Files modified:** `components/CardsClient.tsx`
**Commit:** `2ffeedb` (same commit as WR-03 — both touch `handleSave`'s `merge`
function)
**Applied fix:** Took the review's second suggested option: `handleSave`'s `merge()`
now explicitly reconstructs each sentence's `cardId`/`orderIndex`/`createdAt`/
`updatedAt` fields (using the real PUT-response values when present via optional
fields added to `CardEditorShape.sentences`, falling back to sane reconstructed values
otherwise) instead of spreading the narrower `CardEditorShape.sentences` shape over
`CardDTO` behind an unchecked `as CardDTO` cast. No `as CardDTO` cast remains in
`merge()`.

## Additional test coverage (IN-03, requested alongside CR-01)

**File added:** `e2e/cards-search-clear.spec.ts`
**Commit:** `882dd4e`

Added an e2e regression test (this codebase has no jsdom/@testing-library — see
`tests/use-debounced-value.test.ts`'s header comment — so an e2e case is the
established vehicle for `CardsClient.tsx`'s stateful logic, per IN-03's own
recommendation): types a search term ('학교') that narrows the seeded 8-card fixture
deck to a genuine 2-card subset, asserts the mid-search "Cards (N)" label actually
changed (non-vacuous), clears the search box, and asserts both the "Cards (N)" tab
label and the Vocabulary group header's count return exactly to their pre-search
values.

**Confirmed as a genuine regression test, not vacuous:** manually reverted the CR-01
fix's `runQuery()` hunk (keeping everything else applied), re-ran the test — it failed
exactly as CR-01 describes (`Cards (2)` stuck instead of `Cards (8)`); re-applied the
fix and confirmed it passes again.

## Skipped Issues

None — all 5 in-scope findings (CR-01, WR-01, WR-02, WR-03, WR-04) were fixed.

## Verification run

- `npm test` (vitest): **300/300 passed**, 27/27 test files, both before and after all
  fixes.
- `npm run lint` (eslint): **0 errors**, 1 pre-existing warning in
  `components/StudySession.tsx:300` (`react-hooks/exhaustive-deps` on `cardSentences`,
  confirmed present and identically worded on `main` before any of this session's
  changes — a file untouched by this fix pass).
- `npm run build`: Turbopack panics in this specific worktree only (`node_modules`
  symlink points outside the worktree's filesystem root) — not a code defect.
  `npx next build --webpack` (identical source, same worktree) **compiled successfully,
  typechecked cleanly, and generated all 23 routes** with no errors.
- New e2e test (`e2e/cards-search-clear.spec.ts`, run via
  `npx playwright test --project=chromium`): **passes** with all fixes applied; **fails**
  (as expected) with the CR-01 fix reverted, confirming it actually exercises the bug.

---

_Fixed: 2026-08-07T20:02:10Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
