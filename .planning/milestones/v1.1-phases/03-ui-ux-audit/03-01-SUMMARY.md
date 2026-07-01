---
phase: 03-ui-ux-audit
plan: "01"
subsystem: ui-ux-audit
tags: [audit, ui, ux, accessibility, dark-mode, tokens, touch-targets]
status: complete

dependency_graph:
  requires: []
  provides:
    - .planning/ui-reviews/audit.md
    - finding IDs F-01..F-27 (stable references for Phases 4–8)
  affects:
    - Phase 4 (design system tokens, P0 fixes)
    - Phase 5 (screen-specific polish)
    - Phase 6 (accessibility)
    - Phase 7 (Wrapped/Nav)
    - Phase 8 (animation/motion)

tech_stack:
  added: []
  patterns:
    - Code-only static audit (D-01): read source files, grep for escapes, apply 6 dimensions per screen
    - Per-screen pass (D-02): one read per screen × 6 dimensions, not 6 sweeps × 7 screens
    - Severity from evidence (D-04): P0/P1/P2 assigned from code impact, not pre-assigned

key_files:
  created:
    - .planning/ui-reviews/audit.md
  modified: []

decisions:
  - F-02 is P0 (not P1): --highlight-bg/fg has zero dark values in either dark block; primary learning surface shows harsh light-amber highlight in dark mode on #1c2030 background
  - F-23 is P0 (not P1): Wrapped hero gradient hardcodes #3b82f6 bypassing user's buttonColor entirely — documented as P0 token-system violation affecting the page's most prominent element
  - F-25 is P0 (not P1): Login focus ring uses focus:ring-blue-300 (hardcoded) vs focus:ring-button/50 used everywhere else; single entry point to app must be consistent
  - F-05 covers animate-backdrop only (not all keyframes): all other animation utilities DO have reduced-motion counterparts; only animate-backdrop is missing from the block

metrics:
  duration_seconds: 340
  completed_date: "2026-06-27"
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 0
---

# Phase 03 Plan 01: UI/UX Audit Summary

Severity-classified UI/UX findings document for all 7 screens of the Korean Study app using code-only static analysis across 6 audit dimensions. 27 findings (3 P0, 14 P1, 10 P2) with stable IDs F-01..F-27 and concrete code evidence for downstream phases 4–8 to reference.

## What Was Built

`.planning/ui-reviews/audit.md` — a single Markdown findings document containing:

- **Scope and legend** sections describing the 6 audit dimensions and 3 severity levels
- **Summary block**: 27 total findings, 3 P0 / 14 P1 / 10 P2
- **Findings table** (F-01..F-27): all rows contain stable ID, screen/component, dimension, P0/P1/P2 severity, specific description, and concrete `file:line`/grep evidence
- **Per-screen + per-shared-component coverage table**: explicit record of all 7 screens × 6 dimensions evaluated
- **Token-escape grep note**: results of the whole-UI-tree grep integrated into findings
- **P0 Gate section**: all 3 P0 findings listed with fix-owning phase and the AUDIT-02 gate statement
- **Spot-check**: 3 code references verified against actual source lines

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Pre-seed audit.md with F-01..F-05 from research, confirmed against code | 83ff47c |
| 2 | Per-screen code audit of all 7 screens + shared components (F-06..F-27) | 83ff47c |
| 3 | P0 gate section, summary block, consistency pass | 83ff47c |

(All three tasks were committed atomically in a single doc commit after all verification passed.)

## Key Findings Summary

### P0 Findings (must resolve before Phase 4)

| ID | Finding | Fix Phase |
|----|---------|-----------|
| F-02 | `--highlight-bg/fg` tokens absent from both dark blocks → harsh light-amber highlight on dark surface-1 (#1c2030) | Phase 4 |
| F-23 | Wrapped hero uses hardcoded gradient `#3b82f6→#6366f1` — ignores user's `buttonColor` entirely | Phase 7 |
| F-25 | Login input uses `focus:ring-blue-300` (hardcoded) vs `focus:ring-button/50` used everywhere else | Phase 4 or 5 |

### P1 Highlights (14 total)

- **F-01** — `env(safe-area-inset-bottom)` as live reference in Nav and layout `<main>` → resets to 0px after `<Link>` navigation (Next.js bug)
- **F-03** — GlossProvider close button is `w-6 h-6` (24px) — well below 44px Apple HIG minimum
- **F-04** — Bottom nav tabs and Settings gear lack `active:` press state (zero visual feedback between tap and navigation)
- **F-05** — `animate-backdrop` class has no `prefers-reduced-motion` counterpart (all other animation utilities are gated)
- **F-11** — "End" session button in StudySession: `py-1` = ~28px height, no `min-h-11`, no `active:`
- **F-12** — Undo button uses `title` (not `aria-label`) for its only label; the "↩" character alone has no accessible name
- **F-15** — `backface-visibility: hidden` on card flip faces causes iOS Safari flickering (unconditional, not feature-detected)
- **F-17** — Cards view-toggle buttons lack `aria-pressed`/`role="tab"` — active state conveyed by CSS only
- **F-21** — Settings form controls use `bg-white dark:bg-gray-900` token escapes throughout
- **F-26** — Sheet `aria-label={title}` → ModeSelector sheet used without `title` prop → dialog has no accessible name

### P2 Summary (10 total)

Token-escape cleanup (F-06, F-07, F-09, F-10, F-13, F-16, F-18, F-19, F-22, F-27, F-24): primarily `text-gray-*`, `bg-gray-*`, `bg-white` used where semantic tokens (`--muted`, `--border`, `--surface-*`) will exist after Phase 4 design system work. Typography hierarchy refinements: line-height 1.65 vs W3C recommended 1.7 for Korean text (F-14), flat h2 sizing on Habits page (F-20).

## Deviations from Plan

None — plan executed exactly as written. The three-task structure (pre-seed → per-screen scan → P0 gate) was followed in order. Severity was assigned from code evidence (D-04) with two upgrades from expected levels: F-23 and F-25 raised to P0 based on the severity of their impact (user theme config ignored; app entry point focus ring hardcoded).

## Known Stubs

None. This was a documentation-only phase — no UI code was created or modified. `audit.md` contains complete findings with concrete evidence; no placeholders remain.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes were introduced. The only artifact is a Markdown file under `.planning/ui-reviews/`.

## Self-Check: PASSED

- `.planning/ui-reviews/audit.md` exists on disk ✓
- `.planning/phases/03-ui-ux-audit/03-01-SUMMARY.md` exists on disk ✓
- Commit `83ff47c` exists in git log ✓
- `F-01` through `F-27` present in audit.md ✓
- P0 Gate section present in audit.md ✓
