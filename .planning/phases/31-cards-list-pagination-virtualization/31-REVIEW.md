---
phase: 31-cards-list-pagination-virtualization
reviewed: 2026-08-07T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/cards/route.ts
  - app/api/cards/sentences/route.ts
  - app/cards/page.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/Nav.tsx
  - e2e/cards-search-clear.spec.ts
  - e2e/cards-sticky-header.spec.ts
  - e2e/cards-tab-switch-scroll.spec.ts
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
  critical: 3
  warning: 2
  info: 3
  total: 8
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-07
**Depth:** standard
**Files Reviewed:** 19 (of 20 listed; `package-lock.json` is a lockfile with no reviewable logic and was checked only for the `react-virtuoso` entry's presence/version)
**Status:** issues_found

## Summary

This is a fresh, complete re-review of all six plans in phase 31 (pagination, virtualization, D-07 Reading Practice, D-08 tab-state preservation, and the 31-06 gap-closure sentence-count signal), superseding the prior `31-REVIEW.md`/`31-REVIEW-FIX.md` pass. The server-side pagination layer (`lib/cards-list.ts`, the two API routes) is solid — cursor math, `hasMore` overfetch-by-one detection, and the shared `where`-builder are all correct and covered by real unit tests. `useDebouncedValue`/`Debouncer` is clean and well-tested.

The client (`components/CardsClient.tsx`) is where the real defects live. The core problem is that `handleSave`'s optimistic-merge logic, which patches already-loaded rows after a successful `PUT /api/cards/[id]`, makes three separate incorrect assumptions about what the PUT response looks like and how state must be reconciled — each one produces silently-wrong data shown to the user after a completely ordinary "edit a card" action, with no error surfaced. These are the three Critical findings below. A fourth defect sits in the PUT route itself (an API-contract inconsistency versus GET/POST). Two lower-severity robustness/duplication issues round out the report.

## Critical Issues

### CR-01: Editing a card's sentences never updates already-loaded Reading Practice rows (sentence IDs are regenerated server-side on every save)

**File:** `app/api/cards/[id]/route.ts:116-134` (root cause) and `components/CardsClient.tsx:928-945` (broken consumer)

**Issue:** `PUT /api/cards/[id]` replaces a card's sentences with `deleteMany` followed by `sentence.create()` for every entry, unconditionally, whenever the request body contains a `sentences` array:

```ts
// app/api/cards/[id]/route.ts
return [
  prisma.sentence.deleteMany({ where: { cardId: id } }),
  ...sentenceData.map((s) => prisma.sentence.create({ data: s })),
]
```

Every `Sentence.id` is freshly generated on every save — even for a sentence whose text the user never touched. `CardsClient.tsx`'s own top-of-file comment confirms `CardEditor`'s `handleSave` "unconditionally PUTs whatever `sentences` array it was seeded with", so this path runs on essentially every card edit that has sentences.

`handleSave`'s Reading Practice patch then tries to match by the *old* sentence id:

```ts
setReadingPractice((prev) => {
  if (!prev.loaded.some((s) => s.card.id === updated.id)) return prev
  const updatedSentencesById = new Map((updated.sentences ?? []).map((s) => [s.id, s]))
  return {
    ...prev,
    loaded: prev.loaded.map((row) => {
      if (row.card.id !== updated.id) return row
      const matched = updatedSentencesById.get(row.id)   // row.id is the OLD sentence id
      return {
        ...row,
        card: merge(row.card),
        ...(matched ? { korean: matched.korean, targetForm: matched.targetForm, translation: matched.translation } : {}),
      }
    }),
  }
})
```

Because the PUT response's sentences all carry *new* ids, `updatedSentencesById.get(row.id)` is always `undefined` — `matched` never resolves, so the sentence text patch (`korean`/`targetForm`/`translation`) is a permanent no-op. The parent `card` fields (front/back/type/notes) *do* get patched via `merge(row.card)`, but the sentence text visible in an already-loaded Reading Practice row stays stale indefinitely (until a full reload or a fresh `/api/cards/sentences` fetch). The WR-03 comment directly above this code explicitly claims this id-based matching works "since sentences may be reordered/added/removed in the editor" — it does not, because the ids themselves are never stable across a save.

**Fix:** Make sentence ids stable across an edit — e.g. have the PUT handler upsert by id for entries the client echoes back (only inserting new rows / deleting removed ones), instead of blanket delete+recreate:

```ts
// app/api/cards/[id]/route.ts — replace the delete-all+create-all block
const existing = await prisma.sentence.findMany({ where: { cardId: id }, select: { id: true } })
const existingIds = new Set(existing.map((s) => s.id))
const incoming = data.sentences as { id?: string; korean: string; targetForm: string; translation: string }[]
const keepIds = new Set(incoming.filter((s) => s.id && existingIds.has(s.id)).map((s) => s.id!))

const sentenceOps = [
  prisma.sentence.deleteMany({ where: { cardId: id, id: { notIn: [...keepIds] } } }),
  ...incoming.map((s, i) =>
    s.id && existingIds.has(s.id)
      ? prisma.sentence.update({
          where: { id: s.id },
          data: { korean: s.korean ?? '', targetForm: s.targetForm ?? '', translation: s.translation ?? '', orderIndex: i },
        })
      : prisma.sentence.create({
          data: { korean: s.korean ?? '', targetForm: s.targetForm ?? '', translation: s.translation ?? '', cardId: id, orderIndex: i },
        })
  ),
]
```
(Requires `CardEditor` to round-trip each sentence's existing `id` in its save payload, which the loaded `SentenceDTO` already carries.) Until this is fixed, `handleSave`'s Reading Practice patch should fall back to a full re-fetch of that card's sentence rows rather than a silent no-op merge.

### CR-02: Editing a card's type does not relocate it between type-group buckets or update `groupCounts`

**File:** `components/CardsClient.tsx:892-917`

**Issue:** `handleSave`'s `merge()` writes the new `type` onto the card object, but the enclosing `setGroups` update replaces the card **in place, inside whichever `GROUP_KEYS` bucket it was already found in** — it never removes it from the old bucket or inserts it into the new one:

```ts
setGroups((prev) => {
  const next = { ...prev }
  for (const key of GROUP_KEYS) {
    if (next[key].loaded.some((c) => c.id === updated.id)) {
      next[key] = { ...next[key], loaded: next[key].loaded.map((c) => (c.id === updated.id ? merge(c) : c)) }
    }
  }
  return next
})
```

Nor does `handleSave` call `bumpGroupCount` anywhere. Contrast with `handleAdd` (line ~961-969), which correctly resolves `groupKeyForType(created.type)` and calls `bumpGroupCount(created.type, 1)`.

Reproduction: open a `vocabulary` card in the Edit sheet, change its type to `grammar`, save. The card keeps rendering under the "Vocabulary" section header (with a now-mismatched `grammar`-colored badge from `typeBadgeClass(card.type)`), the "Vocabulary N cards" header count is unchanged, and the "Grammar N cards" header count is also unchanged even though the card conceptually left/joined those groups. This persists until a full page reload or a `FreshnessWatcher` boundary refresh re-syncs state from the server.

**Fix:**
```ts
const handleSave = (updated: CardEditorShape) => {
  const merge = (c: CardDTO): CardDTO => ({ ...c, /* ...same as today... */ })
  const oldKeyEntry = GROUP_KEYS
    .map((key) => ({ key, card: groups[key].loaded.find((c) => c.id === updated.id) }))
    .find((e) => e.card)
  const newKey = groupKeyForType(updated.type)

  setGroups((prev) => {
    const next = { ...prev }
    for (const key of GROUP_KEYS) {
      next[key] = { ...next[key], loaded: next[key].loaded.filter((c) => c.id !== updated.id) }
    }
    if (oldKeyEntry?.card) {
      const mergedCard = merge(oldKeyEntry.card)
      next[newKey] = { ...next[newKey], loaded: [mergedCard, ...next[newKey].loaded] }
    }
    return next
  })
  if (oldKeyEntry && oldKeyEntry.key !== newKey) {
    bumpGroupCount(oldKeyEntry.card!.type, -1)
    bumpGroupCount(updated.type, 1)
  }
  // ...rest unchanged (searchResults / readingPractice / closeEdit)
}
```

### CR-03: Editing a card's sentences (add/remove) does not refresh the cached `sentenceCount` used by the "N sentences" badge

**File:** `components/CardsClient.tsx:892-908` (`merge`) and `1105-1106` (`renderCardRow`)

**Issue:** `renderCardRow` reads the displayed sentence count via:

```ts
const sentenceCount = card.sentenceCount ?? card.sentences.length
```

`sentenceCount` is a nullish-coalescing fallback — it is only bypassed when `sentenceCount` is `null`/`undefined`. But `handleSave`'s `merge()` spreads the pre-edit card (`...c`) and never re-derives `sentenceCount`:

```ts
const merge = (c: CardDTO): CardDTO => ({
  ...c,                    // stale sentenceCount carried forward unchanged
  type: updated.type,
  front: updated.front,
  back: updated.back,
  notes: updated.notes ?? null,
  sentences: (updated.sentences ?? []).map((s, i) => ({ ... })),  // fresh, correct array
})
```

Since `c.sentenceCount` is a defined number (not null/undefined) from the original list fetch, it always wins over the freshly-correct `sentences.length`. Reproduction: open a card that shows "2 sentences", add a third sentence in the editor, save. The row still displays "2 sentences" (the cached, pre-edit count) even though `card.sentences.length` is now genuinely 3, until a full reload.

**Fix:**
```ts
const merge = (c: CardDTO): CardDTO => ({
  ...c,
  type: updated.type,
  front: updated.front,
  back: updated.back,
  notes: updated.notes ?? null,
  sentences: (updated.sentences ?? []).map((s, i) => ({ ... })),
  sentenceCount: (updated.sentences ?? []).length,
})
```

## Warnings

### WR-01: `PUT /api/cards/[id]`'s success response omits `lesson`, unlike GET and POST — violates the CardDTO contract

**File:** `app/api/cards/[id]/route.ts:136-142`

**Issue:** GET (line 25-29) and POST (`app/api/cards/route.ts:118-122`) both `include: { ..., lesson: { select: { title, createdAt, orderIndex } }, ... }` and hand-build an ISO-serialized DTO. The PUT handler's final re-fetch omits `lesson` entirely from its `include`:

```ts
const card = await prisma.card.findUniqueOrThrow({
  where: { id },
  include: { review: true, sentences: sentencesInclude },   // no `lesson`
})
return NextResponse.json(card)
```

`CardDTO.lesson` is typed as a required (non-optional) `LessonRefDTO | null` field, but this response's JSON body has no `lesson` key at all (not even `null` — Prisma simply omits an un-included relation, and `JSON.stringify` drops `undefined` properties). The current client code happens not to break because `CardEditorShape` (what `handleSave` actually types the response as) never reads `.lesson`, but any other/future consumer of this endpoint that trusts the documented `CardDTO` shape (e.g. TypeScript code doing `response.lesson.orderIndex`) would get a runtime `undefined` crash instead of the `null` the type promises. This also silently skips the manual `.toISOString()` DTO-construction pattern GET/POST both use (works today only because `JSON.stringify` happens to auto-serialize native `Date` via `toJSON()`, which is incidental, not defensive).

**Fix:**
```ts
const card = await prisma.card.findUniqueOrThrow({
  where: { id },
  include: {
    review: true,
    lesson: { select: { title: true, createdAt: true, orderIndex: true } },
    sentences: sentencesInclude,
  },
})
const dto = {
  ...card,
  createdAt: card.createdAt.toISOString(),
  updatedAt: card.updatedAt.toISOString(),
  lesson: card.lesson ? { ...card.lesson, createdAt: card.lesson.createdAt.toISOString() } : null,
  review: card.review ? { ...card.review, nextReview: card.review.nextReview.toISOString(), lastReview: card.review.lastReview?.toISOString() ?? null } : null,
  sentences: card.sentences.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })),
}
return NextResponse.json(dto)
```

### WR-02: Auto-load-on-scroll retries a persistently-failing batch without checking the section's own error state

**File:** `components/CardsClient.tsx:559-563` (`fetchGroupNextPage`), `674-677` (`fetchReadingPracticeNextPage`), `1043-1063` (`handleRangeChanged`), `1088-1095` (`handleReadingRangeChanged`)

**Issue:** None of these guard conditions check the section's `error` flag:

```ts
const fetchGroupNextPage = (key: GroupKey) => {
  const g = groups[key]
  if (!g || g.loading || !g.hasMore) return   // no `|| g.error` check
  fetchGroupPage(key, g.nextCursor, 'append')
}
```
```ts
const fetchReadingPracticeNextPage = () => {
  if (readingPractice.loading || !readingPractice.hasMore) return   // no `|| readingPractice.error` check
  fetchReadingPracticePage(readingPractice.nextCursor, 'append')
}
```

After a scroll-triggered batch fetch fails, `loading` resets to `false` but `hasMore`/`error` are left as-is (`error` set, `hasMore` still `true` from before the failed attempt). Any further `rangeChanged` event that lands near the same boundary (e.g. the user keeps scrolling, or the list re-measures) will silently re-issue the same request, overwriting the "Try again" error UI with a fresh loading state and potentially failing again — with no backoff. This defeats the purpose of the explicit "Try again" retry affordance and can hammer a genuinely-down endpoint on every boundary-crossing scroll event.

**Fix:** Add the missing error guard to both auto-load gates, e.g.:
```ts
if (!g || g.loading || g.error || !g.hasMore) return
```
```ts
if (readingPractice.loading || readingPractice.error || !readingPractice.hasMore) return
```

## Info

### IN-01: Pagination clamp constants (`DEFAULT_TAKE`, `MAX_TAKE`, `INTEGER_RE`) are duplicated verbatim across two route files

**File:** `app/api/cards/route.ts:11-17` and `app/api/cards/sentences/route.ts:7-13`

**Issue:** The `DEFAULT_TAKE = 30`, `MAX_TAKE = 100`, `INTEGER_RE`, and the entire lesson-range-parsing + take-clamping block are copy-pasted identically between the two route files (and the `30` page-size value is duplicated a third and fourth time as `PAGE_SIZE` in `components/CardsClient.tsx:57` and `INITIAL_TAKE` in `app/cards/page.tsx:22`). A future change to the DoS clamp or the integer-validation regex in one file is easy to forget in the other three.

**Fix:** Extract a shared `lib/pagination.ts` (or similar) exporting `DEFAULT_TAKE`, `MAX_TAKE`, `INTEGER_RE`, and a `parseTakeParam(searchParams)` / `parseLessonRange(searchParams)` helper; import from all four call sites.

### IN-02: `sentencesInclude` constant duplicated identically in two API route files

**File:** `app/api/cards/[id]/route.ts:6` and `app/api/cards/route.ts:7`

**Issue:** `const sentencesInclude = { orderBy: { orderIndex: 'asc' } } as const` is defined independently in both files with no shared source.

**Fix:** Move to `lib/cards-list.ts` (which already owns the parallel `cardSelect` constant) and import it from both routes.

### IN-03: `GET /api/cards`'s `type` query param is not validated against the allowed enum

**File:** `app/api/cards/route.ts:22`

**Issue:** `const type = searchParams.get('type') ?? 'all'` is passed straight through to `getCardsPage`/`getCardsGroupCounts` with no validation, unlike `POST /api/cards` (lines 80-82) which explicitly checks `['vocabulary', 'grammar', 'phrase'].includes(type)` and `lessonFrom`/`lessonTo` on the same GET route which are strictly validated via `INTEGER_RE`. An arbitrary `type=foo` value silently produces a correct-but-unhelpful zero-row result (`where.type = 'foo'`) rather than a `400`, inconsistent with the validation posture used everywhere else in this same handler.

**Fix:** Validate against `['vocabulary', 'grammar', 'phrase', 'other', 'all']` and return 400 for anything else, mirroring the lesson-range validation already present in the same function.

---

_Reviewed: 2026-08-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
