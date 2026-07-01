# Phase 5: Study Session Polish — Research

**Researched:** 2026-06-27
**Domain:** React/Next.js component polish — progress indicators, haptic differentiation, Korean typography, CSS transition animations
**Confidence:** HIGH (all findings from direct codebase inspection)

---

## Summary

Phase 5 targets four tightly-scoped improvements to `components/StudySession.tsx` and `app/globals.css`. No new npm packages are needed (confirmed by project decision: "No new npm packages for the entire milestone"). All four requirements are CSS/JSX changes to existing structures.

**STUDY-01** (progress indicator): A ProgressRing + "{N} reviewed · {Q} left" strip already exists at lines 549–559 of StudySession.tsx. What is missing is a "Card N of Total" numeric counter — simple derived state: `initialCount - remainingDistinct + 1` for the current card number. The count and total are already computed.

**STUDY-02** (grade button differentiation): Four FSRS grade buttons already exist with color differences (Again = red, Hard = surface-3, Good = green-600, Easy = teal). What is missing is haptic differentiation — correct answers (Good/Easy, rating ≥ 3) should fire `haptic('success')` instead of the current `haptic('selection')` that fires for all grades. The "warm color differentiation" requirement is already partially met but the Hard button uses a neutral `bg-surface-3` that could be warmer.

**STUDY-03** (Korean typography): `.hangul` and `.hangul-sentence` in globals.css use `line-height: 1.65`, not `1.7`. `word-break: keep-all` is already present. The fix is a one-line change in globals.css. Visual hierarchy on the card back needs a spacing review — the back face mixes font sizes but the hierarchy is reasonable; confirm padding is sufficient (currently `p-8`).

**STUDY-04** (inter-card transitions): The current 3D flip is the card-reveal animation (front→back), NOT the inter-card transition. When `submitReview()` calls `setQueue(nextQueue)` and `setCursor((c) => c + 1)`, the card swaps instantly with no transition — this is the abrupt swap that needs fixing. The fix is a brief fade or slide on the card container keyed to `cursor`.

**Primary recommendation:** All four changes are isolated to StudySession.tsx + globals.css. Wave 1 handles typography + progress text (zero risk). Wave 2 handles haptic differentiation (event handler only). Wave 3 handles the inter-card transition animation (requires new CSS keyframe + reduced-motion gating).

---

## Project Constraints (from CLAUDE.md)

- **No new npm packages** — project decision for entire v1.1 milestone
- **ESLint strict** — `react-hooks/purity` forbids `Date.now()`/`Math.random()` in render; `react-hooks/set-state-in-effect` forbids synchronous `setState` in effects
- **Dark mode** — any new CSS must appear in all three blocks: light `:root`, `@media (prefers-color-scheme: dark) :root`, and `:root[data-theme="dark"]`
- **Reduced-motion** — any new `@keyframes` animation must have a counterpart in `@media (prefers-reduced-motion: reduce)` (A11Y-02 is Phase 8; but new animations added in Phase 5 must be gated now so Phase 8 has nothing to retrofit)
- **Semantic tokens** — use `--muted`, `--border`, `--surface-*`, `--button`, `--reward` tokens; never raw `gray-*` utilities
- **Tailwind v4** — `@theme inline` for custom utilities; `@layer utilities` for Korean text helpers
- **Deploy** — `git push origin main` auto-deploys to Vercel; lint must stay clean

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STUDY-01 | Study session displays a "Card N of Total" progress indicator throughout the session, updating after each card | `initialCount` already computed in StudySession.tsx:128; `remainingDistinct` already computed at lines 284–289; derive `currentCardNum = initialCount - remainingDistinct + 1` inline and display beside or above the existing ProgressRing |
| STUDY-02 | Grade buttons are visually and haptically distinct for correct vs. needs-review answers (warm color differentiation + distinct haptic pattern) | `haptic()` from `lib/haptics.ts` supports `'selection'`, `'success'`, `'impact-light'`, `'impact-heavy'`; currently all grades call `haptic('selection')` at line 387; correct = rating ≥ 3; change correct-grade calls to `haptic('success')` |
| STUDY-03 | Korean flashcard text uses `line-height: 1.7` and `word-break: keep-all`; card front/back have clear visual hierarchy with appropriate spacing | `.hangul` and `.hangul-sentence` in globals.css:256–269 use `line-height: 1.65`; change to `1.7`; `word-break: keep-all` already present; visual hierarchy on card back already uses font-size steps (text-xl, text-3xl, text-xl) |
| STUDY-04 | Inter-card transition is smooth (≤150ms slide or fade), replacing the current abrupt swap | `setCursor` increment at line 438 drives card advance; add a `key={cursor}` on the card container div + a CSS `@keyframes` fadeIn that targets the card element; must add `@media (prefers-reduced-motion: reduce)` gate |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Progress indicator ("Card N of Total") | Frontend Client | — | Derived from client-side `queue` state; no server call needed |
| Grade haptics | Frontend Client | — | `haptic()` is a client-side Web Vibration API call in `lib/haptics.ts` |
| Korean typography | CSS / globals.css | Frontend Client (JSX classes) | `line-height`/`word-break` are pure CSS on `.hangul`/`.hangul-sentence`; applied via className in StudySession.tsx |
| Inter-card transition | CSS / globals.css | Frontend Client | New `@keyframes` in globals.css; triggered by React `key=` prop change |

---

## Standard Stack

No new packages. All work uses the existing stack. [VERIFIED: direct codebase inspection]

| Tool | Version | Role |
|------|---------|------|
| Tailwind CSS v4 | 4.2.2 | CSS utilities + `@theme inline` tokens |
| React | 19.2.4 | Component state (`useState`, `useLayoutEffect`) |
| `lib/haptics.ts` | (project) | `haptic()` vibration wrapper |
| `app/globals.css` | (project) | Korean utility classes + animation keyframes |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation library | Framer Motion, GSAP | CSS `@keyframes` + Tailwind utilities | Project decision: no new packages; existing `animate-reveal` pattern covers this |
| Haptic library | custom vibration code | `haptic()` from `lib/haptics.ts` | Already abstracts `navigator.vibrate`; has 4 named patterns |
| Progress bar | Custom SVG/Canvas | Existing `ProgressRing` component | Already wired to `progressPct` in StudySession; extend, don't duplicate |
| Korean line-height utility | Custom CSS class | Modify existing `.hangul`/`.hangul-sentence` in globals.css | Single source of truth already exists |

---

## Current State Audit (from codebase inspection)

### STUDY-01: Progress Indicator

**Current state** [VERIFIED: direct read of StudySession.tsx:128, 284–289, 549–559]:

The component already computes:
- `initialCount = cards.length + extraPractice.length` (line 128) — total items at session start
- `remainingDistinct` — distinct cards remaining in queue (lines 284–289)
- `progressPct = (initialCount - remainingDistinct) / initialCount * 100` (line 287–289)
- `stats.reviewed` — count of cards answered so far (line 143)

The existing progress area (lines 549–559):
```tsx
<div className="flex items-center gap-3 w-full">
  <ProgressRing pct={progressPct} size={44} strokeWidth={4} color="var(--button)"
    aria-label={`Session progress: ${Math.round(progressPct)}%`} />
  <p className="text-sm text-muted">
    {stats.reviewed} reviewed · {queue.length} left
  </p>
</div>
```

**What is missing:** The text shows "N reviewed · M left" but NOT the required "Card N of Total" format. The numeric card position is easily computed:
- Current card number: `initialCount - remainingDistinct + 1` — but this counts distinct cards, not queue positions
- Simpler: `stats.reviewed + 1` = the number of the card currently being shown (before rating)
- Total: `initialCount`
- Display: `Card {stats.reviewed + 1} of {initialCount}`

**Placement decision:** Replace or augment the existing `{stats.reviewed} reviewed · {queue.length} left` text. The ProgressRing + text strip is already the right location. The text can become "Card {stats.reviewed + 1} of {initialCount}" which is more orientating than the current form.

**Edge case:** When all cards are done (`queue.length === 0`), the component returns `null` (line 277) so there is no off-by-one risk at session end.

### STUDY-02: Grade Button Differentiation

**Current haptic behavior** [VERIFIED: StudySession.tsx:387]:
```tsx
const submitReview = async (rating: number) => {
  haptic('selection')   // ← SAME for ALL grades
  ...
  const isCorrect = rating >= 3
```

**What haptics.ts supports** [VERIFIED: lib/haptics.ts]:
```ts
const PATTERNS = {
  'selection':    10,          // 10ms single buzz
  'success':      [10, 50, 20], // burst pattern — 10ms on, 50ms off, 20ms on
  'impact-light': 15,
  'impact-heavy': 30,
}
```

**Fix:** In `submitReview`, split by `isCorrect`:
- `rating >= 3` (Good, Easy) → `haptic('success')` (burst pattern — distinct and encouraging)
- `rating < 3` (Again, Hard) → `haptic('selection')` (single buzz — softer, neutral)

**Current grade button visual styling** [VERIFIED: StudySession.tsx:817–848]:
| Grade | Rating | Current styling | Semantic |
|-------|--------|-----------------|----------|
| Again | 1 | `bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400` | Needs-review (correct) |
| Hard | 2 | `bg-surface-3 text-muted` | Neutral/tertiary (needs-review) |
| Good | 3 | `bg-green-600 text-white` (flex-[1.5], larger) | Correct — primary |
| Easy | 4 | `bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400` | Correct — secondary |

**"Warm color differentiation" assessment:** The correct/needs-review split is Already partially present. The audit finding F-14 is about typography, not grade colors. The requirement asks for "warm color differentiation" — the current green-600 for Good is a cold green. To make Good feel warmer and more reward-like, the plan could use `--reward` (orange) or stay with green (which reads as "correct" universally). Since the project's `--reward` token is warm orange (`#f97316`) and the grade bar colors need to remain readable, the safer interpretation is: use the existing `--reward` or `--button` tokens for the "correct" grades to tie them into the design system, rather than raw green.

**Audit finding:** F-14 is typography (line-height). No specific audit finding targets grade button color — the STUDY-02 requirement is the driver here.

**Recommendation:** For "warm color differentiation":
- Keep Again = red (universal "wrong" signal)
- Make Hard = `bg-surface-3 text-muted` with a subtle amber/orange tint, OR keep neutral (Hard is ambiguous — not wrong, not fully right)
- Make Good = use `bg-button text-button-foreground` (uses the action token — removes hardcoded green-600)
- Make Easy = use a `--reward-soft` tinted background to tie it to the warm reward system

This approach satisfies "warm color differentiation" while using semantic tokens instead of raw color utilities.

### STUDY-03: Korean Typography

**Current state** [VERIFIED: globals.css:255–269]:
```css
.hangul {
  font-family: var(--font-korean);
  line-height: 1.65;          /* ← needs to be 1.7 */
  letter-spacing: 0.01em;
  word-break: keep-all;       /* ← already present */
}

.hangul-sentence {
  font-family: var(--font-korean);
  line-height: 1.65;          /* ← needs to be 1.7 */
  letter-spacing: 0.01em;
  word-break: keep-all;       /* ← already present */
  font-size: calc(1rem * var(--reading-scale, 1));
}
```

**Audit finding F-14** [VERIFIED: audit.md]: "Minor shortfall against the W3C KLREQ standard" for `line-height: 1.65` vs recommended `1.7`. Both `.hangul` and `.hangul-sentence` need the change. This is a one-line change per class (2 total edits in globals.css).

**Card visual hierarchy** [VERIFIED: StudySession.tsx front/back rendering]:

Front face hierarchy (bare word path):
- Type badge: `text-xs font-semibold` (smallest)
- Korean word: `text-5xl font-bold` (dominant display)

Front face hierarchy (sentence path):
- Type badge: `text-xs font-semibold` (smallest)
- Sentence: `text-2xl font-medium` via `HighlightedSentence` className

Back face hierarchy:
- Type badge: `text-xs font-semibold` (smallest)
- Sentence: `text-xl text-muted-foreground` (secondary)
- Divider: `<hr className="w-full border-border">`
- Korean word: `text-3xl font-bold text-foreground` (primary on back)
- English meaning: `text-xl text-muted-foreground` (secondary)
- Translation: `text-sm text-muted italic` (caption)
- Notes: `text-sm text-muted italic` (caption)

**Assessment:** The hierarchy is already reasonable. The `p-8` padding (32px) on all card faces provides good breathing room. The `min-h-[220px]` ensures the card never collapses. The main typography fix needed is the `line-height` change only. No structural hierarchy changes are required.

**"Appropriate spacing" audit:** The sentence-on-front path shows the sentence at `text-2xl` with `gap-4` between elements. The back face uses `gap-4` between elements. This reads well. No spacing change needed beyond confirming the existing structure.

### STUDY-04: Inter-Card Transition

**Current mechanism** [VERIFIED: StudySession.tsx:422–443]:
```tsx
setQueue(nextQueue)
setCursor((c) => c + 1)   // ← triggers card advance
setRevealed(false)
setFillInput('')
setMcSelected(null)
setExampleOffset(0)
setIntervalHints(null)
```

When `cursor` increments, React re-renders the component. The card content changes instantly — there is no CSS transition on the card container element itself. The 3D flip (`.card-flip-inner` with `transition: transform 0.45s`) is the front→back reveal animation, not the inter-card advance animation.

**What exists already:**
- `animate-reveal` class (globals.css:185): `animation: fadeIn 0.15s ease forwards` — already used on grade button bar after reveal (`className="flex gap-2 w-full animate-reveal"` at line 812)
- `fadeIn` keyframe: `from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); }` — 4px upward drift during fade-in

**The fix:** Add a wrapper div around the card area (the entire `{mode === 'flashcard' ? ... : ...}` block) with `key={cursor}`. When `cursor` increments, React will unmount the old div and mount a new one, triggering the enter animation.

**Pattern:**
```tsx
<div key={cursor} className="animate-card-in w-full">
  {/* flashcard or non-flashcard card */}
</div>
```

Add `animate-card-in` to globals.css:
```css
.animate-card-in {
  animation: fadeIn 0.12s ease-out forwards;
}
```

And in the reduced-motion block:
```css
.animate-card-in { animation: none; opacity: 1; transform: none; }
```

**Why `key={cursor}` works:** React's reconciler treats a changed `key` as a different element — it unmounts the old, mounts the new. The new element gets the CSS animation from scratch. No extra state is needed. This is a well-established React pattern for element-level enter animations. [ASSUMED]

**Duration constraint:** The requirement says ≤150ms. The existing `animate-reveal` uses `0.15s` (150ms). Recommended: use `0.12s` for the card advance (slightly snappier than the grade button reveal) to keep the loop feeling responsive.

**3D flip interaction:** The `.card-flip-container` and `.card-flip-inner` are inside the keyed div. When the card advances to a new card, the flip state resets to `revealed = false` at line 439. The new card always starts face-up. No conflict with the existing flip animation.

**Caveat:** Animating the card container with `key={cursor}` means the card re-mounts each advance. The `useLayoutEffect` that measures card height (lines 266–270) runs on the freshly mounted element, which is correct. The `frontRef` and `backRef` are also fresh — no stale-closure risk.

---

## Common Pitfalls

### Pitfall 1: Animate-backdrop missing from reduced-motion block
**What goes wrong:** Audit finding F-05 notes that `.animate-backdrop` is NOT in the `@media (prefers-reduced-motion: reduce)` block. Phase 8 owns A11Y-02 (the full animation gating pass), but Phase 5 must NOT add new un-gated animations.
**Prevention:** Every new `@keyframes` utility added in Phase 5 must immediately get a reduced-motion counterpart in the same PR. Do not defer it to Phase 8.
**Warning signs:** After the change, `grep -n "animate-card-in\|@keyframes" app/globals.css` — verify the class name appears in the reduced-motion block.

### Pitfall 2: `key={cursor}` re-mounting breaks LayoutEffect height measurement
**What goes wrong:** If the `key` is on the wrong wrapper, the `frontRef`/`backRef` refs inside the flashcard flip might not re-attach before the height is measured.
**Prevention:** The `key` must be on the outer card container (the div that wraps both the flashcard and non-flashcard branches), NOT on the inner `.card-flip-container`. The `useLayoutEffect` (lines 266–270) is tied to `cursor` and `revealed`, so it re-runs correctly after mount.
**Warning signs:** Card height stays at the previous card's height; card appears cropped or has too much whitespace.

### Pitfall 3: Haptic fires before API response in submitReview
**What goes wrong:** `haptic()` at line 387 fires on the WRONG grade (too early to differentiate based on API response). But `isCorrect = rating >= 3` is computed locally from the rating parameter — no API response is needed. The change is safe.
**Prevention:** Keep `haptic()` at the same location (before the `await fetch('/api/review', ...)`). Just split it: `haptic(rating >= 3 ? 'success' : 'selection')`.

### Pitfall 4: grade buttons using hardcoded green-600 instead of tokens
**What goes wrong:** Good button uses `bg-green-600 text-white` — raw color utility. Changing to `bg-button text-button-foreground` ties it to the user's chosen action color. If the user chose a non-green button color (e.g., purple), "Good" becomes purple — which could be confusing (purple doesn't mean "correct" culturally).
**Decision:** This is a tradeoff. The "warm color differentiation" requirement suggests using the reward/action system. Two options:
1. Keep green-600 for Good (universal "correct" signal, semantically unambiguous) — easier
2. Use `--reward` (warm orange) for Good — matches the app's warm reward system but breaks the green=correct convention
**Recommendation:** Keep green for Good/Easy (universal "correct" convention), but replace the raw `green-600` with semantic treatment (could add a `--correct` token, or leave green-600 as-is since it is well-established). The "warm" requirement may refer primarily to Again/Hard having more nuanced color treatment, not replacing green. Keep it simple: the haptic change is the primary differentiator. Color adjustments are a secondary polish.

### Pitfall 5: fill-blank mode `bg-white dark:bg-gray-900` in input
**What goes wrong:** Audit finding F-13 identified the fill-blank input uses `bg-white dark:bg-gray-900` (token escape). StudySession.tsx:771.
**Note:** Phase 4 was responsible for token sweeps. This specific instance at StudySession.tsx:771 is `bg-surface-1` in intent. Phase 5 can fix it while touching the file — it is `bg-surface-1` in intent.

---

## Code Examples

### Example 1: Progress text update (STUDY-01)
```tsx
// In StudySession.tsx — replace the existing text in the progress strip
// Current (lines 557–559):
<p className="text-sm text-muted">
  {stats.reviewed} reviewed · {queue.length} left
</p>

// Replace with:
<p className="text-sm text-muted">
  Card {stats.reviewed + 1} of {initialCount}
</p>
```
[VERIFIED: derived from direct code inspection of StudySession.tsx:128,143,557–559]

### Example 2: Haptic differentiation (STUDY-02)
```tsx
// In submitReview(), line 387 — replace:
haptic('selection')
// with:
haptic(rating >= 3 ? 'success' : 'selection')
```
[VERIFIED: derived from direct inspection of StudySession.tsx:382–388 and lib/haptics.ts]

### Example 3: Korean typography fix (STUDY-03)
```css
/* In app/globals.css — change both .hangul and .hangul-sentence */
.hangul {
  font-family: var(--font-korean);
  line-height: 1.7;   /* was 1.65 */
  letter-spacing: 0.01em;
  word-break: keep-all;
}

.hangul-sentence {
  font-family: var(--font-korean);
  line-height: 1.7;   /* was 1.65 */
  letter-spacing: 0.01em;
  word-break: keep-all;
  font-size: calc(1rem * var(--reading-scale, 1));
}
```
[VERIFIED: derived from direct inspection of globals.css:255–269]

### Example 4: Inter-card transition (STUDY-04)
```css
/* Add to app/globals.css — after existing animate-reveal */
.animate-card-in {
  animation: fadeIn 0.12s ease-out forwards;
}

/* Add inside @media (prefers-reduced-motion: reduce) block */
.animate-card-in { animation: none; opacity: 1; transform: none; }
```

```tsx
/* In StudySession.tsx — wrap the card area with key={cursor} */
<div key={cursor} className="animate-card-in w-full">
  {mode === 'flashcard' ? (
    <div className="card-flip-container w-full">
      {/* ... existing flip structure ... */}
    </div>
  ) : (
    <div className="w-full bg-surface-1 rounded-2xl shadow-md p-8 min-h-[220px] flex flex-col items-center justify-center gap-4">
      {/* ... existing non-flashcard modes ... */}
    </div>
  )}
</div>
```
[ASSUMED: key={cursor} re-mount pattern for enter animations is standard React practice]

---

## Architecture Patterns

### Recommended Phase Structure

No new files needed. All changes are in-place edits to two existing files:

```
components/
└── StudySession.tsx        # STUDY-01 (progress text), STUDY-02 (haptic), STUDY-04 (key wrap)
app/
└── globals.css             # STUDY-03 (line-height), STUDY-04 (animate-card-in + reduced-motion)
```

**Opportunistic fix while in StudySession.tsx:** Fix F-13 (fill-blank input `bg-white dark:bg-gray-900` → `bg-surface-1`) since we're already touching the file. Small, zero-risk change.

### Wave Structure Recommendation

Since all changes are in the same two files, parallelization (config: `"parallelization": false`) means sequential plans:

**Wave 1 (Plan 05-01):** CSS-only changes — `globals.css` edits
- STUDY-03: Change `.hangul` and `.hangul-sentence` line-height from 1.65 → 1.7
- STUDY-04 (part 1): Add `animate-card-in` keyframe utility + reduced-motion gate to globals.css

**Wave 2 (Plan 05-02):** Component changes — `StudySession.tsx` edits
- STUDY-01: Replace progress text with "Card N of Total"
- STUDY-02: Change haptic call to differentiate correct/incorrect
- STUDY-04 (part 2): Add `key={cursor}` wrapper div + `animate-card-in` class
- Opportunistic F-13 fix: input `bg-surface-1`

Alternatively: 1 plan covering all changes (low total code volume — roughly 10 line edits). This is viable with `"granularity": "coarse"` config. The planner can use a single plan if the changes are small enough.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all changes are CSS and JSX edits to existing files; no new CLIs, databases, or runtime services required)

---

## Validation Architecture

`nyquist_validation: false` in config — Validation Architecture section omitted per instructions.

---

## Security Domain

**`security_enforcement: true`** in config. ASVS level: 1.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth changes |
| V3 Session Management | No | No session changes |
| V4 Access Control | No | No access changes |
| V5 Input Validation | No | Fill-blank input is already validated client-side (normalizeAnswer comparison); no server input |
| V6 Cryptography | No | No crypto |

No security domain issues for this phase. All changes are cosmetic CSS and event-handler logic within an already-authenticated session component.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `key={cursor}` on a wrapper div causes React to unmount/remount the element, triggering the CSS enter animation | Code Examples §4, Common Pitfalls §2 | If React batches the key change differently, the animation may not fire; fallback is `opacity` transition on the container using `cursor` in a `useEffect` to toggle a class |
| A2 | "Warm color differentiation" means primarily haptic differentiation + the existing color grouping; keeping green for Good/Easy satisfies the requirement | STUDY-02 analysis | If the requirement strictly means replacing green with `--reward` orange, the Good button color needs changing too |

---

## Open Questions

1. **"Card N of Total" wording vs current "N reviewed · M left"**
   - What we know: The requirement says "Card N of Total"; the current text is different but shows equivalent info
   - What's unclear: Should the old text be removed entirely or kept alongside the new format?
   - Recommendation: Replace the text with "Card {stats.reviewed + 1} of {initialCount}" — it is more spatially orienting ("where am I?") than the current backward-looking counter

2. **Grade button color for STUDY-02 "warm color differentiation"**
   - What we know: Again=red, Hard=neutral, Good=green, Easy=teal — current differentiation is color-only
   - What's unclear: Does "warm" mean literally warm hues (amber/orange), or just visually distinct?
   - Recommendation: Prioritize the haptic change (clearly distinct) and keep the existing green/red grouping; it is universally readable. If the user wants warmer colors, that is a quick follow-up.

---

## Sources

### Primary (HIGH confidence)
- `components/StudySession.tsx` — direct inspection of full file (886 lines)
- `app/globals.css` — direct inspection (283 lines)
- `lib/haptics.ts` — direct inspection (13 lines)
- `lib/fsrs.ts` — direct inspection (first 80 lines, covering `previewIntervalLabels`)
- `.planning/ui-reviews/audit.md` — full audit findings including F-14 (typography P2)

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — Phase 5 requirements STUDY-01 through STUDY-04
- `.planning/STATE.md` — project decisions (no new packages, animation strategy)
- `.planning/ROADMAP.md` — Phase 5 success criteria

### Tertiary (LOW confidence)
- [ASSUMED] React `key` prop re-mount as enter-animation trigger — standard practice, not verified via docs in this session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and project files
- Architecture: HIGH — verified from direct codebase inspection
- Pitfalls: HIGH — three of five pitfalls come from direct code evidence (audit F-05, F-13, F-15); two are engineering judgment
- Transition animation: MEDIUM — `key={cursor}` pattern is standard React but not verified via docs lookup this session

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable — no external dependencies)
