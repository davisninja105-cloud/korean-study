# Phase 31: Cards List Pagination & Virtualization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-06
**Phase:** 31-cards-list-pagination-virtualization
**Areas discussed:** Card browsing layout, Scroll-loading feel, Search scope, Reading practice view

---

## Card browsing layout

| Option | Description | Selected |
|--------|-------------|----------|
| Keep grouped sections (Recommended) | React Virtuoso's "grouped mode" with sticky headers means virtualization doesn't force giving up grouped browsing; group totals come from a server count. | ✓ |
| Flatten to one list | Drop group sections; one continuous scrolling list, type filter narrows instead. | |
| Let Claude decide | No strong preference. | |

**User's choice:** Keep grouped sections (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| All expanded, as today (Recommended) | Matches current behavior; each group's first page loads on initial paint. | |
| Only Vocabulary starts open | Grammar/Phrase/Other start collapsed (tap to expand and load); lighter initial load. | ✓ |
| Remember my last state | localStorage-persisted per-group open/closed state. | |

**User's choice:** Only Vocabulary starts open

**Notes:** Research surfaced React Virtuoso's native grouped-mode-with-sticky-headers as directly matching the "keep grouped sections" decision — flagged in CONTEXT.md for research/planning to weigh.

---

## Scroll-loading feel

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-load near the bottom (Recommended) | Seamless — next batch fetches quietly as you approach the end of what's loaded. | ✓ |
| Load more button | Tap to fetch next batch; current UX research (2024-25) favors this for scroll-position stability. | |
| Let Claude decide | No strong preference. | |

**User's choice:** Auto-load near the bottom (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, preserve position (Recommended) | Closing the edit sheet returns to the exact same scroll spot with everything still loaded. | ✓ |
| Reset to top | Closing the sheet scrolls back to the top; simpler but loses your place. | |

**User's choice:** Yes, preserve position (Recommended)

**Notes:** Research noted 2024-25 UX consensus actually trends toward "Load more" buttons for exactly the scroll-position-loss reason — flagged as a tension in CONTEXT.md, but the user's explicit auto-load preference stands, made safe by the scroll-preservation decision.

---

## Search scope

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include sentences (Recommended) | Preserves today's behavior — search matches inside example sentences too, via a server-side join. | ✓ |
| Card fields only | Narrower, cheaper query; loses ability to find a card by its example-sentence text. | |

**User's choice:** Yes, include sentences (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Stay grouped (Recommended) | Search just narrows what's inside each group section. | |
| Flatten while searching | Typing a search term switches to one ungrouped, relevance-ordered list. | ✓ |

**User's choice:** Flatten while searching (against the researched recommendation)

**Notes:** Debounce delay set to ~300ms per 2024-25 UX research consensus (200ms feels instant but over-fetches, 500ms+ feels laggy) — treated as an implementation default, not asked as a user preference.

---

## Reading practice view

| Option | Description | Selected |
|--------|-------------|----------|
| Own paginated fetch (Recommended) | Opening Reading practice issues its own windowed/paginated request with the same filters as Cards. | ✓ |
| Reuse what's loaded | Shows sentences only for cards already loaded in the Cards tab; cheaper but count depends on Cards-tab scroll depth. | |
| Leave it unbounded for now | Keeps fetching every matching sentence across the full filtered deck in one request, same as today. | |

**User's choice:** Own paginated fetch (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, each tab keeps its state (Recommended) | Switching tabs never re-fetches or resets either view. | ✓ |
| Reset on switch | Each tab reloads from the top on every switch; simpler but loses your place. | |

**User's choice:** Yes, each tab keeps its state (Recommended)

---

## Claude's Discretion

- Pagination mechanism (cursor vs offset), exact page/batch size, and virtualization library choice (React Virtuoso flagged as a strong fit given the grouped-mode decision).
- Whether a new `GET /api/cards/[id]` endpoint is added so the Edit sheet can fetch a card's full sentences once the list query drops them.
- How `FreshnessWatcher`'s JSON backstop (`fetch('/api/cards')`) and `CardsClient`'s gated-adoption comparison get updated to stay correct once `GET /api/cards` becomes paginated/filtered — flagged as a correctness-critical integration seam for research to resolve explicitly.
- Exact debounce delay (~300ms, research-informed default).
- Visual/pixel details of any loading-state skeleton rows — deferred to `/gsd-ui-phase 31` (this phase has `UI hint: yes`).

## Deferred Ideas

None — discussion stayed within phase scope.
