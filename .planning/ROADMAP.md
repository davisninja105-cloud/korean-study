# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- 🚧 **v1.2 Performance & Snappiness** — Phases 9–12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 UI/UX Polish (Phases 3–8 + 8.1) — SHIPPED 2026-06-29</summary>

- [x] Phase 3: UI/UX Audit (1/1 plans) — completed 2026-06-27
- [x] Phase 4: Design System Tokens & Sweep (3/3 plans) — completed 2026-06-27
- [x] Phase 5: Study Session Polish (2/2 plans) — completed 2026-06-28
- [x] Phase 6: Home Dashboard Polish (1/1 plan) — completed 2026-06-28
- [x] Phase 7: Secondary Screens & Navigation (2/2 plans) — completed 2026-06-29
- [x] Phase 8: Accessibility & PWA Baseline (2/2 plans) — completed 2026-06-29
- [x] Phase 8.1: Close gap NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (1/1 inline fix) — completed 2026-06-29

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.2 Performance & Snappiness (Phases 9–12)

- [x] **Phase 9: Skeleton Loading Screens** - Instant skeleton feedback on every main-route navigation (pure additive, zero risk) (completed 2026-06-29)
- [ ] **Phase 10: Cards Hydration + API Parallelization** - Cards page hydrated from the server (establishes the RSC + DTO pattern) and `/api/cards/due` queries run concurrently
- [ ] **Phase 11: Study Page Hydration & Interaction Polish** - Study page arrives at mode-select instantly; in-session flip/grade/audio feel immediate with no jitter
- [ ] **Phase 12: Home & Habits Hydration** - Dashboard stats, activity, and heatmap arrive with the server render — no empty-state flash

## Phase Details

### Phase 9: Skeleton Loading Screens

**Goal**: Every navigation to a main route gives instant visual feedback — a skeleton appears immediately instead of a blank flash.
**Depends on**: Nothing (pure additive — adds `loading.tsx` files only; no existing code changes)
**Requirements**: SKEL-01, SKEL-02, SKEL-03, SKEL-04
**Success Criteria** (what must be TRUE):

  1. Navigating to the cards page shows a skeleton immediately, with no blank flash during the route transition
  2. Navigating to the study page shows a skeleton immediately
  3. Navigating to the habits page shows a skeleton immediately
  4. Every skeleton is built from `bg-surface-2 animate-pulse` design-system tokens — no hardcoded gray utilities
  5. Skeleton shapes approximate real content height so there is no visible layout shift when content arrives

**Plans**: 1/1 plans complete

- [ ] 09-PLAN.md
- [x] 09-01-PLAN.md — Add loading.tsx skeletons to /cards, /study, /habits (bg-surface-2 animate-pulse, content-shaped)

**UI hint**: yes

### Phase 10: Cards Hydration + API Parallelization

**Goal**: The cards page renders its real card list on first paint (no empty-state flash), and study sessions start faster because `/api/cards/due` no longer waits on serial round-trips. This phase also establishes the RSC + client-shell + DTO pattern that the later page conversions reuse.
**Depends on**: Phase 9 (skeleton already present as the navigation fallback for this route)
**Requirements**: RSC-01, RSC-05, DB-01
**Success Criteria** (what must be TRUE):

  1. On first load, the cards page shows the user's actual cards — never the "no cards stored yet" empty state — because the list arrives with the server-rendered HTML
  2. Search, filter, edit, and delete on the cards page continue to work after the conversion (interactivity preserved in the client shell)
  3. No `Date` object is passed raw across the server→client boundary — all date fields cross as ISO strings or epoch-millisecond numbers via DTO types
  4. Starting a study session is measurably faster: the three independent Prisma queries in `/api/cards/due` run concurrently instead of one-after-another
  5. A transient database failure during the parallel fetch returns a graceful error response rather than crashing the request

**Plans**: TBD
**UI hint**: yes

### Phase 11: Study Page Hydration & Interaction Polish

**Goal**: The study page arrives at the mode-select screen immediately with the correct due count (no blank loading phase), and once a session is running the card flip, grade buttons, and audio all respond instantly with no re-fetch or recompute jitter.
**Depends on**: Phase 10 (reuses the RSC + DTO pattern; benefits from the parallelized `/api/cards/due`)
**Requirements**: RSC-02, UX-01
**Success Criteria** (what must be TRUE):

  1. On first load, the study page lands directly on the mode-select screen with the correct due-card count — no blank "loading" phase
  2. The lesson-range filter still re-fetches and re-sequences cards correctly after the initial server render
  3. During an active session, flipping a card, tapping a grade button, and pressing the audio button respond immediately with no visible jitter or re-fetch
  4. The session-complete screen and the "study ahead" flow continue to work end-to-end

**Plans**: TBD
**UI hint**: yes

### Phase 12: Home & Habits Hydration

**Goal**: The home dashboard and habits page receive their stats, activity, and heatmap data with the server render, so the hero and heatmap appear fully populated on first paint with no empty-state flash.
**Depends on**: Phase 10 (reuses the RSC + DTO + parallel-fetch pattern); Phase 11 if `HabitTracker` shares the study route (verify no self-fetch reliance)
**Requirements**: RSC-03, RSC-04
**Success Criteria** (what must be TRUE):

  1. On first load, the home hero shows the correct stats (due count, mastered, lessons) and three-state hero immediately — no empty hero flash
  2. On first load, the habits page renders the streak, all-time totals, and heatmap immediately — no empty heatmap flash
  3. Pull-to-refresh on home still triggers a sync and updates the data after mount
  4. The CEFR band-up confetti/banner still fires client-side when the user levels up
  5. No `Date` object is passed raw across the server→client boundary for either page (DTO types used throughout)

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8.1. Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete | 2026-06-29 |
| 9. Skeleton Loading Screens | v1.2 | 1/1 | Complete   | 2026-06-29 |
| 10. Cards Hydration + API Parallelization | v1.2 | 0/? | Not started | - |
| 11. Study Page Hydration & Interaction Polish | v1.2 | 0/? | Not started | - |
| 12. Home & Habits Hydration | v1.2 | 0/? | Not started | - |
