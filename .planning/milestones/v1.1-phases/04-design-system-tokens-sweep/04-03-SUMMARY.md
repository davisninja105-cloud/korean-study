---
phase: 04-design-system-tokens-sweep
plan: "03"
subsystem: components
tags: [design-system, tokens, sweep, semantic-css, dark-mode]
requirements: [DS-03]
status: complete

dependency_graph:
  requires: ["04-01"]
  provides: ["DS-03 components half — zero gray-*/bg-white/ring-offset-white escapes in all 14 component files"]
  affects: [components/StudySession.tsx, components/ModeSelector.tsx, components/Sheet.tsx, components/AudioButton.tsx, components/GlossProvider.tsx, components/HabitTracker.tsx, components/ProficiencyArc.tsx, components/HabitHeatmap.tsx, components/MilestoneCelebration.tsx, components/StatsBar.tsx, components/Nav.tsx, components/CardEditor.tsx, components/LessonRangeFilter.tsx, components/SyncPanel.tsx]

tech_stack:
  added: []
  patterns:
    - "Semantic token replacement: text-gray-* → text-muted/text-muted-foreground/text-foreground"
    - "Semantic token replacement: bg-gray-*/bg-white → bg-surface-3/bg-surface-1"
    - "Semantic token replacement: border-gray-* → border-border/border-border/60"
    - "ring-offset-white/ring-offset-gray-* → ring-offset-surface-1 (Pitfall 4)"
    - "inputCls string constant fully replaced (Pitfall 5)"

key_files:
  modified:
    - components/StudySession.tsx
    - components/ModeSelector.tsx
    - components/Sheet.tsx
    - components/AudioButton.tsx
    - components/GlossProvider.tsx
    - components/HabitTracker.tsx
    - components/ProficiencyArc.tsx
    - components/HabitHeatmap.tsx
    - components/MilestoneCelebration.tsx
    - components/StatsBar.tsx
    - components/Nav.tsx
    - components/CardEditor.tsx
    - components/LessonRangeFilter.tsx
    - components/SyncPanel.tsx

decisions:
  - "HabitHeatmap ring-offset-white dark:ring-offset-gray-800 replaced with ring-offset-surface-1 (same Pitfall 4 pattern as HabitTracker — not in plan task description but caught during review of the file)"
  - "ProficiencyArc bg-white dark:bg-surface-1 simplified to bg-surface-1 (mixed escape collapsed)"
  - "StatsBar divide-gray-200 dark:divide-gray-700 replaced with divide-border (divide utilities use the border token)"

metrics:
  duration: "6m 29s"
  completed: "2026-06-27"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 14
---

# Phase 04 Plan 03: Component Token Sweep Summary

Swept all 14 component files, replacing every `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-white`, and `ring-offset-white` utility with its semantic token equivalent. Combined with Plans 01 and 02, the phase-wide grep returns 0 hits (only the documented SVG arc track in ProgressRing and ProficiencyArc, and the Sheet bg-black/40 backdrop, remain unchanged).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Sweep StudySession, ModeSelector, Sheet, AudioButton, GlossProvider | 708796d | 5 component files |
| 2 | Sweep HabitTracker, ProficiencyArc, HabitHeatmap, MilestoneCelebration, StatsBar | bbd14d1 | 5 component files |
| 3 | Sweep Nav, CardEditor, LessonRangeFilter, SyncPanel (incl. inputCls constants) | 07d7192 | 4 component files |

## What Was Built

Token sweep of 14 component files, converting all legacy `gray-*` / `bg-white` / `ring-offset-white` Tailwind utilities to semantic design-system tokens introduced in Plan 01.

### Per-File Changes

**Task 1 (5 files):**
- `StudySession.tsx`: fill-blank input `bg-surface-1 border-border`; Hard button `bg-surface-3`; MC option borders `border-border`; `hr` divider `border-border`; all `text-gray-*` → muted/muted-foreground/foreground
- `ModeSelector.tsx`: segmented control container `bg-surface-3`; active tab `bg-surface-1`; mode buttons `border-border`; `text-gray-*` → token equivalents; inactive sub-toggle `hover:text-muted-foreground`
- `Sheet.tsx`: drag handle `bg-surface-3`; title `text-foreground`; `bg-black/40` backdrop preserved
- `AudioButton.tsx`: idle state `text-muted hover:text-muted-foreground hover:bg-surface-3`
- `GlossProvider.tsx`: popover border `border-border/60`; close button `hover:bg-surface-3 hover:text-muted-foreground`; all `text-gray-*` → token equivalents

**Task 2 (5 files):**
- `HabitTracker.tsx`: card container `bg-surface-1`; dot empty state `bg-surface-3`; today ring `ring-offset-surface-1` (Pitfall 4 resolved); all text → muted/foreground
- `ProficiencyArc.tsx`: card `bg-surface-1` (mixed `bg-white dark:bg-surface-1` collapsed); progress track `bg-surface-3`; all text → tokens; SVG arc track `text-gray-200 dark:text-gray-700` at L47 preserved (1 instance)
- `HabitHeatmap.tsx`: empty cell `bg-surface-3`; today ring `ring-offset-surface-1` (also had Pitfall 4 — fixed)
- `MilestoneCelebration.tsx`: headline `text-foreground`; body and streak label `text-muted`
- `StatsBar.tsx`: `divide-border` divider; `text-muted-foreground` values; `text-muted` labels

**Task 3 (4 files):**
- `Nav.tsx`: header/bottom-bar borders → `border-border`; brand link `text-foreground`; inactive nav tabs `text-muted hover:bg-surface-3`; settings gear `text-muted hover:bg-surface-3`; bottom tabs `text-muted hover:text-muted-foreground`
- `CardEditor.tsx`: `inputCls` constant fully replaced: `border-border bg-surface-1 text-foreground` (Pitfall 5 resolved); sentence card `border-border`; preview strip `text-muted`; Cancel button `hover:bg-surface-3`
- `LessonRangeFilter.tsx`: `SELECT_CLASS` multi-line constant replaced: `border-border bg-surface-1 text-foreground` (Pitfall 5 resolved); `text-muted` labels
- `SyncPanel.tsx`: `text-muted-foreground` heading; `text-muted` description

## Verification Results

```
# Phase-wide component sweep (0 hits)
grep -rn 'bg-gray-\|text-gray-\|border-gray-\|bg-white \|bg-white"\|ring-offset-white\|ring-offset-gray-' components/ | grep -v 'ProgressRing.tsx:50' | grep -v 'bg-black/40' | grep -v 'ProficiencyArc'
# Result: CLEAN (0 hits)

# Intentional non-changes preserved
grep -q 'text-gray-200 dark:text-gray-700' components/ProgressRing.tsx  # OK
grep -q 'bg-black/40' components/Sheet.tsx                               # OK
grep -c 'text-gray-200 dark:text-gray-700' components/ProficiencyArc.tsx # 1 (OK)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] HabitHeatmap ring-offset-white not in task description**
- **Found during:** Task 2 (reading HabitHeatmap.tsx before editing)
- **Issue:** HabitHeatmap.tsx line 50 had `ring-offset-white dark:ring-offset-gray-800` — the same Pitfall 4 pattern as HabitTracker, but only HabitTracker was mentioned in the task description
- **Fix:** Replaced with `ring-offset-surface-1` (same resolution as HabitTracker)
- **Files modified:** `components/HabitHeatmap.tsx`
- **Commit:** bbd14d1

**2. [Rule 2 - Missing Critical] StatsBar divide-* not in explicit replacement map**
- **Found during:** Task 2 (reading StatsBar.tsx)
- **Issue:** `divide-gray-200 dark:divide-gray-700` — `divide-*` utilities use the border color token, same semantic meaning as `border-gray-200 dark:border-gray-700`
- **Fix:** Replaced with `divide-border` (same resolution as border utilities)
- **Files modified:** `components/StatsBar.tsx`
- **Commit:** bbd14d1

## Known Stubs

None — this plan contains only class-token substitutions, no data flow or rendering logic changes.

## Threat Flags

None — purely CSS class string substitutions. No new network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- [x] All 3 tasks executed
- [x] 14 component files modified
- [x] Phase-wide grep returns 0 (only documented SVG track and modal backdrop)
- [x] ring-offset-surface-1 in HabitTracker.tsx and HabitHeatmap.tsx (Pitfall 4)
- [x] inputCls constants in CardEditor.tsx and LessonRangeFilter.tsx fully swept (Pitfall 5)
- [x] ProficiencyArc SVG arc track (1 instance) preserved
- [x] Sheet bg-black/40 modal backdrop preserved
- [x] `npm run lint` passes clean (0 errors)
- [x] Commits: 708796d, bbd14d1, 07d7192
