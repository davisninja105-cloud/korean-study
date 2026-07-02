# Requirements: Korean Study — Foundation-First Study

**Defined:** 2026-07-02
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1 Requirements

Requirements for milestone v1.3 "Reliability & Hardening". Sourced from the `.planning/codebase/CONCERNS.md` audit (2026-07-02). Each maps to roadmap phases.

### Review (API correctness & save reliability)

- [x] **REVIEW-01**: `/api/review` wraps its Prisma calls in `try/catch` and returns a proper error response on DB failure
- [x] **REVIEW-02**: `/api/review` rejects ratings outside `[1,2,3,4]` with a 400 instead of passing garbage to `reviewCard()`
- [x] **REVIEW-03**: Editing a card's front to a value that collides (post-normalization) with another card's front returns a clear 400 message instead of an uncaught 500
- [x] **REVIEW-04**: Background `POST /api/review` retries silently on failure; a toast appears only if retries are exhausted
- [x] **REVIEW-05**: Undo restores queue/session state atomically so an interrupted undo can't leave partial state

### Sync

- [x] **SYNC-01**: Sync failures surface which specific lesson(s) failed (not just a generic "remaining" count) in the SyncPanel

### Performance

- [x] **PERF-01**: Sync resolves `CardDependency` lemmas via a cached `normalizedFront → cardId` map instead of re-querying the full deck per lesson
- [x] **PERF-02**: Tap-to-gloss cache preloads recent entries from the DB `Setting` table on mount
- [ ] **PERF-03**: `StudySession`'s sentence-selection calculation is memoized instead of recomputing every render

### Refactor

- [ ] **REFACTOR-01**: `StudySession.tsx` is split into `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` sub-components
- [ ] **REFACTOR-02**: Sentence-selection logic is extracted into a pure, independently-testable module

## v2 Requirements

None deferred — this milestone's scope was drawn directly from CONCERNS.md and fully agreed at definition time.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rate limiting on `/api/sync` | Single-tenant app with a shared password; Vercel Hobby timeout already caps the damage. `CONCERNS.md` flags this low-priority for a personal app. |
| Time-bound HMAC auth token | Deterministic token is an accepted tradeoff for a single shared-password personal app. |
| API route test coverage (integration tests) | Large scope, separate initiative from this bug-fix/hardening milestone — revisit as its own milestone. |
| UI component test coverage | Same as above — broad testing initiative, not a targeted fix. |
| Card retirement / mastery flag | Net-new feature, not a CONCERNS.md correctness fix — belongs in a future features milestone. |
| Study history / review log table | Net-new feature (new `ReviewLog` table) — belongs in a future features milestone. |
| Background/scheduled sync (Vercel Cron) | Net-new feature, not a bug fix — belongs in a future features milestone. |
| Claude model fallback (extraction) | Speculative mitigation for a deprecation that hasn't happened; revisit if Anthropic announces `claude-opus-4-8` sunset. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REVIEW-01 | Phase 13 | Complete |
| REVIEW-02 | Phase 13 | Complete |
| REVIEW-03 | Phase 13 | Complete |
| REVIEW-04 | Phase 13 | Complete |
| REVIEW-05 | Phase 13 | Complete |
| SYNC-01 | Phase 14 | Complete |
| PERF-01 | Phase 14 | Complete |
| PERF-02 | Phase 14 | Complete |
| PERF-03 | Phase 15 | Pending |
| REFACTOR-01 | Phase 15 | Pending |
| REFACTOR-02 | Phase 15 | Pending |

**Coverage:**

- v1 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0

**By phase:**

- Phase 13 — Review API Hardening & Save Reliability: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, REVIEW-05 (5)
- Phase 14 — Sync Failure Visibility & Caching Performance: SYNC-01, PERF-01, PERF-02 (3)
- Phase 15 — StudySession Refactor & Sentence-Selection Memoization: REFACTOR-02, PERF-03, REFACTOR-01 (3)

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 — traceability mapped during v1.3 roadmap creation (11/11 covered)*
