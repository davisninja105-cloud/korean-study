---
status: testing
phase: 22-findings-driven-prompt-improvement-corpus-fixes
source: [22-VERIFICATION.md]
started: 2026-07-10T09:25:00Z
updated: 2026-07-10T09:25:00Z
---

## Current Test

number: 1
name: Prompt wording quality per error class
expected: |
  Each edit in lib/extract-cards.ts (front-field rewrite, loanword exception, blank-safety
  clause (b), annotation ledger) reads naturally as instructional prompt text and is clearly
  traceable to its error class (D-06/D-07/D-08/D-09) — not just present via grep, but genuinely
  well-written.
awaiting: user response

## Tests

### 1. Prompt wording quality per error class
expected: Each edit reads naturally as instructional prompt text and is clearly traceable to its error class (D-06/D-07/D-08/D-09) — not just present via grep, but genuinely well-written.
result: [pending]

### 2. Study-flow and CardEditor UI ripple check
expected: 다 blanks correctly in Recall mode; embedded single-char cases (e.g. 물, 철) correctly stay Exposure-only; a rewritten front (e.g. 동사 ~는) displays correctly in the Cards list/CardEditor with its FSRS review history unaffected by the front rewrite.
result: [pending]

### 3. Card 철 rendering in CardEditor
expected: The 3 new sentences for card 철 (id cmqlmqdoa02430gsax79l6oza) render naturally with 철 highlighted (un-blankable); the card studies correctly in Exposure/multiple-choice modes with no broken UI state.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
