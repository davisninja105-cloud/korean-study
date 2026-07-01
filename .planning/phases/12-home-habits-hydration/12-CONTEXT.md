# Phase 12: Home & Habits Hydration - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the home dashboard (`app/page.tsx`) and the habits page (`app/habits/page.tsx`) from client-side `useEffect` fetches (`/api/stats` + `/api/activity`) to server-rendered data (RSC + DTO), so the home hero and the habits streak/heatmap appear fully populated on first paint — no empty-state flash. This reuses the RSC + client-shell + DTO pattern established in Phase 10 and reused in Phase 11. No new capabilities; this is a performance/hydration phase within the existing home and habits screens.

**Requirements (from ROADMAP.md):**
- **RSC-03**: Home page receives stats and activity data from the server — no empty hero flash on first load
- **RSC-04**: Habits page receives activity data from the server — no empty heatmap flash on first load
- **RSC-05** (carried forward): No `Date` object is passed raw across the server→client boundary for either page — DTO types used throughout

**Success criteria (from ROADMAP.md):**
1. On first load, the home hero shows the correct stats (due count, mastered, lessons) and three-state hero immediately — no empty hero flash
2. On first load, the habits page renders the streak, all-time totals, and heatmap immediately — no empty heatmap flash
3. Pull-to-refresh on home still triggers a sync and updates the data after mount
4. The CEFR band-up confetti/banner still fires client-side when the user levels up
5. No `Date` object is passed raw across the server→client boundary for either page (DTO types used throughout)

**Depends on:** Phase 10 (RSC + DTO + parallel-fetch pattern), Phase 11 (HabitTracker self-fetch reliance — verified: `HabitTracker` is used only on home, so adding an `initialData` prop is safe).

</domain>

<decisions>
## Implementation Decisions

### User-Local Time Handling (greeting + habit "today")

- **D-01: Client-correct time.** The time-aware greeting and the habit-day "today" string depend on the user's local clock; the Vercel server runs UTC and cannot compute them correctly. Both are computed client-side from the user's local clock. Correctness for every timezone wins over a fully-instant server approximation. `habitDateStr()` / `localDateStr()` stay purity-rule-gated to effects/handlers (never bare in render) — no `react-hooks/purity` exceptions are introduced.

- **D-02: Brief skeleton tick until `today` resolves.** On the habits page, the existing Phase 9 `HabitsLoading` skeleton renders for one effect tick until `today` is computed client-side, then swaps in the real streak/heatmap/trend. No purity-exception (e.g., `useState` initializer calling `new Date()`) is introduced. Consequence: the home hero keeps its existing `heroState='loading'` pulse for one tick too, because `heroState` depends on client-local `today` (the goal-met check). This is consistent with the current design and the "no empty flash" success criteria — the intentional skeleton is the desired loading state, not an empty-state flash.

### Habits Page Architecture

- **D-03: `HabitsClient` shell (matches the Phase 10/11 client-shell pattern).** `app/habits/page.tsx` becomes an `async` server component that fetches `days`, `dailyGoalSeconds`, `dayStartHour` (via `lib/dashboard.ts`) and `masteredCount` (via `lib/dashboard.ts`), serializes them to DTO props, and renders `<HabitsClient initialDays={...} initialGoal={...} initialDayStartHour={...} initialMasteredCount={...} />`. `HabitsClient` computes `today` in an effect (skeleton tick per D-02), then all derivations (`computeStreaks`, `computeHabitStats`, trend, heatmap weeks, `computeHabitInsight`) via `useMemo` — exactly the same shape as `CardsClient` / `StudyClient`. The pure habit functions in `lib/habit.ts` are reused unchanged. Client islands (`HabitHeatmap`, `ProgressRing`, `ProficiencyArc`) render as children of the shell.

- **D-04: No client refetch on habits.** The habits page has no pull-to-refresh and no data-mutating interactivity, so all data arrives via RSC props and no `/api/stats` or `/api/activity` call is made from the client. The habits RSC is the sole data source for this route.

### Shared Dashboard Data Module

- **D-05: Extract `lib/dashboard.ts`.** Create `lib/dashboard.ts` with `getStats()` and `getActivityData()` server-only functions. The home RSC, the habits RSC, and the `/api/stats` + `/api/activity` GET routes all call these — one source of truth per query set, no duplication. This matches the Phase 11 D-02 precedent (`lib/study-cards.ts` extracted so the RSC page and API route stay DRY). `getStats()` returns the full stats object (`totalCards`, `dueCards`, `totalLessons`, `cardsByType`, `masteredCount` — same as the current `/api/stats` response); home and habits select the fields they need. `getActivityData()` returns `{ days, dailyGoalSeconds, dayStartHour }` (same as the current `/api/activity` response). Both use `Promise.all` over Prisma (the existing routes already parallelize — preserve that).

- **D-06: DTO types extend `lib/dto.ts`.** Add `StatsDTO` and `ActivityDTO` to the existing `lib/dto.ts` alongside `CardDTO` / `SentenceDTO` / `ReviewDTO` / `LessonDTO` / `LessonRefDTO` (Phase 11 D-05 precedent — one file for all shared DTO types). `DayRecord` is reused from `lib/habit.ts` as the `ActivityDTO.days[]` element type — it is already serializable (`{ date: "YYYY-MM-DD", seconds, reviews? }`, no `Date` objects). Note: the stats and activity payloads are already primitives (no raw `Date` objects cross the boundary today), but RSC-05 still requires formal DTO types at the prop boundary.

### Home Page Architecture (carried forward from the pattern)

- **D-07: `HomeClient` shell.** `app/page.tsx` becomes an `async` server component that fetches stats + activity (via `lib/dashboard.ts`), serializes to DTO, and renders `<HomeClient initialStats={...} initialActivity={...} />`. `HomeClient` retains all client-only interactivity: pull-to-refresh (`usePullToRefresh` → `POST /api/sync` → re-fetch via `/api/stats` + `/api/activity`), band-up detection (localStorage `lastBand` comparison + confetti — success criteria #4), the time-aware greeting (client-local per D-01), and the derived `heroState` (client-local `today` per D-02). `StatsBar`, `HabitTracker`, `ProficiencyArc` render as children.

- **D-08: API routes stay (home post-sync refetch).** `/api/stats` and `/api/activity` GET routes are NOT removed. They delegate to `lib/dashboard.ts` getters and serve the home page's client-side refetch after a pull-to-refresh sync (success criteria #3). The POST `/api/activity` handler (study-time logging) is untouched.

### HabitTracker Data Contract (agent discretion — user deferred)

- **D-09: Add an optional `initialActivity` prop to `HabitTracker`.** Today `HabitTracker` self-fetches `/api/activity` on mount, and home also fetches it — a duplicate request. `HabitTracker` gains optional props `initialDays`, `initialToday`, `initialGoal`; when present, it skips the `useEffect` self-fetch and seeds state from the props (then proceeds exactly as today: milestone detection, haptic on ring close, comeback/at-risk messages). This eliminates the duplicate `/api/activity` fetch on home. Verified safe: `HabitTracker` is used only on `app/page.tsx` (grep-confirmed — not on `/study` or `/wrapped`), so the contract change has no other call sites to update. When the props are absent (defensive), it falls back to the self-fetch, so the component stays usable in isolation.

### the agent's Discretion

- The exact effect mechanism that computes `today` client-side and swaps the skeleton for real content (one tick) — follow the established `Promise.resolve().then(() => setState(...))` pattern used in the current home page to satisfy `react-hooks/set-state-in-effect`, or a `useEffect` with the skeleton gate; the planner picks.
- Whether `HomeClient` re-fetches both stats and activity after sync (current behavior) or only activity — keep current behavior (both) unless the planner finds a reason to narrow it.
- Skeleton shapes for the habits one-tick loading state: reuse the existing `app/habits/loading.tsx` shapes for visual consistency (do not invent new skeleton shapes).
- Spinner/loading indicator for the home hero one-tick pulse: keep the existing `heroState='loading'` `bg-surface-2 animate-pulse` block.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` — RSC-03, RSC-04 requirement text; RSC-05 DTO contract (enforced); traceability table (Phase 12 owns RSC-03, RSC-04)
- `.planning/ROADMAP.md` §Phase 12 — Goal, success criteria (5), dependencies on Phase 10/11

### Prior Phase Patterns (MANDATORY — Phase 12 reuses these)
- `.planning/phases/11-study-page-hydration-interaction-polish/11-CONTEXT.md` — The RSC + client-shell + DTO decisions: D-02 (extract shared logic to `lib/`), D-05 (DTO types in `lib/dto.ts`), D-04 (client shell starts in select-mode when initial data present). Phase 12 replicates this shape for home and habits.
- `.planning/phases/10-cards-hydration-api-parallelization/10-RESEARCH.md` — Complete RSC + client shell + DTO pattern documentation; `Promise.all`/`Promise.allSettled` parallelization; DTO serialization pitfalls (Date handling, useEffect double-fetch)
- `.planning/phases/10-cards-hydration-api-parallelization/10-01-PLAN.md` — Concrete RSC conversion plan (`CardsPage` → `CardsClient`); the exact structural pattern to replicate for `HomeClient` and `HabitsClient`

### Key Source Files
- `app/page.tsx` — Current `'use client'` home page (252 lines); `loadStats` / `loadActivity` useEffect fetches; `heroState` derivation; pull-to-refresh `handleSync`; band-up confetti; renders `<HabitTracker />` (no props)
- `app/habits/page.tsx` — Current `'use client'` habits page (281 lines); `days===null` → `<HabitsLoading />` flash; all derivations via `useMemo` from `days`/`today`/`goal`; fetches `/api/activity` + `/api/stats` (masteredCount only)
- `components/HabitTracker.tsx` — `'use client'`; self-fetches `/api/activity` on mount (lines 30–40); milestone + haptic + comeback/at-risk logic; gains the optional `initialActivity` prop per D-09
- `lib/habit.ts` — Pure habit computations: `habitDateStr`, `localDateStr`, `computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `shiftDate`, `formatDuration`, `DayRecord` interface, `DEFAULT_GOAL_SECONDS`, `DEFAULT_DAY_START_HOUR`. Reused unchanged (purity-gated to effects/handlers)
- `lib/dto.ts` — Existing shared DTO types (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`, `LessonRefDTO`); extend with `StatsDTO` + `ActivityDTO` per D-06
- `app/api/stats/route.ts` — GET handler: 5 parallel Prisma queries (`Promise.all`); returns `{ totalCards, dueCards, totalLessons, cardsByType, masteredCount }`. Delegates to `lib/dashboard.ts:getStats()` per D-05
- `app/api/activity/route.ts` — GET handler: 3 parallel queries; returns `{ days, dailyGoalSeconds, dayStartHour }`. Delegates to `lib/dashboard.ts:getActivityData()` per D-05. POST handler (study-time logging) stays untouched
- `app/habits/loading.tsx` — Phase 9 skeleton (`bg-surface-3 animate-pulse`, content-shaped); reused for the one-tick loading state per D-02
- `lib/proficiency.ts` — `computeProficiency(masteredCount)`; used by home (band-up detection) and habits (ProficiencyArc)
- `lib/copy.ts` — `bandUpMessage`, `comebackMessage` (warm copy); reused in `HomeClient` / `HabitTracker`
- `lib/usePullToRefresh.ts` — `usePullToRefresh` hook + `PULL_THRESHOLD`; stays in `HomeClient`

### Project Conventions
- `CLAUDE.md` — All project conventions: `'use client'` must be first line; DTO pattern (no raw Prisma Dates across boundary); `interface Props` naming; semantic tokens only; dark mode mirror rule; `react-hooks/purity` and `react-hooks/set-state-in-effect` lint rules
- `.planning/codebase/ARCHITECTURE.md` — Data flow for home (`/`) and habits (`/habits`); API route inventory; module boundaries (`lib/` pure, `app/api/` thin handlers)
- `.planning/codebase/CONVENTIONS.md` — Client/server boundary rules; `Promise.allSettled` for graceful batch failure; non-blocking writes `.catch(() => {})`; purity rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/habit.ts` — All habit computations are pure and already serializable-input (`DayRecord[]` of strings + numbers). `computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `computeHabitInsight`, `shiftDate`, `habitDateStr` are reused unchanged in `HabitsClient` (and `HabitTracker`). No `Date` objects in the data — `DayRecord.date` is `"YYYY-MM-DD"`.
- `lib/dto.ts` — Existing DTO home; extend with `StatsDTO` + `ActivityDTO`. Both payloads are already primitives (no `Date` serialization needed), so the DTOs are thin but required by RSC-05.
- `lib/proficiency.ts:computeProficiency()` — Pure; used by `HomeClient` (band-up detection, `level` for StatsBar) and `HabitsClient` (ProficiencyArc masteredCount).
- `app/habits/loading.tsx` — Phase 9 skeleton, content-shaped; reuse for the one-tick `today`-resolving state (D-02) so no new skeleton shapes are invented.
- Client islands already `'use client'`: `HabitHeatmap`, `ProgressRing`, `ProficiencyArc`, `MilestoneCelebration`, `HabitTracker`, `StatsBar` (presentational, server-compatible). All render as children of the RSC pages / shells unchanged.

### Established Patterns
- **RSC + client shell + DTO** (Phase 10/11): `app/page.tsx` and `app/habits/page.tsx` become `async` server components; fetch via `lib/dashboard.ts`; serialize to DTO; render `<HomeClient initialStats initialActivity />` / `<HabitsClient initialDays initialGoal initialDayStartHour initialMasteredCount />`. The shells start with non-null initial data so there is no empty-state flash on first paint (the only brief loading is the one-tick `today` resolution per D-02).
- **`lib/` DRY extraction** (Phase 11 D-02): `lib/dashboard.ts` is the single source of truth for stats/activity queries, shared by RSC pages and API routes.
- **`Promise.all` parallel Prisma queries**: `/api/stats` (5 queries) and `/api/activity` (3 queries) already parallelize. `lib/dashboard.ts` preserves this; wrap in try/catch for graceful degradation consistent with the codebase convention.
- **Purity-gated time reads**: `new Date()` / `habitDateStr()` are called in effects/handlers only, with `Promise.resolve().then(() => setState(...))` to satisfy `react-hooks/set-state-in-effect` (see current `app/page.tsx` lines 82–103). Phase 12 keeps this; no `useState` initializer calling `new Date()`.
- **Non-blocking client saves**: home's post-sync refetch uses `.then()`/`.catch(() => {})` per convention.

### Integration Points
- `lib/dashboard.ts` → imported by `app/page.tsx` (home RSC), `app/habits/page.tsx` (habits RSC), `app/api/stats/route.ts`, `app/api/activity/route.ts`.
- `lib/dto.ts` → imported by both RSC pages, both client shells (`HomeClient`, `HabitsClient`), and the API routes for consistent type shapes.
- `HomeClient` → receives `initialStats: StatsDTO` and `initialActivity: ActivityDTO`; renders `StatsBar`, `<HabitTracker initialDays initialToday initialGoal />` (D-09), `ProficiencyArc`; owns pull-to-refresh + band-up + greeting + heroState.
- `HabitsClient` → receives `initialDays: DayRecord[]`, `initialGoal`, `initialDayStartHour`, `initialMasteredCount`; renders `HabitHeatmap`, `ProgressRing`, `ProficiencyArc`; owns `today` effect + all `useMemo` derivations.
- `HabitTracker` → new optional `initialActivity` props (D-09); when present, skips self-fetch. Only call site is `HomeClient`.

</code_context>

<specifics>
## Specific Ideas

- **One-tick skeleton swap on habits:** `HabitsClient` initializes `today=''`, renders `<HabitsLoading />` (reused from `app/habits/loading.tsx`) while `today` is empty, computes `today = habitDateStr(dayStartHour)` in a `useEffect` (using the established `Promise.resolve().then(() => setToday(...))` pattern to satisfy `set-state-in-effect`), then renders the full habits layout once `today` is set. The `days`/`goal`/`masteredCount` data is already present from RSC props — only `today` is pending.

- **Home hero pulse parity:** `HomeClient` keeps the existing `heroState='loading'` `bg-surface-2 animate-pulse` block; `heroState` is derived in an effect from `initialStats` + `initialActivity` + client-local `today` (same logic as current `app/page.tsx` lines 90–103, but operating on props instead of fetched state). The pulse shows for one tick, then the real A/B/C hero renders.

- **`lib/dashboard.ts` signature concept:**
  ```ts
  // No 'use client' — server-only.
  export async function getStats(): Promise<StatsDTO> { /* Promise.all of 5 Prisma queries */ }
  export async function getActivityData(): Promise<ActivityDTO> { /* Promise.all of 3 */ }
  ```
  Both RSC pages and the two GET routes call these. The API routes stay thin: `export async function GET() { return NextResponse.json(await getStats()) }`.

- **`HabitTracker` prop sketch (D-09):**
  ```tsx
  interface Props {
    initialDays?: DayRecord[]
    initialToday?: string
    initialGoal?: number
  }
  // In useEffect: if !initialDays, fetch /api/activity (current behavior); else seed from props.
  ```

- **Band-up detection stays client-side** (success criteria #4): `HomeClient.loadStats`-equivalent compares `computeProficiency(initialStats.masteredCount).band` to `localStorage['lastBand']`; on mismatch, shows `bandUpMessage` + lazy-imports `canvas-confetti`. The only change: it reads `masteredCount` from `initialStats` props on first run (no fetch), and re-runs after a pull-to-refresh sync via the `/api/stats` refetch.

</specifics>

<deferred>
## Deferred Ideas

- **Home `loading.tsx` skeleton (`app/loading.tsx`)** — The home route has no `loading.tsx` (Phase 9 added skeletons to `/cards`, `/study`, `/habits` but not `/`). RSC conversion eliminates the first-load empty hero flash (success criteria #1). Client-side *navigation-to-home* jank is a separate skeleton concern that belongs to a skeleton/nav phase (Phase 9 territory — SKEL-01..04), not this hydration phase. Noted for the roadmap backlog; not acted on here.

- **Stale home data freshness** — After RSC, home stats/activity are snapshot from server render time. If the user studies in another tab and returns, the home page will not reflect the new state until a pull-to-refresh. Accepted tradeoff (same nature as Phase 11's deferred "stale card freshness on session start"). A TTL/auto-refresh is a future polish item.

- **Trimming `cardsByType` from the home/habits stats fetch** — `getStats()` returns the full stats object (including `cardsByType`, which only `/wrapped` uses) to keep one DRY function shared with the API route. A trimmed `getStatsForDashboard()` variant is possible but not worth the split; minor over-fetch is acceptable for a single-user app.

</deferred>

---

*Phase: 12-home-habits-hydration*
*Context gathered: 2026-06-30*
