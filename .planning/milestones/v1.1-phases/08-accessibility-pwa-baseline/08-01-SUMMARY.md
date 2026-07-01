---
phase: 08-accessibility-pwa-baseline
plan: "01"
subsystem: css-globals
status: complete
tags: [accessibility, reduced-motion, ios, css]
requirements: [A11Y-02, A11Y-03]
dependency_graph:
  requires: []
  provides: [reduced-motion-backdrop-rule, global-tap-highlight-suppression]
  affects: [app/globals.css]
tech_stack:
  added: []
  patterns: [css-media-query-augmentation, webkit-vendor-prefix]
key_files:
  created: []
  modified:
    - app/globals.css
decisions:
  - "Placed .animate-backdrop reduced-motion rule adjacent to .animate-sheet in the same block — sheet and backdrop read together as a logical pair"
  - "Added -webkit-tap-highlight-color to existing html selector, not body, to match plan spec and keep the single html rule complete"
metrics:
  duration: "66s"
  completed: "2026-06-29T02:56:19Z"
  tasks: 2
  files_changed: 1
---

# Phase 08 Plan 01: Global CSS Accessibility Fixes Summary

**One-liner:** Added `.animate-backdrop` reduced-motion rule and `-webkit-tap-highlight-color: transparent` to `app/globals.css` to close A11Y-02 and A11Y-03 global gaps.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add reduced-motion counterpart for .animate-backdrop (A11Y-02) | 177c53d | app/globals.css |
| 2 | Suppress default iOS tap-highlight globally (A11Y-03 global rule) | 177c53d | app/globals.css |

## What Was Built

Both tasks modified a single file (`app/globals.css`) with surgical edits:

**Task 1 — A11Y-02 (Reduced-motion coverage):**
Added `.animate-backdrop { animation: none; opacity: 1; }` inside the existing `@media (prefers-reduced-motion: reduce)` block, placed adjacent to the `.animate-sheet` rule. All 8 animation utilities now have a reduced-motion counterpart — `.animate-backdrop` is no longer the lone exception. The rule ensures that users who request reduced motion see the Sheet backdrop appear fully opaque with no fade animation.

**Task 2 — A11Y-03 (Global tap-highlight suppression):**
Added `-webkit-tap-highlight-color: transparent;` to the existing `html { color-scheme: light dark; }` selector. This removes the iOS Safari gray overlay that flashes on tap for every interactive element across the entire app, applied globally from the root element.

## Verification Results

- `grep -c 'prefers-reduced-motion: reduce' app/globals.css` → `1` (single block, augmented not duplicated)
- `grep -A 13 'prefers-reduced-motion: reduce' app/globals.css | grep 'animate-backdrop'` → rule present with `animation: none; opacity: 1`
- `grep -c -- '-webkit-tap-highlight-color: transparent' app/globals.css` → `1`
- Default `.animate-backdrop` utility outside the media query unchanged: `animation: fadeBackdrop 0.2s ease forwards;`
- No new keyframes, tokens, or selectors introduced
- `npm run lint` → exit 0 (clean)

## Deviations from Plan

None — plan executed exactly as written. Both edits landed on the specified lines and selectors.

## Known Stubs

None.

## Threat Flags

None — CSS-only changes with no network endpoints, auth paths, file access patterns, or schema changes.

## Self-Check: PASSED

- app/globals.css — FOUND
- .planning/phases/08-accessibility-pwa-baseline/08-01-SUMMARY.md — FOUND
- Commit 177c53d — FOUND
