---
phase: "04"
plan: "02"
subsystem: "app-pages"
status: complete
tags: [token-sweep, dark-mode, design-system, semantic-tokens]
dependency_graph:
  requires: ["04-01"]
  provides: ["zero-gray-escapes-app-pages"]
  affects: ["app/page.tsx", "app/study/page.tsx", "app/cards/page.tsx", "app/habits/page.tsx", "app/settings/page.tsx", "app/wrapped/page.tsx"]
tech_stack:
  added: []
  patterns: ["text-muted", "text-muted-foreground", "text-foreground", "bg-surface-1", "bg-surface-3", "border-border", "hover:bg-surface-3", "border-border/60"]
key_files:
  created: []
  modified:
    - "app/page.tsx"
    - "app/wrapped/page.tsx"
    - "app/study/page.tsx"
    - "app/cards/page.tsx"
    - "app/habits/page.tsx"
    - "app/settings/page.tsx"
decisions:
  - "F-23 wrapped hero gradient left untouched per locked decision D-07 (Phase 7 scope)"
  - "text-green-500 correct-count stat in study left untouched per locked decision D-06 (Phase 5 scope)"
  - "Toggle inactive track mapped to bg-surface-3 (visually distinct from active bg-button per Interaction Contract)"
  - "palette active border mapped to border-foreground (dynamic, respects user theme) instead of static gray-800/200"
  - "divide-gray-100 dark:divide-gray-700/60 in wrapped stats grid mapped to divide-border/60"
metrics:
  duration: "426s"
  completed: "2026-06-27"
  tasks_completed: 3
  files_modified: 6
---

# Phase 04 Plan 02: App Pages Token Sweep Summary

Replaced every `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-white`, and `ring-offset-white` escape in all six `app/` page files with semantic token equivalents from the authoritative UI-SPEC replacement map.

## What Was Built

Token sweep of six app pages replacing ~100 gray utility instances with semantic tokens. Pure class-string substitution — no logic, layout, API, or behavior changes. Combined with Plan 1 (globals.css + login page), all six pages now have zero gray utility escapes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Sweep app/page.tsx and app/wrapped/page.tsx | faeee38 | app/page.tsx, app/wrapped/page.tsx |
| 2 | Sweep app/study/page.tsx and app/cards/page.tsx | 1bef93b | app/study/page.tsx, app/cards/page.tsx |
| 3 | Sweep app/habits/page.tsx and app/settings/page.tsx | 8156d82 | app/habits/page.tsx, app/settings/page.tsx |

## Key Substitutions Applied

| Old pattern | Replacement | Used in |
|-------------|-------------|---------|
| `text-gray-500 dark:text-gray-400` | `text-muted` | All 6 pages — secondary text, captions, labels |
| `text-gray-600 dark:text-gray-300` | `text-muted-foreground` | habits averages labels, settings scale readout |
| `text-gray-700 dark:text-gray-200` | `text-muted-foreground` | study stat tile values, settings preview text |
| `text-gray-800 dark:text-gray-100` | `text-foreground` | All 6 pages — headings, strong labels |
| `text-gray-400 dark:text-gray-500` | `text-muted` | Arrow icons, pull-to-refresh indicators |
| `bg-gray-200 dark:bg-gray-700` | `bg-surface-3` | study page skeleton loaders |
| `bg-gray-100 dark:bg-gray-800` | `bg-surface-3` | study loading-practice skeleton, cards view toggle track |
| `bg-white dark:bg-gray-700` | `bg-surface-1` | cards segmented control active tab |
| `bg-gray-300 dark:bg-gray-600` | `bg-surface-3` | settings toggle inactive track |
| `bg-white` (toggle thumb) | `bg-surface-1` | settings toggle thumb |
| `bg-white dark:bg-gray-900` | `bg-surface-1` | settings form select/input backgrounds, color pickers |
| `border-gray-200/60 dark:border-gray-800/60` | `border-border/60` | cards page sticky header |
| `border-gray-100 dark:border-gray-700` | `border-border` | habits averages dividers |
| `border-gray-300 dark:border-gray-600` | `border-border` | settings form controls |
| `border-gray-100 dark:border-gray-700` | `border-border` | settings customize disclosure divider |
| `hover:bg-gray-100 dark:hover:bg-gray-700` | `hover:bg-surface-3` | page.tsx band-up dismiss button |
| `divide-gray-100 dark:divide-gray-700/60` | `divide-border/60` | wrapped stats grid dividers |
| `bg-gray-100 dark:bg-gray-700` | `bg-surface-3` | habits 30-day trend zero bars |
| `border-gray-200 dark:border-gray-700` | `border-border` | habits heatmap legend swatch |
| `border-gray-800 dark:border-gray-200` (palette active) | `border-foreground` | settings palette grid active state |
| `hover:border-gray-300 dark:hover:border-gray-600` | `hover:border-border` | settings palette grid hover state |

## Multi-line inputCls Replacement (Pitfall 5)

The `inputCls` constant in `app/cards/page.tsx` (lines 167–169) used a concatenated string across two lines:
```js
// Before
const inputCls =
  'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'

// After
const inputCls =
  'border border-border bg-surface-1 ' +
  'text-foreground rounded-lg px-3 py-2 text-sm'
```
The whole string was replaced atomically per RESEARCH Pitfall 5 guidance. The `inputCls` identifier count (6 uses) is unchanged.

## Deviations from Plan

None - plan executed exactly as written.

All three tasks matched the plan's action and acceptance criteria precisely. The five deferred items (F-23 wrapped gradient, F-10 study text-green-500) remain untouched as specified.

## Verification

```bash
# Zero gray escapes across all 6 pages — PASSES
grep -rn 'bg-gray-\|text-gray-\|border-gray-\|bg-white \|bg-white"\|ring-offset-white' \
  app/page.tsx app/study/page.tsx app/cards/page.tsx \
  app/habits/page.tsx app/settings/page.tsx app/wrapped/page.tsx
# → 0 hits

# F-23 gradient still present — PASSES
grep -c 'linear-gradient(135deg, #3b82f6' app/wrapped/page.tsx
# → 1

# text-green-500 (F-10) still present — PASSES
grep -c 'text-green-500' app/study/page.tsx
# → 1

# bg-reward/bg-reward-soft untouched in habits — PASSES
grep -c 'bg-reward' app/habits/page.tsx
# → 3

# Lint — PASSES
npm run lint
# → 0 errors
```

## Known Stubs

None — this plan contains no UI data stubs. All changes are class-string token substitutions.

## Threat Flags

None — this plan introduces no new network endpoints, auth paths, file access patterns, or schema changes. All changes are purely CSS class substitutions as analyzed in the threat model (T-04-03: accepted, low severity).

## Self-Check: PASSED

- app/page.tsx modified: confirmed (git log shows faeee38)
- app/wrapped/page.tsx modified: confirmed (git log shows faeee38)
- app/study/page.tsx modified: confirmed (git log shows 1bef93b)
- app/cards/page.tsx modified: confirmed (git log shows 1bef93b)
- app/habits/page.tsx modified: confirmed (git log shows 8156d82)
- app/settings/page.tsx modified: confirmed (git log shows 8156d82)
- Zero gray escapes: verified by grep
- Deferred items untouched: verified by grep
- Lint clean: verified
