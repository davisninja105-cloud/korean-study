# Retrospective: Korean Study

## Milestone: v1.0 — Foundation-First Study

**Shipped:** 2026-06-26
**Phases:** 2 | **Plans:** 3

### What Was Built

- `selectSessionCards()` — cycle-safe, downward-closed DFS session selector; wired into `GET /api/cards/due` over the whole eligible pool (`take: 1000`). Prerequisites now always enter the session alongside their dependents, ordered before them.
- `countUnknownWords()` — pure tokenizer-based ranking signal; annotates each sentence with how many non-target words the learner hasn't seen yet.
- `showBareFront` gate in `StudySession.tsx` — new cards show bare Korean word when context isn't yet readable; sentence shown immediately once context is learnable.
- Least-unknown sentence selection (`chosenIdx`) — replaces pure rotation; picks the sentence with fewest unknown words, ties broken by `hashStr(id) + reps`.

### What Worked

- **TDD discipline:** RED commit → GREEN commit → integration made each plan's scope unambiguous and verification fast. Both plans closed in minutes after their GREEN commits.
- **Phase separation:** Phase 1 (selection) before Phase 2 (presentation) was the right order — Phase 2 could assume a coherent session set.
- **Pure functions everywhere:** keeping `selectSessionCards` and `countUnknownWords` as pure functions (no side effects, `now` as a parameter) meant lint stayed clean and tests were trivial to write.
- **Post-checkpoint revision loop:** the human verify step in Plan 02-02 caught an important UX refinement before ship (bare-word-only-when-context-unreadable vs. bare-word-always), and the fix was a small, targeted change.

### What Was Inefficient

- **Field shape bug (CR-01):** the planned tests used a flat `card.nextReview` fixture that doesn't match the actual Prisma response shape (`card.review.nextReview`). The bug — which would have silently broken due-date ordering in production — was only caught during the post-execution code review, not the plan's test design. Tests should match the real data shape.
- **REQUIREMENTS.md not ticked off:** the checkboxes in REQUIREMENTS.md for PRES-01..05 and QUAL-03/04 were never updated after Phase 2 shipped. Left a tracking gap that required an override_closeout.
- **Phase 2 `phase_complete` not updated in tracking:** verification step was skipped (no VERIFICATION.md authored), so `init.manager` reported Phase 2 incomplete even though all work was done.

### Patterns Established

- **Session-snapshot annotation:** annotate `unknownCount` server-side once at request time; client reads the value, never recomputes. Stable for the session lifetime.
- **`nextReviewMs(card)` helper:** relation-first (`card.review?.nextReview`) with flat fallback (`card.nextReview`) — single source of truth for reading a card's due date regardless of fetch shape.
- **Selection + ordering as two pure functions composed in the route:** `selectSessionCards` → `sequenceCards` → `NextResponse.json`. Each is independently testable; the route just wires them together.

### Key Lessons

1. Test fixtures must match the real Prisma response shape — flat fixtures hide field-shape bugs that only surface in production.
2. Tick off REQUIREMENTS.md as soon as each requirement ships, not at milestone close.
3. Write a brief VERIFICATION.md after each phase (or at least mark `phase_complete` in STATE.md) to keep `init.manager` accurate.
4. The post-checkpoint human-verify step is worth it — caught a meaningful UX distinction (bare-only-when-unreadable vs. bare-always) before the code was locked.

### Cost Observations

- Model mix: Sonnet (main session model for all execution)
- Sessions: ~3 coding sessions across 2026-06-25 and 2026-06-26
- Notable: Phase 1 was interrupted by a provider quota limit mid-execution; safe-resume closeout recovered cleanly from the committed task states without re-executing any code.

---

---

## Milestone: v1.1 — UI/UX Polish

**Shipped:** 2026-06-29
**Phases:** 7 (Phases 3–8 + 8.1) | **Plans:** 12 | **Commits:** 20

### What Was Built

- Code-only UI/UX audit producing 27 findings (F-01..F-27) across 7 screens × 6 dimensions; P0 gate section confirmed before downstream phases began
- Design-system token foundation: `--muted`, `--border`, dark-mode highlight fix; zero gray-* utilities remaining across 20+ files
- Study session: "Card N of Total" counter, warm haptic grade split, Korean line-height 1.7, smooth inter-card fade
- Home dashboard three-state hero derived from parallel `/api/activity` + stats fetch; elevated greeting; active press states
- iOS safe-area: `--sab` CSS variable frozen at mount, extended to Nav, layout, Sheet, StudySession; 44px touch targets across secondary screens
- Full accessibility baseline: aria-labels, reduced-motion counterparts, global tap-highlight suppression, 14-screen dark-mode regression approval

### What Worked

- **Dependency-driven phase order:** Audit → Tokens → Study → Home → Nav → A11y worked cleanly. Each phase had clear inputs from the previous one. No phase needed to be redone because a dependency shipped incomplete.
- **Code-only audit:** Reading source files directly (no screenshots or live browser) produced concrete, grep-verifiable findings. Every finding could be confirmed with a shell command. Eliminated ambiguity about whether an issue was "fixed" or not.
- **Wave parallelization:** Phases 7 and 8 each had two fully independent plans with zero file overlap. Running them as waves doubled throughput at the cost of zero coordination.
- **Inline code review cycle:** The post-execution code review step (finding WR-x/CR-x items) caught real bugs (double setState, color debounce race, res.ok checks) that automated lint wouldn't. Worth the extra pass.
- **--sab pattern discovery:** The iOS `env()` reset-on-navigation bug was a non-obvious platform quirk. The frozen CSS variable pattern is now documented and extended to all affected components.

### What Was Inefficient

- **Audit gap in Phase 8.1:** The NAV-01 gap (Sheet/StudySession using live `env()`) was caught at audit time, not during Phase 7 execution. The Phase 7 scope was "Nav + layout" but should have done a corpus-wide grep for all `env(safe-area-inset-bottom)` usages before planning. Added a full-corpus grep step as a pre-planning habit.
- **No VERIFICATION.md for Phases 3 and 4:** Both phases closed correctly but left the audit tool reporting "no VERIFICATION.md." A 5-minute retroactive verification pass would have avoided the `gaps_found` audit status. The evidence existed (SUMMARY grep tables); it just wasn't consolidated.
- **44px toggle regression:** Phase 7 applied `min-h-[44px]` to the reading-aid toggle switch, which elongated the visual. Required a revert commit. Better pre-planning: 44px applies to tap targets (links, buttons with discrete actions), not state toggles with a visual switch metaphor.

### Patterns Established

- **3-block CSS token rule:** every new token must appear in all 3 globals.css blocks (light `:root`, `@media dark`, `[data-theme="dark"]`); validate with `grep -c` == 3 before committing.
- **Reduced-motion gate in same commit:** every new `@keyframes` animation ships with its `prefers-reduced-motion: reduce` counterpart in the same diff. Never split these.
- **Corpus-wide grep before scoping a fix:** when fixing a pattern (like `env()` usage), grep all source files for the pattern first, not just the planned scope. Prevents leaving stragglers.
- **`aria-label` over `title` on icon buttons:** `title` is not reliably announced by screen readers (WCAG F-12). Always use `aria-label`.

### Key Lessons

1. Scope fixes corpus-wide: grep for the broken pattern across all files before writing the plan, not just in the target components.
2. Write VERIFICATION.md even for doc-only phases — a 5-minute pass eliminates false "no verification" audit flags.
3. Touch targets (44px) apply to discrete tap/click affordances (links, action buttons), not continuous-value widgets (toggle switches, sliders). Document this distinction explicitly in the plan.
4. The code review step (post-execution WR/CR pass) consistently catches bugs that lint misses — keep it in the workflow.

### Cost Observations

- Model mix: Sonnet (main session model throughout)
- Sessions: ~4 coding sessions across 2026-06-27 to 2026-06-29
- Notable: wave parallelization in Phases 7 and 8 was effective — independent plans ran back-to-back with zero coordination overhead. The per-plan code review added ~15% time but caught multiple real bugs.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Key Pattern | Main Pitfall |
|-----------|--------|-------|-------------|--------------|
| v1.0 Foundation-First Study | 2 | 3 | Pure functions + TDD RED→GREEN | Fixture shape mismatch hid a field-shape bug |
| v1.1 UI/UX Polish | 7 | 12 | Dependency-driven phase order + code-only audit | Scope didn't grep corpus-wide first (NAV-01 straggler) |
