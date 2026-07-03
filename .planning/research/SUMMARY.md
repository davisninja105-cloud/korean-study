# Project Research Summary

**Project:** Korean Study — v1.4 milestone (Vercel Cron auto-sync, ReviewLog history, components[] filter fix)
**Domain:** Feature additions to an existing personal Next.js/Prisma/Turso SRS app
**Researched:** 2026-07-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

v1.4 adds three features to an already-mature single-user Korean SRS app: (1) daily automated Google Doc sync via Vercel Cron, (2) a persisted, browsable `ReviewLog` audit trail exposed as a history page, and (3) a fix for the extraction pipeline hallucinating entries in a card's `components[]` prerequisite list. All four research passes agree on a strong headline: no new npm dependency is needed for any of the three features, continuing the "zero new packages" streak from v1.1/v1.2. Everything is buildable from platform config (Vercel Cron + `vercel.json` + `CRON_SECRET`), one new Prisma model applied via the project's established manual-Turso-DDL workaround, and reuse of existing pure helpers (`lib/card-key.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`).

The recommended approach: extract the current `POST /api/sync` body into a shared `lib/sync.ts:runSync()` (mirroring the v1.2 `lib/study-cards.ts`/`lib/dashboard.ts` shared-pipeline convention) so both the manual route and the new `GET /api/cron/sync` route call one implementation, authenticated via a new bearer-token branch inside `middleware.ts` (not a matcher exclusion, which would make the endpoint public). For `ReviewLog`, add the model + DDL first, then wire an idempotency-keyed, transactional write into `POST /api/review`, then build the history page as a standard RSC + DTO + client-shell page following the `/habits` precedent. For the `components[]` filter, reuse the deck's existing `normalizeFront`-based lookup/stem-fallback resolution pattern (the same shape as `lib/known-words.ts:countUnknownWords`) rather than literal substring containment against a card's own sentence text.

The primary risks are correctness, not technology choice: (a) the cron route is the first route in this codebase that must be reachable without the session cookie, and a careless fix (widening the middleware matcher exclusion) would leave `/api/sync` open to the public internet, burning Anthropic API budget; (b) `POST /api/review`'s existing fire-and-forget 3-attempt retry wrapper is not idempotent server-side — adding a naive best-effort `ReviewLog` write to it will produce duplicate, user-visible history rows and can silently double-apply FSRS state under network retry; and (c) the originally-assumed "deterministic post-extraction filter" design (drop `components[]` entries not literally found via substring match in a card's own sentences) is structurally wrong, because `components[]` uses abstract base-form/pattern notation while sentence text is fully conjugated Korean — a naive filter would gut almost all grammar-pattern edges, the exact opposite of the milestone's intent.

## Key Findings

### Recommended Stack

All three features are implementable with platform features and DB/config changes already conventional in this repo — no npm installs. Vercel Cron (`vercel.json` `crons[]`, `GET` handler, auto-injected `Authorization: Bearer $CRON_SECRET`) triggers the daily sync; Hobby plan caps this at once/day with hour-level (not minute-level) precision, which fits the "daily sync" requirement exactly. The `ReviewLog` model is added to `prisma/schema.prisma` and applied to Turso via the project's standard `prisma migrate diff --from-empty --to-schema ... --script` + `@libsql/client executeMultiple()` workaround (never `prisma db push`, which fails with P1013 against `libsql://`). The `components[]` filter reuses `lib/card-key.ts` (`normalizeFront`) and the resolution-order pattern already implemented in `lib/known-words.ts` — no fuzzy-string library, since edit-distance libraries are the wrong tool for Korean agglutinative morphology.

**Core technologies:**
- Vercel Cron Jobs (platform feature) — daily sync trigger; zero new infra, Hobby-plan-compatible (once/day only)
- `CRON_SECRET` env var + `Authorization: Bearer` check — the officially documented Vercel Cron auth mechanism; must be checked at the route/middleware level, never assumed
- Prisma 7.6.0 + `@prisma/adapter-libsql` (already installed) — `ReviewLog` model; DDL applied by hand to Turso, exactly as every prior schema change in this repo
- Reuse of `lib/card-key.ts` / `lib/sentence-match.ts` / `lib/known-words.ts` resolution patterns — no new dependency for the `components[]` filter fix

### Expected Features

Scope for this milestone is narrow and backend-heavy; the only feature with real UI surface is the review-history page (feature #2). Feature #1 (cron) and #3 (filter fix) are operational/correctness changes with no primary UI, aside from an optional "last synced" line in Settings ▸ Advanced.

**Must have (table stakes) for the history page:**
- Reverse-chronological, paginated list (cursor-based, ~20-30/page) of `ReviewLog` rows: timestamp, card front, rating (reusing existing grade-language, not raw 1-4 integers)
- Per-card filter — the single highest-value filter ("why is this card still hard"), higher priority than date-range or rating filters
- Empty state following the app's existing RSC hydration convention (server-rendered real state, no client loading flash)
- Entry point from an existing surface (Settings, `/wrapped`, or `CardEditor` link) — no new bottom-nav tab (app deliberately caps at 4)

**Should have (competitive, cheap once P1 ships):**
- Rating filter (lapses-only view) — actionable "show me what I've been failing"
- Date-range filter, mirroring `LessonRangeFilter.tsx`'s interaction shape (not its lesson-indexed logic)
- `CardEditor` inline mini-trend (review count / lapses / last-seen) for the card being edited

**Defer / explicit anti-features (do not build):**
- A second review-specific heatmap — redundant with the already-shipped `HabitHeatmap.tsx` (day-level activity is a solved problem; `ReviewLog`'s value is event-level detail)
- Editable/deletable log rows — conflicts with the append-only audit-trail intent; `/api/review/undo` already covers the real "I misgraded" use case
- Any charting/analytics dashboard beyond `/wrapped`'s existing vanity metrics — no algorithm-tuning surface exists in this single-config, single-user app
- Prominent home-page "last synced" chrome — belongs in Settings ▸ Advanced next to `SyncPanel`, not the tuned three-state home hero

### Architecture Approach

Each feature attaches at a well-defined existing seam, following conventions already established in v1.1/v1.2. Cron sync extracts the current inline `POST /api/sync` body into `lib/sync.ts:runSync(documentId)` (the same "shared pipeline module" pattern as `lib/study-cards.ts`/`lib/dashboard.ts`), so both the manual route and a new `app/api/cron/sync/route.ts` `GET` handler call one implementation; auth for the cron path is a new bearer-token branch added directly inside `middleware.ts` (kept inside the existing matcher, not excluded from it — the branch itself, not a matcher gap, is what grants access). The `components[]` filter is a new pure module, `lib/filter-components.ts` (or equivalent resolution-based helper), invoked from inside `lib/extract-cards.ts`'s existing post-processing `.map()`, with zero Prisma/Anthropic dependency of its own — matching the codebase's strict "pure, unit-testable `lib/` module" convention (`lib/sentence-match.ts`, `lib/sequence.ts`, `lib/card-key.ts` are the direct precedents). `ReviewLog` follows the full RSC pattern: schema/DDL first, then a transactional write inside `POST /api/review`, then `app/history/page.tsx` + `HistoryClient.tsx` + a new `ReviewLogDTO` in `lib/dto.ts`, matching `/habits`'s existing RSC + client-shell + DTO shape exactly.

**Major components:**
1. `lib/sync.ts:runSync()` — shared sync pipeline used by both `POST /api/sync` and `GET /api/cron/sync`
2. `middleware.ts` bearer-token branch — the sole auth boundary for `/api/cron/*`, extending the existing single-choke-point auth design rather than fragmenting it into per-route checks
3. `lib/filter-components.ts` (or resolution-based equivalent) — pure post-extraction correction step inside `lib/extract-cards.ts`'s pipeline
4. `ReviewLog` schema + transactional write path in `POST /api/review` — the append-only audit table, gated behind idempotency
5. `app/history/page.tsx` + `HistoryClient.tsx` + `ReviewLogDTO` — the browsable history page, following the established RSC/DTO/client-shell convention

**Suggested build order (dependency-ordered):** (a) `components[]` filter fix — standalone, lowest risk, no schema dependency, should land before cron sync so the first unattended cron run doesn't reintroduce the hallucination bug; (b) `ReviewLog` DDL + idempotent transactional write path — schema-gated foundation; (c) history page — depends on (b) having real rows; (d) cron sync — depends on (a) for correctness, otherwise independent, and can be developed in parallel with (b)/(c) once `lib/sync.ts` is extracted.

### Critical Pitfalls

1. **Cron route auth "fixed" by excluding it from the middleware matcher instead of adding a real check** — leaves `/api/sync` reachable by anyone on the internet, burning Anthropic Opus budget on demand. Keep `/api/cron/*` inside the matcher; add an explicit `Authorization: Bearer $CRON_SECRET` branch inside the middleware body, and fail closed (401) if `CRON_SECRET` is unset — never `if (secret && header !== expected)`, which silently disables auth when the env var is missing.
2. **`POST /api/review`'s existing 3-attempt retry wrapper is not idempotent server-side** — it re-reads current DB state and re-runs `reviewCard()` on every attempt, so a lost-response retry double-applies FSRS state today (silently) and will double-write visible `ReviewLog` rows once the log exists. The fix is a client-generated idempotency key threaded through `postReviewWithRetry` → `POST /api/review`, a unique constraint on `ReviewLog` keyed to it, and both writes (`CardReview.update` + `ReviewLog.create`) inside one `prisma.$transaction([...])`. Do not ship `ReviewLog` as a second best-effort `.catch(() => {})` write bolted onto the route.
3. **Undo racing an in-flight background retry can silently "un-undo" itself** — `postReviewWithRetry`'s `AbortController` isn't exposed to `handleUndo`, so a retry that lands after an undo re-applies the graded rating with zero UI feedback, and (once `ReviewLog` exists) produces a ghost log row timestamped after the undo. At minimum, cancel in-flight retries on undo and document what the history page should show for an undone review (recommended default: `ReviewLog` stays immutable/append-only; undo does not delete or mark rows).
4. **Naive substring-containment filtering for `components[]` gutts grammar-pattern edges** — `components[]` entries are abstract base-form/pattern notation (`먹다`, `~(으)면`) while sentence text is fully conjugated natural Korean; raw `includes()` checks will drop nearly all grammar-pattern components and most conjugated-vocabulary components, regressing the exact knowledge graph the milestone exists to fix. Correction from the original milestone framing: do not check literal containment against a card's own sentences/notes as the primary signal. Instead reuse the deck-lookup resolution pattern already proven in `lib/known-words.ts:countUnknownWords` — `normalizeFront()` direct match against existing cards' `normalizedFront`, then `splitParticle`-style stem fallback — the same signal `app/api/sync/route.ts`'s two-phase `CardDependency` linking already uses to resolve components to real cards. Dry-run the filter against the real corpus before wiring it into the write path; a >50% drop rate, or a drop rate skewed heavily toward `grammar`-type cards, means the filter logic is wrong, not the corpus.
5. **Unbounded `ReviewLog` queries and missing indexes** — a history page with no `take`/cursor bound will slow monotonically as reviews accumulate (low-thousands of rows within a year for a daily user); add `@@index([cardId])` and `@@index([createdAt])` in the same DDL step that creates the table, and use cursor-based pagination (page size ~20-30), matching the existing `take: 1000` bounded-pool precedent in `lib/study-cards.ts`.

## Reconciliations (cross-file disagreements resolved for the roadmapper)

### 1. ReviewLog write pattern: idempotency key + transaction (not sequential unguarded writes)

STACK.md leans toward two sequential independent awaits (no `$transaction`), citing that this codebase has zero existing `$transaction` precedent and that official Prisma/Turso docs don't explicitly confirm interactive-transaction support over libSQL's HTTP transport. ARCHITECTURE.md recommends `prisma.$transaction([cardReview.update, reviewLog.create])` (the array/batch form, not the interactive callback form) for atomicity. PITFALLS.md identifies the root problem underneath the transaction question: `POST /api/review` is not idempotent under retry today — it re-reads DB state and re-runs `reviewCard()` on every attempt of the existing 3-attempt client retry wrapper, so a lost-response retry silently double-applies FSRS state. Once `ReviewLog` exists, that same double-write becomes a user-visible duplicate history row, not just a hidden state-corruption bug.

**Resolution for the roadmapper:** treat this as one requirement, not an open question — idempotency key + `prisma.$transaction([...])` (batch/array form) is core scope for the `ReviewLog` phase, not a stretch goal. The array form (not the interactive callback form) is sufficient since both writes are computed synchronously before the transaction call, sidestepping STACK.md's Turso-interactive-transaction concern. A client-generated idempotency key (e.g. `crypto.randomUUID()` created once per grade action in `submitReview`, reused across all retry attempts) should be passed to `POST /api/review` and enforced via a unique constraint on `ReviewLog` (or an equivalent dedup check before `reviewCard()` is re-applied). This is justified because correctness now has a visible failure mode: once there's a browsable history page, a duplicate row is not an invisible aggregate-state nuisance anymore — it's a bug the user can literally see and count. Flag as an explicit UAT check: simulate a slow/flaky retry (devtools network throttling) while grading a card and confirm exactly one `ReviewLog` row and one FSRS state transition result.

### 2. `components[]` filter approach: resolution-based lookup, not sentence-text containment

The milestone's original framing (per pending todo) assumed a "deterministic post-extraction filter" that drops `components[]` entries not found via literal substring containment in the card's own sentences/notes. PITFALLS.md's dedicated analysis (Pitfall 4) demonstrates this premise is structurally wrong: `components[]` entries are abstract base-form lemmas and pattern notation (`먹다`, `~(으)면`, `~고 싶다`) as documented in `lib/extract-cards.ts`'s own prompt, while `sentences[].korean` is fully conjugated natural Korean and `notes` is free-text explanation — neither contains the component's literal notation. A raw `includes()` filter would drop nearly every grammar-pattern component (which never appears character-for-character with its `~`/parens notation in a natural sentence) and most conjugated-vocabulary components, for the same reason `lib/sentence-match.ts`'s `splitParticle` already documents as an unsolved general problem — except worse here, since grammar-pattern notation has no morphological relationship to sentence surface forms at all.

**Resolution for the roadmapper:** correct the requirement before it's planned. "Fix spurious `components[]`" should mean: filter a component out only if it does not resolve to a real card in the deck via the existing `normalizeFront()` lookup pattern (the same signal `app/api/sync/route.ts`'s two-phase `CardDependency` linking already uses), following the two-step resolution order already proven in `lib/known-words.ts:countUnknownWords` — direct `normalizeFront` match first, then a `splitParticle`-style stem fallback if literal-text checking against sentence content is still wanted as a secondary signal. This is NOT literal substring containment against the card's own sentence/notes text. Ship the filter as a new pure `lib/` module (no Prisma/Anthropic dependency, matching the `lib/sentence-match.ts`/`lib/sequence.ts` convention) so it stays independently unit-testable. Before wiring it into the write path, dry-run it against the real corpus (no writes) and verify the drop rate for `grammar`-type components is not dramatically higher than for `vocabulary`-type components — a large asymmetry there is the signal that the filter, not the corpus, is broken.

## Implications for Roadmap

Based on combined research, suggested phase structure (4 phases, dependency-ordered):

### Phase 1: Components[] Filter Fix
**Rationale:** Standalone, lowest risk, zero schema dependency, purely a pure-function addition to an existing pipeline. Per the reconciliation above and ARCHITECTURE.md's build order, this should land before cron sync so the first unattended daily cron run doesn't reintroduce the hallucination bug it's meant to fix.
**Delivers:** A new pure `lib/filter-components.ts` (or equivalent) module using `normalizeFront()` deck-lookup resolution (not substring containment), invoked from `lib/extract-cards.ts`'s existing post-processing step; dry-run validation against the real corpus before enabling in the write path.
**Addresses:** The extraction-correctness gap identified in the milestone's original scope (correcting a wrong initial assumption per Reconciliation #2).
**Avoids:** Pitfall 4 (naive substring filter gutting grammar-pattern edges).

### Phase 2: ReviewLog Schema + Idempotent Write Path
**Rationale:** Foundation for the history page — nothing in Phase 3 can be built or tested until the table exists on Turso and writes are trustworthy. Per Reconciliation #1, the idempotency/transaction design is core scope here, not deferred.
**Delivers:** `ReviewLog` Prisma model + manual Turso DDL (with `@@index([cardId])`/`@@index([createdAt])` from the start), a client-generated idempotency key threaded through `postReviewWithRetry` → `POST /api/review`, and `prisma.$transaction([cardReview.update, reviewLog.create])` (array form) replacing the current single write. Includes resolving the undo-vs-in-flight-retry race (Pitfall 3) — at minimum, cancel in-flight retries on undo.
**Uses:** Prisma 7.6.0 + `@prisma/adapter-libsql` (existing); the project's standard `migrate diff --from-empty --script` + `executeMultiple()` DDL workaround.
**Implements:** The `ReviewLog` write-path architecture component from ARCHITECTURE.md.

### Phase 3: Review History Page
**Rationale:** Depends on Phase 2 having real rows to display; otherwise a standard, low-risk RSC + client-shell addition following the exact established `/habits` pattern (no new architectural ground).
**Delivers:** `app/history/page.tsx` (thin async RSC) + `components/HistoryClient.tsx` + `ReviewLogDTO` in `lib/dto.ts`; reverse-chronological, cursor-paginated list (~20-30/page); per-card filter (highest-value, ship first); grade shown via existing mastery-language/colors, not raw integers; empty state matching the RSC-05 no-loading-flash convention; entry point via Settings/`/wrapped`/`CardEditor` link (no new bottom-nav tab).
**Addresses:** FEATURES.md's P1 table-stakes set (list, per-card filter, empty state, entry point) — explicitly excludes the anti-features (second heatmap, editable rows, analytics dashboard, prominent home-page sync chrome).
**Avoids:** The unbounded-`findMany` performance trap; the "history page renders every row with no aggregation" UX pitfall.

### Phase 4: Vercel Cron Auto-Sync
**Rationale:** Sequenced last because correctness depends on Phase 1 (filter fix) already being live — otherwise the first unattended cron run re-persists unfiltered/hallucinated `components[]`. Independent of Phases 2-3 otherwise; `lib/sync.ts` extraction and `CRON_SECRET` provisioning can start in parallel with earlier phases if desired.
**Delivers:** `lib/sync.ts:runSync(documentId)` extracted from the current `POST /api/sync` body; new `app/api/cron/sync/route.ts` (`GET` handler, reads `NEXT_PUBLIC_GOOGLE_DOC_ID` server-side); `vercel.json` with a once-daily `crons[]` entry; a new bearer-token branch inside `middleware.ts` (kept inside the existing matcher, `CRON_SECRET` checked, fail-closed if unset); `CRON_SECRET` provisioned in Vercel Production env vars.
**Delivers (optional, confirm at requirements):** A "Last auto-synced" line in Settings ▸ Advanced next to the existing `SyncPanel`, if visibility into cron success/failure is wanted (flagged as a gap below — not one of the three named features but raised independently by both FEATURES.md and PITFALLS.md).

### Phase Ordering Rationale

- Filter fix first: lowest risk, no dependencies, and its correctness gates whether cron sync (Phase 4) is safe to enable — an unattended daily sync should not be the first thing to exercise a still-unverified filter.
- ReviewLog schema/write-path before the history page: the DDL-then-code split is a hard Turso constraint (same pattern as every prior schema change in this repo), and the page's correctness is only as good as the write path's idempotency — building the page against an unreliable write path would surface duplicate-row bugs as a UI problem instead of catching them at the source.
- Cron sync last: it is the feature most exposed to "silent failure" (Vercel does not retry or alert on cron failures) and most dependent on getting an entirely new auth pattern right (the first route in this codebase reachable without the session cookie) — sequencing it after the other three gives more implementation experience with this milestone's conventions before tackling the highest-blast-radius security surface (an unauthenticated route could burn real API budget).
- Cross-cutting: every phase reuses an existing convention (shared `lib/` pipeline modules, RSC+DTO+client-shell pages, manual Turso DDL, pure single-source-of-truth `lib/` helpers) rather than introducing a new pattern — keeps v1.4 architecturally consistent with v1.1/v1.2.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (ReviewLog write path):** The exact idempotency-key mechanism (client-generated UUID threading, unique-constraint shape, and interaction with `handleUndo`'s in-flight-retry race) is a genuine design decision, not a copy-paste of an existing pattern — recommend `--research-phase` or at least a focused discuss-phase pass specifically on the idempotency/undo interaction before planning.
- **Phase 4 (Cron sync auth):** The Vercel Cron auth pattern (middleware bearer-token branch alongside the existing cookie gate) is architecturally new for this codebase — MEDIUM confidence across all four research files (cross-verified via WebSearch, not all directly read from primary Vercel docs in every pass). Worth a final direct-docs check at plan time.

Phases with standard patterns (skip research-phase):
- **Phase 1 (filter fix):** Directly reuses `lib/known-words.ts`'s already-implemented resolution pattern — a known shape, not new research.
- **Phase 3 (history page):** Directly follows the `/habits` RSC + client-shell + DTO precedent — a known shape, not new research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Cron mechanics verified directly against current official Vercel docs (HIGH); Prisma/libSQL transaction behavior over Turso's HTTP transport is not explicitly documented anywhere (MEDIUM, filled by reasoned inference — resolved in this summary by choosing the transaction-array form specifically to sidestep the interactive-transaction uncertainty) |
| Features | MEDIUM | Grounded in direct reading of this app's existing conventions and `PROJECT.md` (HIGH), cross-referenced against Anki's Card Info/Stats/Review-Heatmap patterns as the nearest domain analogue (single web source per claim, MEDIUM) |
| Architecture | HIGH | Codebase-grounded (direct reads of `middleware.ts`, `app/api/sync/route.ts`, `app/api/review/route.ts`, `lib/extract-cards.ts`, `prisma/schema.prisma`, `components/StudySession.tsx`); the one external pattern (Vercel Cron auth) is MEDIUM, cross-verified against official docs |
| Pitfalls | MEDIUM | Codebase-specific pitfalls (auth matcher, retry idempotency, undo race, filter notation mismatch) are HIGH confidence — derived from direct inspection of the actual retry/undo/filter code, not general web patterns. General web-sourced claims (Prisma audit-log-at-scale framing, optimistic-update race framing) are LOW confidence and used only as corroboration, not as load-bearing sources |

**Overall confidence:** MEDIUM-HIGH — the codebase-specific findings (which drive nearly every actionable recommendation and both reconciliations above) are consistently HIGH confidence across all four files; the residual uncertainty is confined to two external, not-fully-verified claims (Turso interactive-transaction support, and Vercel Cron auth cross-verification depth) that this summary has already routed around via conservative design choices (batch-form transaction; middleware-centralized auth).

### Gaps to Address

- **Undo/ReviewLog interaction is an explicit product decision, not resolved here:** the recommended default (ReviewLog stays immutable/append-only; undo does not delete or mark rows, so an undone review still appears in history) should be confirmed as acceptable UX before Phase 2/3 planning locks it in — flagged consistently by ARCHITECTURE.md and PITFALLS.md as a decision point, not an implementation detail.
- **"Last cron sync" visibility is out of the three named features but raised independently by two research passes** (FEATURES.md and PITFALLS.md) as a real gap: Vercel does not alert on cron failures, so a silently-broken daily sync could go unnoticed for a long time without some visible status. Recommend a lightweight addition (a `Setting` row updated on each cron run, surfaced in Settings ▸ Advanced next to `SyncPanel`) — confirm at requirements time whether this is in v1.4 scope or explicitly deferred.
- **Exact idempotency-key transport mechanism (Phase 2) needs a concrete design pass**, not just "add a UUID" — specifically how `handleUndo` should interact with an in-flight retry carrying that key (cancel it? let it complete and treat the log row as informational-only?). Flagged as a Research Flag above.
- **Filter dry-run validation methodology (Phase 1)** — PITFALLS.md recommends running the corrected filter against the real corpus before enabling it in the write path and checking for a drop-rate asymmetry between `grammar`- and `vocabulary`-type components; this should be an explicit verification step in the Phase 1 plan, not left implicit.

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (all four research files): `CLAUDE.md`, `.planning/PROJECT.md`, `middleware.ts`, `lib/auth.ts`, `app/api/sync/route.ts`, `app/api/review/route.ts`, `app/api/review/undo/route.ts`, `components/StudySession.tsx`, `lib/extract-cards.ts`, `lib/sentence-match.ts`, `lib/known-words.ts`, `lib/card-key.ts`, `prisma/schema.prisma`, `prisma.config.ts`, `lib/prisma.ts`, `scripts/apply-graph-ddl.mjs`, `package.json`
- https://vercel.com/docs/cron-jobs — fetched directly 2026-07-02, `crons[]` schema, expression limits, Hobby daily-only + within-the-hour timing
- https://vercel.com/docs/cron-jobs/manage-cron-jobs — fetched directly 2026-07-02, `CRON_SECRET`/`Authorization: Bearer` mechanism, non-retry-on-failure behavior, idempotency guidance

### Secondary (MEDIUM confidence)
- WebSearch cross-checks on Vercel Cron Hobby-plan limits (consistent with fetched docs)
- WebSearch on Prisma/libSQL interactive-transaction support over Turso HTTP transport — inconclusive, used only to justify caution, not as a positive claim
- [Card Info, Graphs and Statistics — Anki Manual](https://docs.ankiweb.net/stats.html) and [Review Heatmap add-on](https://ankiweb.net/shared/info/1771074083) — per-review-event vs. day-level-heatmap distinction

### Tertiary (LOW confidence)
- General web sources on Vercel Cron route method/matcher pitfalls, Prisma audit-log-at-scale patterns, and optimistic-update race framing — used only as corroboration for codebase-derived findings, not as independent claims

---
*Research completed: 2026-07-02*
*Ready for roadmap: yes*
