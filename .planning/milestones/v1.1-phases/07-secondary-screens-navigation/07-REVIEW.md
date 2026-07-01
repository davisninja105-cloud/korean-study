---
phase: 07-secondary-screens-navigation
reviewed: 2026-06-28T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - app/cards/page.tsx
  - app/habits/page.tsx
  - app/layout.tsx
  - app/settings/page.tsx
  - components/Nav.tsx
  - components/SwipeRow.tsx
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-06-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 07 made targeted accessibility and layout improvements: freezing `env(safe-area-inset-bottom)` into `--sab`, adding `min-h-[44px]` touch targets, upgrading heading sizes, and adding `active:opacity-70` states. The changes are small in scope and mostly correct. Two blockers were found: the `save()` function in Settings never checks `res.ok` before calling `res.json()` (silent data loss on server error), and `handleDelete` in Cards silently discards network errors (optimistic delete on failed request). Three quality warnings follow, including a race condition in the Settings color debounce and incomplete `--sab` adoption.

---

## Critical Issues

### CR-01: `save()` calls `res.json()` without checking `res.ok` — silent failure on API error

**File:** `app/settings/page.tsx:63`
**Issue:** When the settings PUT request fails (5xx from DB, network error, etc.), `res.json()` is called on the error response. A valid JSON error body (e.g. `{ "error": "..." }`) will pass through the `typeof` guards on lines 64–70 without matching any field, so `setSaved(true)` is still called on line 71 — the UI shows "Saved ✓" even though nothing was persisted. If the server returns non-JSON on error (e.g. a Vercel 504 HTML page), `res.json()` throws, the `finally` block clears `saving`, but `setSaved` is never set — leaving the UI stuck with no feedback.

**Fix:**
```ts
const res = await fetch('/api/settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(patch),
})
if (!res.ok) throw new Error(`Settings save failed: ${res.status}`)
const d = await res.json()
// ... rest unchanged
```
Add a `catch` block or surface the error to the user (e.g. a red toast instead of the green "Saved ✓"):
```ts
} catch (err) {
  console.error('Failed to save settings:', err)
  // optionally: setSaveError(true); setTimeout(() => setSaveError(false), 3000)
} finally {
  setSaving(false)
}
```

---

### CR-02: `handleDelete` in Cards page optimistically removes the card even when the DELETE request fails

**File:** `app/cards/page.tsx:107-112`
**Issue:** `await fetch(...)` is called but the response is never checked. If the DELETE returns a 4xx/5xx, `setCards` still removes the card from local state. The user sees the card disappear; on next page load it reappears from the server — data appears lost momentarily and the UX is confusing.

```ts
const handleDelete = async (id: string) => {
  if (!confirm('Delete this card?')) return
  await fetch(`/api/cards/${id}`, { method: 'DELETE' })  // <-- unchecked
  setCards((prev) => prev.filter((c) => c.id !== id))
```

**Fix:**
```ts
const handleDelete = async (id: string) => {
  if (!confirm('Delete this card?')) return
  const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    console.error('Delete failed:', res.status)
    return  // leave the card in the list
  }
  setCards((prev) => prev.filter((c) => c.id !== id))
  if (editingId === id) setEditingId(null)
}
```

---

## Warnings

### WR-01: `--sab` freeze in Nav fires on every mount but `layout.tsx` uses `var(--sab)` before Nav renders

**File:** `components/Nav.tsx:21-31`
**Issue:** The `useEffect` that sets `--sab` on `<html>` runs after first paint. However, `app/layout.tsx:74` uses `var(--sab, 0px)` in the `<main>` bottom-padding *class*, which is evaluated by the browser before the effect fires. On the very first render — including any hard-refresh on an iPhone with a home indicator — the `<main>` bottom padding starts at `0px` and then jumps to the real SAB value after hydration. The result is a brief layout shift where content is obscured behind the home indicator before snapping up.

The `0px` fallback in the class provides a safety net, but a user landing on the home page and quickly scrolling before hydration could find content cut off.

**Fix:** Set `--sab` via a pre-paint `<script>` in `app/layout.tsx` using the same approach as the theme pre-paint script, so the value is available synchronously before first paint:
```html
<script dangerouslySetInnerHTML={{ __html: `
  try {
    var tmp = document.createElement('div');
    tmp.style.paddingBottom = 'env(safe-area-inset-bottom)';
    document.body.appendChild(tmp);
    var sab = getComputedStyle(tmp).paddingBottom;
    document.body.removeChild(tmp);
    document.documentElement.style.setProperty('--sab', sab || '0px');
  } catch(e) {}
` }} />
```
The `useEffect` guard (`if (!existing)`) can remain as a no-op for the common case.

---

### WR-02: Color debounce timer race — `handleActionColorChange` and `handleRewardColorChange` share one timer ref

**File:** `app/settings/page.tsx:91-100`
**Issue:** `handleActionColorChange` (line 91) and `handleRewardColorChange` (line 99) both clear and reset `colorSaveTimer.current`. If the user drags the action color picker and then immediately drags the reward color picker within 400 ms, the action-color debounce timer is cancelled and only the reward color is saved. The action color change is silently dropped. The live CSS preview is correct, but the DB value for `buttonColor` is not persisted.

```ts
// handleActionColorChange
if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)  // clears own timer
colorSaveTimer.current = setTimeout(() => save({ buttonColor: hex }), 400)

// handleRewardColorChange (executed < 400ms later)
if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)  // cancels the action save!
colorSaveTimer.current = setTimeout(() => save({ rewardColor: hex }), 400)
```

**Fix:** Use separate timer refs for action and reward colors, or accumulate both pending changes and flush them together:
```ts
const pendingColorPatch = useRef<{ buttonColor?: string; rewardColor?: string }>({})

const flushColorSave = () => {
  if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)
  colorSaveTimer.current = setTimeout(() => {
    if (Object.keys(pendingColorPatch.current).length > 0) {
      save(pendingColorPatch.current)
      pendingColorPatch.current = {}
    }
  }, 400)
}

const handleActionColorChange = (hex: string) => {
  setButtonColor(hex)
  document.documentElement.style.setProperty('--button', hex)
  document.documentElement.style.setProperty('--button-foreground', readableForeground(hex))
  pendingColorPatch.current.buttonColor = hex
  flushColorSave()
}
```

---

### WR-03: `StudySession.tsx` still uses raw `env(safe-area-inset-bottom)` at line 821 — inconsistent with the `--sab` adoption in this phase

**File:** `components/StudySession.tsx:821` (out-of-phase file, but the phase specifically introduced `--sab` to replace direct `env()` usage)
**Issue:** The phase replaced `env(safe-area-inset-bottom)` with `var(--sab, 0px)` in `layout.tsx` and the Nav, but `StudySession.tsx` line 821 still embeds `env(safe-area-inset-bottom)` directly in a Tailwind arbitrary class:
```
sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))]
```
This means the grade-bar strip at the bottom of study mode does not benefit from the frozen `--sab` value. It will recalculate `env()` live, which is the original behavior — but it creates an inconsistency: on some browsers/WebViews that snapshot `env()` at parse time rather than recomputing dynamically, the two values could differ during a viewport resize.

**Fix:** Swap to `var(--sab, 0px)` for consistency:
```
sticky bottom-[calc(4.5rem+var(--sab,0px))]
```

---

## Info

### IN-01: View-toggle buttons in Cards page lack a grouping role — screen readers do not know the two `aria-pressed` buttons are mutually exclusive

**File:** `app/cards/page.tsx:215-232`
**Issue:** The two view-toggle buttons (`Cards` / `Reading practice`) each carry `aria-pressed`, but there is no `role="group"` or `role="toolbar"` on the container `<div>`. The Settings page's theme toggle (line 151) correctly wraps its group in `role="group" aria-label="Theme"`. The Cards toggle omits this, so a screen reader user hears two independent toggle buttons with no indication they are related alternatives.

**Fix:**
```tsx
<div
  className="flex bg-surface-3 rounded-lg p-1 self-start"
  role="group"
  aria-label="View"
>
```

---

### IN-02: `loadCards` in Cards page is defined as a plain function inside the component — ESLint `react-hooks/exhaustive-deps` will warn if it is ever added to a dependency array

**File:** `app/cards/page.tsx:56-60`
**Issue:** `loadCards` is a non-memoized function defined inline. It is called in `useEffect` (line 63) without being listed as a dependency, which is fine because `useEffect` here has an empty deps array and only runs on mount. However, the function captures no state, so this is benign at present. If a future engineer tries to call `loadCards` from another effect or pass it as a prop, the missing `useCallback` wrapper will trigger an ESLint exhaustive-deps warning or introduce a stale-closure bug.

**Fix:** Wrap with `useCallback` now to make intent explicit and prevent future regressions:
```ts
const loadCards = useCallback(() => {
  fetch('/api/cards')
    .then((r) => r.json())
    .then(setCards)
}, [])
```

---

_Reviewed: 2026-06-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
