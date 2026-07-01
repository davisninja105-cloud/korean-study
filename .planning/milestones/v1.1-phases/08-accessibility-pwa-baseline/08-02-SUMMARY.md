---
phase: 08-accessibility-pwa-baseline
plan: "02"
subsystem: accessibility
status: complete
tags: [accessibility, aria, touch-targets, active-states, dark-mode]
dependency_graph:
  requires: [08-01-SUMMARY.md]
  provides: [A11Y-01, A11Y-03, A11Y-04]
  affects: [components/StudySession.tsx, components/GlossProvider.tsx, components/AudioButton.tsx, components/Nav.tsx, app/page.tsx, app/study/page.tsx]
tech_stack:
  added: []
  patterns: [aria-label on icon buttons, min-h-[44px] touch targets, active: press states]
key_files:
  created: []
  modified:
    - components/Nav.tsx
    - app/study/page.tsx
    - components/StudySession.tsx
    - components/GlossProvider.tsx
    - components/AudioButton.tsx
    - app/page.tsx
decisions:
  - "aria-label preferred over title on Undo button per WCAG F-12 (title unreliable for screen readers)"
  - "active:bg-button-soft on AudioButton idle/play; active:opacity-80 on playing — matches existing hover pattern per spec"
  - "GlossProvider close button expands from w-6 h-6 to min-h-[44px] min-w-[44px]; absolute positioning unchanged"
  - "A11Y-04 dark-mode regression test approved by operator: all 7 pages x 2 themes (14 screens) confirmed passing"
metrics:
  duration_seconds: 180
  completed_date: "2026-06-29"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 6
---

# Phase 08 Plan 02: Component Accessibility Fixes Summary

**One-liner:** Surgical aria-label, active-state, and 44px touch-target fixes across six components to close A11Y-01/03 audit findings; A11Y-04 dark-mode regression test across all 7 pages (14 screens) approved by operator.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | aria-label corrections — Nav tabs, mode-selector Sheet, Undo button (A11Y-01) | a380ec8 | Nav.tsx, study/page.tsx, StudySession.tsx |
| 2 | Active states + 44px touch targets — GlossProvider, AudioButton, StudySession, app/page (A11Y-03) | 9bcb14c | GlossProvider.tsx, AudioButton.tsx, StudySession.tsx, app/page.tsx |
| 3 | 14-screen dark-mode regression test (A11Y-04) | (verification only — no commit) | All 7 pages x 2 themes |

## A11Y-04 Dark-Mode Regression Sign-Off

**Status: APPROVED BY OPERATOR**

All 14 screens (7 pages x 2 themes) passed the regression test:
- No invisible text
- No harsh or low-contrast surfaces
- Sentence highlight (amber pairing) intact in dark mode
- Newly-enlarged touch targets (gloss popover close/add, Undo/End, band-up dismiss) render correctly
- Active/press states visible in both themes

Approval received 2026-06-29 via operator "approved" signal after reviewing all screens.

## Changes Made

### Task 1: A11Y-01 — aria-label Corrections

**components/Nav.tsx**
- Added `aria-label={label}` to each bottom-tab `<Link>` in the mobile bottom bar
- Settings gear (`aria-label="Settings"`) left unchanged

**app/study/page.tsx**
- Added `title="Study options"` to the mode-selector `<Sheet>` — gives the dialog an accessible name via Sheet's `aria-label={title}` prop
- Lessons Sheet (`title="Lessons"`) left unchanged

**components/StudySession.tsx**
- Replaced `title="Undo last rating"` with `aria-label="Undo last rating"` on Undo button
- `title` attribute removed entirely (not reliably read by screen readers per WCAG F-12)

### Task 2: A11Y-03 — Active States + 44px Touch Targets

**components/GlossProvider.tsx**
- Close button: replaced `w-6 h-6` with `min-h-[44px] min-w-[44px]`; added `active:bg-surface-3`
- Add-as-card button: added `aria-label={\`Add ${word} as a card\`}` (dynamic, interpolates tapped word); added `min-h-[44px]` and `active:opacity-70`; added `flex items-center` for vertical centering

**components/AudioButton.tsx**
- Playing-state button: added `active:opacity-80`
- Idle/play button: added `active:bg-button-soft`
- `btnBase` (`min-h-11 min-w-11`) unchanged — touch target already 44px

**components/StudySession.tsx**
- Undo button: replaced `px-2 py-1` with `min-h-[44px] px-3`; added `active:bg-surface-3`
- End button: replaced `px-2 py-1` with `min-h-[44px] px-3`; added `active:bg-surface-3`

**app/page.tsx**
- Band-up dismiss button: added `active:opacity-80` (pre-existing `active:bg-surface-3` and `min-h-11 min-w-11` left intact)

### Task 3: A11Y-04 — Dark-Mode Regression Test

Verification-only task. No code written. Operator confirmed all 14 screens pass.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

All modified files confirmed present. Both implementation commits confirmed in git history:
- a380ec8: Task 1 — aria-label corrections
- 9bcb14c: Task 2 — active states + 44px touch targets

Task 3 (A11Y-04): verification-only, no commit needed. Approved by operator.
