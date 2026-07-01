# Phase 12: Home & Habits Hydration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 12-home-habits-hydration
**Areas discussed:** User-local time handling, Habits page architecture, Shared dashboard data module

---

## Area Selection

| Gray area | Description | Selected |
|-----------|-------------|----------|
| HabitTracker data contract | Pass server-fetched activity as props, or keep HabitTracker self-fetching? | |
| User-local time handling | Greeting & habit 'today' by client clock or server approximation? | ✓ |
| Habits page architecture | Full RSC with client islands, or a HabitsClient shell? | ✓ |
| Shared dashboard data module | Extract lib/dashboard.ts or inline Prisma queries? | ✓ |

**User's choice:** User-local time handling, Habits page architecture, Shared dashboard data module.
**Notes:** HabitTracker data contract was not selected for discussion; captured as agent-discretion (D-09) with the recommended approach (add optional `initialActivity` prop — verified safe since `HabitTracker` is used only on home).

---

## User-local time handling

### Q1 — Time priority

| Option | Description | Selected |
|--------|-------------|----------|
| Client-correct | Compute 'today' and greeting from the user's local clock client-side. Correct for every timezone. Cost is a one-tick post-mount computation on the habits page. | ✓ |
| Server-instant | Use a server-timezone (UTC) approximation so first paint is fully instant. Distant-timezone users briefly see a wrong greeting/streak until the client corrects it. | |

**User's choice:** Client-correct
**Notes:** Correctness for every timezone wins. The habit "today" drives the streak count and heatmap shading — a server-UTC approximation would be wrong for anyone outside UTC.

### Q2 — Habits first paint before `today` resolves

| Option | Description | Selected |
|--------|-------------|----------|
| Brief skeleton tick | Render the existing HabitsLoading skeleton for one tick until 'today' is computed in an effect, then swap in the real streak/heatmap. Reuses the Phase 9 skeleton; no purity exceptions. | ✓ |
| Real streak on first paint | Compute 'today' on the first client render via a useState initializer + eslint-disable purity exception. Instant real data, but introduces the first purity-exception pattern in the codebase. | |

**User's choice:** Brief skeleton tick
**Notes:** No purity-exception introduced. Consequence noted: the home hero keeps its existing `heroState='loading'` pulse for one tick too (heroState depends on client-local `today`).

---

## Habits page architecture

### Q1 — Habits page structure

| Option | Description | Selected |
|--------|-------------|----------|
| HabitsClient shell | RSC fetches days/goal/dayStartHour/masteredCount → DTO props → HabitsClient computes 'today' in an effect (skeleton tick), then all derivations via useMemo. Matches the CardsClient/StudyClient pattern. | ✓ |
| Full RSC + client island | RSC fetches data AND pre-computes TZ-independent all-time totals (computeHabitStats) server-side; a smaller client island handles only the 'today'-dependent parts. Less client JS, but splits habit logic across the boundary and deviates from the Phase 10/11 pattern. | |

**User's choice:** HabitsClient shell
**Notes:** Consistency with the Phase 10/11 client-shell pattern across all three converted pages. No client refetch on habits (no pull-to-refresh) — data arrives via RSC props only.

---

## Shared dashboard data module

### Q1 — Shared module vs inline

| Option | Description | Selected |
|--------|-------------|----------|
| Extract lib/dashboard.ts | Create lib/dashboard.ts with getStats() and getActivityData(). Home RSC, habits RSC, and /api/stats + /api/activity all call these. One source of truth per query set. Matches Phase 11 D-02 (lib/study-cards.ts). | ✓ |
| Inline in each RSC page | Home RSC and habits RSC each run their own Prisma queries inline; API routes keep their own handlers. Simpler in isolation, but query logic lives in 3+ places with drift risk. | |

**User's choice:** Extract lib/dashboard.ts
**Notes:** DRY — matches the Phase 11 D-02 precedent. `getStats()` returns the full stats object (consumers select fields); `getActivityData()` returns `{ days, dailyGoalSeconds, dayStartHour }`. Both preserve the existing `Promise.all` parallelization.

### Q2 — DTO type location

| Option | Description | Selected |
|--------|-------------|----------|
| Extend lib/dto.ts | Add StatsDTO and ActivityDTO to the existing lib/dto.ts alongside CardDTO/SentenceDTO/ReviewDTO/LessonDTO. Matches Phase 11 D-05. DayRecord reused from lib/habit.ts. | ✓ |
| Co-locate in lib/dashboard.ts | Define StatsDTO and ActivityDTO inside lib/dashboard.ts. Self-contained module, but splits DTO types across two files (deviates from D-05). | |

**User's choice:** Extend lib/dto.ts
**Notes:** One file for all shared DTO types (Phase 11 D-05 precedent). DayRecord already exists in lib/habit.ts and is serializable (string + numbers, no Date objects).

---

## the agent's Discretion

- **HabitTracker data contract (D-09):** User did not select this area. Captured as agent-discretion with the recommended approach — add an optional `initialActivity` prop (initialDays/initialToday/initialGoal) so home passes server-fetched data and `HabitTracker` skips the self-fetch when props are present. Verified safe: `HabitTracker` is used only on `app/page.tsx`. Falls back to self-fetch when props are absent.
- **Effect mechanism for `today`:** The exact pattern that computes `today` client-side and swaps the skeleton — follow the established `Promise.resolve().then(() => setState(...))` pattern; planner picks.
- **Skeleton shapes:** Reuse the existing `app/habits/loading.tsx` shapes; do not invent new skeleton shapes.
- **Post-sync refetch scope on home:** Keep current behavior (re-fetch both stats and activity) unless the planner finds a reason to narrow it.

## Deferred Ideas

- **Home `loading.tsx` skeleton (`app/loading.tsx`)** — Home has no route-level skeleton; RSC handles first-load. Client-side nav-to-home jank is a Phase 9 (skeleton) scope concern, not this hydration phase. Noted for the roadmap backlog.
- **Stale home data freshness** — After RSC, home stats/activity are a server-render snapshot; not refreshed until pull-to-refresh. Accepted tradeoff (mirrors Phase 11's deferred "stale card freshness"). Auto-refresh is a future polish item.
- **Trimming `cardsByType` from dashboard stats fetch** — `getStats()` returns the full object (incl. `cardsByType`, used only by `/wrapped`) to stay DRY with the API route. A trimmed variant is possible but not worth the split for a single-user app.
