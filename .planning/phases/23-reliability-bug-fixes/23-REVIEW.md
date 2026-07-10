---
phase: 23-reliability-bug-fixes
reviewed: 2026-07-10T12:30:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - tests/study-cards.test.ts
  - lib/study-cards.ts
  - lib/relink-dependencies.ts
  - tests/link-dependencies.test.ts
  - tests/relink-dependencies.test.ts
  - scripts/relink-dependencies.mts
  - lib/link-dependencies.ts
  - lib/sync.ts
  - scripts/local-resync.mts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-07-10T12:30:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the RELIABILITY-01/02/03 + IN-02 changes: the `getStudyCards` known-lemmas
degradation logging, the new pure `computeMissingEdges` resolver-diff, the
`relinkAllDependencies` orchestrator with the `runSync` auto-relink hook, and the
consolidation of `local-resync.mts`'s final relink pass onto the shared helper.

The pure layer (`lib/link-dependencies.ts`) is solid: it defensively parses
components JSON with an `Array.isArray` guard, subtracts existing edges for
idempotency, and builds the lookup from every card. The regression tests are
well-targeted (real-schema `@@unique` proof, known-lemmas degradation contract).

However, the defensive parsing discipline applied to the **pure** layer was
**not** carried through to the inline parses in `lib/sync.ts` and
`scripts/local-resync.mts`, leaving two unguarded `JSON.parse(...) as string[]`
sites that throw on valid-but-non-array JSON — the exact failure mode the pure
layer was hardened against this phase. There is also a behavioral bug in the
lesson-range filter contract: the API accepts partial ranges
(`?lessonFrom=5` without `lessonTo`) but `getStudyCards` silently ignores them,
returning all lessons.

## Critical Issues

### CR-01: Partial lesson-range filter silently ignored — API accepts it, getStudyCards drops it

**File:** `lib/study-cards.ts:27-30` (cross-ref caller `app/api/cards/due/route.ts:19-38`)
**Issue:** The `lessonClause` is built only when BOTH bounds are non-null:

```ts
const lessonClause =
  lessonFrom !== null && lessonTo !== null
    ? { lesson: { orderIndex: { gte: lessonFrom, lte: lessonTo } } }
    : {}
```

The API route (`app/api/cards/due/route.ts`) explicitly validates and ACCEPTS
partial specification — `?lessonFrom=5` with no `lessonTo` passes validation
(lines 26-32 only reject `from > to` when BOTH are present) and is forwarded to
`getStudyCards({ lessonFrom: 5, lessonTo: null })`. Because the guard requires
both non-null, `lessonClause` becomes `{}` and the query returns cards from ALL
lessons (including lesson 1), not lessons with `orderIndex >= 5`.

A user filtering by a single bound gets a silent superset instead of the
requested subset — incorrect, reachable through the normal API with no special
inputs. This is a contract mismatch between the route (accepts partial) and the
function (treats partial as "all").

**Fix:** Either handle the partial bounds (the natural semantics —
`lessonFrom`-only → `gte`, `lessonTo`-only → `lte`):

```ts
const lessonClause =
  lessonFrom !== null && lessonTo !== null
    ? { lesson: { orderIndex: { gte: lessonFrom, lte: lessonTo } } }
    : lessonFrom !== null
      ? { lesson: { orderIndex: { gte: lessonFrom } } }
      : lessonTo !== null
        ? { lesson: { orderIndex: { lte: lessonTo } } }
        : {}
```

…or reject partial specification in the API route validation so the contract is
consistent. The first option matches the intuitive meaning of `?lessonFrom=5`.

## Warnings

### WR-01: Unguarded non-array components parse in sync.ts WR-02 pruning — infinite retry loop on malformed data

**File:** `lib/sync.ts:227-238`
**Issue:** The WR-02 stale-edge pruning block parses the stored components and
runs `.map()` on the result OUTSIDE the try/catch that guards `JSON.parse`:

```ts
let previousComponents: string[] = []
if (existing.components) {
  try {
    previousComponents = JSON.parse(existing.components) as string[]  // catches parse errors
  } catch {
    previousComponents = []                                            // ...but only parse errors
  }
}
const newKeys = new Set(card.components.map((c) => normalizeFront(c)))
const removedKeys = previousComponents
  .map((c) => normalizeFront(c))   // ← OUTSIDE try/catch — throws on non-array
  .filter((k) => !newKeys.has(k))
```

`as string[]` is a compile-time assertion, not a runtime check. If
`existing.components` is VALID but non-array JSON (e.g. `'42'`, `'{"foo":"bar"}'`,
`'null'`, `'true'`), `JSON.parse` succeeds, `previousComponents` holds a non-array
value, and the subsequent `.map()` throws `TypeError: previousComponents.map is
not a function`. This propagates to the outer `catch (dbErr)` (line 304), which
deletes the just-created Lesson row and records a failure.

Because the lesson is deleted, its `contentHash` is removed, so the next sync
re-extracts the lesson (wasting a Claude API call), re-enters the UPDATE branch
for the same card with the same bad `components`, and throws again — an
infinite retry loop that never recovers without manual DB intervention.

The pure layer (`computeMissingEdges`, `lib/link-dependencies.ts:133`) was
hardened against this exact failure mode this phase with `Array.isArray(parsed)`.
This inline parse was not.

**Fix:** Guard with `Array.isArray`, mirroring the pure layer:

```ts
let previousComponents: string[] = []
if (existing.components) {
  try {
    const parsed = JSON.parse(existing.components)
    previousComponents = Array.isArray(parsed) ? parsed : []
  } catch {
    previousComponents = []
  }
}
```

### WR-02: local-resync.mts unconditionally nulls previously-good components on re-sync

**File:** `scripts/local-resync.mts:152`
**Issue:** The UPDATE branch sets `components: componentsJson` unconditionally:

```ts
const componentsJson  = card.components.length  ? JSON.stringify(card.components)  : null
// ...
const updateData: Record<string, unknown> = {
  back:        card.back,
  notes:       card.notes ?? null,
  distractors: distractorsJson,
  components:  componentsJson,   // ← null when extraction returned no components
}
```

When a routine re-sync's extraction returns zero components for an existing
card, `componentsJson` is `null` and the update wipes the card's previously-good
`components` value. `lib/sync.ts:216-221` deliberately guards this exact case
("An empty/filtered-out result from a routine re-sync must never silently null
out (or shrink) a previously-good value") with `if (card.components.length > 0)`,
but `local-resync.mts` does not apply the same guard. The subsequent relink pass
only ADDS edges and never prunes, so the result is silent data loss: components
destroyed, stale edges from the old components lingering, no new edges created
from this card.

**Fix:** Apply the same WR-02 guard used in `lib/sync.ts`:

```ts
const updateData: Record<string, unknown> = {
  back:        card.back,
  notes:       card.notes ?? null,
  distractors: distractorsJson,
}
if (card.components.length > 0) {
  updateData.components = componentsJson
}
```

### WR-03: relink createMany omits skipDuplicates — single race conflict fails the whole batch

**File:** `lib/relink-dependencies.ts:59`
**Issue:** The batch insert uses a bare `createMany`:

```ts
if (missing.length > 0) {
  await prisma.cardDependency.createMany({ data: missing })
}
```

If a concurrent sync inserts ANY one of the `missing` edges between the read
(line 49-51) and this write, the `@@unique([cardId, prerequisiteId])` constraint
fires and the ENTIRE `createMany` throws — losing the other N-1 valid inserts in
that round. The JSDoc acknowledges this as intentional ("next qualifying sync
retries the relink naturally"), and it IS eventually consistent, but under
concurrency convergence degrades to one-batch-per-sync-cycle instead of
inserting all non-conflicting edges immediately.

`skipDuplicates: true` is the standard Prisma idempotent-batch pattern and would
insert every non-conflicting edge while silently skipping the conflicting one —
strictly better convergence with no loss of the unique-constraint safety net
(the constraint still rejects truly malformed duplicates).

**Fix:**

```ts
await prisma.cardDependency.createMany({ data: missing, skipDuplicates: true })
```

### WR-04: local-resync.mts per-lesson linkTargets parse not guarded against non-array JSON

**File:** `scripts/local-resync.mts:187-194`
**Issue:** Same class of bug as WR-01, in the per-lesson linking pass. The
components parse only catches `JSON.parse` failures, not non-array payloads:

```ts
const linkTargets = allCardsForLink
  .filter((c) => upsertedSet.has(c.id) && c.components)
  .map((c) => {
    let comps: string[] = []
    try { comps = JSON.parse(c.components as string) } catch { comps = [] }
    return { id: c.id, components: comps }   // comps may be a non-array
  })
const resolvedEdges = resolveDependencyEdges(keyToId, linkTargets)
```

If `c.components` is valid-but-non-array JSON (`'42'`, `'null'`, `'true'`,
`'{"foo":"bar"}'`), `comps` is a non-iterable value. `resolveDependencyEdges`
runs `for (const comp of components)` (`lib/link-dependencies.ts:74`), which
throws `TypeError: ... is not iterable`. This is NOT inside any try/catch in the
per-lesson pass, so it propagates to the script's top level and crashes the
entire `local-resync` run — worse than sync.ts's per-lesson isolation. The pure
`computeMissingEdges` (used by the final relink pass this same script delegates
to) guards with `Array.isArray` (line 133); this inline parse does not.

**Fix:** Guard with `Array.isArray`:

```ts
.map((c) => {
  let comps: string[] = []
  try {
    const parsed = JSON.parse(c.components as string)
    comps = Array.isArray(parsed) ? parsed : []
  } catch { comps = [] }
  return { id: c.id, components: comps }
})
```

## Info

### IN-01: orderIndex gaps on lesson failure — `created` counter not rolled back

**File:** `lib/sync.ts:124`
**Issue:** `orderIndex: orderBase + (++created)` pre-increments `created` inside
the try block. When a lesson is created but a later card upsert fails, the outer
catch (line 304) deletes the Lesson row but does NOT decrement `created`. The
next iteration's `orderBase + (++created)` skips the consumed number, leaving a
gap in `orderIndex`. Gaps don't break `gte`/`lte` range filtering, so this is
cosmetic, but the lesson sequence is no longer contiguous.

**Fix:** Decrement `created` in the catch, or compute `orderIndex` from a count
of successfully persisted lessons only.

### IN-02: relink-dependencies integration tests are order-dependent

**File:** `tests/relink-dependencies.test.ts:97-138`
**Issue:** The three `it` blocks share the same seeded DB state and assume
strict ordering: the first run creates the edge, the second proves idempotency,
the third asserts no side effects. They pass in definition order (Vitest
default) but would fail under `--shuffle` or a parallel runner — test 2 would
find no edge (first run never ran) or test 1 would find a pre-existing edge
(second run already ran). This is a common pattern for idempotency proofs but is
fragile.

**Fix:** If shuffle resistance is desired, collapse the three assertions into a
single `it`, or re-seed in a `beforeEach` (heavier, since it re-runs the DDL
apply).

---

_Reviewed: 2026-07-10T12:30:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
