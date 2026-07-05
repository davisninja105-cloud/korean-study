# Requirements: Korean Study — Foundation-First Study

**Defined:** 2026-07-02
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1.4 Requirements

Requirements for the "Knowledge Graph Quality & History" milestone. Each maps to roadmap phases.

### Knowledge Graph Quality

- [x] **GRAPH-01**: Extraction prompt explicitly instructs Claude to only list a component if it's a real prerequisite the card's content actually depends on (prompt tightening)
- [x] **GRAPH-02**: Claude's extraction response is structurally validated immediately after receipt (type-checked, malformed/truncated output rejected) — matches the existing LLM-response-validation convention (e.g. `lib/gloss.ts`)
- [x] **GRAPH-03**: A `components[]` entry is kept only if it resolves to a real card via `normalizeFront()` deck-lookup — not literal sentence-text containment, which would gut abstract grammar-pattern notation (e.g. `~(으)면`) that never appears verbatim in conjugated sentences
- [x] **GRAPH-04**: The filter is a pure, unit-tested `lib/` module reusing the two-phase resolution pattern already proven in `lib/known-words.ts` (direct `normalizeFront` match, then stem fallback)
- [x] **GRAPH-05**: Filter is dry-run validated against the real corpus (no writes) with drop-rate reported separately for `grammar`- vs `vocabulary`-type components, before being wired into the sync write path

### Review History

- [x] **HIST-01**: Every FSRS review writes a `ReviewLog` row (timestamp, cardId, rating, resulting FSRS state)
- [x] **HIST-02**: `ReviewLog` writes are idempotent — a client-generated idempotency key + `prisma.$transaction([...])` ensures a lost-response retry never produces a duplicate row or double-applies FSRS state
- [x] **HIST-03**: In-flight background retries are cancelled when the user triggers undo, preventing a stale retry from silently re-applying a rating after undo
- [x] **HIST-04**: User can view a reverse-chronological, cursor-paginated history of their reviews (~20-30/page), reachable from an existing surface (Settings, `/wrapped`, or `CardEditor` — no new bottom-nav tab)
- [x] **HIST-05**: User can filter the history view down to a single card
- [x] **HIST-06**: Undone reviews remain visible in history, unmarked — `ReviewLog` is append-only and never mutated by undo
- [x] **HIST-07**: History page follows the RSC + DTO + client-shell hydration pattern (real data on first paint, no loading flash)

### Automatic Sync

- [ ] **SYNC-02**: A Vercel Cron job runs daily and triggers exactly 1 lesson of sync via the existing `MAX_LESSONS_PER_SYNC=1` path (code-complete; awaiting deployment + first scheduled invocation, see 19-UAT.md)
- [x] **SYNC-03**: Cron-triggered requests authenticate via a `CRON_SECRET` bearer token, checked inside `middleware.ts`, fail-closed if the secret is unset — the cron route stays inside the auth matcher, never excluded from it
- [x] **SYNC-04**: Settings ▸ Advanced shows a "last auto-synced" timestamp so a silently-failing daily cron doesn't go unnoticed

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Card Lifecycle

- **MASTERY-01**: Card retirement/mastery flag — graduate a well-known card out of the active due pool, with manual un-mastery

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Second Claude call to self-verify extraction output | Would add real latency to an already timeout-constrained sync path (60-120s/lesson against Vercel Hobby's 60s hard cap) — structural validation (GRAPH-02) plus deck-lookup filtering (GRAPH-03) is the safer approach |
| A second review-specific heatmap or any analytics dashboard beyond `/wrapped` | Redundant with the already-shipped `HabitHeatmap` (day-level activity is a solved problem); no algorithm-tuning surface exists in this single-config, single-user app |
| Editable/deletable `ReviewLog` rows | Conflicts with append-only audit-trail intent; `/api/review/undo` already covers the real "I misgraded" use case |
| Prominent home-page sync-status chrome | Belongs in Settings ▸ Advanced next to `SyncPanel`, not the tuned three-state home hero |
| Card retirement/mastery flag | Net-new feature, not a knowledge-graph/history/sync fix — belongs in a future features milestone (see v2 Requirements) |
| Rate limiting on `/api/sync` | Single-tenant app with a shared password; Vercel Hobby timeout already caps the damage — carried over from v1.3 |
| Time-bound HMAC auth token | Deterministic token is an accepted tradeoff for a single shared-password personal app — carried over from v1.3 |
| Broad API/UI test coverage (integration tests) | Large scope, separate initiative — carried over from v1.3 |
| Claude model fallback (extraction) | Speculative mitigation for a deprecation that hasn't happened — carried over from v1.3 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRAPH-01 | Phase 16 | Complete |
| GRAPH-02 | Phase 16 | Complete |
| GRAPH-03 | Phase 16 | Complete |
| GRAPH-04 | Phase 16 | Complete |
| GRAPH-05 | Phase 16 | Complete |
| HIST-01 | Phase 17 | Complete |
| HIST-02 | Phase 17 | Complete |
| HIST-03 | Phase 17 | Complete |
| HIST-04 | Phase 18 | Complete |
| HIST-05 | Phase 18 | Complete |
| HIST-06 | Phase 18 | Complete |
| HIST-07 | Phase 18 | Complete |
| SYNC-02 | Phase 19 | Code-complete, awaiting deployment |
| SYNC-03 | Phase 19 | Complete |
| SYNC-04 | Phase 19 | Complete |

**Coverage:**

- v1.4 requirements: 15 total
- Mapped to phases: 15 ✓ (Phase 16: 5 · Phase 17: 3 · Phase 18: 4 · Phase 19: 3)
- Unmapped: 0

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 — roadmap created, all 15 requirements mapped to Phases 16–19*
