---
phase: 31-cards-list-pagination-virtualization
plan: 05
subsystem: ui
tags: [react, nextjs, tailwind, playwright, sticky-positioning, css-custom-properties]

# Dependency graph
requires:
  - phase: 31-cards-list-pagination-virtualization
    provides: react-virtuoso window-scrolled, cursor-paginated Vocabulary group (the scale change that made this pre-existing gap routinely-triggered)
provides:
  - "components/Nav.tsx: --nav-height CSS custom property, measured live from the sticky header's offsetHeight and kept current via ResizeObserver"
  - "components/CardsClient.tsx: merged sticky search+toggle unit that docks beneath Nav's real height and stays pinned through scroll"
  - "e2e/cards-sticky-header.spec.ts: permanent G-31-2 regression proof"
affects: [cards-list, mobile-navigation, sticky-header]

# Actuals (#2632)
actuals:
  tokens: 2522
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JS-measured, globally-consumed CSS custom property (document.documentElement.style.setProperty) for cross-sibling-component layout values, mirroring the existing --sab pattern in app/layout.tsx"

key-files:
  created:
    - e2e/cards-sticky-header.spec.ts
  modified:
    - components/Nav.tsx
    - components/CardsClient.tsx

key-decisions:
  - "Nav.tsx publishes --nav-height via useLayoutEffect + ResizeObserver (direct DOM/CSS-var mutation), not React state or a new context — the value must cross to CardsClient.tsx, a sibling with no shared parent state, exactly mirroring the project's existing --sab convention rather than introducing prop-drilling or a new provider for one derived numeric value."
  - "CardsClient's search bar and view toggle were merged into a single sticky wrapper (one sticky element, two internal rows) rather than making the toggle independently sticky at its own offset — a single pinned unit is simpler to reason about and avoids two adjacent sticky elements needing coordinated top offsets."

patterns-established:
  - "Global CSS custom property + ResizeObserver is the established pattern for a JS-measured layout value shared between unrelated sibling client components (Nav.tsx / CardsClient.tsx)."

requirements-completed: [CARDS-02]

coverage:
  - id: D1
    description: "Reading Practice toggle stays visible, in-viewport, and tappable after scrolling on a short mobile-width viewport, and successfully switches the active view when tapped"
    requirement: "CARDS-02"
    verification:
      - kind: e2e
        ref: "e2e/cards-sticky-header.spec.ts#Reading practice toggle stays reachable and functional after scrolling on a short mobile viewport (G-31-2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CardsClient's sticky search+toggle bar docks beneath Nav's actual measured header height with no visual overlap, via --nav-height"
    requirement: "CARDS-02"
    verification:
      - kind: e2e
        ref: "e2e/cards-sticky-header.spec.ts#Reading practice toggle stays reachable and functional after scrolling on a short mobile viewport (G-31-2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No regression to existing Cards search-clear flow or app-wide first-paint smoke coverage"
    verification:
      - kind: e2e
        ref: "e2e/cards-search-clear.spec.ts#clearing the Cards search box restores groupCounts to pre-search values (CR-01)"
        status: pass
      - kind: e2e
        ref: "e2e/smoke.spec.ts (4 route specs)"
        status: pass
      - kind: unit
        ref: "npm test (300 tests, 27 files)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real-device iOS Safari sticky-positioning spot-check (this suite has no WebKit/real-device project, per STATE.md's deferred E2E-10)"
    verification: []
    human_judgment: true
    rationale: "The Chromium e2e spec cannot observe iOS Safari sticky-positioning quirks; the plan's success_criteria explicitly recommends a manual on-device confirmation as non-blocking (workflow.human_verify_mode=end-of-phase)."

# Metrics
duration: 12min
completed: 2026-08-07
status: complete
---

# Phase 31 Plan 05: G-31-2 Sticky Header Fix Summary

**Nav.tsx publishes its real header height as a `--nav-height` CSS custom property; CardsClient's search bar and Cards/Reading Practice toggle are merged into one sticky unit offset by that value, so the toggle never scrolls out of reach on mobile.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-07T14:32:00-07:00 (approx.)
- **Completed:** 2026-08-07T14:44:06-07:00
- **Tasks:** 3
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- Closed G-31-2 (31-UAT.md Test 2, D-08): on a short mobile-width viewport, the Cards/Reading Practice toggle now stays sticky and reachable no matter how far the user scrolls within a virtualized group's list.
- Fixed the secondary rough edge diagnosed alongside it: CardsClient's sticky search bar no longer visually collides with Nav's persistent header — it now docks beneath Nav's real, live-measured height via `--nav-height`.
- Added a permanent Playwright regression spec (`e2e/cards-sticky-header.spec.ts`) that was confirmed to fail against the unfixed code (specifically on the toggle-in-viewport assertion, not a setup/selector error) before the fix landed, then confirmed green after.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add G-31-2 regression spec — confirm it fails against current code** - `4757567` (test)
2. **Task 2: Nav.tsx exposes its rendered header height as --nav-height** - `c2804a6` (feat)
3. **Task 3: CardsClient.tsx — merge search bar + view toggle into one sticky unit; re-verify G-31-2 spec goes green** - `4299166` (fix)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `e2e/cards-sticky-header.spec.ts` - New Playwright spec: short mobile-width viewport (390×500), asserts the Reading Practice toggle stays in-viewport and functional after scrolling, and that Nav's header never overlaps CardsClient's sticky bar.
- `components/Nav.tsx` - `headerRef` + `useLayoutEffect` + `ResizeObserver` publish the header's real `offsetHeight` to `document.documentElement`'s `--nav-height` custom property, re-measuring on every resize and cleaning up on unmount.
- `components/CardsClient.tsx` - The previously-separate sticky search+action bar and non-sticky view-toggle div are now children of a single sticky wrapper (`style={{ top: 'var(--nav-height, 68px)' }}`), so both move and stick together beneath Nav's header.

## Decisions Made

- `--nav-height` is a direct DOM/CSS-var mutation from an effect (not React state or a new context), mirroring the project's existing `--sab` pattern in `app/layout.tsx` — the value needs to cross to a sibling component (`CardsClient.tsx`) with no shared parent state, and this avoids introducing prop-drilling or a new provider for one derived numeric value.
- The search bar and view toggle were merged into one sticky wrapper (single `sticky` element containing both rows) rather than giving the toggle its own independent sticky position — simpler containing-block reasoning, and matches the plan's explicit design.

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree missing `node_modules` and generated Prisma client**
- **Found during:** Task 1 (running the new e2e spec for the first time)
- **Issue:** This git worktree had no `node_modules` directory at all (only the main checkout does), so `npx prisma generate` had never run here and `e2e/seed.ts`'s explicit `node_modules/.bin/tsx` path resolution failed with `ENOENT`. This is pre-existing worktree infrastructure, not something introduced by this plan.
- **Fix:** Ran `npx prisma generate` to produce `app/generated/prisma` locally, and symlinked `node_modules` in this worktree to the main checkout's `node_modules` (both are gitignored — `node_modules` is listed in `.gitignore`, and the generated Prisma client directory is not tracked either) so the e2e harness's binary-path resolution and the Next.js build could run. Neither change is tracked by git; `git status` stayed clean throughout.
- **Files modified:** None tracked (symlink + generated client only, both gitignored).
- **Verification:** `git status --short` confirmed no tracked-file changes from this fix at any point; all subsequent `npm run build`/`npm test`/`npx playwright test` runs succeeded.
- **Committed in:** N/A (not a tracked change).

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only, no tracked-file impact)
**Impact on plan:** No scope creep — purely a local test-environment fix required to run the plan's own mandated verification commands in this worktree.

## Issues Encountered

None beyond the worktree environment gap documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-31-2 is closed with durable automated regression coverage (`e2e/cards-sticky-header.spec.ts`), satisfying CARDS-02.
- Manual on-device confirmation (real phone or Chrome DevTools device toolbar at a short viewport height) is recommended per the plan's success criteria, since this suite has no WebKit/real-device Playwright project (deferred E2E-10) — an iOS Safari sticky-positioning quirk would not be visible to the Chromium-only spec. Non-blocking; `workflow.human_verify_mode=end-of-phase`.
- No blockers for subsequent plans in this phase.

---
*Phase: 31-cards-list-pagination-virtualization*
*Completed: 2026-08-07*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`e2e/cards-sticky-header.spec.ts`, `components/Nav.tsx`, `components/CardsClient.tsx`, this SUMMARY.md). All 4 commits confirmed in `git log` (`4757567`, `c2804a6`, `4299166`, `68cc23d`).
