# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- 🔵 **v1.1 UI/UX Polish** — Phases 3–8 (in planning)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

### v1.1 UI/UX Polish (Phases 3–8)

- [x] **Phase 3: UI/UX Audit** - Walk all 7 screens through 6 dimensions; severity-classified findings list that every later phase executes against (completed 2026-06-27)
- [x] **Phase 4: Design System Tokens & Sweep** - Add `--muted`/`--border`, fix dark-mode highlight tokens, replace all ad hoc `gray-*` utilities in one focused sweep (completed 2026-06-27)
- [x] **Phase 5: Study Session Polish** - Progress indicator, warm grade feedback, readable Korean typography, smooth inter-card transitions (completed 2026-06-28)
- [x] **Phase 6: Home Dashboard Polish** - Three distinct hero states, prominent greeting, clear at-a-glance visual hierarchy (completed 2026-06-28)
- [x] **Phase 7: Secondary Screens & Navigation** - Cards/Habits/Settings consistency pass, safe-area-inset fix, 44px touch targets (completed 2026-06-29)
- [x] **Phase 8: Accessibility & PWA Baseline** - aria-labels, reduced-motion gating, active/tap-highlight states, 14-screen dark-mode regression test (completed 2026-06-29)

## Phase Details

### Phase 3: UI/UX Audit

**Goal**: A severity-classified findings list exists for every screen, so every later polish phase executes against documented evidence rather than ad hoc judgment
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):

  1. Each of the 7 screens (Home, Study, Cards, Habits, Settings, Wrapped, Login) has documented findings across all 6 dimensions (token escapes, dark-mode parity, spacing/density, interaction feedback, typography hierarchy, accessibility)
  2. Every finding carries a P0/P1/P2 severity label, and `.planning/ui-reviews/audit.md` exists on disk with the full list
  3. All P0 findings are resolved (or explicitly waived with reason) before any subsequent polish phase begins

**Plans**: 1/1 plans complete

- [x] 03-01-PLAN.md — Code-only UI/UX audit: pre-seed 5 research findings, walk 7 screens × 6 dimensions, write severity-classified `.planning/ui-reviews/audit.md` with P0 gate

**UI hint**: yes

### Phase 4: Design System Tokens & Sweep

**Goal**: The semantic token system is complete and consistently referenced — components have the tokens they need, and no ad hoc gray utilities remain to drift in dark mode
**Depends on**: Phase 3
**Requirements**: DS-01, DS-02, DS-03
**Success Criteria** (what must be TRUE):

  1. `--muted` and `--border` tokens exist in all three blocks (light `:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`) — `grep` returns exactly 3 hits each
  2. `--highlight-bg` and `--highlight-fg` render correctly in dark mode; the sentence highlight no longer appears harsh in either dark block
  3. No `bg-gray-*`, `text-gray-*`, or `border-gray-*` Tailwind utilities remain in any component — all replaced with semantic token equivalents
  4. The app builds and lints clean after the sweep; no visual regression in light mode

**Plans**: 3/3 plans complete
**Wave 1**

- [x] 04-01-PLAN.md — Token foundation: add `--muted`/`--muted-foreground`/`--border` (all 3 blocks + @theme inline), fix dark `--highlight-bg/fg` (F-02 P0), sweep login + F-25 focus-ring (P0) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Gray-utility sweep: app/ pages (page, study, cards, habits, settings, wrapped) [Wave 2]
- [x] 04-03-PLAN.md — Gray-utility sweep: 14 components incl. 6 research-discovered files + HabitTracker ring-offset [Wave 2]

**UI hint**: yes

### Phase 5: Study Session Polish

**Goal**: The core daily study loop feels warm, oriented, and smooth — the learner always knows where they are, gets encouraging feedback, and reads Korean comfortably
**Depends on**: Phase 4
**Requirements**: STUDY-01, STUDY-02, STUDY-03, STUDY-04
**Success Criteria** (what must be TRUE):

  1. A "Card N of Total" progress indicator is visible throughout a session and updates after each answered card
  2. Grade buttons are visually distinct (warm color differentiation) and haptically distinct between correct and needs-review answers
  3. Korean flashcard text renders with `line-height: 1.7` and `word-break: keep-all`; card front and back have clear visual hierarchy and appropriate spacing
  4. Moving from one card to the next animates smoothly (≤150ms slide or fade) instead of an abrupt swap

**Plans**: 2/2 plans complete
**Wave 1**

- [x] 05-01-PLAN.md — CSS foundations: Korean line-height 1.65→1.7 (STUDY-03) + `.animate-card-in` utility with reduced-motion gate (STUDY-04 CSS) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — StudySession.tsx: "Card N of Total" counter (STUDY-01), correct/needs-review haptic split + warm Easy button (STUDY-02), `key={cursor}` card-in wrapper (STUDY-04 JSX) [Wave 2]

**UI hint**: yes

### Phase 6: Home Dashboard Polish

**Goal**: The morning-ritual entry screen reads clearly at a glance and adapts its hero to the learner's actual situation that day
**Depends on**: Phase 4
**Requirements**: HOME-01, HOME-02, HOME-03
**Success Criteria** (what must be TRUE):

  1. The home hero shows three visually distinct states: cards due (prominent count), daily goal already met (celebratory state), and all cards reviewed but goal not yet met
  2. The time-of-day greeting is visually prominent on the hero, not a small subtitle
  3. The page hierarchy reads top-to-bottom at a glance: due count → primary Study CTA → secondary stats strip

**Plans**: 1/1 plans complete
**Wave 1**

- [x] 06-01-PLAN.md — app/page.tsx: three-state hero (A due / B goal-met / C caught-up) via heroState + /api/activity fetch (HOME-01), prominent text-xl greeting (HOME-02), top-to-bottom hierarchy + F-07 active states (HOME-03) [Wave 1]

**UI hint**: yes

### Phase 7: Secondary Screens & Navigation

**Goal**: Cards, Habits, Settings, and the bottom navigation reach the same polish bar as the high-priority screens, including the iOS safe-area and touch-target fundamentals
**Depends on**: Phase 4
**Requirements**: NAV-01, SEC-01, SEC-02
**Success Criteria** (what must be TRUE):

  1. The bottom navigation correctly applies `env(safe-area-inset-bottom)` on iPhone even after `<Link>` navigation (via a JS-set CSS variable, not a live `env()` reference)
  2. Cards, Habits, and Settings pages have a spacing and typography consistency pass aligned to the refined design-system tokens
  3. Nav tabs and Cards-page interactive elements meet the 44px minimum touch target

**Plans**: 2/2 plans complete
**Wave 1** *(both plans independent — zero file overlap, fully parallel)*

- [x] 07-01-PLAN.md — Nav + layout: safe-area `--sab` JS-variable fix (NAV-01/F-01), bottom-tab 44px min-height + `active:opacity-70` press state (SEC-02/F-04) [Wave 1]
- [x] 07-02-PLAN.md — Cards/Habits/Settings consistency pass: view-toggle 44px + `aria-pressed` (F-16/F-17), SwipeRow delete 44px (F-18), Habits/Settings `<h2>` text-lg upgrade (F-20), reading-aid 44px wrapper (F-22), Habits My Korean active state (SEC-01) [Wave 1]

**UI hint**: yes

### Phase 8: Accessibility & PWA Baseline

**Goal**: A cross-cutting final pass guarantees the polish from Phases 5–7 is accessible, reduced-motion-safe, and free of dark-mode regressions
**Depends on**: Phase 5, Phase 6, Phase 7
**Requirements**: A11Y-01, A11Y-02, A11Y-03, A11Y-04
**Success Criteria** (what must be TRUE):

  1. Every interactive icon button (AudioButton, Nav tabs, gloss popover dismiss, SwipeRow delete) has a meaningful `aria-label`
  2. Every `@keyframes` animation in `globals.css` has a `prefers-reduced-motion: reduce` counterpart that disables or simplifies the motion
  3. Every interactive element has an explicit `:active` state, and `-webkit-tap-highlight-color: transparent` is applied globally
  4. The 14-screen dark-mode regression test passes (7 pages × light + dark) after all changes land

**Plans**: 2/2 plans complete
**Wave 1** *(both plans independent — zero file overlap, fully parallel)*

- [x] 08-01-PLAN.md — globals.css: `.animate-backdrop` reduced-motion counterpart (A11Y-02) + global `-webkit-tap-highlight-color: transparent` (A11Y-03 global rule) [Wave 1]
- [x] 08-02-PLAN.md — Component a11y pass: aria-labels (Nav tabs, mode Sheet, Undo — A11Y-01), active states + 44px touch targets (Gloss/Audio/StudySession/Home — A11Y-03), 14-screen dark-mode regression checkpoint (A11Y-04) [Wave 1]

**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete   | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete   | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete   | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete    | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete    | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete    | 2026-06-29 |
| 8.1 Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete    | 2026-06-29 |

### Phase 08.1: Close gap: NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (INSERTED)

**Goal:** Replace live env(safe-area-inset-bottom) with var(--sab,0px) in Sheet.tsx and StudySession.tsx to match the Nav.tsx/layout.tsx adoption from Phase 7.
**Requirements**: NAV-01 (gap closure)
**Depends on:** Phase 8
**Plans:** 1 plan (inline fix) — **Complete 2026-06-29**

Plans:

- [x] Inline fix: pb-[max(1rem,var(--sab,0px))] in Sheet.tsx:81 and StudySession.tsx:550
