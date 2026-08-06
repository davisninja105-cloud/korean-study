# Phase 30: Instant Feedback & Cold-Start Unblocking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-05
**Phase:** 30-instant-feedback-cold-start-unblocking
**Areas discussed:** Skeleton color strategy, Lesson-filter skeleton fidelity, Tightened perf-budget aggressiveness, Vercel region pin approach

---

## Skeleton color strategy

**Q1: How should dark-mode skeletons become visible against --background?**

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated token | Add `--skeleton-bg` used only by skeleton consumers; zero risk to the 17+ existing `surface-3` consumers | ✓ |
| Raise `--surface-3` itself | Simpler, one token, but lightens every hover state/progress track/habit day-cell too | |

**User's choice:** New dedicated token.

**Q2: How visible/bright should the new token be?**

| Option | Description | Selected |
|--------|-------------|----------|
| Match `--surface-1` (#1c2030) | Reuses existing "elevated" shade already in the palette; calm | ✓ |
| Slightly lighter than surface-1 | A new brighter value (~#252b40) for a more obvious shimmer | |

**User's choice:** Match `--surface-1`.

**Q3: Should light mode also switch to the new token, or stay on `--surface-3`?**

| Option | Description | Selected |
|--------|-------------|----------|
| Switch light mode too | One semantic token in both themes, set to current `--surface-3` light value (#f3f4f6) | ✓ |
| Leave light mode on `--surface-3` | Only touch the broken (dark) case | |

**User's choice:** Switch light mode too.

**Notes:** Grepped the codebase mid-discussion and found `bg-surface-3` used in 17+ non-skeleton components (Nav hover, Toast/GlossProvider close buttons, ProficiencyArc progress track, HabitTracker day-cells, CardEditor cancel button, etc.) — this evidence drove the "new token" decision over "raise surface-3."

---

## Lesson-filter skeleton fidelity

**Q1: Pixel-exact match or fill-the-footprint shimmer?**

| Option | Description | Selected |
|--------|-------------|----------|
| Pixel-exact match | Same h-16 slot with two pulsing bars + a button-height pulsing bar below | ✓ |
| Simple centered shimmer block | One pulsing rectangle sized to the combined height | |

**User's choice:** Pixel-exact match.

**Q2: Should the button placeholder match the real button's shape, or be a plainer bar?**

| Option | Description | Selected |
|--------|-------------|----------|
| Same shape as real button | min-h-14 rounded-2xl pulse matching exact dimensions | ✓ |
| Plainer bar | Simple h-12 rounded-xl bar, less deliberately button-shaped | |

**User's choice:** Same shape as real button.

**Notes:** None beyond the selections above.

---

## Tightened perf-budget aggressiveness

**Q1: How tight should the /habits budget go?**

| Option | Description | Selected |
|--------|-------------|----------|
| 1500ms | Roughly half the current 3000ms; comfortable slack above expected sub-1s post-fix load | ✓ |
| 2000ms | More conservative, lower flake risk, catches only bigger regressions | |

**User's choice:** 1500ms.

**Q2: Should the other three routes (/, /study, /cards) tighten too, or wait for Phases 31/32?**

| Option | Description | Selected |
|--------|-------------|----------|
| Leave the other three at 3000ms | Their real bottlenecks aren't fixed until later phases; tightening now risks flakiness | ✓ |
| Tighten all four now | Region pin + RootLayout fix affect every route's cold path | |

**User's choice:** Leave the other three at 3000ms.

**Notes:** Flagged for the planner: `PAGE_BUDGET_MS` is currently one shared constant in a loop over all four routes — achieving the split requires a per-route budget map.

---

## Vercel region pin approach

**Q1: Should Claude look up the Turso region, or does the user already know it?**

| Option | Description | Selected |
|--------|-------------|----------|
| Claude looks it up | Run `turso db show korean-study` or inspect DATABASE_URL | ✓ |
| User supplies it | User already knows the region code | |

**User's choice:** Claude looks it up. (Confirmed `turso` CLI is available at `/opt/homebrew/bin/turso`.)

**Q2: Pin via vercel.json or the Vercel dashboard?**

| Option | Description | Selected |
|--------|-------------|----------|
| vercel.json `regions` field | Version-controlled, consistent with how `crons` is already managed there | ✓ |
| Vercel dashboard setting | Configured outside the repo, not in git history | |

**User's choice:** vercel.json `regions` field.

**Notes:** `vercel.json` currently has no `regions` field; only a `crons` array.

---

## Claude's Discretion

- The `RootLayout` mechanism for removing the blocking `await getLayoutSettings()` DB read (LAYOUT-01) while still applying settings correctly on the next navigation — not raised as a user question since it's an architectural/technical call better suited to research, given the user has no web-app development background.
- Exact pixel sizing of the two skeleton bars inside the due-count slot.
- Whether the Turso region lookup parses `turso db show` output or reads `DATABASE_URL`'s host directly.

## Deferred Ideas

None — discussion stayed within phase scope.
