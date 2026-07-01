# Phase 4: Design System Tokens & Sweep - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the semantic token system and eliminate all ad hoc `gray-*` utility escapes. Three concrete deliverables: (1) add `--muted` and `--border` tokens to all 3 globals.css blocks; (2) fix `--highlight-bg/fg` dark-mode values (P0 finding F-02); (3) replace every `bg-gray-*`, `text-gray-*`, `border-gray-*` across all components with semantic token equivalents. Also resolves P0 finding F-25 (login focus ring hardcoded blue). After this phase, no component should drift in dark mode due to token escapes.

</domain>

<decisions>
## Implementation Decisions

### Dark-Mode Sentence Highlight (F-02 — P0)

- **D-01:** Fix `--highlight-bg` and `--highlight-fg` in dark mode using a **reversed amber pairing**: dark background (~amber-900 `#78350f`) with light text (~amber-200 `#fde68a`). This directly reverses the light-mode pairing — same colors, swapped roles. Warm, subdued, brand-consistent.
- **D-02:** Grammar-particle tint (secondary highlight in `HighlightedSentence.tsx`) should **inherit from the ambient dark treatment** rather than getting its own explicit dark value. If the particle uses opacity of `--highlight-bg`, fixing the parent token is sufficient. No separate particle dark token needed.
- **D-03:** Planner must confirm the amber-900/amber-200 pairing achieves contrast ratio ≥ 4.5:1 against `--surface-1` (`#1c2030`). If it doesn't, nudge the values toward amber-800 bg / amber-100 text until the ratio passes.

### Login Focus Ring (F-25 — P0)

- **D-04:** Fix the login password input's `focus:ring-blue-300` in Phase 4 (not Phase 5). Change to `focus:ring-button/50` — matching the pattern `AudioButton` already uses. One-line fix; resolves the P0 gate before Phase 5 begins.

### Gray Utility Sweep (DS-03)

- **D-05:** The sweep covers ALL `bg-gray-*`, `text-gray-*`, `border-gray-*` utilities across `app/` and `components/`. This includes instances in skeleton loaders (F-09), form controls (F-21), habits bar colors (F-19), gloss popover border (F-27), and the Study fill-blank input (F-13). Each is replaced with the nearest semantic token equivalent.
- **D-06:** `text-green-500` (F-10, study session correct-count stat) is explicitly out of DS-03's scope — it's not a gray utility. It will be caught by Phase 5 (Study Session Polish) if it needs attention.
- **D-07:** F-23 (Wrapped hero gradient hardcoded hex) is deferred to Phase 7 — confirmed out of Phase 4 scope.

### Claude's Discretion

- Exact `--muted` and `--border` token values (planner determines appropriate hex values for all 3 blocks; light `text-gray-500`/`border-gray-300` and dark `text-gray-400`/`border-gray-600` are the baseline analogs from the audit).
- Whether `--muted` and `--border` need foreground-only vs. background variants.
- How `bg-white dark:bg-gray-900` form controls (F-21, F-25 background) map — either to `bg-surface-1` or a new `--input-bg` token (planner decides based on what other phases need).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — DS-01, DS-02, DS-03 are this phase's three requirements; defines success criteria and out-of-scope items
- `.planning/ROADMAP.md` §Phase 4 — 4 success criteria (grep counts, dark-mode correctness, no remaining gray-*, lint clean)

### Audit Findings (primary input to this phase)
- `.planning/ui-reviews/audit.md` — Full 27-finding audit. Phase 4 owns: F-02 (P0 highlight dark), F-06, F-09, F-10 (explicitly deferred), F-13, F-16, F-19, F-21, F-25 (P0 login), F-27. Skip F-23 (Phase 7) and F-07/F-04/F-11/F-12/F-15/F-17/F-18/F-22/F-24/F-26 (later phases).

### Token System Source of Truth
- `app/globals.css` — All CSS token definitions; the 3-block rule (light `:root`, `@media (prefers-color-scheme: dark) :root`, `:root[data-theme="dark"]`) is mandatory for every new or modified token
- `lib/card-style.ts` — Card-type badge class source of truth (not touched this phase)

### Component Files with Token Escapes to Fix
- `app/login/page.tsx` — F-25: `focus:ring-blue-300` → `focus:ring-button/50`
- `app/page.tsx` — F-06: `text-gray-*` / `dark:text-gray-*` → `text-muted`
- `app/study/page.tsx` — F-09: skeleton `bg-gray-*` → `bg-surface-*` equivalents
- `app/cards/page.tsx` — F-16: segmented control `bg-gray-100/white` → `bg-surface-3/bg-surface-1`
- `app/habits/page.tsx` — F-19: bar/legend `bg-gray-*` → `bg-surface-3` / `border-border`
- `app/settings/page.tsx` — F-21: form control `bg-white dark:bg-gray-900` → `bg-surface-1`
- `components/GlossProvider.tsx` — F-27: border + hover `gray-*` → `border-border` / `bg-surface-2`
- `components/StudySession.tsx` — F-13: fill-blank `bg-white dark:bg-gray-900` → `bg-surface-1`
- `components/HighlightedSentence.tsx` — no token escape (uses `var(--highlight-*)` correctly); dark token fix is in globals.css only

### Reference for --button Pattern (for F-25 fix)
- `components/AudioButton.tsx` — already uses `focus:ring-button/50`; the login input should match this pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/globals.css` `@theme inline` block: already has `--surface-1/2/3`, `--reward`, `--highlight-bg/fg`, `--cat-*` — new `--muted` and `--border` tokens follow the same registration pattern
- `components/AudioButton.tsx`: already demonstrates the `focus:ring-button/50` pattern; use as the reference for F-25 fix
- `components/HighlightedSentence.tsx`: uses `var(--highlight-bg)` and `var(--highlight-fg)` directly via inline style — only the globals.css token values need changing, not the component

### Established Patterns
- **3-block rule**: every CSS token defined or changed must appear in `light :root`, `@media (prefers-color-scheme: dark) :root`, and `:root[data-theme="dark"]`. Validate with `grep -n "muted\|border\|highlight" app/globals.css | wc -l` — expect 3 hits per token.
- **`@theme inline` registration**: new tokens need both a `:root { --token: value; }` entry and an `@theme inline { --color-token: var(--token); }` entry for Tailwind utility generation
- **Semantic over literal**: `bg-surface-1` replaces `bg-white dark:bg-gray-900`; `bg-surface-2` replaces quiet container gray; `bg-surface-3` replaces zero-state/skeleton gray
- **Form controls pattern**: already in `app/settings/page.tsx` (segmented control uses `bg-surface-3` / `bg-surface-1`); import this pattern into other form controls

### Integration Points
- Highlight dark fix is purely in `app/globals.css` — no component changes needed
- `--muted` and `--border` tokens land in `app/globals.css`; Tailwind utilities `text-muted`, `border-border` are then available across all components
- Login fix is a 1-line change in `app/login/page.tsx:51`
- Sweep changes are all style-class substitutions; no logic or API changes

</code_context>

<specifics>
## Specific Ideas

- Dark highlight pairing: amber-900 (`#78350f`) as `--highlight-bg` in dark, amber-200 (`#fde68a`) as `--highlight-fg` in dark. Exact reversal of the light-mode pair. Planner verifies contrast ratio.
- Grammar particle tint: no separate dark-mode override. Let it inherit from the fixed `--highlight-bg` token.
- Login fix is one line: `focus:ring-blue-300` → `focus:ring-button/50` matching `AudioButton.tsx`.
- Token escape sweep: use `grep -rn 'bg-gray\|text-gray\|border-gray\|bg-white\|bg-black' app/ components/` as the discovery command; every hit is either fixed or explicitly noted as belonging to a later phase.

</specifics>

<deferred>
## Deferred Ideas

- **F-23** (Wrapped hero gradient `linear-gradient(135deg, #3b82f6 …)` ignores `--button`) — Phase 7 (Wrapped polish). Explicitly confirmed out of Phase 4 scope.
- **F-10** (`text-green-500` for study session correct-count stat) — not a `gray-*` escape; deferred to Phase 5 (Study Session Polish) if it needs addressing.
- **`--input-bg` token** — if form controls warrant a dedicated input-background token beyond `--surface-1`, that decision can be made during Phase 4 planning. Not forced here.

</deferred>

---

*Phase: 4-Design System Tokens & Sweep*
*Context gathered: 2026-06-27*
