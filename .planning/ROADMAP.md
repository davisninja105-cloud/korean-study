# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- 🚧 **v1.3 Reliability & Hardening** — Phases 13–15 (in progress)

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

### 🚧 v1.3 Reliability & Hardening (In Progress)

**Milestone Goal:** Fix the most pressing correctness/reliability findings from the `.planning/codebase/CONCERNS.md` audit, plus targeted performance and maintainability cleanup. No new user-facing features — every phase makes an existing behavior more robust, more diagnosable, or more maintainable.

- [x] **Phase 13: Review API Hardening & Save Reliability** - try/catch + rating validation in `/api/review`, friendly front-collision error, silent review-save retry, atomic undo (completed 2026-07-02)
- [x] **Phase 14: Sync Failure Visibility & Caching Performance** - name failed lessons in the SyncPanel, cache the `normalizedFront → cardId` map during sync, preload the gloss cache from the DB (completed 2026-07-02)
- [ ] **Phase 15: StudySession Refactor & Sentence-Selection Memoization** - extract sentence-selection into a pure, tested module + memoize it, then split into mode sub-components

## Phase Details

### Phase 13: Review API Hardening & Save Reliability

**Goal**: Recording a review and editing a card never fail silently or corrupt session state — every failure path returns a clear response, and the client recovers gracefully instead of losing data.
**Depends on**: v1.2 (shipped baseline); first phase of the milestone
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05
**Success Criteria** (what must be TRUE):

  1. A database error during a review returns a structured error response instead of throwing an unhandled 500 (`/api/review` is wrapped in `try/catch` like the other routes).
  2. Posting a rating outside `[1,2,3,4]` (e.g. `0` or `99`) is rejected with a 400 and never reaches `reviewCard()`.
  3. Editing a card's front to a value that normalizes to another card's front shows a clear "this front already exists" message (400), not a generic uncaught server error.
  4. When the background `POST /api/review` save fails, it retries silently; a toast appears only after all retries are exhausted.
  5. After undoing a review, the previous card reappears with the queue, seen-card set, and session stats all restored consistently — an interrupted undo never leaves partially-restored state.

**Plans**: 2/2 plans complete

- [x] 13-01-PLAN.md — Harden /api/review (try/catch + rating validation) and friendly card-front collision 400 (REVIEW-01, REVIEW-02, REVIEW-03)
- [x] 13-02-PLAN.md — Silent bounded retry + toast on review-save failure, atomic undo restoration (REVIEW-04, REVIEW-05)

### Phase 14: Sync Failure Visibility & Caching Performance

**Goal**: Sync problems are diagnosable at a glance, and the data layer stops repeating expensive per-lesson and per-session lookups.
**Depends on**: Phase 13 (milestone sequencing; no hard code dependency — Phase 14 touches sync/gloss files that Phase 13 does not)
**Requirements**: SYNC-01, PERF-01, PERF-02
**Success Criteria** (what must be TRUE):

  1. When one or more lessons fail to extract during sync, the SyncPanel names the specific failed lesson(s), not just a generic "remaining" count.
  2. A multi-lesson sync resolves `CardDependency` lemmas from a `normalizedFront → cardId` map built once per request; the full-deck lookup no longer runs per lesson (verifiable via query count / logs).
  3. On a fresh page load, previously-glossed words resolve instantly from a cache preloaded from the DB `Setting` table on mount — no LLM round-trip for words already looked up.

**Plans**: 2/2 plans complete

- [x] 14-01-PLAN.md — Name the specific failed lesson in the SyncPanel (content excerpt + sanitized errors) and build the sync `normalizedFront → cardId` map once per request (SYNC-01, PERF-01)
- [x] 14-02-PLAN.md — Preload the tap-to-gloss cache from the DB `Setting` table on mount, keyed to match the server (PERF-02)

### Phase 15: StudySession Refactor & Sentence-Selection Memoization

**Goal**: `StudySession.tsx` is decomposed into focused, independently-testable pieces and stops recomputing sentence selection on every render — with study behavior preserved exactly.
**Depends on**: Phase 13 (shares `components/StudySession.tsx` — behavioral fixes for `submitReview`/undo land first, so this structural refactor preserves already-verified behavior rather than reworking it)
**Requirements**: REFACTOR-02, PERF-03, REFACTOR-01
**Sequencing note**: Extract the pure sentence-selection module (REFACTOR-02) and memoize it (PERF-03) first/together, THEN split the three modes into sub-components (REFACTOR-01) — this avoids restructuring the selection logic twice.
**Success Criteria** (what must be TRUE):

  1. Sentence-selection logic lives in a pure module with its own unit tests, importable and testable without rendering `StudySession`.
  2. Sentence selection is memoized — it recomputes only when its inputs change (e.g. `[cardSentences, reps]`), not on every render.
  3. `StudySession` renders each study mode through a dedicated `FlashcardMode` / `MultipleChoiceMode` / `FillBlankMode` sub-component.
  4. A live study session behaves identically to before — flip, grade, undo, Exposure/Recall toggle, and mode switching all work with no regression.
  5. `npm run lint` stays clean (`react-hooks/purity` respected — no impure calls in render) and `npm test` passes, including the new sentence-selection tests.

**Plans**: 2 plans

- [ ] 15-01-PLAN.md — Extract sentence-selection into pure, tested `lib/sentence-selection.ts` + memoize it in StudySession; single-source `hashStr` (REFACTOR-02, PERF-03)
- [ ] 15-02-PLAN.md — Split StudySession into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` sub-components + live UAT (REFACTOR-01)

## Progress

**Execution Order:**
Phases execute in numeric order: 13 → 14 → 15

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
| 13. Review API Hardening & Save Reliability | v1.3 | 2/2 | Complete    | 2026-07-02 |
| 14. Sync Failure Visibility & Caching Performance | v1.3 | 2/2 | Complete    | 2026-07-02 |
| 15. StudySession Refactor & Sentence-Selection Memoization | v1.3 | 0/2 | Not started | - |
