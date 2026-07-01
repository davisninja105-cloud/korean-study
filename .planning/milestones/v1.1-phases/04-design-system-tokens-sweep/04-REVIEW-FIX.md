---
phase: "04"
phase_name: "design-system-tokens-sweep"
status: "all_fixed"
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
---

# Code Review Fix Report: Phase 04 — design-system-tokens-sweep

## Summary

All 10 Critical and Warning findings were fixed and committed atomically. Lint passes clean. 5 Info findings were out of scope.

## Applied Fixes

### CR-01 — `fmtTime` double-space for hours + minutes ✓ Fixed
**Commit:** `f61240d fix(04): CR-01 fix fmtTime double-space for hours+minutes`
**Change:** Rewrote `fmtTime` in `app/wrapped/page.tsx` to use `m > 0 ? \`${h}h ${m}m\` : \`${h}h\`` instead of the nested template literal that produced two spaces.

### CR-02 — Hero strip hardcodes hex gradient, bypassing user palette ✓ Fixed
**Commit:** `614fc44 fix(04): CR-02 replace hardcoded hex gradient with --button/--cat-vocab tokens in wrapped hero`
**Change:** Replaced `linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)` with `linear-gradient(135deg, var(--button) 0%, var(--cat-vocab) 100%)`. Replaced `text-white` variants with `text-button-foreground` / `text-button-foreground/80` / `text-button-foreground/70` in `app/wrapped/page.tsx`.

### WR-01 — `loadDue` and `startAhead` lack `.catch()` ✓ Fixed
**Commit:** `501e16d fix(04): WR-01 add .catch() to loadDue and startAhead to prevent permanent loading state on API failure`
**Change:** Added `.catch(() => { setStudyCards([]); setPhase('select-mode') })` to both `loadDue` and `startAhead` in `app/study/page.tsx`.

### WR-02 — `ProficiencyArc` track uses literal `text-gray-200 dark:text-gray-700` ✓ Fixed
**Commit:** `dcdece7 fix(04): WR-02 replace literal text-gray-200 dark:text-gray-700 with text-border in ProficiencyArc track`
**Change:** `className="text-gray-200 dark:text-gray-700"` → `className="text-border"` in `components/ProficiencyArc.tsx`.

### WR-03 — `HabitTracker` comeback pill hardcodes `#22c55e` hex ✓ Fixed
**Commit:** `4b10963 fix(04): WR-03 replace hardcoded #22c55e hex in comeback pill with bg-green-500/10 utility`
**Change:** Removed `style={{ background: 'color-mix(in srgb, #22c55e 10%, transparent)' }}` and added `bg-green-500/10` Tailwind class to `components/HabitTracker.tsx`.

### WR-04 — `HabitHeatmap` today-cell ring missing `ring-reward` ✓ Fixed
**Commit:** `11ca355 fix(04): WR-04 add ring-reward class to today cell in HabitHeatmap, remove redundant boxShadow override`
**Change:** Added `ring-reward` to ring classes on today cell; removed redundant `outlineColor`/`boxShadow` inline style override in `components/HabitHeatmap.tsx`.

### WR-05 — `CardEditor.handleSave` has no `catch` ✓ Fixed
**Commit:** `9b3f7f1 fix(04): WR-05 add res.ok check and catch block to CardEditor handleSave to prevent silent failure`
**Change:** Added `if (!res.ok) throw new Error(...)` check and `catch` block to `handleSave` in `components/CardEditor.tsx`.

### WR-06 — `cards/page.tsx` `handleAdd` has no `catch` ✓ Fixed
**Commit:** `e9c6c95 fix(04): WR-06 add res.ok check and catch block to cards/page handleAdd to prevent silent corrupt state`
**Change:** Added `if (!res.ok) throw new Error(...)` check and `catch` block to `handleAdd` in `app/cards/page.tsx`.

### WR-07 — Study complete `text-green-500` missing dark variant ✓ Fixed
**Commit:** `23b343c fix(04): WR-07 add dark:text-green-400 to Correct stat tile in study complete screen`
**Change:** `text-green-500` → `text-green-600 dark:text-green-400` in `app/study/page.tsx`.

### WR-08 — `SyncPanel.tsx` `text-red-500` missing dark variant ✓ Fixed
**Commit:** `73d0334 fix(04): WR-08 add dark:text-red-400 to GOOGLE_DOC_ID warning in SyncPanel for consistent dark mode contrast`
**Change:** Added `dark:text-red-400` to the `NEXT_PUBLIC_GOOGLE_DOC_ID` warning paragraph in `components/SyncPanel.tsx`.

## Skipped (Info — out of scope)

### IN-01 — Dark theme blocks missing optional token overrides (out of scope)
### IN-02 — Confetti hardcodes default palette hex values (out of scope)
### IN-03 — `habits/page.tsx` stat tiles use `text-cat-vocab` for non-taxonomy values (out of scope)
### IN-04 — `AudioButton` does not stop audio on unmount (out of scope)
### IN-05 — `console.error` calls in production paths (out of scope)

---
_Fixed: 2026-06-27_
_Fixer: Claude (gsd-code-fixer)_
_Lint: clean_
