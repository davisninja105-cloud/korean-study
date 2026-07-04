# Phase 18: Review History Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 18-Review History Page
**Areas discussed:** Rating display, Pagination UX, Entry point, Per-card filter UX

---

## Rating display

| Option | Description | Selected |
|--------|-------------|----------|
| Grade name + mastery phrase | e.g. "Good — Memory strengthening → 3d", reuses masteryPhrase() from lib/fsrs.ts | ✓ |
| Grade name only | Just "Good"/"Again"/"Hard"/"Easy" per row | |
| Grade name + raw interval only | e.g. "Good → 3d" without the mastery-tier phrase | |

**User's choice:** Grade name + mastery phrase (recommended option).
**Notes:** Requires exporting `masteryPhrase` from `lib/fsrs.ts` (currently module-private).

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — color-coded by grade | Again/Hard in a warning tone, Good/Easy neutral, via semantic tokens | ✓ |
| No — uniform styling | All rows look the same | |

**User's choice:** Color-coded by grade (recommended option).

| Option | Description | Selected |
|--------|-------------|----------|
| Grade + interval only | Keep rows compact | ✓ |
| Include state badge | Add resulting FSRS state badge | |

**User's choice:** Grade + interval only (recommended option).

---

## Pagination UX

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-load on scroll | IntersectionObserver sentinel triggers next cursor fetch | ✓ |
| Explicit "Load more" button | Tap to fetch next page | |

**User's choice:** Auto-load on scroll (recommended option).

| Option | Description | Selected |
|--------|-------------|----------|
| GET /api/reviews?cursor=&cardId= | New dedicated route, shared lib/ function backs RSC + API | ✓ |
| Reuse /api/cards/[id] with embedded reviewLogs param | Piggyback on existing card route | |

**User's choice:** New dedicated `GET /api/reviews` route (recommended option).

---

## Entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Settings ▸ Advanced | Next to existing sync panel | |
| /wrapped ("My Korean") | Add link from stats summary page | |
| CardEditor only | Scoped per-card access only | |
| **Habits page (user's own idea)** | New FSRS-state aggregate stats section, tappable → /history | ✓ |

**User's choice:** Habits page — not one of the three roadmap-suggested surfaces, but the user's own preference. Habits already has an existing bottom-nav tab, so "no new bottom-nav tab" is still satisfied.
**Notes:** This adds a small new feature (FSRS-state breakdown stats) to Habits, not just a bare link.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — app/history/page.tsx | Standalone RSC route per roadmap's Approach note | ✓ |
| Sheet/modal instead of a route | Overlay, no deep-linking | |

**User's choice:** Standalone route (recommended option).

| Option | Description | Selected |
|--------|-------------|----------|
| Breakdown by FSRS state | New/Learning/Review/Relearning counts via groupBy | ✓ |
| Struggling-cards count | Single headline number (e.g. Relearning count) | |
| Both | Full breakdown + called-out struggling subset | |

**User's choice:** Breakdown by FSRS state (recommended option).

| Option | Description | Selected |
|--------|-------------|----------|
| Whole section is tappable, links to /history | Entire block is one Link | ✓ |
| Each state segment links to a filtered view | Per-state filtered navigation | |

**User's choice:** Whole section tappable (recommended option). Per-state filter links were explicitly considered and rejected — would require `/history` to support a `state` query param beyond the `cardId` filter HIST-05 calls for.

---

## Per-card filter UX

| Option | Description | Selected |
|--------|-------------|----------|
| "View history" link in CardEditor | Opens /history?cardId=X pre-filtered | ✓ |
| Card picker/search on /history page | Search UI on the history page itself | |
| Both | CardEditor link + search on history page | |

**User's choice:** CardEditor link only (recommended option).

| Option | Description | Selected |
|--------|-------------|----------|
| "All cards" chip/button shown while filtered | Pill with × to clear, matches LessonRangeFilter | ✓ |
| Back button only | Rely on browser/nav back | |

**User's choice:** "All cards" chip (recommended option).

---

## Claude's Discretion

- Exact visual styling of the color-coded grade rows (which semantic tokens map to which grades).
- Whether `ReviewLogDTO` embeds card front/type/lesson per row, or the client looks up card metadata separately.
- Exact page size within the "~20-30 per page" range.

## Deferred Ideas

- Per-state filter links from the Habits stats section (e.g. tapping "Relearning: 6" → a state-filtered history view) — considered and rejected in favor of the simpler whole-section link; would need a `state` query param on `/history` beyond HIST-05's single-card filter scope.
- "Fix spurious components in card extraction" todo (`.planning/todos/pending/2026-07-02-fix-spurious-components-in-card-extraction.md`) — matched Phase 18 by keyword overlap only; already resolved in Phase 16 (`resolves_phase: 16` in its own frontmatter). Not folded.
