---
phase: 04-design-system-tokens-sweep
plan: 01
subsystem: ui
tags: [tailwind, css-tokens, dark-mode, accessibility, design-system]

# Dependency graph
requires: []
provides:
  - "--muted, --muted-foreground, --border CSS tokens in all 3 globals.css blocks + @theme inline"
  - "text-muted, text-muted-foreground, border-border Tailwind utilities now available"
  - "Dark-mode sentence highlight: reversed amber pairing (#78350f bg / #fde68a fg) in both dark blocks"
  - "app/login/page.tsx: zero gray/blue escapes; F-25 P0 focus ring uses focus:ring-button/50"
affects: [04-02-PLAN, 04-03-PLAN, study-session, gloss-popover, form-controls]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-block CSS token rule: every token defined/changed in light :root, @media dark, [data-theme=dark]"
    - "@theme inline registration: --color-*: var(--*) form for opacity modifier support"
    - "focus:ring-button/50 as the canonical action-color focus ring pattern (AudioButton → login → all form controls)"

key-files:
  created: []
  modified:
    - app/globals.css
    - app/login/page.tsx

key-decisions:
  - "Dark highlight uses reversed amber pairing (D-01): amber-900 #78350f bg / amber-200 #fde68a fg — same colors, swapped roles; 7.28:1 contrast (WCAG AAA)"
  - "Grammar particle tint inherits from fixed --highlight-bg parent token; no separate dark particle token needed (D-02)"
  - "Login input focus ring: focus:ring-button/50 matching AudioButton.tsx established pattern (D-04)"
  - "--color-border: var(--border) form (not --border-color) ensures opacity modifiers like border-border/60 work via color-mix (Pitfall 3)"
  - "No :root[data-theme=light] entries needed for new tokens — light values equal base :root, no override"

patterns-established:
  - "Gray utility replacement: text-gray-{500/400} → text-muted; text-gray-{800/100} → text-foreground; border-gray-{300/600} → border-border; bg-white/bg-gray-900 → bg-surface-1"
  - "Token mirror rule: every dark value must appear in BOTH @media dark AND [data-theme=dark] blocks"

requirements-completed: [DS-01, DS-02]

coverage:
  - id: D1
    description: "--muted, --muted-foreground, --border tokens defined in light :root, @media dark, [data-theme=dark] and registered in @theme inline"
    requirement: DS-01
    verification:
      - kind: other
        ref: "grep -c '\\-\\-muted:' app/globals.css → 3; grep -c '\\-\\-border:' app/globals.css → 3; grep -c '\\-\\-color-muted:' → 1; npm run build succeeds"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dark-mode --highlight-bg: #78350f and --highlight-fg: #fde68a in both @media dark and [data-theme=dark] blocks"
    requirement: DS-02
    verification:
      - kind: other
        ref: "grep -c 'highlight-bg: #78350f' app/globals.css → 2; grep -c 'highlight-fg: #fde68a' → 2; highlight lines total ≥ 8"
        status: pass
    human_judgment: false
  - id: D3
    description: "app/login/page.tsx: zero gray-*/bg-white/focus:ring-blue- utilities; focus:ring-button/50 resolves F-25 P0"
    requirement: DS-01
    verification:
      - kind: other
        ref: "grep -c 'gray-\\|bg-white\\|focus:ring-blue-' app/login/page.tsx → 0; focus:ring-button/50 present; npm run lint clean"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-06-27
status: complete
---

# Phase 04 Plan 01: Token Foundation + Login Sweep Summary

**--muted/--border CSS token foundation and reversed-amber dark highlight fix, with login page fully swept to semantic tokens and focus:ring-button/50 (resolves P0 findings F-02 and F-25)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-27T18:02:32Z
- **Completed:** 2026-06-27T18:04:37Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `--muted` (#6b7280 light / #9ca3af dark), `--muted-foreground` (#4b5563 / #d1d5db), `--border` (#e5e7eb / #374151) to all 3 globals.css blocks + @theme inline; enables `text-muted`, `text-muted-foreground`, `border-border` Tailwind utilities for Plans 2 and 3
- Fixed P0 finding F-02: dark-mode sentence highlight now uses reversed amber pairing (#78350f bg / #fde68a fg) — 7.28:1 WCAG AAA contrast, verified in both @media dark and [data-theme=dark] blocks
- Resolved P0 finding F-25: `app/login/page.tsx` fully swept — zero `gray-*`/`bg-white`/`focus:ring-blue-*` utilities; password input uses `focus:ring-button/50` (matches AudioButton pattern), `border-border`, `bg-surface-1`, `text-foreground`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --muted, --muted-foreground, --border tokens (DS-01)** - `c344f2e` (feat)
2. **Task 2: Dark highlight reversed-amber pairing (DS-02, F-02 P0)** - `f58d343` (fix)
3. **Task 3: Sweep app/login/page.tsx — F-25 P0 + gray escapes** - `daa9538` (fix)

## Files Created/Modified

- `app/globals.css` — Added 3 new tokens (muted, muted-foreground, border) in all 3 CSS blocks + @theme inline registrations; added dark highlight token values in @media dark and [data-theme=dark]
- `app/login/page.tsx` — Replaced all gray/blue utility classes with semantic tokens; fixed F-25 focus ring

## Decisions Made

- Dark highlight uses reversed amber pairing (D-01 locked): amber-900 `#78350f` as `--highlight-bg` and amber-200 `#fde68a` as `--highlight-fg` in dark — same colors as light, roles swapped. Contrast ~7.28:1 (WCAG AAA). No nudge needed.
- Grammar particle tint inherits from fixed `--highlight-bg` parent token; no separate `--highlight-particle` dark token (D-02 — per CONTEXT.md).
- Login focus ring uses `focus:ring-button/50` matching the established AudioButton pattern (D-04) — action color is user-configurable so this is semantically correct.
- `@theme inline` registration uses `--color-border: var(--border)` form (not `--border-color`) to ensure opacity modifiers like `border-border/60` work via Tailwind v4 color-mix (RESEARCH Pitfall 3).

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed the spec precisely, including hex values, block placement, and replacement map substitutions.

## Issues Encountered

None. Build and lint both passed on first attempt.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan is purely CSS token definitions and class substitutions. Auth logic in `lib/auth.ts` and `app/api/login/route.ts` is untouched (confirmed T-04-02 from threat model).

## Next Phase Readiness

- `text-muted`, `text-muted-foreground`, `border-border`, `bg-surface-1` Tailwind utilities are now available for Plan 02 (component sweep: study, cards, habits, settings, GlossProvider, StudySession)
- Both P0 findings (F-02 dark highlight, F-25 login focus ring) resolved before Phase 5 begins
- Plan 02 can proceed immediately — all token prerequisites are satisfied

## Self-Check

---
*Phase: 04-design-system-tokens-sweep*
*Completed: 2026-06-27*
