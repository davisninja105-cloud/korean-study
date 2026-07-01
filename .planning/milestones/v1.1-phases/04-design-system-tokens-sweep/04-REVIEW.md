---
phase: "04"
phase_name: "design-system-tokens-sweep"
status: "findings"
depth: "standard"
files_reviewed: 22
files_reviewed_list:
  - app/globals.css
  - app/login/page.tsx
  - app/page.tsx
  - app/wrapped/page.tsx
  - app/study/page.tsx
  - app/cards/page.tsx
  - app/habits/page.tsx
  - app/settings/page.tsx
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
findings:
  critical: 2
  warning: 8
  info: 5
  total: 15
---

# Code Review: Phase 04 — design-system-tokens-sweep

## Summary

The token sweep is substantially complete: surface, muted, border, button, and reward tokens are applied correctly throughout. Two blockers survive: a hardcoded hex gradient in `app/wrapped/page.tsx` that bypasses user-configurable `--button`/`--cat-vocab` tokens, and a `fmtTime()` rendering bug that produces double spaces (e.g. "1h  30m"). Eight additional color escapes and quality issues require attention.

## Findings

### CR-01 — `fmtTime` produces double-space output for hours + minutes [Critical]

**File:** `app/wrapped/page.tsx:21`  
**Issue:** The template literal `` `${h}h ${m > 0 ? ` ${m}m` : ''}` `` embeds a second template literal that starts with a space. When `m > 0`, the result is `"1h  30m"` (two spaces). Verified via `node -e` — output for 5400s is `"1h  30m"`. The companion function `formatTotalTime` in `app/habits/page.tsx:25` is written correctly (`` `${h}h ${m}m` ``).  
**Fix:**
```ts
function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
```

---

### CR-02 — Hero strip in `app/wrapped/page.tsx` hardcodes hex colors, bypassing user palette [Critical]

**File:** `app/wrapped/page.tsx:125`  
**Issue:** The "Your journey so far" hero uses `style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}` — hardwired blue-500 → indigo-500. If the user changes their `buttonColor` in Settings (which updates `--button`), the wrapped page hero will be visually inconsistent with the rest of the app. The accompanying text also uses literal `text-white` (lines 126–132), which breaks when a light action color is chosen (white text on a light gradient).  
**Fix:**
```tsx
<div
  className="px-6 py-5"
  style={{ background: 'linear-gradient(135deg, var(--button) 0%, var(--cat-vocab) 100%)' }}
>
  <p className="text-button-foreground/80 text-sm font-medium mb-1">Your journey so far</p>
  <p className="text-button-foreground text-3xl font-bold leading-tight">
    {stats.totalReviews.toLocaleString()}{' '}
    <span className="text-button-foreground/70 text-lg font-normal">reviews</span>
  </p>
  {stats.daysStudied > 0 && (
    <p className="text-button-foreground/80 text-sm mt-1">
      across {stats.daysStudied} study day{stats.daysStudied !== 1 ? 's' : ''}
    </p>
  )}
</div>
```

---

### WR-01 — `loadDue` and `startAhead` lack `.catch()` — permanent loading state on API failure [Warning]

**File:** `app/study/page.tsx:76–84`, `169–187`  
**Issue:** Both `loadDue` and `startAhead` call `setPhase('loading')` then chain `.then()`, but neither adds `.catch()`. If `GET /api/cards/due` fails (network error, 500), `phase` is permanently stuck at `'loading'`, rendering the infinite skeleton. The user has no way to escape or retry.  
**Fix:** Add a catch handler on both:
```ts
const loadDue = useCallback((from: number, to: number, maxOrder: number) => {
  setPhase('loading')
  fetch(`/api/cards/due${buildParams(from, to, 'due', maxOrder)}`)
    .then((r) => r.json())
    .then((cards: Card[]) => {
      setStudyCards(cards)
      setScope('due')
      setPhase('select-mode')
    })
    .catch(() => {
      setStudyCards([])
      setPhase('select-mode')
    })
}, [buildParams])
```
Apply the same pattern to `startAhead`.

---

### WR-02 — `ProficiencyArc` track arc uses literal `text-gray-200 dark:text-gray-700` [Warning]

**File:** `components/ProficiencyArc.tsx:47`  
**Issue:** The SVG arc track circle uses `className="text-gray-200 dark:text-gray-700"`. This is a literal gray escape that survived the sweep. The `--border` token already maps to `#e5e7eb` (light) / `#374151` (dark), which are identical to gray-200 / gray-700 semantically.  
**Fix:**
```tsx
className="text-border"
```

---

### WR-03 — `HabitTracker` comeback pill hardcodes `#22c55e` hex [Warning]

**File:** `components/HabitTracker.tsx:167`  
**Issue:** The comeback message pill uses `style={{ background: 'color-mix(in srgb, #22c55e 10%, transparent)' }}` — a literal green-500 hex. The text uses `text-green-700 dark:text-green-300` which is acceptable for a success state but inconsistent with using a raw hex in the style attribute.  
**Fix:** Remove the inline style and use Tailwind utilities:
```tsx
className="text-xs font-medium px-3 py-2 rounded-lg bg-green-500/10 text-green-700 dark:text-green-300"
```

---

### WR-04 — `HabitHeatmap` today-cell ring missing `ring-reward` class [Warning]

**File:** `components/HabitHeatmap.tsx:50`  
**Issue:** The today cell appends `ring-2 ring-offset-1 ring-offset-surface-1` but omits `ring-reward`. Without the ring color, Tailwind's ring defaults to `currentColor`, not the reward color. A redundant `boxShadow: '0 0 0 2px var(--reward)'` style is added to compensate. By contrast, `HabitTracker.tsx:98` correctly uses `ring-2 ring-reward ring-offset-1 ring-offset-surface-1`.  
**Fix:**
```ts
if (date === today) {
  className += ' ring-2 ring-reward ring-offset-1 ring-offset-surface-1'
  // remove the outlineColor/boxShadow style override — ring-reward handles it
}
```

---

### WR-05 — `CardEditor.handleSave` has no `catch` — silent failure with no user feedback [Warning]

**File:** `components/CardEditor.tsx:72–93`  
**Issue:** `handleSave` uses `try { ... } finally { setSaving(false) }` with no `catch`. If the API returns a non-OK response, `onSave(updated)` is called with the error payload (e.g. `{ error: "..." }`), silently corrupting the parent card list. Network failures propagate as unhandled promise rejections.  
**Fix:**
```ts
const handleSave = async () => {
  setSaving(true)
  try {
    const res = await fetch(`/api/cards/${card.id}`, { ... })
    if (!res.ok) throw new Error(`Save failed: ${res.status}`)
    const updated = await res.json()
    onSave(updated)
  } catch (err) {
    console.error('CardEditor save failed:', err)
    // Optionally: setSaveError('Could not save — try again')
  } finally {
    setSaving(false)
  }
}
```

---

### WR-06 — `cards/page.tsx` `handleAdd` has no `catch` — silent failure and possible corrupt state [Warning]

**File:** `app/cards/page.tsx:119–134`  
**Issue:** `handleAdd` uses `try { ... } finally { setAdding(false) }` with no `catch`. If the POST fails, `setCards((prev) => [created, ...prev])` is called with an error object, prepending `{ error: "..." }` to the card list. The sheet stays open with no error shown.  
**Fix:**
```ts
const handleAdd = async () => {
  if (!newCard.front || !newCard.back) return
  setAdding(true)
  try {
    const res = await fetch('/api/cards', { ... })
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
    const created = await res.json()
    setCards((prev) => [created, ...prev])
    setNewCard({ type: 'vocabulary', front: '', back: '', notes: '' })
    setShowAdd(false)
  } catch (err) {
    console.error('Add card failed:', err)
  } finally {
    setAdding(false)
  }
}
```

---

### WR-07 — Study complete screen uses literal `text-green-500` without dark variant [Warning]

**File:** `app/study/page.tsx:407`  
**Issue:** The "Correct" stat tile uses `className="text-xl font-bold text-green-500"` — literal color without a dark-mode variant. In dark mode, green-500 on `--surface-2` (#141824) has lower contrast than green-400 would.  
**Fix:**
```tsx
<span className="text-xl font-bold text-green-600 dark:text-green-400">{completeStats.correct}</span>
```

---

### WR-08 — `SyncPanel.tsx:67` uses `text-red-500` without dark variant [Warning]

**File:** `components/SyncPanel.tsx:67`  
**Issue:** The "NEXT_PUBLIC_GOOGLE_DOC_ID is not configured" warning renders as `text-red-500` with no `dark:text-red-400`. All three other error/warning texts in the same file correctly use `dark:text-red-400`. This is an inconsistency that produces lower contrast in dark mode.  
**Fix:**
```tsx
<p className="mt-3 text-sm text-red-500 dark:text-red-400">
  NEXT_PUBLIC_GOOGLE_DOC_ID is not configured.
</p>
```

---

### IN-01 — Dark theme blocks missing `--reward-soft`, `--button-hover`, `--button-soft`, `--cat-*` tokens [Info]

**File:** `app/globals.css:56–97`  
**Issue:** Both the `@media (prefers-color-scheme: dark)` block and `:root[data-theme="dark"]` block do not override `--reward-soft`, `--button-hover`, `--button-soft`, `--cat-vocab`, `--cat-grammar`, `--cat-phrase`, or `--reward-foreground`. These `color-mix()` and fixed-hue values derive from `--reward` and `--button` at parse time, which works correctly when user-configurable tokens are injected via inline style. However, CLAUDE.md explicitly states: "When adding a dark value, mirror it in BOTH blocks." The absence is a maintenance hazard if defaults ever need dark-specific hues.  
**Fix:** Low urgency. Add a comment in both blocks noting these tokens are intentionally omitted because they are either user-configurable (injected via inline style at render) or pure functions of `--reward`/`--button`.

---

### IN-02 — `MilestoneCelebration` and `SessionComplete` confetti hardcodes default palette hex values [Info]

**File:** `components/MilestoneCelebration.tsx:35`, `app/study/page.tsx:363`  
**Issue:** Confetti uses hardcoded `['#f97316', '#fde68a', '#6366f1']` — the default values of `--reward`, the highlight amber, and `--cat-vocab`. These won't follow user palette customization.  
**Fix:** `canvas-confetti` only accepts string arrays, not CSS variables. To honor the user's palette, read computed values at fire time:
```ts
const style = getComputedStyle(document.documentElement)
const reward = style.getPropertyValue('--reward').trim() || '#f97316'
const catVocab = style.getPropertyValue('--cat-vocab').trim() || '#6366f1'
confetti({ ..., colors: [reward, '#fde68a', catVocab] })
```

---

### IN-03 — `habits/page.tsx` all-time stat tiles use `text-cat-vocab` for non-taxonomy values [Info]

**File:** `app/habits/page.tsx:157–169`  
**Issue:** Four stat tiles ("Total study time", "Cards reviewed", "Days studied", "Goal-met days") use `text-cat-vocab` (indigo-500) as an accent. Per CLAUDE.md: `--cat-vocab` is the card-type taxonomy token for vocabulary cards. Using it for general numeric highlights is a semantic misuse that will confuse maintainers and may conflict visually if these tiles ever appear alongside card-type badges.  
**Fix:** Use `text-foreground` for primary emphasis or `text-reward` for an accent that follows the user's reward color:
```tsx
<p className="text-2xl font-bold text-foreground">{formatTotalTime(stats.totalSeconds)}</p>
```

---

### IN-04 — `AudioButton` does not stop audio on unmount [Info]

**File:** `components/AudioButton.tsx:57–92`  
**Issue:** `audio.onended = () => setState('idle')` and `audio.onerror = () => setState('idle')` are set on the `HTMLAudioElement` but never cleaned up. If the user navigates away mid-playback, the Korean TTS audio continues playing in the background. React 18 suppresses the setState-on-unmounted-component warning but the audio plays on.  
**Fix:** Add a cleanup effect:
```ts
useEffect(() => {
  return () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }
}, [])
```

---

### IN-05 — `console.error` calls left in production paths [Info]

**File:** `app/page.tsx:82`, `app/study/page.tsx:120`, `app/study/page.tsx:155`, `components/StudySession.tsx:238`  
**Issue:** Four `console.error` calls remain in production code paths. In this single-tenant personal app these are acceptable operational signals, not security risks. Noted for completeness.  
**Fix:** No action required for a personal app. If ever multi-tenant, ensure card IDs and error details are not exposed.

---

_Reviewed: 2026-06-27T00:00:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
