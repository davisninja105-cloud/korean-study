---
phase: 06-home-dashboard-polish
fixed_at: 2026-06-28T16:03:30Z
review_path: .planning/phases/06-home-dashboard-polish/06-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 06: Code Review Fix Report

**Fixed at:** 2026-06-28T16:03:30Z
**Source review:** .planning/phases/06-home-dashboard-polish/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `loadActivity()` not called after sync — `heroState` can be stale

**Files modified:** `app/page.tsx`
**Commit:** b0244e1
**Applied fix:** Added `loadActivity()` call immediately after `loadStats()` inside the `handleSync` success path (line 119). Also added `loadActivity` to the `useCallback` dependency array so the closure is always fresh.

### WR-02: `res.json()` called unconditionally before checking `res.ok`

**Files modified:** `app/page.tsx`
**Commit:** af38b2d
**Applied fix:** Reordered the `handleSync` fetch response handling to check `res.ok` first. On a non-2xx response, reads the body as text (with a `.catch(() => '')` fallback) and throws an error with the raw text or the HTTP status code. Only on success does the code proceed to `res.json()`, which now can no longer throw a `SyntaxError` for non-JSON error bodies.

### WR-03: Duplicate `transition-shadow` + `transition-colors` — shadow hover silently dropped

**Files modified:** `app/page.tsx`
**Commit:** d17267a
**Applied fix:** Replaced the conflicting `transition-shadow` and `transition-colors` utilities on the "My Korean" `<Link>` element with a single `transition-all`, ensuring both the shadow and background-color transitions animate correctly under Tailwind v4.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-06-28T16:03:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
