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
  artifacts: []
  missing: []

- truth: "A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves (ROADMAP Success Criterion 4, second clause)"
  status: failed
  reason: "No per-card sentence-count signal exists anywhere in the codebase — confirmed by grep across lib/cards-list.ts, app/api/cards/route.ts, components/CardsClient.tsx, lib/dto.ts. Not a human-verification item — this is a confirmed code-level gap, self-reported in 31-04-SUMMARY.md and WINDOWS.md entry #6 (open). Low-effort to close (a `_count: { select: { sentences: true } }` addition to cardSelect plus a small badge in renderCardRow) but was never scheduled in any of the four plans that shipped this phase."
