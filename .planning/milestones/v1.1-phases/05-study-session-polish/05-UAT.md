---
status: complete
phase: 05-study-session-polish
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-06-27T00:00:00Z
updated: 2026-06-27T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Progress Counter Display
expected: Start a flashcard study session. The counter near the top of the card area should show "Card 1 of N" (where N is your session size). As you grade each card and advance, it should increment forward — "Card 2 of N", "Card 3 of N", etc.
result: issue
reported: "Yes, but messy — counter ignores requeued cards, so it hits Card N of N while there are still more cards to study in the session"
severity: major

### 2. Warm Easy Button Styling
expected: In flashcard mode, reveal a card and look at the grade buttons. The "Easy" button should have a warm color tone (matching the app's reward/streak color — amber/orange) instead of teal. The Hard and Again buttons retain their existing styles.
result: pass

### 3. Inter-Card Fade Animation
expected: After grading a card, the next card should fade in smoothly (a subtle ~120ms fade-in). Each new card entrance is animated rather than appearing instantly. On reduced-motion devices/settings, the card appears immediately without animation.
result: pass

### 4. Haptic Differentiation on Grade (Mobile)
expected: On a mobile device, grading a card with "Easy" (rating ≥ 3) produces a distinct success vibration, while grading with "Hard" or "Again" produces a lighter selection vibration. (Desktop has no haptics — skip if testing on desktop only.)
result: skipped
reason: Testing on desktop — haptics not available

### 5. Korean Line-Height Improvement (CSS — 05-01)
expected: Korean text in study cards and sentences appears slightly more spacious/readable — line-height raised from 1.65 to 1.7.
result: pass
source: automated
coverage_id: D1

### 6. Animate-Card-In CSS Utility (CSS — 05-01)
expected: .animate-card-in CSS utility exists in globals.css with fadeIn 0.12s ease-out forwards, plus a reduced-motion override setting animation:none.
result: pass
source: automated
coverage_id: D2

## Summary

total: 6
passed: 4
issues: 1
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "Counter shows current card position (Card N of Total) and never exceeds the actual remaining session size"
  status: failed
  reason: "User reported: counter ignores requeued cards, so it hits Card N of N while there are still more cards to study"
  severity: major
  test: 1
  root_cause: "Counter uses stats.reviewed (total reviews including requeues) as numerator against initialCount (unique cards). When a card is requeued and reviewed again, stats.reviewed increments past initialCount, and Math.min clamps it there — showing Card N of N while the queue still has requeued cards."
  artifacts:
    - path: "components/StudySession.tsx:558"
      issue: "Math.min(stats.reviewed + 1, initialCount) — stats.reviewed counts duplicate reviews of requeued cards"
  missing:
    - "Track unique first-seen reviews (seenCount / seenCardIdsRef) instead of total reviews for the counter numerator"
    - "Update undoRef snapshot to include prevSeenCount and prevSeenCardIds so undo restores the counter correctly"
