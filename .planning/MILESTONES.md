# Milestones

## v1.2 Performance & Snappiness (Shipped: 2026-07-01)

**Phases completed:** 4 phases, 9 plans, 12 tasks

**Key accomplishments:**

- Every navigation to /cards, /study, or /habits shows an instant content-shaped skeleton (`bg-surface-2 animate-pulse` only) — zero blank-flash transitions
- Cards, study, home, and habits pages all converted to the async RSC + client-shell + DTO pattern: real data now arrives in the initial HTML, eliminating every empty-state/blank-loading flash on first paint
- `/api/cards/due` parallelizes its pool + known-lemmas queries via `Promise.allSettled`, saving roughly one Turso round-trip per study-session start, with graceful degradation on partial DB failure
- Grade-button jitter eliminated — `submitReview` is now synchronous and optimistic (client-side FSRS via `reviewCard()`, fire-and-forget save); undo correctly restores the pre-grade unrevealed state
- Shared `lib/dto.ts`, `lib/study-cards.ts`, and `lib/dashboard.ts` modules extracted as single sources of truth, reused by both the new RSC pages and the API routes they used to power exclusively
- Zero new npm packages — every pattern (RSC, `loading.tsx`, `Promise.allSettled`, DTO serialization) built into the existing Next.js 16 + React 19 stack

**Known verification overrides: 4** (see `.planning/STATE.md` Deferred Items — Phase 9 has no VERIFICATION.md but 4/4 automated requirement checks pass; Phases 10/11 are `human_needed` for RSC paint-timing checks, largely covered in practice by Phase 11's live UAT session; Phase 11's UAT bug was root-caused and fixed pre-close)

---

## v1.0 Foundation-First Study (Shipped: 2026-06-27)

**Phases completed:** 2 phases, 3 plans, 6 tasks

**Key accomplishments:**

- Pure `selectSessionCards` selector — a cycle-safe, downward-closed DFS closure that pulls each chosen card's still-due in-pool prerequisites into the session and caps at `sessionSize` during selection — wired into `GET /api/cards/due` over the whole eligible pool.
- 1. [Rule 3 - Blocking] vitest path alias @/ not configured
- Server-annotated unknownCount per sentence + client bare-word-first gate that shows sentences when context is already known

## v1.1 UI/UX Polish (Shipped: 2026-06-29)

**Phases completed:** 7 phases (3–8 + 8.1), 12 plans, 20 commits

**Key accomplishments:**

- Full code-only UI/UX audit: 27 severity-classified findings (F-01..F-27) across 7 screens × 6 dimensions; P0 gate confirmed all critical issues resolved before downstream phases
- Complete design-system token sweep: `--muted`, `--border` tokens added to all 3 globals.css blocks; dark-mode sentence highlight fixed (reversed amber pairing); zero ad hoc gray-* utilities remaining across 20+ files
- Study session visual polish: "Card N of Total" progress counter, warm haptic grade differentiation (correct → success, needs-review → selection), Korean line-height 1.7, smooth 0.12s inter-card fade with reduced-motion gate
- Home dashboard three-state hero: due/goal-met/caught-up states derived from parallel activity+stats fetch; elevated greeting; active press states throughout
- iOS safe-area fix: `--sab` CSS variable frozen at mount via useEffect (survives Next.js `<Link>` navigation); extended to Nav, layout, Sheet, StudySession; 44px touch targets across nav tabs and secondary interactive elements
- Full accessibility baseline: aria-labels on all interactive icon buttons, reduced-motion counterparts for all animations, global `-webkit-tap-highlight-color: transparent`, 14-screen dark-mode regression approved by operator

**Known verification overrides: 2** (see `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — Phases 3/4 no VERIFICATION.md; NAV-01 unverified on physical device)

---
