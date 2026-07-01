---
phase: "08"
phase_name: "accessibility-pwa-baseline"
status: "all_fixed"
fix_scope: "critical_warning"
findings_in_scope: 8
fixed: 8
skipped: 0
iteration: 1
fixed_at: "2026-06-29"
---

# Code Review Fix Report: Phase 08

## Summary

All 8 Critical and Warning findings from the Phase 08 accessibility review were successfully applied across three files (`components/GlossProvider.tsx`, `components/StudySession.tsx`, `app/globals.css`, `components/AudioButton.tsx`) in 4 atomic commits.

## Fixed

### CR-01: Gloss popover dialog never moves focus on open
**Commit:** `058c9dc`
**Change:** Added `closeBtnRef = useRef<HTMLButtonElement>(null)` to `GlossPopoverUI`, a `useEffect(() => { closeBtnRef.current?.focus() }, [])` to focus the close button on mount, `ref={closeBtnRef}` on the close button element, and `aria-modal="true"` on the outer `role="dialog"` div.

### CR-02: Gloss popover has no focus trap
**Commit:** `058c9dc`
**Change:** Merged the Escape handler and the new Tab/Shift+Tab focus trap into a single `keydown` `useEffect` that constrains focus within `panelRef.current`'s focusable children. The previous separate Escape-only `useEffect` was replaced.

### CR-03: `intervalHints` accessed at indices 0–3 without bounds check
**Commit:** `44d088c`
**Change:** Added `const hints = intervalHints?.length === 4 ? intervalHints : null` immediately after the early-return guard in the render body. Replaced all 6 `intervalHints` references in grade-button `aria-label` attrs and interval-hint `<span>` renders with `hints`.

### WR-01: "End" button has no `aria-label`
**Commit:** `44d088c`
**Change:** Added `aria-label="End study session"` to the End button in the session header controls row.

### WR-02: Grade buttons not announced after "Show Answer"
**Commit:** `44d088c`
**Change:** Added `againBtnRef = useRef<HTMLButtonElement>(null)`, added `requestAnimationFrame(() => againBtnRef.current?.focus())` at the end of `handleReveal`, and added `ref={againBtnRef}` to the "Again" grade button so focus moves to the grade row immediately after the answer is revealed.

### WR-03: Close button `absolute` positioning uses wrong ancestor
**Commit:** `058c9dc`
**Change:** Added the `relative` Tailwind class to `<div ref={panelRef}>` so the close button's `absolute top-2 right-2` positioning is anchored to the panel card, not the outer fixed wrapper.

### WR-04: `-webkit-tap-highlight-color` on `html` may be overridden by UA styles
**Commit:** `e35efe9`
**Change:** Split the `html` block so only `color-scheme: light dark` remains there. Added a new `* { -webkit-tap-highlight-color: transparent; }` rule so the property is applied directly on every element (specificity 0-0-0 applied directly beats an inherited value from `html`).

### WR-05: `audio.onerror` and outer catch both call `setState('idle')` on play failure
**Commit:** `f61551f`
**Change:** Introduced a nested `try/catch` around `await audio.play()`. The inner catch handles `play()` rejection (autoplay policy/network error): it sets `audio.onerror = null` to prevent a later media-error event from triggering a second `setState`, then calls `setState('idle')` and falls back to `speakFallback`. The outer catch continues to handle errors fetching the TTS URL. The `onerror` handler remains in place for genuine media decode errors that occur after `play()` resolves.

## Skipped

None.

---

_Fixed: 2026-06-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
