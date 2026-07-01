---
status: complete
phase: 06-home-dashboard-polish
source: [06-01-SUMMARY.md]
started: 2026-06-28T00:00:00Z
updated: 2026-06-28T00:01:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Loading skeleton while fetches are pending
expected: On Home page load, the hero shows an animated grey pulse block before data arrives — no due count, no CTA visible yet.
result: pass

### 2. State A — cards due: reward-colored count + "Study now →"
expected: When you have cards due, the hero shows a large bold due count in your reward color (orange/red/etc.) and a "Study now →" link below it.
result: pass

### 3. State B — goal met: tinted panel, checkmark icon, "Study ahead →"
expected: After hitting your daily goal, the hero switches to a lightly tinted panel (same hue as reward color), shows a large checkmark circle icon, "Goal met today" heading, and a "Study ahead →" CTA.
result: skipped
reason: Daily goal too large to hit during UAT session

### 4. State C — all caught up, goal not yet met: neutral panel + "Study ahead →"
expected: When all due cards are reviewed but the daily goal isn't met yet, the hero shows a neutral (no tint) panel with "All caught up" heading, "Keep going to hit your daily goal." text, and a "Study ahead →" CTA.
result: skipped
reason: Daily goal too large to exhaust due cards during UAT session

### 5. Elevated greeting
expected: The time-of-day greeting ("Good morning", "Good evening", etc.) appears as a larger, bolder heading — not a small muted caption. It should read as a proper section header.
result: pass

### 6. CTA press / active states
expected: Tapping or clicking any of the hero CTAs ("Study now →", "Study ahead →") gives a subtle press feel — the link briefly shrinks slightly and dims. The "My Korean →" link card also shows a pressed state (slight shadow change or background shift).
result: pass

## Summary

total: 6
passed: 4
issues: 0
pending: 0
skipped: 2

## Gaps

[none yet]
