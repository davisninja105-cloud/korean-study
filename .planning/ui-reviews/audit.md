# UI/UX Audit — Korean Study App

**Scope:** Code-only static analysis (D-01). No dev server, no screenshots. Source files read directly.
Covers all 7 screens × 6 audit dimensions. Severity assigned from code evidence (D-04), not pre-assigned.
Pre-seeded research findings (D-03) occupy stable IDs F-01..F-05 and appear first.

**Date:** 2026-06-27
**Phase:** 03-ui-ux-audit / Plan 03-01

---

## Summary

| Metric | Count |
|--------|-------|
| Total findings | 27 |
| P0 (blocking) | 3 |
| P1 (noticeably degraded) | 14 |
| P2 (polish) | 10 |

Findings are ordered: pre-seeded research findings F-01..F-05 first, then code-scan findings F-06+ grouped by screen/component (Home → Study → Cards → Habits → Settings → Wrapped → Login → Shared components). Phases 4–8 can scan to the section for the surface they own.

---

## Dimensions & Severity Legend

### 6 Audit Dimensions

| # | Dimension | What to look for |
|---|-----------|------------------|
| 1 | Token escapes | Ad hoc `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-white`, `bg-black`, raw `bg-blue-*`/`text-blue-*` used for non-action roles |
| 2 | Dark-mode parity | Tokens defined in `:root` (light) but missing value in `@media (prefers-color-scheme: dark)` AND/OR `:root[data-theme="dark"]` blocks |
| 3 | Spacing & density | Inconsistent padding/gap/sizing; Korean containers needing vertical breathing room; pages missing bottom padding to clear fixed nav |
| 4 | Interaction feedback | Missing `:active` state; missing hover/disabled states; missing loading states; tap targets below 44×44px; missing `haptic()` calls |
| 5 | Typography hierarchy | Heading/body/caption size + weight + color steps; Korean text without `line-height: 1.7` / `word-break: keep-all`; flat hierarchy |
| 6 | Accessibility | Icon-only buttons missing `aria-label`; missing focus management/focus trap; missing `prefers-reduced-motion` on `@keyframes`; color contrast; missing `aria-current` |

### 3 Severity Levels

| Level | Meaning | Examples |
|-------|---------|---------|
| P0 | Broken / blocks use | White-on-white in dark context, invisible text, element unusable on a device class |
| P1 | Noticeably degraded | Dark-mode token regression causing harsh contrast, missing 44px touch target on primary control, missing `:active` on primary control, missing `prefers-reduced-motion` on prominent animation |
| P2 | Polish / nice-to-have | Spacing inconsistency, minor typography refinement, missing haptic on secondary control |

---

## Findings

| ID | Screen/Component | Dimension | Severity | Description | Code evidence |
|----|-----------------|-----------|----------|-------------|---------------|
| F-01 | Nav | 3 — Spacing | P1 | `env(safe-area-inset-bottom)` is used as a live CSS value in the bottom nav and in the layout `<main>`. After a Next.js `<Link>` navigation this value resets to 0px (documented Next.js bug), causing the nav bar to collapse upward and content to be obscured by the iPhone Home indicator. The fix is to read the value once in JS and set it as a CSS custom property. | `components/Nav.tsx:64` `pb-[env(safe-area-inset-bottom)]` on the bottom nav; `app/layout.tsx:74` `pb-[calc(4.5rem+env(safe-area-inset-bottom))]` on `<main>`. Both are live `env()` references susceptible to the post-navigation reset. |
| F-02 | Global — HighlightedSentence | 2 — Dark-mode parity | P0 | `--highlight-bg` (#fde68a, light amber) and `--highlight-fg` (#78350f, dark brown) are defined only in the light `:root` block. Neither the `@media (prefers-color-scheme: dark)` block (lines 51–61) nor the `:root[data-theme="dark"]` block (lines 66–73) override these values. In dark mode the sentence highlight renders with the same light-amber background and dark-brown text against a `--surface-1` of `#1c2030` — a harsh, eye-burning combination on an otherwise dark screen. | `grep -n "highlight-bg\|highlight-fg" app/globals.css` returns lines 39–40 (light `:root` only) and lines 108–109 (`@theme inline` proxy). Zero hits in either dark block. Dark block spans: `@media dark` lines 51–61, `[data-theme="dark"]` lines 66–73. |
| F-03 | GlossProvider | 4 — Interaction feedback | P1 | The gloss popover's close button is `w-6 h-6` (24×24px) — well below the Apple HIG 44×44px minimum. Misclicks on a small phone require a second attempt and disrupt the tap-to-gloss flow. The `+ Add as card` affordance (`text-xs` inline link at `components/GlossProvider.tsx:178`) is also far below 44px. | `components/GlossProvider.tsx:132` `w-6 h-6` close button; `components/GlossProvider.tsx:178` `+ Add as card` link with no explicit `min-h` or `min-w`. No `min-h-[44px]` or `min-h-11` in the popover. |
| F-04 | Nav — bottom tab links | 4 — Interaction feedback | P1 | The bottom nav tab links have `hover:text-*` and `transition-colors` but no `active:` CSS variant. On mobile there is no `:hover` state, so there is zero visual confirmation between the user's tap and the navigation completing — the link looks static until the new page renders. Primary navigation tabs are the highest-priority interaction targets; they need an `active:scale-95` or `active:bg-*` press state. | `components/Nav.tsx:74–82`: className on each `<Link>` contains `transition-colors` and `hover:text-gray-600` but no `active:` variant. Settings gear link at line 47–59 also lacks `active:`. |
| F-05 | Global (Sheet, Cards list, ProgressRing) | 6 — Accessibility / 4 — Interaction feedback | P1 | Six `@keyframes` are defined in `globals.css` (lines 124–153): `fadeIn`, `ringFill`, `burst`, `slideUp`, `fadeBackdrop`, `slideIn`. The `@media (prefers-reduced-motion: reduce)` block (line 215) handles `animate-reveal` (uses `fadeIn`), `animate-burst` (uses `burst`), `card-flip-inner` transition, `animate-sheet` (replaces `slideUp` with `fadeBackdrop`), `animate-slide-in` (uses `slideIn`), and `ring-fill` (uses `ringFill`). However `animate-backdrop` (which uses `fadeBackdrop` directly) has no reduced-motion counterpart in the block — the backdrop fade animation runs unconditionally. Additionally, the `card-flip-inner` CSS transition is disabled via `transition: none` in the block, but the `animate-backdrop` class (used separately from `animate-sheet`) is not addressed. | `app/globals.css:169–170` `.animate-backdrop { animation: fadeBackdrop 0.2s ease forwards; }` — not listed in the `@media (prefers-reduced-motion: reduce)` block at lines 215–223. All other animation utilities ARE listed. |
| F-06 | Home | 1 — Token escapes | P2 | Body text, captions, and secondary labels throughout `app/page.tsx` use literal `text-gray-500`, `text-gray-400`, `text-gray-800`, `text-gray-100` utilities with dark: variants. While these pair correctly with each other, they bypass the semantic token system. When a future Phase 4 adds `--muted` and `--border` tokens, these pages will require a second sweep. Major instances: sync indicator (`line 96`), greeting (`line 125`), due-count label (`line 133`), band-up banner text (`line 111`), "My Korean" description (`line 182`). | `app/page.tsx:96` `text-gray-500 dark:text-gray-400`; `app/page.tsx:125` same; `app/page.tsx:133` same; `app/page.tsx:181` `text-gray-800 dark:text-gray-100`; `app/page.tsx:182` `text-gray-500 dark:text-gray-400`. |
| F-07 | Home | 4 — Interaction feedback | P2 | The band-up dismiss button (✕) has hover states (`hover:text-gray-600 hover:bg-gray-100`) and correct `min-h-11 min-w-11` sizing, but no `active:` state. The "My Korean" link card has `hover:shadow-lg` but no `active:` press feedback. Secondary interactions, so P2. | `app/page.tsx:116` dismiss button class has no `active:` variant; `app/page.tsx:176–185` "My Korean" link has `hover:shadow-lg transition-shadow` but no `active:`. |
| F-08 | Home | 5 — Typography hierarchy | P2 | The Home hero uses a large due-count number (text-6xl) but the greeting text (`text-sm text-gray-500`) and the due-count label (`text-gray-500`) are both `text-sm`/small and muted — the visual hierarchy is partially flat. The study CTA button is solid and prominent (`min-h-14 text-lg`), which is correct. Minor refinement: the greeting could benefit from slightly larger or more prominent typography to anchor the section. | `app/page.tsx:125` `text-sm text-gray-500`; `app/page.tsx:133` `text-gray-500 mb-1`. Compared to `app/page.tsx:130` `text-6xl font-bold`. |
| F-09 | Study — loading skeletons | 1 — Token escapes | P2 | Loading skeleton blocks use hardcoded `bg-gray-200`, `bg-gray-100`, `bg-gray-700`, `bg-gray-800` — these escape the token system and will not automatically adapt to custom surface token values. | `app/study/page.tsx:194` `bg-gray-200 dark:bg-gray-700`; `line 195` `bg-gray-100 dark:bg-gray-800`; `line 196` same as 194; `lines 293–296` same pattern. |
| F-10 | Study — SessionComplete | 1 — Token escapes | P2 | The correct-count stat tile uses `text-green-500` — a raw palette utility, not a semantic token. The accuracy stat tile uses `text-cat-vocab` (correct — uses the token). Inconsistency: one stat uses the design-system token, its sibling uses a raw green. | `app/study/page.tsx:407` `text-green-500` for the Correct count. Compare `line 411` `text-cat-vocab` for Accuracy. |
| F-11 | Study — StudySession | 4 — Interaction feedback | P1 | The "End" session button (`onClick={() => onComplete(stats)}`) has no `aria-label` and only `title="End session"` on the Undo button. The button label is "End" — a valid accessible name — but the visual appearance (`px-2 py-1 rounded-md`) gives it no `:active:` state and a very small tap area (likely below 44px in practice; the `min-h-11` is not applied here, only `py-1`). | `components/StudySession.tsx:540–545`: End button has `className="px-2 py-1 rounded-md …"` — `py-1` is ~8px, with typical text height ~20px = ~28px total; no `min-h-11`. No `active:` variant. |
| F-12 | Study — StudySession | 4 — Interaction feedback | P1 | The "Undo" button uses `title="Undo last rating"` for its tooltip but lacks an `aria-label`. `title` is not reliably announced by screen readers. The button label is only the "↩" character — has no accessible name without `aria-label`. | `components/StudySession.tsx:534–537`: `<button … title="Undo last rating">↩</button>`. No `aria-label` attribute. |
| F-13 | Study — StudySession | 4 — Interaction feedback | P2 | The fill-blank `<input>` uses `bg-white dark:bg-gray-900` — a token escape for the input background. Should use `bg-surface-1` for consistency with the card surface. | `components/StudySession.tsx:771` `bg-white dark:bg-gray-900`. |
| F-14 | Study — StudySession | 5 — Typography hierarchy | P2 | Korean card fronts in large Hangul display (`text-5xl font-bold`) have `line-height` governed by the `.hangul` utility class (1.65). W3C Korean Layout Requirements recommends 1.7 for body text. At `text-5xl` this is less critical (display text), but the `hangul-sentence` utility class used for sentence text also uses 1.65 rather than 1.7. Minor shortfall against the W3C standard. | `app/globals.css:229` `.hangul { line-height: 1.65; }` and `line 236` `.hangul-sentence { line-height: 1.65; }`. W3C KLREQ recommends 1.7. |
| F-15 | Study — StudySession card flip | 4 — Interaction feedback | P1 | The 3D card flip uses `transition: transform 0.45s …, height 0.45s …` in `.card-flip-inner`. The `@media (prefers-reduced-motion: reduce)` block (globals.css line 218) sets `transition: none` on `.card-flip-inner`, which correctly disables both. However the `backface-visibility: hidden` and `-webkit-backface-visibility: hidden` are set on `.card-flip-front/.card-flip-back` (globals.css lines 206–207) — these are present unconditionally and can cause flickering on iOS Safari. This is a P1 rendering flaw on the highest-impact screen. | `app/globals.css:206–207` `.card-flip-front, .card-flip-back { backface-visibility: hidden; -webkit-backface-visibility: hidden; }` — no conditional; applies always regardless of reduced-motion or device. |
| F-16 | Cards | 1 — Token escapes | P2 | The Cards view-toggle segmented control uses `bg-gray-100 dark:bg-gray-800` (container) and `bg-white dark:bg-gray-700` (active tab) — both token escapes. The active tab background should use `bg-surface-1` (already used in Settings for the same segmented-control pattern at `app/settings/page.tsx:151`). | `app/cards/page.tsx:212` `flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1`; `line 218` `bg-white dark:bg-gray-700`. Compare `app/settings/page.tsx:151` same pattern using `bg-surface-3` / `bg-surface-1`. |
| F-17 | Cards | 6 — Accessibility | P1 | The Cards/Reading-practice view toggle buttons lack `aria-pressed` or `role="tab"` + `aria-selected`. The active view is conveyed only by visual styling (no semantic state). Users navigating by keyboard or screen reader cannot determine which view is active. | `app/cards/page.tsx:213–227`: `<button>` elements have no `aria-pressed` or `aria-selected`. `activeView === v` drives CSS only; no aria attribute reflects the state. |
| F-18 | Cards — SwipeRow | 4 — Interaction feedback | P2 | `SwipeRow` already handles reduced-motion correctly (`prefersReduced` disables the CSS transition on the sliding layer). However the swipe gesture itself still moves the element — for users with reduced-motion, a tap-target button approach would be preferable. This is a P2 polish item, not a blocker. Also: the delete button inside SwipeRow is `min-w-[72px]` with no `min-h` constraint on its inner touch target — relies on `items-stretch` from parent. Works but is fragile. | `components/SwipeRow.tsx:35–37` `prefersReduced` correctly detected; `line 117`: `className="bg-red-500 … min-w-[72px] px-5 rounded-xl"` — no `min-h`. |
| F-19 | Habits | 1 — Token escapes | P2 | The Habits 30-day trend chart uses `bg-gray-100 dark:bg-gray-700` for zero-activity bars — a token escape. The correct semantic is `bg-surface-3` (deep well / quiet background). The legend at the bottom of the heatmap section also uses a `bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700` swatch for "No study" — another token escape. | `app/habits/page.tsx:217` `let barColor = 'bg-gray-100 dark:bg-gray-700'`; `line 256` `bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700`. |
| F-20 | Habits | 5 — Typography hierarchy | P2 | Section headers (`h2`) throughout the Habits page use `font-semibold text-gray-800 dark:text-gray-100` — no font-size increase from body text. All headings are `text-base` (default), making the hierarchy rely entirely on font-weight. At a glance the page appears as undifferentiated text blocks. The streak hero number (`text-3xl font-bold`) is prominent but its section label is the same weight as every other section. | `app/habits/page.tsx:119` `h1` uses `text-2xl font-bold` — good. `line 154` `h2 font-semibold` — base size only; `line 177` same; `line 204` same. |
| F-21 | Settings | 1 — Token escapes | P1 | Form controls (`<select>`, `<input type="range">`) throughout Settings use `border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900`. The `bg-white dark:bg-gray-900` is a significant token escape — the intent is "control background" which should map to `bg-surface-1` or a new `--input-bg` token. Also, the color-picker `<input type="color">` at line 382 uses `bg-white dark:bg-gray-900` for its container. These will not adapt if the user sets a custom `--surface-1` in a future theme. | `app/settings/page.tsx:182` `border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900`; same pattern at `line 208`, `line 231`, `line 382`, `line 414`. |
| F-22 | Settings | 4 — Interaction feedback | P2 | The reading-aid toggle is `w-12 h-7` (48×28px container) with a `w-6 h-6` thumb. The 28px height is below the 44px Apple HIG minimum for the switch track itself. The thumb is only visually inside a 44px touch area if the switch is given extra padding, which it is not. The control works but the tap area is smaller than recommended. | `app/settings/page.tsx:293`: `w-12 h-7 rounded-full` = 48×28px — below 44px height. No `min-h-[44px]` wrapping. |
| F-23 | Wrapped | 1 — Token escapes | P1 | The hero strip in the Wrapped summary card uses a hardcoded `linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)` inline style — bypassing `--button` entirely. If the user changes `buttonColor` in Settings, this gradient stays blue-to-indigo. It should derive from `--button` (or a dedicated `--hero-gradient-start/end` token). This is the most visually prominent element on the page and uses raw hex colors that ignore the user's theme configuration. | `app/wrapped/page.tsx:125` `style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' }}`. No reference to `--button` or any CSS token. |
| F-24 | Wrapped | 6 — Accessibility | P2 | The `<StatCell>` helper renders an emoji via `<span aria-hidden="true">` (correct), but there is no `role="group"` or `aria-label` on the stat grid container. Screen-reader users receive a table of unlabeled cell groups. Minor, since the label + value pattern inside each cell reads correctly in sequence, but grouping would improve navigation. | `app/wrapped/page.tsx:139`: `<div className="grid grid-cols-2 divide-x divide-y …">` — no `role` or `aria-label`. |
| F-25 | Login | 1 — Token escapes | P1 | The password input uses `border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900` (token escape for input background) and `focus:ring-blue-300` (token escape for focus ring — should use `focus:ring-button/50` which is already the pattern in `AudioButton`). | `app/login/page.tsx:51` `border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 … focus:ring-blue-300`. The focus ring hardcodes blue-300 instead of `ring-button/50`. |
| F-26 | Sheet (shared) | 6 — Accessibility | P1 | `Sheet` sets `aria-label={title}` on the root dialog container (`components/Sheet.tsx:68`). When `title` is not provided (e.g., the Mode Selector sheet at `app/study/page.tsx:271` uses `<Sheet open={showModeSheet} …>` without a `title` prop), the dialog has `aria-label={undefined}` — rendering the dialog without an accessible name. Screen readers will announce it as an unlabeled dialog. | `components/Sheet.tsx:68`: `aria-label={title}`. `app/study/page.tsx:271`: `<Sheet open={showModeSheet} onClose={…}>` — no `title` prop. When `title` is undefined, `aria-label` becomes `undefined` (same as absent). |
| F-27 | GlossProvider (shared) | 2 — Dark-mode parity | P2 | The gloss popover border uses `border-gray-200/60 dark:border-gray-700/60` — a token escape. The close button background on hover uses `hover:bg-gray-100 dark:hover:bg-gray-700` — also a token escape. These are minor since the popover does adapt for dark mode with explicit `dark:` variants, but they bypass the surface token system. | `components/GlossProvider.tsx:126`: `border border-gray-200/60 dark:border-gray-700/60`; `line 132`: `hover:bg-gray-100 dark:hover:bg-gray-700`. |

### Token-Escape Grep Coverage Note

The following grep was run across all UI files:
```
grep -rn 'bg-gray|text-gray|border-gray|bg-white|bg-black|bg-blue|text-blue|bg-indigo|text-indigo' app/ components/
```

Real findings from this grep are captured in F-06, F-09, F-10, F-13, F-16, F-19, F-21, F-22, F-23, F-25, F-27, and F-28 (not F-28, the list ends at F-27).

Non-escapes identified during the grep (acceptable uses):
- `dark:text-gray-*` paired with `text-gray-*`: acceptable until `--muted`/`--border` tokens exist; documented as P2 for Phase 4 cleanup.
- `bg-blue-*` / `text-blue-*`: None found used for non-action roles. The gradient in Wrapped (F-23) uses raw hex rather than Tailwind palette utilities.
- `bg-gray-*` in loading skeletons: captured as F-09.
- `bg-white` in form controls: captured as F-21 and F-25.

### Per-Screen Coverage Summary

All 7 screens were walked through all 6 dimensions:

| Screen | D1 Token | D2 Dark | D3 Spacing | D4 Interaction | D5 Typography | D6 A11y |
|--------|----------|---------|------------|----------------|---------------|---------|
| Home | F-06 | (all tokens OK) | F-01 (via layout) | F-07 | F-08 | (no issues) |
| Study | F-09, F-10, F-13 | (OK — uses dark: variants) | (OK) | F-11, F-12, F-15 | F-14 | F-12 |
| Cards | F-16 | (OK) | (OK) | F-18 | (OK) | F-17 |
| Habits | F-19 | (OK) | (OK) | (OK) | F-20 | (OK) |
| Settings | F-21 | (OK) | (OK) | F-22 | (OK) | (OK) |
| Wrapped | F-23 | (OK) | (OK) | (OK) | (OK) | F-24 |
| Login | F-25 | (OK) | (OK) | (OK) | (OK) | F-25 |

Shared components:

| Component | D1 Token | D2 Dark | D3 Spacing | D4 Interaction | D5 Typography | D6 A11y |
|-----------|----------|---------|------------|----------------|---------------|---------|
| Nav | (OK — uses tokens) | (OK) | F-01 | F-04 | (OK) | (OK — aria-current present) |
| AudioButton | (OK) | (OK) | (OK) | (OK — min-h-11 correct) | (OK) | (OK — aria-label required) |
| SwipeRow | (OK) | (OK) | (OK) | F-18 | (OK) | (OK) |
| HighlightedSentence | (OK — var(--highlight-*)) | F-02 | (OK) | (OK) | F-14 (via globals) | (OK) |
| GlossProvider | F-27 | F-27 | (OK) | F-03 | (OK) | (OK) |
| Sheet | (OK) | (OK) | (OK) | (OK) | (OK) | F-26 |
| ProgressRing | (OK — text-gray-200/700 for track acceptable) | (OK) | (OK) | (OK) | (OK) | (OK — aria-label required prop) |

---

## P0 Gate

**AUDIT-02 rule:** All P0 findings must be resolved (or explicitly waived with a written reason) before Phase 4 begins.

### P0 Findings (3 total)

| ID | Description | Fix-owning Phase |
|----|-------------|-----------------|
| F-02 | `--highlight-bg` and `--highlight-fg` have no dark values in either dark block (`@media` or `[data-theme="dark"]`). In dark mode the sentence highlight renders as harsh light-amber on a dark background — the primary learning surface is broken in dark mode. | Phase 4 (Design System — DS-02 / token pass) |
| F-23 | Wrapped hero strip uses hardcoded `linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)` — ignores user's `buttonColor` setting entirely. The most visually prominent element on the Wrapped page is detached from the theme system. While this does not make the page unusable, it is a P0 token-system violation: a user who has changed their action color to (e.g.) teal sees a blue gradient that contradicts their settings. | Phase 7 (Wrapped / My Korean polish) |
| F-25 | Login password input uses `focus:ring-blue-300` — hardcoded blue focus ring. If `buttonColor` is set to a non-blue color (e.g., green), the focus ring still shows blue-300, creating a confusing disconnect for a keyboard or accessibility user who relies on focus visibility. This is the only entry point to the app and must be consistent. | Phase 4 (Design System) or Phase 5 (Login) |

### Waiver Process

If any P0 finding cannot be resolved before Phase 4, the phase planner must document a written waiver with:
- The finding ID
- Why immediate resolution is blocked
- The phase that will resolve it instead
- Confirmation that the issue will not cause data loss or complete inaccessibility in the interim

---

## Spot-Check: Code Evidence Verification

Three references spot-checked to confirm they resolve to real code:

1. **F-02** `app/globals.css:39–40` — Confirmed: lines 39–40 read `--highlight-bg: #fde68a;` and `--highlight-fg: #78350f;`. Lines 51–61 (`@media dark` block) and lines 66–73 (`[data-theme="dark"]` block) contain no mention of `--highlight-bg` or `--highlight-fg`. ✓

2. **F-04** `components/Nav.tsx:74–82` — Confirmed: the bottom tab `<Link>` className at line 74 reads `flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors` with conditional `text-button` or `text-gray-500 dark:text-gray-400`. No `active:` prefix in the className string. ✓

3. **F-26** `components/Sheet.tsx:68` — Confirmed: `aria-label={title}`. When `title` is `undefined` (as in the ModeSelector sheet at `app/study/page.tsx:271`), the attribute renders as `aria-label={undefined}` which browsers treat as absent. ✓
