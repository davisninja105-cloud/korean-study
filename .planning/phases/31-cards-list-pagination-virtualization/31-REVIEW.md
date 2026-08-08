---
phase: 31-cards-list-pagination-virtualization
reviewed: 2026-08-07T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/api/cards/[id]/route.ts
  - app/api/cards/route.ts
  - app/api/cards/sentences/route.ts
  - app/cards/page.tsx
  - components/CardEditor.tsx
  - components/CardsClient.tsx
  - components/FreshnessWatcher.tsx
  - components/Nav.tsx
  - e2e/cards-edit-regression.spec.ts
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
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-07T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20 (2 non-source: package.json, package-lock.json — scanned, no findings)
**Status:** issues_found

## Summary

This covers all 7 plans of Phase 31 (cards list pagination/virtualization/Reading-Practice/Edit-sheet/FreshnessWatcher rework), reviewed in one pass since no prior 31-REVIEW.md exists. The server-side pagination layer (`lib/cards-list.ts`, the `/api/cards*` routes) is well-tested and mostly sound — cursor pagination, the `where`-builder, and the IDOR-shaped sentence-ownership scoping in `PUT /api/cards/[id]` are all correctly implemented and covered by real unit/route tests (`tests/cards-list.test.ts`, `tests/cards-id-route.test.ts`).

Two BLOCKER-level defects were found in `components/CardsClient.tsx` / `components/CardEditor.tsx`, both regressions introduced by this phase's client-side state model:

1. `CardEditor` never surfaces a failed save to the user — the friendly 400 messages the API now returns (e.g. the normalizedFront-collision message) are thrown away, and the user has no way to know their edit didn't persist.
2. Inserting a newly-created or newly-relocated (type-changed) card into a type-group bucket that was never fetched (collapsed since mount) creates a "phantom populated" group — the group's `hasMore` stays `false` and its `loaded` array is non-empty, so it never re-fetches its real contents. Any pre-existing cards of that type become permanently invisible in that browser session until a full page reload.

Six WARNING-level and three INFO-level findings round out the review — mostly validation gaps and a race condition in the sentence-upsert transaction, plus a design regression where the Cards-tab sentence preview is effectively dead code for the large majority of cards post-CARDS-01.

## Critical Issues

### CR-01: CardEditor silently swallows every save failure — no user-visible error, edits appear lost

**File:** `components/CardEditor.tsx:73-97`
**Issue:** `handleSave` only `console.error`s on failure; there is no error state and nothing is ever rendered to the user. This defeats the friendly-error work already done server-side: `PUT /api/cards/[id]` returns a specific 400 message on a `normalizedFront` collision ("This front already exists…", `app/api/cards/[id]/route.ts:189-193`) and a 400 on field-shape validation failures — none of that ever reaches the screen. On any failure (network error, 400, 500) the Save button just re-enables with `saving: false` and the sheet stays open with no explanation. A user who doesn't notice may assume the save succeeded and close the sheet, silently discarding their edits. Contrast this with the sibling "Add Card" flow in the same component tree, which does surface failures via `addError` (`components/CardsClient.tsx:975, 997, 1560-1562`) — this is a real regression/inconsistency, not an intentional design choice.
**Fix:**
```tsx
// components/CardEditor.tsx
const [saveError, setSaveError] = useState<string | null>(null)

const handleSave = async () => {
  setSaving(true)
  setSaveError(null)
  try {
    const res = await fetch(`/api/cards/${card.id}`, { ... })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error ?? `Save failed: ${res.status}`)
    }
    const updated = await res.json()
    onSave(updated)
  } catch (err) {
    console.error('CardEditor save failed:', err)
    setSaveError(err instanceof Error ? err.message : 'Could not save card. Please try again.')
  } finally {
    setSaving(false)
  }
}
// ...and render {saveError && <p className="text-sm text-red-500 dark:text-red-400">{saveError}</p>}
// next to the Save button, mirroring the Add Card sheet's addError pattern.
```

### CR-02: Adding or relocating a card into a not-yet-fetched (collapsed) group bucket permanently hides that group's real contents

**File:** `components/CardsClient.tsx:972-1001` (`handleAdd`), `components/CardsClient.tsx:916-940` (`handleSave`'s CR-02 relocation logic)
**Issue:** Both `handleAdd` and `handleSave` insert a card directly into `groups[key].loaded` and then force `collapsed[key] = false`, without ever calling `fetchGroupPage`. Compare this with `toggleCollapse` (`components/CardsClient.tsx:601-610`), which is the ONLY other place a collapsed group is expanded, and which correctly fetches the group's real first page when `g.loaded.length === 0`.

Concretely: if the Grammar group has never been expanded in this session (`groups.grammar === EMPTY_GROUP_STATE`, i.e. `loaded: [], hasMore: false`) and the user either (a) adds a brand-new card with type `grammar` via "Add Card", or (b) edits an existing Vocabulary card and changes its type to `grammar`, the Grammar bucket ends up with `loaded: [thatOneCard]` and `hasMore: false` — with the group counts correctly bumped to reflect N real Grammar cards server-side. The rendered UI then shows the Grammar header with the correct count (e.g. "6 cards") but only ONE card row underneath, followed by the "You've reached the end." status — silently hiding the other 5 real Grammar cards that were never fetched.

This is not self-healing: re-collapsing and re-expanding the group calls `toggleCollapse`, which only fetches when `g.loaded.length === 0` — but `loaded.length` is now `1`, so the fetch never fires again. The only way to recover is a full page reload, or changing the filter/lesson-range (which resets all groups via `runQuery`'s grouped-mode branch). This directly contradicts the careful "upsert into already-loaded rows only, never treat a partial payload as authoritative" invariant this same file enforces everywhere else (see the `freshCards` backstop merge at line 463-489, which explicitly skips cards not already loaded specifically to avoid this class of bug) — `handleAdd`/`handleSave` violate that invariant by inserting into an empty, never-fetched bucket.

The dedicated regression test `e2e/cards-edit-regression.spec.ts` exercises exactly this code path but happens not to catch the bug, because its fixture has *zero* pre-existing Grammar cards — the comment at line 231-232 even says "its `loaded` array is already populated by the CR-02 fix's optimistic insert, so expanding it fires no new fetch," treating the very behavior that causes this bug as the expected/correct outcome. The bug only manifests when the target group already has other real cards server-side that haven't been loaded client-side yet — a scenario the fixture cannot produce (all 8 fixture cards are vocabulary).
**Fix:** Before optimistically inserting, check whether the target group has ever been fetched; if not, fall back to a real fetch instead of (or in addition to) the optimistic insert:
```tsx
// handleAdd, after computing groupKey:
if (groups[groupKey].loaded.length === 0 && !groups[groupKey].loading) {
  // Group was never fetched — get the real first page instead of a lone optimistic row.
  fetchGroupPage(groupKey, null, 'replace')
} else {
  setGroups((prev) => ({ ...prev, [groupKey]: { ...prev[groupKey], loaded: [created, ...prev[groupKey].loaded] } }))
}
setCollapsed((prev) => ({ ...prev, [groupKey]: false }))
bumpGroupCount(created.type, 1)

// handleSave's relocation block: same guard around the `next[newKey]` insert —
// if groups[newKey].loaded.length === 0, trigger fetchGroupPage(newKey, null, 'replace')
// instead of (or after) splicing the single relocated card in.
```

## Warnings

### WR-01: `PUT /api/cards/[id]` doesn't map a "card not found" error to 404 — falls through to a generic 500

**File:** `app/api/cards/[id]/route.ts:184-200`
**Issue:** `GET` (line 31-33) and `DELETE` (line 215-217) both correctly detect a missing card and return 404. `PUT`'s `prisma.card.update({ where: { id }, ... })` throws Prisma's `P2025` ("record not found") when `id` doesn't exist (e.g. the card was deleted by another action while the Edit sheet was open), but the catch block only special-cases `P2002` — `P2025` falls through to the generic `{ error: 'Failed to update card' }, 500`. Combined with CR-01 above, a user editing a since-deleted card gets total silence.
**Fix:**
```ts
if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
  return NextResponse.json({ error: 'Card not found' }, { status: 404 })
}
```

### WR-02: Shallow validation of nested `sentences[]` payload fields in POST/PUT — malformed entries produce a generic 500 instead of a clean 400

**File:** `app/api/cards/route.ts:89-95`, `app/api/cards/[id]/route.ts:91-97`
**Issue:** Both handlers validate that `sentences` is an array of objects, but never check that `korean`/`targetForm`/`translation` are actually strings. A payload like `{ sentences: [{ korean: 123, targetForm: null, translation: {} }] }` passes this check, then reaches `korean: s.korean ?? ''` (which lets `123` through unchanged, not coerced to a string) and is handed to Prisma, which throws a type-mismatch error caught only by the generic 500 handler — inconsistent with the explicit field-shape validation already done for `front`/`back`/`notes`/`type` a few lines above in the same handlers.
**Fix:**
```ts
if (
  data.sentences !== undefined &&
  (!Array.isArray(data.sentences) ||
    data.sentences.some((s: unknown) =>
      typeof s !== 'object' || s === null ||
      typeof (s as Record<string, unknown>).korean !== 'string' ||
      typeof (s as Record<string, unknown>).targetForm !== 'string' ||
      typeof (s as Record<string, unknown>).translation !== 'string'
    ))
) {
  return NextResponse.json({ error: 'each sentence must have korean/targetForm/translation strings' }, { status: 400 })
}
```

### WR-03: TOCTOU race in the sentence upsert — the ownership read runs outside the transaction it informs

**File:** `app/api/cards/[id]/route.ts:121-146`
**Issue:** `existing = await prisma.sentence.findMany({ where: { cardId: id } })` executes as a separate, non-transactional read BEFORE `$transaction([cardUpdate, ...sentenceOps])` is built and run. If a concurrent request mutates this card's sentences between that read and the transaction commit (e.g. two rapid PUTs from a double-submit, or a sync process touching the same card), the `keepIds`/`existingIds` sets computed from the stale read can cause `deleteMany({ where: { cardId: id, id: { notIn: [...keepIds] } } })` to delete a sentence the concurrent write just created, or the `update` branch to target a row that no longer represents the same logical sentence. Low-probability in this single-tenant app, but a genuine correctness gap in an otherwise carefully-guarded IDOR mitigation.
**Fix:** Move the `findMany` inside the transaction (or use `prisma.$transaction(async (tx) => {...})` interactive form) so the read and the subsequent writes are atomic against concurrent mutation of the same card's sentences.

### WR-04: `FreshnessWatcher`'s `/cards` backstop doesn't relocate a card across type-group buckets when its type changed externally

**File:** `components/CardsClient.tsx:463-489`
**Issue:** The upsert-by-id merge looks up the refreshed card's *new* type bucket (`groupKeyForType(card.type)`) and only patches it in place if already present in THAT bucket (`if (idx === -1) continue`). If the card's type changed since it was originally loaded (e.g. edited from another browser tab/device), the old bucket still holds a stale-typed row that this merge never removes, and the new bucket is never populated (since the card was never "already loaded" there). Net effect: a stale, wrong-type entry lingers until a hard refresh. Lower severity than CR-02 since it requires an external concurrent edit, and the local `handleSave` path already handles the same-tab case correctly.
**Fix:** When merging, also search every OTHER group for the card by id; if found in a group other than `groupKeyForType(card.type)`, remove it from the old bucket (the same "never authoritative for what else exists" rule means it still shouldn't be inserted into the new bucket unless already loaded there).

### WR-05: The Cards list "Example sentences" preview is effectively dead code for the vast majority of cards after CARDS-01

**File:** `components/CardsClient.tsx:1171-1194` (`renderCardRow`), `lib/cards-list.ts:141-160` (`getCardsPage` always returns `sentences: []`)
**Issue:** `getCardsPage`/`getCardsGroupCounts` deliberately drop `sentences` from the list `select` (CARDS-01), so every card loaded through normal browsing/scrolling/expand-on-tap has `sentences: []`. The ONLY code path that ever populates a non-empty `sentences` array on a list-row `CardDTO` is `handleSave`'s `merge()` (line 892-915), which runs exclusively for the one card just edited in the current session. The result: `renderCardRow`'s "Example sentences" block (guarded by `(card.sentences ?? []).length > 0`) never renders for any card except one that was just saved moments ago — i.e., in normal use it never renders at all. This is confusing/inconsistent UI (a random card shows a sentence preview, every other card in the same list doesn't) and effectively dead code that should either be removed or intentionally re-wired (e.g. to use the already-fetched `sentenceCount` + an on-demand fetch) now that sentences are excluded from the list query.
**Fix:** Either delete the now-effectively-unreachable preview block from `renderCardRow`, or make it deliberately conditional on `card.sentences.length > 0` being a real, load-bearing signal (e.g. only show it right after a save, with a comment explaining why), so a future reader doesn't mistake it for functioning, general-purpose UI.

### WR-06: `handleDelete` and `handleSave`'s edit sheet close on failure with zero user-visible feedback

**File:** `components/CardsClient.tsx:844-849` (delete failure), CR-01 above (save failure)
**Issue:** On a non-OK `DELETE` response, `handleDelete` only does `console.error('Delete failed:', res.status); return` — no toast/banner is shown, so the user's only signal that the delete didn't happen is that the swiped row silently reappears/stays. Less severe than CR-01 (no illusion of success, since state simply doesn't change), but still a missing-error-handling gap inconsistent with the "Couldn't load more cards…"/"Couldn't search right now…" patterns used elsewhere in this same file for read failures.
**Fix:** Surface a lightweight inline/toast error (e.g. reuse the `queryError` banner pattern) on a failed delete, rather than a console-only log.

## Info

### IN-01: Unvalidated `cursor` query param — a nonexistent id triggers a generic 500 instead of a clean 400/empty result

**File:** `app/api/cards/route.ts:23` (and `lib/cards-list.ts:126-135`), `app/api/cards/sentences/route.ts:18` (and `lib/cards-list.ts:220-226`)
**Issue:** `cursor` is passed straight through to `prisma.card.findMany({ cursor: { id: cursor }, ... })`/`prisma.sentence.findMany(...)` with no existence check. A garbage or stale (since-deleted) cursor id causes Prisma to throw, which the route's generic catch turns into a 500 "Failed to load cards" — not a security issue (no data leak, no injection — Prisma parameterizes the value), but a robustness gap: a stale cursor from a client that's been open across a card deletion elsewhere gets an opaque failure instead of, e.g., an empty page.
**Fix:** Wrap the cursor-based fetch in a targeted try/catch that treats a `P2025`-shaped cursor failure as "start of a fresh page" (`cursor: undefined`) rather than a hard error, or validate the cursor format defensively.

### IN-02: `type` query param on `GET /api/cards` isn't validated against the known enum

**File:** `app/api/cards/route.ts:22`, `lib/cards-list.ts:83-87`
**Issue:** Unlike `POST`/`PUT`, which validate `type` against `['vocabulary', 'grammar', 'phrase']` (`app/api/cards/route.ts:80-82`, `app/api/cards/[id]/route.ts:88-90`), the `GET` list endpoint accepts any string for `type` and passes it straight into `where.type = params.type` when it isn't `'all'`/`'other'`. An unrecognized value silently returns zero rows rather than a 400 — not exploitable, just a minor inconsistency versus the write endpoints' stricter validation.
**Fix:** Validate `type` against `['all', 'vocabulary', 'grammar', 'phrase', 'other']` and return 400 for anything else, mirroring the write-side validation.

### IN-03: `CardEditor.updateSentence`'s "keep targetForm in sync" branch is a no-op

**File:** `components/CardEditor.tsx:58-62`
**Issue:** 
```ts
if (field === 'korean' && s.targetForm === front) {
  updated.targetForm = front
}
```
The condition already guarantees `s.targetForm === front`, and `updated` is a shallow copy of `s` with only the changed field (`korean`) overwritten — so `updated.targetForm` already equals `front` before this line runs. The re-assignment does nothing; the comment ("re-confirm it, keeps the auto-fill in sync while the user types") describes intended behavior this code doesn't actually implement. Not a functional bug (no incorrect value results), but dead/misleading logic that should either be removed or reworked into what the comment claims (e.g. re-deriving `targetForm` from the new `korean` text when the front auto-fill is still "live").
**Fix:** Remove the dead branch, or replace it with logic that actually re-derives an auto-filled `targetForm` from the updated sentence text.

---

_Reviewed: 2026-08-07T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
