---
phase: 18-review-history-page
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - app/api/reviews/route.ts
  - app/habits/page.tsx
  - app/history/loading.tsx
  - app/history/page.tsx
  - components/CardEditor.tsx
  - components/HabitsClient.tsx
  - components/HistoryClient.tsx
  - lib/dashboard.ts
  - lib/dto.ts
  - lib/fsrs.ts
  - lib/review-history.ts
  - tests/review-history.test.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: fixed
---

# Phase 18: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Reviewed the review-history feature (`/api/reviews`, `/history` RSC page + `HistoryClient`, the `getStats()`/`getActivityData()` extensions for the Habits "Card progress" section, and the pure `lib/review-history.ts` pipeline + its unit tests). The data-pipeline layer (`lib/review-history.ts`, `lib/fsrs.ts` export, `lib/dashboard.ts`, `lib/dto.ts`) is solid — pure, well-tested, and the cursor-pagination/DoS-guard reasoning in `app/api/reviews/route.ts` is sound.

The blocking issue is in `components/HistoryClient.tsx`: its `rows`/`hasMore` state is seeded from props via `useState(initialLogs)` with no reset mechanism, and the "clear filter" control performs a same-route `router.push('/history')` rather than an explicit client-side re-fetch (the pattern already used elsewhere in this codebase — see `StudyClient`'s lesson-range re-fetch — specifically to avoid this class of bug). Because the parent `<HistoryClient>` element is not re-keyed in `app/history/page.tsx`, React preserves the existing client-component instance across the search-param change and the feed silently keeps stale data.

## Critical Issues

### CR-01: Clearing (or changing) the history filter does not reset feed state — stale/mixed rows shown

**File:** `components/HistoryClient.tsx:45-46` (state seeded from props), `components/HistoryClient.tsx:88` (`clearFilter`), `app/history/page.tsx:29-36` (`<HistoryClient>` mounted without a `key`)

**Issue:**
`rows` and `hasMore` are initialized once from props:
```ts
const [rows, setRows] = useState<ReviewLogDTO[]>(initialLogs)
const [hasMore, setHasMore] = useState(initialLogs.length === pageSize)
```
`clearFilter` navigates via `router.push('/history')` (same route, only the search param changes):
```ts
const clearFilter = () => router.push('/history')
```
This causes `app/history/page.tsx` (a Server Component keyed on `searchParams`) to re-run and produce a fresh `initialLogs`/`cardId`/`cardFront` — but `<HistoryClient>` is rendered without a `key`, so React reconciles it as the *same* component instance at the same tree position and only updates its props. `useState(initialLogs)` does **not** re-initialize on a prop change after mount, so:

- The filter chip disappears (it reads the `cardId` prop directly), implying "all reviews" mode, but the visible list still contains only the previously-filtered card's rows (stale data) — chip state and list content now contradict each other.
- Any subsequent infinite-scroll `loadMore()` call uses the **new** (cleared) `cardId` to build its query (`qs = new URLSearchParams({ cursor: last.id, ...(cardId ? { cardId } : {}) })`), so newly-appended rows are drawn from the *unfiltered* set while the top of the list is still the *filtered* set — producing an internally inconsistent, non-chronological feed.
- The same failure mode applies in reverse (or across two different card filters) any time this component receives new `initialLogs`/`cardId` props without being remounted — currently that never happens correctly because there is no reset path at all.

This directly defeats the feature this phase built (`D-10`/`D-11` single-card filter chip + clear action) and is a provable, reproducible defect: click "View history →" for card A from `CardEditor`, filter shows correctly; click the "×" clear-filter chip; the header/chip say "all reviews" but the rows shown are unchanged (still only card A's reviews) until the user forces a hard reload.

Note the codebase already has the correct pattern for this exact problem documented in `CLAUDE.md`: *"Lesson-range filter re-fetch sets `isFilterLoading` ... rather than `setPhase('loading')`"* — i.e. filter changes in this app are handled via an explicit client-side `fetch` + `setState`, never by relying on RSC-provided props to reset client state.

**Fix:** Either force a remount on filter change by keying the component:
```tsx
// app/history/page.tsx
<HistoryClient
  key={cardId ?? 'all'}
  initialLogs={initialLogs}
  cardId={cardId}
  cardFront={filterCardFront}
  pageSize={PAGE_SIZE}
/>
```
or reset local state explicitly inside `HistoryClient` when `cardId`/`initialLogs` change:
```ts
useEffect(() => {
  setRows(initialLogs)
  setHasMore(initialLogs.length === pageSize)
  setError(false)
}, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps
```
The `key` approach is simpler and matches React's documented "reset state with a key" pattern; it also avoids the extra render caused by the effect-based reset.

## Warnings

### WR-01: `formatTimestamp` omits `timeZone`, risking a server/client hydration mismatch

**File:** `components/HistoryClient.tsx:29-37`

**Issue:**
```ts
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
```
`HistoryClient` is a `'use client'` component but is still server-rendered for the initial HTML (RSC + client-component hydration). `toLocaleString` without an explicit `timeZone` uses the host's local timezone — the Vercel Node runtime (server) and the user's browser (client) can differ, producing a text-content hydration mismatch (React hydration warning + a visible flash of a different timestamp on first paint). The sibling component added in this same phase, `HabitsClient.tsx:29-34`'s `formatDate`, already guards against exactly this by passing `timeZone: 'UTC'` explicitly — this is the only date-formatting call site in the diff that doesn't follow that precedent.

**Fix:**
```ts
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC', // or a fixed zone — avoid host-dependent formatting during SSR
  })
}
```

### WR-02: `app/history/page.tsx` skips the opaque-id validation used by its own API sibling

**File:** `app/history/page.tsx:16-27` vs. `app/api/reviews/route.ts:10-12`

**Issue:** `GET /api/reviews` bounds `cardId`/`cursor` length via `isValidOpaqueId` (`MAX_ID_LEN = 64`) before it reaches Prisma, with an explicit comment explaining the intent (reject grossly malformed input, not full cuid validation). `app/history/page.tsx` implements the *same* feature (first-page load of the same `getReviewHistory` pipeline, plus a `prisma.card.findUnique({ where: { id: cardId } })` fallback lookup) but takes `cardId` straight from `searchParams` with no bound at all:
```ts
const { cardId: rawCardId } = await searchParams
const cardId = rawCardId ?? null
...
const initialLogs = await getReviewHistory({ cardId, cursor: null })
```
Not exploitable today (Prisma parameterizes the equality lookup, so worst case is zero rows), but it is an inconsistency between two entry points into the same pipeline, and the unvalidated string is also echoed back into the UI as a fallback filter-chip label (`cardFront ?? cardId` in `HistoryClient.tsx:112`). Apply the same guard for defense-in-depth and consistency.

**Fix:** Reuse (export) `isValidOpaqueId` from `lib/review-history.ts` or duplicate the same bound in `page.tsx`, and treat an invalid `cardId` the same way an invalid one is treated in the API route (e.g. redirect/treat as `null`).

## Info

### IN-01: Dead no-op branch in `updateSentence` (pre-existing, not part of this diff)

**File:** `components/CardEditor.tsx:53-66`

**Issue:** 
```ts
const updated = { ...s, [field]: value }
if (field === 'korean' && s.targetForm === front) {
  updated.targetForm = front
}
return updated
```
When `field === 'korean'`, `updated.targetForm` is already `s.targetForm` (untouched by the spread). The guarded branch checks `s.targetForm === front` and then reassigns `updated.targetForm = front` — the same value it already holds. This is a no-op; it does not actually keep `targetForm` in sync with the card's `front` field when `front` itself changes (there is no listener on `front` changes at all). Not introduced by this phase's diff (only the "View history" link and button layout changed in this file), but worth flagging since the file was in scope — the auto-fill-sync behavior described by the comment does not work as written.

**Fix:** If the intent is "auto-filled sentences should track edits to the card's Front field," add a `useEffect`/handler keyed on `front` that updates any sentence whose `targetForm` still matches the *previous* front value. As written, the branch can be deleted with no behavior change.

### IN-02: `card.id` interpolated into `href` without encoding

**File:** `components/CardEditor.tsx:225`

**Issue:** `href={`/history?cardId=${card.id}`}` interpolates the id directly. Cuids are alphanumeric so this is safe in practice, but it's inconsistent with defensive practice for building query strings from dynamic values.

**Fix:** `href={`/history?cardId=${encodeURIComponent(card.id)}`}`.

### IN-03: `vitest.config.ts` alias addition is currently unused

**File:** `vitest.config.ts:5-9`

**Issue:** The new `resolve.alias['@']` entry isn't exercised by any existing test — `tests/review-history.test.ts` (added in this same phase) and every other test file under `tests/` import via relative paths (`'../lib/...'`), not `@/lib/...`. Not a bug, just unused configuration as of this diff.

**Fix:** No action required; keep for future tests that may want the `@/` alias, or drop it if it's not planned to be used.

---

## Resolution

Fixed inline by the orchestrator in commit `657038d` (not via `--fix`/`gsd-code-fixer`):

- **CR-01:** Applied the `key={cardId ?? 'all'}` fix on `<HistoryClient>` exactly as suggested.
- **WR-01:** Added `timeZone: 'UTC'` to `formatTimestamp`.
- **WR-02:** Exported `isValidOpaqueId` from `lib/review-history.ts` (single source of truth); `GET /api/reviews` and `app/history/page.tsx` both use it now — an invalid `cardId` is treated as `null`. Added 4 unit tests.
- **IN-02:** `card.id` now wrapped in `encodeURIComponent` in `CardEditor.tsx`.
- **IN-01, IN-03:** No action — IN-01 is pre-existing (outside this phase's diff) and IN-03 is inert config with no current caller.

Post-fix: `npm test` 120/120, `npm run lint` clean (0 errors), `npm run build` succeeds.

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
