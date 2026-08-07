---
status: testing
phase: 31-cards-list-pagination-virtualization
source: [31-VERIFICATION.md]
started: 2026-08-07T20:16:30Z
updated: 2026-08-07T20:16:30Z
---

## Current Test

number: 1
name: All-4-groups auto-load at scale (Grammar/Phrase/Other expand + scroll-proximity load)
expected: |
  On a dev server seeded with a large (~1000-card) deck, tap to expand Grammar/Phrase/Other and
  scroll each group near its loaded boundary. Each group's rows keep appending as its own boundary
  is approached, independent of the other groups' scroll state, with no "Load more" button. A
  fully-loaded group shows "You've reached the end." DOM node count stays bounded throughout.
awaiting: user response

## Tests

### 1. All-4-groups auto-load at scale
expected: Each group's rows keep appending as its own boundary is approached, independent of the
  other groups' scroll state, with no "Load more" button. A fully-loaded group shows "You've reached
  the end." DOM node count stays bounded throughout.
result: [pending]

### 2. Tab-switch scroll/state preservation (D-08)
expected: Scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll
  it, switch back to Cards. Both views restore their exact pre-switch scroll offset; neither view
  re-fetches or loses already-loaded rows.
result: [pending]

### 3. Keyboard/screen-reader reachability of the virtualized Vocabulary group
expected: Tab through the rendered Vocabulary group with keyboard only, including scrolling past
  the initially-rendered rows. Every card row's Edit control should receive visible focus in order;
  a screen reader should announce each row as focused; off-screen rows should not become
  permanently unreachable dead focus stops.
  NOTE: This was already human-verified to FAIL during 31-01 execution (2026-08-07), and the human
  explicitly deferred fixing it as non-blocking at that time. It is surfacing again here so phase
  close makes an explicit, recorded decision (fix now, schedule a follow-up, or formally waive)
  rather than this staying silently unresolved. `.planning/WINDOWS.md` entry #1 is still `open`.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

- truth: "A collapsed row still shows its reading-practice/sentence count without loading the sentences themselves (ROADMAP Success Criterion 4, second clause)"
  status: failed
  reason: "No per-card sentence-count signal exists anywhere in the codebase — confirmed by grep across lib/cards-list.ts, app/api/cards/route.ts, components/CardsClient.tsx, lib/dto.ts. Not a human-verification item — this is a confirmed code-level gap, self-reported in 31-04-SUMMARY.md and WINDOWS.md entry #6 (open). Low-effort to close (a `_count: { select: { sentences: true } }` addition to cardSelect plus a small badge in renderCardRow) but was never scheduled in any of the four plans that shipped this phase."
