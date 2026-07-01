---
phase: 09-skeleton-loading-screens
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/cards/loading.tsx
  - app/study/loading.tsx
  - app/habits/loading.tsx
autonomous: true
requirements: [SKEL-01, SKEL-02, SKEL-03, SKEL-04]

must_haves:
  truths:
    - "Navigating to /cards shows a skeleton immediately, with no blank flash during the route transition (SKEL-01)"
    - "Navigating to /study shows a skeleton immediately (SKEL-02)"
    - "Navigating to /habits shows a skeleton immediately (SKEL-03)"
    - "Every skeleton block is built exclusively from bg-surface-2 animate-pulse design tokens — no hardcoded gray utilities (SKEL-04)"
    - "Skeleton shapes approximate real content height, so no visible layout shift occurs when the real page arrives"
  artifacts:
    - "app/cards/loading.tsx"
    - "app/study/loading.tsx"
    - "app/habits/loading.tsx"
  key_links:
    - "Each loading.tsx is the default-exported function of a route segment — Next.js 16 auto-wraps the segment's page in <Suspense> and renders this fallback during client-side navigation"
    - "Skeletons render inside the layout <main> (px-4 pt-8 ...) — they must NOT re-add page-level horizontal/top padding or the content double-pads"
    - "bg-surface-2 resolves via --color-surface-2 (@theme inline in globals.css), defined in both the light :root and the dark [data-theme=dark] / prefers-color-scheme blocks — dark mode needs zero extra work"
---

<objective>
Add three `loading.tsx` route-segment files so every navigation to a main route gives instant visual feedback — a content-shaped skeleton appears immediately instead of a blank flash while the client component mounts and fetches.

Purpose: This is the zero-risk, pure-additive opening move of the v1.2 Performance & Snappiness milestone. It improves *perceived* snappiness on navigation today, and lays the navigation fallback that the later RSC-hydration phases (10–12) build on.

Output: `app/cards/loading.tsx`, `app/study/loading.tsx`, `app/habits/loading.tsx` — each a static, server-renderable skeleton whose blocks use only `bg-surface-2 animate-pulse` tokens and whose shape/height approximate the real page so there is no layout shift when content arrives.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

# Layout shell — skeletons render INSIDE this <main>; do not re-pad. Nav stays visible during nav transitions.
@app/layout.tsx
</context>

<scope_notes>
PURE ADDITIVE. This plan creates three new files and touches NOTHING else. Do not modify any page.tsx, component, or globals.css.

**Critical framing facts (from STATE.md blockers — do not re-litigate):**
- `loading.tsx` only activates on client-side navigation, NOT first-load SSR. That is by design and already documented. Acceptance is about the navigation transition, not first paint. Verify visually with a production build (`next build && next start`) if doing a manual check — `next dev` shows extra dev-only compile delays.
- No new npm packages. `loading.tsx` + Suspense are built into Next.js 16; `animate-pulse` and `bg-surface-2` are existing Tailwind utilities.
- Skeletons render inside the layout `<main className="... px-4 pt-8 ...">`. Do NOT add page-level `px-*`/`pt-*` wrappers that duplicate this padding. Match each page's *inner* structure (the children of `<main>`), not the outer `<main>` itself.

**Token discipline (SKEL-04 — hard gate):** every skeleton block uses `bg-surface-2 animate-pulse`. NEVER `bg-gray-200`, `bg-slate-*`, `bg-neutral-*`, or any literal Tailwind gray. The only allowed background utility for a skeleton block is `bg-surface-2`. (The real Study in-page loader uses `bg-surface-3`; for these navigation skeletons standardize on `bg-surface-2` per the requirement.)
</scope_notes>

<tasks>

<task type="auto" id="cards-skeleton" title="Create app/cards/loading.tsx" wave="1">
  <name>Task 1: Create app/cards/loading.tsx (SKEL-01, SKEL-04)</name>
  <files>app/cards/loading.tsx</files>
  <read_first>
    - app/cards/page.tsx — the real Cards page. Match its inner structure: a `flex flex-col gap-4` column containing (a) a sticky-style top bar row holding a wide search input + a square filter button + an "Add Card" button, (b) a small segmented view-toggle pill, (c) a list of card rows. Each real card row is `bg-surface-1 rounded-xl shadow-sm p-4` with a badge row, a bold Korean word line, a gloss line, and (often) indented example sentences. Use these to size skeleton blocks so the list height roughly matches a real screen of cards.
    - app/layout.tsx — confirm the skeleton renders inside `<main className="... px-4 pt-8 ...">`; do NOT re-add outer page padding.
    - app/globals.css (lines ~29-31, ~62-64, ~83-85, ~127-129) — confirm `--surface-2` is defined in light + dark and exposed as the `bg-surface-2` utility via `--color-surface-2`.
  </read_first>
  <action>
    Create a server component (NO `'use client'`) that default-exports `function CardsLoading()`. Return a `<div className="flex flex-col gap-4">` mirroring the real Cards page column. Inside, render, top to bottom:
    1. A top-bar row: `<div className="flex gap-2 items-center">` containing a flex-1 search-input skeleton (`h-11 rounded-lg bg-surface-2 animate-pulse flex-1 min-w-0`), a square filter-button skeleton (`h-11 w-11 rounded-lg bg-surface-2 animate-pulse shrink-0`), and an Add-Card-button skeleton (`h-11 w-24 rounded-lg bg-surface-2 animate-pulse shrink-0`).
    2. A view-toggle pill skeleton: `h-11 w-56 rounded-lg bg-surface-2 animate-pulse` (self-start width approximating the two-segment toggle).
    3. A list of about 5 card-row skeletons. Render them by mapping over a fixed-length static array (e.g. `Array.from({ length: 5 })`) so there is no `Math.random()`/`Date.now()` in render. Each row is `bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-2` (mirror the real card container) holding skeleton blocks: a short badge bar (`h-4 w-16 rounded-full bg-surface-2 animate-pulse`), a bold word line (`h-5 w-32 rounded bg-surface-2 animate-pulse`), a gloss line (`h-4 w-48 rounded bg-surface-2 animate-pulse`), and one sentence line (`h-4 w-3/4 rounded bg-surface-2 animate-pulse`). Use the array index as the React `key`.
    Keep markup static and pure — no hooks, no client directive, no inline color literals. Use only the listed token utilities for skeleton fills.
  </action>
  <verify>
    <automated>test -f app/cards/loading.tsx && grep -q 'bg-surface-2' app/cards/loading.tsx && grep -q 'animate-pulse' app/cards/loading.tsx && ! grep -nE 'bg-(gray|slate|neutral|zinc|stone)-' app/cards/loading.tsx && ! grep -q "'use client'" app/cards/loading.tsx && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - File `app/cards/loading.tsx` exists and default-exports a function component.
    - Every skeleton fill block uses `bg-surface-2 animate-pulse`; the grep for `bg-(gray|slate|neutral|zinc|stone)-*` returns nothing (SKEL-04).
    - No `'use client'` directive (it is a static server-renderable skeleton).
    - Structure approximates the real Cards page: top bar (search + filter + add) + view-toggle pill + ~5 card rows — height roughly matches a real screen so no layout shift on content arrival.
    - `npm run lint` passes with zero errors.
  </acceptance_criteria>
  <done>Navigating to /cards shows an instant, content-shaped skeleton built from bg-surface-2 animate-pulse; lint clean.</done>
</task>

<task type="auto" id="study-skeleton" title="Create app/study/loading.tsx" wave="1">
  <name>Task 2: Create app/study/loading.tsx (SKEL-02, SKEL-04)</name>
  <files>app/study/loading.tsx</files>
  <read_first>
    - app/study/page.tsx — note the existing in-page `phase === 'loading'` skeleton (around lines 199-207): a `w-full max-w-xl mx-auto animate-pulse flex flex-col gap-4 pt-4` column with a `h-3` full-width bar, a `h-[220px]` rounded card, and a `h-12` rounded bar. Mirror this exact shape so the navigation skeleton and the in-page loading state are visually consistent. (The real page uses `bg-surface-3` for those blocks; for this navigation skeleton standardize on `bg-surface-2 animate-pulse` per SKEL-04.)
    - app/layout.tsx — skeleton renders inside `<main className="... px-4 pt-8 ...">`; the real loader adds only a `pt-4` and a centered `max-w-xl` — preserve that, do not add horizontal page padding.
    - app/globals.css — confirm `bg-surface-2` token (light + dark) as above.
  </read_first>
  <action>
    Create a server component (NO `'use client'`) that default-exports `function StudyLoading()`. Return a `<div className="w-full max-w-xl mx-auto flex flex-col gap-4 pt-4">` mirroring the real Study in-page loader. Inside, render three skeleton blocks:
    1. A thin top bar: `h-3 w-full rounded bg-surface-2 animate-pulse`.
    2. A large card placeholder approximating the flashcard / count hero: `h-[220px] w-full rounded-2xl bg-surface-2 animate-pulse`.
    3. A start-button placeholder: `h-12 w-full rounded-xl bg-surface-2 animate-pulse`.
    Keep it static and pure — no hooks, no client directive. Use only `bg-surface-2 animate-pulse` for fills. Do not import the page's `Phase` types or any component.
  </action>
  <verify>
    <automated>test -f app/study/loading.tsx && grep -q 'bg-surface-2' app/study/loading.tsx && grep -q 'animate-pulse' app/study/loading.tsx && grep -q 'h-\[220px\]' app/study/loading.tsx && ! grep -nE 'bg-(gray|slate|neutral|zinc|stone)-' app/study/loading.tsx && ! grep -q "'use client'" app/study/loading.tsx && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - File `app/study/loading.tsx` exists and default-exports a function component.
    - Skeleton shape mirrors the real `phase === 'loading'` loader: centered `max-w-xl` column with an `h-3` bar, an `h-[220px]` card, and an `h-12` bar — so the navigation skeleton and in-page loader are visually consistent and there is no layout shift.
    - Every skeleton fill block uses `bg-surface-2 animate-pulse`; grep for hardcoded grays returns nothing (SKEL-04).
    - No `'use client'` directive.
    - `npm run lint` passes with zero errors.
  </acceptance_criteria>
  <done>Navigating to /study shows an instant skeleton matching the in-page loading shape, using bg-surface-2 animate-pulse; lint clean.</done>
</task>

<task type="auto" id="habits-skeleton" title="Create app/habits/loading.tsx" wave="1">
  <name>Task 3: Create app/habits/loading.tsx (SKEL-03, SKEL-04)</name>
  <files>app/habits/loading.tsx</files>
  <read_first>
    - app/habits/page.tsx — the real Habits page renders a `main max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6` containing, top to bottom: a header row (h1 "Habits" + a "← Dashboard" link), a streak-hero section (`bg-surface-1 rounded-2xl shadow-md p-6`), an all-time-totals section with a 2-column grid of stat tiles, an averages/consistency section, a 30-day trend section (`h-16` bar area), and a full-history heatmap section. NOTE the real page's own loading state (lines 107-113) renders a centered "Loading…" text inside a `max-w-2xl mx-auto px-4 py-8` main — but this navigation skeleton should be content-shaped (sections), not a single spinner, to avoid layout shift.
    - app/layout.tsx — the layout `<main>` already applies `max-w-2xl`? NO — the layout main is `max-w-2xl mx-auto w-full px-4 pt-8 pb-...`. The real Habits page nests its OWN `<main className="max-w-2xl mx-auto px-4 py-8">` inside that. To avoid double-padding in the skeleton, render a plain `<div className="flex flex-col gap-6">` (no extra `max-w`/`px`/`py` — the layout main already constrains and pads). Approximate the section heights only.
    - app/globals.css — confirm `bg-surface-2` token (light + dark) as above.
  </read_first>
  <action>
    Create a server component (NO `'use client'`) that default-exports `function HabitsLoading()`. Return a `<div className="flex flex-col gap-6">` (do NOT add extra `max-w`/`px`/`py` — the layout `<main>` already constrains and pads; adding them would double-pad). Render section-shaped skeleton blocks approximating real content height:
    1. Header row: `<div className="flex items-center justify-between">` with a title block (`h-8 w-32 rounded bg-surface-2 animate-pulse`) and a link block (`h-5 w-24 rounded bg-surface-2 animate-pulse`).
    2. Streak hero: a single tall block `h-32 w-full rounded-2xl bg-surface-2 animate-pulse`.
    3. All-time totals: a label block (`h-6 w-40 rounded bg-surface-2 animate-pulse`) then a 2-column grid (`grid grid-cols-2 gap-3`) of four tile blocks (`h-20 rounded-xl bg-surface-2 animate-pulse`). Map over a fixed `Array.from({ length: 4 })` with the index as `key` — no random/time calls.
    4. 30-day trend: a label block (`h-6 w-32 rounded bg-surface-2 animate-pulse`) then a chart-area block (`h-16 w-full rounded-xl bg-surface-2 animate-pulse`).
    5. Heatmap: a label block (`h-6 w-24 rounded bg-surface-2 animate-pulse`) then a grid-area block (`h-40 w-full rounded-2xl bg-surface-2 animate-pulse`).
    Keep markup static and pure — no hooks, no client directive, no color literals. Use only `bg-surface-2 animate-pulse` for fills.
  </action>
  <verify>
    <automated>test -f app/habits/loading.tsx && grep -q 'bg-surface-2' app/habits/loading.tsx && grep -q 'animate-pulse' app/habits/loading.tsx && grep -q 'grid-cols-2' app/habits/loading.tsx && ! grep -nE 'bg-(gray|slate|neutral|zinc|stone)-' app/habits/loading.tsx && ! grep -q "'use client'" app/habits/loading.tsx && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - File `app/habits/loading.tsx` exists and default-exports a function component.
    - Skeleton is section-shaped (header + streak hero + 2-col totals grid + trend area + heatmap area), approximating real content height — not a single spinner — so there is no layout shift when the page arrives.
    - Does NOT add its own `max-w`/`px`/`py` wrapper (avoids double-padding inside the layout `<main>`).
    - Every skeleton fill block uses `bg-surface-2 animate-pulse`; grep for hardcoded grays returns nothing (SKEL-04).
    - No `'use client'` directive.
    - `npm run lint` passes with zero errors.
  </acceptance_criteria>
  <done>Navigating to /habits shows an instant, section-shaped skeleton built from bg-surface-2 animate-pulse; lint clean.</done>
</task>

</tasks>

<artifacts>
## Artifacts this phase produces

| File | Type | Purpose |
|------|------|---------|
| `app/cards/loading.tsx` | new (server component) | Navigation skeleton for /cards — search bar + filter/add buttons + view-toggle pill + ~5 card-row skeletons (SKEL-01) |
| `app/study/loading.tsx` | new (server component) | Navigation skeleton for /study — mirrors the in-page `phase==='loading'` shape (h-3 bar / h-[220px] card / h-12 button) (SKEL-02) |
| `app/habits/loading.tsx` | new (server component) | Navigation skeleton for /habits — header + streak hero + 2-col totals grid + trend area + heatmap area (SKEL-03) |

All three use `bg-surface-2 animate-pulse` exclusively (SKEL-04). Zero changes to existing files.
</artifacts>

<threat_model>
Security enforcement is not in scope for this phase. These are static, server-rendered presentational skeleton components: no user input, no data fetching, no auth surface, no package installs, no trust boundary crossed. No STRIDE threats apply. (Auth gating for the routes is already handled by `middleware.ts`; `loading.tsx` introduces no new entry point.)
</threat_model>

<verification>
## Phase-level checks

Run after all three files exist:

1. **Files present:** `ls app/cards/loading.tsx app/study/loading.tsx app/habits/loading.tsx` — all three exist.
2. **Token discipline (SKEL-04):** `grep -rnE 'bg-(gray|slate|neutral|zinc|stone)-' app/cards/loading.tsx app/study/loading.tsx app/habits/loading.tsx` returns NOTHING. Every skeleton uses `bg-surface-2`.
3. **animate-pulse present:** `grep -l 'animate-pulse' app/cards/loading.tsx app/study/loading.tsx app/habits/loading.tsx` lists all three.
4. **No client directive:** none of the three files contain `'use client'` (they are static server components).
5. **Lint clean:** `npm run lint` passes with zero errors.
6. **Build:** `npm run build` succeeds (confirms the route segments compile and Next.js accepts the loading fallbacks).
7. **(Manual, optional)** In a production build (`next build && next start`), navigate between Home → Cards → Study → Habits via the bottom nav: each transition shows the skeleton instantly with no blank flash, and the skeleton height roughly matches the content that replaces it (no visible jump).
</verification>

<success_criteria>
- [ ] `app/cards/loading.tsx`, `app/study/loading.tsx`, `app/habits/loading.tsx` all exist (SKEL-01, SKEL-02, SKEL-03).
- [ ] Every skeleton block uses `bg-surface-2 animate-pulse` — no hardcoded gray utilities anywhere (SKEL-04).
- [ ] Each skeleton's shape/height approximates the real page so navigation produces no visible layout shift.
- [ ] None of the three files use `'use client'`.
- [ ] `npm run lint` passes clean; `npm run build` succeeds.
- [ ] Zero existing files modified (pure additive).
</success_criteria>

<output>
Create `.planning/phases/09-skeleton-loading-screens/09-01-SUMMARY.md` when done.
</output>
