# Feature Research

**Domain:** Review-history view for a personal Korean SRS app (v1.4 — feature #2: `ReviewLog` table + history page)
**Researched:** 2026-07-02
**Confidence:** MEDIUM

## Scope Note

This research covers only the two NEW features with real UX surface for v1.4: **(2) the review-history view page**, and — briefly, per the question — **whether "last auto-synced" should surface in the UI** for the new cron sync (1). Feature #3 (fixing hallucinated `components[]`) is a backend correctness fix with no UI and is out of scope here. This app is **single-user, single-tenant** — every recommendation below is filtered through that lens; multi-user/social SRS features (leaderboards, sharing, cohort comparisons) are excluded as irrelevant, not just deferred.

This file replaces the prior milestone's (v1.2, "Next.js App Router performance UX") FEATURES.md content — that research is now stale and superseded by this milestone's scope.

## Feature Landscape

### Table Stakes (Users Expect These)

Once a `ReviewLog` table exists and is exposed as a page, these are the baseline expectations for it to feel like a real feature rather than a debug dump.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Reverse-chronological review list (timestamp, card front, rating, resulting interval/state) | This is the literal content of the table — a list view is the minimum viable "history page." Anki's Card Info panel sets the reference pattern: one row per review event with date, rating, and interval outcome. | LOW | `ReviewLog` rows joined to `Card.front`/`type`; straightforward Prisma query with `orderBy: { reviewedAt: 'desc' }`. |
| Rating shown as the same 4-button vocabulary already used in study (Again/Hard/Good/Easy or equivalent), not raw `1-4` integers | Consistency with `lib/fsrs.ts` grade language already established in the app (mastery-language `formatInterval`); raw integers would be a jarring regression from the polish already shipped. | LOW | Reuse whatever labels/colors the grade bar already uses in `StudySession.tsx`. |
| Pagination (not unbounded fetch) | Reviews accumulate fast — a daily study habit at ~20-40 reviews/session produces thousands of rows within months. An unbounded `findMany` will eventually blow past reasonable payload size and page-load time, and this app already has a documented `take: 1000` safety-bound pattern (`lib/study-cards.ts`) precedent for "always bound the pool query." | LOW-MEDIUM | Cursor-based pagination (`reviewedAt`+`id` cursor) is cheaper on libSQL/Turso than `OFFSET` at scale and matches the "cheap, bounded" constraint already established for this milestone. Page size 20-30 rows, "Load more" button fits the app's existing mobile-first, tap-driven interaction style better than numbered pages. |
| Per-card filter (view history for one specific card) | The most natural entry point is "why does this card feel hard" — tapping into a card's history from the Cards page or from a study session. Anki's whole per-card "Card Info" pattern exists because aggregate stats don't answer "what happened with THIS word." | LOW-MEDIUM | Needs `cardId` query param + a link from `CardEditor.tsx` / cards list into the history view scoped to that card. This is the single highest-value filter — more useful than date-range for a solo learner. |
| Empty state | New DB feature, so day-one the table is empty (or has zero history before the ship date, since `ReviewLog` starts logging from ship-forward, not retroactively). | LOW | Follow the app's established RSC hydration pattern — server-render the actual (possibly empty) list, not a client-side loading flash (per `CLAUDE.md`'s RSC-05 DTO contract and "no blank-loading flash" convention already in place for every other page). |

### Differentiators (Competitive Advantage)

Not required for the feature to "work," but these are what make the data genuinely useful for a solo learner rather than a vanity log — and they lean on UI patterns already built in this app.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Rating filter (show only "Again"/lapses) | The single most actionable filter for a learner: "show me everything I've been failing" surfaces real trouble spots — this is where review history earns its keep over the existing day-level heatmap, which can't answer "which cards." | LOW | Simple `WHERE rating = 1` addition to the same query; cheap to add alongside the per-card filter. |
| Date-range filter, reusing `LessonRangeFilter.tsx` interaction pattern (but for dates, not lessons) | Consistency — the app already has a shared "From/To/All" filter component used on both Cards and Study pages. A date-range variant for review history keeps the UI vocabulary the learner already knows instead of inventing a new date-picker pattern. | LOW-MEDIUM | Don't reuse the component verbatim (it's lesson-indexed, not date-indexed) but mirror its visual/interaction shape (sheet-based, From/To/All) for familiarity. |
| Per-card mini-trend inside `CardEditor.tsx` (e.g. "6 reviews, 1 lapse, last seen 3 days ago") | Surfaces the most useful slice of review history (this card's trajectory) at the exact point of use — editing/inspecting a card — without requiring a trip to a separate full history page. Complements rather than duplicates the full history view. | MEDIUM | Small aggregate query (`count`, `count where rating=1`, `max(reviewedAt)`) scoped to one `cardId`; render inline in the existing `CardEditor` Sheet. Genuinely useful (matches "why is this card still hard" instinct) vs. a vanity stat. |
| Link from `/wrapped` ("My Korean") into review history | `/wrapped` already aggregates total study time, streak, mastered count — a "browse your full history" link is a natural extension of an existing summary surface rather than a new nav destination competing for attention. | LOW | Just a link/CTA; no new logic. Keeps the history page reachable without adding a 5th bottom-nav tab (this app deliberately has 4: Home/Study/Cards/Habits — see `Nav.tsx`). |

### Anti-Features (Commonly Requested, Often Problematic)

Things that look like "obviously good" additions to a review-history feature but are wrong for this app's scale and single-user context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| A second, review-log-specific calendar/heatmap | "We already have a heatmap for habits, why not one for reviews too?" seems like free reuse of `HabitHeatmap.tsx`. | Redundant with the existing habit heatmap, which is already day-level review/time activity (`StudyDay` table). A second heatmap answering the same "did I study, how much" question at the review-log layer adds visual clutter without adding information — this is exactly the "day-level vs event-level" distinction Anki's own ecosystem draws (Review Heatmap add-on = daily activity; Card Info = per-event drill-down). The `ReviewLog` table's unique value is the event-level detail (which card, what rating), not a second aggregate view. | If a calendar view is wanted at all, it should visualize something the existing heatmap doesn't — e.g. lapse-density per day — not duplicate streak/volume. Likely not worth building for v1.4; defer. |
| Infinite scroll on the history list | Feels modern, matches social-feed muscle memory. | For a data/log table (not a content feed), infinite scroll loses bookmarkable position, can't preserve scroll position across navigation reliably in this app's existing RSC/client-shell pattern, and degrades on-device performance as the list grows into the thousands — exactly the failure mode flagged for long activity-log tables generally. Pagination (or "Load more" as a bounded hybrid) is the better fit and is cheaper to build correctly with cursor-based Prisma queries. | Numbered-page or "Load more" pagination, page size ~20-30, cursor on `(reviewedAt, id)`. |
| Editable/deletable review-log rows | "What if I misgraded, let me fix the history." | `ReviewLog` is meant as an append-only audit trail (per PROJECT.md: "logging every individual review"). Making it editable turns a log into a second source of truth that can drift from the FSRS state that was actually computed and applied — mutating history after the fact would silently invalidate the FSRS state stored alongside it. The app already has an "undo last review" (`/api/review/undo`) for the *immediate* mis-grade case; that's the correct fix point, not retroactive log editing. | Leave `ReviewLog` strictly append-only/read-only. Rely on the existing undo flow for immediate correction. |
| Charting library / rich analytics dashboard (retention curves, ease-factor graphs, forecast charts) | Anki's Stats screen has these, so it "should" exist here too; feels like a natural v2 of `/wrapped`. | This app explicitly shipped its "My Korean" (`/wrapped`) summary already covering the vanity-metric layer solo learners actually check (streak, mastered count, study time, next milestone). Full analytics (retention %, ease histograms, forecast) are built for tuning algorithm parameters or comparing decks — irrelevant when there's one user, one FSRS config, and no algorithm-tuning surface in this app. Building this is pure scope creep relative to the stated v1.4 goal ("browse it," not "analyze it"). | Keep the history page a browsable log + the two cheap filters above. If deeper stats are ever wanted, that's a distinct future milestone, not bundled into "add a table + a page." |
| Exposing "last auto-synced" as a prominent home-page element | Cron sync is a new automated feature; feels natural to want visible confirmation it's working. | Home's hero is already a carefully tuned three-state UI (due / goal-met / caught-up) — adding sync-status chrome there competes with the actual point of the page (what to study) and isn't something the learner needs to check daily once cron sync is trusted. | Surface it only in Settings ▸ Advanced, next to the existing manual `SyncPanel` (per the question's own suggestion) — a subtle "Last auto-synced: [date]" line reusing whatever field the manual sync path already tracks/could track (e.g. most recent `Lesson.createdAt` or a small `Setting` key). Low complexity, correct location: it's an operational/debugging detail, not a daily-use surface, and `SyncPanel` already lives in the "advanced/debug" area of the app for exactly this kind of thing. |

## Feature Dependencies

```
ReviewLog table (schema + write-path)
    └──requires──> POST /api/review already computing FSRS result (existing — just add a write)
                       └──requires──> No new extraction/sync dependency; independent of features #1 and #3

Review-history page (list view)
    └──requires──> ReviewLog table populated
    └──requires──> DTO type for the log row (per app convention: lib/dto.ts, ISO date strings — RSC-05 pattern)
    └──requires──> Pagination (cursor-based query)

Per-card filter on history page
    └──requires──> Review-history page (base list view)
    └──enhances──> CardEditor.tsx (optional: link "view history" from a card row)

Rating filter (lapses view)
    └──requires──> Review-history page (base list view)
    └──independent-of──> Per-card filter (can ship either first, or together)

CardEditor mini-trend
    └──requires──> ReviewLog table (aggregate query only, does NOT require the full history page to exist first)
    └──enhances──> Review-history page (natural link target: "view full history →")

"Last auto-synced" in Settings ▸ Advanced
    └──requires──> Cron sync feature (#1) writing a timestamp somewhere (new Setting key or reuse Lesson.createdAt max)
    └──independent-of──> ReviewLog / history page entirely — separate feature, separate phase candidate

Second review-specific heatmap ──conflicts──> existing HabitHeatmap.tsx (redundant, anti-feature — do not build)
Editable review-log rows ──conflicts──> append-only audit-trail intent of ReviewLog (anti-feature — do not build)
```

### Dependency Notes

- **Review-history page requires ReviewLog table + DTO type:** the page cannot ship in the same commit as the schema (Turso DDL must be applied first, per this project's `prisma db push` limitation — see CLAUDE.md). This is a natural two-plan split within one phase: (1) schema + write-path, (2) read/list page — matching the existing pattern of DDL-then-code seen in past `apply-graph-ddl.mjs`/`apply-sentence-ddl.mjs` scripts.
- **Per-card filter enhances CardEditor:** not required for MVP of the history page, but cheap to add once the base list + query exist (it's the same query with a `WHERE cardId = ?` clause), and it's the single highest-value filter identified above — worth prioritizing over the rating filter if only one filter ships in v1.4.
- **"Last auto-synced" is independent of ReviewLog:** it belongs to feature #1 (cron sync), not feature #2. It's called out here only because the question asked about it — don't let it bleed scope into the review-history phase. It's a 1-line UI addition to an existing component (`SyncPanel.tsx`) once cron sync writes a timestamp anywhere.
- **Anti-features conflict, don't complement:** a second heatmap and editable log rows aren't "future nice-to-haves" — they actively work against the app's existing design decisions (one heatmap already answers the day-level question; undo already answers the correction question). Flag these explicitly to the roadmapper so they aren't accidentally scoped in as "obvious v1.4.1 follow-ups."

## MVP Definition

### Launch With (v1.4, feature #2 scope)

Minimum to make `ReviewLog` data "actually usable" per the milestone goal, not just stored.

- [ ] `ReviewLog` table (timestamp, cardId, rating, resulting FSRS state) written on every `POST /api/review` — the milestone's stated schema requirement
- [ ] Review-history page: reverse-chronological list, paginated (cursor-based, ~20-30/page), rating shown via existing grade-language/colors
- [ ] Per-card filter (the highest-value filter identified — "why is this card hard")
- [ ] Empty state that fits the RSC hydration convention (server-rendered real state, no client loading flash)
- [ ] Entry point from somewhere existing (Settings, `/wrapped`, or a link from `CardEditor`) — no new bottom-nav tab

### Add After Validation (v1.4.x, if the base page proves useful)

- [ ] Rating filter (lapses-only view)
- [ ] Date-range filter (mirroring `LessonRangeFilter` interaction shape)
- [ ] CardEditor inline mini-trend (review count / lapses / last-seen)

### Future Consideration (defer past v1.4 entirely)

- [ ] Any charting/analytics beyond the existing `/wrapped` vanity metrics — no stated need, no algorithm-tuning surface in a single-config, single-user app
- [ ] A second review-event heatmap — redundant with `HabitHeatmap.tsx`
- [ ] Editable/correctable log rows — conflicts with append-only audit-log intent; `/api/review/undo` already covers the real use case

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `ReviewLog` schema + write path | HIGH (blocks everything else) | LOW | P1 |
| Base paginated history list page | HIGH | LOW-MEDIUM | P1 |
| Per-card filter | HIGH | LOW | P1 |
| Rating (lapses) filter | MEDIUM | LOW | P2 |
| Date-range filter | LOW-MEDIUM | LOW-MEDIUM | P2 |
| CardEditor mini-trend | MEDIUM | MEDIUM | P2 |
| "Last auto-synced" in Settings Advanced | LOW-MEDIUM | LOW | P2 (belongs to feature #1, not #2) |
| Second heatmap for reviews | LOW | MEDIUM | P3 (anti-feature — likely never) |
| Analytics/charts dashboard | LOW (no algorithm-tuning need) | HIGH | P3 (anti-feature — likely never) |
| Editable log rows | LOW (conflicts with intent) | MEDIUM | P3 (anti-feature — do not build) |

**Priority key:**
- P1: Needed for the milestone's stated goal ("stored AND usable")
- P2: Genuinely useful, cheap once P1 ships, fine to sequence into a second plan/phase or defer to v1.4.x
- P3: Anti-features or out-of-proportion scope for a single-user app — flag to roadmapper as explicitly excluded, not silently dropped

## Competitor Feature Analysis

Single relevant reference ecosystem: desktop/mobile SRS apps with mature "review history" surfaces (Anki being the dominant one; this app already borrows its FSRS vocabulary and philosophy).

| Feature | Anki (Card Info + Stats) | Anki (Review Heatmap add-on) | Our Approach |
|---------|---------------------------|-------------------------------|--------------|
| Per-review event detail | Yes — Card Info shows date/rating/interval per review, per card | No — day-level only | Base list view: date, card, rating, resulting state — the v1.4 MVP |
| Day-level activity view | Indirect (via Stats graphs) | Yes — this is its whole purpose | Already shipped in this app as `HabitHeatmap.tsx`/`HabitTracker.tsx` — do NOT duplicate |
| Aggregate analytics (retention %, ease graphs, forecasts) | Yes — full Stats screen | No | Explicitly out of scope — no algorithm-tuning need in a single-config app; `/wrapped` already covers the useful vanity-metric subset |
| Filter by card | Yes (opening Card Info from that card) | N/A | P1 — highest-value filter for this app too |
| Filter by rating/lapses | Not directly surfaced as a standalone filter in stock Anki | N/A | P2 — arguably more discoverable here than in Anki, cheap to add |
| Editable history | No (manual reschedule is a distinct "Manual" event type, not an edit) | N/A | Confirms append-only is the right call — matches Anki's own model |

## Sources

- [Card Info, Graphs and Statistics - Anki Manual](https://docs.ankiweb.net/stats.html) — per-review event detail pattern (date/rating/interval), MEDIUM confidence (single web source, cross-checked against general SRS domain knowledge)
- [Review Heatmap - AnkiWeb add-on](https://ankiweb.net/shared/info/1771074083) — day-level heatmap purpose, confirms it's a distinct concern from per-event logs, MEDIUM confidence
- [Pagination vs. infinite scroll: Making the right decision for UX - LogRocket](https://blog.logrocket.com/ux-design/pagination-vs-infinite-scroll-ux/) — pagination/cursor recommendation for log/data tables, MEDIUM confidence (cross-checked against multiple UX sources returned in the same search)
- Internal: `.planning/PROJECT.md` (v1.4 milestone scope, existing feature inventory, established UI/architecture conventions — HIGH confidence, primary source)
- Internal: `CLAUDE.md` (RSC/DTO hydration pattern, `HabitHeatmap`/`HabitTracker`/`Sheet`/`LessonRangeFilter` component precedents, Turso DDL constraint, `Nav.tsx` 4-tab limit) — HIGH confidence, primary source

---
*Feature research for: personal Korean SRS app — review-history view (v1.4)*
*Researched: 2026-07-02*
