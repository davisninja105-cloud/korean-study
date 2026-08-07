---
phase: 30-instant-feedback-cold-start-unblocking
plan: 02
subsystem: ui
tags: [tailwind, css-tokens, dark-mode, skeleton-loading, nextjs, react]

# Dependency graph
requires: []
provides:
  - "--skeleton-bg CSS custom property (bg-skeleton Tailwind utility), dark-mode-visible (#1c2030 vs dark --background #0b0f1a)"
  - "All route-level loading.tsx skeletons and StudyClient.tsx inline pulse states migrated to bg-skeleton"
  - "Content-shaped isFilterLoading skeleton in StudyClient.tsx replacing bare Loader2 spinner, with zero layout shift into real content"
affects: [30-instant-feedback-cold-start-unblocking]

# Actuals (#2632)
actuals:
  tokens: 4148
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "New CSS custom property isolated from an existing token (--skeleton-bg separate from --surface-3) when the existing token's dark value collides with --background, rather than reusing/raising the colliding token and risking its 17+ non-skeleton consumers"

key-files:
  created:
    - tests/skeleton-token.test.ts
    - e2e/study-filter-skeleton.spec.ts
  modified:
    - app/globals.css
    - app/study/loading.tsx
    - app/cards/loading.tsx
    - app/habits/loading.tsx
    - app/history/loading.tsx
    - components/StudyClient.tsx

key-decisions:
  - "Dark --skeleton-bg reuses the existing --surface-1 dark shade (#1c2030) rather than inventing a new color, per D-02"
  - "isFilterLoading skeleton wrapper uses byte-identical classes (flex flex-col items-center gap-6 py-6) to the real due-count/button content it replaces, guaranteeing no layout shift on transition"

patterns-established:
  - "Loading-state placeholders get their own isolated CSS token (--skeleton-bg) rather than reusing a semantic surface token whose dark value may collide with --background"

requirements-completed: [PERCEPT-01, PERCEPT-03]

coverage:
  - id: D1
    description: "--skeleton-bg token defined in all 3 required globals.css locations, dark value distinct from dark --background, exposed as bg-skeleton"
    requirement: "PERCEPT-01"
    verification:
      - kind: unit
        ref: "tests/skeleton-token.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "4 route-level loading.tsx files + StudyClient.tsx's 2 inline pulse blocks migrated from bg-surface-3 to bg-skeleton with zero remaining bg-surface-3 in those locations; all other bg-surface-3 consumers untouched"
    requirement: "PERCEPT-01"
    verification:
      - kind: other
        ref: "grep -c bg-surface-3/bg-skeleton counts verified exactly against plan's per-file expected counts (study=3, cards=8, habits=9, history=3, StudyClient=10 bg-skeleton + 1 untouched bg-surface-3)"
        status: pass
      - kind: unit
        ref: "npm run lint (0 errors)"
        status: pass
    human_judgment: false
  - id: D3
    description: "isFilterLoading branch renders a content-shaped skeleton (two pulsing bars + button placeholder) inside the identical wrapper the real content uses, with no layout shift on transition and no studyCards.length reference"
    requirement: "PERCEPT-03"
    verification:
      - kind: e2e
        ref: "e2e/study-filter-skeleton.spec.ts#lesson-filter apply shows a content-shaped skeleton with no layout shift into the real content"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dark-mode visual distinctness of skeleton shapes against the page background across /study, /cards, /habits, /history"
    verification: []
    human_judgment: true
    rationale: "The plan's overall <verification> section names this as a manual `npm run build && npm start` + Settings toggle visual check; the underlying color-distinctness claim is unit-tested (tests/skeleton-token.test.ts Test 4: dark --skeleton-bg #1c2030 != dark --background #0b0f1a), but actual rendered-pixel visibility across all 4 routes is a human/visual judgment call not exercised by this executor run."

duration: 25min
completed: 2026-08-06
status: complete
---

# Phase 30 Plan 02: Skeleton Visibility & Content-Shaped Loading Summary

**New `--skeleton-bg` CSS token (dark-visible, isolated from `--surface-3`) migrated across 4 route-level `loading.tsx` files and `StudyClient.tsx`'s inline pulse states, plus a pixel-matched two-bar-and-button skeleton replacing the bare `Loader2` spinner in the lesson-filter loading path.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-06T17:20:00Z
- **Completed:** 2026-08-06T17:45:00Z
- **Tasks:** 3
- **Files modified:** 8 (6 modified, 2 created)

## Accomplishments
- Added `--skeleton-bg` (`#f3f4f6` light / `#1c2030` dark) to `app/globals.css` in all 3 required locations plus `@theme inline`, fixing the defect where dark `--surface-3` (`#0b0f1a`) equals dark `--background`, making every existing skeleton invisible in dark mode
- Migrated all `bg-surface-3` occurrences in the 4 route-level `loading.tsx` files (study, cards, habits, history — 23 total occurrences) to `bg-skeleton`, with zero structural JSX change and zero effect on the 17+ other `bg-surface-3` consumers in the codebase
- Replaced `StudyClient.tsx`'s bare `Loader2` spinner in the `isFilterLoading` branch with a content-shaped skeleton (due-count bar + label bar + button placeholder) inside the byte-identical wrapper the real content uses, eliminating layout shift on transition
- Migrated `StudyClient.tsx`'s 2 pre-existing inline pulse blocks (`phase === 'loading'`, `phase === 'loading-practice'`) to `bg-skeleton`
- Removed the now-unused `Loader2` import

## Task Commits

Each task was committed atomically:

1. **Task 1: `--skeleton-bg` token in globals.css (PERCEPT-01, D-01, D-02, D-03)** - `132b8e1` (test)
2. **Task 2: Migrate the 4 route-level loading.tsx files to bg-skeleton (PERCEPT-01)** - `2b47834` (fix)
3. **Task 3: StudyClient.tsx — lesson-filter content-shaped skeleton + inline pulse migration (PERCEPT-03, D-04)** - `d888237` (feat)

_Note: Task 1 and Task 3 were TDD tasks; each was implemented and verified in a single commit (test + implementation together) since the token/markup and its verifying test were authored as one atomic unit rather than a strict separate RED/GREEN commit split — both tests were written and passed green in the same commit._

## Files Created/Modified
- `app/globals.css` - New `--skeleton-bg` token in light `:root`, dark `@media` block, dark `:root[data-theme="dark"]` block, and `@theme inline`
- `app/study/loading.tsx` - `bg-surface-3` → `bg-skeleton` (3 occurrences)
- `app/cards/loading.tsx` - `bg-surface-3` → `bg-skeleton` (8 occurrences)
- `app/habits/loading.tsx` - `bg-surface-3` → `bg-skeleton` (9 occurrences)
- `app/history/loading.tsx` - `bg-surface-3` → `bg-skeleton` (3 occurrences)
- `components/StudyClient.tsx` - Rewrote `isFilterLoading` skeleton markup; migrated 2 inline pulse blocks; removed `Loader2` import
- `tests/skeleton-token.test.ts` - New unit test asserting token existence, values, byte-identity across dark blocks, and distinctness from dark `--background`
- `e2e/study-filter-skeleton.spec.ts` - New e2e spec asserting skeleton visibility during a delayed filter re-fetch and bounding-box match with the real content on resolution

## Decisions Made
- Reused the existing `--surface-1` dark shade (`#1c2030`) for dark `--skeleton-bg` rather than introducing a brand-new color, per the plan's locked D-02 decision — keeps the palette consistent while still being visually distinct from `--background`.
- Kept the `isFilterLoading` skeleton's outer wrapper classes byte-identical to the real content's wrapper (`flex flex-col items-center gap-6 py-6`) as a hard constraint, verified both by code inspection and by the e2e spec's bounding-box comparison.

## Deviations from Plan

None - plan executed exactly as written. Bar widths/heights inside the skeleton (`h-12 w-16`, `h-4 w-24`) matched the UI-SPEC's stated defaults exactly, since the plan explicitly left exact pixel sizing to implementation discretion while locking the structural constraints (two bars in the count slot, unchanged `h-16` slot, `min-h-14 rounded-2xl` button match, identical outer wrapper).

## Issues Encountered
- The worktree's `node_modules` was incomplete (missing `tsx` binary needed by the e2e harness's `resetToBaseline()` and the Prisma-generated client needed by `lib/prisma.ts`), causing the first e2e run attempt to fail with `MODULE_NOT_FOUND` / `spawnSync ... tsx ENOENT`. Resolved by running `npx prisma generate` and `npm install` in the worktree before re-running the e2e spec, which then passed cleanly (2/2 tests). Not a deviation from the plan's code changes — purely an environment-setup gap in this isolated worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `--skeleton-bg` token and its `bg-skeleton` utility are now the established convention for any future loading-state placeholder; new skeletons should use `bg-skeleton`, never `bg-surface-3`.
- The manual dark-mode visual check across `/study`, `/cards`, `/habits`, `/history` (listed in the plan's overall `<verification>` section) was not performed by this automated executor run — the underlying color-distinctness claim is unit-tested, but actual rendered-pixel visibility is a human/visual judgment call. Recommend a quick manual pass (`npm run build && npm start`, toggle Settings → Appearance → Dark) before considering PERCEPT-01 fully closed out at the phase level.

---
*Phase: 30-instant-feedback-cold-start-unblocking*
*Completed: 2026-08-06*

## Self-Check: PASSED

All 9 claimed files verified to exist on disk (app/globals.css, app/study/loading.tsx, app/cards/loading.tsx, app/habits/loading.tsx, app/history/loading.tsx, components/StudyClient.tsx, tests/skeleton-token.test.ts, e2e/study-filter-skeleton.spec.ts, .planning/phases/30-instant-feedback-cold-start-unblocking/30-02-SUMMARY.md). All 3 task commits verified present in git log (132b8e1, 2b47834, d888237).
