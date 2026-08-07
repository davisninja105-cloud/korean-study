---
phase: 31-cards-list-pagination-virtualization
reviewed: 2026-08-07T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/cards/route.ts
  - app/api/cards/sentences/route.ts
  - app/cards/page.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/Nav.tsx
  - e2e/cards-sticky-header.spec.ts
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
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-07
**Depth:** standard
**Files Reviewed:** 17 (some files listed above, e.g. `package.json`/`package-lock.json`, contain no reviewable behavior and were inspected for supply-chain/version-drift only)
**Status:** issues_found

## Summary

This is a full, independent re-review of the entire current file list for this phase,
including `components/Nav.tsx` and `e2e/cards-sticky-header.spec.ts` (new/changed in
gap-closure plan 31-05, fixing the G-31-2 mobile sticky-header bug). A prior review pass
on the earlier subset of this file list (31-01 through 31-04) found one Critical
(`CR-01`, clearing the search box left `groupCounts` permanently stale) and four Warnings
(`WR-01`–`WR-04`); I verified all five are genuinely fixed in the current code
(`wasSearchActiveRef`/`searchJustCleared` guards the search→grouped transition;
`lessonFrom`/`lessonTo` now go through `INTEGER_RE` validation in both new routes; `POST
/api/cards` now has full `try/catch` + field validation; the PUT/sentence-replace path is
now a single `$transaction`; `CardEditorShape.sentences` and `handleSave`'s merge now
reconstruct the full `SentenceDTO` shape explicitly). I also found a dedicated regression
test, `e2e/cards-search-clear.spec.ts` (not in this phase's file list but present in the
repo), closing the previously-flagged test gap for that fix — so none of the prior
findings are repeated below.

Independently re-reading everything fresh, I found no new Critical/Blocker-level defect.
Three new Warnings: (1) `Nav.tsx`'s `--nav-height` CSS custom property — which
`CardsClient.tsx`'s newly-added sticky bar depends on for correct positioning beneath the
top header — is only set by a post-hydration `useLayoutEffect`, unlike this same
codebase's own `--sab` value, which is deliberately set by a pre-paint inline `<script>`
specifically to avoid this class of first-paint flash; (2) the `PUT`/`POST` `/api/cards`
sentence-shape validation checks each array element is a non-null object but never checks
that `korean`/`targetForm`/`translation` are strings, so a request with e.g. `korean: 123`
passes validation and then throws an uncaught `PrismaClientValidationError` inside the
route, surfacing as a generic 500 instead of the clean 400 the rest of this validation is
designed to produce; (3) `CardsClient.tsx`'s `handleSave` optimistic merge never updates
`normalizedFront`/`updatedAt` on the locally-patched card, so after editing a card's
`front` the in-memory row's `normalizedFront` silently keeps stale pre-edit data until the
next full refresh. Three Info-level items round out the findings (an incomplete DTO type,
a documented-but-real search-scope inconsistency between the Cards and Reading Practice
tabs, and an unvalidated `type` query param).

## Warnings

### WR-01: `--nav-height` is only set after client hydration, unlike this codebase's own pre-paint precedent for the identical problem

**File:** `components/Nav.tsx:29-43`, `components/CardsClient.tsx:1295-1298`

**Issue:** `CardsClient.tsx`'s sticky search/filter/view-toggle bar (added by this phase to
fix G-31-2) is positioned via:

```tsx
<div
  className="sticky z-10 -mx-4 px-4 pt-3 pb-3 bg-background border-b border-border/60 flex flex-col gap-3"
  style={{ top: 'var(--nav-height, 68px)' }}
>
```

`--nav-height` is published by `Nav.tsx` exclusively from a `useLayoutEffect`:

```tsx
useLayoutEffect(() => {
  const node = headerRef.current
  if (!node) return
  const setNavHeight = () => {
    document.documentElement.style.setProperty('--nav-height', `${node.offsetHeight}px`)
  }
  setNavHeight()
  const ro = new ResizeObserver(setNavHeight)
  ro.observe(node)
  return () => ro.disconnect()
}, [])
```

This only runs once React has hydrated on the client. The initial server-rendered HTML the
browser paints first has no `--nav-height` set at all, so the sticky bar renders at the
`68px` fallback until hydration completes and the effect fires — if the real header height
differs from `68px` (e.g. a device with a non-zero `env(safe-area-inset-top)`, a longer
locale string, or a different font-metrics fallback before the self-hosted Pretendard
Variable font finishes loading), the sticky bar visibly snaps to its correct position
after hydration rather than being correctly positioned from first paint. This is exactly
the class of bug `app/layout.tsx`'s own `--sab` value already guards against with a
pre-paint inline `<script>` (`document.documentElement.style.setProperty('--sab', sab ||
'0px')`, run before React ever mounts) — the codebase has an established pattern for this
exact problem that `--nav-height` doesn't follow.

**Fix:** Either (a) hardcode a `top` value in CSS that matches the header's actual
worst-case rendered height instead of relying on JS at all (the header's contents are
static enough that this may be feasible), or (b) mirror the `--sab` pattern: measure/set
`--nav-height` from a pre-paint inline `<script>` in `app/layout.tsx` using
`getBoundingClientRect()`/a known fixed header structure, and keep `Nav.tsx`'s
`ResizeObserver` only for post-mount corrections (orientation change, font swap), not as
the sole source of the initial value.

### WR-02: Sentence field types (`korean`/`targetForm`/`translation`) are never validated before reaching Prisma

**File:** `app/api/cards/[id]/route.ts:91-97, 116-130`, `app/api/cards/route.ts:89-95, 104-115`

**Issue:** Both `PUT /api/cards/[id]` and `POST /api/cards` validate that `sentences` is
an array of non-null objects:

```ts
if (
  data.sentences !== undefined &&
  (!Array.isArray(data.sentences) ||
    data.sentences.some((s: unknown) => typeof s !== 'object' || s === null))
) {
  return NextResponse.json({ error: 'sentences must be an array of objects' }, { status: 400 })
}
```

but never check the *type* of each object's `korean`/`targetForm`/`translation` fields —
they're written straight through with only a nullish fallback:

```ts
korean: s.korean ?? '',
targetForm: s.targetForm ?? '',
translation: s.translation ?? '',
```

A request body like `{"sentences":[{"korean":123,"targetForm":null,"translation":{}}]}`
passes the "array of objects" check (each element is a non-null object) and reaches
`prisma.sentence.create()`/the transaction with a non-string `korean` value. Prisma Client
throws a `PrismaClientValidationError` for the type mismatch — which is **not** a
`Prisma.PrismaClientKnownRequestError`, so it isn't caught by either route's existing
`P2002` special-case — falling through to the generic `catch` and a 500 ("Failed to update
card" / "Failed to create card") instead of the clean 400 this validation block is
otherwise designed to produce for exactly this class of malformed input.

**Fix:** Extend the existing shape check to also validate field types, mirroring the
`front`/`back` string checks already present elsewhere in the same handlers:

```ts
data.sentences.some((s: unknown) =>
  typeof s !== 'object' || s === null ||
  ('korean' in s && typeof (s as Record<string, unknown>).korean !== 'string') ||
  ('targetForm' in s && typeof (s as Record<string, unknown>).targetForm !== 'string') ||
  ('translation' in s && typeof (s as Record<string, unknown>).translation !== 'string')
)
```

### WR-03: `handleSave`'s optimistic merge leaves `normalizedFront`/`updatedAt` stale on the locally-patched card

**File:** `components/CardsClient.tsx:892-908`

**Issue:** After a successful `PUT /api/cards/[id]`, `handleSave` patches the matching
in-memory `CardDTO` in `groups`/`searchResults`/`readingPractice` via:

```tsx
const merge = (c: CardDTO): CardDTO => ({
  ...c,
  type: updated.type,
  front: updated.front,
  back: updated.back,
  notes: updated.notes ?? null,
  sentences: (updated.sentences ?? []).map((s, i) => ({ ... })),
})
```

`...c` spreads the **pre-edit** card as the base, and only `type`/`front`/`back`/`notes`/
`sentences` are overwritten. `normalizedFront` (computed server-side from the new `front`
via `normalizeFront()`) and `updatedAt` are never touched, so they keep their pre-edit
values in every client-held copy of this card (`grep -n "normalizedFront"
components/CardsClient.tsx` returns zero matches — it is genuinely never referenced or
reconciled anywhere in this file). This is currently invisible in the UI (nothing renders
`normalizedFront`/`updatedAt` on a card row), but it is a real, silent violation of the
`CardDTO` contract that will resurface the moment any future feature reads either field
from client state (e.g. a client-side "is this front already taken?" duplicate check, or
a "recently edited" sort) — the exact same class of latent-but-real bug the already-fixed
`WR-04` in the prior review addressed for the `sentences` sub-shape.

**Fix:** Either have the PUT response and `merge()` explicitly carry `normalizedFront`
through (`CardEditorShape` doesn't declare it today, but the wire response does), or
recompute it client-side consistently with the server (`normalizeFront(updated.front)`,
using the same `lib/card-key.ts` helper already imported by the API routes), and set
`updatedAt: new Date().toISOString()` (read in the event handler, not render — purity-safe
here, same as the existing `sentences` fallback on the very next lines).

## Info

### IN-01: `CardsPageDTO` still doesn't declare the `groupCounts` field it actually carries on page-1 responses

**File:** `lib/dto.ts:74-78`, `components/FreshnessWatcher.tsx:115-123`

**Issue:** `GET /api/cards` attaches `groupCounts` to the JSON body whenever no cursor is
supplied (`app/api/cards/route.ts:53-56`), but the exported `CardsPageDTO` type has no
`groupCounts` field. `CardsClient.tsx` works around this locally with its own
`CardsPageResponse = CardsPageDTO & { groupCounts?: GroupCountsDTO }`, but
`FreshnessWatcher.tsx` still casts the raw backstop JSON directly to the incomplete type:

```ts
const page = result as CardsPageDTO | null
```

Still harmless today (nothing in `FreshnessWatcher` reads `page.groupCounts`), but the
exported type remains misleading about the real wire shape.

**Fix:** Move `CardsPageResponse` into `lib/dto.ts` as the canonical type (e.g.
`groupCounts?: GroupCountsDTO` added directly to `CardsPageDTO`), used by both consumers.

### IN-02: Reading Practice's search scope still silently diverges from the Cards tab's search scope

**File:** `lib/cards-list.ts:195-214` (`getSentencesPage`)

**Issue:** `getCardsPage`'s search matches `front`, `back`, `notes`, and sentence
`korean`/`translation`. `getSentencesPage`'s search matches only the sentence's own
`korean`/`translation`, not the parent card's `front`/`back`/`notes`. This remains
documented as intentional in the code's own comment, but the same shared search box can
still show card X in the Cards tab (matched via `front`) while showing zero of card X's
sentences in Reading Practice (no sentence-text match) — a real, reproducible UX
inconsistency worth confirming is still the intended product decision.

**Fix:** No code change needed if intentional; otherwise extend `getSentencesPage`'s
`where.OR` to also match through `card: { OR: [{ front: {...} }, { back: {...} }, ...] }`.

### IN-03: `type` query param on `GET /api/cards` has no allow-list validation

**File:** `app/api/cards/route.ts:22`, `lib/cards-list.ts:80-84`

**Issue:** `type` is read straight from the query string with a default of `'all'` and no
validation against the known set (`'all' | 'vocabulary' | 'grammar' | 'phrase' |
'other'`) — contrast with `POST /api/cards`'s body, which explicitly 400s on an
unrecognized `type`. An unrecognized `GET` `type` value (e.g. `?type=foobar`) silently
falls into `buildCardsWhere`'s `where.type = params.type` branch and returns an empty
page rather than a clean 400, which can look like "the deck has zero cards of this type"
rather than "the request was malformed" — a minor client-debuggability gap, not a
functional bug (this is a purely-internal API called only by this app's own client with a
fixed set of type values today).

**Fix:** Validate `type` against `['all', 'vocabulary', 'grammar', 'phrase', 'other']` and
return 400 for anything else, mirroring `POST`'s existing enum check.

---

_Reviewed: 2026-08-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
