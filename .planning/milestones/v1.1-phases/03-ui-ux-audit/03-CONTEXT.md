# Phase 3: UI/UX Audit - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a severity-classified findings list (P0/P1/P2) for all 7 screens (Home, Study, Cards, Habits, Settings, Wrapped, Login) across 6 audit dimensions. Output is a single `.planning/ui-reviews/audit.md` file that every subsequent polish phase (4–8) executes against. The audit is documentation-only — P0 resolution happens before Phase 4 begins but is not required to be inside this phase's plan.

</domain>

<decisions>
## Implementation Decisions

### Audit Method
- **D-01:** Code-only audit — read each component/page file directly; no screenshots, no dev server required. Catches token escapes, missing dark values, a11y gaps, spacing issues, and interaction feedback gaps from static analysis.
- **D-02:** Per-screen pass — read each screen file once and apply all 6 audit dimensions in that single read. One read per screen (7 reads total), not 6 sweeps × 7 screens. Minimizes context usage.

### Research Pre-seeding
- **D-03:** Pre-seed `audit.md` with the 5 research-identified known issues before the code scan begins. These are treated as confirmed findings, not hypotheses:
  1. Safe-area-inset bug — `env(safe-area-inset-bottom)` resets to 0px after `<Link>` navigation
  2. `--highlight-bg/fg` dark-mode regression — missing correct dark values (sentence highlight appears harsh)
  3. Missing 44px minimum touch targets (Apple HIG) on some interactive elements
  4. Missing `:active` state styles on many tappable elements
  5. Missing `prefers-reduced-motion` gating on CSS `@keyframes` animations
- **D-04:** Severity classification (P0/P1/P2) for the pre-seeded findings is determined by the auditor during the code read, not pre-assigned. The auditor may escalate or downgrade based on what the code confirms.

### Claude's Discretion
- Findings organization within `audit.md` (screen-by-screen vs. severity-first vs. dimension-first) — left to the planner to decide the most useful structure for downstream phases 4–8.
- How deep to go per dimension per screen — calibrate to find actionable issues without over-engineering the audit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Scope
- `.planning/REQUIREMENTS.md` — Full requirement list for v1.1 (AUDIT-01, AUDIT-02 are this phase's requirements; DS-*, STUDY-*, HOME-*, NAV-*, SEC-*, A11Y-* are downstream phases)
- `.planning/ROADMAP.md` §Phase 3 — Success criteria: 7 screens × 6 dimensions documented; P0 items resolved before Phase 4 begins

### Research Synthesis (pre-seeded findings + pitfalls)
- `.planning/research/SUMMARY.md` — Full synthesis: 6 audit dimensions, known issues, critical pitfalls (dual dark-mode block trap, layout thrash, safe-area-inset bug), table-stakes vs. differentiators
- `.planning/research/PITFALLS.md` — Detailed pitfalls with prevention strategies
- `.planning/research/ARCHITECTURE.md` — Audit dimension definitions, token refinement rules, component patterns

### Design System (source of truth for audit)
- `app/globals.css` — All CSS token definitions (light `:root`, `@media dark`, `[data-theme="dark"]`); the 3-block dual-dark requirement is the #1 thing to audit
- `lib/card-style.ts` — Card-type badge class source of truth

### Key Screens to Audit
- `app/page.tsx` — Home dashboard
- `app/study/page.tsx` + `components/StudySession.tsx` — Study session (highest-impact surface)
- `app/cards/page.tsx` — Card library
- `app/habits/page.tsx` — Habit stats
- `app/settings/page.tsx` — Settings
- `app/wrapped/page.tsx` — "My Korean" summary
- `app/login/page.tsx` — Login

### Key Components (check for a11y and interaction issues)
- `components/Nav.tsx` — Bottom nav (safe-area, touch targets, active states)
- `components/AudioButton.tsx` — Speaker button (aria-label)
- `components/SwipeRow.tsx` — Swipe-to-delete (reduced-motion, touch targets)
- `components/HighlightedSentence.tsx` — Sentence highlight (dark-mode token check)
- `components/GlossProvider.tsx` — Gloss popover (dismiss button aria-label)
- `components/Sheet.tsx` — Bottom sheet (focus trap, animation gating)
- `components/ProgressRing.tsx` — SVG ring (aria-label, reduced-motion)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/globals.css` `@theme inline` block: already has `--surface-1/2/3`, `--reward`, `--highlight-bg/fg`, `--cat-vocab/grammar/phrase` — audit checks these are used correctly everywhere and that dark values exist
- `components/ProgressRing.tsx`: has `aria-label` prop (required) and `ringFill` keyframe — check if the keyframe has a `prefers-reduced-motion` counterpart in globals.css
- `lib/haptics.ts`: exists and is no-op-safe — audit can note where haptics are missing without requiring new lib code

### Established Patterns
- **Dual dark-mode block rule**: every CSS token needs values in 3 places: light `:root`, `@media (prefers-color-scheme: dark) :root`, and `:root[data-theme="dark"]`. The audit's primary job in the Dark Mode Parity dimension is finding tokens that exist in only 1 or 2 of these 3 blocks.
- **Semantic tokens, never literal gray**: `bg-gray-*`, `text-gray-*`, `border-gray-*` are all audit findings (token escapes dimension). Replacement tokens will be `--muted` and `--border` (added in Phase 4).
- **Blue reserved for actions**: audit flags any non-action use of blue utilities.

### Integration Points
- `audit.md` output lands in `.planning/ui-reviews/` — that directory should be created if missing
- P0 findings from the audit are the gate before Phase 4 can begin (per AUDIT-02)
- Finding IDs (e.g., `F-01`, `F-02`) should be stable so Phases 4–8 can reference them in their plans

</code_context>

<specifics>
## Specific Ideas

- Finding IDs should be stable and referenceable (`F-01`, `F-02`, etc.) so downstream phase plans can point to specific audit items
- The 5 pre-seeded research findings should appear in the audit output with clear evidence from code (confirm by grep/read, not just assertion)
- No external docs referenced during discussion — audit is grounded in code + the research synthesis above

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-UI/UX Audit*
*Context gathered: 2026-06-26*
