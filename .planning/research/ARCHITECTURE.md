# Architecture Research: UI/UX Polish

**Project:** Korean Study — v1.1 UI/UX Polish milestone
**Researched:** 2026-06-26
**Confidence:** HIGH (analysis of existing codebase; patterns are well-established in Next.js/Tailwind ecosystem)

---

## Audit Phase Architecture

### What to Audit and How to Structure Findings

A UI/UX audit for this app has six dimensions. Treat each dimension as a separate pass, not a combined walkthrough — mixing them produces shallow findings across all six.

**Dimension 1 — Visual Consistency**
Check that the semantic token system is applied uniformly. The specific risk here: raw Tailwind color utilities (`gray-800`, `blue-500`) used directly in components rather than going through `--surface-*`, `--button`, `--reward`, etc. Scan every component for literals like `bg-gray-*`, `text-gray-*`, `bg-blue-*`, `border-gray-*`. Any literal that maps to a surface or action role is a finding.

**Dimension 2 — Dark Mode Parity**
The dual-block requirement (both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]` must define the same values) is the most commonly broken rule in this codebase. Check every `dark:` Tailwind class. Check that `--highlight-bg/fg` and `--cat-*` tokens have appropriate dark values (they currently do not appear in the dark blocks in `globals.css` — that is an existing gap). For dark mode parity, the test is: toggle to dark, visit every page, check that no element is unreadably light/dark against its background.

**Dimension 3 — Spacing and Density**
Korean text at `line-height: 1.65` and `word-break: keep-all` takes more vertical space than Latin text. Check that card interiors, sheet padding, and list items have enough breathing room. Check whether the 4-tab bottom bar overlaps content on short screens (the fixed bottom nav requires adequate `pb-` on all scrollable pages).

**Dimension 4 — Interaction Feedback**
Every tap/click should have feedback: haptic on mobile (`haptic('selection')`), visual state change (hover, active, disabled). Check: grade buttons in StudySession, the AudioButton states, SwipeRow delete reveal, Sheet drag handle response, gloss popover dismiss.

**Dimension 5 — Typography Hierarchy**
The app uses Pretendard Variable for Korean and Geist Sans for UI chrome. Check that size, weight, and color steps create readable hierarchy on every screen. The Home hero (due count, greeting, Study CTA), the flashcard front/back, and the HabitTracker card are the three most important.

**Dimension 6 — Accessibility**
Check: `aria-label` on all icon-only buttons (AudioButton already requires it), `aria-current` on nav (already present), color contrast — especially `--cat-vocab/grammar/phrase` as small badge text on surfaces (the `card-style.ts` comment already notes the raw `--cat-*` tokens fail AA as small text; the badge classes use the 700/300 steps which pass). Check Sheet focus trap and Escape key.

### How to Document Findings

Use a flat severity classification. Three levels is enough:

- **P0 — Blocking:** Breaks usability or accessibility. Dark mode rendering a white-on-white element. Missing `aria-label` on a control with no visible text. Must fix before shipping.
- **P1 — Polish:** Visually inconsistent, wrong token used, spacing wrong. Does not block use but is clearly wrong.
- **P2 — Nice-to-have:** Micro-animation, copy tweak, density preference. Fix only if time permits.

Store findings in `.planning/ui-reviews/` as a single Markdown table with columns: `ID | Screen | Dimension | Severity | Finding | Fix`.

### Tooling for the Audit

No external tooling needed. The audit is a manual walk-through with one exception: run `grep -rn 'bg-gray\|text-gray\|bg-blue\|border-gray\|bg-white\|bg-black' /Users/main/Documents/claude-test/components/ /Users/main/Documents/claude-test/app/` and read the output — this surfaces all token-escape violations efficiently and takes 30 seconds.

---

## Design System Refinement Strategy

### The Existing System's Shape

The design system has two layers:

1. **CSS custom properties** in `globals.css` (`:root`, `@media dark`, `:root[data-theme="dark"]`, `:root[data-theme="light"]`). These are the source of truth for all semantic values.
2. **`@theme inline`** block that maps those custom properties to Tailwind color utilities (`bg-surface-1`, `text-button`, etc.).

Refinement at the CSS layer propagates automatically to all Tailwind utilities. This is the safe mutation path — change the custom property value, not the utility name.

### Safe Evolution Rules

**Rule 1: Never rename an existing token.**
`--surface-1`, `--button`, `--reward`, `--highlight-bg`, `--cat-vocab` are used directly in component JSX via Tailwind utilities (`bg-surface-1`, `text-button`). Renaming a token requires a grep-and-replace across all components. Unless a rename is the only way to fix a semantic error, change the value, not the name.

**Rule 2: Add new tokens by adding a new CSS property + `@theme inline` entry.**
If the audit surfaces a gap (e.g., a "muted text" semantic that components are expressing with `text-gray-500` ad hoc), add `--muted: #6b7280` in `:root` and `--color-muted: var(--muted)` in `@theme inline`. Then do a targeted sweep to replace the ad hoc usages. This is additive — no existing code breaks.

**Rule 3: The dual-block rule is non-negotiable.**
Every new token added to `:root` (light) must also be added to both the `@media (prefers-color-scheme: dark) :root` block AND the `:root[data-theme="dark"]` block. Without the second block, the manual "Dark" toggle will not apply the dark value. The `@media` block alone is not sufficient.

**Rule 4: Derived tokens via `color-mix` are safe.**
`--button-hover`, `--button-soft`, and `--reward-soft` are derived: `color-mix(in srgb, var(--button) 85%, black)`. This pattern is safe to extend. Adding `--reward-muted: color-mix(in srgb, var(--reward) 20%, transparent)` requires no dark-mode entries because it derives from `--reward` which already has correct dark values. Use derived tokens for tints and hovers.

**Rule 5: The `--highlight-bg/fg` pair requires contrast validation.**
`#fde68a` on light backgrounds and `#78350f` as text both pass WCAG AA for normal text. If either is changed (e.g., to adapt to dark mode), re-check AA contrast. The current dark-mode token block does not define these, meaning the highlight falls back to the light value (`#fde68a`) in dark mode — this is a P1 bug (yellow on dark backgrounds can be harsh). Fix by adding appropriate dark values.

**Proposed New Tokens (based on audit dimensions)**

| Token | Purpose | Light value | Dark value |
|-------|---------|-------------|------------|
| `--muted` | Secondary text (replaces ad hoc `gray-500`) | `#6b7280` | `#9ca3af` |
| `--border` | Default border (replaces ad hoc `gray-200 dark:gray-800`) | `#e5e7eb` | `#1f2937` |
| `--highlight-bg` (dark) | Sentence marker in dark mode | (existing `#fde68a`) | `#854d0e` |
| `--highlight-fg` (dark) | Sentence marker text in dark mode | (existing `#78350f`) | `#fef3c7` |

Adding `--muted` and `--border` as explicit tokens eliminates the single largest source of ad hoc color usage in the codebase (raw `gray-*` utilities for borders and secondary text).

---

## Component Refinement Patterns

### General Rule: Constrained Scope Changes

When refining a component for polish, constrain what you touch. A component edit during a polish pass should change: class strings, token references, or spacing values. It should not change: props interfaces, exported function signatures, data flow, or event handler logic. If a polish fix requires changing the interface, that is a scope creep signal — log it as a future feature, not a P1 bug.

### Pattern 1: Token Substitution (Lowest Risk)

Replace a raw Tailwind color utility with its semantic token equivalent. No behavior change, no props change, reviewable as a diff of class strings.

Example: `text-gray-500` → `text-muted` (after adding the `--muted` token), `border-gray-200 dark:border-gray-800` → `border-border` (after adding `--border`).

Do these as a single focused commit after the token is added, not mixed with other changes.

### Pattern 2: Structural Spacing Refinement

Add or adjust `p-*`, `gap-*`, `mt-*` values. Risk: can affect dynamic height calculations. The 3D card flip in `StudySession.tsx` uses `useLayoutEffect` to measure each face's height — any change to card interior padding will be absorbed automatically by the measurement. No special handling needed.

The bottom navigation bar (`sm:hidden fixed bottom-0`) requires that all scrollable page containers have `pb-16` (or `pb-[calc(4rem+env(safe-area-inset-bottom))]` on iOS) to avoid content being hidden behind the bar. Audit each page's root container for this.

### Pattern 3: Warm Micro-Animations

The existing animation vocabulary: `fadeIn` (0.15s), `slideIn` (0.35s), `slideUp` (sheet, 0.32s spring), `ringFill` (0.8s). New animations should use the same duration range and the same `cubic-bezier(0.32, 0.72, 0, 1)` spring curve for any "pop" motion. Do not introduce a new animation library — canvas-confetti is already present for celebrations; CSS keyframes cover all other needs.

All new animations must have a `@media (prefers-reduced-motion: reduce)` counterpart in the existing block in `globals.css`.

### Pattern 4: Refining StudySession (Highest Complexity)

`StudySession.tsx` is the largest component (~600 lines). Changes here carry the highest risk. Two rules for this file:

- Any change to the card rendering JSX must manually verify the 3D flip still works: flip the card, check the height transitions, check the back face does not show through.
- The `showBareFront` gate and `chosenIdx` ranking are core study logic. Do not touch them during a pure polish pass. Polish changes here are: grade button styling, typography on card front/back, spacing inside `.card-flip-front` and `.card-flip-back`, the progress indicator at the top.

### Pattern 5: Sheet and Modal Polish

`Sheet.tsx` is used in three places: mode selector in Study, filter + CardEditor in Cards. Any change to `Sheet.tsx` affects all three. Test all three after any Sheet edit. The spring animation (`cubic-bezier(0.32, 0.72, 0, 1)`) and the `role="dialog"` + focus trap must be preserved unchanged.

### What New Components Are Needed

Based on the milestone scope, no net-new components are expected. The likely output is:

- Modified: `globals.css` (new tokens), `card-style.ts` (if badge refinements), `Nav.tsx` (spacing or active state), `HabitTracker.tsx` (visual hierarchy), `StudySession.tsx` (grade buttons, card typography).
- Possibly extracted: a `Badge` primitive if the type-badge pattern is duplicated in more places. But this is speculative — wait for the audit to confirm the need.

---

## Suggested Phase Order

### Phase 1: Audit (no code changes)

Walk every screen with the six dimensions. Produce a findings table in `.planning/ui-reviews/audit.md`. Run the grep for token escapes. Classify every finding as P0/P1/P2. Output: a prioritized list of what to fix. Duration: 1 session.

**Why first:** You cannot safely make polish changes without knowing what is broken. Making changes before auditing risks fixing low-priority items while missing P0s.

### Phase 2: Design System Tokens

Add the new tokens (`--muted`, `--border`, dark-mode values for `--highlight-bg/fg`) to `globals.css`. Update `@theme inline` entries. Zero component changes in this phase.

**Why second:** Tokens must exist before components can reference them. Adding tokens before component edits makes the component phase a clean token-substitution pass with no simultaneous token introduction.

### Phase 3: Global Token Substitution Sweep

Grep for raw color utilities and replace with semantic tokens across all components. Commit as a single "token sweep" commit so the diff is purely class string changes and reviewable in isolation.

**Why third:** After audit (what to fix) and tokens (what to fix with), this pass has both prerequisites. Doing it before component-specific polish ensures the baseline is clean.

### Phase 4: Component Polish — High Priority Screens

Study session and Home dashboard in parallel if possible (they share no component state). These are the two screens called out as top priority in the milestone.

- `StudySession.tsx`: grade button styling, card typography, spacing.
- `app/page.tsx` + `HabitTracker.tsx`: hero hierarchy, due count prominence, warm feel.

**Why fourth:** These are the core daily loop screens. Getting them right first means the app already feels better before the remaining screens are touched.

### Phase 5: Component Polish — Secondary Screens

Cards page, Habits page, Settings page, Nav, Sheet.

**Why fifth:** Lower frequency of use; lower risk since each is more isolated. Settings in particular has no study logic to protect.

### Phase 6: Accessibility and Reduced-Motion Pass

Final sweep: check all `aria-label` attributes, contrast on new tokens, reduced-motion counterparts for any new animations added in Phases 4–5. Run the dark mode toggle on every screen one more time.

**Why last:** Accessibility issues are either pre-existing (caught in Phase 1 audit) or introduced by phases 4–5. This phase catches the latter. Running it after all component changes ensures nothing was accidentally broken.

---

## Integration Watch Points

### 1. Dark Mode — The Dual-Block Trap

Every token change in `:root` requires a corresponding change in BOTH dark blocks. This is the #1 source of dark-mode regressions. The symptom: the page looks correct in "System dark" (picks up the `@media` block) but incorrect after manually toggling to "Dark" (which requires the `[data-theme="dark"]` block). These two blocks must stay in sync.

Additionally, the `@media` block currently defines only `--background`, `--foreground`, and the three `--surface-*` tokens. Tokens like `--highlight-bg/fg` have no dark variants. Any time a new token is added, check whether it needs a dark value.

### 2. `@theme inline` Coupling

When a CSS custom property is added to `:root`, it does not automatically become a Tailwind utility. It must also be added to the `@theme inline` block as `--color-<name>: var(--<name>)`. Forgetting this means components can reference the CSS variable directly (e.g., `style={{ color: 'var(--muted)' }}`) but cannot use the Tailwind utility (`text-muted`). Keep the `@theme inline` block in sync with `:root`.

### 3. StudySession's `useLayoutEffect` Height Measurement

The card flip measures the height of both faces using `useLayoutEffect` and sets an explicit height on the container so the flip animation knows the target height. Any change to interior padding or font size will change the measured height — but that is fine, because the measurement runs on every render. The risk is if a CSS change causes the measured element to be zero-height (e.g., if an absolute-positioned child's measurement race). Test the flip after any StudySession structural change.

### 4. Sheet's Body-Scroll Lock

`Sheet.tsx` locks `document.body` scroll while open. If a new component is added that also locks body scroll, they may conflict. No new Sheet-style overlay should be added during a polish pass — this milestone does not add new interaction patterns, it refines existing ones.

### 5. `typeBadgeClass` Contract

`lib/card-style.ts` is used in `app/cards/page.tsx` and `components/StudySession.tsx`. Its return value is a pure class string with no layout information (no `rounded-full`, no `px-*`). This contract must be preserved — the function returns only color classes, call sites add shape. If the badge style needs changing, change the class strings inside the function; do not add layout classes to the function's return value.

### 6. Token Names as Public API

Because `bg-surface-1`, `text-button`, `bg-reward` etc. appear across many components, these names are effectively the app's internal design API. A rename cascades through every component. The only safe path is to introduce an alias (add `--surface-elevated` alongside `--surface-1`) and migrate gradually, removing the old name only when the sweep is complete. For a polish milestone, renaming tokens is out of scope.

### 7. Bottom Nav Safe-Area Inset

The bottom tab bar uses `pb-[env(safe-area-inset-bottom)]`. Every scrollable page that renders below the bottom bar must have equivalent bottom padding or it will have content hidden on iOS. Currently this is `pb-20` or `pb-24` on most pages. If any page's layout changes, verify the last content item is not hidden by the nav bar on a phone with a home indicator.
