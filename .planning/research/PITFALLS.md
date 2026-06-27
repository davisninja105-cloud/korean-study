# Pitfalls Research: UI/UX Polish

**Domain:** Visual polish pass on existing Next.js 16 / React 19 / Tailwind CSS v4 Korean SRS app
**Researched:** 2026-06-27
**Overall confidence:** MEDIUM (cross-checked across official docs + community sources)

---

## Design Token Pitfalls

### Pitfall 1: Silently ignored CSS custom property names in Tailwind v4

**What goes wrong:** Tailwind v4's `@theme inline` enforces strict namespace rules. A misnamed token (e.g., `--colour-reward` instead of `--reward`) is silently dropped — the compiler generates no error, the utility class just doesn't apply. This is especially insidious in dark mode where you might rename a token and not notice the dark variant is now receiving its value from the wrong place.

**Why it happens:** Tailwind v4 is CSS-first; the build step has no schema validation for your `@theme` block.

**Prevention:** After any token rename, search the codebase for the old name and verify no dangling references remain. Add a visual regression check by loading both light and dark modes in the browser before committing.

**Detection:** A utility class that renders nothing (instead of an error) when applied to an element.

---

### Pitfall 2: Hardcoded color classes bypass the token system

**What goes wrong:** The existing codebase deliberately avoids `bg-orange-500` or `bg-blue-400` in favor of semantic tokens. A polish pass that adds "just a quick background tint" using a Tailwind palette color directly creates a token system exception that makes the next polish pass harder. Dark mode and configurable `buttonColor`/`rewardColor` won't apply to hardcoded classes.

**Prevention:** CLAUDE.md already bans this. Reinforce: any new color value must go through a token. If a token doesn't exist, add it to `app/globals.css` `@theme inline` first.

---

### Pitfall 3: Token rename cascade — semantic tokens reference each other via `color-mix`

**What goes wrong:** `--reward-soft` is derived via `color-mix` from `--reward`. If you rename `--reward` without updating the `color-mix` expression, `--reward-soft` silently resolves to the default (transparent or initial). The heatmap, streak dots, and partial-progress bars all disappear or turn black.

**Prevention:** When renaming a token, grep for `var(--old-name)` in `globals.css` before committing. Treat derived tokens as dependents.

---

### Pitfall 4: `@apply` in shared components breaks with `@theme inline`

**What goes wrong:** Tailwind v4 dropped `@apply` support in component libraries that inject styles via Node.js plugin APIs. Any `@apply` in a non-`globals.css` location may silently no-op.

**Prevention:** This codebase uses Tailwind utilities in JSX (not `@apply`), so risk is low. But if a polish pass adds a `.css` file with `@apply` for a shared animation class, test immediately.

---

## Dark Mode Parity Pitfalls

### Pitfall 1: The dual-block maintenance trap (CRITICAL for this app)

**What goes wrong:** This app maintains dark mode values in TWO places: the `@media (prefers-color-scheme: dark)` `:root` block AND the `:root[data-theme="dark"]` block in `globals.css`. CLAUDE.md warns: "When adding a dark value, mirror it in BOTH." A polish pass that adds a new semantic token with a light value but forgets to add dark values in both blocks will render correctly in System mode only when the OS is in light mode — the bug is invisible during development on most machines.

**Why it happens:** Engineers test in whatever mode their OS is currently in. The other mode only breaks in production.

**Prevention:** For every new token with a dark value, verify all three locations exist: the base `:root` block (light), the `@media` dark block, and the `[data-theme="dark"]` block. A simple grep: `grep -n "your-new-token" app/globals.css` should return exactly 3 hits.

**Detection:** Load the app in System mode, then toggle OS to dark mode. Then manually switch to Dark in settings. All three should look identical.

---

### Pitfall 2: `dark:` utility classes are not automatically covered

**What goes wrong:** Tailwind's `dark:` variant does not auto-invert or auto-adapt colors. Every element that needs a different appearance in dark mode needs an explicit `dark:` class. A polish pass that adds a new background to a component without adding a `dark:` equivalent creates a permanently broken dark mode for that element.

**Prevention:** For every new `bg-*`, `text-*`, `border-*`, or `shadow-*` class added during polish, ask: does this need a dark variant? If yes, add it immediately in the same commit.

---

### Pitfall 3: Third-party component specificity overrides dark variants

**What goes wrong:** `canvas-confetti`, browser defaults for `<input>`, `<select>`, and any future component library may have higher CSS specificity than `[data-theme="dark"] .dark:bg-surface-1`. The dark mode styles lose the specificity war silently.

**Prevention:** Scope theme styles at the `:root` level via CSS custom properties (the existing pattern). Avoid putting dark-mode values directly on component selectors — keep them as token values so components inherit automatically.

---

### Pitfall 4: Flash of wrong theme on first paint

**What goes wrong:** The app already has an inline pre-paint `<script>` in `layout.tsx` to set `data-theme` before first paint. If a polish pass moves this script lower in the document, or wraps it in an async component, the user sees a flash of the wrong theme.

**Prevention:** Never move or conditionally render the inline theme-detection script in `layout.tsx`. It must stay as a raw `<script>` tag, synchronous, before any CSS loads.

---

## Animation & Motion Pitfalls

### Pitfall 1: Animating `height` causes layout thrash (HIGH RISK for StudySession.tsx)

**What goes wrong:** `StudySession.tsx` uses `useLayoutEffect` to measure card face height and applies a CSS transition simultaneously on both height and rotation. Animating `height` forces the browser to recalculate layout on every frame — this is the definition of layout thrash. On low-end Android or iOS in low-power mode, this drops to ~20fps and feels janky.

**Why it happens:** Height is a layout property; `transform: rotateY()` is a composited property. Mixing them forces both the layout engine and the compositor to work every frame.

**Prevention:** Where possible, replace `height` animation with `max-height` animation (less accurate but avoids reflow) or better: use `transform: scaleY()` with `transform-origin: top`. If height must be animated, accept the performance hit but ensure `will-change: height, transform` is set on the element during animation and removed after.

**Detection:** Chrome DevTools Performance tab → "Layout" (purple) events happening on every animation frame.

---

### Pitfall 2: iOS Safari 3D flip flickering from `backface-visibility`

**What goes wrong:** The 3D card flip in `StudySession.tsx` uses `backface-visibility: hidden`. On iOS Safari this causes flickering. The fix (`-webkit-backface-visibility: hidden`) reduces flicker but is itself buggy — it can cause the scroll bar handle to disappear and historically caused crashes on older Chrome.

**Prevention:** Scope `backface-visibility: hidden` and `-webkit-backface-visibility: hidden` tightly to only the `.card-face` elements (not the parent wrapper). Test on an actual iOS device after any change to the 3D flip CSS, not just in desktop Safari DevTools mobile emulation.

**Detection:** Visible flickering during the flip transition when tested on a real iPhone.

---

### Pitfall 3: `useLayoutEffect` blocking renders during polish

**What goes wrong:** `useLayoutEffect` is synchronous and blocks the browser from painting until it completes. If a polish pass adds a measurement in `useLayoutEffect` that involves a slow DOM query or triggers a forced reflow before the measurement, the entire frame is blocked. Users see stuttering.

**Prevention:** Keep `useLayoutEffect` bodies lean — only `getBoundingClientRect()` and `setState()` calls. No loops, no fetch, no complex computation. If you add a new measurement, benchmark it in the Performance profiler.

---

### Pitfall 4: Missing `prefers-reduced-motion` on new animations

**What goes wrong:** Any new entrance animation (fade-in, slide-up, scale-up) added during the polish pass that ignores `prefers-reduced-motion: reduce` fails accessibility. Users with vestibular disorders can experience nausea from motion.

**Prevention:** Every new `@keyframes` animation or CSS `transition` must be paired with a `@media (prefers-reduced-motion: reduce)` block in `globals.css` that reduces or eliminates the motion. This already exists for `ProgressRing` — extend the same pattern.

---

### Pitfall 5: Over-animating creates perceived slowness

**What goes wrong:** Adding entrance animations to every element makes the app feel sluggish. If the grade bar, the card, the session stats, and the bottom nav all animate on mount, the user perceives the app as slow even if it is technically fast.

**Prevention:** Animate exactly one element per interaction — the element being acted upon. Everything else should be static. For this app: the card flip and the grade confirmation are the only interactions that warrant animation.

---

## Korean Text & Typography Pitfalls

### Pitfall 1: Line-height too tight for Hangul

**What goes wrong:** The default Tailwind `leading-normal` (1.5) is adequate for Latin text but feels cramped for Hangul. Korean characters have a higher visual density — lines feel packed. The W3C Korean Layout Requirements document specifies ~1.7 for body Korean text.

**Prevention:** Set `line-height: 1.7` (or `leading-[1.7]`) on elements that render Korean sentence text (`HighlightedSentence.tsx`, card fronts in Korean). Do not apply this to UI chrome — only content text.

---

### Pitfall 2: `word-break: normal` splits Hangul at syllable boundaries

**What goes wrong:** Korean words are sequences of syllable blocks. `word-break: normal` allows the browser to break at any syllable boundary when wrapping, which produces unnatural mid-word breaks that look wrong to Korean readers. Example: `공부하다` split as `공부하` / `다`.

**Prevention:** Use `word-break: keep-all` on all Korean text containers. This tells the browser to wrap only at spaces (actual word boundaries in Korean). This is already correct behavior for the sentence display — verify it's in place on all new text elements added during polish.

---

### Pitfall 3: Pretendard weight range missing on Safari

**What goes wrong:** The self-hosted Pretendard variable font requires the weight range `'45 920'` in the `next/font/local` config. If this range is omitted or incorrect, WebKit/Safari renders at the default weight instead of the requested weight — a `font-weight: 700` heading renders as regular weight on iPhone.

**Prevention:** Check `app/layout.tsx` (or wherever Pretendard is declared via `localFont`) to confirm `weight: '45 920'` is present. Do not change this value during polish.

---

### Pitfall 4: FOUT (flash of unstyled text) during polish changes

**What goes wrong:** If a polish pass changes how Pretendard is referenced — for example adding a `<link rel="preload">` in the wrong place, or switching from `display: 'swap'` to `display: 'block'` — the font loading behavior changes. `display: 'swap'` shows a fallback font until Pretendard loads (FOUT, visible flash); `display: 'block'` shows invisible text (FOIT, less jarring but delays readability). A change that accidentally switches from one to the other changes the perceived performance of every page.

**Prevention:** Leave the Pretendard font declaration untouched during polish unless specifically investigating a font loading issue. The existing `adjustFontFallback` on `next/font` already minimizes CLS.

---

### Pitfall 5: Hangul and Latin character spacing inconsistency

**What goes wrong:** Mixing Korean and English in the same text run (common in card fronts like `~(으)로 (direction particle)`) can look awkward — the spacing between Hangul and the parenthesized English gloss varies by browser. CSS `text-autospace` (CSS Text Level 4) is the correct fix but has limited support (~60% in 2026).

**Prevention:** Add a thin space (`&thinsp;` or 0.1em `letter-spacing` on the gloss span) between Hangul and the Latin parenthetical. Do not rely on `text-autospace` without a fallback.

---

## Mobile / PWA Pitfalls

### Pitfall 1: Safe area inset resets to 0px after Next.js `<Link>` navigation (CRITICAL)

**What goes wrong:** This is a documented Next.js bug: after navigating via `<Link>` from `next/link`, `env(safe-area-inset-bottom)` resets to `0px`. The bottom navigation bar (`Nav.tsx`) uses `pb-safe` or similar safe-area padding. After the first `<Link>` click, the nav bar visually shifts upward and content may be obscured by the Home indicator on iPhone.

**Why it happens:** Next.js client-side navigation triggers a viewport resize event that causes Safari to recalculate safe-area values, and a bug in the calculation resets them.

**Prevention:** Do not rely on `env(safe-area-inset-bottom)` as a live CSS value in `Nav.tsx`. Instead, read it once on mount via JavaScript and set it as a CSS custom property that doesn't reset. Alternatively, set a fixed `padding-bottom` that is conservative enough to clear the Home indicator on all devices (34px for notched iPhones, 20px for older models).

**Detection:** Open the app as a PWA on iPhone. Navigate between tabs. Check if the nav bar bottom padding changes between page loads.

---

### Pitfall 2: Pull-to-refresh conflict with custom `usePullToRefresh`

**What goes wrong:** `lib/usePullToRefresh.ts` implements a custom pull-to-refresh on the Home page. If `overscroll-behavior-y` is not set correctly, both the native iOS rubber-band overscroll AND the custom handler fire. The result is a double-trigger: the custom sync fires AND the native overscroll animation runs, creating a jumpy, confused UX.

**Prevention:** Set `overscroll-behavior-y: contain` on the scrollable container (not `body`) to suppress the native overscroll bounce without disabling scroll entirely. Verify the custom pull-to-refresh still triggers reliably after this change.

---

### Pitfall 3: Touch targets below 44x44px

**What goes wrong:** The grade bar buttons in `StudySession.tsx`, the "Add as card?" affordance in `GlossProvider.tsx`, and card-action buttons in `SwipeRow.tsx` are all at risk of being too small. On mobile with small fingers, sub-44px targets cause misclicks and user frustration — the exact opposite of the "warm, encouraging" vibe goal.

**Prevention:** During the polish audit, measure every interactive element's touch target. Use `min-h-[44px] min-w-[44px]` for all tappable elements. Visual size and touch target size can differ — use transparent padding to extend the tap area without changing visual appearance.

---

### Pitfall 4: Sheet / modal body scroll-through on iOS

**What goes wrong:** `Sheet.tsx` already implements body-scroll-lock. If a polish pass adds a new Sheet variant or inline modal without the same lock, background content scrolls behind the sheet on iOS. This is an iOS-specific bug where `overflow: hidden` on `body` is insufficient; scroll events still pass through to the background.

**Prevention:** Any new Sheet-like overlay must use the same body-scroll-lock pattern as the existing `Sheet.tsx`. Do not use `overflow: hidden` on body as the sole scroll prevention.

---

### Pitfall 5: `position: fixed` elements and the iOS virtual keyboard

**What goes wrong:** When the virtual keyboard opens on iOS, `position: fixed` elements jump to unexpected positions. The grade bar in `StudySession.tsx` and any modal with text input (like the gloss popover's "Add as card?" form) may be obscured by the keyboard or jump to an incorrect Y position.

**Prevention:** Avoid `position: fixed` for elements that appear when a text input is active. Use `position: sticky` within the scroll container instead, or test keyboard-open behavior explicitly on a real device. The `visualViewport` API can be used to reposition fixed elements in response to keyboard resize.

---

## Scope Creep Pitfalls

### Pitfall 1: The "while I'm here" expansion pattern

**What goes wrong:** You audit the study session card and find the grade bar needs more padding. While fixing padding, you notice the grade labels are inconsistent with the Habits page. While fixing labels, you realize the Habits page uses a slightly different font size. Each fix is individually reasonable but together they create a multi-week audit trail that blocks shipping.

**Prevention:** The audit phase produces a severity-classified list. Only HIGH and MEDIUM severity items get fixed in this milestone. LOW severity items go on a backlog. "While I'm here" additions must be logged as new items and assigned a severity before acting on them — not fixed immediately.

---

### Pitfall 2: Token changes requiring component-wide visual regression

**What goes wrong:** Changing a semantic token like `--surface-1` or `--reward` affects every component that uses it. This is the right design, but it means a token change that looks right on the Home page may create an unexpected visual on the Habits page or inside the Sheet. A polish pass that changes tokens without checking every usage is high-risk.

**Prevention:** After any token value change, load every page of the app in both light and dark mode before committing. The pages are: Home, Study (active session), Cards, Habits, Settings, Login, Wrapped. This is a 14-screen checklist (7 pages × 2 modes).

---

### Pitfall 3: "Polish" vs "refactor" confusion

**What goes wrong:** A polish pass stays at the surface level: spacing, color, type size, animation. A refactor changes component structure, state management, or API shape. These are different tasks with different risk profiles. Polish is low-risk; refactor can break functionality. The scope creep pattern is: polish surfaces a structural issue, the team decides to "fix it properly," and the polish phase becomes a refactor phase.

**Prevention:** If a polish audit finding requires a structural change (e.g., "the grade bar state management should be in a separate hook"), log it as a separate technical debt item for a future phase. Do not mix structural refactors into the polish phase. Treat any change that touches state management, API routes, or the Prisma schema as out of scope.

---

### Pitfall 4: Importing a motion library "just for one animation"

**What goes wrong:** Framer Motion or React Spring are powerful but add significant bundle weight (Framer Motion is ~80KB gzipped). Adding a motion library "just for the card entrance animation" often expands — once the dependency is in, it gets used everywhere, and the bundle bloat becomes permanent.

**Prevention:** Use CSS transitions and `@keyframes` for all animations in this polish pass. The existing `ringFill` keyframe pattern in `globals.css` is the right model. Only evaluate a motion library if CSS proves genuinely insufficient for a specific animation requirement. This is unlikely for the scope described.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| UI audit classification | Finding count balloons to 50+ items | Classify during audit phase, commit to fixing only HIGH/MEDIUM in this milestone |
| Study session card polish | Height animation causing layout thrash | Profile before and after; consider `max-height` or `scale` instead of `height` |
| Design token refinement | Token rename not mirrored in both dark mode blocks | Grep for the old name after every rename |
| Typography pass | `word-break` or `line-height` change breaking card layout at narrow widths | Test on 375px (iPhone SE) viewport after any typography change |
| Nav / safe area fixes | Next.js `<Link>` resetting `env(safe-area-inset-bottom)` | Use JS-set CSS variable instead of live `env()` in the nav padding |
| Any new Sheet/overlay | Missing body-scroll-lock on iOS | Copy exact pattern from existing `Sheet.tsx` |
| Grade bar button sizing | Touch targets too small | Verify 44x44px minimum on every interactive element |
| Dark mode token additions | New token added to light mode only | Three-hit grep check in `globals.css` after each token addition |

---

## Sources

- [Tailwind CSS v4 Migration Best Practices](https://www.digitalapplied.com/blog/tailwind-css-v4-2026-migration-best-practices) (MEDIUM confidence)
- [Design Tokens That Scale in 2026 — Mavik Labs](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/) (MEDIUM confidence)
- [Tailwind CSS v4 Dark Mode — Nerd Level Tech](https://nerdleveltech.com/tailwind-v4-dark-mode) (MEDIUM confidence)
- [Tailwind v4 Dark Mode CSS Variable Discussion #15083](https://github.com/tailwindlabs/tailwindcss/discussions/15083) (MEDIUM confidence)
- [Josh Collinsworth — Ten tips for better CSS transitions](https://joshcollinsworth.com/blog/great-transitions) (MEDIUM confidence)
- [CSS Animations Performance — CSS-Zone](https://css-zone.com/blog/css-animations-performance) (MEDIUM confidence)
- [backface-visibility — CSS-Tricks](https://css-tricks.com/almanac/properties/b/backface-visibility/) (MEDIUM confidence)
- [pixeldock — Fix flickering with CSS transitions on iOS](https://www.pixeldock.com/blog/how-to-avoid-the-ugly-flickering-effect-when-using-css-transitions-in-ios/) (MEDIUM confidence)
- [W3C Requirements for Hangul Text Layout](https://www.w3.org/TR/klreq/) (HIGH confidence — W3C standard)
- [CSS Text word-break for Korean — w3c/csswg-drafts #4285](https://github.com/w3c/csswg-drafts/issues/4285) (MEDIUM confidence)
- [Pretendard — orioncactus GitHub](https://github.com/orioncactus/pretendard) (HIGH confidence — official)
- [Next.js Font Loading LCP Regressions — 72Technologies](https://www.72technologies.com/blog/font-loading-nextjs-lcp-debugging) (MEDIUM confidence)
- [PWA iOS Limitations — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) (MEDIUM confidence)
- [Next.js safe-area-inset issue #81264](https://github.com/vercel/next.js/discussions/81264) (MEDIUM confidence — community verified)
- [PWA Design Tips — firt.dev](https://firt.dev/pwa-design-tips/) (MEDIUM confidence)
- [Scope Creep in Design Projects — DAR Design](https://dardesign.io/blog/scope-creep-design-projects-2026) (MEDIUM confidence)
- [FLIP Animation in React — CSS-Tricks](https://css-tricks.com/everything-you-need-to-know-about-flip-animations-in-react/) (MEDIUM confidence)
