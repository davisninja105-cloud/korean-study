---
status: complete
phase: 31-cards-list-pagination-virtualization
source: [31-VERIFICATION.md]
started: 2026-08-07T20:16:30Z
updated: 2026-08-07T21:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. All-4-groups auto-load at scale
expected: Each group's rows keep appending as its own boundary is approached, independent of the
  other groups' scroll state, with no "Load more" button. A fully-loaded group shows "You've reached
  the end." DOM node count stays bounded throughout.
result: pass

### 2. Tab-switch scroll/state preservation (D-08)
expected: Scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll
  it, switch back to Cards. Both views restore their exact pre-switch scroll offset; neither view
  re-fetches or loses already-loaded rows.
result: issue
reported: "this isn't possible on mobile, the Reading Practice and Cards headers disappear when you scroll"
severity: major

### 3. Keyboard/screen-reader reachability of the virtualized Vocabulary group
expected: Tab through the rendered Vocabulary group with keyboard only, including scrolling past
  the initially-rendered rows. Every card row's Edit control should receive visible focus in order;
  a screen reader should announce each row as focused; off-screen rows should not become
  permanently unreachable dead focus stops.
result: skipped
reason: "Formally waived by user decision (2026-08-07) — known keyboard/screen-reader focus-reachability gap in the virtualized Vocabulary group is accepted as-is for this phase, not scheduled for a fix. Recorded as WINDOWS.md entry #1, status: waived."

## Summary

total: 3
passed: 1
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- gap_id: G-31-2
  truth: "Scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll it, switch back to Cards. Both views restore their exact pre-switch scroll offset; neither view re-fetches or loses already-loaded rows."
  status: failed
  reason: "User reported: this isn't possible on mobile, the Reading Practice and Cards headers disappear when you scroll"
  severity: major
  test: 2
  root_cause: "The Cards/Reading Practice segmented view-toggle div in components/CardsClient.tsx (~line 1337) has no sticky/fixed positioning at all — only the search+filter bar directly above it (~line 1292, `sticky top-0 z-10`) is pinned. On mobile, as the user scrolls within a group's list (window-scrolled via react-virtuoso's useWindowScroll), the toggle scrolls off-screen along with the rows, leaving no way to switch views without first scrolling back to the top. Confirmed via git history (commit fbcc95e, pre-Phase-31) that this non-sticky structure predates Phase 31 — not a virtualization regression. Phase 31 changed scale (auto-loading hundreds of rows), which turned this pre-existing structural gap into a routinely-triggered blocker. A secondary rough edge found in the same investigation: components/Nav.tsx's persistent header (line 23) and CardsClient's search bar are both independently `sticky top-0 z-10`, which will visually overlap once both are pinned."
  artifacts:
    - path: "components/CardsClient.tsx"
      issue: "View-toggle div (~line 1337) lacks sticky positioning, so it scrolls out of reach on mobile once the search bar above it (~line 1292) has scrolled the toggle past the pinned search bar's boundary."
    - path: "components/Nav.tsx"
      issue: "Persistent header (line 23) uses `sticky top-0 z-10`, the same top offset as CardsClient's search bar, causing visual overlap once both are addressed as pinned elements."
  missing:
    - "Wrap the search bar and the view-toggle in a single sticky container (or give the toggle its own sticky position offset below the search bar's height) so both stay pinned together while scrolling."
    - "Offset CardsClient's sticky search bar's `top` value to account for Nav.tsx's header height instead of both using `top-0`."
  debug_session: ".planning/debug/sticky-headers-scroll-away-mobile.md"

- truth: "A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves (ROADMAP Success Criterion 4, second clause)"
  status: failed
  reason: "No per-card sentence-count signal exists anywhere in the codebase — confirmed by grep across lib/cards-list.ts, app/api/cards/route.ts, components/CardsClient.tsx, lib/dto.ts. Not a human-verification item — this is a confirmed code-level gap, self-reported in 31-04-SUMMARY.md and WINDOWS.md entry #6 (open). Low-effort to close (a `_count: { select: { sentences: true } }` addition to cardSelect plus a small badge in renderCardRow) but was never scheduled in any of the four plans that shipped this phase."
