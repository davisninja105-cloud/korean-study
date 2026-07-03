# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- ✅ **v1.3 Reliability & Hardening** — Phases 13–15 (shipped 2026-07-03)
- 🚧 **v1.4 Knowledge Graph Quality & History** — Phases 16–19 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 UI/UX Polish (Phases 3–8 + 8.1) — SHIPPED 2026-06-29</summary>

- [x] Phase 3: UI/UX Audit (1/1 plans) — completed 2026-06-27
- [x] Phase 4: Design System Tokens & Sweep (3/3 plans) — completed 2026-06-27
- [x] Phase 5: Study Session Polish (2/2 plans) — completed 2026-06-28
- [x] Phase 6: Home Dashboard Polish (1/1 plan) — completed 2026-06-28
- [x] Phase 7: Secondary Screens & Navigation (2/2 plans) — completed 2026-06-29
- [x] Phase 8: Accessibility & PWA Baseline (2/2 plans) — completed 2026-06-29
- [x] Phase 8.1: Close gap NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (1/1 inline fix) — completed 2026-06-29

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Performance & Snappiness (Phases 9–12) — SHIPPED 2026-07-01</summary>

- [x] Phase 9: Skeleton Loading Screens (1/1 plans) — completed 2026-06-29
- [x] Phase 10: Cards Hydration + API Parallelization (2/2 plans) — completed 2026-06-30
- [x] Phase 11: Study Page Hydration & Interaction Polish (3/3 plans) — completed 2026-06-30
- [x] Phase 12: Home & Habits Hydration (3/3 plans) — completed 2026-07-01

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Reliability & Hardening (Phases 13–15) — SHIPPED 2026-07-03</summary>

- [x] Phase 13: Review API Hardening & Save Reliability (2/2 plans) — completed 2026-07-02
- [x] Phase 14: Sync Failure Visibility & Caching Performance (2/2 plans) — completed 2026-07-02
- [x] Phase 15: StudySession Refactor & Sentence-Selection Memoization (2/2 plans) — completed 2026-07-03

See `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.4 Knowledge Graph Quality & History (In Progress)

**Milestone Goal:** Clean up hallucinated prerequisite edges, add a persistent review history with a browsable view page, and automate daily sync so the deck never goes stale. Every phase either raises the trustworthiness of the knowledge graph, makes review history durable and visible, or keeps the deck fresh unattended — reusing existing conventions (pure `lib/` helpers, RSC + DTO + client-shell pages, manual Turso DDL, shared pipeline modules) with zero new npm dependencies.

- [ ] **Phase 16: Components[] Filter Fix** - Extraction only keeps prerequisite components that resolve to a real card via `normalizeFront()` deck-lookup, dry-run validated before it touches the write path
- [ ] **Phase 17: ReviewLog Schema & Idempotent Write Path** - Every review writes an append-only `ReviewLog` row via an idempotency-keyed single transaction; undo cancels in-flight retries
- [ ] **Phase 18: Review History Page** - A reverse-chronological, per-card-filterable, cursor-paginated history view reachable from an existing surface (RSC + DTO hydration)
- [ ] **Phase 19: Vercel Cron Auto-Sync** - A daily cron syncs 1 lesson via a `CRON_SECRET`-authenticated route, with a "last auto-synced" timestamp in Settings ▸ Advanced

## Phase Details

### Phase 16: Components[] Filter Fix

**Goal**: Card extraction stops inventing prerequisites — a card's `components[]` list contains only real prerequisites that resolve to an actual card in the deck, so the foundation-first knowledge graph is built on true edges instead of hallucinated ones.
**Depends on**: v1.3 (shipped baseline); first phase of the milestone. Gates Phase 19 — the filter must be live before an unattended cron run exercises the extraction pipeline.
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05
**Approach note**: Resolution is deck-lookup by `normalizeFront()` (the two-phase pattern proven in `lib/known-words.ts`), NOT literal sentence-text containment — abstract grammar-pattern notation (`~(으)면`) never appears verbatim in conjugated sentences, so a substring filter would gut exactly the edges the milestone exists to fix. The filter ships as a new pure, unit-tested `lib/` module.
**Success Criteria** (what must be TRUE):

  1. After a sync, a newly-extracted card's `components[]` contains only lemmas that resolve to a real card in the deck — spurious entries (e.g. `~(으)ㄴ 후에` attached to an unrelated `~ㄹ 것 같다` card) no longer create `CardDependency` edges.
  2. A malformed or truncated Claude extraction response is rejected on receipt (structurally validated, matching the `lib/gloss.ts` convention) rather than persisted as broken card data.
  3. Abstract grammar-pattern components that never appear verbatim in conjugated sentences are correctly retained (resolution is by deck-lookup, not literal containment).
  4. Before the filter is wired into the write path, a dry run against the real corpus reports its drop rate separately for grammar- vs vocabulary-type components, confirming grammar edges are not disproportionately dropped.

**Plans**: 3/4 plans executed; 16-04 Tasks 1-2 done, paused at blocking-human checkpoint (Task 3)
**Wave 1**

- [x] 16-01-PLAN.md — Pure deck-lookup filter module (`lib/filter-components.ts`) + read-only corpus dry-run + human-reviewed drop-rate gate (GRAPH-03/04/05)
- [x] 16-02-PLAN.md — Extraction prompt tightening + per-card LLM-response structural validation, salvage-preserving (GRAPH-01/02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-03-PLAN.md — Wire the filter into the live write path + fix the `keyToId` all-cards scoping bug (GRAPH-03; user-locked keyToId fix; closes Success Criterion 1)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 16-04-PLAN.md — Retroactive corpus cleanup: dry-run-first developer-run script re-filters `Card.components` + reconciles `CardDependency` edges (user-locked retroactive cleanup) — script built + documented (Tasks 1-2); PAUSED at Task 3 blocking-human checkpoint pending developer-run dry-run/--apply against production

### Phase 17: ReviewLog Schema & Idempotent Write Path

**Goal**: Every review is durably and idempotently recorded as an append-only audit trail, so the history Phase 18 displays is trustworthy even under network retries and undo.
**Depends on**: Nothing in this milestone (independent, schema-gated foundation; sequenced after Phase 16). Foundation for Phase 18 — the page can't be built or tested until real, trustworthy rows exist.
**Requirements**: HIST-01, HIST-02, HIST-03
**Approach note**: The `ReviewLog` model is applied to Turso via the project's standard manual-DDL workaround (`migrate diff --from-empty --script` + `executeMultiple()`), with `@@index([cardId])` / `@@index([createdAt])` from the start. Idempotency is a client-generated key threaded through `postReviewWithRetry` → `POST /api/review`, enforced by a unique constraint, with `CardReview.update` + `ReviewLog.create` inside one `prisma.$transaction([...])` (array form). This is core scope, not a stretch goal.
**Success Criteria** (what must be TRUE):

  1. Grading a card records exactly one `ReviewLog` entry capturing its timestamp, card, rating, and resulting FSRS state.
  2. A lost-response retry of the same grade action produces no duplicate log entry and never double-applies FSRS state (verifiable under throttled/flaky network).
  3. Triggering undo cancels any in-flight background retry, so a stale retry can never silently re-apply a rating after the review has been undone.

**Plans**: TBD

### Phase 18: Review History Page

**Goal**: The learner can browse their full review history to see what they've studied and which cards keep tripping them up.
**Depends on**: Phase 17 (needs real `ReviewLog` rows and a trustworthy write path to display).
**Requirements**: HIST-04, HIST-05, HIST-06, HIST-07
**Approach note**: Standard RSC + DTO + client-shell page following the `/habits` precedent — `app/history/page.tsx` (thin async RSC) + `components/HistoryClient.tsx` + a new `ReviewLogDTO` in `lib/dto.ts`. Deliberately excludes anti-features: no second review heatmap, no editable/deletable rows, no analytics dashboard, no new bottom-nav tab.
**Success Criteria** (what must be TRUE):

  1. User can open a review-history view from an existing surface (Settings, `/wrapped`, or `CardEditor` — no new bottom-nav tab) and see a reverse-chronological, cursor-paginated list (~20-30 per page) with the rating shown in the app's mastery-language, not raw 1–4 integers.
  2. User can filter the history down to a single card.
  3. Undone reviews still appear in the history, unmarked — `ReviewLog` is append-only and never mutated by undo.
  4. The history view shows real data on the first server-rendered paint with no loading flash (RSC + DTO + client-shell hydration).

**Plans**: TBD
**UI hint**: yes

### Phase 19: Vercel Cron Auto-Sync

**Goal**: The deck stays fresh on its own — a daily automated sync ingests new lessons without the user opening the app, and the user can confirm at a glance that it's still running.
**Depends on**: Phase 16 (the filter fix must be live before an unattended cron run exercises the extraction pipeline, so cron can't re-persist hallucinated components). Otherwise independent of Phases 17–18; the `lib/sync.ts` extraction and `CRON_SECRET` provisioning can start in parallel.
**Requirements**: SYNC-02, SYNC-03, SYNC-04
**Approach note**: Extract the current `POST /api/sync` body into a shared `lib/sync.ts:runSync()` (mirroring `lib/study-cards.ts`/`lib/dashboard.ts`), called by both the manual route and a new `GET /api/cron/sync`. Auth is a new bearer-token branch inside `middleware.ts` — the cron route stays inside the existing matcher and fails closed if `CRON_SECRET` is unset (never `if (secret && …)`, which silently disables auth when the env var is missing).
**Success Criteria** (what must be TRUE):

  1. A daily Vercel Cron job automatically syncs exactly one lesson via the existing `MAX_LESSONS_PER_SYNC=1` path, with no manual trigger.
  2. Cron requests authenticate via a `CRON_SECRET` bearer token checked inside `middleware.ts`, failing closed if the secret is unset — the sync endpoint stays inside the auth matcher and is never publicly reachable.
  3. Settings ▸ Advanced shows a "last auto-synced" timestamp so a silently-failing daily cron is noticeable.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 16 → 17 → 18 → 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8.1. Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete | 2026-06-29 |
| 9. Skeleton Loading Screens | v1.2 | 1/1 | Complete | 2026-06-29 |
| 10. Cards Hydration + API Parallelization | v1.2 | 2/2 | Complete | 2026-06-30 |
| 11. Study Page Hydration & Interaction Polish | v1.2 | 3/3 | Complete | 2026-06-30 |
| 12. Home & Habits Hydration | v1.2 | 3/3 | Complete | 2026-07-01 |
| 13. Review API Hardening & Save Reliability | v1.3 | 2/2 | Complete | 2026-07-02 |
| 14. Sync Failure Visibility & Caching Performance | v1.3 | 2/2 | Complete | 2026-07-02 |
| 15. StudySession Refactor & Sentence-Selection Memoization | v1.3 | 2/2 | Complete | 2026-07-03 |
| 16. Components[] Filter Fix | v1.4 | 3/4 | In Progress|  |
| 17. ReviewLog Schema & Idempotent Write Path | v1.4 | 0/TBD | Not started | - |
| 18. Review History Page | v1.4 | 0/TBD | Not started | - |
| 19. Vercel Cron Auto-Sync | v1.4 | 0/TBD | Not started | - |
