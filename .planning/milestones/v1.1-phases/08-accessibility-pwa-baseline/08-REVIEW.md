---
phase: "08"
phase_name: "accessibility-pwa-baseline"
status: "issues_found"
depth: "standard"
files_reviewed: 7
files_reviewed_list:
  - app/globals.css
  - components/Nav.tsx
  - app/study/page.tsx
  - components/StudySession.tsx
  - components/GlossProvider.tsx
  - components/AudioButton.tsx
  - app/page.tsx
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
reviewed_at: "2026-06-29"
---

# Code Review: Phase 08 — accessibility-pwa-baseline

## Summary

Seven files were reviewed covering 08-01 CSS accessibility fixes (reduced-motion block, tap-highlight suppression) and 08-02 ARIA label and touch-target work across Nav, StudySession, GlossProvider, AudioButton, and app/page. Three critical defects were found: the gloss popover dialog has no focus management on open (screen reader users are never notified the dialog appeared), no focus trap (keyboard users tab behind it), and `intervalHints` array elements are accessed at fixed indices 0–3 without bounds-checking, which will throw a runtime `TypeError` if `previewIntervalLabels` ever returns fewer than four entries. Five warnings and three info items cover the "End session" missing label, grade-button appearance not being announced, the close-button absolute-position anchor, a `-webkit-tap-highlight-color` specificity weakness, and an audio `onerror`/catch double-state-set.

---

## Critical Issues

### CR-01: Gloss popover dialog never moves focus on open — invisible to screen readers

**File:** `components/GlossProvider.tsx`
**Line:** 116–191
**Severity:** Critical
**Category:** Accessibility

**Issue:** `GlossPopoverUI` renders with `role="dialog"` but no focus management. When the popover opens, focus stays on the tapped word (or document body). Screen reader users receive no notification that a dialog appeared. WCAG 2.1 SC 4.1.2 and the ARIA Authoring Practices dialog pattern both require focus to move to the first focusable element inside the dialog (or the dialog container) on open. The `Sheet.tsx` component (already in this codebase) correctly implements this pattern, but it was not applied to `GlossPopoverUI`.

**Fix:** Add a ref to the close button and focus it on mount:

```tsx
// In GlossPopoverUI
const closeBtnRef = useRef<HTMLButtonElement>(null)

useEffect(() => {
  closeBtnRef.current?.focus()
}, [])

// In JSX — add ref to close button
<button
  ref={closeBtnRef}
  onClick={onClose}
  aria-label="Close gloss"
  className="absolute top-2 right-2 min-h-[44px] min-w-[44px] …"
>
  ✕
</button>
```

Also add `aria-modal="true"` to the outer dialog `<div>` to tell virtual-buffer screen readers that content outside is inert.

---

### CR-02: Gloss popover has no focus trap — keyboard users tab into background content

**File:** `components/GlossProvider.tsx`
**Line:** 94–108
**Severity:** Critical
**Category:** Accessibility

**Issue:** The popover is a `role="dialog"` with no focus trap. Once a keyboard user reaches the close button or "Add as card" button, pressing Tab causes focus to escape to background elements — Nav links, FSRS grade buttons, AudioButtons behind the popover. This violates WCAG 2.1 SC 2.1.2 (No Keyboard Trap in the modal sense) and breaks the modal contract for all keyboard users. The existing Escape handler (lines 104–108) only dismisses the dialog; it does not prevent focus leakage while open.

`Sheet.tsx` in this same codebase implements a focus trap. The pattern was not reused here.

**Fix:** Add a keyboard handler that constrains Tab/Shift+Tab within the panel's focusable elements:

```tsx
// In GlossPopoverUI — add alongside the existing Escape handler
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [])
```

---

### CR-03: `intervalHints` accessed at indices 0–3 without bounds check — runtime TypeError possible

**File:** `components/StudySession.tsx`
**Line:** 836, 845, 854, 863, 893, 897
**Severity:** Critical
**Category:** Bug

**Issue:** `intervalHints` is set to the return value of `previewIntervalLabels(item.card.review)` (line 493). It is then accessed at fixed indices `[0]`, `[1]`, `[2]`, `[3]` in all grade buttons. The only guard is the truthy check `intervalHints ?` which only protects against `null` — it does not guard against the array having fewer than four elements. If `previewIntervalLabels` returns fewer than four entries (e.g., for a Learning-state card where the `ts-fsrs` library produces degenerate output, or after a library version bump), then `intervalHints[3].short` (Easy button, line 863) and others throw `TypeError: Cannot read properties of undefined (reading 'short')`, crashing the session mid-review.

```tsx
// Line 863 — crashes if intervalHints.length < 4
aria-label={intervalHints ? `Easy, review again in ${intervalHints[3].short}` : 'Easy'}
```

**Fix:** Validate the array length once and fall back to null if the shape is unexpected:

```tsx
// At the top of the render body, after intervalHints is read from state
const hints = intervalHints?.length === 4 ? intervalHints : null

// Then replace all intervalHints references with hints
aria-label={hints ? `Again, review again in ${hints[0].short}` : 'Again'}
// ...
aria-label={hints ? `Easy, review again in ${hints[3].short}` : 'Easy'}
```

Apply this substitution at lines 836, 845, 854, 863, 893, and 897.

---

## Warnings

### WR-01: "End" button has no `aria-label` — screen readers read bare "End" with no context

**File:** `components/StudySession.tsx`
**Line:** 558–563
**Severity:** Warning
**Category:** Accessibility

**Issue:** The Undo button was given `aria-label="Undo last rating"` in this phase (line 553), but the adjacent "End" button has no `aria-label`. The visible text "End" is ambiguous in isolation — screen reader users navigating by button role will hear "Undo last rating" followed by "End" with no indication of what ends. This inconsistency is a regression introduced by fixing only one of the two controls in the header row.

**Fix:**
```tsx
<button
  onClick={() => onComplete(stats)}
  aria-label="End study session"
  className="min-h-[44px] px-3 rounded-md hover:text-muted-foreground hover:bg-surface-3 active:bg-surface-3 transition-colors"
>
  End
</button>
```

---

### WR-02: Grade buttons appearing after "Show Answer" are not announced to screen readers

**File:** `components/StudySession.tsx`
**Line:** 831–870
**Severity:** Warning
**Category:** Accessibility

**Issue:** When the user presses "Show Answer" (or Space/Enter), `revealed` becomes `true` and the four FSRS grade buttons appear in `div.animate-reveal` (line 832). There is no `aria-live` region around the action bar and focus is not moved to the first grade button. A screen reader user pressing Space to flip the card gets no announcement that grading controls have appeared; they must navigate the page to discover them. The `aria-label` values added in this phase are correct for when focus eventually arrives, but there is no mechanism to signal their appearance.

**Fix:** Move focus to the "Again" button after reveal so screen readers immediately announce the grade options:

```tsx
const againBtnRef = useRef<HTMLButtonElement>(null)

const handleReveal = () => {
  setRevealed(true)
  haptic('selection')
  if (item.kind === 'real' && item.card.review) {
    setIntervalHints(previewIntervalLabels(item.card.review))
  }
  // Move focus to grade buttons on the next frame
  requestAnimationFrame(() => againBtnRef.current?.focus())
}

// Add ref={againBtnRef} to the "Again" <button> at line 834
```

---

### WR-03: Close button `absolute` positioning uses wrong ancestor — `relative` missing on panel container

**File:** `components/GlossProvider.tsx`
**Line:** 125–134
**Severity:** Warning
**Category:** Bug

**Issue:** The close button at line 132 uses `className="absolute top-2 right-2 …"`. The intended ancestor is the `<div ref={panelRef}>` (the white card panel), but that div has no `relative` or `absolute` positioning. The closest positioned ancestor is the outer `<div style={{ position: 'fixed' }}>`. This happens to produce the correct visual result today because both divs share full width and the fixed div has no padding. However the positioning is accidental: adding any padding or structural change to the outer fixed div would mis-place the close button without an obvious cause.

**Fix:**
```tsx
<div
  ref={panelRef}
  className="relative bg-surface-1 rounded-2xl shadow-xl border border-border/60 p-4 flex flex-col gap-2"
>
```

---

### WR-04: `-webkit-tap-highlight-color` on `html` may be overridden by UA styles on interactive elements

**File:** `app/globals.css`
**Line:** 107–110
**Severity:** Warning
**Category:** Accessibility / Bug

**Issue:** The phase set `-webkit-tap-highlight-color: transparent` on the `html` element (inside the `html { }` block). This is an inherited property, so it cascades to descendants. However, WebKit user-agent stylesheets in some browser builds explicitly set `-webkit-tap-highlight-color` on `<button>`, `<a>`, and `<input>` elements. A UA-specified value on those elements wins over an inherited value from `html`. Placing the rule on `html` suppresses the highlight on generic elements but may leave it on buttons and links in affected environments — exactly the elements where it matters most.

Using the `*` universal selector with specificity 0-0-0 places the value on every element directly (not inherited), so it wins over UA styles on a specificity-equal basis.

**Fix:**
```css
/* Apply directly so UA overrides on button/a/input can't win */
* {
  -webkit-tap-highlight-color: transparent;
}
```

The `html { color-scheme: light dark; }` rule can remain in its own block.

---

### WR-05: `audio.onerror` and outer catch block both call `setState('idle')` — double state set on play failure

**File:** `components/AudioButton.tsx`
**Line:** 81–91
**Severity:** Warning
**Category:** Bug

**Issue:** `audio.onerror = () => setState('idle')` is set at line 85 before `await audio.play()` is called at line 86. If `audio.play()` rejects (autoplay policy, network error, codec error), the outer `catch` block at line 87 catches the rejection and calls `setState('idle')` at line 89. Independently, when the `<audio>` element encounters a media error, `onerror` fires and also calls `setState('idle')`. On a play rejection, both code paths fire for the same failure, causing two `setState('idle')` calls in quick succession. React 19 batches these, but it is still a logic error: `setState('idle')` after the catch block (line 89) is redundant with `onerror` and the code intent is unclear.

**Fix:** Separate the two failure modes cleanly — `onerror` handles media decode errors after play succeeds; the catch handles play rejection:

```tsx
const audio = new Audio(data.url)
audioRef.current = audio
setState('playing')
audio.onended = () => setState('idle')
audio.onerror = () => setState('idle') // media error after play succeeds

try {
  await audio.play()
} catch {
  // play() rejected (autoplay policy) — onerror won't fire in this case
  audio.onerror = null // remove handler; we're handling it here
  setState('idle')
  await speakFallback(text)
}
```

---

## Info

### IN-01: `aria-live="polite"` on `role="dialog"` is a spec violation and is suppressed by screen readers

**File:** `components/GlossProvider.tsx`
**Line:** 118–119
**Severity:** Info
**Category:** Accessibility

**Issue:** The outer dialog `<div>` carries both `role="dialog"` and `aria-live="polite"`. The ARIA specification does not permit live-region semantics on dialog-role elements; screen readers (NVDA, VoiceOver) process the dialog role and ignore the live-region attribute on that node. The "Looking up…" loading announcement the attribute was presumably intended to produce never fires. Remove it from the dialog wrapper and place a separate `<div role="status" aria-live="polite" className="sr-only">` inside the panel if status announcements are needed (see fix in CR-01 for the full pattern).

---

### IN-02: Nav bottom-tab `aria-label` duplicates visible text — maintenance trap

**File:** `components/Nav.tsx`
**Line:** 85`
**Severity:** Info
**Category:** Quality

**Issue:** Each bottom-tab `<Link>` sets `aria-label={label}` (e.g., `aria-label="Home"`) and also renders `{label}` as visible child text. Since `aria-label` overrides the computed accessible name, the visible text is ignored by screen readers — the two sources are identical so it has no current effect. The maintenance risk: if visible label copy changes (e.g., "Habits" → "Streak"), the `aria-label` must be updated separately or WCAG 2.5.3 Label in Name is violated. Lucide `<Icon>` components render plain SVGs and do not inject `<title>` elements by default, so removing `aria-label` and adding `aria-hidden="true"` to the icon is sufficient.

**Fix (optional):**
```tsx
<Link
  key={href}
  href={href}
  aria-current={active ? 'page' : undefined}
  onClick={() => haptic('selection')}
  className={...}
>
  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} aria-hidden="true" />
  {label}
</Link>
```

---

### IN-03: `console.error` left in production code paths in study page

**File:** `app/study/page.tsx`
**Line:** 124, 159
**Severity:** Info
**Category:** Quality

**Issue:** `console.error('Failed to load lessons:', err)` (line 124) and `console.error('Failed to generate AI practice:', err)` (line 159) remain in production code. Both catch blocks degrade gracefully without the log. The error messages emit to the user's browser console and may expose internal stack trace details.

**Fix:**
```tsx
// Line 122-127 — remove console.error
.catch(() => {
  setLessonsLoaded(true)
  loadDue(1, 1, 1)
})

// Line 157-161 — remove console.error
} catch {
  setPractice([])
}
```

---

## Files Reviewed

- `app/globals.css`
- `components/Nav.tsx`
- `app/study/page.tsx`
- `components/StudySession.tsx`
- `components/GlossProvider.tsx`
- `components/AudioButton.tsx`
- `app/page.tsx`

---

_Reviewed: 2026-06-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
