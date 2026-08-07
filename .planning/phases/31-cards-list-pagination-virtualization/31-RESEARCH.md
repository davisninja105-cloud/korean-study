# Phase 31: Cards List Pagination & Virtualization - Research

**Researched:** 2026-08-06
**Domain:** Server-side cursor pagination (Prisma 7 + libSQL/Turso) + client-side list virtualization (React 19 / Next.js 16 App Router)
**Confidence:** MEDIUM-HIGH — architecture and library choice are grounded in live registry checks, official docs, and full reads of every file this phase touches; two items (exact debounce feel, exact page-size number) are informed defaults, not locked facts, and are logged in Assumptions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Card browsing layout**
- **D-01: Keep the grouped-by-type sections (Vocabulary/Grammar/Phrase/Other), not a flat list.** — Reversibility: costly — rationale: the pagination query shape differs materially between "one global cursor across the whole deck" and "independent pagination per group." Grouped mode was chosen up front specifically so research/planning picks the per-group-aware approach rather than building a flat cursor first and retrofitting groups later.
- **D-02: Only the Vocabulary group starts expanded on page load; Grammar/Phrase/Other start collapsed.** Deliberate change from today's "all groups start expanded." Collapsed group headers still show their true full-deck count (server-aggregated, not "how many are loaded").
- **Group total counts and the "Cards (N)" tab-toggle count must reflect the full filtered deck, not what's loaded so far.** `e2e/smoke.spec.ts` already asserts `Cards (${FIXTURE.totalCards})` on first load — this assertion must keep passing.

**Scroll-loading feel**
- **D-03: Auto-load the next batch as you approach the bottom of a group's loaded rows — no "Load more" button, no tap required.**
- **D-04: Opening and closing the Edit sheet (or the swipe-to-delete action) must never reset scroll position or discard already-loaded batches.** Pagination state must live above/outside whatever unmounts when the Sheet opens.

**Search scope**
- **D-05: Server-side search still matches inside example sentences (Korean + English), not just the card's front/back/notes.** The server query joins/filters across the `Sentence` relation, not just `Card` columns.
- **D-06: While a search term is active, results flatten out of the Vocabulary/Grammar/Phrase/Other grouping into one combined list.** Clearing the search term returns to the grouped view.
- **Debounce: ~300ms** — implementation default, not a discussed user preference.

**Reading practice view**
- **D-07: The Reading practice tab gets its own independent paginated/windowed fetch** (same lesson-range + type + search filters as the Cards tab). Reversibility: costly.
- **D-08: Each tab (Cards / Reading practice) keeps its own scroll position and loaded-batch state independently when you switch between them.**

### Claude's Discretion
- **Pagination mechanism (cursor vs offset), page/batch size, and the exact virtualization library.** Flagged: React Virtuoso's "grouped mode" may map directly onto D-01. No virtualization library exists in `package.json` today. Adding one breaks the "no new npm packages" pattern celebrated in v1.1/v1.2, but that pattern applied to those milestones' scope, not project-wide.
- **New API endpoint(s) needed** for `CardEditor`'s sentences, once the list query drops `sentences`. No `GET /api/cards/[id]` exists today.
- **`FreshnessWatcher` / `useFreshPayload` integration** — correctness-critical, must be resolved explicitly, not deferred as "optional cleanup."
- Exact widths/positions of loading-state skeleton rows — visual detail belongs to the UI-SPEC (already produced), not this research.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep suggestions arose.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CARDS-01 | `/cards` initial load queries a capped page of cards (not the full ~1056-card deck), with `sentences` excluded from the list query | See "Pagination Mechanism" (Architecture Patterns) and "Code Examples" — `getCardsPage()` cursor query with a trimmed `select` (no `sentences`), plus a parallel `groupBy` count query |
| CARDS-02 | Scrolling `/cards` to the end of the full deck stays smooth — windowed/virtualized rendering, no unbounded DOM growth | See "Standard Stack" (react-virtuoso) and "Architecture Patterns" — flat `Virtuoso` + composed-rows pattern |
| CARDS-03 | Search and lesson filter on `/cards` return correct results across the full deck, not just the loaded page (server-side query, debounced input) | See "Architecture Patterns" — server-side `where` filter composed with cursor, hand-rolled 300ms debounce hook |
</phase_requirements>

## Summary

The current `/cards` implementation does one unbounded `prisma.card.findMany()` with a full `sentences` include (`lib/cards-list.ts:getCardsList()`), shared by the RSC page, `GET /api/cards`, and `FreshnessWatcher`'s JSON backstop — at ~1056 cards / ~1616 sentences this is the single biggest remaining cold-path cost in the app. This phase replaces it with **per-type-group cursor pagination** (Prisma's native `cursor`/`take`/`skip`, keyed on `Card.id`, ordered `createdAt desc` with an `id` tiebreak) plus a parallel `groupBy(['type'])` count query for full-deck totals — the same `_count: true` shape already used in `lib/dashboard.ts`. Cursor pagination (not offset) is the right choice because it stays correct under concurrent inserts: new cards land via sync at `createdAt desc`'s *front*, which never shifts an already-fetched cursor position, whereas offset pagination would skip or duplicate rows the moment a sync adds cards mid-scroll.

For rendering, **react-virtuoso** (`react-virtuoso@4.18.11`, live on npm since 2019, ~3.25M weekly downloads, explicit React 19 peer-dep support) is the right virtualization library for this stack — but the plan should use its **flat `Virtuoso` component with a client-composed `rows` array** (header rows + card rows + loading-sentinel rows interleaved), not `GroupedVirtuoso`. `GroupedVirtuoso`'s `groupCounts` API has a documented, unresolved rough edge (`itemContent` firing for declared-empty groups — GH#319/#263) and is explicitly documented as "not fully compatible" with the flat `Virtuoso` component, which would force an awkward full-component-swap for D-06's grouped↔flat search transition. A single flat `Virtuoso` instance with header rows baked into the same array sidesteps both problems, satisfies D-01/D-02/D-06 with plain array filtering, and needs the same custom `onRangeChange`-based per-group load-more logic that `GroupedVirtuoso` would *also* need (neither component gives free per-group `endReached`). Native sticky group headers are the one thing this trades away — but nothing in the locked decisions or the approved UI-SPEC actually requires sticky headers (today's `/cards` doesn't have them either).

Three integration seams are correctness-critical and easy to get subtly wrong: (1) `CardEditor` needs a new `GET /api/cards/[id]` returning the full `CardDTO` once `sentences` drops out of the list query; (2) `FreshnessWatcher`'s `/cards` backstop must switch from "replace the whole `cards` array" to "upsert-by-id, never delete-by-omission" once `GET /api/cards` returns a partial page instead of the full deck; (3) tab-switching (D-08) and Sheet-open/close (D-04) must not unmount the virtualized list — use react-virtuoso's `getState()`/`restoreStateFrom` snapshot pair for tab switching (the Sheet is already a portal overlay and doesn't unmount `CardsClient`, so D-04 is closer to "free" as long as pagination state lives in `CardsClient`, not inside the Sheet's children).

**Primary recommendation:** Add `react-virtuoso` (flat `Virtuoso`, composed rows — not `GroupedVirtuoso`); build per-type-group cursor pagination in a new `lib/cards-list.ts` shape (`getCardsPage({ type, cursor, take, search, lessonFrom, lessonTo })` + `getCardsGroupCounts(...)`); add `GET /api/cards/[id]`; convert `FreshnessWatcher`'s `/cards` backstop to an upsert-only merge; re-measure the `/cards` on-device baseline (currently unmeasured post-Phase-30) before locking `e2e/perf.spec.ts`'s tightened threshold.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Card list pagination (cursor, per-group) | API / Backend (`lib/cards-list.ts`, `GET /api/cards`) | Database (Prisma cursor query) | Correctness (search/filter across full deck) can only be enforced where the full dataset lives — the DB — not client-side |
| Group/total counts | API / Backend (`groupBy` aggregate) | Database | Must reflect the full filtered deck even for collapsed/unloaded groups — a client-side count of loaded rows cannot satisfy this |
| List windowing / DOM-bounding | Browser / Client (`components/CardsClient.tsx` via react-virtuoso) | — | Pure rendering concern; no server involvement needed once the paginated data exists client-side |
| Search debounce | Browser / Client | — | Must delay the *request*, not filter already-loaded data (today's client-side filter must be deleted, not reused) |
| Search/filter execution | API / Backend (`where` clause spanning `Card` + `Sentence`) | Database | D-05 requires matching inside `Sentence.korean`/`translation` — only the DB has that relation loaded |
| Sentence fetch for Edit sheet | API / Backend (new `GET /api/cards/[id]`) | Database | `sentences` is dropped from the list query per CARDS-01; must be fetched on demand, not derived client-side |
| Reading practice pagination | API / Backend (new sentence-list endpoint) | Database | D-07 requires an independent server-side paginated query, not a client-side `flatMap` over Cards-tab data |
| Freshness backstop reconciliation | Browser / Client (`FreshnessWatcher` + `CardsClient` merge logic) | API / Backend (still calls `GET /api/cards`) | The *merge* strategy (upsert vs replace) is a client-side decision about how to reconcile a partial payload against already-loaded state |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-virtuoso` | `4.18.11` [VERIFIED: npm registry, `npm view react-virtuoso version`] | DOM-bounded virtualized list rendering with automatic variable-row-height measurement | The de facto React virtualization library when variable-height rows and sticky/measured layout are involved; ships first-class `onRangeChange`/`endReached`/`getState`/`restoreStateFrom` primitives this phase needs directly. Package created 2019-05-04, actively maintained through 2026-07-17, ~3.25M weekly downloads [VERIFIED: npm registry — `npm view react-virtuoso time --json`, `npm view react-virtuoso` download/repo fields]. `peerDependencies` explicitly list `react: '>=16 \|\| >=17 \|\| >= 18 \|\| >= 19'` [VERIFIED: npm registry, `npm view react-virtuoso peerDependencies`] — confirmed compatible with this project's React 19.2.4. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none — no new packages)* | — | Debounce, per-row swipe gesture, sentinel/loading rows | Hand-roll all of these — see "Don't Hand-Roll" below for the one exception (virtualization itself) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-virtuoso` (flat `Virtuoso`) | `react-virtuoso`'s `GroupedVirtuoso` | Native sticky group headers, but a documented rough edge with declared-empty groups (`itemContent` fires for 0-count groups — GH#319/#263, unresolved as of this research) [CITED: github.com/petyosi/react-virtuoso/issues/319, /issues/263], and the flat/grouped components are explicitly "not fully compatible" [CITED: virtuoso.dev/react-virtuoso/api-reference/grouped-virtuoso/], forcing a full component swap on every D-06 grouped↔flat search transition. Not worth it since nothing in this phase's locked decisions requires sticky headers. |
| `react-virtuoso` | `@tanstack/react-virtual` (`3.14.9`) [VERIFIED: npm registry] | Lower-level/headless — no automatic variable-row-height measurement, no built-in `onRangeChange` ergonomics; would require hand-rolling everything react-virtuoso ships for free, with no offsetting benefit for this use case (no grouping API either way — TanStack Virtual has zero grouping concept, same manual-flattening approach is required). Reasonable fallback if react-virtuoso's peer-dep or bundle-size profile ever becomes a blocker, but no reason to prefer it here. |
| Hand-rolled `use-debounce` package | `use-debounce` (`10.0.x`, `OK` verdict, 7.2M weekly downloads) [VERIFIED: npm registry via package-legitimacy check] | A 300ms debounce is ~10 lines (`useRef` timer + `useEffect` cleanup); the codebase already has precedent for small hand-rolled hooks (`lib/usePullToRefresh.ts`). Not worth a dependency for something this trivial — reserve "don't hand-roll" judgment for genuinely hard problems (virtualization), not easy ones. |
| Manual `IntersectionObserver` sentinel (implied by UI-SPEC wording) | react-virtuoso's `onRangeChange`/`endReached` callbacks | The UI-SPEC's "h-px invisible sentinel" language describes *user-facing behavior* (auto-load, no button, no visible trigger element) — react-virtuoso's callbacks satisfy that behavior without a literal separate sentinel DOM node. See Pitfall "UI-SPEC sentinel language ≠ implementation mandate" below. |

**Installation:**
```bash
npm install react-virtuoso
```

**Version verification:** confirmed via `npm view react-virtuoso version` → `4.18.11`, published 2026-07-17 [VERIFIED: npm registry].

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `react-virtuoso` | npm | 7+ years (created 2019-05-04) | ~3.25M/wk | github.com/petyosi/react-virtuoso | `SUS` (raw seam output — reason: `too-new`) | **Approved, with note.** The `too-new` signal is a false positive: it reads the *latest version's* publish timestamp (2026-07-17, an ordinary maintenance release), not package age. Package age (7+ years), download volume (3.25M/wk), and a real, active GitHub repo all indicate a legitimate, well-established library. Planner should still add a `checkpoint:human-verify` before the `npm install` step per the `SUS` handling rule, but this is a routine sanity-check, not a real risk signal. |
| `@tanstack/react-virtual` | npm | Long-established (TanStack org) | ~21.3M/wk | github.com/TanStack/virtual | `SUS` (reason: `too-new`, same false-positive pattern) | **Not recommended** (see Alternatives Considered) — not being installed, audit row included only because it was evaluated as a candidate. |
| `use-debounce` | npm | — | ~7.2M/wk | github.com/xnimorz/use-debounce | `OK` | **Not recommended** (hand-roll instead) — not being installed. |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `react-virtuoso` — flagged only due to the seam's "too-new" heuristic misreading a recent patch-release date as package immaturity; age/downloads/repo checks above resolve the concern. Planner must still add a `checkpoint:human-verify` task immediately before `npm install react-virtuoso` per the standing `SUS` handling rule.

## Architecture Patterns

### System Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser — components/CardsClient.tsx ('use client')                      │
│                                                                            │
│  search input ──[300ms debounce]──▶ pendingQuery                         │
│  type filter / lesson range ───────▶ pendingFilters                      │
│                                                                            │
│  pendingQuery/Filters change                                             │
│        │                                                                  │
│        ▼                                                                  │
│  refetch first page PER EXPANDED GROUP (+ counts) ──┐                    │
│        │                                             │                    │
│  scroll near bottom of a group's loaded rows          │  fetch           │
│  (Virtuoso onRangeChange → per-group threshold check) │  requests        │
│        │                                             │                    │
│        ▼                                             ▼                    │
│  ┌───────────────────────────────┐   GET /api/cards?type=&cursor=&take=  │
│  │ react-virtuoso <Virtuoso>       │◀──────────────────────────────────┐ │
│  │ rows = [header, card, card, …,  │                                    │ │
│  │         loading-sentinel]       │   GET /api/cards?groupCounts=1     │ │
│  │ per group, filtered by          │◀── (or a dedicated counts route)  │ │
│  │ collapsed-state + search mode   │                                    │ │
│  └───────────────────────────────┘                                    │ │
│        ▲                                                               │ │
│  tab switch (Cards ⇄ Reading practice) ── getState()/restoreStateFrom  │ │
│        │                                                               │ │
│  Sheet open (Edit) ──▶ GET /api/cards/[id] (full CardDTO w/ sentences) │ │
│                                                                          │ │
│  FreshnessWatcher boundary event ──▶ GET /api/cards (page 1, no cursor)│ │
│        │  upsert-by-id merge into loaded rows (never delete-by-omission)│ │
└────────┼─────────────────────────────────────────────────────────────┼─┘
         │                                                              │
         ▼                                                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ API / Backend — app/api/cards/route.ts, app/api/cards/[id]/route.ts      │
│                                                                            │
│  GET /api/cards          → lib/cards-list.ts:getCardsPage()              │
│                             (per-type cursor query, sentences excluded)   │
│  GET /api/cards (counts) → lib/cards-list.ts:getCardsGroupCounts()       │
│                             (prisma.card.groupBy, full-deck aggregate)    │
│  GET /api/cards/[id]     → full CardDTO incl. sentences (NEW route)      │
│  GET /api/cards/sentences→ lib/cards-list.ts:getSentencesPage() (NEW,    │
│                             D-07's independent Reading practice fetch)   │
└─────────────────────────┬──────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Database — Turso / libSQL via Prisma 7 (@prisma/adapter-libsql)          │
│  Card (cursor on id, orderBy createdAt desc + id tiebreak)               │
│  Sentence (joined for D-05 search; own cursor query for D-07)            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
lib/
├── cards-list.ts          # REWRITTEN: getCardsPage(), getCardsGroupCounts(), getSentencesPage()
├── dto.ts                 # ADD: CardsPageDTO { cards, nextCursor, hasMore }, GroupCountsDTO
components/
├── CardsClient.tsx         # REWRITTEN: owns per-group cursor state, debounce, Virtuoso rows composition
├── CardsVirtualList.tsx    # NEW (optional split): the <Virtuoso> wrapper + row-composition logic
app/
├── api/cards/route.ts      # REWRITTEN: GET reads ?type=&cursor=&take=&search=&lessonFrom=&lessonTo=&counts=
├── api/cards/[id]/route.ts # ADD: GET handler (full CardDTO)
├── api/cards/sentences/route.ts  # NEW: D-07's Reading practice endpoint
```

### Pattern 1: Per-group cursor pagination with a parallel full-deck count query

**What:** Each type-group (`vocabulary`/`grammar`/`phrase`/`other`) is paginated independently via its own cursor; a single `groupBy` query alongside it gives every group's full-deck count regardless of which groups are expanded/loaded.
**When to use:** Every `GET /api/cards` call — both the RSC page's initial load (Vocabulary's first page + all-group counts) and later per-group "load more" / group-expand requests.
**Example:**
```typescript
// Source: pattern verified against lib/dashboard.ts:24 (groupBy shape already
// used in this codebase) [VERIFIED: lib/dashboard.ts:24 — `prisma.card.groupBy({ by: ['type'], _count: true })`]
// and Prisma cursor-pagination docs [CITED: prisma.io/docs/orm/prisma-client/queries/pagination]

const PAGE_SIZE = 30

export async function getCardsPage(params: {
  type: string          // 'vocabulary' | 'grammar' | 'phrase' | 'other' | 'all' (search mode)
  cursor: string | null // last-seen Card.id, or null for page 1
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
}) {
  const where = buildCardsWhere(params) // shared with getCardsGroupCounts — see Pitfall below

  const rows = await prisma.card.findMany({
    where,
    select: cardSelectNoSentences, // CARDS-01: sentences excluded entirely
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // id tiebreak for cursor determinism
    take: PAGE_SIZE + 1,           // fetch one extra to detect hasMore cheaply
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {}),
  })

  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const nextCursor = hasMore ? page[page.length - 1].id : null
  return { cards: page, nextCursor, hasMore }
}

export async function getCardsGroupCounts(params: {
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
}) {
  const where = buildCardsWhere({ ...params, type: 'all' })
  // Same shape already used in lib/dashboard.ts — [VERIFIED: lib/dashboard.ts:24]
  const grouped = await prisma.card.groupBy({ by: ['type'], where, _count: true })
  const total = grouped.reduce((sum, g) => sum + g._count, 0)
  return { byType: grouped, total }
}
```

### Pattern 2: Composed rows for a flat `Virtuoso` (not `GroupedVirtuoso`)

**What:** A single discriminated-union array drives one `<Virtuoso>` instance for both the grouped browse view (D-01/D-02) and the flattened search view (D-06) — group headers are just rows, not a separate library API.
**When to use:** Building the `rows` prop passed to `<Virtuoso data={rows} itemContent={...} />`.
**Example:**
```typescript
// Source: react-virtuoso official docs [CITED: virtuoso.dev/react-virtuoso/api-reference/grouped-virtuoso/]
// confirm GroupedVirtuoso's groupCounts/groupContent shape; this pattern
// deliberately avoids that API for the reasons in "Alternatives Considered".

type Row =
  | { kind: 'header'; groupKey: string; label: string; count: number; collapsed: boolean }
  | { kind: 'card'; groupKey: string; card: CardDTO }
  | { kind: 'loading'; groupKey: string }
  | { kind: 'end'; groupKey: string }

function composeRows(
  groups: { key: string; label: string; count: number; loaded: CardDTO[]; hasMore: boolean; loading: boolean }[],
  collapsed: Record<string, boolean>,
  searchActive: boolean
): Row[] {
  if (searchActive) {
    // D-06: flatten — one combined list, no header rows at all.
    return groups.flatMap((g) => g.loaded.map((card) => ({ kind: 'card' as const, groupKey: g.key, card })))
  }
  return groups.flatMap((g) => {
    const header: Row = { kind: 'header', groupKey: g.key, label: g.label, count: g.count, collapsed: collapsed[g.key] }
    if (collapsed[g.key]) return [header]
    const cardRows: Row[] = g.loaded.map((card) => ({ kind: 'card', groupKey: g.key, card }))
    const tail: Row = g.loading ? { kind: 'loading', groupKey: g.key } : g.hasMore ? [] as unknown as Row : { kind: 'end', groupKey: g.key }
    return [header, ...cardRows, ...(Array.isArray(tail) ? [] : [tail])]
  })
}
```

### Pattern 3: Per-group auto-load via `onRangeChange` (not a manual `IntersectionObserver`)

**What:** Detect when the visible range is within N rows of a specific group's loaded-row boundary, and fetch that group's next cursor page — independent of whether the *whole list* has reached its bottom.
**When to use:** Replaces the UI-SPEC's described "h-px sentinel" — the sentinel language describes the desired *user-facing* behavior (auto-load, no button), which `onRangeChange` satisfies without a literal sentinel DOM element.
**Example:**
```typescript
// Source: react-virtuoso onRangeChange / endReached shape [CITED: virtuoso.dev/react-virtuoso/virtuoso/endless-scrolling/]
<Virtuoso
  data={rows}
  computeItemKey={(_, row) => row.kind === 'card' ? row.card.id : `${row.kind}-${row.groupKey}`}
  itemContent={(_, row) => renderRow(row)}
  rangeChanged={({ endIndex }) => {
    const visibleRow = rows[endIndex]
    if (!visibleRow) return
    const group = groups.find((g) => g.key === visibleRow.groupKey)
    if (!group || group.loading || !group.hasMore) return
    // Trigger when within 5 rows of this group's last loaded row.
    const groupCardRows = rows.filter((r) => r.kind === 'card' && r.groupKey === group.key)
    const lastCardIndex = rows.lastIndexOf(groupCardRows[groupCardRows.length - 1])
    if (endIndex >= lastCardIndex - 5) fetchNextPage(group.key)
  }}
/>
```

### Pattern 4: Tab-switch state preservation via `getState()`/`restoreStateFrom`

**What:** D-08 requires Cards and Reading practice to keep independent scroll position and loaded batches when switching tabs. `display:none`-hiding a mounted `<Virtuoso>` risks broken height computation on unhide (a documented general class of virtualizer issue) — the officially documented purpose-built alternative is a snapshot/restore pair.
**When to use:** On tab switch away, snapshot; on switch back, restore.
**Example:**
```typescript
// Source: react-virtuoso getState/restoreStateFrom [CITED: virtuoso.dev/react-virtuoso/api-reference/grouped-virtuoso/ — same StateSnapshot API on flat Virtuoso]
const virtuosoRef = useRef<VirtuosoHandle>(null)
const [snapshot, setSnapshot] = useState<StateSnapshot | undefined>()

// on switching away from this tab:
virtuosoRef.current?.getState((s) => setSnapshot(s))

// on remount (switching back):
<Virtuoso ref={virtuosoRef} restoreStateFrom={snapshot} data={rows} ... />
```
Note: loaded row *data* (the `groups` state) must be kept in `CardsClient`'s React state regardless — `getState()` only captures scroll offset and measured sizes, not the data itself [CITED: virtuoso.dev docs — "does not include the data items"].

### Anti-Patterns to Avoid
- **Reusing `GroupedVirtuoso` for the sake of "it has grouping built in":** its declared-empty-group rough edge and incompatibility with flat `Virtuoso` cost more than the sticky-header convenience is worth here (see Alternatives Considered).
- **Offset (`skip`/page-number) pagination for the card list:** breaks under concurrent sync inserts — a classic, well-documented offset-pagination failure mode [CITED: prisma.io/docs/orm/prisma-client/queries/pagination].
- **`FreshnessWatcher` doing a wholesale `setCards(freshCards)` replace once `/api/cards` is paginated:** silently truncates every loaded page/group down to whatever the backstop's first-page call happened to return. Must become an upsert-by-id merge (see Pitfall below).
- **Client-side `.filter()` over an in-memory `cards` array for search/lesson-range (today's `CardsClient.tsx` lines ~109-131):** this entire block must be deleted, not adapted — CARDS-03 requires the filter to run server-side against the full deck, not the currently-loaded page.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM-bounded virtualized list rendering with variable-height rows | A custom `IntersectionObserver` + manual `overflow` windowing scheme | `react-virtuoso` | Variable-height Korean card rows (0-3 sentences, optional notes) make manual height measurement genuinely hard to get right (scroll-jump on re-measure is the classic bug); react-virtuoso already solves this and ships the exact `onRangeChange`/`getState` primitives this phase's D-03/D-04/D-08 need |

**Key insight:** The 300ms debounce and the swipe-gesture rows are NOT in this category — they're simple, already-precedented patterns (`lib/usePullToRefresh.ts` is a comparable hand-rolled hook already in this codebase) and do not warrant a new dependency. Reserve "don't hand-roll" for problems where getting it subtly wrong is expensive to detect (virtualization/scroll jank), not problems where a wrong implementation fails loudly and immediately (a debounce timer that doesn't debounce is obvious in five seconds of manual testing).

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. No stored data, live service config, OS-registered state, secrets, or build artifacts carry the "unpaginated cards list" concept by name; this is a data-shape and rendering change only.

## Common Pitfalls

### Pitfall 1: `FreshnessWatcher`'s backstop silently truncating loaded state
**What goes wrong:** `components/FreshnessWatcher.tsx` calls `fetch('/api/cards')` with no params and pushes the raw array into `useFreshPayload()`'s `cards` slot [VERIFIED: components/FreshnessWatcher.tsx:102-110]. `CardsClient.tsx`'s gated-adoption effect (lines 93-100) does `setCards(freshCards)` — a full replace [VERIFIED: components/CardsClient.tsx:93-100]. Once `GET /api/cards` returns a single group's single page instead of the full deck, this replace would discard every other loaded group and every loaded page beyond page 1 the instant a boundary-refresh event fires (tab focus, back/forward nav) — silently breaking D-04.
**Why it happens:** The gated-adoption logic (`prevInitialCards`/`prevFreshCards`, `editingId === null && !showAdd && !adding && deletingIds.size === 0`) was designed under the assumption that both `initialCards` and `freshCards` are always "the same shape of full list" [VERIFIED: components/CardsClient.tsx:62-76, comment block]. Pagination breaks that assumption without touching the gate logic itself.
**How to avoid:** Change the merge strategy from replace to upsert-by-id: for each card in the fresh payload, update or insert it into the existing loaded groups' arrays by id; never remove a card merely because it's absent from the (now-partial) fresh payload. Deletions remain handled by the existing optimistic `handleDelete` path, which already works independent of this backstop.
**Warning signs:** Scroll position resets or loaded rows below page 1 vanish after backgrounding/foregrounding the tab or navigating back to `/cards`.

### Pitfall 2: The `e2e/smoke.spec.ts` total-count assertion silently passing for the wrong reason
**What goes wrong:** `Cards (${FIXTURE.totalCards})` (`FIXTURE.totalCards = 8`) [VERIFIED: e2e/fixture.ts:26] is small enough that a naive implementation using `filteredCards.length` (today's client-derived count, from the currently-loaded rows) would coincidentally still pass in the 8-card fixture even if the server-aggregate count query were never wired up — because with an 8-card deck, "loaded" and "total" are trivially the same number under any reasonable page size.
**Why it happens:** The e2e fixture is deliberately small (fast, deterministic tests); it cannot distinguish "count reflects the full deck" from "count reflects what happened to load" at this scale.
**How to avoid:** Verify manually (or via a unit test against `getCardsGroupCounts`) against the real ~1056-card production-shaped dataset, not just the e2e fixture, that the header/tab counts come from the `groupBy` aggregate and not `rows.length`. The plan should include an explicit verification step for this, since the existing e2e suite cannot catch a regression here.

### Pitfall 3: `GroupedVirtuoso`'s empty-group `itemContent` calls
**What goes wrong:** Declaring a group with `groupCounts[i] = 0` (the natural way to represent "no cards loaded yet in a collapsed group") still triggers `itemContent` calls for that group in some versions, unlike the flat `Virtuoso` component which correctly skips `itemContent` for an empty list [CITED: github.com/petyosi/react-virtuoso/issues/319, /issues/263 — issues remain open with no confirmed resolution as of this research].
**Why it happens:** Documented discrepancy between how `GroupedVirtuoso` and flat `Virtuoso` handle zero-length groups internally.
**How to avoid:** This phase's recommendation (flat `Virtuoso` + composed rows, Pattern 2 above) sidesteps the issue entirely — a collapsed group simply contributes one header row and zero card rows to the composed array, with no group-count-based API involved.
**Warning signs:** N/A if `GroupedVirtuoso` is avoided per this research's recommendation; if a future maintainer reaches for `GroupedVirtuoso` anyway, watch for `itemContent` firing with unexpected/undefined item data for collapsed groups.

### Pitfall 4: SQLite `LIKE` case-sensitivity for non-ASCII (Korean) text
**What goes wrong:** Prisma's `contains` filter maps to SQL `LIKE '%value%'` on the SQLite/libSQL provider. SQLite's default `LIKE` is case-insensitive for ASCII characters but does not case-fold non-ASCII text — this is a non-issue for Hangul (no case duality exists in Korean) but worth a deliberate note since today's client-side search explicitly lowercases both sides before comparing (`components/CardsClient.tsx:120-127` [VERIFIED]), and there is no direct Prisma equivalent of `mode: 'insensitive'` on SQLite (that option is Postgres/MongoDB-only).
**Why it happens:** Moving search server-side changes the underlying string-matching engine from JS `.includes()` (always case-fold-safe once `.toLowerCase()`'d) to SQL `LIKE`.
**How to avoid:** Lowercase the search query string before passing it to `contains` (SQLite's ASCII case-insensitivity then covers English `back`/`translation` matches identically to today; Hangul fields are unaffected by casing either way). Flag as a verification item during planning rather than treating as a blocking unknown — this is a one-manual-query check, not an architecture decision.
**Warning signs:** An English-language search term with mixed case (e.g., "School") returning fewer results server-side than the same query did client-side pre-migration.

### Pitfall 5: UI-SPEC's "sentinel" language read as a literal implementation mandate
**What goes wrong:** The UI-SPEC describes an "Infinite-scroll sentinel: `h-px` … invisible, spacing-neutral trigger element positioned after each group's last loaded row" and explicitly frames it as "a technical `IntersectionObserver` trigger target" [VERIFIED: 31-UI-SPEC.md:54]. Read literally, this could be (mis)implemented as a hand-rolled `IntersectionObserver` bolted onto a react-virtuoso list — redundant and likely to conflict with virtuoso's own virtualization (off-screen "sentinel" rows aren't real intersecting DOM nodes in a virtualized list the way they are in a plain scrolling `<div>`).
**Why it happens:** The UI-SPEC was authored to describe user-facing behavior and was not required to assume a specific rendering library (this research phase runs after the UI-SPEC).
**How to avoid:** Treat the UI-SPEC's sentinel description as a *behavioral* contract (auto-load, no visible button, positioned at the end of loaded rows) satisfied by react-virtuoso's `onRangeChange`/`endReached` (Pattern 3 above), not a literal DOM-element mandate. The "Loading more…" caption and skeleton rows it describes become `{ kind: 'loading' }` rows in the composed array (Pattern 2), not a separate observed element.
**Warning signs:** A plan or implementation that tries to render a real `<div className="h-px">` sentinel *inside* a virtualized viewport and wires a separate `IntersectionObserver` to it, duplicating what `onRangeChange` already provides.

## Code Examples

### `GET /api/cards/[id]` — full CardDTO, symmetric with existing PUT
```typescript
// Source: pattern matches the existing PUT handler's return shape
// [VERIFIED: app/api/cards/[id]/route.ts:81-87 — PUT already returns the
// full updated card with `include: { review: true, sentences: sentencesInclude }`]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const card = await prisma.card.findUnique({
    where: { id },
    include: {
      review: true,
      lesson: { select: { title: true, createdAt: true, orderIndex: true } },
      sentences: { orderBy: { orderIndex: 'asc' } },
    },
  })
  if (!card) return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  // Serialize dates to ISO strings (RSC-05 / CardDTO contract) — same pattern
  // as app/api/cards/route.ts POST handler [VERIFIED: app/api/cards/route.ts:49-68]
  const dto = { /* ...same serialization shape as POST's `dto` above... */ }
  return NextResponse.json(dto)
}
```
Rationale for returning the **full** `CardDTO` rather than a narrower `SentenceDTO[]`-only shape: `PUT`/`POST` on this same resource already return the full card [VERIFIED: app/api/cards/route.ts:49-68, app/api/cards/[id]/route.ts:87], so `GET` matching that shape keeps the resource's representation consistent and lets `CardEditor` merge the response the same way `handleSave` already does (`{ ...c, ...updated }`), with no new merge branch to write or test.

### Hand-rolled 300ms debounce (no new dependency)
```typescript
// Source: pattern precedented by lib/usePullToRefresh.ts (existing hand-rolled hook)
// react-hooks/purity-safe: no Date.now()/Math.random() in render; timer lives in an effect.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
// Usage: const debouncedSearch = useDebouncedValue(search, 300)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| One unbounded `findMany()` with full `sentences` include, client-side `.filter()` for search/lesson-range | Per-group cursor pagination + server-side `where` filtering + windowed rendering | This phase (v1.8 P3.2) | Initial payload drops from ~1056 cards + ~1616 sentence rows to one group's page (~30 rows, no sentences); DOM node count stays bounded regardless of scroll depth |
| All groups expanded on load | Only Vocabulary expanded (D-02) | This phase | Fewer rows fetched/rendered on first paint; other groups' counts still shown (server aggregate) without fetching their rows |

**Deprecated/outdated:**
- Client-side array `.filter()` for search/type/lesson-range (`components/CardsClient.tsx:109-131`) — replaced by server-side `where` clauses; cannot correctly search a deck larger than the loaded page.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Page/batch size of 30 cards per group per page is a reasonable default | Architecture Patterns, Pattern 1 | Too small → more round trips; too large → defeats the payload-reduction goal. Low risk either way since it's a tunable constant, not an architectural commitment — the plan should treat this as adjustable, not locked. |
| A2 | SQLite/libSQL `LIKE` case-insensitivity for ASCII behaves identically to today's `.toLowerCase()` client-side comparison, with no PRAGMA override active in this project | Common Pitfalls, Pitfall 4 | If wrong, English-text search (back/translation fields) could return fewer/more results server-side than before. Verifiable with one manual query during planning/execution — not a blocking unknown. |
| A3 | Sticky group headers are not a hard requirement of this phase (UI-SPEC does not describe sticky group-header behavior, only a sticky top search bar) | Standard Stack — Alternatives Considered | If a later UI review decides sticky group headers ARE wanted, the flat-`Virtuoso`-with-composed-rows approach would need a manually-implemented sticky-header CSS technique (`position: sticky` on header rows inside a `Virtuoso` item is a known, documented technique, not a redesign) — moderate, not high, cost to add later. |
| A4 | 5-row proximity threshold for per-group auto-load (Pattern 3's `endIndex >= lastCardIndex - 5`) is a reasonable default | Architecture Patterns, Pattern 3 | Too small a threshold → visible pop-in; too large → over-fetches. Tunable constant, not an architectural commitment. |

**If this table is empty:** N/A — see rows above.

## Open Questions

0. **Pre-planning gap: the `/cards` on-device baseline has not been re-measured since Phase 30 landed.**
   - What we know: `.planning/ROADMAP.md` §Progress explicitly instructs "Re-measure the baseline table after Phase 30 before starting Phase 31" [VERIFIED: .planning/ROADMAP.md:250], and `.planning/STATE.md` §Operator Next Steps repeats the same instruction [VERIFIED: .planning/STATE.md:109]. The current table still shows the pre-Phase-30 number (`Tab → /cards: 6.4s baseline, <1.0s target`) [VERIFIED: .planning/ROADMAP.md:122]. Success Criterion 1 of this phase references "its `e2e/perf.spec.ts` page-load budget passes at a tightened threshold" — that threshold is currently `3000ms` for `/cards`, still at the original generous Phase-30-era guard-rail, not yet tightened [VERIFIED: e2e/perf.spec.ts:34 `'/cards': 3000,`].
   - What's unclear: Whether Phase 30's changes (skeleton screens, region pin, synchronous root layout) moved the `/cards`-specific number at all — Phase 30's own success criteria only named `/habits` as "the cleanest pure-round-trip signal" for tightening [VERIFIED: .planning/ROADMAP.md:158], meaning `/cards` was deliberately left at its original baseline pending this phase's real fix. So the "gap" is less "a stale number" and more "no number has ever been captured for what Phase 31's *changes* achieve" — the 6.4s figure describes the OLD, unpaginated `/cards`, not a target this phase's plan can validate against directly.
   - Recommendation: This is not a blocking research gap — it is a **planning-time task**. The plan should include an explicit step (either as its own task or as part of the verification wave) to: (a) confirm whether an on-device re-measurement of the *current* (pre-Phase-31) `/cards` load time was captured anywhere before this phase's changes land (if not, capture one now as the "before" baseline this phase is judged against), and (b) tighten `e2e/perf.spec.ts`'s `/cards` budget from `3000ms` to a real number only after measuring the *post-Phase-31* on-device load time — do not guess a tightened threshold up front. Treat Success Criterion 1's "tightened threshold" as provisional until this measurement exists.

1. **Exact page/batch size and auto-load proximity threshold (A1, A4).**
   - What we know: Cursor pagination and per-group `onRangeChange`-triggered loading are the right mechanisms.
   - What's unclear: The precise numbers (30 rows/page, 5-row proximity) are informed defaults, not measured against the real ~1056-card production dataset's actual row heights/network characteristics.
   - Recommendation: Ship with these defaults; treat as a tunable constant the plan can adjust after the first on-device measurement pass (see Pitfall/Gap below re: baseline re-measurement).

2. **Whether `getCardsGroupCounts` should be a separate query param on `GET /api/cards` (`?counts=1`) or a fully separate route (`GET /api/cards/counts`).**
   - What we know: Both the RSC page's initial load and any later group-expand/filter-change need the counts refreshed together with (or independent of) the row fetch.
   - What's unclear: Whether bundling counts into the same response as the first page's rows (single round trip on initial load) outweighs the clarity of a separate endpoint for cache/revalidation purposes.
   - Recommendation: Bundle into the same `GET /api/cards` response when `cursor` is absent (i.e., the "page 1" response also carries `groupCounts`); subsequent "load more" calls (which always have a cursor) skip the counts payload. This keeps the initial-load round-trip count minimal without inventing a second route.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm registry access | `npm install react-virtuoso` | ✓ | — | — |
| Node.js | build/dev | ✓ | 25.8.2 [VERIFIED: environment] | — |
| Turso/libSQL (production) | cursor query correctness at scale | Not directly probed this session (no live DB connection attempted) | — | Local dev already runs against the same libSQL adapter (`file:` vs `libsql:` per `CLAUDE.md`), so cursor-query behavior is testable locally before deploy |

No missing dependencies with no fallback. No missing dependencies with fallback beyond the note above.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit) [VERIFIED: package.json] + Playwright 1.61.1 (e2e) [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (unit, excludes `e2e/**`) [VERIFIED: vitest.config.ts:14] / `playwright.config.ts` (e2e, port 3100, isolated test DB) [VERIFIED: playwright.config.ts] |
| Quick run command | `npm test` (Vitest, no DB needed for pure `lib/` functions) |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CARDS-01 | `getCardsPage` returns a capped page with no `sentences` field | unit | `npx vitest run tests/cards-list.test.ts` | ❌ Wave 0 — new file needed |
| CARDS-01 | `/cards` page-load budget tightened and green | e2e | `npx playwright test e2e/perf.spec.ts -g "cards"` | ✅ exists, budget needs tightening (currently 3000ms, generic) |
| CARDS-01 | `e2e/smoke.spec.ts` total-count assertion still passes | e2e | `npx playwright test e2e/smoke.spec.ts -g "Cards renders"` | ✅ exists — but see Pitfall 2, fixture is too small to catch a `filteredCards.length` regression on its own |
| CARDS-02 | DOM node count stays bounded while scrolling | manual / new e2e | Manual on-device check (per Pitfall 2 rationale, e2e fixture too small to exercise virtualization meaningfully) | ❌ Wave 0 gap — no automated large-deck e2e fixture exists |
| CARDS-03 | Server-side search matches inside sentences across the full deck | unit | `npx vitest run tests/cards-list.test.ts` (search `where`-builder) | ❌ Wave 0 — new file needed |
| CARDS-03 | Debounce prevents per-keystroke requests | unit | `npx vitest run tests/use-debounced-value.test.ts` (or inline in a component test) | ❌ Wave 0 — new file needed |
| — | `GET /api/cards/[id]` returns full CardDTO | unit/integration | Follow the existing pattern in `tests/review-route.test.ts` (route-level test against a seeded DB) [VERIFIED: tests/review-route.test.ts exists] | ❌ Wave 0 — new file needed, existing sibling pattern to copy |
| — | `FreshnessWatcher` merge is upsert-only, never deletes on omission | unit | New test in the freshness test family (`e2e/freshness-*.spec.ts` already covers this area at the e2e level) | ❌ Wave 0 — consider extending an existing `e2e/freshness-*.spec.ts` file rather than a new unit test, since the merge logic lives inside `CardsClient.tsx`'s effect body |

### Sampling Rate
- **Per task commit:** `npm test` (fast, no DB)
- **Per wave merge:** `npm test && npx playwright test e2e/smoke.spec.ts e2e/perf.spec.ts e2e/freshness-*.spec.ts`
- **Phase gate:** Full suite (`npm test && npm run test:e2e`) green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/cards-list.test.ts` — covers CARDS-01 (page shape, no sentences) and CARDS-03 (`where`-builder for search/lesson-range/type)
- [ ] A route-level test for `GET /api/cards/[id]`, following `tests/review-route.test.ts`'s existing pattern
- [ ] Manual on-device verification protocol for CARDS-02 (bounded DOM growth) — the e2e fixture (8 cards) is too small to meaningfully exercise virtualization; recommend a documented manual check against the real deck (or a one-off local seed script bumping the fixture count for a single manual test run), not a new permanent e2e fixture, to avoid slowing down every e2e run
- [ ] Extend an existing `e2e/freshness-*.spec.ts` file (not a new one) to assert the upsert-not-replace merge behavior once `/api/cards` is paginated

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing `middleware.ts` HMAC cookie gate covers `/api/cards*` already |
| V3 Session Management | no (unchanged) | Same stateless HMAC cookie, untouched by this phase |
| V4 Access Control | no (single-tenant app, no per-user data) | N/A |
| V5 Input Validation | **yes** | New query params (`cursor`, `type`, `search`, `lessonFrom`, `lessonTo`, `take`) must be validated before reaching Prisma — same discipline as the existing `PUT` handler's field-type checks [VERIFIED: app/api/cards/[id]/route.ts:19-42] |
| V6 Cryptography | no | N/A — no new secrets/crypto surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unbounded `take`/`cursor` params allowing a client to force an expensive query (e.g., `take=999999`) | Denial of Service | Clamp `take` server-side to a fixed max (e.g., `Math.min(requestedTake, 100)`), never trust the client-supplied value directly — mirrors the existing pattern of server-defined session sizes in `lib/settings.ts` |
| A malformed/non-existent `cursor` id (e.g., a stale or forged card id) passed to Prisma's `cursor` option | Tampering | Prisma's cursor pagination silently returns an empty page (not an error) when the cursor row doesn't exist for the given `where`+`orderBy` — confirm this is treated as `hasMore: false` gracefully, not surfaced as a 500. Validate the cursor is a well-formed cuid string before querying (same input-validation posture as the existing `id` param handling in `app/api/cards/[id]/route.ts`) |
| Search query string reflected into a `LIKE` pattern | Tampering (SQL injection) | Not exploitable via Prisma's parameterized query builder (`contains` never gets raw-string-interpolated) — no `$queryRaw`/`$executeRaw` needed anywhere in this phase's design, so this class of risk does not apply |

## Sources

### Primary (HIGH confidence)
- `npm view react-virtuoso version` / `time --json` / `peerDependencies` — live registry data [VERIFIED: npm registry]
- `gsd-tools query package-legitimacy check` — verdicts for `react-virtuoso`, `@tanstack/react-virtual`, `use-debounce` [VERIFIED: package-legitimacy seam]
- Full reads this session of: `lib/cards-list.ts`, `app/cards/page.tsx`, `components/CardsClient.tsx`, `components/FreshnessWatcher.tsx`, `app/api/cards/route.ts`, `app/api/cards/[id]/route.ts`, `components/CardEditor.tsx`, `components/LessonRangeFilter.tsx`, `lib/study-cards.ts`, `lib/dashboard.ts` (groupBy precedent), `prisma/schema.prisma`, `lib/dto.ts`, `e2e/perf.spec.ts`, `e2e/smoke.spec.ts`, `e2e/fixture.ts`, `components/SwipeRow.tsx`, `vitest.config.ts`, `playwright.config.ts`, `.planning/config.json`

### Secondary (MEDIUM confidence)
- virtuoso.dev official docs — `GroupedVirtuoso` API reference, endless-scrolling guide [CITED: virtuoso.dev/react-virtuoso/api-reference/grouped-virtuoso/, virtuoso.dev/react-virtuoso/virtuoso/endless-scrolling/]
- Prisma official docs — cursor-based pagination [CITED: prisma.io/docs/orm/prisma-client/queries/pagination]
- GitHub issues #319 / #263 (petyosi/react-virtuoso) — documented empty-group `itemContent` behavior [CITED: github.com/petyosi/react-virtuoso/issues/319, /issues/263]

### Tertiary (LOW confidence)
- General WebSearch summaries used to locate the above primary sources — not independently cited as claims, only as pointers to the CITED sources above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — react-virtuoso version/peer-deps/downloads all live-verified this session; the decision to use flat `Virtuoso` over `GroupedVirtuoso` is grounded in two independently-cited documented issues, not speculation.
- Architecture (pagination shape, endpoint design): HIGH — cursor-vs-offset tradeoff is well-established Prisma-documented behavior; per-group cursor design directly follows from the locked D-01 grouping decision; `groupBy` count pattern is an exact in-repo precedent (`lib/dashboard.ts`), not a new idiom.
- Pitfalls (FreshnessWatcher merge, e2e fixture blind spot, SQLite LIKE casing): MEDIUM-HIGH — grounded in full reads of the actual current code, but the SQLite casing behavior (Pitfall 4) is flagged for a quick manual verification rather than asserted as tested fact this session.

**Research date:** 2026-08-06
**Valid until:** ~2026-09-05 (30 days — stable domain: Prisma/Next.js/React versions are pinned in this project, react-virtuoso's core API (`Virtuoso`, `onRangeChange`, `getState`) is long-stable; re-verify package version/legitimacy if planning is delayed past this window)
