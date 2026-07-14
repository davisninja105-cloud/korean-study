---
status: testing
phase: 28-active-recall-study-mode
source: [28-VERIFICATION.md]
started: 2026-07-14T16:27:58Z
updated: 2026-07-14T16:27:58Z
---

## Current Test

number: 1
name: Mid-session face graduation (state 1 → 2 visible flip)
expected: |
  The same card, reappearing later in the same session, visibly renders the
  English-prompt production face instead of the Passive/exposure face it
  showed on its earlier appearance.
awaiting: user response

## Tests

### 1. Mid-session face graduation (state 1 → 2 visible flip)
expected: In `npm run dev`, start an Active-mode session; grade a state-1 card Good/Easy repeatedly until FSRS requeues it at state ≥ 2. The same card, reappearing later in the same session, visibly renders the English-prompt production face instead of the Passive/exposure face it showed on its earlier appearance (no page reload).
result: [pending]

### 2. Hint control placement and micro-interaction feel
expected: Tap through the hint control ("Show hint" → "Hint: {card.back}") on a sentence-production card in dev. Placement/animation/legibility match UI-SPEC intent — hint pill sits above the reveal button, expands inline without layout jank, reads "Hint: {gloss}" in italic muted text, and visibly goes inert (disabled, dimmed) after the first tap.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
