# Phase 34: Local-First Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 34-local-first-shell
**Areas discussed:** Background-refresh affordance, Offline signal, Pull-to-refresh scope, Pull-to-refresh semantics, Cards offline depth

---

## Background-refresh affordance

| Option | Description | Selected |
|--------|-------------|----------|
| Small subtle indicator | A small, quiet marker (e.g. near the header) shows only while a background check is in flight, then disappears. Content itself doesn't flash or shift — it just silently swaps in if something changed. | ✓ |
| No visible indicator | Fully silent — cached content shows, the check happens invisibly, and the UI only reacts if data actually changed. Simplest, but gives zero feedback that a check even happened. | |
| You decide | Claude picks a reasonable, low-noise pattern consistent with existing skeleton/toast conventions. | |

**User's choice:** Small subtle indicator
**Notes:** Exact placement/copy deferred to `/gsd-ui-phase 34` (this phase has `UI hint: yes`).

---

## Offline signal

| Option | Description | Selected |
|--------|-------------|----------|
| Seamless — no distinction | Cached data just renders normally; a silently-failing background refresh shows nothing. | |
| Small offline indicator | A small persistent marker appears while the device has no connection, disappearing once connectivity returns. | ✓ |
| You decide | Claude picks based on what's cheap to build correctly without new dependencies. | |

**User's choice:** Small offline indicator
**Notes:** Distinct signal from the background-refresh indicator above — device online-with-a-check-running and device fully offline are different states and get different signals.

---

## Pull-to-refresh scope

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 routes | Home/Study/Cards/Habits each get pull-to-refresh, wired to bypass that route's cache + version check. | ✓ |
| Home only | Keep today's scope; other routes rely purely on automatic version-check revalidation with no manual override. | |

**User's choice:** All 4 routes
**Notes:** Matches the source design doc's "recoverable from the phone" framing for the manual escape hatch.

---

## Pull-to-refresh semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Route-local refresh only | Study/Cards/Habits pull-to-refresh bypasses that route's cache + version check and re-fetches its own data only — no Google Doc sync triggered. Home keeps its existing "Pull to sync" behavior (full doc sync). | ✓ |
| Same Google Doc sync everywhere | Every route's pull-to-refresh triggers the same full `/api/sync` call Home does, then also bypasses that route's cache. | |

**User's choice:** Route-local refresh only (recommended)
**Notes:** Home's existing `handleSync` keeps its meaning; Study/Cards/Habits get a separate, lighter action ("Pull to refresh" / "Refreshing…") rather than a parameterized single function, so the two stay cheap to keep distinct.

---

## Cards offline depth

| Option | Description | Selected |
|--------|-------------|----------|
| Whatever was loaded this session | Cache accumulates as you scroll/search during a normal (online) visit; offline shows exactly that much — matches Phase 31's incremental-loading model. | ✓ |
| You decide | Claude weighs IndexedDB storage cost vs. offline usefulness and picks a sensible scope. | |

**User's choice:** Whatever was loaded this session
**Notes:** Full-deck offline prefetch was considered and deferred — closer to Phase 35's offline-usability territory than this phase's "make repeat visits instant" goal.

---

## Claude's Discretion

- Exact pixel/placement/copy for both the background-refresh indicator and the offline indicator — deferred to `/gsd-ui-phase 34`.
- How `FreshnessWatcher`'s JSON backstop should shrink in response to the new cache (the source design doc's staleness rule 3) — technical integration question for research against the actual current implementation.
- IndexedDB library choice (raw API vs. a small wrapper like `idb`) — architecture research's call.
- Exact cache eviction/size-bound policy for Cards accumulation, if IndexedDB storage limits ever become a real concern — treated as an implementation default unless it surfaces as a real problem.

## Deferred Ideas

- Full-deck offline prefetch for Cards (all ~1056 cards regardless of what's been scrolled) — belongs with Phase 35's offline-usability work if ever wanted.
- Offline review-taking / completing study sessions with no network — explicitly Phase 35 (OFFLINE-01/02/03), not this phase.
