---
phase: 14-sync-failure-visibility-caching-performance
reviewed: 2026-07-02T19:19:48Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/api/gloss/preload/route.ts
  - app/api/sync/route.ts
  - components/GlossProvider.tsx
  - lib/gloss.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-07-02T19:19:48Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the four Phase 14 source files at standard depth, cross-referencing the pre-Phase-14 sync route (via `git show`), the `lib/card-key.ts` normalizer, the sibling `app/api/gloss/route.ts` POST handler, `middleware.ts` auth coverage, and `prisma/schema.prisma` constraints.

**High-level assessment:** The Phase 14 changes are largely sound. The `lessonExcerpt()` sanitization correctly prevents raw Prisma/extraction error text from reaching the client — all three `failures[]` push sites (rejected extraction, 0 cards, DB error) use the user's own doc excerpt and log raw errors server-side only. The preload endpoint is correctly gloss-scoped (`startsWith: 'gloss:'`), bounded (`take: GLOSS_PRELOAD_LIMIT`), and degrades gracefully (`{ entries: [] }` on error, never a 500). The GlossProvider mount effect is genuinely `react-hooks/set-state-in-effect` clean — it writes only to `cache.current` (a ref) inside `.then()` callbacks, never calls `setPopover` in the effect body. Cache-key alignment is correct: the preload returns `word = normalizeFront(originalWord)` (sliced from the DB key), the client stores via `cache.current.set(word, entry)`, and `showGloss` reads via `cache.current.get(normalizeFront(raw))` — these keys match. Auth is covered by `middleware.ts` (the `/api/gloss/preload` path is not excluded from the matcher).

Two warnings were found: one behavior-difference in the hoisted `keyToId` edge-creation logic (the comment claims "no behavior change" but a stale-entry edge case differs from the original post-upsert re-query), and one pre-existing information-disclosure in the outer catch that leaks raw `err.message` to the client (inconsistent with the phase's SYNC-01 sanitization goal).

## Warnings

### WR-01: Stale `keyToId` entries cause behavior difference in CardDependency edge creation

**File:** `app/api/sync/route.ts:98-103, 192-225, 235-259`
**Issue:**

The hoisted `keyToId` map is seeded **before** the upsert loop (lines 99–103) with `where: { components: { not: null } }` and augmented during upserts (lines 188, 222 — `keyToId.set(nf, ...)` when `card.components.length > 0`), but it **never has entries removed**. In the UPDATE branch (lines 192–225), when the new extraction yields zero components (`card.components.length === 0`), the card's DB `components` column is set to `null` (line 201: `components: componentsJson` where `componentsJson = null` per lines 154–156), but the stale `normalizedFront → id` entry from the seed **persists** in `keyToId`.

The **original code** re-queried **after** the upserts with `where: { components: { not: null } }` (original lines 196–199), so a card that lost its components would be **excluded** from the lookup map — `keyToId.get(normalizeFront(comp))` would return `undefined` and no edge would be created. In the new code, the stale entry means `keyToId.get(...)` returns the card's id, and a `CardDependency` edge **is** created — an edge the original would not have created.

The comment at lines 92–97 claims this "preserve[s] existing edge semantics (only cards that have components are resolvable as prerequisites)," but this edge case breaks that claim: a card that just lost its components remains resolvable as a prerequisite for the remainder of this request.

**Trigger conditions:** A pre-existing card X (in the seed because it had `components: not null`) is re-extracted in this lesson with zero components (UPDATE branch sets `components = null`), AND another card Y in the same lesson has `components` referencing X. The new code creates edge Y→X; the original would not. With `MAX_LESSONS_PER_SYNC = 1` the impact is limited to intra-lesson forward references, but the comment's "no behavior change" claim is inaccurate.

**Fix:**

In the UPDATE branch, when the card is losing its components, delete the stale entry so the hoisted map matches the original post-upsert re-query semantics:

```typescript
} else {
  // UPDATE: card exists — preserve lessonId + review; refresh components +
  // sentences if they were previously missing.
  const updateData: Record<string, unknown> = { /* ... */ }

  if (card.components.length > 0) {
    keyToId.set(nf, existing.id)
    linkTargets.push({ id: existing.id, components: card.components })
  } else {
    // Card is losing its components — remove from the lookup map so it's
    // no longer resolvable as a prerequisite (matches the original
    // post-upsert re-query's `where: { components: { not: null } }`).
    keyToId.delete(nf)
  }
  // ... rest of update
```

### WR-02: Outer catch leaks raw error message to client (information disclosure)

**File:** `app/api/sync/route.ts:288-292`
**Issue:**

The outer catch block returns the raw `err.message` directly to the client:

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Unknown error'
  console.error('Sync error:', message)
  return NextResponse.json({ error: message }, { status: 500 })
}
```

This can leak Prisma internals (SQLite file paths, connection strings, SQL fragments), Google Docs API error text, or `extractCardsFromNotes` library internals to the client. Phase 14's SYNC-01 effort specifically sanitized the inner `failures[]` array (lines 114, 123, 268) so that raw error text never reaches the client — yet this outer 500 response still surfaces it, which is inconsistent with the phase's stated goal.

**Note:** Pre-existing — the outer catch was not modified by Phase 14. But it is in the reviewed file and represents an information-disclosure surface that the SYNC-01 work did not close.

**Fix:**

Return a generic message to the client; the `console.error` already logs the full error server-side:

```typescript
} catch (err: unknown) {
  console.error('Sync error:', err)
  return NextResponse.json(
    { error: 'Sync failed — see server logs for details' },
    { status: 500 }
  )
}
```

## Info

### IN-01: Variable shadowing — `const created` shadows outer `let created`

**File:** `app/api/sync/route.ts:89, 166`
**Issue:**

The outer `let created = 0` (line 89) counts persisted lessons for `orderIndex` (used at line 132: `orderIndex: orderBase + (++created)`). Inside the `Promise.all` callback, `const created = await prisma.card.create({...})` (line 166) shadows it with the created Card object. Same identifier, different types (`number` vs the created Card row) and different scopes. TypeScript's block scoping resolves this correctly — `++created` on line 132 references the outer counter, `created.id` on line 188 references the inner Card — but the shadowing is a maintenance hazard: a future edit to the callback that intends to reference the lesson counter would silently get the Card object instead.

**Note:** Pre-existing — not introduced by Phase 14. The shadowing predates this phase.

**Fix:** Rename the inner variable to `newCard` or `createdCard`:

```typescript
const newCard = await prisma.card.create({ /* ... */ })
if (card.components.length > 0) {
  keyToId.set(nf, newCard.id)
  linkTargets.push({ id: newCard.id, components: card.components })
}
createdThisLesson++
```

### IN-02: `getRecentGlosses` returns rows in undefined (insertion) order, not recency order

**File:** `lib/gloss.ts:85-102`
**Issue:**

The `prisma.setting.findMany` query (lines 88–91) has no `orderBy`, so Prisma returns rows in an undefined order (for SQLite, typically rowid / insertion order). The function is named `getRecentGlosses` and its docstring says "Bulk-read previously-resolved gloss entries," but it actually returns the **oldest** entries (insertion order), not the most recent. The code documents this limitation ("The Setting table has no timestamp column, so 'recent' is the DB's natural key order; the limit is the only bound"), but the name `getRecentGlosses` and the `GLOSS_PRELOAD_LIMIT` constant's "recent" framing are misleading.

For cache warming, any 300 entries are valid — but the most-recently-glossed words (which the user is most likely to re-tap soon) may not be in the preloaded set, reducing the preload's hit rate. The `Setting` model (`prisma/schema.prisma:110-113`) has only `key` and `value` — no timestamp column — so true recency ordering would require a schema change.

**Fix:** If recency matters for the preload's effectiveness, add an `updatedAt DateTime @updatedAt` column to the `Setting` model and query with `orderBy: { updatedAt: 'desc' }`. If recency doesn't matter, rename to `getGlossCacheEntries` to avoid the "recent" misnomer.

---

_Reviewed: 2026-07-02T19:19:48Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
