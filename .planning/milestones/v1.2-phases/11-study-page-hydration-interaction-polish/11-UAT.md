---
status: diagnosed
phase: 11-study-page-hydration-interaction-polish
source: 11-01-SUMMARY.md, 11-02-SUMMARY.md, 11-03-SUMMARY.md
started: 2026-06-30T00:00:00Z
updated: 2026-06-30T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Study page loads with no blank flash
expected: Open /study in a fresh tab. The session selector (mode picker + Start button) should be visible immediately — no blank white screen or "loading" spinner before the selector appears. Cards should already be available without a network fetch.
result: pass

### 2. Cards page loads normally (no regression)
expected: Open /cards. The card list appears and is filterable by type and lesson range. Swiping a row reveals the delete button. Opening a card opens the editor in a Sheet. No errors in the console.
result: pass

### 3. Lesson range filter shows spinner, not blank screen
expected: On the Study page, expand the lesson range filter and change the From or To lesson. A small loading spinner should appear in place of the mode selector while cards re-fetch — you should NOT see a blank screen or the full page disappear.
result: pass

### 4. Grading a card feels instant (no delay)
expected: Start a study session and grade a card (tap Again / Hard / Good / Easy or press 1–4). The next card should appear immediately with no perceptible pause — definitely no 100–200ms gap between the button tap and the new card showing.
result: pass

### 5. Undo after grading works correctly
expected: Grade a card, then tap the Undo button. The graded card should reappear in its previous state (correct front/back). Grading it again works normally.
result: issue
reported: "undos and shows the back of the card, I would like the front to be shown. Also the hints under the grading buttons (for how long until I see the card again) are gone after hitting undo"
severity: major

### 6. Study Ahead still works
expected: After clearing all due cards, tap "Study N more →" on the completion screen. A brief loading skeleton appears, then the ahead-session cards load and the session begins normally.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "After undo, card shows front face and interval hints under grade buttons are visible"
  status: fixed
  reason: "User reported: undos and shows the back of the card, I would like the front to be shown. Also the hints under the grading buttons (for how long until I see the card again) are gone after hitting undo"
  severity: major
  test: 5
  root_cause: "handleUndo in components/StudySession.tsx:538 called setRevealed(true) instead of setRevealed(false). This left the card on the back face with grade buttons visible but no interval hints (setIntervalHints(null) clears them and handleReveal — which repopulates them — was never called). Fix: change setRevealed(true) → setRevealed(false) so undo resets to front face; user must tap Reveal, which calls handleReveal() and naturally repopulates hints."
  artifacts:
    - path: "components/StudySession.tsx"
      issue: "line 538: setRevealed(true) → setRevealed(false)"
  missing: []
  debug_session: ""
