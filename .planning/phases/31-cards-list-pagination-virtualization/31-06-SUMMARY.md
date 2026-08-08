---
phase: 31-cards-list-pagination-virtualization
plan: 06
subsystem: ui
tags: [prisma, cards-list, e2e, playwright, requirements-sync]

# Dependency graph
requires:
  - phase: 31-cards-list-pagination-virtualization
    provides: getCardsPage/getSentencesPage cursor-paginated query layer, CardsClient's Virtuoso-backed Cards/Reading-practice toggle with getState/restoreStateFrom snapshotting
provides:
  - Real, server-computed per-card sentence-count signal (Prisma `_count` aggregate → CardDTO.sentenceCount → "N sentence(s)" badge)
  - Durable Playwright regression spec proving D-08's tab-switch round-trip scroll/state preservation
  - Accurate CARDS-01/02/03 status in REQUIREMENTS.md
affects: [phase-32, phase-33, future-cards-list-work]

# Actuals (#2632)
actuals:
  tokens: 3200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prisma `_count: { select: { relation: true } }` as a query-level aggregate replacement for a dropped/excluded relation include — avoids loading the excluded rows while still surfacing a count."

key-files:
  created:
    - e2e/cards-tab-switch-scroll.spec.ts
  modified:
    - lib/cards-list.ts
    - lib/dto.ts
    - components/CardsClient.tsx
    - tests/cards-list.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "sentenceCount is optional on CardDTO (not required) since only list-query paths populate it; every other CardDTO producer leaves it undefined and consumers read `card.sentenceCount ?? card.sentences.length`."
  - "REQUIREMENTS.md's CARDS-01/02/03 status flip was gated on Task 1 + Task 2 verify passing AND WINDOWS.md entry #1 reading 'waived' in this execution session — both held, so the flip proceeded."

patterns-established:
  - "D-08-style tab-switch/state-preservation regression specs poll window.scrollY with expect.poll rather than a single synchronous read post-click — Virtuoso's restoreStateFrom applies over a couple of rAF frames after remount."

requirements-completed: [CARDS-01, CARDS-02, CARDS-03]

coverage:
  - id: D1
    description: "Every card row shows a real, server-computed per-card sentence count (including exactly 0 for a 0-sentence card), without the list query ever loading the actual Sentence rows."
    requirement: "CARDS-01"
    verification:
      - kind: unit
        ref: "tests/cards-list.test.ts#requests a server-computed _count aggregate and maps it to sentenceCount"
        status: pass
      - kind: unit
        ref: "tests/cards-list.test.ts#maps a 0-sentence card to sentenceCount: 0 (present, not undefined/omitted — CARDS-01 empty edge)"
        status: pass
      - kind: unit
        ref: "tests/cards-list.test.ts#maps the nested card's _count aggregate to card.sentenceCount (31-06)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Switching Cards -> Reading Practice -> Cards -> Reading Practice preserves each view's exact window scroll offset and issues at most one lazy /api/cards/sentences request, zero /api/cards page requests."
    requirement: "CARDS-02"
    verification:
      - kind: e2e
        ref: "e2e/cards-tab-switch-scroll.spec.ts#Cards <-> Reading practice tab switch preserves window scroll position round-trip (D-08)"
        status: pass
    human_judgment: false
  - id: D3
    description: "REQUIREMENTS.md's CARDS-01/02/03 checklist and Traceability rows reflect the actual, current, verified state of the codebase."
    verification:
      - kind: other
        ref: "git diff --stat .planning/REQUIREMENTS.md (exactly 6 changed lines)"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-08-08
status: complete
---

# Phase 31 Plan 06: Gap Closure — Sentence-Count Signal, D-08 E2E, REQUIREMENTS.md Sync Summary

**Per-card sentence-count badge sourced from a Prisma `_count` aggregate (no Sentence rows loaded), a fail-first-proven Playwright regression spec for tab-switch scroll/state preservation, and REQUIREMENTS.md synced to reflect CARDS-01/02/03 as Complete.**

## Performance

- **Duration:** ~6 min (commit-to-commit span, 17:40:02–17:45:46 local)
- **Started:** 2026-08-08T00:39:xxZ (approx — task file reads preceded first commit)
- **Completed:** 2026-08-08T00:45:46Z
- **Tasks:** 3
- **Files modified:** 6 (5 modified, 1 new)

## Accomplishments

- `lib/cards-list.ts`'s `cardSelect` now requests `_count: { select: { sentences: true } }`; `getCardsPage`/`getSentencesPage` map that aggregate to `CardDTO.sentenceCount` on every card and on `getSentencesPage`'s nested card — a real per-card sentence count without ever loading the underlying `Sentence` rows, closing WINDOWS.md entry #6.
- `components/CardsClient.tsx`'s `renderCardRow` computes `sentenceCount = card.sentenceCount ?? card.sentences.length` and renders an unconditional "N sentence(s)" badge (0-sentence cards included, not gated behind `> 0`).
- New `e2e/cards-tab-switch-scroll.spec.ts` proves D-08's round-trip scroll/state preservation end-to-end: scrolls Cards, switches to Reading Practice, scrolls to a different depth, switches back twice, and asserts `window.scrollY` restores exactly on both return trips, plus asserts at most one lazy `/api/cards/sentences` request and zero `/api/cards` page requests across the whole flow. Confirmed fail-first (stubbed `switchView`'s `getState`/`restoreStateFrom` calls to a no-op, watched the spec fail with `Expected: 300, Received: 0`) before confirming it passes against the real code.
- `.planning/REQUIREMENTS.md`'s CARDS-01/02/03 checklist lines and Traceability table rows flipped from `Gaps Found`/`Pending` to `Complete`, gated on Task 1's and Task 2's `<verify>` actually passing in this session and WINDOWS.md entry #1 confirmed `waived`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-card sentence-count signal — cardSelect._count, CardDTO.sentenceCount, renderCardRow badge** - `8dd8159` (feat)
2. **Task 2: D-08 tab-switch scroll/state-preservation regression spec** - `f20326b` (test)
3. **Task 3: REQUIREMENTS.md doc sync — CARDS-01/02/03 status** - `9d525c8` (docs)

## Files Created/Modified
- `lib/cards-list.ts` - `cardSelect._count` aggregate; `sentenceCount` mapped in `getCardsPage`/`getSentencesPage`
- `lib/dto.ts` - `CardDTO.sentenceCount?: number` (optional, list-query-only field)
- `components/CardsClient.tsx` - `renderCardRow`'s new sentence-count badge
- `tests/cards-list.test.ts` - `makeRow()`'s new `_count` default; 3 new assertions covering the `_count` select, mapped counts (3 and 0), and the nested `getSentencesPage` card mapping
- `e2e/cards-tab-switch-scroll.spec.ts` - new D-08 round-trip scroll/state-preservation regression spec
- `.planning/REQUIREMENTS.md` - CARDS-01/02/03 checklist + Traceability status synced to `Complete`

## Decisions Made

- `sentenceCount` kept optional on `CardDTO` rather than required — only the two list-query paths populate it; every other producer (create/edit/study-cards) already returns the real `sentences` array, so requiring the field would force those call sites to backfill a value they don't need. Consumers read `card.sentenceCount ?? card.sentences.length`.
- The e2e spec uses `expect.poll()` rather than a single synchronous `window.scrollY` read immediately after the toggle click — Virtuoso's `restoreStateFrom` measures rows and applies the scroll restore over a couple of `requestAnimationFrame` cycles after remount, so an immediate read raced the restore and produced a false failure during initial spec authoring (fixed before the fail-first proof, not masking a real bug — confirmed by then reverting the real code and watching the poll still correctly time out and fail).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree `node_modules` was empty, blocking `npx playwright test`**
- **Found during:** Task 2 (running the new e2e spec for the first time)
- **Issue:** This worktree's own `node_modules` directory was empty (only vitest/vite cache dirs present) — `npm run build`, `npm run lint`, and `npx vitest run` had all succeeded via Node's directory-walking module resolution (finding the parent repo's `node_modules`), but `e2e/seed.ts:resetToBaseline()` builds an explicit `path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')` path that only resolves within the worktree's own local `node_modules`, which failed with `ENOENT`. This affected every e2e spec in the suite, not just the new one — confirmed by running the pre-existing `e2e/cards-sticky-header.spec.ts` and observing the identical failure.
- **Fix:** Ran `npm install --prefer-offline --no-audit --no-fund` in the worktree (fully resolved from the local npm cache in ~9s, 565 packages, no network fetch required). No `package.json`/`package-lock.json` changes — this only populated the worktree's own `node_modules` to match the already-locked dependency set.
- **Files modified:** None (node_modules is gitignored; no commit needed or made for this fix)
- **Verification:** Re-ran `e2e/cards-sticky-header.spec.ts` (pre-existing, previously blocked) and confirmed it now passes; then proceeded with Task 2's own spec.
- **Committed in:** N/A — no tracked files changed by this fix.

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only — no code change)
**Impact on plan:** Necessary to run the required e2e verification at all; no scope creep, no tracked-file changes.

## Issues Encountered

- Initial version of the new e2e spec read `window.scrollY` synchronously immediately after clicking the view-toggle button, racing Virtuoso's `restoreStateFrom` (which applies over a couple of rAF frames post-remount) and producing a false failure (`Expected: 300, Received: 0`) even against the correct, unmodified code. Switched the two post-switch-back assertions to `expect.poll(..., { timeout: 3000 })`; re-ran and confirmed a clean pass against real code, then re-confirmed a genuine fail-first result by temporarily stubbing `switchView`'s snapshot calls to a no-op (reverted immediately after, via `git checkout --`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 31 (Cards List Pagination & Virtualization) has zero open `WINDOWS.md` entries and zero unverified behaviors remaining per `31-VERIFICATION.md`'s `gaps_remaining`/`behavior_unverified_items` — this plan closed both the sentence-count gap (entry #6) and the D-08 behavior-unverified item.
- `.planning/REQUIREMENTS.md` now accurately reflects CARDS-01/02/03 as `Complete`, matching the codebase's real, verified state.
- Full regression surface confirmed green in this session: `npm test` (303/303), `npm run build`, `npm run lint` (0 errors), and the targeted e2e set (`cards-sticky-header`, `cards-search-clear`, `smoke`, `perf`, plus the new `cards-tab-switch-scroll` spec) — 14/14 e2e passed, no regressions to any of Phase 31's prior plans (31-01 through 31-05).
- Phase 31 itself being marked complete in `ROADMAP.md`/`STATE.md` is the orchestrator's responsibility after this wave, per this plan's explicit scope boundary (Task 3 deliberately did not touch either file).

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-08*
