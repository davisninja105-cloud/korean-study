# Phase 4: Design System Tokens & Sweep — Research

**Researched:** 2026-06-27
**Domain:** Tailwind v4 CSS custom properties, semantic token design, dark-mode parity
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Fix `--highlight-bg` and `--highlight-fg` in dark mode using a reversed amber pairing: dark background (~amber-900 `#78350f`) with light text (~amber-200 `#fde68a`). Exact reversal of the light-mode pairing.

**D-02:** Grammar-particle tint inherits from the ambient dark treatment — no separate particle dark token. Fixing `--highlight-bg` is sufficient.

**D-03:** Planner must confirm amber-900/amber-200 contrast ≥ 4.5:1 against `--surface-1`. (See research finding: verified 7.28:1 — passes AAA. No nudge needed.)

**D-04:** Fix `focus:ring-blue-300` on the login input to `focus:ring-button/50`. One-line fix; resolves the P0 gate before Phase 5.

**D-05:** Sweep covers ALL `bg-gray-*`, `text-gray-*`, `border-gray-*` across `app/` and `components/`.

**D-06:** `text-green-500` (F-10, study session correct-count stat) is explicitly out of scope — not a gray utility. Deferred to Phase 5.

**D-07:** F-23 (Wrapped hero gradient hardcoded hex) is deferred to Phase 7.

### Claude's Discretion

- Exact `--muted` and `--border` token hex values in all 3 globals.css blocks (UI-SPEC has provided recommended values; planner validates or overrides)
- Whether `--muted-foreground` is needed as a distinct token (UI-SPEC recommends it)
- How `bg-white dark:bg-gray-900` form controls map — `bg-surface-1` or a new `--input-bg` token

### Deferred Ideas (OUT OF SCOPE)

- F-23: `app/wrapped/page.tsx` hero gradient hardcoded hex — Phase 7
- F-10: `text-green-500` in study session correct-count — Phase 5
- `--input-bg` as a dedicated token — can be decided during Phase 4 planning but not forced
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DS-01 | `--muted` (secondary text) and `--border` (default border) semantic tokens added to `app/globals.css` with values in all three blocks: light `:root`, `@media (prefers-color-scheme: dark)`, and `:root[data-theme="dark"]` | globals.css line map and @theme inline pattern confirmed; exact values from UI-SPEC and token analogs researched |
| DS-02 | `--highlight-bg` and `--highlight-fg` gain correct dark-mode values in both dark blocks | P0 fix; amber-900/amber-200 contrast verified at 7.28:1 (AAA); component is globals.css-only change |
| DS-03 | All ad hoc `bg-gray-*`, `text-gray-*`, `border-gray-*` across all components replaced with semantic token equivalents | Full grep conducted; 22 files identified; 6 files NOT in UI-SPEC sweep table discovered with gray instances |
</phase_requirements>

---

## Summary

Phase 4 is a pure refactoring pass with zero behavior changes. It has three sequential deliverables:

**First** (DS-02): Fix the P0 dark-mode sentence highlight regression by adding `--highlight-bg` and `--highlight-fg` values to the two dark blocks in `app/globals.css`. The contrast of amber-200 (#fde68a) on amber-900 (#78350f) was independently verified at **7.28:1**, which passes WCAG AAA — the values from the CONTEXT.md locked decision are correct as-is.

**Second** (DS-01): Add `--muted`, `--muted-foreground`, and `--border` tokens to all three globals.css `:root` blocks (light, `@media dark`, `[data-theme="dark"]`) and register each in the `@theme inline` block so Tailwind utility classes (`text-muted`, `text-muted-foreground`, `border-border`) become available.

**Third** (DS-03): Replace every `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-white`, and `ring-offset-white` occurrence across all app pages and components with the semantic equivalents defined in the UI-SPEC replacement map. Research found **6 additional files** with gray instances not listed in the UI-SPEC sweep table (Nav.tsx, CardEditor.tsx, LessonRangeFilter.tsx, StatsBar.tsx, MilestoneCelebration.tsx, HabitHeatmap.tsx, SyncPanel.tsx). These must also be swept or the final grep check will fail.

**Primary recommendation:** Follow the UI-SPEC replacement map exactly, then extend the sweep to the 6 additional files discovered in this research. The final validation grep must return 0 hits.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSS token definitions | Static / globals.css | — | Token values live in one file; no server or client logic involved |
| Tailwind utility generation | Build-time / PostCSS | — | `@theme inline` drives utility class availability; build-time concern |
| Dark mode switching | Client (pre-paint script) | CSS (media query fallback) | Token values flow through CSS; the client JS only sets `data-theme` on `<html>` |
| Gray-* class replacement | Frontend components | — | Pure class-string substitution in TSX files; no API or logic changes |

---

## globals.css Structure — Exact Map

[VERIFIED: direct file read]

```
Lines 1–49:   Light :root block — contains all base token definitions
Lines 51–61:  @media (prefers-color-scheme: dark) :root block — dark overrides
Lines 63–81:  :root[data-theme="dark"] and :root[data-theme="light"] blocks
Lines 87–115: @theme inline block — Tailwind utility registration
Lines 117–253: Animation utilities, Korean typography utilities
```

**Critical layout for new tokens (DS-01):**

1. Light `:root` block (lines 17–49): Add `--muted`, `--muted-foreground`, `--border` after the existing `--cat-phrase` line
2. `@media dark` block (lines 51–61): Add overrides for all three new tokens
3. `:root[data-theme="dark"]` block (lines 66–73): Mirror the @media dark values
4. `@theme inline` block (lines 87–115): Add `--color-muted`, `--color-muted-foreground`, `--color-border` registrations after the existing `--color-cat-phrase` line

**IMPORTANT:** The `:root[data-theme="light"]` block (lines 74–81) does NOT need additions — it only overrides tokens that differ from the base `:root`. Since the new tokens' light values ARE the base values, no light-block entry is needed.

**Dark-mode rule:** CLAUDE.md states "When adding a dark value, mirror it in BOTH the `@media (prefers-color-scheme: dark)` `:root` block AND the `:root[data-theme="dark"]` block." The validator grep checks for 3 hits per token.

---

## Standard Stack

This phase adds no new packages. The full token system runs on the existing stack:

| Tool | Version | Role |
|------|---------|------|
| Tailwind CSS | 4.2.2 (in use) | Utility class generation from `@theme inline` |
| PostCSS | `@tailwindcss/postcss` 4.x | Processes Tailwind v4 |
| Next.js | 16.2.1 | Build pipeline |

No npm installs required. [ASSUMED: version numbers from CLAUDE.md project context]

---

## Package Legitimacy Audit

Not applicable — no new packages installed in this phase. [VERIFIED: CONTEXT.md, STATE.md, config.json all confirm "no new npm packages" for the milestone]

---

## Architecture Patterns

### Token Registration Pattern (Tailwind v4)

[VERIFIED: direct read of app/globals.css]

The existing pattern — confirmed from the `@theme inline` block at lines 87–115:

```css
/* Step 1: Define in :root (and both dark blocks) */
:root {
  --muted: #6b7280;
  --muted-foreground: #4b5563;
  --border: #e5e7eb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --muted: #9ca3af;
    --muted-foreground: #d1d5db;
    --border: #374151;
  }
}

:root[data-theme="dark"] {
  --muted: #9ca3af;
  --muted-foreground: #d1d5db;
  --border: #374151;
}

/* Step 2: Register in @theme inline for Tailwind utilities */
@theme inline {
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
}
```

After registration, Tailwind v4 generates: `text-muted`, `bg-muted`, `text-muted-foreground`, `border-border`, and — crucially — **opacity modifier support** via `border-border/60`, `text-muted/80` etc.

### Opacity Modifier Verification

[VERIFIED: direct codebase grep]

The codebase already uses opacity modifiers on token-based colors extensively:
- `border-reward/60` at `app/habits/page.tsx:208`
- `hover:ring-button/40` at `app/cards/page.tsx:354`
- `focus:ring-button/50` at `components/AudioButton.tsx:95` (the reference pattern for F-25)
- `focus:ring-button/50` at `components/StudySession.tsx:771`

**Conclusion:** `border-border/60` will work correctly after `--color-border: var(--border)` is registered in `@theme inline`. Tailwind v4 applies opacity modifiers to CSS variable tokens via color-mix. [ASSUMED: mechanism — verified by existing usage pattern]

### Gray Utility Replacement Pattern

[VERIFIED: direct file reads and UI-SPEC]

The canonical replacement map (from UI-SPEC — confirmed against actual code):

| Old class (light / dark) | Replacement | Verified in |
|--------------------------|-------------|-------------|
| `text-gray-500 dark:text-gray-400` | `text-muted` | page.tsx:96, 103, 125, 133, 147, 184; habits:132; etc. |
| `text-gray-400 dark:text-gray-500` | `text-muted` | page.tsx:184 |
| `text-gray-600 dark:text-gray-300` | `text-muted-foreground` | habits:180, 186, 192; settings:263, 385, 417 |
| `text-gray-700 dark:text-gray-200` | `text-muted-foreground` | cards:319; study:403; settings:269 |
| `text-gray-800 dark:text-gray-100` | `text-foreground` | page.tsx:111, 146, 181; habits:119, 129, 154, 177 |
| `text-gray-900 dark:text-gray-100` | `text-foreground` | login:41 |
| `bg-gray-100 dark:bg-gray-800` | `bg-surface-3` | cards:212; modeSelector:41 |
| `bg-gray-200 dark:bg-gray-700` | `bg-surface-3` | study:194, 196, 293, 296 |
| `bg-white dark:bg-gray-900` | `bg-surface-1` | login:51; settings:182, 208, 231, 382, 414; studySession:771 |
| `bg-white dark:bg-gray-700` | `bg-surface-1` | cards:219; modeSelector:46, 56 |
| `bg-gray-300 dark:bg-gray-600` | `bg-surface-3` | settings:294 (toggle inactive track) |
| `border-gray-200/60 dark:border-gray-700/60` | `border-border/60` | GlossProvider:126; cards:175 |
| `border-gray-200 dark:border-gray-700` | `border-border` | modeSelector:33; cardEditor:142 |
| `border-gray-300 dark:border-gray-600` | `border-border` | login:51; settings:182, 208, 231, 382, 414; studySession:771; cardEditor:96; lessonRangeFilter:15 |
| `border-gray-100 dark:border-gray-700` | `border-border` | habits:179, 185; settings:354; GlossProvider:172 |
| `hover:bg-gray-100 dark:hover:bg-gray-700` | `hover:bg-surface-3` | page.tsx:116; GlossProvider:132; cardEditor:222 |
| `hover:bg-gray-200 dark:hover:bg-gray-700` | `hover:bg-surface-3` | nav:39, 54 |

### Anti-Patterns to Avoid

- **Hardcoded `bg-white` without dark variant:** `bg-white` alone is a token escape even without a `dark:` pair. Replace with `bg-surface-1`. Example: `HabitTracker.tsx:116` uses `bg-white dark:bg-gray-800` — the dark analog is `bg-gray-800` (#1f2937) which is close but not equal to `--surface-1` (#1c2030). Replace with `bg-surface-1`.
- **`ring-offset-white dark:ring-offset-gray-800`:** Found at `HabitTracker.tsx:98`. Replace with `ring-offset-surface-1` (the token, not a literal color). Tailwind v4 with `--color-surface-1` registered generates this utility.
- **Don't touch `bg-black/40`:** The Sheet backdrop at `Sheet.tsx:73` uses `bg-black/40 backdrop-blur-sm` — this is intentionally a pure black overlay for the modal backdrop, not a token escape. Do not replace.
- **SVG `text-gray-200 dark:text-gray-700`:** `ProgressRing.tsx:50` uses this for the SVG arc track via the `stroke="currentColor"` pattern. The UI-SPEC explicitly marks this as acceptable ("track is decorative"). Do not replace.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark mode contrast checking | Manual contrast math | Use pre-verified values from UI-SPEC + this research | Amber pairing is verified at 7.28:1 via WCAG formula — no custom tooling needed |
| Opacity on CSS var tokens | Custom `color-mix()` | Tailwind v4 built-in `/N` modifier | `border-border/60` works automatically once `--color-border` is in `@theme inline` |
| Token missing from dark block | Per-component `dark:` overrides | Add token to globals.css dark blocks | Semantic tokens fix the root cause; per-component dark: variants are the symptom |

---

## Complete File Sweep Inventory

### Files in UI-SPEC Sweep Table (confirmed correct)

| File | Gray instances found | Key instances |
|------|---------------------|---------------|
| `app/login/page.tsx` | 4 | L41 text-gray-800/100, L42 text-gray-500/400, L51 border-gray-300/600 bg-white/gray-900 focus:ring-blue-300 |
| `app/page.tsx` | 12 | Multiple text-gray-* across pull-refresh, band-up, hero, link card; L116 hover:bg-gray-100/700 |
| `app/study/page.tsx` | 14 | Skeletons L194–296; session-complete text-gray-* |
| `app/cards/page.tsx` | 22 | L168–169 inputCls, L175 border-gray-200/60, L189 border-gray-200/700, L212 bg-gray-100/800, L219 bg-white/gray-700, multiple text-gray-* |
| `app/habits/page.tsx` | 20 | L110 text-gray-400, L119-279 multiple text-gray-*, L179/185 border-gray-100/700, L217 bg-gray-100/700, L256 bg-gray-100/800 border-gray-200/700 |
| `app/settings/page.tsx` | 22 | Multiple select bg-white/gray-900 border-gray-300/600, toggle bg-gray-300/600, color picker bg-white/gray-900, border-gray-100/700, palette border-gray-800/200 and border-gray-300/600 |
| `components/GlossProvider.tsx` | 6 | L126 border-gray-200/60/700/60, L132 hover:bg-gray-100/700, L138 text-gray-500/400, L145 text-gray-500/400, L153 text-gray-900/100, L158 text-gray-600/300 |
| `components/StudySession.tsx` | ~25 | L710-716 MC borders text-gray-*, L726 text-gray-500/400, L731 text-gray-500/400, L751/754/757/761/762/787/791 text-gray-*, L771 bg-white/gray-900 border-gray-300/600, L826 bg-gray-100 text-gray-500 |
| `components/ModeSelector.tsx` | 7 | L25 text-gray-800/100, L26 text-gray-500/400, L33 border-gray-200/700, L36 text-gray-500/400, L41 bg-gray-100/800, L46/56 bg-white/gray-700, L70 text-gray-600/300 |
| `components/Sheet.tsx` | 3 | L85 bg-gray-300/600 (drag handle), L87 text-gray-800/100 |
| `components/AudioButton.tsx` | 1 | L132 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 |
| `components/HabitTracker.tsx` | 3 listed | L97 bg-gray-100/800 (dot empty), L98 ring-offset-white/gray-800, L116 bg-white/gray-800 — see note below |
| `components/ProficiencyArc.tsx` | 5 | L28 bg-white (not bg-surface-1), L29 text-gray-500/400, L47 text-gray-200/700 (SVG — keep), L73 text-gray-800/100, L74 text-gray-500/400, L88 text-gray-600/300, L91 bg-gray-200/700 (progress bar track) |

**HabitTracker note:** The UI-SPEC sweep table entry says "text-gray-500 dark:text-gray-400 → text-muted" but the actual file has many more gray instances (12 total) including `bg-white dark:bg-gray-800` on L116 (the card container) and `ring-offset-white dark:ring-offset-gray-800` on L98. These are within DS-03 scope and must also be replaced.

### Files NOT in UI-SPEC Sweep Table — DISCOVERED by Research

[VERIFIED: direct grep across all app/ and components/ files]

These files contain gray instances that will cause the final validation grep to fail. The planner must add sweep tasks for them.

| File | Gray instances | Replacement |
|------|---------------|-------------|
| `components/Nav.tsx` | 6 | L23 `dark:border-gray-800` → `dark:border-border`; L25 `text-gray-800 dark:text-gray-100` → `text-foreground`; L39/54 `text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800` → `text-muted hover:bg-surface-3`; L64 `border-gray-200 dark:border-gray-800` → `border-border`; L77 `text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300` → `text-muted hover:text-muted-foreground` |
| `components/CardEditor.tsx` | 6 | L96 `inputCls`: `border-gray-300/600 bg-white/gray-900` → `border-border bg-surface-1`; L128 `text-gray-500/400` → `text-muted`; L142 `border-gray-200/700` → `border-border`; L201/202 `text-gray-500/400` → `text-muted`; L222 `text-gray-500/400 hover:bg-gray-100/700` → `text-muted hover:bg-surface-3` |
| `components/LessonRangeFilter.tsx` | 4 | L15/16 `inputCls`: `border-gray-300/600 bg-white/gray-900` → `border-border bg-surface-1`; L41/54 `text-gray-500/400` → `text-muted` |
| `components/StatsBar.tsx` | 2 | L22 `text-gray-700 dark:text-gray-200` → `text-muted-foreground`; L23 `text-gray-500 dark:text-gray-400` → `text-muted` |
| `components/MilestoneCelebration.tsx` | 3 | L52 `text-gray-900 dark:text-gray-100` → `text-foreground`; L53/59 `text-gray-500 dark:text-gray-400` → `text-muted` |
| `components/HabitHeatmap.tsx` | 1 | L47 `bg-gray-100 dark:bg-gray-700` → `bg-surface-3` |
| `components/SyncPanel.tsx` | 2 | L57 `text-gray-700 dark:text-gray-200` → `text-muted-foreground`; L58 `text-gray-400 dark:text-gray-400` → `text-muted` |
| `app/wrapped/page.tsx` | 8 | All `text-gray-*` per replacement map (text-gray-500/400 → text-muted; text-gray-800/100 → text-foreground; text-gray-600/300 → text-muted-foreground) — no structural changes |

**Intentional non-changes:**
- `components/ProgressRing.tsx:50` — `text-gray-200 dark:text-gray-700` for SVG arc track stroke — UI-SPEC explicitly marks acceptable; keep as-is
- `components/Sheet.tsx:73` — `bg-black/40` backdrop — intentional pure black for modal overlay; do not replace

---

## Common Pitfalls

### Pitfall 1: Missing Token from One Dark Block
**What goes wrong:** Token added to `@media dark` but not to `:root[data-theme="dark"]` (or vice versa). Manual theme toggle stops working; OS-system dark mode works but the toggle dark button does not.
**Why it happens:** Two separate dark blocks exist in globals.css. Many developers know about `@media (prefers-color-scheme: dark)` but miss the `[data-theme="dark"]` override.
**How to avoid:** After every globals.css edit, run: `grep -n "\-\-muted\|\-\-border\|\-\-muted-foreground\|\-\-highlight" app/globals.css | wc -l` — expect ≥ 6 definitions for each token (light + @media dark + [data-theme="dark"] + @theme inline = 4 minimum, 6 for highlight since it has 2 tokens).
**Warning signs:** Light mode looks correct; dark via OS works; dark via toggle shows the wrong colors.

### Pitfall 2: `@theme inline` Not Updated
**What goes wrong:** Token defined in `:root` blocks but not registered in `@theme inline`. Tailwind class `text-muted` generates nothing (no CSS output). The class appears in the markup but has zero visual effect.
**Why it happens:** The two-step pattern (CSS variable + @theme inline registration) is specific to Tailwind v4. Developers familiar with v3 `tailwind.config.js` miss this step.
**How to avoid:** Every new `--token` in `:root` needs a corresponding `--color-token: var(--token)` in the `@theme inline` block.
**Warning signs:** Token class appears correct in markup; browser DevTools shows the class applied but no CSS rule generated for it.

### Pitfall 3: Opacity Modifier on Token Fails (If Wrong Registration)
**What goes wrong:** `border-border/60` renders as opaque (no transparency). This happens when the token registration uses a non-color value or when the variable isn't properly registered.
**Why it happens:** Tailwind v4 generates opacity modifiers via color-mix, which requires the base color to be registered under `--color-*` in `@theme inline`.
**How to avoid:** Register as `--color-border: var(--border)` (not `--border-color: var(--border)`). The existing surface token pattern confirms: `--color-surface-1: var(--surface-1)` at line 98.
**Warning signs:** `border-border` works (solid); `border-border/60` does not apply opacity.

### Pitfall 4: HabitTracker ring-offset Color
**What goes wrong:** `ring-offset-white dark:ring-offset-gray-800` on the week-strip dot (line 98). After the sweep, `ring-offset-white` remains (not caught by a simple `bg-gray-*` grep). The dot ring will show white offset in dark mode.
**Why it happens:** `ring-offset-white` doesn't match the grep pattern `bg-gray-\|text-gray-\|border-gray-`. It is a non-gray-* escape but still hardcodes white.
**How to avoid:** Replace with `ring-offset-surface-1`. The `--color-surface-1` token is already registered, so Tailwind generates `ring-offset-surface-1`.
**Warning signs:** Week-strip dot today-marker has white halo in dark mode.

### Pitfall 5: `inputCls` String Constant Missed
**What goes wrong:** `app/cards/page.tsx` and `components/CardEditor.tsx` and `components/LessonRangeFilter.tsx` each define an `inputCls` string constant that concatenates class strings. A simple line-by-line replace might miss the continuation lines.
**Why it happens:** The class string is split across two or more lines, e.g. in `cards/page.tsx:168–169`:
```js
const inputCls =
  'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'
```
**How to avoid:** Search for `inputCls` across files and replace the whole string constant, not just individual lines. Same pattern in `LessonRangeFilter.tsx:15–16`.
**Warning signs:** Final grep shows 0 hits but the add-card sheet or lesson filter still shows wrong dark-mode backgrounds.

### Pitfall 6: Light Mode Visual Regression
**What goes wrong:** Token substitutions change the visual appearance in light mode even though light-mode token values should be equivalent to the gray utilities they replace.
**Why it happens:** The equivalences are only approximate. For example, `bg-gray-100` = `#f3f4f6` and `--surface-3` in light = `#f3f4f6` — these are identical. But `bg-gray-200` = `#e5e7eb` while `bg-surface-3` = `#f3f4f6` — slightly lighter. Skeleton loaders using `bg-gray-200` will look slightly different after replacing with `bg-surface-3`.
**How to avoid:** The UI-SPEC accepts this as intentional alignment to the token system. For skeleton loaders specifically, `bg-surface-3` is semantically correct (zero-state background). Document if any visual difference is noticed during testing.
**Warning signs:** Skeleton animations look slightly lighter than before the sweep.

---

## Code Examples

### Adding New Token to globals.css (DS-01)

[VERIFIED: pattern from direct read of app/globals.css lines 17–115]

```css
/* ── In light :root block (after --cat-phrase at line 45) ── */
:root {
  /* existing ... */
  --cat-phrase: #14b8a6;

  /* NEW — muted & border tokens */
  --muted: #6b7280;              /* gray-500 equivalent */
  --muted-foreground: #4b5563;   /* gray-600 equivalent */
  --border: #e5e7eb;             /* gray-200 equivalent */
}

/* ── In @media dark :root block (after --surface-3 at line 59) ── */
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0b0f1a;
    --foreground: #ededed;
    --surface-1: #1c2030;
    --surface-2: #141824;
    --surface-3: #0b0f1a;

    /* NEW */
    --muted: #9ca3af;              /* gray-400 equivalent */
    --muted-foreground: #d1d5db;   /* gray-300 equivalent */
    --border: #374151;             /* gray-700 equivalent */
  }
}

/* ── In :root[data-theme="dark"] block (after --surface-3 at line 71) ── */
:root[data-theme="dark"] {
  --background: #0b0f1a;
  --foreground: #ededed;
  --surface-1: #1c2030;
  --surface-2: #141824;
  --surface-3: #0b0f1a;
  color-scheme: dark;

  /* NEW — must mirror @media dark block exactly */
  --muted: #9ca3af;
  --muted-foreground: #d1d5db;
  --border: #374151;
}

/* ── In @theme inline block (after --color-cat-phrase at line 114) ── */
@theme inline {
  /* existing registrations... */
  --color-cat-phrase: var(--cat-phrase);

  /* NEW */
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
}
```

### Fixing Dark Highlight Token (DS-02)

[VERIFIED: confirmed current state from direct read of app/globals.css lines 38–115]

```css
/* ── Current state (light :root — do NOT change these) ── */
--highlight-bg: #fde68a;   /* amber-200 — keep */
--highlight-fg: #78350f;   /* amber-900 — keep */

/* ── Add to @media dark :root block ── */
@media (prefers-color-scheme: dark) {
  :root {
    /* existing surface tokens... */
    --highlight-bg: #78350f;   /* amber-900 — reversed */
    --highlight-fg: #fde68a;   /* amber-200 — reversed */
  }
}

/* ── Add to :root[data-theme="dark"] block ── */
:root[data-theme="dark"] {
  /* existing surface tokens... */
  --highlight-bg: #78350f;
  --highlight-fg: #fde68a;
}

/* @theme inline already has --color-highlight-bg and --color-highlight-fg — no change needed */
```

**Component impact:** `components/HighlightedSentence.tsx` reads these tokens via `var(--highlight-bg)` and `var(--highlight-fg)` in inline styles. No component changes required — only globals.css.

### F-25 Fix Pattern (Login Focus Ring)

[VERIFIED: app/login/page.tsx:51 read directly; AudioButton.tsx reference confirmed]

```tsx
// Before (app/login/page.tsx:51):
className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-2 min-h-11 text-center focus:outline-none focus:ring-2 focus:ring-blue-300"

// After:
className="border border-border bg-surface-1 text-foreground rounded-lg px-4 py-2 min-h-11 text-center focus:outline-none focus:ring-2 focus:ring-button/50"
```

Reference: `components/AudioButton.tsx:95` already uses `focus-visible:ring-button/50` — this is the established pattern.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `text-gray-500 dark:text-gray-400` paired utilities | Single `text-muted` semantic token | All secondary text updates in one globals.css change |
| `bg-white dark:bg-gray-900` per-component pairing | `bg-surface-1` — single token | Adapts automatically to dark toggle without `dark:` prefix |
| Hardcoded `focus:ring-blue-300` | `focus:ring-button/50` — follows user's action color | Focus ring respects user's chosen accent color |
| `--highlight-bg` light-only | Dark-mode reversed amber pairing | Sentence highlight no longer burns eyes in dark mode |

---

## Validation Contract

[VERIFIED: from UI-SPEC Validation Contract section]

```bash
# 1. --muted appears in all 3 blocks (expect ≥ 3 hits for definitions)
grep -n "\-\-muted:" app/globals.css | wc -l
# Expected: 6 (light :root + @media + [data-theme="dark"]: 3 tokens × 3 blocks = 9... 
# but 2 new tokens: --muted and --muted-foreground. So: 2 tokens × 3 blocks = 6 definition hits)

# 2. --border appears in all 3 blocks
grep -n "\-\-border:" app/globals.css | wc -l
# Expected: 3

# 3. highlight tokens appear in all 3 blocks (+ @theme inline = 4 locations per token)
grep -n "highlight-bg\|highlight-fg" app/globals.css | wc -l
# Expected: ≥ 8 (2 tokens × 4 locations: light :root + @media + [data-theme] + @theme inline)

# 4. No remaining gray utility escapes (0 hits)
grep -rn 'bg-gray-\|text-gray-\|border-gray-\|bg-white ' app/ components/ | grep -v ".next"
# Expected: 0 hits
# Note: bg-black/40 (Sheet backdrop) does NOT match this pattern — safe

# 5. Lint passes clean
npm run lint
# Expected: 0 errors

# 6. ring-offset-white also gone (not caught by gray-* grep)
grep -rn 'ring-offset-white\|ring-offset-gray-' app/ components/
# Expected: 0 hits
```

**Note on rule 4:** The pattern `bg-white ` (with trailing space) will catch `bg-white dark:bg-gray-900` etc. but NOT catch `bg-white/40` (intentional opacity usage). This is correct behavior. However, a standalone `bg-white` (no space before next utility) may slip through — verify by also running: `grep -rn "bg-white[^/]" app/ components/`.

---

## Open Questions

1. **Does `bg-gray-800` in HabitTracker match surface-1?**
   - What we know: HabitTracker L116 uses `bg-white dark:bg-gray-800`. gray-800 = #1f2937; --surface-1 dark = #1c2030. These differ.
   - What's unclear: Is the HabitTracker card supposed to use `--surface-1` or a different shade?
   - Recommendation: Replace with `bg-surface-1`. The card's role (elevated surface, shows shadow) maps directly to surface-1. The slight color difference (#1c2030 vs #1f2937) is within the intent of the token system.

2. **Does `ring-offset-surface-1` generate correctly in Tailwind v4?**
   - What we know: `--color-surface-1: var(--surface-1)` is in `@theme inline`. Tailwind v4 generates `ring-offset-*` utilities from `--color-*` registrations.
   - What's unclear: Whether ring-offset utilities are specifically generated (some Tailwind v4 builds scope which utilities are generated).
   - Recommendation: Use `ring-offset-surface-1` and test it; fallback is to keep `ring-offset-white dark:ring-offset-[#1c2030]` as an explicit override if the utility isn't generated.

3. **SyncPanel.tsx gray instances — Phase 4 or later?**
   - What we know: SyncPanel has 2 gray instances (text-gray-700 and text-gray-400). It is not in the UI-SPEC sweep table.
   - What's unclear: Whether the UI-SPEC intentionally excluded it or missed it.
   - Recommendation: Include in Phase 4 sweep. The final validation grep will catch it regardless, and it is a trivial 2-line change.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tailwind v4 generates `ring-offset-surface-1` from `--color-surface-1` registration | Code Examples | HabitTracker dot ring-offset won't work; fallback to explicit dark value needed |
| A2 | `bg-gray-800` (#1f2937) in HabitTracker card is intended to be `bg-surface-1` (#1c2030 dark) | Sweep Inventory | Slight color change in dark mode for the HabitTracker card — acceptable visual difference |

---

## Security Domain

`security_enforcement: true` is set in `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V2 Authentication | No | No auth changes; login page input focus-ring fix is purely cosmetic |
| V3 Session Management | No | No session logic changes |
| V4 Access Control | No | Pure CSS/class changes |
| V5 Input Validation | No | No input validation changes — the login input still validates via existing server route |
| V6 Cryptography | No | No cryptographic changes |

**Security assessment:** This phase contains zero security-sensitive changes. All edits are Tailwind class substitutions and CSS custom property definitions. No new API routes, no new data flows, no new dependencies. The login page change (F-25) only modifies the visual focus ring class — the underlying auth logic at `lib/auth.ts` and `app/api/login/route.ts` is untouched.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — phase is purely CSS/class substitutions and no build tool changes beyond existing Next.js/Tailwind stack which is confirmed working).

---

## Project Constraints (from CLAUDE.md)

| Constraint | Impact on Phase 4 |
|------------|------------------|
| **3-block rule:** every token in light `:root`, `@media dark :root`, `[data-theme="dark"]` | All 3 new tokens (`--muted`, `--muted-foreground`, `--border`) and 2 fixed tokens (`--highlight-bg`, `--highlight-fg`) must appear in all 3 blocks |
| **`@theme inline` registration:** new tokens need both CSS var definition and `@theme inline` entry | Each new token needs `--color-muted: var(--muted)` etc. in the `@theme inline` block |
| **Dark mode mirror rule:** "When adding a dark value, mirror it in BOTH the `@media` block AND the `:root[data-theme="dark"]` block" | Enforced by 3-block rule above |
| **No new npm packages** | Phase requires none |
| **ESLint clean (`react-hooks/purity`, `react-hooks/set-state-in-effect`)** | No React hooks changes; class string replacements are lint-neutral |
| **`npm run lint` must pass with 0 errors** | Validate after all changes before marking phase complete |
| **Semantic over literal** | `bg-surface-1` replaces `bg-white dark:bg-gray-900`; `text-muted` replaces `text-gray-500 dark:text-gray-400` etc. |

---

## Sources

### Primary (HIGH confidence)
- `app/globals.css` — direct read; line numbers verified for all 3 CSS blocks and `@theme inline` block
- All 22 component/page files — direct read; gray instance line numbers confirmed
- WCAG 2.1 relative luminance formula (computed via Node.js directly) — contrast ratio 7.28:1 verified

### Secondary (MEDIUM confidence)
- `.planning/phases/04-design-system-tokens-sweep/04-CONTEXT.md` — locked decisions D-01 through D-07
- `.planning/phases/04-design-system-tokens-sweep/04-UI-SPEC.md` — replacement map and token values
- `.planning/ui-reviews/audit.md` — F-02, F-25 finding descriptions and code evidence

### Tertiary (LOW confidence)
- `[ASSUMED]` items in Assumptions Log above

---

## Metadata

**Confidence breakdown:**
- globals.css token registration pattern: HIGH — read directly from file
- Contrast ratio (amber-200 on amber-900): HIGH — independently computed via WCAG formula
- Sweep file inventory (UI-SPEC files): HIGH — read every file directly, counted instances
- Additional files not in UI-SPEC: HIGH — grep confirmed 6+ additional files with gray instances
- Opacity modifier behavior (`border-border/60`): HIGH — verified by existing usage of `border-reward/60`, `ring-button/50` in codebase

**Research date:** 2026-06-27
**Valid until:** 2026-09-27 (stable — Tailwind v4 and CSS custom property behavior don't change frequently)
