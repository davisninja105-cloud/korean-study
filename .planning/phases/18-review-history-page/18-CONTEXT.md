# Phase 18: Review History Page - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The learner can browse their full review history to see what they've studied and which cards keep tripping them up: a reverse-chronological, cursor-paginated feed of `ReviewLog` rows, filterable to a single card, reachable from the Habits page via a new FSRS-state aggregate stats section. This is a read-only view — no editing, no deleting, no analytics dashboard, no new bottom-nav tab.

Out of scope (explicit, from ROADMAP.md Approach note): a second review heatmap, editable/deletable rows, an analytics dashboard, a new bottom-nav tab.

</domain>

<decisions>
## Implementation Decisions

### Rating display
- **D-01:** Each history row shows the grade name plus the resulting mastery-language phrase, e.g. "Good — Memory strengthening → 3d" — not a raw 1-4 integer. Compute this by calling `masteryPhrase(nextReview, createdAt)` from `lib/fsrs.ts`, using the `ReviewLog` row's own `createdAt` as "now" and its `nextReview` as "due" (the row already stores the resulting FSRS snapshot per Phase 17 D-01/D-02). **`masteryPhrase` is currently unexported (module-private) — it must be exported** for this to work; it's the same function `previewIntervalLabels` already uses internally, so no logic duplication. Grade name (Again/Hard/Good/Easy) comes from `ReviewLog.rating` (1-4) via the same mapping the grade buttons use in `StudySession.tsx`.
- **D-02:** Rows with weak grades (Again/Hard) get distinct color treatment (existing semantic tokens — no literal `orange-*`/`red-*` utilities per CLAUDE.md's color-system convention) so struggling cards visually stand out in the feed. Good/Easy stay neutral.
- **D-03:** Rows do NOT show the resulting FSRS state (New/Learning/Review/Relearning) as a separate badge — grade + mastery phrase is enough detail; keep rows compact.

### Pagination UX
- **D-04:** Rows auto-load on scroll via an `IntersectionObserver` sentinel at the end of the list (no existing infinite-scroll precedent in this codebase — this phase establishes the pattern). No explicit "Load more" button.
- **D-05:** New dedicated route `GET /api/reviews?cursor=&cardId=` — cursor is the last-seen row's `id`, ordered `createdAt DESC` with `id DESC` as a tiebreak for stable ordering under same-timestamp writes. Follows the RSC+DTO precedent already used for `/habits`/`/study`: a shared server-only `lib/` function (e.g. `lib/review-history.ts`) backs both the RSC first-page fetch in `app/history/page.tsx` and this route for subsequent-page fetches — mirrors `lib/study-cards.ts:getStudyCards()` used by both `app/study/page.tsx` and `GET /api/cards/due`.

### Entry point
- **D-06:** The history view is reachable from the **Habits page** (`components/HabitsClient.tsx`), NOT Settings/`/wrapped`/CardEditor. This was the user's own choice, not one of the three roadmap-suggested surfaces — Habits already has an existing bottom-nav tab, so this satisfies "no new bottom-nav tab."
- **D-07:** A new aggregated-stats section is added to the Habits page showing a **breakdown of cards by FSRS state** (New / Learning / Review / Relearning counts). Backing query: a new `prisma.cardReview.groupBy({ by: ['state'], _count: true })` in `lib/dashboard.ts`, mirroring the existing `cardsByType` groupBy already there in `getStats()`. This extends `StatsDTO` (or a new field on it) with the state-breakdown counts.
- **D-08:** The entire stats section is one tappable `Link` to `/history` (mirrors `HabitTracker.tsx`'s existing whole-card-wrapped-in-a-`Link` pattern, e.g. `className="...block"`). No per-state filter links — tapping any part of the section always goes to the unfiltered `/history` view.
- **D-09:** `app/history/page.tsx` is a standalone RSC route per the roadmap's Approach note: thin async server component + `components/HistoryClient.tsx` + a new `ReviewLogDTO` in `lib/dto.ts`, following the same shape as `/habits` (`app/habits/page.tsx` → `getActivityData()`/`getStats()` → `HabitsClient`). Supports `?cardId=` for deep-linking into a pre-filtered view.

### Per-card filter UX
- **D-10:** A "View history" link is added inside `components/CardEditor.tsx` that opens `/history?cardId={card.id}`, pre-filtered to that card. No separate card search/picker UI on the history page itself — the only way into a single-card filter is via this CardEditor link (or manually navigating the URL).
- **D-11:** While filtered to one card, an "All cards" chip/pill is shown near the top of the list with an `×` to clear the filter — matches the existing `LessonRangeFilter` chip convention already used on the Cards/Study pages.

### Claude's Discretion
- Exact visual styling of the color-coded grade rows (D-02) — which semantic tokens map to which grades — is left to implementation, as long as literal Tailwind color utilities are avoided.
- Whether `ReviewLogDTO` needs to embed card front/type/lesson info per row (for display) or the client fetches/looks up card metadata separately — planner/researcher to determine the cheapest join shape given the "~10-25 rows/page" scale.
- Exact page size within the "~20-30 per page" range from Success Criterion 1.

### Reviewed Todos (not folded)
- "Fix spurious components in card extraction" (`.planning/todos/pending/2026-07-02-fix-spurious-components-in-card-extraction.md`) — matched Phase 18 by keyword overlap only (components/card/phase/lib/cards); its own frontmatter says `resolves_phase: 16`, already shipped in Phase 16. Not relevant to this phase, not folded — same disposition as when it surfaced during Phase 17's discussion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` (Phase 18 section, "Review History Page") — Approach note locks the RSC+DTO+client-shell shape (`app/history/page.tsx` + `components/HistoryClient.tsx` + `ReviewLogDTO`), the `/habits` precedent, and the explicit anti-features list (no second heatmap, no editable/deletable rows, no analytics dashboard, no new bottom-nav tab); the four numbered Success Criteria
- `.planning/REQUIREMENTS.md` HIST-04, HIST-05, HIST-06, HIST-07 — exact requirement wording for this phase
- `.planning/PROJECT.md` "Current Milestone: v1.4" section — milestone goal and deferred-scope framing

### Prior-phase foundation (schema + write path this phase reads from)
- `.planning/phases/17-reviewlog-schema-idempotent-write-path/17-CONTEXT.md` — full `ReviewLog` field shape (D-01/D-02: full FSRS snapshot, resulting/post-update values), confirms undo never touches `ReviewLog` (relevant to HIST-06 — "unmarked" requires no code change, just don't add any undo-awareness to the query/display)
- `prisma/schema.prisma` `model ReviewLog` (line 100) — exact fields: `id, createdAt, cardId, rating, idempotencyKey, state, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, nextReview, lastReview`, `@@index([cardId])`, `@@index([createdAt])` (both needed for this phase's queries)

### RSC + DTO pattern precedent
- `app/habits/page.tsx` + `components/HabitsClient.tsx` + `lib/dashboard.ts` — the exact structural precedent this phase's route/client-shell/DTO should follow
- `lib/study-cards.ts` — precedent for "one shared `lib/` function backs both the RSC page and a GET API route used for client-side re-fetch/pagination" (D-05)
- `lib/dto.ts` — where `ReviewLogDTO` gets added; existing DTOs (`ReviewDTO`, `CardDTO`, `StatsDTO`) show the ISO-string-for-every-Date convention (RSC-05) that must be followed

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/fsrs.ts` — `masteryPhrase(due, now)` (currently unexported, module-private, line ~39) and `formatInterval(due, now)` (line ~25) are exactly the functions needed for D-01; only `masteryPhrase` needs an `export` added. `Rating` enum (re-exported from `ts-fsrs`) gives the Again/Hard/Good/Easy grade names for `ReviewLog.rating` (1-4).
- `components/HabitTracker.tsx` (lines ~151+) — existing whole-card-is-a-`Link` pattern (`className="...block"` wrapping the entire card in a `<Link>`) to replicate for D-08's tappable stats section.
- `lib/dashboard.ts` `getStats()` — existing `cardsByType` groupBy (`prisma.card.groupBy({ by: ['type'], _count: true })`) is the direct pattern to mirror for D-07's new FSRS-state groupBy.
- `components/LessonRangeFilter.tsx` — the chip/clear-filter UI convention to reuse for D-11's "All cards" pill.
- `components/CardEditor.tsx` (`Props { card, onSave, onCancel }`, 239 lines) — where D-10's "View history" link gets added; it already receives the full `card.id`.
- `app/api/cards/due/route.ts` + `lib/study-cards.ts` — precedent for a GET route with query params (`lessonFrom`/`lessonTo`/`scope`) delegating to a shared `lib/` function; same shape needed for `GET /api/reviews?cursor=&cardId=`.

### Established Patterns
- RSC hydration: every main route (`/cards`, `/study`, `/`, `/habits`) is a thin async RSC page + one `*Client.tsx` shell + DTOs with ISO-string dates (RSC-05). `/history` must follow this exactly (D-09).
- No client-side shuffle/reordering — lists are consumed in server order. The history feed should do the same (`createdAt DESC` from the query, no client re-sort).
- Non-critical failures degrade gracefully; the FSRS-state breakdown query (D-07) should follow the same `Promise.allSettled` pattern already used in `lib/study-cards.ts` if it's added alongside other Habits-page queries, so a failure in the new stat doesn't break the whole Habits page.
- ESLint `react-hooks/purity` — the `IntersectionObserver` scroll-loading (D-04) must be wired via `useEffect`/event callbacks, never impure calls during render.

### Integration Points
- `lib/dto.ts` gains `ReviewLogDTO` (new) and `StatsDTO` gains the FSRS-state breakdown (extend existing interface, per D-07).
- `lib/dashboard.ts` `getStats()` gains one more parallel query (state breakdown) inside its existing `Promise.all`.
- `components/HabitsClient.tsx` gains the new stats section + `Link` to `/history`.
- `components/CardEditor.tsx` gains the "View history" link.
- New files: `app/history/page.tsx`, `components/HistoryClient.tsx`, `app/api/reviews/route.ts`, `lib/review-history.ts` (shared query function).

</code_context>

<specifics>
## Specific Ideas

- The user specifically wants the Habits page to carry a card-collection-health summary (FSRS state breakdown) as its own visible feature, with the history page as the "drill-in" detail view behind it — not just a buried settings link. This reframes the entry point as a value-adding addition to Habits, not just a navigation affordance.
- Example rating string to match: `"Good — Memory strengthening → 3d"` (grade name + em dash + existing `masteryPhrase` output).

</specifics>

<deferred>
## Deferred Ideas

None beyond the reviewed-but-not-folded todo listed above — discussion stayed within phase scope. Per-state filter links from the Habits stats section (tapping "Relearning: 6" → a state-filtered history view) was considered and explicitly rejected in favor of D-08's simpler whole-section link; if wanted later, it would need `/history` to support a `state` query param in addition to `cardId`, which is out of scope for HIST-05 (single-card filter only).

</deferred>

---

*Phase: 18-Review History Page*
*Context gathered: 2026-07-04*
