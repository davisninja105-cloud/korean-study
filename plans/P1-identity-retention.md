# P1 — Identity & Retention

> **Tier goal:** Give the app a coherent visual identity that feels built *for* Korean,
> and deepen retention so the daily habit feels rewarding, predictable, and hard to break
> by accident.

---

## North star (P1 slice)

A 30-day learner opens the app on a new device in dark mode at 11 pm: a warm three-tier
dark surface; the due-count hero is immediately obvious; Settings is out of the way;
vocabulary badges are indigo (not the same blue as the button just tapped); the home
habit ring is still 40% open — a gentle, honest nudge. It feels like a native iOS app.

---

## Dependencies

**P1 requires P0 complete and green** (`npm run lint && npm run build`). Specifically:

| P0 deliverable | Used by |
|---|---|
| Token layer (`--surface-1/2/3`, `--reward`, `--cat-*`, `--highlight-*`) | P1.1, all surface swaps |
| `lib/haptics.ts` | P1.4 active-tab haptic |
| `components/ProgressRing.tsx` | P1.3 home habit ring |
| Motion keyframes + reduced-motion wrapper | P1.5 sheets, list entrances |
| `canvas-confetti` | P1.3 (reuse) |

---

## Key constraints (P1-relevant)

- **`data-theme` toggle is the riskiest refactor.** Dark mode is OS-only today. A manual
  toggle needs: a `data-theme` attribute on `<html>`, an inline pre-paint `<script>` in
  `app/layout.tsx` (no flash), and `@media (prefers-color-scheme: dark)` rules mirrored as
  `[data-theme="dark"]` selectors (Tailwind v4 custom `dark` variant). Plan carefully.
- **Badge color map is duplicated** (`app/cards/page.tsx` L30–36, `components/StudySession.tsx`
  L338–344) → merge into `lib/card-style.ts`.
- **Literal `blue-500`** in `StatsBar.tsx`, `HabitHeatmap.tsx`, `HabitTracker.tsx`,
  `app/habits/page.tsx`, `app/study/page.tsx` are NOT the `--button` token → replace with
  semantic tokens (`--reward` for streaks, `--cat-vocab` for data).
- **Purity rule:** the time-aware greeting reads `new Date()` in a `useEffect`, never in render.
- **Pull-to-refresh** needs no library — a custom pointer/touch hook suffices for the PWA.

---

## Tasks

### P1.1 — Color system & dark mode *(audit §2)*

- [ ] **`lib/card-style.ts`** — single source of truth `TYPE_BADGE_CLASS` map using `--cat-*`
  tokens (vocab→indigo, grammar→violet, phrase→teal; keep example-sentence/fill-blank/
  transformation). Remove the inline maps from `app/cards/page.tsx` + `components/StudySession.tsx`
  and import from here.
  - **Why:** "The accent collides with the taxonomy" — vocabulary is currently the same blue as the CTA (audit §2).

- [ ] **Replace literal `blue-500`** with semantic tokens: goal-met heatmap cells +
  streak visuals → `--reward`; data/accuracy stats → `--cat-vocab`; action-adjacent numbers
  keep `--button`. Files: `StatsBar.tsx`, `HabitHeatmap.tsx`, `HabitTracker.tsx`,
  `app/habits/page.tsx`, `app/study/page.tsx`.
  - **Acceptance:** no literal `blue-500` remains in stat/habit displays.

- [ ] **Dark mode 3-tier surfaces** — replace ad-hoc `bg-white dark:bg-gray-800` → `bg-surface-1`,
  `bg-gray-50 dark:bg-gray-900` → `bg-surface-2`, overlays → `bg-surface-3`, across
  `StudySession.tsx`, `HabitTracker.tsx`, `HabitHeatmap.tsx`, `CardEditor.tsx`, `SyncPanel.tsx`,
  `Nav.tsx`, `app/{page,cards/page,habits/page,settings/page,study/page}.tsx`.
  - **Why:** "Dark mode reads as an inversion, not a designed experience" (audit §2).

- [ ] **Manual theme toggle** (System/Light/Dark) — inline pre-paint script in `app/layout.tsx`;
  `[data-theme="dark"]` selectors + Tailwind v4 custom `dark` variant in `app/globals.css`;
  segmented control in `app/settings/page.tsx` writing `localStorage`.

### P1.2 — Sentence highlight enrichment *(audit §3, visual parts)*

- [ ] **Apply `--highlight-bg/fg`** in `components/HighlightedSentence.tsx` (retire
  `bg-yellow-200`); refine `<mark>` to `rounded-md px-1 py-0.5` marker feel.
  - **Why:** "yellow-200 reads like a browser default highlighter; the signature element deserves a bespoke token" (audit §2).

- [ ] **Grammar structure cues** — `lib/sentence-match.ts:splitParticle(korean, targetForm)`;
  `HighlightedSentence` accepts `cardType` and tints stem (`--highlight-bg`) vs particle
  (`--cat-grammar/20`) for grammar cards; pass `cardType` from `StudySession.tsx`.
  - **Why:** "Highlight the particle vs. the stem in different tints" (audit §3).

- [ ] **Reading-aid toggle** — `readingAid` setting (default off) through `lib/settings.ts` /
  `app/api/settings/route.ts` / `app/settings/page.tsx`; `.hangul-spaced` class injected on
  `<html>` adds subtle `word-spacing`/`letter-spacing` (no romanization).

### P1.3 — Home dashboard hierarchy *(audit §6)*

- [ ] **Hero: due count + Study CTA** — rework `app/page.tsx`: full-width hero card with a
  time-aware greeting (effect-only), large due count (`--reward`, or `--button` when 0), and a
  primary "Study now →" button (`min-h-14`). Remove `StatsBar` from the top slot.
  - **Why:** "'Due today' is the only number that drives action" (audit §6).

- [ ] **Secondary stats strip** — rework `components/StatsBar.tsx` to a quiet 3-col strip
  below the hero (`text-sm`, `--surface-2`, no shadow): 7-day avg / total cards / lessons.

- [ ] **Surface habit ring + proficiency arc on Home** — larger `ProgressRing` (`size=88`) in
  `HabitTracker.tsx`; `ProficiencyArc` (from P0.4) below it.

- [ ] **Move SyncPanel → Settings** — remove from `app/page.tsx`; add to a collapsible
  "Advanced" section in `app/settings/page.tsx`.
  - **Why:** "The Sync panel is back-office plumbing on the home screen" (audit §6).

- [ ] **7-day review forecast** *(addition)* — `app/api/forecast/route.ts` (next-7-day due
  counts) + `components/ReviewForecast.tsx` (pure CSS mini bar chart) on `app/habits/page.tsx`.
  - **Why:** Anticipating load helps the learner plan and feel in control — a retention driver.

### P1.4 — Navigation & IA *(audit §8)*

- [ ] **Remove Settings tab → top-right gear** — `components/Nav.tsx`: drop the Settings tab
  (now 4: Home/Study/Cards/Habits); add a gear `<Link href="/settings">` to the empty top-bar
  right slot (L23–26), visible on all pages.
  - **Why:** "Five tabs is one too many; settings belongs behind a top-right icon" (audit §8).

- [ ] **Active-tab haptic** — `onClick={() => haptic('selection')}` on each mobile tab in `Nav.tsx`.

### P1.5 — iOS-native craft & motion *(audit §9)*

- [ ] **`components/Sheet.tsx`** — portal bottom sheet (spring slide-up, backdrop blur, drag
  handle, Escape/backdrop close, focus trap, `role="dialog"`; reduced-motion → crossfade).
  - **Why:** Shared primitive for transient tasks (audit §9); P2.3 reuses it for CardEditor.

- [ ] **ModeSelector → Sheet** in `app/study/page.tsx` (`select-mode` phase).

- [ ] **LessonRangeFilter → Sheet** on the Study page (triggered by a Filter button).

- [ ] **System blur on sticky bars** — upgrade `StudySession.tsx` action bar (L701) and
  `Nav.tsx` bars to `bg-surface-1/95 backdrop-blur-md saturate-150`.

- [ ] **List entrance animations** — `@keyframes slideIn` (ease-out) + staggered
  `animation-delay` on card rows in `app/cards/page.tsx`; reduced-motion → none.

- [ ] **Pull-to-refresh → sync** — `lib/usePullToRefresh.ts` (touch-drag hook) mounted in
  `app/page.tsx`, calling the same `POST /api/sync` as the Sync button.
  - **Why:** "Removes the need for a Sync card entirely" (audit §9).

- [ ] **"Builds on" prerequisite chips** *(addition)* — in `StudySession.tsx`, on reveal, parse
  the card's `components` JSON and render quiet `.hangul` chips ("Builds on: …").
  - **Why:** Connects the foundation-first sequencing to a visible rationale.

### P1.6 — Accessibility *(audit §10)*

- [ ] **Contrast pass** at the token level — verify AA for highlight pair, `--cat-*` on
  surfaces, grade-button text, `gray-400` hints; fix failing values in `app/globals.css`.

- [ ] **44 pt tap targets** — add `min-h-11 min-w-11` to filter pills (`app/cards/page.tsx`),
  the "All" reset (`LessonRangeFilter.tsx`), the "✕" remove-sentence button (`CardEditor.tsx`),
  and Edit/Delete row actions (`app/cards/page.tsx`).

- [ ] **VoiceOver labels** — required `aria-label` on `ProgressRing`; verify heatmap/streak dot
  labels include duration; grade buttons get `aria-label` with the interval; `aria-current="page"` on the active nav tab.

- [ ] **`prefers-reduced-motion` audit** — confirm every keyframe is wrapped and every
  `canvas-confetti` call is gated by a reduced-motion check.

---

## Verification

1. `npm run lint && npm run build` — clean.
2. `npm run dev` → iPhone viewport:
   - [ ] Vocab=indigo, grammar=violet, phrase=teal; blue reserved for actions.
   - [ ] `surface-1/2/3` correct in light + dark; dark feels designed.
   - [ ] Theme toggle switches without flash.
   - [ ] Home hero greeting (effect-only); due count prominent; quiet stats strip; SyncPanel gone from Home (in Settings).
   - [ ] 4 tabs + top-right gear; tab tap fires haptic (Android).
   - [ ] ModeSelector + LessonRangeFilter open as sheets (tap-outside + Escape close).
   - [ ] Stronger backdrop blur on sticky bars; card rows animate in (reduced-motion → none).
   - [ ] Pull-to-refresh syncs; filter pills ≥44 px; grade buttons have aria-labels.
   - [ ] Amber highlight token (not yellow-200); 7-day forecast renders.

---

## Progress log

*(Fill in as tasks land. Format: `[x] TASK — commit abc1234, YYYY-MM-DD`)*

- [x] **P1.1** Color system & dark mode — `lib/card-style.ts` (shared `typeBadgeClass`, indigo/violet/teal
  off the primary), literal `blue-*` → semantic tokens in stat/habit displays, three-tier `bg-surface-*`
  swaps, manual System/Light/Dark toggle (`lib/theme.ts`, pre-paint script in `layout.tsx`,
  `[data-theme]` selectors + `@custom-variant dark` in `globals.css`, `ThemeWatcher`). — working tree, 2026-06-21
- [x] **P1.2** Highlight enrichment — bespoke `<mark>` (`rounded-md px-1 py-0.5`), `splitParticle()` +
  grammar stem/particle tinting via `cardType`, `readingAid` setting → `.hangul-spaced`. — working tree, 2026-06-21
- [x] **P1.3** Home hierarchy — hero (effect-only greeting, due count, CTA), quiet `StatsBar` strip
  (cards/lessons/level), habit ring `size=88`, SyncPanel moved to Settings ▸ Advanced. — working tree, 2026-06-21
- [x] **P1.4** Navigation — 4 tabs + top-right gear, tab haptic, `aria-current`. — working tree, 2026-06-21
- [x] **P1.5** iOS craft & motion — `components/Sheet.tsx`, ModeSelector + LessonRangeFilter as sheets,
  stronger sticky-bar blur, list slide-in, `lib/usePullToRefresh.ts` on Home → sync. — working tree, 2026-06-21
- [x] **P1.6** Accessibility — contrast (gray-400→gray-500 hints, green grade button → 600), 44pt targets,
  grade-button `aria-label`s, reduced-motion gating incl. `ProgressRing` (`.ring-fill`). — working tree, 2026-06-21

**Scope note:** Per request, the two additions *7-day review forecast* and *"Builds on" chips* were **not**
implemented; *pull-to-refresh* was. Verified: `npm run lint` + `npm run build` clean; no literal `blue-*`
remains in stat/habit displays; dev server boots and serves the pre-paint theme script. Not yet committed.
