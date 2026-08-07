---
phase: 31-cards-list-pagination-virtualization
reviewed: 2026-08-07T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/cards/route.ts
  - app/api/cards/sentences/route.ts
  - app/cards/page.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - e2e/freshness-fresh-paths.spec.ts
  - e2e/perf.spec.ts
  - lib/cards-list.ts
  - lib/dto.ts
  - lib/useDebouncedValue.ts
  - package-lock.json
  - package.json
  - tests/cards-id-route.test.ts
  - tests/cards-list.test.ts
  - tests/use-debounced-value.test.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-07
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase migrates the Cards list from an unbounded `findMany()` to cursor-paginated,
per-type-group fetching with `react-virtuoso` virtualization, adds an independent
Reading Practice sentence stream, and updates `FreshnessWatcher`'s `/cards` backstop to
the new paginated payload shape. The server-side pagination primitives
(`lib/cards-list.ts`) are well-tested and correct — the cursor/`hasMore` boundary logic,
`where`-clause composition, and the `CARDS-01` sentence-free list contract all check out
against their unit tests.

The main defect is in `components/CardsClient.tsx`'s query-runner: clearing the search
box does not restore the deck-wide `groupCounts` after a search transiently narrowed
them, because the "did anything actually change" skip-check that gates the grouped-mode
refetch only tracks `{filter, lessonFrom, lessonTo}`, never whether a search was active.
This is a reliably reproducible, user-visible correctness bug in a feature this very
phase introduces (server-side search), with no test (unit or e2e) covering the
search-then-clear path that would have caught it.

Secondary issues: the new `GET /api/cards` and `GET /api/cards/sentences` routes accept
malformed `lessonFrom`/`lessonTo` values that a sibling route (`/api/cards/due`)
explicitly guards against, degrading to a generic 500 instead of a clean 400; the
pre-existing `POST /api/cards` handler (left untouched by this phase, but inside a file
this phase otherwise substantially rewrote) still has no `try/catch` or field validation,
inconsistent with every other route in this codebase and with this project's documented
error-handling convention; and edits/deletes made from the Cards tab don't propagate
into an already-loaded Reading Practice tab, so stale/orphaned sentence rows can persist
within a session.

## Critical Issues

### CR-01: Clearing the search box leaves group counts permanently stale

**File:** `components/CardsClient.tsx:685-770` (see especially lines 693-727 and 729-739)

**Issue:** The single query-runner `runQuery()` branches on `searchActive`. The search
branch (lines 697-727) fetches a search-scoped page and, when the response carries
`groupCounts`, overwrites the shared `groupCounts` state with the **search+lesson-range
scoped** counts:

```tsx
.then((page) => {
  if (searchSeqRef.current !== seq) return
  setSearchResults({ ... })
  if (page.groupCounts) setGroupCounts(page.groupCounts)   // scoped to the search term
})
```

The grouped-mode branch (lines 729-770) is guarded by an "unchanged" skip that compares
only `{filter, lessonFrom, lessonTo}` against `lastGroupedParamsRef`:

```tsx
const params = { filter, lessonFrom, lessonTo }
const last = lastGroupedParamsRef.current
const unchanged =
  !opts?.force &&
  !!last &&
  last.filter === params.filter &&
  last.lessonFrom === params.lessonFrom &&
  last.lessonTo === params.lessonTo
if (unchanged) return
lastGroupedParamsRef.current = params
```

`lastGroupedParamsRef` is **never updated by the search branch** — only by this
grouped-mode branch. So the reproduction is: (1) load `/cards` with the default filter
(all types, full lesson span); (2) type a search term — `groupCounts` is now
search-scoped (e.g. "Cards (3)" instead of "Cards (200)", and each group header shows
the search-narrowed count); (3) clear the search box. `debouncedSearch` becomes `''`,
`searchActive` becomes `false`, the effect re-fires `runQuery()`, it takes the
grouped-mode branch, computes `unchanged = true` (because `filter`/`lessonFrom`/
`lessonTo` never changed across steps 1–3), and returns immediately **without
refetching `groupCounts`**. The tab label ("Cards (N)") and every group header's card
count stay wrong — stuck at the search-narrowed numbers — until the user changes the
type filter or lesson range (which busts the `unchanged` check) or fully reloads the
page. The `groups` state itself (the actual loaded card rows) is unaffected since the
search branch never touches it — only the counts are wrong, but they are wrong in the
single most common interaction with this new feature (type something, then delete it).

No test (unit or e2e) exercises this path — `tests/cards-list.test.ts` only covers
`lib/cards-list.ts`'s server-side functions, and none of the e2e specs assert on group
counts after a search is cleared.

**Fix:** Track whether the previous `runQuery()` invocation was a search, and force a
grouped refetch (or at minimum a `groupCounts`-only refetch) on the search→non-search
transition, e.g.:

```tsx
const wasSearchActiveRef = useRef(false)

const runQuery = (opts?: { force?: boolean }) => {
  const searchJustCleared = wasSearchActiveRef.current && !searchActive
  wasSearchActiveRef.current = searchActive
  ...
  // Grouped mode.
  const params = { filter, lessonFrom, lessonTo }
  const last = lastGroupedParamsRef.current
  const unchanged =
    !opts?.force &&
    !searchJustCleared &&
    !!last &&
    last.filter === params.filter &&
    ...
```

(and set `wasSearchActiveRef.current = true` in the search branch too). Alternatively,
always refetch `getCardsGroupCounts({ search: null, ... })` whenever `searchActive`
transitions to `false`, independent of the grouped-row skip-check.

## Warnings

### WR-01: `lessonFrom`/`lessonTo` are not validated before reaching Prisma

**File:** `app/api/cards/route.ts:19-27`, `app/api/cards/sentences/route.ts:15-23`

**Issue:** Both new routes do:

```ts
const lessonFrom = lessonFromRaw !== null ? Number(lessonFromRaw) : null
const lessonTo = lessonToRaw !== null ? Number(lessonToRaw) : null
```

with no `NaN`/range check. `Number('abc')` is `NaN`, which is `!== null`, so it flows
into `buildCardsWhere()`/`getSentencesPage()` as `{ gte: NaN }` (or `{ lte: NaN }`),
which Prisma will reject at the client-validation layer — surfacing as the route's
generic `catch` → `{ error: 'Failed to load cards' }` / `{ error: 'Failed to load
sentences' }`, HTTP 500, instead of a clean 400. The sibling route `GET
/api/cards/due` (same codebase, same kind of parameter) already solves this correctly
with a strict `INTEGER_RE` + explicit range validation returning 400 — these two new
routes don't follow that established pattern.

**Fix:** Mirror `/api/cards/due`'s validation:

```ts
const INTEGER_RE = /^[1-9]\d*$/
const lessonFrom = lessonFromRaw !== null
  ? (INTEGER_RE.test(lessonFromRaw) ? parseInt(lessonFromRaw, 10) : NaN)
  : null
// ... then return 400 if isNaN(lessonFrom) || isNaN(lessonTo) || lessonFrom > lessonTo
```

### WR-02: `POST /api/cards` has no error handling or input validation

**File:** `app/api/cards/route.ts:46-103`

**Issue:** Unlike `PUT`/`DELETE` in `app/api/cards/[id]/route.ts` (both wrapped in
`try/catch`, both validating field shapes, both mapping Prisma `P2002` to a friendly
400), and unlike every other route handler in this codebase (per `.claude/CLAUDE.md`'s
documented "Error Handling → API Routes" convention: "All route handlers wrap their body
in `try { … } catch (e) { … }`"), `POST /api/cards` has:

- No `try/catch` at all — an unhandled `prisma.card.create()` rejection (e.g. a
  `normalizedFront` unique-constraint collision, or a non-string `front`/`sentences`
  entry causing `normalizeFront()` or the create call to throw) propagates as an
  unhandled framework-level 500 instead of a clean JSON error.
- No type validation for `type`, `notes`, or `sentences[].korean/targetForm/translation`
  — only an existence (truthy) check for `type`/`front`/`back`. A non-string `front`
  (e.g. a number) would throw inside `normalizeFront()`, uncaught.
- No enum check on `type` (PUT validates `['vocabulary','grammar','phrase']`; POST
  accepts any string).

This file was substantially rewritten by this phase (the `GET` handler), but `POST` was
left completely untouched — this is a pre-existing gap this phase had the opportunity to
close while already touching the file, but didn't.

**Fix:**

```ts
export async function POST(req: NextRequest) {
  try {
    const { type, front, back, notes, sentences } = await req.json()
    if (typeof front !== 'string' || front.trim() === '') {
      return NextResponse.json({ error: 'front must be a non-empty string' }, { status: 400 })
    }
    if (!['vocabulary', 'grammar', 'phrase'].includes(type)) {
      return NextResponse.json({ error: 'type must be vocabulary, grammar, or phrase' }, { status: 400 })
    }
    if (typeof back !== 'string' || back.trim() === '') {
      return NextResponse.json({ error: 'back must be a non-empty string' }, { status: 400 })
    }
    // ... create + dto as today ...
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'This front already exists' }, { status: 400 })
    }
    console.error('POST /api/cards failed:', e)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}
```

### WR-03: Editing or deleting a card doesn't update an already-loaded Reading Practice row

**File:** `components/CardsClient.tsx:816-871` (`handleDelete`, `handleSave`)

**Issue:** `handleSave` (852-871) merges the updated card into `groups` and
`searchResults` only. `handleDelete` (816-850) removes the card from `groups` and
`searchResults` only. Neither touches `readingPractice.loaded`
(`(SentenceDTO & { card: CardDTO })[]`). Since D-08's design deliberately keeps
`readingPractice` state alive across tab switches (never reset on remount), the
following session-local sequence produces stale UI:

1. Visit Reading Practice tab (loads sentences, including one for card X).
2. Switch to Cards tab, edit card X's sentence text via the Edit sheet and save — or
   delete card X entirely.
3. Switch back to Reading Practice — the row for card X still shows the **old** sentence
   text (edit case), or is a now-**orphaned** row referencing a deleted card (delete
   case). Tapping an orphaned row calls `openEdit(card.id)` → `GET /api/cards/${id}`
   404s, degrading to the (handled, non-crashing) `editingDetailError` state, but the
   stale row itself is never removed from the list.

**Fix:** In `handleSave`, also patch any matching row(s) in `readingPractice.loaded`
where `s.card.id === updated.id` (update `s.card` fields, and `s.korean`/`targetForm`/
`translation` if the edited sentence still exists at the same index). In `handleDelete`,
filter `readingPractice.loaded` by `s.card.id !== id` alongside the existing `groups`/
`searchResults` pruning.

### WR-04: `handleSave`'s merge silently produces malformed `SentenceDTO` entries

**File:** `components/CardsClient.tsx:29-36, 852-871`

**Issue:** `CardEditorShape.sentences` (the shape `CardEditor.onSave` hands back) only
carries `{ id, korean, targetForm, translation }` — it omits `cardId`, `orderIndex`,
`createdAt`, `updatedAt` that `SentenceDTO` requires. `handleSave`'s merge:

```tsx
const merge = (c: CardDTO) => ({ ...c, ...updated }) as CardDTO
```

spreads `updated` (including its incomplete `sentences` array) over the full `CardDTO`
`c`, and the `as CardDTO` cast suppresses the type error. The resulting in-memory card's
`sentences[i]` entries are missing four required `SentenceDTO` fields. Nothing in the
current render path happens to read those fields for cards rows, so this doesn't crash
today — but it's a real, silent type-contract violation on data that flows through the
rest of the app's `CardDTO` boundary (e.g. if a future feature sorts sentences by
`orderIndex`, or the Reading Practice merge fix in WR-03 above needs those fields, it
will get `undefined`).

**Fix:** Either extend `CardEditorShape.sentences` to carry the full `SentenceDTO`
fields (available now that `editingDetail` — the source of `card` passed to
`CardEditor` — is fetched from `GET /api/cards/[id]`, which returns complete sentence
rows), or have `handleSave` reconstruct `orderIndex`/`cardId` explicitly instead of
relying on an unchecked `as CardDTO` cast to paper over the gap.

## Info

### IN-01: `CardsPageDTO` doesn't declare the `groupCounts` field it actually carries on page 1

**File:** `lib/dto.ts:74-78`, `components/FreshnessWatcher.tsx:115-123`

**Issue:** `GET /api/cards` attaches `groupCounts` to the JSON body whenever no cursor
is supplied (`app/api/cards/route.ts:34-37`), but `CardsPageDTO` (the type `lib/dto.ts`
exports as the canonical shape of that response) has no `groupCounts` field —
`CardsClient.tsx` works around this locally with its own `CardsPageResponse = CardsPageDTO
& { groupCounts?: GroupCountsDTO }`, but `FreshnessWatcher.tsx` casts the same raw JSON
directly to `CardsPageDTO`:

```ts
const page = result as CardsPageDTO | null
```

This happens to be harmless today (nothing in `FreshnessWatcher` reads `page.groupCounts`),
but the type is misleading about the real wire shape and invites a future bug if someone
adds a `groupCounts`-consuming code path there and assumes the field doesn't exist on
this type.

**Fix:** Either move `CardsPageResponse` into `lib/dto.ts` as the canonical exported type
(e.g. rename/extend `CardsPageDTO` to include `groupCounts?: GroupCountsDTO`), or export
it as a separate `CardsPageWithCountsDTO` type used by both consumers.

### IN-02: Reading Practice search scope silently diverges from the Cards tab's search scope

**File:** `lib/cards-list.ts:183-203` (`getSentencesPage`)

**Issue:** `getCardsPage`'s search (`buildCardsWhere`) matches `front`, `back`, `notes`,
and sentence `korean`/`translation`. `getSentencesPage`'s search matches only the
sentence's own `korean`/`translation` — not the parent card's `front`/`back`/`notes`.
This is called out as intentional in the code's own comment, but it means the same
search term typed into the single shared search box can return card X in the Cards tab
(matched via `front`) while showing zero of card X's sentences in the Reading Practice
tab (no sentence text match) — a potentially confusing UX inconsistency worth a product
decision/documentation note, if not already made deliberately with users in mind.

**Fix:** No code change required if this is confirmed as intended; otherwise, extend
`getSentencesPage`'s `where.OR` to also match `card: { OR: [{ front: {...} }, ...] }`.

### IN-03: No test guards the search-clear → groupCounts-reset behavior

**File:** `tests/cards-list.test.ts`, `e2e/freshness-fresh-paths.spec.ts`

**Issue:** `tests/cards-list.test.ts` thoroughly covers `lib/cards-list.ts`'s pure
server-side functions, and the e2e freshness suite thoroughly covers SSR-refresh
freshness scenarios — but nothing in this phase's test additions exercises
`CardsClient.tsx`'s own stateful query-runner logic (the type/search/lesson-range
skip-check machinery is entirely untested), which is exactly where CR-01 lives. Given
the project convention of not unit-testing React components (no jsdom/@testing-library
installed; confirmed in `tests/use-debounced-value.test.ts`'s own header comment), this
gap should be closed with an e2e test (search → clear → assert header counts / tab
label match the pre-search values) rather than a new unit-testing pattern.

**Fix:** Add an e2e case alongside `e2e/freshness-fresh-paths.spec.ts` or a new spec:
type a search term, wait for results, clear it, and assert the "Cards (N)" label and a
group header's count both return to their pre-search values.

---

_Reviewed: 2026-08-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
