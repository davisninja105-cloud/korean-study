# Stack Research: UI/UX Polish

**Project:** Korean Study — v1.1 UI/UX Polish
**Researched:** 2026-06-26
**Confidence:** MEDIUM (Tailwind v4 docs via Context7) / LOW (ecosystem comparisons via web search)

---

## Current Stack Assessment

### What Already Exists and Is Already Good

The existing stack is well-suited for polish work and requires no new libraries for the majority of improvements:

- **Tailwind CSS v4.2.2** — already configured with `@theme inline` in `globals.css`. Custom `@keyframes` are first-class here (`ringFill` for ProgressRing already demonstrates the pattern). Transition utilities (`transition-colors`, `transition-transform`, `duration-*`, `ease-*`) are available and zero-cost.
- **Semantic token system** — `--surface-1/2/3`, `--reward`, `--reward-soft`, `--highlight-bg/fg`, `--cat-*`, `--button`, `--button-foreground` are already defined and wired to Tailwind utilities. Polish work should use and extend these, never introduce raw color classes.
- **canvas-confetti 1.9.4** — already in the project for milestone and band-up celebrations. Correct tool, already integrated.
- **`navigator.vibrate` haptics** — `lib/haptics.ts` already wraps haptic feedback with a no-op-safe API. The existing `haptic('selection'|'success'|'impact-light'|'impact-heavy')` calls in `StudySession.tsx`, `Nav.tsx`, and `HabitTracker.tsx` are the right pattern.
- **Dark mode** — pre-paint inline script + `data-theme` attribute is a correct, flash-free implementation. `@custom-variant dark` rebinding in `globals.css` works cleanly.
- **Pretendard Variable font** — already self-hosted as WOFF2 in `public/fonts/`, referenced via `--font-korean` CSS variable. This is the correct setup for Korean typography.
- **`motion-safe:` / `motion-reduce:` variants** — available in Tailwind v4 for `prefers-reduced-motion` gating. The existing `globals.css` already has a `prefers-reduced-motion` block for `.ring-fill`. The pattern is established.

### Gaps (Visual Polish Deficits — No Library Needed)

These are CSS/token gaps, not library gaps:

1. **Missing enter animations** — Cards, sheets, and toasts have no fade-in/slide-up on mount. Fixable with `@keyframes` in `globals.css` + `animate-*` utilities.
2. **Inconsistent spacing rhythm** — `--surface-*` and component spacing are not systematically applied across all pages. Audit-driven cleanup in JSX only.
3. **Button/interactive states** — Active press states (scale-down, opacity) are missing on some tappable elements. Fixable with `active:scale-95 active:opacity-80 transition-transform duration-100`.
4. **Typography hierarchy** — Weight contrast and size steps are inconsistently applied. Pretendard Variable supports `font-weight: 100–900` continuously; using it intentionally (e.g. `font-semibold` for headings, `font-normal` for body) sharpens perceived quality.
5. **Card flip 3D** — `StudySession.tsx` already implements the 3D flip with `useLayoutEffect` height measurement. No library needed.

---

## Recommended Additions

**Verdict: No new npm packages required for this milestone.**

| Technique / Pattern | Where It Lives | Purpose | Why |
|--------------------|---------------|---------|-----|
| Custom `@keyframes` in `globals.css` | `app/globals.css` @theme block | Enter animations (fade-in, slide-up-sm) for cards, sheets, toasts | Zero bundle cost; follows existing `ringFill` pattern; defined once, referenced everywhere as `animate-fade-in`, `animate-slide-up` |
| `transition-transform duration-150 ease-out active:scale-95` | JSX class strings | Press feedback on buttons and tappable rows | Native CSS; works on mobile touch; no library |
| `transition-colors duration-200` on interactive token surfaces | JSX class strings | Smooth theme-color changes, hover states | Already partially used; needs systematic application |
| `motion-safe:animate-*` wrapping | Any new `@keyframes` usage | Respects `prefers-reduced-motion` | Matches existing `globals.css` reduced-motion block |
| `font-feature-settings: "ss02"` on Pretendard | `globals.css` or `layout.tsx` `localFont` declarations | Korean-optimized glyph set (stylistic set 2) | Pretendard's ss02 improves Korean numeral and punctuation rendering; zero cost |
| CSS `view-transition-name` + `experimental.viewTransition: true` in `next.config.ts` | `next.config.ts` + CSS | Smooth page-to-page navigation crossfade | Next.js 16 + React 19.2 ship native View Transitions API support; zero JS; opt-in flag; graceful fallback on unsupported browsers |

### On View Transitions (Optional, Low Risk)

Next.js 16 has an `experimental.viewTransition` flag that enables native CSS View Transitions API for route changes. React 19.2 ships `startViewTransition` as a built-in hook. This adds zero JS bundle cost — it is CSS-driven. The main cost is testing the fallback on Safari/Firefox. **Recommend including if the audit flags page navigation as feeling abrupt, otherwise defer.**

---

## What NOT to Add

| Library | Why Not |
|---------|---------|
| **Framer Motion / Motion v12** | 34kb min+gzip irreducible floor (full); even the LazyMotion path adds 4.6kb + 15kb deferred. For this scope (fade, slide, scale, press feedback), every effect is achievable in CSS with Tailwind v4 @theme @keyframes at zero bundle cost. Add only if a phase requires gesture-driven drag or layout animations not achievable in CSS — not needed for v1.1 polish. |
| **react-spring** | Physics-based spring animations. 18kb gzipped. Appealing for "warm" feel but overkill — the warmth goal is achieved through color, spacing, typography, and micro-interactions, not spring physics. Nothing in the audit scope needs spring dynamics. |
| **@formkit/auto-animate** | Useful for list enter/exit animations via a single hook. 2.6kb gzipped. Tempting for the Cards page list, but the SwipeRow component already owns that layer and integrates with pointer-event state. Auto-animate would conflict. Not worth it. |
| **GSAP** | Commercial license concerns; heavy; overkill for UI polish of a personal app. |
| **Radix UI / shadcn/ui** | The project has custom Sheet, SwipeRow, and other primitives that already work and match the design language. Migrating to Radix would be a rewrite, not polish. |
| **Tailwind CSS Plugins (typography, forms)** | `@tailwindcss/typography` is for prose rendering (markdown/HTML content). This app renders structured UI, not arbitrary HTML content. Not applicable. |
| **Lottie** | Heavy animation JSON; no existing assets; not needed for this aesthetic. |
| **next/font Google** | Pretendard is already self-hosted correctly. Adding a Google Font dependency would remove the WOFF2 self-hosting privacy/performance advantage. Extend `next/font/local` declarations instead. |

---

## Integration Notes

### Tailwind v4 Token System

All new animations and transitions must use the existing token vocabulary:

- **Colors**: Use `bg-surface-1`, `text-cat-vocab`, `bg-reward`, `bg-reward-soft`, `border-surface-2` — never `bg-gray-100` or `bg-orange-400`. Polish work that introduces literal Tailwind color classes is a regression.
- **New `@keyframes`** go in `app/globals.css` inside the `@theme` block, following the `ringFill` pattern already present. Name them descriptively: `--animate-fade-in`, `--animate-slide-up-sm`, `--animate-scale-in`.
- **`motion-safe:` prefix** — wrap every new `animate-*` class with `motion-safe:animate-*` to gate on `prefers-reduced-motion: no-preference`. Matches the existing `@media (prefers-reduced-motion: reduce)` block in `globals.css`.

### Dark Mode

Any new CSS classes that have visual weight in dark mode (shadows, overlays, hover backgrounds) must mirror values in BOTH the `@media (prefers-color-scheme: dark) :root` block AND the `:root[data-theme="dark"]` block. This is a hard constraint from `CLAUDE.md`.

### Next.js App Router `'use client'` Boundary

No new animation approach requires pushing client-only code into Server Components. CSS transitions and `@keyframes` work on the server-rendered HTML. If View Transitions are added, the `startViewTransition` call goes in a client component event handler (e.g. `Nav.tsx`, which is already `'use client'`).

### Pretendard Variable Font — Recommended Enhancement

The font is already self-hosted. One targeted improvement: add `font-feature-settings: "ss02"` to the `@font-face` declaration via `next/font/local`'s `declarations` array in `layout.tsx`. This activates Pretendard's Korean-optimized glyph set for better numeral and punctuation rendering at zero cost:

```ts
// app/layout.tsx (illustrative — actual font loading may differ)
const pretendard = localFont({
  src: [{ path: '../public/fonts/PretendardVariable.woff2' }],
  display: 'swap',
  declarations: [{ prop: 'font-feature-settings', value: '"ss02"' }],
  variable: '--font-korean',
})
```

### ESLint Purity Constraints

No animation additions violate `react-hooks/purity`. CSS transitions and `@keyframes` are applied via class names in JSX — no `Date.now()` or `Math.random()` in render. If enter animations need to trigger on mount, use a CSS animation on the element directly (no JS timing needed) or use the existing `useEffect` → `setState` pattern (already established in `StudySession.tsx` for the flip height measurement).

---

## Sources

- [Tailwind CSS v4 Animation docs](https://tailwindcss.com/docs/animation) — MEDIUM confidence (Context7 curated docs)
- [Tailwind CSS v4 Transition Property docs](https://tailwindcss.com/docs/transition-property) — MEDIUM confidence (direct docs fetch)
- [Motion: Reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size) — LOW confidence (web)
- [Next.js View Transitions guide](https://nextjs.org/docs/app/guides/view-transitions) — LOW confidence (web)
- [React 19.2 View Transitions in Next.js 16](https://www.digitalapplied.com/blog/react-19-2-view-transitions-animate-navigation-nextjs-16) — LOW confidence (web)
- [Framer Motion vs React Spring 2025](https://hookedonui.com/animating-react-uis-in-2025-framer-motion-12-vs-react-spring-10/) — LOW confidence (web)
- [Best React animation libraries 2026](https://blog.logrocket.com/best-react-animation-libraries/) — LOW confidence (web)
- [Pretendard font-feature-settings Next.js](https://github.com/vercel/next.js/discussions/52456) — LOW confidence (web)
- [Next.js font optimization docs](https://nextjs.org/docs/app/getting-started/fonts) — LOW confidence (web)
