---
phase: 07-secondary-screens-navigation
fixed_at: 2026-06-28T00:00:00Z
review_path: .planning/phases/07-secondary-screens-navigation/07-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 5
fixed: 5
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-06-28T00:00:00Z
**Source review:** .planning/phases/07-secondary-screens-navigation/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### CR-01: save() calls res.json() without checking res.ok

**Files modified:** `app/settings/page.tsx`
**Commit:** b7de1cf
**Applied fix:** Added `if (!res.ok) throw new Error(\`Settings save failed: \${res.status}\`)` immediately after the `fetch` call in `save()`, before calling `res.json()`. Also converted the `finally`-only block to a `try/catch/finally` so the thrown error is caught and logged with `console.error`. This prevents `setSaved(true)` from firing on server errors and ensures the UI does not falsely report success on 4xx/5xx responses.

---

### CR-02: handleDelete optimistically removes card even on failed DELETE

**Files modified:** `app/cards/page.tsx`
**Commit:** d87e118
**Applied fix:** Captured the `fetch` response into `res` and added `if (!res.ok) { console.error('Delete failed:', res.status); return }` before the `setCards` state update. The card is now only removed from local state when the DELETE request succeeds; on failure the card remains visible in the list.

---

### WR-01: --sab freeze in Nav fires after first paint

**Files modified:** `app/layout.tsx`
**Commit:** ba3f32d
**Applied fix:** Added a second pre-paint `<script>` block in `app/layout.tsx` immediately after the existing theme pre-paint script. The new script runs synchronously during HTML parse, creates a temporary `<div>` with `paddingBottom: env(safe-area-inset-bottom)`, reads back the computed value via `getComputedStyle`, then sets `--sab` on `<html>`. This means `var(--sab, 0px)` in the `<main>` bottom-padding and the Nav bottom bar resolve to the correct value before first paint. The Nav `useEffect` guard (`if (!existing)`) remains as a no-op safety net for the common case where `--sab` is already set.

---

### WR-02: Color debounce race — action and reward colors share one timer ref

**Files modified:** `app/settings/page.tsx`
**Commit:** f998cc3
**Applied fix:** Introduced a `pendingColorPatch` ref (`useRef<{ buttonColor?: string; rewardColor?: string }>({})`) and extracted a shared `flushColorSave()` function. Each color change handler now writes its value into `pendingColorPatch.current` before calling `flushColorSave()`. The flush function resets `pendingColorPatch.current = {}` before dispatching the accumulated patch, so rapid interleaved drags on both color pickers are combined into a single API call rather than cancelling each other. `selectPalette` was also updated to use the same accumulator pattern for consistency.

---

### WR-03: StudySession.tsx uses raw env(safe-area-inset-bottom)

**Files modified:** `components/StudySession.tsx`
**Commit:** 9bc16d2
**Applied fix:** Replaced `env(safe-area-inset-bottom)` with `var(--sab,0px)` in the Tailwind arbitrary class on the action-bar sticky `<div>` at line 821. The grade-bar strip now uses the frozen `--sab` value set by the pre-paint script (WR-01) and Nav `useEffect`, consistent with the rest of the app.

---

_Fixed: 2026-06-28T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
