# Phase 12: Home & Habits Hydration - Research

**Researched:** 2026-06-30
**Domain:** Next.js 16 App Router RSC conversion, React 19 server/client component boundary, DTO serialization, Prisma concurrent queries, client-local time resolution
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### User-Local Time Handling (greeting + habit "today")

- **D-01: Client-correct time.** The time-aware greeting and the habit-day "today" string depend on the user's local clock; the Vercel server runs UTC and cannot compute them correctly. Both are computed client-side from the user's local clock. Correctness for every timezone wins over a fully-instant server approximation. `habitDateStr()` / `localDateStr()` stay purity-rule-gated to effects/handlers (never bare in render) — no `react-hooks/purity` exceptions are introduced.

- **D-02: Brief skeleton tick until `today` resolves.** On the habits page, the existing Phase 9 `HabitsLoading` skeleton renders for one effect tick until `today` is computed client-side, then swaps in the real streak/heatmap/trend. No purity-exception (e.g., `useState` initializer calling `new Date()`) is introduced. Consequence: the home hero keeps its existing `heroState='loading'` pulse for one tick too, because `heroState` depends on client-local `today` (the goal-met check). This is consistent with the current design and the "no empty flash" success criteria — the intentional skeleton is the desired loading state, not an empty-state flash.

#### Habits Page Architecture

- **D-03: `HabitsClient` shell (matches the Phase 10/11 client-shell pattern).** `app/habits/page.tsx` becomes an `async` server component that fetches `days`, `dailyGoalSeconds`, `dayStartHour` (via `lib/dashboard.ts`) and `masteredCount` (via `lib/dashboard.ts`), serializes them to DTO props, and renders `<HabitsClient initialDays={...} initialGoal={...} initialDayStartHour={...} initialMasteredCount={...} />`. `HabitsClient` computes `today` in an effect (skeleton tick per D-02), then all derivations (`computeStreaks`, `computeHabitStats`, trend, heatmap weeks, `computeHabitInsight`) via `useMemo` — exactly the same shape as `CardsClient` / `StudyClient`. The pure habit functions in `lib/habit.ts` are reused unchanged. Client islands (`HabitHeatmap`, `ProgressRing`, `ProficiencyArc`) render as children of the shell.

- **D-04: No client refetch on habits.** The habits page has no pull-to-refresh and no data-mutating interactivity, so all data arrives via RSC props and no `/api/stats` or `/api/activity` call is made from the client. The habits RSC is the sole data source for this route.

#### Shared Dashboard Data Module

- **D-05: Extract `lib/dashboard.ts`.** Create `lib/dashboard.ts` with `getStats()` and `getActivityData()` server-only functions. The home RSC, the habits RSC, and the `/api/stats` + `/api/activity` GET routes all call these — one source of truth per query set, no duplication. This matches the Phase 11 D-02 precedent (`lib/study-cards.ts` extracted so the RSC page and API route stay DRY). `getStats()` returns the full stats object (`totalCards`, `dueCards`, `totalLessons`, `cardsByType`, `masteredCount` — same as the current `/api/stats` response); home and habits select the fields they need. `getActivityData()` returns `{ days, dailyGoalSeconds, dayStartHour }` (same as the current `/api/activity` response). Both use `Promise.all` over Prisma (the existing routes already parallelize — preserve that).

- **D-06: DTO types extend `lib/dto.ts`.** Add `StatsDTO` and `ActivityDTO` to the existing `lib/dto.ts` alongside `CardDTO` / `SentenceDTO` / `ReviewDTO` / `LessonDTO` / `LessonRefDTO` (Phase 11 D-05 precedent — one file for all shared DTO types). `DayRecord` is reused from `lib/habit.ts` as the `ActivityDTO.days[]` element type — it is already serializable (`{ date: "YYYY-MM-DD", seconds, reviews? }`, no `Date` objects). Note: the stats and activity payloads are already primitives (no raw `Date` objects cross the boundary today), but RSC-05 still requires formal DTO types at the prop boundary.

#### Home Page Architecture (carried forward from the pattern)

- **D-07: `HomeClient` shell.** `app/page.tsx` becomes an `async` server component that fetches stats + activity (via `lib/dashboard.ts`), serializes to DTO, and renders `<HomeClient initialStats={...} initialActivity={...} />`. `HomeClient` retains all client-only interactivity: pull-to-refresh (`usePullToRefresh` → `POST /api/sync` → re-fetch via `/api/stats` + `/api/activity`), band-up detection (localStorage `lastBand` comparison + confetti — success criteria #4), the time-aware greeting (client-local per D-01), and the derived `heroState` (client-local `today` per D-02). `StatsBar`, `HabitTracker`, `ProficiencyArc` render as children.

- **D-08: API routes stay (home post-sync refetch).** `/api/stats` and `/api/activity` GET routes are NOT removed. They delegate to `lib/dashboard.ts` getters and serve the home page's client-side refetch after a pull-to-refresh sync (success criteria #3). The POST `/api/activity` handler (study-time logging) is untouched.

#### HabitTracker Data Contract (the agent's discretion — user deferred)

- **D-09: Add an optional `initialActivity` prop to `HabitTracker`.** Today `HabitTracker` self-fetches `/api/activity` on mount, and home also fetches it — a duplicate request. `HabitTracker` gains optional props `initialDays`, `initialToday`, `initialGoal`; when present, it skips the `useEffect` self-fetch and seeds state from the props (then proceeds exactly as today: milestone detection, haptic on ring close, comeback/at-risk messages). This eliminates the duplicate `/api/activity` fetch on home. Verified safe: `HabitTracker` is used only on `app/page.tsx` (grep-confirmed — not on `/study` or `/wrapped`), so the contract change has no other call sites to update. When the props are absent (defensive), it falls back to the self-fetch, so the component stays usable in isolation.

### the agent's Discretion

- The exact effect mechanism that computes `today` client-side and swaps the skeleton for real content (one tick) — follow the established `Promise.resolve().then(() => setState(...))` pattern used in the current home page to satisfy `react-hooks/set-state-in-effect`, or a `useEffect` with the skeleton gate; the planner picks.
- Whether `HomeClient` re-fetches both stats and activity after sync (current behavior) or only activity — keep current behavior (both) unless the planner finds a reason to narrow it.
- Skeleton shapes for the habits one-tick loading state: reuse the existing `app/habits/loading.tsx` shapes for visual consistency (do not invent new skeleton shapes).
- Spinner/loading indicator for the home hero one-tick pulse: keep the existing `heroState='loading'` `bg-surface-2 animate-pulse` block.

### Deferred Ideas (OUT OF SCOPE)

- **Home `loading.tsx` skeleton (`app/loading.tsx`)** — The home route has no `loading.tsx` (Phase 9 added skeletons to `/cards`, `/study`, `/habits` but not `/`). RSC conversion eliminates the first-load empty hero flash (success criteria #1). Client-side *navigation-to-home* jank is a separate skeleton concern that belongs to a skeleton/nav phase (Phase 9 territory — SKEL-01..04), not this hydration phase. Noted for the roadmap backlog; not acted on here.

- **Stale home data freshness** — After RSC, home stats/activity are snapshot from server render time. If the user studies in another tab and returns, the home page will not reflect the new state until a pull-to-refresh. Accepted tradeoff (same nature as Phase 11's deferred "stale card freshness on session start"). A TTL/auto-refresh is a future polish item.

- **Trimming `cardsByType` from the home/habits stats fetch** — `getStats()` returns the full stats object (including `cardsByType`, which only `/wrapped` uses) to keep one DRY function shared with the API route. A trimmed `getStatsForDashboard()` variant is possible but not worth the split; minor over-fetch is acceptable for a single-user app.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSC-03 | Home page receives stats and activity data from the server — no empty hero flash on first load | RSC conversion: `app/page.tsx` becomes `async` server component; fetches via `lib/dashboard.ts:getStats()` + `getActivityData()`; serializes to `StatsDTO`/`ActivityDTO`; renders `<HomeClient initialStats initialActivity />`. The hero shows the one-tick `heroState='loading'` pulse (D-02) then the real A/B/C hero — no empty flash. |
| RSC-04 | Habits page receives activity data from the server — no empty heatmap flash on first load | RSC conversion: `app/habits/page.tsx` becomes `async` server component; fetches via `lib/dashboard.ts`; renders `<HabitsClient initialDays initialGoal initialDayStartHour initialMasteredCount />`. The one-tick `<HabitsLoading />` skeleton (D-02) shows while client-local `today` resolves, then the real streak/heatmap/trend renders — no empty-heatmap flash. |
| RSC-05 (carried forward) | All server-to-client prop boundaries use DTO types (Dates serialized as ISO strings or numbers — no raw Prisma Date objects passed to client components) | `StatsDTO` + `ActivityDTO` added to `lib/dto.ts` (D-06). Stats payload is already primitives (`number`/`{type, _count}`); activity payload is already primitives (`DayRecord.date` is `"YYYY-MM-DD"`, no `Date`). DTOs are a formal requirement at the prop boundary — confirmed by codebase read of `app/api/stats/route.ts`, `app/api/activity/route.ts`, `lib/habit.ts:DayRecord`. |
</phase_requirements>

---

## Project Constraints (from AGENTS.md)

> **CRITICAL — AGENTS.md directive:** "This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."

This directive was honored during research. The relevant Next.js 16 guides were read directly from `node_modules/next/dist/docs/01-app/01-getting-started/`:

- `05-server-and-client-components.md` — confirms the RSC + client-shell composition pattern, the `'use client'` boundary rule, and the **serializable-props constraint** ("Props passed to Client Components need to be serializable by React"). [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`]
- `06-fetching-data.md` — confirms async server components can fetch via ORM directly (the `lib/dashboard.ts` pattern), and documents `Promise.all` for parallel fetches with `Promise.allSettled` for graceful failure. [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`]
- `02-guides/data-security.md` §"Passing data from server to client" — confirms Server Components can access databases/secrets safely while Client Components cannot, and documents the optional `server-only` package for guarding server modules. [CITED: `node_modules/next/dist/docs/01-app/02-guides/data-security.md`]

**Key finding from the docs (no breaking-change surprise for this phase):** the RSC + client-shell + DTO pattern shipped in Phases 10/11 is exactly the pattern the Next.js 16 docs prescribe. No deprecation notices in the read sections affect this phase. The codebase already runs Next.js 16.2.1 + React 19.2.4, so Phase 12 is a direct replication of an already-working pattern on the same version — no version drift, no new API surface to learn.

**Other project constraints (from `CLAUDE.md` / `.claude/CLAUDE.md`):**
- **No new npm packages** — STATE.md: "every v1.2 pattern (RSC, loading.tsx, Promise.all, Suspense) is built into Next.js 16 + React 19". Phase 12 installs nothing.
- **ESLint strict:** `react-hooks/purity` (no `Date.now()`/`new Date()`/`Math.random()` in render) and `react-hooks/set-state-in-effect` (no synchronous `setState` in effect bodies). Both bite this phase because of D-01/D-02 (client-local `today`). Lint must stay clean.
- **`'use client'` always first line** — before any imports.
- **`interface Props`** naming convention — not `ComponentNameProps`.
- **No barrel `index.ts` files** — import each file directly via `@/` path alias.
- **Semantic CSS tokens only** — `bg-surface-1/2/3`, `bg-reward`, `bg-reward-soft`, `text-cat-vocab`, `text-muted`, etc. No literal `bg-orange-*` / `bg-blue-*`.
- **Dark mode mirror rule** — any new CSS value must appear in both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]` blocks in `globals.css`. Phase 12 introduces no new colors, so no mirror entries needed.
- **Color reservation:** blue (`--button`) is reserved for actions; `--reward` for streaks/goal/celebration; `--cat-vocab` for stat numbers. Preserve the existing reservation (UI-SPEC §Color).
- **API routes:** wrap in `try/catch`, validation errors → 400, unexpected → 500. `lib/dashboard.ts` is a library module — it throws on unexpected input; callers (RSC pages, API routes) handle errors.
- **Async patterns:** `async/await` throughout; `Promise.allSettled` for graceful batch failure; non-blocking writes use `.catch(() => {})`.
- **`lib/` server-only modules** carry a `// No 'use client — this module runs server-side only.` comment (precedent: `lib/study-cards.ts`, `lib/settings.ts`).
- **`prisma db push` / `prisma migrate` do NOT work against Turso** — Phase 12 makes no schema changes, so this is a non-issue.
- **Vercel Hobby 60s function timeout** — `lib/dashboard.ts` queries are sub-second (5 + 3 Prisma `count`/`groupBy`/`findMany`); no timeout concern.

---

## Summary

Phase 12 is a **direct replication of the RSC + client-shell + DTO pattern already shipped in Phases 10 (`/cards`) and 11 (`/study`)**, applied to the two remaining dashboard routes: `/` (home) and `/habits`. No new capabilities, no new dependencies, no schema changes, no new visual design (the 12-UI-SPEC is a preserve-mode contract). The work is purely: (1) extract `lib/dashboard.ts` as the DRY server-only data layer (D-05, mirroring the `lib/study-cards.ts` precedent), (2) add `StatsDTO` + `ActivityDTO` to `lib/dto.ts` (D-06), (3) convert `app/page.tsx` → `HomeClient` shell + `app/habits/page.tsx` → `HabitsClient` shell (D-03, D-07), (4) preserve client-local time resolution via a one-tick skeleton/pulse swap (D-01, D-02), and (5) add optional `initialActivity` props to `HabitTracker` to kill the duplicate `/api/activity` fetch on home (D-09).

The RSC conversion eliminates the empty-state flash that today happens because React hydrates the `'use client'` page before the `useEffect` fetch resolves. After conversion, the home hero and the habits streak/heatmap arrive with the initial HTML — the only permitted loading is the intentional one-tick skeleton/pulse while the user's local clock resolves `today` (D-02: the Vercel server runs UTC and cannot compute the habit-day "today" or the time-aware greeting; both stay client-side per D-01).

The API routes `/api/stats` and `/api/activity` (GET) stay (D-08) — they delegate to `lib/dashboard.ts` and serve the home page's post-sync refetch after pull-to-refresh (success criteria #3). The POST `/api/activity` handler (study-time logging) is untouched.

**Primary recommendation:** Replicate the Phase 11 shape exactly. `app/page.tsx` and `app/habits/page.tsx` become `async` server components that `await Promise.all([getStats(), getActivityData()])` from `lib/dashboard.ts`, serialize to DTO props, and render `<HomeClient initialStats initialActivity />` / `<HabitsClient initialDays initialGoal initialDayStartHour initialMasteredCount />`. Both shells initialize state from props (no initial-load `useEffect` fetch), compute `today` in a `useEffect` using `Promise.resolve().then(() => setToday(...))`, and gate the first real render on `today !== ''`. `HomeClient` keeps pull-to-refresh + band-up + greeting + `heroState`; `HabitsClient` keeps all `useMemo` derivations; `HabitTracker` gains optional `initialDays`/`initialToday`/`initialGoal` (D-09).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Initial stats fetch (totalCards, dueCards, totalLessons, cardsByType, masteredCount) | API / Backend (RSC) | — | `lib/dashboard.ts:getStats()` runs 5 Prisma `count`/`groupBy` queries at server render time; data arrives with the HTML. Mirrors Phase 11 `lib/study-cards.ts` precedent. |
| Initial activity fetch (days, dailyGoalSeconds, dayStartHour) | API / Backend (RSC) | — | `lib/dashboard.ts:getActivityData()` runs 3 parallel Prisma/settings queries at server render time. |
| `today` (habit-day) resolution | Browser / Client | — | Depends on user's local clock (D-01); Vercel server runs UTC. Computed in `useEffect` via `habitDateStr(dayStartHour)`. One-tick skeleton/pulse gates first real render (D-02). |
| Time-aware greeting | Browser / Client | — | Same reason — local hour needed. `useEffect` + `Promise.resolve().then(setGreeting)`. |
| `heroState` derivation (A/B/C/loading) | Browser / Client | — | Depends on client-local `today` for goal-met check (D-02). Derived in `useEffect` from `initialStats` + `initialActivity` + `today`. |
| Pull-to-refresh → sync → refetch | Browser / Client | API / Backend | `usePullToRefresh(handleSync)` lives in `HomeClient` (client-only touch handling). `handleSync` POSTs `/api/sync` then calls `loadStats()`/`loadActivity()` (client refetch via the surviving GET routes, D-08). |
| Band-up confetti/banner | Browser / Client | — | `localStorage['lastBand']` comparison + lazy `import('canvas-confetti')`. Success criteria #4. Stays in `HomeClient`. |
| Streak / heatmap / trend / insight derivations | Browser / Client | — | `computeStreaks`, `computeHabitStats`, `computeHabitInsight` are pure functions of `(days, today, goal)`. All `useMemo`-derived in `HabitsClient` (and `HabitTracker`) from RSC-provided `days` + client `today`. |
| HabitTracker self-fetch (fallback) | Browser / Client | API / Backend | When `initialDays`/`initialToday`/`initialGoal` props are absent (D-09 defensive path), `HabitTracker` self-fetches `/api/activity` as today. On home, props ARE provided, so the self-fetch is skipped — eliminates the duplicate request. |
| Shared stats/activity query logic | API / Backend (`lib/dashboard.ts`) | — | Single source of truth. Called by both RSC pages AND both GET API routes (D-05). Mirrors `lib/study-cards.ts` pattern. |
| DTO type definitions | API / Backend (`lib/dto.ts`) | Browser / Client | Types shared at the boundary — defined once, imported by RSC pages, client shells, and API routes. `StatsDTO` + `ActivityDTO` added here (D-06). |
| Post-sync client refetch (stats/activity) | Browser / Client | API / Backend | `/api/stats` + `/api/activity` GET routes stay (D-08); they delegate to `lib/dashboard.ts` and serve the home page's refetch after a pull-to-refresh sync. |
| Study-time logging (POST /api/activity) | API / Backend | Browser / Client (StudySession flush) | Untouched by this phase. |

---

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.1 | App Router RSC, async page components, `loading.tsx` | Already in use; the RSC + client-shell pattern is built in. [VERIFIED: `package.json` via `.claude/CLAUDE.md` stack section] |
| React | 19.2.4 | Server Components, `'use client'` boundary, `Promise.resolve().then(setState)` microtask pattern | Already in use; the purity + set-state-in-effect lint rules are React 19 / `eslint-config-next` 16 features. [VERIFIED: codebase] |
| Prisma | 7.6.0 | ORM; `prisma.card.count`, `prisma.cardReview.count`, `prisma.lesson.count`, `prisma.card.groupBy`, `prisma.studyDay.findMany` called from `lib/dashboard.ts` | Already in use; the existing `/api/stats` + `/api/activity` routes already run these exact queries. [VERIFIED: `app/api/stats/route.ts`, `app/api/activity/route.ts`] |
| TypeScript | 5.9.3 | DTO type definitions, strict mode | Already in use. [VERIFIED: `.claude/CLAUDE.md` stack section] |
| `canvas-confetti` | 1.9.4 | Band-up confetti (success criteria #4) | Already in use on the home page (`import('canvas-confetti')` lazy import, `app/page.tsx:56`). Preserved unchanged. [VERIFIED: codebase] |
| `lucide-react` | 1.17.0 | `CheckCircle2` icon in hero state B | Already in use on home. Preserved unchanged. [VERIFIED: `app/page.tsx:13`] |

**No installation needed.** All patterns are built into the existing stack. STATE.md: "No new npm packages — every v1.2 pattern (RSC, loading.tsx, Promise.all, Suspense) is built into Next.js 16 + React 19".

### Supporting (existing modules reused unchanged)

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `lib/habit.ts` | Pure habit computations: `habitDateStr`, `localDateStr`, `computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `shiftDate`, `formatDuration`, `DayRecord`, `DEFAULT_GOAL_SECONDS`, `DEFAULT_DAY_START_HOUR` | Imported by `HabitsClient`, `HabitTracker`, `HomeClient` (for `habitDateStr`). All pure — safe server + client. `DayRecord` is the `ActivityDTO.days[]` element type (already serializable). [VERIFIED: `lib/habit.ts` code read] |
| `lib/proficiency.ts` | `computeProficiency(masteredCount)` → `{ band, label, masteredCount, withinBandPct, nextBand }` | Imported by `HomeClient` (band-up detection, `level` for StatsBar) and `HabitsClient`/`ProficiencyArc` (masteredCount). Pure. [VERIFIED: `CLAUDE.md` key files] |
| `lib/copy.ts` | `bandUpMessage`, `comebackMessage` (pure warm-copy) | `HomeClient` band-up banner; `HabitTracker` comeback pill. Pure. [VERIFIED: `CLAUDE.md` key files] |
| `lib/usePullToRefresh.ts` | `usePullToRefresh` hook + `PULL_THRESHOLD` | Stays in `HomeClient` (success criteria #3). Client-only. [VERIFIED: `app/page.tsx:11`] |
| `lib/settings.ts` | `getDailyGoalSeconds()`, `getDayStartHour()` (async, return `Promise<number>`) | Called by `lib/dashboard.ts:getActivityData()` (server-side). Already called by `/api/activity` GET route today. [VERIFIED: `lib/settings.ts` code read] |
| `lib/dto.ts` | Existing shared DTO home (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`, `LessonRefDTO`) | Extended with `StatsDTO` + `ActivityDTO` per D-06. [VERIFIED: `lib/dto.ts` code read] |
| `lib/study-cards.ts` | Phase 11's server-only extraction precedent | **Reference implementation for `lib/dashboard.ts`** — same shape: `// No 'use client` header comment, `export async function get...(): Promise<...DTO>`, called by both RSC page and API route. [VERIFIED: `lib/study-cards.ts` code read] |
| `app/habits/loading.tsx` | Phase 9 `HabitsLoading` skeleton (`bg-surface-3 animate-pulse`, content-shaped) | Reused for the one-tick `today`-resolving state on habits (D-02). Do not invent new skeleton shapes. [VERIFIED: `app/habits/loading.tsx` code read] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lib/dashboard.ts` shared module | Inline the queries in each RSC page + leave them in the API routes | Rejected (D-05): duplication, maintenance burden. The `lib/study-cards.ts` precedent (Phase 11 D-02) is the locked pattern — one source of truth per query set. |
| `Promise.all` in `lib/dashboard.ts` | `Promise.allSettled` for graceful degradation | Keep `Promise.all` (matches existing `/api/stats` and `/api/activity` route code, which both use `Promise.all`). The queries are all critical (stats route returns 500 on any failure today); graceful degradation is not the established pattern here. [VERIFIED: `app/api/stats/route.ts`, `app/api/activity/route.ts`] |
| `useState` initializer calling `habitDateStr()` | `useEffect` + `Promise.resolve().then(setToday)` | Rejected (D-02): a `useState` initializer calling `new Date()` violates `react-hooks/purity`. The `Promise.resolve().then(() => setState(...))` pattern is the established lint-safe approach (already used in `app/page.tsx:84,97-101`). |
| `server-only` package to guard `lib/dashboard.ts` | `// No 'use client` comment | Use the comment (precedent: `lib/study-cards.ts`, `lib/settings.ts`). Next.js 16 docs say `server-only` is "optional"; installing it contradicts the "no new packages" constraint. [CITED: `node_modules/next/dist/docs/01-app/02-guides/data-security.md`] |
| `React.cache` for `getStats()`/`getActivityData()` | Plain async functions | Rejected: `React.cache` is for de-duplicating calls within a single request when the same function is called from multiple components. Here each RSC page calls each getter once; no de-dup benefit. STATE.md explicitly defers cross-request caching (`PERF-F2`: "staleness risk outweighs gain for single-user app"). [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`] |

**Installation:**
```bash
# No installation. Phase 12 installs zero packages.
```

**Version verification:** Not applicable — no packages are installed or version-checked in this phase. The stack is locked at Next.js 16.2.1 / React 19.2.4 / Prisma 7.6.0 / TypeScript 5.9.3 (per `.claude/CLAUDE.md` stack section, all [VERIFIED: codebase]).

---

## Package Legitimacy Audit

> **Step 1 SKIPPED — Phase 12 installs zero external packages.** Per STATE.md ("No new npm packages — every v1.2 pattern (RSC, loading.tsx, Promise.all, Suspense) is built into Next.js 16 + React 19") and 12-CONTEXT.md (no `npm install` in any decision). The Package Legitimacy Gate protocol does not apply: there are no packages to run through `gsd-tools query package-legitimacy check`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No packages installed this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No `npm install` commands appear in any task in this phase. The only existing dynamic import on these surfaces is `import('canvas-confetti')` in the home band-up path — already vetted and in use since v1.1; preserved unchanged.*

---

## Architecture Patterns

### System Architecture Diagram

```
FIRST LOAD (RSC path — the core of Phase 12):

  Browser → GET /            (home)
    → app/page.tsx (Server Component, async)
      → await Promise.all([ getStats(), getActivityData() ])   ← lib/dashboard.ts
          ├─ getStats():        Promise.all of 5 Prisma count/groupBy queries
          └─ getActivityData(): Promise.all of [studyDay.findMany, getDailyGoalSeconds, getDayStartHour]
      → serialize to { stats: StatsDTO, activity: ActivityDTO }   (no Date objects — all primitives)
      → render HTML with hydrated hero (one-tick pulse) + StatsBar + HabitTracker + ProficiencyArc
      → <HomeClient initialStats={stats} initialActivity={activity} />
    → HTML stream → browser paints real hero (after one-tick pulse) immediately

  Browser → GET /habits
    → app/habits/page.tsx (Server Component, async)
      → await Promise.all([ getActivityData(), getStats() ])     ← lib/dashboard.ts (selects masteredCount)
      → serialize to DTO props
      → render <HabitsClient initialDays initialGoal initialDayStartHour initialMasteredCount />
    → HTML stream → browser paints HabitsLoading skeleton (one tick) then real streak/heatmap

POST-SYNC REFRESH (home only — success criteria #3, D-08):

  Browser (HomeClient) → pull-to-refresh engaged
    → handleSync(): POST /api/sync (syncs Google Doc)
    → loadStats():   GET /api/stats    → delegates to lib/dashboard.ts:getStats()
    → loadActivity(): GET /api/activity → delegates to lib/dashboard.ts:getActivityData()
    → setStats/setActivityData → heroState re-derived in effect

CLIENT-LOCAL TIME (D-01/D-02 — both routes):

  HomeClient / HabitsClient mount
    → useEffect: today = habitDateStr(dayStartHour)   (client-local clock; server is UTC — cannot compute)
    → Promise.resolve().then(() => setToday(today))    (satisfies react-hooks/set-state-in-effect)
    → one render tick with today='' → heroState='loading' pulse (home) / <HabitsLoading/> (habits)
    → next tick: real A/B/C hero / real streak+heatmap render

HabitTracker ON HOME (D-09):

  HomeClient renders <HabitTracker initialDays initialToday initialGoal />
    → HabitTracker sees all three initialActivity props present → SKIPS /api/activity self-fetch
    → seeds state from props → milestone/haptic/comeback logic proceeds as today
    → (defensive: if props absent, falls back to self-fetch — component stays usable in isolation)
```

### Recommended Project Structure

```
app/
├── page.tsx                    # RSC (async): fetches via lib/dashboard.ts, renders <HomeClient />
├── habits/
│   ├── page.tsx                # RSC (async): fetches via lib/dashboard.ts, renders <HabitsClient />
│   └── loading.tsx             # Phase 9 skeleton — REUSED unchanged for one-tick swap (D-02)
components/
├── HomeClient.tsx             # NEW — 'use client' shell: pull-to-refresh + band-up + greeting + heroState
├── HabitsClient.tsx            # NEW — 'use client' shell: today effect + all useMemo derivations
├── HabitTracker.tsx            # MODIFIED — gains optional initialDays/initialToday/initialGoal props (D-09)
├── StatsBar.tsx                # unchanged (server-compatible; rendered as child of HomeClient)
├── ProficiencyArc.tsx          # unchanged ('use client' island; rendered as child of both shells)
├── HabitHeatmap.tsx            # unchanged ('use client' island; child of HabitsClient)
├── ProgressRing.tsx            # unchanged ('use client' island; child of both shells)
lib/
├── dashboard.ts                # NEW — server-only: getStats() + getActivityData() (D-05)
├── dto.ts                      # MODIFIED — add StatsDTO + ActivityDTO (D-06)
├── habit.ts                    # unchanged (pure; DayRecord reused as ActivityDTO.days[] element type)
├── settings.ts                 # unchanged (getDailyGoalSeconds/getDayStartHour called by lib/dashboard.ts)
├── proficiency.ts              # unchanged
├── copy.ts                     # unchanged
├── usePullToRefresh.ts         # unchanged
app/api/
├── stats/route.ts              # MODIFIED — GET delegates to lib/dashboard.ts:getStats() (D-08)
└── activity/route.ts           # MODIFIED — GET delegates to lib/dashboard.ts:getActivityData() (D-08); POST untouched
```

### Pattern 1: RSC Page + Client Shell (replicate Phase 10/11 exactly)

**What:** The page component is an `async` server component. It fetches data via `lib/dashboard.ts` (NOT via `fetch('/api/...')`), serializes to DTO types, then renders a single `'use client'` component that owns all interactivity. The shell initializes state from props — no initial-load `useEffect` fetch.

**When to use:** Any page where initial data must arrive with the HTML (eliminate empty-state flash) AND interactivity must be preserved (pull-to-refresh, band-up, time-aware greeting).

**Example (home RSC — mirrors `app/study/page.tsx`):**
```typescript
// app/page.tsx — SERVER COMPONENT (no 'use client')
// Source: pattern verified against app/study/page.tsx (Phase 11) + app/cards/page.tsx (Phase 10)
import { getStats, getActivityData } from '@/lib/dashboard'
import HomeClient from '@/components/HomeClient'

export default async function Home() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  return <HomeClient initialStats={stats} initialActivity={activity} />
}
```

**Example (habits RSC):**
```typescript
// app/habits/page.tsx — SERVER COMPONENT (no 'use client')
import { getStats, getActivityData } from '@/lib/dashboard'
import HabitsClient from '@/components/HabitsClient'

export default async function HabitsPage() {
  const [stats, activity] = await Promise.all([getStats(), getActivityData()])
  // Habits page only needs masteredCount from stats; activity carries days/goal/dayStartHour.
  return (
    <HabitsClient
      initialDays={activity.days}
      initialGoal={activity.dailyGoalSeconds}
      initialDayStartHour={activity.dayStartHour}
      initialMasteredCount={stats.masteredCount}
    />
  )
}
```

[CITED: pattern verified against `app/study/page.tsx` (15 lines, Phase 11) and `app/cards/page.tsx` (47 lines, Phase 10); Next.js 16 docs `01-app/01-getting-started/05-server-and-client-components.md` §"Passing data from Server to Client Components" + `06-fetching-data.md` §"With an ORM or database"]

### Pattern 2: `lib/dashboard.ts` — Server-Only DRY Data Module (D-05)

**What:** A server-only module that exports `getStats()` and `getActivityData()`. Both the RSC pages AND the GET API routes call these — one source of truth per query set, no duplication. Mirrors the `lib/study-cards.ts` precedent (Phase 11 D-02).

**Example (full module sketch):**
```typescript
// lib/dashboard.ts — server-only data layer for home + habits dashboards
// No 'use client' — this module runs server-side only.
// Mirrors the lib/study-cards.ts precedent (Phase 11 D-02): one source of truth
// per query set, shared by the RSC pages and the GET API routes.

import { prisma } from '@/lib/prisma'
import { getDailyGoalSeconds, getDayStartHour } from '@/lib/settings'
import type { StatsDTO, ActivityDTO } from '@/lib/dto'

// Same 5 parallel Prisma queries as the current /api/stats GET route.
export async function getStats(): Promise<StatsDTO> {
  const now = new Date()
  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])
  return { totalCards, dueCards, totalLessons, cardsByType, masteredCount }
}

// Same 3 parallel queries as the current /api/activity GET route.
export async function getActivityData(): Promise<ActivityDTO> {
  const [days, dailyGoalSeconds, dayStartHour] = await Promise.all([
    prisma.studyDay.findMany({
      orderBy: { date: 'desc' },
      take: 400,
      select: { date: true, seconds: true, reviews: true },
    }),
    getDailyGoalSeconds(),
    getDayStartHour(),
  ])
  return { days, dailyGoalSeconds, dayStartHour }
}
```

**API routes become thin (D-08):**
```typescript
// app/api/stats/route.ts — GET becomes a one-liner delegating to lib/dashboard.ts
import { NextResponse } from 'next/server'
import { getStats } from '@/lib/dashboard'
// POST handler (study-time logging) stays untouched in app/api/activity/route.ts

export async function GET() {
  return NextResponse.json(await getStats())
}
```

[VERIFIED: query shapes confirmed against `app/api/stats/route.ts` (5 queries) and `app/api/activity/route.ts` GET (3 queries); extraction shape confirmed against `lib/study-cards.ts` (Phase 11 precedent)]

### Pattern 3: DTO Type Additions to `lib/dto.ts` (D-06)

**What:** Add `StatsDTO` and `ActivityDTO` to the existing `lib/dto.ts`. Both payloads are already primitives (no `Date` serialization needed), but the DTOs are a formal RSC-05 requirement at the prop boundary. `DayRecord` is imported from `lib/habit.ts` as the `ActivityDTO.days[]` element type — it is already serializable (`{ date: "YYYY-MM-DD", seconds: number, reviews?: number }`).

**Example:**
```typescript
// Added to lib/dto.ts (alongside the existing CardDTO, SentenceDTO, ReviewDTO, LessonDTO, LessonRefDTO)

import type { DayRecord } from '@/lib/habit'

export interface StatsDTO {
  totalCards: number
  dueCards: number
  totalLessons: number
  // Prisma groupBy returns { type: string, _count: number }[] — match the existing /api/stats shape.
  cardsByType: { type: string; _count: number }[]
  masteredCount: number
}

export interface ActivityDTO {
  // DayRecord.date is "YYYY-MM-DD" (string), seconds is number, reviews is optional number.
  // No Date objects — already serializable.
  days: DayRecord[]
  dailyGoalSeconds: number
  dayStartHour: number
}
```

**Key insight (no Date-serialization work here):** Unlike Phase 10's `CardDTO` (which required `.toISOString()` mapping for `createdAt`/`updatedAt`/`nextReview`/`lastReview`), the stats and activity payloads are already primitives. `StatsDTO` is all numbers + a `groupBy` result shape; `ActivityDTO.days[]` is `DayRecord[]` where `date` is a `"YYYY-MM-DD"` string (set by `habitDateStr()` at write time, not a Prisma `DateTime`). The DTOs are thin but **required by RSC-05** — the prop boundary must have formal types. [VERIFIED: `lib/habit.ts:DayRecord` interface + `app/api/activity/route.ts` GET handler + `app/api/stats/route.ts` GET handler]

### Pattern 4: One-Tick Skeleton/Pulse Swap for Client-Local `today` (D-01, D-02)

**What:** Both shells initialize `today=''` (habits) / `heroState='loading'` (home). They render the skeleton/pulse while `today` is empty, compute `today = habitDateStr(dayStartHour)` in a `useEffect` using the established `Promise.resolve().then(() => setState(...))` pattern (satisfies `react-hooks/set-state-in-effect`), then render the real content on the next tick.

**Why client-side (D-01):** The Vercel server runs UTC. The habit-day "today" (which can roll at 2am local per `dayStartHour`) and the time-aware greeting both depend on the user's local clock. A server approximation would be wrong for every non-UTC timezone. Correctness wins over a fully-instant server render; the one-tick skeleton is the intentional, desired loading state (not an empty-state flash).

**Example (HabitsClient shell — the cleaner of the two):**
```typescript
// components/HabitsClient.tsx — 'use client' (first line, before imports)
'use client'

import { useEffect, useState, useMemo } from 'react'
import HabitsLoading from '@/app/habits/loading'   // reuse Phase 9 skeleton (D-02 discretion)
import { computeStreaks, habitDateStr, /* ... */ } from '@/lib/habit'
import type { DayRecord } from '@/lib/habit'

interface Props {
  initialDays: DayRecord[]
  initialGoal: number
  initialDayStartHour: number
  initialMasteredCount: number
}

export default function HabitsClient({ initialDays, initialGoal, initialDayStartHour, initialMasteredCount }: Props) {
  // Initialize state from RSC props — NO initial-load useEffect fetch.
  const [days] = useState<DayRecord[]>(initialDays)
  const [goal] = useState(initialGoal)
  const [masteredCount] = useState(initialMasteredCount)
  const [today, setToday] = useState('')   // D-02: empty until client-local clock resolves

  // Compute today in an effect (purity-gated — habitDateStr calls new Date() internally).
  // Promise.resolve().then(...) satisfies react-hooks/set-state-in-effect.
  useEffect(() => {
    Promise.resolve().then(() => setToday(habitDateStr(initialDayStartHour)))
  }, [initialDayStartHour])

  // All derivations via useMemo — exactly the same shape as the current app/habits/page.tsx.
  const { current, longest, todaySeconds } = useMemo(
    () => computeStreaks(days, today, goal),
    [days, today, goal]
  )
  // ... computeHabitStats, trend, heatmap weeks, computeHabitInsight ...

  // One-tick skeleton gate (D-02): the intentional loading state, NOT an empty-state flash.
  if (today === '') return <HabitsLoading />
  return (/* ... the full habits layout, unchanged from current app/habits/page.tsx ... */)
}
```

**HomeClient variant:** keeps `heroState` instead of a `today` gate. The hero `heroState='loading'` block (`<div className="h-28 animate-pulse bg-surface-2 rounded-xl" />`) renders for one tick while `heroState` is derived from `initialStats` + `initialActivity` + client-local `today` in a `useEffect` (same logic as current `app/page.tsx:90-103`, operating on props instead of fetched state).

[VERIFIED: `app/page.tsx:82-103` (the `Promise.resolve().then(() => setGreeting(...))` + `setHeroState(...)` pattern), `app/habits/page.tsx:43-58` (the today effect), `app/habits/loading.tsx` (the skeleton to reuse); CITED: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` for the `'use client'` boundary rule]

### Pattern 5: HabitTracker Optional `initialActivity` Props (D-09)

**What:** `HabitTracker` (currently self-fetches `/api/activity` on mount, lines 30-40) gains optional props `initialDays`, `initialToday`, `initialGoal`. When all three are present, it skips the self-fetch and seeds state from props. When absent, it falls back to the existing self-fetch (defensive — component stays usable in isolation).

**Safety (verified):** `HabitTracker` is used in exactly ONE place — `app/page.tsx:6,232` (grep-confirmed). Not on `/study`, `/cards`, `/wrapped`, `/settings`, or `/habits`. The contract change has no other call sites to update.

**Example:**
```typescript
// components/HabitTracker.tsx — MODIFIED (gains optional initialActivity props)
'use client'

interface Props {
  initialDays?: DayRecord[]
  initialToday?: string
  initialGoal?: number
}

export default function HabitTracker({ initialDays, initialToday, initialGoal }: Props) {
  const [days, setDays] = useState<DayRecord[] | null>(initialDays ?? null)
  const [today, setToday] = useState(initialToday ?? '')
  const [goal, setGoal] = useState(initialGoal ?? DEFAULT_GOAL_SECONDS)
  // ... milestone, haptic, comeback state unchanged ...

  useEffect(() => {
    // D-09: if all three initialActivity props are present, skip the self-fetch entirely.
    if (initialDays !== undefined && initialToday !== undefined && initialGoal !== undefined) return
    fetch('/api/activity')
      .then((r) => r.json())
      .then((d) => {
        const hour = d.dayStartHour ?? DEFAULT_DAY_START_HOUR
        setToday(habitDateStr(hour))
        setDays(d.days ?? [])
        setGoal(d.dailyGoalSeconds ?? DEFAULT_GOAL_SECONDS)
      })
      .catch(() => { setToday(habitDateStr(DEFAULT_DAY_START_HOUR)); setDays([]) })
  }, [initialDays, initialToday, initialGoal])

  // ... rest of HabitTracker unchanged: milestone detection, haptic on ring close,
  // comeback pill, at-risk nudge, 7-day week strip ...
}
```

**HomeClient wires the props from its own RSC-provided activity:**
```typescript
// Inside HomeClient.tsx
<HabitTracker
  initialDays={initialActivity.days}
  initialToday={today /* HomeClient's own client-local today */}
  initialGoal={initialActivity.dailyGoalSeconds}
/>
```

**Note on `initialToday`:** `HomeClient` already computes `today = habitDateStr(dayStartHour)` in its own effect (for `heroState`). Pass that same `today` to `HabitTracker` so the two stay in sync and `HabitTracker` doesn't recompute. (Alternatively, pass `initialDayStartHour` and let `HabitTracker` compute its own — either works; the planner picks. The former avoids a duplicate `habitDateStr` call.)

[VERIFIED: `components/HabitTracker.tsx` (current self-fetch at lines 30-40, the `useState` initializers at lines 23-25); grep confirming `HabitTracker` is used only in `app/page.tsx`]

### Pattern 6: `Promise.all` Parallel Prisma Queries (preserve existing)

**What:** `lib/dashboard.ts:getStats()` runs 5 Prisma queries in parallel via `Promise.all`; `getActivityData()` runs 3 (`studyDay.findMany` + 2 settings getters) in parallel. This is the existing pattern in `/api/stats` and `/api/activity` — preserve it exactly.

**Why `Promise.all` (not `Promise.allSettled`) here:** Unlike Phase 10's `/api/cards/due` (where the known-lemmas query was non-critical and degraded gracefully to an empty Set), every query in `getStats()` and `getActivityData()` is critical — if `prisma.card.count()` fails, there is no useful stats object to return. The existing routes return 500 on any failure (implicit via `await Promise.all` rejection → uncaught → Next.js 500). The RSC path lets the throw propagate to the Next.js error boundary (consistent with the codebase convention "No try/catch at RSC page level" from STATE.md). `Promise.all` is the correct, established choice.

**Turso parallel-query behavior:** The STATE.md note "Turso parallel-query rate-limit behavior unconfirmed" was investigated in Phase 10 and confirmed safe in practice — `app/layout.tsx`, `app/api/settings/route.ts`, `app/api/activity/route.ts`, and `app/api/stats/route.ts` ALL already use `Promise.all` against Turso with 3-7 concurrent queries with no rate-limit issues. [VERIFIED: codebase; carried forward from 10-RESEARCH.md A1]

### Anti-Patterns to Avoid

- **Passing raw Prisma `Date` objects as props:** Next.js throws `Error: Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Date objects are not supported.` **For this phase:** the stats/activity payloads are already primitives, so this pitfall is low-risk — but the DTO types are still required (RSC-05). Do NOT pass a raw Prisma `StudyDay` row that includes a `DateTime` field; the `select: { date: true, seconds: true, reviews: true }` in `getActivityData()` already returns `date` as a `"YYYY-MM-DD"` string (it's a `String` column in the schema, not `DateTime`). [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` line 289; VERIFIED: `prisma/schema.prisma` StudyDay model + `lib/habit.ts:DayRecord`]

- **Leaving the initial-load `useEffect` fetch in the shell:** After RSC conversion, the shell's initial data comes from props. Forgetting to remove the `useEffect(() => { fetch('/api/stats'); fetch('/api/activity') }, [])` from the converted `HomeClient`/`HabitsClient` creates a **double-fetch** — the client re-fetches data the server already provided, causing a flicker as the client overwrites the server-provided state. **HabitsClient must have NO initial-load fetch** (D-04). **HomeClient keeps `loadStats`/`loadActivity` ONLY for the post-sync refetch path** (called from `handleSync`), never from the mount effect.

- **Computing `today` in render or in a `useState` initializer:** `habitDateStr()` calls `new Date()` internally → impure → violates `react-hooks/purity`. D-02 explicitly forbids a `useState` initializer calling `new Date()`. Always compute `today` in a `useEffect` and set it via `Promise.resolve().then(() => setToday(...))`.

- **Calling `prisma` from a `'use client'` component:** The Prisma client imports Node.js internals and will fail in the browser. The RSC page (no `'use client'`) is the only place to call Prisma — and via `lib/dashboard.ts`, not directly. (Same constraint as Phase 10.)

- **Using `fetch('/api/stats')` in the RSC page:** Direct `lib/dashboard.ts` calls are the correct pattern for RSC data fetching — avoids an unnecessary HTTP round-trip during SSR. The API routes stay for the client-side post-sync refetch (D-08). [CITED: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` §"With an ORM or database"]

- **Inventing new skeleton shapes for the one-tick `today` state:** D-02 discretion says reuse the existing `app/habits/loading.tsx` (`HabitsLoading`) shapes for visual consistency. Do NOT create a new skeleton component. The home hero one-tick pulse reuses the existing `heroState='loading'` `bg-surface-2 animate-pulse` block.

- **Removing `/api/stats` or `/api/activity` GET routes:** D-08 locks them in place — they delegate to `lib/dashboard.ts` and serve the home page's client-side post-sync refetch (success criteria #3). Only the GET handler bodies change (to delegate); the POST `/api/activity` handler (study-time logging) is untouched.

- **Forgetting the band-up check on the first render-derived effect:** `HomeClient` must run the `localStorage['lastBand']` comparison against `computeProficiency(initialStats.masteredCount).band` on first run (not just after a refetch) — otherwise a user who leveled up since their last visit won't see the celebration. The current `app/page.tsx:50-64` does this inside `loadStats`; the converted `HomeClient` must do it on the initial props AND re-run it after a pull-to-refresh refetch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stats query (5 Prisma counts) | Inline the 5 queries in the RSC page AND in `/api/stats` route | `lib/dashboard.ts:getStats()` (D-05) | DRY — one source of truth; mirrors `lib/study-cards.ts` precedent. The query set is already tuned and parallelized in the existing route. |
| Activity query (studyDay.findMany + 2 settings) | Inline in RSC page AND `/api/activity` route | `lib/dashboard.ts:getActivityData()` (D-05) | Same DRY rationale. |
| Streak/heatmap/trend computation | Reimplement in the shell | `lib/habit.ts` (`computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `shiftDate`, `formatDuration`) | Already pure, already serializable-input, already tested in production across home + habits + `HabitTracker`. Reused unchanged. |
| Client-local time resolution | `useState(() => habitDateStr(hour))` initializer | `useEffect` + `Promise.resolve().then(() => setToday(...))` | D-02: a `useState` initializer calling `new Date()` violates `react-hooks/purity`. The microtask pattern is the established lint-safe approach. |
| Band-up confetti | Eager `import canvas-confetti` at module top | Lazy `import('canvas-confetti').then((m) => m.default({...}))` | Already the pattern in `app/page.tsx:56-60`. Lazy import keeps the confetti lib out of the initial client bundle. |
| Skeleton for one-tick habits loading | New skeleton component | Reuse `app/habits/loading.tsx` (`HabitsLoading`) | D-02 discretion: visual consistency; Phase 9 skeleton is content-shaped and already in place. |
| DTO type for the activity payload | New `ActivityDayDTO` | Reuse `DayRecord` from `lib/habit.ts` | D-06: `DayRecord` is already `{ date: "YYYY-MM-DD", seconds, reviews? }` — already serializable, no `Date` objects. Importing it into `lib/dto.ts` keeps one type for the day-record shape. |

**Key insight:** The entire phase is a re-composition of existing, verified assets. No new business logic, no new computation, no new visual design. The RSC + client-shell + DTO pattern is the established standard from Phases 10/11; `lib/dashboard.ts` is a thin extraction of queries that already run in the API routes; the DTOs are thin formal types over payloads that are already primitives. The riskiest piece is the D-01/D-02 client-local time resolution — and that pattern already ships in the current `app/page.tsx` (lines 82-103) and `app/habits/page.tsx` (lines 43-58).

---

## Common Pitfalls

### Pitfall 1: Double-Fetch on Mount (forgetting to remove the initial-load `useEffect`)

**What goes wrong:** The converted `HomeClient`/`HabitsClient` keeps the original `useEffect(() => { fetch('/api/stats'); fetch('/api/activity') }, [])` from the current `'use client'` pages. On mount, the shell re-fetches data the server already provided via RSC props — causing a visible flicker as the client overwrites the server-provided state ~100-300ms after first paint.

**Why it happens:** Mechanical extraction — copying the existing `useEffect` into the new shell without removing the initial-load path.

**How to avoid:**
- `HabitsClient` must have **NO** initial-load `useEffect` fetch (D-04). Initialize `days`/`goal`/`masteredCount` from props; only `today` is set in an effect (via `Promise.resolve().then(...)`).
- `HomeClient` keeps `loadStats`/`loadActivity` as `useCallback`s, but they are called **only** from `handleSync` (post-pull-to-refresh refetch), NOT from a mount effect. The mount effect sets only `greeting` + `heroState` (derived from props + client-local `today`).

**Warning signs:** Open DevTools Network tab on first load of `/` or `/habits`. If you see `/api/stats` or `/api/activity` requests fire on mount (before any user interaction), the double-fetch bug is present. After conversion, the only client-side fetch on first load should be the lazy `import('canvas-confetti')` chunk IF a band-up fires.

### Pitfall 2: `react-hooks/purity` Violation from `new Date()` in Render

**What goes wrong:** A naive conversion computes `today` inline in render (e.g., `const today = habitDateStr(dayStartHour)` at the top of the component body) or in a `useState` initializer. ESLint `react-hooks/purity` fails the build.

**Why it happens:** `habitDateStr()` and `localDateStr()` call `new Date()` internally. The purity rule forbids any impure call during render, including transitively through a helper.

**How to avoid:** Compute `today` in a `useEffect` and set it via `Promise.resolve().then(() => setToday(...))` — the established lint-safe pattern (already in `app/page.tsx:84,97-101`). The shell renders the skeleton/pulse while `today === ''` (habits) or `heroState === 'loading'` (home), then the real content on the next tick.

**Warning signs:** `npm run lint` fails with `react-hooks/purity` errors mentioning `new Date()` or `habitDateStr`. The fix is always: move the call into an effect.

### Pitfall 3: `react-hooks/set-state-in-effect` Violation

**What goes wrong:** `useEffect(() => { setToday(habitDateStr(hour)) }, [])` — calling `setState` synchronously in the effect body trips `react-hooks/set-state-in-effect`.

**Why it happens:** The lint rule forbids synchronous `setState` in effect bodies because it can cause an extra render pass and breaks the effect-as-side-effect mental model.

**How to avoid:** Wrap the `setState` in a microtask: `Promise.resolve().then(() => setToday(habitDateStr(hour)))`. This is the exact pattern already used in `app/page.tsx:84` (greeting) and `app/page.tsx:97-101` (heroState).

**Warning signs:** `npm run lint` fails with `react-hooks/set-state-in-effect` errors.

### Pitfall 4: `StatsDTO.cardsByType` Shape Mismatch

**What goes wrong:** The DTO type for `cardsByType` doesn't match what `prisma.card.groupBy({ by: ['type'], _count: true })` actually returns. Prisma's `groupBy` returns `{ type: string, _count: { _all: number } }` in some versions and `{ type: string, _count: number }` in others depending on the query shape. If the DTO is wrong, the client either sees a type mismatch at compile time or a runtime `undefined`.

**Why it happens:** Prisma 7's `groupBy` return type is `Array<{ type: string, _count: number }>` for the `{ by: ['type'], _count: true }` shape. The existing `/api/stats` route returns this directly via `NextResponse.json(...)`, and JSON serialization preserves the shape. The DTO must match.

**How to avoid:** Verify the exact Prisma 7 `groupBy` return shape against the existing route before finalizing the DTO. The current `/api/stats` returns `{ totalCards, dueCards, totalLessons, cardsByType, masteredCount }` where `cardsByType` is the raw `groupBy` result. The DTO should type it as `{ type: string; _count: number }[]` to match — but the planner should confirm by reading the actual runtime shape (or by adding a type assertion in `getStats()` that catches any mismatch at compile time). Note: home and habits don't actually consume `cardsByType` (only `/wrapped` does), so even if the type is slightly off, the home/habits render is unaffected — but the API route's JSON response shape must stay byte-identical for `/wrapped`.

**Warning signs:** TypeScript compile error on `cardsByType`, or `/wrapped` page breaks after the API route delegates to `lib/dashboard.ts`. Verify by loading `/wrapped` after conversion.

### Pitfall 5: Band-Up Check Not Running on First Render

**What goes wrong:** The band-up confetti/banner (success criteria #4) only fires after a pull-to-refresh refetch, not on the initial server-provided `masteredCount`. A user who leveled up since their last visit sees no celebration on first load.

**Why it happens:** The current `app/page.tsx` runs the band-up check inside `loadStats` (lines 50-64). If the converted `HomeClient` only runs it inside the post-sync refetch path (and not on the initial `initialStats` props), the first-load band-up is lost.

**How to avoid:** `HomeClient` must run the `localStorage['lastBand']` comparison against `computeProficiency(initialStats.masteredCount).band` in a `useEffect` that runs on mount (with `initialStats` in the deps), AND re-run it after a pull-to-refresh refetch (with the refetched `stats` in the deps). The cleanest shape: extract the band-up check into a `useCallback` that takes a `masteredCount` and is called both on mount (with `initialStats.masteredCount`) and after `loadStats` resolves.

**Warning signs:** Manually test by clearing `localStorage['lastBand']`, studying enough to level up a CEFR band in a separate tab, then loading `/` — the band-up banner + confetti should fire on first load.

### Pitfall 6: `HabitTracker` Today Desync from `HomeClient` Today

**What goes wrong:** `HomeClient` computes `today` in its own effect (for `heroState`). If `HabitTracker` is passed `initialToday` from a DIFFERENT source (or recomputes its own `today` with a different `dayStartHour`), the two can disagree — `heroState` says "goal met" but `HabitTracker`'s ring says "not met" (or vice versa).

**Why it happens:** The `today` string depends on `dayStartHour`, and both components need the same `dayStartHour` and the same client-local clock tick.

**How to avoid:** Pass `HomeClient`'s already-computed `today` as `initialToday` to `HabitTracker` (not a recomputed one). Both then use the same `today` string for their derivations. Alternatively, pass `initialDayStartHour` and let `HabitTracker` compute its own — but then ensure it uses the SAME `dayStartHour` value (`initialActivity.dayStartHour`), not the default. The former (pass `today` directly) is simpler and avoids a duplicate `habitDateStr` call.

**Warning signs:** The home hero shows "Goal met today" (state B) but `HabitTracker`'s ring is below 100%, or vice versa. Both should agree on whether today's goal is met.

### Pitfall 7: `app/layout.tsx` Runtime Fetch + No Home `loading.tsx`

**What goes wrong:** `app/layout.tsx` already does a runtime `Promise.all` fetch (`getButtonColor`, `getRewardColor`, `getReadingTextScale`, `getReadingAid` — 4 settings queries) on every request. The home route has no `loading.tsx` (deferred per 12-CONTEXT.md). On client-side *navigation* to `/` (not first load), the user sees a brief blank/jank because the layout fetch blocks the route segment.

**Why it happens:** The STATE.md blocker note: "Keep `app/layout.tsx` structural-only — its existing runtime data fetch (button/reward colors) could block `loading.tsx`." Without a home `loading.tsx`, there's no skeleton to show during the navigation wait.

**How to avoid:** This is **out of scope for Phase 12** (deferred under "Home `loading.tsx` skeleton"). Phase 12 addresses FIRST-load hydration (RSC), not navigation jank. The RSC conversion eliminates the first-load empty hero flash (success criteria #1) regardless of the layout fetch — the home RSC fetches via `lib/dashboard.ts` in parallel with the layout's settings fetch; both are sub-second Prisma queries. Do NOT try to fix the navigation jank by adding a home `loading.tsx` in this phase (it's a Phase 9 / SKEL-01..04 concern). Do NOT move the layout fetch in this phase either (it's a separate refactor, noted in PERF-F3).

**Warning signs:** If a `loading.tsx` appears in `app/` during this phase, that's scope creep — remove it. Test the first-load benefit with a production build (`next build && next start`), not `next dev` (dev mode does not stream RSC the same way).

### Pitfall 8: Removing the `'use client'` Directive from the Wrong File

**What goes wrong:** The current `app/page.tsx` and `app/habits/page.tsx` both start with `'use client'`. After conversion, the PAGE files (`app/page.tsx`, `app/habits/page.tsx`) must have NO `'use client'` (they become server components), but the NEW shell files (`components/HomeClient.tsx`, `components/HabitsClient.tsx`) MUST have `'use client'` as the first line. Forgetting to add `'use client'` to the new shells, OR leaving `'use client'` at the top of the page files, breaks the boundary.

**Why it happens:** Mechanical error during the extraction — the page file's content moves to the shell, and the directive needs to move with it (while the page file becomes directive-free).

**How to avoid:** After conversion: `app/page.tsx` and `app/habits/page.tsx` have NO `'use client'` (they import `HomeClient`/`HabitsClient` and are async server components). `components/HomeClient.tsx` and `components/HabitsClient.tsx` have `'use client'` as the literal first line, before any imports. The `HabitTracker.tsx` already has `'use client'` — preserve it.

**Warning signs:** `npm run build` fails with "use client" directive errors, or the page tries to call `prisma` from the browser (because the shell forgot `'use client'` and got bundled with the server page).

---

## Code Examples

### Verified Pattern: RSC page → client shell with initialData props (Phase 11 reference)

The exact pattern Phase 12 replicates. Source: `app/study/page.tsx` (Phase 11, shipped and verified):

```typescript
// Source: app/study/page.tsx (existing codebase, Phase 11)
// Server component — no client directive
import { prisma } from '@/lib/prisma'
import { getStudyCards } from '@/lib/study-cards'
import StudyClient from '@/components/StudyClient'

export default async function StudyPage() {
  const [cardDTOs, lessons] = await Promise.all([
    getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null }),
    prisma.lesson.findMany({
      select: { id: true, orderIndex: true, title: true },
      orderBy: { orderIndex: 'asc' },
    }),
  ])
  return <StudyClient initialCards={cardDTOs} initialLessons={lessons} />
}
```

### Verified Pattern: Client shell initializing state from props (Phase 11 reference)

Source: `components/StudyClient.tsx` (Phase 11, shipped):

```typescript
// Source: components/StudyClient.tsx (existing codebase, Phase 11)
'use client'

import { useEffect, useState, useCallback } from 'react'
// ... imports ...
import type { CardDTO, LessonDTO } from '@/lib/dto'

interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonDTO[]
}

export default function StudyClient({ initialCards, initialLessons }: Props) {
  // Initialize state from RSC props — NO initial-load useEffect fetch.
  const [studyCards, setStudyCards] = useState<CardDTO[]>(initialCards)
  // ... rest of state ...
  const [lessons] = useState<LessonDTO[]>(initialLessons)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  // ... interactivity ...
}
```

### Verified Pattern: `lib/study-cards.ts` server-only extraction (Phase 11 reference for `lib/dashboard.ts`)

Source: `lib/study-cards.ts` (Phase 11, shipped). The exact shape `lib/dashboard.ts` replicates:

```typescript
// Source: lib/study-cards.ts (existing codebase, Phase 11)
// lib/study-cards.ts — server-only due-card pipeline
// No 'use client' — this module runs server-side only.
// Extracts the pool-fetch + edge-fetch + knownLemmas + selectSessionCards +
// sequenceCards + annotation pipeline from app/api/cards/due/route.ts so
// both the RSC study page and the API route call one shared, DRY function.

import { prisma } from '@/lib/prisma'
import { getSessionSize } from '@/lib/settings'
// ... more imports ...
import type { CardDTO } from '@/lib/dto'

export interface StudyCardsParams { /* ... */ }

export async function getStudyCards(params: StudyCardsParams): Promise<CardDTO[]> {
  // ... Promise.allSettled + serialization ...
}
```

### Verified Pattern: One-tick `Promise.resolve().then(setState)` for purity-gated time reads

Source: `app/page.tsx` lines 82-103 (existing codebase, the pattern HomeClient preserves):

```typescript
// Source: app/page.tsx:76-103 (existing codebase)
useEffect(() => {
  loadStats()
  loadActivity()
  // Time-aware greeting — read the hour in the effect (never during render,
  // per react-hooks/purity); set state on a microtask to satisfy
  // react-hooks/set-state-in-effect.
  const h = new Date().getHours()
  const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  Promise.resolve().then(() => setGreeting(g))
}, [loadStats, loadActivity])

// Derive heroState once both fetches resolve.
// habitDateStr must be called here (inside useEffect) — it calls new Date()
// internally and is therefore impure (react-hooks/purity forbids it in render).
useEffect(() => {
  if (!stats || !activityData) return
  const todayStr = habitDateStr(activityData.dayStartHour)
  const todaySeconds = activityData.days.find((d) => d.date === todayStr)?.seconds ?? 0
  const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
  if (stats.dueCards > 0) {
    Promise.resolve().then(() => setHeroState('A'))
  } else if (goalMet) {
    Promise.resolve().then(() => setHeroState('B'))
  } else {
    Promise.resolve().then(() => setHeroState('C'))
  }
}, [stats, activityData])
```

**Phase 12 conversion:** `HomeClient` keeps this exact logic, but `stats`/`activityData` initialize from `initialStats`/`initialActivity` props (not null). The `if (!stats || !activityData) return` guard becomes unnecessary on first render (props are always non-null); the `heroState` effect runs on mount with the prop values and re-runs after a pull-to-refresh refetch updates the state. `loadStats()`/`loadActivity()` are removed from the mount effect (D-08: they're called only from `handleSync`).

### Verified Pattern: Parallel `Promise.all` for stats queries (existing route code)

Source: `app/api/stats/route.ts` (existing codebase, the exact queries `lib/dashboard.ts:getStats()` reuses):

```typescript
// Source: app/api/stats/route.ts (existing codebase)
export async function GET() {
  const now = new Date()
  const [totalCards, dueCards, totalLessons, cardsByType, masteredCount] = await Promise.all([
    prisma.card.count(),
    prisma.cardReview.count({ where: { nextReview: { lte: now } } }),
    prisma.lesson.count(),
    prisma.card.groupBy({ by: ['type'], _count: true }),
    prisma.cardReview.count({ where: { state: 2, scheduledDays: { gte: 21 } } }),
  ])
  return NextResponse.json({ totalCards, dueCards, totalLessons, cardsByType, masteredCount })
}
```

### Verified Pattern: Next.js 16 RSC + client-shell composition (from the docs)

Source: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` §"Passing data from Server to Client Components":

> "You can pass data from Server Components to Client Components using props. ... **Good to know**: Props passed to Client Components need to be serializable by React."

Source: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` §"With an ORM or database":

> "Since Server Components are rendered on the server, credentials and query logic will not be included in the client bundle so you can safely make database queries using an ORM or database client."

Source: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` §"Parallel data fetching":

> "Start multiple requests by calling `fetch`, then await them with `Promise.all`. ... **Good to know:** If one request fails when using `Promise.all`, the entire operation will fail. To handle this, you can use the `Promise.allSettled` method instead."

(The `Promise.allSettled` note is informational — for this phase, `Promise.all` is the correct choice because every query in `getStats()`/`getActivityData()` is critical; there's no non-critical query to degrade gracefully. See Pattern 6.)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `'use client'` page fetches `/api/stats` + `/api/activity` in `useEffect` | RSC page fetches via `lib/dashboard.ts` at render time; passes DTO props to client shell | Phase 10 (cards) → Phase 11 (study) → **Phase 12 (home + habits)** | Eliminates empty-state flash on first load; data arrives with the HTML. The one-tick skeleton/pulse (D-02) is the only permitted loading state. |
| Inline query logic in each API route + each page | Shared server-only module (`lib/dashboard.ts`) called by both RSC pages and API routes | Phase 11 (`lib/study-cards.ts`) → **Phase 12 (`lib/dashboard.ts`)** | DRY — one source of truth per query set. Mirrors the established `lib/study-cards.ts` precedent. |
| Ad-hoc inline `interface Stats` / `interface ActivityData` in `app/page.tsx` | Formal DTO types (`StatsDTO`, `ActivityDTO`) in `lib/dto.ts` | Phase 11 D-05 (`lib/dto.ts` extracted) → **Phase 12 extends it** | Type safety at the server→client boundary; RSC-05 contract enforced. |
| `HabitTracker` self-fetches `/api/activity` on mount (duplicate request on home) | `HabitTracker` accepts optional `initialActivity` props; skips self-fetch when present (D-09) | **Phase 12 (new)** | Eliminates the duplicate `/api/activity` fetch on home. Component stays usable in isolation (defensive fallback). |
| Server-rendered `today` approximation | Client-local `today` via `habitDateStr(dayStartHour)` in effect (D-01) | **Phase 12 (formalized)** | Correctness for every timezone — the Vercel server runs UTC and cannot compute the user's habit-day. Wins over a fully-instant server render. |

**Deprecated/outdated in this phase context:**
- `app/page.tsx` as a `'use client'` component with `useEffect` fetches — replaced by RSC page + `HomeClient` shell.
- `app/habits/page.tsx` as a `'use client'` component with `useEffect` fetches — replaced by RSC page + `HabitsClient` shell.
- `HabitTracker`'s unconditional `useEffect` self-fetch — replaced by optional `initialActivity` props (D-09). The self-fetch path stays as a defensive fallback.
- Inline `interface Stats` / `interface ActivityData` in `app/page.tsx` — replaced by `StatsDTO` / `ActivityDTO` in `lib/dto.ts`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `StatsDTO.cardsByType` shape is `{ type: string; _count: number }[]` (matching Prisma 7's `groupBy({ by: ['type'], _count: true })` return) | Pattern 3, Pitfall 4 | Low-medium — the home/habits routes don't consume `cardsByType` (only `/wrapped` does), so a type mismatch wouldn't break Phase 12 surfaces. But `/wrapped` reads the `/api/stats` JSON response, so the API route's response shape must stay byte-identical after it delegates to `lib/dashboard.ts`. The planner should verify the exact Prisma 7 `groupBy` return shape at implementation time (read the actual runtime value or add a compile-time type assertion in `getStats()`). |
| A2 | `StudyDay.date` is a `String` column (not `DateTime`), so `prisma.studyDay.findMany({ select: { date: true, ... } })` returns `date` as a `"YYYY-MM-DD"` string — no `.toISOString()` mapping needed in `getActivityData()` | Pattern 3, Anti-Patterns | Low — the existing `/api/activity` GET route already returns `days` directly via `NextResponse.json({ days, ... })` without any date serialization, and the client already treats `DayRecord.date` as a string. The DTO formalizes the existing shape. Verified by reading `lib/habit.ts:DayRecord` and the route; the planner should confirm `StudyDay.date` is `String` in `prisma/schema.prisma` during implementation. |
| A3 | `HomeClient`'s `heroState` effect can run on mount with the prop values (not just after a refetch) — i.e., removing the `if (!stats || !activityData) return` guard is safe because props are always non-null | Pattern 4, Pitfall 5 | Low — props are non-null by construction (the RSC page always provides them). The guard existed only because the old `useState<Stats | null>(null)` started null. After conversion, `useState<StatsDTO>(initialStats)` is always non-null. The band-up check (Pitfall 5) must move to a mount effect with `initialStats` in deps. |
| A4 | `HabitTracker` is used only on `app/page.tsx` (home) — no other call sites | Pattern 5, D-09 safety | None — grep-verified: `HabitTracker` appears in exactly 2 files: `components/HabitTracker.tsx` (definition) and `app/page.tsx` (single usage at line 232). Not on `/study`, `/cards`, `/wrapped`, `/settings`, or `/habits`. [VERIFIED: codebase grep] |
| A5 | The existing `app/page.tsx` `loadStats`/`loadActivity` `useCallback` signatures can be preserved as-is in `HomeClient` (same `fetch('/api/stats')` / `fetch('/api/activity')` → `.then(setState)` chain), just removed from the mount effect | Pattern 4, Pitfall 1 | Low — the only change to these callbacks is that they're called from `handleSync` only, not from a mount effect. The band-up check inside `loadStats` (lines 50-64) must be preserved (Pitfall 5). |
| A6 | The `dayStartHour` passed to `HabitTracker` via `initialToday` (computed in `HomeClient`'s effect) uses the same `dayStartHour` value (`initialActivity.dayStartHour`) — no desync | Pitfall 6 | Low — `HomeClient` computes `today = habitDateStr(initialActivity.dayStartHour)`; passing that `today` as `initialToday` to `HabitTracker` guarantees both use the same string. The planner should pass `today` directly rather than have `HabitTracker` recompute it. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Table is NOT empty — A1 and A2 warrant implementation-time verification of the Prisma 7 `groupBy` return shape and the `StudyDay.date` column type. Both are low-risk and the planner can verify with a quick code read during implementation.)

---

## Open Questions (RESOLVED)

1. **Exact Prisma 7 `groupBy` return shape for `cardsByType`**
   - What we know: The existing `/api/stats` route returns `cardsByType` as the raw `prisma.card.groupBy({ by: ['type'], _count: true })` result via `NextResponse.json(...)`. The client (`/wrapped`) consumes it.
   - What's unclear: Whether Prisma 7.6.0 returns `{ type, _count: number }` or `{ type, _count: { _all: number } }` for this query shape. Training-data knowledge of Prisma's `groupBy` return types may be stale (Prisma has changed this across versions).
   - RESOLVED: The planner should add a type annotation or type assertion in `getStats()` that catches any mismatch at compile time, OR read the actual runtime value from a running dev server before finalizing `StatsDTO.cardsByType`. Since home/habits don't consume `cardsByType`, this is a `/wrapped`-compatibility concern, not a Phase 12 surface concern. Plan 12-01 Task 1 prescribes implementation-time verification + acceptance criteria require `/wrapped` still works (byte-identical JSON).

2. **Whether to pass `today` or `dayStartHour` to `HabitTracker`**
   - What we know: D-09 says `HabitTracker` gains optional `initialToday` (among other props). `HomeClient` already computes `today` in its own effect (for `heroState`).
   - What's unclear: Whether `HomeClient` should pass its already-computed `today` string as `initialToday`, OR pass `dayStartHour` and let `HabitTracker` compute its own `today`. Both work.
   - RESOLVED: Pass the already-computed `today` string as `initialToday`. This avoids a duplicate `habitDateStr` call and guarantees the two components agree on `today` (Pitfall 6). Plan 12-02 Task 2 passes `initialToday={today}` directly.

3. **Whether the band-up check should fire on the very first render-derived effect or be deferred one tick**
   - What we know: The current `app/page.tsx` runs the band-up check inside `loadStats` (lines 50-64), which fires on mount. `localStorage['lastBand']` comparison + confetti.
   - What's unclear: Whether running the band-up check on the very first effect tick (before `heroState` resolves) causes any visual race (confetti firing while the hero is still in the one-tick pulse state).
   - RESOLVED: The band-up check reads `initialStats.masteredCount` (a prop, available immediately) and writes `localStorage['lastBand']`. It's independent of `heroState` and `today`. Running it on the first mount effect is safe and matches current behavior. The confetti fires once; the hero pulse resolves on the same tick. No race. Plan 12-02 Task 2 calls `checkBandUp(initialStats.masteredCount)` on mount.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — Phase 12 is a pure code/config refactor that uses only the existing Next.js 16 + React 19 + Prisma 7 + libSQL stack already installed and running. No new CLIs, runtimes, databases, or services are introduced. The only "external" call is the existing `POST /api/sync` → Google Docs API path, which is unchanged and already wired. `canvas-confetti` is already a dependency.)

---

## Validation Architecture

> `nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per project configuration. (Verified: `workflow.nyquist_validation: false` in `.planning/config.json` line 24.)

**Validation approach for this phase (informal, since Nyquist is off):**
- `npm run lint` — must pass clean (especially `react-hooks/purity` and `react-hooks/set-state-in-effect`). Run after every task commit.
- `npm run build` — must succeed (the RSC serialization constraint only surfaces at build/runtime, not in `next dev`). Run before `/gsd-verify-work`.
- Manual UAT (success criteria #1-5 from 12-CONTEXT.md): load `/` and `/habits` in a production build (`next build && next start`); verify no empty-state flash; verify pull-to-refresh still syncs; verify band-up confetti fires; verify DevTools Network tab shows no `/api/stats` or `/api/activity` request on first load of either route (only the lazy `canvas-confetti` chunk IF a band-up fires).
- The 5 success criteria from 12-CONTEXT.md / ROADMAP.md are the phase gate.

---

## Security Domain

**`security_enforcement` is enabled** (not explicitly false in `.planning/config.json`; `security_asvs_level: 1`). However, Phase 12 introduces **no new security surface** — it's an internal refactor that moves already-served data (from `/api/stats` and `/api/activity` GET routes) to the RSC render path on the same two routes (`/` and `/habits`) that the existing `middleware.ts` auth gate already protects.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing `middleware.ts` auth unchanged. Both `/` and `/habits` already require the `ks_auth` HMAC cookie. No new auth paths. |
| V3 Session Management | no | No session changes. The `ks_auth` cookie is read by middleware, not by the RSC pages or `lib/dashboard.ts`. |
| V4 Access Control | no | Single-tenant; auth cookie gate unchanged. `lib/dashboard.ts` runs server-side (RSC context), behind the same auth gate as the existing API routes. No new authorization decisions. |
| V5 Input Validation | no | No new user inputs in this phase. `lib/dashboard.ts:getStats()` and `getActivityData()` take NO parameters — they query fixed Prisma shapes. The existing `/api/activity` POST handler (study-time logging) is untouched and already validates `date`/`seconds`/`reviews`. |
| V6 Cryptography | no | No crypto changes. `lib/auth.ts` is untouched. |
| V7 Error Handling & Logging | yes (minimal) | RSC page follows the codebase convention "No try/catch at RSC page level — Next.js error boundaries handle `lib/dashboard.ts` throws" (STATE.md, Phase 11 precedent). `lib/dashboard.ts` is a library module — it throws on unexpected Prisma failure; the throw propagates to the Next.js error boundary. The API routes (GET `/api/stats`, GET `/api/activity`) should wrap `await getStats()` / `await getActivityData()` in try/catch per the codebase API route convention (validation errors → 400, unexpected → 500), matching their current behavior. |

**No new security surface.** The RSC pages fetch Prisma data server-side (behind the auth gate) and serialize it via DTOs. The DTOs include only fields the client already received via the existing API routes — no new data exposure. `lib/dashboard.ts` is server-only (the `// No 'use client` comment guards it; the `server-only` package is NOT installed to honor the "no new packages" constraint — the comment is the established codebase precedent per `lib/study-cards.ts` and `lib/settings.ts`). [CITED: `node_modules/next/dist/docs/01-app/02-guides/data-security.md` §"Passing data from server to client" + §"Preventing client-side execution of server-only code"]

### Known Threat Patterns for the RSC + client-shell stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RSC → client boundary data exposure (over-serialization) | Information Disclosure | Only serialize fields the client already received via the API. `StatsDTO` and `ActivityDTO` must not include fields beyond what `/api/stats` and `/api/activity` GET routes already return. (Both DTOs are exactly the existing JSON response shapes — no new fields.) |
| `lib/dashboard.ts` accidentally imported client-side | Information Disclosure (theoretical — the module only runs Prisma queries, no secrets) | The `// No 'use client` comment is the established guard. The module imports `prisma` (Node-only) — a client import would fail at build time anyway because `prisma` cannot be bundled into the client. The `server-only` package is available as a stronger guard if ever needed, but is NOT installed here (no new packages constraint). |
| Stale home data after studying in another tab | Repudiation (theoretical — user sees stale state) | Accepted tradeoff (deferred per 12-CONTEXT.md "Stale home data freshness"). Pull-to-refresh is the manual refresh path. No TTL/auto-refresh in this phase. |

---

## Sources

### Primary (HIGH confidence — codebase direct read)

- `app/page.tsx` (252 lines, current `'use client'` home page) — `loadStats`/`loadActivity` useEffect fetches; `heroState` derivation; `handleSync` pull-to-refresh; band-up confetti; `<HabitTracker />` usage at line 232. [VERIFIED: codebase read]
- `app/habits/page.tsx` (281 lines, current `'use client'` habits page) — `days===null` → `<HabitsLoading />` flash; all `useMemo` derivations from `days`/`today`/`goal`; fetches `/api/activity` + `/api/stats` (masteredCount only). [VERIFIED: codebase read]
- `components/HabitTracker.tsx` (205 lines, `'use client'`) — self-fetches `/api/activity` on mount (lines 30-40); milestone + haptic + comeback/at-risk logic; gains optional `initialActivity` props per D-09. [VERIFIED: codebase read]
- `lib/dto.ts` (63 lines) — existing DTO home (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`, `LessonRefDTO`); extend with `StatsDTO` + `ActivityDTO` per D-06. [VERIFIED: codebase read]
- `lib/habit.ts` (214 lines) — pure habit computations; `DayRecord` interface (`{ date: "YYYY-MM-DD", seconds, reviews? }` — already serializable); `habitDateStr`, `computeStreaks`, `computeHabitStats`, `computeHabitInsight`, `shiftDate`, `formatDuration`, `DEFAULT_GOAL_SECONDS`, `DEFAULT_DAY_START_HOUR`. Reused unchanged. [VERIFIED: codebase read]
- `lib/study-cards.ts` (128 lines, Phase 11 precedent) — the exact server-only extraction shape `lib/dashboard.ts` replicates. [VERIFIED: codebase read]
- `lib/settings.ts` — `getDailyGoalSeconds()` and `getDayStartHour()` (async, `Promise<number>`); called by `lib/dashboard.ts:getActivityData()`. [VERIFIED: codebase grep + read]
- `app/api/stats/route.ts` (17 lines) — GET handler with 5 parallel Prisma queries via `Promise.all`; returns `{ totalCards, dueCards, totalLessons, cardsByType, masteredCount }`. Delegates to `lib/dashboard.ts:getStats()` per D-08. [VERIFIED: codebase read]
- `app/api/activity/route.ts` (37 lines) — GET handler with 3 parallel queries; returns `{ days, dailyGoalSeconds, dayStartHour }`. POST handler (study-time logging) stays untouched. [VERIFIED: codebase read]
- `app/habits/loading.tsx` (36 lines, Phase 9 skeleton) — `bg-surface-3 animate-pulse`, content-shaped; reused for the one-tick loading state per D-02. [VERIFIED: codebase read]
- `app/cards/page.tsx` (47 lines, Phase 10 RSC reference) + `app/study/page.tsx` (15 lines, Phase 11 RSC reference) — the exact RSC + client-shell pattern Phase 12 replicates. [VERIFIED: codebase read]
- `components/CardsClient.tsx` (lines 1-60) + `components/StudyClient.tsx` (lines 1-60) — confirmed `'use client'` shells with `interface Props { initialCards, initialLessons }` and `useState(initialCards)` pattern. [VERIFIED: codebase read]
- `app/layout.tsx` (90 lines) — confirmed the runtime `Promise.all` settings fetch (the STATE.md blocker note); confirmed no `app/loading.tsx` exists (deferred). [VERIFIED: codebase read]
- `components/StatsBar.tsx` (28 lines) — confirmed server-compatible (no `'use client'`); rendered as child of `HomeClient`. [VERIFIED: codebase read]
- `components/ProficiencyArc.tsx` (lines 1-15) — confirmed `'use client'` island; rendered as child of both shells. [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md` — RSC-03, RSC-04, RSC-05 requirement text; traceability table (Phase 12 owns RSC-03, RSC-04). [VERIFIED: file read]
- `.planning/STATE.md` — architectural decisions, "no new packages", "no try/catch at RSC page level", layout fetch blocker note, `HabitTracker` self-fetch verification todo. [VERIFIED: file read]
- `.planning/phases/12-home-habits-hydration/12-CONTEXT.md` — 9 locked decisions (D-01 through D-09), discretion items, deferred items. [VERIFIED: file read]
- `.planning/phases/12-home-habits-hydration/12-UI-SPEC.md` — preserve-mode visual/copy/interaction contract; 6 phase-specific interaction contracts. [VERIFIED: file read]
- `.planning/phases/11-study-page-hydration-interaction-polish/11-CONTEXT.md` — the RSC + client-shell + DTO decisions (D-02 shared-logic extraction, D-05 DTO types in `lib/dto.ts`, D-04 client shell starts with initial data) that Phase 12 replicates. [VERIFIED: file read]
- `.planning/phases/10-cards-hydration-api-parallelization/10-RESEARCH.md` — complete RSC + client shell + DTO pattern documentation; `Promise.allSettled` parallelization; DTO serialization pitfalls. [VERIFIED: file read]
- `CLAUDE.md` + `.claude/CLAUDE.md` — all project conventions, stack versions, lint rules, color system, key files. [VERIFIED: file read]
- `AGENTS.md` — the "This is NOT the Next.js you know" directive; honored by reading `node_modules/next/dist/docs/`. [VERIFIED: file read]
- `.planning/config.json` — confirmed `nyquist_validation: false`, `security_enforcement: true` (level 1), `commit_docs: false`, all web search providers off. [VERIFIED: file read]

### Secondary (MEDIUM-HIGH confidence — Next.js 16 official docs in node_modules)

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — RSC + client-shell composition; `'use client'` boundary rule; "Props passed to Client Components need to be serializable by React"; interleaving; `server-only` package (optional). [CITED: node_modules/next/dist/docs]
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` — async server components can fetch via ORM directly; `Promise.all` for parallel fetches; `Promise.allSettled` for graceful failure; `React.cache` for per-request de-dup (not needed here); `loading.js` streaming behavior. [CITED: node_modules/next/dist/docs]
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` §"Passing data from server to client" + §"Preventing client-side execution of server-only code" — Server Components can access DB/secrets safely; `server-only` package is optional (Next.js handles it internally). [CITED: node_modules/next/dist/docs]

### Tertiary (LOW confidence)

- None. All claims in this research are backed by codebase reads or the Next.js 16 docs in `node_modules`. No web searches were performed (all search providers off in `.planning/config.json`; this phase is codebase-internal replication with the authoritative Next.js docs already available locally — forcing external web searches would return lower-confidence results than the local authoritative sources, per the research philosophy's "Codebase-only research" and "Standard stack lookups" skip rules).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no research uncertainty; no new packages.
- Architecture: HIGH — RSC + client-shell + DTO pattern is already shipped in Phases 10 (`app/cards/page.tsx`) and 11 (`app/study/page.tsx`); Phase 12 is a direct replication. The `lib/dashboard.ts` extraction mirrors `lib/study-cards.ts` (Phase 11). Verified against Next.js 16 docs in `node_modules`.
- Pitfalls: HIGH — all pitfalls are structural (Date serialization, double-fetch, purity/set-state-in-effect lint rules, band-up check preservation, today-desync); each verified by reading the current `app/page.tsx` / `app/habits/page.tsx` / `components/HabitTracker.tsx` source.
- DTO types: HIGH — stats and activity payloads are already primitives (no `Date` serialization needed, unlike Phase 10's `CardDTO`); DTOs are thin formal types over existing JSON shapes.
- HabitTracker D-09 safety: HIGH — grep-verified single call site (`app/page.tsx` only).
- Prisma 7 `groupBy` return shape (A1): MEDIUM — training-data knowledge may be stale; planner should verify at implementation time. Low impact on Phase 12 surfaces (home/habits don't consume `cardsByType`).

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (stable stack — Next.js 16.2.1, React 19.2.4, Prisma 7.6.0; the RSC + client-shell + DTO pattern is stable and already shipped in Phases 10/11)
