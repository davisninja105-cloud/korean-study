# Phase 30: Instant Feedback & Cold-Start Unblocking - Context

**Gathered:** 2026-08-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make waiting visible everywhere on the cold path, and strip the two avoidable costs from it:

1. **Visible feedback within ~100ms** — dark-mode skeletons that are actually visible against the background (`/study`, `/cards`, `/habits`, `/history`), no white flash on PWA cold launch, and a content-shaped skeleton (not a bare spinner) when applying a lesson-range filter on `/study`.
2. **A synchronous `RootLayout`** — no `await` DB read blocks the first HTML byte, while a saved settings change (button/reward color, reading text scale, reading aid) still applies correctly on the next navigation with no color flash.
3. **Vercel function region pinned to Turso's primary region** — removing a possible cross-region round trip on every request.

This is the cheapest phase in the v1.8 milestone and the largest single improvement in *felt* speed. It also establishes the re-measurement baseline (tightened `/habits` perf budget) that every later v1.8 phase is judged against.

**Not in scope:** the real backend bottlenecks — `/cards`'s unpaginated query (Phase 31), `/study`'s 4–5 sequential round trips (Phase 32), the freshness-backstop double-fetch (Phase 33), IndexedDB caching (Phase 34), the service worker (Phase 35).

</domain>

<decisions>
## Implementation Decisions

### Skeleton color strategy
- **D-01: New dedicated `--skeleton-bg` token, not raising `--surface-3`.** In dark mode `--surface-3` (`#0b0f1a`) currently equals `--background` (`#0b0f1a`), making every skeleton invisible. But `bg-surface-3` is also used in 17+ non-skeleton places found by grep across the codebase — `Nav.tsx` tab hover, `Toast.tsx`/`GlossProvider.tsx` close-button hover/active, `ProficiencyArc.tsx`'s progress-bar track, `HabitTracker.tsx`'s empty-day week-strip cells, `CardEditor.tsx`'s cancel-button hover, `Sheet.tsx`, `HabitHeatmap.tsx`, `AudioButton.tsx`, `ModeSelector.tsx`, and more. Raising `--surface-3` itself would silently change the look of all of these and require a design-audit pass inside this phase to confirm each "still looks intentional" (the literal wording of Success Criterion 1). A new, isolated `--skeleton-bg` token used only by skeleton consumers avoids that blast radius entirely — every other `bg-surface-3` consumer is untouched by definition.
- **D-02: Dark value = the current `--surface-1` value (`#1c2030`).** Reuses an existing palette shade already proven to read clearly against `#0b0f1a` rather than inventing a new literal color.
- **D-03: Light value = the current `--surface-3` value (`#f3f4f6`), and light-mode skeletons switch to the new token too.** Light mode isn't broken today (`--surface-3` `#f3f4f6` is already distinct from `--background` `#f9fafb`), but unifying onto one semantic token in both themes keeps `loading.tsx` files simple (always `bg-skeleton`, no per-theme branching) and avoids the same blast-radius problem ever recurring for light mode. Must be added to BOTH the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block in `globals.css`, per the project's established dark-token-mirroring rule (also called out as a Phase 30 blocker in STATE.md).
- **Consumers to migrate from `bg-surface-3` to `bg-skeleton`:** `app/study/loading.tsx`, `app/cards/loading.tsx`, `app/habits/loading.tsx`, `app/history/loading.tsx`, and the two inline skeleton blocks already living in `components/StudyClient.tsx` (lines ~238–240 and ~349–352, used for the `phase === 'loading'`-style client-side pulse states, not just the route-level `loading.tsx` files). All other `bg-surface-3` usages are explicitly left unchanged.

### Lesson-filter skeleton fidelity
- **D-04: Pixel-exact match, not a generic shimmer block.** `components/StudyClient.tsx`'s `isFilterLoading` branch (~line 269) currently renders a bare centered `Loader2` spinner (`h-16 flex items-center justify-center`), replacing the due-count/button content area entirely. Replace it with a placeholder that occupies the exact same layout as the real content it's about to become:
  1. The same `h-16` slot, containing two pulsing `bg-skeleton` bars positioned where the due-count number (`text-5xl font-bold`) and the "card(s) ready" label render.
  2. A `min-h-14 rounded-2xl bg-skeleton` pulse matching the real "Start studying →" button's exact shape and height, directly below.
  Both pieces use the new `bg-skeleton` token from D-01–D-03. This directly satisfies Success Criterion 3 ("nothing shifts position when the real data lands") with no ambiguity, and previews what's coming rather than showing generic loading noise.

### Tightened perf-budget aggressiveness
- **D-05: `/habits` page-load budget tightens from 3000ms to 1500ms.** `e2e/perf.spec.ts` currently uses a single shared `PAGE_BUDGET_MS = 3000` constant, deliberately generous (comment: "guard rail, not a target," D-08 in that file). `/habits`' 1.8s on-device baseline should drop well under 1s once `RootLayout` stops blocking on Turso and the region is pinned — 1500ms leaves comfortable slack above that for CI hardware variance (non-flaky) while still being tight enough to catch a real regression.
- **D-06: `/`, `/study`, `/cards` stay at 3000ms in this phase.** Their real bottlenecks (unpaginated cards query, 4–5 sequential study round trips) aren't touched until Phases 31/32 — tightening their budgets now would risk flaky failures ahead of the actual fix. Success Criterion 5 only names `/habits` ("the cleanest pure-round-trip signal").
- **Implementation note for the planner:** `PAGE_BUDGET_MS` is currently one shared constant used in a loop over all four routes (`e2e/perf.spec.ts:26,55`). Achieving D-05/D-06 together requires a per-route budget (e.g., a small `{ route: budgetMs }` map) rather than changing the single constant.

### Vercel region pin approach
- **D-07: Claude looks up the Turso primary region itself** (confirmed available: `turso` CLI at `/opt/homebrew/bin/turso`; run `turso db show korean-study` or inspect `DATABASE_URL`'s host) rather than asking the user to supply it.
- **D-08: Pin via `vercel.json`'s `regions` field**, not a Vercel-dashboard-only setting. Version-controlled and reviewable in the commit/PR, consistent with how `vercel.json` already manages the cron schedule (`crons` array) — no manual dashboard step to remember on a future redeploy or account change. `vercel.json` currently has no `regions` field.

### Claude's Discretion
- The exact `RootLayout` mechanism for removing the blocking `await getLayoutSettings()` DB read while still applying settings changes correctly on the next navigation with no color flash (LAYOUT-01, Success Criterion 4) was **not discussed as a user-facing gray area** — this is an architectural/technical decision (candidates include a settings cookie set on save so the layout reads synchronously, vs. a cached/tagged read, vs. other approaches) better suited to research and planning than user preference. The user has no web-app development background; this is Claude's call, informed by research into what's compatible with `react-hooks/purity` and the "next navigation, no DB wait" constraint. Flagging for the researcher: `lib/settings.ts:getLayoutSettings()` is the current blocking call (returns `buttonColor`, `rewardColor`, `readingTextScale`, `readingAid`), and it's invoked from `app/layout.tsx`'s `async function RootLayout`.
- Exact pixel sizing/positioning of the two pulsing bars inside the due-count skeleton slot (D-04) — the shape is locked (two bars, one where the number goes, one where the label goes, within the existing `h-16` slot) but exact widths/heights are an implementation detail.
- Whether the region lookup happens via `turso db show` output parsing or a direct read of `DATABASE_URL`'s host — either is fine; the planner/executor picks whichever is more reliable to script.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` — PERCEPT-01, PERCEPT-02, PERCEPT-03, LAYOUT-01, REGION-01 (full requirement text + traceability table rows)
- `.planning/ROADMAP.md` §Phase 30 — Goal, 5 Success Criteria, `UI hint: yes`, and the v1.8 milestone-wide constraints block (dark-token-mirroring rule, `react-hooks/purity`, no schema changes through Phase 35, iOS/WebKit no Background Sync, don't delete `FreshnessWatcher`)
- `.planning/ROADMAP.md` §Progress — on-device baseline table (Cold launch → `/`: 2.5s→<1.0s; Tab → `/study`: 2.9s→<0.8s; Lesson filter Apply: 4.7s→<1.0s; Tab → `/cards`: 6.4s→<1.0s; Tab → `/habits`: 1.8s→<0.8s); re-measure this table after Phase 30 before starting Phase 31

### State / accumulated decisions
- `.planning/STATE.md` §Accumulated Context → Decisions — v1.8 roadmap shaping rationale (why P3.0+P3.1+P3.5 were consolidated into Phase 30)
- `.planning/STATE.md` §Blockers/Concerns — explicitly flags the dark `--surface-3` blast-radius concern this discussion resolved via D-01–D-03

### Project conventions
- `CLAUDE.md` §Gotchas/conventions — `react-hooks/purity` (no `Date.now()`/`Math.random()`/no-arg `new Date()` in render), dark-mode token-mirroring rule
- `.claude/CLAUDE.md` §CSS and Styling → Dark Mode — "When adding a dark value: mirror it in BOTH the `@media` block and the `:root[data-theme="dark"]` block"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/globals.css` — semantic token layer (`--surface-1/2/3`, `@theme inline` Tailwind exposure). New `--skeleton-bg` token slots in here alongside the existing surface tokens, exposed as `bg-skeleton` via `@theme inline` the same way `bg-surface-3` is today. Appears in 3 places currently for each existing token (`:root` light default, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`) — the new token needs all 3 (light value in the first, dark value in the other two).
- `e2e/perf.spec.ts` — existing median-of-5 page-load-budget test (`for (const route of ['/', '/study', '/cards', '/habits'])`, `PAGE_BUDGET_MS = 3000`); becomes the tightened-budget verification point for D-05/D-06.
- `vercel.json` — already holds one top-level config array (`crons`); the `regions` field (D-08) is a sibling addition, same file.

### Established Patterns
- Dark-mode token mirroring: every existing token (`--surface-1/2/3`, `--background`, etc.) is defined identically in the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block (manual System/Light/Dark toggle overrides the media query). `--skeleton-bg` must follow this exactly.
- `app/*/loading.tsx` files are static server components (no `'use client'`, no hooks) — Next.js shows these automatically during client-side route transitions. They currently use `bg-surface-3 animate-pulse` exclusively per `CLAUDE.md`; this phase changes that exclusive token to `bg-skeleton`.
- `RootLayout` in `app/layout.tsx` is currently `async`, calls `await getLayoutSettings()` from `lib/settings.ts`, and injects `--button`/`--button-foreground`/`--reward`/`--reward-foreground`/`--reading-scale` as inline `style` on `<html>`, plus a `readingAid` boolean toggling the `hangul-spaced` class. It also contains two pre-paint `<script>` tags (theme resolution, `--sab` freeze) that already prove the "resolve something before first paint without waiting on the server" pattern exists in this codebase — informative precedent for whatever LAYOUT-01 mechanism research/planning lands on.

### Integration Points
- `app/manifest.ts` — `background_color: '#f9fafb'` (light) / `theme_color: '#3b82f6'` (button blue) currently mismatch the dark theme actually declared in `app/layout.tsx`'s `viewport.themeColor` dark entry (`#0b0f1a`). PERCEPT-02 is prescriptive in ROADMAP.md wording ("match the dark theme already declared in `app/layout.tsx`") — this was treated as a locked requirement, not a discussable gray area.
- `components/Nav.tsx` — uses `hover:bg-surface-3` (2 occurrences); explicitly NOT touched by this phase's token change (D-01) since it stays on `--surface-3`.
- `components/StudyClient.tsx` — the `isFilterLoading` state (line 41) and its render branch (~line 269) are the exact target of D-04; the real content it must visually match sits directly below in the same file (~line 299 onward: `h-16` due-count block + "Start studying →" button).

</code_context>

<specifics>
## Specific Ideas

No additional specific references beyond the decisions above — discussion covered the 4 gray areas the user selected (skeleton color strategy, lesson-filter skeleton fidelity, perf-budget aggressiveness, region-pin approach); the fifth locked area (manifest colors) required no discussion since ROADMAP.md's success-criterion wording already prescribes the exact behavior.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep suggestions arose.

</deferred>

---

*Phase: 30-instant-feedback-cold-start-unblocking*
*Context gathered: 2026-08-05*
