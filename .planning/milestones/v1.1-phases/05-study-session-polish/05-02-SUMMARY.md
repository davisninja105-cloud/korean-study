---
phase: 05-study-session-polish
plan: "02"
subsystem: study-session
tags:
  - study-session
  - haptics
  - animation
  - ux-polish
dependency_graph:
  requires:
    - 05-01
  provides:
    - STUDY-01
    - STUDY-02
    - STUDY-04
  affects:
    - components/StudySession.tsx
tech_stack:
  added: []
  patterns:
    - key-driven React remount for CSS animation replay
    - conditional haptic feedback on grade path
    - semantic reward token on grade button
key_files:
  modified:
    - components/StudySession.tsx
decisions:
  - Progress counter uses Math.min(stats.reviewed + 1, initialCount) cap to handle requeue edge case where reviewed+1 could exceed initial total
  - Haptic split lives in submitReview only; handleReveal stays haptic('selection') — reveal is not a grade
  - Easy button uses bg-reward-soft / text-reward (semantic tokens) instead of literal teal utilities
  - key={cursor} placed on new outer wrapper div; NOT on .card-flip-container or .card-flip-inner to preserve height measurement
  - Action bar remains outside the keyed wrapper so grade buttons do not re-animate per card
metrics:
  duration: "~4 minutes"
  completed_date: "2026-06-28"
  tasks_completed: 2
  files_modified: 1
status: complete
requirements:
  - STUDY-01
  - STUDY-02
  - STUDY-04
---

# Phase 05 Plan 02: Study Session Polish (JSX) Summary

JSX/JS-side study session polish: live "Card N of Total" counter, correct-vs-needs-review haptic differentiation, warm Easy button using the reward semantic token, and inter-card fade-in via a `key={cursor}` keyed wrapper consuming `.animate-card-in` from plan 05-01.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Progress counter + haptic split + warm Easy button | 87ac950 | components/StudySession.tsx |
| 2 | Inter-card fade-in wrapper (STUDY-04 JSX) | d479399 | components/StudySession.tsx |

## What Was Built

**Task 1 — Three scoped edits (STUDY-01, STUDY-02):**

1. **Progress counter (STUDY-01):** Replaced the backward-looking `{stats.reviewed} reviewed · {queue.length} left` with the forward-looking `Card {Math.min(stats.reviewed + 1, initialCount)} of {initialCount}`. The `Math.min` cap handles the requeue edge case. Surrounding `<p className="text-sm text-muted">` and the `ProgressRing` are untouched.

2. **Haptic differentiation (STUDY-02):** Changed `haptic('selection')` to `haptic(rating >= 3 ? 'success' : 'selection')` in `submitReview` only. The `handleReveal` function's `haptic('selection')` call is unchanged — reveal is not a grade action.

3. **Warm Easy button (STUDY-02):** Replaced `bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-500/20` with `bg-reward-soft text-reward hover:opacity-90` on the flashcard Easy grade button. The fill-blank grade bar (Wrong/Correct only) was not touched.

**Task 2 — Inter-card fade-in wrapper (STUDY-04):**

Wrapped the entire `{mode === 'flashcard' ? (...) : (...)}` card-render conditional in `<div key={cursor} className="animate-card-in w-full">`. The `key={cursor}` forces React to remount this div on each card advance (cursor increments in `submitReview`), replaying the `.animate-card-in` 120ms fade-in from scratch. The sticky action bar (`{/* ── Action bar ... ── */}`) remains outside and after the wrapper.

## Verification Results

- `grep -c 'reviewed · ' components/StudySession.tsx` == 0 ✓
- `grep -q 'Card {Math.min(stats.reviewed + 1, initialCount)} of {initialCount}'` ✓
- `grep -q "haptic(rating >= 3 ? 'success' : 'selection')"` ✓
- `grep -q "haptic('selection')"` (handleReveal unchanged) ✓
- `grep -q 'bg-reward-soft text-reward'` ✓
- `grep -c 'bg-teal-50' components/StudySession.tsx` == 0 ✓
- `grep -c 'animate-card-in' components/StudySession.tsx` == 1 ✓
- `npm run lint` exits 0 ✓
- `npm run build` exits 0 ✓

## Deviations from Plan

None — plan executed exactly as written. All four targeted edits applied atomically across two commits with verification passing after each task.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. All edits are confined to `components/StudySession.tsx` (client component, authenticated route).

## Self-Check

### Files Exist
- components/StudySession.tsx — modified ✓

### Commits Exist
- 87ac950 — feat(05-02): add 'Card N of Total' counter, haptic differentiation, warm Easy button ✓
- d479399 — feat(05-02): wrap card render in key={cursor} animate-card-in div for inter-card fade ✓

## Self-Check: PASSED
