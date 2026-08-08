---
phase: 31-cards-list-pagination-virtualization
fixed_at: 2026-08-08T06:15:16Z
review_path: .planning/phases/31-cards-list-pagination-virtualization/31-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-08-08T06:15:16Z
**Source review:** .planning/phases/31-cards-list-pagination-virtualization/31-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, CR-02, WR-01 through WR-06 — `fix_scope: critical_warning`; IN-01/IN-02/IN-03 explicitly out of scope for this pass)
- Fixed: 8
- Skipped: 0

All work was performed in an isolated git worktree (`gsd-reviewfix/31-*` branch, fast-forwarded onto `main` at cleanup) per the standard review-fix isolation protocol — every commit below landed atomically, one finding per commit.

## Fixed Issues

### CR-01: CardEditor silently swallows every save failure

**Files modified:** `components/CardEditor.tsx`
**Commit:** `ac6d83c`
**Applied fix:** Added a `saveError` state. `handleSave`'s failure branch now reads the server's JSON error body (`body?.error`) when `!res.ok` and falls back to a generic message on network/parse failure; the message renders as a red inline banner above the Save/Cancel buttons, mirroring the existing "Add Card" sheet's `addError` pattern. The friendly 400 message the API already returns on a `normalizedFront` collision now actually reaches the user.

### CR-02: Adding/relocating a card into a not-yet-fetched group bucket permanently hides that group's real contents

**Files modified:** `components/CardsClient.tsx`
**Commit:** `3f86c60`
**Applied fix:** In both `handleAdd` and `handleSave`'s type-relocation branch, before splicing the card into its destination group bucket, check whether that bucket has ever been fetched (`loaded.length === 0 && !loading`). If it hasn't, trigger a real `fetchGroupPage(key, null, 'replace')` instead of the lone optimistic insert — the real fetch naturally returns the just-created/relocated card alongside any other real cards of that type, so `hasMore` and `loaded` stay accurate instead of getting permanently stuck at "1 card, no more." If the bucket already has other loaded rows (i.e. it's genuinely been fetched this session), the original lightweight optimistic insert is kept, so the fix costs nothing on the common path.

**Behavioral proof (see "Test coverage added" below):** the shipped e2e regression fixture has zero pre-existing Grammar cards, so it structurally could not have caught this bug (the destination bucket is "empty and correct" either way). A new, dedicated e2e test was added that builds the actual bug precondition through the real UI (no fixture/DB changes) and was verified RED against the pre-fix code and GREEN against the fix — see below.

### WR-01: `PUT /api/cards/[id]` doesn't map "card not found" (P2025) to 404

**Files modified:** `app/api/cards/[id]/route.ts`
**Commit:** `7258698`
**Applied fix:** Added a `P2025` branch to the catch block (mirroring the existing `GET`/`DELETE` handling), returning `{ error: 'Card not found' }` with status 404 instead of falling through to the generic 500. Verified with a new unit test (`tests/cards-id-route.test.ts`) that PUTs a nonexistent card id and asserts 404.

### WR-02: Shallow validation of nested `sentences[]` fields in POST/PUT

**Files modified:** `app/api/cards/route.ts`, `app/api/cards/[id]/route.ts`
**Commit:** `5092b54`
**Applied fix:** Added an explicit field-shape check (`korean`/`targetForm`/`translation` must all be strings) in both the POST and PUT handlers, returning a clean 400 (`"each sentence must have korean/targetForm/translation strings"`) instead of letting a non-string value reach Prisma and throw a generic 500.

### WR-03: TOCTOU race in the sentence-upsert transaction

**Files modified:** `app/api/cards/[id]/route.ts`, `lib/db-errors.ts`, `tests/cards-id-route.test.ts`
**Commit:** `7478566`
**Applied fix (adapted from the review's literal suggestion — see note below):** Converted the PUT handler's array-form `prisma.$transaction([...])` to the interactive `prisma.$transaction(async (tx) => {...})` form and moved the sentence-ownership `findMany` read inside it, so the read and every subsequent write (delete/update/create) execute atomically against concurrent mutation of the same card's sentences — closing the race the review described.

**Deviation from the review's literal fix, and why:** this codebase has a *documented, previously-debugged* landmine (`.planning/debug/reviewlog-p2002-catch-never-fires.md`, referenced from `.planning/codebase/CONCERNS.md`): with Prisma 7 + `@prisma/adapter-libsql`, a UNIQUE-constraint violation thrown *inside* an interactive transaction callback surfaces as a raw, unclassified `DriverAdapterError` rather than a classified `PrismaClientKnownRequestError`/P2002 — which would have silently broken this exact handler's already-shipped `normalizedFront`-collision friendly-400 (and my new WR-01 404) the moment it moved to interactive-transaction form. Blindly applying the review's suggested code would have introduced a real regression. Instead, the fix reuses the project's own already-built mitigation for this exact quirk (`lib/db-errors.ts`'s `isUniqueConstraintError`, previously used only by `app/api/review/route.ts`) — the P2002 catch is now `(P2002 instanceof-check) || isUniqueConstraintError(e, 'normalizedFront')`. Updated `lib/db-errors.ts`'s doc comment to list the new call site.

**Behavioral proof:** two new tests were added to `tests/cards-id-route.test.ts` (both run against the real local-SQLite `@libsql/client` adapter, the same driver shape as production Turso, not mocked):
1. PUT on a nonexistent card id → 404 (WR-01).
2. PUT with a `front` that collides with another card's `normalizedFront` → 400 "already exists", and the target card's front is confirmed unchanged (proving the whole interactive transaction rolled back cleanly, and — critically — proving `isUniqueConstraintError` genuinely keeps the friendly-400 working under the new interactive-transaction form rather than regressing to a raw 500).

Both new tests pass; the full existing 7-test suite in that file (sentence upsert/create/delete/IDOR coverage) also still passes unmodified, confirming the transaction-form change didn't alter any of the already-verified sentence-mutation behavior.

### WR-04: FreshnessWatcher's `/cards` backstop doesn't relocate a card across type-group buckets on an external type change

**Files modified:** `components/CardsClient.tsx`
**Commit:** `def5b9e`
**Applied fix:** In the backstop merge loop, before patching a refreshed card into its new type's bucket, the merge now also searches every *other* group bucket for a stale row with that card's id and removes it if found — closing the "wrong-type row lingers forever" gap, while still respecting the existing "never authoritative for what else exists" rule (removal only, never an insertion into a bucket that wasn't already loaded).

### WR-05: The Cards list "Example sentences" preview is effectively dead code post-CARDS-01

**Files modified:** `components/CardsClient.tsx`
**Commit:** `4cd2779`
**Applied fix:** Chose option (a) from the review's two suggested fixes — removed the per-row sentence preview block from `renderCardRow` entirely, replacing it with a comment explaining why (it only ever rendered for the one card just edited in the current session, which was confusing/inconsistent UI). The "N sentences" count badge (unaffected — sourced from the always-present `sentenceCount` field) remains the list's source of truth for sentence presence; full sentence text stays available via Edit or the Reading Practice tab. Confirmed no e2e spec asserted on the removed preview's rendered content.

### WR-06: `handleDelete` closes with zero user-visible feedback on failure

**Files modified:** `components/CardsClient.tsx`
**Commit:** `bae8c85`
**Applied fix:** Added a dedicated `deleteError` state (kept separate from the existing `queryError` banner, since a delete failure's "try again" semantics differ from a search failure's) and a new `COPY.deleteError` string. `handleDelete`'s both failure branches (`!res.ok` and the network-error catch) now set this state; a dismissible red banner renders in the Cards view when it's set.

## Test coverage added (beyond the literal review findings)

Per the task instructions, since CR-02's fix needed genuine behavioral proof and the existing fixture/spec structurally couldn't provide it:

- **`e2e/cards-edit-regression.spec.ts`** (commit `1e1599c`): added a new test, `'adding a Grammar card into a never-fetched-this-session bucket does not hide a real pre-existing Grammar card (CR-02)'`. It builds the actual bug precondition purely through the real UI (no changes to `e2e/seed.ts`'s shared D-13 baseline fixture, so no other spec's card-count assertions are affected): adds one Grammar card, does a full `page.reload()` (which resets all client-side `groups` state back to the initial never-fetched `EMPTY_GROUP_STATE` while the server now genuinely holds 1 real Grammar card), then adds a second Grammar card — the exact CR-02 precondition (`loaded.length === 0` at insert time, with a real card already behind that empty bucket) — and asserts both cards are visible afterward.
  - **Verified RED against pre-fix code:** temporarily short-circuited the new guard in `handleAdd` (`if (false && ...)`) and re-ran just this test — it failed exactly as expected, with the debug dump showing only the second card in the DOM and the first (`첫번째문법`) genuinely absent, reproducing the reported bug byte-for-byte.
  - **Verified GREEN after restoring the real fix** — re-ran and confirmed pass.
  - Also updated a now-stale comment in the pre-existing test in the same file (it described the pre-fix phantom-insert behavior as the intended/correct outcome — the review called this out explicitly).
- **`tests/cards-id-route.test.ts`** (part of commit `7478566`): two new unit tests covering WR-01 (PUT 404) and WR-03 (P2002 friendly-400 survives the interactive-transaction conversion), both against the real local-SQLite libsql adapter as described above.

## Skipped Issues

None — all 8 in-scope findings (CR-01, CR-02, WR-01–WR-06) were fixed and verified.

## Regression battery results

Run inside the isolated fix worktree (`/tmp/sv-31-reviewfix-*`, same repo checkout, no source drift from `main` beyond this fix pass's own commits), after all 9 fix/test commits landed:

| Check | Result |
|---|---|
| `npm test` (Vitest) | **310/310 passed** (27 files), including 2 new tests in `tests/cards-id-route.test.ts` |
| `npm run lint` | **0 errors**, 1 pre-existing warning in `components/StudySession.tsx` (untouched by this fix pass, unrelated to any finding) |
| `npx playwright test e2e/cards-edit-regression.spec.ts e2e/cards-search-clear.spec.ts e2e/cards-sticky-header.spec.ts e2e/cards-tab-switch-scroll.spec.ts e2e/perf.spec.ts e2e/smoke.spec.ts --project=chromium` | **17/17 passed**, including the new CR-02 phantom-population test |

Each individual fix was additionally verified per-commit via: Tier 1 (re-read modified region), Tier 2 (`npx tsc --noEmit -p tsconfig.json`, scoped to the touched file — zero errors introduced) and `npx eslint <file>` (zero errors/warnings introduced), before being committed.

## Notes on scope adaptation

- **WR-03** deliberately deviates from the review's literal "use `prisma.$transaction(async (tx) => {...})`" suggestion by additionally reusing `lib/db-errors.ts`'s `isUniqueConstraintError` — this codebase has prior, documented history (a real production bug, `.planning/debug/reviewlog-p2002-catch-never-fires.md`) of exactly this transaction-form change silently breaking P2002 classification with this Prisma/adapter combination. The adapted fix delivers the same race-closing behavior the review asked for without reintroducing that known regression, and this is now proven (not just asserted) by a dedicated new unit test run against the real adapter.
- **WR-05** picked the review's option (a) (delete the dead block) over option (b) (keep-but-gate) as the lower-risk, simpler resolution; no functionality was lost since the sentence-count badge and full-sentence views (Edit, Reading Practice) remain available.
- All other findings (CR-01, CR-02, WR-01, WR-02, WR-04, WR-06) were applied close to the review's literal suggested fix, adapted only for exact variable/line-number drift from the reviewed snapshot.

---

_Fixed: 2026-08-08T06:15:16Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
