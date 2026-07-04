---
phase: 16-components-filter-fix
reviewed: 2026-07-03T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - app/api/sync/route.ts
  - lib/extract-cards.ts
  - lib/filter-components.ts
  - scripts/dry-run-filter.mjs
  - scripts/local-resync.mts
  - scripts/retro-filter-cleanup.mts
  - tests/extract-cards.test.ts
  - tests/filter-components.test.ts
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-03T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

`lib/filter-components.ts` itself is correct, well-documented, and
well-tested in isolation — `tests/filter-components.test.ts` and the
`deckNormalizedFronts` cases in `tests/extract-cards.test.ts` accurately
describe its keep/drop contract. `scripts/dry-run-filter.mjs` and
`scripts/retro-filter-cleanup.mts` are read-only/dry-run-by-default and
operate over the **fully-persisted** deck, where every card that could
possibly be referenced already has a row and a `normalizedFront` — so
deck-lookup resolution is complete by construction for those two scripts.

The bug is in how the filter is *wired into the live write path*.
`app/api/sync/route.ts` fetches `existingNormalizedFronts` **once, before
extraction runs**, and `lib/extract-cards.ts` uses that frozen snapshot as
the deck set for `filterComponents()`. Because `MAX_LESSONS_PER_SYNC = 1`
and extraction is exhaustive, the overwhelmingly common case is a single
lesson introducing several brand-new cards that legitimately reference
*each other* — exactly the case this filter now silently discards, because
none of the current batch's own cards are in the deck set yet at filter
time. This directly undermines the "foundation-first" dependency graph that
is this project's stated Core Value, and — confirmed via `git diff` against
`diff_base` — is a regression introduced by this phase, not a pre-existing
condition. A second, independent bug in `app/api/sync/route.ts`'s
incremental `keyToId` maintenance re-introduces the "leaf-node cards aren't
resolvable as prerequisites" scoping bug that this same phase's `seedCards`
change explicitly set out to fix. Both are BLOCKERs below. Several
secondary robustness/consistency gaps in the same files are listed as
WARNINGs and INFO items.

## Critical Issues

### CR-01: Deck-lookup filter runs against a stale, pre-batch deck set — strips legitimate same-lesson forward-reference components before they're ever persisted

**File:** `lib/extract-cards.ts:169-174` (`deckSet` construction inside
`extractCardsFromNotes`, feeding `parseExtractionResponse`), consumed by
`app/api/sync/route.ts:52-63` and `scripts/local-resync.mts:56-78`

**Issue:** `extractCardsFromNotes()` builds `const deckSet = new
Set(existingNormalizedFronts)` and passes it straight into
`parseExtractionResponse(text, deckSet)`, which calls
`filterComponents(dedupedComponents, deckNormalizedFronts)` independently
per card. `existingNormalizedFronts` is fetched **once, before extraction
runs** (`app/api/sync/route.ts:52-54`), so it only ever contains cards that
existed in the DB *before this sync request started* — never any card
produced by the extraction call it's filtering.

Because this app processes exactly one lesson per sync request
(`MAX_LESSONS_PER_SYNC = 1`, `app/api/sync/route.ts:19`) and extraction is
exhaustive, the normal case is a single lesson introducing several
brand-new cards that legitimately reference each other, exactly matching
the prompt's own worked example (`lib/extract-cards.ts:123`: `card 학교 →
components: ["에", "가다"]`). If neither `학교` nor `가다` existed in the deck
before this sync, `filterComponents(["가다"], deckSet)` for the `학교` card
drops `"가다"` — even though `가다` is about to be created as a sibling card
moments later in the same request. By the time the card is persisted,
`card.components` no longer contains `"가다"` at all, so the two-phase
dependency-linking step in `route.ts` (comment at line 219: "Running after
the upserts means forward references within the same sync batch can be
resolved") never sees the reference — the data was stripped before that
step ever runs.

This is unrecoverable downstream: `scripts/local-resync.mts`'s final
relink pass and `scripts/retro-filter-cleanup.mts` both re-derive edges
from the **persisted** `components` column, which by then already lacks the
dropped entries. Neither script can detect or repair this class of loss.

**Fix:** Include the current extraction batch's own card fronts in the
resolution set before filtering each card's components:
```ts
// lib/extract-cards.ts — inside parseExtractionResponse, after validCards is computed
const validCards = parsed.filter(isValidExtractedCard)

// Same-lesson siblings aren't in the DB yet but ARE valid same-request
// prerequisite targets — union them into the resolution set before filtering.
const batchFronts = new Set(validCards.map((c) => normalizeFront(c.front ?? '')))
const effectiveDeckSet = new Set([...deckNormalizedFronts, ...batchFronts])

return validCards.map((c) => {
  // ...
  const components = filterComponents(dedupedComponents, effectiveDeckSet) // was deckNormalizedFronts
  // ...
})
```
Add a regression test asserting that a component referencing a sibling
card *in the same extraction response* survives filtering (neither card
pre-existing in the deck set).

---

### CR-02: `keyToId` incremental augmentation is gated behind `card.components.length > 0`, reintroducing the leaf-node scoping bug this phase's seed-query fix was meant to close

**File:** `app/api/sync/route.ts:171-174` (CREATE branch), `:205-208`
(UPDATE branch)

**Issue:** The design comment at `route.ts:76-80` states the lookup "must
cover the whole deck, not just cards that themselves carry components" —
and the **seed query** (`seedCards`, lines 83-87, `select: { id, normalizedFront
}` with no `WHERE components IS NOT NULL`) correctly implements that for
cards that existed before this request. But the **incremental** update as
each card is upserted during the *current* request only sets `keyToId` when
the card itself has components:
```ts
if (card.components.length > 0) {
  keyToId.set(nf, newCard.id)
  linkTargets.push({ id: newCard.id, components: card.components })
}
```
A brand-new card created in this lesson with **zero** components (a
leaf/prerequisite-only card — e.g. a plain noun with no dependencies) is
never added to `keyToId` during this request. If a sibling card in the same
lesson lists that leaf card as a component (assuming CR-01 above is fixed
so the reference even survives that far), `keyToId.get(normalizeFront(comp))`
still misses — the leaf card's own id was never inserted — so the edge
silently fails to be created (`if (!prereqId || ...) continue`). The card
only becomes resolvable as a prerequisite starting on the *next* sync
request, once it appears in `seedCards`.

This bug currently hides behind CR-01 (the sibling reference is usually
already stripped before this code path is reached), but fixing CR-01 alone
is not sufficient — the two bugs must both be fixed for same-lesson
leaf-node prerequisites to resolve correctly.

**Fix:** Unconditionally register every upserted card's id in `keyToId`;
keep the `linkTargets` push conditional (only cards with components need to
be edge *sources*):
```ts
if (!existing) {
  const newCard = await prisma.card.create({ /* ... */ })
  keyToId.set(nf, newCard.id)                 // always — mirrors seedCards' scope
  if (card.components.length > 0) {
    linkTargets.push({ id: newCard.id, components: card.components })
  }
  createdThisLesson++
} else {
  // ...
  await prisma.card.update({ /* ... */ })
  keyToId.set(nf, existing.id)                 // always (harmless — already seeded)
  if (card.components.length > 0) {
    linkTargets.push({ id: existing.id, components: card.components })
  }
}
```

## Warnings

### WR-01: Truncation-salvage logic assumes the last `},` is a top-level card boundary, but every card now contains a nested `sentences` array

**File:** `lib/extract-cards.ts:224-256` (both salvage branches,
`lastIndexOf('},')` at lines 227 and 246)

**Issue:** When Claude's streamed response is truncated, the salvage path
finds the last `},` in the raw text and slices+re-closes the array there,
assuming that `},` marks a top-level card-object boundary. Every real card
object now contains a nested `"sentences": [...]` array (per the SENTENCE
RULES section of the prompt, which requires 1–3 sentence objects per card).
If truncation happens mid-way through the second or later sentence of the
last (incomplete) card — a plausible truncation point given `max_tokens:
32000` on an exhaustive lesson — the last `},` in the text belongs to a
*nested sentence object*, not the card object. Slicing there and appending
`]` produces bracket-mismatched JSON; `JSON.parse` throws, salvage falls
through, and the function throws `'Failed to parse JSON response'` /
`'No JSON array found in response'` — losing every card from that lesson,
including ones that completed earlier in the stream, contrary to the
documented intent ("a dense/truncated lesson still yields the cards that
did complete").

`tests/extract-cards.test.ts`'s truncation test
(`'preserves the existing truncation-salvage logic…'`) only uses card
objects with **no** `sentences` field, so it doesn't exercise this shape and
gives false confidence that salvage works for the responses this prompt
actually produces.

**Fix:** Track bracket/brace nesting depth while scanning backward so only
a `},` at top-level array depth counts as a card boundary, and add a
truncation test using cards whose `sentences` array is truncated
mid-element.

### WR-02: `components` is unconditionally overwritten on the sync UPDATE path with no corresponding `CardDependency` pruning

**File:** `app/api/sync/route.ts:176-212`

**Issue:** Whenever an already-existing card is re-encountered during
exhaustive extraction (Claude sometimes re-emits already-known items
despite the prompt's dedup-hint list being advisory only), `updateData.components`
is set unconditionally to this round's components list — including
overwriting a previously-good, non-empty value with `null`/a shorter list
if this round returns fewer or filtered-out components (compounded by
CR-01 above). No code in the live sync route prunes `CardDependency` rows
when a card's components shrink or disappear on update — only the manual,
developer-run `scripts/retro-filter-cleanup.mts --apply` reconciles that.
A card can silently lose valid components data on a routine re-sync while
its now-stale edges linger until someone remembers to run the offline
cleanup script.

**Fix:** Only overwrite `components` when the new value is non-empty (or
merge/union with the existing value rather than replacing wholesale), and/or
prune the corresponding stale `CardDependency` rows inline when a
previously-linked component is legitimately no longer present.

### WR-03: Retro-cleanup script prunes existing edges for cards whose `components` JSON fails to parse, instead of leaving those edges untouched

**File:** `scripts/retro-filter-cleanup.mts:93-104` (malformed-JSON skip),
`:124-155` (Phase C edge reconciliation)

**Issue:** When a card's `components` string fails `JSON.parse` (lines
96-104), the script logs a warning and `continue`s — that card never gets
an entry in `cleanedByCardId`. Phase C then builds the `desired` edge set
exclusively from `cleanedByCardId` (line 134: `for (const [cardId, comps]
of cleanedByCardId)`), so **any pre-existing `CardDependency` row where this
card is the source (`cardId`) is absent from `desired` and gets scheduled
for pruning** (line 152-154) — even though the malformed JSON is an
unrelated data-integrity artifact, not evidence the card's real
prerequisite relationships are invalid. A script whose job is a safe,
reviewable retroactive cleanup should treat "can't parse, skip" as "leave
this card's edges alone," not "treat as zero components."

**Fix:** When a card's components JSON is malformed, also exclude its
outgoing edges from the prune candidate set (e.g. build a
`skipCardIds` set from `malformedCount` cases and filter `existingEdges`
by `!skipCardIds.has(e.cardId)` before computing `pruneIds`), so malformed
rows are reported but never silently mutate the edge graph.

### WR-04: `dry-run-filter.mjs`'s hand-copied `normalizeFront` diverges from `lib/card-key.ts`, contradicting its own "must mirror it exactly" comment

**File:** `scripts/dry-run-filter.mjs:44-56` vs `lib/card-key.ts:25-40`

**Issue:** The script's Hangul-detection regex (line 49) is
`/[가-힣ᄀ-ᇿ]/`, but the real `normalizeFront()` in `lib/card-key.ts:33` uses
`/[가-힣ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/` — three additional Unicode ranges (Hangul
Compatibility Jamo, Hangul Jamo Extended-A, Hangul Jamo Extended-B) are
missing from the copy. For any component whose trailing-paren content falls
only in one of those extended ranges, the script's copy would incorrectly
treat it as an English-only gloss and strip it, producing a different
`normalizeFront()` key than production and silently skewing the drop-rate
report this script exists to generate (the "Success Criterion 4 gate" that
was reviewed before wiring the filter into the live path, per the script's
own header comment).

**Fix:** Keep the regex byte-for-byte identical to `lib/card-key.ts` (copy
it verbatim on every change to that file), or better, transpile/import the
real implementation at runtime instead of hand-duplicating it.

### WR-05: Concurrent per-card upserts can turn one Claude-returned duplicate front into a whole-lesson failure

**File:** `app/api/sync/route.ts:132-214, 250-263`

**Issue:** `cards.map(async (card) => { ... })` inside `Promise.all` runs
every card in a lesson's upsert concurrently. Each iteration is a
non-atomic check-then-act: `findUnique` by `normalizedFront`, then `create`
if not found. If Claude's response ever contains two entries whose `front`
normalizes to the same key (the prompt says not to, but nothing enforces
it — the existing components/type validation added by this same phase
demonstrates the team already doesn't trust Claude's output to be
well-formed), both concurrent iterations can see `existing === null` before
either commits, and the second `create` throws on the `normalizedFront
@unique` constraint. That throw propagates out of `Promise.all` into the
lesson-level `catch (dbErr)` (line 250), which deletes the entire
newly-created `Lesson` row and reports the whole lesson as failed — even
though every other card in that lesson extracted fine and would have
upserted successfully. Cards already created earlier in the same
`Promise.all` batch are not rolled back (no surrounding transaction); since
`Card.lessonId` has no `onDelete: Cascade` (a plain optional FK), those
already-created cards silently survive with `lessonId` nulled out by the
DB's default `SET NULL` behavior and are never retried on a later sync
(their `normalizedFront` already exists, so the next sync silently takes
the UPDATE branch for them).

**Fix:** De-duplicate `cards` by `normalizeFront(card.front)` before the
`Promise.all` (keep first occurrence), and/or wrap the per-lesson upserts in
a single `prisma.$transaction([...])` so a partial failure rolls back
cleanly instead of leaving orphaned, unattributed cards.

## Info

### IN-01: `notes` and `distractors` entries lack the type-checking rigor applied elsewhere in the same normalization step

**File:** `lib/extract-cards.ts:283-285`

**Issue:** `isValidExtractedCard` and the components/sentences cleanup this
phase added carefully validate types (`typeof candidate.front !== 'string'`,
filtering non-string component/sentence entries). By contrast, `notes:
c.notes` passes through with no type check, and `distractors:
Array.isArray(c.distractors) ? c.distractors.slice(0, 3) : []` checks that
the container is an array but not that each element is a string. A
malformed LLM response (e.g. `notes: 12345` or a `distractors` entry that's
an object) passes `parseExtractionResponse` untouched and only fails later
at the Prisma write (`notes` is a `String?` column), causing the whole
lesson's DB write to fail and retry, rather than being caught cleanly by
the structural-validation guard this phase introduced.

**Fix:** Coerce/filter `notes` to `string | undefined` and filter
`distractors` to string elements before slicing, consistent with the rest
of the new validation.

### IN-02: `CardDependency` resolve-and-upsert loop is reimplemented near-verbatim in three separate files

**File:** `app/api/sync/route.ts:222-246`, `scripts/local-resync.mts:190-205`
and `:222-235`, `scripts/retro-filter-cleanup.mts:134-226`

**Issue:** The `for (comp of components) { prereqId =
keyToId.get(normalizeFront(comp)); if (!prereqId || prereqId === id)
continue; upsert(...) }` pattern is independently reimplemented in the live
sync route, twice in `local-resync.mts` (per-lesson pass and final relink
pass), and reconstructed again (batched) in `retro-filter-cleanup.mts`. This
is exactly the kind of duplication that let CR-02 slip in: the `keyToId`
seed-scope fix was applied in `route.ts` but the equivalent incremental
maintenance was missed, and there's no single place a future fix could be
applied once.

**Fix:** Extract a shared pure helper (e.g. `lib/link-dependencies.ts:
resolveDependencyEdges(keyToId, targets)`) that all call sites use, so a
future correctness fix (like CR-02) only needs to be made in one place.

### IN-03: `retro-filter-cleanup.mts` silently buckets any unrecognized `Card.type` into the `vocabulary` tally

**File:** `scripts/retro-filter-cleanup.mts:109`

**Issue:** `const type = (tallies[card.type as CardType] ? card.type :
'vocabulary') as CardType` folds any card whose `type` column isn't exactly
`'vocabulary' | 'grammar' | 'phrase'` into the `vocabulary` bucket for
reporting, with no warning logged. If a data-integrity issue ever produces
a malformed `type` value, this script's per-type report would mask it
rather than surface it — unlike `scripts/dry-run-filter.mjs`, which
dynamically creates a new bucket per observed `type` and would reveal it.

**Fix:** Log a warning (mirroring the malformed-JSON warning a few lines
above) when `card.type` doesn't match one of the three known values, before
folding it into the default bucket.

---

_Reviewed: 2026-07-03T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
