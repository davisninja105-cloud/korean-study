---
phase: 18-review-history-page
plan: 03
subsystem: ui
tags: [nextjs, rsc, intersection-observer, dto, prisma-cursor-pagination]

# Dependency graph
requires:
  - phase: 18-review-history-page (plan 01)
    provides: "getReviewHistory(), PAGE_SIZE, ReviewLogDTO, GET /api/reviews route"
  - phase: 18-review-history-page (plan 02)
    provides: "Habits page 'Card progress' section Link href=/history (was 404 until this plan)"
provides:
  - "app/history/page.tsx + app/history/loading.tsx — thin RSC + client-nav skeleton (RSC+DTO+client-shell hydration, HIST-07)"
  - "components/HistoryClient.tsx — reverse-chron feed with grade-colored rows, IntersectionObserver infinite scroll, single-card filter chip, empty/error states (HIST-04, HIST-05, HIST-06)"
  - "components/CardEditor.tsx 'View history →' deep-link to /history?cardId= (D-10)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Native IntersectionObserver + useRef in-flight guard (loadingRef) for race-safe infinite scroll — first use of this mechanism in the codebase"
    - "Error message rendered via a module-level string constant + JSX expression ({ERROR_MESSAGE}) rather than literal JSX text, avoiding react/no-unescaped-entities while keeping a plain apostrophe in the source string"

key-files:
  created:
    - app/history/page.tsx
    - app/history/loading.tsx
    - components/HistoryClient.tsx
  modified:
    - components/CardEditor.tsx

key-decisions:
  - "Hard grade rows use the amber warnUnsafe precedent from CardEditor.tsx (bg-amber-50/text-amber-600), not orange — per UI-SPEC/RESEARCH's resolved Pitfall 1 (no orange-* literal exists anywhere in the codebase and CONTEXT.md D-02 explicitly forbids it)"
  - "CardEditor's action row changed from justify-end to justify-between: 'View history →' link on the left, Cancel+Save grouped in their own flex div on the right — keeps existing save/cancel behavior byte-identical"
  - "Sentinel div is only rendered while hasMore is true and error is false, so a fully-drained feed or a failed fetch shows no dead scroll-trigger area — the Retry button in the error state re-invokes the same loadMore() callback"

requirements-completed: [HIST-04, HIST-05, HIST-06, HIST-07]

coverage:
  - id: D1
    description: "Opening /history shows a reverse-chronological feed of reviews, each row showing 'GradeName — mastery phrase' plus card front + timestamp (D-01)"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (typechecks clean); grep -n \"row.gradeName\"/\"row.mastery\"/\"formatTimestamp\" components/HistoryClient.tsx all present"
        status: pass
    human_judgment: true
    rationale: "Row copy/formatting correctness (exact rendered text, timestamp locale formatting) is a visual/rendered-output claim best confirmed by loading /history in a browser against seeded data — no live-DB test harness exists in this project (per 18-RESEARCH.md Validation Architecture)."
  - id: D2
    description: "Scrolling to the bottom auto-loads the next page via an IntersectionObserver sentinel — no 'Load more' button (D-04)"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "grep -n \"IntersectionObserver\"/\"disconnect()\"/\"rootMargin: '200px'\"/\"loadingRef = useRef\" components/HistoryClient.tsx all present; npm run lint clean (no react-hooks/purity or set-state-in-effect violation)"
        status: pass
    human_judgment: true
    rationale: "Confirming no duplicate/skipped rows across 2+ pages under real scroll behavior requires a seeded live DB and a browser — deferred to the phase-level manual UAT pass per 18-RESEARCH.md (no live-DB test harness in this project)."
  - id: D3
    description: "Weak grades (Again red / Hard amber) visually stand out; Good/Easy stay neutral (D-02/D-03)"
    requirement: HIST-04
    verification:
      - kind: unit
        ref: "grep -c \"amber-\" (>=1) and grep -c \"bg-red-50\" (>=1) components/HistoryClient.tsx; gradeRowClass map hard-codes Good/Easy to bg-surface-2 text-foreground"
        status: pass
    human_judgment: false
  - id: D4
    description: "Opening /history?cardId=X shows only that card's reviews with an 'All cards ×' chip that clears back to the full feed (D-10/D-11, HIST-05)"
    requirement: HIST-05
    verification:
      - kind: unit
        ref: "grep -n \"router.push('/history')\" components/HistoryClient.tsx; app/history/page.tsx passes cardId through to getReviewHistory and HistoryClient"
        status: pass
    human_judgment: true
    rationale: "End-to-end filter correctness (chip label, cleared state, only-that-card's rows) requires a live DB with real cards/reviews and a browser click-through — deferred to phase UAT."
  - id: D5
    description: "CardEditor has a 'View history →' link opening /history?cardId={card.id} (D-10)"
    requirement: HIST-05
    verification:
      - kind: unit
        ref: "grep -n \"history?cardId=\" and grep -n \"View history\" components/CardEditor.tsx; npx tsc --noEmit and npm run lint clean for this file"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real rows appear on the first server-rendered paint — no loading flash (HIST-07); undone reviews appear unmarked (HIST-06)"
    requirement: HIST-07
    verification:
      - kind: unit
        ref: "npm run build succeeds; /history registered as a dynamic (ƒ) route in the build output; getReviewHistory is awaited server-side in app/history/page.tsx before HistoryClient is rendered — same structural guarantee as app/habits/page.tsx"
        status: pass
    human_judgment: true
    rationale: "Visually confirming 'no loading flash' requires npm run build && npm start, logging in, and inspecting the served HTML in a browser (per CLAUDE.md's noted next dev vs next start gotcha). The agent could not complete this specific browser-based check in this session (APP_PASSWORD lives in a permission-denied .env.local), so it is deferred to the phase's end-of-phase UAT pass, consistent with how 18-01/18-02 deferred their own equivalent browser-only checks. HIST-06 (undone reviews unmarked) has zero undo-awareness by construction in getReviewHistory/mapReviewLogToDTO (verified in 18-01) and this plan's client code adds none either — confirmed via code inspection (grep for undo/cancelled turns up nothing in components/HistoryClient.tsx)."

duration: ~18min
completed: 2026-07-04
status: complete
---

# Phase 18 Plan 03: Review History Page UI Summary

**`/history` RSC page + `HistoryClient` feed (reverse-chron, grade-colored rows, IntersectionObserver infinite scroll, single-card filter chip) plus a "View history →" deep-link from `CardEditor`, completing the phase's HIST-04..07 surface on top of 18-01's data pipeline and 18-02's Habits entry point.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-04
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `app/history/page.tsx` — thin async RSC (`export const dynamic = 'force-dynamic'`), awaits `searchParams` (Next.js 16 Promise contract), calls `getReviewHistory({ cardId, cursor: null })` for the first page, and resolves the filter-card front from the first row (falling back to a single `prisma.card.findUnique` only when the filtered card has zero history yet)
- `app/history/loading.tsx` — static client-nav skeleton (header + 8 row placeholders, `bg-surface-3 animate-pulse`); per CLAUDE.md this only covers `<Link>` transitions, not first load
- `components/HistoryClient.tsx` — the full feed shell: `rows`/`hasMore`/`loadingMore`/`error` state seeded from RSC props, a race-safe `loadMore()` (useRef `loadingRef` guard, per RESEARCH Pitfall 3) wired to an `IntersectionObserver` sentinel (`rootMargin: '200px'`, `disconnect()` cleanup), grade-colored rows (Again=red, Hard=amber — the vetted non-orange exception, Good/Easy neutral), the "All cards ×" clear-filter chip (`router.push('/history')`), and both empty-state variants + a fetch-error/Retry state
- `components/CardEditor.tsx` — bottom action row restructured to `justify-between`: "View history →" plain-text link (`/history?cardId={card.id}`) on the left, Cancel+Save regrouped on the right; save/cancel logic untouched

This closes out Phase 18 (`18-review-history-page`) — all three plans (18-01 data pipeline, 18-02 Habits entry point, 18-03 this page) are now complete, delivering HIST-04 through HIST-07 end to end.

## Task Commits

Each task was committed atomically:

1. **Task 1: /history RSC page + loading skeleton** - `c2f963b` (feat)
2. **Task 2: HistoryClient — feed rows, grade colors, infinite scroll, filter chip, empty/error states** - `ef29f94` (feat)
3. **Task 3: CardEditor "View history" deep-link** - `0348fd1` (feat)

**Plan metadata:** (pending — final docs commit follows this SUMMARY)

## Files Created/Modified
- `app/history/page.tsx` - New: thin async RSC, `force-dynamic`, awaits `searchParams`, calls `getReviewHistory`, resolves filter-card front, renders `HistoryClient`
- `app/history/loading.tsx` - New: static skeleton for client-side nav transitions only
- `components/HistoryClient.tsx` - New: `'use client'` feed shell — list state, IntersectionObserver infinite scroll, grade-color rows, filter chip, empty/error states
- `components/CardEditor.tsx` - Bottom action row restructured to add the "View history →" link alongside the existing Cancel/Save buttons

## Decisions Made
- Hard grade rows use the amber `warnUnsafe` precedent from `CardEditor.tsx` rather than orange — orange has zero precedent anywhere in the codebase and CONTEXT.md's own D-02 forbids literal orange/red for this purpose (per RESEARCH's resolved Pitfall 1)
- The error-state copy ("Couldn't load review history...") is defined as a module-level string constant (`ERROR_MESSAGE`) and rendered via `{ERROR_MESSAGE}` rather than as literal JSX text, so the source keeps a plain apostrophe (matching the exact UI-SPEC copy) without tripping `react/no-unescaped-entities` — mirrors how `StudySession.tsx` already handles its own apostrophe-containing error copy (string variable, not literal JSX text)
- CardEditor's action row changed `justify-end` → `justify-between` with Cancel+Save wrapped in their own inner `flex gap-2` div, so the new link doesn't disturb the existing button grouping/order

## Deviations from Plan

None - plan executed exactly as written. All acceptance-criteria greps (dynamic export, searchParams Promise, getReviewHistory call, filter-front resolution, loadingRef/IntersectionObserver/rootMargin/disconnect, amber/red row classes, spinner idiom, zero SyncPanel references, router.push clear-filter, both empty states, error state, CardEditor link/import/unchanged Save button) passed on first implementation. `npx tsc --noEmit`, `npm run lint` (0 errors, 1 pre-existing unrelated warning in `StudySession.tsx`), `npm test` (116/116), and `npm run build` all succeeded without any fix needed.

## Issues Encountered

- The plan's manual UAT steps (load `/history` directly after `npm run build && npm start` to visually confirm no loading flash; seed 50+ rows and scroll through 2+ pages; click through CardEditor → "View history →" → chip clear; grade+undo+inspect) require an authenticated browser session. `APP_PASSWORD` lives in `.env.local`, which is outside this agent's file-read permissions in this session, so the browser-based portion of UAT could not be completed here. Structural correctness was instead verified via: `npm run build` succeeding with `/history` registered as a dynamic (ƒ) route; the RSC page awaiting `getReviewHistory()` server-side before rendering `HistoryClient` (byte-identical structural guarantee to the already-shipped `/habits` page); all grep-based acceptance criteria passing; and full lint/typecheck/test suites green. This is flagged for the phase-level UAT pass (`/gsd-verify-work`), consistent with how 18-01 and 18-02 already deferred their own equivalent browser-only checks to this same end-of-phase step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 18 (`review-history-page`) is now fully implemented: all three plans (18-01 data pipeline, 18-02 Habits entry point, 18-03 this UI) are complete and HIST-04/05/06/07 are all code-complete.
- The Habits page "Card progress" section's `<Link href="/history">` (added in 18-02, previously 404ing) now resolves to a real, fully-functional page — closing the gap 18-02's own SUMMARY flagged under "Issues Encountered".
- Recommended next step: run `/gsd-verify-work` for Phase 18 to complete the deferred browser-based UAT items (D1, D2, D4, D6 above) against a seeded local/dev database with an authenticated session.
- No blockers for milestone completion beyond that UAT pass.

---
*Phase: 18-review-history-page*
*Completed: 2026-07-04*

## Self-Check: PASSED

All created/modified files found on disk (`app/history/page.tsx`, `app/history/loading.tsx`, `components/HistoryClient.tsx`, `components/CardEditor.tsx`); all task commit hashes (`c2f963b`, `ef29f94`, `0348fd1`) verified present in git log.
